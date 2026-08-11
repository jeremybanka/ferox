import assert from "node:assert/strict"
import { test } from "vitest"

import {
	applyDirectionalDoubleJump,
	cameraRelativeMovementDirection,
	DIRECTIONAL_DOUBLE_JUMP,
	steerDoubleJumpMomentum,
} from "./DirectionalJumpPhysics.ts"

const closeTo = (actual: number, expected: number): void =>
	assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`)

test("camera yaw rotates cardinal and normalized diagonal movement", () => {
	assert.deepEqual(cameraRelativeMovementDirection({ x: 0, y: -1 }, 0), {
		x: 0,
		z: -1,
	})
	const rotated = cameraRelativeMovementDirection({ x: 0, y: -1 }, Math.PI / 2)
	closeTo(rotated?.x ?? 0, -1)
	closeTo(rotated?.z ?? 0, 0)

	const keyboardDiagonal = cameraRelativeMovementDirection({ x: 1, y: -1 }, 0)
	const gamepadDiagonal = cameraRelativeMovementDirection(
		{ x: Math.SQRT1_2, y: -Math.SQRT1_2 },
		0,
	)
	closeTo(keyboardDiagonal?.x ?? 0, gamepadDiagonal?.x ?? 1)
	closeTo(keyboardDiagonal?.z ?? 0, gamepadDiagonal?.z ?? 1)
})

test("double jump redirects within a named limit and preserves speed", () => {
	const incoming = { x: 12, z: 0 }
	const lateral = steerDoubleJumpMomentum(incoming, { x: 0, z: 1 })
	const reversed = steerDoubleJumpMomentum(incoming, { x: -1, z: 0 })

	closeTo(Math.hypot(lateral.x, lateral.z), 12)
	closeTo(
		Math.atan2(lateral.z, lateral.x),
		DIRECTIONAL_DOUBLE_JUMP.maximumRedirectRadians,
	)
	closeTo(Math.hypot(reversed.x, reversed.z), 12)
	closeTo(
		Math.atan2(reversed.z, reversed.x),
		DIRECTIONAL_DOUBLE_JUMP.maximumRedirectRadians,
	)
})

test("aligned, no-input, and zero-momentum jumps do not invent speed", () => {
	const incoming = { x: 5, z: -10 }
	const aligned = steerDoubleJumpMomentum(incoming, incoming)
	const noInput = steerDoubleJumpMomentum(incoming, null)
	const stationary = steerDoubleJumpMomentum({ x: 0, z: 0 }, { x: 1, z: 0 })

	closeTo(aligned.x, incoming.x)
	closeTo(aligned.z, incoming.z)
	assert.deepEqual(noInput, incoming)
	assert.deepEqual(stationary, { x: 0, z: 0 })
	assert.equal(cameraRelativeMovementDirection({ x: 0.1, y: 0 }, 0), null)
})

test("directional steering is gated to the accepted second jump", () => {
	const velocity = { x: 10, z: 0 }
	const desired = { x: 0, z: -1 }
	assert.deepEqual(
		applyDirectionalDoubleJump(velocity, desired, null),
		velocity,
	)
	assert.deepEqual(applyDirectionalDoubleJump(velocity, desired, 1), velocity)
	assert.notDeepEqual(
		applyDirectionalDoubleJump(velocity, desired, 2),
		velocity,
	)
})
