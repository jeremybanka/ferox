import { arenaHeightAt, arenaSeededValue } from "./arena-terrain.ts"
import { PARKOUR_TRANSITIONS, parkourWorldPoint } from "./ParkourArena.ts"

export const ARENA_LINEAR_SCALE = 2
export const ARENA_AREA_SCALE = ARENA_LINEAR_SCALE * ARENA_LINEAR_SCALE
export const ARENA_PLAYABLE_HALF_EXTENT = 172
export const ARENA_RENDER_SIZE = 368
export const ARENA_TERRAIN_SEGMENTS = 256
export const ARENA_GRID_DIVISIONS = 92
export const PLAYER_COLLISION_RADIUS = 0.48

export type ArenaPillar = Readonly<{
	baseY: number
	height: number
	id: string
	leanRadians: number
	radius: number
	x: number
	z: number
	yaw: number
}>

export type ArenaWallRole =
	| "channel"
	| "connector"
	| "outer"
	| "park"
	| "staggered"

export type ArenaWall = Readonly<{
	baseY: number
	height: number
	id: string
	leanRadians: number
	length: number
	role: ArenaWallRole
	thickness: number
	x: number
	z: number
	yaw: number
}>

export type ArenaSurfaceContact = Readonly<{
	inclinationRadians: number
	normal: readonly [number, number, number]
	point: readonly [number, number, number]
	surfaceNormal?: readonly [number, number, number]
	surfaceId: string
	time: number
}>

type ChannelBlueprint = Readonly<{
	height: number
	length: number
	separation: number
	x: number
	z: number
	yaw: number
}>

type WallBlueprint = Readonly<{
	elevation: number
	height: number
	length: number
	role: ArenaWallRole
	thickness: number
	x: number
	z: number
	yaw: number
}>

const PILLAR_SITES: readonly (readonly [number, number])[] = [
	[-146, -118],
	[-92, -138],
	[-24, -148],
	[62, -142],
	[138, -112],
	[-146, -32],
	[145, -22],
	[-142, 58],
	[142, 64],
	[-116, 138],
	[-38, 147],
	[48, 144],
	[132, 124],
]

const CHANNEL_BLUEPRINTS: readonly ChannelBlueprint[] = [
	{ height: 18, length: 76, separation: 13, x: 0, yaw: 0, z: -44 },
	{ height: 22, length: 68, separation: 11, x: 0, yaw: 0, z: 44 },
	{ height: 16, length: 86, separation: 15, x: 0, yaw: 0, z: -98 },
	{ height: 25, length: 72, separation: 12, x: 0, yaw: 0, z: 101 },
	{ height: 20, length: 72, separation: 13, x: -44, yaw: Math.PI / 2, z: 0 },
	{ height: 17, length: 82, separation: 11, x: 44, yaw: Math.PI / 2, z: 0 },
	{ height: 24, length: 70, separation: 14, x: -101, yaw: Math.PI / 2, z: 0 },
	{ height: 19, length: 84, separation: 12, x: 99, yaw: Math.PI / 2, z: 0 },
	{ height: 21, length: 66, separation: 12, x: -76, yaw: Math.PI / 4, z: -73 },
	{ height: 16, length: 58, separation: 10, x: 75, yaw: Math.PI / 4, z: 72 },
	{ height: 23, length: 62, separation: 14, x: -74, yaw: -Math.PI / 4, z: 75 },
	{ height: 18, length: 70, separation: 11, x: 77, yaw: -Math.PI / 4, z: -76 },
]

const STAGGERED_BLUEPRINTS: readonly WallBlueprint[] = [
	{
		elevation: 0,
		height: 13,
		length: 34,
		role: "staggered",
		thickness: 1.5,
		x: -128,
		yaw: 0.28,
		z: -76,
	},
	{
		elevation: 0,
		height: 26,
		length: 49,
		role: "staggered",
		thickness: 1.9,
		x: -126,
		yaw: -0.52,
		z: -18,
	},
	{
		elevation: 0,
		height: 17,
		length: 28,
		role: "staggered",
		thickness: 1.4,
		x: -126,
		yaw: 0.62,
		z: 42,
	},
	{
		elevation: 0,
		height: 22,
		length: 44,
		role: "staggered",
		thickness: 1.8,
		x: -119,
		yaw: -0.32,
		z: 102,
	},
	{
		elevation: 0,
		height: 18,
		length: 40,
		role: "staggered",
		thickness: 1.6,
		x: -58,
		yaw: 1.22,
		z: 126,
	},
	{
		elevation: 0,
		height: 28,
		length: 56,
		role: "staggered",
		thickness: 2,
		x: 14,
		yaw: 0.18,
		z: 132,
	},
	{
		elevation: 0,
		height: 15,
		length: 31,
		role: "staggered",
		thickness: 1.4,
		x: 82,
		yaw: -0.72,
		z: 126,
	},
	{
		elevation: 0,
		height: 24,
		length: 47,
		role: "staggered",
		thickness: 1.8,
		x: 128,
		yaw: 0.48,
		z: 82,
	},
	{
		elevation: 0,
		height: 19,
		length: 38,
		role: "staggered",
		thickness: 1.5,
		x: 128,
		yaw: -0.38,
		z: 18,
	},
	{
		elevation: 0,
		height: 27,
		length: 52,
		role: "staggered",
		thickness: 2,
		x: 123,
		yaw: 0.7,
		z: -51,
	},
	{
		elevation: 0,
		height: 16,
		length: 30,
		role: "staggered",
		thickness: 1.4,
		x: 92,
		yaw: -1.12,
		z: -126,
	},
	{
		elevation: 0,
		height: 23,
		length: 45,
		role: "staggered",
		thickness: 1.8,
		x: 22,
		yaw: 0.34,
		z: -132,
	},
]

const OUTER_BLUEPRINTS: readonly WallBlueprint[] = [
	{
		elevation: 0,
		height: 20,
		length: 64,
		role: "outer",
		thickness: 2.2,
		x: -75,
		yaw: 0.08,
		z: -151,
	},
	{
		elevation: 0,
		height: 27,
		length: 72,
		role: "outer",
		thickness: 2.4,
		x: 68,
		yaw: -0.12,
		z: -151,
	},
	{
		elevation: 0,
		height: 18,
		length: 58,
		role: "outer",
		thickness: 2,
		x: 151,
		yaw: Math.PI / 2 + 0.1,
		z: -78,
	},
	{
		elevation: 0,
		height: 25,
		length: 70,
		role: "outer",
		thickness: 2.3,
		x: 151,
		yaw: Math.PI / 2 - 0.08,
		z: 66,
	},
	{
		elevation: 0,
		height: 22,
		length: 78,
		role: "outer",
		thickness: 2.4,
		x: 70,
		yaw: 0.06,
		z: 151,
	},
	{
		elevation: 0,
		height: 16,
		length: 54,
		role: "outer",
		thickness: 1.9,
		x: -72,
		yaw: -0.14,
		z: 151,
	},
	{
		elevation: 0,
		height: 26,
		length: 68,
		role: "outer",
		thickness: 2.3,
		x: -151,
		yaw: Math.PI / 2 + 0.07,
		z: 70,
	},
	{
		elevation: 0,
		height: 19,
		length: 62,
		role: "outer",
		thickness: 2.1,
		x: -151,
		yaw: Math.PI / 2 - 0.11,
		z: -72,
	},
]

const ELEVATED_LANES: readonly WallBlueprint[] = [
	{
		elevation: 4.2,
		height: 11,
		length: 54,
		role: "connector",
		thickness: 1.5,
		x: -71,
		yaw: 0.82,
		z: -1,
	},
	{
		elevation: 5.5,
		height: 9,
		length: 46,
		role: "connector",
		thickness: 1.4,
		x: 69,
		yaw: -0.76,
		z: 2,
	},
	{
		elevation: 3.6,
		height: 13,
		length: 58,
		role: "connector",
		thickness: 1.7,
		x: 1,
		yaw: 0.66,
		z: -72,
	},
	{
		elevation: 4.8,
		height: 10,
		length: 50,
		role: "connector",
		thickness: 1.5,
		x: -2,
		yaw: -0.7,
		z: 73,
	},
]

function parkWallBlueprints(): readonly WallBlueprint[] {
	return PARKOUR_TRANSITIONS.flatMap((transition) => {
		if (transition.kind === "half-pipe") {
			return [-1, 1].map((side) => {
				const [x, z] = parkourWorldPoint(
					transition,
					0,
					transition.width * 0.5 * side,
				)
				return {
					elevation: 0,
					height: 8,
					length: transition.length + 3,
					role: "park" as const,
					thickness: 1.2,
					x,
					yaw: transition.yaw,
					z,
				}
			})
		}
		const [x, z] = parkourWorldPoint(transition, transition.length * 0.5, 0)
		return [
			{
				elevation: 0,
				height: transition.kind === "quarter-pipe" ? 11 : 6.5,
				length: transition.width + 3,
				role: "park" as const,
				thickness: transition.kind === "bank" ? 1.4 : 1.1,
				x,
				yaw: transition.yaw + Math.PI / 2,
				z,
			},
		]
	})
}

const pillarCache = new Map<number, readonly ArenaPillar[]>()
const wallCache = new Map<number, readonly ArenaWall[]>()

function seededOffset(seed: number, index: number, salt: number): number {
	return arenaSeededValue(seed, index, salt) - 0.5
}

export function arenaPillars(seed: number): readonly ArenaPillar[] {
	const cached = pillarCache.get(seed)
	if (cached !== undefined) return cached
	const pillars = PILLAR_SITES.map(([siteX, siteZ], index) => {
		const x = siteX + seededOffset(seed, index, 17) * 8
		const z = siteZ + seededOffset(seed, index, 29) * 8
		return {
			baseY: arenaHeightAt(seed, x, z) - 0.55,
			height: 18 + arenaSeededValue(seed, index, 41) * 15,
			id: `pillar-${index}`,
			leanRadians: 0.04 + arenaSeededValue(seed, index, 53) * 0.11,
			radius: 2.8 + arenaSeededValue(seed, index, 67) * 2,
			x,
			z,
			yaw: arenaSeededValue(seed, index, 79) * Math.PI * 2,
		}
	})
	pillarCache.set(seed, pillars)
	return pillars
}

function channelWallBlueprints(): readonly WallBlueprint[] {
	return CHANNEL_BLUEPRINTS.flatMap((channel) => {
		const normalX = -Math.sin(channel.yaw)
		const normalZ = Math.cos(channel.yaw)
		return [-1, 1].map((side) => ({
			elevation: 0,
			height: channel.height + side * 1.5,
			length: channel.length,
			role: "channel" as const,
			thickness: side < 0 ? 1.6 : 2,
			x: channel.x + normalX * channel.separation * 0.5 * side,
			yaw: channel.yaw,
			z: channel.z + normalZ * channel.separation * 0.5 * side,
		}))
	})
}

function elevatedConnectorBlueprints(): readonly WallBlueprint[] {
	return CHANNEL_BLUEPRINTS.slice(0, 8).flatMap((channel, channelIndex) => {
		const tangentX = Math.cos(channel.yaw)
		const tangentZ = Math.sin(channel.yaw)
		return [-1, 1].map((side) => ({
			elevation: 2.8 + (channelIndex % 3) * 0.9,
			height: 8 + (channelIndex % 4) * 1.6,
			length: channel.separation + 10 + (channelIndex % 2) * 5,
			role: "connector" as const,
			thickness: 1.25 + (channelIndex % 2) * 0.25,
			x: channel.x + tangentX * side * channel.length * 0.27,
			yaw: channel.yaw + Math.PI / 2,
			z: channel.z + tangentZ * side * channel.length * 0.27,
		}))
	})
}

function wallBaseY(seed: number, blueprint: WallBlueprint): number {
	const tangentX = Math.cos(blueprint.yaw)
	const tangentZ = Math.sin(blueprint.yaw)
	const samples = Array.from({ length: 9 }, (_, index) => {
		const amount = index / 8 - 0.5
		return arenaHeightAt(
			seed,
			blueprint.x + tangentX * blueprint.length * amount,
			blueprint.z + tangentZ * blueprint.length * amount,
		)
	})
	return blueprint.elevation > 0
		? Math.max(...samples) + blueprint.elevation
		: Math.min(...samples) - 0.8
}

export function arenaWalls(seed: number): readonly ArenaWall[] {
	const cached = wallCache.get(seed)
	if (cached !== undefined) return cached
	const blueprints = [
		...channelWallBlueprints(),
		...STAGGERED_BLUEPRINTS,
		...OUTER_BLUEPRINTS,
		...elevatedConnectorBlueprints(),
		...ELEVATED_LANES,
		...parkWallBlueprints(),
	]
	const walls = blueprints.map((blueprint, index) => {
		const isParkWall = blueprint.role === "park"
		const positionJitter = isParkWall
			? 0
			: blueprint.role === "channel"
				? 0.8
				: 1.8
		const x = blueprint.x + seededOffset(seed, index, 101) * positionJitter
		const z = blueprint.z + seededOffset(seed, index, 113) * positionJitter
		const yaw =
			blueprint.yaw +
			seededOffset(seed, index, 127) * (isParkWall ? 0 : Math.PI / 42)
		const resolved = { ...blueprint, x, yaw, z }
		const leanDirection = index % 2 === 0 ? 1 : -1
		return {
			baseY: wallBaseY(seed, resolved),
			height:
				blueprint.height +
				seededOffset(seed, index, 139) * (isParkWall ? 0 : 3.5),
			id: `wall-${blueprint.role}-${index}`,
			leanRadians:
				leanDirection *
				(isParkWall
					? 0.035
					: 0.025 + arenaSeededValue(seed, index, 151) * 0.105),
			length:
				blueprint.length +
				seededOffset(seed, index, 163) * (isParkWall ? 0 : 5),
			role: blueprint.role,
			thickness: blueprint.thickness,
			x,
			yaw,
			z,
		}
	})
	wallCache.set(seed, walls)
	return walls
}

export function pillarAxis(
	pillar: ArenaPillar,
): readonly [number, number, number] {
	const horizontal = Math.sin(pillar.leanRadians)
	return [
		Math.cos(pillar.yaw) * horizontal,
		Math.cos(pillar.leanRadians),
		Math.sin(pillar.yaw) * horizontal,
	]
}

export function wallTangent(wall: ArenaWall): readonly [number, number] {
	return [Math.cos(wall.yaw), Math.sin(wall.yaw)]
}

export function wallNormal(wall: ArenaWall): readonly [number, number] {
	return [-Math.sin(wall.yaw), Math.cos(wall.yaw)]
}

export function wallCenterAtY(
	wall: ArenaWall,
	y: number,
): readonly [number, number] | null {
	const cosine = Math.cos(wall.leanRadians)
	const localY = (y - wall.baseY) / cosine
	if (localY < -1e-9 || localY > wall.height + 1e-9) return null
	const boundedLocalY = Math.max(0, Math.min(wall.height, localY))
	const [normalX, normalZ] = wallNormal(wall)
	const lean = Math.sin(wall.leanRadians) * boundedLocalY
	return [wall.x + normalX * lean, wall.z + normalZ * lean]
}

function pillarCenterAtY(
	pillar: ArenaPillar,
	y: number,
): readonly [number, number] | null {
	const localY = (y - pillar.baseY) / Math.cos(pillar.leanRadians)
	if (localY < 0 || localY > pillar.height) return null
	const [axisX, , axisZ] = pillarAxis(pillar)
	return [pillar.x + axisX * localY, pillar.z + axisZ * localY]
}

function pillarSurfaceNormal(
	pillar: ArenaPillar,
	normalX: number,
	normalZ: number,
): readonly [number, number, number] {
	const [axisX, axisY, axisZ] = pillarAxis(pillar)
	const normalY = -(normalX * axisX + normalZ * axisZ) / axisY
	const length = Math.hypot(normalX, normalY, normalZ)
	return [normalX / length, normalY / length, normalZ / length]
}

function wallSurfaceNormal(
	wall: ArenaWall,
	normalX: number,
	normalZ: number,
): readonly [number, number, number] {
	const [wallNormalX, wallNormalZ] = wallNormal(wall)
	const face = normalX * wallNormalX + normalZ * wallNormalZ >= 0 ? 1 : -1
	const horizontalScale = Math.cos(wall.leanRadians)
	return [
		normalX * horizontalScale,
		-Math.sin(wall.leanRadians) * face,
		normalZ * horizontalScale,
	]
}

function wallLocalPoint(
	wall: ArenaWall,
	center: readonly [number, number],
	point: readonly [number, number],
): readonly [number, number] {
	const [tangentX, tangentZ] = wallTangent(wall)
	const [normalX, normalZ] = wallNormal(wall)
	const dx = point[0] - center[0]
	const dz = point[1] - center[1]
	return [dx * tangentX + dz * tangentZ, dx * normalX + dz * normalZ]
}

function distanceToWallCenterline(
	wall: ArenaWall,
	local: readonly [number, number],
): number {
	const closestTangent = Math.max(
		-wall.length * 0.5,
		Math.min(wall.length * 0.5, local[0]),
	)
	return Math.hypot(local[0] - closestTangent, local[1])
}

export function pointInsideArenaObstacle(
	seed: number,
	point: readonly [number, number, number],
	padding = 0,
): boolean {
	return pointInsideArenaObstacleExcept(seed, point, padding, null)
}

function pointInsideArenaObstacleExcept(
	seed: number,
	point: readonly [number, number, number],
	padding: number,
	ignoredSurfaceId: string | null,
): boolean {
	for (const pillar of arenaPillars(seed)) {
		if (pillar.id === ignoredSurfaceId) continue
		const center = pillarCenterAtY(pillar, point[1])
		if (center === null) continue
		if (
			Math.hypot(point[0] - center[0], point[2] - center[1]) <=
			pillar.radius + padding
		)
			return true
	}
	for (const wall of arenaWalls(seed)) {
		if (wall.id === ignoredSurfaceId) continue
		const center = wallCenterAtY(wall, point[1])
		if (center === null) continue
		const local = wallLocalPoint(wall, center, [point[0], point[2]])
		if (distanceToWallCenterline(wall, local) <= wall.thickness * 0.5 + padding)
			return true
	}
	return false
}

function mantleCapsuleIsClear(
	seed: number,
	eyePosition: readonly [number, number, number],
	eyeHeight: number,
	ignoredSurfaceId: string,
): boolean {
	const rootY = eyePosition[1] - eyeHeight
	for (const height of [0.08, eyeHeight * 0.5, eyeHeight]) {
		if (
			pointInsideArenaObstacleExcept(
				seed,
				[eyePosition[0], rootY + height, eyePosition[2]],
				PLAYER_COLLISION_RADIUS + 0.02,
				ignoredSurfaceId,
			)
		)
			return false
	}
	return true
}

export type ArenaMotionResolution = Readonly<{
	contact: ArenaSurfaceContact | null
	x: number
	z: number
}>

export type ArenaGroundSupport = Readonly<{
	height: number
	surfaceId: string | null
}>

export type ArenaLedge = Readonly<{
	rise: number
	surfaceId: string
	target: readonly [number, number, number]
}>

type WallSweepHit = Readonly<{
	normalLocal: readonly [number, number]
	time: number
}>

function sweepWallCapsule(
	wall: ArenaWall,
	startLocal: readonly [number, number],
	endLocal: readonly [number, number],
	radius: number,
): WallSweepHit | null {
	const halfLength = wall.length * 0.5
	const moveU = endLocal[0] - startLocal[0]
	const moveV = endLocal[1] - startLocal[1]
	const candidates: WallSweepHit[] = []
	for (const side of [-1, 1] as const) {
		if (moveV * side >= 0 || Math.abs(moveV) < 1e-9) continue
		const time = (side * radius - startLocal[1]) / moveV
		if (time < 0 || time > 1) continue
		const tangentAtHit = startLocal[0] + moveU * time
		if (Math.abs(tangentAtHit) <= halfLength)
			candidates.push({ normalLocal: [0, side], time })
	}
	const speedSquared = moveU * moveU + moveV * moveV
	if (speedSquared > 1e-9) {
		for (const endpoint of [-halfLength, halfLength]) {
			const offsetU = startLocal[0] - endpoint
			const offsetV = startLocal[1]
			const b = 2 * (offsetU * moveU + offsetV * moveV)
			const c = offsetU * offsetU + offsetV * offsetV - radius * radius
			const discriminant = b * b - 4 * speedSquared * c
			if (discriminant < 0) continue
			const time = (-b - Math.sqrt(discriminant)) / (2 * speedSquared)
			if (time < 0 || time > 1) continue
			const hitU = startLocal[0] + moveU * time - endpoint
			const hitV = startLocal[1] + moveV * time
			const length = Math.hypot(hitU, hitV)
			if (length > 1e-9)
				candidates.push({
					normalLocal: [hitU / length, hitV / length],
					time,
				})
		}
	}
	return candidates.sort((a, b) => a.time - b.time)[0] ?? null
}

function resolveWallMotion(
	wall: ArenaWall,
	center: readonly [number, number],
	start: readonly [number, number],
	requested: readonly [number, number],
	radius: number,
): Readonly<{
	contactNormal: readonly [number, number] | null
	time: number
	x: number
	z: number
}> {
	const startLocal = wallLocalPoint(wall, center, start)
	const requestedLocal = wallLocalPoint(wall, center, requested)
	const collisionRadius = wall.thickness * 0.5 + radius
	const hit = sweepWallCapsule(
		wall,
		startLocal,
		requestedLocal,
		collisionRadius,
	)
	const [tangentX, tangentZ] = wallTangent(wall)
	const [normalX, normalZ] = wallNormal(wall)
	let x = requested[0]
	let z = requested[1]
	let contactNormal: readonly [number, number] | null = null
	let time = 1
	if (hit !== null) {
		const hitX = start[0] + (requested[0] - start[0]) * hit.time
		const hitZ = start[1] + (requested[1] - start[1]) * hit.time
		const resolvedNormalX =
			tangentX * hit.normalLocal[0] + normalX * hit.normalLocal[1]
		const resolvedNormalZ =
			tangentZ * hit.normalLocal[0] + normalZ * hit.normalLocal[1]
		const remainingX = (requested[0] - start[0]) * (1 - hit.time)
		const remainingZ = (requested[1] - start[1]) * (1 - hit.time)
		const inward = Math.min(
			0,
			remainingX * resolvedNormalX + remainingZ * resolvedNormalZ,
		)
		x = hitX + remainingX - resolvedNormalX * inward
		z = hitZ + remainingZ - resolvedNormalZ * inward
		contactNormal = [resolvedNormalX, resolvedNormalZ]
		time = hit.time
	}
	const resolvedLocal = wallLocalPoint(wall, center, [x, z])
	const closestTangent = Math.max(
		-wall.length * 0.5,
		Math.min(wall.length * 0.5, resolvedLocal[0]),
	)
	const offsetU = resolvedLocal[0] - closestTangent
	const offsetV = resolvedLocal[1]
	const distance = Math.hypot(offsetU, offsetV)
	if (distance < collisionRadius) {
		const fallbackV = resolvedLocal[1] >= 0 ? 1 : -1
		const normalU = distance > 1e-9 ? offsetU / distance : 0
		const normalV = distance > 1e-9 ? offsetV / distance : fallbackV
		const push = collisionRadius - distance
		x += (tangentX * normalU + normalX * normalV) * push
		z += (tangentZ * normalU + normalZ * normalV) * push
		contactNormal = [
			tangentX * normalU + normalX * normalV,
			tangentZ * normalU + normalZ * normalV,
		]
	}
	if (contactNormal === null && distance <= collisionRadius + 0.08) {
		const normalU = distance > 1e-9 ? offsetU / distance : 0
		const normalV = distance > 1e-9 ? offsetV / distance : 1
		contactNormal = [
			tangentX * normalU + normalX * normalV,
			tangentZ * normalU + normalZ * normalV,
		]
	}
	return { contactNormal, time, x, z }
}

/** Sweeps a horizontal player circle and returns a stable steep-surface contact. */
export function resolveArenaMotion(
	seed: number,
	start: readonly [number, number],
	requested: readonly [number, number],
	y: number,
	radius = PLAYER_COLLISION_RADIUS,
): ArenaMotionResolution {
	let x = Math.max(
		-ARENA_PLAYABLE_HALF_EXTENT,
		Math.min(ARENA_PLAYABLE_HALF_EXTENT, requested[0]),
	)
	let z = Math.max(
		-ARENA_PLAYABLE_HALF_EXTENT,
		Math.min(ARENA_PLAYABLE_HALF_EXTENT, requested[1]),
	)
	let contact: ArenaSurfaceContact | null = null
	for (const pillar of arenaPillars(seed)) {
		const center = pillarCenterAtY(pillar, y)
		if (center === null) continue
		const combinedRadius = pillar.radius + radius
		const dx = x - center[0]
		const dz = z - center[1]
		const distance = Math.hypot(dx, dz)
		const segmentX = x - start[0]
		const segmentZ = z - start[1]
		const segmentLengthSquared = segmentX * segmentX + segmentZ * segmentZ
		const closestTime =
			segmentLengthSquared === 0
				? 0
				: Math.max(
						0,
						Math.min(
							1,
							((center[0] - start[0]) * segmentX +
								(center[1] - start[1]) * segmentZ) /
								segmentLengthSquared,
						),
					)
		const closestDistance = Math.hypot(
			start[0] + segmentX * closestTime - center[0],
			start[1] + segmentZ * closestTime - center[1],
		)
		if (
			distance > combinedRadius + 0.08 &&
			closestDistance > combinedRadius + 0.08
		)
			continue
		let normalX =
			distance > 0.0001 ? dx / distance : start[0] >= center[0] ? 1 : -1
		let normalZ =
			distance > 0.0001 ? dz / distance : start[1] >= center[1] ? 1 : -1
		const startDistance = Math.hypot(start[0] - center[0], start[1] - center[1])
		if (startDistance >= combinedRadius) {
			const moveX = x - start[0]
			const moveZ = z - start[1]
			const a = moveX * moveX + moveZ * moveZ
			const offsetX = start[0] - center[0]
			const offsetZ = start[1] - center[1]
			const b = 2 * (offsetX * moveX + offsetZ * moveZ)
			const c =
				offsetX * offsetX + offsetZ * offsetZ - combinedRadius * combinedRadius
			const discriminant = b * b - 4 * a * c
			if (a > 0 && discriminant >= 0) {
				const hitTime = Math.max(
					0,
					Math.min(1, (-b - Math.sqrt(discriminant)) / (2 * a)),
				)
				const hitX = start[0] + moveX * hitTime
				const hitZ = start[1] + moveZ * hitTime
				normalX = (hitX - center[0]) / combinedRadius
				normalZ = (hitZ - center[1]) / combinedRadius
				const remainingX = moveX * (1 - hitTime)
				const remainingZ = moveZ * (1 - hitTime)
				const inward = Math.min(0, remainingX * normalX + remainingZ * normalZ)
				x = hitX + remainingX - normalX * inward
				z = hitZ + remainingZ - normalZ * inward
			}
		}
		const correctedDx = x - center[0]
		const correctedDz = z - center[1]
		const correctedDistance = Math.hypot(correctedDx, correctedDz)
		if (correctedDistance < combinedRadius) {
			x = center[0] + normalX * combinedRadius
			z = center[1] + normalZ * combinedRadius
		}
		contact = {
			inclinationRadians: Math.PI / 2 - pillar.leanRadians,
			normal: [normalX, 0, normalZ],
			point: [x - normalX * radius, y, z - normalZ * radius],
			surfaceNormal: pillarSurfaceNormal(pillar, normalX, normalZ),
			surfaceId: pillar.id,
			time: closestTime,
		}
	}
	for (const wall of arenaWalls(seed)) {
		const center = wallCenterAtY(wall, y)
		if (center === null) continue
		const resolved = resolveWallMotion(wall, center, start, [x, z], radius)
		x = resolved.x
		z = resolved.z
		if (resolved.contactNormal === null) continue
		const [normalX, normalZ] = resolved.contactNormal
		contact = {
			inclinationRadians: Math.PI / 2 - Math.abs(wall.leanRadians),
			normal: [normalX, 0, normalZ],
			point: [x - normalX * radius, y, z - normalZ * radius],
			surfaceNormal: wallSurfaceNormal(wall, normalX, normalZ),
			surfaceId: wall.id,
			time: resolved.time,
		}
	}
	x = Math.max(
		-ARENA_PLAYABLE_HALF_EXTENT,
		Math.min(ARENA_PLAYABLE_HALF_EXTENT, x),
	)
	z = Math.max(
		-ARENA_PLAYABLE_HALF_EXTENT,
		Math.min(ARENA_PLAYABLE_HALF_EXTENT, z),
	)
	return { contact, x, z }
}

function obstacleTopY(obstacle: ArenaPillar | ArenaWall): number {
	return obstacle.baseY + Math.cos(obstacle.leanRadians) * obstacle.height
}

/**
 * Returns terrain or an occupiable obstacle top beneath the supplied ceiling.
 * Obstacle footprints are eroded by the pilot radius so a returned support is
 * always wide enough for the full collision circle.
 */
export function arenaMovementGroundAt(
	seed: number,
	x: number,
	z: number,
	maximumHeight = Number.POSITIVE_INFINITY,
): ArenaGroundSupport {
	let support: ArenaGroundSupport = {
		height: arenaHeightAt(seed, x, z),
		surfaceId: null,
	}
	for (const pillar of arenaPillars(seed)) {
		const topY = obstacleTopY(pillar)
		if (topY > maximumHeight || topY <= support.height) continue
		const [axisX, , axisZ] = pillarAxis(pillar)
		const topX = pillar.x + axisX * pillar.height
		const topZ = pillar.z + axisZ * pillar.height
		if (
			Math.hypot(x - topX, z - topZ) <=
			pillar.radius - PLAYER_COLLISION_RADIUS
		) {
			support = { height: topY, surfaceId: pillar.id }
		}
	}
	for (const wall of arenaWalls(seed)) {
		const topY = obstacleTopY(wall)
		if (topY > maximumHeight || topY <= support.height) continue
		const center = wallCenterAtY(wall, topY)
		if (center === null) continue
		const local = wallLocalPoint(wall, center, [x, z])
		const usableHalfLength = wall.length * 0.5 - PLAYER_COLLISION_RADIUS
		const usableHalfThickness = wall.thickness * 0.5 - PLAYER_COLLISION_RADIUS
		if (
			usableHalfLength >= 0 &&
			usableHalfThickness >= 0 &&
			Math.abs(local[0]) <= usableHalfLength &&
			Math.abs(local[1]) <= usableHalfThickness
		) {
			support = { height: topY, surfaceId: wall.id }
		}
	}
	return support
}

/** Finds a short, collision-safe mantle destination for a resolved face hit. */
export function queryArenaLedge(
	seed: number,
	options: Readonly<{
		contact: ArenaSurfaceContact | null
		eyeHeight: number
		maximumRise: number
		position: readonly [number, number, number]
		velocity: readonly [number, number, number]
	}>,
): ArenaLedge | null {
	const contact = options.contact
	if (contact === null || options.maximumRise <= 0) return null
	const approachSpeed = -(
		options.velocity[0] * contact.normal[0] +
		options.velocity[2] * contact.normal[2]
	)
	if (approachSpeed < 0.6) return null
	const rootY = options.position[1] - options.eyeHeight
	let topY = Number.NaN
	let targetX = Number.NaN
	let targetZ = Number.NaN
	const pillar = arenaPillars(seed).find(
		(candidate) => candidate.id === contact.surfaceId,
	)
	if (pillar !== undefined) {
		topY = obstacleTopY(pillar)
		const [axisX, , axisZ] = pillarAxis(pillar)
		const centerX = pillar.x + axisX * pillar.height
		const centerZ = pillar.z + axisZ * pillar.height
		const insetRadius = pillar.radius - PLAYER_COLLISION_RADIUS - 0.08
		if (insetRadius <= 0) return null
		targetX = centerX + contact.normal[0] * insetRadius
		targetZ = centerZ + contact.normal[2] * insetRadius
	} else {
		const wall = arenaWalls(seed).find(
			(candidate) => candidate.id === contact.surfaceId,
		)
		if (wall === undefined) return null
		if (wall.thickness < PLAYER_COLLISION_RADIUS * 2 + 0.08) return null
		topY = obstacleTopY(wall)
		const center = wallCenterAtY(wall, topY)
		if (center === null) return null
		const [tangentX, tangentZ] = wallTangent(wall)
		const contactAlong =
			(contact.point[0] - center[0]) * tangentX +
			(contact.point[2] - center[1]) * tangentZ
		const usableHalfLength = wall.length * 0.5 - PLAYER_COLLISION_RADIUS - 0.08
		if (usableHalfLength <= 0) return null
		const along = Math.max(
			-usableHalfLength,
			Math.min(usableHalfLength, contactAlong),
		)
		targetX = center[0] + tangentX * along
		targetZ = center[1] + tangentZ * along
	}
	const rise = topY - rootY
	if (rise <= 0.04 || rise > options.maximumRise + 1e-9) return null
	const target: readonly [number, number, number] = [
		targetX,
		topY + options.eyeHeight,
		targetZ,
	]
	if (!mantleCapsuleIsClear(seed, target, options.eyeHeight, contact.surfaceId))
		return null
	for (const progress of [0.25, 0.5, 0.75]) {
		const pathPosition = options.position.map(
			(value, index) => value + (target[index]! - value) * progress,
		) as [number, number, number]
		if (
			!mantleCapsuleIsClear(
				seed,
				pathPosition,
				options.eyeHeight,
				contact.surfaceId,
			)
		)
			return null
	}
	const support = arenaMovementGroundAt(seed, targetX, targetZ, topY + 0.001)
	if (support.surfaceId !== contact.surfaceId) return null
	return { rise, surfaceId: contact.surfaceId, target }
}

export function isSpawnClear(
	seed: number,
	point: readonly [number, number],
	clearance = 3,
): boolean {
	const y = arenaHeightAt(seed, point[0], point[1]) + 1
	return !pointInsideArenaObstacle(seed, [point[0], y, point[1]], clearance)
}
