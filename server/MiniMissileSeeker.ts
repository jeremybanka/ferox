import type {
	MiniMissileTargetRef,
	Vector3Tuple,
} from "../src/arena-protocol.ts"
import {
	MINI_MISSILE_SEEKER_HALF_ANGLE,
	MINI_MISSILE_SEEKER_RANGE,
} from "../src/game-constants.ts"

export type MiniMissileSeekerCandidate = {
	position: Vector3Tuple
	ref: MiniMissileTargetRef
}

type ScoredCandidate = MiniMissileSeekerCandidate & {
	alignment: number
	distance: number
	stableId: string
}

function targetStableId(ref: MiniMissileTargetRef): string {
	return ref.kind === "drone"
		? `drone:${String(ref.id).padStart(12, "0")}`
		: `pilot:${ref.id}`
}

export function sameMiniMissileTarget(
	left: MiniMissileTargetRef | null,
	right: MiniMissileTargetRef | null,
): boolean {
	return left?.kind === right?.kind && left?.id === right?.id
}

function scoreCandidate(
	origin: Vector3Tuple,
	direction: Vector3Tuple,
	candidate: MiniMissileSeekerCandidate,
): ScoredCandidate | null {
	const directionLength = Math.hypot(...direction)
	if (!Number.isFinite(directionLength) || directionLength < 0.5) return null
	const offset: Vector3Tuple = [
		candidate.position[0] - origin[0],
		candidate.position[1] - origin[1],
		candidate.position[2] - origin[2],
	]
	const distance = Math.hypot(...offset)
	if (distance <= 0 || distance > MINI_MISSILE_SEEKER_RANGE) return null
	const alignment =
		(direction[0] * offset[0] +
			direction[1] * offset[1] +
			direction[2] * offset[2]) /
		(directionLength * distance)
	if (alignment < Math.cos(MINI_MISSILE_SEEKER_HALF_ANGLE)) return null
	return {
		...candidate,
		alignment,
		distance,
		stableId: targetStableId(candidate.ref),
	}
}

export function selectMiniMissileSeekerTarget(
	origin: Vector3Tuple,
	direction: Vector3Tuple,
	candidates: readonly MiniMissileSeekerCandidate[],
): MiniMissileSeekerCandidate | null {
	let best: ScoredCandidate | null = null
	for (const candidate of candidates) {
		const scored = scoreCandidate(origin, direction, candidate)
		if (
			scored !== null &&
			(best === null ||
				scored.alignment > best.alignment ||
				(scored.alignment === best.alignment &&
					(scored.distance < best.distance ||
						(scored.distance === best.distance &&
							scored.stableId < best.stableId))))
		) {
			best = scored
		}
	}
	return best === null ? null : { position: best.position, ref: best.ref }
}

export function validateMiniMissileDesignation(
	designation: MiniMissileTargetRef,
	origin: Vector3Tuple,
	direction: Vector3Tuple,
	candidates: readonly MiniMissileSeekerCandidate[],
): MiniMissileSeekerCandidate | null {
	const candidate = candidates.find((entry) =>
		sameMiniMissileTarget(entry.ref, designation),
	)
	return candidate === undefined ||
		scoreCandidate(origin, direction, candidate) === null
		? null
		: candidate
}
