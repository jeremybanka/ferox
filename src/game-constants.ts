export const ARENA_SEED = 7_431_905

export const DRONE_POPULATION_CAP = 6
export const DRONE_VISION_DISTANCE = 28
export const DRONE_VISION_HALF_ANGLE = Math.PI / 5
export const DRONE_AUDITORY_RADIUS = 14
// Soft recovery steers normally; only corrupt/extreme state beyond the hard
// threshold is repositioned to a terrain-relative point inside the leash.
export const DRONE_SOFT_LEASH_DISTANCE = 42
export const DRONE_HARD_RECOVERY_DISTANCE = 82
export const DRONE_ARENA_BOUND = 54
export const DRONE_RETURN_SPEED = 9.5
export const DRONE_WRECK_RECOVERY_RADIUS = 3
export const DRONE_WRECK_LIFETIME_SECONDS = 25
// Recovered drones are owner-friendly, expire after deployment, and are
// destroyed (with in-flight payloads) when their owner disconnects.
export const RECOVERED_DRONE_INVENTORY_CAP = 3
export const DEPLOYED_DRONE_OWNER_CAP = 2
export const DEPLOYED_DRONE_LIFETIME_SECONDS = 35
export const DRONE_PAYLOAD_ACTIVATION_DISTANCE = 10
export const DRONE_PAYLOAD_SPEED = 22
export const DRONE_PAYLOAD_LIFETIME_SECONDS = 4

// Bullies enter their orbit only after closing well inside weapon range, but
// keep it until the target clears the effective range. This hysteresis avoids
// chase/orbit chatter while bounded radial correction holds the combat band.
export const BULLY_WEAPON_EFFECTIVE_RANGE = 18
export const BULLY_ORBIT_MIN_DISTANCE = 11
export const BULLY_ORBIT_MAX_DISTANCE = 16
export const BULLY_ORBIT_ENTRY_DISTANCE = 16
export const BULLY_ORBIT_EXIT_DISTANCE = BULLY_WEAPON_EFFECTIVE_RANGE
export const BULLY_ORBIT_RADIAL_CORRECTION = 0.65
// Reverse on meaningful contact, then keep the surface latched through tiny
// solver gaps so sustained contact cannot flip the orbit every frame.
export const BULLY_ORBIT_CONTACT_INWARD_SPEED = 0.01
export const BULLY_ORBIT_CONTACT_RELEASE_SECONDS = 0.2
export const BULLY_ORBIT_SIDE_SWITCH_COOLDOWN_SECONDS = 2

export const PLAYER_PROJECTILE_DAMAGE = 20
export const PLAYER_HEADSHOT_MULTIPLIER = 2

// Additional weapon balance lives beside the existing combat constants. The
// server owns every value; clients use these only for presentation/input.
export const SHOTGUN_MAGAZINE_SIZE = 6
export const SHOTGUN_CONE_HALF_ANGLE_RADIANS = (Math.PI * 8) / 180
export const SHOTGUN_MAX_ACTIVE_PELLETS = 1_024
export const SHOTGUN_PELLET_COUNT = 20
export const SHOTGUN_PELLET_DAMAGE = 6
export const SHOTGUN_PELLET_HANG_SECONDS = 10
export const SHOTGUN_PELLET_MAX_DISTANCE = 20
export const SHOTGUN_PELLET_SPEED = 150
export const SHOTGUN_RELOAD_SHELL_SECONDS = 0.72
export const SHOTGUN_SERVER_MINIMUM_INTERVAL_MS = 720
// Eight shots (56 bubbles), a two-second refill, and 6.5 m/s travel let the
// Bubble Gun establish moving cover without the original long downtime.
export const BUBBLE_GUN_MAGAZINE_SIZE = 8
export const BUBBLES_PER_SHOT = 7
export const BUBBLE_DAMAGE = 5
export const BUBBLE_HEALTH = 80
export const BUBBLE_LIFETIME_SECONDS = 9
export const BUBBLE_RADIUS = 0.72
export const BUBBLE_SPEED = 6.5
export const BUBBLE_SERVER_MINIMUM_INTERVAL_MS = 520
export const RAIL_GUN_MAGAZINE_SIZE = 4
export const RAIL_CHARGE_MAX_MS = 1_800
// Seventy is the explicit full-charge body target. The buff is concentrated in
// partial-shot utility, cadence, a flatter/faster trajectory, and kinetic force
// instead of preserving the previous accidental 120-damage body maximum.
export const RAIL_DAMAGE_MIN = 45
export const RAIL_DAMAGE_MAX = 70
export const RAIL_GRAVITY_MIN = 2.5
export const RAIL_GRAVITY_MAX = 10
export const RAIL_SPEED_MIN = 56
export const RAIL_SPEED_MAX = 110
export const RAIL_KNOCKBACK_MIN = 8
export const RAIL_KNOCKBACK_MAX = 30
export const RAIL_SERVER_MINIMUM_INTERVAL_MS = 450
export const ION_BEAM_MAGAZINE_SIZE = 5
export const ION_BEAM_CHARGE_MS = 2_000
export const ION_BEAM_DAMAGE = 40
export const ION_BEAM_SERVER_MINIMUM_INTERVAL_MS = 2_150
export const HEAVY_LASER_MAGAZINE_SIZE = 4
export const HEAVY_LASER_CHARGE_MS = 5_000
export const HEAVY_LASER_TAP_DAMAGE = 2
export const HEAVY_LASER_CHARGED_DAMAGE = 120
export const HEAVY_LASER_SERVER_MINIMUM_INTERVAL_MS = 650
export const LOCK_HITSCAN_MAX_RANGE = 48
export const HITSCAN_BEAM_LIFETIME_SECONDS = 0.2

// Mid-arena armory pads are shared by the three standard weapon pickups. Their
// initial pad indices are distinct and every return advances to the next pad
// not reserved by another gun. Staggering and proportional return delays make
// shotgun contests frequent, Bubble Gun contests medium, and Rail contests rare.
export const ARENA_WEAPON_PICKUP_PADS: readonly (readonly [number, number])[] =
	[
		[-18, -7],
		[-9, 16],
		[8, -17],
		[18, 7],
		[0, 20],
		[-20, 9],
		[20, -9],
	]
export const ARENA_WEAPON_PICKUP_RADIUS = 2.4
export const ARENA_WEAPON_INITIAL_DELAY_MS = {
	"bubble-gun": 4_000,
	"heavy-laser": 35_000,
	"ion-beam-rifle": 30_000,
	"rail-gun": 9_000,
	shotgun: 0,
} as const
export const ARENA_WEAPON_RESPAWN_MS = {
	"bubble-gun": 11_000,
	"heavy-laser": 18_000,
	"ion-beam-rifle": 14_000,
	"rail-gun": 16_000,
	shotgun: 7_000,
} as const

export function railChargeFraction(durationMs: number): number {
	return Math.max(0, Math.min(1, durationMs / RAIL_CHARGE_MAX_MS))
}

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

// Grapple is standard pilot equipment. Attachment commits the pilot toward the
// anchor once, then the authoritative rope reels by elapsed time. Looking more
// directly at the anchor increases the bounded reel rate.
export const GRAPPLE_MAX_RANGE = 52
export const GRAPPLE_MIN_ROPE_LENGTH = 3.5
export const GRAPPLE_MAX_ATTACH_SECONDS = 8
export const GRAPPLE_ATTACH_IMPULSE = 8
export const GRAPPLE_REEL_MIN_ALIGNMENT = -0.25
export const GRAPPLE_REEL_MAX_ALIGNMENT = 0.95
export const GRAPPLE_MIN_REEL_RATE = 2.5
export const GRAPPLE_MAX_REEL_RATE = 10
export const GRAPPLE_STEERING_ACCELERATION = 8
export const GRAPPLE_TENSION_ACCELERATION = 18
export const GRAPPLE_MAX_SPEED = 32
export const GRAPPLE_AUTHORITY_AIR_ACCELERATION = 10
export const GRAPPLE_AUTHORITY_GROUND_ACCELERATION = 40
export const GRAPPLE_TRIGGER_PRESS_THRESHOLD = 0.62
export const GRAPPLE_TRIGGER_RELEASE_THRESHOLD = 0.38

// Mini-missile defaults are centralized here so playtesting can tune the weapon
// without changing protocol or simulation behavior. Powered missiles keep a
// valid designated or acquired pilot/drone target until it disappears. Only
// pilot targets produce warnings. Splash never damages the missile owner.
export const MINI_MISSILE_AMMO = 24
export const MINI_MISSILE_BLAST_RADIUS = 5
export const MINI_MISSILE_CLIENT_COOLDOWN_SECONDS = 0.18
export const MINI_MISSILE_DAMAGE = 10
export const MINI_MISSILE_GRAVITY = 13
export const MINI_MISSILE_MAX_TURN_RATE = 2.4
export const MINI_MISSILE_PICKUP_POSITION: readonly [number, number] = [0, 0]
export const MINI_MISSILE_PICKUP_RADIUS = 2.4
export const MINI_MISSILE_PICKUP_RESPAWN_SECONDS = 12
export const PICKUP_HOLD_DURATION_MS = 600
export const WEAPON_SWITCH_WHEEL_DEBOUNCE_MS = 180
export const MINI_MISSILE_POWERED_SECONDS = 10
export const MINI_MISSILE_RADIUS = 0.12
export const MINI_MISSILE_SERVER_MINIMUM_INTERVAL_MS = 150
export const MINI_MISSILE_SPEED = 14
export const MINI_MISSILE_SEEKER_HALF_ANGLE = Math.PI / 5
export const MINI_MISSILE_SEEKER_RANGE = 48
export const MINI_MISSILE_SEEKER_SCAN_SECONDS = 0.12
export const MINI_MISSILE_TRAIL_COLOR = "#ff6a00"
export const MINI_MISSILE_TRAIL_LIFETIME_SECONDS = 1.4
export const MINI_MISSILE_TRAIL_MAX_POINTS = 32
export const MINI_MISSILE_TRAIL_SAMPLE_SPACING = 0.25

export function miniMissileDamageAtDistance(distance: number): number {
	if (distance >= MINI_MISSILE_BLAST_RADIUS) return 0
	const normalized = Math.max(0, distance) / MINI_MISSILE_BLAST_RADIUS
	return MINI_MISSILE_DAMAGE * (1 - normalized)
}

export function grenadeDamageAtDistance(distance: number): number {
	if (distance >= GRENADE_BLAST_RADIUS) return 0
	const step = Math.floor(Math.max(0, distance) / GRENADE_DAMAGE_STEP_DISTANCE)
	return Math.max(0, GRENADE_MAX_DAMAGE - step * GRENADE_DAMAGE_STEP)
}

export type PlayerSpawnPoint = readonly [x: number, z: number, yaw: number]

export const PLAYER_POPULATION_CAP = 12
export const PLAYER_RESPAWN_DELAY_MS = 5_000
export const PLAYER_CROUCH_BASE_SPEED_LIMIT = 4.3
export const PLAYER_CROUCH_ACCELERATION = 18
// Standing locomotion has one acceleration/top-speed contract. Faster motion
// remains available only through traversal and external impulses.
export const PLAYER_STANDING_ACCELERATION = 31
export const PLAYER_STANDING_SPEED_LIMIT = 14.8
export const PLAYER_AIR_CONTROL_ACCELERATION = 5.5
export const PLAYER_EXTERNAL_IMPULSE_SPEED_LIMIT = 40
export const PLAYER_SLIDE_DUST_CADENCE_SECONDS = 0.14
export const PLAYER_SLIDE_DUST_LIFETIME_SECONDS = 0.52
export const PLAYER_SLIDE_DUST_BUDGET = 24
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
export const SMART_TARGET_LEAD_DEAD_ZONE_RADIANS_PER_SECOND = 0.08
export const SMART_TARGET_LEAD_MAX_SCREEN_OFFSET = 0.055
export const SMART_TARGET_LEAD_DRIVE = 2.5
export const SMART_TARGET_LEAD_SPRING = 64
export const SMART_TARGET_LEAD_DAMPING = 11.5
export const SMART_TARGET_LEAD_MAX_STEP_SECONDS = 1 / 240
export const STANDARD_LOCK_DIRECTION_COSINE = Math.cos(Math.PI / 18)
export const STANDARD_LOCK_MAX_RANGE = 48
export const FREE_AIM_TAP_THRESHOLD_MS = 220
export const TARGET_ESCAPE_DURATION_MS = 1_000
export const TARGET_LOST_FLASH_MS = 260
