import { describe, expect, test } from "vitest"

import { GRAPPLE_MIN_REEL_RATE } from "../src/game-constants.ts"
import { GrappleUtility } from "./GrappleUtility.ts"

const hit = {
	distance: 12,
	normal: [0, 0, 1] as const,
	point: [0, 10, -8] as const,
	surfaceId: "wall-channel-0",
}

describe("server grapple utility", () => {
	test("every connected pilot has independent standard equipment", () => {
		const utility = new GrappleUtility()
		expect(utility.connect("alpha")).toMatchObject({
			ownerId: "alpha",
			phase: "idle",
		})
		expect(utility.connect("beta")).toMatchObject({
			ownerId: "beta",
			phase: "idle",
		})
		expect(utility.states()).toHaveLength(2)
		expect(utility.attach("alpha", [0, 1, 0], hit, 1_000, 4)).toMatchObject({
			attachmentId: 4,
			ownerId: "alpha",
			phase: "attached",
		})
		expect(utility.attach("beta", [4, 1, 0], hit, 1_001, 9)).toMatchObject({
			attachmentId: 9,
			ownerId: "beta",
			phase: "attached",
		})
		expect(utility.state("alpha")?.anchor).toEqual(hit.point)
		expect(utility.state("beta")?.anchor).toEqual(hit.point)
	})

	test("rejects duplicate attachment and detaches only the requesting pilot", () => {
		const utility = new GrappleUtility()
		utility.connect("alpha")
		utility.connect("beta")
		utility.attach("alpha", [0, 1, 0], hit, 1_000, 1)
		utility.attach("beta", [0, 1, 0], hit, 1_000, 1)
		expect(utility.attach("alpha", [0, 1, 0], hit, 1_001, 2)).toBeNull()
		expect(utility.detach("alpha")?.phase).toBe("idle")
		expect(utility.state("beta")?.phase).toBe("attached")
		expect(utility.detach("alpha")).toBeNull()
	})

	test("reels by elapsed time with accepted aim and sequences each snapshot", () => {
		const utility = new GrappleUtility()
		utility.connect("alpha")
		const attached = utility.attach("alpha", [0, 1, 0], hit, 1_000, 1)!
		const reeled = utility.reel("alpha", [0, 1, 0], [0, 0, 1], 0.1)!
		expect(reeled.sequence).toBe(attached.sequence + 1)
		expect(reeled.ropeLength).toBeCloseTo(
			attached.ropeLength! - GRAPPLE_MIN_REEL_RATE * 0.1,
		)
	})

	test("disconnect removes only its state and duration cancels stale tethers", () => {
		const utility = new GrappleUtility()
		utility.connect("alpha")
		utility.connect("beta")
		utility.attach("alpha", [0, 1, 0], hit, 1_000, 1)
		utility.attach("beta", [0, 1, 0], hit, 1_000, 1)
		expect(utility.disconnect("alpha")).toMatchObject({
			ownerId: "alpha",
			phase: "idle",
		})
		expect(utility.state("alpha")).toBeNull()
		expect(utility.state("beta")?.phase).toBe("attached")
		expect(utility.update(8_999)).toEqual([])
		expect(utility.update(9_000)).toEqual([
			expect.objectContaining({ ownerId: "beta", phase: "idle" }),
		])
	})
})
