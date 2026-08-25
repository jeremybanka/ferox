import {
	MINI_MISSILE_AMMO,
	MINI_MISSILE_CLIENT_COOLDOWN_SECONDS,
	MINI_MISSILE_POWERED_SECONDS,
	MINI_MISSILE_SEEKER_RANGE,
	MINI_MISSILE_SERVER_MINIMUM_INTERVAL_MS,
	MINI_MISSILE_SPEED,
	PLAYER_PROJECTILE_DAMAGE,
	BUBBLE_GUN_MAGAZINE_SIZE,
	BUBBLE_SERVER_MINIMUM_INTERVAL_MS,
	RAIL_GUN_MAGAZINE_SIZE,
	RAIL_SERVER_MINIMUM_INTERVAL_MS,
	SHOTGUN_MAGAZINE_SIZE,
	SHOTGUN_RELOAD_SHELL_SECONDS,
	SHOTGUN_SERVER_MINIMUM_INTERVAL_MS,
} from "../game-constants.ts"

export const GUN_IDS = [
	"arc-blaster",
	"shotgun",
	"bubble-gun",
	"rail-gun",
	"mini-missile",
] as const

export type GunId = (typeof GUN_IDS)[number]
export type GunModelId = GunId
export type GunPresentationView = "firstPerson" | "thirdPerson"
export type GunReloadAnimationId = "arc-cell" | "mini-tube-service"
export type GunReloadAmmoRule = "insert-shell" | "refill-magazine"

export type GunReloadDefinition = {
	ammoRule: GunReloadAmmoRule
	animation: GunReloadAnimationId
	durationSeconds: number
	refillProgress: number
}

export type GunTransform = {
	position: readonly [number, number, number]
	rotation: readonly [number, number, number]
	scale: readonly [number, number, number]
}

export type GunDefinition = {
	capabilities: {
		fire: true
		pickup: boolean
		reload: boolean
	}
	fire: {
		clientCooldownSeconds: number
		serverMinimumIntervalMs: number
		type: "ballistic" | "bubbles" | "guided-missile" | "projectile" | "shotgun"
	}
	id: GunId
	magazineSize: number
	model: GunModelId
	name: string
	presentation: Readonly<Record<GunPresentationView, GunTransform>>
	reload: GunReloadDefinition
	tuning:
		| {
				damage: number
				kind: "projectile"
		  }
		| {
				kind: "guided-missile"
				poweredSeconds: number
				seekerRange: number
				speed: number
		  }
		| { kind: "shotgun" }
		| { kind: "bubbles" }
		| { kind: "ballistic" }
}

const identityScale = [1, 1, 1] as const
const zeroRotation = [0, 0, 0] as const

export const GUN_DEFINITIONS = {
	"arc-blaster": {
		capabilities: { fire: true, pickup: false, reload: true },
		fire: {
			clientCooldownSeconds: 0.13,
			serverMinimumIntervalMs: 110,
			type: "projectile",
		},
		id: "arc-blaster",
		magazineSize: 28,
		model: "arc-blaster",
		name: "ARC BLASTER",
		presentation: {
			firstPerson: {
				position: [0.35, -0.31, -0.7],
				rotation: zeroRotation,
				scale: [0.92, 0.92, 0.78],
			},
			thirdPerson: {
				position: [0, -0.08, -0.16],
				rotation: [-Math.PI / 2, 0, 0],
				scale: identityScale,
			},
		},
		reload: {
			ammoRule: "refill-magazine",
			animation: "arc-cell",
			durationSeconds: 1.65,
			refillProgress: 0.72,
		},
		tuning: { damage: PLAYER_PROJECTILE_DAMAGE, kind: "projectile" },
	},
	"mini-missile": {
		capabilities: { fire: true, pickup: true, reload: true },
		fire: {
			clientCooldownSeconds: MINI_MISSILE_CLIENT_COOLDOWN_SECONDS,
			serverMinimumIntervalMs: MINI_MISSILE_SERVER_MINIMUM_INTERVAL_MS,
			type: "guided-missile",
		},
		id: "mini-missile",
		magazineSize: MINI_MISSILE_AMMO,
		model: "mini-missile",
		name: "MINI-MISSILE",
		presentation: {
			firstPerson: {
				position: [0.36, -0.3, -0.72],
				rotation: zeroRotation,
				scale: [1.04, 1.04, 1.04],
			},
			thirdPerson: {
				position: [0, -0.1, -0.17],
				rotation: [-Math.PI / 2, 0, 0],
				scale: [0.92, 0.92, 0.92],
			},
		},
		reload: {
			ammoRule: "refill-magazine",
			animation: "mini-tube-service",
			durationSeconds: 2.4,
			refillProgress: 0.78,
		},
		tuning: {
			kind: "guided-missile",
			poweredSeconds: MINI_MISSILE_POWERED_SECONDS,
			seekerRange: MINI_MISSILE_SEEKER_RANGE,
			speed: MINI_MISSILE_SPEED,
		},
	},
	shotgun: {
		capabilities: { fire: true, pickup: true, reload: true },
		fire: {
			clientCooldownSeconds: 0.74,
			serverMinimumIntervalMs: SHOTGUN_SERVER_MINIMUM_INTERVAL_MS,
			type: "shotgun",
		},
		id: "shotgun",
		magazineSize: SHOTGUN_MAGAZINE_SIZE,
		model: "shotgun",
		name: "BREACH SHOTGUN",
		presentation: {
			firstPerson: {
				position: [0.35, -0.32, -0.72],
				rotation: zeroRotation,
				scale: [0.9, 0.9, 0.9],
			},
			thirdPerson: {
				position: [0, -0.1, -0.2],
				rotation: [-Math.PI / 2, 0, 0],
				scale: [0.92, 0.92, 0.92],
			},
		},
		reload: {
			ammoRule: "insert-shell",
			animation: "mini-tube-service",
			durationSeconds: SHOTGUN_RELOAD_SHELL_SECONDS,
			refillProgress: 0.82,
		},
		tuning: { kind: "shotgun" },
	},
	"bubble-gun": {
		capabilities: { fire: true, pickup: true, reload: true },
		fire: {
			clientCooldownSeconds: 0.55,
			serverMinimumIntervalMs: BUBBLE_SERVER_MINIMUM_INTERVAL_MS,
			type: "bubbles",
		},
		id: "bubble-gun",
		magazineSize: BUBBLE_GUN_MAGAZINE_SIZE,
		model: "bubble-gun",
		name: "BUBBLE GUN",
		presentation: {
			firstPerson: {
				position: [0.35, -0.32, -0.72],
				rotation: zeroRotation,
				scale: [0.88, 0.88, 0.88],
			},
			thirdPerson: {
				position: [0, -0.1, -0.18],
				rotation: [-Math.PI / 2, 0, 0],
				scale: identityScale,
			},
		},
		reload: {
			ammoRule: "refill-magazine",
			animation: "arc-cell",
			durationSeconds: 2,
			refillProgress: 0.86,
		},
		tuning: { kind: "bubbles" },
	},
	"rail-gun": {
		capabilities: { fire: true, pickup: true, reload: true },
		fire: {
			clientCooldownSeconds: RAIL_SERVER_MINIMUM_INTERVAL_MS / 1_000,
			serverMinimumIntervalMs: RAIL_SERVER_MINIMUM_INTERVAL_MS,
			type: "ballistic",
		},
		id: "rail-gun",
		magazineSize: RAIL_GUN_MAGAZINE_SIZE,
		model: "rail-gun",
		name: "RAIL GUN",
		presentation: {
			firstPerson: {
				position: [0.35, -0.33, -0.74],
				rotation: zeroRotation,
				scale: [0.9, 0.9, 0.9],
			},
			thirdPerson: {
				position: [0, -0.1, -0.2],
				rotation: [-Math.PI / 2, 0, 0],
				scale: [0.92, 0.92, 0.92],
			},
		},
		reload: {
			ammoRule: "refill-magazine",
			animation: "mini-tube-service",
			durationSeconds: 2.8,
			refillProgress: 0.8,
		},
		tuning: { kind: "ballistic" },
	},
} as const satisfies Record<GunId, GunDefinition>

export const DEFAULT_GUN_ID: GunId = "arc-blaster"

export function isGunId(value: unknown): value is GunId {
	return GUN_IDS.some((id) => id === value)
}

export function gunDefinition(id: GunId): GunDefinition {
	return GUN_DEFINITIONS[id]
}

export function gunPresentation(
	id: GunId,
	view: GunPresentationView,
): GunTransform {
	return gunDefinition(id).presentation[view]
}
