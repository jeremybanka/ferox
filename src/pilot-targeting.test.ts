import { describe, expect, test } from "vitest"

import {
	pilotChestAnchor,
	pilotChestAnchorFromEye,
	PILOT_CROUCH_CHEST_HEIGHT,
	PILOT_CROUCH_EYE_HEIGHT,
	PILOT_STANDING_CHEST_HEIGHT,
	PILOT_STANDING_EYE_HEIGHT,
} from "./pilot-targeting.ts"

describe("pilot chest anchor", () => {
	test("uses explicit standing and crouching chest heights above the root", () => {
		expect(pilotChestAnchor([3, 7, -2], false)).toEqual([
			3,
			7 + PILOT_STANDING_CHEST_HEIGHT,
			-2,
		])
		expect(pilotChestAnchor([3, 7, -2], true)).toEqual([
			3,
			7 + PILOT_CROUCH_CHEST_HEIGHT,
			-2,
		])
		expect(PILOT_CROUCH_CHEST_HEIGHT).toBeLessThan(PILOT_STANDING_CHEST_HEIGHT)
	})

	test("derives the same chest from replicated eye and root positions", () => {
		const ground: [number, number, number] = [4, 6, -8]
		for (const crouching of [false, true]) {
			const eyeHeight = crouching
				? PILOT_CROUCH_EYE_HEIGHT
				: PILOT_STANDING_EYE_HEIGHT
			const eye: [number, number, number] = [
				ground[0],
				ground[1] + eyeHeight,
				ground[2],
			]
			expect(pilotChestAnchorFromEye(eye, crouching)).toEqual(
				pilotChestAnchor(ground, crouching),
			)
		}
	})
})
