import { atom } from "atom.io"

import { ARENA_SEED } from "./game-constants.ts"
import { DEFAULT_GUN_ID, gunDefinition } from "./guns/GunDefinitions.ts"
import type {
	EquipmentSlots,
	WeaponKind,
	WeaponSlotIndex,
} from "./arena-protocol.ts"

export type GameHudState = {
	ammo: number
	chargeProgress: number
	activeSlot: WeaponSlotIndex
	connection: "connecting" | "offline" | "online"
	dead: boolean
	drones: number
	health: number
	hitMarkerClassification: "headshot" | "normal"
	hitMarkerSequence: number
	hitMarkerVisible: boolean
	incomingMissileLocks: number
	incomingStandardLocks: number
	jump: 0 | 1 | 2
	droneGrenades: number
	droneWreckNearby: boolean
	grenadeKind: "drone" | "standard"
	grappleOwned: boolean
	grappleInvalid: boolean
	grapplePhase: "attached" | "idle"
	grapplePickupNearby: boolean
	grapplePickupStatus: "available" | "carried" | "returning"
	grapplePickupRemaining: number
	leadReticleVisible: boolean
	leadReticleX: number
	leadReticleY: number
	lockCountdown: number
	nearbyPickup: Exclude<WeaponKind, "arc-blaster"> | null
	players: number
	pickup: "available" | "carried" | "nearby" | "respawning"
	pickupProgress: number
	pickupStatuses: readonly {
		remaining: number
		status: "available" | "carried" | "returning"
		weapon: "bubble-gun" | "rail-gun" | "shotgun"
	}[]
	reticleX: number
	reticleY: number
	recoilPulse: number
	recoilSpread: number
	reloading: boolean
	reloadProgress: number
	respawnRemaining: number
	score: number
	sliding: boolean
	speed: number
	targeting: "acquired" | "escaping" | "free" | "idle" | "locked" | "lost"
	wallTraversal: "none" | "run" | "slide"
	weapon: WeaponKind
	weaponSlots: EquipmentSlots
	vehicleKind: "bike" | "jeep" | null
	vehicleNearby: boolean
	vehicleSeat: "driver" | "rider" | "shotgun" | "turret" | null
}

export const gameHudStateAtom = atom<GameHudState>({
	key: "gameHudState",
	default: {
		ammo: gunDefinition(DEFAULT_GUN_ID).magazineSize,
		chargeProgress: 0,
		activeSlot: 0,
		connection: "connecting",
		dead: false,
		drones: 0,
		health: 100,
		hitMarkerClassification: "normal",
		hitMarkerSequence: 0,
		hitMarkerVisible: false,
		incomingMissileLocks: 0,
		incomingStandardLocks: 0,
		jump: 0,
		droneGrenades: 0,
		droneWreckNearby: false,
		grenadeKind: "standard",
		grappleOwned: false,
		grappleInvalid: false,
		grapplePhase: "idle",
		grapplePickupNearby: false,
		grapplePickupStatus: "returning",
		grapplePickupRemaining: 0,
		leadReticleVisible: false,
		leadReticleX: 0.5,
		leadReticleY: 0.5,
		lockCountdown: 0,
		nearbyPickup: null,
		players: 1,
		pickup: "respawning",
		pickupProgress: 0,
		pickupStatuses: [],
		reticleX: 0.5,
		reticleY: 0.5,
		recoilPulse: 0,
		recoilSpread: 0,
		reloading: false,
		reloadProgress: 0,
		respawnRemaining: 0,
		score: 0,
		sliding: false,
		speed: 0,
		targeting: "idle",
		wallTraversal: "none",
		weapon: DEFAULT_GUN_ID,
		vehicleKind: null,
		vehicleNearby: false,
		vehicleSeat: null,
		weaponSlots: [
			{
				ammo: gunDefinition(DEFAULT_GUN_ID).magazineSize,
				weapon: DEFAULT_GUN_ID,
			},
			null,
		],
	},
})

export const arenaSeedAtom = atom<number>({
	key: "arenaSeed",
	default: ARENA_SEED,
})
