import {
	definePilotKeyframes,
	definePilotPose,
	samplePilotKeyframes,
	type PilotAnimationLayer,
	type PilotPose,
} from "./PilotAnimation.ts"

export const DEATH_IMPACT_UPRIGHT_POSE = definePilotPose({
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

export const DEATH_BACKWARD_SHUFFLE_LEFT_POSE = definePilotPose({
	root: { position: { y: 0, z: 0.13 }, rotation: { x: 0, z: -0.04 } },
	hips: { position: { y: 1.68 }, rotation: { x: -0.08, z: 0.05 } },
	body: { rotation: { x: -0.06, z: -0.08 } },
	leftLeg: { rotation: { x: -0.38, z: -0.08 } },
	leftKnee: { rotation: { x: -0.42 } },
	rightLeg: { rotation: { x: 0.28, z: 0.06 } },
	rightKnee: { rotation: { x: -0.16 } },
	leftShoulder: { rotation: { x: -0.24, z: -0.18 } },
	leftElbow: { rotation: { x: 0.24 } },
	rightShoulder: { rotation: { x: 0.2, z: 0.16 } },
	rightElbow: { rotation: { x: 0.2 } },
})

export const DEATH_BACKWARD_SHUFFLE_RIGHT_POSE = definePilotPose({
	root: { position: { y: 0, z: 0.3 }, rotation: { x: 0, z: 0.05 } },
	hips: { position: { y: 1.62 }, rotation: { x: -0.12, z: -0.06 } },
	body: { rotation: { x: -0.1, z: 0.09 } },
	leftLeg: { rotation: { x: 0.3, z: -0.05 } },
	leftKnee: { rotation: { x: -0.18 } },
	rightLeg: { rotation: { x: -0.44, z: 0.08 } },
	rightKnee: { rotation: { x: -0.48 } },
	leftShoulder: { rotation: { x: 0.18, z: -0.16 } },
	leftElbow: { rotation: { x: 0.2 } },
	rightShoulder: { rotation: { x: -0.26, z: 0.2 } },
	rightElbow: { rotation: { x: 0.26 } },
})

export const DEATH_BOTH_KNEES_DROP_POSE = definePilotPose({
	root: { position: { y: -0.58, z: 0.48 }, rotation: { x: -0.18 } },
	hips: { position: { y: 1.36, z: 0.06 }, rotation: { x: -0.34 } },
	body: { rotation: { x: 0.16 } },
	neck: { rotation: { x: 0.18 } },
	leftLeg: { rotation: { x: 0.78, z: -0.08 } },
	leftKnee: { rotation: { x: -1.62 } },
	leftFoot: { rotation: { x: 0.72 } },
	rightLeg: { rotation: { x: 0.78, z: 0.08 } },
	rightKnee: { rotation: { x: -1.62 } },
	rightFoot: { rotation: { x: 0.72 } },
	leftShoulder: { rotation: { x: 0.26, y: 0, z: -0.46 } },
	rightShoulder: { rotation: { x: 0.26, y: 0, z: 0.46 } },
	leftElbow: { rotation: { x: 0.5 } },
	rightElbow: { rotation: { x: 0.5 } },
})

export const DEATH_FORWARD_FALL_ARMS_UP_POSE = definePilotPose({
	root: { position: { y: -0.68, z: 0.45 }, rotation: { x: -0.9 } },
	hips: { position: { y: 1.28, z: 0.08 }, rotation: { x: -0.42 } },
	body: { rotation: { x: 0.34 } },
	neck: { rotation: { x: 0.38 } },
	leftShoulder: { rotation: { x: 0.28, y: -0.08, z: -1.78 } },
	leftArm: { rotation: { x: 0.16, z: -0.08 } },
	leftElbow: { rotation: { x: 0.56 } },
	rightShoulder: { rotation: { x: 0.28, y: 0.08, z: 1.78 } },
	rightArm: { rotation: { x: 0.16, z: 0.08 } },
	rightElbow: { rotation: { x: 0.56 } },
	leftLeg: { rotation: { x: 0.5 } },
	leftKnee: { rotation: { x: -1.2 } },
	leftFoot: { rotation: { x: 0.58 } },
	rightLeg: { rotation: { x: 0.5 } },
	rightKnee: { rotation: { x: -1.2 } },
	rightFoot: { rotation: { x: 0.58 } },
	weaponMount: { rotation: { x: -1.2, z: 0.24 } },
	weapon: { rotation: { x: 0.4, z: 0.35 } },
})

export const DEATH_FINAL_PRONE_ARMS_UP_POSE = definePilotPose({
	root: { position: { y: -0.78, z: 0.42 }, rotation: { x: -1.44 } },
	hips: { position: { y: 1.22, z: 0.04 }, rotation: { x: -0.16 } },
	body: { rotation: { x: 0.22 } },
	neck: { rotation: { x: 0.5 } },
	leftShoulder: { rotation: { x: 0.24, y: -0.06, z: -2.02 } },
	leftArm: { rotation: { x: 0.12, z: -0.06 } },
	leftElbow: { rotation: { x: 0.42 } },
	rightShoulder: { rotation: { x: 0.24, y: 0.06, z: 2.02 } },
	rightArm: { rotation: { x: 0.12, z: 0.06 } },
	rightElbow: { rotation: { x: 0.42 } },
	leftLeg: { rotation: { x: 0.08 } },
	leftKnee: { rotation: { x: -0.28 } },
	leftFoot: { rotation: { x: 0.2 } },
	rightLeg: { rotation: { x: 0.08 } },
	rightKnee: { rotation: { x: -0.28 } },
	rightFoot: { rotation: { x: 0.2 } },
	weaponMount: { rotation: { x: -1.08, z: 0.4 } },
	weapon: { rotation: { x: 0.62, z: 0.5 } },
})

export const DEATH_DEFEATED_HOLD_POSE = definePilotPose({
	...DEATH_FINAL_PRONE_ARMS_UP_POSE,
})

/**
 * The single authoritative death-animation timeline. Edit phase names, timings,
 * or their named poses here; duration, interpolation keyframes, visualizer
 * markers, phase lookup, and filmstrip sampling all derive from this sequence.
 */
export const DEATH_ANIMATION_TIMELINE = [
	{
		atSeconds: 0,
		easingFromPrevious: "linear",
		id: "impact",
		label: "impact upright",
		pose: DEATH_IMPACT_UPRIGHT_POSE,
		poseName: "impact upright",
	},
	{
		atSeconds: 0.25,
		easingFromPrevious: "smoothstep",
		id: "shuffle-left",
		label: "shuffle backward, left step",
		pose: DEATH_BACKWARD_SHUFFLE_LEFT_POSE,
		poseName: "backward shuffle left",
	},
	{
		atSeconds: 0.5,
		easingFromPrevious: "smoothstep",
		id: "shuffle-right",
		label: "shuffle backward, right step",
		pose: DEATH_BACKWARD_SHUFFLE_RIGHT_POSE,
		poseName: "backward shuffle right",
	},
	{
		atSeconds: 0.6,
		easingFromPrevious: "smoothstep",
		id: "knee-drop",
		label: "both knees drop",
		pose: DEATH_BOTH_KNEES_DROP_POSE,
		poseName: "both knees drop",
	},
	{
		atSeconds: 1,
		easingFromPrevious: "linear",
		id: "forward-fall",
		label: "forward fall, arms outward and up",
		pose: DEATH_FORWARD_FALL_ARMS_UP_POSE,
		poseName: "forward fall arms up",
	},
	{
		atSeconds: 1.2,
		easingFromPrevious: "linear",
		id: "final-prone",
		label: "final prone, arms outward and up",
		pose: DEATH_FINAL_PRONE_ARMS_UP_POSE,
		poseName: "final prone arms up",
	},
	{
		atSeconds: 2,
		easingFromPrevious: "smoothstep",
		id: "defeated-hold",
		label: "defeated hold",
		pose: DEATH_DEFEATED_HOLD_POSE,
		poseName: "defeated hold",
	},
] as const

export type DeathAnimationPhase =
	(typeof DEATH_ANIMATION_TIMELINE)[number]["id"]

export const DEATH_ANIMATION_DURATION_SECONDS =
	DEATH_ANIMATION_TIMELINE.at(-1)!.atSeconds

export const DEATH_ANIMATION_MARKERS = DEATH_ANIMATION_TIMELINE.map(
	({ atSeconds, id, label }) => ({
		id,
		label,
		progress: atSeconds / DEATH_ANIMATION_DURATION_SECONDS,
	}),
)

const DEATH_KEYFRAMES = definePilotKeyframes({
	keyframes: DEATH_ANIMATION_TIMELINE.map(
		({ atSeconds, easingFromPrevious, pose }) => ({
			at: atSeconds / DEATH_ANIMATION_DURATION_SECONDS,
			easingFromPrevious,
			pose,
		}),
	),
	loop: false,
})

const CONTINUOUS_FALL_JOINTS = [
	"root",
	"hips",
	"body",
	"neck",
	"head",
	"leftShoulder",
	"leftArm",
	"leftElbow",
	"rightShoulder",
	"rightArm",
	"rightElbow",
	"leftLeg",
	"leftKnee",
	"leftFoot",
	"rightLeg",
	"rightKnee",
	"rightFoot",
] as const

const fallKneePhase = DEATH_ANIMATION_TIMELINE.find(
	({ id }) => id === "knee-drop",
)!
const fallPassThroughPhase = DEATH_ANIMATION_TIMELINE.find(
	({ id }) => id === "forward-fall",
)!
const fallPronePhase = DEATH_ANIMATION_TIMELINE.find(
	({ id }) => id === "final-prone",
)!

const fallControlPoses = [
	fallKneePhase,
	fallPassThroughPhase,
	fallPronePhase,
].map(({ atSeconds }) =>
	samplePilotKeyframes(
		DEATH_KEYFRAMES,
		atSeconds / DEATH_ANIMATION_DURATION_SECONDS,
	),
)

function monotonePassThroughTangent(
	from: number,
	through: number,
	to: number,
	beforeSeconds: number,
	afterSeconds: number,
): number {
	const beforeSlope = (through - from) / beforeSeconds
	const afterSlope = (to - through) / afterSeconds
	if (beforeSlope * afterSlope <= 0) return 0
	return (
		(beforeSeconds + afterSeconds) /
		(beforeSeconds / beforeSlope + afterSeconds / afterSlope)
	)
}

function hermiteChannel(
	from: number,
	to: number,
	fromTangent: number,
	toTangent: number,
	duration: number,
	progress: number,
): number {
	const squared = progress * progress
	const cubed = squared * progress
	return (
		(2 * cubed - 3 * squared + 1) * from +
		(cubed - 2 * squared + progress) * duration * fromTangent +
		(-2 * cubed + 3 * squared) * to +
		(cubed - squared) * duration * toTangent
	)
}

function sampleContinuousFallPose(elapsedSeconds: number): PilotPose | null {
	if (
		elapsedSeconds < fallKneePhase.atSeconds ||
		elapsedSeconds > fallPronePhase.atSeconds
	)
		return null
	const kneeToPassSeconds =
		fallPassThroughPhase.atSeconds - fallKneePhase.atSeconds
	const passToProneSeconds =
		fallPronePhase.atSeconds - fallPassThroughPhase.atSeconds
	const beforePassThrough = elapsedSeconds <= fallPassThroughPhase.atSeconds
	const duration = beforePassThrough ? kneeToPassSeconds : passToProneSeconds
	const progress = Math.max(
		0,
		Math.min(
			1,
			beforePassThrough
				? (elapsedSeconds - fallKneePhase.atSeconds) / duration
				: (elapsedSeconds - fallPassThroughPhase.atSeconds) / duration,
		),
	)
	const result: PilotPose = {}
	for (const joint of CONTINUOUS_FALL_JOINTS) {
		for (const kind of ["position", "rotation"] as const) {
			for (const axis of ["x", "y", "z"] as const) {
				const authored = fallControlPoses.map(
					(pose) => pose[joint]?.[kind]?.[axis],
				)
				if (authored.every((value) => value === undefined)) continue
				const [knee = 0, passThrough = 0, prone = 0] = authored
				const kneeSlope = (passThrough - knee) / kneeToPassSeconds
				const proneSlope = (prone - passThrough) / passToProneSeconds
				const passThroughTangent = monotonePassThroughTangent(
					knee,
					passThrough,
					prone,
					kneeToPassSeconds,
					passToProneSeconds,
				)
				const value = beforePassThrough
					? hermiteChannel(
							knee,
							passThrough,
							kneeSlope,
							passThroughTangent,
							kneeToPassSeconds,
							progress,
						)
					: hermiteChannel(
							passThrough,
							prone,
							passThroughTangent,
							proneSlope,
							passToProneSeconds,
							progress,
						)
				const jointPose = (result[joint] ??= {})
				const channels = (jointPose[kind] ??= {})
				channels[axis] = value
			}
		}
	}
	return result
}

export function deathAnimationProgress(elapsedSeconds: number): number {
	return Math.max(
		0,
		Math.min(1, elapsedSeconds / DEATH_ANIMATION_DURATION_SECONDS),
	)
}

export function deathAnimationPhase(progress: number): DeathAnimationPhase {
	const sample = Math.max(0, Math.min(1, progress))
	let phase: DeathAnimationPhase = DEATH_ANIMATION_TIMELINE[0].id
	for (const marker of DEATH_ANIMATION_MARKERS) {
		if (sample < marker.progress) break
		phase = marker.id
	}
	return phase
}

export function sampleDeathAnimationPose(elapsedSeconds: number): PilotPose {
	const continuousFall = sampleContinuousFallPose(elapsedSeconds)
	if (continuousFall !== null) return continuousFall
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
