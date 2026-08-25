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
	HEAVY_LASER_CHARGE_MS,
	HEAVY_LASER_CHARGED_DAMAGE,
	HEAVY_LASER_MAGAZINE_SIZE,
	HEAVY_LASER_SERVER_MINIMUM_INTERVAL_MS,
	HEAVY_LASER_TAP_DAMAGE,
	ION_BEAM_CHARGE_MS,
	ION_BEAM_DAMAGE,
	ION_BEAM_MAGAZINE_SIZE,
	ION_BEAM_SERVER_MINIMUM_INTERVAL_MS,
	VAMP_DAMAGE,
	VAMP_FIRST_INTERVAL_MS,
	VAMP_INTERVAL_STEP_MS,
	VAMP_MAGAZINE_SIZE,
	VAMP_MINIMUM_INTERVAL_MS,
} from "../game-constants.ts"

export const GUN_IDS = [
	"arc-blaster",
	"shotgun",
	"bubble-gun",
	"rail-gun",
	"mini-missile",
	"ion-beam-rifle",
	"heavy-laser",
	"vamp",
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
		requiresLock: boolean
		pickup: boolean
		reload: boolean
	}
	fire: {
		clientCooldownSeconds: number
		serverMinimumIntervalMs: number
		type:
			| "ballistic"
			| "bubbles"
			| "guided-missile"
			| "hitscan"
			| "projectile"
			| "shotgun"
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
		| {
				chargeMs: number
				chargedDamage: number
				kind: "hitscan"
				mode: "charged"
				tapDamage: number | null
		  }
		| {
				damage: number
				firstIntervalMs: number
				intervalStepMs: number
				kind: "hitscan"
				minimumIntervalMs: number
				mode: "continuous"
		  }
}

const identityScale = [1, 1, 1] as const
const zeroRotation = [0, 0, 0] as const

export const GUN_DEFINITIONS = {
	"arc-blaster": {
		capabilities: {
			fire: true,
			pickup: false,
			reload: true,
			requiresLock: false,
		},
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
		capabilities: {
			fire: true,
			pickup: true,
			reload: true,
			requiresLock: false,
		},
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
		capabilities: {
			fire: true,
			pickup: true,
			reload: true,
			requiresLock: false,
		},
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
		capabilities: {
			fire: true,
			pickup: true,
			reload: true,
			requiresLock: false,
		},
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
		capabilities: {
			fire: true,
			pickup: true,
			reload: true,
			requiresLock: false,
		},
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
	"ion-beam-rifle": {
		capabilities: {
			fire: true,
			pickup: true,
			reload: true,
			requiresLock: true,
		},
		fire: {
			clientCooldownSeconds: 2.15,
			serverMinimumIntervalMs: ION_BEAM_SERVER_MINIMUM_INTERVAL_MS,
			type: "hitscan",
		},
		id: "ion-beam-rifle",
		magazineSize: ION_BEAM_MAGAZINE_SIZE,
		model: "ion-beam-rifle",
		name: "ION BEAM RIFLE",
		presentation: {
			firstPerson: {
				position: [0.35, -0.33, -0.75],
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
			animation: "arc-cell",
			durationSeconds: 2.6,
			refillProgress: 0.82,
		},
		tuning: {
			chargeMs: ION_BEAM_CHARGE_MS,
			chargedDamage: ION_BEAM_DAMAGE,
			kind: "hitscan",
			mode: "charged",
			tapDamage: null,
		},
	},
	"heavy-laser": {
		capabilities: {
			fire: true,
			pickup: true,
			reload: true,
			requiresLock: true,
		},
		fire: {
			clientCooldownSeconds: 0.65,
			serverMinimumIntervalMs: HEAVY_LASER_SERVER_MINIMUM_INTERVAL_MS,
			type: "hitscan",
		},
		id: "heavy-laser",
		magazineSize: HEAVY_LASER_MAGAZINE_SIZE,
		model: "heavy-laser",
		name: "HEAVY LASER",
		presentation: {
			firstPerson: {
				position: [0.35, -0.34, -0.78],
				rotation: zeroRotation,
				scale: [0.92, 0.92, 0.92],
			},
			thirdPerson: {
				position: [0, -0.1, -0.22],
				rotation: [-Math.PI / 2, 0, 0],
				scale: [0.95, 0.95, 0.95],
			},
		},
		reload: {
			ammoRule: "refill-magazine",
			animation: "mini-tube-service",
			durationSeconds: 3.1,
			refillProgress: 0.84,
		},
		tuning: {
			chargeMs: HEAVY_LASER_CHARGE_MS,
			chargedDamage: HEAVY_LASER_CHARGED_DAMAGE,
			kind: "hitscan",
			mode: "charged",
			tapDamage: HEAVY_LASER_TAP_DAMAGE,
		},
	},
	vamp: {
		capabilities: {
			fire: true,
			pickup: true,
			reload: true,
			requiresLock: true,
		},
		fire: {
			clientCooldownSeconds: VAMP_MINIMUM_INTERVAL_MS / 1_000,
			serverMinimumIntervalMs: VAMP_MINIMUM_INTERVAL_MS,
			type: "hitscan",
		},
		id: "vamp",
		magazineSize: VAMP_MAGAZINE_SIZE,
		model: "vamp",
		name: "VAMP",
		presentation: {
			firstPerson: {
				position: [0.35, -0.33, -0.75],
				rotation: zeroRotation,
				scale: [0.88, 0.88, 0.88],
			},
			thirdPerson: {
				position: [0, -0.1, -0.2],
				rotation: [-Math.PI / 2, 0, 0],
				scale: [0.92, 0.92, 0.92],
			},
		},
		reload: {
			ammoRule: "refill-magazine",
			animation: "arc-cell",
			durationSeconds: 2.5,
			refillProgress: 0.82,
		},
		tuning: {
			damage: VAMP_DAMAGE,
			firstIntervalMs: VAMP_FIRST_INTERVAL_MS,
			intervalStepMs: VAMP_INTERVAL_STEP_MS,
			kind: "hitscan",
			minimumIntervalMs: VAMP_MINIMUM_INTERVAL_MS,
			mode: "continuous",
		},
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
