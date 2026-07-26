import { atom } from "atom.io"

export type GameHudState = {
	ammo: number
	connection: "connecting" | "offline" | "online"
	health: number
	jump: 0 | 1 | 2
	players: number
	score: number
	sliding: boolean
	speed: number
}

export const gameHudStateAtom = atom<GameHudState>({
	key: "gameHudState",
	default: {
		ammo: 28,
		connection: "connecting",
		health: 100,
		jump: 0,
		players: 1,
		score: 0,
		sliding: false,
		speed: 0,
	},
})

export const arenaSeedAtom = atom<number>({
	key: "arenaSeed",
	default: 7_431_905,
})
