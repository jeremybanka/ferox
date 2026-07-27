import { alignBlasterHand } from "./BlasterPose.ts"
import type { PilotRig } from "./PilotModel.ts"

export type RunDirection = "backward" | "forward" | "left" | "right"

export function applyRunAnimation(
	rig: PilotRig,
	time: number,
	intensity: number,
	direction: RunDirection,
): void {
	const directionSign = direction === "backward" ? -1 : 1
	const stride = Math.sin(time * 11 * directionSign) * 0.72 * intensity
	const counterStride = Math.sin(time * 11 * directionSign + Math.PI)
	const liftLeft = Math.max(0, Math.sin(time * 11)) * intensity
	const liftRight = Math.max(0, Math.sin(time * 11 + Math.PI)) * intensity
	const strafe = direction === "left" ? -1 : direction === "right" ? 1 : 0
	const forward =
		direction === "forward" ? 1 : direction === "backward" ? -1 : 0

	rig.leftLeg.rotation.x = stride
	rig.rightLeg.rotation.x = counterStride * 0.72 * intensity
	rig.leftKnee.rotation.x = -(
		0.14 * intensity +
		liftLeft * 0.92 +
		Math.max(0, -stride) * 0.35
	)
	rig.rightKnee.rotation.x = -(
		0.14 * intensity +
		liftRight * 0.92 +
		Math.max(0, stride) * 0.35
	)
	rig.leftFoot.rotation.x =
		-(rig.leftLeg.rotation.x + rig.leftKnee.rotation.x) - liftLeft * 0.16
	rig.rightFoot.rotation.x =
		-(rig.rightLeg.rotation.x + rig.rightKnee.rotation.x) - liftRight * 0.16
	rig.leftToe.rotation.x = liftLeft * 0.34
	rig.rightToe.rotation.x = liftRight * 0.34
	rig.leftArm.rotation.x = -stride * 0.72
	rig.rightArm.rotation.x = stride * 0.55
	rig.leftElbow.rotation.x = 0.34 + Math.abs(stride) * 0.38
	rig.rightElbow.rotation.x = 0.42 + Math.abs(stride) * 0.24
	rig.hips.position.y = 1.72 + Math.abs(Math.sin(time * 11)) * 0.075 * intensity
	rig.hips.rotation.y = Math.sin(time * 11) * 0.08 * intensity
	rig.body.position.y = -Math.abs(Math.sin(time * 11)) * 0.02 * intensity
	rig.body.rotation.x = -forward * 0.13 * intensity
	rig.body.rotation.z = -strafe * 0.14 * intensity
	rig.neck.rotation.z = strafe * 0.035 * intensity
	rig.head.rotation.z = strafe * 0.045 * intensity
	rig.root.rotation.z = -strafe * 0.05 * intensity

	if (strafe !== 0) {
		rig.leftLeg.rotation.z = strafe * 0.2 * intensity
		rig.rightLeg.rotation.z = strafe * 0.2 * intensity
		rig.leftShoulder.rotation.z = strafe * 0.08 * intensity
		rig.rightShoulder.rotation.z = strafe * 0.08 * intensity
	}

	alignBlasterHand(rig)
}
