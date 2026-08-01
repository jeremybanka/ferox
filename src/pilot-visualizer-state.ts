import { atom } from "atom.io"
import { storageSync } from "atom.io/web"

import { DEFAULT_GUN_ID, type GunId } from "./guns/GunDefinitions.ts"
import type { RunDirection } from "./pilot/RunAnimation.ts"

export type CrouchRunAnimation = `crouch-run-${RunDirection}`
export type SlideAnimation = `slide-${RunDirection}`

export type BaseAnimation =
	| RunDirection
	| "crouch"
	| "death"
	| "double-jump"
	| "idle"
	| "jump"
	| "slide"
	| CrouchRunAnimation
	| SlideAnimation

export type OverlayAnimation =
	| "flinch"
	| "recoil"
	| "reload"
	| "wave"
	| "weapons-free"

export const BASE_ANIMATIONS = [
	"idle",
	"forward",
	"left",
	"backward",
	"right",
	"jump",
	"double-jump",
	"slide-forward",
	"slide-left",
	"slide-backward",
	"slide-right",
	"death",
	"crouch",
	"crouch-run-forward",
	"crouch-run-left",
	"crouch-run-backward",
	"crouch-run-right",
] as const satisfies readonly BaseAnimation[]

export const OVERLAY_ANIMATIONS = [
	"reload",
	"weapons-free",
	"recoil",
	"flinch",
	"wave",
] as const satisfies readonly OverlayAnimation[]

export const RELOAD_IS_OVERLAY_ONLY: Extract<
	BaseAnimation,
	"reload"
> extends never
	? true
	: never = true

export type SampleInterval = 0.167 | 0.0833

export type PilotVisualizerControls = {
	baseAnimation: BaseAnimation
	bunnyhopping: boolean
	gunId: GunId
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
		gunId: DEFAULT_GUN_ID,
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
