import { describe, expect, test } from "vitest"

import { LockHitscanChargeController } from "./LockHitscanCharge.ts"

describe("authoritative lock hitscan charge", () => {
	test("fires a held Ion exactly once at its 2.000 second deadline", () => {
		const charges = new LockHitscanChargeController()
		expect(charges.start("pilot", 1, "ion-beam-rifle", 1_000)).toMatchObject({
			completesAt: 3_000,
			phase: "charging",
		})
		expect(charges.resolveDue("pilot", 1, 2_999, () => true)).toBeNull()
		expect(charges.resolveDue("pilot", 1, 3_000, () => true)).toMatchObject({
			damage: 40,
			snapshot: { phase: "fired" },
		})
		expect(charges.resolveDue("pilot", 1, 9_000, () => true)).toBeNull()
		expect(charges.active("pilot")).toBeNull()
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

	test("never converts a threshold release into the charged shot", () => {
		const charges = new LockHitscanChargeController()
		charges.start("ion", 1, "ion-beam-rifle", 0)
		expect(charges.release("ion", 1, 2_000)).toBeNull()
		expect(charges.active("ion")).toMatchObject({ phase: "charging" })
		expect(charges.resolveDue("ion", 1, 2_000, () => true)).toMatchObject({
			damage: 40,
			snapshot: { phase: "fired" },
		})

		charges.start("heavy", 2, "heavy-laser", 0)
		expect(charges.release("heavy", 2, 5_000)).toBeNull()
		expect(charges.resolveDue("heavy", 2, 5_000, () => true)).toMatchObject({
			damage: 120,
			snapshot: { phase: "fired" },
		})
	})

	test("auto-fires a held Heavy exactly at five seconds", () => {
		const charges = new LockHitscanChargeController()
		charges.start("heavy", 1, "heavy-laser", 10)
		expect(charges.resolveDue("heavy", 1, 5_009, () => true)).toBeNull()
		expect(charges.resolveDue("heavy", 1, 5_010, () => true)).toMatchObject({
			damage: 120,
		})
		expect(charges.resolveDue("heavy", 1, 5_011, () => true)).toBeNull()
	})

	test("cancels invalid sessions and clears their charge state", () => {
		const charges = new LockHitscanChargeController()
		charges.start("lost", 1, "ion-beam-rifle", 10)
		expect(charges.resolveDue("lost", 1, 20, () => false)).toMatchObject({
			damage: null,
			snapshot: { phase: "cancelled" },
		})
		expect(charges.active("lost")).toBeNull()
	})

	test("rejects duplicate starts and mismatched releases", () => {
		const charges = new LockHitscanChargeController()
		expect(charges.start("pilot", 4, "heavy-laser", 0)).not.toBeNull()
		expect(charges.start("pilot", 5, "heavy-laser", 1)).toBeNull()
		expect(charges.release("pilot", 3, 2)).toBeNull()
		charges.cancel("pilot")
		expect(charges.start("pilot", 4, "heavy-laser", 3)).toBeNull()
		expect(charges.resolveDue("pilot", 4, 10_000, () => true)).toBeNull()
	})

	test("ignores a stale deadline after cancellation and a newer charge", () => {
		const charges = new LockHitscanChargeController()
		charges.start("pilot", 1, "ion-beam-rifle", 0)
		expect(charges.cancel("pilot")).toMatchObject({ phase: "cancelled" })
		charges.start("pilot", 2, "ion-beam-rifle", 100)
		expect(charges.resolveDue("pilot", 1, 2_000, () => true)).toBeNull()
		expect(charges.active("pilot")).toMatchObject({ chargeId: 2 })
		expect(charges.resolveDue("pilot", 2, 2_100, () => true)).toMatchObject({
			damage: 40,
			snapshot: { phase: "fired" },
		})
	})

	test("bulk advancement retains exact boundary and cleanup semantics", () => {
		const charges = new LockHitscanChargeController()
		charges.start("ion", 1, "ion-beam-rifle", 0)
		charges.start("heavy", 1, "heavy-laser", 0)
		expect(charges.advance(1_999, () => true)).toEqual([])
		expect(charges.advance(2_000, () => true)).toMatchObject([
			{ damage: 40, snapshot: { ownerId: "ion", phase: "fired" } },
		])
		expect(charges.active("ion")).toBeNull()
		expect(charges.active("heavy")).not.toBeNull()
	})
})
