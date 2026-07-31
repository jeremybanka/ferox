import assert from "node:assert/strict"
import test from "node:test"

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

	assert.equal(
		simulation.fire("shooter", {
			clientShotId: 1,
			direction: [0, 0, -1],
			origin: [0, 1.72, 0],
		}),
		true,
	)
	simulation.update(0.1)

	assert.deepEqual(damage, [{ damage: 20, playerId: "target" }])
	assert.deepEqual(endedProjectiles, [{ id: 1 }])
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

	assert.equal(
		simulation.throwGrenade("thrower", {
			clientGrenadeId: 1,
			direction: [0, 1, 0],
			origin: [0, -0.88, 0],
		}),
		true,
	)
	for (let index = 0; index < 23; index += 1) simulation.update(0.1)

	assert.equal(grenadeSnapshots.length, 1)
	assert.equal(grenadeSnapshots[0]?.ownerId, "thrower")
	assert.equal(explosions.length, 1)
	assert.equal(explosions[0]?.id, grenadeSnapshots[0]?.id)
	assert.deepEqual(damage.map(({ playerId }) => playerId).sort(), [
		"target",
		"thrower",
	])
	assert.ok(damage.every(({ damage: amount }) => amount > 0 && amount <= 120))
})

test("grenade damage drops by 20 for every meter from the blast center", () => {
	assert.deepEqual(
		[0, 0.99, 1, 1.99, 2, 3, 4, 5, 5.99, 6].map(grenadeDamageAtDistance),
		[120, 120, 100, 100, 80, 60, 40, 20, 20, 0],
	)
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

	assert.equal(
		simulation.fire("shooter", {
			clientShotId: 1,
			direction: [0, 0, -1],
			origin: [0, 1.72, 0],
		}),
		true,
	)
	simulation.update(0.01)

	assert.deepEqual(damage, [])
})
