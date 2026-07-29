import {
	applyPilotPose,
	definePilotPose,
	type PilotPose,
} from "./PilotAnimation.ts"
import type { PilotRig } from "./PilotModel.ts"

type ArmPose = {
	elbow: number
	swing: number
}

type LegPose = {
	foot: number
	hip: number
	knee: number
	toe: number
}

type JumpPose = {
	bodyY: number
	bodyYaw: number
	hipsRoll: number
	hipsY: number
	hipsYaw: number
	leftArm: ArmPose
	leftLeg: LegPose
	rightArm: ArmPose
	rightLeg: LegPose
}

function leg(hip: number, knee: number, foot: number, toe: number): LegPose {
	return {
		foot,
		hip,
		knee,
		toe,
	}
}

// Jump begins on the run's push pose because the gameplay impulse is immediate.
const ascentPushPose: JumpPose = {
	bodyY: -0.035,
	bodyYaw: -0.045,
	hipsRoll: -0.055,
	hipsY: -0.08,
	hipsYaw: 0.055,
	leftArm: { elbow: 1.7, swing: -0.1 },
	leftLeg: leg(0, -0.1, 0, 0.7),
	rightArm: { elbow: 1.7, swing: 0.09 },
	rightLeg: leg(1.3, -1.5, -0.18, 0.34),
}

// The run's flight pose is shared by the end of ascent and start of descent.
const apexFlightPose: JumpPose = {
	bodyY: 0.018,
	bodyYaw: 0.085,
	hipsRoll: 0.035,
	hipsY: 0.0,
	hipsYaw: -0.1,
	leftArm: { elbow: 1.2, swing: 0.4 },
	leftLeg: leg(-0.56, -0.2, -0.24, 0.3),
	rightArm: { elbow: 1.65, swing: -0.13 },
	rightLeg: leg(1.3, -1, 0.12, 0.18),
}

const runContactPose: JumpPose = {
	bodyY: 0,
	bodyYaw: -0.09,
	hipsRoll: -0.035,
	hipsY: 0.02,
	hipsYaw: 0.11,
	leftArm: { elbow: 1.62, swing: -0.6 },
	leftLeg: leg(1.2, 0, 0, 0),
	rightArm: { elbow: 1.7, swing: 0.04 },
	rightLeg: leg(0, -1.2, 0, 0),
}

function mirrorPose(pose: JumpPose): JumpPose {
	return {
		...pose,
		bodyYaw: -pose.bodyYaw,
		hipsRoll: -pose.hipsRoll,
		hipsYaw: -pose.hipsYaw,
		leftArm: { ...pose.leftArm, swing: -pose.leftArm.swing },
		leftLeg: pose.rightLeg,
		rightArm: { ...pose.rightArm, swing: -pose.rightArm.swing },
		rightLeg: pose.leftLeg,
	}
}

const descentContactPose = mirrorPose(runContactPose)

const JUMP_KEYFRAMES: ReadonlyArray<readonly [number, JumpPose]> = [
	[0, ascentPushPose],
	[0.5, apexFlightPose],
	[1, descentContactPose],
]

const JUMP_KEYFRAME_LABELS = [
	"ascent · push L",
	"apex · flight L",
	"descent · contact R",
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

function interpolateLeg(from: LegPose, to: LegPose, amount: number): LegPose {
	return {
		foot: blend(from.foot, to.foot, amount),
		hip: blend(from.hip, to.hip, amount),
		knee: blend(from.knee, to.knee, amount),
		toe: blend(from.toe, to.toe, amount),
	}
}

function interpolateArm(from: ArmPose, to: ArmPose, amount: number): ArmPose {
	return {
		elbow: blend(from.elbow, to.elbow, amount),
		swing: blend(from.swing, to.swing, amount),
	}
}

function sampleJumpPose(progress: number): JumpPose {
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
	return {
		bodyY: blend(from.bodyY, to.bodyY, amount),
		bodyYaw: blend(from.bodyYaw, to.bodyYaw, amount),
		hipsRoll: blend(from.hipsRoll, to.hipsRoll, amount),
		hipsY: blend(from.hipsY, to.hipsY, amount),
		hipsYaw: blend(from.hipsYaw, to.hipsYaw, amount),
		leftArm: interpolateArm(from.leftArm, to.leftArm, amount),
		leftLeg: interpolateLeg(from.leftLeg, to.leftLeg, amount),
		rightArm: interpolateArm(from.rightArm, to.rightArm, amount),
		rightLeg: interpolateLeg(from.rightLeg, to.rightLeg, amount),
	}
}

export function sampleJumpAnimationPose(progress: number): PilotPose {
	const pose = sampleJumpPose(progress)
	return definePilotPose({
		body: {
			position: { y: pose.bodyY },
			rotation: { x: -0.1, y: pose.bodyYaw },
		},
		head: { rotation: { y: -pose.bodyYaw * 0.34 } },
		hips: {
			position: { y: 1.72 + pose.hipsY },
			rotation: {
				x: -0.55,
				y: pose.hipsYaw,
				z: pose.hipsRoll,
			},
		},
		leftArm: { rotation: { x: pose.leftArm.swing } },
		leftElbow: { rotation: { x: pose.leftArm.elbow } },
		leftFoot: { rotation: { x: pose.leftLeg.foot } },
		leftKnee: { rotation: { x: pose.leftLeg.knee } },
		leftLeg: { rotation: { x: pose.leftLeg.hip } },
		leftShoulder: { rotation: { y: -0.6, z: -0.6 } },
		leftToe: { rotation: { x: pose.leftLeg.toe } },
		neck: { rotation: { x: 0.55, y: -pose.bodyYaw * 0.24 } },
		rightArm: { rotation: { x: pose.rightArm.swing * 0.72 } },
		rightElbow: { rotation: { x: pose.rightArm.elbow * 0.88 } },
		rightFoot: { rotation: { x: pose.rightLeg.foot } },
		rightHand: { rotation: { x: -pose.bodyY * 0.4 } },
		rightKnee: { rotation: { x: pose.rightLeg.knee } },
		rightLeg: { rotation: { x: pose.rightLeg.hip } },
		rightShoulder: { rotation: { y: 0.6, z: 0.2 } },
		rightToe: { rotation: { x: pose.rightLeg.toe } },
	})
}

export function applyJumpAnimation(rig: PilotRig, progress: number): void {
	applyPilotPose(rig, sampleJumpAnimationPose(progress))
}
