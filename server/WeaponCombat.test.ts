import { expect, test } from "vitest"

import type {
	BallisticSnapshot,
	DirectHitResult,
	PlayerDamageImpact,
} from "../src/arena-protocol.ts"
import {
	BUBBLE_HEALTH,
	RAIL_DAMAGE_MAX,
	RAIL_DAMAGE_MIN,
	shotgunDamageAtDistance,
} from "../src/game-constants.ts"
import { ArenaSimulation, type SimulationPlayer } from "./ArenaSimulation.ts"
import { MiniMissileArmory } from "./MiniMissileArmory.ts"

function simulationHarness(players: SimulationPlayer[]) {
	const damage: Array<{
		amount: number
		impact: PlayerDamageImpact
		playerId: string
	}> = []
	const hits: Array<{ playerId: string; result: DirectHitResult }> = []
	const ballistics: BallisticSnapshot[] = []
	const simulation = new ArenaSimulation({
		emitBallistic: (snapshot) => ballistics.push(snapshot),
		emitDroneDestroyed: () => undefined,
		emitGrenade: () => undefined,
		emitGrenadeExploded: () => undefined,
		emitMiniMissile: () => undefined,
		emitMiniMissileEnded: () => undefined,
		emitMiniMissileExploded: () => undefined,
		emitProjectile: () => undefined,
		emitProjectileEnded: () => undefined,
		getPlayers: () => players,
		onDirectHit: (playerId, result) => hits.push({ playerId, result }),
		onDroneKilled: () => undefined,
		onLockChanged: () => undefined,
		onPlayerDamage: (playerId, amount, impact) =>
			damage.push({ amount, impact, playerId }),
		seed: 7_431_905,
	})
	return { ballistics, damage, hits, simulation }
}

test("shotgun falloff is 150 through one meter and reaches zero at maximum range", () => {
	expect(shotgunDamageAtDistance(0)).toBe(150)
	expect(shotgunDamageAtDistance(1)).toBe(150)
	expect(shotgunDamageAtDistance(6)).toBeLessThan(150)
	expect(shotgunDamageAtDistance(13)).toBe(0)
})

test("shotgun resolves one authoritative point-blank trace", () => {
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
			position: [0, 1.72, -1],
			velocity: [0, 0, 0],
		},
	]
	const harness = simulationHarness(players)
	expect(
		harness.simulation.fireShotgun("shooter", {
			clientShotId: 1,
			direction: [0, 0, -1],
			origin: [0, 1, 0],
		}),
	).toBe(true)
	expect(harness.damage).toHaveLength(1)
	expect(harness.damage[0]?.amount).toBe(150)
	expect(harness.damage[0]?.impact.source).toBe("hitscan")
	expect(harness.hits).toHaveLength(1)
	expect(
		harness.simulation.fireShotgun("shooter", {
			clientShotId: 1,
			direction: [0, 0, -1],
			origin: [0, 1, 0],
		}),
	).toBe(false)
})

test("bubble entities are bounded, damageable shields", () => {
	const players: SimulationPlayer[] = [
		{
			crouching: false,
			id: "bubble-owner",
			position: [0, 8, 0],
			velocity: [0, 0, 0],
		},
		{
			crouching: false,
			id: "rail-owner",
			position: [0, 8, -4],
			velocity: [0, 0, 0],
		},
	]
	const harness = simulationHarness(players)
	expect(
		harness.simulation.fireBubbles("bubble-owner", {
			clientShotId: 1,
			direction: [0, 0, -1],
			origin: [0, 8, -0.6],
		}),
	).toBe(true)
	expect(harness.simulation.snapshot().bubbles).toHaveLength(7)
	expect(harness.simulation.snapshot().bubbles[0]?.health).toBe(BUBBLE_HEALTH)
	expect(
		harness.simulation.fireRail(
			"rail-owner",
			{ clientShotId: 2, direction: [0, 0, 1], origin: [0, 8, -3.8] },
			1,
		),
	).toBe(true)
	harness.simulation.update(0.05)
	expect(harness.simulation.snapshot().ballistics).toHaveLength(0)
	expect(harness.damage).toHaveLength(0)
})

test("rail charge monotonically increases speed and damage while flattening gravity", () => {
	const players: SimulationPlayer[] = [
		{ crouching: false, id: "rail", position: [0, 8, 0], velocity: [0, 0, 0] },
	]
	const low = simulationHarness(players)
	const high = simulationHarness(players)
	expect(
		low.simulation.fireRail(
			"rail",
			{ clientShotId: 1, direction: [0, 0, -1], origin: [0, 8, 0] },
			0,
		),
	).toBe(true)
	expect(
		high.simulation.fireRail(
			"rail",
			{ clientShotId: 1, direction: [0, 0, -1], origin: [0, 8, 0] },
			1,
		),
	).toBe(true)
	const lowSpeed = Math.hypot(...(low.ballistics[0]?.velocity ?? [0, 0, 0]))
	const highSpeed = Math.hypot(...(high.ballistics[0]?.velocity ?? [0, 0, 0]))
	expect(highSpeed).toBeGreaterThan(lowSpeed)
	low.simulation.update(0.02)
	high.simulation.update(0.02)
	expect(high.simulation.snapshot().ballistics[0]?.position[1]).toBeGreaterThan(
		low.simulation.snapshot().ballistics[0]?.position[1] ?? 0,
	)
	expect(RAIL_DAMAGE_MAX).toBeGreaterThan(RAIL_DAMAGE_MIN)
})

test("rail release shares the monotonic shot replay domain with other weapons", () => {
	const players: SimulationPlayer[] = [
		{
			crouching: false,
			id: "pilot",
			position: [0, 8, 0],
			velocity: [0, 0, 0],
		},
	]
	const harness = simulationHarness(players)
	expect(
		harness.simulation.fire("pilot", {
			clientShotId: 41,
			direction: [0, 0, -1],
			origin: [0, 8, 0],
		}),
	).toBe(true)
	expect(
		harness.simulation.fireRail(
			"pilot",
			{ clientShotId: 42, direction: [0, 0, -1], origin: [0, 8, 0] },
			0.5,
		),
	).toBe(true)
	expect(harness.simulation.snapshot().ballistics).toHaveLength(1)
})

test("armory generalizes secondary selection and inserts one shotgun shell", () => {
	const pads = [
		[-8, 0, 0],
		[0, 0, -8],
		[8, 0, 0],
	] as const
	const armory = new MiniMissileArmory([20, 0, 20], pads, 0)
	armory.connect("pilot")
	const shotgun = armory
		.arenaPickups()
		.find((pickup) => pickup.weapon === "shotgun")!
	expect(
		armory.collectArenaWeapon("pilot", "shotgun", shotgun.position, 0),
	).toBe(true)
	expect(armory.consumeActive("pilot", "hitscan")).toBe(true)
	expect(armory.refillReload("pilot", { gunId: "shotgun", slot: 1 })).toBe(true)
	expect(armory.equipment("pilot").slots[1]?.ammo).toBe(6)
})
