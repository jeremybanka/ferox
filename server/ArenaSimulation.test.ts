import { expect, test } from "vitest"

import type {
	GrenadeExplodedSnapshot,
	GrenadeSnapshot,
	ProjectileEndedSnapshot,
} from "../src/arena-protocol.ts"
import { grenadeDamageAtDistance } from "../src/game-constants.ts"
import { ArenaSimulation, type SimulationPlayer } from "./ArenaSimulation.ts"

function makeSimulation(
	players: SimulationPlayer[],
	onPlayerDamage: (playerId: string, damage: number) => void,
	endedProjectiles: ProjectileEndedSnapshot[],
): ArenaSimulation {
	return new ArenaSimulation({
		emitDroneDestroyed: () => undefined,
		emitGrenade: () => undefined,
		emitGrenadeExploded: () => undefined,
		emitProjectile: () => undefined,
		emitProjectileEnded: (snapshot) => endedProjectiles.push(snapshot),
		getPlayers: () => players,
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
	const damage: Array<{ damage: number; playerId: string }> = []
	const endedProjectiles: ProjectileEndedSnapshot[] = []
	const simulation = makeSimulation(
		players,
		(playerId, amount) => damage.push({ damage: amount, playerId }),
		endedProjectiles,
	)

	expect(
		simulation.fire("shooter", {
			clientShotId: 1,
			direction: [0, 0, -1],
			origin: [0, 1.72, 0],
		}),
	).toBe(true)
	simulation.update(0.1)

	expect(damage).toEqual([{ damage: 20, playerId: "target" }])
	expect(endedProjectiles).toEqual([{ id: 1 }])
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
	const damage: Array<{ damage: number; playerId: string }> = []
	const grenadeSnapshots: GrenadeSnapshot[] = []
	const explosions: GrenadeExplodedSnapshot[] = []
	const simulation = new ArenaSimulation({
		emitDroneDestroyed: () => undefined,
		emitGrenade: (snapshot) => grenadeSnapshots.push(snapshot),
		emitGrenadeExploded: (snapshot) => explosions.push(snapshot),
		emitProjectile: () => undefined,
		emitProjectileEnded: () => undefined,
		getPlayers: () => players,
		onDroneKilled: () => undefined,
		onPlayerDamage: (playerId, amount) =>
			damage.push({ damage: amount, playerId }),
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
	expect(damage.map(({ playerId }) => playerId).sort()).toEqual([
		"target",
		"thrower",
	])
	expect(
		damage.every(({ damage: amount }) => amount > 0 && amount <= 120),
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
