import { MOVEMENT_INPUT_DEADZONE } from "./MovementCore.ts"
import type { PlanarVelocity } from "./SlidePhysics.ts"
import type { JumpCount } from "./JumpPhysics.ts"

export const DIRECTIONAL_DOUBLE_JUMP = {
	planarImpulseSpeed: 3.2,
} as const

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
	const desiredLength = Math.hypot(desiredDirection.x, desiredDirection.z)
	if (desiredLength === 0) return { x: 0, z: 0 }
	const scale = DIRECTIONAL_DOUBLE_JUMP.planarImpulseSpeed / desiredLength
	return {
		x: desiredDirection.x * scale,
		z: desiredDirection.z * scale,
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
