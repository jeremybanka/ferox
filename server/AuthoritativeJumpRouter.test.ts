import { describe, expect, test } from "vitest"

import { INITIAL_MANTLE_STATE } from "../src/MantleTraversal.ts"
import { INITIAL_WALL_TRAVERSAL_STATE } from "../src/WallTraversal.ts"
import { reconcileAuthoritativeGrappleJump } from "./AuthoritativeGrappleJump.ts"
import {
	initialAuthoritativeJumpRoute,
	routeAuthoritativeJumpSignal,
} from "./AuthoritativeJumpRouter.ts"
import { reconcileAuthoritativeMovement } from "./AuthoritativeMovement.ts"

describe("authoritative jump routing integration", () => {
	test("routes an attached edge only through grapple and never replays it after detach", () => {
		const attached = routeAuthoritativeJumpSignal(
			initialAuthoritativeJumpRoute(4),
			{
				grappleAttached: true,
				lifeSequence: 4,
				reported: { direction: [1, 0], impulse: 2, sequence: 1 },
			},
		)

		expect(attached.movement).toBeNull()
		expect(
			reconcileAuthoritativeGrappleJump({
				groundedBefore: false,
				jumpCount: 1,
				requestedDirection: [...attached.grapple!.direction!],
				requestedImpulse: attached.grapple!.impulse,
			}),
		).toMatchObject({ acceptedImpulse: 2, jumpCount: 2 })

		const detachedReplay = routeAuthoritativeJumpSignal(attached.state, {
			grappleAttached: false,
			lifeSequence: 4,
			reported: { direction: [1, 0], impulse: 2, sequence: 1 },
		})
		expect(detachedReplay.grapple).toBeNull()
		expect(detachedReplay.movement).toMatchObject({
			direction: null,
			impulse: null,
			sequence: 1,
		})
	})

	test("consumes gaps without impulse and accepts sequence one again for a new life", () => {
		const gap = routeAuthoritativeJumpSignal(initialAuthoritativeJumpRoute(7), {
			grappleAttached: false,
			lifeSequence: 7,
			reported: { direction: null, impulse: 1, sequence: 3 },
		})
		expect(gap.movement).toMatchObject({ impulse: null, sequence: 3 })

		const nextLife = routeAuthoritativeJumpSignal(gap.state, {
			grappleAttached: false,
			lifeSequence: 8,
			reported: { direction: null, impulse: 1, sequence: 1 },
		})
		expect(nextLife.movement).toMatchObject({ impulse: 1, sequence: 1 })
		expect(nextLife.state).toEqual({ lifeSequence: 8, sequence: 1 })
	})

	test("routes a coyote jump through movement while attached traversal stays suppressed", () => {
		const routed = routeAuthoritativeJumpSignal(
			initialAuthoritativeJumpRoute(2),
			{
				grappleAttached: false,
				lifeSequence: 2,
				reported: { direction: null, impulse: 1, sequence: 1 },
			},
		)
		const movement = reconcileAuthoritativeMovement({
			contact: null,
			coyoteDelta: 0.02,
			crouching: false,
			delta: 0.02,
			grounded: false,
			jump: 1,
			jumpDirection: routed.movement!.direction,
			jumpImpulse: routed.movement!.impulse,
			previousCoyoteRemaining: 0.08,
			previousGrounded: false,
			previousJump: 1,
			previousMantle: INITIAL_MANTLE_STATE,
			previousVelocity: [2, -1, 0],
			previousWallTraversal: INITIAL_WALL_TRAVERSAL_STATE,
			reportedWallTraversal: { mode: "none", normal: [0, 0, 0] },
			sliding: false,
			velocity: [2, -1, 0],
			viewDirection: [0, 0, -1],
		})

		expect(routed.grapple).toBeNull()
		expect(movement.jump).toBe(1)
		expect(movement.coyoteRemaining).toBeNull()
		expect(movement.velocity[1]).toBeGreaterThan(0)
	})
})
