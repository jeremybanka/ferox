import { alignBlasterHand } from "./BlasterPose.ts"
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
	rootY: number
	shoulderRoll: number
}

const jumpPoses: ReadonlyArray<readonly [number, JumpPose]> = [
	[
		0,
		{
			arm: 0,
			bodyPitch: 0,
			bodyY: 2.52,
			elbow: 0,
			foot: 0,
			headPitch: 0,
			hipsPitch: 0,
			hipsY: 1.72,
			leg: 0,
			rootY: 0,
			shoulderRoll: 0,
		},
	],
	[
		0.14,
		{
			arm: 0.34,
			bodyPitch: 0.2,
			bodyY: 2.34,
			elbow: -0.62,
			foot: -0.42,
			headPitch: -0.1,
			hipsPitch: -0.12,
			hipsY: 1.46,
			leg: 0.7,
			rootY: -0.08,
			shoulderRoll: 0.1,
		},
	],
	[
		0.29,
		{
			arm: -0.5,
			bodyPitch: -0.14,
			bodyY: 2.58,
			elbow: -0.28,
			foot: 0.3,
			headPitch: 0.08,
			hipsPitch: 0.1,
			hipsY: 1.77,
			leg: -0.28,
			rootY: 1.08,
			shoulderRoll: 0.2,
		},
	],
	[
		0.55,
		{
			arm: -0.16,
			bodyPitch: 0.02,
			bodyY: 2.48,
			elbow: -0.52,
			foot: -0.48,
			headPitch: -0.04,
			hipsPitch: -0.04,
			hipsY: 1.62,
			leg: 0.48,
			rootY: 1.82,
			shoulderRoll: 0.14,
		},
	],
	[
		0.76,
		{
			arm: 0.24,
			bodyPitch: 0.12,
			bodyY: 2.45,
			elbow: -0.68,
			foot: -0.62,
			headPitch: -0.08,
			hipsPitch: -0.08,
			hipsY: 1.58,
			leg: 0.58,
			rootY: 1.12,
			shoulderRoll: 0.18,
		},
	],
	[
		0.9,
		{
			arm: 0.42,
			bodyPitch: 0.24,
			bodyY: 2.3,
			elbow: -0.78,
			foot: -0.5,
			headPitch: -0.12,
			hipsPitch: -0.16,
			hipsY: 1.4,
			leg: 0.78,
			rootY: -0.1,
			shoulderRoll: 0.08,
		},
	],
	[
		1,
		{
			arm: 0,
			bodyPitch: 0,
			bodyY: 2.52,
			elbow: 0,
			foot: 0,
			headPitch: 0,
			hipsPitch: 0,
			hipsY: 1.72,
			leg: 0,
			rootY: 0,
			shoulderRoll: 0,
		},
	],
]

const JUMP_KEYFRAME_LABELS = [
	"ready",
	"compress",
	"launch",
	"apex",
	"descent",
	"landing",
	"recover",
] as const

export const JUMP_KEYFRAME_MARKERS = jumpPoses.map(([progress], index) => ({
	label: JUMP_KEYFRAME_LABELS[index] ?? `pose ${index + 1}`,
	progress,
}))

function blend(from: number, to: number, amount: number): number {
	return from + (to - from) * amount
}

function smoothstep(value: number): number {
	return value * value * (3 - 2 * value)
}

export function applyJumpAnimation(rig: PilotRig, progress: number): void {
	const clampedProgress = Math.max(0, Math.min(1, progress))
	let poseIndex = 0

	while (
		poseIndex < jumpPoses.length - 2 &&
		clampedProgress > jumpPoses[poseIndex + 1]![0]
	) {
		poseIndex += 1
	}

	const [fromTime, from] = jumpPoses[poseIndex]!
	const [toTime, to] = jumpPoses[poseIndex + 1]!
	const amount = smoothstep(
		(clampedProgress - fromTime) / Math.max(0.001, toTime - fromTime),
	)
	const value = (key: keyof JumpPose): number =>
		blend(from[key], to[key], amount)

	rig.root.position.y = value("rootY")
	rig.body.position.y = value("bodyY") - value("hipsY") - 0.8
	rig.hips.position.y = value("hipsY")

	rig.body.rotation.x = value("bodyPitch")
	rig.hips.rotation.x = value("hipsPitch")
	rig.neck.rotation.x = value("headPitch") * 0.4
	rig.head.rotation.x = value("headPitch") * 0.6

	const leg = value("leg")
	const foot = value("foot")
	rig.leftLeg.rotation.x = leg
	rig.rightLeg.rotation.x = leg * 0.92
	rig.leftLeg.rotation.z = -leg * 0.07
	rig.rightLeg.rotation.z = leg * 0.07
	rig.leftKnee.rotation.x = -Math.max(
		0.08,
		Math.abs(leg) * 1.12 + Math.max(0, -foot) * 0.3,
	)
	rig.rightKnee.rotation.x = rig.leftKnee.rotation.x * 0.92
	rig.leftFoot.rotation.x =
		-(rig.leftLeg.rotation.x + rig.leftKnee.rotation.x) + foot * 0.18
	rig.rightFoot.rotation.x =
		-(rig.rightLeg.rotation.x + rig.rightKnee.rotation.x) + foot * 0.16
	rig.leftToe.rotation.x = Math.max(0, -foot) * 0.28
	rig.rightToe.rotation.x = Math.max(0, -foot) * 0.26

	const arm = value("arm")
	const elbow = value("elbow")
	const shoulderRoll = value("shoulderRoll")
	rig.leftArm.rotation.x = arm
	rig.rightArm.rotation.x = arm * 0.72
	rig.leftElbow.rotation.x = -elbow
	rig.rightElbow.rotation.x = -elbow * 0.82
	rig.leftHand.rotation.x = arm * 0.14
	rig.leftShoulder.rotation.z = -shoulderRoll
	rig.rightShoulder.rotation.z = shoulderRoll
	alignBlasterHand(rig, arm * 0.1)
}
