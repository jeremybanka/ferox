import { describe, expect, test } from "vitest"

import type { ArenaSurfaceContact } from "./ArenaWorld.ts"
import {
	INITIAL_WALL_TRAVERSAL_STATE,
	stepWallTraversal,
	WALL_JUMP_UPWARD_SPEED,
} from "./WallTraversal.ts"

function contact(inclinationDegrees = 90): ArenaSurfaceContact {
	return {
		inclinationRadians: (inclinationDegrees * Math.PI) / 180,
		normal: [1, 0, 0],
		point: [0, 2, 0],
		surfaceId: "wall-a",
		time: 1,
	}
}

describe("wall traversal", () => {
	test("runs on steep parallel contact at speed", () => {
		const result = stepWallTraversal(INITIAL_WALL_TRAVERSAL_STATE, {
			blocked: false,
			contact: contact(80),
			delta: 1 / 60,
			grounded: false,
			jumpRequested: false,
			velocity: [-0.6, -3, 9],
		})
		expect(result.state.mode).toBe("run")
		expect(result.velocity[0]).toBeCloseTo(0)
		expect(result.velocity[1]).toBeGreaterThanOrEqual(-1.25)
	})

	test("head-on, slow, and sub-80-degree contacts do not start a run", () => {
		for (const [surface, velocity, expected] of [
			[contact(), [-8, 0, 0], "slide"],
			[contact(), [-0.2, -8, 3], "slide"],
			[contact(79.9), [0, -8, 9], "none"],
		] as const) {
			const result = stepWallTraversal(INITIAL_WALL_TRAVERSAL_STATE, {
				blocked: false,
				contact: surface,
				delta: 1 / 60,
				grounded: false,
				jumpRequested: false,
				velocity,
			})
			expect(result.state.mode).toBe(expected)
		}
	})

	test("wall jump launches outward and starts recontact protection", () => {
		const result = stepWallTraversal(
			{ ...INITIAL_WALL_TRAVERSAL_STATE, mode: "slide", surfaceId: "wall-a" },
			{
				blocked: false,
				contact: contact(),
				delta: 1 / 60,
				grounded: false,
				jumpRequested: true,
				velocity: [0, -4, 0],
			},
		)
		expect(result.consumedJump).toBe(true)
		expect(result.velocity[0]).toBeGreaterThan(0)
		expect(result.velocity[1]).toBe(WALL_JUMP_UPWARD_SPEED)
		expect(result.state.recontactRemaining).toBeGreaterThan(0)
	})

	test("landing and lifecycle blockers reset traversal", () => {
		const active = {
			...INITIAL_WALL_TRAVERSAL_STATE,
			mode: "run" as const,
			surfaceId: "wall-a",
		}
		for (const [grounded, blocked] of [
			[true, false],
			[false, true],
		] as const) {
			const result = stepWallTraversal(active, {
				blocked,
				contact: contact(),
				delta: 1 / 60,
				grounded,
				jumpRequested: false,
				velocity: [0, 0, 8],
			})
			expect(result.state.mode).toBe("none")
		}
	})

	test("a run times out into a slide until contact is lost", () => {
		const result = stepWallTraversal(
			{
				...INITIAL_WALL_TRAVERSAL_STATE,
				elapsed: 2,
				mode: "run",
				surfaceId: "wall-a",
			},
			{
				blocked: false,
				contact: contact(),
				delta: 1 / 60,
				grounded: false,
				jumpRequested: false,
				velocity: [0, 0, 9],
			},
		)
		expect(result.state.mode).toBe("slide")
	})
})
