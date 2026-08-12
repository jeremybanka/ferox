import { describe, expect, test } from "vitest"

import { GRAPPLE_PICKUP_RESPAWN_MS } from "../src/game-constants.ts"
import { GrappleUtility } from "./GrappleUtility.ts"

const hit = {
	distance: 12,
	normal: [0, 0, 1] as const,
	point: [0, 10, -8] as const,
	surfaceId: "wall-channel-0",
}

describe("server grapple utility", () => {
	test("server owns collection contention and rejects range/duplicate attempts", () => {
		const utility = new GrappleUtility([0, 1, 0])
		utility.connect("alpha")
		utility.connect("beta")
		expect(utility.collect("alpha", [4, 1, 0])).toBe(false)
		expect(utility.collect("alpha", [0, 1, 0])).toBe(true)
		expect(utility.collect("beta", [0, 1, 0])).toBe(false)
		expect(utility.pickup()).toMatchObject({
			available: false,
			ownerId: "alpha",
		})
	})

	test("only the owner attaches and detach retains momentum entitlement", () => {
		const utility = new GrappleUtility([0, 1, 0])
		utility.connect("alpha")
		utility.connect("beta")
		utility.collect("alpha", [0, 1, 0])
		expect(utility.attach("beta", [0, 1, 0], hit, 1_000)).toBe(false)
		expect(utility.attach("alpha", [0, 1, 0], hit, 1_000)).toBe(true)
		expect(utility.state()).toMatchObject({
			ownerId: "alpha",
			phase: "attached",
			surfaceId: hit.surfaceId,
		})
		expect(utility.attach("alpha", [0, 1, 0], hit, 1_001)).toBe(false)
		expect(utility.detach("alpha")).toBe(true)
		expect(utility.state()).toMatchObject({ ownerId: "alpha", phase: "idle" })
	})

	test("disconnect clears tether once and returns the pickup on schedule", () => {
		const utility = new GrappleUtility([0, 1, 0])
		utility.connect("alpha")
		utility.collect("alpha", [0, 1, 0])
		utility.attach("alpha", [0, 1, 0], hit, 100)
		expect(utility.disconnect("alpha", 1_000)).toBe(true)
		expect(utility.disconnect("alpha", 1_001)).toBe(false)
		expect(utility.state()).toMatchObject({ ownerId: null, phase: "idle" })
		expect(utility.update(1_000 + GRAPPLE_PICKUP_RESPAWN_MS - 1)).toBe(false)
		expect(utility.update(1_000 + GRAPPLE_PICKUP_RESPAWN_MS)).toBe(true)
		expect(utility.pickup().available).toBe(true)
	})

	test("maximum attach duration deterministically cancels a stale tether", () => {
		const utility = new GrappleUtility([0, 1, 0])
		utility.connect("alpha")
		utility.collect("alpha", [0, 1, 0])
		utility.attach("alpha", [0, 1, 0], hit, 1_000)
		expect(utility.update(8_999)).toBe(false)
		expect(utility.update(9_000)).toBe(true)
		expect(utility.state().phase).toBe("idle")
	})
})
