import type { Vector3Tuple } from "./arena-protocol.ts"

export type SmartTargetRef =
	| { id: number; kind: "drone" }
	| { id: string; kind: "pilot" }

export type SmartTargetCandidate = {
	position: Vector3Tuple
	ref: SmartTargetRef
}

export type ProjectedSmartTarget = {
	distance: number
	x: number
	y: number
}

export function pilotSmartTargetCandidate(
	localPlayerId: string | undefined,
	pilotId: string,
	position: Vector3Tuple,
): SmartTargetCandidate | null {
	if (localPlayerId === pilotId) return null
	return { position, ref: { id: pilotId, kind: "pilot" } }
}

export function sameSmartTarget(
	left: SmartTargetRef | null,
	right: SmartTargetRef | null,
): boolean {
	return left?.kind === right?.kind && left?.id === right?.id
}

export function selectBestSmartTarget(
	candidates: readonly SmartTargetCandidate[],
	project: (candidate: SmartTargetCandidate) => ProjectedSmartTarget | null,
): (ProjectedSmartTarget & { ref: SmartTargetRef }) | null {
	let best: (ProjectedSmartTarget & { ref: SmartTargetRef }) | null = null
	for (const candidate of candidates) {
		const projected = project(candidate)
		if (projected === null) continue
		if (best === null || projected.distance < best.distance) {
			best = { ...projected, ref: candidate.ref }
		}
	}
	return best
}
