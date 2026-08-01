import {
	definePilotPose,
	type PilotAnimationLayer,
	type PilotPose,
	type PoseInfluence,
} from "./PilotAnimation.ts"

export const FISTBUMP_DURATION_SECONDS = 1.45
export const FISTBUMP_ACTIVE_START_SECONDS = 0.35
export const FISTBUMP_ACTIVE_END_SECONDS = 1.1

const INFLUENCE = {
	body: 0.3,
	head: 0.35,
	leftShoulder: 0.08,
	neck: 0.25,
	rightArm: 1,
	rightElbow: 1,
	rightShoulder: 1,
} as const satisfies PoseInfluence

export function sampleFistbumpAnimationPose(progress: number): PilotPose {
	const clamped = Math.min(1, Math.max(0, progress))
	const entrance = Math.min(1, clamped / 0.24)
	const exit = Math.min(1, (1 - clamped) / 0.24)
	const weight = Math.min(
		entrance * entrance * (3 - 2 * entrance),
		exit * exit * (3 - 2 * exit),
	)
	return definePilotPose({
		body: { rotation: { x: -0.07 * weight, y: -0.08 * weight } },
		head: { rotation: { x: 0.04 * weight } },
		neck: { rotation: { x: 0.03 * weight } },
		rightArm: { rotation: { x: -0.2 * weight } },
		rightElbow: { rotation: { x: 0.22 * weight } },
		rightShoulder: {
			rotation: { x: 1.42 * weight, y: -0.08 * weight, z: 0.18 * weight },
		},
	})
}

export function fistbumpAnimationLayer(progress: number): PilotAnimationLayer {
	return {
		fadeSeconds: 0.1,
		id: "emote:fistbump",
		influence: INFLUENCE,
		mode: "override",
		pose: sampleFistbumpAnimationPose(progress),
	}
}
