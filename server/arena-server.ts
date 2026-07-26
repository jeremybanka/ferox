import { createServer } from "node:http"

import { realtime } from "atom.io/realtime-server"
import type { UserKey } from "atom.io/realtime"
import { Server, type Socket as IoSocket } from "socket.io"

type PlayerSnapshot = {
	id: string
	position: [number, number, number]
	rotation: [number, number]
}

type MovePayload = Omit<PlayerSnapshot, "id">
type BlastPayload = {
	direction: [number, number, number]
	origin: [number, number, number]
}

const port = Number(process.env["PORT"] ?? 4_317)
const httpServer = createServer((request, response) => {
	if (request.url === "/health") {
		response.writeHead(200, { "content-type": "application/json" })
		response.end(JSON.stringify({ players: players.size, status: "online" }))
		return
	}
	response.writeHead(200, { "content-type": "text/plain" })
	response.end("WAYFARER realtime arena online")
})
const io = new Server(httpServer, {
	cors: { origin: true },
	serveClient: false,
})
const players = new Map<string, PlayerSnapshot>()

realtime(
	io,
	(handshake) => {
		const username = handshake.auth["username"]
		const token = handshake.auth["token"]
		if (
			typeof username === "string" &&
			username.startsWith("user::") &&
			token === "wayfarer-local"
		) {
			return username as UserKey
		}
		return new Error("Invalid pilot credentials.")
	},
	({ socket }) => {
		const gameSocket = socket as unknown as IoSocket
		const socketId = gameSocket.id
		players.set(socketId, {
			id: socketId,
			position: [0, 8, 13],
			rotation: [Math.PI, 0],
		})
		io.emit("arena:players", [...players.values()])

		const onMove = (payload: MovePayload): void => {
			if (
				!Array.isArray(payload.position) ||
				!Array.isArray(payload.rotation) ||
				payload.position.some((value) => !Number.isFinite(value))
			)
				return
			players.set(socketId, { id: socketId, ...payload })
		}
		const onBlast = (payload: BlastPayload): void => {
			gameSocket.broadcast.emit("arena:blast", payload)
		}
		gameSocket.on("arena:move", onMove)
		gameSocket.on("arena:blast", onBlast)

		return () => {
			players.delete(socketId)
			io.emit("arena:players", [...players.values()])
			gameSocket.off("arena:move", onMove)
			gameSocket.off("arena:blast", onBlast)
		}
	},
)

setInterval(() => {
	io.emit("arena:players", [...players.values()])
}, 50)

httpServer.listen(port, () => {
	console.log(`WAYFARER realtime server listening on http://localhost:${port}`)
})
