import {
	applyPilotPose,
	definePilotPose,
	type PilotAnimationLayer,
	type PilotPose,
	type PoseInfluence,
} from "./PilotAnimation.ts"
import type { PilotRig } from "./PilotModel.ts"

function smoothstep(value: number): number {
	return value * value * (3 - 2 * value)
}

const WAVE_INFLUENCE = {
	body: 0.18,
	head: 0.72,
	hips: 0.12,
	leftArm: 1,
	leftElbow: 1,
	leftKnee: 0.1,
	leftLeg: 0.1,
	leftShoulder: 1,
	neck: 0.5,
	rightElbow: 0.08,
	rightKnee: 0.1,
	rightLeg: 0.1,
	rightShoulder: 0.08,
} as const satisfies PoseInfluence

export function applyWaveAnimation(rig: PilotRig, progress: number): void {
	applyPilotPose(rig, sampleWaveAnimationPose(progress))
}

export function sampleWaveAnimationPose(progress: number): PilotPose {
	const clamped = Math.min(1, Math.max(0, progress))
	const entrance = smoothstep(Math.min(1, clamped * 6))
	const exit = smoothstep(Math.min(1, (1 - clamped) * 6))
	const weight = Math.min(entrance, exit)
	const wave = Math.sin(clamped * Math.PI * 8)

	return definePilotPose({
		body: { rotation: { z: 0.05 * weight } },
		head: { rotation: { z: -0.1 * weight } },
		hips: { rotation: { z: 0.025 * weight } },
		leftArm: { rotation: { y: -0.18 * weight } },
		leftElbow: { rotation: { x: 1 + 0.5 * wave * weight } },
		leftKnee: { rotation: { x: -0.3 * weight } },
		leftLeg: { rotation: { x: 0.3 * weight, y: 0.3 * weight } },
		leftShoulder: {
			rotation: {
				x: 1.7 * weight,
				y: 0.1 * weight,
				z: -1.5 * weight,
			},
		},
		neck: { rotation: { z: -0.08 * weight } },
		rightElbow: { rotation: { x: 0.28 * weight } },
		rightKnee: { rotation: { x: -0.3 * weight } },
		rightLeg: {
			rotation: { x: 0.1 * weight, y: -0.1 * (0.05 * wave) * weight },
		},
		rightShoulder: { rotation: { z: 0.12 * weight } },
	})
}

export function waveAnimationLayer(progress: number): PilotAnimationLayer {
	return {
		fadeSeconds: 0.14,
		id: "emote:wave",
		influence: WAVE_INFLUENCE,
		mode: "override",
		pose: sampleWaveAnimationPose(progress),
	}
}
