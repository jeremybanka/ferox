import { MOVEMENT_INPUT_DEADZONE } from "./MovementCore.ts"
import type { PlanarVelocity } from "./SlidePhysics.ts"
import type { JumpCount } from "./JumpPhysics.ts"

export const DIRECTIONAL_DOUBLE_JUMP = {
	maximumRedirectRadians: (Math.PI * 5) / 12,
	minimumMomentumSpeed: 0.001,
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

/** Turns existing momentum toward input without introducing planar speed. */
export function steerDoubleJumpMomentum(
	velocity: PlanarVelocity,
	desiredDirection: PlanarVelocity | null,
): PlanarVelocity {
	const speed = Math.hypot(velocity.x, velocity.z)
	if (
		speed < DIRECTIONAL_DOUBLE_JUMP.minimumMomentumSpeed ||
		!desiredDirection
	) {
		return velocity
	}
	const desiredLength = Math.hypot(desiredDirection.x, desiredDirection.z)
	if (desiredLength === 0) return velocity

	const velocityAngle = Math.atan2(velocity.z, velocity.x)
	const desiredAngle = Math.atan2(
		desiredDirection.z / desiredLength,
		desiredDirection.x / desiredLength,
	)
	const signedDifference = Math.atan2(
		Math.sin(desiredAngle - velocityAngle),
		Math.cos(desiredAngle - velocityAngle),
	)
	const redirect = Math.max(
		-DIRECTIONAL_DOUBLE_JUMP.maximumRedirectRadians,
		Math.min(DIRECTIONAL_DOUBLE_JUMP.maximumRedirectRadians, signedDifference),
	)
	const resultAngle = velocityAngle + redirect
	return { x: Math.cos(resultAngle) * speed, z: Math.sin(resultAngle) * speed }
}

export function applyDirectionalDoubleJump(
	velocity: PlanarVelocity,
	desiredDirection: PlanarVelocity | null,
	impulse: JumpCount | null,
): PlanarVelocity {
	return impulse === 2
		? steerDoubleJumpMomentum(velocity, desiredDirection)
		: velocity
}
