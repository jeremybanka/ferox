import type { Vector3Tuple } from "./arena-protocol.ts"
import {
	PILOT_CROUCH_TORSO_CENTER_HEIGHT,
	PILOT_STANDING_TORSO_CENTER_HEIGHT,
} from "./pilot/PilotDimensions.ts"

export const PILOT_STANDING_EYE_HEIGHT = 1.72
export const PILOT_CROUCH_EYE_HEIGHT = 1.08

export function pilotTorsoTargetFromRoot(
	rootPosition: Vector3Tuple,
	crouching: boolean,
): Vector3Tuple {
	return [
		rootPosition[0],
		rootPosition[1] +
			(crouching
				? PILOT_CROUCH_TORSO_CENTER_HEIGHT
				: PILOT_STANDING_TORSO_CENTER_HEIGHT),
		rootPosition[2],
	]
}

export function pilotTorsoTargetFromEye(
	eyePosition: Vector3Tuple,
	crouching: boolean,
): Vector3Tuple {
	const eyeHeight = crouching
		? PILOT_CROUCH_EYE_HEIGHT
		: PILOT_STANDING_EYE_HEIGHT
	return pilotTorsoTargetFromRoot(
		[eyePosition[0], eyePosition[1] - eyeHeight, eyePosition[2]],
		crouching,
	)
}
