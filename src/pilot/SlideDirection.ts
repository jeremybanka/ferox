import {
	movementDirectionFromLocalVelocity,
	type MovementDirection,
} from "./MovementDirection.ts"

export type SlideMotion = {
	localVelocityX: number
	localVelocityZ: number
}

export function slideDirectionFromMotion(
	motion: SlideMotion,
): MovementDirection {
	return movementDirectionFromLocalVelocity({
		x: motion.localVelocityX,
		z: motion.localVelocityZ,
	})
}
