import * as THREE from "three"

import {
	applyPilotPose,
	definePilotPose,
	RUN_INFLUENCE,
	type PilotAnimationLayer,
	type PilotPose,
} from "./PilotAnimation.ts"
import type { PilotRig } from "./PilotModel.ts"

export type RunDirection = "backward" | "forward" | "left" | "right"

type ArmPose = {
	elbow: number
	swing: number
	// shoulder: number
}

type LegPose = {
	foot: number
	hip: number
	knee: number
	toe: number
}

type RunPose = {
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

const contactPose: RunPose = {
	bodyY: 0,
	bodyYaw: -0.09,
	hipsRoll: -0.035,
	hipsY: 0.02,
	hipsYaw: 0.11,
	leftArm: { elbow: 1.62, swing: -0.6 },
	leftLeg: leg(1.2, -0, 0, 0),
	rightArm: { elbow: 1.7, swing: 0.04 },
	rightLeg: leg(0, -1.2, 0, 0),
}

const passingPose: RunPose = {
	bodyY: 0,
	bodyYaw: 0.025,
	hipsRoll: -0.025,
	hipsY: 0.015,
	hipsYaw: -0.025,
	leftArm: { elbow: 1.78, swing: -0.5 },
	leftLeg: leg(1.1, -0.4, 0.05, 0.03),
	rightArm: { elbow: 1.65, swing: -0.025 },
	rightLeg: leg(0.4, -1.7, 0.1, 0.4),
}

const pushPose: RunPose = {
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

const flightPose: RunPose = {
	bodyY: 0.018,
	bodyYaw: 0.085,
	hipsRoll: 0.035,
	hipsY: 0.3,
	hipsYaw: -0.1,
	leftArm: { elbow: 1.2, swing: 0.4 },
	leftLeg: leg(-0.56, -0.2, -0.24, 0.3),
	rightArm: { elbow: 1.65, swing: -0.13 },
	rightLeg: leg(1.3, -1, 0.12, 0.18),
}

function mirrorPose(pose: RunPose): RunPose {
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

const RUN_KEYFRAMES: ReadonlyArray<readonly [number, RunPose]> = [
	[0, contactPose],
	[0.125, passingPose],
	[0.208, pushPose],
	[0.33, flightPose],
	[0.5, mirrorPose(contactPose)],
	[0.625, mirrorPose(passingPose)],
	[0.708, mirrorPose(pushPose)],
	[0.83, mirrorPose(flightPose)],
	[1, contactPose],
]

const RUN_KEYFRAME_LABELS = [
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

export const RUN_KEYFRAME_MARKERS = RUN_KEYFRAMES.map(([progress], index) => ({
	label: RUN_KEYFRAME_LABELS[index] ?? `pose ${index + 1}`,
	progress,
}))

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

function sampleRunPose(progress: number): RunPose {
	const cycle = THREE.MathUtils.euclideanModulo(progress, 1)
	let poseIndex = 0
	while (
		poseIndex < RUN_KEYFRAMES.length - 2 &&
		cycle > RUN_KEYFRAMES[poseIndex + 1]![0]
	) {
		poseIndex += 1
	}
	const [fromTime, from] = RUN_KEYFRAMES[poseIndex]!
	const [toTime, to] = RUN_KEYFRAMES[poseIndex + 1]!
	const amount = smoothstep((cycle - fromTime) / (toTime - fromTime))
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

export function sampleRunAnimationPose(
	time: number,
	intensity: number,
	direction: RunDirection,
): PilotPose {
	const directionSign = direction === "backward" ? -1 : 1
	const progress = (time * 11 * directionSign) / (Math.PI * 2)
	const pose = sampleRunPose(progress)
	const strafe = direction === "left" ? -1 : direction === "right" ? 1 : 0
	const forward =
		direction === "forward" ? 1 : direction === "backward" ? -1 : 0
	return definePilotPose({
		body: {
			position: { y: pose.bodyY * intensity },
			rotation: {
				x: -forward * 0.1 * intensity,
				y: pose.bodyYaw * intensity,
				z: -strafe * 0.13 * intensity,
			},
		},
		head: {
			rotation: {
				y: -pose.bodyYaw * 0.34 * intensity,
				z: strafe * 0.04 * intensity,
			},
		},
		hips: {
			position: { y: 1.72 + pose.hipsY * intensity },
			rotation: {
				x: -0.55 * intensity,
				y: pose.hipsYaw * intensity,
				z: (pose.hipsRoll - strafe * 0.08) * intensity,
			},
		},
		leftArm: { rotation: { x: pose.leftArm.swing * intensity } },
		leftElbow: { rotation: { x: pose.leftArm.elbow * intensity } },
		leftFoot: { rotation: { x: pose.leftLeg.foot * intensity } },
		leftKnee: { rotation: { x: pose.leftLeg.knee * intensity } },
		leftLeg: {
			rotation: {
				x: pose.leftLeg.hip * intensity,
				z: strafe * 0.16 * intensity,
			},
		},
		leftShoulder: {
			rotation: { y: -0.6 * intensity, z: -0.6 * intensity },
		},
		leftToe: { rotation: { x: pose.leftLeg.toe * intensity } },
		neck: {
			rotation: {
				x: 0.55 * intensity,
				y: -pose.bodyYaw * 0.24 * intensity,
				z: strafe * 0.03 * intensity,
			},
		},
		rightArm: {
			rotation: { x: pose.rightArm.swing * 0.72 * intensity },
		},
		rightElbow: {
			rotation: { x: pose.rightArm.elbow * 0.88 * intensity },
		},
		rightFoot: { rotation: { x: pose.rightLeg.foot * intensity } },
		rightHand: { rotation: { x: -pose.bodyY * 0.4 * intensity } },
		rightKnee: { rotation: { x: pose.rightLeg.knee * intensity } },
		rightLeg: {
			rotation: {
				x: pose.rightLeg.hip * intensity,
				z: strafe * 0.16 * intensity,
			},
		},
		rightShoulder: {
			rotation: { y: 0.6 * intensity, z: 0.2 * intensity },
		},
		rightToe: { rotation: { x: pose.rightLeg.toe * intensity } },
		root: { rotation: { z: -strafe * 0.045 * intensity } },
	})
}

export function runAnimationLayer(
	time: number,
	intensity: number,
	direction: RunDirection,
): PilotAnimationLayer {
	return {
		fadeSeconds: 0.12,
		id: `locomotion:${direction}`,
		influence: RUN_INFLUENCE,
		mode: "override",
		pose: sampleRunAnimationPose(time, intensity, direction),
	}
}

export function applyRunAnimation(
	rig: PilotRig,
	time: number,
	intensity: number,
	direction: RunDirection,
): void {
	applyPilotPose(rig, sampleRunAnimationPose(time, intensity, direction))
}
