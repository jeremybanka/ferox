import * as THREE from "three"
import { expect, test } from "vitest"

import type {
	GrenadeExplodedSnapshot,
	GrenadeSnapshot,
	DirectHitResult,
	PlayerDamageImpact,
	ProjectileEndedSnapshot,
} from "../src/arena-protocol.ts"
import { grenadeDamageAtDistance } from "../src/game-constants.ts"
import { ArenaSimulation, type SimulationPlayer } from "./ArenaSimulation.ts"

function makeSimulation(
	players: SimulationPlayer[],
	onPlayerDamage: (
		playerId: string,
		damage: number,
		impact: PlayerDamageImpact,
	) => void,
	endedProjectiles: ProjectileEndedSnapshot[],
	directHits: Array<{ playerId: string; result: DirectHitResult }> = [],
): ArenaSimulation {
	return new ArenaSimulation({
		emitDroneDestroyed: () => undefined,
		emitGrenade: () => undefined,
		emitGrenadeExploded: () => undefined,
		emitProjectile: () => undefined,
		emitProjectileEnded: (snapshot) => endedProjectiles.push(snapshot),
		getPlayers: () => players,
		onDirectHit: (playerId, result) => directHits.push({ playerId, result }),
		onDroneKilled: () => undefined,
		onPlayerDamage,
		seed: 7_431_905,
	})
}

test("player projectiles damage another pilot across a simulation tick", () => {
	const players: SimulationPlayer[] = [
		{
			crouching: false,
			id: "shooter",
			position: [0, 1.72, 0],
			velocity: [0, 0, 0],
		},
		{
			crouching: false,
			id: "target",
			position: [0, 1.72, -4],
			velocity: [0, 0, 0],
		},
	]
	const damage: Array<{
		damage: number
		impact: PlayerDamageImpact
		playerId: string
	}> = []
	const endedProjectiles: ProjectileEndedSnapshot[] = []
	const simulation = makeSimulation(
		players,
		(playerId, amount, impact) =>
			damage.push({ damage: amount, impact, playerId }),
		endedProjectiles,
	)

	expect(
		simulation.fire("shooter", {
			clientShotId: 1,
			direction: [0, 0, -1],
			origin: [0, 1, 0],
		}),
	).toBe(true)
	simulation.update(0.1)

	expect(damage).toHaveLength(1)
	expect(damage[0]?.damage).toBe(20)
	expect(damage[0]?.playerId).toBe("target")
	expect(damage[0]?.impact.direction).toEqual([0, 0, -1])
	expect(damage[0]?.impact.position[0]).toBe(0)
	expect(damage[0]?.impact.position[1]).toBe(1)
	expect(damage[0]?.impact.position[2]).toBe(-4)
	expect(damage[0]?.impact.source).toBe("projectile")
	expect(endedProjectiles).toEqual([{ id: 1 }])
})

test("standing headshots deal double damage and report the authoritative classification", () => {
	const players: SimulationPlayer[] = [
		{
			crouching: false,
			id: "shooter",
			position: [0, 1.72, 0],
			velocity: [0, 0, 0],
		},
		{
			crouching: false,
			id: "target",
			position: [0, 1.72, -4],
			velocity: [0, 0, 0],
		},
	]
	const damage: Array<{ damage: number; playerId: string }> = []
	const directHits: Array<{ playerId: string; result: DirectHitResult }> = []
	const simulation = makeSimulation(
		players,
		(playerId, amount) => damage.push({ damage: amount, playerId }),
		[],
		directHits,
	)

	expect(
		simulation.fire("shooter", {
			clientShotId: 42,
			direction: [0, 0, -1],
			origin: [0, 1.55, 0],
		}),
	).toBe(true)
	simulation.update(0.1)

	expect(damage).toEqual([{ damage: 40, playerId: "target" }])
	expect(directHits).toEqual([
		{
			playerId: "shooter",
			result: {
				classification: "headshot",
				clientShotId: 42,
				damage: 40,
				projectileId: 1,
				targetId: "target",
				targetType: "player",
			},
		},
	])
})

test("crouched pilots use their lowered head region", () => {
	const players: SimulationPlayer[] = [
		{
			crouching: false,
			id: "shooter",
			position: [0, 1.72, 0],
			velocity: [0, 0, 0],
		},
		{
			crouching: true,
			id: "target",
			position: [0, 1.08, -4],
			velocity: [0, 0, 0],
		},
	]
	const damage: number[] = []
	const simulation = makeSimulation(
		players,
		(_playerId, amount) => damage.push(amount),
		[],
	)

	simulation.fire("shooter", {
		clientShotId: 1,
		direction: [0, 0, -1],
		origin: [0, 0.94, 0],
	})
	simulation.update(0.1)

	expect(damage).toEqual([40])
})

test("a closer body blocks a farther head region", () => {
	const players: SimulationPlayer[] = [
		{
			crouching: false,
			id: "shooter",
			position: [0, 1.72, 0],
			velocity: [0, 0, 0],
		},
		{
			crouching: false,
			id: "near-body",
			position: [0, 1.72, -3],
			velocity: [0, 0, 0],
		},
		{
			crouching: true,
			id: "far-head",
			position: [0, 1.08, -5],
			velocity: [0, 0, 0],
		},
	]
	const damage: Array<{ damage: number; playerId: string }> = []
	const hits: Array<{ playerId: string; result: DirectHitResult }> = []
	const simulation = makeSimulation(
		players,
		(playerId, amount) => damage.push({ damage: amount, playerId }),
		[],
		hits,
	)

	simulation.fire("shooter", {
		clientShotId: 7,
		direction: [0, 0, -1],
		origin: [0, 1, 0],
	})
	simulation.update(0.1)

	expect(damage).toEqual([{ damage: 20, playerId: "near-body" }])
	expect(hits[0]?.result.classification).toBe("normal")
	expect(hits[0]?.result.targetId).toBe("near-body")
})

test("a pilot body blocks its head region along an oblique shot", () => {
	const players: SimulationPlayer[] = [
		{
			crouching: false,
			id: "shooter",
			position: [0, 1.72, 0],
			velocity: [0, 0, 0],
		},
		{
			crouching: false,
			id: "target",
			position: [0, 1.72, -4],
			velocity: [0, 0, 0],
		},
	]
	const damage: number[] = []
	const hits: Array<{ playerId: string; result: DirectHitResult }> = []
	const simulation = makeSimulation(
		players,
		(_playerId, amount) => damage.push(amount),
		[],
		hits,
	)

	const direction = new THREE.Vector3(0, 1.05, -4).normalize()
	expect(
		simulation.fire("shooter", {
			clientShotId: 8,
			direction: direction.toArray(),
			origin: [0, 0.5, 0],
		}),
	).toBe(true)
	simulation.update(0.1)

	expect(damage).toEqual([20])
	expect(hits[0]?.result.classification).toBe("normal")
})

test("misses and self intersections produce no direct-hit result", () => {
	const players: SimulationPlayer[] = [
		{
			crouching: false,
			id: "shooter",
			position: [0, 1.72, 0],
			velocity: [0, 0, 0],
		},
	]
	const hits: Array<{ playerId: string; result: DirectHitResult }> = []
	const simulation = makeSimulation(players, () => undefined, [], hits)

	simulation.fire("shooter", {
		clientShotId: 3,
		direction: [1, 0, 0],
		origin: [0, 1.72, 0],
	})
	simulation.update(0.1)

	expect(hits).toEqual([])
})

test("direct drone hits report the projectile owner and shot correlation", () => {
	const players: SimulationPlayer[] = [
		{
			crouching: false,
			id: "shooter",
			position: [0, 1.72, 0],
			velocity: [0, 0, 0],
		},
	]
	const hits: Array<{ playerId: string; result: DirectHitResult }> = []
	const simulation = makeSimulation(players, () => undefined, [], hits)
	const originalRandom = Math.random
	Math.random = () => 0
	try {
		simulation.update(1.2)
	} finally {
		Math.random = originalRandom
	}
	const drone = simulation.snapshot().drones[0]
	expect(drone).toBeDefined()
	if (drone === undefined) throw new Error("Expected a spawned drone.")
	players[0]!.position = [
		drone.position[0] + 2,
		drone.position[1],
		drone.position[2],
	]

	expect(
		simulation.fire("shooter", {
			clientShotId: 91,
			direction: [-1, 0, 0],
			origin: players[0]!.position,
		}),
	).toBe(true)
	simulation.update(0.05)

	expect(hits).toHaveLength(1)
	expect(hits[0]?.playerId).toBe("shooter")
	expect(hits[0]?.result).toEqual({
		classification: "normal",
		clientShotId: 91,
		damage: 20,
		projectileId: 1,
		targetId: drone.id,
		targetType: "drone",
	})
})

test("grenades broadcast their flight and damage pilots when they explode", () => {
	const players: SimulationPlayer[] = [
		{
			crouching: false,
			id: "thrower",
			position: [0, -0.88, 0],
			velocity: [0, 0, 0],
		},
		{
			crouching: false,
			id: "target",
			position: [1.5, -0.88, 0],
			velocity: [0, 0, 0],
		},
	]
	const damage: Array<{
		damage: number
		playerId: string
		source: PlayerDamageImpact["source"]
	}> = []
	const grenadeSnapshots: GrenadeSnapshot[] = []
	const explosions: GrenadeExplodedSnapshot[] = []
	const simulation = new ArenaSimulation({
		emitDroneDestroyed: () => undefined,
		emitGrenade: (snapshot) => grenadeSnapshots.push(snapshot),
		emitGrenadeExploded: (snapshot) => explosions.push(snapshot),
		emitProjectile: () => undefined,
		emitProjectileEnded: () => undefined,
		getPlayers: () => players,
		onDirectHit: () => undefined,
		onDroneKilled: () => undefined,
		onPlayerDamage: (playerId, amount, impact) =>
			damage.push({ damage: amount, playerId, source: impact.source }),
		seed: 7_431_905,
	})

	expect(
		simulation.throwGrenade("thrower", {
			clientGrenadeId: 1,
			direction: [0, 1, 0],
			origin: [0, -0.88, 0],
		}),
	).toBe(true)
	for (let index = 0; index < 23; index += 1) simulation.update(0.1)

	expect(grenadeSnapshots).toHaveLength(1)
	expect(grenadeSnapshots[0]?.ownerId).toBe("thrower")
	expect(explosions).toHaveLength(1)
	expect(explosions[0]?.id).toBe(grenadeSnapshots[0]?.id)
	const grenadeDamage = damage.filter(({ source }) => source === "grenade")
	expect(grenadeDamage.map(({ playerId }) => playerId).sort()).toEqual([
		"target",
		"thrower",
	])
	expect(
		grenadeDamage.every(({ damage: amount }) => amount > 0 && amount <= 120),
	).toBe(true)
})

test("grenade damage drops by 20 for every meter from the blast center", () => {
	expect(
		[0, 0.99, 1, 1.99, 2, 3, 4, 5, 5.99, 6].map(grenadeDamageAtDistance),
	).toEqual([120, 120, 100, 100, 80, 60, 40, 20, 20, 0])
})

test("player projectiles cannot damage their owner", () => {
	const players: SimulationPlayer[] = [
		{
			crouching: false,
			id: "shooter",
			position: [0, 1.72, 0],
			velocity: [0, 0, 0],
		},
	]
	const damage: Array<{ damage: number; playerId: string }> = []
	const simulation = makeSimulation(
		players,
		(playerId, amount) => damage.push({ damage: amount, playerId }),
		[],
	)

	expect(
		simulation.fire("shooter", {
			clientShotId: 1,
			direction: [0, 0, -1],
			origin: [0, 1.72, 0],
		}),
	).toBe(true)
	simulation.update(0.01)

	expect(damage).toEqual([])
})
