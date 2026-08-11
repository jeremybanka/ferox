import assert from "node:assert/strict"
import { test } from "vitest"

import {
	applyDirectionalDoubleJump,
	cameraRelativeMovementDirection,
	DIRECTIONAL_DOUBLE_JUMP,
	directionalDoubleJumpImpulse,
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

test("double jump adds a bounded impulse without normalizing momentum", () => {
	const incoming = { x: 12, z: 0 }
	const aligned = applyDirectionalDoubleJump(incoming, { x: 1, z: 0 }, 2)
	const lateral = applyDirectionalDoubleJump(incoming, { x: 0, z: 1 }, 2)
	const opposite = applyDirectionalDoubleJump(incoming, { x: -1, z: 0 }, 2)
	const impulseSpeed = DIRECTIONAL_DOUBLE_JUMP.planarImpulseSpeed

	assert.deepEqual(aligned, { x: 12 + impulseSpeed, z: 0 })
	assert.deepEqual(lateral, { x: 12, z: impulseSpeed })
	assert.deepEqual(opposite, { x: 12 - impulseSpeed, z: 0 })
	assert.ok(opposite.x > 0, "opposing input should airbrake, not reverse")
})

test("diagonal and arbitrary directions receive the same impulse magnitude", () => {
	const diagonal = directionalDoubleJumpImpulse({ x: 1, z: -1 })
	const arbitrary = directionalDoubleJumpImpulse({ x: -0.2, z: 0.9 })

	closeTo(
		Math.hypot(diagonal.x, diagonal.z),
		DIRECTIONAL_DOUBLE_JUMP.planarImpulseSpeed,
	)
	closeTo(
		Math.hypot(arbitrary.x, arbitrary.z),
		DIRECTIONAL_DOUBLE_JUMP.planarImpulseSpeed,
	)
})

test("no input preserves momentum while input can launch from rest", () => {
	const incoming = { x: 5, z: -10 }
	const noInput = applyDirectionalDoubleJump(incoming, null, 2)
	const stationary = applyDirectionalDoubleJump(
		{ x: 0, z: 0 },
		{ x: 1, z: 0 },
		2,
	)

	assert.deepEqual(noInput, incoming)
	assert.deepEqual(stationary, {
		x: DIRECTIONAL_DOUBLE_JUMP.planarImpulseSpeed,
		z: 0,
	})
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

test("subnormal directions resolve to a finite zero impulse", () => {
	const impulse = directionalDoubleJumpImpulse({
		x: Number.MIN_VALUE,
		z: 0,
	})
	assert.deepEqual(impulse, { x: 0, z: 0 })
	assert.ok(Number.isFinite(impulse.x))
	assert.ok(Number.isFinite(impulse.z))
})
