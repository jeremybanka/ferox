import { PLAYER_AIR_CONTROL_ACCELERATION } from "./game-constants.ts"
import type { PlanarVelocity } from "./SlidePhysics.ts"

export type AirControlOwner =
	| "grapple"
	| "mantle"
	| "ordinary"
	| "slide"
	| "wall"

export const AIR_CONTROL_PHYSICS = {
	acceleration: PLAYER_AIR_CONTROL_ACCELERATION,
	directionEpsilon: 1e-6,
} as const

/** Generic air control belongs only to ordinary airborne movement. */
export function airControlOwner(
	options: Readonly<{
		grappleAttached: boolean
		mantling: boolean
		sliding: boolean
		wallTraversal: boolean
	}>,
): AirControlOwner {
	if (options.grappleAttached) return "grapple"
	if (options.mantling) return "mantle"
	if (options.sliding) return "slide"
	if (options.wallTraversal) return "wall"
	return "ordinary"
}

/**
 * Adds bounded, delta-based steering without replacing or clamping momentum.
 * Direction magnitude is intentionally normalized so cardinal and diagonal
 * semantic inputs receive equal authority.
 */
export function applyAirControl(
	velocity: PlanarVelocity,
	desiredDirection: PlanarVelocity | null,
	delta: number,
	owner: AirControlOwner,
): PlanarVelocity {
	if (owner !== "ordinary" || desiredDirection === null) return velocity
	if (
		![velocity.x, velocity.z, desiredDirection.x, desiredDirection.z].every(
			Number.isFinite,
		)
	)
		return velocity
	const magnitude = Math.hypot(desiredDirection.x, desiredDirection.z)
	if (magnitude < AIR_CONTROL_PHYSICS.directionEpsilon) return velocity
	const impulse =
		AIR_CONTROL_PHYSICS.acceleration *
		Math.max(0, Number.isFinite(delta) ? delta : 0)
	return {
		x: velocity.x + (desiredDirection.x / magnitude) * impulse,
		z: velocity.z + (desiredDirection.z / magnitude) * impulse,
	}
}
