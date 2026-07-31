import assert from "node:assert/strict"
import { test } from "vitest"

import { arenaHeightAt } from "./arena-terrain.ts"
import { ARENA_SEED, PLAYER_CROUCH_BASE_SPEED_LIMIT } from "./game-constants.ts"
import {
	sampleTerrainGradient,
	SLIDE_PHYSICS,
	stepSlidePhysics,
} from "./SlidePhysics.ts"

const flatGradient = { x: 0, z: 0 }

test("flat crouching enters slide only above the crouch speed limit", () => {
	const atLimit = stepSlidePhysics(
		{ sliding: false, x: PLAYER_CROUCH_BASE_SPEED_LIMIT, z: 0 },
		{
			crouching: true,
			delta: 1 / 60,
			grounded: true,
			terrainGradient: flatGradient,
		},
	)
	const aboveLimit = stepSlidePhysics(
		{ sliding: false, x: PLAYER_CROUCH_BASE_SPEED_LIMIT + 0.01, z: 0 },
		{
			crouching: true,
			delta: 1 / 60,
			grounded: true,
			terrainGradient: flatGradient,
		},
	)

	assert.equal(atLimit.sliding, false)
	assert.equal(aboveLimit.sliding, true)
	assert.ok(aboveLimit.x < PLAYER_CROUCH_BASE_SPEED_LIMIT + 0.01)
})

test("downhill sliding gains momentum and uphill sliding loses it", () => {
	const options = {
		crouching: true,
		delta: 0.25,
		grounded: true,
		terrainGradient: { x: 0.25, z: 0 },
	}
	const downhill = stepSlidePhysics({ sliding: true, x: -6, z: 0 }, options)
	const uphill = stepSlidePhysics({ sliding: true, x: 6, z: 0 }, options)

	assert.ok(Math.hypot(downhill.x, downhill.z) > 6)
	assert.ok(Math.hypot(uphill.x, uphill.z) < 6)
	assert.ok(downhill.downhillAcceleration.x < 0)
})

test("crouching on a slope initiates downhill motion from rest", () => {
	const step = stepSlidePhysics(
		{ sliding: false, x: 0, z: 0 },
		{
			crouching: true,
			delta: 0.1,
			grounded: true,
			terrainGradient: { x: 0.2, z: -0.1 },
		},
	)

	assert.equal(step.sliding, true)
	assert.ok(step.x < 0)
	assert.ok(step.z > 0)
})

test("slide exits below its flat-ground floor and immediately when airborne", () => {
	const belowExit = stepSlidePhysics(
		{ sliding: true, x: SLIDE_PHYSICS.exitSpeed, z: 0 },
		{
			crouching: true,
			delta: 1 / 60,
			grounded: true,
			terrainGradient: flatGradient,
		},
	)
	const released = stepSlidePhysics(
		{ sliding: true, x: 8, z: 0 },
		{
			crouching: false,
			delta: 1 / 60,
			grounded: true,
			terrainGradient: { x: 0.3, z: 0 },
		},
	)
	const airborne = stepSlidePhysics(
		{ sliding: true, x: 8, z: 0 },
		{
			crouching: true,
			delta: 1 / 60,
			grounded: false,
			terrainGradient: { x: 0.3, z: 0 },
		},
	)

	assert.equal(belowExit.sliding, false)
	assert.equal(released.sliding, false)
	assert.equal(airborne.sliding, false)
	assert.equal(airborne.x, 8)
})

test("terrain gradients use stable centered finite differences", () => {
	const gradient = sampleTerrainGradient(
		(x, z) => 0.5 * x - 0.25 * z + 3,
		12,
		-7,
	)

	assert.ok(Math.abs(gradient.x - 0.5) < 1e-10)
	assert.ok(Math.abs(gradient.z + 0.25) < 1e-10)
})

test("arena terrain sampling drives a resting crouch downhill", () => {
	const x = 0
	const z = 13
	const heightAt = (sampleX: number, sampleZ: number): number =>
		arenaHeightAt(ARENA_SEED, sampleX, sampleZ)
	const step = stepSlidePhysics(
		{ sliding: false, x: 0, z: 0 },
		{
			crouching: true,
			delta: 0.1,
			grounded: true,
			terrainGradient: sampleTerrainGradient(heightAt, x, z),
		},
	)

	assert.equal(step.sliding, true)
	assert.ok(heightAt(x + step.x * 0.1, z + step.z * 0.1) < heightAt(x, z))
})
