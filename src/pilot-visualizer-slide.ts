import type {
	BaseAnimation,
	PilotVisualizerControls,
} from "./pilot-visualizer-state.ts"
import { PLAYER_SPRINT_SPEED_LIMIT } from "./game-constants.ts"
import type { SlideHeading, SlideMotion } from "./pilot/SlideAnimation.ts"

export const PILOT_VISUALIZER_SLIDE_SPEED = PLAYER_SPRINT_SPEED_LIMIT
export const PILOT_VISUALIZER_GROUND_HEIGHT = -0.15

export type PilotVisualizerSlideVector = {
	directionDegrees: number
	extremityPercent: number
	heading: SlideHeading
	motion: SlideMotion
}

export function normalizeSlideDirectionDegrees(
	directionDegrees: number,
): number {
	if (!Number.isFinite(directionDegrees)) return 0
	return ((directionDegrees % 360) + 360) % 360
}

export function clampSlideExtremityPercent(extremityPercent: number): number {
	if (!Number.isFinite(extremityPercent)) return 100
	return Math.min(100, Math.max(0, extremityPercent))
}

export function slideExtremityWeight(extremityPercent: number): number {
	return clampSlideExtremityPercent(extremityPercent) / 100
}

/** 0° forward, 90° right, 180° backward, and 270° left. */
export function samplePilotVisualizerSlideVector(
	directionDegrees: number,
	extremityPercent: number,
): PilotVisualizerSlideVector {
	const normalizedDirection = normalizeSlideDirectionDegrees(directionDegrees)
	const normalizedExtremity = clampSlideExtremityPercent(extremityPercent)
	const radians = (normalizedDirection * Math.PI) / 180
	const heading = {
		localX: Math.sin(radians),
		localZ: -Math.cos(radians),
	}
	const speed =
		PILOT_VISUALIZER_SLIDE_SPEED * slideExtremityWeight(normalizedExtremity)
	return {
		directionDegrees: normalizedDirection,
		extremityPercent: normalizedExtremity,
		heading,
		motion: {
			localVelocityX: heading.localX * speed,
			localVelocityZ: heading.localZ * speed,
		},
	}
}

export function slidePresetDirectionDegrees(
	baseAnimation: BaseAnimation,
): number | null {
	switch (baseAnimation) {
		case "slide":
		case "slide-forward":
			return 0
		case "slide-right":
			return 90
		case "slide-backward":
			return 180
		case "slide-left":
			return 270
		default:
			return null
	}
}

export function sampleStoredPilotVisualizerSlideVector(
	controls: Pick<PilotVisualizerControls, "baseAnimation"> &
		Partial<
			Pick<
				PilotVisualizerControls,
				"slideDirectionDegrees" | "slideExtremityPercent"
			>
		>,
): PilotVisualizerSlideVector {
	return samplePilotVisualizerSlideVector(
		controls.slideDirectionDegrees ??
			slidePresetDirectionDegrees(controls.baseAnimation) ??
			0,
		controls.slideExtremityPercent ?? 100,
	)
}
