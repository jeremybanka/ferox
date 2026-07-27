import * as THREE from "three"

import type { PilotRig } from "./PilotModel.ts"

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
	rig.rightHand.rotation.x = 0.08 * blend
	rig.rightHand.rotation.y = -0.12 * blend
	rig.leftShoulder.rotation.x = 0.82 * blend
	rig.leftShoulder.rotation.y = 0.58 * blend
	rig.leftArm.rotation.x = 0.14 * blend
	rig.leftElbow.rotation.x = 0.68 * blend
	rig.leftHand.rotation.x = -0.12 * blend
	rig.leftHand.rotation.z = -0.28 * blend
	rig.weapon.rotation.x = (-1.58 + pitch * 0.72) * blend
	rig.weapon.rotation.y = -yaw * 0.34 * blend
}
