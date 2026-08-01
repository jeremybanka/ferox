import assert from "node:assert/strict"
import { test } from "vitest"

import {
	BASE_ANIMATIONS,
	OVERLAY_ANIMATIONS,
	RELOAD_IS_OVERLAY_ONLY,
} from "./pilot-visualizer-state.ts"
import {
	normalizeSlideDirectionDegrees,
	PILOT_VISUALIZER_GROUND_HEIGHT,
	PILOT_VISUALIZER_SLIDE_SPEED,
	samplePilotVisualizerSlideVector,
	sampleStoredPilotVisualizerSlideVector,
	slideExtremityWeight,
	slidePresetDirectionDegrees,
} from "./pilot-visualizer-slide.ts"

const EPSILON = 0.000_001

function assertNear(actual: number, expected: number): void {
	assert.ok(
		Math.abs(actual - expected) < EPSILON,
		`expected ${expected}, received ${actual}`,
	)
}

test("reload is catalogued only as a stackable overlay", () => {
	assert.equal(RELOAD_IS_OVERLAY_ONLY, true)
	assert.equal((BASE_ANIMATIONS as readonly string[]).includes("reload"), false)
	assert.equal(OVERLAY_ANIMATIONS.includes("reload"), true)
})

test("cardinal slide presets initialize the documented degree convention", () => {
	assert.equal(slidePresetDirectionDegrees("slide-forward"), 0)
	assert.equal(slidePresetDirectionDegrees("slide-right"), 90)
	assert.equal(slidePresetDirectionDegrees("slide-backward"), 180)
	assert.equal(slidePresetDirectionDegrees("slide-left"), 270)
	assert.equal(slidePresetDirectionDegrees("idle"), null)
})

test("slide direction produces normalized cardinal and diagonal headings", () => {
	const cases = [
		{ degrees: 0, x: 0, z: -1 },
		{ degrees: 90, x: 1, z: 0 },
		{ degrees: 180, x: 0, z: 1 },
		{ degrees: 270, x: -1, z: 0 },
		{
			degrees: 45,
			x: Math.SQRT1_2,
			z: -Math.SQRT1_2,
		},
	] as const
	for (const sample of cases) {
		const vector = samplePilotVisualizerSlideVector(sample.degrees, 100)
		assertNear(vector.heading.localX, sample.x)
		assertNear(vector.heading.localZ, sample.z)
		assertNear(Math.hypot(vector.heading.localX, vector.heading.localZ), 1)
	}
})

test("slide extremity scales velocity at zero, half, and full range", () => {
	for (const [extremity, speed] of [
		[0, 0],
		[50, PILOT_VISUALIZER_SLIDE_SPEED * 0.5],
		[100, PILOT_VISUALIZER_SLIDE_SPEED],
	] as const) {
		const vector = samplePilotVisualizerSlideVector(90, extremity)
		assertNear(
			Math.hypot(vector.motion.localVelocityX, vector.motion.localVelocityZ),
			speed,
		)
		assertNear(slideExtremityWeight(extremity), extremity / 100)
	}
})

test("359 degrees wraps continuously through forward to zero degrees", () => {
	assert.equal(normalizeSlideDirectionDegrees(360), 0)
	assert.equal(normalizeSlideDirectionDegrees(-1), 359)
	const beforeWrap = samplePilotVisualizerSlideVector(359, 100).heading
	const afterWrap = samplePilotVisualizerSlideVector(0, 100).heading
	const separation = Math.acos(
		Math.min(
			1,
			Math.max(
				-1,
				beforeWrap.localX * afterWrap.localX +
					beforeWrap.localZ * afterWrap.localZ,
			),
		),
	)
	assertNear(separation, Math.PI / 180)
})

test("stored custom vectors persist outside slide while legacy cardinal state falls back", () => {
	assert.equal(
		sampleStoredPilotVisualizerSlideVector({
			baseAnimation: "slide-right",
		}).directionDegrees,
		90,
	)
	assert.equal(
		sampleStoredPilotVisualizerSlideVector({
			baseAnimation: "idle",
			slideDirectionDegrees: 37,
			slideExtremityPercent: 64,
		}).directionDegrees,
		37,
	)
})

test("visualizer contact height matches the visible floor top", () => {
	assert.equal(PILOT_VISUALIZER_GROUND_HEIGHT, -0.15)
})
