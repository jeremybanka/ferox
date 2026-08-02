import { expect, test } from "vitest"

import type {
	BallisticSnapshot,
	DirectHitResult,
	PlayerDamageImpact,
	ProjectileEndedSnapshot,
	ShotgunPelletSnapshot,
	ShotgunVolleySnapshot,
} from "../src/arena-protocol.ts"
import {
	BUBBLE_HEALTH,
	RAIL_DAMAGE_MAX,
	RAIL_DAMAGE_MIN,
	SHOTGUN_CONE_HALF_ANGLE_RADIANS,
	SHOTGUN_MAX_ACTIVE_PELLETS,
	SHOTGUN_PELLET_COUNT,
	SHOTGUN_PELLET_DAMAGE,
	SHOTGUN_PELLET_HANG_SECONDS,
	SHOTGUN_PELLET_MAX_DISTANCE,
	SHOTGUN_PELLET_SPEED,
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
	const ended: ProjectileEndedSnapshot[] = []
	const suspended: ShotgunPelletSnapshot[] = []
	const volleys: ShotgunVolleySnapshot[] = []
	const simulation = new ArenaSimulation({
		emitBallistic: (snapshot) => ballistics.push(snapshot),
		emitDroneDestroyed: () => undefined,
		emitGrenade: () => undefined,
		emitGrenadeExploded: () => undefined,
		emitMiniMissile: () => undefined,
		emitMiniMissileEnded: () => undefined,
		emitMiniMissileExploded: () => undefined,
		emitProjectile: () => undefined,
		emitProjectileEnded: (snapshot) => ended.push(snapshot),
		emitShotgunPelletSuspended: (snapshot) => suspended.push(snapshot),
		emitShotgunVolley: (snapshot) => volleys.push(snapshot),
		getPlayers: () => players,
		onDirectHit: (playerId, result) => hits.push({ playerId, result }),
		onDroneKilled: () => undefined,
		onLockChanged: () => undefined,
		onPlayerDamage: (playerId, amount, impact) =>
			damage.push({ amount, impact, playerId }),
		seed: 7_431_905,
	})
	return { ballistics, damage, ended, hits, simulation, suspended, volleys }
}

test("shotgun emits one deterministic 20-pellet, six-damage high-speed cone", () => {
	const players: SimulationPlayer[] = [
		{
			crouching: false,
			id: "shooter",
			position: [0, 50, 0],
			velocity: [0, 0, 0],
		},
	]
	const first = simulationHarness(players)
	const second = simulationHarness(players)
	const intent = {
		clientShotId: 1,
		direction: [0, 0, -1] as [number, number, number],
		origin: [0, 50, 0] as [number, number, number],
	}
	expect(first.simulation.fireShotgun("shooter", intent)).toBe(true)
	expect(second.simulation.fireShotgun("shooter", intent)).toBe(true)
	expect(first.volleys).toHaveLength(1)
	const volley = first.volleys[0]!
	expect(volley.pellets).toHaveLength(SHOTGUN_PELLET_COUNT)
	expect(volley.damage).toBe(SHOTGUN_PELLET_DAMAGE)
	expect(volley.speed).toBe(SHOTGUN_PELLET_SPEED)
	expect(volley.maxDistance).toBe(SHOTGUN_PELLET_MAX_DISTANCE)
	expect(volley.hangSeconds).toBe(SHOTGUN_PELLET_HANG_SECONDS)
	for (const pellet of volley.pellets) {
		const [x, y, z] = pellet.direction
		const angle = Math.acos(Math.max(-1, Math.min(1, -z)))
		expect(angle).toBeLessThanOrEqual(
			SHOTGUN_CONE_HALF_ANGLE_RADIANS + Number.EPSILON * 8,
		)
		expect(Math.hypot(x, y, z)).toBeCloseTo(1, 12)
	}
	expect(
		new Set(volley.pellets.map((pellet) => pellet.direction.join(","))).size,
	).toBe(SHOTGUN_PELLET_COUNT)
	expect(second.volleys[0]?.pellets).toEqual(volley.pellets)
})

test("shotgun close hit aggregates 20 authoritative six-damage contacts without replay", () => {
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
	harness.simulation.update(0.01)
	expect(harness.damage).toHaveLength(SHOTGUN_PELLET_COUNT)
	expect(
		harness.damage.every(({ amount }) => amount === SHOTGUN_PELLET_DAMAGE),
	).toBe(true)
	expect(harness.damage.reduce((total, hit) => total + hit.amount, 0)).toBe(120)
	expect(
		harness.damage.every(({ impact }) => impact.source === "projectile"),
	).toBe(true)
	expect(harness.hits).toHaveLength(SHOTGUN_PELLET_COUNT)
	expect(
		harness.simulation.fireShotgun("shooter", {
			clientShotId: 1,
			direction: [0, 0, -1],
			origin: [0, 1, 0],
		}),
	).toBe(false)
	harness.simulation.update(0.02)
	expect(harness.damage).toHaveLength(SHOTGUN_PELLET_COUNT)
})

test("missed pellets stop exactly at 20m, remain stationary, then expire after 10s", () => {
	const harness = simulationHarness([
		{
			crouching: false,
			id: "shooter",
			position: [0, 50, 0],
			velocity: [0, 0, 0],
		},
	])
	harness.simulation.fireShotgun("shooter", {
		clientShotId: 1,
		direction: [0, 0, -1],
		origin: [0, 50, 0],
	})
	harness.simulation.update(SHOTGUN_PELLET_MAX_DISTANCE / SHOTGUN_PELLET_SPEED)
	expect(harness.suspended).toHaveLength(SHOTGUN_PELLET_COUNT)
	for (const pellet of harness.suspended) {
		expect(
			Math.hypot(
				pellet.position[0] - pellet.origin[0],
				pellet.position[1] - pellet.origin[1],
				pellet.position[2] - pellet.origin[2],
			),
		).toBeCloseTo(SHOTGUN_PELLET_MAX_DISTANCE, 12)
		expect(pellet.phase).toBe("suspended")
	}
	const fixedPositions = harness.simulation
		.shotgunPellets()
		.map(({ position }) => position)
	harness.simulation.update(SHOTGUN_PELLET_HANG_SECONDS - 0.001)
	expect(
		harness.simulation.shotgunPellets().map(({ position }) => position),
	).toEqual(fixedPositions)
	expect(harness.simulation.shotgunPellets()).toHaveLength(SHOTGUN_PELLET_COUNT)
	harness.simulation.update(0.002)
	expect(harness.simulation.shotgunPellets()).toHaveLength(0)
	expect(harness.ended).toHaveLength(SHOTGUN_PELLET_COUNT)
})

test("a suspended pellet remains live for one contact and cannot deal duplicate damage", () => {
	const players: SimulationPlayer[] = [
		{
			crouching: false,
			id: "shooter",
			position: [0, 50, 0],
			velocity: [0, 0, 0],
		},
	]
	const harness = simulationHarness(players)
	harness.simulation.fireShotgun("shooter", {
		clientShotId: 1,
		direction: [0, 0, -1],
		origin: [0, 50, 0],
	})
	harness.simulation.update(SHOTGUN_PELLET_MAX_DISTANCE / SHOTGUN_PELLET_SPEED)
	const center = harness.suspended[0]!
	players.push({
		crouching: false,
		id: "target",
		position: [
			center.position[0],
			center.position[1] + 0.8,
			center.position[2],
		],
		velocity: [0, 0, 0],
	})
	harness.simulation.update(0.001)
	expect(harness.damage).toHaveLength(1)
	expect(harness.damage[0]?.amount).toBe(SHOTGUN_PELLET_DAMAGE)
	expect(harness.simulation.shotgunPellets()).toHaveLength(
		SHOTGUN_PELLET_COUNT - 1,
	)
	harness.simulation.update(0.001)
	expect(harness.damage).toHaveLength(1)
})

test("sustained shotgun fire is capped while every newest volley stays complete", () => {
	const harness = simulationHarness([
		{
			crouching: false,
			id: "shooter",
			position: [0, 50, 0],
			velocity: [0, 0, 0],
		},
	])
	for (let clientShotId = 1; clientShotId <= 60; clientShotId += 1) {
		expect(
			harness.simulation.fireShotgun("shooter", {
				clientShotId,
				direction: [0, 0, -1],
				origin: [0, 50, 0],
			}),
		).toBe(true)
		expect(harness.volleys.at(-1)?.pellets).toHaveLength(SHOTGUN_PELLET_COUNT)
	}
	expect(harness.simulation.shotgunPellets()).toHaveLength(
		SHOTGUN_MAX_ACTIVE_PELLETS,
	)
	expect(harness.ended).toHaveLength(
		60 * SHOTGUN_PELLET_COUNT - SHOTGUN_MAX_ACTIVE_PELLETS,
	)
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
	expect(armory.consumeActive("pilot", "shotgun")).toBe(true)
	expect(armory.refillReload("pilot", { gunId: "shotgun", slot: 1 })).toBe(true)
	expect(armory.equipment("pilot").slots[1]?.ammo).toBe(6)
})
