import { describe, expect, test } from "vitest"

import {
	isJumpDirection,
	isJumpDirectionForImpulse,
	isJumpSequence,
} from "./arena-protocol.ts"

describe("jump direction protocol", () => {
	test.each([null, [0, 0], [1, 0], [0, -1], [Math.SQRT1_2, Math.SQRT1_2]])(
		"accepts a bounded two-component direction: %j",
		(direction) => {
			expect(isJumpDirection(direction)).toBe(true)
		},
	)

	test.each([
		undefined,
		[0],
		[0, 0, 0],
		[Number.MIN_VALUE, 0],
		[1.001, 0],
		[Number.NaN, 0],
		[Number.POSITIVE_INFINITY, 0],
		["1", 0],
	])("rejects a malformed or oversized direction: %j", (direction) => {
		expect(isJumpDirection(direction)).toBe(false)
	})

	test("requires a direction only on double-jump edges", () => {
		expect(isJumpDirectionForImpulse(null, null)).toBe(true)
		expect(isJumpDirectionForImpulse(null, 1)).toBe(true)
		expect(isJumpDirectionForImpulse([0, 0], 2)).toBe(true)
		expect(isJumpDirectionForImpulse(null, 2)).toBe(false)
		expect(isJumpDirectionForImpulse([1, 0], 1)).toBe(false)
	})

	test("accepts only non-negative safe jump sequences", () => {
		expect(isJumpSequence(0)).toBe(true)
		expect(isJumpSequence(Number.MAX_SAFE_INTEGER)).toBe(true)
		expect(isJumpSequence(-1)).toBe(false)
		expect(isJumpSequence(1.5)).toBe(false)
		expect(isJumpSequence(Number.MAX_SAFE_INTEGER + 1)).toBe(false)
	})
})
