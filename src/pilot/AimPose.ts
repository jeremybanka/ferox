import * as THREE from "three"

import { alignBlasterHand } from "./BlasterPose.ts"
import {
	AIM_INFLUENCE,
	definePilotPose,
	type PilotAnimationLayer,
	type PilotPose,
} from "./PilotAnimation.ts"
import type { PilotRig } from "./PilotModel.ts"

export function sampleFreeAimPose(pitch: number, yaw: number): PilotPose {
	return definePilotPose({
		body: { rotation: { y: yaw * 0.28 } },
		head: { rotation: { x: pitch * 0.36, y: yaw * 0.3 } },
		// leftArm: { rotation: { x: 0.14 } },
		// leftElbow: { rotation: { x: 0.68 } },
		// leftHand: { rotation: { x: -0.12, z: -0.28 } },
		// leftShoulder: { rotation: { x: 0.82, y: -0.58 } },
		neck: { rotation: { x: pitch * 0.24, y: yaw * 0.18 } },
		// rightArm: { rotation: { x: 0.16 } },
		// rightElbow: { rotation: { x: -2.65 } },
		// rightHand: {
		// 	rotation: {
		// 		x: 0.08 + pitch * 0.72,
		// 		y: yaw,
		// 	},
		// },
		// rightShoulder: { rotation: { x: 4, y: 1.55, z: 0 } },
	})
}

export function freeAimLayer(
	pitch: number,
	yaw: number,
	weight = 1,
): PilotAnimationLayer {
	return {
		fadeSeconds: 0.1,
		id: "free-aim",
		influence: AIM_INFLUENCE,
		mode: "override",
		pose: sampleFreeAimPose(pitch, yaw),
		weight: THREE.MathUtils.clamp(weight, 0, 1),
	}
}

export function applyFreeAimPose(
	rig: PilotRig,
	pitch: number,
	yaw: number,
	weight: number,
): void {
	const blend = THREE.MathUtils.clamp(weight, 0, 1)
	rig.body.rotation.y += yaw * 0.28 * blend
	rig.neck.rotation.x = pitch * 0.24 * blend
	rig.neck.rotation.y = yaw * 0.18 * blend
	rig.head.rotation.x = pitch * 0.36 * blend
	rig.head.rotation.y = yaw * 0.3 * blend
	rig.rightShoulder.rotation.x = 1.02 * blend
	rig.rightShoulder.rotation.y = -0.22 * blend
	rig.rightArm.rotation.x = 0.16 * blend
	rig.rightElbow.rotation.x = 0.48 * blend
	rig.leftShoulder.rotation.x = 0.82 * blend
	rig.leftShoulder.rotation.y = 0.58 * blend
	rig.leftArm.rotation.x = 0.14 * blend
	rig.leftElbow.rotation.x = 0.68 * blend
	rig.leftHand.rotation.x = -0.12 * blend
	rig.leftHand.rotation.z = -0.28 * blend
	alignBlasterHand(
		rig,
		(0.08 + pitch * 0.72) * blend,
		(-0.12 - yaw * 0.34) * blend,
	)
}
