import { describe, expect, test } from "vitest"

import { VampContinuousFireController } from "./VampContinuousFire.ts"

describe("authoritative Vamp continuous-fire ladder", () => {
	test("uses the exact 1000/850/700/550/400/250/100ms ladder and floor", () => {
		const chains = new VampContinuousFireController()
		const initial = chains.start("pilot", 1, 5_000)
		expect(initial).toMatchObject({ dueAt: 6_000, intervalMs: 1_000 })
		const intervals = [1_000, 850, 700, 550, 400, 250, 100, 100, 100]
		let dueAt = 6_000
		for (const [hitIndex, expectedInterval] of intervals.entries()) {
			const active = chains.active("pilot")
			expect(active?.intervalMs).toBe(expectedInterval)
			expect(chains.resolveDue("pilot", 1, dueAt - 1, () => true)).toBeNull()
			const resolution = chains.resolveDue("pilot", 1, dueAt, () => true)
			expect(resolution).toMatchObject({
				outcome: "hit",
				snapshot: { hitCount: hitIndex, intervalMs: expectedInterval },
			})
			dueAt = resolution!.next!.dueAt
		}
	})

	test("a failed due interval ends the chain and a new chain resets to 1000ms", () => {
		const chains = new VampContinuousFireController()
		chains.start("pilot", 1, 0)
		expect(chains.resolveDue("pilot", 1, 1_000, () => true)).toMatchObject({
			next: { intervalMs: 850 },
			outcome: "hit",
		})
		expect(chains.resolveDue("pilot", 1, 1_850, () => false)).toMatchObject({
			next: null,
			outcome: "cancelled",
		})
		expect(chains.active("pilot")).toBeNull()
		expect(chains.start("pilot", 2, 2_000)).toMatchObject({
			dueAt: 3_000,
			intervalMs: 1_000,
		})
	})

	test("duplicate and replayed messages cannot accelerate or double-hit", () => {
		const chains = new VampContinuousFireController()
		expect(chains.start("pilot", 4, 0)).not.toBeNull()
		expect(chains.start("pilot", 5, 1)).toBeNull()
		let attempts = 0
		expect(
			chains.resolveDue("pilot", 4, 1_000, () => {
				attempts += 1
				return true
			}),
		).toMatchObject({ outcome: "hit" })
		expect(chains.resolveDue("pilot", 4, 1_000, () => true)).toBeNull()
		expect(attempts).toBe(1)
		expect(chains.release("pilot", 3)).toBeNull()
		expect(chains.release("pilot", 4)).not.toBeNull()
		expect(chains.start("pilot", 4, 2_000)).toBeNull()
	})

	test("release, cancellation, and disconnect clean active state", () => {
		const chains = new VampContinuousFireController()
		chains.start("released", 1, 0)
		expect(chains.release("released", 1)).not.toBeNull()
		expect(chains.active("released")).toBeNull()
		chains.start("cancelled", 1, 0)
		expect(chains.cancel("cancelled")).not.toBeNull()
		expect(chains.active("cancelled")).toBeNull()
		chains.start("gone", 8, 0)
		expect(chains.disconnect("gone")).not.toBeNull()
		expect(chains.start("gone", 1, 1)).not.toBeNull()
	})
})
