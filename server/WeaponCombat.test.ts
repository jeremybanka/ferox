import { expect, test } from "vitest"
import * as THREE from "three"

import { ZERO_GRAVITY_ZONE } from "../src/ArenaZones.ts"
import type {
	BallisticEndedSnapshot,
	BallisticSnapshot,
	BubblePoppedSnapshot,
	BubbleSnapshot,
	DirectHitResult,
	MiniMissileEndedSnapshot,
	MiniMissileExplodedSnapshot,
	MiniMissileSnapshot,
	PlayerDamageImpact,
	ProjectileEndedSnapshot,
	ProjectileSnapshot,
	ShotgunPelletSnapshot,
	ShotgunVolleySnapshot,
} from "../src/arena-protocol.ts"
import {
	BUBBLE_HEALTH,
	BUBBLE_SPEED,
	BUBBLES_PER_SHOT,
	MINI_MISSILE_DAMAGE,
	PLAYER_PROJECTILE_DAMAGE,
	RAIL_DAMAGE_MAX,
	RAIL_DAMAGE_MIN,
	RAIL_GRAVITY_MAX,
	RAIL_GRAVITY_MIN,
	RAIL_KNOCKBACK_MAX,
	RAIL_KNOCKBACK_MIN,
	RAIL_SERVER_MINIMUM_INTERVAL_MS,
	RAIL_SPEED_MAX,
	RAIL_SPEED_MIN,
	SHOTGUN_CONE_HALF_ANGLE_RADIANS,
	SHOTGUN_MAX_ACTIVE_PELLETS,
	SHOTGUN_PELLET_COUNT,
	SHOTGUN_PELLET_DAMAGE,
	SHOTGUN_PELLET_HANG_SECONDS,
	SHOTGUN_PELLET_MAX_DISTANCE,
	SHOTGUN_PELLET_SPEED,
} from "../src/game-constants.ts"
import {
	ArenaSimulation,
	type SimulationDroneSeed,
	type SimulationPlayer,
} from "./ArenaSimulation.ts"
import { MiniMissileArmory } from "./MiniMissileArmory.ts"

function simulationHarness(
	players: SimulationPlayer[],
	initialDrones: readonly SimulationDroneSeed[] = [],
	maximumDamagePerPlayer?: number,
) {
	const damage: Array<{
		amount: number
		impact: PlayerDamageImpact
		playerId: string
	}> = []
	const hits: Array<{ playerId: string; result: DirectHitResult }> = []
	const ballistics: BallisticSnapshot[] = []
	const ballisticsEnded: BallisticEndedSnapshot[] = []
	const bubbles: BubbleSnapshot[] = []
	const bubblesPopped: BubblePoppedSnapshot[] = []
	const ended: ProjectileEndedSnapshot[] = []
	const missiles: MiniMissileSnapshot[] = []
	const missilesEnded: MiniMissileEndedSnapshot[] = []
	const missileExplosions: MiniMissileExplodedSnapshot[] = []
	const projectiles: ProjectileSnapshot[] = []
	const suspended: ShotgunPelletSnapshot[] = []
	const volleys: ShotgunVolleySnapshot[] = []
	const simulation = new ArenaSimulation({
		emitBallistic: (snapshot) => ballistics.push(snapshot),
		emitBallisticEnded: (snapshot) => ballisticsEnded.push(snapshot),
		emitBubble: (snapshot) => bubbles.push(snapshot),
		emitBubblePopped: (snapshot) => bubblesPopped.push(snapshot),
		emitDroneDestroyed: () => undefined,
		emitGrenade: () => undefined,
		emitGrenadeExploded: () => undefined,
		emitMiniMissile: (snapshot) => missiles.push(snapshot),
		emitMiniMissileEnded: (snapshot) => missilesEnded.push(snapshot),
		emitMiniMissileExploded: (snapshot) => missileExplosions.push(snapshot),
		emitProjectile: (snapshot) => projectiles.push(snapshot),
		emitProjectileEnded: (snapshot) => ended.push(snapshot),
		emitShotgunPelletSuspended: (snapshot) => suspended.push(snapshot),
		emitShotgunVolley: (snapshot) => volleys.push(snapshot),
		getPlayers: () => players,
		initialDrones,
		onDirectHit: (playerId, result) => hits.push({ playerId, result }),
		onDroneKilled: () => undefined,
		onLockChanged: () => undefined,
		onPlayerDamage: (playerId, amount, impact) => {
			const applied =
				maximumDamagePerPlayer === undefined
					? amount
					: Math.min(amount, maximumDamagePerPlayer)
			damage.push({ amount: applied, impact, playerId })
			return maximumDamagePerPlayer === undefined ? undefined : applied
		},
		seed: 7_431_905,
	})
	return {
		ballistics,
		ballisticsEnded,
		bubbles,
		bubblesPopped,
		damage,
		ended,
		hits,
		missileExplosions,
		missiles,
		missilesEnded,
		projectiles,
		simulation,
		suspended,
		volleys,
	}
}

function bubbleHealth(simulation: ArenaSimulation): number {
	return simulation
		.snapshot()
		.bubbles.reduce((total, bubble) => total + bubble.health, 0)
}

function fireBubbleScreen(
	harness: ReturnType<typeof simulationHarness>,
	ownerId: string,
	origin: [number, number, number],
	clientShotId = 1,
): void {
	expect(
		harness.simulation.fireBubbles(ownerId, {
			clientShotId,
			direction: [1, 0, 0],
			origin,
		}),
	).toBe(true)
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
		Math.hypot(...harness.simulation.snapshot().bubbles[0]!.velocity),
	).toBeCloseTo(BUBBLE_SPEED * 0.9)
	expect(
		Math.hypot(...harness.simulation.snapshot().bubbles.at(-1)!.velocity),
	).toBeCloseTo(BUBBLE_SPEED * 1.05)
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

test("player bullets damage the nearest bubble, end once, and do not pass through", () => {
	const players: SimulationPlayer[] = [
		{
			crouching: false,
			id: "shooter",
			position: [0, 50.72, 0],
			velocity: [0, 0, 0],
		},
		{
			crouching: false,
			id: "bubble-owner",
			position: [0, 50.72, -4],
			velocity: [0, 0, 0],
		},
		{
			crouching: false,
			id: "behind",
			position: [0, 50.72, -6],
			velocity: [0, 0, 0],
		},
	]
	const harness = simulationHarness(players)
	fireBubbleScreen(harness, "bubble-owner", [0, 50, -4])
	const before = bubbleHealth(harness.simulation)
	expect(
		harness.simulation.fire("shooter", {
			clientShotId: 1,
			direction: [0, 0, -1],
			origin: [0, 50, 0],
		}),
	).toBe(true)
	harness.simulation.update(0.1)

	expect(before - bubbleHealth(harness.simulation)).toBe(
		PLAYER_PROJECTILE_DAMAGE,
	)
	expect(harness.ended).toEqual([{ id: 1 }])
	expect(harness.damage).toHaveLength(0)
	harness.simulation.update(0.1)
	expect(before - bubbleHealth(harness.simulation)).toBe(
		PLAYER_PROJECTILE_DAMAGE,
	)
})

test("a nearer pilot wins collision ordering over a farther bubble", () => {
	const players: SimulationPlayer[] = [
		{
			crouching: false,
			id: "shooter",
			position: [0, 50.72, 0],
			velocity: [0, 0, 0],
		},
		{
			crouching: false,
			id: "target",
			position: [0, 50.72, -3],
			velocity: [0, 0, 0],
		},
		{
			crouching: false,
			id: "bubble-owner",
			position: [0, 50.72, -5],
			velocity: [0, 0, 0],
		},
	]
	const harness = simulationHarness(players)
	fireBubbleScreen(harness, "bubble-owner", [0, 50, -5])
	const before = bubbleHealth(harness.simulation)
	harness.simulation.fire("shooter", {
		clientShotId: 1,
		direction: [0, 0, -1],
		origin: [0, 50, 0],
	})
	harness.simulation.update(0.1)

	expect(
		harness.damage.map(({ amount, playerId }) => ({ amount, playerId })),
	).toEqual([{ amount: PLAYER_PROJECTILE_DAMAGE, playerId: "target" }])
	expect(bubbleHealth(harness.simulation)).toBe(before)
	expect(harness.ended).toEqual([{ id: 1 }])
})

test("bot bullets damage bubbles and are consumed before reaching their pilot target", () => {
	const players: SimulationPlayer[] = [
		{
			crouching: false,
			id: "bubble-owner",
			position: [0, 50.72, -4],
			velocity: [0, 0, 0],
		},
	]
	const harness = simulationHarness(players, [
		{
			attackCooldown: 0,
			id: 1,
			personality: "bully",
			position: [0, 50, 0],
			stationary: false,
		},
	])
	fireBubbleScreen(harness, "bubble-owner", [0, 50.72, -4])
	const before = bubbleHealth(harness.simulation)
	harness.simulation.update(0.1)

	expect(harness.projectiles).toHaveLength(1)
	expect(harness.projectiles[0]?.damage).toBe(2.8)
	expect(before - bubbleHealth(harness.simulation)).toBeCloseTo(2.8)
	expect(harness.ended).toEqual([{ id: 1 }])
	expect(harness.damage).toHaveLength(0)
})

test("shotgun pellets retain exactly six damage against bubbles and end on contact", () => {
	const players: SimulationPlayer[] = [
		{
			crouching: false,
			id: "shooter",
			position: [0, 50.72, 0],
			velocity: [0, 0, 0],
		},
		{
			crouching: false,
			id: "bubble-owner",
			position: [0, 50.72, -4],
			velocity: [0, 0, 0],
		},
	]
	const harness = simulationHarness(players)
	fireBubbleScreen(harness, "bubble-owner", [0, 50, -4])
	const before = bubbleHealth(harness.simulation)
	harness.simulation.fireShotgun("shooter", {
		clientShotId: 1,
		direction: [0, 0, -1],
		origin: [0, 50, 0],
	})
	harness.simulation.update(0.04)

	const absorbedPellets = harness.ended.length
	expect(absorbedPellets).toBeGreaterThan(0)
	const healthById = new Map(
		harness.bubbles
			.slice(0, BUBBLES_PER_SHOT)
			.map((bubble) => [bubble.id, bubble.health]),
	)
	let damageEvents = 0
	for (const bubble of harness.bubbles.slice(BUBBLES_PER_SHOT)) {
		const previous = healthById.get(bubble.id)!
		expect(previous - bubble.health).toBe(SHOTGUN_PELLET_DAMAGE)
		healthById.set(bubble.id, bubble.health)
		damageEvents += 1
	}
	for (const popped of harness.bubblesPopped) {
		expect(healthById.get(popped.id)).toBeLessThanOrEqual(SHOTGUN_PELLET_DAMAGE)
		damageEvents += 1
	}
	expect(damageEvents).toBe(absorbedPellets)
	expect(before - bubbleHealth(harness.simulation)).toBeGreaterThan(0)
	expect(SHOTGUN_PELLET_DAMAGE).toBe(6)
	expect(harness.simulation.shotgunPellets()).toHaveLength(
		SHOTGUN_PELLET_COUNT - absorbedPellets,
	)
})

test("a 70-damage rail shot stops at a stronger bubble and emits one end event", () => {
	const players: SimulationPlayer[] = [
		{
			crouching: false,
			id: "rail",
			position: [0, 50.72, 0],
			velocity: [0, 0, 0],
		},
		{
			crouching: false,
			id: "bubble-owner",
			position: [0, 50.72, -4],
			velocity: [0, 0, 0],
		},
		{
			crouching: false,
			id: "behind",
			position: [0, 50.72, -6],
			velocity: [0, 0, 0],
		},
	]
	const harness = simulationHarness(players)
	fireBubbleScreen(harness, "bubble-owner", [0, 50, -4])
	const firstBubble = harness.simulation.snapshot().bubbles[0]!
	const delta = 0.06
	const predicted = new THREE.Vector3(...firstBubble.position).addScaledVector(
		new THREE.Vector3(...firstBubble.velocity),
		delta,
	)
	const direction = predicted.sub(new THREE.Vector3(0, 50, 0)).normalize()
	harness.simulation.fireRail(
		"rail",
		{ clientShotId: 1, direction: direction.toArray(), origin: [0, 50, 0] },
		1,
	)
	harness.simulation.update(delta)

	expect(harness.bubblesPopped).toHaveLength(0)
	expect(harness.ballisticsEnded).toHaveLength(1)
	expect(harness.simulation.snapshot().ballistics).toHaveLength(0)
	expect(harness.simulation.snapshot().bubbles).toHaveLength(BUBBLES_PER_SHOT)
	expect(bubbleHealth(harness.simulation)).toBe(
		BUBBLES_PER_SHOT * BUBBLE_HEALTH - RAIL_DAMAGE_MAX,
	)
	harness.simulation.update(0.1)
	expect(harness.damage).toHaveLength(0)
})

test("mini-missiles deal direct bubble damage, explode, and end exactly once", () => {
	const players: SimulationPlayer[] = [
		{
			crouching: false,
			id: "missile",
			position: [0, 50.72, 0],
			velocity: [0, 0, 0],
		},
		{
			crouching: false,
			id: "bubble-owner",
			position: [0, 50.72, -1.4],
			velocity: [0, 0, 0],
		},
	]
	const harness = simulationHarness(players)
	fireBubbleScreen(harness, "bubble-owner", [0, 50, -1.4])
	const before = bubbleHealth(harness.simulation)
	const firstBubble = harness.simulation.snapshot().bubbles[0]!
	const delta = 0.11
	const predicted = new THREE.Vector3(...firstBubble.position).addScaledVector(
		new THREE.Vector3(...firstBubble.velocity),
		delta,
	)
	const direction = predicted.sub(new THREE.Vector3(0, 50, 0)).normalize()
	expect(
		harness.simulation.fireMiniMissile("missile", {
			clientMissileId: 1,
			direction: direction.toArray(),
			origin: [0, 50, 0],
		}),
	).toBe(true)
	harness.simulation.update(delta)

	expect(before - bubbleHealth(harness.simulation)).toBe(MINI_MISSILE_DAMAGE)
	expect(harness.missilesEnded).toEqual([{ id: 1 }])
	expect(harness.missileExplosions).toHaveLength(1)
	expect(harness.simulation.snapshot().missiles).toHaveLength(0)
	harness.simulation.update(delta)
	expect(harness.missilesEnded).toEqual([{ id: 1 }])
	expect(before - bubbleHealth(harness.simulation)).toBe(MINI_MISSILE_DAMAGE)
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
	expect(RAIL_DAMAGE_MIN).toBe(45)
	expect(RAIL_DAMAGE_MAX).toBe(70)
	expect(RAIL_SPEED_MIN).toBe(56)
	expect(RAIL_SPEED_MAX).toBe(110)
	expect(RAIL_GRAVITY_MIN).toBe(2.5)
	expect(RAIL_GRAVITY_MAX).toBe(10)
	expect(RAIL_KNOCKBACK_MIN).toBe(8)
	expect(RAIL_KNOCKBACK_MAX).toBe(30)
	expect(RAIL_SERVER_MINIMUM_INTERVAL_MS).toBe(450)
})

test("rail ballistics keep vertical inertia inside zero gravity", () => {
	const [x, y, z] = ZERO_GRAVITY_ZONE.center
	const players: SimulationPlayer[] = [
		{ crouching: false, id: "rail", position: [x, y, z], velocity: [0, 0, 0] },
	]
	const inside = simulationHarness(players)
	inside.simulation.fireRail(
		"rail",
		{ clientShotId: 1, direction: [0, 0, -1], origin: [x, y, z] },
		1,
	)
	inside.simulation.update(0.05)
	expect(inside.simulation.snapshot().ballistics[0]?.position[1]).toBe(y)

	const outside = simulationHarness([
		{
			crouching: false,
			id: "rail",
			position: [x + ZERO_GRAVITY_ZONE.radius + 2, y, z],
			velocity: [0, 0, 0],
		},
	])
	outside.simulation.fireRail(
		"rail",
		{
			clientShotId: 1,
			direction: [0, 0, -1],
			origin: [x + ZERO_GRAVITY_ZONE.radius + 2, y, z],
		},
		1,
	)
	outside.simulation.update(0.05)
	expect(outside.simulation.snapshot().ballistics[0]?.position[1]).toBeLessThan(
		y,
	)
})

test.each([
	{ charge: 0, damage: 45, impulse: 8, label: "tap" },
	{ charge: 0.5, damage: 57.5, impulse: 19, label: "partial" },
	{ charge: 1, damage: 70, impulse: 30, label: "full" },
])(
	"$label rail body hit applies charge-scaled damage and knockback",
	(shot) => {
		const players: SimulationPlayer[] = [
			{
				crouching: false,
				id: "rail",
				position: [0, 50.72, 0],
				velocity: [0, 0, 0],
			},
			{
				crouching: false,
				id: "target",
				position: [0, 50.72, -3],
				velocity: [0, 0, 0],
			},
		]
		const harness = simulationHarness(players)
		harness.simulation.fireRail(
			"rail",
			{ clientShotId: 1, direction: [0, 0, -1], origin: [0, 49.8, 0] },
			shot.charge,
		)
		harness.simulation.update(0.08)

		expect(harness.damage).toHaveLength(1)
		expect(harness.damage[0]?.amount).toBe(shot.damage)
		expect(harness.hits[0]?.result).toMatchObject({
			classification: "normal",
			damage: shot.damage,
		})
		expect(
			Math.hypot(...(harness.damage[0]?.impact.impulse ?? [])),
		).toBeCloseTo(shot.impulse)
	},
)

test("a 140-raw-damage full rail headshot reports the lethal 100 removed", () => {
	const players: SimulationPlayer[] = [
		{
			crouching: false,
			id: "rail",
			position: [0, 50.72, 0],
			velocity: [0, 0, 0],
		},
		{
			crouching: false,
			id: "target",
			position: [0, 50.72, -3],
			velocity: [0, 0, 0],
		},
	]
	const harness = simulationHarness(players, [], 100)
	harness.simulation.fireRail(
		"rail",
		{ clientShotId: 1, direction: [0, 0, -1], origin: [0, 50.868, 0] },
		1,
	)
	harness.simulation.update(0.05)

	expect(harness.damage[0]?.amount).toBe(100)
	expect(harness.hits[0]?.result).toMatchObject({
		classification: "headshot",
		damage: 100,
	})
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
