import { isGunId, type GunId } from "./guns/GunDefinitions.ts"
import { isBoundedDirectionalJumpDirection } from "./DirectionalJumpPhysics.ts"

export type Vector3Tuple = [number, number, number]

export type VehicleKind = "bike" | "jeep"
export type VehicleSeatId = "driver" | "rider" | "shotgun" | "turret"

export type VehicleSeatSnapshot = Readonly<{
	id: VehicleSeatId
	occupantId: string | null
}>

export type VehicleSnapshot = Readonly<{
	afterburner: boolean
	airborne: boolean
	id: string
	kind: VehicleKind
	lean: number
	pitch: number
	position: Vector3Tuple
	revision: number
	seats: readonly VehicleSeatSnapshot[]
	turretFireSequence: number
	turretPitch: number
	turretYaw: number
	velocity: Vector3Tuple
	yaw: number
}>

export type NapalmHazardSnapshot = Readonly<{
	expiresAt: number
	id: number
	ownerId: string
	position: Vector3Tuple
	radius: number
}>

export type VehicleSeatIntent = Readonly<{
	clientActionId: number
	seatId?: VehicleSeatId
	type: "enter" | "exit" | "switch"
	vehicleId?: string
}>

export type VehicleControlIntent = Readonly<{
	afterburner: boolean
	brake: boolean
	clientInputId: number
	steering: number
	throttle: number
	vehicleId: string
}>

export type VehicleTurretIntent = Readonly<{
	clientInputId: number
	direction: Vector3Tuple
	fire: boolean
	vehicleId: string
}>

const VEHICLE_SEAT_IDS: readonly VehicleSeatId[] = [
	"driver",
	"rider",
	"shotgun",
	"turret",
]

export function isVehicleSeatIntent(
	value: unknown,
): value is VehicleSeatIntent {
	if (value === null || typeof value !== "object") return false
	const record = value as Record<string, unknown>
	if (
		!Number.isSafeInteger(record["clientActionId"]) ||
		(record["clientActionId"] as number) < 0 ||
		(record["type"] !== "enter" &&
			record["type"] !== "exit" &&
			record["type"] !== "switch")
	)
		return false
	if (record["type"] === "exit") return Object.keys(record).length === 2
	return (
		typeof record["vehicleId"] === "string" &&
		VEHICLE_SEAT_IDS.some((seat) => seat === record["seatId"]) &&
		Object.keys(record).length === 4
	)
}

export function isVehicleControlIntent(
	value: unknown,
): value is VehicleControlIntent {
	if (value === null || typeof value !== "object") return false
	const record = value as Record<string, unknown>
	return (
		Object.keys(record).length === 6 &&
		typeof record["vehicleId"] === "string" &&
		Number.isSafeInteger(record["clientInputId"]) &&
		(record["clientInputId"] as number) >= 0 &&
		typeof record["afterburner"] === "boolean" &&
		typeof record["brake"] === "boolean" &&
		typeof record["steering"] === "number" &&
		Math.abs(record["steering"] as number) <= 1 &&
		typeof record["throttle"] === "number" &&
		Math.abs(record["throttle"] as number) <= 1
	)
}

export function isVehicleTurretIntent(
	value: unknown,
): value is VehicleTurretIntent {
	if (value === null || typeof value !== "object") return false
	const record = value as Record<string, unknown>
	return (
		Object.keys(record).length === 4 &&
		typeof record["vehicleId"] === "string" &&
		Number.isSafeInteger(record["clientInputId"]) &&
		(record["clientInputId"] as number) >= 0 &&
		typeof record["fire"] === "boolean" &&
		isVector3Tuple(record["direction"]) &&
		(record["direction"] as number[]).reduce(
			(sum, component) => sum + component * component,
			0,
		) >= 0.8 &&
		(record["direction"] as number[]).reduce(
			(sum, component) => sum + component * component,
			0,
		) <= 1.2
	)
}

export type WallTraversalSnapshot = Readonly<{
	mode: "none" | "run" | "slide"
	normal: Vector3Tuple
}>

export type MantleSnapshot = Readonly<{
	active: boolean
	progress: number
	surfaceId: string | null
}>

export const NO_MANTLE_SNAPSHOT: MantleSnapshot = {
	active: false,
	progress: 0,
	surfaceId: null,
}

export function isMantleSnapshot(value: unknown): value is MantleSnapshot {
	if (value === null || typeof value !== "object") return false
	const record = value as Record<string, unknown>
	return (
		Object.keys(record).length === 3 &&
		typeof record["active"] === "boolean" &&
		typeof record["progress"] === "number" &&
		Number.isFinite(record["progress"]) &&
		(record["progress"] as number) >= 0 &&
		(record["progress"] as number) <= 1 &&
		(record["surfaceId"] === null || typeof record["surfaceId"] === "string")
	)
}

export function isWallTraversalSnapshot(
	value: unknown,
): value is WallTraversalSnapshot {
	if (value === null || typeof value !== "object") return false
	const record = value as Record<string, unknown>
	return (
		Object.keys(record).length === 2 &&
		(record["mode"] === "none" ||
			record["mode"] === "run" ||
			record["mode"] === "slide") &&
		Array.isArray(record["normal"]) &&
		record["normal"].length === 3 &&
		record["normal"].every(Number.isFinite)
	)
}

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

export const PILOT_EMOTES = ["wave", "salute", "fistbump"] as const

export type PilotEmote = (typeof PILOT_EMOTES)[number]

export function isPilotEmote(value: unknown): value is PilotEmote {
	return PILOT_EMOTES.some((emote) => emote === value)
}

export type PlayerSnapshot = {
	aimDirection: Vector3Tuple
	crouching: boolean
	dead: boolean
	deathStartedAt: number | null
	emote: PilotEmote | null
	emoteStartedAt: number
	equippedWeapon: WeaponKind
	freeAim: boolean
	id: string
	jump: 0 | 1 | 2
	mantle?: MantleSnapshot
	lifeSequence: number
	position: Vector3Tuple
	punchSequence: number
	punchStartedAt: number
	recoilSequence: number
	recoilStartedAt: number
	reload: ReloadSnapshot | null
	respawnAt: number | null
	rotation: [number, number]
	sliding: boolean
	sprinting: boolean
	velocity: Vector3Tuple
	wallTraversal: WallTraversalSnapshot
	visorExpression: VisorExpression
	visorStartedAt: number
	weaponsFree: boolean
}

export type JumpImpulse = 1 | 2 | null
export type JumpDirection = [number, number] | null

export type PlayerMoveSnapshot = Omit<
	PlayerSnapshot,
	| "dead"
	| "deathStartedAt"
	| "equippedWeapon"
	| "emote"
	| "emoteStartedAt"
	| "id"
	| "lifeSequence"
	| "recoilSequence"
	| "recoilStartedAt"
	| "reload"
	| "respawnAt"
	| "punchSequence"
	| "punchStartedAt"
> & {
	/** One-shot edge; null also covers non-impulse ledge departure. */
	jumpImpulse: JumpImpulse
	/** World-space [x,z] direction, present only for a double-jump edge. */
	jumpDirection: JumpDirection
	/** Monotonic per-life sequence; reset on spawn and incremented per impulse. */
	jumpSequence: number
}

export function isJumpImpulse(value: unknown): value is JumpImpulse {
	return value === null || value === 1 || value === 2
}

export function isJumpDirection(value: unknown): value is JumpDirection {
	return (
		value === null ||
		(Array.isArray(value) &&
			value.length === 2 &&
			value.every(Number.isFinite) &&
			isBoundedDirectionalJumpDirection({
				x: value[0] as number,
				z: value[1] as number,
			}))
	)
}

export function isJumpDirectionForImpulse(
	direction: unknown,
	impulse: unknown,
): direction is JumpDirection {
	return (
		isJumpImpulse(impulse) &&
		isJumpDirection(direction) &&
		((impulse === 2 && direction !== null) ||
			(impulse !== 2 && direction === null))
	)
}

export function isJumpSequence(value: unknown): value is number {
	return Number.isSafeInteger(value) && (value as number) >= 0
}

export type GrapplePhase = "attached" | "idle"

export type GrapplePickupSnapshot = Readonly<{
	available: boolean
	availableAt: number | null
	ownerId: string | null
	position: Vector3Tuple
}>

export type GrappleStateSnapshot = Readonly<{
	anchor: Vector3Tuple | null
	attachedAt: number | null
	ownerId: string | null
	phase: GrapplePhase
	ropeLength: number | null
	sequence: number
	surfaceId: string | null
}>

export type GrappleActionIntent =
	| Readonly<{ clientActionId: number; type: "collect" | "detach" | "drop" }>
	| Readonly<{
			clientActionId: number
			direction: Vector3Tuple
			origin: Vector3Tuple
			type: "attach"
	  }>

const isVector3Tuple = (value: unknown): value is Vector3Tuple =>
	Array.isArray(value) &&
	value.length === 3 &&
	value.every((component) => Number.isFinite(component))

export function isGrappleActionIntent(
	value: unknown,
): value is GrappleActionIntent {
	if (value === null || typeof value !== "object") return false
	const record = value as Record<string, unknown>
	if (
		!Number.isSafeInteger(record["clientActionId"]) ||
		(record["clientActionId"] as number) < 0
	)
		return false
	if (
		record["type"] === "collect" ||
		record["type"] === "detach" ||
		record["type"] === "drop"
	)
		return Object.keys(record).length === 2
	return (
		record["type"] === "attach" &&
		Object.keys(record).length === 4 &&
		isVector3Tuple(record["direction"]) &&
		isVector3Tuple(record["origin"])
	)
}

export function isGrapplePickupSnapshot(
	value: unknown,
): value is GrapplePickupSnapshot {
	if (value === null || typeof value !== "object") return false
	const record = value as Record<string, unknown>
	return (
		Object.keys(record).length === 4 &&
		typeof record["available"] === "boolean" &&
		(record["availableAt"] === null ||
			Number.isFinite(record["availableAt"])) &&
		(record["ownerId"] === null || typeof record["ownerId"] === "string") &&
		isVector3Tuple(record["position"])
	)
}

export function isGrappleStateSnapshot(
	value: unknown,
): value is GrappleStateSnapshot {
	if (value === null || typeof value !== "object") return false
	const record = value as Record<string, unknown>
	if (
		Object.keys(record).length !== 7 ||
		!Number.isSafeInteger(record["sequence"]) ||
		(record["sequence"] as number) < 0 ||
		(record["phase"] !== "idle" && record["phase"] !== "attached") ||
		(record["ownerId"] !== null && typeof record["ownerId"] !== "string") ||
		(record["surfaceId"] !== null && typeof record["surfaceId"] !== "string") ||
		(record["attachedAt"] !== null && !Number.isFinite(record["attachedAt"])) ||
		(record["ropeLength"] !== null &&
			(!Number.isFinite(record["ropeLength"]) ||
				(record["ropeLength"] as number) <= 0)) ||
		(record["anchor"] !== null && !isVector3Tuple(record["anchor"]))
	)
		return false
	return record["phase"] === "idle"
		? record["anchor"] === null &&
				record["attachedAt"] === null &&
				record["ropeLength"] === null &&
				record["surfaceId"] === null
		: record["anchor"] !== null &&
				record["attachedAt"] !== null &&
				record["ownerId"] !== null &&
				record["ropeLength"] !== null &&
				record["surfaceId"] !== null
}

export const GESTURE_ACTIONS = ["wave", "salute", "fistbump", "punch"] as const
export type GestureAction = (typeof GESTURE_ACTIONS)[number]

export type GestureIntent = {
	clientActionId: number
	type: GestureAction
}

export function isGestureIntent(value: unknown): value is GestureIntent {
	if (value === null || typeof value !== "object") return false
	const record = value as Record<string, unknown>
	return (
		Object.keys(record).length === 2 &&
		Number.isSafeInteger(record["clientActionId"]) &&
		(record["clientActionId"] as number) >= 0 &&
		GESTURE_ACTIONS.some((action) => action === record["type"])
	)
}

export type MeleeHitResult = {
	actionId: number
	attackerId: string
	classification: "assassination" | "punch"
	damage: number
	position: Vector3Tuple
	serverTime: number
	targetId: string
}

export type FistContactResult = {
	actionIds: readonly [number, number]
	id: number
	kind: "fistbump" | "punch-bump"
	participantIds: readonly [string, string]
	position: Vector3Tuple
	serverTime: number
}

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
	ownerId: string | null
	personality: DronePersonality
	position: Vector3Tuple
	targetPlayerId: string | null
	velocity: Vector3Tuple
	yaw: number
}

export type ArenaSnapshot = {
	ballistics: BallisticSnapshot[]
	bubbles: BubbleSnapshot[]
	drones: DroneSnapshot[]
	dronePayloads: DronePayloadSnapshot[]
	droneWrecks: DroneWreckSnapshot[]
	missiles: MiniMissileSnapshot[]
	napalmHazards?: NapalmHazardSnapshot[]
	sequence: number
	serverTime: number
	vehicles?: VehicleSnapshot[]
}

export type DroneWreckSnapshot = {
	id: number
	personality: DronePersonality
	position: Vector3Tuple
}

export type DronePayloadSnapshot = {
	id: number
	ownerId: string
	position: Vector3Tuple
	rotation: number
	velocity: Vector3Tuple
}

export type GrenadeKind = "drone" | "standard"

export type DroneInventorySnapshot = {
	count: number
	selected: GrenadeKind
}

export type DroneRecoveryIntent = {
	clientActionId: number
	wreckId: number
}

export function isDroneRecoveryIntent(
	value: unknown,
): value is DroneRecoveryIntent {
	if (value === null || typeof value !== "object") return false
	const record = value as Record<string, unknown>
	return (
		Object.keys(record).length === 2 &&
		Number.isSafeInteger(record["clientActionId"]) &&
		(record["clientActionId"] as number) >= 0 &&
		Number.isSafeInteger(record["wreckId"]) &&
		(record["wreckId"] as number) >= 0
	)
}

export type GrenadeSelectionIntent = {
	clientActionId: number
}

export function isGrenadeSelectionIntent(
	value: unknown,
): value is GrenadeSelectionIntent {
	if (value === null || typeof value !== "object") return false
	const record = value as Record<string, unknown>
	return (
		Object.keys(record).length === 1 &&
		Number.isSafeInteger(record["clientActionId"]) &&
		(record["clientActionId"] as number) >= 0
	)
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
	| {
			clientActionId: number
			type: "collect"
			weapon: Exclude<GunId, "arc-blaster">
	  }
	| { clientActionId: number; direction: -1 | 1; type: "switch" }
	| { clientActionId: number; type: "drop-secondary" | "reload" }

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
		case "drop-secondary":
		case "reload":
			return Object.keys(record).length === 2
		case "collect":
			return (
				Object.keys(record).length === 3 &&
				isGunId(record["weapon"]) &&
				record["weapon"] !== "arc-blaster"
			)
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

export type ArenaWeaponPickupSnapshot = {
	available: boolean
	availableAt: number | null
	ownerId: string | null
	position: Vector3Tuple
	weapon: "bubble-gun" | "rail-gun" | "shotgun"
}

export type WeaponSlotIndex = 0 | 1

export type ReloadSnapshot = {
	completesAt: number
	gunId: WeaponKind
	refillAt: number
	refilled: boolean
	slot: WeaponSlotIndex
	startedAt: number
}

export function isReloadSnapshot(value: unknown): value is ReloadSnapshot {
	if (value === null || typeof value !== "object") return false
	const record = value as Record<string, unknown>
	if (
		!Object.keys(record).every((key) =>
			[
				"completesAt",
				"gunId",
				"refillAt",
				"refilled",
				"slot",
				"startedAt",
			].includes(key),
		) ||
		Object.keys(record).length !== 6 ||
		!isGunId(record["gunId"]) ||
		(record["slot"] !== 0 && record["slot"] !== 1) ||
		typeof record["refilled"] !== "boolean" ||
		!Number.isFinite(record["startedAt"]) ||
		!Number.isFinite(record["refillAt"]) ||
		!Number.isFinite(record["completesAt"])
	)
		return false
	return (
		(record["startedAt"] as number) <= (record["refillAt"] as number) &&
		(record["refillAt"] as number) <= (record["completesAt"] as number)
	)
}

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
		(slots[1] === null || isEquipmentSlotSnapshot(slots[1])) &&
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

export type RailChargeIntent =
	| { clientChargeId: number; type: "start" }
	| {
			clientChargeId: number
			direction: Vector3Tuple
			origin: Vector3Tuple
			type: "release"
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
	source:
		| "ballistic"
		| "bubble"
		| "grenade"
		| "kamikaze"
		| "melee"
		| "mini-missile"
		| "projectile"
		| "napalm"
		| "vehicle-turret"
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
	kind: GrenadeKind
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
	lifetimeSeconds: number
	origin: Vector3Tuple
	ownerId: string | null
	speed: number
	team: "bot" | "player"
}

export type ProjectileEndedSnapshot = {
	id: number
}

export type BubbleSnapshot = {
	health: number
	id: number
	ownerId: string
	position: Vector3Tuple
	radius: number
	velocity: Vector3Tuple
}

export type BubblePoppedSnapshot = { id: number; position: Vector3Tuple }

export type BallisticSnapshot = {
	charge: number
	id: number
	ownerId: string
	position: Vector3Tuple
	velocity: Vector3Tuple
}

export type BallisticEndedSnapshot = { id: number; position: Vector3Tuple }

export type ShotgunPelletSnapshot = {
	direction: Vector3Tuple
	id: number
	origin: Vector3Tuple
	ownerId: string
	phase: "flying" | "suspended"
	position: Vector3Tuple
}

export type ShotgunVolleySnapshot = {
	clientShotId: number
	damage: number
	hangSeconds: number
	maxDistance: number
	origin: Vector3Tuple
	ownerId: string
	pellets: ShotgunPelletSnapshot[]
	speed: number
}

export type DroneDestroyedSnapshot = {
	id: number
	personality: DronePersonality
	position: Vector3Tuple
	selfDestructed: boolean
}

export type CombatSnapshot = {
	dead: boolean
	deathStartedAt: number | null
	health: number
	respawnAt: number | null
	score: number
}
