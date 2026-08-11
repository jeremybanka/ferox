import { describe, expect, test } from "vitest"

import type { ArenaLedge } from "./ArenaWorld.ts"
import {
	INITIAL_MANTLE_STATE,
	MANTLE_DURATION_SECONDS,
	MANTLE_MAXIMUM_RISE,
	stepMantleTraversal,
} from "./MantleTraversal.ts"
import { JUMP_PHYSICS } from "./JumpPhysics.ts"

const ledge: ArenaLedge = {
	rise: 1,
	surfaceId: "wall-a",
	target: [1, 3, 0],
}

describe("mantle traversal", () => {
	test("derives its maximum rise from half the normal jump apex", () => {
		expect(MANTLE_MAXIMUM_RISE).toBe(
			(JUMP_PHYSICS.jumpVelocity ** 2 / (2 * JUMP_PHYSICS.gravity)) * 0.5,
		)
	})

	test("follows a bounded deterministic path and completes on its target", () => {
		const first = stepMantleTraversal(INITIAL_MANTLE_STATE, {
			blocked: false,
			candidate: ledge,
			delta: MANTLE_DURATION_SECONDS * 0.5,
			position: [0, 2, 0],
		})
		expect(first.started).toBe(true)
		expect(first.progress).toBe(0.5)
		expect(first.position).toEqual([0.5, 2.5, 0])

		const completed = stepMantleTraversal(first.state, {
			blocked: false,
			candidate: null,
			delta: MANTLE_DURATION_SECONDS * 0.5,
			position: first.position!,
		})
		expect(completed.completed).toBe(true)
		expect(completed.position).toEqual(ledge.target)
		expect(completed.state).toEqual(INITIAL_MANTLE_STATE)
	})

	test("a blocker cancels active traversal without carrying velocity", () => {
		const active = stepMantleTraversal(INITIAL_MANTLE_STATE, {
			blocked: false,
			candidate: ledge,
			delta: 0.05,
			position: [0, 2, 0],
		})
		const cancelled = stepMantleTraversal(active.state, {
			blocked: true,
			candidate: null,
			delta: 0.05,
			position: active.position!,
		})

		expect(cancelled.state).toEqual(INITIAL_MANTLE_STATE)
		expect(cancelled.position).toBeNull()
		expect(cancelled.velocity).toEqual([0, 0, 0])
	})
})
