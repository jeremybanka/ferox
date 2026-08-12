import { describe, expect, test } from "vitest"

import {
	isGrappleActionIntent,
	isGrapplePickupSnapshot,
	isGrappleStateSnapshot,
	isJumpDirection,
	isJumpDirectionForImpulse,
	isJumpImpulse,
	isJumpSequence,
} from "./arena-protocol.ts"

describe("grapple protocol", () => {
	test("validates jump impulse edges and monotonic-safe sequence values", () => {
		expect(isJumpImpulse(null)).toBe(true)
		expect(isJumpImpulse(1)).toBe(true)
		expect(isJumpImpulse(2)).toBe(true)
		expect(isJumpImpulse(0)).toBe(false)
		expect(isJumpImpulse(3)).toBe(false)
		expect(isJumpDirection(null)).toBe(true)
		expect(isJumpDirection([0, 0])).toBe(true)
		expect(isJumpDirection([Math.SQRT1_2, -Math.SQRT1_2])).toBe(true)
		expect(isJumpDirection([1.01, 0])).toBe(false)
		expect(isJumpDirection([Number.MIN_VALUE, 0])).toBe(false)
		expect(isJumpDirection([Number.NaN, 0])).toBe(false)
		expect(isJumpDirection([1])).toBe(false)
		expect(isJumpDirectionForImpulse(null, 1)).toBe(true)
		expect(isJumpDirectionForImpulse([0, 0], 2)).toBe(true)
		expect(isJumpDirectionForImpulse(null, 2)).toBe(false)
		expect(isJumpDirectionForImpulse([1, 0], 1)).toBe(false)
		expect(isJumpSequence(0)).toBe(true)
		expect(isJumpSequence(Number.MAX_SAFE_INTEGER)).toBe(true)
		expect(isJumpSequence(-1)).toBe(false)
		expect(isJumpSequence(1.5)).toBe(false)
		expect(isJumpSequence(Number.POSITIVE_INFINITY)).toBe(false)
	})

	test("strictly validates sequenced client actions", () => {
		expect(isGrappleActionIntent({ clientActionId: 1, type: "collect" })).toBe(
			true,
		)
		expect(
			isGrappleActionIntent({
				clientActionId: 2,
				direction: [0, 0, -1],
				origin: [1, 2, 3],
				type: "attach",
			}),
		).toBe(true)
		expect(isGrappleActionIntent({ clientActionId: 2, type: "attach" })).toBe(
			false,
		)
		expect(
			isGrappleActionIntent({ clientActionId: 1, extra: true, type: "drop" }),
		).toBe(false)
	})

	test("requires coherent explicit replicated phases", () => {
		expect(
			isGrappleStateSnapshot({
				anchor: null,
				attachedAt: null,
				ownerId: "pilot",
				phase: "idle",
				ropeLength: null,
				sequence: 1,
				surfaceId: null,
			}),
		).toBe(true)
		expect(
			isGrappleStateSnapshot({
				anchor: [0, 8, -10],
				attachedAt: 2,
				ownerId: "pilot",
				phase: "attached",
				ropeLength: 12,
				sequence: 2,
				surfaceId: "wall-1",
			}),
		).toBe(true)
		expect(
			isGrappleStateSnapshot({
				anchor: null,
				attachedAt: 2,
				ownerId: "pilot",
				phase: "attached",
				ropeLength: 12,
				sequence: 2,
				surfaceId: "wall-1",
			}),
		).toBe(false)
	})

	test("validates pickup lifecycle without accepting extra fields", () => {
		expect(
			isGrapplePickupSnapshot({
				available: true,
				availableAt: null,
				ownerId: null,
				position: [0, 1, -27],
			}),
		).toBe(true)
		expect(isGrapplePickupSnapshot({ available: true })).toBe(false)
	})
})
