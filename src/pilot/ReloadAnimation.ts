import type { GunReloadAnimationId } from "../guns/GunDefinitions.ts"
import {
	definePilotKeyframes,
	definePilotPose,
	samplePilotKeyframes,
	type PilotAnimationLayer,
	type PilotPose,
	type PoseInfluence,
} from "./PilotAnimation.ts"
import { sampleWeaponsFreePose } from "./WeaponsFreePose.ts"

const RELOAD_INFLUENCE = {
	body: 0.28,
	leftArm: 1,
	leftElbow: 1,
	leftHand: 1,
	leftShoulder: 1,
	rightArm: 1,
	rightElbow: 1,
	rightHand: 1,
	rightShoulder: 1,
	weapon: 1,
	weaponMount: 1,
} as const satisfies PoseInfluence

export type ReloadAnimationMarker = {
	id: ReloadAnimationPhaseId
	label: string
	progress: number
}

export type ReloadAnimationPhaseId =
	| "open"
	| "ready"
	| "refill"
	| "release"
	| "seat"
	| "service"
	| "start"
	| "tilt"

export type ReloadAnimationPhase = ReloadAnimationMarker & {
	phaseProgress: number
}

export type FirstPersonReloadPose = {
	positionOffset: readonly [number, number, number]
	rotation: readonly [number, number, number]
}

type ReloadPoseKeyframe = {
	at: number
	pose: PilotPose
}

type FirstPersonKeyframe = FirstPersonReloadPose & {
	at: number
}

const NEUTRAL_POSE = definePilotPose({
	body: { rotation: { x: 0, y: 0, z: 0 } },
	leftArm: { rotation: { x: 0, y: 0, z: 0 } },
	leftElbow: { rotation: { x: 0, y: 0, z: 0 } },
	leftHand: { rotation: { x: 0, y: 0, z: 0 } },
	leftShoulder: { rotation: { x: 0, y: 0, z: 0 } },
	rightArm: { rotation: { x: 0, y: 0, z: 0 } },
	rightElbow: { rotation: { x: 0, y: 0, z: 0 } },
	rightHand: { rotation: { x: 0, y: 0, z: 0 } },
	rightShoulder: { rotation: { x: 0, y: 0, z: 0 } },
	weapon: {
		position: { x: 0, y: 0, z: 0 },
		rotation: { x: 0, y: 0, z: 0 },
	},
	weaponMount: { rotation: { x: -Math.PI / 2, y: 0, z: 0 } },
})

function clampProgress(progress: number): number {
	return Math.max(0, Math.min(1, progress))
}

function phaseMarkers(
	animation: GunReloadAnimationId,
	refillProgress: number,
): readonly ReloadAnimationMarker[] {
	const refill = clampProgress(refillProgress)
	if (animation === "mini-tube-service") {
		return [
			{ id: "start", label: "start", progress: 0 },
			{ id: "tilt", label: "launcher tilt", progress: refill * 0.2 },
			{ id: "open", label: "twin tubes open", progress: refill * 0.42 },
			{ id: "service", label: "tube service", progress: refill * 0.7 },
			{ id: "seat", label: "tubes seat", progress: refill * 0.9 },
			{ id: "refill", label: "refill", progress: refill },
			{ id: "ready", label: "ready", progress: 1 },
		]
	}
	return [
		{ id: "start", label: "start", progress: 0 },
		{ id: "release", label: "cell release", progress: refill / 3 },
		{ id: "seat", label: "cell seat", progress: refill * 0.8 },
		{ id: "refill", label: "refill", progress: refill },
		{ id: "ready", label: "ready", progress: 1 },
	]
}

export function reloadAnimationMarkers(
	animation: GunReloadAnimationId,
	refillProgress: number,
): readonly ReloadAnimationMarker[] {
	return phaseMarkers(animation, refillProgress)
}

export function sampleReloadAnimationPhase(
	animation: GunReloadAnimationId,
	progress: number,
	refillProgress: number,
): ReloadAnimationPhase {
	const sample = clampProgress(progress)
	const markers = phaseMarkers(animation, refillProgress)
	let index = 0
	while (
		index < markers.length - 1 &&
		sample >= (markers[index + 1]?.progress ?? 1)
	) {
		index += 1
	}
	const marker = markers[index] ?? markers[0]!
	const next = markers[index + 1]
	const range = Math.max(0.000_001, (next?.progress ?? 1) - marker.progress)
	return {
		...marker,
		phaseProgress: next === undefined ? 1 : (sample - marker.progress) / range,
	}
}

function arcCellKeyframes(
	refillProgress: number,
): readonly ReloadPoseKeyframe[] {
	const markers = phaseMarkers("arc-cell", refillProgress)
	return [
		{ at: 0, pose: sampleWeaponsFreePose(0, 0) },
		{
			at: markers[1]!.progress,
			pose: definePilotPose({
				body: { rotation: { y: -0.08 } },
				leftShoulder: { rotation: { x: -0.8, y: -0.52, z: -0.3 } },
				leftArm: { rotation: { x: -0.6 } },
				leftElbow: { rotation: { x: 2.52, y: 0.3 } },
				rightShoulder: { rotation: { x: 1.58, y: 0.2, z: 0.16 } },
				rightElbow: { rotation: { x: 0.3 } },
				rightHand: { rotation: { x: 0.3, z: 0.16 } },
				weaponMount: { rotation: { x: -1.18, z: 0.24 } },
				weapon: { position: { y: -0.12 }, rotation: { x: -0.28 } },
			}),
		},
		{
			at: markers[2]!.progress,
			pose: definePilotPose({
				body: { rotation: { y: -0.08 } },
				leftShoulder: { rotation: { x: 1.8, y: -0.52, z: -0.3 } },
				leftArm: { rotation: { x: 0.1, z: 0.6 } },
				leftElbow: { rotation: { x: 0.52, y: 0.3 } },
				rightShoulder: { rotation: { x: 1.58, y: 0.2, z: 0.16 } },
				rightElbow: { rotation: { x: 0.3, y: -1 } },
				rightHand: { rotation: { x: 0.3, z: 0.16 } },
				weaponMount: { rotation: { x: -1.18, z: 0.24 } },
				weapon: { position: { y: -0.12 }, rotation: { x: -0.28 } },
			}),
		},
		{
			at: markers[3]!.progress,
			pose: definePilotPose({
				body: { rotation: { y: -0.08 } },
				leftShoulder: { rotation: { x: -0.8, y: -0.52, z: -0.3 } },
				leftArm: { rotation: { x: -0.6 } },
				leftElbow: { rotation: { x: 2.52, y: 0.3 } },
				rightShoulder: { rotation: { x: 1.58, y: 0.2, z: 0.16 } },
				rightElbow: { rotation: { x: 0.3, y: -1 } },
				rightHand: { rotation: { x: 0.3, z: 0.16 } },
				weaponMount: { rotation: { x: -1.18, z: 0.24 } },
				weapon: { position: { y: -0.12 }, rotation: { x: -0.28 } },
			}),
		},
		{ at: 1, pose: sampleWeaponsFreePose(0, 0) },
	]
}

function miniTubeKeyframes(
	refillProgress: number,
): readonly ReloadPoseKeyframe[] {
	const markers = phaseMarkers("mini-tube-service", refillProgress)
	return [
		{ at: 0, pose: NEUTRAL_POSE },
		{
			at: markers[1]!.progress,
			pose: definePilotPose({
				body: { rotation: { x: -0.08, y: 0.12 } },
				leftShoulder: { rotation: { x: -0.4, y: 0.22, z: -0.42 } },
				leftElbow: { rotation: { x: -1.05, y: -0.24 } },
				rightShoulder: { rotation: { x: 0.42, y: -0.18, z: 0.34 } },
				rightElbow: { rotation: { x: -0.62 } },
				weaponMount: { rotation: { x: -0.68, y: 0.12, z: -0.48 } },
				weapon: { position: { y: -0.04, z: 0.08 }, rotation: { z: -0.28 } },
			}),
		},
		{
			at: markers[2]!.progress,
			pose: definePilotPose({
				body: { rotation: { x: -0.12, y: 0.16 } },
				leftShoulder: { rotation: { x: -0.72, y: 0.38, z: -0.5 } },
				leftArm: { rotation: { x: -0.34, z: -0.2 } },
				leftElbow: { rotation: { x: -1.3, y: -0.42 } },
				leftHand: { rotation: { x: 0.35, z: -0.22 } },
				rightShoulder: { rotation: { x: 1.6, y: -0.28, z: 1.42 } },
				rightElbow: { rotation: { x: -0.82 } },
				weaponMount: { rotation: { x: -0.46, y: 0.2, z: -0.72 } },
				weapon: {
					position: { y: -0.1, z: 0.12 },
					rotation: { x: 0.12, z: -0.38 },
				},
			}),
		},
		{
			at: markers[3]!.progress,
			pose: definePilotPose({
				body: { rotation: { x: -0.16, y: -0.08 } },
				leftShoulder: { rotation: { x: -1.02, y: -0.36, z: -0.34 } },
				leftArm: { rotation: { x: -0.58, y: -0.24 } },
				leftElbow: { rotation: { x: -1.5, y: 0.34 } },
				leftHand: { rotation: { x: -0.48, z: 0.28 } },
				rightShoulder: { rotation: { x: 0.7, y: 1.2, z: 1.34 } },
				rightElbow: { rotation: { x: -1.02, y: -0.16 } },
				weaponMount: { rotation: { x: -0.38, y: -0.18, z: -0.58 } },
				weapon: {
					position: { x: 0.05, y: -0.18, z: 0.14 },
					rotation: { x: 0.2, z: -0.3 },
				},
			}),
		},
		{
			at: markers[4]!.progress,
			pose: definePilotPose({
				body: { rotation: { x: -0.08, y: 0.1 } },
				leftShoulder: { rotation: { x: -0.68, y: 0.28, z: -0.42 } },
				leftArm: { rotation: { x: -0.3 } },
				leftElbow: { rotation: { x: -1.2, y: -0.2 } },
				leftHand: { rotation: { x: 0.3, z: -0.16 } },
				rightShoulder: { rotation: { x: 0.52, y: -0.12, z: 0.3 } },
				rightElbow: { rotation: { x: -0.72 } },
				weaponMount: { rotation: { x: -0.62, y: 0.08, z: -0.32 } },
				weapon: {
					position: { y: -0.08, z: 0.06 },
					rotation: { x: -0.08, z: -0.12 },
				},
			}),
		},
		{
			at: markers[5]!.progress,
			pose: definePilotPose({
				body: { rotation: { x: -0.04, y: 0.04 } },
				leftShoulder: { rotation: { x: -0.4, y: 0.16, z: -0.26 } },
				leftElbow: { rotation: { x: -0.8, y: -0.1 } },
				rightShoulder: { rotation: { x: 0.34, y: -0.08, z: 0.18 } },
				rightElbow: { rotation: { x: -0.48 } },
				weaponMount: { rotation: { x: -1.02, z: -0.12 } },
				weapon: { position: { y: -0.03 }, rotation: { x: 0.1 } },
			}),
		},
		{ at: 1, pose: NEUTRAL_POSE },
	]
}

export function sampleReloadAnimationPose(
	animation: GunReloadAnimationId,
	progress: number,
	refillProgress: number,
): PilotPose {
	const keyframes =
		animation === "mini-tube-service"
			? miniTubeKeyframes(refillProgress)
			: arcCellKeyframes(refillProgress)
	return samplePilotKeyframes(
		definePilotKeyframes({ keyframes, loop: false }),
		clampProgress(progress),
	)
}

function lerp(from: number, to: number, amount: number): number {
	return from + (to - from) * amount
}

function sampleFirstPersonKeyframes(
	keyframes: readonly FirstPersonKeyframe[],
	progress: number,
): FirstPersonReloadPose {
	const sample = clampProgress(progress)
	let index = 0
	while (
		index < keyframes.length - 2 &&
		sample > (keyframes[index + 1]?.at ?? 1)
	) {
		index += 1
	}
	const from = keyframes[index] ?? keyframes[0]!
	const to = keyframes[index + 1] ?? keyframes.at(-1)!
	const range = Math.max(0.000_001, to.at - from.at)
	const linear = Math.max(0, Math.min(1, (sample - from.at) / range))
	const amount = linear * linear * (3 - 2 * linear)
	return {
		positionOffset: [
			lerp(from.positionOffset[0], to.positionOffset[0], amount),
			lerp(from.positionOffset[1], to.positionOffset[1], amount),
			lerp(from.positionOffset[2], to.positionOffset[2], amount),
		],
		rotation: [
			lerp(from.rotation[0], to.rotation[0], amount),
			lerp(from.rotation[1], to.rotation[1], amount),
			lerp(from.rotation[2], to.rotation[2], amount),
		],
	}
}

export function sampleFirstPersonReloadPose(
	animation: GunReloadAnimationId,
	progress: number,
	refillProgress: number,
): FirstPersonReloadPose {
	const markers = phaseMarkers(animation, refillProgress)
	const neutral = {
		positionOffset: [0, 0, 0],
		rotation: [0, 0, 0],
	} as const
	if (animation === "mini-tube-service") {
		return sampleFirstPersonKeyframes(
			[
				{ ...neutral, at: 0 },
				{
					at: markers[1]!.progress,
					positionOffset: [-0.05, -0.08, 0.12],
					rotation: [0.3, 0.16, -0.52],
				},
				{
					at: markers[2]!.progress,
					positionOffset: [-0.08, -0.16, 0.18],
					rotation: [0.56, 0.34, -0.88],
				},
				{
					at: markers[3]!.progress,
					positionOffset: [0.09, -0.23, 0.23],
					rotation: [0.76, -0.24, -0.68],
				},
				{
					at: markers[4]!.progress,
					positionOffset: [-0.03, -0.13, 0.14],
					rotation: [0.48, 0.26, -0.32],
				},
				{
					at: markers[5]!.progress,
					positionOffset: [0, -0.04, 0.05],
					rotation: [0.16, 0, -0.08],
				},
				{ ...neutral, at: 1 },
			],
			progress,
		)
	}
	return sampleFirstPersonKeyframes(
		[
			{ ...neutral, at: 0 },
			{
				at: markers[1]!.progress,
				positionOffset: [0, -0.14, 0.08],
				rotation: [0.38, -0.16, 0.3],
			},
			{
				at: markers[2]!.progress,
				positionOffset: [0, -0.24, 0.12],
				rotation: [0.58, -0.28, 0.46],
			},
			{
				at: markers[3]!.progress,
				positionOffset: [0, -0.08, 0.04],
				rotation: [0.18, -0.06, 0.12],
			},
			{ ...neutral, at: 1 },
		],
		progress,
	)
}

export function reloadAnimationLayer(
	animation: GunReloadAnimationId,
	progress: number,
	refillProgress: number,
): PilotAnimationLayer {
	return {
		fadeSeconds: 0.08,
		id: `combat:reload:${animation}`,
		influence: RELOAD_INFLUENCE,
		mode: "override",
		pose: sampleReloadAnimationPose(animation, progress, refillProgress),
	}
}
