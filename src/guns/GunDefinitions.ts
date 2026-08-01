import {
	MINI_MISSILE_AMMO,
	MINI_MISSILE_CLIENT_COOLDOWN_SECONDS,
	MINI_MISSILE_POWERED_SECONDS,
	MINI_MISSILE_SEEKER_RANGE,
	MINI_MISSILE_SERVER_MINIMUM_INTERVAL_MS,
	MINI_MISSILE_SPEED,
	PLAYER_PROJECTILE_DAMAGE,
} from "../game-constants.ts"

export const GUN_IDS = ["arc-blaster", "mini-missile"] as const

export type GunId = (typeof GUN_IDS)[number]
export type GunModelId = GunId
export type GunPresentationView = "firstPerson" | "thirdPerson"

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
		type: "guided-missile" | "projectile"
	}
	id: GunId
	magazineSize: number
	model: GunModelId
	name: string
	presentation: Readonly<Record<GunPresentationView, GunTransform>>
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
		tuning: { damage: PLAYER_PROJECTILE_DAMAGE, kind: "projectile" },
	},
	"mini-missile": {
		capabilities: { fire: true, pickup: true, reload: false },
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
		tuning: {
			kind: "guided-missile",
			poweredSeconds: MINI_MISSILE_POWERED_SECONDS,
			seekerRange: MINI_MISSILE_SEEKER_RANGE,
			speed: MINI_MISSILE_SPEED,
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
