import { atom } from "atom.io"
import { storageSync } from "atom.io/web"

import type { RunDirection } from "./pilot/RunAnimation.ts"

export type CrouchRunAnimation = `crouch-run-${RunDirection}`

export type BaseAnimation =
	| RunDirection
	| "crouch"
	| "double-jump"
	| "idle"
	| "jump"
	| CrouchRunAnimation

export type OverlayAnimation = "flinch" | "recoil" | "wave" | "weapons-free"

export type SampleInterval = 0.167 | 0.0833

export type PilotVisualizerControls = {
	baseAnimation: BaseAnimation
	bunnyhopping: boolean
	isPlaying: boolean
	overlays: readonly OverlayAnimation[]
	sampleInterval: SampleInterval
	selectedTime: number
	speed: number
	targetPitch: number
	targetYaw: number
	yaw: number
}

export type AlignmentStatus = {
	hit: boolean
	missDistance: number
}

export type AlignmentSweepStatus = {
	maxMissDistance: number
	passed: boolean
	samples: number
}

export const pilotVisualizerControlsAtom = atom<PilotVisualizerControls>({
	key: "pilotVisualizerControls",
	default: {
		baseAnimation: "forward",
		bunnyhopping: false,
		isPlaying: true,
		overlays: [],
		sampleInterval: 0.0833,
		selectedTime: 0,
		speed: 1,
		targetPitch: 0,
		targetYaw: 0,
		yaw: 0.42,
	},
	effects: [
		storageSync(
			globalThis.sessionStorage,
			JSON,
			"ferox-pilot-visualizer-controls",
		),
	],
})

export const pilotVisualizerAlignmentAtom = atom<AlignmentStatus | null>({
	key: "pilotVisualizerAlignment",
	default: null,
})

export const pilotVisualizerAlignmentSweepAtom =
	atom<AlignmentSweepStatus | null>({
		key: "pilotVisualizerAlignmentSweep",
		default: null,
	})
