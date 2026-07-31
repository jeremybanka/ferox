export type Vector3Tuple = [number, number, number]

export const VISOR_EXPRESSIONS = [
	"aim-left",
	"aim-right",
	"alarm",
	"angry",
	"boot",
	"defeated",
	"focus",
	"happy",
	"hurt",
	"neutral",
	"talk",
] as const

export type VisorExpression = (typeof VISOR_EXPRESSIONS)[number]

export function isVisorExpression(value: unknown): value is VisorExpression {
	return VISOR_EXPRESSIONS.some((expression) => expression === value)
}

export const PILOT_EMOTES = ["wave"] as const

export type PilotEmote = (typeof PILOT_EMOTES)[number]

export function isPilotEmote(value: unknown): value is PilotEmote {
	return PILOT_EMOTES.some((emote) => emote === value)
}

export type PlayerSnapshot = {
	aimDirection: Vector3Tuple
	crouching: boolean
	emote: PilotEmote | null
	emoteStartedAt: number
	equippedWeapon: WeaponKind
	freeAim: boolean
	id: string
	jump: 0 | 1 | 2
	lifeSequence: number
	position: Vector3Tuple
	recoilSequence: number
	recoilStartedAt: number
	rotation: [number, number]
	sprinting: boolean
	velocity: Vector3Tuple
	visorExpression: VisorExpression
	visorStartedAt: number
	weaponsFree: boolean
}

export type PlayerMoveSnapshot = Omit<
	PlayerSnapshot,
	"equippedWeapon" | "id" | "lifeSequence" | "recoilSequence" | "recoilStartedAt"
>

export function nextAcceptedRecoilSignal(
	current: Pick<PlayerSnapshot, "recoilSequence" | "recoilStartedAt">,
	startedAt: number,
): Pick<PlayerSnapshot, "recoilSequence" | "recoilStartedAt"> {
	return {
		recoilSequence: current.recoilSequence + 1,
		recoilStartedAt: startedAt,
	}
}

export type DronePersonality = "bully" | "coward" | "kamikaze"
export type DroneMood = "angry" | "berserk" | "haughty" | "idle" | "scared"

export type DroneSnapshot = {
	health: number
	id: number
	maxHealth: number
	mood: DroneMood
	personality: DronePersonality
	position: Vector3Tuple
	targetPlayerId: string | null
	velocity: Vector3Tuple
	yaw: number
}

export type ArenaSnapshot = {
	drones: DroneSnapshot[]
	missiles: MiniMissileSnapshot[]
	sequence: number
	serverTime: number
}

export type WeaponKind = "arc-blaster" | "mini-missile"

export type MiniMissileIntent = {
	clientMissileId: number
	direction: Vector3Tuple
	origin: Vector3Tuple
}

export type MiniMissilePhase = "falling" | "powered"

export type MiniMissileSnapshot = {
	id: number
	ownerId: string
	phase: MiniMissilePhase
	position: Vector3Tuple
	targetPlayerId: string | null
	velocity: Vector3Tuple
}

export type MiniMissileEndedSnapshot = {
	id: number
}

export type MiniMissileExplodedSnapshot = {
	id: number
	position: Vector3Tuple
	radius: number
}

export type MiniMissilePickupSnapshot = {
	available: boolean
	ownerId: string | null
	position: Vector3Tuple
	respawnAt: number | null
}

export type EquipmentSnapshot = {
	ammo: number
	weapon: WeaponKind
}

export type IncomingLockSnapshot = {
	attackers: number
}

export type FireIntent = {
	clientShotId: number
	direction: Vector3Tuple
	origin: Vector3Tuple
}

export type DirectHitClassification = "headshot" | "normal"
export type DirectHitTargetType = "drone" | "player"

export type DirectHitResult = {
	classification: DirectHitClassification
	clientShotId: number
	damage: number
	projectileId: number
	targetId: number | string
	targetType: DirectHitTargetType
}

export type PlayerDamageImpact = {
	direction: Vector3Tuple
	position: Vector3Tuple
	source: "grenade" | "kamikaze" | "mini-missile" | "projectile"
}

export type PlayerDamageSnapshot = PlayerDamageImpact & {
	damage: number
	fatal: boolean
	playerId: string
	sequence: number
	serverTime: number
}

export type GrenadeIntent = {
	clientGrenadeId: number
	direction: Vector3Tuple
	origin: Vector3Tuple
}

export type GrenadeSnapshot = {
	id: number
	origin: Vector3Tuple
	ownerId: string
	velocity: Vector3Tuple
}

export type GrenadeExplodedSnapshot = {
	id: number
	position: Vector3Tuple
	radius: number
}

export type ProjectileSnapshot = {
	color: string
	damage: number
	direction: Vector3Tuple
	id: number
	origin: Vector3Tuple
	ownerId: string | null
	team: "bot" | "player"
}

export type ProjectileEndedSnapshot = {
	id: number
}

export type DroneDestroyedSnapshot = {
	id: number
	personality: DronePersonality
	position: Vector3Tuple
	selfDestructed: boolean
}

export type CombatSnapshot = {
	health: number
	score: number
}
