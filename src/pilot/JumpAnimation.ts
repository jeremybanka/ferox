import {
	applyPilotPose,
	definePilotPose,
	type PilotPose,
} from "./PilotAnimation.ts"
import type { PilotRig } from "./PilotModel.ts"

type JumpPose = {
	arm: number
	bodyPitch: number
	bodyY: number
	elbow: number
	foot: number
	headPitch: number
	hipsPitch: number
	hipsY: number
	leg: number
	shoulderRoll: number
}

const startingPose: JumpPose = {
	arm: 1,
	bodyPitch: 0,
	bodyY: 0,
	elbow: 0,
	foot: 0,
	headPitch: 0,
	hipsPitch: 0,
	hipsY: 0,
	leg: 0,
	shoulderRoll: 1,
}

const anticipationPose: JumpPose = {
	arm: 1.34,
	bodyPitch: 0.2,
	bodyY: 2.34,
	elbow: -0.62,
	foot: -0.42,
	headPitch: -0.1,
	hipsPitch: -0.12,
	hipsY: 1.46,
	leg: 0.7,
	shoulderRoll: 0.1,
}

const takeoffExtensionPose: JumpPose = {
	arm: -0.5,
	bodyPitch: -0.14,
	bodyY: 2.58,
	elbow: -0.28,
	foot: 0.3,
	headPitch: 0.08,
	hipsPitch: 0.1,
	hipsY: 1.77,
	leg: -0.28,
	shoulderRoll: 0.2,
}

const hangTimePose: JumpPose = {
	arm: -0.16,
	bodyPitch: 0.02,
	bodyY: 2.48,
	elbow: -0.52,
	foot: -0.48,
	headPitch: -0.04,
	hipsPitch: -0.04,
	hipsY: 1.62,
	leg: 0.48,
	shoulderRoll: 0.14,
}

const fallingPose: JumpPose = {
	arm: 0.24,
	bodyPitch: 0.12,
	bodyY: 2.45,
	elbow: -0.68,
	foot: -0.62,
	headPitch: -0.08,
	hipsPitch: -0.08,
	hipsY: 1.58,
	leg: 0.58,
	shoulderRoll: 0.18,
}

const landingContactPose: JumpPose = {
	arm: 0.42,
	bodyPitch: 0.24,
	bodyY: 2.3,
	elbow: -0.78,
	foot: -0.5,
	headPitch: -0.12,
	hipsPitch: -0.16,
	hipsY: 1.4,
	leg: 0.78,
	shoulderRoll: 0.08,
}

const settlePose: JumpPose = { ...startingPose }

const JUMP_KEYFRAMES: ReadonlyArray<readonly [number, JumpPose]> = [
	[0, startingPose],
	[0.14, anticipationPose],
	[0.29, takeoffExtensionPose],
	[0.55, hangTimePose],
	[0.76, fallingPose],
	[0.9, landingContactPose],
	[1, settlePose],
]

const JUMP_KEYFRAME_LABELS = [
	"starting pose",
	"anticipation",
	"takeoff extension",
	"hang time",
	"falling pose",
	"landing contact",
	"settle",
] as const

export const JUMP_KEYFRAME_MARKERS = JUMP_KEYFRAMES.map(
	([progress], index) => ({
		label: JUMP_KEYFRAME_LABELS[index] ?? `pose ${index + 1}`,
		progress,
	}),
)

function blend(from: number, to: number, amount: number): number {
	return from + (to - from) * amount
}

function smoothstep(value: number): number {
	return value * value * (3 - 2 * value)
}

export function sampleJumpAnimationPose(progress: number): PilotPose {
	const clampedProgress = Math.max(0, Math.min(1, progress))
	let poseIndex = 0

	while (
		poseIndex < JUMP_KEYFRAMES.length - 2 &&
		clampedProgress > JUMP_KEYFRAMES[poseIndex + 1]![0]
	) {
		poseIndex += 1
	}

	const [fromTime, from] = JUMP_KEYFRAMES[poseIndex]!
	const [toTime, to] = JUMP_KEYFRAMES[poseIndex + 1]!
	const amount = smoothstep(
		(clampedProgress - fromTime) / Math.max(0.001, toTime - fromTime),
	)
	const value = (key: keyof JumpPose): number =>
		blend(from[key], to[key], amount)

	const leg = value("leg")
	const foot = value("foot")
	const leftKnee = -Math.max(
		0.08,
		Math.abs(leg) * 1.12 + Math.max(0, -foot) * 0.3,
	)
	const rightKnee = leftKnee * 0.92

	const arm = value("arm")
	const elbow = value("elbow")
	const shoulderRoll = value("shoulderRoll")
	return definePilotPose({
		body: {
			position: { y: value("bodyY") - value("hipsY") - 0.8 },
			rotation: { x: value("bodyPitch") },
		},
		head: { rotation: { x: value("headPitch") * 0.6 } },
		hips: {
			position: { y: value("hipsY") },
			rotation: { x: value("hipsPitch") },
		},
		leftArm: { rotation: { x: arm } },
		leftElbow: { rotation: { x: -elbow } },
		leftFoot: {
			rotation: { x: -(leg + leftKnee) + foot * 0.18 },
		},
		leftHand: { rotation: { x: arm * 0.14 } },
		leftKnee: { rotation: { x: leftKnee } },
		leftLeg: { rotation: { x: leg, z: -leg * 0.07 } },
		leftShoulder: { rotation: { z: -shoulderRoll } },
		leftToe: { rotation: { x: Math.max(0, -foot) * 0.28 } },
		neck: { rotation: { x: value("headPitch") * 0.4 } },
		rightArm: { rotation: { x: arm * 0.72 } },
		rightElbow: { rotation: { x: -elbow * 0.82 } },
		rightFoot: {
			rotation: {
				x: -(leg * 0.92 + rightKnee) + foot * 0.16,
			},
		},
		rightHand: { rotation: { x: arm * 0.1 } },
		rightKnee: { rotation: { x: rightKnee } },
		rightLeg: { rotation: { x: leg * 0.92, z: leg * 0.07 } },
		rightShoulder: { rotation: { z: shoulderRoll } },
		rightToe: { rotation: { x: Math.max(0, -foot) * 0.26 } },
	})
}

export function applyJumpAnimation(rig: PilotRig, progress: number): void {
	applyPilotPose(rig, sampleJumpAnimationPose(progress))
}
