import assert from "node:assert/strict"
import { test } from "vitest"

import { arenaHeightAt } from "./arena-terrain.ts"
import {
	ARENA_SEED,
	PLAYER_RUN_SPEED_LIMIT,
	PLAYER_SPRINT_SPEED_LIMIT,
} from "./game-constants.ts"
import { JUMP_PHYSICS, stepJumpPhysics } from "./JumpPhysics.ts"
import {
	limitHorizontalSpeed,
	movementSpeedLimit,
	resolveSlideSurfaceContact,
	sampleTerrainGradient,
	SLIDE_PHYSICS,
	slopeAngleFromTerrainGradient,
	stepSlidePhysics,
} from "./SlidePhysics.ts"

const flatGradient = { x: 0, z: 0 }

function gradientAtDegrees(degrees: number): { x: number; z: number } {
	return { x: Math.tan((degrees * Math.PI) / 180), z: 0 }
}

test("flat crouching requires planar momentum strictly above base move speed", () => {
	const epsilon = 0.001
	const outcomes = [
		{ expected: false, speed: PLAYER_RUN_SPEED_LIMIT - epsilon },
		{ expected: false, speed: PLAYER_RUN_SPEED_LIMIT },
		{ expected: true, speed: PLAYER_RUN_SPEED_LIMIT + epsilon },
	]

	for (const outcome of outcomes) {
		const step = stepSlidePhysics(
			{ sliding: false, x: outcome.speed, z: 0 },
			{
				crouching: true,
				delta: 0,
				grounded: true,
				terrainGradient: flatGradient,
			},
		)
		assert.equal(step.sliding, outcome.expected)
		assert.equal(
			step.x,
			outcome.expected
				? outcome.speed + SLIDE_PHYSICS.entrySpeedBoost
				: outcome.speed,
		)
	}
})

test("resting crouch starts sliding at a 30 degree slope boundary", () => {
	const outcomes = [
		{ degrees: 29.9, expected: false },
		{ degrees: SLIDE_PHYSICS.entrySlopeDegrees, expected: true },
		{ degrees: 30.1, expected: true },
	]

	for (const outcome of outcomes) {
		const terrainGradient = gradientAtDegrees(outcome.degrees)
		const step = stepSlidePhysics(
			{ sliding: false, x: 0, z: 0 },
			{
				crouching: true,
				delta: 0.1,
				grounded: true,
				terrainGradient,
			},
		)
		assert.ok(
			Math.abs((step.slopeAngleRadians * 180) / Math.PI - outcome.degrees) <
				1e-10,
		)
		assert.equal(step.sliding, outcome.expected)
		if (outcome.expected) assert.ok(step.x < 0)
	}
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

test("crouching from rest on a qualifying diagonal slope moves downhill", () => {
	const step = stepSlidePhysics(
		{ sliding: false, x: 0, z: 0 },
		{
			crouching: true,
			delta: 0.1,
			grounded: true,
			terrainGradient: { x: 0.5, z: -0.5 },
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

test("an active slide uses exit-speed hysteresis below the entry speed", () => {
	const continued = stepSlidePhysics(
		{ sliding: true, x: PLAYER_RUN_SPEED_LIMIT, z: 0 },
		{
			crouching: true,
			delta: 0,
			grounded: true,
			terrainGradient: flatGradient,
		},
	)
	const stopped = stepSlidePhysics(
		{ sliding: true, x: SLIDE_PHYSICS.exitSpeed, z: 0 },
		{
			crouching: true,
			delta: 0,
			grounded: true,
			terrainGradient: flatGradient,
		},
	)

	assert.equal(continued.sliding, true)
	assert.equal(stopped.sliding, false)
})

test("terrain gradients use stable centered finite differences", () => {
	const gradient = sampleTerrainGradient(
		(x, z) => 0.5 * x - 0.25 * z + 3,
		12,
		-7,
	)

	assert.ok(Math.abs(gradient.x - 0.5) < 1e-10)
	assert.ok(Math.abs(gradient.z + 0.25) < 1e-10)
	assert.ok(
		Math.abs(
			slopeAngleFromTerrainGradient(gradient) -
				Math.atan(Math.hypot(0.5, 0.25)),
		) < 1e-10,
	)
})

test("ordinary shallow arena terrain keeps a resting crouch out of slide", () => {
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

	assert.ok(step.slopeAngleRadians < SLIDE_PHYSICS.entrySlopeRadians)
	assert.equal(step.movementState, "crouching")
	assert.equal(step.sliding, false)
	assert.equal(step.x, 0)
	assert.equal(step.z, 0)
})

test("slide entry boosts speed once without rotating momentum", () => {
	const velocity = { x: 9, z: -2.25 }
	const originalSpeed = Math.hypot(velocity.x, velocity.z)
	const step = stepSlidePhysics(
		{ ...velocity, sliding: false },
		{
			crouching: true,
			delta: 0,
			grounded: true,
			terrainGradient: flatGradient,
		},
	)
	const sustained = stepSlidePhysics(
		{ sliding: true, x: step.x, z: step.z },
		{
			crouching: true,
			delta: 0,
			grounded: true,
			terrainGradient: flatGradient,
		},
	)

	assert.equal(step.movementState, "sliding")
	assert.ok(
		Math.abs(
			Math.hypot(step.x, step.z) -
				(originalSpeed + SLIDE_PHYSICS.entrySpeedBoost),
		) < 1e-10,
	)
	assert.ok(Math.abs(step.x / step.z - velocity.x / velocity.z) < 1e-10)
	assert.equal(sustained.x, step.x)
	assert.equal(sustained.z, step.z)
})

test("leaving and re-entering a slide permits one new entry boost", () => {
	const options = {
		crouching: true,
		delta: 0,
		grounded: true,
		terrainGradient: flatGradient,
	}
	const first = stepSlidePhysics(
		{ sliding: false, x: PLAYER_RUN_SPEED_LIMIT + 1, z: 0 },
		options,
	)
	const exited = stepSlidePhysics(
		{ sliding: true, x: first.x, z: first.z },
		{ ...options, crouching: false },
	)
	const second = stepSlidePhysics(
		{ sliding: exited.sliding, x: exited.x, z: exited.z },
		options,
	)

	assert.equal(exited.sliding, false)
	assert.equal(second.sliding, true)
	assert.equal(second.x, first.x + SLIDE_PHYSICS.entrySpeedBoost)
})

test("a crouched high-speed landing resolves slide without losing momentum", () => {
	const velocity = { x: -7, z: -7 }
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
	assert.ok(Math.hypot(slide.x, slide.z) > Math.hypot(velocity.x, velocity.z))
})

test("airborne crouch waits for a qualifying landing before entering slide", () => {
	const airborne = stepSlidePhysics(
		{ sliding: false, x: PLAYER_RUN_SPEED_LIMIT + 1, z: 0 },
		{
			crouching: true,
			delta: 0,
			grounded: false,
			terrainGradient: gradientAtDegrees(40),
		},
	)
	const exactBaseLanding = stepSlidePhysics(
		{ sliding: false, x: PLAYER_RUN_SPEED_LIMIT, z: 0 },
		{
			crouching: true,
			delta: 0,
			grounded: true,
			terrainGradient: flatGradient,
		},
	)
	const steepLanding = stepSlidePhysics(
		{ sliding: false, x: 0, z: 0 },
		{
			crouching: true,
			delta: 0,
			grounded: true,
			terrainGradient: gradientAtDegrees(30),
		},
	)

	assert.equal(airborne.movementState, "airborne")
	assert.equal(airborne.sliding, false)
	assert.equal(airborne.x, PLAYER_RUN_SPEED_LIMIT + 1)
	assert.equal(exactBaseLanding.movementState, "crouching")
	assert.equal(steepLanding.movementState, "sliding")
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
		null,
	)
})

test("airborne horizontal speed accumulates beyond the old cap without truncation", () => {
	const velocity = { x: PLAYER_SPRINT_SPEED_LIMIT + 6, z: 9 }
	const limited = limitHorizontalSpeed(velocity, {
		crouching: false,
		grounded: false,
		sliding: false,
		sprinting: false,
	})

	assert.deepEqual(limited, velocity)
	assert.ok(Math.hypot(limited.x, limited.z) > PLAYER_SPRINT_SPEED_LIMIT)
})

test("grounded run and sprint caps remain unchanged", () => {
	const velocity = { x: PLAYER_SPRINT_SPEED_LIMIT + 6, z: 0 }
	const run = limitHorizontalSpeed(velocity, {
		crouching: false,
		grounded: true,
		sliding: false,
		sprinting: false,
	})
	const sprint = limitHorizontalSpeed(velocity, {
		crouching: false,
		grounded: true,
		sliding: false,
		sprinting: true,
	})

	assert.equal(Math.hypot(run.x, run.z), PLAYER_RUN_SPEED_LIMIT)
	assert.equal(Math.hypot(sprint.x, sprint.z), PLAYER_SPRINT_SPEED_LIMIT)
})

test("slide speed cap is 500 km/h in both slide limit paths", () => {
	const cap = 500 / 3.6
	assert.equal(SLIDE_PHYSICS.maximumSpeed, cap)
	const atCap = stepSlidePhysics(
		{ sliding: true, x: cap, z: 0 },
		{
			crouching: true,
			delta: 0,
			grounded: true,
			terrainGradient: flatGradient,
		},
	)
	const overCap = stepSlidePhysics(
		{ sliding: true, x: cap * 2, z: cap },
		{
			crouching: true,
			delta: 0,
			grounded: true,
			terrainGradient: flatGradient,
		},
	)
	const loopLimited = limitHorizontalSpeed(
		{ x: cap * 2, z: cap },
		{ crouching: true, grounded: true, sliding: true, sprinting: false },
	)

	assert.equal(atCap.x, cap)
	assert.equal(Math.hypot(overCap.x, overCap.z), cap)
	assert.equal(Math.hypot(loopLimited.x, loopLimited.z), cap)
	assert.ok(overCap.x > 0 && overCap.z > 0)
})

test("a rising slide detaches over a crest but follows supported terrain", () => {
	const shared = {
		delta: 0.04,
		groundBefore: 2,
		terrainGradient: { x: 0.5, z: 0 },
		velocity: { x: 20, z: 0 },
	}
	const supported = resolveSlideSurfaceContact({
		...shared,
		groundMidpoint: 2.2,
		groundAfter: 2.4,
	})
	const crest = resolveSlideSurfaceContact({
		...shared,
		groundMidpoint: 2.08,
		groundAfter: 2.08,
	})

	assert.deepEqual(supported, { detached: false, verticalVelocity: 0 })
	assert.equal(crest.detached, true)
	assert.equal(crest.verticalVelocity, 10)
})

test("surface contact tolerance rejects noise and exact-boundary separation", () => {
	const delta = 0.04
	const verticalVelocity = 4
	const ballisticMidpoint =
		verticalVelocity * (delta / 2) -
		0.5 * SLIDE_PHYSICS.gravity * (delta / 2) ** 2
	const ballisticAfter =
		verticalVelocity * delta - 0.5 * SLIDE_PHYSICS.gravity * delta ** 2
	const contact = resolveSlideSurfaceContact({
		delta,
		groundAfter: ballisticAfter - SLIDE_PHYSICS.contactSeparationTolerance,
		groundBefore: 0,
		groundMidpoint:
			ballisticMidpoint - SLIDE_PHYSICS.contactSeparationTolerance,
		terrainGradient: { x: 0.2, z: 0 },
		velocity: { x: 20, z: 0 },
	})

	assert.equal(contact.detached, false)
})

test("crest detachment stays deterministic across representative frame deltas", () => {
	for (const delta of [1 / 60, 1 / 30, JUMP_PHYSICS.maximumStepSeconds]) {
		const contact = resolveSlideSurfaceContact({
			delta,
			groundAfter: 0,
			groundBefore: 0,
			groundMidpoint: 0,
			terrainGradient: { x: 0.5, z: 0 },
			velocity: { x: 40, z: 0 },
		})
		assert.equal(contact.detached, true, `delta ${delta}`)
		assert.equal(contact.verticalVelocity, 20)
	}
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
