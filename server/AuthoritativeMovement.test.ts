import { describe, expect, test } from "vitest"

import type { ArenaSurfaceContact } from "../src/ArenaWorld.ts"
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
			jump: 2,
			sliding: false,
			velocity: [0, -2, 9],
			wallTraversal: { mode: "run", normal: [1, 0, 0] },
		})

		expect(state.jump).toBe(2)
		expect(state.wallTraversal).toEqual({ mode: "none", normal: [0, 0, 0] })
	})

	test("uses resolved contact to normalize the wall mode, normal, and jump count", () => {
		const state = reconcileAuthoritativeMovement({
			contact: wallContact,
			crouching: false,
			jump: 2,
			sliding: true,
			velocity: [-1, -2, 9],
			wallTraversal: { mode: "run", normal: [-1, 0, 0] },
		})

		expect(state.jump).toBe(1)
		expect(state.sliding).toBe(false)
		expect(state.wallTraversal).toEqual({ mode: "run", normal: [1, 0, 0] })
	})

	test("crouching detaches even when the client reports continuing contact", () => {
		const state = reconcileAuthoritativeMovement({
			contact: wallContact,
			crouching: true,
			jump: 2,
			sliding: false,
			velocity: [0, -2, 9],
			wallTraversal: { mode: "run", normal: [1, 0, 0] },
		})

		expect(state.jump).toBe(2)
		expect(state.wallTraversal.mode).toBe("none")
	})
})
