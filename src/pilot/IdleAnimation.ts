import {
	definePilotPose,
	type PilotAnimationLayer,
	type PilotPose,
	type PoseInfluence,
} from "./PilotAnimation.ts"

export const IDLE_DURATION_SECONDS = 2.8

const IDLE_INFLUENCE = {
	body: 0.58,
	head: 0.16,
	hips: 1,
	leftArm: 0.22,
	leftElbow: 0.22,
	leftFoot: 1,
	leftHand: 0.18,
	leftKnee: 1,
	leftLeg: 1,
	leftShoulder: 0.22,
	leftToe: 0.8,
	neck: 0.24,
	rightArm: 0.22,
	rightElbow: 0.22,
	rightFoot: 1,
	rightHand: 0.18,
	rightKnee: 1,
	rightLeg: 1,
	rightShoulder: 0.22,
	rightToe: 0.8,
	root: 1,
} as const satisfies PoseInfluence

export function sampleIdleAnimationPose(time: number): PilotPose {
	const phase = (time / IDLE_DURATION_SECONDS) * Math.PI * 2
	const breath = Math.sin(phase)
	const settle = 0.5 - Math.cos(phase) * 0.5
	const sway = Math.sin(phase + Math.PI * 0.35)

	return definePilotPose({
		body: {
			position: { y: breath * 0.006 },
			rotation: { x: -0.035, y: sway * 0.012, z: sway * 0.006 },
		},
		head: { rotation: { y: -sway * 0.014, z: -sway * 0.004 } },
		hips: { rotation: { x: -0.018, y: -sway * 0.01, z: -sway * 0.005 } },
		leftArm: { rotation: { x: 0.12, z: -0.08 } },
		leftElbow: {
			rotation: { x: 0.52 + breath * 0.014, y: 0 },
		},
		leftFoot: { rotation: { x: 0.14, z: 0.025 } },
		leftHand: { rotation: { x: 0.1, z: -0.04 } },
		leftKnee: { rotation: { x: -0.28 - sway * 0.008 } },
		leftLeg: {
			rotation: { x: 0.14 + sway * 0.006, z: -0.055 },
		},
		leftShoulder: { rotation: { x: -0.35 + sway * 0.01, y: -0.1, z: -0.12 } },
		leftToe: { rotation: { x: 0.025 } },
		neck: { rotation: { y: -sway * 0.009, z: -sway * 0.003 } },
		rightArm: { rotation: { x: 0.14, z: 0.06 } },
		rightElbow: {
			rotation: { x: 0.56 - breath * 0.012, z: 0.055 },
		},
		rightFoot: { rotation: { x: 0.14, z: -0.025 } },
		rightHand: { rotation: { x: 0.12, z: 0.025 } },
		rightKnee: { rotation: { x: -0.28 + sway * 0.008 } },
		rightLeg: {
			rotation: { x: 0.14 - sway * 0.006, z: 0.055 },
		},
		rightShoulder: { rotation: { x: -0.1, y: 1.1, z: 0.3 } },
		rightToe: { rotation: { x: 0.025 } },
		root: { position: { y: -0.025 + settle * 0.012 } },
	})
}

export function idleAnimationLayer(time: number): PilotAnimationLayer {
	return {
		fadeSeconds: 0.18,
		id: "draft:idle",
		influence: IDLE_INFLUENCE,
		mode: "override",
		pose: sampleIdleAnimationPose(time),
	}
}
