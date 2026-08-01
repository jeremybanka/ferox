import { describe, expect, test } from "vitest"

import { ARENA_SEED, PLAYER_SPAWN_POINTS } from "./game-constants.ts"
import {
	arenaPillars,
	isSpawnClear,
	pointInsideArenaObstacle,
	resolveArenaMotion,
} from "./ArenaWorld.ts"

describe("arena world", () => {
	test("produces deterministic, separated, near-upright pillars", () => {
		const first = arenaPillars(ARENA_SEED)
		expect(arenaPillars(ARENA_SEED)).toEqual(first)
		expect(arenaPillars(ARENA_SEED + 1)).not.toEqual(first)
		for (const pillar of first) {
			expect(pillar.leanRadians).toBeGreaterThan(0)
			expect(pillar.leanRadians).toBeLessThan(Math.PI / 18)
		}
		for (const spawn of PLAYER_SPAWN_POINTS)
			expect(isSpawnClear(ARENA_SEED, [spawn[0], spawn[1]])).toBe(true)
	})

	test("queries solids and resolves a fast swept player contact", () => {
		const pillar = arenaPillars(ARENA_SEED)[0]!
		const y = pillar.baseY + 2
		expect(pointInsideArenaObstacle(ARENA_SEED, [pillar.x, y, pillar.z])).toBe(
			true,
		)
		const result = resolveArenaMotion(
			ARENA_SEED,
			[pillar.x - 12, pillar.z],
			[pillar.x + 12, pillar.z],
			y,
		)
		expect(result.contact?.surfaceId).toBe(pillar.id)
		expect(result.contact?.inclinationRadians).toBeGreaterThanOrEqual(
			(80 * Math.PI) / 180,
		)
		expect(result.x).toBeLessThan(pillar.x)
	})

	test("clamps the shared playable boundary", () => {
		const result = resolveArenaMotion(ARENA_SEED, [0, 0], [900, -900], 2)
		expect(result.x).toBe(86)
		expect(result.z).toBe(-86)
	})
})
