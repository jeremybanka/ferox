import { describe, expect, test } from "vitest"

import type { ArenaSurfaceContact } from "./ArenaWorld.ts"
import {
	INITIAL_WALL_TRAVERSAL_STATE,
	jumpCountAfterWallContact,
	stepWallTraversal,
	WALL_JUMP_OUTWARD_SPEED,
	WALL_JUMP_UPWARD_SPEED,
	WALL_SLIDE_VIEW_ANGLE_RADIANS,
} from "./WallTraversal.ts"

function contact(
	inclinationDegrees = 90,
	normal: readonly [number, number, number] = [1, 0, 0],
): ArenaSurfaceContact {
	return {
		inclinationRadians: (inclinationDegrees * Math.PI) / 180,
		normal,
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
			viewDirection: [0, 0, 1],
		})
		expect(result.state.mode).toBe("run")
		expect(result.velocity[0]).toBeCloseTo(0)
		expect(result.velocity[1]).toBeGreaterThanOrEqual(-1.25)
	})

	test.each([1, -1] as const)(
		"uses the inclusive 20-degree slide boundary on the %s wall face",
		(normalX) => {
			const boundaryView: readonly [number, number, number] = [
				-normalX * Math.cos(WALL_SLIDE_VIEW_ANGLE_RADIANS),
				0,
				Math.sin(WALL_SLIDE_VIEW_ANGLE_RADIANS),
			]
			const outsideView: readonly [number, number, number] = [
				-normalX * Math.cos(WALL_SLIDE_VIEW_ANGLE_RADIANS + 0.001),
				0,
				Math.sin(WALL_SLIDE_VIEW_ANGLE_RADIANS + 0.001),
			]
			const step = (viewDirection: readonly [number, number, number]) =>
				stepWallTraversal(INITIAL_WALL_TRAVERSAL_STATE, {
					blocked: false,
					contact: contact(90, [normalX, 0, 0]),
					crouching: false,
					delta: 1 / 60,
					grounded: false,
					jumpRequested: false,
					velocity: [0, -1, 9],
					viewDirection,
				})

			expect(step(boundaryView).state.mode).toBe("slide")
			expect(step(outsideView).state.mode).toBe("run")
		},
	)

	test("view direction overrides travel direction without discarding head-on speed", () => {
		const parallelTravel = stepWallTraversal(INITIAL_WALL_TRAVERSAL_STATE, {
			blocked: false,
			contact: contact(),
			crouching: false,
			delta: 1 / 60,
			grounded: false,
			jumpRequested: false,
			velocity: [0, -1, 9],
			viewDirection: [-1, 0, 0],
		})
		const headOnTravel = stepWallTraversal(INITIAL_WALL_TRAVERSAL_STATE, {
			blocked: false,
			contact: contact(),
			crouching: false,
			delta: 1 / 60,
			grounded: false,
			jumpRequested: false,
			velocity: [-18, -1, 0],
			viewDirection: [0, 0, 1],
		})

		expect(parallelTravel.state.mode).toBe("slide")
		expect(headOnTravel.state.mode).toBe("run")
		expect(Math.hypot(headOnTravel.velocity[0], headOnTravel.velocity[2])).toBe(
			18,
		)
		expect(headOnTravel.velocity[2]).toBeGreaterThan(0)
	})

	test("turning view into and away from the wall transitions slide and run", () => {
		const activeRun = {
			...INITIAL_WALL_TRAVERSAL_STATE,
			mode: "run" as const,
			surfaceId: "wall-a",
		}
		const slide = stepWallTraversal(activeRun, {
			blocked: false,
			contact: contact(),
			crouching: false,
			delta: 1 / 60,
			grounded: false,
			jumpRequested: false,
			velocity: [0, -1, 9],
			viewDirection: [-1, 0, 0],
		})
		const run = stepWallTraversal(slide.state, {
			blocked: false,
			contact: contact(),
			crouching: false,
			delta: 1 / 60,
			grounded: false,
			jumpRequested: false,
			velocity: [0, -1, 9],
			viewDirection: [0, 0, 1],
		})

		expect(slide.state.mode).toBe("slide")
		expect(run.state.mode).toBe("run")
	})

	test("slow and sub-80-degree contacts cannot start a run", () => {
		const slow = stepWallTraversal(INITIAL_WALL_TRAVERSAL_STATE, {
			blocked: false,
			contact: contact(),
			crouching: false,
			delta: 1 / 60,
			grounded: false,
			jumpRequested: false,
			velocity: [0, -8, 3],
			viewDirection: [0, 0, 1],
		})
		const shallow = stepWallTraversal(INITIAL_WALL_TRAVERSAL_STATE, {
			blocked: false,
			contact: contact(79.9),
			crouching: false,
			delta: 1 / 60,
			grounded: false,
			jumpRequested: false,
			velocity: [0, -8, 9],
			viewDirection: [0, 0, 1],
		})

		expect(slow.state.mode).toBe("slide")
		expect(shallow.state.mode).toBe("none")
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
				viewDirection: [0, 0, 1],
			},
		)
		expect(result.consumedJump).toBe(true)
		expect(result.velocity[0]).toBe(WALL_JUMP_OUTWARD_SPEED)
		expect(result.velocity[1]).toBe(WALL_JUMP_UPWARD_SPEED)
		expect(result.velocity[2]).toBeCloseTo(Math.hypot(2, 9))
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
				viewDirection: [0, 0, 1],
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
				viewDirection: [0, 0, 1],
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
				viewDirection: [0, 0, 1],
			})
			const recontacted = stepWallTraversal(released.state, {
				blocked: false,
				contact: contact(),
				crouching: false,
				delta: 1 / 60,
				grounded: false,
				jumpRequested: false,
				velocity: [0, -1, 9],
				viewDirection: [0, 0, 1],
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
				viewDirection: [0, 0, 1],
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
				viewDirection: [0, 0, 1],
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
				viewDirection: [0, 0, 1],
			},
		)
		expect(result.state.mode).toBe("slide")
	})
})
