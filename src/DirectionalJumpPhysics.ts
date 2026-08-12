import { MOVEMENT_INPUT_DEADZONE } from "./MovementCore.ts"
import type { PlanarVelocity } from "./SlidePhysics.ts"
import type { JumpCount } from "./JumpPhysics.ts"

export const DIRECTIONAL_DOUBLE_JUMP = {
	directionEpsilon: 1e-6,
	planarImpulseSpeed: 3.2,
} as const

export function isBoundedDirectionalJumpDirection(
	direction: PlanarVelocity,
): boolean {
	if (![direction.x, direction.z].every(Number.isFinite)) return false
	if (direction.x === 0 && direction.z === 0) return true
	const magnitude = Math.hypot(direction.x, direction.z)
	return (
		magnitude >= DIRECTIONAL_DOUBLE_JUMP.directionEpsilon &&
		magnitude <= 1 + DIRECTIONAL_DOUBLE_JUMP.directionEpsilon
	)
}

export function normalizeDirectionalJumpDirection(
	direction: PlanarVelocity,
): PlanarVelocity | null {
	if (![direction.x, direction.z].every(Number.isFinite)) return null
	const magnitude = Math.hypot(direction.x, direction.z)
	if (
		!Number.isFinite(magnitude) ||
		magnitude < DIRECTIONAL_DOUBLE_JUMP.directionEpsilon
	)
		return null
	return { x: direction.x / magnitude, z: direction.z / magnitude }
}

export function cameraRelativeMovementDirection(
	input: Readonly<{ x: number; y: number }>,
	cameraYaw: number,
): PlanarVelocity | null {
	const inputMagnitude = Math.hypot(input.x, input.y)
	if (inputMagnitude < MOVEMENT_INPUT_DEADZONE) return null
	const inputX = input.x / inputMagnitude
	const inputY = input.y / inputMagnitude
	const forwardX = -Math.sin(cameraYaw)
	const forwardZ = -Math.cos(cameraYaw)
	const rightX = Math.cos(cameraYaw)
	const rightZ = -Math.sin(cameraYaw)
	return {
		x: forwardX * -inputY + rightX * inputX,
		z: forwardZ * -inputY + rightZ * inputX,
	}
}

/** Resolves a bounded horizontal impulse without modifying existing momentum. */
export function directionalDoubleJumpImpulse(
	desiredDirection: PlanarVelocity | null,
): PlanarVelocity {
	if (!desiredDirection) return { x: 0, z: 0 }
	const normalized = normalizeDirectionalJumpDirection(desiredDirection)
	if (normalized === null) return { x: 0, z: 0 }
	return {
		x: normalized.x * DIRECTIONAL_DOUBLE_JUMP.planarImpulseSpeed,
		z: normalized.z * DIRECTIONAL_DOUBLE_JUMP.planarImpulseSpeed,
	}
}

export function applyDirectionalDoubleJump(
	velocity: PlanarVelocity,
	desiredDirection: PlanarVelocity | null,
	impulse: JumpCount | null,
): PlanarVelocity {
	if (impulse !== 2 || !desiredDirection) return velocity
	const planarImpulse = directionalDoubleJumpImpulse(desiredDirection)
	return {
		x: velocity.x + planarImpulse.x,
		z: velocity.z + planarImpulse.z,
	}
}
