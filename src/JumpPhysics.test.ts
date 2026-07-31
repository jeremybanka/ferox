import assert from "node:assert/strict"
import { test } from "vitest"

import { stepJumpPhysics } from "./JumpPhysics.ts"

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
