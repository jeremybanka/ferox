export type Vector3Tuple = [number, number, number]

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
	sequence: number
	serverTime: number
}

export type FireIntent = {
	clientShotId: number
	direction: Vector3Tuple
	origin: Vector3Tuple
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
