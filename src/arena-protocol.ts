import { isGunId, type GunId } from "./guns/GunDefinitions.ts"

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
	| "equippedWeapon"
	| "id"
	| "lifeSequence"
	| "recoilSequence"
	| "recoilStartedAt"
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

export type WeaponKind = GunId

export type MiniMissileTargetRef =
	| { id: number; kind: "drone" }
	| { id: string; kind: "pilot" }

export type MiniMissileIntent = {
	clientMissileId: number
	direction: Vector3Tuple
	origin: Vector3Tuple
	target?: MiniMissileTargetRef | null
}

export function isMiniMissileTargetRef(
	value: unknown,
): value is MiniMissileTargetRef {
	if (value === null || typeof value !== "object") return false
	const record = value as Record<string, unknown>
	if (!Object.keys(record).every((key) => key === "id" || key === "kind"))
		return false
	return (
		(record["kind"] === "pilot" &&
			typeof record["id"] === "string" &&
			record["id"].length > 0) ||
		(record["kind"] === "drone" &&
			Number.isSafeInteger(record["id"]) &&
			(record["id"] as number) >= 0)
	)
}

export type InventoryActionIntent =
	| { clientActionId: number; type: "collect" }
	| { clientActionId: number; direction: -1 | 1; type: "switch" }
	| { clientActionId: number; type: "drop-mini-missile" | "reload" }

export function isInventoryActionIntent(
	value: unknown,
): value is InventoryActionIntent {
	if (value === null || typeof value !== "object") return false
	const record = value as Record<string, unknown>
	if (
		!Number.isSafeInteger(record["clientActionId"]) ||
		(record["clientActionId"] as number) < 0
	)
		return false
	switch (record["type"]) {
		case "collect":
		case "drop-mini-missile":
		case "reload":
			return Object.keys(record).length === 2
		case "switch":
			return (
				Object.keys(record).length === 3 &&
				(record["direction"] === -1 || record["direction"] === 1)
			)
		default:
			return false
	}
}

export function isNewInventoryActionIntent(
	value: unknown,
	lastAcceptedId: number,
): value is InventoryActionIntent {
	return isInventoryActionIntent(value) && value.clientActionId > lastAcceptedId
}

export type MiniMissilePhase = "falling" | "powered"

export type MiniMissileSnapshot = {
	id: number
	phase: MiniMissilePhase
	position: Vector3Tuple
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

export type WeaponSlotIndex = 0 | 1

export type EquipmentSlotSnapshot = {
	ammo: number
	weapon: WeaponKind
}

export type EquipmentSlots = readonly [
	EquipmentSlotSnapshot,
	EquipmentSlotSnapshot | null,
]

export type EquipmentSnapshot = {
	activeSlot: WeaponSlotIndex
	revision: number
	slots: EquipmentSlots
}

export function activeEquipmentSlot(
	equipment: EquipmentSnapshot,
): EquipmentSlotSnapshot {
	return equipment.slots[equipment.activeSlot] ?? equipment.slots[0]
}

function isEquipmentSlotSnapshot(
	value: unknown,
): value is EquipmentSlotSnapshot {
	if (value === null || typeof value !== "object") return false
	const record = value as Record<string, unknown>
	return (
		Object.keys(record).length === 2 &&
		Object.hasOwn(record, "ammo") &&
		Object.hasOwn(record, "weapon") &&
		isGunId(record["weapon"]) &&
		Number.isSafeInteger(record["ammo"]) &&
		(record["ammo"] as number) >= 0
	)
}

export function isEquipmentSnapshot(
	value: unknown,
): value is EquipmentSnapshot {
	if (value === null || typeof value !== "object") return false
	const record = value as Record<string, unknown>
	const slots = record["slots"]
	if (!Array.isArray(slots) || slots.length !== 2) return false
	return (
		Object.keys(record).length === 3 &&
		(record["activeSlot"] === 0 || record["activeSlot"] === 1) &&
		Number.isSafeInteger(record["revision"]) &&
		(record["revision"] as number) >= 0 &&
		isEquipmentSlotSnapshot(slots[0]) &&
		slots[0].weapon === "arc-blaster" &&
		(slots[1] === null ||
			(isEquipmentSlotSnapshot(slots[1]) &&
				slots[1].weapon === "mini-missile")) &&
		slots[record["activeSlot"] as WeaponSlotIndex] !== null
	)
}

export function isNewEquipmentSnapshot(
	value: unknown,
	lastAcceptedRevision: number,
): value is EquipmentSnapshot {
	return isEquipmentSnapshot(value) && value.revision > lastAcceptedRevision
}

export type IncomingLockSnapshot = {
	attackers: number
}

export type IncomingStandardLockSnapshot = {
	attackers: number
}

export type StandardLockIntent = {
	active: boolean
	clientLockId: number
}

export function isStandardLockIntent(
	value: unknown,
): value is StandardLockIntent {
	if (value === null || typeof value !== "object") return false
	const record = value as Record<string, unknown>
	return (
		Object.keys(record).every(
			(key) => key === "active" || key === "clientLockId",
		) &&
		typeof record["active"] === "boolean" &&
		Number.isSafeInteger(record["clientLockId"]) &&
		(record["clientLockId"] as number) >= 0
	)
}

export function isNewStandardLockIntent(
	value: unknown,
	lastAcceptedId: number,
): value is StandardLockIntent {
	return isStandardLockIntent(value) && value.clientLockId > lastAcceptedId
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
