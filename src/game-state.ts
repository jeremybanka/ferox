import { atom } from "atom.io"

import { ARENA_SEED } from "./game-constants.ts"
import type { WeaponKind } from "./arena-protocol.ts"

export type GameHudState = {
	ammo: number
	connection: "connecting" | "offline" | "online"
	drones: number
	health: number
	hitMarkerClassification: "headshot" | "normal"
	hitMarkerSequence: number
	hitMarkerVisible: boolean
	incomingLocks: number
	jump: 0 | 1 | 2
	lockCountdown: number
	players: number
	reticleX: number
	reticleY: number
	recoilPulse: number
	recoilSpread: number
	score: number
	sliding: boolean
	speed: number
	targeting: "acquired" | "escaping" | "free" | "idle" | "locked" | "lost"
	weapon: WeaponKind
}

export const gameHudStateAtom = atom<GameHudState>({
	key: "gameHudState",
	default: {
		ammo: 28,
		connection: "connecting",
		drones: 0,
		health: 100,
		hitMarkerClassification: "normal",
		hitMarkerSequence: 0,
		hitMarkerVisible: false,
		incomingLocks: 0,
		jump: 0,
		lockCountdown: 0,
		players: 1,
		reticleX: 0.5,
		reticleY: 0.5,
		recoilPulse: 0,
		recoilSpread: 0,
		score: 0,
		sliding: false,
		speed: 0,
		targeting: "idle",
		weapon: "arc-blaster",
	},
})

export const arenaSeedAtom = atom<number>({
	key: "arenaSeed",
	default: ARENA_SEED,
})
