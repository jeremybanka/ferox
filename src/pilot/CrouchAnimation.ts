import { alignBlasterHand } from "./BlasterPose.ts"
import type { PilotRig } from "./PilotModel.ts"
import type { RunDirection } from "./RunAnimation.ts"

export const CROUCH_RUN_DURATION_SECONDS = 0.8

type CrouchRunGaitPose = {
	lift: number
	stride: number
}

const CROUCH_RUN_KEYFRAMES: ReadonlyArray<
	readonly [number, CrouchRunGaitPose]
> = [
	[0, { lift: 0.08, stride: 0.18 }],
	[0.125, { lift: 0.48, stride: 0.72 }],
	[0.25, { lift: 0.92, stride: 1 }],
	[0.375, { lift: 0.68, stride: 0.46 }],
	[0.5, { lift: 0.08, stride: -0.18 }],
	[0.625, { lift: 0.48, stride: -0.72 }],
	[0.75, { lift: 0.92, stride: -1 }],
	[0.875, { lift: 0.68, stride: -0.46 }],
	[1, { lift: 0.08, stride: 0.18 }],
]

const CROUCH_RUN_KEYFRAME_LABELS = [
	"contact L",
	"passing L",
	"push L",
	"flight L",
	"contact R",
	"passing R",
	"push R",
	"flight R",
	"loop",
] as const

export const CROUCH_RUN_KEYFRAME_MARKERS = CROUCH_RUN_KEYFRAMES.map(
	([progress], index) => ({
		label: CROUCH_RUN_KEYFRAME_LABELS[index] ?? `pose ${index + 1}`,
		progress,
	}),
)

function blend(from: number, to: number, amount: number): number {
	return from + (to - from) * amount
}

function smoothstep(value: number): number {
	return value * value * (3 - 2 * value)
}

function sampleCrouchRunGait(progress: number): CrouchRunGaitPose {
	const cycle = ((progress % 1) + 1) % 1
	let poseIndex = 0
	while (
		poseIndex < CROUCH_RUN_KEYFRAMES.length - 2 &&
		cycle > CROUCH_RUN_KEYFRAMES[poseIndex + 1]![0]
	) {
		poseIndex += 1
	}
	const [fromTime, from] = CROUCH_RUN_KEYFRAMES[poseIndex]!
	const [toTime, to] = CROUCH_RUN_KEYFRAMES[poseIndex + 1]!
	const amount = smoothstep((cycle - fromTime) / (toTime - fromTime))
	return {
		lift: blend(from.lift, to.lift, amount),
		stride: blend(from.stride, to.stride, amount),
	}
}

function crouchWeight(weight: number): number {
	return Math.max(0, Math.min(1, weight))
}

function applyGuardedCrouch(rig: PilotRig, weight: number): void {
	const amount = crouchWeight(weight)

	rig.root.position.y = -0.5 * amount
	rig.hips.position.y = 1.72 - 0.2 * amount
	rig.hips.rotation.x = -0.08 * amount
	rig.body.position.y = -0.06 * amount
	rig.body.rotation.x = -0.52 * amount
	rig.neck.rotation.x = -0.05 * amount
	rig.head.rotation.x = -0.07 * amount

	rig.leftLeg.rotation.x = 1.5 * amount
	rig.leftLeg.rotation.z = -0.22 * amount
	rig.rightLeg.rotation.x = 0.5 * amount
	rig.rightLeg.rotation.z = 0.22 * amount
	rig.leftKnee.rotation.x = -1.52 * amount
	rig.rightKnee.rotation.x = -1.92 * amount
	rig.leftFoot.rotation.x = 0.1 * amount
	rig.leftFoot.rotation.z = 0.1 * amount
	rig.rightFoot.rotation.x = 0.62 * amount
	rig.rightFoot.rotation.z = -0.1 * amount
	rig.leftToe.rotation.x = 0.12 * amount
	rig.rightToe.rotation.x = 0.12 * amount

	rig.leftShoulder.rotation.x = 0.62 * amount
	rig.leftShoulder.rotation.z = -0.18 * amount
	rig.leftArm.rotation.x = -0.28 * amount
	rig.leftArm.rotation.z = -0.42 * amount
	rig.leftElbow.rotation.x = 0.38 * amount
	rig.leftElbow.rotation.z = -0.16 * amount
	rig.leftHand.rotation.x = 0.2 * amount

	rig.rightShoulder.rotation.x = 0.74 * amount
	rig.rightShoulder.rotation.z = -0.12 * amount
	rig.rightArm.rotation.x = 0.1 * amount
	rig.rightArm.rotation.z = 0.2 * amount
	rig.rightElbow.rotation.x = 0.78 * amount
	rig.rightElbow.rotation.z = -0.68 * amount
	// alignBlasterHand(rig, 0.16 * amount)
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
}

export function applyCrouchMoveAnimation(
	rig: PilotRig,
	time: number,
	weight: number,
	direction: RunDirection,
): void {
	const amount = crouchWeight(weight)
	const phaseDirection = direction === "backward" ? -1 : 1
	const progress = (time * 7.6 * phaseDirection) / (Math.PI * 2)
	const gait = sampleCrouchRunGait(progress)
	const stride = gait.stride
	const step = gait.lift
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
