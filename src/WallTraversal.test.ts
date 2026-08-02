import { describe, expect, test } from "vitest"

import type { ArenaSurfaceContact } from "./ArenaWorld.ts"
import {
	INITIAL_WALL_TRAVERSAL_STATE,
	jumpCountAfterWallContact,
	stepWallTraversal,
	WALL_JUMP_OUTWARD_SPEED,
	WALL_JUMP_UPWARD_SPEED,
	WALL_RUN_ENTRY_ANGLE_RADIANS,
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
			crouching: false,
			delta: 1 / 60,
			grounded: false,
			jumpRequested: false,
			velocity: [-0.6, -3, 9],
		})
		expect(result.state.mode).toBe("run")
		expect(result.velocity[0]).toBeCloseTo(0)
		expect(result.velocity[1]).toBeGreaterThanOrEqual(-1.25)
	})

	test("accepts the forgiving 50-degree entry boundary but rejects wider approaches", () => {
		const speed = 9
		const atBoundary = stepWallTraversal(INITIAL_WALL_TRAVERSAL_STATE, {
			blocked: false,
			contact: contact(),
			crouching: false,
			delta: 1 / 60,
			grounded: false,
			jumpRequested: false,
			velocity: [
				-Math.sin(WALL_RUN_ENTRY_ANGLE_RADIANS) * speed,
				0,
				Math.cos(WALL_RUN_ENTRY_ANGLE_RADIANS) * speed,
			],
		})
		const outsideBoundary = stepWallTraversal(INITIAL_WALL_TRAVERSAL_STATE, {
			blocked: false,
			contact: contact(),
			crouching: false,
			delta: 1 / 60,
			grounded: false,
			jumpRequested: false,
			velocity: [
				-Math.sin(WALL_RUN_ENTRY_ANGLE_RADIANS + 0.01) * speed,
				0,
				Math.cos(WALL_RUN_ENTRY_ANGLE_RADIANS + 0.01) * speed,
			],
		})

		expect(atBoundary.state.mode).toBe("run")
		expect(outsideBoundary.state.mode).toBe("slide")
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
				crouching: false,
				delta: 1 / 60,
				grounded: false,
				jumpRequested: false,
				velocity,
			})
			expect(result.state.mode).toBe(expected)
		}
	})

	test("wall jump preserves tangential momentum and adds outward impulse", () => {
		const result = stepWallTraversal(
			{ ...INITIAL_WALL_TRAVERSAL_STATE, mode: "slide", surfaceId: "wall-a" },
			{
				blocked: false,
				contact: contact(),
				crouching: false,
				delta: 1 / 60,
				grounded: false,
				jumpRequested: true,
				velocity: [-2, -4, 9],
			},
		)
		expect(result.consumedJump).toBe(true)
		expect(result.velocity[0]).toBe(WALL_JUMP_OUTWARD_SPEED)
		expect(result.velocity[1]).toBe(WALL_JUMP_UPWARD_SPEED)
		expect(result.velocity[2]).toBe(9)
		expect(result.resetJumpAvailability).toBe(true)
		expect(result.state.recontactRemaining).toBeGreaterThan(0)
	})

	test.each(["run", "slide"] as const)(
		"crouch detaches from a wall %s without sliding and requires contact release",
		(activeMode) => {
			const active = {
				...INITIAL_WALL_TRAVERSAL_STATE,
				mode: activeMode,
				surfaceId: "wall-a",
			}
			const detached = stepWallTraversal(active, {
				blocked: false,
				contact: contact(),
				crouching: true,
				delta: 1 / 60,
				grounded: false,
				jumpRequested: false,
				velocity: [0, -1, 9],
			})
			expect(detached.detachedByCrouch).toBe(true)
			expect(detached.state.mode).toBe("none")
			expect(detached.state.requiresContactRelease).toBe(true)
			expect(detached.velocity).toEqual([0, -1, 9])

			const stillTouching = stepWallTraversal(detached.state, {
				blocked: false,
				contact: contact(),
				crouching: false,
				delta: 0.3,
				grounded: false,
				jumpRequested: false,
				velocity: [0, -1, 9],
			})
			expect(stillTouching.state.mode).toBe("none")
			expect(stillTouching.state.requiresContactRelease).toBe(true)

			const released = stepWallTraversal(stillTouching.state, {
				blocked: false,
				contact: null,
				crouching: false,
				delta: 1 / 60,
				grounded: false,
				jumpRequested: false,
				velocity: [0, -1, 9],
			})
			const recontacted = stepWallTraversal(released.state, {
				blocked: false,
				contact: contact(),
				crouching: false,
				delta: 1 / 60,
				grounded: false,
				jumpRequested: false,
				velocity: [0, -1, 9],
			})
			expect(released.state.requiresContactRelease).toBe(false)
			expect(recontacted.state.mode).toBe("run")
		},
	)

	test.each(["run", "slide"] as const)(
		"%s contact resets double-jump availability",
		(expectedMode) => {
			const velocity: readonly [number, number, number] =
				expectedMode === "run" ? [0, -1, 9] : [0, -1, 4]
			const result = stepWallTraversal(INITIAL_WALL_TRAVERSAL_STATE, {
				blocked: false,
				contact: contact(),
				crouching: false,
				delta: 1 / 60,
				grounded: false,
				jumpRequested: false,
				velocity,
			})
			expect(result.state.mode).toBe(expectedMode)
			expect(result.resetJumpAvailability).toBe(true)
			expect(jumpCountAfterWallContact(result.resetJumpAvailability, 2)).toBe(1)
		},
	)

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
				crouching: false,
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
				crouching: false,
				delta: 1 / 60,
				grounded: false,
				jumpRequested: false,
				velocity: [0, 0, 9],
			},
		)
		expect(result.state.mode).toBe("slide")
	})
})
