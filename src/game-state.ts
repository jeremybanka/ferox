import { atom } from "atom.io"

export type GameHudState = {
	ammo: number
	connection: "connecting" | "offline" | "online"
	drones: number
	health: number
	jump: 0 | 1 | 2
	lockCountdown: number
	players: number
	reticleX: number
	reticleY: number
	score: number
	sliding: boolean
	speed: number
	targeting: "acquired" | "escaping" | "free" | "idle" | "locked" | "lost"
}

export const gameHudStateAtom = atom<GameHudState>({
	key: "gameHudState",
	default: {
		ammo: 28,
		connection: "connecting",
		drones: 0,
		health: 100,
		jump: 0,
		lockCountdown: 0,
		players: 1,
		reticleX: 0.5,
		reticleY: 0.5,
		score: 0,
		sliding: false,
		speed: 0,
		targeting: "idle",
	},
})

export const arenaSeedAtom = atom<number>({
	key: "arenaSeed",
	default: 7_431_905,
})
