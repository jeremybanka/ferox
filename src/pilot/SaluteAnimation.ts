import {
	definePilotPose,
	type PilotAnimationLayer,
	type PilotPose,
	type PoseInfluence,
} from "./PilotAnimation.ts"

export const SALUTE_DURATION_SECONDS = 1.55

const INFLUENCE = {
	body: 0.2,
	head: 0.55,
	leftShoulder: 0.08,
	neck: 0.45,
	rightArm: 1,
	rightElbow: 1,
	rightShoulder: 1,
} as const satisfies PoseInfluence

export function sampleSaluteAnimationPose(progress: number): PilotPose {
	const clamped = Math.min(1, Math.max(0, progress))
	const entrance = Math.min(1, clamped / 0.2)
	const exit = Math.min(1, (1 - clamped) / 0.22)
	const weight = Math.min(
		entrance * entrance * (3 - 2 * entrance),
		exit * exit * (3 - 2 * exit),
	)
	return definePilotPose({
		body: { rotation: { z: -0.025 * weight } },
		head: { rotation: { x: -0.045 * weight } },
		neck: { rotation: { x: -0.025 * weight } },
		rightArm: { rotation: { y: -0.3 * weight } },
		rightElbow: { rotation: { x: 1.62 * weight, z: -0.14 * weight } },
		rightShoulder: {
			rotation: { x: 1.28 * weight, y: -0.35 * weight, z: 0.48 * weight },
		},
	})
}

export function saluteAnimationLayer(progress: number): PilotAnimationLayer {
	return {
		fadeSeconds: 0.12,
		id: "emote:salute",
		influence: INFLUENCE,
		mode: "override",
		pose: sampleSaluteAnimationPose(progress),
	}
}
