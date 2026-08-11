import { describe, expect, test } from "vitest"

import { ARENA_SEED, PLAYER_SPAWN_POINTS } from "./game-constants.ts"
import {
	ARENA_AREA_SCALE,
	ARENA_GRID_DIVISIONS,
	ARENA_LINEAR_SCALE,
	ARENA_PLAYABLE_HALF_EXTENT,
	ARENA_RENDER_SIZE,
	ARENA_TERRAIN_SEGMENTS,
	arenaPillars,
	arenaWalls,
	isSpawnClear,
	PLAYER_COLLISION_RADIUS,
	pointInsideArenaObstacle,
	resolveArenaMotion,
	wallCenterAtY,
	wallNormal,
	wallTangent,
} from "./ArenaWorld.ts"

describe("arena world", () => {
	test("quadruples playable area by doubling both linear dimensions", () => {
		expect(ARENA_LINEAR_SCALE).toBe(2)
		expect(ARENA_AREA_SCALE).toBe(4)
		expect(ARENA_PLAYABLE_HALF_EXTENT).toBe(172)
		expect(ARENA_RENDER_SIZE).toBe(368)
		expect(ARENA_TERRAIN_SEGMENTS).toBe(256)
		expect(ARENA_GRID_DIVISIONS).toBe(92)
		expect((ARENA_PLAYABLE_HALF_EXTENT / 86) ** 2).toBe(4)
	})

	test("produces deterministic, varied wall-running superstructure", () => {
		const first = arenaWalls(ARENA_SEED)
		expect(arenaWalls(ARENA_SEED)).toEqual(first)
		expect(arenaWalls(ARENA_SEED + 1)).not.toEqual(first)
		expect(first.length).toBeGreaterThanOrEqual(60)
		expect(new Set(first.map((wall) => wall.role))).toEqual(
			new Set(["channel", "connector", "outer", "park", "staggered"]),
		)
		expect(
			first.filter((wall) => wall.role === "park").length,
		).toBeGreaterThanOrEqual(16)
		const orientationBuckets = new Set(
			first.map((wall) => Math.round(wall.yaw / (Math.PI / 24))),
		)
		expect(orientationBuckets.size).toBeGreaterThanOrEqual(12)
		expect(Math.min(...first.map((wall) => wall.length))).toBeLessThan(25)
		expect(Math.max(...first.map((wall) => wall.length))).toBeGreaterThan(80)
		expect(Math.min(...first.map((wall) => wall.height))).toBeLessThan(10)
		expect(Math.max(...first.map((wall) => wall.height))).toBeGreaterThan(26)
		for (const wall of first) {
			const inclination = Math.PI / 2 - Math.abs(wall.leanRadians)
			expect(inclination).toBeGreaterThanOrEqual((80 * Math.PI) / 180)
			expect(inclination).toBeLessThan(Math.PI / 2)
			expect(Math.abs(wall.x)).toBeLessThan(ARENA_PLAYABLE_HALF_EXTENT)
			expect(Math.abs(wall.z)).toBeLessThan(ARENA_PLAYABLE_HALF_EXTENT)
		}
	})

	test("keeps deterministic landmark pillars and every spawn clear", () => {
		const first = arenaPillars(ARENA_SEED)
		expect(arenaPillars(ARENA_SEED)).toEqual(first)
		expect(arenaPillars(ARENA_SEED + 1)).not.toEqual(first)
		for (const pillar of first) {
			expect(pillar.leanRadians).toBeGreaterThan(0)
			expect(pillar.leanRadians).toBeLessThan(Math.PI / 18)
		}
		for (const spawn of PLAYER_SPAWN_POINTS)
			expect(isSpawnClear(ARENA_SEED, [spawn[0], spawn[1]], 8)).toBe(true)
	})

	test("queries cylindrical solids and resolves a fast swept contact", () => {
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

	test("supports long parallel traversal on both faces of a channel", () => {
		const wall = arenaWalls(ARENA_SEED).find(
			(candidate) => candidate.role === "channel" && candidate.length > 70,
		)!
		const y = wall.baseY + Math.cos(wall.leanRadians) * 4
		const center = wallCenterAtY(wall, y)!
		const [tangentX, tangentZ] = wallTangent(wall)
		const [normalX, normalZ] = wallNormal(wall)
		const contactDistance = wall.thickness * 0.5 + PLAYER_COLLISION_RADIUS
		for (const face of [-1, 1] as const) {
			const start: readonly [number, number] = [
				center[0] -
					tangentX * wall.length * 0.15 +
					normalX * face * (contactDistance + 0.18),
				center[1] -
					tangentZ * wall.length * 0.15 +
					normalZ * face * (contactDistance + 0.18),
			]
			const requested: readonly [number, number] = [
				start[0] + tangentX * wall.length * 0.3 - normalX * face * 0.36,
				start[1] + tangentZ * wall.length * 0.3 - normalZ * face * 0.36,
			]
			const result = resolveArenaMotion(ARENA_SEED, start, requested, y)
			expect(result.contact?.surfaceId).toBe(wall.id)
			expect(result.contact?.inclinationRadians).toBeGreaterThanOrEqual(
				(80 * Math.PI) / 180,
			)
			const contactNormal = result.contact!.normal
			expect(
				(contactNormal[0] * normalX + contactNormal[2] * normalZ) * face,
			).toBeGreaterThan(0.9)
			const tangentProgress =
				(result.x - start[0]) * tangentX + (result.z - start[1]) * tangentZ
			expect(tangentProgress).toBeGreaterThan(wall.length * 0.25)
		}
	})

	test("makes the park transition lips solid and wall-runnable", () => {
		const wall = arenaWalls(ARENA_SEED).find(
			(candidate) => candidate.role === "park" && candidate.height > 9,
		)!
		const y = wall.baseY + Math.cos(wall.leanRadians) * 2
		const center = wallCenterAtY(wall, y)!
		const [normalX, normalZ] = wallNormal(wall)
		const clearance = wall.thickness * 0.5 + PLAYER_COLLISION_RADIUS
		const start: readonly [number, number] = [
			center[0] + normalX * (clearance + 2),
			center[1] + normalZ * (clearance + 2),
		]
		const requested: readonly [number, number] = [
			center[0] - normalX * 2,
			center[1] - normalZ * 2,
		]
		const result = resolveArenaMotion(ARENA_SEED, start, requested, y)
		expect(result.contact?.surfaceId).toBe(wall.id)
		expect(result.contact?.inclinationRadians).toBeGreaterThanOrEqual(
			(80 * Math.PI) / 180,
		)
	})

	test("uses rounded wall endpoints instead of snagging their corners", () => {
		const wall = arenaWalls(ARENA_SEED).find(
			(candidate) => candidate.role === "outer" && candidate.length > 65,
		)!
		const y = wall.baseY + Math.cos(wall.leanRadians) * 3
		const center = wallCenterAtY(wall, y)!
		const [tangentX, tangentZ] = wallTangent(wall)
		const [normalX, normalZ] = wallNormal(wall)
		const clearance = wall.thickness * 0.5 + PLAYER_COLLISION_RADIUS + 0.25
		const start: readonly [number, number] = [
			center[0] +
				tangentX * (wall.length * 0.5 + clearance) +
				normalX * clearance,
			center[1] +
				tangentZ * (wall.length * 0.5 + clearance) +
				normalZ * clearance,
		]
		const requested: readonly [number, number] = [
			start[0] + tangentX * 8,
			start[1] + tangentZ * 8,
		]
		const result = resolveArenaMotion(ARENA_SEED, start, requested, y)
		expect(result.contact?.surfaceId).not.toBe(wall.id)
		expect(result.x).toBeCloseTo(requested[0], 5)
		expect(result.z).toBeCloseTo(requested[1], 5)
	})

	test("elevates connector lanes while retaining queryable wall faces", () => {
		const connector = arenaWalls(ARENA_SEED).find(
			(wall) => wall.role === "connector" && wall.length > 40,
		)!
		expect(wallCenterAtY(connector, connector.baseY - 0.1)).toBeNull()
		const centerY =
			connector.baseY + Math.cos(connector.leanRadians) * connector.height * 0.5
		const center = wallCenterAtY(connector, centerY)
		expect(center).not.toBeNull()
		expect(
			pointInsideArenaObstacle(ARENA_SEED, [center![0], centerY, center![1]]),
		).toBe(true)
	})

	test("clamps the doubled shared playable boundary", () => {
		const result = resolveArenaMotion(ARENA_SEED, [0, 0], [900, -900], 200)
		expect(result.x).toBe(ARENA_PLAYABLE_HALF_EXTENT)
		expect(result.z).toBe(-ARENA_PLAYABLE_HALF_EXTENT)
	})
})
