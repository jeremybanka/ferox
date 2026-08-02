import * as THREE from "three"

import type {
	ArenaSnapshot,
	BallisticEndedSnapshot,
	BallisticSnapshot,
	BubblePoppedSnapshot,
	BubbleSnapshot,
	DirectHitClassification,
	DirectHitResult,
	DroneDestroyedSnapshot,
	DroneInventorySnapshot,
	DroneMood,
	DronePayloadSnapshot,
	DronePersonality,
	DroneSnapshot,
	DroneWreckSnapshot,
	FireIntent,
	GrenadeExplodedSnapshot,
	GrenadeIntent,
	GrenadeSnapshot,
	MiniMissileEndedSnapshot,
	MiniMissileExplodedSnapshot,
	MiniMissileIntent,
	MiniMissileSnapshot,
	MiniMissileTargetRef,
	PlayerDamageImpact,
	ProjectileEndedSnapshot,
	ProjectileSnapshot,
	ShotgunPelletSnapshot,
	ShotgunVolleySnapshot,
	Vector3Tuple,
} from "../src/arena-protocol.ts"
import { isMiniMissileTargetRef } from "../src/arena-protocol.ts"
import { arenaHeightAt } from "../src/arena-terrain.ts"
import {
	ARENA_PLAYABLE_HALF_EXTENT,
	resolveArenaMotion,
} from "../src/ArenaWorld.ts"
import {
	BUBBLE_DAMAGE,
	BUBBLE_HEALTH,
	BUBBLE_LIFETIME_SECONDS,
	BUBBLE_RADIUS,
	BUBBLE_SPEED,
	BUBBLES_PER_SHOT,
	DRONE_AUDITORY_RADIUS,
	DEPLOYED_DRONE_LIFETIME_SECONDS,
	DEPLOYED_DRONE_OWNER_CAP,
	DRONE_ARENA_BOUND,
	DRONE_HARD_RECOVERY_DISTANCE,
	DRONE_PAYLOAD_ACTIVATION_DISTANCE,
	DRONE_PAYLOAD_LIFETIME_SECONDS,
	DRONE_PAYLOAD_SPEED,
	DRONE_POPULATION_CAP,
	DRONE_RETURN_SPEED,
	DRONE_SOFT_LEASH_DISTANCE,
	DRONE_VISION_DISTANCE,
	DRONE_VISION_HALF_ANGLE,
	DRONE_WRECK_LIFETIME_SECONDS,
	DRONE_WRECK_RECOVERY_RADIUS,
	GRENADE_BLAST_RADIUS,
	GRENADE_BOUNCE_DAMPING,
	GRENADE_FUSE_SECONDS,
	GRENADE_GRAVITY,
	GRENADE_RADIUS,
	GRENADE_RESTITUTION,
	GRENADE_THROW_SPEED,
	PLAYER_HEADSHOT_MULTIPLIER,
	PLAYER_PROJECTILE_DAMAGE,
	RAIL_DAMAGE_MAX,
	RAIL_DAMAGE_MIN,
	RAIL_GRAVITY_MAX,
	RAIL_GRAVITY_MIN,
	RAIL_SPEED_MAX,
	RAIL_SPEED_MIN,
	SHOTGUN_MAX_ACTIVE_PELLETS,
	SHOTGUN_PELLET_COUNT,
	SHOTGUN_PELLET_DAMAGE,
	SHOTGUN_PELLET_HANG_SECONDS,
	SHOTGUN_PELLET_MAX_DISTANCE,
	SHOTGUN_PELLET_SPEED,
	RECOVERED_DRONE_INVENTORY_CAP,
	grenadeDamageAtDistance,
	MINI_MISSILE_BLAST_RADIUS,
	MINI_MISSILE_GRAVITY,
	MINI_MISSILE_MAX_TURN_RATE,
	MINI_MISSILE_POWERED_SECONDS,
	MINI_MISSILE_RADIUS,
	MINI_MISSILE_SEEKER_SCAN_SECONDS,
	MINI_MISSILE_SPEED,
	miniMissileDamageAtDistance,
} from "../src/game-constants.ts"
import { pilotTorsoTargetFromEye } from "../src/pilot-targeting.ts"
import {
	PILOT_CROUCH_BODY_HIT_BOUNDS,
	PILOT_CROUCH_HEAD_CENTER_HEIGHT,
	PILOT_HEAD_HIT_RADIUS,
	PILOT_STANDING_BODY_HIT_BOUNDS,
	PILOT_STANDING_HEAD_CENTER_HEIGHT,
} from "../src/pilot/PilotDimensions.ts"
import {
	sameMiniMissileTarget,
	selectMiniMissileSeekerTarget,
	validateMiniMissileDesignation,
	type MiniMissileSeekerCandidate,
} from "./MiniMissileSeeker.ts"
import { shotgunPelletDirections, shotgunVolleySeed } from "./ShotgunPellets.ts"

export type SimulationPlayer = {
	crouching: boolean
	id: string
	position: Vector3Tuple
	velocity: Vector3Tuple
}

export type SimulationDroneSeed = {
	health?: number
	id: number
	ownerId?: string | null
	personality?: DronePersonality
	position: Vector3Tuple
	stationary?: boolean
}

type CollisionCandidate<T> = {
	target: T
	travelFraction: number
}

type DroneState = {
	attackCooldown: number
	burstRounds: number
	health: number
	id: number
	mood: DroneMood
	ownerId: string | null
	personality: DronePersonality
	position: THREE.Vector3
	stationary: boolean
	targetPlayerId: string | null
	threat: Map<string, number>
	velocity: THREE.Vector3
	wanderAngle: number
	yaw: number
	expiresAt: number
}

type DroneWreckState = {
	expiresAt: number
	id: number
	personality: DronePersonality
	position: THREE.Vector3
}

type DronePayloadState = {
	distanceTraveled: number
	id: number
	life: number
	ownerId: string
	personality: DronePersonality
	position: THREE.Vector3
	rotation: number
	velocity: THREE.Vector3
}

type ProjectileState = {
	clientShotId: number | null
	damage: number
	distanceRemaining: number | null
	headshotMultiplier: number
	id: number
	kind: "projectile" | "shotgun-pellet"
	life: number
	lifetimeSeconds: number
	ownerId: string | null
	origin: THREE.Vector3
	phase: "flying" | "suspended"
	position: THREE.Vector3
	speed: number
	team: "bot" | "player"
	velocity: THREE.Vector3
}

type ProjectileSpawnOptions = {
	headshotMultiplier?: number
	kind?: ProjectileState["kind"]
	lifetimeSeconds?: number
	maxDistance?: number | null
	speed?: number
}

type GrenadeState = {
	id: number
	life: number
	ownerId: string
	position: THREE.Vector3
	velocity: THREE.Vector3
}

type MiniMissileState = {
	id: number
	ownerId: string
	phase: "falling" | "powered"
	position: THREE.Vector3
	poweredLife: number
	seekerElapsed: number
	seekerEnabled: boolean
	targetRef: MiniMissileTargetRef | null
	velocity: THREE.Vector3
}

type BubbleState = {
	health: number
	id: number
	life: number
	ownerId: string
	position: THREE.Vector3
	velocity: THREE.Vector3
}

type BallisticState = {
	charge: number
	clientShotId: number
	damage: number
	gravity: number
	id: number
	life: number
	ownerId: string
	position: THREE.Vector3
	velocity: THREE.Vector3
}

type ArenaSimulationOptions = {
	emitBallistic?: (snapshot: BallisticSnapshot) => void
	emitBallisticEnded?: (snapshot: BallisticEndedSnapshot) => void
	emitBubble?: (snapshot: BubbleSnapshot) => void
	emitBubblePopped?: (snapshot: BubblePoppedSnapshot) => void
	emitDroneDestroyed: (snapshot: DroneDestroyedSnapshot) => void
	emitGrenade: (snapshot: GrenadeSnapshot) => void
	emitGrenadeExploded: (snapshot: GrenadeExplodedSnapshot) => void
	emitMiniMissile: (snapshot: MiniMissileSnapshot) => void
	emitMiniMissileEnded: (snapshot: MiniMissileEndedSnapshot) => void
	emitMiniMissileExploded: (snapshot: MiniMissileExplodedSnapshot) => void
	emitProjectile: (snapshot: ProjectileSnapshot) => void
	emitProjectileEnded: (snapshot: ProjectileEndedSnapshot) => void
	emitShotgunPelletSuspended?: (snapshot: ShotgunPelletSnapshot) => void
	emitShotgunVolley?: (snapshot: ShotgunVolleySnapshot) => void
	getPlayers: () => SimulationPlayer[]
	initialDrones?: readonly SimulationDroneSeed[]
	onDirectHit: (playerId: string, result: DirectHitResult) => void
	onDroneKilled: (playerId: string) => void
	onLockChanged: (attackerId: string, targetId: string, locked: boolean) => void
	onPlayerDamage: (
		playerId: string,
		damage: number,
		impact: PlayerDamageImpact,
	) => void
	seed: number
}

const PERSONALITIES: readonly DronePersonality[] = [
	"coward",
	"kamikaze",
	"bully",
]
const BODY_HEALTH: Record<DronePersonality, number> = {
	bully: 44,
	coward: 30,
	kamikaze: 24,
}
const SAFE_DISTANCE = 27
const PLAYER_EYE_HEIGHT = 1.72
const PLAYER_CROUCH_EYE_HEIGHT = 1.08
const PLAYER_BODY_HIT_RADIUS = 0.46
const TMP_A = new THREE.Vector3()
const TMP_B = new THREE.Vector3()

export class ArenaSimulation {
	readonly #ballistics: BallisticState[] = []
	readonly #bubbles: BubbleState[] = []
	readonly #drones: DroneState[] = []
	readonly #droneInventories = new Map<string, DroneInventorySnapshot>()
	readonly #dronePayloads: DronePayloadState[] = []
	readonly #droneWrecks: DroneWreckState[] = []
	readonly #emitDroneDestroyed: ArenaSimulationOptions["emitDroneDestroyed"]
	readonly #emitBallistic: (snapshot: BallisticSnapshot) => void
	readonly #emitBallisticEnded: (snapshot: BallisticEndedSnapshot) => void
	readonly #emitBubble: (snapshot: BubbleSnapshot) => void
	readonly #emitBubblePopped: (snapshot: BubblePoppedSnapshot) => void
	readonly #emitGrenade: ArenaSimulationOptions["emitGrenade"]
	readonly #emitGrenadeExploded: ArenaSimulationOptions["emitGrenadeExploded"]
	readonly #emitMiniMissile: ArenaSimulationOptions["emitMiniMissile"]
	readonly #emitMiniMissileEnded: ArenaSimulationOptions["emitMiniMissileEnded"]
	readonly #emitMiniMissileExploded: ArenaSimulationOptions["emitMiniMissileExploded"]
	readonly #emitProjectile: ArenaSimulationOptions["emitProjectile"]
	readonly #emitProjectileEnded: ArenaSimulationOptions["emitProjectileEnded"]
	readonly #emitShotgunPelletSuspended: (
		snapshot: ShotgunPelletSnapshot,
	) => void
	readonly #emitShotgunVolley: (snapshot: ShotgunVolleySnapshot) => void
	readonly #getPlayers: ArenaSimulationOptions["getPlayers"]
	readonly #grenades: GrenadeState[] = []
	readonly #lastGrenadeIntent = new Map<string, number>()
	readonly #lastMissileIntent = new Map<string, number>()
	readonly #lastProjectileIntent = new Map<string, number>()
	readonly #missiles: MiniMissileState[] = []
	readonly #onDroneKilled: ArenaSimulationOptions["onDroneKilled"]
	readonly #onDirectHit: ArenaSimulationOptions["onDirectHit"]
	readonly #onLockChanged: ArenaSimulationOptions["onLockChanged"]
	readonly #onPlayerDamage: ArenaSimulationOptions["onPlayerDamage"]
	readonly #projectiles: ProjectileState[] = []
	readonly #playerNoiseUntil = new Map<string, number>()
	readonly #seed: number
	#elapsed = 0
	#nextDroneId = 1
	#nextBallisticId = 1
	#nextBubbleId = 1
	#nextPayloadId = 1
	#nextGrenadeId = 1
	#nextMissileId = 1
	#nextProjectileId = 1
	#nextSpawn = 1.2
	#sequence = 0
	#spawnElapsed = 0

	constructor(options: ArenaSimulationOptions) {
		this.#emitBallistic = options.emitBallistic ?? (() => undefined)
		this.#emitBallisticEnded = options.emitBallisticEnded ?? (() => undefined)
		this.#emitBubble = options.emitBubble ?? (() => undefined)
		this.#emitBubblePopped = options.emitBubblePopped ?? (() => undefined)
		this.#emitDroneDestroyed = options.emitDroneDestroyed
		this.#emitGrenade = options.emitGrenade
		this.#emitGrenadeExploded = options.emitGrenadeExploded
		this.#emitMiniMissile = options.emitMiniMissile
		this.#emitMiniMissileEnded = options.emitMiniMissileEnded
		this.#emitMiniMissileExploded = options.emitMiniMissileExploded
		this.#emitProjectile = options.emitProjectile
		this.#emitProjectileEnded = options.emitProjectileEnded
		this.#emitShotgunPelletSuspended =
			options.emitShotgunPelletSuspended ?? (() => undefined)
		this.#emitShotgunVolley = options.emitShotgunVolley ?? (() => undefined)
		this.#getPlayers = options.getPlayers
		this.#onDroneKilled = options.onDroneKilled
		this.#onDirectHit = options.onDirectHit
		this.#onLockChanged = options.onLockChanged
		this.#onPlayerDamage = options.onPlayerDamage
		this.#seed = options.seed
		for (const seed of options.initialDrones ?? []) {
			const personality = seed.personality ?? "bully"
			this.#drones.push({
				attackCooldown: Number.POSITIVE_INFINITY,
				burstRounds: 0,
				health: seed.health ?? BODY_HEALTH[personality],
				id: seed.id,
				mood: "idle",
				ownerId: seed.ownerId ?? null,
				personality,
				position: new THREE.Vector3(...seed.position),
				stationary: seed.stationary ?? true,
				targetPlayerId: null,
				threat: new Map(),
				velocity: new THREE.Vector3(),
				wanderAngle: 0,
				yaw: 0,
				expiresAt: Number.POSITIVE_INFINITY,
			})
			this.#nextDroneId = Math.max(this.#nextDroneId, seed.id + 1)
		}
	}

	connectPlayer(playerId: string): void {
		this.#droneInventories.set(playerId, { count: 0, selected: "standard" })
	}

	droneInventory(playerId: string): DroneInventorySnapshot {
		return (
			this.#droneInventories.get(playerId) ?? { count: 0, selected: "standard" }
		)
	}

	cycleGrenade(playerId: string): boolean {
		const inventory = this.#droneInventories.get(playerId)
		if (inventory === undefined) return false
		inventory.selected =
			inventory.selected === "standard" ? "drone" : "standard"
		return true
	}

	recoverDrone(playerId: string, wreckId: number): boolean {
		const player = this.#getPlayers().find(
			(candidate) => candidate.id === playerId,
		)
		const inventory = this.#droneInventories.get(playerId)
		const index = this.#droneWrecks.findIndex((wreck) => wreck.id === wreckId)
		const wreck = this.#droneWrecks[index]
		if (
			player === undefined ||
			inventory === undefined ||
			wreck === undefined ||
			inventory.count >= RECOVERED_DRONE_INVENTORY_CAP ||
			wreck.position.distanceTo(new THREE.Vector3(...player.position)) >
				DRONE_WRECK_RECOVERY_RADIUS
		)
			return false
		this.#droneWrecks.splice(index, 1)
		inventory.count += 1
		inventory.selected = "drone"
		return true
	}

	resetPlayerInventory(playerId: string): void {
		const inventory = this.#droneInventories.get(playerId)
		if (inventory !== undefined)
			Object.assign(inventory, { count: 0, selected: "standard" })
	}

	get droneCount(): number {
		return this.#drones.length
	}

	activeMissilesForOwner(playerId: string): number {
		return this.#missiles.filter((missile) => missile.ownerId === playerId)
			.length
	}

	removeDrone(droneId: number): void {
		const drone = this.#drones.find((candidate) => candidate.id === droneId)
		if (drone !== undefined) this.#destroyDrone(drone, true, null)
	}

	removePlayer(playerId: string, disconnected = false): void {
		if (disconnected) {
			this.#droneInventories.delete(playerId)
			for (let index = this.#dronePayloads.length - 1; index >= 0; index -= 1) {
				if (this.#dronePayloads[index]?.ownerId === playerId)
					this.#dronePayloads.splice(index, 1)
			}
			for (let index = this.#drones.length - 1; index >= 0; index -= 1) {
				const drone = this.#drones[index]
				if (drone?.ownerId === playerId) this.#destroyDrone(drone, true, null)
			}
		} else {
			this.resetPlayerInventory(playerId)
		}
		this.#lastMissileIntent.delete(playerId)
		this.#lastGrenadeIntent.delete(playerId)
		this.#lastProjectileIntent.delete(playerId)
		for (let index = this.#bubbles.length - 1; index >= 0; index -= 1) {
			const bubble = this.#bubbles[index]
			if (bubble?.ownerId === playerId) this.#popBubble(index, bubble)
		}
		for (let index = this.#missiles.length - 1; index >= 0; index -= 1) {
			const missile = this.#missiles[index]
			if (missile === undefined) continue
			if (missile.ownerId === playerId) {
				this.#endMissile(index, missile)
			} else if (
				missile.targetRef?.kind === "pilot" &&
				missile.targetRef.id === playerId
			) {
				this.#clearMissileTargetForSeek(missile)
			}
		}
	}

	cancelLocksByOwner(playerId: string): void {
		for (const missile of this.#missiles) {
			if (missile.ownerId === playerId) {
				missile.seekerEnabled = false
				this.#setMissileTarget(missile, null)
			}
		}
	}

	fire(playerId: string, intent: FireIntent): boolean {
		const player = this.#getPlayers().find(
			(candidate) => candidate.id === playerId,
		)
		if (player === undefined) return false
		if (
			!this.#isVector(intent.origin) ||
			!this.#isVector(intent.direction) ||
			!Number.isSafeInteger(intent.clientShotId)
		) {
			return false
		}
		if (intent.clientShotId <= (this.#lastProjectileIntent.get(playerId) ?? -1))
			return false
		const origin = new THREE.Vector3(...intent.origin)
		const playerPosition = new THREE.Vector3(...player.position)
		if (origin.distanceTo(playerPosition) > 3) return false
		const direction = new THREE.Vector3(...intent.direction)
		if (direction.lengthSq() < 0.8 || direction.lengthSq() > 1.2) return false
		this.#playerNoiseUntil.set(playerId, this.#elapsed + 0.85)
		this.#spawnProjectile(
			origin,
			direction.normalize(),
			"player",
			PLAYER_PROJECTILE_DAMAGE,
			"#b8fff1",
			playerId,
			intent.clientShotId,
		)
		this.#lastProjectileIntent.set(playerId, intent.clientShotId)
		return true
	}

	fireShotgun(playerId: string, intent: FireIntent): boolean {
		const validated = this.#validateFireIntent(playerId, intent)
		if (validated === null) return false
		const { direction, origin } = validated
		this.#makeRoomForShotgunPellets(SHOTGUN_PELLET_COUNT)
		const seed = shotgunVolleySeed(playerId, intent.clientShotId, this.#seed)
		const pellets = shotgunPelletDirections(direction.toArray(), seed).map(
			(pelletDirection) =>
				this.#spawnProjectile(
					origin,
					new THREE.Vector3(...pelletDirection),
					"player",
					SHOTGUN_PELLET_DAMAGE,
					"#ffb276",
					playerId,
					intent.clientShotId,
					{
						headshotMultiplier: 1,
						kind: "shotgun-pellet",
						lifetimeSeconds: SHOTGUN_PELLET_HANG_SECONDS,
						maxDistance: SHOTGUN_PELLET_MAX_DISTANCE,
						speed: SHOTGUN_PELLET_SPEED,
					},
				),
		)
		this.#emitShotgunVolley({
			clientShotId: intent.clientShotId,
			damage: SHOTGUN_PELLET_DAMAGE,
			hangSeconds: SHOTGUN_PELLET_HANG_SECONDS,
			maxDistance: SHOTGUN_PELLET_MAX_DISTANCE,
			origin: origin.toArray(),
			ownerId: playerId,
			pellets: pellets.map((pellet) => this.#snapshotShotgunPellet(pellet)),
			speed: SHOTGUN_PELLET_SPEED,
		})
		return true
	}

	fireBubbles(playerId: string, intent: FireIntent): boolean {
		const validated = this.#validateFireIntent(playerId, intent)
		if (validated === null) return false
		const { direction, origin } = validated
		const right = new THREE.Vector3()
			.crossVectors(direction, new THREE.Vector3(0, 1, 0))
			.normalize()
		for (let index = 0; index < BUBBLES_PER_SHOT; index += 1) {
			const phase = (index / BUBBLES_PER_SHOT) * Math.PI * 2
			const spread = right
				.clone()
				.multiplyScalar(Math.cos(phase) * 0.16)
				.add(new THREE.Vector3(0, Math.sin(phase) * 0.12, 0))
			const bubble: BubbleState = {
				health: BUBBLE_HEALTH,
				id: this.#nextBubbleId++,
				life: BUBBLE_LIFETIME_SECONDS,
				ownerId: playerId,
				position: origin
					.clone()
					.addScaledVector(direction, index * 0.16)
					.add(spread),
				velocity: direction
					.clone()
					.add(spread)
					.normalize()
					.multiplyScalar(BUBBLE_SPEED * (0.9 + index * 0.025)),
			}
			this.#bubbles.push(bubble)
			this.#emitBubble(this.#snapshotBubble(bubble))
		}
		return true
	}

	fireRail(playerId: string, intent: FireIntent, charge: number): boolean {
		const validated = this.#validateFireIntent(playerId, intent)
		if (validated === null || !Number.isFinite(charge)) return false
		const fraction = THREE.MathUtils.clamp(charge, 0, 1)
		const ballistic: BallisticState = {
			charge: fraction,
			clientShotId: intent.clientShotId,
			damage: THREE.MathUtils.lerp(RAIL_DAMAGE_MIN, RAIL_DAMAGE_MAX, fraction),
			gravity: THREE.MathUtils.lerp(
				RAIL_GRAVITY_MAX,
				RAIL_GRAVITY_MIN,
				fraction,
			),
			id: this.#nextBallisticId++,
			life: 5,
			ownerId: playerId,
			position: validated.origin,
			velocity: validated.direction.multiplyScalar(
				THREE.MathUtils.lerp(RAIL_SPEED_MIN, RAIL_SPEED_MAX, fraction),
			),
		}
		this.#ballistics.push(ballistic)
		this.#emitBallistic(this.#snapshotBallistic(ballistic))
		return true
	}

	shotgunPellets(): ShotgunPelletSnapshot[] {
		return this.#projectiles
			.filter((projectile) => projectile.kind === "shotgun-pellet")
			.map((projectile) => this.#snapshotShotgunPellet(projectile))
	}

	throwGrenade(playerId: string, intent: GrenadeIntent): boolean {
		const player = this.#getPlayers().find(
			(candidate) => candidate.id === playerId,
		)
		if (player === undefined) return false
		if (
			intent === null ||
			typeof intent !== "object" ||
			!this.#isVector(intent.origin) ||
			!this.#isVector(intent.direction) ||
			!Number.isSafeInteger(intent.clientGrenadeId) ||
			(intent.kind !== "drone" && intent.kind !== "standard") ||
			intent.clientGrenadeId <= (this.#lastGrenadeIntent.get(playerId) ?? -1)
		) {
			return false
		}
		const origin = new THREE.Vector3(...intent.origin)
		const playerPosition = new THREE.Vector3(...player.position)
		if (origin.distanceTo(playerPosition) > 3) return false
		const direction = new THREE.Vector3(...intent.direction)
		if (direction.lengthSq() < 0.8 || direction.lengthSq() > 1.2) return false
		const inventory = this.#droneInventories.get(playerId)
		if (intent.kind === "drone") {
			if (inventory?.selected !== "drone" || inventory.count <= 0) return false
			const deployed = this.#drones.filter(
				(drone) => drone.ownerId === playerId,
			).length
			const payloads = this.#dronePayloads.filter(
				(payload) => payload.ownerId === playerId,
			).length
			if (deployed + payloads >= DEPLOYED_DRONE_OWNER_CAP) return false
			inventory.count -= 1
			const velocity = direction
				.normalize()
				.multiplyScalar(DRONE_PAYLOAD_SPEED)
				.addScaledVector(new THREE.Vector3(...player.velocity), 0.35)
			this.#dronePayloads.push({
				distanceTraveled: 0,
				id: this.#nextPayloadId++,
				life: DRONE_PAYLOAD_LIFETIME_SECONDS,
				ownerId: playerId,
				personality: "bully",
				position: origin,
				rotation: 0,
				velocity,
			})
			this.#lastGrenadeIntent.set(playerId, intent.clientGrenadeId)
			return true
		}
		if (intent.kind !== "standard" || inventory?.selected === "drone")
			return false

		const id = this.#nextGrenadeId
		this.#nextGrenadeId += 1
		const velocity = direction
			.normalize()
			.multiplyScalar(GRENADE_THROW_SPEED)
			.addScaledVector(new THREE.Vector3(...player.velocity), 0.35)
		this.#grenades.push({
			id,
			life: GRENADE_FUSE_SECONDS,
			ownerId: playerId,
			position: origin.clone(),
			velocity,
		})
		this.#playerNoiseUntil.set(playerId, this.#elapsed + 0.85)
		this.#emitGrenade({
			id,
			origin: origin.toArray(),
			ownerId: playerId,
			velocity: velocity.toArray(),
		})
		this.#lastGrenadeIntent.set(playerId, intent.clientGrenadeId)
		return true
	}

	fireMiniMissile(playerId: string, intent: MiniMissileIntent): boolean {
		const players = this.#getPlayers()
		const player = players.find((candidate) => candidate.id === playerId)
		if (player === undefined) return false
		if (
			intent === null ||
			typeof intent !== "object" ||
			!this.#isVector(intent.origin) ||
			!this.#isVector(intent.direction) ||
			!Number.isSafeInteger(intent.clientMissileId)
		)
			return false
		if (
			intent.clientMissileId <= (this.#lastMissileIntent.get(playerId) ?? -1)
		) {
			return false
		}
		const origin = new THREE.Vector3(...intent.origin)
		if (origin.distanceTo(new THREE.Vector3(...player.position)) > 3)
			return false
		const direction = new THREE.Vector3(...intent.direction)
		if (direction.lengthSq() < 0.8 || direction.lengthSq() > 1.2) return false
		direction.normalize()
		const candidates = this.#getMiniMissileCandidates(playerId, players)
		const target = isMiniMissileTargetRef(intent.target)
			? validateMiniMissileDesignation(
					intent.target,
					origin.toArray(),
					direction.toArray(),
					candidates,
				)
			: null
		const missile: MiniMissileState = {
			id: this.#nextMissileId,
			ownerId: playerId,
			phase: "powered",
			position: origin,
			poweredLife: MINI_MISSILE_POWERED_SECONDS,
			seekerElapsed: 0,
			seekerEnabled: true,
			targetRef: null,
			velocity: direction.multiplyScalar(MINI_MISSILE_SPEED),
		}
		this.#nextMissileId += 1
		this.#lastMissileIntent.set(playerId, intent.clientMissileId)
		this.#missiles.push(missile)
		this.#setMissileTarget(missile, target?.ref ?? null)
		this.#playerNoiseUntil.set(playerId, this.#elapsed + 0.85)
		this.#emitMiniMissile(this.#snapshotMissile(missile))
		return true
	}

	snapshot(): ArenaSnapshot {
		this.#sequence += 1
		return {
			ballistics: this.#ballistics.map((ballistic) =>
				this.#snapshotBallistic(ballistic),
			),
			bubbles: this.#bubbles.map((bubble) => this.#snapshotBubble(bubble)),
			drones: this.#drones.map((drone) => this.#snapshotDrone(drone)),
			dronePayloads: this.#dronePayloads.map((payload) =>
				this.#snapshotDronePayload(payload),
			),
			droneWrecks: this.#droneWrecks.map((wreck) =>
				this.#snapshotDroneWreck(wreck),
			),
			missiles: this.#missiles.map((missile) => this.#snapshotMissile(missile)),
			sequence: this.#sequence,
			serverTime: this.#elapsed * 1_000,
		}
	}

	update(delta: number): void {
		this.#elapsed += delta
		const players = this.#getPlayers()
		this.#updateSpawning(delta, players)
		this.#updateThreat(delta, players)
		for (let index = this.#drones.length - 1; index >= 0; index -= 1) {
			const drone = this.#drones[index]
			if (drone !== undefined && !drone.stationary)
				this.#updateDrone(drone, delta, players)
		}
		this.#updateProjectiles(delta, players)
		this.#updateBubbles(delta, players)
		this.#updateBallistics(delta, players)
		this.#updateGrenades(delta, players)
		this.#updateDronePayloads(delta)
		this.#updateDroneWrecks()
		this.#updateMissiles(delta, players)
	}

	#validateFireIntent(
		playerId: string,
		intent: FireIntent,
	): {
		direction: THREE.Vector3
		origin: THREE.Vector3
		players: SimulationPlayer[]
	} | null {
		const players = this.#getPlayers()
		const player = players.find((candidate) => candidate.id === playerId)
		if (
			player === undefined ||
			!this.#isVector(intent?.origin) ||
			!this.#isVector(intent?.direction) ||
			!Number.isSafeInteger(intent?.clientShotId)
		)
			return null
		if (intent.clientShotId <= (this.#lastProjectileIntent.get(playerId) ?? -1))
			return null
		const origin = new THREE.Vector3(...intent.origin)
		if (origin.distanceTo(new THREE.Vector3(...player.position)) > 3)
			return null
		const direction = new THREE.Vector3(...intent.direction)
		if (direction.lengthSq() < 0.8 || direction.lengthSq() > 1.2) return null
		this.#lastProjectileIntent.set(playerId, intent.clientShotId)
		this.#playerNoiseUntil.set(playerId, this.#elapsed + 0.85)
		return { direction: direction.normalize(), origin, players }
	}

	#directHit(
		ownerId: string,
		clientShotId: number,
		projectileId: number,
		damage: number,
		targetId: number | string,
		targetType: "drone" | "player",
		classification: DirectHitClassification,
	): void {
		this.#onDirectHit(ownerId, {
			classification,
			clientShotId,
			damage,
			projectileId,
			targetId,
			targetType,
		})
	}

	#snapshotBubble(bubble: BubbleState): BubbleSnapshot {
		return {
			health: bubble.health,
			id: bubble.id,
			ownerId: bubble.ownerId,
			position: bubble.position.toArray(),
			radius: BUBBLE_RADIUS,
			velocity: bubble.velocity.toArray(),
		}
	}

	#snapshotBallistic(ballistic: BallisticState): BallisticSnapshot {
		return {
			charge: ballistic.charge,
			id: ballistic.id,
			ownerId: ballistic.ownerId,
			position: ballistic.position.toArray(),
			velocity: ballistic.velocity.toArray(),
		}
	}

	#updateSpawning(delta: number, players: SimulationPlayer[]): void {
		if (
			players.length === 0 ||
			this.#drones.filter((drone) => drone.ownerId === null).length >=
				DRONE_POPULATION_CAP
		) {
			this.#spawnElapsed = 0
			return
		}
		this.#spawnElapsed += delta
		if (this.#spawnElapsed < this.#nextSpawn) return
		this.#spawnElapsed = 0
		this.#nextSpawn = 2.4 + Math.random() * 2.8
		const anchor = players[Math.floor(Math.random() * players.length)]
		if (anchor !== undefined) this.#spawnDrone(anchor.position)
	}

	#spawnDrone(anchor: Vector3Tuple): void {
		const personality =
			PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)] ?? "bully"
		const angle = Math.random() * Math.PI * 2
		const radius = 22 + Math.random() * 23
		const x = THREE.MathUtils.clamp(
			anchor[0] + Math.cos(angle) * radius,
			-ARENA_PLAYABLE_HALF_EXTENT,
			ARENA_PLAYABLE_HALF_EXTENT,
		)
		const z = THREE.MathUtils.clamp(
			anchor[2] + Math.sin(angle) * radius,
			-ARENA_PLAYABLE_HALF_EXTENT,
			ARENA_PLAYABLE_HALF_EXTENT,
		)
		this.#drones.push({
			attackCooldown: Math.random(),
			burstRounds: 0,
			health: BODY_HEALTH[personality],
			id: this.#nextDroneId,
			mood: "idle",
			ownerId: null,
			personality,
			position: new THREE.Vector3(x, arenaHeightAt(this.#seed, x, z) + 3.4, z),
			stationary: false,
			targetPlayerId: null,
			threat: new Map(),
			velocity: new THREE.Vector3(),
			wanderAngle: Math.random() * Math.PI * 2,
			yaw: Math.random() * Math.PI * 2,
			expiresAt: Number.POSITIVE_INFINITY,
		})
		this.#nextDroneId += 1
	}

	#updateThreat(delta: number, players: readonly SimulationPlayer[]): void {
		const activeIds = new Set(players.map((player) => player.id))
		for (const drone of this.#drones) {
			for (const [playerId, threat] of drone.threat) {
				if (
					playerId === drone.ownerId ||
					!activeIds.has(playerId) ||
					threat <= delta * 1.5
				) {
					drone.threat.delete(playerId)
				} else {
					drone.threat.set(playerId, threat - delta * 1.5)
				}
			}
			for (const player of players) {
				if (player.id === drone.ownerId) continue
				const toPlayer = TMP_A.copy(new THREE.Vector3(...player.position)).sub(
					drone.position,
				)
				const distance = toPlayer.length()
				const heard =
					((this.#playerNoiseUntil.get(player.id) ?? 0) >= this.#elapsed ||
						new THREE.Vector3(...player.velocity).lengthSq() > 70) &&
					distance <= DRONE_AUDITORY_RADIUS
				const forward = TMP_B.set(-Math.sin(drone.yaw), 0, -Math.cos(drone.yaw))
				const seen =
					distance <= DRONE_VISION_DISTANCE &&
					distance > 0 &&
					forward.dot(toPlayer.normalize()) >= Math.cos(DRONE_VISION_HALF_ANGLE)
				if (heard || seen) {
					const awareness = 8 + Math.max(0, 30 - distance) * 0.2
					drone.threat.set(
						player.id,
						Math.max(drone.threat.get(player.id) ?? 0, awareness),
					)
				}
			}
			const currentThreat =
				drone.targetPlayerId === null
					? 0
					: (drone.threat.get(drone.targetPlayerId) ?? 0)
			let bestId = drone.targetPlayerId
			let bestThreat = currentThreat
			for (const [playerId, threat] of drone.threat) {
				if (threat > bestThreat + (bestId === null ? 0 : 5)) {
					bestId = playerId
					bestThreat = threat
				}
			}
			drone.targetPlayerId = bestId
			this.#setMood(drone)
		}
	}

	#setMood(drone: DroneState): void {
		if (drone.targetPlayerId === null) {
			drone.mood = "idle"
		} else if (drone.personality === "coward") {
			drone.mood = "scared"
		} else if (drone.personality === "kamikaze") {
			drone.mood = "berserk"
		} else {
			drone.mood = "angry"
		}
	}

	#updateDrone(
		drone: DroneState,
		delta: number,
		players: readonly SimulationPlayer[],
	): void {
		if (drone.expiresAt <= this.#elapsed) {
			this.#destroyDrone(drone, true, null)
			return
		}
		drone.attackCooldown -= delta
		const target =
			drone.targetPlayerId === null
				? undefined
				: players.find((player) => player.id === drone.targetPlayerId)
		if (target === undefined && drone.targetPlayerId !== null) {
			drone.targetPlayerId = null
			drone.mood = "idle"
		}
		const targetPosition =
			target === undefined ? null : new THREE.Vector3(...target.position)
		const toTarget =
			targetPosition === null
				? new THREE.Vector3()
				: targetPosition.clone().sub(drone.position)
		const distance = toTarget.length()
		const direction =
			distance > 0.001 ? toTarget.normalize() : new THREE.Vector3()
		let desired = new THREE.Vector3()
		let speed = 2.2
		const anchor = this.#droneAnchor(drone, players)
		if (!drone.position.toArray().every(Number.isFinite) || anchor === null) {
			if (!drone.position.toArray().every(Number.isFinite)) {
				drone.position.set(0, arenaHeightAt(this.#seed, 0, 0) + 3.2, 0)
				drone.velocity.set(0, 0, 0)
			}
			if (anchor === null) return
		}
		const horizontalPosition = new THREE.Vector3(
			drone.position.x,
			0,
			drone.position.z,
		)
		const horizontalAnchor = new THREE.Vector3(anchor.x, 0, anchor.z)
		const anchorDistance = horizontalPosition.distanceTo(horizontalAnchor)
		const outsideArena =
			Math.max(Math.abs(drone.position.x), Math.abs(drone.position.z)) >
			DRONE_ARENA_BOUND
		if (
			anchorDistance > DRONE_HARD_RECOVERY_DISTANCE ||
			(outsideArena && anchorDistance > DRONE_HARD_RECOVERY_DISTANCE * 0.75)
		) {
			const resetDirection = horizontalPosition
				.sub(horizontalAnchor)
				.normalize()
			drone.position.copy(
				horizontalAnchor.addScaledVector(
					resetDirection,
					DRONE_SOFT_LEASH_DISTANCE * 0.7,
				),
			)
			drone.position.y =
				arenaHeightAt(this.#seed, drone.position.x, drone.position.z) + 3.2
			drone.velocity.set(0, 0, 0)
		}
		const returnToAnchor =
			anchorDistance > DRONE_SOFT_LEASH_DISTANCE || outsideArena

		if (returnToAnchor) {
			speed = DRONE_RETURN_SPEED
			desired.copy(anchor).sub(drone.position)
		} else if (targetPosition === null) {
			drone.wanderAngle += delta * (0.25 + (drone.id % 4) * 0.04)
			desired.set(Math.cos(drone.wanderAngle), 0, Math.sin(drone.wanderAngle))
		} else if (drone.mood === "scared") {
			speed = 8.2
			desired
				.copy(direction)
				.multiplyScalar(distance < SAFE_DISTANCE ? -1 : -0.35)
			if (distance >= SAFE_DISTANCE && drone.attackCooldown <= 0) {
				this.#fireAt(drone, targetPosition, 7, "#ffe16b")
				drone.attackCooldown = 1.15
			}
		} else if (drone.mood === "berserk") {
			speed = 10.2
			desired.copy(direction)
			if (distance < 3.3 && target !== undefined) {
				const damage = THREE.MathUtils.lerp(
					52,
					34,
					THREE.MathUtils.clamp(distance / 3.3, 0, 1),
				)
				const impactPosition = targetPosition.clone()
				impactPosition.y -=
					(target.crouching ? PLAYER_CROUCH_EYE_HEIGHT : PLAYER_EYE_HEIGHT) *
					0.5
				this.#onPlayerDamage(target.id, damage, {
					direction: direction.toArray(),
					position: impactPosition.toArray(),
					source: "kamikaze",
				})
				this.#destroyDrone(drone, true, null)
				return
			}
		} else {
			speed = 7
			desired.copy(this.#rangeKeepingDirection(direction, distance, 10, 14))
			if (distance < 18) this.#updateBullyWeapon(drone, targetPosition)
		}

		desired.y = 0
		if (desired.lengthSq() > 0.001) desired.normalize().multiplyScalar(speed)
		drone.velocity.lerp(desired, Math.min(1, delta * 3.6))
		const droneStartX = drone.position.x
		const droneStartZ = drone.position.z
		drone.position.addScaledVector(drone.velocity, delta)
		const droneMotion = resolveArenaMotion(
			this.#seed,
			[droneStartX, droneStartZ],
			[drone.position.x, drone.position.z],
			drone.position.y,
			0.7,
		)
		drone.position.x = droneMotion.x
		drone.position.z = droneMotion.z
		if (droneMotion.contact !== null) {
			const [normalX, , normalZ] = droneMotion.contact.normal
			const inward = Math.min(
				0,
				drone.velocity.x * normalX + drone.velocity.z * normalZ,
			)
			drone.velocity.x -= normalX * inward
			drone.velocity.z -= normalZ * inward
		}
		const hoverHeight =
			arenaHeightAt(this.#seed, drone.position.x, drone.position.z) +
			3.2 +
			Math.sin(this.#elapsed * 2.5 + drone.id) * 0.25
		drone.position.y = THREE.MathUtils.lerp(
			drone.position.y,
			hoverHeight,
			Math.min(1, delta * 4),
		)
		if (desired.lengthSq() > 0.01) {
			const targetYaw = Math.atan2(-desired.x, -desired.z)
			drone.yaw = this.#lerpAngle(
				drone.yaw,
				targetYaw,
				Math.min(1, delta * 4.5),
			)
		}
	}

	#droneAnchor(
		drone: DroneState,
		players: readonly SimulationPlayer[],
	): THREE.Vector3 | null {
		const owner =
			drone.ownerId === null
				? undefined
				: players.find((player) => player.id === drone.ownerId)
		if (owner !== undefined) return new THREE.Vector3(...owner.position)
		let nearest: SimulationPlayer | undefined
		let distance = Number.POSITIVE_INFINITY
		for (const player of players) {
			const candidateDistance = drone.position.distanceToSquared(
				new THREE.Vector3(...player.position),
			)
			if (candidateDistance < distance) {
				distance = candidateDistance
				nearest = player
			}
		}
		return nearest === undefined ? null : new THREE.Vector3(...nearest.position)
	}

	#rangeKeepingDirection(
		direction: THREE.Vector3,
		distance: number,
		minimum: number,
		maximum: number,
	): THREE.Vector3 {
		if (distance < minimum) return direction.clone().multiplyScalar(-1)
		if (distance > maximum) return direction.clone()
		return new THREE.Vector3(-direction.z, 0, direction.x).multiplyScalar(0.45)
	}

	#updateBullyWeapon(drone: DroneState, targetPosition: THREE.Vector3): void {
		if (drone.attackCooldown > 0) return
		if (drone.burstRounds === 0) drone.burstRounds = 9
		this.#fireAt(drone, targetPosition, 2.8, "#62a5ff")
		drone.burstRounds -= 1
		drone.attackCooldown = drone.burstRounds === 0 ? 1.7 : 0.12
	}

	#getMiniMissileCandidates(
		ownerId: string,
		players: readonly SimulationPlayer[],
	): MiniMissileSeekerCandidate[] {
		const candidates: MiniMissileSeekerCandidate[] = []
		for (const player of players) {
			if (player.id === ownerId) continue
			candidates.push({
				position: pilotTorsoTargetFromEye(player.position, player.crouching),
				ref: { id: player.id, kind: "pilot" },
			})
		}
		for (const drone of this.#drones) {
			if (drone.health <= 0 || drone.ownerId === ownerId) continue
			candidates.push({
				position: drone.position.toArray(),
				ref: { id: drone.id, kind: "drone" },
			})
		}
		return candidates
	}

	#resolveMiniMissileTarget(
		ownerId: string,
		targetRef: MiniMissileTargetRef,
		players: readonly SimulationPlayer[],
	): MiniMissileSeekerCandidate | null {
		if (targetRef.kind === "pilot") {
			if (targetRef.id === ownerId) return null
			const player = players.find((candidate) => candidate.id === targetRef.id)
			return player === undefined
				? null
				: {
						position: pilotTorsoTargetFromEye(
							player.position,
							player.crouching,
						),
						ref: targetRef,
					}
		}
		const drone = this.#drones.find(
			(candidate) =>
				candidate.id === targetRef.id &&
				candidate.health > 0 &&
				candidate.ownerId !== ownerId,
		)
		return drone === undefined
			? null
			: { position: drone.position.toArray(), ref: targetRef }
	}

	#updateMissiles(delta: number, players: readonly SimulationPlayer[]): void {
		for (let index = this.#missiles.length - 1; index >= 0; index -= 1) {
			const missile = this.#missiles[index]
			if (missile === undefined) continue
			const previousPosition = missile.position.clone()
			if (missile.phase === "powered") {
				missile.poweredLife -= delta
				let lostTarget = false
				let target =
					missile.targetRef === null
						? null
						: this.#resolveMiniMissileTarget(
								missile.ownerId,
								missile.targetRef,
								players,
							)
				if (missile.targetRef !== null && target === null) {
					this.#clearMissileTargetForSeek(missile)
					lostTarget = true
				}
				if (target === null && missile.seekerEnabled && !lostTarget) {
					missile.seekerElapsed += delta
					if (missile.seekerElapsed >= MINI_MISSILE_SEEKER_SCAN_SECONDS) {
						missile.seekerElapsed = 0
						target = selectMiniMissileSeekerTarget(
							missile.position.toArray(),
							missile.velocity.toArray(),
							this.#getMiniMissileCandidates(missile.ownerId, players),
						)
						if (target !== null) this.#setMissileTarget(missile, target.ref)
					}
				}
				if (target !== null) {
					const desired = new THREE.Vector3(...target.position)
						.sub(missile.position)
						.normalize()
					const current = missile.velocity.clone().normalize()
					const angle = current.angleTo(desired)
					if (angle > Number.EPSILON) {
						const fullTurn = new THREE.Quaternion().setFromUnitVectors(
							current,
							desired,
						)
						const limitedTurn = new THREE.Quaternion().slerp(
							fullTurn,
							Math.min(1, (MINI_MISSILE_MAX_TURN_RATE * delta) / angle),
						)
						current.applyQuaternion(limitedTurn).normalize()
					}
					missile.velocity.copy(current).multiplyScalar(MINI_MISSILE_SPEED)
				}
				if (missile.poweredLife <= 0) {
					missile.phase = "falling"
					missile.seekerEnabled = false
					this.#setMissileTarget(missile, null)
				}
			}
			if (missile.phase === "falling") {
				missile.velocity.y -= MINI_MISSILE_GRAVITY * delta
			}
			missile.position.addScaledVector(missile.velocity, delta)

			const droneHit = this.#nearestDroneAlongSegment(
				previousPosition,
				missile.position,
				1.2,
				missile.ownerId,
			)
			const playerHit = this.#nearestPlayerAlongSegment(
				previousPosition,
				missile.position,
				players,
				missile.ownerId,
			)
			const hitEntity = droneHit !== undefined || playerHit !== undefined
			const hitGround =
				missile.position.y <=
				arenaHeightAt(this.#seed, missile.position.x, missile.position.z) +
					MINI_MISSILE_RADIUS
			const hitObstacle =
				resolveArenaMotion(
					this.#seed,
					[previousPosition.x, previousPosition.z],
					[missile.position.x, missile.position.z],
					(previousPosition.y + missile.position.y) * 0.5,
					MINI_MISSILE_RADIUS,
				).contact !== null
			if (hitEntity || hitGround || hitObstacle) {
				this.#explodeMissile(index, missile, players)
			}
		}
	}

	#explodeMissile(
		index: number,
		missile: MiniMissileState,
		players: readonly SimulationPlayer[],
	): void {
		this.#setMissileTarget(missile, null)
		this.#missiles.splice(index, 1)
		for (
			let droneIndex = this.#drones.length - 1;
			droneIndex >= 0;
			droneIndex -= 1
		) {
			const drone = this.#drones[droneIndex]
			if (drone === undefined) continue
			if (drone.ownerId === missile.ownerId) continue
			const damage = miniMissileDamageAtDistance(
				missile.position.distanceTo(drone.position),
			)
			if (damage > 0) this.#damageDrone(drone, damage, missile.ownerId)
		}
		for (const player of players) {
			if (player.id === missile.ownerId) continue
			const bodyCenter = new THREE.Vector3(...player.position).add(
				new THREE.Vector3(0, player.crouching ? -0.5 : -0.8, 0),
			)
			const damage = miniMissileDamageAtDistance(
				missile.position.distanceTo(bodyCenter),
			)
			if (damage > 0) {
				const direction = bodyCenter.clone().sub(missile.position)
				if (direction.lengthSq() <= Number.EPSILON) {
					direction.copy(missile.velocity)
				}
				this.#onPlayerDamage(player.id, damage, {
					direction: direction.normalize().toArray(),
					position: missile.position.toArray(),
					source: "mini-missile",
				})
			}
		}
		this.#emitMiniMissileExploded({
			id: missile.id,
			position: missile.position.toArray(),
			radius: MINI_MISSILE_BLAST_RADIUS,
		})
		this.#emitMiniMissileEnded({ id: missile.id })
	}

	#endMissile(index: number, missile: MiniMissileState): void {
		this.#setMissileTarget(missile, null)
		this.#missiles.splice(index, 1)
		this.#emitMiniMissileEnded({ id: missile.id })
	}

	#setMissileTarget(
		missile: MiniMissileState,
		targetRef: MiniMissileTargetRef | null,
	): void {
		const previousTarget = missile.targetRef
		if (sameMiniMissileTarget(previousTarget, targetRef)) return
		if (previousTarget?.kind === "pilot") {
			const hasAnotherLock = this.#missiles.some(
				(candidate) =>
					candidate !== missile &&
					candidate.ownerId === missile.ownerId &&
					candidate.targetRef?.kind === "pilot" &&
					candidate.targetRef.id === previousTarget.id,
			)
			if (!hasAnotherLock) {
				this.#onLockChanged(missile.ownerId, previousTarget.id, false)
			}
		}
		missile.targetRef = targetRef
		if (targetRef?.kind === "pilot") {
			const alreadyLocked = this.#missiles.some(
				(candidate) =>
					candidate !== missile &&
					candidate.ownerId === missile.ownerId &&
					candidate.targetRef?.kind === "pilot" &&
					candidate.targetRef.id === targetRef.id,
			)
			if (!alreadyLocked) {
				this.#onLockChanged(missile.ownerId, targetRef.id, true)
			}
		}
	}

	#clearMissileTargetForSeek(missile: MiniMissileState): void {
		this.#setMissileTarget(missile, null)
		missile.seekerElapsed = 0
	}

	#snapshotMissile(missile: MiniMissileState): MiniMissileSnapshot {
		return {
			id: missile.id,
			phase: missile.phase,
			position: missile.position.toArray(),
			velocity: missile.velocity.toArray(),
		}
	}

	#fireAt(
		drone: DroneState,
		targetPosition: THREE.Vector3,
		damage: number,
		color: string,
	): void {
		const origin = drone.position.clone()
		origin.y -= 0.1
		const direction = targetPosition
			.clone()
			.sub(origin)
			.normalize()
			.add(
				new THREE.Vector3(
					(Math.random() - 0.5) * 0.025,
					(Math.random() - 0.5) * 0.025,
					(Math.random() - 0.5) * 0.025,
				),
			)
			.normalize()
		this.#spawnProjectile(
			origin,
			direction,
			drone.ownerId === null ? "bot" : "player",
			damage,
			color,
			drone.ownerId,
			null,
		)
	}

	#makeRoomForShotgunPellets(incoming: number): void {
		let active = this.#projectiles.filter(
			(projectile) => projectile.kind === "shotgun-pellet",
		).length
		while (active + incoming > SHOTGUN_MAX_ACTIVE_PELLETS) {
			const index = this.#projectiles.findIndex(
				(projectile) => projectile.kind === "shotgun-pellet",
			)
			if (index < 0) return
			const [removed] = this.#projectiles.splice(index, 1)
			if (removed !== undefined) this.#emitProjectileEnded({ id: removed.id })
			active -= 1
		}
	}

	#snapshotShotgunPellet(projectile: ProjectileState): ShotgunPelletSnapshot {
		if (projectile.ownerId === null)
			throw new Error("Shotgun pellets require an owner.")
		return {
			direction: projectile.velocity.clone().normalize().toArray(),
			id: projectile.id,
			origin: projectile.origin.toArray(),
			ownerId: projectile.ownerId,
			phase: projectile.phase,
			position: projectile.position.toArray(),
		}
	}

	#spawnProjectile(
		origin: THREE.Vector3,
		direction: THREE.Vector3,
		team: "bot" | "player",
		damage: number,
		color: string,
		ownerId: string | null,
		clientShotId: number | null,
		options: ProjectileSpawnOptions = {},
	): ProjectileState {
		const id = this.#nextProjectileId
		this.#nextProjectileId += 1
		const speed = options.speed ?? 55
		const lifetimeSeconds = options.lifetimeSeconds ?? 2.4
		const projectile: ProjectileState = {
			clientShotId,
			damage,
			distanceRemaining: options.maxDistance ?? null,
			headshotMultiplier:
				options.headshotMultiplier ?? PLAYER_HEADSHOT_MULTIPLIER,
			id,
			kind: options.kind ?? "projectile",
			life: lifetimeSeconds,
			lifetimeSeconds,
			ownerId,
			origin: origin.clone(),
			phase: "flying",
			position: origin.clone(),
			speed,
			team,
			velocity: direction.clone().multiplyScalar(speed),
		}
		this.#projectiles.push(projectile)
		if (projectile.kind === "projectile") {
			this.#emitProjectile({
				color,
				damage,
				direction: direction.toArray(),
				id,
				lifetimeSeconds,
				origin: origin.toArray(),
				ownerId,
				speed,
				team,
			})
		}
		return projectile
	}

	#updateGrenades(delta: number, players: readonly SimulationPlayer[]): void {
		for (let index = this.#grenades.length - 1; index >= 0; index -= 1) {
			const grenade = this.#grenades[index]
			if (grenade === undefined) continue
			grenade.life -= delta
			grenade.velocity.y -= GRENADE_GRAVITY * delta
			const previousX = grenade.position.x
			const previousZ = grenade.position.z
			grenade.position.addScaledVector(grenade.velocity, delta)
			const grenadeMotion = resolveArenaMotion(
				this.#seed,
				[previousX, previousZ],
				[grenade.position.x, grenade.position.z],
				grenade.position.y,
				GRENADE_RADIUS,
			)
			grenade.position.x = grenadeMotion.x
			grenade.position.z = grenadeMotion.z
			if (grenadeMotion.contact !== null) {
				const [normalX, , normalZ] = grenadeMotion.contact.normal
				const normalSpeed =
					grenade.velocity.x * normalX + grenade.velocity.z * normalZ
				if (normalSpeed < 0) {
					grenade.velocity.x -=
						(1 + GRENADE_RESTITUTION) * normalSpeed * normalX
					grenade.velocity.z -=
						(1 + GRENADE_RESTITUTION) * normalSpeed * normalZ
				}
			}
			const ground =
				arenaHeightAt(this.#seed, grenade.position.x, grenade.position.z) +
				GRENADE_RADIUS
			if (grenade.position.y <= ground) {
				grenade.position.y = ground
				if (grenade.velocity.y < 0) {
					grenade.velocity.y *= -GRENADE_RESTITUTION
					grenade.velocity.x *= GRENADE_BOUNCE_DAMPING
					grenade.velocity.z *= GRENADE_BOUNCE_DAMPING
				}
				if (Math.abs(grenade.velocity.y) < 0.6) grenade.velocity.y = 0
			}
			if (grenade.life > 0) continue
			this.#grenades.splice(index, 1)
			this.#explodeGrenade(grenade, players)
		}
	}

	#updateDroneWrecks(): void {
		for (let index = this.#droneWrecks.length - 1; index >= 0; index -= 1) {
			if ((this.#droneWrecks[index]?.expiresAt ?? 0) <= this.#elapsed)
				this.#droneWrecks.splice(index, 1)
		}
	}

	#updateDronePayloads(delta: number): void {
		for (let index = this.#dronePayloads.length - 1; index >= 0; index -= 1) {
			const payload = this.#dronePayloads[index]
			if (payload === undefined) continue
			const previous = payload.position.clone()
			payload.life -= delta
			payload.position.addScaledVector(payload.velocity, delta)
			payload.distanceTraveled += previous.distanceTo(payload.position)
			payload.rotation += delta * 18
			const finite = payload.position.toArray().every(Number.isFinite)
			const inBounds =
				Math.max(Math.abs(payload.position.x), Math.abs(payload.position.z)) <=
				DRONE_ARENA_BOUND
			const hitGround =
				finite &&
				payload.position.y <=
					arenaHeightAt(this.#seed, payload.position.x, payload.position.z) +
						0.15
			if (!finite || !inBounds || hitGround || payload.life <= 0) {
				this.#dronePayloads.splice(index, 1)
				continue
			}
			if (payload.distanceTraveled < DRONE_PAYLOAD_ACTIVATION_DISTANCE) continue
			this.#dronePayloads.splice(index, 1)
			const position = payload.position.clone()
			position.y = Math.max(
				position.y,
				arenaHeightAt(this.#seed, position.x, position.z) + 3.2,
			)
			this.#drones.push({
				attackCooldown: 0.3,
				burstRounds: 0,
				expiresAt: this.#elapsed + DEPLOYED_DRONE_LIFETIME_SECONDS,
				health: BODY_HEALTH[payload.personality],
				id: this.#nextDroneId++,
				mood: "idle",
				ownerId: payload.ownerId,
				personality: payload.personality,
				position,
				stationary: false,
				targetPlayerId: null,
				threat: new Map(),
				velocity: payload.velocity.clone().multiplyScalar(0.2),
				wanderAngle: payload.rotation,
				yaw: payload.rotation,
			})
		}
	}

	#explodeGrenade(
		grenade: GrenadeState,
		players: readonly SimulationPlayer[],
	): void {
		for (let index = this.#drones.length - 1; index >= 0; index -= 1) {
			const drone = this.#drones[index]
			if (drone === undefined) continue
			if (drone.ownerId === grenade.ownerId) continue
			const damage = grenadeDamageAtDistance(
				grenade.position.distanceTo(drone.position),
			)
			if (damage > 0) this.#damageDrone(drone, damage, grenade.ownerId)
		}
		for (const player of players) {
			const eyeHeight = player.crouching
				? PLAYER_CROUCH_EYE_HEIGHT
				: PLAYER_EYE_HEIGHT
			const bodyCenter = new THREE.Vector3(...player.position)
			bodyCenter.y -= eyeHeight * 0.5
			const damage = grenadeDamageAtDistance(
				grenade.position.distanceTo(bodyCenter),
			)
			if (damage > 0) {
				const direction = bodyCenter.clone().sub(grenade.position)
				if (direction.lengthSq() < Number.EPSILON) direction.set(0, 1, 0)
				this.#onPlayerDamage(player.id, damage, {
					direction: direction.normalize().toArray(),
					position: bodyCenter.toArray(),
					source: "grenade",
				})
			}
		}
		this.#emitGrenadeExploded({
			id: grenade.id,
			position: grenade.position.toArray(),
			radius: GRENADE_BLAST_RADIUS,
		})
	}

	#damageDrone(
		drone: DroneState,
		damage: number,
		ownerId: string | null,
	): void {
		drone.health -= damage
		if (ownerId !== null) {
			drone.threat.set(ownerId, (drone.threat.get(ownerId) ?? 0) + 100)
			if (
				drone.targetPlayerId === null ||
				(drone.threat.get(ownerId) ?? 0) >
					(drone.threat.get(drone.targetPlayerId) ?? 0) + 5
			) {
				drone.targetPlayerId = ownerId
				this.#setMood(drone)
			}
		}
		if (drone.health <= 0) this.#destroyDrone(drone, false, ownerId)
	}

	#updateProjectiles(
		delta: number,
		players: readonly SimulationPlayer[],
	): void {
		for (let index = this.#projectiles.length - 1; index >= 0; index -= 1) {
			const projectile = this.#projectiles[index]
			if (projectile === undefined) continue
			const previousPosition = projectile.position.clone()
			if (projectile.kind === "shotgun-pellet") {
				if (projectile.phase === "flying") {
					const distance = Math.min(
						projectile.distanceRemaining ?? 0,
						projectile.speed * delta,
					)
					projectile.position.addScaledVector(
						projectile.velocity,
						distance / projectile.speed,
					)
					projectile.distanceRemaining = Math.max(
						0,
						(projectile.distanceRemaining ?? 0) - distance,
					)
				} else projectile.life -= delta
			} else {
				projectile.life -= delta
				projectile.position.addScaledVector(projectile.velocity, delta)
			}
			let hit = false
			if (projectile.team === "player") {
				const bubbleHit = this.#nearestBubbleAlongSegment(
					previousPosition,
					projectile.position,
					projectile.ownerId,
				)
				if (bubbleHit !== undefined) {
					this.#damageBubble(bubbleHit.target, projectile.damage)
					hit = true
				}
				const droneHit = this.#nearestDroneAlongSegment(
					previousPosition,
					projectile.position,
					1.35,
					projectile.ownerId,
				)
				const playerHit = this.#nearestPlayerAlongSegment(
					previousPosition,
					projectile.position,
					players,
					projectile.ownerId,
				)
				if (
					!hit &&
					droneHit !== undefined &&
					(playerHit === undefined ||
						droneHit.travelFraction <= playerHit.travelFraction)
				) {
					const drone = droneHit.target
					this.#damageDrone(drone, projectile.damage, projectile.ownerId)
					this.#reportDirectHit(projectile, {
						classification: "normal",
						damage: projectile.damage,
						targetId: drone.id,
						targetType: "drone",
					})
					hit = true
				} else if (!hit && playerHit !== undefined) {
					const damage =
						playerHit.classification === "headshot"
							? projectile.damage * projectile.headshotMultiplier
							: projectile.damage
					this.#onPlayerDamage(playerHit.target.id, damage, {
						direction: projectile.velocity.clone().normalize().toArray(),
						position: previousPosition
							.clone()
							.lerp(projectile.position, playerHit.travelFraction)
							.toArray(),
						source: "projectile",
					})
					this.#reportDirectHit(projectile, {
						classification: playerHit.classification,
						damage,
						targetId: playerHit.target.id,
						targetType: "player",
					})
					hit = true
				}
			} else {
				const playerHit = this.#nearestPlayerAlongSegment(
					previousPosition,
					projectile.position,
					players,
					null,
				)
				if (playerHit !== undefined) {
					this.#onPlayerDamage(playerHit.target.id, projectile.damage, {
						direction: projectile.velocity.clone().normalize().toArray(),
						position: previousPosition
							.clone()
							.lerp(projectile.position, playerHit.travelFraction)
							.toArray(),
						source: "projectile",
					})
					hit = true
				}
			}
			const hitGround =
				projectile.position.y <=
				arenaHeightAt(
					this.#seed,
					projectile.position.x,
					projectile.position.z,
				) +
					0.12
			const hitObstacle =
				resolveArenaMotion(
					this.#seed,
					[previousPosition.x, previousPosition.z],
					[projectile.position.x, projectile.position.z],
					(previousPosition.y + projectile.position.y) * 0.5,
					0.12,
				).contact !== null
			const expired =
				projectile.kind === "projectile"
					? projectile.life <= 0
					: projectile.phase === "suspended" && projectile.life <= 0
			if (expired || hit || hitGround || hitObstacle) {
				this.#projectiles.splice(index, 1)
				this.#emitProjectileEnded({ id: projectile.id })
			} else if (
				projectile.kind === "shotgun-pellet" &&
				projectile.phase === "flying" &&
				projectile.distanceRemaining === 0
			) {
				projectile.position
					.copy(projectile.origin)
					.addScaledVector(
						projectile.velocity,
						SHOTGUN_PELLET_MAX_DISTANCE / projectile.speed,
					)
				projectile.phase = "suspended"
				projectile.life = SHOTGUN_PELLET_HANG_SECONDS
				this.#emitShotgunPelletSuspended(
					this.#snapshotShotgunPellet(projectile),
				)
			}
		}
	}

	#nearestBubbleAlongSegment(
		start: THREE.Vector3,
		end: THREE.Vector3,
		excludedOwnerId: string | null,
	): CollisionCandidate<BubbleState> | undefined {
		let nearest: CollisionCandidate<BubbleState> | undefined
		const travel = end.clone().sub(start)
		const travelLengthSquared = travel.lengthSq()
		for (const bubble of this.#bubbles) {
			if (bubble.ownerId === excludedOwnerId) continue
			const travelFraction =
				travelLengthSquared === 0
					? 0
					: THREE.MathUtils.clamp(
							bubble.position.clone().sub(start).dot(travel) /
								travelLengthSquared,
							0,
							1,
						)
			const closest = start.clone().addScaledVector(travel, travelFraction)
			if (closest.distanceToSquared(bubble.position) > BUBBLE_RADIUS ** 2)
				continue
			if (nearest === undefined || travelFraction < nearest.travelFraction)
				nearest = { target: bubble, travelFraction }
		}
		return nearest
	}

	#damageBubble(bubble: BubbleState, damage: number): void {
		bubble.health -= Math.max(0, damage)
		const index = this.#bubbles.indexOf(bubble)
		if (bubble.health <= 0 && index >= 0) this.#popBubble(index, bubble)
		else this.#emitBubble(this.#snapshotBubble(bubble))
	}

	#popBubble(index: number, bubble: BubbleState): void {
		if (this.#bubbles[index] !== bubble) index = this.#bubbles.indexOf(bubble)
		if (index < 0) return
		this.#bubbles.splice(index, 1)
		this.#emitBubblePopped({
			id: bubble.id,
			position: bubble.position.toArray(),
		})
	}

	#updateBubbles(delta: number, players: readonly SimulationPlayer[]): void {
		for (let index = this.#bubbles.length - 1; index >= 0; index -= 1) {
			const bubble = this.#bubbles[index]
			if (bubble === undefined) continue
			bubble.life -= delta
			bubble.position.addScaledVector(bubble.velocity, delta)
			let contacted = false
			for (const player of players) {
				if (player.id === bubble.ownerId) continue
				const center = new THREE.Vector3(...player.position)
				if (center.distanceTo(bubble.position) > BUBBLE_RADIUS + 0.55) continue
				this.#onPlayerDamage(player.id, BUBBLE_DAMAGE, {
					direction: bubble.velocity.clone().normalize().toArray(),
					position: bubble.position.toArray(),
					source: "bubble",
				})
				contacted = true
				break
			}
			if (!contacted) {
				const drone = this.#drones.find(
					(candidate) =>
						candidate.position.distanceTo(bubble.position) <=
						BUBBLE_RADIUS + 0.7,
				)
				if (drone !== undefined) {
					this.#damageDrone(drone, BUBBLE_DAMAGE, bubble.ownerId)
					contacted = true
				}
			}
			const hitGround =
				bubble.position.y <=
				arenaHeightAt(this.#seed, bubble.position.x, bubble.position.z) +
					BUBBLE_RADIUS * 0.4
			if (contacted || hitGround || bubble.life <= 0)
				this.#popBubble(index, bubble)
		}
	}

	#updateBallistics(delta: number, players: readonly SimulationPlayer[]): void {
		for (let index = this.#ballistics.length - 1; index >= 0; index -= 1) {
			const ballistic = this.#ballistics[index]
			if (ballistic === undefined) continue
			ballistic.life -= delta
			const previous = ballistic.position.clone()
			ballistic.velocity.y -= ballistic.gravity * delta
			ballistic.position.addScaledVector(ballistic.velocity, delta)
			let hit = false
			const bubbleHit = this.#nearestBubbleAlongSegment(
				previous,
				ballistic.position,
				ballistic.ownerId,
			)
			if (bubbleHit !== undefined) {
				this.#damageBubble(bubbleHit.target, ballistic.damage)
				hit = true
			}
			const droneHit = this.#nearestDroneAlongSegment(
				previous,
				ballistic.position,
				1.35,
			)
			const playerHit = this.#nearestPlayerAlongSegment(
				previous,
				ballistic.position,
				players,
				ballistic.ownerId,
			)
			if (
				!hit &&
				droneHit !== undefined &&
				(playerHit === undefined ||
					droneHit.travelFraction <= playerHit.travelFraction)
			) {
				this.#damageDrone(droneHit.target, ballistic.damage, ballistic.ownerId)
				this.#directHit(
					ballistic.ownerId,
					ballistic.clientShotId,
					ballistic.id,
					ballistic.damage,
					droneHit.target.id,
					"drone",
					"normal",
				)
				hit = true
			} else if (!hit && playerHit !== undefined) {
				this.#onPlayerDamage(playerHit.target.id, ballistic.damage, {
					direction: ballistic.velocity.clone().normalize().toArray(),
					position: previous
						.clone()
						.lerp(ballistic.position, playerHit.travelFraction)
						.toArray(),
					source: "ballistic",
				})
				this.#directHit(
					ballistic.ownerId,
					ballistic.clientShotId,
					ballistic.id,
					ballistic.damage,
					playerHit.target.id,
					"player",
					playerHit.classification,
				)
				hit = true
			}
			const hitGround =
				ballistic.position.y <=
				arenaHeightAt(this.#seed, ballistic.position.x, ballistic.position.z) +
					0.12
			if (hit || hitGround || ballistic.life <= 0) {
				this.#ballistics.splice(index, 1)
				this.#emitBallisticEnded({
					id: ballistic.id,
					position: ballistic.position.toArray(),
				})
			} else this.#emitBallistic(this.#snapshotBallistic(ballistic))
		}
	}

	#nearestDroneAlongSegment(
		start: THREE.Vector3,
		end: THREE.Vector3,
		radius: number,
		excludedOwnerId: string | null,
	): CollisionCandidate<DroneState> | undefined {
		let nearest: CollisionCandidate<DroneState> | undefined
		const travel = TMP_A.copy(end).sub(start)
		const travelLengthSquared = travel.lengthSq()
		for (const drone of this.#drones) {
			if (drone.ownerId === excludedOwnerId && excludedOwnerId !== null)
				continue
			const travelFraction =
				travelLengthSquared === 0
					? 0
					: THREE.MathUtils.clamp(
							drone.position.clone().sub(start).dot(travel) /
								travelLengthSquared,
							0,
							1,
						)
			const closestPoint = TMP_B.copy(start).addScaledVector(
				travel,
				travelFraction,
			)
			if (closestPoint.distanceToSquared(drone.position) >= radius * radius)
				continue
			if (nearest === undefined || travelFraction < nearest.travelFraction) {
				nearest = { target: drone, travelFraction }
			}
		}
		return nearest
	}

	#nearestPlayerAlongSegment(
		start: THREE.Vector3,
		end: THREE.Vector3,
		players: readonly SimulationPlayer[],
		excludedPlayerId: string | null,
	):
		| (CollisionCandidate<SimulationPlayer> & {
				classification: DirectHitClassification
		  })
		| undefined {
		let nearest:
			| (CollisionCandidate<SimulationPlayer> & {
					classification: DirectHitClassification
			  })
			| undefined
		for (const player of players) {
			if (player.id === excludedPlayerId) continue
			const eyeHeight = player.crouching
				? PLAYER_CROUCH_EYE_HEIGHT
				: PLAYER_EYE_HEIGHT
			const bodyBounds = player.crouching
				? PILOT_CROUCH_BODY_HIT_BOUNDS
				: PILOT_STANDING_BODY_HIT_BOUNDS
			const groundY = player.position[1] - eyeHeight
			const headCenter = new THREE.Vector3(
				player.position[0],
				groundY +
					(player.crouching
						? PILOT_CROUCH_HEAD_CENTER_HEIGHT
						: PILOT_STANDING_HEAD_CENTER_HEIGHT),
				player.position[2],
			)
			const capsuleBottom = new THREE.Vector3(
				player.position[0],
				groundY + bodyBounds.bottom,
				player.position[2],
			)
			const capsuleTop = capsuleBottom.clone()
			capsuleTop.y = groundY + bodyBounds.top
			const bodyCollision = this.#segmentDistanceSquared(
				start,
				end,
				capsuleBottom,
				capsuleTop,
			)
			const headCollision = this.#segmentDistanceSquared(
				start,
				end,
				headCenter,
				headCenter,
			)
			const hitsBody =
				bodyCollision.distanceSquared <
				PLAYER_BODY_HIT_RADIUS * PLAYER_BODY_HIT_RADIUS
			const hitsHead =
				headCollision.distanceSquared <
				PILOT_HEAD_HIT_RADIUS * PILOT_HEAD_HIT_RADIUS
			if (!hitsBody && !hitsHead) continue
			const hitsHeadFirst =
				hitsHead &&
				(!hitsBody ||
					headCollision.firstTravelFraction <=
						bodyCollision.firstTravelFraction + Number.EPSILON)
			const classification: DirectHitClassification = hitsHeadFirst
				? "headshot"
				: "normal"
			const travelFraction = hitsHeadFirst
				? headCollision.firstTravelFraction
				: bodyCollision.firstTravelFraction
			if (nearest === undefined || travelFraction < nearest.travelFraction) {
				nearest = {
					classification,
					target: player,
					travelFraction,
				}
			}
		}
		return nearest
	}

	#reportDirectHit(
		projectile: ProjectileState,
		hit: Pick<
			DirectHitResult,
			"classification" | "damage" | "targetId" | "targetType"
		>,
	): void {
		if (projectile.ownerId === null || projectile.clientShotId === null) return
		this.#onDirectHit(projectile.ownerId, {
			...hit,
			clientShotId: projectile.clientShotId,
			projectileId: projectile.id,
		})
	}

	#segmentDistanceSquared(
		firstStart: THREE.Vector3,
		firstEnd: THREE.Vector3,
		secondStart: THREE.Vector3,
		secondEnd: THREE.Vector3,
	): { distanceSquared: number; firstTravelFraction: number } {
		const firstDirection = firstEnd.clone().sub(firstStart)
		const secondDirection = secondEnd.clone().sub(secondStart)
		const offset = firstStart.clone().sub(secondStart)
		const firstLengthSquared = firstDirection.lengthSq()
		const secondLengthSquared = secondDirection.lengthSq()
		const secondProjection = secondDirection.dot(offset)
		let firstTravelFraction = 0
		let secondTravelFraction = 0

		if (firstLengthSquared <= Number.EPSILON) {
			secondTravelFraction = THREE.MathUtils.clamp(
				secondProjection / secondLengthSquared,
				0,
				1,
			)
		} else {
			const firstProjection = firstDirection.dot(offset)
			if (secondLengthSquared <= Number.EPSILON) {
				firstTravelFraction = THREE.MathUtils.clamp(
					-firstProjection / firstLengthSquared,
					0,
					1,
				)
			} else {
				const directionProjection = firstDirection.dot(secondDirection)
				const denominator =
					firstLengthSquared * secondLengthSquared -
					directionProjection * directionProjection
				if (denominator > Number.EPSILON) {
					firstTravelFraction = THREE.MathUtils.clamp(
						(directionProjection * secondProjection -
							firstProjection * secondLengthSquared) /
							denominator,
						0,
						1,
					)
				}
				const secondDistance =
					directionProjection * firstTravelFraction + secondProjection
				if (secondDistance < 0) {
					secondTravelFraction = 0
					firstTravelFraction = THREE.MathUtils.clamp(
						-firstProjection / firstLengthSquared,
						0,
						1,
					)
				} else if (secondDistance > secondLengthSquared) {
					secondTravelFraction = 1
					firstTravelFraction = THREE.MathUtils.clamp(
						(directionProjection - firstProjection) / firstLengthSquared,
						0,
						1,
					)
				} else {
					secondTravelFraction = secondDistance / secondLengthSquared
				}
			}
		}

		const firstPoint = firstStart
			.clone()
			.addScaledVector(firstDirection, firstTravelFraction)
		const secondPoint = secondStart
			.clone()
			.addScaledVector(secondDirection, secondTravelFraction)
		return {
			distanceSquared: firstPoint.distanceToSquared(secondPoint),
			firstTravelFraction,
		}
	}

	#destroyDrone(
		drone: DroneState,
		selfDestructed: boolean,
		killerId: string | null,
	): void {
		const index = this.#drones.indexOf(drone)
		if (index < 0) return
		this.#drones.splice(index, 1)
		for (const missile of this.#missiles) {
			if (
				missile.targetRef?.kind === "drone" &&
				missile.targetRef.id === drone.id
			) {
				this.#clearMissileTargetForSeek(missile)
			}
		}
		this.#emitDroneDestroyed({
			id: drone.id,
			personality: drone.personality,
			position: drone.position.toArray(),
			selfDestructed,
		})
		if (!selfDestructed && killerId !== null && drone.ownerId === null) {
			this.#droneWrecks.push({
				expiresAt: this.#elapsed + DRONE_WRECK_LIFETIME_SECONDS,
				id: drone.id,
				personality: drone.personality,
				position: drone.position.clone(),
			})
		}
		if (!selfDestructed && killerId !== null) this.#onDroneKilled(killerId)
	}

	#snapshotDrone(drone: DroneState): DroneSnapshot {
		return {
			health: drone.health,
			id: drone.id,
			maxHealth: BODY_HEALTH[drone.personality],
			mood: drone.mood,
			ownerId: drone.ownerId,
			personality: drone.personality,
			position: drone.position.toArray(),
			targetPlayerId: drone.targetPlayerId,
			velocity: drone.velocity.toArray(),
			yaw: drone.yaw,
		}
	}

	#snapshotDroneWreck(wreck: DroneWreckState): DroneWreckSnapshot {
		return {
			id: wreck.id,
			personality: wreck.personality,
			position: wreck.position.toArray(),
		}
	}

	#snapshotDronePayload(payload: DronePayloadState): DronePayloadSnapshot {
		return {
			id: payload.id,
			ownerId: payload.ownerId,
			position: payload.position.toArray(),
			rotation: payload.rotation,
			velocity: payload.velocity.toArray(),
		}
	}

	#isVector(value: unknown): value is Vector3Tuple {
		return (
			Array.isArray(value) &&
			value.length === 3 &&
			value.every((component) => Number.isFinite(component))
		)
	}

	#lerpAngle(from: number, to: number, amount: number): number {
		const difference = Math.atan2(Math.sin(to - from), Math.cos(to - from))
		return from + difference * amount
	}
}
