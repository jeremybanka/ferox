import {
	movementDirectionFromLocalVelocity,
	type MovementDirection,
} from "./MovementDirection.ts"

export type SlideMotion = {
	localVelocityX: number
	localVelocityZ: number
}

export type SlideHeading = {
	localX: number
	localZ: number
}

export const SLIDE_HEADING_MIN_SPEED = 0.35
export const SLIDE_HEADING_RESPONSE = 14

const FORWARD_SLIDE_HEADING = { localX: 0, localZ: -1 } as const

function headingFromMotion(motion: SlideMotion): SlideHeading | null {
	const speed = Math.hypot(motion.localVelocityX, motion.localVelocityZ)
	if (!Number.isFinite(speed) || speed < SLIDE_HEADING_MIN_SPEED) return null
	return {
		localX: motion.localVelocityX / speed,
		localZ: motion.localVelocityZ / speed,
	}
}

/**
 * Creates a stable local-space travel heading. Motion below the presentation
 * threshold intentionally keeps the forward default instead of amplifying
 * near-zero network/physics noise.
 */
export function initialSlideHeading(motion?: SlideMotion): SlideHeading {
	return motion === undefined
		? { ...FORWARD_SLIDE_HEADING }
		: (headingFromMotion(motion) ?? { ...FORWARD_SLIDE_HEADING })
}

/**
 * Tracks the current planar velocity direction along the shortest angular arc.
 * A minimum-speed guard makes a stopped slide retain its last useful heading.
 */
export function stepSlideHeading(
	current: SlideHeading,
	motion: SlideMotion,
	deltaSeconds: number,
): SlideHeading {
	const target = headingFromMotion(motion)
	if (target === null || deltaSeconds <= 0) return current
	const currentAngle = Math.atan2(current.localX, -current.localZ)
	const targetAngle = Math.atan2(target.localX, -target.localZ)
	const angularDistance = Math.atan2(
		Math.sin(targetAngle - currentAngle),
		Math.cos(targetAngle - currentAngle),
	)
	const response = 1 - Math.exp(-SLIDE_HEADING_RESPONSE * deltaSeconds)
	const angle = currentAngle + angularDistance * response
	return { localX: Math.sin(angle), localZ: -Math.cos(angle) }
}

export function slideDirectionFromMotion(
	motion: SlideMotion,
): MovementDirection {
	return movementDirectionFromLocalVelocity({
		x: motion.localVelocityX,
		z: motion.localVelocityZ,
	})
}

export function slideDirectionFromHeading(
	heading: SlideHeading,
): MovementDirection {
	return movementDirectionFromLocalVelocity({
		x: heading.localX,
		z: heading.localZ,
	})
}
