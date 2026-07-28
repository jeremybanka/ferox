import * as THREE from "three"

import {
	definePilotPose,
	type PilotAnimationLayer,
	type PilotPose,
	type PoseInfluence,
} from "./PilotAnimation.ts"

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

const AIRBORNE_INFLUENCE = {
	body: 0.78,
	head: 0.12,
	hips: 1,
	leftArm: 0.18,
	leftElbow: 0.18,
	leftFoot: 1,
	leftHand: 0.12,
	leftKnee: 1,
	leftLeg: 1,
	leftShoulder: 0.22,
	leftToe: 1,
	neck: 0.16,
	rightArm: 0.18,
	rightElbow: 0.18,
	rightFoot: 1,
	rightHand: 0.12,
	rightKnee: 1,
	rightLeg: 1,
	rightShoulder: 0.22,
	rightToe: 1,
	root: 0.4,
} as const satisfies PoseInfluence

const TAKEOFF_INFLUENCE = {
	body: 0.9,
	hips: 1.5,
	leftFoot: 1.5,
	leftKnee: 1.5,
	leftLeg: 1.5,
	leftToe: 1.4,
	rightFoot: 1.5,
	rightKnee: 1.5,
	rightLeg: 1.5,
	rightToe: 1.4,
} as const satisfies PoseInfluence

const DOUBLE_JUMP_INFLUENCE = {
	body: 1.2,
	head: 0.16,
	hips: 1.6,
	leftArm: 0.32,
	leftElbow: 0.32,
	leftFoot: 1.6,
	leftHand: 0.2,
	leftKnee: 1.6,
	leftLeg: 1.6,
	leftShoulder: 0.36,
	leftToe: 1.5,
	neck: 0.2,
	rightArm: 0.32,
	rightElbow: 0.32,
	rightFoot: 1.6,
	rightHand: 0.2,
	rightKnee: 1.6,
	rightLeg: 1.6,
	rightShoulder: 0.36,
	rightToe: 1.5,
	root: 0.8,
} as const satisfies PoseInfluence

const LANDING_INFLUENCE = {
	body: 0.86,
	hips: 1.7,
	leftFoot: 1.7,
	leftKnee: 1.7,
	leftLeg: 1.7,
	leftToe: 1.5,
	rightFoot: 1.7,
	rightKnee: 1.7,
	rightLeg: 1.7,
	rightToe: 1.5,
	root: 0.7,
} as const satisfies PoseInfluence

function smoothstep(value: number): number {
	const clamped = THREE.MathUtils.clamp(value, 0, 1)
	return clamped * clamped * (3 - 2 * clamped)
}

function compensatedFoot(leg: number, knee: number, offset = 0): number {
	return -(leg + knee) + offset
}

export function sampleAirbornePose(motion: AirborneMotion): PilotPose {
	const launchVelocity = motion.jumpCount === 2 ? 9.4 : 10.6
	const rise = THREE.MathUtils.clamp(
		motion.verticalVelocity / launchVelocity,
		0,
		1,
	)
	const fall = THREE.MathUtils.clamp(-motion.verticalVelocity / 12, 0, 1)
	const apex = 1 - Math.max(rise, fall)
	const strafe = THREE.MathUtils.clamp(motion.localVelocityX / 8, -1, 1)
	const forward = THREE.MathUtils.clamp(-motion.localVelocityZ / 8, -1, 1)
	const leftLeg = 0.08 + apex * 0.28 + fall * 0.24 + strafe * 0.035
	const rightLeg = 0.1 + apex * 0.24 + fall * 0.28 - strafe * 0.035
	const leftKnee = -0.22 - apex * 0.58 - fall * 0.4
	const rightKnee = -0.24 - apex * 0.62 - fall * 0.42

	return definePilotPose({
		body: {
			rotation: {
				x: -rise * 0.08 + fall * 0.12 - forward * 0.12,
				y: -strafe * 0.04,
				z: -strafe * 0.11,
			},
		},
		head: {
			rotation: {
				x: rise * 0.025 - fall * 0.04,
				z: strafe * 0.025,
			},
		},
		hips: {
			position: { y: 1.68 + rise * 0.05 - fall * 0.055 },
			rotation: {
				x: rise * 0.06 - fall * 0.11 - forward * 0.045,
				y: -strafe * 0.055,
				z: -strafe * 0.075,
			},
		},
		leftArm: { rotation: { x: -rise * 0.12 + fall * 0.1 } },
		leftElbow: { rotation: { x: 0.24 + apex * 0.32 + fall * 0.1 } },
		leftFoot: {
			rotation: {
				x: compensatedFoot(leftLeg, leftKnee, -rise * 0.06),
				z: strafe * 0.045,
			},
		},
		leftHand: { rotation: { x: apex * 0.06 } },
		leftKnee: { rotation: { x: leftKnee } },
		leftLeg: {
			rotation: { x: leftLeg, y: strafe * 0.045, z: -0.04 - strafe * 0.04 },
		},
		leftShoulder: {
			rotation: { x: -rise * 0.1 + fall * 0.12, z: -0.1 - apex * 0.08 },
		},
		leftToe: { rotation: { x: fall * 0.12 } },
		neck: {
			rotation: {
				x: rise * 0.018 - fall * 0.025,
				z: strafe * 0.018,
			},
		},
		rightArm: { rotation: { x: -rise * 0.08 + fall * 0.08 } },
		rightElbow: { rotation: { x: 0.2 + apex * 0.26 + fall * 0.08 } },
		rightFoot: {
			rotation: {
				x: compensatedFoot(rightLeg, rightKnee, -rise * 0.05),
				z: strafe * 0.045,
			},
		},
		rightHand: { rotation: { x: apex * 0.05 } },
		rightKnee: { rotation: { x: rightKnee } },
		rightLeg: {
			rotation: {
				x: rightLeg,
				y: -strafe * 0.045,
				z: 0.04 - strafe * 0.04,
			},
		},
		rightShoulder: {
			rotation: { x: -rise * 0.08 + fall * 0.1, z: 0.1 + apex * 0.07 },
		},
		rightToe: { rotation: { x: fall * 0.12 } },
		root: { rotation: { x: -forward * 0.035, z: -strafe * 0.045 } },
	})
}

export function airborneAnimationLayer(
	motion: AirborneMotion,
): PilotAnimationLayer {
	return {
		fadeSeconds: 0.08,
		id: "locomotion:airborne",
		influence: AIRBORNE_INFLUENCE,
		mode: "override",
		pose: sampleAirbornePose(motion),
	}
}

export function takeoffAnimationLayer(elapsed: number): PilotAnimationLayer {
	const progress = smoothstep(elapsed / TAKEOFF_DURATION_SECONDS)
	const leg = THREE.MathUtils.lerp(0.58, -0.2, progress)
	const knee = THREE.MathUtils.lerp(-1.08, -0.18, progress)
	return {
		fadeSeconds: 0,
		id: "transient:takeoff",
		influence: TAKEOFF_INFLUENCE,
		mode: "override",
		pose: definePilotPose({
			body: { rotation: { x: THREE.MathUtils.lerp(0.16, -0.08, progress) } },
			hips: {
				position: { y: THREE.MathUtils.lerp(1.55, 1.74, progress) },
				rotation: { x: THREE.MathUtils.lerp(-0.12, 0.08, progress) },
			},
			leftFoot: { rotation: { x: compensatedFoot(leg, knee, 0.04) } },
			leftKnee: { rotation: { x: knee } },
			leftLeg: { rotation: { x: leg, z: -0.06 } },
			leftToe: { rotation: { x: THREE.MathUtils.lerp(0.18, 0, progress) } },
			rightFoot: {
				rotation: { x: compensatedFoot(leg * 0.94, knee * 0.94, 0.04) },
			},
			rightKnee: { rotation: { x: knee * 0.94 } },
			rightLeg: { rotation: { x: leg * 0.94, z: 0.06 } },
			rightToe: { rotation: { x: THREE.MathUtils.lerp(0.16, 0, progress) } },
		}),
	}
}

export function doubleJumpBurstLayer(elapsed: number): PilotAnimationLayer {
	const phase = THREE.MathUtils.clamp(
		elapsed / DOUBLE_JUMP_BURST_SECONDS,
		0,
		1,
	)
	const boost = Math.sin(phase * Math.PI)
	const tuck = smoothstep(Math.min(1, phase * 2))
	const open = smoothstep(Math.max(0, phase * 2 - 1))
	const amount = tuck * (1 - open)
	const leftLeg = THREE.MathUtils.lerp(-0.38, -0.82, amount)
	const rightLeg = THREE.MathUtils.lerp(-0.3, -1.08, amount)
	const leftKnee = THREE.MathUtils.lerp(-0.58, -1.42, amount)
	const rightKnee = THREE.MathUtils.lerp(-0.62, -1.52, amount)

	return {
		fadeSeconds: 0.06,
		id: "transient:double-jump",
		influence: DOUBLE_JUMP_INFLUENCE,
		mode: "override",
		pose: definePilotPose({
			body: {
				position: { z: -boost * 0.08 },
				rotation: { x: 0.1 - boost * 0.16, y: boost * 0.3, z: boost * 0.08 },
			},
			head: { rotation: { x: boost * 0.05, y: -boost * 0.06 } },
			hips: {
				position: { y: 1.68 + boost * 0.1, z: boost * 0.045 },
				rotation: {
					x: 0.04 - boost * 0.14,
					y: -boost * 0.38,
					z: -boost * 0.07,
				},
			},
			leftArm: { rotation: { x: -0.4 - amount * 0.58, z: -0.16 } },
			leftElbow: { rotation: { x: 0.58 + amount * 0.92, y: amount * 0.24 } },
			leftFoot: {
				rotation: { x: compensatedFoot(leftLeg, leftKnee, -boost * 0.1) },
			},
			leftKnee: { rotation: { x: leftKnee } },
			leftLeg: { rotation: { x: leftLeg, y: amount * 0.25, z: -0.25 } },
			leftShoulder: { rotation: { x: -0.18 - amount * 0.55, z: -0.8 } },
			leftToe: { rotation: { x: 0.06 + amount * 0.28 } },
			neck: { rotation: { x: boost * 0.035, y: -boost * 0.045 } },
			rightArm: { rotation: { x: -0.34 - amount * 0.48, z: 0.12 } },
			rightElbow: {
				rotation: { x: 0.62 + amount * 0.72, y: -amount * 0.2 },
			},
			rightFoot: {
				rotation: { x: compensatedFoot(rightLeg, rightKnee, -boost * 0.08) },
			},
			rightKnee: { rotation: { x: rightKnee } },
			rightLeg: { rotation: { x: rightLeg, y: -amount * 0.22, z: 0.25 } },
			rightShoulder: { rotation: { x: -0.12 + amount * 0.26, z: 0.7 } },
			rightToe: { rotation: { x: 0.06 + amount * 0.32 } },
			root: { rotation: { x: -0.04 + boost * 0.1, z: 0.02 + boost * 0.12 } },
		}),
	}
}

export function landingPreparationLayer(
	weight: number,
	impactVelocity: number,
): PilotAnimationLayer {
	const impact = THREE.MathUtils.clamp(impactVelocity / 12, 0, 1)
	const leg = 0.42 + impact * 0.18
	const knee = -0.92 - impact * 0.3
	return {
		fadeSeconds: 0.04,
		id: "transient:landing-prep",
		influence: LANDING_INFLUENCE,
		mode: "override",
		pose: definePilotPose({
			body: { rotation: { x: 0.08 + impact * 0.08 } },
			hips: {
				position: { y: 1.62 - impact * 0.08 },
				rotation: { x: -0.08 - impact * 0.08 },
			},
			leftFoot: { rotation: { x: compensatedFoot(leg, knee, 0.04) } },
			leftKnee: { rotation: { x: knee } },
			leftLeg: { rotation: { x: leg, z: -0.07 } },
			leftToe: { rotation: { x: 0.12 + impact * 0.08 } },
			rightFoot: {
				rotation: { x: compensatedFoot(leg * 0.96, knee * 0.96, 0.04) },
			},
			rightKnee: { rotation: { x: knee * 0.96 } },
			rightLeg: { rotation: { x: leg * 0.96, z: 0.07 } },
			rightToe: { rotation: { x: 0.1 + impact * 0.08 } },
		}),
		weight: THREE.MathUtils.clamp(weight, 0, 1),
	}
}

export function landingRecoveryLayer(
	elapsed: number,
	impactVelocity: number,
): PilotAnimationLayer {
	const progress = smoothstep(elapsed / LANDING_RECOVERY_SECONDS)
	const weight = 1 - progress
	const impact = THREE.MathUtils.clamp(impactVelocity / 12, 0, 1)
	const leg = THREE.MathUtils.lerp(0.54 + impact * 0.12, 0.14, progress)
	const knee = THREE.MathUtils.lerp(-1.04 - impact * 0.28, -0.28, progress)
	return {
		fadeSeconds: 0,
		id: "transient:landing-impact",
		influence: LANDING_INFLUENCE,
		mode: "override",
		pose: definePilotPose({
			body: {
				position: { y: -weight * impact * 0.04 },
				rotation: { x: weight * (0.12 + impact * 0.08) },
			},
			hips: {
				position: { y: THREE.MathUtils.lerp(1.55 - impact * 0.08, 1.7, progress) },
				rotation: { x: -weight * (0.1 + impact * 0.08) },
			},
			leftFoot: { rotation: { x: compensatedFoot(leg, knee, 0.06 * weight) } },
			leftKnee: { rotation: { x: knee } },
			leftLeg: { rotation: { x: leg, z: -0.055 } },
			leftToe: { rotation: { x: weight * (0.12 + impact * 0.1) } },
			rightFoot: {
				rotation: { x: compensatedFoot(leg * 0.96, knee * 0.96, 0.05 * weight) },
			},
			rightKnee: { rotation: { x: knee * 0.96 } },
			rightLeg: { rotation: { x: leg * 0.96, z: 0.055 } },
			rightToe: { rotation: { x: weight * (0.1 + impact * 0.1) } },
		}),
		weight,
	}
}
