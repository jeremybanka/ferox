import { describe, expect, test } from "vitest"

import {
	MINI_MISSILE_TRAIL_LIFETIME_SECONDS,
	MINI_MISSILE_TRAIL_MAX_POINTS,
	MINI_MISSILE_TRAIL_SAMPLE_SPACING,
} from "./game-constants.ts"
import {
	appendMiniMissileTrail,
	createMiniMissileTrail,
	resetMiniMissileTrail,
	trimMiniMissileTrail,
} from "./mini-missile-trail.ts"

describe("mini-missile trail history", () => {
	test("creates and resets an empty trail", () => {
		const populated = appendMiniMissileTrail(
			createMiniMissileTrail(),
			[1, 2, 3],
			0,
			"powered",
		)
		expect(populated.points).toHaveLength(1)
		expect(resetMiniMissileTrail()).toEqual({ points: [] })
	})

	test("samples only positions separated by the configured spacing", () => {
		const initial = appendMiniMissileTrail(
			createMiniMissileTrail(),
			[0, 0, 0],
			0,
			"powered",
		)
		const tooClose = appendMiniMissileTrail(
			initial,
			[MINI_MISSILE_TRAIL_SAMPLE_SPACING * 0.5, 0, 0],
			0.01,
			"powered",
		)
		const farEnough = appendMiniMissileTrail(
			tooClose,
			[MINI_MISSILE_TRAIL_SAMPLE_SPACING, 0, 0],
			0.02,
			"powered",
		)

		expect(tooClose.points).toEqual(initial.points)
		expect(farEnough.points).toHaveLength(2)
		expect(farEnough.points[1]?.position).toEqual([
			MINI_MISSILE_TRAIL_SAMPLE_SPACING,
			0,
			0,
		])
	})

	test("retains powered and falling phase samples across a transition", () => {
		const powered = appendMiniMissileTrail(
			createMiniMissileTrail(),
			[4, 5, 6],
			2,
			"powered",
		)
		const falling = appendMiniMissileTrail(powered, [4, 5, 6], 2.01, "falling")

		expect(falling.points.map((point) => point.phase)).toEqual([
			"powered",
			"falling",
		])
	})

	test("trims samples older than the configured lifetime", () => {
		const old = appendMiniMissileTrail(
			createMiniMissileTrail(),
			[0, 0, 0],
			10,
			"powered",
		)
		const boundary = appendMiniMissileTrail(
			old,
			[MINI_MISSILE_TRAIL_SAMPLE_SPACING, 0, 0],
			10.1,
			"powered",
		)
		const now = 10 + MINI_MISSILE_TRAIL_LIFETIME_SECONDS + 0.05
		const trimmed = trimMiniMissileTrail(boundary, now)

		expect(trimmed.points).toHaveLength(1)
		expect(trimmed.points[0]?.sampledAt).toBe(10.1)
		expect(
			trimMiniMissileTrail(
				trimmed,
				10.1 + MINI_MISSILE_TRAIL_LIFETIME_SECONDS + 0.01,
			),
		).toEqual({ points: [] })
	})

	test("keeps only the newest configured maximum number of samples", () => {
		let trail = createMiniMissileTrail()
		for (let index = 0; index < MINI_MISSILE_TRAIL_MAX_POINTS + 3; index += 1) {
			trail = appendMiniMissileTrail(
				trail,
				[index * MINI_MISSILE_TRAIL_SAMPLE_SPACING * 1.1, 0, 0],
				index * 0.001,
				"powered",
			)
		}

		expect(trail.points).toHaveLength(MINI_MISSILE_TRAIL_MAX_POINTS)
		expect(trail.points[0]?.position[0]).toBe(
			3 * MINI_MISSILE_TRAIL_SAMPLE_SPACING * 1.1,
		)
	})
})
