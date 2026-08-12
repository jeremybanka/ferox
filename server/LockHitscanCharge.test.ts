import { describe, expect, test } from "vitest"

import { LockHitscanChargeController } from "./LockHitscanCharge.ts"

describe("authoritative lock hitscan charge", () => {
	test("fires Ion exactly once at its server deadline", () => {
		const charges = new LockHitscanChargeController()
		expect(charges.start("pilot", 1, "ion-beam-rifle", 1_000)).toMatchObject({
			completesAt: 3_000,
			phase: "charging",
		})
		expect(charges.advance(2_999, () => true)).toEqual([])
		expect(charges.advance(3_000, () => true)).toMatchObject([
			{ damage: 40, snapshot: { phase: "fired" } },
		])
		expect(charges.advance(9_000, () => true)).toEqual([])
	})

	test("cancels an early Ion release and fires a Heavy tap on release", () => {
		const charges = new LockHitscanChargeController()
		charges.start("ion", 1, "ion-beam-rifle", 0)
		expect(charges.release("ion", 1, 1_999)).toMatchObject({
			damage: null,
			snapshot: { phase: "cancelled" },
		})
		charges.start("heavy", 2, "heavy-laser", 0)
		expect(charges.release("heavy", 2, 4_999)).toMatchObject({
			damage: 2,
			snapshot: { phase: "fired" },
		})
	})

	test("auto-fires Heavy at five seconds and cancels invalid sessions", () => {
		const charges = new LockHitscanChargeController()
		charges.start("heavy", 1, "heavy-laser", 10)
		expect(charges.advance(5_010, () => true)[0]).toMatchObject({
			damage: 120,
		})
		charges.start("lost", 1, "ion-beam-rifle", 10)
		expect(charges.advance(20, () => false)).toMatchObject([
			{ damage: null, snapshot: { phase: "cancelled" } },
		])
	})

	test("rejects duplicate starts and mismatched releases", () => {
		const charges = new LockHitscanChargeController()
		expect(charges.start("pilot", 4, "heavy-laser", 0)).not.toBeNull()
		expect(charges.start("pilot", 5, "heavy-laser", 1)).toBeNull()
		expect(charges.release("pilot", 3, 2)).toBeNull()
		charges.cancel("pilot")
		expect(charges.start("pilot", 4, "heavy-laser", 3)).toBeNull()
	})
})
