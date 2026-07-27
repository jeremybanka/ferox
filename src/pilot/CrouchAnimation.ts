import { alignBlasterHand } from "./BlasterPose.ts"
import type { PilotRig } from "./PilotModel.ts"
import type { RunDirection } from "./RunAnimation.ts"

function crouchWeight(weight: number): number {
	return Math.max(0, Math.min(1, weight))
}

function applyGuardedCrouch(rig: PilotRig, weight: number): void {
	const amount = crouchWeight(weight)

	rig.root.position.y = -0.34 * amount
	rig.hips.position.y = 1.72 - 0.2 * amount
	rig.hips.rotation.x = -0.08 * amount
	rig.body.position.y = -0.06 * amount
	rig.body.rotation.x = -0.12 * amount
	rig.neck.rotation.x = -0.05 * amount
	rig.head.rotation.x = -0.07 * amount

	rig.leftLeg.rotation.x = 0.5 * amount
	rig.leftLeg.rotation.z = -0.22 * amount
	rig.rightLeg.rotation.x = 0.5 * amount
	rig.rightLeg.rotation.z = 0.22 * amount
	rig.leftKnee.rotation.x = -1.12 * amount
	rig.rightKnee.rotation.x = -1.12 * amount
	rig.leftFoot.rotation.x = 0.62 * amount
	rig.leftFoot.rotation.z = 0.1 * amount
	rig.rightFoot.rotation.x = 0.62 * amount
	rig.rightFoot.rotation.z = -0.1 * amount
	rig.leftToe.rotation.x = 0.12 * amount
	rig.rightToe.rotation.x = 0.12 * amount

	rig.leftShoulder.rotation.x = 0.62 * amount
	rig.leftShoulder.rotation.z = -0.18 * amount
	rig.leftArm.rotation.x = 0.18 * amount
	rig.leftArm.rotation.z = -0.42 * amount
	rig.leftElbow.rotation.x = 1.08 * amount
	rig.leftElbow.rotation.z = -0.16 * amount
	rig.leftHand.rotation.x = 0.2 * amount

	rig.rightShoulder.rotation.x = 0.74 * amount
	rig.rightShoulder.rotation.z = 0.12 * amount
	rig.rightArm.rotation.x = 0.2 * amount
	rig.rightArm.rotation.z = 0.2 * amount
	rig.rightElbow.rotation.x = 1.18 * amount
	rig.rightElbow.rotation.z = 0.08 * amount
	alignBlasterHand(rig, 0.16 * amount)
}

export function applyCrouchIdleAnimation(
	rig: PilotRig,
	time: number,
	weight: number,
): void {
	const amount = crouchWeight(weight)
	const breathing = Math.sin(time * 2.6)
	const scan = Math.sin(time * 0.82)

	applyGuardedCrouch(rig, amount)
	rig.root.position.y += breathing * 0.018 * amount
	rig.hips.rotation.y = scan * 0.035 * amount
	rig.body.position.y += breathing * 0.014 * amount
	rig.body.rotation.y = scan * 0.025 * amount
	rig.neck.rotation.y = scan * 0.04 * amount
	rig.head.rotation.y = scan * 0.06 * amount
	rig.leftElbow.rotation.x += breathing * 0.025 * amount
	rig.rightElbow.rotation.x -= breathing * 0.02 * amount
	alignBlasterHand(rig, 0.16 * amount, scan * 0.018 * amount)
}

export function applyCrouchMoveAnimation(
	rig: PilotRig,
	time: number,
	weight: number,
	direction: RunDirection,
): void {
	const amount = crouchWeight(weight)
	const phaseDirection = direction === "backward" ? -1 : 1
	const phase = time * 7.6 * phaseDirection
	const stride = Math.sin(phase)
	const step = Math.abs(Math.sin(phase))
	const strafe = direction === "left" ? -1 : direction === "right" ? 1 : 0
	const forward =
		direction === "forward" ? 1 : direction === "backward" ? -1 : 0

	applyGuardedCrouch(rig, amount)

	rig.root.position.y += step * 0.045 * amount
	rig.root.rotation.z = -strafe * 0.08 * amount
	rig.hips.rotation.y = stride * 0.12 * amount
	rig.hips.rotation.z = -strafe * 0.08 * amount
	rig.body.position.y += step * 0.025 * amount
	rig.body.rotation.x -= forward * 0.08 * amount
	rig.body.rotation.z = -strafe * 0.13 * amount
	rig.neck.rotation.z = strafe * 0.03 * amount
	rig.head.rotation.z = strafe * 0.05 * amount

	if (strafe === 0) {
		rig.leftLeg.rotation.x += stride * 0.28 * amount
		rig.rightLeg.rotation.x -= stride * 0.28 * amount
		rig.leftKnee.rotation.x -= Math.max(0, stride) * 0.22 * amount
		rig.rightKnee.rotation.x -= Math.max(0, -stride) * 0.22 * amount
		rig.leftFoot.rotation.x = -(
			rig.leftLeg.rotation.x + rig.leftKnee.rotation.x
		)
		rig.rightFoot.rotation.x = -(
			rig.rightLeg.rotation.x + rig.rightKnee.rotation.x
		)
		rig.leftToe.rotation.x += Math.max(0, -stride) * 0.24 * amount
		rig.rightToe.rotation.x += Math.max(0, stride) * 0.24 * amount
	} else {
		const plantedStep = (0.5 + 0.5 * stride * strafe) * amount
		rig.leftLeg.rotation.z -= strafe * stride * 0.12 * amount
		rig.rightLeg.rotation.z -= strafe * stride * 0.12 * amount
		rig.leftLeg.rotation.y = strafe * 0.12 * plantedStep
		rig.rightLeg.rotation.y = -strafe * 0.12 * (amount - plantedStep)
		rig.leftFoot.rotation.z += strafe * stride * 0.08 * amount
		rig.rightFoot.rotation.z -= strafe * stride * 0.08 * amount
	}

	rig.leftShoulder.rotation.y = -stride * 0.04 * amount
	rig.rightShoulder.rotation.y = stride * 0.04 * amount
	rig.leftElbow.rotation.x += step * 0.06 * amount
	rig.rightElbow.rotation.x += step * 0.04 * amount
	alignBlasterHand(rig, 0.16 * amount, -strafe * 0.04 * amount)
}
