import assert from "node:assert/strict"

import * as THREE from "three"
import { expect, test } from "vitest"

import type {
	GrenadeExplodedSnapshot,
	GrenadeSnapshot,
	DirectHitResult,
	MiniMissileEndedSnapshot,
	MiniMissileExplodedSnapshot,
	MiniMissileSnapshot,
	PlayerDamageImpact,
	ProjectileEndedSnapshot,
} from "../src/arena-protocol.ts"
import {
	grenadeDamageAtDistance,
	MINI_MISSILE_BLAST_RADIUS,
	MINI_MISSILE_DAMAGE,
	MINI_MISSILE_MAX_TURN_RATE,
	MINI_MISSILE_SEEKER_RANGE,
	MINI_MISSILE_SEEKER_SCAN_SECONDS,
	miniMissileDamageAtDistance,
} from "../src/game-constants.ts"
import {
	pilotTorsoTargetFromEye,
	pilotTorsoTargetFromRoot,
} from "../src/pilot-targeting.ts"
import {
	PILOT_CROUCH_HEAD_CENTER_HEIGHT,
	PILOT_STANDING_HEAD_CENTER_HEIGHT,
} from "../src/pilot/PilotDimensions.ts"
import {
	ArenaSimulation,
	type SimulationDroneSeed,
	type SimulationPlayer,
} from "./ArenaSimulation.ts"

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
		emitMiniMissile: () => undefined,
		emitMiniMissileEnded: () => undefined,
		emitMiniMissileExploded: () => undefined,
		emitProjectile: () => undefined,
		emitProjectileEnded: (snapshot) => endedProjectiles.push(snapshot),
		getPlayers: () => players,
		onDirectHit: (playerId, result) => directHits.push({ playerId, result }),
		onDroneKilled: () => undefined,
		onLockChanged: () => undefined,
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

test("player projectile intent IDs reject replay before spawning", () => {
	const players: SimulationPlayer[] = [
		{
			crouching: false,
			id: "shooter",
			position: [0, 1.72, 0],
			velocity: [0, 0, 0],
		},
	]
	const simulation = makeSimulation(players, () => undefined, [])
	const intent = {
		clientShotId: 7,
		direction: [0, 0, -1] as [number, number, number],
		origin: [0, 1, 0] as [number, number, number],
	}
	expect(simulation.fire("shooter", intent)).toBe(true)
	expect(simulation.fire("shooter", intent)).toBe(false)
	expect(simulation.fire("shooter", { ...intent, clientShotId: 6 })).toBe(false)
	expect(simulation.fire("shooter", { ...intent, clientShotId: 8 })).toBe(true)
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
			origin: [0, PILOT_STANDING_HEAD_CENTER_HEIGHT, 0],
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
		origin: [0, PILOT_CROUCH_HEAD_CENTER_HEIGHT, 0],
	})
	simulation.update(0.1)

	expect(damage).toEqual([40])
})

test.each([false, true])(
	"the shared torso target produces a normal hit for crouching=%s",
	(crouching) => {
		const targetRoot: [number, number, number] = [0, 0, -4]
		const targetEyeHeight = crouching ? 1.08 : 1.72
		const torso = pilotTorsoTargetFromRoot(targetRoot, crouching)
		const players: SimulationPlayer[] = [
			{
				crouching: false,
				id: "shooter",
				position: [0, 1.72, 0],
				velocity: [0, 0, 0],
			},
			{
				crouching,
				id: "target",
				position: [0, targetEyeHeight, -4],
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

		expect(
			simulation.fire("shooter", {
				clientShotId: 9,
				direction: [0, 0, -1],
				origin: [0, torso[1], 0],
			}),
		).toBe(true)
		simulation.update(0.1)

		expect(damage).toEqual([20])
		expect(hits[0]?.result.classification).toBe("normal")
	},
)

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
		emitMiniMissile: () => undefined,
		emitMiniMissileEnded: () => undefined,
		emitMiniMissileExploded: () => undefined,
		emitProjectile: () => undefined,
		emitProjectileEnded: () => undefined,
		getPlayers: () => players,
		onDirectHit: () => undefined,
		onDroneKilled: () => undefined,
		onLockChanged: () => undefined,
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

type MissileHarness = {
	damage: Array<{ amount: number; playerId: string }>
	ended: MiniMissileEndedSnapshot[]
	explosions: MiniMissileExplodedSnapshot[]
	locks: Array<{ attackerId: string; locked: boolean; targetId: string }>
	missiles: MiniMissileSnapshot[]
	simulation: ArenaSimulation
}

function makeMissileHarness(
	players: SimulationPlayer[],
	initialDrones: readonly SimulationDroneSeed[] = [],
): MissileHarness {
	const damage: MissileHarness["damage"] = []
	const ended: MiniMissileEndedSnapshot[] = []
	const explosions: MiniMissileExplodedSnapshot[] = []
	const locks: MissileHarness["locks"] = []
	const missiles: MiniMissileSnapshot[] = []
	const simulation = new ArenaSimulation({
		emitDroneDestroyed: () => undefined,
		emitGrenade: () => undefined,
		emitGrenadeExploded: () => undefined,
		emitMiniMissile: (snapshot) => missiles.push(snapshot),
		emitMiniMissileEnded: (snapshot) => ended.push(snapshot),
		emitMiniMissileExploded: (snapshot) => explosions.push(snapshot),
		emitProjectile: () => undefined,
		emitProjectileEnded: () => undefined,
		getPlayers: () => players,
		initialDrones,
		onDirectHit: () => undefined,
		onDroneKilled: () => undefined,
		onLockChanged: (attackerId, targetId, locked) =>
			locks.push({ attackerId, locked, targetId }),
		onPlayerDamage: (playerId, amount) => damage.push({ amount, playerId }),
		seed: 7_431_905,
	})
	return { damage, ended, explosions, locks, missiles, simulation }
}

test.each([false, true])(
	"valid launch designation uses the shared torso point for crouching=%s",
	(crouching) => {
		const origin: [number, number, number] = [0, 20, 0]
		const players: SimulationPlayer[] = [
			{
				crouching: false,
				id: "owner",
				position: origin,
				velocity: [0, 0, 0],
			},
			{
				crouching,
				id: "near",
				position: [6, 20, -12],
				velocity: [0, 0, 0],
			},
			{
				crouching: false,
				id: "outside",
				position: [MINI_MISSILE_SEEKER_RANGE + 1, 20, 0],
				velocity: [0, 0, 0],
			},
		]
		const harness = makeMissileHarness(players)
		const torso = pilotTorsoTargetFromEye(players[1]!.position, crouching)
		const direction = new THREE.Vector3(...torso)
			.sub(new THREE.Vector3(...origin))
			.normalize()
			.toArray()

		assert.equal(
			harness.simulation.fireMiniMissile("owner", {
				clientMissileId: 1,
				direction,
				origin,
				target: { id: "near", kind: "pilot" },
			}),
			true,
		)
		assert.deepEqual(harness.locks, [
			{ attackerId: "owner", locked: true, targetId: "near" },
		])
		assert.deepEqual(Object.keys(harness.missiles[0] ?? {}).sort(), [
			"id",
			"phase",
			"position",
			"velocity",
		])
	},
)

test("mini-missiles reject replayed IDs and ignore invalid designations", () => {
	const players: SimulationPlayer[] = [
		{
			crouching: false,
			id: "owner",
			position: [0, 20, 0],
			velocity: [0, 0, 0],
		},
		{
			crouching: false,
			id: "outside",
			position: [MINI_MISSILE_SEEKER_RANGE + 1, 20, 0],
			velocity: [0, 0, 0],
		},
	]
	const harness = makeMissileHarness(players)
	assert.equal(
		harness.simulation.fireMiniMissile("owner", null as never),
		false,
	)
	const intent = {
		clientMissileId: 4,
		direction: [0, 1, 0] as [number, number, number],
		origin: [0, 20, 0] as [number, number, number],
		target: { id: "outside", kind: "pilot" } as const,
	}
	assert.equal(harness.simulation.fireMiniMissile("owner", intent), true)
	assert.equal(harness.simulation.fireMiniMissile("owner", intent), false)
	assert.equal(harness.missiles.length, 1)
	assert.deepEqual(harness.locks, [])
})

test("targetless missiles fly straight until the seeker scan cadence elapses", () => {
	const players: SimulationPlayer[] = [
		{
			crouching: false,
			id: "owner",
			position: [0, 40, 0],
			velocity: [0, 0, 0],
		},
		{
			crouching: false,
			id: "candidate",
			position: [6, 40, -20],
			velocity: [0, 0, 0],
		},
	]
	const harness = makeMissileHarness(players)
	harness.simulation.fireMiniMissile("owner", {
		clientMissileId: 1,
		direction: [0, 0, -1],
		origin: [0, 40, 0],
	})

	harness.simulation.update(MINI_MISSILE_SEEKER_SCAN_SECONDS - 0.02)
	assert.deepEqual(
		harness.simulation.snapshot().missiles[0]?.velocity,
		[0, 0, -11],
	)
	assert.deepEqual(harness.locks, [])
	harness.simulation.update(0.02)
	assert.ok((harness.simulation.snapshot().missiles[0]?.velocity[0] ?? 0) > 0)
	assert.deepEqual(harness.locks, [
		{ attackerId: "owner", locked: true, targetId: "candidate" },
	])
})

test("targetless missiles can acquire a drone after it enters seeker range", () => {
	const players: SimulationPlayer[] = [
		{
			crouching: false,
			id: "owner",
			position: [0, 40, 0],
			velocity: [0, 0, 0],
		},
	]
	const harness = makeMissileHarness(players, [
		{ id: 12, position: [8, 40, -52] },
	])
	harness.simulation.fireMiniMissile("owner", {
		clientMissileId: 1,
		direction: [0, 0, -1],
		origin: [0, 40, 0],
	})

	harness.simulation.update(MINI_MISSILE_SEEKER_SCAN_SECONDS)
	assert.deepEqual(
		harness.simulation.snapshot().missiles[0]?.velocity,
		[0, 0, -11],
	)
	for (let index = 0; index < 6; index += 1) {
		harness.simulation.update(MINI_MISSILE_SEEKER_SCAN_SECONDS)
	}
	assert.ok((harness.simulation.snapshot().missiles[0]?.velocity[0] ?? 0) > 0)
	assert.deepEqual(harness.locks, [])
})

test("a valid drone designation steers immediately without a pilot warning", () => {
	const players: SimulationPlayer[] = [
		{
			crouching: false,
			id: "owner",
			position: [0, 40, 0],
			velocity: [0, 0, 0],
		},
	]
	const harness = makeMissileHarness(players, [
		{ id: 8, position: [6, 40, -16] },
	])
	harness.simulation.fireMiniMissile("owner", {
		clientMissileId: 1,
		direction: [0, 0, -1],
		origin: [0, 40, 0],
		target: { id: 8, kind: "drone" },
	})

	harness.simulation.update(0.05)
	assert.ok((harness.simulation.snapshot().missiles[0]?.velocity[0] ?? 0) > 0)
	assert.deepEqual(harness.locks, [])
})

test("spoofed designation falls back to an authoritative seeker candidate", () => {
	const players: SimulationPlayer[] = [
		{
			crouching: false,
			id: "owner",
			position: [0, 40, 0],
			velocity: [0, 0, 0],
		},
		{
			crouching: false,
			id: "spoofed",
			position: [20, 40, 0],
			velocity: [0, 0, 0],
		},
		{
			crouching: false,
			id: "legit",
			position: [4, 40, -18],
			velocity: [0, 0, 0],
		},
	]
	const harness = makeMissileHarness(players)
	harness.simulation.fireMiniMissile("owner", {
		clientMissileId: 1,
		direction: [0, 0, -1],
		origin: [0, 40, 0],
		target: { id: "spoofed", kind: "pilot" },
	})
	assert.deepEqual(harness.locks, [])

	harness.simulation.update(MINI_MISSILE_SEEKER_SCAN_SECONDS)
	assert.deepEqual(harness.locks, [
		{ attackerId: "owner", locked: true, targetId: "legit" },
	])
})

test("mini-missile steering is turn-rate limited", () => {
	const players: SimulationPlayer[] = [
		{
			crouching: false,
			id: "owner",
			position: [0, 20, 0],
			velocity: [0, 0, 0],
		},
		{
			crouching: false,
			id: "target",
			position: [6, 20, -12],
			velocity: [0, 0, 0],
		},
	]
	const harness = makeMissileHarness(players)
	harness.simulation.fireMiniMissile("owner", {
		clientMissileId: 1,
		direction: [0, 0, -1],
		origin: [0, 20, 0],
		target: { id: "target", kind: "pilot" },
	})
	harness.simulation.update(0.1)
	const velocity = harness.simulation.snapshot().missiles[0]?.velocity
	assert.ok(velocity !== undefined)
	const turn = Math.acos(
		Math.max(-1, Math.min(1, -velocity[2] / Math.hypot(...velocity))),
	)
	assert.ok(turn > 0)
	assert.ok(turn <= MINI_MISSILE_MAX_TURN_RATE * 0.1 + 0.02)
})

test("designated targets stay sticky after moving behind the missile", () => {
	const players: SimulationPlayer[] = [
		{
			crouching: false,
			id: "owner",
			position: [0, 20, 0],
			velocity: [0, 0, 0],
		},
		{
			crouching: false,
			id: "target",
			position: [0, 20, -12],
			velocity: [0, 0, 0],
		},
	]
	const harness = makeMissileHarness(players)
	harness.simulation.fireMiniMissile("owner", {
		clientMissileId: 1,
		direction: [0, 0, -1],
		origin: [0, 20, 0],
		target: { id: "target", kind: "pilot" },
	})
	players[1]!.position = [0, 20, 10]
	harness.simulation.update(0.1)

	const velocity = harness.simulation.snapshot().missiles[0]?.velocity
	assert.ok(velocity !== undefined)
	const turn = new THREE.Vector3(0, 0, -1).angleTo(
		new THREE.Vector3(...velocity),
	)
	assert.ok(turn > 0)
	assert.ok(turn <= MINI_MISSILE_MAX_TURN_RATE * 0.1 + 0.02)
	assert.deepEqual(harness.locks, [
		{ attackerId: "owner", locked: true, targetId: "target" },
	])
})

test("pilot loss clears its warning before fallback acquisition resumes", () => {
	const players: SimulationPlayer[] = [
		{
			crouching: false,
			id: "owner",
			position: [0, 20, 0],
			velocity: [0, 0, 0],
		},
		{
			crouching: false,
			id: "target",
			position: [0, 20, -12],
			velocity: [0, 0, 0],
		},
		{
			crouching: false,
			id: "fallback",
			position: [5, 20, -20],
			velocity: [0, 0, 0],
		},
	]
	const harness = makeMissileHarness(players)
	harness.simulation.fireMiniMissile("owner", {
		clientMissileId: 1,
		direction: [0, 0, -1],
		origin: [0, 20, 0],
		target: { id: "target", kind: "pilot" },
	})
	players.splice(1, 1)
	harness.simulation.removePlayer("target")
	harness.simulation.update(MINI_MISSILE_SEEKER_SCAN_SECONDS)

	assert.equal(harness.simulation.snapshot().missiles.length, 1)
	assert.deepEqual(harness.locks, [
		{ attackerId: "owner", locked: true, targetId: "target" },
		{ attackerId: "owner", locked: false, targetId: "target" },
		{ attackerId: "owner", locked: true, targetId: "fallback" },
	])
})

test("destroyed drone targets fall back to pilots from the current heading", () => {
	const players: SimulationPlayer[] = [
		{
			crouching: false,
			id: "owner",
			position: [0, 40, 0],
			velocity: [0, 0, 0],
		},
		{
			crouching: false,
			id: "fallback",
			position: [-5, 40, -20],
			velocity: [0, 0, 0],
		},
	]
	const harness = makeMissileHarness(players, [
		{ id: 6, position: [5, 40, -16] },
	])
	harness.simulation.fireMiniMissile("owner", {
		clientMissileId: 1,
		direction: [0, 0, -1],
		origin: [0, 40, 0],
		target: { id: 6, kind: "drone" },
	})
	harness.simulation.removeDrone(6)
	harness.simulation.update(MINI_MISSILE_SEEKER_SCAN_SECONDS)

	assert.deepEqual(harness.locks, [
		{ attackerId: "owner", locked: true, targetId: "fallback" },
	])
})

test("powered flight transitions to gravity and ends in one ground explosion", () => {
	const players: SimulationPlayer[] = [
		{
			crouching: false,
			id: "owner",
			position: [0, 40, 0],
			velocity: [0, 0, 0],
		},
	]
	const harness = makeMissileHarness(players)
	harness.simulation.fireMiniMissile("owner", {
		clientMissileId: 1,
		direction: [0, 1, 0],
		origin: [0, 40, 0],
	})
	for (let index = 0; index < 101; index += 1) harness.simulation.update(0.1)
	const falling = harness.simulation.snapshot().missiles[0]
	assert.equal(falling?.phase, "falling")
	const verticalVelocity = falling?.velocity[1] ?? 0
	harness.simulation.update(0.1)
	assert.ok(
		(harness.simulation.snapshot().missiles[0]?.velocity[1] ?? 0) <
			verticalVelocity,
	)
	for (
		let index = 0;
		index < 200 && harness.explosions.length === 0;
		index += 1
	) {
		harness.simulation.update(0.1)
	}
	assert.equal(harness.explosions.length, 1)
	assert.equal(harness.ended.length, 1)
	assert.equal(harness.simulation.snapshot().missiles.length, 0)
})

test("missile falloff is linear from exact center damage to zero at radius", () => {
	assert.equal(miniMissileDamageAtDistance(0), MINI_MISSILE_DAMAGE)
	assert.equal(miniMissileDamageAtDistance(MINI_MISSILE_BLAST_RADIUS / 2), 5)
	assert.equal(miniMissileDamageAtDistance(MINI_MISSILE_BLAST_RADIUS), 0)
	assert.equal(miniMissileDamageAtDistance(MINI_MISSILE_BLAST_RADIUS + 1), 0)
})

test("removing a shooter clears its lock and despawns missiles without explosion", () => {
	const players: SimulationPlayer[] = [
		{
			crouching: false,
			id: "owner",
			position: [0, 20, 0],
			velocity: [0, 0, 0],
		},
		{
			crouching: false,
			id: "target",
			position: [0, 20, -12],
			velocity: [0, 0, 0],
		},
	]
	const harness = makeMissileHarness(players)
	harness.simulation.fireMiniMissile("owner", {
		clientMissileId: 1,
		direction: [0, 0, -1],
		origin: [0, 20, 0],
		target: { id: "target", kind: "pilot" },
	})
	harness.simulation.removePlayer("owner")

	assert.equal(harness.simulation.activeMissilesForOwner("owner"), 0)
	assert.equal(harness.ended.length, 1)
	assert.equal(harness.explosions.length, 0)
	assert.equal(harness.locks.at(-1)?.locked, false)
})

test("contact explodes once, damages the victim once, and excludes owner splash", () => {
	const players: SimulationPlayer[] = [
		{
			crouching: false,
			id: "owner",
			position: [0, 20, 0],
			velocity: [0, 0, 0],
		},
		{
			crouching: false,
			id: "target",
			position: [0, 20, -4],
			velocity: [0, 0, 0],
		},
	]
	const harness = makeMissileHarness(players)
	harness.simulation.fireMiniMissile("owner", {
		clientMissileId: 1,
		direction: [0, 0, -1],
		origin: [0, 20, 0],
	})
	for (
		let index = 0;
		index < 10 && harness.explosions.length === 0;
		index += 1
	) {
		harness.simulation.update(0.05)
	}
	harness.simulation.update(0.2)

	assert.equal(harness.explosions.length, 1)
	assert.equal(harness.ended.length, 1)
	assert.deepEqual(
		harness.damage.map(({ playerId }) => playerId),
		["target"],
	)
	assert.ok(harness.damage[0]?.amount !== undefined)
	assert.ok((harness.damage[0]?.amount ?? 0) > 0)
	assert.ok((harness.damage[0]?.amount ?? 0) <= MINI_MISSILE_DAMAGE)
})
