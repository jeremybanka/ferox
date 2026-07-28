import type { PilotRig } from "./PilotModel.ts"
import {
	PILOT_JOINTS,
	RUN_INFLUENCE,
	sampleDraftAnimation,
	type PilotAnimationLayer,
	type PilotJoint,
	type PilotPose,
	type PoseChannels,
	type PoseInfluence,
} from "./PilotAnimation.ts"
import {
	RUN_KEYFRAME_MARKERS,
	sampleRunAnimationPose,
	type RunDirection,
} from "./RunAnimation.ts"

export const CROUCH_RUN_DURATION_SECONDS = 0.8

export const CROUCH_RUN_KEYFRAME_MARKERS = RUN_KEYFRAME_MARKERS

const CROUCH_RUN_MOTION_BLEND: Readonly<PoseInfluence> = {
	body: 0.34,
	head: 0.12,
	hips: 0.5,
	leftArm: 0.08,
	leftElbow: 0.08,
	leftFoot: 0.58,
	leftHand: 0.05,
	leftKnee: 0.58,
	leftLeg: 0.58,
	leftShoulder: 0.1,
	leftToe: 0.58,
	neck: 0.14,
	rightArm: 0.08,
	rightElbow: 0.08,
	rightFoot: 0.58,
	rightHand: 0.05,
	rightKnee: 0.58,
	rightLeg: 0.58,
	rightShoulder: 0.1,
	rightToe: 0.58,
	root: 0.52,
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

const GUARDED_CROUCH_POSE = sampleDraftAnimation((rig) => {
	applyGuardedCrouch(rig, 1)
})

function blendChannels(
	crouch: PoseChannels | undefined,
	run: PoseChannels | undefined,
	amount: number,
): PoseChannels | undefined {
	if (crouch === undefined && run === undefined) return undefined
	const channels: PoseChannels = {}
	for (const axis of ["x", "y", "z"] as const) {
		const crouchValue = crouch?.[axis] ?? run?.[axis]
		const runValue = run?.[axis] ?? crouch?.[axis]
		if (crouchValue === undefined || runValue === undefined) continue
		channels[axis] = crouchValue + (runValue - crouchValue) * amount
	}
	return channels
}

function blendJoint(
	crouch: PilotPose[PilotJoint],
	run: PilotPose[PilotJoint],
	amount: number,
): PilotPose[PilotJoint] {
	if (crouch === undefined && run === undefined) return undefined
	const position = blendChannels(crouch?.position, run?.position, amount)
	const rotation = blendChannels(crouch?.rotation, run?.rotation, amount)
	return {
		...(position === undefined ? {} : { position }),
		...(rotation === undefined ? {} : { rotation }),
	}
}

export function sampleCrouchRunAnimationPose(
	time: number,
	intensity: number,
	direction: RunDirection,
): PilotPose {
	const runCycleTime =
		(time / CROUCH_RUN_DURATION_SECONDS) * ((Math.PI * 2) / 11)
	const runPose = sampleRunAnimationPose(runCycleTime, 1, direction)
	const pose: PilotPose = {}
	for (const joint of PILOT_JOINTS) {
		const amount =
			Math.max(0, Math.min(1, intensity)) *
			(CROUCH_RUN_MOTION_BLEND[joint] ?? 0)
		const blended = blendJoint(
			GUARDED_CROUCH_POSE[joint],
			runPose[joint],
			amount,
		)
		if (blended !== undefined) pose[joint] = blended
	}
	return pose
}

export function crouchRunAnimationLayer(
	time: number,
	intensity: number,
	direction: RunDirection,
): PilotAnimationLayer {
	return {
		fadeSeconds: 0.12,
		id: `locomotion:crouch-${direction}`,
		influence: RUN_INFLUENCE,
		mode: "override",
		pose: sampleCrouchRunAnimationPose(time, intensity, direction),
	}
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
