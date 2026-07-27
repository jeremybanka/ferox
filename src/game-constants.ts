export const DRONE_POPULATION_CAP = 6
export const DRONE_VISION_DISTANCE = 28
export const DRONE_VISION_HALF_ANGLE = Math.PI / 5
export const DRONE_AUDITORY_RADIUS = 14

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
