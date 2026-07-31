import assert from "node:assert/strict"
import test from "node:test"

import type { ProjectileEndedSnapshot } from "../src/arena-protocol.ts"
import { ArenaSimulation, type SimulationPlayer } from "./ArenaSimulation.ts"

function makeSimulation(
	players: SimulationPlayer[],
	onPlayerDamage: (playerId: string, damage: number) => void,
	endedProjectiles: ProjectileEndedSnapshot[],
): ArenaSimulation {
	return new ArenaSimulation({
		emitDroneDestroyed: () => undefined,
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
