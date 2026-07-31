export type MovementDirection = "backward" | "forward" | "left" | "right"

export function movementDirectionFromLocalVelocity(
	velocity: { x: number; z: number },
	fallback: MovementDirection = "forward",
): MovementDirection {
	if (Math.abs(velocity.x) < 0.000_1 && Math.abs(velocity.z) < 0.000_1) {
		return fallback
	}
	if (Math.abs(velocity.x) > Math.abs(velocity.z)) {
		return velocity.x > 0 ? "right" : "left"
	}
	return velocity.z < 0 ? "forward" : "backward"
}
