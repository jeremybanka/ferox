import assert from "node:assert/strict"
import { test } from "vitest"

import { slideDirectionFromMotion } from "./SlideDirection.ts"

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
