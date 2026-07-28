import * as THREE from "three"

import {
	definePilotPose,
	type PilotAnimationLayer,
	type PilotPose,
	WEAPONS_FREE_INFLUENCE,
} from "./PilotAnimation.ts"

export function sampleWeaponsFreePose(pitch: number, yaw: number): PilotPose {
	return definePilotPose({
		body: { rotation: { y: yaw * 0.28 } },
		head: { rotation: { x: pitch * 0.36, y: yaw * 0.3 } },
		neck: { rotation: { x: pitch * 0.24, y: yaw * 0.18 } },
	})
}

export function weaponsFreeLayer(
	pitch: number,
	yaw: number,
	weight = 1,
): PilotAnimationLayer {
	return {
		fadeSeconds: 0.18,
		id: "weapons-free",
		influence: WEAPONS_FREE_INFLUENCE,
		mode: "override",
		pose: sampleWeaponsFreePose(pitch, yaw),
		weight: THREE.MathUtils.clamp(weight, 0, 1),
	}
}
