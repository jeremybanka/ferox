import * as THREE from "three"

import { JUMP_PHYSICS } from "../JumpPhysics.ts"
import {
	definePilotPose,
	type PilotAnimationLayer,
	type PilotJoint,
	type PilotPose,
} from "./PilotAnimation.ts"
import { sampleJumpAnimationPose } from "./JumpAnimation.ts"

export const TAKEOFF_DURATION_SECONDS = 0.18
export const DOUBLE_JUMP_BURST_SECONDS = 0.46
export const LANDING_PREP_SECONDS = 0.24
export const LANDING_RECOVERY_SECONDS = 0.32

export type AirborneMotion = {
	jumpCount: 1 | 2
	localVelocityX: number
	localVelocityZ: number
	verticalVelocity: number
}

type AirborneMomentum = Pick<
	AirborneMotion,
	"localVelocityX" | "localVelocityZ"
>

// const AIRBORNE_INFLUENCE = {
// 	body: 0.18,
// 	head: 0.12,
// 	hips: 0.5,
// 	leftArm: 0.18,
// 	leftElbow: 0.18,
// 	leftFoot: 1,
// 	leftHand: 0.12,
// 	leftKnee: 1,
// 	leftLeg: 1,
// 	leftShoulder: 0.22,
// 	leftToe: 1,
// 	neck: 0.16,
// 	rightArm: 0.18,
// 	rightElbow: 0.18,
// 	rightFoot: 1,
// 	rightHand: 0.12,
// 	rightKnee: 1,
// 	rightLeg: 1,
// 	rightShoulder: 0.22,
// 	rightToe: 1,
// 	root: 0.1,
// } as const satisfies PoseInfluence

// const TAKEOFF_INFLUENCE = {
// 	body: 0,
// 	head: -0.35,
// 	hips: 0,
// 	leftArm: 2,
// 	leftElbow: 1,
// 	leftFoot: 1.5,
// 	leftHand: 0.8,
// 	leftKnee: 1.5,
// 	leftLeg: 1.5,
// 	leftShoulder: 1,
// 	leftToe: 1.4,
// 	neck: 0.4,
// 	rightArm: 1,
// 	rightElbow: 1,
// 	rightFoot: 1.5,
// 	rightHand: 0.8,
// 	rightKnee: 1.5,
// 	rightLeg: 1.5,
// 	rightShoulder: 1,
// 	rightToe: 1.4,
// 	root: 0.1,
// } as const satisfies PoseInfluence

// const DOUBLE_JUMP_INFLUENCE = {
// 	body: 1.2,
// 	head: 0.16,
// 	hips: 1.6,
// 	leftArm: 0.32,
// 	leftElbow: 0.32,
// 	leftFoot: 1.6,
// 	leftHand: 0.2,
// 	leftKnee: 1.6,
// 	leftLeg: 1.6,
// 	leftShoulder: 0.36,
// 	leftToe: 1.5,
// 	neck: 0.2,
// 	rightArm: 0.32,
// 	rightElbow: 0.32,
// 	rightFoot: 1.6,
// 	rightHand: 0.2,
// 	rightKnee: 1.6,
// 	rightLeg: 1.6,
// 	rightShoulder: 0.36,
// 	rightToe: 1.5,
// 	root: 0.8,
// } as const satisfies PoseInfluence

// const LANDING_INFLUENCE = {
// 	body: 0.1,
// 	head: 0.3,
// 	hips: 0.2,
// 	leftArm: 0.8,
// 	leftElbow: 0.8,
// 	leftFoot: 1.7,
// 	leftHand: 0.65,
// 	leftKnee: 1.7,
// 	leftLeg: 1.7,
// 	leftShoulder: 0.8,
// 	leftToe: 1.5,
// 	neck: 0.35,
// 	rightArm: 0.8,
// 	rightElbow: 0.8,
// 	rightFoot: 1.7,
// 	rightHand: 0.65,
// 	rightKnee: 1.7,
// 	rightLeg: 1.7,
// 	rightShoulder: 0.8,
// 	rightToe: 1.5,
// 	root: 0.1,
// } as const satisfies PoseInfluence

function smoothstep(value: number): number {
	const clamped = THREE.MathUtils.clamp(value, 0, 1)
	return clamped * clamped * (3 - 2 * clamped)
}

function compensatedFoot(leg: number, knee: number, offset = 0): number {
	return -(leg + knee) + offset
}

function addPosePosition(
	pose: PilotPose,
	joint: PilotJoint,
	axis: "x" | "y" | "z",
	amount: number,
): void {
	const jointPose = (pose[joint] ??= {})
	const position = (jointPose.position ??= {})
	position[axis] = (position[axis] ?? 0) + amount
}

function addPoseRotation(
	pose: PilotPose,
	joint: PilotJoint,
	axis: "x" | "y" | "z",
	amount: number,
): void {
	const jointPose = (pose[joint] ??= {})
	const rotation = (jointPose.rotation ??= {})
	rotation[axis] = (rotation[axis] ?? 0) + amount
}

function jumpProgressFromMotion(motion: AirborneMotion): number {
	const launchVelocity =
		motion.jumpCount === 2
			? JUMP_PHYSICS.doubleJumpVelocity
			: JUMP_PHYSICS.jumpVelocity
	const rise = THREE.MathUtils.clamp(
		motion.verticalVelocity / launchVelocity,
		0,
		1,
	)
	const fall = THREE.MathUtils.clamp(-motion.verticalVelocity / 12, 0, 1)
	return rise > 0
		? THREE.MathUtils.lerp(0, 0.5, 1 - rise)
		: THREE.MathUtils.lerp(0.5, 1, fall)
}

function momentumFactors(motion?: AirborneMomentum): {
	forward: number
	speed: number
	strafe: number
} {
	if (motion === undefined) return { forward: 0, speed: 0, strafe: 0 }
	return {
		forward: THREE.MathUtils.clamp(-motion.localVelocityZ / 8, -1, 1),
		speed: THREE.MathUtils.clamp(
			Math.hypot(motion.localVelocityX, motion.localVelocityZ) / 8,
			0,
			1,
		),
		strafe: THREE.MathUtils.clamp(motion.localVelocityX / 8, -1, 1),
	}
}

export function sampleAirbornePose(motion: AirborneMotion): PilotPose {
	const launchVelocity =
		motion.jumpCount === 2
			? JUMP_PHYSICS.doubleJumpVelocity
			: JUMP_PHYSICS.jumpVelocity
	const rise = THREE.MathUtils.clamp(
		motion.verticalVelocity / launchVelocity,
		0,
		1,
	)
	const fall = THREE.MathUtils.clamp(-motion.verticalVelocity / 12, 0, 1)
	const apex = 1 - Math.max(rise, fall)
	const { forward, speed, strafe } = momentumFactors(motion)
	const forwardMomentum = forward * speed
	const pose = sampleJumpAnimationPose(jumpProgressFromMotion(motion))
	const legSweep = forwardMomentum * (-rise * 0.34 - apex * 0.12 + fall * 0.24)
	const legSplit =
		forwardMomentum * (0.38 + rise * 0.08 + apex * 0.18 + fall * 0.2)
	const leftLegDelta = strafe * 0.035 + legSweep + legSplit
	const rightLegDelta = -strafe * 0.035 + legSweep - legSplit
	const momentumTuck = Math.abs(forwardMomentum) * (0.1 + apex * 0.18)
	const leftKneeDelta = -momentumTuck - Math.abs(forwardMomentum) * fall * 0.22
	const rightKneeDelta =
		-momentumTuck * 0.42 + Math.abs(forwardMomentum) * (0.12 + apex * 0.12)
	const freeArmPinwheel =
		forwardMomentum * (-rise * 0.34 + apex * 0.12 + fall * 0.42)

	addPosePosition(pose, "body", "z", forwardMomentum * (0.03 + apex * 0.035))
	addPoseRotation(pose, "body", "x", -forwardMomentum * (0.22 + speed * 0.1))
	addPoseRotation(pose, "body", "y", -strafe * 0.04)
	addPoseRotation(pose, "body", "z", -strafe * (0.11 + speed * 0.04))
	addPoseRotation(pose, "head", "z", strafe * 0.025)
	addPoseRotation(pose, "hips", "x", -forwardMomentum * 0.12)
	addPoseRotation(pose, "hips", "y", -strafe * 0.055)
	addPoseRotation(pose, "hips", "z", -strafe * 0.075)
	addPoseRotation(
		pose,
		"leftArm",
		"x",
		-forwardMomentum * 0.16 + freeArmPinwheel,
	)
	addPoseRotation(pose, "leftFoot", "x", -(leftLegDelta + leftKneeDelta))
	addPoseRotation(pose, "leftFoot", "z", strafe * 0.045)
	addPoseRotation(pose, "leftKnee", "x", leftKneeDelta)
	addPoseRotation(pose, "leftLeg", "x", leftLegDelta)
	addPoseRotation(pose, "leftLeg", "y", strafe * 0.045)
	addPoseRotation(pose, "leftLeg", "z", -strafe * 0.04)
	addPoseRotation(
		pose,
		"leftShoulder",
		"x",
		-forwardMomentum * 0.14 + freeArmPinwheel * 0.72,
	)
	addPoseRotation(pose, "leftShoulder", "z", -freeArmPinwheel * 0.12)
	addPoseRotation(pose, "neck", "z", strafe * 0.018)
	addPoseRotation(pose, "rightArm", "x", -forwardMomentum * 0.12)
	addPoseRotation(pose, "rightFoot", "x", -(rightLegDelta + rightKneeDelta))
	addPoseRotation(pose, "rightFoot", "z", strafe * 0.045)
	addPoseRotation(pose, "rightKnee", "x", rightKneeDelta)
	addPoseRotation(pose, "rightLeg", "x", rightLegDelta)
	addPoseRotation(pose, "rightLeg", "y", -strafe * 0.045)
	addPoseRotation(pose, "rightLeg", "z", -strafe * 0.04)
	addPoseRotation(pose, "rightShoulder", "x", -forwardMomentum * 0.11)
	addPoseRotation(pose, "root", "x", -forwardMomentum * 0.08)
	addPoseRotation(pose, "root", "z", -strafe * (0.045 + speed * 0.025))
	return pose
}

export function airborneAnimationLayer(
	motion: AirborneMotion,
): PilotAnimationLayer {
	return {
		fadeSeconds: 0.08,
		id: "locomotion:airborne",
		// influence: AIRBORNE_INFLUENCE,
		mode: "override",
		pose: sampleAirbornePose(motion),
	}
}

export function takeoffAnimationLayer(
	elapsed: number,
	motion?: AirborneMomentum,
): PilotAnimationLayer {
	const progress = smoothstep(elapsed / TAKEOFF_DURATION_SECONDS)
	const { forward, speed, strafe } = momentumFactors(motion)
	const forwardMomentum = forward * speed
	const pose = sampleJumpAnimationPose(progress * 0.2)
	const leftLegDelta = -forwardMomentum * 0.14 * progress
	const rightLegDelta = -forwardMomentum * 0.3 * progress
	addPoseRotation(pose, "body", "x", -forwardMomentum * 0.24 * progress)
	addPoseRotation(pose, "body", "z", -strafe * 0.1 * progress)
	addPoseRotation(pose, "hips", "x", -forwardMomentum * 0.1 * progress)
	addPoseRotation(pose, "hips", "z", -strafe * 0.06 * progress)
	addPoseRotation(pose, "leftFoot", "x", -leftLegDelta)
	addPoseRotation(pose, "leftLeg", "x", leftLegDelta)
	addPoseRotation(pose, "leftLeg", "z", -strafe * 0.04)
	addPoseRotation(pose, "rightFoot", "x", -rightLegDelta)
	addPoseRotation(pose, "rightLeg", "x", rightLegDelta)
	addPoseRotation(pose, "rightLeg", "z", -strafe * 0.04)
	addPoseRotation(pose, "root", "x", -forwardMomentum * 0.07 * progress)
	addPoseRotation(pose, "root", "z", -strafe * 0.045 * progress)
	return {
		fadeSeconds: 0,
		id: "transient:takeoff",
		// influence: TAKEOFF_INFLUENCE,
		mode: "override",
		pose,
	}
}

export function doubleJumpBurstLayer(
	elapsed: number,
	motion?: AirborneMomentum,
): PilotAnimationLayer {
	const phase = THREE.MathUtils.clamp(elapsed / DOUBLE_JUMP_BURST_SECONDS, 0, 1)
	const boost = Math.sin(phase * Math.PI)
	const tuck = smoothstep(Math.min(1, phase * 2))
	const open = smoothstep(Math.max(0, phase * 2 - 1))
	const amount = tuck * (1 - open)
	const { forward, speed, strafe } = momentumFactors(motion)
	const forwardMomentum = forward * speed
	const leapSplit = forwardMomentum * (0.26 + boost * 0.12 + open * 0.28)
	const freeArmPinwheel =
		forwardMomentum * THREE.MathUtils.lerp(-0.24, 0.34, smoothstep(phase))
	const leftLeg =
		THREE.MathUtils.lerp(-0.38, -0.82, amount) -
		forwardMomentum * 0.22 +
		leapSplit
	const rightLeg =
		THREE.MathUtils.lerp(-0.3, -1.08, amount) -
		forwardMomentum * 0.3 -
		leapSplit
	const leftKnee = THREE.MathUtils.lerp(-0.58, -1.42, amount)
	const rightKnee =
		THREE.MathUtils.lerp(-0.62, -1.52, amount) +
		Math.abs(forwardMomentum) * (0.12 + open * 0.22)

	return {
		fadeSeconds: 0.06,
		id: "transient:double-jump",
		// influence: DOUBLE_JUMP_INFLUENCE,
		mode: "override",
		pose: definePilotPose({
			body: {
				position: { z: -boost * 0.08 + forwardMomentum * 0.045 },
				rotation: {
					x: 0.1 - boost * 0.16 - forwardMomentum * (0.22 + boost * 0.08),
					y: boost * 0.3 - strafe * 0.06,
					z: boost * 0.08 - strafe * 0.14,
				},
			},
			head: { rotation: { x: boost * 0.05, y: -boost * 0.06 } },
			hips: {
				position: { y: 1.68 + boost * 0.1, z: boost * 0.045 },
				rotation: {
					x: 0.04 - boost * 0.14 - forwardMomentum * 0.12,
					y: -boost * 0.38 - strafe * 0.04,
					z: -boost * 0.07 - strafe * 0.1,
				},
			},
			leftArm: {
				rotation: {
					x: -0.4 - amount * 0.58 - forwardMomentum * 0.18 + freeArmPinwheel,
					z: -0.16,
				},
			},
			leftElbow: { rotation: { x: 0.58 + amount * 0.92, y: amount * 0.24 } },
			leftFoot: {
				rotation: { x: compensatedFoot(leftLeg, leftKnee, -boost * 0.1) },
			},
			leftKnee: { rotation: { x: leftKnee } },
			leftLeg: { rotation: { x: leftLeg, y: amount * 0.25, z: -0.25 } },
			leftShoulder: {
				rotation: {
					x:
						-0.18 -
						amount * 0.55 -
						forwardMomentum * 0.14 +
						freeArmPinwheel * 0.72,
					z: -0.8 - freeArmPinwheel * 0.12,
				},
			},
			leftToe: { rotation: { x: 0.06 + amount * 0.28 } },
			neck: { rotation: { x: boost * 0.035, y: -boost * 0.045 } },
			rightArm: {
				rotation: {
					x: -0.34 - amount * 0.48 - forwardMomentum * 0.14,
					z: 0.12,
				},
			},
			rightElbow: {
				rotation: { x: 0.62 + amount * 0.72, y: -amount * 0.2 },
			},
			rightFoot: {
				rotation: { x: compensatedFoot(rightLeg, rightKnee, -boost * 0.08) },
			},
			rightKnee: { rotation: { x: rightKnee } },
			rightLeg: { rotation: { x: rightLeg, y: -amount * 0.22, z: 0.25 } },
			rightShoulder: {
				rotation: {
					x: -0.12 + amount * 0.26 - forwardMomentum * 0.12,
					z: 0.7,
				},
			},
			rightToe: { rotation: { x: 0.06 + amount * 0.32 } },
			root: {
				rotation: {
					x: -0.04 + boost * 0.1 - forwardMomentum * 0.1,
					z: 0.02 + boost * 0.12 - strafe * 0.08,
				},
			},
		}),
	}
}

export function landingPreparationLayer(
	weight: number,
	impactVelocity: number,
	motion?: AirborneMomentum,
): PilotAnimationLayer {
	const progress = THREE.MathUtils.clamp(weight, 0, 1)
	const impact = THREE.MathUtils.clamp(impactVelocity / 12, 0, 1)
	const { forward, speed, strafe } = momentumFactors(motion)
	const forwardMomentum = forward * speed
	const pose = sampleJumpAnimationPose(THREE.MathUtils.lerp(0.7, 1, progress))
	const leftLegDelta = forwardMomentum * 0.38
	const rightLegDelta = -forwardMomentum * 0.3
	const leftKneeDelta = -Math.abs(forwardMomentum) * 0.16
	const rightKneeDelta = Math.abs(forwardMomentum) * 0.26
	addPoseRotation(pose, "body", "x", impact * 0.08 - forwardMomentum * 0.12)
	addPoseRotation(pose, "body", "z", -strafe * 0.08)
	addPosePosition(pose, "hips", "y", -impact * 0.08)
	addPoseRotation(pose, "hips", "x", -impact * 0.08 - forwardMomentum * 0.06)
	addPoseRotation(pose, "hips", "z", -strafe * 0.06)
	addPoseRotation(pose, "leftFoot", "x", -(leftLegDelta + leftKneeDelta))
	addPoseRotation(pose, "leftKnee", "x", leftKneeDelta)
	addPoseRotation(pose, "leftLeg", "x", leftLegDelta)
	addPoseRotation(pose, "leftLeg", "z", -strafe * 0.04)
	addPoseRotation(pose, "leftToe", "x", impact * 0.08)
	addPoseRotation(pose, "rightFoot", "x", -(rightLegDelta + rightKneeDelta))
	addPoseRotation(pose, "rightKnee", "x", rightKneeDelta)
	addPoseRotation(pose, "rightLeg", "x", rightLegDelta)
	addPoseRotation(pose, "rightLeg", "z", -strafe * 0.04)
	addPoseRotation(pose, "rightToe", "x", impact * 0.08)
	return {
		fadeSeconds: 0.04,
		id: "transient:landing-prep",
		// influence: LANDING_INFLUENCE,
		mode: "override",
		pose,
		weight: progress,
	}
}

export function landingRecoveryLayer(
	elapsed: number,
	impactVelocity: number,
): PilotAnimationLayer {
	const progress = smoothstep(elapsed / LANDING_RECOVERY_SECONDS)
	const weight = 1 - progress
	const impact = THREE.MathUtils.clamp(impactVelocity / 12, 0, 1)
	const pose = sampleJumpAnimationPose(1)
	addPosePosition(pose, "body", "y", -weight * impact * 0.04)
	addPoseRotation(pose, "body", "x", weight * impact * 0.08)
	addPosePosition(pose, "hips", "y", -weight * impact * 0.08)
	addPoseRotation(pose, "hips", "x", -weight * impact * 0.08)
	const kneeDelta = -weight * impact * 0.28
	addPoseRotation(pose, "leftFoot", "x", -kneeDelta)
	addPoseRotation(pose, "leftKnee", "x", kneeDelta)
	addPoseRotation(pose, "leftToe", "x", weight * impact * 0.1)
	addPoseRotation(pose, "rightFoot", "x", -kneeDelta * 0.96)
	addPoseRotation(pose, "rightKnee", "x", kneeDelta * 0.96)
	addPoseRotation(pose, "rightToe", "x", weight * impact * 0.1)
	return {
		fadeSeconds: 0,
		id: "transient:landing-impact",
		// influence: LANDING_INFLUENCE,
		mode: "override",
		pose,
		weight,
	}
}
