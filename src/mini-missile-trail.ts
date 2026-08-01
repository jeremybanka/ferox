import {
	MINI_MISSILE_TRAIL_LIFETIME_SECONDS,
	MINI_MISSILE_TRAIL_MAX_POINTS,
	MINI_MISSILE_TRAIL_SAMPLE_SPACING,
} from "./game-constants.ts"

export type MiniMissileTrailPhase = "falling" | "powered"

export type MiniMissileTrailPoint = Readonly<{
	phase: MiniMissileTrailPhase
	position: readonly [number, number, number]
	sampledAt: number
}>

export type MiniMissileTrailState = Readonly<{
	points: readonly MiniMissileTrailPoint[]
}>

export function createMiniMissileTrail(): MiniMissileTrailState {
	return { points: [] }
}

export function trimMiniMissileTrail(
	state: MiniMissileTrailState,
	now: number,
): MiniMissileTrailState {
	const oldestSample = now - MINI_MISSILE_TRAIL_LIFETIME_SECONDS
	const firstRetained = state.points.findIndex(
		(point) => point.sampledAt >= oldestSample,
	)
	if (firstRetained === -1)
		return state.points.length === 0 ? state : createMiniMissileTrail()
	if (firstRetained === 0) return state
	return { points: state.points.slice(firstRetained) }
}

export function appendMiniMissileTrail(
	state: MiniMissileTrailState,
	position: readonly [number, number, number],
	sampledAt: number,
	phase: MiniMissileTrailPhase,
): MiniMissileTrailState {
	const trimmed = trimMiniMissileTrail(state, sampledAt)
	const previous = trimmed.points.at(-1)
	if (
		previous !== undefined &&
		previous.phase === phase &&
		distance(previous.position, position) < MINI_MISSILE_TRAIL_SAMPLE_SPACING
	)
		return trimmed

	const points = [
		...trimmed.points,
		{
			phase,
			position: [...position],
			sampledAt,
		} satisfies MiniMissileTrailPoint,
	]
	return {
		points: points.slice(-MINI_MISSILE_TRAIL_MAX_POINTS),
	}
}

export function resetMiniMissileTrail(): MiniMissileTrailState {
	return createMiniMissileTrail()
}

function distance(
	from: readonly [number, number, number],
	to: readonly [number, number, number],
): number {
	return Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2])
}
