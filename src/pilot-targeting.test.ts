import { describe, expect, test } from "vitest"

import {
	pilotTorsoTargetFromEye,
	pilotTorsoTargetFromRoot,
	PILOT_CROUCH_EYE_HEIGHT,
	PILOT_STANDING_EYE_HEIGHT,
} from "./pilot-targeting.ts"
import {
	PILOT_CROUCH_BODY_HIT_BOUNDS,
	PILOT_CROUCH_HEAD_CENTER_HEIGHT,
	PILOT_CROUCH_TORSO_BOUNDS,
	PILOT_CROUCH_TORSO_CENTER_HEIGHT,
	PILOT_HEAD_HIT_RADIUS,
	PILOT_STANDING_BODY_HIT_BOUNDS,
	PILOT_STANDING_HEAD_CENTER_HEIGHT,
	PILOT_STANDING_TORSO_BOUNDS,
	PILOT_STANDING_TORSO_CENTER_HEIGHT,
} from "./pilot/PilotDimensions.ts"

describe("pilot torso target", () => {
	test.each([
		{
			body: PILOT_STANDING_BODY_HIT_BOUNDS,
			crouching: false,
			headCenter: PILOT_STANDING_HEAD_CENTER_HEIGHT,
			torso: PILOT_STANDING_TORSO_BOUNDS,
			torsoCenter: PILOT_STANDING_TORSO_CENTER_HEIGHT,
		},
		{
			body: PILOT_CROUCH_BODY_HIT_BOUNDS,
			crouching: true,
			headCenter: PILOT_CROUCH_HEAD_CENTER_HEIGHT,
			torso: PILOT_CROUCH_TORSO_BOUNDS,
			torsoCenter: PILOT_CROUCH_TORSO_CENTER_HEIGHT,
		},
	])(
		"targets the rendered $crouching pilot torso inside body and below head hit bounds",
		({ body, crouching, headCenter, torso, torsoCenter }) => {
			const rootY = 7
			const target = pilotTorsoTargetFromRoot([3, rootY, -2], crouching)
			const targetHeight = target[1] - rootY

			expect(target).toEqual([3, rootY + torsoCenter, -2])
			expect(targetHeight).toBeGreaterThanOrEqual(torso.bottom)
			expect(targetHeight).toBeLessThanOrEqual(torso.top)
			expect(targetHeight).toBeGreaterThanOrEqual(body.bottom)
			expect(targetHeight).toBeLessThanOrEqual(body.top)
			expect(targetHeight).toBeLessThan(headCenter - PILOT_HEAD_HIT_RADIUS)
		},
	)

	test("preserves the crouch lowering from rendered pose geometry", () => {
		expect(PILOT_CROUCH_TORSO_CENTER_HEIGHT).toBeLessThan(
			PILOT_STANDING_TORSO_CENTER_HEIGHT,
		)
	})

	test("derives the identical target from replicated eye and root positions", () => {
		const root: [number, number, number] = [4, 6, -8]
		for (const crouching of [false, true]) {
			const eyeHeight = crouching
				? PILOT_CROUCH_EYE_HEIGHT
				: PILOT_STANDING_EYE_HEIGHT
			const eye: [number, number, number] = [
				root[0],
				root[1] + eyeHeight,
				root[2],
			]
			expect(pilotTorsoTargetFromEye(eye, crouching)).toEqual(
				pilotTorsoTargetFromRoot(root, crouching),
			)
		}
	})
})
