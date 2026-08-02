import {
	definePilotPose,
	type PilotAnimationLayer,
	type PilotPose,
	type PoseInfluence,
} from "./PilotAnimation.ts"

export const PUNCH_DURATION_SECONDS = 0.62
export const PUNCH_ACTIVE_START_SECONDS = 0.12
export const PUNCH_ACTIVE_END_SECONDS = 0.28

const INFLUENCE = {
	body: 0.45,
	head: 0.2,
	hips: 0.25,
	leftShoulder: 0.12,
	neck: 0.15,
	rightArm: 1,
	rightElbow: 1,
	rightShoulder: 1,
} as const satisfies PoseInfluence

export function samplePunchAnimationPose(progress: number): PilotPose {
	const clamped = Math.min(1, Math.max(0, progress))
	const windup = Math.min(1, clamped / 0.18)
	const strike =
		clamped < 0.18
			? -0.42 * Math.sin(windup * Math.PI)
			: Math.min(1, (clamped - 0.18) / 0.2)
	const recover = Math.min(1, (1 - clamped) / 0.4)
	const weight = recover * recover * (3 - 2 * recover)
	return definePilotPose({
		body: { rotation: { x: -0.09 * weight, y: -0.2 * weight } },
		head: { rotation: { y: 0.08 * weight } },
		hips: { rotation: { y: 0.1 * weight } },
		rightArm: { rotation: { x: -0.32 * weight } },
		rightElbow: { rotation: { x: 0.75 * (1 - strike) * weight } },
		rightShoulder: {
			rotation: {
				x: (1.48 + strike * 0.16) * weight,
				y: -0.08 * weight,
				z: 0.15 * weight,
			},
		},
	})
}

export function punchAnimationLayer(progress: number): PilotAnimationLayer {
	return {
		fadeSeconds: 0.06,
		id: "combat:punch",
		influence: INFLUENCE,
		mode: "override",
		pose: samplePunchAnimationPose(progress),
	}
}
