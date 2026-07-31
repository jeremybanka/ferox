import * as THREE from "three"

import type {
	ArenaSnapshot,
	DroneDestroyedSnapshot,
	DroneMood,
	DronePersonality,
	DroneSnapshot,
	FireIntent,
	ProjectileEndedSnapshot,
	ProjectileSnapshot,
	Vector3Tuple,
} from "../src/arena-protocol.ts"
import { arenaHeightAt } from "../src/arena-terrain.ts"
import {
	DRONE_AUDITORY_RADIUS,
	DRONE_POPULATION_CAP,
	DRONE_VISION_DISTANCE,
	DRONE_VISION_HALF_ANGLE,
} from "../src/game-constants.ts"

export type SimulationPlayer = {
	crouching: boolean
	id: string
	position: Vector3Tuple
	velocity: Vector3Tuple
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
	personality: DronePersonality
	position: THREE.Vector3
	targetPlayerId: string | null
	threat: Map<string, number>
	velocity: THREE.Vector3
	wanderAngle: number
	yaw: number
}

type ProjectileState = {
	damage: number
	id: number
	life: number
	ownerId: string | null
	position: THREE.Vector3
	team: "bot" | "player"
	velocity: THREE.Vector3
}

type ArenaSimulationOptions = {
	emitDroneDestroyed: (snapshot: DroneDestroyedSnapshot) => void
	emitProjectile: (snapshot: ProjectileSnapshot) => void
	emitProjectileEnded: (snapshot: ProjectileEndedSnapshot) => void
	getPlayers: () => SimulationPlayer[]
	onDroneKilled: (playerId: string) => void
	onPlayerDamage: (playerId: string, damage: number) => void
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
const PLAYER_HIT_RADIUS = 0.5
const PLAYER_STANDING_HIT_BOTTOM = 0.45
const PLAYER_STANDING_HIT_TOP = 1.65
const PLAYER_CROUCH_HIT_BOTTOM = 0.4
const PLAYER_CROUCH_HIT_TOP = 1.2
const TMP_A = new THREE.Vector3()
const TMP_B = new THREE.Vector3()

export class ArenaSimulation {
	readonly #drones: DroneState[] = []
	readonly #emitDroneDestroyed: ArenaSimulationOptions["emitDroneDestroyed"]
	readonly #emitProjectile: ArenaSimulationOptions["emitProjectile"]
	readonly #emitProjectileEnded: ArenaSimulationOptions["emitProjectileEnded"]
	readonly #getPlayers: ArenaSimulationOptions["getPlayers"]
	readonly #onDroneKilled: ArenaSimulationOptions["onDroneKilled"]
	readonly #onPlayerDamage: ArenaSimulationOptions["onPlayerDamage"]
	readonly #projectiles: ProjectileState[] = []
	readonly #playerNoiseUntil = new Map<string, number>()
	readonly #seed: number
	#elapsed = 0
	#nextDroneId = 1
	#nextProjectileId = 1
	#nextSpawn = 1.2
	#sequence = 0
	#spawnElapsed = 0

	constructor(options: ArenaSimulationOptions) {
		this.#emitDroneDestroyed = options.emitDroneDestroyed
		this.#emitProjectile = options.emitProjectile
		this.#emitProjectileEnded = options.emitProjectileEnded
		this.#getPlayers = options.getPlayers
		this.#onDroneKilled = options.onDroneKilled
		this.#onPlayerDamage = options.onPlayerDamage
		this.#seed = options.seed
	}

	get droneCount(): number {
		return this.#drones.length
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
			20,
			"#b8fff1",
			playerId,
		)
		return true
	}

	snapshot(): ArenaSnapshot {
		this.#sequence += 1
		return {
			drones: this.#drones.map((drone) => this.#snapshotDrone(drone)),
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
			if (drone !== undefined) this.#updateDrone(drone, delta, players)
		}
		this.#updateProjectiles(delta, players)
	}

	#updateSpawning(delta: number, players: SimulationPlayer[]): void {
		if (players.length === 0 || this.#drones.length >= DRONE_POPULATION_CAP) {
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
			-52,
			52,
		)
		const z = THREE.MathUtils.clamp(
			anchor[2] + Math.sin(angle) * radius,
			-52,
			52,
		)
		this.#drones.push({
			attackCooldown: Math.random(),
			burstRounds: 0,
			health: BODY_HEALTH[personality],
			id: this.#nextDroneId,
			mood: "idle",
			personality,
			position: new THREE.Vector3(x, arenaHeightAt(this.#seed, x, z) + 3.4, z),
			targetPlayerId: null,
			threat: new Map(),
			velocity: new THREE.Vector3(),
			wanderAngle: Math.random() * Math.PI * 2,
			yaw: Math.random() * Math.PI * 2,
		})
		this.#nextDroneId += 1
	}

	#updateThreat(delta: number, players: readonly SimulationPlayer[]): void {
		const activeIds = new Set(players.map((player) => player.id))
		for (const drone of this.#drones) {
			for (const [playerId, threat] of drone.threat) {
				if (!activeIds.has(playerId) || threat <= delta * 1.5) {
					drone.threat.delete(playerId)
				} else {
					drone.threat.set(playerId, threat - delta * 1.5)
				}
			}
			for (const player of players) {
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

		if (targetPosition === null) {
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
				this.#onPlayerDamage(target.id, damage)
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
		drone.position.addScaledVector(drone.velocity, delta)
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
		this.#spawnProjectile(origin, direction, "bot", damage, color, null)
	}

	#spawnProjectile(
		origin: THREE.Vector3,
		direction: THREE.Vector3,
		team: "bot" | "player",
		damage: number,
		color: string,
		ownerId: string | null,
	): void {
		const id = this.#nextProjectileId
		this.#nextProjectileId += 1
		this.#projectiles.push({
			damage,
			id,
			life: 2.4,
			ownerId,
			position: origin.clone(),
			team,
			velocity: direction.clone().multiplyScalar(55),
		})
		this.#emitProjectile({
			color,
			damage,
			direction: direction.toArray(),
			id,
			origin: origin.toArray(),
			ownerId,
			team,
		})
	}

	#updateProjectiles(
		delta: number,
		players: readonly SimulationPlayer[],
	): void {
		for (let index = this.#projectiles.length - 1; index >= 0; index -= 1) {
			const projectile = this.#projectiles[index]
			if (projectile === undefined) continue
			projectile.life -= delta
			const previousPosition = projectile.position.clone()
			projectile.position.addScaledVector(projectile.velocity, delta)
			let hit = false
			if (projectile.team === "player") {
				const droneHit = this.#nearestDroneAlongSegment(
					previousPosition,
					projectile.position,
					1.35,
				)
				const playerHit = this.#nearestPlayerAlongSegment(
					previousPosition,
					projectile.position,
					players,
					projectile.ownerId,
				)
				if (
					droneHit !== undefined &&
					(playerHit === undefined ||
						droneHit.travelFraction <= playerHit.travelFraction)
				) {
					const drone = droneHit.target
					drone.health -= projectile.damage
					if (projectile.ownerId !== null) {
						drone.threat.set(
							projectile.ownerId,
							(drone.threat.get(projectile.ownerId) ?? 0) + 100,
						)
						if (
							drone.targetPlayerId === null ||
							(drone.threat.get(projectile.ownerId) ?? 0) >
								(drone.threat.get(drone.targetPlayerId) ?? 0) + 5
						) {
							drone.targetPlayerId = projectile.ownerId
							this.#setMood(drone)
						}
					}
					if (drone.health <= 0) {
						this.#destroyDrone(drone, false, projectile.ownerId)
					}
					hit = true
				} else if (playerHit !== undefined) {
					this.#onPlayerDamage(playerHit.target.id, projectile.damage)
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
					this.#onPlayerDamage(playerHit.target.id, projectile.damage)
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
			if (projectile.life <= 0 || hit || hitGround) {
				this.#projectiles.splice(index, 1)
				this.#emitProjectileEnded({ id: projectile.id })
			}
		}
	}

	#nearestDroneAlongSegment(
		start: THREE.Vector3,
		end: THREE.Vector3,
		radius: number,
	): CollisionCandidate<DroneState> | undefined {
		let nearest: CollisionCandidate<DroneState> | undefined
		const travel = TMP_A.copy(end).sub(start)
		const travelLengthSquared = travel.lengthSq()
		for (const drone of this.#drones) {
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
	): CollisionCandidate<SimulationPlayer> | undefined {
		let nearest: CollisionCandidate<SimulationPlayer> | undefined
		for (const player of players) {
			if (player.id === excludedPlayerId) continue
			const eyeHeight = player.crouching
				? PLAYER_CROUCH_EYE_HEIGHT
				: PLAYER_EYE_HEIGHT
			const bottomHeight = player.crouching
				? PLAYER_CROUCH_HIT_BOTTOM
				: PLAYER_STANDING_HIT_BOTTOM
			const topHeight = player.crouching
				? PLAYER_CROUCH_HIT_TOP
				: PLAYER_STANDING_HIT_TOP
			const groundY = player.position[1] - eyeHeight
			const capsuleBottom = new THREE.Vector3(
				player.position[0],
				groundY + bottomHeight,
				player.position[2],
			)
			const capsuleTop = capsuleBottom.clone()
			capsuleTop.y = groundY + topHeight
			const collision = this.#segmentDistanceSquared(
				start,
				end,
				capsuleBottom,
				capsuleTop,
			)
			if (collision.distanceSquared >= PLAYER_HIT_RADIUS * PLAYER_HIT_RADIUS)
				continue
			if (
				nearest === undefined ||
				collision.firstTravelFraction < nearest.travelFraction
			) {
				nearest = {
					target: player,
					travelFraction: collision.firstTravelFraction,
				}
			}
		}
		return nearest
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
		this.#emitDroneDestroyed({
			id: drone.id,
			personality: drone.personality,
			position: drone.position.toArray(),
			selfDestructed,
		})
		if (!selfDestructed && killerId !== null) this.#onDroneKilled(killerId)
	}

	#snapshotDrone(drone: DroneState): DroneSnapshot {
		return {
			health: drone.health,
			id: drone.id,
			maxHealth: BODY_HEALTH[drone.personality],
			mood: drone.mood,
			personality: drone.personality,
			position: drone.position.toArray(),
			targetPlayerId: drone.targetPlayerId,
			velocity: drone.velocity.toArray(),
			yaw: drone.yaw,
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
