import { arenaHeightAt } from "../src/arena-terrain.ts"
import {
	ARENA_PLAYABLE_HALF_EXTENT,
	pointInsideArenaObstacle,
} from "../src/ArenaWorld.ts"

export type DronePathPoint = readonly [x: number, z: number]

const GRID_CELL_SIZE = 4
const ROUTE_SAMPLE_SPACING = 0.5
const DEFAULT_CLEARANCE = 0.85

type OpenNode = Readonly<{
	index: number
	priority: number
}>

type ArenaPathGrid = Readonly<{
	gridSize: number
	indexAt: (point: DronePathPoint) => number
	isCellClear: (index: number) => boolean
	isEdgeClear: (startIndex: number, goalIndex: number) => boolean
	pointAt: (index: number) => DronePathPoint
}>

const NEIGHBORS: readonly (readonly [x: number, z: number, cost: number])[] = [
	[-1, -1, Math.SQRT2],
	[0, -1, 1],
	[1, -1, Math.SQRT2],
	[-1, 0, 1],
	[1, 0, 1],
	[-1, 1, Math.SQRT2],
	[0, 1, 1],
	[1, 1, Math.SQRT2],
]

const pathGridCache = new Map<string, ArenaPathGrid>()

/** Returns whether a hovering drone can travel between two points in a straight line. */
export function isArenaRouteClear(
	seed: number,
	start: DronePathPoint,
	goal: DronePathPoint,
	clearance = DEFAULT_CLEARANCE,
): boolean {
	const distance = Math.hypot(goal[0] - start[0], goal[1] - start[1])
	const samples = Math.max(1, Math.ceil(distance / ROUTE_SAMPLE_SPACING))
	for (let index = 1; index < samples; index += 1) {
		const amount = index / samples
		const x = start[0] + (goal[0] - start[0]) * amount
		const z = start[1] + (goal[1] - start[1]) * amount
		const y = arenaHeightAt(seed, x, z) + 3.2
		if (pointInsideArenaObstacle(seed, [x, y, z], clearance)) return false
	}
	return true
}

/**
 * Finds a short, deterministic set of waypoints around arena obstacles.
 * The exact goal is returned when it is directly reachable, and `null` means
 * no route was found within the playable arena.
 */
export function findArenaDronePath(
	seed: number,
	start: DronePathPoint,
	goal: DronePathPoint,
	clearance = DEFAULT_CLEARANCE,
): readonly DronePathPoint[] | null {
	if (isArenaRouteClear(seed, start, goal, clearance)) return [goal]

	const grid = getPathGrid(seed, clearance)
	const { gridSize, pointAt } = grid
	const startIndex = nearestCell(
		grid.indexAt(start),
		gridSize,
		(index) =>
			grid.isCellClear(index) &&
			isArenaRouteClear(seed, start, pointAt(index), clearance),
	)
	const goalIndex = nearestCell(
		grid.indexAt(goal),
		gridSize,
		(index) =>
			grid.isCellClear(index) &&
			isArenaRouteClear(seed, pointAt(index), goal, clearance),
	)
	if (startIndex === null || goalIndex === null) return null

	const scores = new Float64Array(gridSize * gridSize)
	scores.fill(Number.POSITIVE_INFINITY)
	scores[startIndex] = 0
	const cameFrom = new Int32Array(gridSize * gridSize)
	cameFrom.fill(-1)
	const open: OpenNode[] = []
	pushOpen(open, {
		index: startIndex,
		priority: heuristic(startIndex, goalIndex, gridSize),
	})

	while (open.length > 0) {
		const current = popOpen(open)
		if (current === undefined) break
		if (current.index === goalIndex) {
			const gridPath = reconstructPath(cameFrom, current.index).map(pointAt)
			return smoothPath(seed, start, [...gridPath, goal], clearance)
		}
		const currentX = current.index % gridSize
		const currentZ = Math.floor(current.index / gridSize)
		for (const [offsetX, offsetZ, cost] of NEIGHBORS) {
			const neighborX = currentX + offsetX
			const neighborZ = currentZ + offsetZ
			if (
				neighborX < 0 ||
				neighborX >= gridSize ||
				neighborZ < 0 ||
				neighborZ >= gridSize
			)
				continue
			const neighborIndex = neighborZ * gridSize + neighborX
			if (
				!grid.isCellClear(neighborIndex) ||
				!grid.isEdgeClear(current.index, neighborIndex)
			)
				continue
			const candidateScore = scores[current.index]! + cost
			if (candidateScore >= scores[neighborIndex]!) continue
			cameFrom[neighborIndex] = current.index
			scores[neighborIndex] = candidateScore
			pushOpen(open, {
				index: neighborIndex,
				priority:
					candidateScore + heuristic(neighborIndex, goalIndex, gridSize),
			})
		}
	}
	return null
}

function nearestCell(
	originIndex: number,
	gridSize: number,
	isUsable: (index: number) => boolean,
): number | null {
	if (isUsable(originIndex)) return originIndex
	const originX = originIndex % gridSize
	const originZ = Math.floor(originIndex / gridSize)
	for (let radius = 1; radius <= 4; radius += 1) {
		for (let z = originZ - radius; z <= originZ + radius; z += 1) {
			for (let x = originX - radius; x <= originX + radius; x += 1) {
				if (
					x < 0 ||
					x >= gridSize ||
					z < 0 ||
					z >= gridSize ||
					(Math.abs(x - originX) !== radius && Math.abs(z - originZ) !== radius)
				)
					continue
				const index = z * gridSize + x
				if (isUsable(index)) return index
			}
		}
	}
	return null
}

function getPathGrid(seed: number, clearance: number): ArenaPathGrid {
	const cacheKey = `${seed}:${clearance}`
	const cached = pathGridCache.get(cacheKey)
	if (cached !== undefined) return cached
	const minimum = -ARENA_PLAYABLE_HALF_EXTENT + clearance
	const maximum = ARENA_PLAYABLE_HALF_EXTENT - clearance
	const gridSize = Math.floor((maximum - minimum) / GRID_CELL_SIZE) + 1
	const clearCells = new Map<number, boolean>()
	const clearEdges = new Map<string, boolean>()
	const pointAt = (index: number): DronePathPoint => [
		minimum + (index % gridSize) * GRID_CELL_SIZE,
		minimum + Math.floor(index / gridSize) * GRID_CELL_SIZE,
	]
	const grid: ArenaPathGrid = {
		gridSize,
		indexAt: (point) => {
			const x = clamp(
				Math.round((point[0] - minimum) / GRID_CELL_SIZE),
				0,
				gridSize - 1,
			)
			const z = clamp(
				Math.round((point[1] - minimum) / GRID_CELL_SIZE),
				0,
				gridSize - 1,
			)
			return z * gridSize + x
		},
		isCellClear: (index) => {
			const cellCached = clearCells.get(index)
			if (cellCached !== undefined) return cellCached
			const [x, z] = pointAt(index)
			const y = arenaHeightAt(seed, x, z) + 3.2
			const clear = !pointInsideArenaObstacle(seed, [x, y, z], clearance)
			clearCells.set(index, clear)
			return clear
		},
		isEdgeClear: (startIndex, goalIndex) => {
			const edgeKey =
				startIndex < goalIndex
					? `${startIndex}:${goalIndex}`
					: `${goalIndex}:${startIndex}`
			const edgeCached = clearEdges.get(edgeKey)
			if (edgeCached !== undefined) return edgeCached
			const clear = isArenaRouteClear(
				seed,
				pointAt(startIndex),
				pointAt(goalIndex),
				clearance,
			)
			clearEdges.set(edgeKey, clear)
			return clear
		},
		pointAt,
	}
	pathGridCache.set(cacheKey, grid)
	return grid
}

function heuristic(index: number, goalIndex: number, gridSize: number): number {
	const dx = Math.abs((index % gridSize) - (goalIndex % gridSize))
	const dz = Math.abs(
		Math.floor(index / gridSize) - Math.floor(goalIndex / gridSize),
	)
	return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz)
}

function reconstructPath(cameFrom: Int32Array, goalIndex: number): number[] {
	const path = [goalIndex]
	let current = goalIndex
	while (cameFrom[current] !== -1) {
		current = cameFrom[current]!
		path.push(current)
	}
	return path.reverse()
}

function smoothPath(
	seed: number,
	start: DronePathPoint,
	path: readonly DronePathPoint[],
	clearance: number,
): DronePathPoint[] {
	const smoothed: DronePathPoint[] = []
	let anchor = start
	let index = 0
	while (index < path.length) {
		let nextIndex = path.length - 1
		while (
			nextIndex > index &&
			!isArenaRouteClear(seed, anchor, path[nextIndex]!, clearance)
		) {
			nextIndex -= 1
		}
		const waypoint = path[nextIndex]!
		smoothed.push(waypoint)
		anchor = waypoint
		index = nextIndex + 1
	}
	return smoothed
}

function pushOpen(heap: OpenNode[], node: OpenNode): void {
	heap.push(node)
	let index = heap.length - 1
	while (index > 0) {
		const parent = Math.floor((index - 1) / 2)
		if (heap[parent]!.priority <= node.priority) break
		heap[index] = heap[parent]!
		index = parent
	}
	heap[index] = node
}

function popOpen(heap: OpenNode[]): OpenNode | undefined {
	const first = heap[0]
	const last = heap.pop()
	if (first === undefined || last === undefined || heap.length === 0)
		return first
	let index = 0
	while (true) {
		const left = index * 2 + 1
		const right = left + 1
		if (left >= heap.length) break
		const child =
			right < heap.length && heap[right]!.priority < heap[left]!.priority
				? right
				: left
		if (heap[child]!.priority >= last.priority) break
		heap[index] = heap[child]!
		index = child
	}
	heap[index] = last
	return first
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.max(minimum, Math.min(maximum, value))
}
