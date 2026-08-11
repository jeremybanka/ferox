import { describe, expect, test } from "vitest"

import type { ArenaSurfaceContact } from "../src/ArenaWorld.ts"
import { SLIDE_PHYSICS } from "../src/SlidePhysics.ts"
import { INITIAL_WALL_TRAVERSAL_STATE } from "../src/WallTraversal.ts"
import { reconcileAuthoritativeMovement } from "./AuthoritativeMovement.ts"

const wallContact: ArenaSurfaceContact = {
	inclinationRadians: Math.PI / 2,
	normal: [1, 0, 0],
	point: [0, 3, 0],
	surfaceId: "wall-a",
	time: 1,
}

describe("authoritative wall movement", () => {
	test("does not reset jump availability for a forged wall mode away from geometry", () => {
		const state = reconcileAuthoritativeMovement({
			contact: null,
			crouching: false,
			delta: 1 / 60,
			grounded: false,
			jump: 2,
			previousWallTraversal: INITIAL_WALL_TRAVERSAL_STATE,
			reportedWallTraversal: { mode: "run", normal: [1, 0, 0] },
			sliding: false,
			velocity: [0, -2, 9],
			viewDirection: [0, 0, 1],
		})

		expect(state.jump).toBe(2)
		expect(state.wallTraversal).toEqual({ mode: "none", normal: [0, 0, 0] })
	})

	test("derives steep terrain presentation instead of trusting slide flags", () => {
		const state = reconcileAuthoritativeMovement({
			contact: null,
			crouching: false,
			delta: 1 / 60,
			grounded: true,
			jump: 0,
			previousWallTraversal: INITIAL_WALL_TRAVERSAL_STATE,
			reportedWallTraversal: { mode: "none", normal: [0, 0, 0] },
			sliding: true,
			terrainGradient: { x: Math.tan((60.1 * Math.PI) / 180), z: 0 },
			velocity: [0, 0, 0],
			viewDirection: [0, 0, 1],
		})

		expect(state.surfaceSliding).toBe(true)
		expect(state.sliding).toBe(false)
		expect(state.wallTraversal.mode).toBe("slide")
	})

	test("rejects an airborne first-jump report after coyote time expires", () => {
		const state = reconcileAuthoritativeMovement({
			contact: null,
			crouching: false,
			delta: 1 / 60,
			grounded: false,
			jump: 1,
			previousCoyoteRemaining: null,
			previousGrounded: false,
			previousWallTraversal: INITIAL_WALL_TRAVERSAL_STATE,
			reportedWallTraversal: { mode: "none", normal: [0, 0, 0] },
			sliding: false,
			velocity: [0, 10, 0],
			viewDirection: [0, 0, 1],
		})

		expect(state.jump).toBe(2)
		expect(state.coyoteRemaining).toBeNull()
		expect(state.velocity[1]).toBe(9.4)
	})

	test("opens and advances coyote only for ordinary unsupported departure", () => {
		const departed = reconcileAuthoritativeMovement({
			contact: null,
			crouching: false,
			delta: 0.05,
			grounded: false,
			jump: 1,
			previousGrounded: true,
			previousSliding: false,
			previousSurfaceSliding: false,
			previousWallTraversal: INITIAL_WALL_TRAVERSAL_STATE,
			reportedWallTraversal: { mode: "none", normal: [0, 0, 0] },
			sliding: false,
			velocity: [5, -1, 0],
			viewDirection: [0, 0, 1],
		})
		const nextPacket = reconcileAuthoritativeMovement({
			contact: null,
			crouching: false,
			delta: 0.04,
			grounded: false,
			jump: 1,
			previousCoyoteRemaining: departed.coyoteRemaining,
			previousGrounded: false,
			previousSliding: false,
			previousSurfaceSliding: false,
			previousWallTraversal: departed.traversalState,
			reportedWallTraversal: departed.wallTraversal,
			sliding: false,
			velocity: [5, -2, 0],
			viewDirection: [0, 0, 1],
		})

		expect(departed.coyoteRemaining).toBe(0.1)
		expect(nextPacket.coyoteRemaining).toBeCloseTo(0.06)
	})

	test.each([
		{
			label: "regular slide crest",
			previousSliding: true,
			previousSurfaceSliding: false,
			previousWallTraversal: INITIAL_WALL_TRAVERSAL_STATE,
		},
		{
			label: "automatic steep-surface release",
			previousSliding: false,
			previousSurfaceSliding: true,
			previousWallTraversal: INITIAL_WALL_TRAVERSAL_STATE,
		},
		{
			label: "wall release",
			previousSliding: false,
			previousSurfaceSliding: false,
			previousWallTraversal: {
				...INITIAL_WALL_TRAVERSAL_STATE,
				mode: "slide" as const,
				surfaceId: "wall-a",
			},
		},
	])("does not open coyote after $label", (cause) => {
		const state = reconcileAuthoritativeMovement({
			contact: null,
			crouching: false,
			delta: 0.05,
			grounded: false,
			jump: 1,
			previousGrounded: true,
			previousSliding: cause.previousSliding,
			previousSurfaceSliding: cause.previousSurfaceSliding,
			previousWallTraversal: cause.previousWallTraversal,
			reportedWallTraversal: { mode: "none", normal: [0, 0, 0] },
			sliding: false,
			velocity: [5, -1, 0],
			viewDirection: [0, 0, 1],
		})

		expect(state.coyoteRemaining).toBeNull()
	})

	test("accepts the inclusive coyote boundary but rejects the next packet", () => {
		const atBoundary = reconcileAuthoritativeMovement({
			contact: null,
			crouching: false,
			delta: 0.05,
			grounded: false,
			jump: 1,
			previousCoyoteRemaining: 0.05,
			previousGrounded: false,
			previousWallTraversal: INITIAL_WALL_TRAVERSAL_STATE,
			reportedWallTraversal: { mode: "none", normal: [0, 0, 0] },
			sliding: false,
			velocity: [5, 8, 0],
			viewDirection: [0, 0, 1],
		})
		const expired = reconcileAuthoritativeMovement({
			contact: null,
			crouching: false,
			delta: 0.050_001,
			grounded: false,
			jump: 1,
			previousCoyoteRemaining: 0.05,
			previousGrounded: false,
			previousWallTraversal: INITIAL_WALL_TRAVERSAL_STATE,
			reportedWallTraversal: { mode: "none", normal: [0, 0, 0] },
			sliding: false,
			velocity: [5, 8, 0],
			viewDirection: [0, 0, 1],
		})

		expect(atBoundary.jump).toBe(1)
		expect(atBoundary.coyoteRemaining).toBeNull()
		expect(atBoundary.velocity[1]).toBe(10.6)
		expect(expired.jump).toBe(2)
		expect(expired.coyoteRemaining).toBeNull()
		expect(expired.velocity[1]).toBe(9.4)
	})

	test("owns a validated mantle path and suppresses simultaneous wall state", () => {
		const state = reconcileAuthoritativeMovement({
			contact: wallContact,
			crouching: false,
			delta: 0.1,
			grounded: false,
			jump: 1,
			mantleCandidate: {
				rise: 1,
				surfaceId: wallContact.surfaceId,
				target: [0, 4, 0],
			},
			position: [1, 3, 0],
			previousWallTraversal: INITIAL_WALL_TRAVERSAL_STATE,
			reportedWallTraversal: { mode: "run", normal: [1, 0, 0] },
			sliding: true,
			velocity: [-1, 0, 0],
			viewDirection: [-1, 0, 0],
		})

		expect(state.mantle.active).toBe(true)
		expect(state.mantle.surfaceId).toBe(wallContact.surfaceId)
		expect(state.mantlePosition).not.toEqual([1, 3, 0])
		expect(state.velocity).not.toEqual([-1, 0, 0])
		expect(state.sliding).toBe(false)
		expect(state.wallTraversal.mode).toBe("none")
	})

	test("ignores a forged slide and derives run from resolved contact and view", () => {
		const state = reconcileAuthoritativeMovement({
			contact: wallContact,
			crouching: false,
			delta: 1 / 60,
			grounded: false,
			jump: 2,
			previousWallTraversal: INITIAL_WALL_TRAVERSAL_STATE,
			reportedWallTraversal: { mode: "slide", normal: [-1, 0, 0] },
			sliding: true,
			velocity: [-1, -2, 9],
			viewDirection: [0, 0, 1],
		})

		expect(state.jump).toBe(1)
		expect(state.sliding).toBe(false)
		expect(state.wallTraversal).toEqual({ mode: "run", normal: [1, 0, 0] })
	})

	test("normalizes a forged run to slide when replicated yaw faces the wall", () => {
		const state = reconcileAuthoritativeMovement({
			contact: wallContact,
			crouching: false,
			delta: 1 / 60,
			grounded: false,
			jump: 2,
			previousWallTraversal: INITIAL_WALL_TRAVERSAL_STATE,
			reportedWallTraversal: { mode: "run", normal: [-1, 0, 0] },
			sliding: false,
			velocity: [0, -2, 9],
			viewDirection: [-1, 0, 0],
		})

		expect(state.jump).toBe(1)
		expect(state.wallTraversal).toEqual({ mode: "slide", normal: [1, 0, 0] })
	})

	test("replaces forged wall-slide velocity with the bounded resolved value", () => {
		const state = reconcileAuthoritativeMovement({
			contact: wallContact,
			crouching: false,
			delta: 1 / 60,
			grounded: false,
			jump: 2,
			previousWallTraversal: INITIAL_WALL_TRAVERSAL_STATE,
			reportedWallTraversal: { mode: "slide", normal: [1, 0, 0] },
			sliding: false,
			velocity: [-80, -500, 40],
			viewDirection: [-1, 0, 0],
		})

		expect(state.wallTraversal.mode).toBe("slide")
		expect(state.velocity[0]).toBe(0)
		expect(state.velocity[1]).toBe(-2.25)
		expect(state.velocity[2]).toBeCloseTo(31.2)
	})

	test("crouching selects authoritative regular slide during wall contact", () => {
		const state = reconcileAuthoritativeMovement({
			contact: wallContact,
			crouching: true,
			delta: 1 / 60,
			grounded: false,
			jump: 2,
			previousWallTraversal: {
				...INITIAL_WALL_TRAVERSAL_STATE,
				mode: "run",
				surfaceId: wallContact.surfaceId,
			},
			reportedWallTraversal: { mode: "run", normal: [1, 0, 0] },
			sliding: false,
			velocity: [0, -2, 9],
			viewDirection: [0, 0, 1],
		})

		expect(state.jump).toBe(2)
		expect(state.sliding).toBe(true)
		expect(state.traversalState.mode).toBe("crouch-slide")
		expect(state.wallTraversal.mode).toBe("none")
	})

	test("authoritative crouch slide caps forged speed without refilling jump", () => {
		const contact = { ...wallContact, surfaceNormal: [1, 0, 0] as const }
		const acquired = reconcileAuthoritativeMovement({
			contact,
			crouching: true,
			delta: 1 / 60,
			grounded: false,
			jump: 2,
			previousWallTraversal: INITIAL_WALL_TRAVERSAL_STATE,
			reportedWallTraversal: { mode: "none", normal: [0, 0, 0] },
			sliding: false,
			velocity: [-500, -500, 500],
			viewDirection: [0, 0, 1],
		})
		const sustained = reconcileAuthoritativeMovement({
			contact,
			crouching: true,
			delta: 1 / 60,
			grounded: false,
			jump: 2,
			previousWallTraversal: acquired.traversalState,
			reportedWallTraversal: acquired.wallTraversal,
			sliding: true,
			velocity: acquired.velocity,
			viewDirection: [0, 0, 1],
		})

		expect(Math.hypot(...acquired.velocity)).toBeCloseTo(
			SLIDE_PHYSICS.maximumSpeed,
		)
		expect(acquired.jump).toBe(1)
		expect(sustained.jump).toBe(2)
		expect(sustained.sliding).toBe(true)
	})
})
