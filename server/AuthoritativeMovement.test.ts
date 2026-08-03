import { describe, expect, test } from "vitest"

import type { ArenaSurfaceContact } from "../src/ArenaWorld.ts"
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

	test("crouching detaches even when the client reports continuing contact", () => {
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
		expect(state.wallTraversal.mode).toBe("none")
	})
})
