import { createServer } from "node:http"

import { realtime } from "atom.io/realtime-server"
import type { UserKey } from "atom.io/realtime"
import { Server, type Socket as IoSocket } from "socket.io"

import {
	activeEquipmentSlot,
	isNewInventoryActionIntent,
	isPilotEmote,
	isVisorExpression,
	nextAcceptedRecoilSignal,
	type CombatSnapshot,
	type FireIntent,
	type GrenadeIntent,
	type MiniMissileIntent,
	type PlayerMoveSnapshot,
	type PlayerDamageSnapshot,
	type PlayerSnapshot,
} from "../src/arena-protocol.ts"
import { arenaHeightAt } from "../src/arena-terrain.ts"
import {
	ARENA_SEED,
	MINI_MISSILE_PICKUP_POSITION,
	PLAYER_SPAWN_ORDER,
	PLAYER_SPAWN_POINTS,
} from "../src/game-constants.ts"
import { DEFAULT_GUN_ID, gunDefinition } from "../src/guns/GunDefinitions.ts"
import { ArenaSimulation } from "./ArenaSimulation.ts"
import { isFireCadenceReady } from "./FireCadence.ts"
import { MiniMissileArmory, type LockUpdate } from "./MiniMissileArmory.ts"
import {
	StandardLockTracker,
	type StandardLockUpdate,
} from "./StandardLockTracker.ts"
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
const playerHealth = new Map<string, number>()
const playerDamageSequences = new Map<string, number>()
const playerLifeSequences = new Map<string, number>()
const playerScores = new Map<string, number>()
const lastPlayerFire = new Map<string, number>()
const lastPlayerGrenade = new Map<string, number>()
const lastPlayerMissile = new Map<string, number>()
const lastInventoryAction = new Map<string, number>()
const [pickupX, pickupZ] = MINI_MISSILE_PICKUP_POSITION
const armory = new MiniMissileArmory([
	pickupX,
	arenaHeightAt(ARENA_SEED, pickupX, pickupZ) + 0.72,
	pickupZ,
])
const standardLocks = new StandardLockTracker()

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

const emitEquipment = (playerId: string): void => {
	const equipment = armory.equipment(playerId)
	io.to(playerId).emit("arena:equipment", equipment)
	const player = players.get(playerId)
	if (player !== undefined)
		player.equippedWeapon = activeEquipmentSlot(equipment).weapon
}

const emitPickup = (): void => {
	io.emit("arena:mini-missile-pickup", armory.pickup())
}

const combatSnapshot = (playerId: string): CombatSnapshot => ({
	health: playerHealth.get(playerId) ?? 100,
	score: playerScores.get(playerId) ?? 0,
})

const simulation = new ArenaSimulation({
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
		[...players.values()].map((player) => ({
			crouching: player.crouching,
			id: player.id,
			position: player.position,
			velocity: player.velocity,
		})),
	onDirectHit: (playerId, result) => {
		io.to(playerId).emit("arena:direct-hit", result)
	},
	onDroneKilled: (playerId) => {
		playerScores.set(playerId, (playerScores.get(playerId) ?? 0) + 1)
		io.to(playerId).emit("arena:combat", combatSnapshot(playerId))
	},
	onLockChanged: (attackerId, targetId, locked) => {
		emitMissileLockUpdates(armory.setLock(attackerId, targetId, locked))
	},
	onPlayerDamage: (playerId, damage, impact) => {
		const currentHealth = playerHealth.get(playerId) ?? 100
		const nextHealth = Math.max(0, currentHealth - damage)
		const appliedDamage = currentHealth - nextHealth
		if (appliedDamage <= 0) return
		const sequence = (playerDamageSequences.get(playerId) ?? 0) + 1
		playerDamageSequences.set(playerId, sequence)
		io.emit("arena:player-damaged", {
			...impact,
			damage: appliedDamage,
			fatal: nextHealth <= 0,
			playerId,
			sequence,
			serverTime: Date.now() / 1_000,
		} satisfies PlayerDamageSnapshot)
		if (nextHealth > 0) {
			playerHealth.set(playerId, nextHealth)
			io.to(playerId).emit("arena:combat", combatSnapshot(playerId))
			return
		}
		playerHealth.set(playerId, 100)
		const lifeSequence = (playerLifeSequences.get(playerId) ?? 0) + 1
		playerLifeSequences.set(playerId, lifeSequence)
		const player = players.get(playerId)
		if (player !== undefined) players.set(playerId, { ...player, lifeSequence })
		playerScores.set(
			playerId,
			Math.max(0, (playerScores.get(playerId) ?? 0) - 1),
		)
		simulation.removePlayer(playerId)
		emitMissileLockUpdates(armory.clearLocksForPlayer(playerId))
		emitStandardLockUpdates(standardLocks.clearPlayer(playerId))
		if (armory.release(playerId, Date.now())) emitPickup()
		emitEquipment(playerId)
		const spawnIndex = playerSpawnSlots.get(playerId)
		const spawn =
			spawnIndex === undefined ? undefined : PLAYER_SPAWN_POINTS[spawnIndex]
		if (spawn !== undefined) {
			const [spawnX, spawnZ, spawnYaw] = spawn
			const player = players.get(playerId)
			if (player !== undefined) {
				player.aimDirection = [-Math.sin(spawnYaw), 0, -Math.cos(spawnYaw)]
				player.crouching = false
				player.freeAim = false
				player.position = [spawnX, 8, spawnZ]
				player.rotation = [spawnYaw, 0]
				player.sprinting = false
			}
			io.to(playerId).emit("arena:spawn", {
				damageSequence: sequence,
				position: [spawnX, spawnZ],
				yaw: spawnYaw,
			} satisfies SpawnPayload)
		}
		io.to(playerId).emit("arena:combat", combatSnapshot(playerId))
	},
	seed: ARENA_SEED,
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
		playerHealth.set(socketId, 100)
		playerLifeSequences.set(socketId, 0)
		playerScores.set(socketId, 0)
		players.set(socketId, {
			aimDirection: [-Math.sin(spawnYaw), 0, -Math.cos(spawnYaw)],
			crouching: false,
			emote: null,
			emoteStartedAt: 0,
			equippedWeapon: DEFAULT_GUN_ID,
			freeAim: false,
			id: socketId,
			jump: 0,
			lifeSequence: 0,
			position: [spawnX, 8, spawnZ],
			recoilSequence: 0,
			recoilStartedAt: 0,
			rotation: [spawnYaw, 0],
			sprinting: false,
			velocity: [0, 0, 0],
			visorExpression: "boot",
			visorStartedAt: Date.now() / 1_000,
			weaponsFree: false,
		})
		armory.connect(socketId)
		const onReady = (): void => {
			gameSocket.emit("arena:spawn", {
				...spawnPayload,
				damageSequence: playerDamageSequences.get(socketId) ?? 0,
			})
			gameSocket.emit("arena:combat", combatSnapshot(socketId))
			gameSocket.emit("arena:snapshot", simulation.snapshot())
			gameSocket.emit("arena:equipment", armory.equipment(socketId))
			gameSocket.emit("arena:mini-missile-pickup", armory.pickup())
			gameSocket.emit("arena:incoming-lock", armory.incoming(socketId))
			gameSocket.emit(
				"arena:incoming-standard-lock",
				standardLocks.incoming(socketId),
			)
		}
		gameSocket.on("arena:ready", onReady)
		onReady()
		io.emit("arena:players", [...players.values()])

		const onMove = (payload: PlayerMoveSnapshot): void => {
			if (
				!Array.isArray(payload.aimDirection) ||
				!Array.isArray(payload.position) ||
				!Array.isArray(payload.rotation) ||
				!Array.isArray(payload.velocity) ||
				typeof payload.crouching !== "boolean" ||
				typeof payload.freeAim !== "boolean" ||
				(payload.jump !== 0 && payload.jump !== 1 && payload.jump !== 2) ||
				typeof payload.sprinting !== "boolean" ||
				typeof payload.weaponsFree !== "boolean" ||
				(payload.emote !== null && !isPilotEmote(payload.emote)) ||
				!Number.isFinite(payload.emoteStartedAt) ||
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
			players.set(socketId, {
				...payload,
				equippedWeapon: armory.activeWeapon(socketId),
				id: socketId,
				lifeSequence: current?.lifeSequence ?? 0,
				recoilSequence: current?.recoilSequence ?? 0,
				recoilStartedAt: current?.recoilStartedAt ?? 0,
			})
			emitStandardLockUpdates(standardLocks.reconcile(players))
		}
		const onStandardLock = (payload: unknown): void => {
			if (!standardLocks.acceptIntent(socketId, payload)) return
			emitStandardLockUpdates(standardLocks.reconcile(players))
		}
		const onFire = (payload: FireIntent): void => {
			const equipped = gunDefinition(armory.activeWeapon(socketId))
			if (equipped.fire.type !== "projectile") return
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
			if (!armory.consumeActive(socketId, "projectile")) return
			if (!simulation.fire(socketId, payload)) {
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
		const onFireMiniMissile = (payload: MiniMissileIntent): void => {
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
						player !== undefined && armory.collect(socketId, player.position)
					pickupChanged = changed
					break
				}
				case "switch":
					changed = armory.switchActive(socketId, payload.direction)
					break
				case "drop-mini-missile":
					changed = armory.release(socketId, Date.now())
					pickupChanged = changed
					break
				case "reload":
					changed = armory.reloadActive(socketId)
					break
			}
			if (!changed) return
			const after = armory.activeWeapon(socketId)
			if (payload.type === "drop-mini-missile")
				simulation.cancelLocksByOwner(socketId)
			emitEquipment(socketId)
			if (before !== after)
				emitStandardLockUpdates(standardLocks.reconcile(players))
			if (pickupChanged) emitPickup()
			io.emit("arena:players", [...players.values()])
		}
		const onThrowGrenade = (payload: GrenadeIntent): void => {
			const now = performance.now()
			const previous =
				lastPlayerGrenade.get(socketId) ?? Number.NEGATIVE_INFINITY
			if (now - previous < 900) return
			if (simulation.throwGrenade(socketId, payload)) {
				lastPlayerGrenade.set(socketId, now)
			}
		}
		gameSocket.on("arena:move", onMove)
		gameSocket.on("arena:standard-lock", onStandardLock)
		gameSocket.on("arena:fire", onFire)
		gameSocket.on("arena:fire-mini-missile", onFireMiniMissile)
		gameSocket.on("arena:inventory-action", onInventoryAction)
		gameSocket.on("arena:throw-grenade", onThrowGrenade)

		return () => {
			simulation.removePlayer(socketId)
			emitMissileLockUpdates(armory.disconnect(socketId, Date.now()))
			emitStandardLockUpdates(standardLocks.clearPlayer(socketId))
			players.delete(socketId)
			playerSpawnSlots.delete(socketId)
			playerDamageSequences.delete(socketId)
			playerHealth.delete(socketId)
			playerLifeSequences.delete(socketId)
			playerScores.delete(socketId)
			lastPlayerFire.delete(socketId)
			lastPlayerGrenade.delete(socketId)
			lastPlayerMissile.delete(socketId)
			lastInventoryAction.delete(socketId)
			emitPickup()
			io.emit("arena:players", [...players.values()])
			gameSocket.off("arena:ready", onReady)
			gameSocket.off("arena:move", onMove)
			gameSocket.off("arena:standard-lock", onStandardLock)
			gameSocket.off("arena:fire", onFire)
			gameSocket.off("arena:fire-mini-missile", onFireMiniMissile)
			gameSocket.off("arena:inventory-action", onInventoryAction)
			gameSocket.off("arena:throw-grenade", onThrowGrenade)
		}
	},
)

let lastSimulationTick = performance.now()
setInterval(() => {
	const now = performance.now()
	const delta = Math.min((now - lastSimulationTick) / 1_000, 0.1)
	lastSimulationTick = now
	simulation.update(delta)
	if (armory.update(Date.now())) emitPickup()
}, 1_000 / 30)

setInterval(() => {
	io.emit("arena:players", [...players.values()])
	io.emit("arena:snapshot", simulation.snapshot())
}, 50)

httpServer.listen(port, () => {
	console.log(`FEROX realtime server listening on http://localhost:${port}`)
})
