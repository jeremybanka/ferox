import * as THREE from "three"

import type {
	NapalmHazardSnapshot,
	PlayerDamageImpact,
	VehicleControlIntent,
	VehicleKind,
	VehicleSeatId,
	VehicleSeatIntent,
	VehicleSnapshot,
	VehicleTurretIntent,
	Vector3Tuple,
} from "../src/arena-protocol.ts"
import {
	stepVehicleMotion,
	type VehicleMotion,
	type VehiclePhysicsInput,
	type VehiclePhysicsWorld,
} from "../src/VehiclePhysics.ts"

export type VehicleAuthorityPlayer = {
	dead: boolean
	id: string
	position: Vector3Tuple
	velocity: Vector3Tuple
}

type VehicleState = {
	afterburnerHeld: boolean
	afterburnerRemaining: number
	afterburnerCooldown: number
	control: VehiclePhysicsInput
	emptySeconds: number
	id: string
	kind: VehicleKind
	lastNapalmAt: number
	motion: VehicleMotion
	revision: number
	seats: Map<VehicleSeatId, string | null>
	spawn: Readonly<{ position: Vector3Tuple; yaw: number }>
	turretDirection: THREE.Vector3
	turretFireSequence: number
	turretLastFiredAt: number
	turretPitch: number
	turretYaw: number
}

type NapalmHazardState = {
	damageCooldowns: Map<string, number>
	expiresAt: number
	id: number
	ownerId: string
	position: Vector3Tuple
	radius: number
}

export type VehicleAuthorityOptions = {
	applyDamage: (
		playerId: string,
		damage: number,
		impact: PlayerDamageImpact,
	) => void
	getPlayers: () => VehicleAuthorityPlayer[]
	nowMs?: () => number
	world: VehiclePhysicsWorld
}

// A generous beacon radius keeps three spawn-ring pilots able to crew the jeep
// without overlapping its chassis while seat contention remains authoritative.
const ENTRY_RADIUS = 13.5
const NAPALM_DAMAGE = 6
const NAPALM_DAMAGE_INTERVAL_SECONDS = 0.5
const NAPALM_LIFETIME_SECONDS = 4
const NAPALM_RADIUS = 1.65
const TURRET_DAMAGE = 14
const TURRET_INTERVAL_MS = 240
const TURRET_RANGE = 76

const seatIdsFor = (kind: VehicleKind): readonly VehicleSeatId[] =>
	kind === "bike" ? ["rider"] : ["driver", "shotgun", "turret"]

const controllingSeatFor = (kind: VehicleKind): VehicleSeatId =>
	kind === "bike" ? "rider" : "driver"

export class VehicleAuthority {
	readonly #applyDamage: VehicleAuthorityOptions["applyDamage"]
	readonly #getPlayers: VehicleAuthorityOptions["getPlayers"]
	readonly #hazards: NapalmHazardState[] = []
	readonly #lastAction = new Map<string, number>()
	readonly #lastControl = new Map<string, number>()
	readonly #lastTurret = new Map<string, number>()
	readonly #nowMs: () => number
	readonly #vehicles: VehicleState[]
	readonly #world: VehiclePhysicsWorld
	#elapsed = 0
	#nextHazardId = 1

	constructor(options: VehicleAuthorityOptions) {
		this.#applyDamage = options.applyDamage
		this.#getPlayers = options.getPlayers
		this.#nowMs = options.nowMs ?? Date.now
		this.#world = options.world
		this.#vehicles = [
			this.#createVehicle("bike-1", "bike", [0, 0, 12], 0),
			this.#createVehicle("jeep-1", "jeep", [0, 0, 0], Math.PI),
		]
	}

	seat(playerId: string): Readonly<{
		seatId: VehicleSeatId
		vehicleId: string
	}> | null {
		for (const vehicle of this.#vehicles) {
			for (const [seatId, occupantId] of vehicle.seats) {
				if (occupantId === playerId) return { seatId, vehicleId: vehicle.id }
			}
		}
		return null
	}

	requestSeat(playerId: string, intent: VehicleSeatIntent): boolean {
		if (intent.clientActionId <= (this.#lastAction.get(playerId) ?? -1))
			return false
		this.#lastAction.set(playerId, intent.clientActionId)
		const player = this.#player(playerId)
		if (player === undefined || player.dead) return false
		const occupied = this.seat(playerId)
		if (intent.type === "exit") {
			if (occupied === null) return false
			const vehicle = this.#vehicle(occupied.vehicleId)
			if (vehicle === undefined) return false
			vehicle.seats.set(occupied.seatId, null)
			vehicle.revision += 1
			this.#placeDismountedPlayer(player, vehicle, occupied.seatId)
			return true
		}
		const vehicle = this.#vehicle(intent.vehicleId ?? "")
		const seatId = intent.seatId
		if (
			vehicle === undefined ||
			seatId === undefined ||
			!vehicle.seats.has(seatId) ||
			vehicle.seats.get(seatId) !== null
		)
			return false
		if (intent.type === "enter") {
			if (
				occupied !== null ||
				this.#distance(player.position, vehicle.motion.position) > ENTRY_RADIUS
			)
				return false
		} else {
			if (occupied === null || occupied.vehicleId !== vehicle.id) return false
			vehicle.seats.set(occupied.seatId, null)
		}
		vehicle.seats.set(seatId, playerId)
		vehicle.revision += 1
		this.#clearTraversalMotion(player, vehicle, seatId)
		return true
	}

	control(playerId: string, intent: VehicleControlIntent): boolean {
		if (intent.clientInputId <= (this.#lastControl.get(playerId) ?? -1))
			return false
		this.#lastControl.set(playerId, intent.clientInputId)
		const vehicle = this.#vehicle(intent.vehicleId)
		if (
			vehicle === undefined ||
			vehicle.seats.get(controllingSeatFor(vehicle.kind)) !== playerId
		)
			return false
		vehicle.control = {
			afterburner: intent.afterburner,
			brake: intent.brake,
			steering: intent.steering,
			throttle: intent.throttle,
		}
		return true
	}

	turret(playerId: string, intent: VehicleTurretIntent): boolean {
		if (intent.clientInputId <= (this.#lastTurret.get(playerId) ?? -1))
			return false
		this.#lastTurret.set(playerId, intent.clientInputId)
		const vehicle = this.#vehicle(intent.vehicleId)
		if (vehicle?.kind !== "jeep" || vehicle.seats.get("turret") !== playerId)
			return false
		const direction = new THREE.Vector3(...intent.direction).normalize()
		const worldYaw = Math.atan2(-direction.x, -direction.z)
		const relativeYaw =
			THREE.MathUtils.euclideanModulo(
				worldYaw - vehicle.motion.yaw + Math.PI,
				Math.PI * 2,
			) - Math.PI
		vehicle.turretYaw = THREE.MathUtils.clamp(
			relativeYaw,
			-THREE.MathUtils.degToRad(135),
			THREE.MathUtils.degToRad(135),
		)
		vehicle.turretPitch = THREE.MathUtils.clamp(
			Math.asin(direction.y),
			THREE.MathUtils.degToRad(-25),
			THREE.MathUtils.degToRad(55),
		)
		vehicle.turretDirection.set(
			-Math.sin(vehicle.motion.yaw + vehicle.turretYaw) *
				Math.cos(vehicle.turretPitch),
			Math.sin(vehicle.turretPitch),
			-Math.cos(vehicle.motion.yaw + vehicle.turretYaw) *
				Math.cos(vehicle.turretPitch),
		)
		if (
			!intent.fire ||
			this.#nowMs() - vehicle.turretLastFiredAt < TURRET_INTERVAL_MS
		)
			return true
		vehicle.turretLastFiredAt = this.#nowMs()
		vehicle.turretFireSequence += 1
		this.#fireTurret(vehicle, playerId)
		return true
	}

	removePlayer(playerId: string): boolean {
		const occupied = this.seat(playerId)
		this.#lastAction.delete(playerId)
		this.#lastControl.delete(playerId)
		this.#lastTurret.delete(playerId)
		if (occupied === null) return false
		const vehicle = this.#vehicle(occupied.vehicleId)
		if (vehicle === undefined) return false
		vehicle.seats.set(occupied.seatId, null)
		vehicle.control = {
			afterburner: false,
			brake: false,
			steering: 0,
			throttle: 0,
		}
		vehicle.revision += 1
		return true
	}

	update(deltaSeconds: number): void {
		const delta = Math.max(0, Math.min(deltaSeconds, 0.05))
		this.#elapsed += delta
		for (const vehicle of this.#vehicles) this.#updateVehicle(vehicle, delta)
		this.#updateHazards(delta)
	}

	snapshots(): VehicleSnapshot[] {
		return this.#vehicles.map((vehicle) => ({
			afterburner: vehicle.afterburnerRemaining > 0,
			airborne: vehicle.motion.airborne,
			id: vehicle.id,
			kind: vehicle.kind,
			lean: vehicle.motion.lean,
			pitch: vehicle.motion.pitch,
			position: [...vehicle.motion.position],
			revision: vehicle.revision,
			seats: [...vehicle.seats].map(([id, occupantId]) => ({ id, occupantId })),
			turretFireSequence: vehicle.turretFireSequence,
			turretPitch: vehicle.turretPitch,
			turretYaw: vehicle.turretYaw,
			velocity: [...vehicle.motion.velocity],
			yaw: vehicle.motion.yaw,
		}))
	}

	hazards(): NapalmHazardSnapshot[] {
		return this.#hazards.map(
			({ expiresAt, id, ownerId, position, radius }) => ({
				expiresAt,
				id,
				ownerId,
				position: [...position],
				radius,
			}),
		)
	}

	#createVehicle(
		id: string,
		kind: VehicleKind,
		position: Vector3Tuple,
		yaw: number,
	): VehicleState {
		const groundedPosition: Vector3Tuple = [
			position[0],
			this.#world.groundAt(position[0], position[2]) +
				(kind === "bike" ? 0.72 : 1.05),
			position[2],
		]
		return {
			afterburnerCooldown: 0,
			afterburnerHeld: false,
			afterburnerRemaining: 0,
			control: { afterburner: false, brake: false, steering: 0, throttle: 0 },
			emptySeconds: 0,
			id,
			kind,
			lastNapalmAt: -Infinity,
			motion: {
				airborne: false,
				lean: 0,
				pitch: 0,
				position: groundedPosition,
				velocity: [0, kind === "jeep" ? 5 : 0, 0],
				yaw,
			},
			revision: 0,
			seats: new Map(seatIdsFor(kind).map((seat) => [seat, null])),
			spawn: { position: groundedPosition, yaw },
			turretDirection: new THREE.Vector3(0, 0, -1),
			turretFireSequence: 0,
			turretLastFiredAt: -Infinity,
			turretPitch: 0,
			turretYaw: 0,
		}
	}

	#updateVehicle(vehicle: VehicleState, delta: number): void {
		const driverId = vehicle.seats.get(controllingSeatFor(vehicle.kind)) ?? null
		const occupied = [...vehicle.seats.values()].some(
			(occupant) => occupant !== null,
		)
		vehicle.emptySeconds = occupied ? 0 : vehicle.emptySeconds + delta
		vehicle.afterburnerCooldown = Math.max(
			0,
			vehicle.afterburnerCooldown - delta,
		)
		vehicle.afterburnerRemaining = Math.max(
			0,
			vehicle.afterburnerRemaining - delta,
		)
		if (
			vehicle.kind === "bike" &&
			driverId !== null &&
			vehicle.control.afterburner &&
			!vehicle.afterburnerHeld &&
			vehicle.afterburnerCooldown <= 0 &&
			vehicle.afterburnerRemaining <= 0
		) {
			vehicle.afterburnerRemaining = 1.2
			vehicle.afterburnerCooldown = 4.2
			const boostImpulse = 8
			vehicle.motion = {
				...vehicle.motion,
				velocity: [
					vehicle.motion.velocity[0] -
						Math.sin(vehicle.motion.yaw) * boostImpulse,
					vehicle.motion.velocity[1],
					vehicle.motion.velocity[2] -
						Math.cos(vehicle.motion.yaw) * boostImpulse,
				],
			}
		}
		vehicle.afterburnerHeld = vehicle.control.afterburner
		const afterburner = vehicle.afterburnerRemaining > 0
		vehicle.motion = stepVehicleMotion(
			vehicle.kind,
			vehicle.motion,
			{ ...vehicle.control, afterburner },
			delta,
			this.#world,
		)
		if (
			vehicle.kind === "bike" &&
			afterburner &&
			driverId !== null &&
			this.#elapsed - vehicle.lastNapalmAt >= 0.18
		) {
			vehicle.lastNapalmAt = this.#elapsed
			const rearX = Math.sin(vehicle.motion.yaw) * 1.25
			const rearZ = Math.cos(vehicle.motion.yaw) * 1.25
			this.#hazards.push({
				damageCooldowns: new Map(),
				expiresAt: this.#nowMs() + NAPALM_LIFETIME_SECONDS * 1_000,
				id: this.#nextHazardId++,
				ownerId: driverId,
				position: [
					vehicle.motion.position[0] + rearX,
					this.#world.groundAt(
						vehicle.motion.position[0] + rearX,
						vehicle.motion.position[2] + rearZ,
					) + 0.08,
					vehicle.motion.position[2] + rearZ,
				],
				radius: NAPALM_RADIUS,
			})
			if (this.#hazards.length > 48) this.#hazards.shift()
		}
		this.#attachOccupants(vehicle)
		const corrupt = [
			...vehicle.motion.position,
			...vehicle.motion.velocity,
			vehicle.motion.yaw,
		].some((value) => !Number.isFinite(value))
		if (corrupt || vehicle.emptySeconds > 45) this.#resetVehicle(vehicle)
	}

	#attachOccupants(vehicle: VehicleState): void {
		for (const [seatId, occupantId] of vehicle.seats) {
			if (occupantId === null) continue
			const player = this.#player(occupantId)
			if (player === undefined || player.dead) {
				this.removePlayer(occupantId)
				continue
			}
			this.#clearTraversalMotion(player, vehicle, seatId)
		}
	}

	#clearTraversalMotion(
		player: VehicleAuthorityPlayer,
		vehicle: VehicleState,
		seatId: VehicleSeatId,
	): void {
		const local: Vector3Tuple =
			seatId === "shotgun"
				? [-0.72, 1.24, 0.35]
				: seatId === "turret"
					? [0, 1.75, 0.35]
					: seatId === "driver"
						? [0.72, 1.24, 0.35]
						: [0, 1.18, 0]
		const cosine = Math.cos(vehicle.motion.yaw)
		const sine = Math.sin(vehicle.motion.yaw)
		player.position = [
			vehicle.motion.position[0] + local[0] * cosine + local[2] * sine,
			vehicle.motion.position[1] + local[1],
			vehicle.motion.position[2] - local[0] * sine + local[2] * cosine,
		]
		player.velocity = [...vehicle.motion.velocity]
	}

	#placeDismountedPlayer(
		player: VehicleAuthorityPlayer,
		vehicle: VehicleState,
		seatId: VehicleSeatId,
	): void {
		const side = seatId === "shotgun" ? -1 : 1
		const sideX =
			Math.cos(vehicle.motion.yaw) *
			side *
			(vehicle.kind === "jeep" ? 2.5 : 1.55)
		const sideZ =
			-Math.sin(vehicle.motion.yaw) *
			side *
			(vehicle.kind === "jeep" ? 2.5 : 1.55)
		const x = vehicle.motion.position[0] + sideX
		const z = vehicle.motion.position[2] + sideZ
		player.position = [x, this.#world.groundAt(x, z) + 1.72, z]
		player.velocity = [
			vehicle.motion.velocity[0] * 0.45,
			Math.max(0, vehicle.motion.velocity[1]),
			vehicle.motion.velocity[2] * 0.45,
		]
	}

	#updateHazards(delta: number): void {
		const now = this.#nowMs()
		for (let index = this.#hazards.length - 1; index >= 0; index -= 1) {
			const hazard = this.#hazards[index]
			if (hazard === undefined) continue
			if (now >= hazard.expiresAt) {
				this.#hazards.splice(index, 1)
				continue
			}
			for (const [playerId, cooldown] of hazard.damageCooldowns)
				hazard.damageCooldowns.set(playerId, Math.max(0, cooldown - delta))
			for (const player of this.#getPlayers()) {
				if (
					player.dead ||
					player.id === hazard.ownerId ||
					this.seat(player.id) !== null ||
					this.#distance(player.position, hazard.position) > hazard.radius ||
					(hazard.damageCooldowns.get(player.id) ?? 0) > 0
				)
					continue
				hazard.damageCooldowns.set(player.id, NAPALM_DAMAGE_INTERVAL_SECONDS)
				this.#applyDamage(player.id, NAPALM_DAMAGE, {
					direction: [0, 1, 0],
					position: [...hazard.position],
					source: "napalm",
				})
			}
		}
	}

	#fireTurret(vehicle: VehicleState, gunnerId: string): void {
		const origin = new THREE.Vector3(...vehicle.motion.position).add(
			new THREE.Vector3(0, 2.35, 0),
		)
		let closest: { player: VehicleAuthorityPlayer; distance: number } | null =
			null
		const occupants = new Set(vehicle.seats.values())
		for (const player of this.#getPlayers()) {
			if (player.dead || occupants.has(player.id)) continue
			const center = new THREE.Vector3(...player.position).add(
				new THREE.Vector3(0, -0.75, 0),
			)
			const offset = center.clone().sub(origin)
			const distance = offset.dot(vehicle.turretDirection)
			if (distance < 0 || distance > TURRET_RANGE) continue
			const miss = offset
				.clone()
				.addScaledVector(vehicle.turretDirection, -distance)
				.length()
			if (miss > 0.62 || (closest !== null && closest.distance <= distance))
				continue
			closest = { distance, player }
		}
		if (closest === null) return
		this.#applyDamage(closest.player.id, TURRET_DAMAGE, {
			direction: vehicle.turretDirection.toArray(),
			position: closest.player.position,
			source: "vehicle-turret",
		})
		void gunnerId
	}

	#resetVehicle(vehicle: VehicleState): void {
		for (const occupantId of vehicle.seats.values()) {
			if (occupantId === null) continue
			const player = this.#player(occupantId)
			if (player !== undefined)
				this.#placeDismountedPlayer(player, vehicle, "driver")
		}
		for (const seatId of vehicle.seats.keys()) vehicle.seats.set(seatId, null)
		vehicle.motion = {
			airborne: false,
			lean: 0,
			pitch: 0,
			position: [...vehicle.spawn.position],
			velocity: [0, 0, 0],
			yaw: vehicle.spawn.yaw,
		}
		vehicle.emptySeconds = 0
		vehicle.revision += 1
	}

	#player(playerId: string): VehicleAuthorityPlayer | undefined {
		return this.#getPlayers().find((candidate) => candidate.id === playerId)
	}

	#vehicle(vehicleId: string): VehicleState | undefined {
		return this.#vehicles.find((candidate) => candidate.id === vehicleId)
	}

	#distance(a: Vector3Tuple, b: Vector3Tuple): number {
		return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
	}
}
