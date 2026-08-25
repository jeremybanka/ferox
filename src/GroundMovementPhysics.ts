import {
	PLAYER_CROUCH_ACCELERATION,
	PLAYER_STANDING_ACCELERATION,
} from "./game-constants.ts"
import { limitHorizontalSpeed, type PlanarVelocity } from "./SlidePhysics.ts"

export const GROUND_MOVEMENT_PHYSICS = {
	inputFriction: 1.7,
	neutralFriction: 8.5,
} as const

/** Applies the single standing acceleration model, friction, and grounded cap. */
export function stepGroundMovement(
	velocity: PlanarVelocity,
	options: Readonly<{
		crouching: boolean
		delta: number
		desiredDirection: PlanarVelocity | null
	}>,
): PlanarVelocity {
	const delta = Math.max(0, Number.isFinite(options.delta) ? options.delta : 0)
	const magnitude =
		options.desiredDirection === null
			? 0
			: Math.hypot(options.desiredDirection.x, options.desiredDirection.z)
	let x = velocity.x
	let z = velocity.z
	if (magnitude > 1e-6 && options.desiredDirection !== null) {
		const acceleration = options.crouching
			? PLAYER_CROUCH_ACCELERATION
			: PLAYER_STANDING_ACCELERATION
		x += (options.desiredDirection.x / magnitude) * acceleration * delta
		z += (options.desiredDirection.z / magnitude) * acceleration * delta
	}
	const friction =
		magnitude > 1e-6
			? GROUND_MOVEMENT_PHYSICS.inputFriction
			: GROUND_MOVEMENT_PHYSICS.neutralFriction
	const damping = Math.exp(-friction * delta)
	return limitHorizontalSpeed(
		{ x: x * damping, z: z * damping },
		{ crouching: options.crouching, grounded: true, sliding: false },
	)
}
