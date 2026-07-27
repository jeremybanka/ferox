import { createServer } from "node:http"

import { realtime } from "atom.io/realtime-server"
import type { UserKey } from "atom.io/realtime"
import { Server, type Socket as IoSocket } from "socket.io"

import type { CombatSnapshot, FireIntent } from "../src/arena-protocol.ts"
import {
	ARENA_SEED,
	PLAYER_SPAWN_ORDER,
	PLAYER_SPAWN_POINTS,
} from "../src/game-constants.ts"
import { ArenaSimulation } from "./ArenaSimulation.ts"

type PlayerSnapshot = {
	crouching: boolean
	freeAim: boolean
	id: string
	jump: 0 | 1 | 2
	position: [number, number, number]
	rotation: [number, number]
	sprinting: boolean
	velocity: [number, number, number]
}

type MovePayload = Omit<PlayerSnapshot, "id">
type SpawnPayload = {
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
const playerScores = new Map<string, number>()
const lastPlayerFire = new Map<string, number>()

const combatSnapshot = (playerId: string): CombatSnapshot => ({
	health: playerHealth.get(playerId) ?? 100,
	score: playerScores.get(playerId) ?? 0,
})

const simulation = new ArenaSimulation({
	emitDroneDestroyed: (snapshot) => {
		io.emit("arena:drone-destroyed", snapshot)
	},
	emitProjectile: (snapshot) => {
		io.emit("arena:projectile", snapshot)
	},
	emitProjectileEnded: (snapshot) => {
		io.emit("arena:projectile-ended", snapshot)
	},
	getPlayers: () =>
		[...players.values()].map((player) => ({
			id: player.id,
			position: player.position,
			velocity: player.velocity,
		})),
	onDroneKilled: (playerId) => {
		playerScores.set(playerId, (playerScores.get(playerId) ?? 0) + 1)
		io.to(playerId).emit("arena:combat", combatSnapshot(playerId))
	},
	onPlayerDamage: (playerId, damage) => {
		const nextHealth = Math.max(0, (playerHealth.get(playerId) ?? 100) - damage)
		if (nextHealth > 0) {
			playerHealth.set(playerId, nextHealth)
			io.to(playerId).emit("arena:combat", combatSnapshot(playerId))
			return
		}
		playerHealth.set(playerId, 100)
		playerScores.set(
			playerId,
			Math.max(0, (playerScores.get(playerId) ?? 0) - 1),
		)
		const spawnIndex = playerSpawnSlots.get(playerId)
		const spawn =
			spawnIndex === undefined ? undefined : PLAYER_SPAWN_POINTS[spawnIndex]
		if (spawn !== undefined) {
			const [spawnX, spawnZ, spawnYaw] = spawn
			io.to(playerId).emit("arena:spawn", {
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
			position: [spawnX, spawnZ],
			yaw: spawnYaw,
		} satisfies SpawnPayload
		playerSpawnSlots.set(socketId, spawnIndex)
		playerHealth.set(socketId, 100)
		playerScores.set(socketId, 0)
		players.set(socketId, {
			crouching: false,
			freeAim: false,
			id: socketId,
			jump: 0,
			position: [spawnX, 8, spawnZ],
			rotation: [spawnYaw, 0],
			sprinting: false,
			velocity: [0, 0, 0],
		})
		const onReady = (): void => {
			gameSocket.emit("arena:spawn", spawnPayload)
			gameSocket.emit("arena:combat", combatSnapshot(socketId))
			gameSocket.emit("arena:snapshot", simulation.snapshot())
		}
		gameSocket.on("arena:ready", onReady)
		onReady()
		io.emit("arena:players", [...players.values()])

		const onMove = (payload: MovePayload): void => {
			if (
				!Array.isArray(payload.position) ||
				!Array.isArray(payload.rotation) ||
				!Array.isArray(payload.velocity) ||
				payload.position.length !== 3 ||
				payload.rotation.length !== 2 ||
				payload.velocity.length !== 3 ||
				[...payload.position, ...payload.rotation, ...payload.velocity].some(
					(value) => !Number.isFinite(value),
				)
			)
				return
			players.set(socketId, { ...payload, id: socketId })
		}
		const onFire = (payload: FireIntent): void => {
			const now = performance.now()
			const previous = lastPlayerFire.get(socketId) ?? Number.NEGATIVE_INFINITY
			if (now - previous < 110) return
			if (simulation.fire(socketId, payload)) lastPlayerFire.set(socketId, now)
		}
		gameSocket.on("arena:move", onMove)
		gameSocket.on("arena:fire", onFire)

		return () => {
			players.delete(socketId)
			playerSpawnSlots.delete(socketId)
			playerHealth.delete(socketId)
			playerScores.delete(socketId)
			lastPlayerFire.delete(socketId)
			io.emit("arena:players", [...players.values()])
			gameSocket.off("arena:ready", onReady)
			gameSocket.off("arena:move", onMove)
			gameSocket.off("arena:fire", onFire)
		}
	},
)

let lastSimulationTick = performance.now()
setInterval(() => {
	const now = performance.now()
	const delta = Math.min((now - lastSimulationTick) / 1_000, 0.1)
	lastSimulationTick = now
	simulation.update(delta)
}, 1_000 / 30)

setInterval(() => {
	io.emit("arena:players", [...players.values()])
	io.emit("arena:snapshot", simulation.snapshot())
}, 50)

httpServer.listen(port, () => {
	console.log(`FEROX realtime server listening on http://localhost:${port}`)
})
