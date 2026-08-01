import {
	definePilotKeyframes,
	definePilotPose,
	samplePilotKeyframes,
	type PilotAnimationLayer,
	type PilotPose,
} from "./PilotAnimation.ts"

export const DEATH_ANIMATION_DURATION_SECONDS = 1.6

export const DEATH_ANIMATION_MARKERS = [
	{ id: "impact", label: "impact", progress: 0 },
	{ id: "shuffle", label: "shuffle backward", progress: 0.2 },
	{ id: "knees", label: "both knees", progress: 0.46 },
	{ id: "fall", label: "forward fall", progress: 0.7 },
	{ id: "flat", label: "flat, arms up", progress: 0.9 },
	{ id: "hold", label: "defeated hold", progress: 1 },
] as const

export type DeathAnimationPhase = (typeof DEATH_ANIMATION_MARKERS)[number]["id"]

const neutralPose = definePilotPose({
	root: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
	hips: { position: { y: 1.72, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
	body: { rotation: { x: 0, y: 0, z: 0 } },
	neck: { rotation: { x: 0, y: 0, z: 0 } },
	head: { rotation: { x: 0, y: 0, z: 0 } },
	leftShoulder: { rotation: { x: 0, y: 0, z: 0 } },
	leftArm: { rotation: { x: 0, y: 0, z: 0 } },
	leftElbow: { rotation: { x: 0, y: 0, z: 0 } },
	rightShoulder: { rotation: { x: 0, y: 0, z: 0 } },
	rightArm: { rotation: { x: 0, y: 0, z: 0 } },
	rightElbow: { rotation: { x: 0, y: 0, z: 0 } },
	leftLeg: { rotation: { x: 0, y: 0, z: 0 } },
	leftKnee: { rotation: { x: 0, y: 0, z: 0 } },
	leftFoot: { rotation: { x: 0, y: 0, z: 0 } },
	rightLeg: { rotation: { x: 0, y: 0, z: 0 } },
	rightKnee: { rotation: { x: 0, y: 0, z: 0 } },
	rightFoot: { rotation: { x: 0, y: 0, z: 0 } },
	weaponMount: { rotation: { x: -Math.PI / 2, y: 0, z: 0 } },
	weapon: { rotation: { x: 0, y: 0, z: 0 } },
})

const DEATH_KEYFRAMES = definePilotKeyframes({
	keyframes: [
		{ at: 0, pose: neutralPose },
		{
			at: 0.1,
			pose: definePilotPose({
				root: {
					position: { y: 0, z: 0.13 },
					rotation: { x: 0, z: -0.04 },
				},
				hips: { position: { y: 1.68 }, rotation: { x: -0.08, z: 0.05 } },
				body: { rotation: { x: -0.06, z: -0.08 } },
				leftLeg: { rotation: { x: -0.38, z: -0.08 } },
				leftKnee: { rotation: { x: 0.42 } },
				rightLeg: { rotation: { x: 0.28, z: 0.06 } },
				rightKnee: { rotation: { x: 0.16 } },
				leftShoulder: { rotation: { x: -0.24, z: -0.18 } },
				rightShoulder: { rotation: { x: 0.2, z: 0.16 } },
			}),
		},
		{
			at: 0.2,
			pose: definePilotPose({
				root: {
					position: { y: 0, z: 0.3 },
					rotation: { x: 0, z: 0.05 },
				},
				hips: { position: { y: 1.62 }, rotation: { x: -0.12, z: -0.06 } },
				body: { rotation: { x: -0.1, z: 0.09 } },
				leftLeg: { rotation: { x: 0.3, z: -0.05 } },
				leftKnee: { rotation: { x: 0.18 } },
				rightLeg: { rotation: { x: -0.44, z: 0.08 } },
				rightKnee: { rotation: { x: 0.48 } },
				leftShoulder: { rotation: { x: 0.18, z: -0.16 } },
				rightShoulder: { rotation: { x: -0.26, z: 0.2 } },
			}),
		},
		{
			at: 0.46,
			pose: definePilotPose({
				root: { position: { y: -0.58, z: 0.48 }, rotation: { x: -0.18 } },
				hips: { position: { y: 1.36, z: 0.06 }, rotation: { x: -0.34 } },
				body: { rotation: { x: 0.16 } },
				neck: { rotation: { x: 0.18 } },
				leftLeg: { rotation: { x: -0.78, z: -0.08 } },
				leftKnee: { rotation: { x: 1.62 } },
				leftFoot: { rotation: { x: -0.5 } },
				rightLeg: { rotation: { x: -0.78, z: 0.08 } },
				rightKnee: { rotation: { x: 1.62 } },
				rightFoot: { rotation: { x: -0.5 } },
				leftShoulder: { rotation: { x: -0.38, y: 0, z: -0.46 } },
				rightShoulder: { rotation: { x: -0.38, y: 0, z: 0.46 } },
				leftElbow: { rotation: { x: -0.5 } },
				rightElbow: { rotation: { x: -0.5 } },
			}),
		},
		{
			at: 0.7,
			pose: definePilotPose({
				root: { position: { y: -0.68, z: 0.34 }, rotation: { x: -0.9 } },
				hips: { position: { y: 1.28, z: 0.08 }, rotation: { x: -0.42 } },
				body: { rotation: { x: 0.34 } },
				neck: { rotation: { x: 0.38 } },
				leftShoulder: { rotation: { x: -1.26, y: -0.18, z: -0.66 } },
				leftArm: { rotation: { x: -0.42 } },
				leftElbow: { rotation: { x: -0.34 } },
				rightShoulder: { rotation: { x: -1.26, y: 0.18, z: 0.66 } },
				rightArm: { rotation: { x: -0.42 } },
				rightElbow: { rotation: { x: -0.34 } },
				leftLeg: { rotation: { x: -0.5 } },
				leftKnee: { rotation: { x: 1.2 } },
				rightLeg: { rotation: { x: -0.5 } },
				rightKnee: { rotation: { x: 1.2 } },
				weaponMount: { rotation: { x: -1.2, z: 0.24 } },
				weapon: { rotation: { x: 0.4, z: 0.35 } },
			}),
		},
		{
			at: 0.9,
			pose: definePilotPose({
				root: { position: { y: -0.78, z: 0.42 }, rotation: { x: -1.44 } },
				hips: { position: { y: 1.22, z: 0.04 }, rotation: { x: -0.16 } },
				body: { rotation: { x: 0.22 } },
				neck: { rotation: { x: 0.5 } },
				leftShoulder: { rotation: { x: -1.5, y: -0.16, z: -0.5 } },
				leftArm: { rotation: { x: -0.3 } },
				leftElbow: { rotation: { x: -0.18 } },
				rightShoulder: { rotation: { x: -1.5, y: 0.16, z: 0.5 } },
				rightArm: { rotation: { x: -0.3 } },
				rightElbow: { rotation: { x: -0.18 } },
				leftLeg: { rotation: { x: -0.08 } },
				leftKnee: { rotation: { x: 0.28 } },
				rightLeg: { rotation: { x: -0.08 } },
				rightKnee: { rotation: { x: 0.28 } },
				weaponMount: { rotation: { x: -1.08, z: 0.4 } },
				weapon: { rotation: { x: 0.62, z: 0.5 } },
			}),
		},
		{
			at: 1,
			pose: definePilotPose({
				root: { position: { y: -0.78, z: 0.42 }, rotation: { x: -1.44 } },
				hips: { position: { y: 1.22, z: 0.04 }, rotation: { x: -0.16 } },
				body: { rotation: { x: 0.22 } },
				neck: { rotation: { x: 0.5 } },
				leftShoulder: { rotation: { x: -1.5, y: -0.16, z: -0.5 } },
				leftArm: { rotation: { x: -0.3 } },
				leftElbow: { rotation: { x: -0.18 } },
				rightShoulder: { rotation: { x: -1.5, y: 0.16, z: 0.5 } },
				rightArm: { rotation: { x: -0.3 } },
				rightElbow: { rotation: { x: -0.18 } },
				leftLeg: { rotation: { x: -0.08 } },
				leftKnee: { rotation: { x: 0.28 } },
				rightLeg: { rotation: { x: -0.08 } },
				rightKnee: { rotation: { x: 0.28 } },
				weaponMount: { rotation: { x: -1.08, z: 0.4 } },
				weapon: { rotation: { x: 0.62, z: 0.5 } },
			}),
		},
	],
	loop: false,
})

export function deathAnimationProgress(elapsedSeconds: number): number {
	return Math.max(
		0,
		Math.min(1, elapsedSeconds / DEATH_ANIMATION_DURATION_SECONDS),
	)
}

export function deathAnimationPhase(progress: number): DeathAnimationPhase {
	const sample = Math.max(0, Math.min(1, progress))
	let phase: DeathAnimationPhase = "impact"
	for (const marker of DEATH_ANIMATION_MARKERS) {
		if (sample < marker.progress) break
		phase = marker.id
	}
	return phase
}

export function sampleDeathAnimationPose(elapsedSeconds: number): PilotPose {
	return samplePilotKeyframes(
		DEATH_KEYFRAMES,
		deathAnimationProgress(elapsedSeconds),
	)
}

export function deathAnimationLayer(
	elapsedSeconds: number,
): PilotAnimationLayer {
	return {
		fadeSeconds: 0.08,
		id: "lifecycle:death",
		mode: "override",
		pose: sampleDeathAnimationPose(elapsedSeconds),
	}
}
