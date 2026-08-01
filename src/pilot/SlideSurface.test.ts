import assert from "node:assert/strict"
import { test } from "vitest"

import { initialSlideHeading } from "./SlideDirection.ts"
import {
	clampSlideInclinationDegrees,
	slideGroundNormalFromGradient,
	slideSurfaceFrameFromGroundNormal,
	slideSurfaceFrameFromInclination,
	slideSurfaceFrameFromMotion,
	type SlideSurfaceFrame,
} from "./SlideSurface.ts"

const EPSILON = 0.000_001

function assertNear(actual: number, expected: number): void {
	assert.ok(
		Math.abs(actual - expected) < EPSILON,
		`expected ${expected}, received ${actual}`,
	)
}

function assertOrthonormal(frame: SlideSurfaceFrame): void {
	for (const vector of [frame.tangent, frame.lateral, frame.normal]) {
		assertNear(Math.hypot(vector.x, vector.y, vector.z), 1)
	}
	assertNear(
		frame.tangent.x * frame.lateral.x +
			frame.tangent.y * frame.lateral.y +
			frame.tangent.z * frame.lateral.z,
		0,
	)
	assertNear(
		frame.tangent.x * frame.normal.x +
			frame.tangent.y * frame.normal.y +
			frame.tangent.z * frame.normal.z,
		0,
	)
	assertNear(
		frame.lateral.x * frame.normal.x +
			frame.lateral.y * frame.normal.y +
			frame.lateral.z * frame.normal.z,
		0,
	)
}

test("visualizer frames use signed uphill, flat, and downhill inclination", () => {
	const heading = initialSlideHeading({ localVelocityX: 0, localVelocityZ: -8 })
	for (const degrees of [-60, -30, 0, 30, 60] as const) {
		const frame = slideSurfaceFrameFromInclination(heading, degrees)
		assertNear(frame.inclinationRadians, (degrees * Math.PI) / 180)
		assert.equal(Math.sign(frame.tangent.y), -Math.sign(degrees))
		assertOrthonormal(frame)
	}
})

test("inclination clamps symmetrically to the practical terrain range", () => {
	assert.equal(clampSlideInclinationDegrees(-90), -60)
	assert.equal(clampSlideInclinationDegrees(90), 60)
	assert.equal(clampSlideInclinationDegrees(Number.NaN), 0)
	const nearVertical = slideSurfaceFrameFromGroundNormal(
		{ localX: 1, localZ: 0 },
		{ x: -100, y: 0.001, z: 0 },
	)
	assertNear(nearVertical.inclinationRadians, -Math.PI / 3)
	assertNear(nearVertical.normal.y, 0.5)
})

test("diagonal azimuth remains normalized across the full incline range", () => {
	const heading = initialSlideHeading({ localVelocityX: 8, localVelocityZ: -8 })
	for (const degrees of [-60, 0, 60] as const) {
		const frame = slideSurfaceFrameFromInclination(heading, degrees)
		assertNear(frame.tangent.x / -frame.tangent.z, 1)
		assertOrthonormal(frame)
	}
})

test("scaled normals and normalized normals produce the same surface frame", () => {
	const heading = initialSlideHeading({ localVelocityX: 4, localVelocityZ: -7 })
	const unit = slideSurfaceFrameFromGroundNormal(heading, {
		x: -0.3,
		y: 0.9,
		z: 0.2,
	})
	const scaled = slideSurfaceFrameFromGroundNormal(heading, {
		x: -3,
		y: 9,
		z: 2,
	})
	for (const axis of ["x", "y", "z"] as const) {
		assertNear(unit.tangent[axis], scaled.tangent[axis])
		assertNear(unit.lateral[axis], scaled.lateral[axis])
		assertNear(unit.normal[axis], scaled.normal[axis])
	}
})

test("zero-speed motion retains the cached travel heading", () => {
	const cached = initialSlideHeading({ localVelocityX: -8, localVelocityZ: 1 })
	const frame = slideSurfaceFrameFromMotion(
		{ localVelocityX: 0, localVelocityZ: 0 },
		{ x: 0, y: 1, z: 0 },
		cached,
	)
	assertNear(frame.tangent.x, cached.localX)
	assertNear(frame.tangent.z, cached.localZ)
})

test("cross-slope travel has zero signed inclination", () => {
	const crossSlopeNormal = slideGroundNormalFromGradient({ x: 0.6, z: 0 })
	const frame = slideSurfaceFrameFromGroundNormal(
		initialSlideHeading({ localVelocityX: 0, localVelocityZ: -8 }),
		crossSlopeNormal,
	)
	assertNear(frame.inclinationRadians, 0)
	assertOrthonormal(frame)
})

test("heading wraparound remains continuous on an inclined surface", () => {
	const before = slideSurfaceFrameFromInclination(
		{
			localX: Math.sin((359 * Math.PI) / 180),
			localZ: -Math.cos((359 * Math.PI) / 180),
		},
		30,
	)
	const after = slideSurfaceFrameFromInclination({ localX: 0, localZ: -1 }, 30)
	const dot =
		before.tangent.x * after.tangent.x +
		before.tangent.y * after.tangent.y +
		before.tangent.z * after.tangent.z
	assert.ok(Math.acos(Math.min(1, Math.max(-1, dot))) < Math.PI / 90)
})
