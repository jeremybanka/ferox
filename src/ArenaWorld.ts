import { arenaHeightAt, arenaSeededValue } from "./arena-terrain.ts"

export const ARENA_PLAYABLE_HALF_EXTENT = 86
export const ARENA_RENDER_SIZE = 184
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

export type ArenaSurfaceContact = Readonly<{
	inclinationRadians: number
	normal: readonly [number, number, number]
	point: readonly [number, number, number]
	surfaceId: string
	time: number
}>

const PILLAR_SITES: readonly (readonly [number, number])[] = [
	[-58, -48],
	[-28, -52],
	[18, -58],
	[57, -35],
	[-55, 5],
	[48, 9],
	[-39, 48],
	[3, 57],
	[53, 49],
]

export function arenaPillars(seed: number): readonly ArenaPillar[] {
	return PILLAR_SITES.map(([siteX, siteZ], index) => {
		const x = siteX + (arenaSeededValue(seed, index, 17) - 0.5) * 8
		const z = siteZ + (arenaSeededValue(seed, index, 29) - 0.5) * 8
		return {
			baseY: arenaHeightAt(seed, x, z) - 0.35,
			height: 15 + arenaSeededValue(seed, index, 41) * 12,
			id: `pillar-${index}`,
			leanRadians: 0.05 + arenaSeededValue(seed, index, 53) * 0.12,
			radius: 2.4 + arenaSeededValue(seed, index, 67) * 1.7,
			x,
			z,
			yaw: arenaSeededValue(seed, index, 79) * Math.PI * 2,
		}
	})
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

function pillarCenterAtY(
	pillar: ArenaPillar,
	y: number,
): readonly [number, number] | null {
	const localY = (y - pillar.baseY) / Math.cos(pillar.leanRadians)
	if (localY < 0 || localY > pillar.height) return null
	const [axisX, , axisZ] = pillarAxis(pillar)
	return [pillar.x + axisX * localY, pillar.z + axisZ * localY]
}

export function pointInsideArenaObstacle(
	seed: number,
	point: readonly [number, number, number],
	padding = 0,
): boolean {
	for (const pillar of arenaPillars(seed)) {
		const center = pillarCenterAtY(pillar, point[1])
		if (center === null) continue
		if (
			Math.hypot(point[0] - center[0], point[2] - center[1]) <=
			pillar.radius + padding
		)
			return true
	}
	return false
}

export type ArenaMotionResolution = Readonly<{
	contact: ArenaSurfaceContact | null
	x: number
	z: number
}>

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
		const segmentX = requested[0] - start[0]
		const segmentZ = requested[1] - start[1]
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
			const moveX = requested[0] - start[0]
			const moveZ = requested[1] - start[1]
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
				x = hitX + (remainingX - normalX * inward)
				z = hitZ + (remainingZ - normalZ * inward)
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
			surfaceId: pillar.id,
			time: 1,
		}
	}
	return { contact, x, z }
}

export function isSpawnClear(
	seed: number,
	point: readonly [number, number],
	clearance = 3,
): boolean {
	const y = arenaHeightAt(seed, point[0], point[1]) + 1
	return !pointInsideArenaObstacle(seed, [point[0], y, point[1]], clearance)
}
