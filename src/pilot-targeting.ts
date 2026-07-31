import type { Vector3Tuple } from "./arena-protocol.ts"

export const PILOT_STANDING_EYE_HEIGHT = 1.72
export const PILOT_CROUCH_EYE_HEIGHT = 1.08
export const PILOT_STANDING_CHEST_HEIGHT = 1.05
export const PILOT_CROUCH_CHEST_HEIGHT = 0.78

export function pilotChestAnchor(
	groundPosition: Vector3Tuple,
	crouching: boolean,
): Vector3Tuple {
	return [
		groundPosition[0],
		groundPosition[1] +
			(crouching ? PILOT_CROUCH_CHEST_HEIGHT : PILOT_STANDING_CHEST_HEIGHT),
		groundPosition[2],
	]
}

export function pilotChestAnchorFromEye(
	eyePosition: Vector3Tuple,
	crouching: boolean,
): Vector3Tuple {
	const eyeHeight = crouching
		? PILOT_CROUCH_EYE_HEIGHT
		: PILOT_STANDING_EYE_HEIGHT
	return pilotChestAnchor(
		[eyePosition[0], eyePosition[1] - eyeHeight, eyePosition[2]],
		crouching,
	)
}
