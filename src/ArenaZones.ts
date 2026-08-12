import type { Vector3Tuple } from "./arena-protocol.ts"

export type ArenaGravityBodyKind =
	| "drone"
	| "falling-mini-missile"
	| "grenade"
	| "pilot"
	| "powered-mini-missile"
	| "projectile"
	| "ragdoll"
	| "rail-ballistic"

export type SphericalArenaZone = Readonly<{
	center: Vector3Tuple
	id: string
	radius: number
}>

/**
 * The sphere reaches the terrain at its lower edge, making the volume
 * discoverable on foot while leaving enough vertical space for long inertial
 * arcs. The boundary is inclusive on both client and server.
 */
export const ZERO_GRAVITY_ZONE: SphericalArenaZone = {
	center: [72, 16, -112],
	id: "zero-gravity-northeast",
	radius: 18,
}

/**
 * Gravity policy for existing bodies. Self-propelled drones/missiles and
 * bodies that never integrate gravity remain unchanged. Presentation-only
 * ragdolls retain their authored fall so death timing stays readable.
 */
export function zeroGravityAffectsBody(kind: ArenaGravityBodyKind): boolean {
	return (
		kind === "pilot" ||
		kind === "grenade" ||
		kind === "falling-mini-missile" ||
		kind === "rail-ballistic"
	)
}

export function pointInsideSphericalArenaZone(
	point: readonly [number, number, number],
	zone: SphericalArenaZone,
): boolean {
	const x = point[0] - zone.center[0]
	const y = point[1] - zone.center[1]
	const z = point[2] - zone.center[2]
	return x * x + y * y + z * z <= zone.radius * zone.radius
}

export function pointInsideZeroGravityZone(
	point: readonly [number, number, number],
): boolean {
	return pointInsideSphericalArenaZone(point, ZERO_GRAVITY_ZONE)
}

/**
 * Gravity is sampled at the beginning of each simulation step. A body crossing
 * the boundary keeps its complete entry velocity; the next step applies the
 * new gravity state. This avoids client/server disagreement from frame-local
 * substep roots while remaining deterministic for high-speed crossings.
 */
export function arenaGravityScaleAtStepStart(
	kind: ArenaGravityBodyKind,
	position: readonly [number, number, number],
): 0 | 1 {
	return zeroGravityAffectsBody(kind) && pointInsideZeroGravityZone(position)
		? 0
		: 1
}
