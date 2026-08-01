import type {
	BaseAnimation,
	PilotVisualizerControls,
} from "./pilot-visualizer-state.ts"
import { PLAYER_SPRINT_SPEED_LIMIT } from "./game-constants.ts"
import type { SlideHeading, SlideMotion } from "./pilot/SlideAnimation.ts"
import {
	clampSlideInclinationDegrees,
	slideSurfaceFrameFromInclination,
	type SlideSurfaceFrame,
} from "./pilot/SlideSurface.ts"

export const PILOT_VISUALIZER_SLIDE_SPEED = PLAYER_SPRINT_SPEED_LIMIT
export const PILOT_VISUALIZER_GROUND_HEIGHT = -0.15

export type PilotVisualizerSlideVector = {
	directionDegrees: number
	heading: SlideHeading
	inclinationDegrees: number
	motion: SlideMotion
	surface: SlideSurfaceFrame
	surfaceVelocity: { x: number; y: number; z: number }
}

export function normalizeSlideDirectionDegrees(
	directionDegrees: number,
): number {
	if (!Number.isFinite(directionDegrees)) return 0
	return ((directionDegrees % 360) + 360) % 360
}

/** 0° forward, 90° right, 180° backward, and 270° left. */
export function samplePilotVisualizerSlideVector(
	directionDegrees: number,
	inclinationDegrees: number,
): PilotVisualizerSlideVector {
	const normalizedDirection = normalizeSlideDirectionDegrees(directionDegrees)
	const normalizedInclination = clampSlideInclinationDegrees(inclinationDegrees)
	const radians = (normalizedDirection * Math.PI) / 180
	const heading = {
		localX: Math.sin(radians),
		localZ: -Math.cos(radians),
	}
	const surface = slideSurfaceFrameFromInclination(
		heading,
		normalizedInclination,
	)
	return {
		directionDegrees: normalizedDirection,
		heading,
		inclinationDegrees: normalizedInclination,
		motion: {
			localVelocityX: heading.localX * PILOT_VISUALIZER_SLIDE_SPEED,
			localVelocityZ: heading.localZ * PILOT_VISUALIZER_SLIDE_SPEED,
		},
		surface,
		surfaceVelocity: {
			x: surface.tangent.x * PILOT_VISUALIZER_SLIDE_SPEED,
			y: surface.tangent.y * PILOT_VISUALIZER_SLIDE_SPEED,
			z: surface.tangent.z * PILOT_VISUALIZER_SLIDE_SPEED,
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
				"slideDirectionDegrees" | "slideInclinationDegrees"
			>
		>,
): PilotVisualizerSlideVector {
	return samplePilotVisualizerSlideVector(
		controls.slideDirectionDegrees ??
			slidePresetDirectionDegrees(controls.baseAnimation) ??
			0,
		controls.slideInclinationDegrees ?? 0,
	)
}
