import assert from "node:assert/strict"
import { test } from "vitest"

import { arenaHeightAt } from "./arena-terrain.ts"
import {
	ARENA_SEED,
	PLAYER_CROUCH_BASE_SPEED_LIMIT,
	PLAYER_SPRINT_SPEED_LIMIT,
} from "./game-constants.ts"
import { stepJumpPhysics } from "./JumpPhysics.ts"
import {
	movementSpeedLimit,
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

test("run to crouch transfers above-limit momentum directly into slide", () => {
	const velocity = { x: 7.5, z: -2.25 }
	const step = stepSlidePhysics(
		{ ...velocity, sliding: false },
		{
			crouching: true,
			delta: 0,
			grounded: true,
			terrainGradient: flatGradient,
		},
	)

	assert.equal(step.movementState, "sliding")
	assert.equal(step.x, velocity.x)
	assert.equal(step.z, velocity.z)
})

test("a crouched high-speed landing resolves slide without losing momentum", () => {
	const velocity = { x: -3.5, z: -6.5 }
	const landing = stepJumpPhysics(
		{ jumpCount: 1, positionY: 4.4, velocityY: -8 },
		{
			delta: 0.04,
			groundAfter: 4.2,
			groundBefore: 4.2,
			jumpRequested: false,
		},
	)
	const slide = stepSlidePhysics(
		{ ...velocity, sliding: false },
		{
			crouching: true,
			delta: 0,
			grounded: landing.landed,
			terrainGradient: flatGradient,
		},
	)

	assert.equal(landing.landed, true)
	assert.equal(slide.movementState, "sliding")
	assert.equal(slide.x, velocity.x)
	assert.equal(slide.z, velocity.z)
})

test("slide jump and airborne transitions retain planar momentum", () => {
	const velocity = { x: 4.25, z: -8.5 }
	const jump = stepJumpPhysics(
		{ jumpCount: 0, positionY: 3, velocityY: 0 },
		{
			delta: 0.04,
			groundAfter: 3,
			groundBefore: 3,
			jumpRequested: true,
		},
	)
	const airborne = stepSlidePhysics(
		{ ...velocity, sliding: true },
		{
			crouching: true,
			delta: 0,
			grounded: false,
			terrainGradient: flatGradient,
		},
	)

	assert.equal(jump.impulse, 1)
	assert.equal(airborne.movementState, "airborne")
	assert.equal(airborne.x, velocity.x)
	assert.equal(airborne.z, velocity.z)
	assert.equal(
		movementSpeedLimit({
			crouching: true,
			grounded: false,
			sliding: false,
			sprinting: false,
		}),
		PLAYER_SPRINT_SPEED_LIMIT,
	)
})

test("ledge departure retains planar slide velocity while gravity takes over", () => {
	const velocity = { x: 10, z: 1.5 }
	const departure = stepJumpPhysics(
		{ jumpCount: 0, positionY: 6, velocityY: 0 },
		{
			delta: 0.04,
			groundAfter: 2,
			groundBefore: 6,
			groundMidpoint: 6,
			jumpRequested: false,
		},
	)
	const airborne = stepSlidePhysics(
		{ ...velocity, sliding: true },
		{
			crouching: true,
			delta: 0,
			grounded: !departure.departedGround,
			terrainGradient: flatGradient,
		},
	)

	assert.equal(departure.departedGround, true)
	assert.ok(departure.velocityY < 0)
	assert.equal(airborne.movementState, "airborne")
	assert.equal(airborne.x, velocity.x)
	assert.equal(airborne.z, velocity.z)
})
