import { alignBlasterHand } from "./BlasterPose.ts"
import type { PilotRig } from "./PilotModel.ts"

type DoubleJumpPose = {
	blasterHandPitch: number
	bodyPitch: number
	bodyRoll: number
	bodyY: number
	bodyYaw: number
	headPitch: number
	headRoll: number
	headYaw: number
	hipsPitch: number
	hipsRoll: number
	hipsY: number
	hipsYaw: number
	leftArmPitch: number
	leftArmRoll: number
	leftElbowPitch: number
	leftElbowYaw: number
	leftFootPitch: number
	leftFootRoll: number
	leftHandPitch: number
	leftKneePitch: number
	leftLegPitch: number
	leftLegRoll: number
	leftLegYaw: number
	leftShoulderPitch: number
	leftShoulderRoll: number
	leftToePitch: number
	neckPitch: number
	neckRoll: number
	neckYaw: number
	rightArmPitch: number
	rightArmRoll: number
	rightElbowPitch: number
	rightElbowYaw: number
	rightFootPitch: number
	rightFootRoll: number
	rightKneePitch: number
	rightLegPitch: number
	rightLegRoll: number
	rightLegYaw: number
	rightShoulderPitch: number
	rightShoulderRoll: number
	rightToePitch: number
	rootPitch: number
	rootRoll: number
	rootY: number
}

const secondaryAnticipationPose: DoubleJumpPose = {
	blasterHandPitch: -0.06,
	bodyPitch: 0.25,
	bodyRoll: -0.04,
	bodyY: 0,
	bodyYaw: 0.06,
	headPitch: -0.05,
	headRoll: 0.02,
	headYaw: 0,
	hipsPitch: 0.22,
	hipsRoll: 0.04,
	hipsY: 1.58,
	hipsYaw: -0.08,
	leftArmPitch: -0.7,
	leftArmRoll: -0.18,
	leftElbowPitch: 1.22,
	leftElbowYaw: 0.08,
	leftFootPitch: 0.08,
	leftFootRoll: 0,
	leftHandPitch: -0.08,
	leftKneePitch: -1.12,
	leftLegPitch: -1.08,
	leftLegRoll: -0.12,
	leftLegYaw: 0.12,
	leftShoulderPitch: -0.34,
	leftShoulderRoll: -0.2,
	leftToePitch: 0.12,
	neckPitch: -0.03,
	neckRoll: 0.01,
	neckYaw: 0,
	rightArmPitch: -0.5,
	rightArmRoll: 0.14,
	rightElbowPitch: 1.16,
	rightElbowYaw: -0.08,
	rightFootPitch: 0,
	rightFootRoll: 0,
	rightKneePitch: -1.24,
	rightLegPitch: -1.02,
	rightLegRoll: 0.12,
	rightLegYaw: -0.12,
	rightShoulderPitch: -0.22,
	rightShoulderRoll: 0.18,
	rightToePitch: 0.1,
	rootPitch: -0.16,
	rootRoll: -0.04,
	rootY: -0.1,
}

const boostActionPose: DoubleJumpPose = {
	blasterHandPitch: 0.14,
	bodyPitch: -0.06,
	bodyRoll: 0.1,
	bodyY: 0.04,
	bodyYaw: 0.34,
	headPitch: 0.07,
	headRoll: -0.05,
	headYaw: -0.08,
	hipsPitch: -0.1,
	hipsRoll: -0.08,
	hipsY: 1.8,
	hipsYaw: -0.42,
	leftArmPitch: -1.08,
	leftArmRoll: -0.32,
	leftElbowPitch: 1.55,
	leftElbowYaw: 0.28,
	leftFootPitch: -0.12,
	leftFootRoll: -0.12,
	leftHandPitch: 0.18,
	leftKneePitch: -1.46,
	leftLegPitch: -0.82,
	leftLegRoll: -0.32,
	leftLegYaw: 0.28,
	leftShoulderPitch: -0.76,
	leftShoulderRoll: -0.58,
	leftToePitch: 0.34,
	neckPitch: 0.05,
	neckRoll: -0.03,
	neckYaw: -0.06,
	rightArmPitch: -0.84,
	rightArmRoll: 0.26,
	rightElbowPitch: 1.38,
	rightElbowYaw: -0.24,
	rightFootPitch: 0,
	rightFootRoll: 0.12,
	rightKneePitch: -1.58,
	rightLegPitch: -1.22,
	rightLegRoll: 0.28,
	rightLegYaw: -0.24,
	rightShoulderPitch: 0.18,
	rightShoulderRoll: 0.42,
	rightToePitch: 0.38,
	rootPitch: 0.08,
	rootRoll: 0.14,
	rootY: 0.22,
}

const aerialFollowThroughPose: DoubleJumpPose = {
	blasterHandPitch: 0,
	bodyPitch: 0.12,
	bodyRoll: 0,
	bodyY: 0.02,
	bodyYaw: 0.08,
	headPitch: -0.05,
	headRoll: 0,
	headYaw: 0,
	hipsPitch: 0.04,
	hipsRoll: 0,
	hipsY: 1.68,
	hipsYaw: -0.06,
	leftArmPitch: -0.4,
	leftArmRoll: -0.16,
	leftElbowPitch: 0.58,
	leftElbowYaw: 0,
	leftFootPitch: -0.04,
	leftFootRoll: -0.08,
	leftHandPitch: 0,
	leftKneePitch: -0.58,
	leftLegPitch: -0.38,
	leftLegRoll: -0.26,
	leftLegYaw: 0.04,
	leftShoulderPitch: -0.18,
	leftShoulderRoll: -0.82,
	leftToePitch: 0.06,
	neckPitch: -0.03,
	neckRoll: 0,
	neckYaw: 0,
	rightArmPitch: -0.34,
	rightArmRoll: 0.12,
	rightElbowPitch: 0.62,
	rightElbowYaw: 0,
	rightFootPitch: 0,
	rightFootRoll: 0.08,
	rightKneePitch: -0.62,
	rightLegPitch: -0.3,
	rightLegRoll: 0.26,
	rightLegYaw: -0.04,
	rightShoulderPitch: -0.12,
	rightShoulderRoll: 0.72,
	rightToePitch: 0.06,
	rootPitch: -0.04,
	rootRoll: 0.02,
	rootY: 0,
}

const DOUBLE_JUMP_KEYFRAMES: ReadonlyArray<readonly [number, DoubleJumpPose]> =
	[
		[0, secondaryAnticipationPose],
		[0.5, boostActionPose],
		[1, aerialFollowThroughPose],
	]

const DOUBLE_JUMP_KEYFRAME_LABELS = [
	"secondary anticipation",
	"boost action",
	"aerial follow-through",
] as const

export const DOUBLE_JUMP_KEYFRAME_MARKERS = DOUBLE_JUMP_KEYFRAMES.map(
	([progress], index) => ({
		label: DOUBLE_JUMP_KEYFRAME_LABELS[index] ?? `pose ${index + 1}`,
		progress,
	}),
)

function blend(from: number, to: number, amount: number): number {
	return from + (to - from) * amount
}

function smoothstep(value: number): number {
	return value * value * (3 - 2 * value)
}

function sampleDoubleJumpPose(progress: number): DoubleJumpPose {
	let poseIndex = 0
	while (
		poseIndex < DOUBLE_JUMP_KEYFRAMES.length - 2 &&
		progress > DOUBLE_JUMP_KEYFRAMES[poseIndex + 1]![0]
	) {
		poseIndex += 1
	}

	const [fromTime, from] = DOUBLE_JUMP_KEYFRAMES[poseIndex]!
	const [toTime, to] = DOUBLE_JUMP_KEYFRAMES[poseIndex + 1]!
	const amount = smoothstep(
		(progress - fromTime) / Math.max(0.001, toTime - fromTime),
	)
	return Object.fromEntries(
		Object.keys(from).map((key) => [
			key,
			blend(
				from[key as keyof DoubleJumpPose],
				to[key as keyof DoubleJumpPose],
				amount,
			),
		]),
	) as DoubleJumpPose
}

export function applyDoubleJumpAnimation(
	rig: PilotRig,
	progress: number,
): void {
	const phase = Math.min(1, Math.max(0, progress))
	const boost = Math.sin(phase * Math.PI)
	const pose = sampleDoubleJumpPose(phase)

	// The second boost starts as a tight midair tuck, snaps into a compact
	// asymmetric twist, then opens the heavy suit into a stable landing shape.
	rig.root.position.y = pose.rootY
	rig.root.rotation.x = pose.rootPitch
	rig.root.rotation.z = pose.rootRoll

	rig.hips.position.y = pose.hipsY
	rig.hips.rotation.x = pose.hipsPitch
	rig.hips.rotation.y = pose.hipsYaw
	rig.hips.rotation.z = pose.hipsRoll

	rig.body.position.y = pose.bodyY
	rig.body.rotation.x = pose.bodyPitch
	rig.body.rotation.y = pose.bodyYaw
	rig.body.rotation.z = pose.bodyRoll
	rig.neck.rotation.x = pose.neckPitch
	rig.neck.rotation.y = pose.neckYaw
	rig.neck.rotation.z = pose.neckRoll
	rig.head.rotation.x = pose.headPitch
	rig.head.rotation.y = pose.headYaw
	rig.head.rotation.z = pose.headRoll

	rig.leftShoulder.rotation.x = pose.leftShoulderPitch
	rig.leftShoulder.rotation.z = pose.leftShoulderRoll
	rig.rightShoulder.rotation.x = pose.rightShoulderPitch
	rig.rightShoulder.rotation.z = pose.rightShoulderRoll
	rig.leftArm.rotation.x = pose.leftArmPitch
	rig.leftArm.rotation.z = pose.leftArmRoll
	rig.rightArm.rotation.x = pose.rightArmPitch
	rig.rightArm.rotation.z = pose.rightArmRoll
	rig.leftElbow.rotation.x = pose.leftElbowPitch
	rig.leftElbow.rotation.y = pose.leftElbowYaw
	rig.rightElbow.rotation.x = pose.rightElbowPitch
	rig.rightElbow.rotation.y = pose.rightElbowYaw

	rig.leftLeg.rotation.x = pose.leftLegPitch
	rig.leftLeg.rotation.y = pose.leftLegYaw
	rig.leftLeg.rotation.z = pose.leftLegRoll
	rig.rightLeg.rotation.x = pose.rightLegPitch
	rig.rightLeg.rotation.y = pose.rightLegYaw
	rig.rightLeg.rotation.z = pose.rightLegRoll
	rig.leftKnee.rotation.x = pose.leftKneePitch
	rig.rightKnee.rotation.x = pose.rightKneePitch
	rig.leftFoot.rotation.x =
		-(rig.leftLeg.rotation.x + rig.leftKnee.rotation.x) + pose.leftFootPitch
	rig.leftFoot.rotation.z = pose.leftFootRoll
	rig.rightFoot.rotation.x = pose.rightFootPitch
	rig.rightFoot.rotation.z = pose.rightFootRoll
	rig.leftToe.rotation.x = pose.leftToePitch
	rig.rightToe.rotation.x = pose.rightToePitch

	// A short recoil pulse sells the backpack firing without needing extra bones.
	rig.body.position.z = -boost * 0.08
	rig.hips.position.z = boost * 0.045
	rig.leftHand.rotation.x = pose.leftHandPitch
	alignBlasterHand(rig, pose.blasterHandPitch)
}
