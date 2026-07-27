import * as THREE from "three"

import { alignBlasterHand } from "./BlasterPose.ts"
import type { PilotRig } from "./PilotModel.ts"

export type RunDirection = "backward" | "forward" | "left" | "right"

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

function leg(
	hip: number,
	knee: number,
	worldFootAngle: number,
	toe: number,
): LegPose {
	return {
		foot: worldFootAngle - hip - knee,
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
	leftArm: { elbow: 0.62, swing: -0.42 },
	leftLeg: leg(0.62, -0.58, 0, 0),
	rightArm: { elbow: 0.48, swing: 0.14 },
	rightLeg: leg(-0.5, -0.54, -0.34, 0.28),
}

const compressionPose: RunPose = {
	bodyY: -0.035,
	bodyYaw: -0.045,
	hipsRoll: -0.055,
	hipsY: -0.08,
	hipsYaw: 0.055,
	leftArm: { elbow: 0.7, swing: -0.28 },
	leftLeg: leg(0.38, -1.05, 0, 0.05),
	rightArm: { elbow: 0.52, swing: 0.09 },
	rightLeg: leg(-0.28, -1.02, -0.18, 0.34),
}

const passingPose: RunPose = {
	bodyY: 0,
	bodyYaw: 0.025,
	hipsRoll: -0.025,
	hipsY: 0.015,
	hipsYaw: -0.025,
	leftArm: { elbow: 0.78, swing: 0.04 },
	leftLeg: leg(-0.18, -0.4, 0, 0.03),
	rightArm: { elbow: 0.5, swing: -0.025 },
	rightLeg: leg(0.2, -1.2, 0.1, 0.4),
}

const flightPose: RunPose = {
	bodyY: 0.018,
	bodyYaw: 0.085,
	hipsRoll: 0.035,
	hipsY: 0.3,
	hipsYaw: -0.1,
	leftArm: { elbow: 0.68, swing: 0.38 },
	leftLeg: leg(-0.56, -0.66, -0.24, 0.3),
	rightArm: { elbow: 0.46, swing: -0.13 },
	rightLeg: leg(0.5, -0.7, 0.12, 0.18),
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
	[0.125, compressionPose],
	[0.25, passingPose],
	[0.375, flightPose],
	[0.5, mirrorPose(contactPose)],
	[0.625, mirrorPose(compressionPose)],
	[0.75, mirrorPose(passingPose)],
	[0.875, mirrorPose(flightPose)],
	[1, contactPose],
]

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

function applyLegPose(
	rig: PilotRig,
	side: "left" | "right",
	pose: LegPose,
	intensity: number,
): void {
	const legRig = side === "left" ? rig.leftLeg : rig.rightLeg
	const kneeRig = side === "left" ? rig.leftKnee : rig.rightKnee
	const footRig = side === "left" ? rig.leftFoot : rig.rightFoot
	const toeRig = side === "left" ? rig.leftToe : rig.rightToe
	legRig.rotation.x = pose.hip * intensity
	kneeRig.rotation.x = pose.knee * intensity
	footRig.rotation.x = pose.foot * intensity
	toeRig.rotation.x = pose.toe * intensity
}

export function applyRunAnimation(
	rig: PilotRig,
	time: number,
	intensity: number,
	direction: RunDirection,
): void {
	const directionSign = direction === "backward" ? -1 : 1
	const progress = (time * 11 * directionSign) / (Math.PI * 2)
	const pose = sampleRunPose(progress)
	const strafe = direction === "left" ? -1 : direction === "right" ? 1 : 0
	const forward =
		direction === "forward" ? 1 : direction === "backward" ? -1 : 0

	applyLegPose(rig, "left", pose.leftLeg, intensity)
	applyLegPose(rig, "right", pose.rightLeg, intensity)
	rig.leftArm.rotation.x = pose.leftArm.swing * intensity
	rig.rightArm.rotation.x = pose.rightArm.swing * 0.72 * intensity
	rig.leftElbow.rotation.x = pose.leftArm.elbow * intensity
	rig.rightElbow.rotation.x = pose.rightArm.elbow * 0.88 * intensity

	rig.hips.position.y = 1.72 + pose.hipsY * intensity
	rig.hips.rotation.y = pose.hipsYaw * intensity
	rig.hips.rotation.z = (pose.hipsRoll - strafe * 0.08) * intensity
	rig.body.position.y = pose.bodyY * intensity
	rig.body.rotation.x = -forward * 0.15 * intensity
	rig.body.rotation.y = pose.bodyYaw * intensity
	rig.body.rotation.z = -strafe * 0.13 * intensity

	// The shoulders arrive a fraction behind the pelvis, while the head
	// stabilizes toward travel direction instead of following the pendulum.
	rig.leftShoulder.rotation.y = -pose.bodyYaw * 0.38 * intensity
	rig.rightShoulder.rotation.y = -pose.bodyYaw * 0.3 * intensity
	rig.neck.rotation.y = -pose.bodyYaw * 0.24 * intensity
	rig.head.rotation.y = -pose.bodyYaw * 0.34 * intensity
	rig.neck.rotation.z = strafe * 0.03 * intensity
	rig.head.rotation.z = strafe * 0.04 * intensity
	rig.root.rotation.z = -strafe * 0.045 * intensity

	if (strafe !== 0) {
		rig.leftLeg.rotation.z = strafe * 0.16 * intensity
		rig.rightLeg.rotation.z = strafe * 0.16 * intensity
	}

	alignBlasterHand(rig, -pose.bodyY * 0.4 * intensity)
}
