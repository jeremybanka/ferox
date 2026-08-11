import assert from "node:assert/strict"
import { test } from "vitest"

import {
	canFollowGroundContour,
	JUMP_PHYSICS,
	stepJumpPhysics,
} from "./JumpPhysics.ts"

test("grounded movement follows descending terrain without becoming airborne", () => {
	const step = stepJumpPhysics(
		{ jumpCount: 0, positionY: 4, velocityY: 0 },
		{
			delta: 1 / 60,
			groundAfter: 3.8,
			groundBefore: 4,
			jumpRequested: false,
		},
	)

	assert.equal(step.groundedBefore, true)
	assert.equal(step.departedGround, false)
	assert.equal(step.positionY, 3.8)
	assert.equal(step.velocityY, 0)
})

test("grounded slope following does not absorb a requested jump", () => {
	const step = stepJumpPhysics(
		{ jumpCount: 0, positionY: 4, velocityY: 0 },
		{
			delta: 0.04,
			groundAfter: 3.8,
			groundBefore: 4,
			jumpRequested: true,
		},
	)

	assert.equal(step.impulse, 1)
	assert.ok(step.positionY > 4)
	assert.ok(step.velocityY > 0)
})

test("continuous downhill contours snap across ordinary per-sample drops", () => {
	assert.equal(canFollowGroundContour(4, 3.7, 3.4), true)
	const step = stepJumpPhysics(
		{ jumpCount: 0, positionY: 4, velocityY: 0 },
		{
			delta: 1 / 30,
			groundAfter: 3.4,
			groundBefore: 4,
			groundMidpoint: 3.7,
			jumpRequested: false,
		},
	)

	assert.equal(step.departedGround, false)
	assert.equal(step.positionY, 3.4)
	assert.equal(step.velocityY, 0)
})

test("ordinary downward steps remain grounded at the snap threshold", () => {
	const drop = JUMP_PHYSICS.maximumGroundSnapDownPerSample
	const step = stepJumpPhysics(
		{ jumpCount: 0, positionY: 5, velocityY: 0 },
		{
			delta: 1 / 60,
			groundAfter: 5 - drop,
			groundBefore: 5,
			groundMidpoint: 5 - drop,
			jumpRequested: false,
		},
	)

	assert.equal(step.departedGround, false)
	assert.equal(step.positionY, 5 - drop)
})

test("a true ledge departs into gravity instead of magnetically snapping", () => {
	const step = stepJumpPhysics(
		{ jumpCount: 0, positionY: 5, velocityY: 0 },
		{
			delta: 0.04,
			groundAfter: 2,
			groundBefore: 5,
			groundMidpoint: 5,
			jumpRequested: false,
		},
	)

	assert.equal(step.groundedBefore, true)
	assert.equal(step.departedGround, true)
	assert.equal(step.jumpCount, 1)
	assert.equal(step.landed, false)
	assert.equal(step.velocityY, -JUMP_PHYSICS.gravity * 0.04)
	assert.ok(step.positionY < 5)
	assert.ok(step.positionY > 2)
	assert.equal(step.coyoteRemaining, JUMP_PHYSICS.coyoteTimeSeconds)
})

test("coyote jump at the inclusive boundary uses the normal first impulse", () => {
	const step = stepJumpPhysics(
		{
			coyoteRemaining: 0,
			jumpCount: 1,
			positionY: 4,
			velocityY: -2,
		},
		{
			delta: 1 / 60,
			groundAfter: 0,
			groundBefore: 0,
			jumpRequested: true,
		},
	)

	assert.equal(step.impulse, 1)
	assert.equal(step.jumpCount, 1)
	assert.equal(step.coyoteRemaining, null)
	assert.ok(step.velocityY < JUMP_PHYSICS.jumpVelocity)
})

test("expired coyote time retains the existing directional-double-jump budget", () => {
	const expired = stepJumpPhysics(
		{
			coyoteRemaining: 0.001,
			jumpCount: 1,
			positionY: 4,
			velocityY: -2,
		},
		{
			delta: 0.002,
			groundAfter: 0,
			groundBefore: 0,
			jumpRequested: false,
		},
	)
	const jumped = stepJumpPhysics(expired, {
		delta: 1 / 60,
		groundAfter: 0,
		groundBefore: 0,
		jumpRequested: true,
	})

	assert.equal(expired.coyoteRemaining, null)
	assert.equal(jumped.impulse, 2)
	assert.equal(jumped.jumpCount, 2)
})

test("momentum-driven departure preserves upward velocity and double jump", () => {
	const takeoffVelocity = 8
	const delta = 0.04
	const step = stepJumpPhysics(
		{ jumpCount: 0, positionY: 5, velocityY: 0 },
		{
			delta,
			groundAfter: 4.8,
			groundBefore: 5,
			jumpRequested: false,
			momentumDepartureVelocityY: takeoffVelocity,
		},
	)

	assert.equal(step.departedGround, true)
	assert.equal(step.impulse, null)
	assert.equal(step.jumpCount, 1)
	assert.equal(step.velocityY, takeoffVelocity - JUMP_PHYSICS.gravity * delta)
	assert.ok(step.positionY > 5)
	assert.equal(step.coyoteRemaining, null)
})

test("a deliberate jump takes precedence over momentum departure", () => {
	const step = stepJumpPhysics(
		{ jumpCount: 0, positionY: 5, velocityY: 0 },
		{
			delta: 0.04,
			groundAfter: 5,
			groundBefore: 5,
			jumpRequested: true,
			momentumDepartureVelocityY: 8,
		},
	)

	assert.equal(step.departedGround, false)
	assert.equal(step.impulse, 1)
	assert.equal(step.jumpCount, 1)
})
