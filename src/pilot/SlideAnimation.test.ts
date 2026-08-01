import assert from "node:assert/strict"
import { test } from "vitest"

import {
	initialSlideHeading,
	sampleSlideAnimationPose,
	slideTravelTilt,
	stepSlideHeading,
} from "./SlideAnimation.ts"
import { slideDirectionFromMotion } from "./SlideDirection.ts"

const EPSILON = 0.000_001

function assertNear(actual: number, expected: number): void {
	assert.ok(
		Math.abs(actual - expected) < EPSILON,
		`expected ${expected}, received ${actual}`,
	)
}

test("slide direction maps dominant local momentum in all four directions", () => {
	assert.equal(
		slideDirectionFromMotion({ localVelocityX: 0.2, localVelocityZ: -8 }),
		"forward",
	)
	assert.equal(
		slideDirectionFromMotion({ localVelocityX: -0.2, localVelocityZ: 8 }),
		"backward",
	)
	assert.equal(
		slideDirectionFromMotion({ localVelocityX: -8, localVelocityZ: -0.2 }),
		"left",
	)
	assert.equal(
		slideDirectionFromMotion({ localVelocityX: 8, localVelocityZ: 0.2 }),
		"right",
	)
})

test("zero slide momentum falls back to forward without an unstable direction", () => {
	assert.equal(
		slideDirectionFromMotion({ localVelocityX: 0, localVelocityZ: 0 }),
		"forward",
	)
})

test("slide travel tilt banks around the axis perpendicular to all four headings", () => {
	assert.deepEqual(
		slideTravelTilt(
			initialSlideHeading({ localVelocityX: 0, localVelocityZ: -8 }),
			0.14,
		),
		{
			x: -0.14,
			z: -0,
		},
	)
	assert.deepEqual(
		slideTravelTilt(
			initialSlideHeading({ localVelocityX: 0, localVelocityZ: 8 }),
			0.14,
		),
		{
			x: 0.14,
			z: -0,
		},
	)
	assert.deepEqual(
		slideTravelTilt(
			initialSlideHeading({ localVelocityX: -8, localVelocityZ: 0 }),
			0.14,
		),
		{
			x: 0,
			z: 0.14,
		},
	)
	assert.deepEqual(
		slideTravelTilt(
			initialSlideHeading({ localVelocityX: 8, localVelocityZ: 0 }),
			0.14,
		),
		{
			x: 0,
			z: -0.14,
		},
	)
})

test("diagonal momentum produces a continuous heading and perpendicular bank", () => {
	const heading = initialSlideHeading({
		localVelocityX: 6,
		localVelocityZ: -8,
	})
	assertNear(heading.localX, 0.6)
	assertNear(heading.localZ, -0.8)
	const tilt = slideTravelTilt(heading, 0.14)
	assertNear(heading.localX * tilt.x + heading.localZ * tilt.z, 0)

	const pose = sampleSlideAnimationPose(
		{ localVelocityX: 6, localVelocityZ: -8 },
		heading,
	)
	assertNear(pose.root?.rotation?.x ?? Number.NaN, -0.112)
	assertNear(pose.root?.rotation?.z ?? Number.NaN, -0.084)
})

test("heading smoothing follows changed velocity instead of snapping cardinally", () => {
	const forward = initialSlideHeading({
		localVelocityX: 0,
		localVelocityZ: -9,
	})
	const diagonal = stepSlideHeading(
		forward,
		{ localVelocityX: 9, localVelocityZ: 0 },
		1 / 60,
	)
	assert.ok(diagonal.localX > 0)
	assert.ok(diagonal.localX < 1)
	assert.ok(diagonal.localZ < 0)
	assertNear(Math.hypot(diagonal.localX, diagonal.localZ), 1)
})

test("near-zero motion caches the last useful heading without jitter", () => {
	const cached = initialSlideHeading({
		localVelocityX: -4,
		localVelocityZ: 3,
	})
	const stopped = stepSlideHeading(
		cached,
		{ localVelocityX: 0.03, localVelocityZ: -0.02 },
		1 / 30,
	)
	assert.equal(stopped, cached)
})

test("slide pose leaves reload and wave upper-body joints composable", () => {
	const pose = sampleSlideAnimationPose({
		localVelocityX: 7,
		localVelocityZ: -3,
	})
	for (const joint of [
		"leftShoulder",
		"leftArm",
		"leftElbow",
		"leftHand",
		"rightShoulder",
		"rightArm",
		"rightElbow",
		"rightHand",
		"weaponMount",
		"weapon",
	] as const) {
		assert.equal(pose[joint], undefined)
	}
})
