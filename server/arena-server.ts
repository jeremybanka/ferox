import { createServer } from "node:http"

import { realtime } from "atom.io/realtime-server"
import type { UserKey } from "atom.io/realtime"
import { Server, type Socket as IoSocket } from "socket.io"

import {
	activeEquipmentSlot,
	isNewInventoryActionIntent,
	isDroneRecoveryIntent,
	isGrappleActionIntent,
	isGrenadeSelectionIntent,
	isJumpDirectionForImpulse,
	isJumpSequence,
	isMantleSnapshot,
	isVisorExpression,
	isWallTraversalSnapshot,
	nextAcceptedRecoilSignal,
	type CombatSnapshot,
	type FireIntent,
	type MeleeHitResult,
	type GrenadeIntent,
	type GrappleStateSnapshot,
	type MiniMissileIntent,
	type RailChargeIntent,
	type PlayerMoveSnapshot,
	type PlayerDamageImpact,
	type PlayerDamageSnapshot,
	type PlayerSnapshot,
} from "../src/arena-protocol.ts"
import { arenaHeightAt } from "../src/arena-terrain.ts"
import { arenaGravityScaleAtStepStart } from "../src/ArenaZones.ts"
import {
	ARENA_PLAYABLE_HALF_EXTENT,
	arenaMovementGroundAt,
	queryArenaAnchor,
	queryArenaLedge,
	resolveArenaMotion,
} from "../src/ArenaWorld.ts"
import {
	ARENA_SEED,
	ARENA_WEAPON_PICKUP_PADS,
	GRAPPLE_AUTHORITY_AIR_ACCELERATION,
	GRAPPLE_AUTHORITY_GROUND_ACCELERATION,
	GRAPPLE_MAX_RANGE,
	MINI_MISSILE_PICKUP_POSITION,
	PLAYER_SPAWN_ORDER,
	PLAYER_SPAWN_POINTS,
	railChargeFraction,
} from "../src/game-constants.ts"
import {
	applyGrappleAttachImpulse,
	constrainGrappleMotion,
	stepAuthoritativeGrappleDirectionalJumpMotion,
	stepAuthoritativeGrappleMotion,
} from "../src/GrapplePhysics.ts"
import { DEFAULT_GUN_ID, gunDefinition } from "../src/guns/GunDefinitions.ts"
import { isJumpGrounded, JUMP_PHYSICS } from "../src/JumpPhysics.ts"
import {
	INITIAL_MANTLE_STATE,
	MANTLE_MAXIMUM_RISE,
	type MantleState,
} from "../src/MantleTraversal.ts"
import { sampleTerrainGradient } from "../src/SlidePhysics.ts"
import {
	PILOT_CROUCH_EYE_HEIGHT,
	PILOT_STANDING_EYE_HEIGHT,
} from "../src/pilot-targeting.ts"
import {
	advanceReload,
	startReload,
	type ReloadState,
} from "../src/ReloadState.ts"
import {
	horizontalViewDirectionFromYaw,
	INITIAL_WALL_TRAVERSAL_STATE,
	type WallTraversalState,
} from "../src/WallTraversal.ts"
import { ArenaSimulation } from "./ArenaSimulation.ts"
import {
	authoritativeGrappleJumpPlanarImpulse,
	reconcileAuthoritativeGrappleGroundTransition,
	reconcileAuthoritativeGrappleJump,
} from "./AuthoritativeGrappleJump.ts"
import {
	applyAuthoritativeExternalImpulse,
	authoritativeTraversalSpeedLimit,
	limitAuthoritativeTraversalDestination,
	reconcileAuthoritativeMovement,
} from "./AuthoritativeMovement.ts"
import {
	initialAuthoritativeJumpRoute,
	routeAuthoritativeJumpSignal,
} from "./AuthoritativeJumpRouter.ts"
import { MeleeCombat } from "./MeleeCombat.ts"
import { isFireCadenceReady } from "./FireCadence.ts"
import { MiniMissileArmory, type LockUpdate } from "./MiniMissileArmory.ts"
import {
	StandardLockTracker,
	type StandardLockUpdate,
} from "./StandardLockTracker.ts"
import { PlayerLifecycle } from "./PlayerLifecycle.ts"
import { GrappleUtility } from "./GrappleUtility.ts"
type SpawnPayload = {
	damageSequence: number
	position: [number, number]
	yaw: number
}

const port = Number(process.env["PORT"] ?? 4_317)
const httpServer = createServer((request, response) => {
	if (request.url === "/health") {
		response.writeHead(200, { "content-type": "application/json" })
		response.end(JSON.stringify({ players: players.size, status: "online" }))
		return
	}
	response.writeHead(200, { "content-type": "text/plain" })
	response.end("FEROX realtime arena online")
})
const io = new Server(httpServer, {
	cors: { origin: true },
	serveClient: false,
})
const players = new Map<string, PlayerSnapshot>()
const playerSpawnSlots = new Map<string, number>()
const playerDamageSequences = new Map<string, number>()
const playerLifecycle = new PlayerLifecycle()
const lastPlayerFire = new Map<string, number>()
const lastPlayerGrenade = new Map<string, number>()
const lastPlayerMissile = new Map<string, number>()
const lastRailChargeId = new Map<string, number>()
const railCharges = new Map<
	string,
	{ clientChargeId: number; startedAt: number }
>()
const lastInventoryAction = new Map<string, number>()
const lastDroneAction = new Map<string, number>()
const lastGrappleAction = new Map<string, number>()
const playerReloads = new Map<string, Exclude<ReloadState, null>>()
const [pickupX, pickupZ] = MINI_MISSILE_PICKUP_POSITION
const arenaPickupPads = ARENA_WEAPON_PICKUP_PADS.map(
	([x, z]) =>
		[x, arenaHeightAt(ARENA_SEED, x, z) + 0.72, z] as [number, number, number],
)
const armory = new MiniMissileArmory(
	[pickupX, arenaHeightAt(ARENA_SEED, pickupX, pickupZ) + 0.72, pickupZ],
	arenaPickupPads,
	Date.now(),
)
const grapple = new GrappleUtility()
const standardLocks = new StandardLockTracker()

const applyPlayerDamage = (
	playerId: string,
	damage: number,
	impact: PlayerDamageImpact,
): "damaged" | "died" | "ignored" => {
	const nowMs = Date.now()
	const currentHealth = playerLifecycle.get(playerId)?.health ?? 0
	const result = playerLifecycle.damage(playerId, damage, nowMs)
	if (result === "ignored") return result
	const lifecycle = playerLifecycle.get(playerId)
	if (lifecycle === undefined) return "ignored"
	const player = players.get(playerId)
	if (
		result === "damaged" &&
		player !== undefined &&
		impact.impulse !== undefined &&
		impact.impulse.length === 3 &&
		impact.impulse.every(Number.isFinite) &&
		impact.source === "ballistic"
	) {
		player.velocity = [
			...applyAuthoritativeExternalImpulse(player.velocity, impact.impulse),
		]
	}
	const sequence = (playerDamageSequences.get(playerId) ?? 0) + 1
	playerDamageSequences.set(playerId, sequence)
	io.emit("arena:player-damaged", {
		...impact,
		damage: currentHealth - lifecycle.health,
		fatal: result === "died",
		playerId,
		sequence,
		serverTime: nowMs / 1_000,
	} satisfies PlayerDamageSnapshot)
	if (result === "died") {
		cancelPlayerReload(playerId)
		if (player !== undefined) {
			Object.assign(player, {
				dead: true,
				deathStartedAt: lifecycle.deathStartedAt,
				emote: null,
				freeAim: false,
				jump: 0,
				mantle: { active: false, progress: 0, surfaceId: null },
				lifeSequence: player.lifeSequence + 1,
				punchStartedAt: 0,
				reload: null,
				recoilStartedAt: 0,
				respawnAt: lifecycle.respawnAt,
				sliding: false,
				velocity: [0, 0, 0],
				wallTraversal: { mode: "none", normal: [0, 0, 0] },
				visorExpression: "defeated",
				visorStartedAt: nowMs / 1_000,
				weaponsFree: false,
			})
		}
		simulation.removePlayer(playerId)
		io.to(playerId).emit(
			"arena:drone-inventory",
			simulation.droneInventory(playerId),
		)
		melee.cancel(playerId)
		emitMissileLockUpdates(armory.clearLocksForPlayer(playerId))
		emitStandardLockUpdates(standardLocks.clearPlayer(playerId))
		if (armory.release(playerId, nowMs)) emitPickups()
		const grappleReset = grapple.reset(playerId)
		if (grappleReset !== null) emitGrapple(grappleReset)
		emitEquipment(playerId)
		lastPlayerFire.delete(playerId)
		lastPlayerGrenade.delete(playerId)
		lastPlayerMissile.delete(playerId)
		railCharges.delete(playerId)
		lastRailChargeId.delete(playerId)
		io.emit("arena:players", [...players.values()])
	}
	io.to(playerId).emit("arena:combat", combatSnapshot(playerId))
	return result
}

const applySimulationPlayerDamage = (
	playerId: string,
	damage: number,
	impact: PlayerDamageImpact,
): number => {
	const before = playerLifecycle.get(playerId)?.health ?? 0
	applyPlayerDamage(playerId, damage, impact)
	return Math.max(0, before - (playerLifecycle.get(playerId)?.health ?? before))
}

const emitMissileLockUpdates = (updates: readonly LockUpdate[]): void => {
	for (const update of updates) {
		io.to(update.playerId).emit("arena:incoming-lock", update.snapshot)
	}
}

const emitStandardLockUpdates = (
	updates: readonly StandardLockUpdate[],
): void => {
	for (const update of updates) {
		io.to(update.playerId).emit("arena:incoming-standard-lock", update.snapshot)
	}
}

const reconcileStandardLocks = (): void => {
	const livingPlayers = new Map(
		[...players].filter(([, player]) => !player.dead),
	)
	emitStandardLockUpdates(standardLocks.reconcile(livingPlayers))
}

const emitEquipment = (playerId: string): void => {
	const equipment = armory.equipment(playerId)
	io.to(playerId).emit("arena:equipment", equipment)
	const player = players.get(playerId)
	if (player !== undefined)
		player.equippedWeapon = activeEquipmentSlot(equipment).weapon
}

const emitPickups = (): void => {
	io.emit("arena:mini-missile-pickup", armory.pickup())
	io.emit("arena:weapon-pickups", armory.arenaPickups())
}

const emitGrapple = (state: GrappleStateSnapshot): void => {
	io.emit("arena:grapple-state", state)
}

const cancelPlayerReload = (playerId: string): boolean => {
	const player = players.get(playerId)
	const hadSession = playerReloads.delete(playerId)
	if (player === undefined) return hadSession
	const hadSnapshot = player.reload !== null
	player.reload = null
	return hadSession || hadSnapshot
}

const combatSnapshot = (playerId: string): CombatSnapshot => ({
	dead: playerLifecycle.get(playerId)?.dead ?? false,
	deathStartedAt: playerLifecycle.get(playerId)?.deathStartedAt ?? null,
	health: playerLifecycle.get(playerId)?.health ?? 100,
	respawnAt: playerLifecycle.get(playerId)?.respawnAt ?? null,
	score: playerLifecycle.get(playerId)?.score ?? 0,
})

const simulation = new ArenaSimulation({
	emitBallistic: (snapshot) => io.emit("arena:ballistic", snapshot),
	emitBallisticEnded: (snapshot) => io.emit("arena:ballistic-ended", snapshot),
	emitBubble: (snapshot) => io.emit("arena:bubble", snapshot),
	emitBubblePopped: (snapshot) => io.emit("arena:bubble-popped", snapshot),
	emitShotgunPelletSuspended: (snapshot) =>
		io.emit("arena:shotgun-pellet-suspended", snapshot),
	emitShotgunVolley: (snapshot) => io.emit("arena:shotgun-volley", snapshot),
	emitDroneDestroyed: (snapshot) => {
		io.emit("arena:drone-destroyed", snapshot)
	},
	emitGrenade: (snapshot) => {
		io.emit("arena:grenade", snapshot)
	},
	emitGrenadeExploded: (snapshot) => {
		io.emit("arena:grenade-exploded", snapshot)
	},
	emitMiniMissile: (snapshot) => {
		io.emit("arena:mini-missile", snapshot)
	},
	emitMiniMissileEnded: (snapshot) => {
		io.emit("arena:mini-missile-ended", snapshot)
	},
	emitMiniMissileExploded: (snapshot) => {
		io.emit("arena:mini-missile-exploded", snapshot)
	},
	emitProjectile: (snapshot) => {
		io.emit("arena:projectile", snapshot)
	},
	emitProjectileEnded: (snapshot) => {
		io.emit("arena:projectile-ended", snapshot)
	},
	getPlayers: () =>
		[...players.values()]
			.filter((player) => !player.dead)
			.map((player) => ({
				crouching: player.crouching,
				id: player.id,
				position: player.position,
				velocity: player.velocity,
			})),
	onDirectHit: (playerId, result) => {
		io.to(playerId).emit("arena:direct-hit", result)
	},
	onDroneKilled: (playerId) => {
		playerLifecycle.awardScore(playerId)
		io.to(playerId).emit("arena:combat", combatSnapshot(playerId))
	},
	onLockChanged: (attackerId, targetId, locked) => {
		emitMissileLockUpdates(armory.setLock(attackerId, targetId, locked))
	},
	onPlayerDamage: applySimulationPlayerDamage,
	seed: ARENA_SEED,
})

const melee = new MeleeCombat({
	getPlayers: () =>
		[...players.values()]
			.filter((player) => !player.dead)
			.map((player) => ({
				id: player.id,
				position: player.position,
				yaw: player.rotation[0],
			})),
	onActionAccepted: (playerId, intent, startedAtMs) => {
		const player = players.get(playerId)
		if (player === undefined) return
		if (intent.type === "punch") {
			player.emote = null
			player.punchSequence += 1
			player.punchStartedAt = startedAtMs / 1_000
		} else {
			player.emote = intent.type
			player.emoteStartedAt = startedAtMs / 1_000
		}
		io.emit("arena:players", [...players.values()])
	},
	onFistContact: (result) => io.emit("arena:fist-contact", result),
	onMeleeHit: (result: MeleeHitResult) => {
		const attacker = players.get(result.attackerId)
		const target = players.get(result.targetId)
		if (
			attacker === undefined ||
			target === undefined ||
			attacker.dead ||
			target.dead
		)
			return
		const direction: [number, number, number] = [
			target.position[0] - attacker.position[0],
			0,
			target.position[2] - attacker.position[2],
		]
		const length = Math.hypot(direction[0], direction[2]) || 1
		direction[0] /= length
		direction[2] /= length
		const outcome = applyPlayerDamage(result.targetId, result.damage, {
			direction,
			position: result.position,
			source: "melee",
		})
		if (outcome === "ignored") return
		io.emit("arena:melee-hit", result)
		if (outcome === "died") {
			playerLifecycle.awardScore(result.attackerId)
			io.to(result.attackerId).emit(
				"arena:combat",
				combatSnapshot(result.attackerId),
			)
		}
	},
})

realtime(
	io,
	(handshake) => {
		const username = handshake.auth["username"]
		const token = handshake.auth["token"]
		if (
			typeof username === "string" &&
			username.startsWith("user::") &&
			token === "ferox-local"
		) {
			return username as UserKey
		}
		return new Error("Invalid pilot credentials.")
	},
	({ socket }) => {
		const gameSocket = socket as unknown as IoSocket
		const socketId = gameSocket.id
		let authoritativeLifeSequence = 0
		let authoritativeWallTraversal: WallTraversalState =
			INITIAL_WALL_TRAVERSAL_STATE
		let authoritativeGrappleJumps: 0 | 1 | 2 = 0
		let authoritativeGrappleAttachmentId = -1
		let authoritativeMantle: MantleState = INITIAL_MANTLE_STATE
		let authoritativeCoyoteRemaining: number | null = null
		let authoritativeGrounded = true
		let authoritativeJump: 0 | 1 | 2 = 0
		let authoritativeJumpRoute = initialAuthoritativeJumpRoute(0)
		let authoritativeSliding = false
		let authoritativeSurfaceSliding = false
		let lastMoveAt = performance.now()
		const occupiedSlots = new Set(playerSpawnSlots.values())
		const availableSlot = PLAYER_SPAWN_ORDER.find(
			(index) => !occupiedSlots.has(index),
		)
		const spawnIndex =
			availableSlot === undefined
				? players.size % PLAYER_SPAWN_POINTS.length
				: availableSlot
		const [spawnX, spawnZ, spawnYaw] = PLAYER_SPAWN_POINTS[spawnIndex]!
		const spawnPayload = {
			damageSequence: 0,
			position: [spawnX, spawnZ],
			yaw: spawnYaw,
		} satisfies SpawnPayload
		playerSpawnSlots.set(socketId, spawnIndex)
		playerDamageSequences.set(socketId, 0)
		playerLifecycle.add(socketId)
		players.set(socketId, {
			aimDirection: [-Math.sin(spawnYaw), 0, -Math.cos(spawnYaw)],
			crouching: false,
			dead: false,
			deathStartedAt: null,
			emote: null,
			emoteStartedAt: 0,
			equippedWeapon: DEFAULT_GUN_ID,
			freeAim: false,
			id: socketId,
			jump: 0,
			mantle: { active: false, progress: 0, surfaceId: null },
			lifeSequence: 0,
			position: [spawnX, 8, spawnZ],
			punchSequence: 0,
			punchStartedAt: 0,
			recoilSequence: 0,
			recoilStartedAt: 0,
			rotation: [spawnYaw, 0],
			reload: null,
			respawnAt: null,
			sliding: false,
			velocity: [0, 0, 0],
			wallTraversal: { mode: "none", normal: [0, 0, 0] },
			visorExpression: "boot",
			visorStartedAt: Date.now() / 1_000,
			weaponsFree: false,
		})
		armory.connect(socketId)
		grapple.connect(socketId)
		simulation.connectPlayer(socketId)
		const onReady = (): void => {
			if (playerLifecycle.isAlive(socketId)) {
				gameSocket.emit("arena:spawn", {
					...spawnPayload,
					damageSequence: playerDamageSequences.get(socketId) ?? 0,
				})
			}
			gameSocket.emit("arena:combat", combatSnapshot(socketId))
			gameSocket.emit("arena:snapshot", simulation.snapshot())
			gameSocket.emit("arena:shotgun-pellets", simulation.shotgunPellets())
			gameSocket.emit("arena:equipment", armory.equipment(socketId))
			gameSocket.emit("arena:mini-missile-pickup", armory.pickup())
			gameSocket.emit("arena:weapon-pickups", armory.arenaPickups())
			for (const state of grapple.states())
				gameSocket.emit("arena:grapple-state", state)
			gameSocket.emit("arena:incoming-lock", armory.incoming(socketId))
			gameSocket.emit(
				"arena:drone-inventory",
				simulation.droneInventory(socketId),
			)
			gameSocket.emit(
				"arena:incoming-standard-lock",
				standardLocks.incoming(socketId),
			)
		}
		gameSocket.on("arena:ready", onReady)
		onReady()
		io.emit("arena:players", [...players.values()])

		const onMove = (payload: PlayerMoveSnapshot): void => {
			if (!playerLifecycle.isAlive(socketId)) return
			if (
				!Array.isArray(payload.aimDirection) ||
				!Array.isArray(payload.position) ||
				!Array.isArray(payload.rotation) ||
				!Array.isArray(payload.velocity) ||
				typeof payload.crouching !== "boolean" ||
				typeof payload.freeAim !== "boolean" ||
				typeof payload.sliding !== "boolean" ||
				!isWallTraversalSnapshot(payload.wallTraversal) ||
				(payload.mantle !== undefined && !isMantleSnapshot(payload.mantle)) ||
				typeof payload.weaponsFree !== "boolean" ||
				(payload.jump !== 0 && payload.jump !== 1 && payload.jump !== 2) ||
				!isJumpDirectionForImpulse(
					payload.jumpDirection,
					payload.jumpImpulse,
				) ||
				!isJumpSequence(payload.jumpSequence) ||
				payload.aimDirection.length !== 3 ||
				payload.position.length !== 3 ||
				payload.rotation.length !== 2 ||
				payload.velocity.length !== 3 ||
				!isVisorExpression(payload.visorExpression) ||
				!Number.isFinite(payload.visorStartedAt) ||
				[
					...payload.aimDirection,
					...payload.position,
					...payload.rotation,
					...payload.velocity,
				].some((value) => !Number.isFinite(value))
			)
				return
			const current = players.get(socketId)
			if (current === undefined) return
			const moveAt = performance.now()
			if (current.lifeSequence !== authoritativeLifeSequence) {
				authoritativeLifeSequence = current.lifeSequence
				authoritativeWallTraversal = INITIAL_WALL_TRAVERSAL_STATE
				authoritativeGrappleJumps = 0
				authoritativeGrappleAttachmentId = -1
				authoritativeMantle = INITIAL_MANTLE_STATE
				authoritativeCoyoteRemaining = null
				authoritativeGrounded = true
				authoritativeJump = 0
				authoritativeJumpRoute = initialAuthoritativeJumpRoute(
					current.lifeSequence,
				)
				authoritativeSliding = false
				authoritativeSurfaceSliding = false
				lastMoveAt = moveAt
			}
			const timerDelta = Math.max((moveAt - lastMoveAt) / 1_000, 0)
			const delta = Math.min(timerDelta, 0.1)
			lastMoveAt = moveAt
			const eyeHeight = payload.crouching
				? PILOT_CROUCH_EYE_HEIGHT
				: PILOT_STANDING_EYE_HEIGHT
			const reelUpdate = grapple.reel(
				socketId,
				current.position,
				payload.aimDirection,
				delta,
			)
			if (reelUpdate !== null) emitGrapple(reelUpdate)
			const grappleState = grapple.state(socketId)
			const pilotGravityScale = arenaGravityScaleAtStepStart(
				"pilot",
				current.position,
			)
			const grappleAttached =
				grappleState?.phase === "attached" &&
				grappleState.anchor !== null &&
				grappleState.ropeLength !== null
			const jumpRoute = routeAuthoritativeJumpSignal(authoritativeJumpRoute, {
				grappleAttached,
				lifeSequence: current.lifeSequence,
				reported: {
					direction: payload.jumpDirection,
					impulse: payload.jumpImpulse,
					sequence: payload.jumpSequence,
				},
			})
			authoritativeJumpRoute = jumpRoute.state
			const groundEyeHeightAt = (
				x: number,
				z: number,
				positionY: number,
			): number =>
				arenaMovementGroundAt(ARENA_SEED, x, z, positionY - eyeHeight + 0.45)
					.height + eyeHeight

			let finalPosition: [number, number, number]
			let finalVelocity: [number, number, number]
			let finalJump: 0 | 1 | 2
			let finalMantle: NonNullable<PlayerSnapshot["mantle"]> = {
				active: false,
				progress: 0,
				surfaceId: null,
			}
			let finalSliding = false
			let finalWallTraversal: PlayerSnapshot["wallTraversal"] = {
				mode: "none" as const,
				normal: [0, 0, 0] as [number, number, number],
			}

			if (grappleAttached) {
				const jumpSignal = jumpRoute.grapple!
				const grappleAnchor = grappleState.anchor!
				const grappleRopeLength = grappleState.ropeLength!
				const groundBefore = groundEyeHeightAt(
					current.position[0],
					current.position[2],
					current.position[1],
				)
				const groundedBefore = isJumpGrounded(
					{
						positionY: current.position[1],
						velocityY: current.velocity[1],
					},
					groundBefore,
				)
				if (authoritativeGrappleAttachmentId !== grappleState.attachmentId) {
					authoritativeGrappleAttachmentId = grappleState.attachmentId!
					authoritativeGrappleJumps = groundedBefore
						? 0
						: authoritativeJump === 2
							? 2
							: 1
					authoritativeMantle = INITIAL_MANTLE_STATE
					authoritativeCoyoteRemaining = null
					authoritativeSliding = false
					authoritativeSurfaceSliding = false
					authoritativeWallTraversal = INITIAL_WALL_TRAVERSAL_STATE
				}
				const grappleJump = reconcileAuthoritativeGrappleJump({
					groundedBefore,
					jumpCount: authoritativeGrappleJumps,
					requestedDirection:
						jumpSignal.direction === null ? null : [...jumpSignal.direction],
					requestedImpulse: jumpSignal.impulse,
				})
				authoritativeGrappleJumps = grappleJump.jumpCount
				const jumpPlanarImpulse =
					authoritativeGrappleJumpPlanarImpulse(grappleJump)
				const integrateGrapple = (applyGravity: boolean) => {
					if (
						grappleJump.acceptedImpulse === 2 &&
						grappleJump.acceptedDirection !== null
					)
						return stepAuthoritativeGrappleDirectionalJumpMotion(
							{
								position: {
									x: current.position[0],
									y: current.position[1],
									z: current.position[2],
								},
								velocity: {
									x: current.velocity[0],
									y: current.velocity[1],
									z: current.velocity[2],
								},
							},
							{
								anchor: {
									x: grappleAnchor[0],
									y: grappleAnchor[1],
									z: grappleAnchor[2],
								},
								delta,
								gravity: JUMP_PHYSICS.gravity * pilotGravityScale,
								instantaneousVerticalVelocity:
									grappleJump.instantaneousVerticalVelocity ??
									JUMP_PHYSICS.doubleJumpVelocity,
								planarImpulse: jumpPlanarImpulse,
								ropeLength: grappleRopeLength,
								steering: {
									x: grappleJump.acceptedDirection[0],
									y: 0,
									z: grappleJump.acceptedDirection[1],
								},
							},
						)
					return stepAuthoritativeGrappleMotion(
						{
							position: {
								x: current.position[0],
								y: current.position[1],
								z: current.position[2],
							},
							velocity: {
								x: current.velocity[0],
								y: current.velocity[1],
								z: current.velocity[2],
							},
						},
						{
							x: payload.velocity[0],
							y: payload.velocity[1],
							z: payload.velocity[2],
						},
						{
							anchor: {
								x: grappleAnchor[0],
								y: grappleAnchor[1],
								z: grappleAnchor[2],
							},
							applyGravity,
							delta,
							gravity: JUMP_PHYSICS.gravity * pilotGravityScale,
							instantaneousVerticalVelocity:
								grappleJump.instantaneousVerticalVelocity,
							maximumInputAcceleration: groundedBefore
								? GRAPPLE_AUTHORITY_GROUND_ACCELERATION
								: GRAPPLE_AUTHORITY_AIR_ACCELERATION,
							ropeLength: grappleRopeLength,
							steering: { x: 0, y: 0, z: 0 },
						},
					)
				}
				let authoritative = integrateGrapple(!groundedBefore)
				let followsGroundContour = false
				if (groundedBefore && grappleJump.acceptedImpulse === null) {
					const provisionalMotion = resolveArenaMotion(
						ARENA_SEED,
						[current.position[0], current.position[2]],
						[authoritative.position.x, authoritative.position.z],
						authoritative.position.y - 0.86,
					)
					const midpointY =
						(current.position[1] + authoritative.position.y) * 0.5
					const groundMidpoint = groundEyeHeightAt(
						(current.position[0] + provisionalMotion.x) * 0.5,
						(current.position[2] + provisionalMotion.z) * 0.5,
						midpointY,
					)
					const groundAfter = groundEyeHeightAt(
						provisionalMotion.x,
						provisionalMotion.z,
						authoritative.position.y,
					)
					const groundTransition =
						reconcileAuthoritativeGrappleGroundTransition({
							acceptedImpulse: grappleJump.acceptedImpulse,
							groundAfter,
							groundBefore,
							groundedBefore,
							groundMidpoint,
						})
					followsGroundContour = groundTransition.followsGroundContour
					if (groundTransition.applyGravity)
						authoritative = integrateGrapple(true)
				}
				const resolvedMotion = resolveArenaMotion(
					ARENA_SEED,
					[current.position[0], current.position[2]],
					[authoritative.position.x, authoritative.position.z],
					authoritative.position.y - 0.86,
				)
				finalPosition = [
					resolvedMotion.x,
					authoritative.position.y,
					resolvedMotion.z,
				]
				finalVelocity = [
					authoritative.velocity.x,
					authoritative.velocity.y,
					authoritative.velocity.z,
				]
				const groundAfter = groundEyeHeightAt(
					finalPosition[0],
					finalPosition[2],
					finalPosition[1],
				)
				if (followsGroundContour && grappleJump.acceptedImpulse === null) {
					finalPosition[1] = groundAfter
					finalVelocity[1] = 0
				}
				if (finalPosition[1] < groundAfter) {
					finalPosition[1] = groundAfter
					finalVelocity[1] = Math.max(0, finalVelocity[1])
				}
				const constrained = constrainGrappleMotion(
					{
						position: {
							x: finalPosition[0],
							y: finalPosition[1],
							z: finalPosition[2],
						},
						velocity: {
							x: finalVelocity[0],
							y: finalVelocity[1],
							z: finalVelocity[2],
						},
					},
					{
						anchor: {
							x: grappleAnchor[0],
							y: grappleAnchor[1],
							z: grappleAnchor[2],
						},
						delta: 0,
						ropeLength: grappleRopeLength,
						steering: { x: 0, y: 0, z: 0 },
					},
				)
				finalPosition = [
					constrained.position.x,
					constrained.position.y,
					constrained.position.z,
				]
				finalVelocity = [
					constrained.velocity.x,
					constrained.velocity.y,
					constrained.velocity.z,
				]
				const groundedAfter = isJumpGrounded(
					{ positionY: finalPosition[1], velocityY: finalVelocity[1] },
					groundEyeHeightAt(
						finalPosition[0],
						finalPosition[2],
						finalPosition[1],
					),
				)
				if (groundedAfter) authoritativeGrappleJumps = 0
				else if (authoritativeGrappleJumps === 0) authoritativeGrappleJumps = 1
				authoritativeJump = authoritativeGrappleJumps
				authoritativeGrounded = groundedAfter
				finalJump = authoritativeGrappleJumps
				if (
					Math.abs(payload.position[0]) > ARENA_PLAYABLE_HALF_EXTENT + 1 ||
					Math.abs(payload.position[2]) > ARENA_PLAYABLE_HALF_EXTENT + 1
				) {
					const state = grapple.detach(socketId)
					if (state !== null) emitGrapple(state)
				}
			} else {
				const jumpSignal = jumpRoute.movement!
				authoritativeGrappleAttachmentId = -1
				const requestedPosition = limitAuthoritativeTraversalDestination(
					current.position,
					payload.position,
					authoritativeTraversalSpeedLimit({
						previousSliding: authoritativeSliding,
						previousSurfaceSliding: authoritativeSurfaceSliding,
						previousWallTraversal: authoritativeWallTraversal,
					}),
					delta,
				)
				const resolvedMotion = resolveArenaMotion(
					ARENA_SEED,
					[current.position[0], current.position[2]],
					[requestedPosition[0], requestedPosition[2]],
					requestedPosition[1] - 0.86,
				)
				const movementGround = arenaMovementGroundAt(
					ARENA_SEED,
					resolvedMotion.x,
					resolvedMotion.z,
					requestedPosition[1] - eyeHeight + 0.45,
				).height
				const grounded = isJumpGrounded(
					{
						positionY: requestedPosition[1],
						velocityY: current.velocity[1],
					},
					movementGround + eyeHeight,
				)
				const mantleCandidate = payload.crouching
					? null
					: queryArenaLedge(ARENA_SEED, {
							contact: resolvedMotion.contact,
							eyeHeight,
							maximumRise: MANTLE_MAXIMUM_RISE,
							position: current.position,
							velocity: payload.velocity,
						})
				const authoritativeMovement = reconcileAuthoritativeMovement({
					contact: resolvedMotion.contact,
					coyoteDelta: timerDelta,
					crouching: payload.crouching,
					delta,
					gravityScale: pilotGravityScale,
					grounded,
					jump: payload.jump,
					jumpDirection: jumpSignal.direction,
					jumpImpulse: jumpSignal.impulse,
					mantleCandidate,
					position: current.position,
					previousCoyoteRemaining: authoritativeCoyoteRemaining,
					previousGrounded: authoritativeGrounded,
					previousJump: authoritativeJump,
					previousMantle: authoritativeMantle,
					previousSliding: authoritativeSliding,
					previousSurfaceSliding: authoritativeSurfaceSliding,
					previousVelocity: current.velocity,
					previousWallTraversal: authoritativeWallTraversal,
					reportedWallTraversal: payload.wallTraversal,
					resolvedPosition: [
						resolvedMotion.x,
						requestedPosition[1],
						resolvedMotion.z,
					],
					sliding: payload.sliding,
					terrainGradient: sampleTerrainGradient(
						(x, z) => arenaHeightAt(ARENA_SEED, x, z),
						resolvedMotion.x,
						resolvedMotion.z,
					),
					velocity: payload.velocity,
					viewDirection: horizontalViewDirectionFromYaw(payload.rotation[0]),
				})
				authoritativeWallTraversal = authoritativeMovement.traversalState
				authoritativeMantle = authoritativeMovement.mantleState
				authoritativeCoyoteRemaining = authoritativeMovement.coyoteRemaining
				authoritativeGrounded =
					grounded && authoritativeMovement.velocity[1] <= 0
				authoritativeJump = authoritativeMovement.jump
				authoritativeSliding = authoritativeMovement.sliding
				authoritativeSurfaceSliding = authoritativeMovement.surfaceSliding
				const authoritativePosition = authoritativeMovement.mantlePosition ??
					authoritativeMovement.resolvedPosition ?? [
						resolvedMotion.x,
						requestedPosition[1],
						resolvedMotion.z,
					]
				finalPosition = [...authoritativePosition]
				finalVelocity = [...authoritativeMovement.velocity]
				finalJump = authoritativeMovement.jump
				finalMantle = authoritativeMovement.mantle
				finalSliding = authoritativeMovement.sliding
				finalWallTraversal = authoritativeMovement.wallTraversal
			}

			players.set(socketId, {
				...current,
				aimDirection: payload.aimDirection,
				crouching: payload.crouching,
				dead: false,
				deathStartedAt: null,
				equippedWeapon: armory.activeWeapon(socketId),
				freeAim: payload.freeAim,
				id: socketId,
				jump: finalJump,
				lifeSequence: current.lifeSequence,
				mantle: finalMantle,
				position: finalPosition,
				recoilSequence: current.recoilSequence,
				recoilStartedAt: current.recoilStartedAt,
				reload: current.reload,
				respawnAt: null,
				rotation: payload.rotation,
				sliding: finalSliding,
				velocity: finalVelocity,
				visorExpression: payload.visorExpression,
				visorStartedAt: payload.visorStartedAt,
				wallTraversal: finalWallTraversal,
				weaponsFree: payload.weaponsFree,
			})
			reconcileStandardLocks()
		}
		const onStandardLock = (payload: unknown): void => {
			if (!playerLifecycle.isAlive(socketId)) return
			if (!standardLocks.acceptIntent(socketId, payload)) return
			reconcileStandardLocks()
		}
		const onFire = (payload: FireIntent): void => {
			if (!playerLifecycle.isAlive(socketId)) return
			const equipped = gunDefinition(armory.activeWeapon(socketId))
			if (
				equipped.fire.type !== "projectile" &&
				equipped.fire.type !== "shotgun" &&
				equipped.fire.type !== "bubbles"
			)
				return
			if (players.get(socketId)?.reload !== null) {
				if (equipped.fire.type !== "shotgun") return
				cancelPlayerReload(socketId)
			}
			const now = performance.now()
			const previous = lastPlayerFire.get(socketId) ?? Number.NEGATIVE_INFINITY
			if (
				!isFireCadenceReady(
					Number.isFinite(previous) ? previous : undefined,
					now,
					equipped.fire.serverMinimumIntervalMs,
				)
			)
				return
			if (!armory.consumeActive(socketId, equipped.fire.type)) return
			const accepted =
				equipped.fire.type === "projectile"
					? simulation.fire(socketId, payload)
					: equipped.fire.type === "shotgun"
						? simulation.fireShotgun(socketId, payload)
						: simulation.fireBubbles(socketId, payload)
			if (!accepted) {
				armory.restoreActive(socketId)
				return
			}
			lastPlayerFire.set(socketId, now)
			emitEquipment(socketId)
			const player = players.get(socketId)
			if (player !== undefined) {
				players.set(socketId, {
					...player,
					...nextAcceptedRecoilSignal(player, Date.now() / 1_000),
				})
			}
		}
		const onRailCharge = (payload: RailChargeIntent): void => {
			if (
				!playerLifecycle.isAlive(socketId) ||
				payload === null ||
				typeof payload !== "object" ||
				!Number.isSafeInteger(payload.clientChargeId) ||
				payload.clientChargeId < 0
			)
				return
			const equipped = gunDefinition(armory.activeWeapon(socketId))
			if (
				equipped.fire.type !== "ballistic" ||
				players.get(socketId)?.reload !== null
			)
				return
			if (payload.type === "start") {
				if (payload.clientChargeId <= (lastRailChargeId.get(socketId) ?? -1))
					return
				lastRailChargeId.set(socketId, payload.clientChargeId)
				railCharges.set(socketId, {
					clientChargeId: payload.clientChargeId,
					startedAt: performance.now(),
				})
				return
			}
			if (payload.type !== "release") return
			const charge = railCharges.get(socketId)
			if (
				charge === undefined ||
				charge.clientChargeId !== payload.clientChargeId
			)
				return
			railCharges.delete(socketId)
			const now = performance.now()
			if (
				!isFireCadenceReady(
					lastPlayerFire.get(socketId),
					now,
					equipped.fire.serverMinimumIntervalMs,
				) ||
				!armory.consumeActive(socketId, "ballistic")
			)
				return
			if (
				!simulation.fireRail(
					socketId,
					{
						clientShotId: payload.clientChargeId,
						direction: payload.direction,
						origin: payload.origin,
					},
					railChargeFraction(now - charge.startedAt),
				)
			) {
				armory.restoreActive(socketId)
				return
			}
			lastPlayerFire.set(socketId, now)
			emitEquipment(socketId)
			const player = players.get(socketId)
			if (player !== undefined)
				Object.assign(
					player,
					nextAcceptedRecoilSignal(player, Date.now() / 1_000),
				)
		}
		const onFireMiniMissile = (payload: MiniMissileIntent): void => {
			if (!playerLifecycle.isAlive(socketId)) return
			if (players.get(socketId)?.reload !== null) return
			const equipped = gunDefinition(armory.activeWeapon(socketId))
			if (equipped.fire.type !== "guided-missile") return
			const now = performance.now()
			const previous =
				lastPlayerMissile.get(socketId) ?? Number.NEGATIVE_INFINITY
			if (
				!isFireCadenceReady(
					Number.isFinite(previous) ? previous : undefined,
					now,
					equipped.fire.serverMinimumIntervalMs,
				) ||
				!armory.consumeMiniMissile(socketId)
			)
				return
			if (!simulation.fireMiniMissile(socketId, payload)) {
				armory.restoreMiniMissile(socketId)
				return
			}
			lastPlayerMissile.set(socketId, now)
			emitEquipment(socketId)
		}
		const onInventoryAction = (payload: unknown): void => {
			if (!playerLifecycle.isAlive(socketId)) return
			const previous = lastInventoryAction.get(socketId) ?? -1
			if (!isNewInventoryActionIntent(payload, previous)) return
			lastInventoryAction.set(socketId, payload.clientActionId)
			const before = armory.activeWeapon(socketId)
			let changed = false
			let pickupChanged = false
			switch (payload.type) {
				case "collect": {
					const player = players.get(socketId)
					changed =
						player !== undefined &&
						(payload.weapon === "mini-missile"
							? armory.collect(socketId, player.position, Date.now())
							: armory.collectArenaWeapon(
									socketId,
									payload.weapon,
									player.position,
									Date.now(),
								))
					pickupChanged = changed
					break
				}
				case "switch":
					changed = armory.switchActive(socketId, payload.direction)
					break
				case "drop-secondary":
					changed = armory.release(socketId, Date.now())
					pickupChanged = changed
					break
				case "reload":
					if (players.get(socketId)?.reload !== null) return
					const equipment = armory.equipment(socketId)
					const slot = activeEquipmentSlot(equipment)
					const player = players.get(socketId)
					if (player === undefined) return
					const reload = startReload(
						{
							ammo: slot.ammo,
							gunId: slot.weapon,
							slot: equipment.activeSlot,
						},
						Date.now() / 1_000,
					)
					if (reload === null) return
					playerReloads.set(socketId, reload)
					player.reload = reload
					changed = true
					break
			}
			if (!changed) return
			if (payload.type !== "reload") cancelPlayerReload(socketId)
			if (payload.type !== "reload") railCharges.delete(socketId)
			const after = armory.activeWeapon(socketId)
			if (payload.type === "drop-secondary")
				simulation.cancelLocksByOwner(socketId)
			if (payload.type !== "reload") emitEquipment(socketId)
			if (before !== after) reconcileStandardLocks()
			if (pickupChanged) emitPickups()
			io.emit("arena:players", [...players.values()])
		}
		const onThrowGrenade = (payload: GrenadeIntent): void => {
			if (!playerLifecycle.isAlive(socketId)) return
			const now = performance.now()
			const previous =
				lastPlayerGrenade.get(socketId) ?? Number.NEGATIVE_INFINITY
			if (now - previous < 900) return
			if (simulation.throwGrenade(socketId, payload)) {
				lastPlayerGrenade.set(socketId, now)
				gameSocket.emit(
					"arena:drone-inventory",
					simulation.droneInventory(socketId),
				)
			}
		}
		const onGrappleAction = (payload: unknown): void => {
			if (!playerLifecycle.isAlive(socketId) || !isGrappleActionIntent(payload))
				return
			const previous = lastGrappleAction.get(socketId) ?? -1
			if (payload.clientActionId <= previous) return
			lastGrappleAction.set(socketId, payload.clientActionId)
			const player = players.get(socketId)
			if (player === undefined) return
			let state: GrappleStateSnapshot | null = null
			switch (payload.type) {
				case "attach": {
					if (
						Math.hypot(
							payload.origin[0] - player.position[0],
							payload.origin[1] - player.position[1],
							payload.origin[2] - player.position[2],
						) > 2.5
					)
						return
					const directionLength = Math.hypot(...payload.direction)
					const aimLength = Math.hypot(...player.aimDirection)
					const aimAlignment =
						directionLength > 1e-6 && aimLength > 1e-6
							? (payload.direction[0] * player.aimDirection[0] +
									payload.direction[1] * player.aimDirection[1] +
									payload.direction[2] * player.aimDirection[2]) /
								(directionLength * aimLength)
							: -1
					// A 35° allowance tolerates the 20 Hz move stream without allowing a
					// client to anchor behind the server-observed reticle.
					if (aimAlignment < Math.cos((35 * Math.PI) / 180)) return
					const hit = queryArenaAnchor(
						ARENA_SEED,
						player.position,
						payload.direction,
						GRAPPLE_MAX_RANGE,
					)
					if (hit === null) return
					state = grapple.attach(
						socketId,
						player.position,
						hit,
						Date.now(),
						payload.clientActionId,
					)
					if (state !== null && state.anchor !== null) {
						const impulsed = applyGrappleAttachImpulse(
							{
								position: {
									x: player.position[0],
									y: player.position[1],
									z: player.position[2],
								},
								velocity: {
									x: player.velocity[0],
									y: player.velocity[1],
									z: player.velocity[2],
								},
							},
							{
								x: state.anchor[0],
								y: state.anchor[1],
								z: state.anchor[2],
							},
						)
						player.velocity = [
							impulsed.velocity.x,
							impulsed.velocity.y,
							impulsed.velocity.z,
						]
					}
					break
				}
				case "detach":
					state = grapple.detach(socketId)
					break
			}
			if (state === null) return
			emitGrapple(state)
			io.emit("arena:players", [...players.values()])
		}
		const onGesture = (payload: unknown): void => {
			if (!playerLifecycle.isAlive(socketId)) return
			melee.accept(socketId, payload, Date.now())
		}
		const acceptDroneAction = (payload: {
			clientActionId: number
		}): boolean => {
			if (!playerLifecycle.isAlive(socketId)) return false
			const { clientActionId } = payload
			const previous = lastDroneAction.get(socketId) ?? -1
			if (clientActionId <= previous) return false
			lastDroneAction.set(socketId, clientActionId)
			return true
		}
		const onRecoverDrone = (payload: unknown): void => {
			if (!isDroneRecoveryIntent(payload) || !acceptDroneAction(payload)) return
			if (!simulation.recoverDrone(socketId, payload.wreckId)) return
			gameSocket.emit(
				"arena:drone-inventory",
				simulation.droneInventory(socketId),
			)
		}
		const onCycleGrenade = (payload: unknown): void => {
			if (
				!isGrenadeSelectionIntent(payload) ||
				!acceptDroneAction(payload) ||
				!simulation.cycleGrenade(socketId)
			)
				return
			gameSocket.emit(
				"arena:drone-inventory",
				simulation.droneInventory(socketId),
			)
		}
		gameSocket.on("arena:move", onMove)
		gameSocket.on("arena:standard-lock", onStandardLock)
		gameSocket.on("arena:fire", onFire)
		gameSocket.on("arena:rail-charge", onRailCharge)
		gameSocket.on("arena:fire-mini-missile", onFireMiniMissile)
		gameSocket.on("arena:inventory-action", onInventoryAction)
		gameSocket.on("arena:throw-grenade", onThrowGrenade)
		gameSocket.on("arena:grapple-action", onGrappleAction)
		gameSocket.on("arena:gesture", onGesture)
		gameSocket.on("arena:recover-drone", onRecoverDrone)
		gameSocket.on("arena:cycle-grenade", onCycleGrenade)

		return () => {
			simulation.removePlayer(socketId, true)
			const grappleDisconnected = grapple.disconnect(socketId)
			emitMissileLockUpdates(armory.disconnect(socketId, Date.now()))
			emitStandardLockUpdates(standardLocks.clearPlayer(socketId))
			players.delete(socketId)
			playerSpawnSlots.delete(socketId)
			playerDamageSequences.delete(socketId)
			playerLifecycle.delete(socketId)
			playerReloads.delete(socketId)
			lastPlayerFire.delete(socketId)
			lastPlayerGrenade.delete(socketId)
			lastPlayerMissile.delete(socketId)
			railCharges.delete(socketId)
			lastRailChargeId.delete(socketId)
			lastInventoryAction.delete(socketId)
			melee.removePlayer(socketId)
			lastDroneAction.delete(socketId)
			lastGrappleAction.delete(socketId)
			emitPickups()
			if (grappleDisconnected !== null) emitGrapple(grappleDisconnected)
			io.emit("arena:players", [...players.values()])
			gameSocket.off("arena:ready", onReady)
			gameSocket.off("arena:move", onMove)
			gameSocket.off("arena:standard-lock", onStandardLock)
			gameSocket.off("arena:fire", onFire)
			gameSocket.off("arena:rail-charge", onRailCharge)
			gameSocket.off("arena:fire-mini-missile", onFireMiniMissile)
			gameSocket.off("arena:inventory-action", onInventoryAction)
			gameSocket.off("arena:throw-grenade", onThrowGrenade)
			gameSocket.off("arena:grapple-action", onGrappleAction)
			gameSocket.off("arena:gesture", onGesture)
			gameSocket.off("arena:recover-drone", onRecoverDrone)
			gameSocket.off("arena:cycle-grenade", onCycleGrenade)
		}
	},
)

let lastSimulationTick = performance.now()
setInterval(() => {
	const now = performance.now()
	const nowMs = Date.now()
	const delta = Math.min((now - lastSimulationTick) / 1_000, 0.1)
	lastSimulationTick = now
	let playersChanged = false
	for (const playerId of playerLifecycle.advance(nowMs)) {
		const spawnIndex = playerSpawnSlots.get(playerId)
		const spawn =
			spawnIndex === undefined ? undefined : PLAYER_SPAWN_POINTS[spawnIndex]
		const player = players.get(playerId)
		if (spawn === undefined || player === undefined) continue
		const [spawnX, spawnZ, spawnYaw] = spawn
		Object.assign(player, {
			aimDirection: [-Math.sin(spawnYaw), 0, -Math.cos(spawnYaw)],
			crouching: false,
			dead: false,
			deathStartedAt: null,
			emote: null,
			freeAim: false,
			jump: 0,
			mantle: { active: false, progress: 0, surfaceId: null },
			position: [
				spawnX,
				arenaHeightAt(ARENA_SEED, spawnX, spawnZ) + 1.72,
				spawnZ,
			],
			punchStartedAt: 0,
			reload: null,
			recoilStartedAt: 0,
			respawnAt: null,
			rotation: [spawnYaw, 0],
			sliding: false,
			velocity: [0, 0, 0],
			wallTraversal: { mode: "none", normal: [0, 0, 0] },
			visorExpression: "boot",
			visorStartedAt: Date.now() / 1_000,
			weaponsFree: false,
		})
		simulation.removePlayer(playerId)
		io.to(playerId).emit(
			"arena:drone-inventory",
			simulation.droneInventory(playerId),
		)
		emitMissileLockUpdates(armory.clearLocksForPlayer(playerId))
		emitStandardLockUpdates(standardLocks.clearPlayer(playerId))
		if (armory.release(playerId, nowMs)) emitPickups()
		const grappleReset = grapple.reset(playerId)
		if (grappleReset !== null) emitGrapple(grappleReset)
		armory.resetLoadout(playerId)
		playerReloads.delete(playerId)
		emitEquipment(playerId)
		lastPlayerFire.delete(playerId)
		lastPlayerGrenade.delete(playerId)
		lastPlayerMissile.delete(playerId)
		railCharges.delete(playerId)
		lastRailChargeId.delete(playerId)
		lastGrappleAction.delete(playerId)
		io.to(playerId).emit("arena:spawn", {
			damageSequence: playerDamageSequences.get(playerId) ?? 0,
			position: [spawnX, spawnZ],
			yaw: spawnYaw,
		} satisfies SpawnPayload)
		io.to(playerId).emit("arena:combat", combatSnapshot(playerId))
		playersChanged = true
	}
	for (const [playerId, reload] of playerReloads) {
		const player = players.get(playerId)
		if (player === undefined || !playerLifecycle.isAlive(playerId)) {
			playerReloads.delete(playerId)
			if (player !== undefined) player.reload = null
			continue
		}
		const step = advanceReload(reload, nowMs / 1_000)
		if (step.refill !== null && !armory.refillReload(playerId, step.refill)) {
			playerReloads.delete(playerId)
			player.reload = null
			playersChanged = true
			continue
		}
		if (step.refill !== null) emitEquipment(playerId)
		let nextState = step.state
		if (step.completed && reload.gunId === "shotgun") {
			const equipment = armory.equipment(playerId)
			const slot = equipment.slots[reload.slot]
			if (
				slot?.weapon === "shotgun" &&
				slot.ammo < gunDefinition("shotgun").magazineSize
			) {
				nextState = startReload(
					{ ammo: slot.ammo, gunId: "shotgun", slot: reload.slot },
					nowMs / 1_000,
				)
			}
		}
		if (nextState === null) playerReloads.delete(playerId)
		else playerReloads.set(playerId, nextState)
		player.reload = nextState
		if (step.refill !== null || step.completed) playersChanged = true
	}
	if (playersChanged) io.emit("arena:players", [...players.values()])
	simulation.update(delta)
	melee.update(nowMs)
	if (armory.update(nowMs)) emitPickups()
	for (const state of grapple.update(nowMs)) emitGrapple(state)
}, 1_000 / 30)

setInterval(() => {
	io.emit("arena:players", [...players.values()])
	io.emit("arena:snapshot", simulation.snapshot())
}, 50)

httpServer.listen(port, () => {
	console.log(`FEROX realtime server listening on http://localhost:${port}`)
})
