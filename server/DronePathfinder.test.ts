import { expect, test } from "vitest"

import { ARENA_SEED } from "../src/game-constants.ts"
import { arenaHeightAt } from "../src/arena-terrain.ts"
import { arenaWalls, wallNormal } from "../src/ArenaWorld.ts"
import { ArenaSimulation, type SimulationPlayer } from "./ArenaSimulation.ts"
import {
	findArenaDronePath,
	isArenaRouteClear,
	type DronePathPoint,
} from "./DronePathfinder.ts"

test("uses the exact goal when no obstacle blocks the drone", () => {
	const goal: DronePathPoint = [2, 2]
	expect(findArenaDronePath(ARENA_SEED, [0, 0], goal)).toEqual([goal])
})

test("finds a deterministic clear route around a wall", () => {
	const wall = arenaWalls(ARENA_SEED).find(
		(candidate) => candidate.id === "wall-staggered-24",
	)
	expect(wall).toBeDefined()
	if (wall === undefined) return
	const [normalX, normalZ] = wallNormal(wall)
	const start: DronePathPoint = [wall.x + normalX * 6, wall.z + normalZ * 6]
	const goal: DronePathPoint = [wall.x - normalX * 6, wall.z - normalZ * 6]

	expect(isArenaRouteClear(ARENA_SEED, start, goal)).toBe(false)
	const path = findArenaDronePath(ARENA_SEED, start, goal)
	expect(path).not.toBeNull()
	expect(path).toEqual(findArenaDronePath(ARENA_SEED, start, goal))
	if (path === null) return
	expect(path.length).toBeGreaterThan(1)
	expect(path.at(-1)).toEqual(goal)

	let previous = start
	let routeLength = 0
	for (const waypoint of path) {
		expect(isArenaRouteClear(ARENA_SEED, previous, waypoint)).toBe(true)
		routeLength += Math.hypot(
			waypoint[0] - previous[0],
			waypoint[1] - previous[1],
		)
		previous = waypoint
	}
	expect(routeLength).toBeGreaterThan(
		Math.hypot(goal[0] - start[0], goal[1] - start[1]),
	)
})

test("an alerted kamikaze follows its clear route around a wall", () => {
	const wall = arenaWalls(ARENA_SEED).find(
		(candidate) => candidate.id === "wall-staggered-24",
	)!
	const [normalX, normalZ] = wallNormal(wall)
	const start: DronePathPoint = [wall.x + normalX * 6, wall.z + normalZ * 6]
	const goal: DronePathPoint = [wall.x - normalX * 6, wall.z - normalZ * 6]
	const players: SimulationPlayer[] = [
		{
			crouching: false,
			id: "target",
			position: [
				goal[0],
				arenaHeightAt(ARENA_SEED, goal[0], goal[1]) + 1.72,
				goal[1],
			],
			velocity: [9, 0, 0],
		},
	]
	const kamikazeHits: string[] = []
	const simulation = new ArenaSimulation({
		emitDroneDestroyed: () => undefined,
		emitGrenade: () => undefined,
		emitGrenadeExploded: () => undefined,
		emitMiniMissile: () => undefined,
		emitMiniMissileEnded: () => undefined,
		emitMiniMissileExploded: () => undefined,
		emitProjectile: () => undefined,
		emitProjectileEnded: () => undefined,
		getPlayers: () => players,
		initialDrones: [
			{
				id: 1,
				personality: "kamikaze",
				position: [
					start[0],
					arenaHeightAt(ARENA_SEED, start[0], start[1]) + 3.2,
					start[1],
				],
				stationary: false,
			},
		],
		onDirectHit: () => undefined,
		onDroneKilled: () => undefined,
		onLockChanged: () => undefined,
		onPlayerDamage: (playerId, _damage, impact) => {
			if (impact.source === "kamikaze") kamikazeHits.push(playerId)
		},
		seed: ARENA_SEED,
	})

	for (let index = 0; index < 160 && kamikazeHits.length === 0; index += 1)
		simulation.update(0.05)

	expect(kamikazeHits).toEqual(["target"])
})
