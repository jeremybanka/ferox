export const ARENA_SEED = 7_431_905

export const DRONE_POPULATION_CAP = 6
export const DRONE_VISION_DISTANCE = 28
export const DRONE_VISION_HALF_ANGLE = Math.PI / 5
export const DRONE_AUDITORY_RADIUS = 14

export const PLAYER_PROJECTILE_DAMAGE = 20
export const PLAYER_HEADSHOT_MULTIPLIER = 2

export const RECOIL_BASELINE_SPREAD_RADIANS = 0.0015
export const RECOIL_PER_SHOT_INCREASE_RADIANS = 0.006
export const RECOIL_MAX_SPREAD_RADIANS = 0.045
export const RECOIL_RECOVERY_DELAY_SECONDS = 0.12
export const RECOIL_RECOVERY_SECONDS = 0.65
export const HIT_MARKER_DURATION_SECONDS = 0.18

export const GRENADE_BLAST_RADIUS = 6
export const GRENADE_BOUNCE_DAMPING = 0.8
export const GRENADE_DAMAGE_STEP = 20
export const GRENADE_DAMAGE_STEP_DISTANCE = 1
export const GRENADE_FUSE_SECONDS = 1.6
export const GRENADE_GRAVITY = 18
export const GRENADE_MAX_DAMAGE = 120
export const GRENADE_RADIUS = 0.18
export const GRENADE_RESTITUTION = 0.56
export const GRENADE_THROW_SPEED = 17

export function grenadeDamageAtDistance(distance: number): number {
	if (distance >= GRENADE_BLAST_RADIUS) return 0
	const step = Math.floor(Math.max(0, distance) / GRENADE_DAMAGE_STEP_DISTANCE)
	return Math.max(0, GRENADE_MAX_DAMAGE - step * GRENADE_DAMAGE_STEP)
}

export type PlayerSpawnPoint = readonly [x: number, z: number, yaw: number]

export const PLAYER_POPULATION_CAP = 12
export const PLAYER_SPAWN_POINTS: readonly PlayerSpawnPoint[] = Array.from(
	{ length: PLAYER_POPULATION_CAP },
	(_, index) => {
		const yaw = (index / PLAYER_POPULATION_CAP) * Math.PI * 2
		return [Math.sin(yaw) * 12, Math.cos(yaw) * 12, yaw]
	},
)
export const PLAYER_SPAWN_ORDER: readonly number[] = [
	0, 6, 3, 9, 1, 7, 4, 10, 2, 8, 5, 11,
]

export const SMART_TARGET_RADIUS_SCREEN = 0.22
export const FREE_AIM_TAP_THRESHOLD_MS = 220
export const TARGET_ESCAPE_DURATION_MS = 1_000
export const TARGET_LOST_FLASH_MS = 260
