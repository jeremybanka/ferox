import type { JumpDirection, JumpImpulse } from "../src/arena-protocol.ts"
import {
	directionalDoubleJumpImpulse,
	isBoundedDirectionalJumpDirection,
} from "../src/DirectionalJumpPhysics.ts"
import {
	canFollowGroundContour,
	JUMP_PHYSICS,
	type JumpCount,
} from "../src/JumpPhysics.ts"

export type AuthoritativeGrappleJumpInput = Readonly<{
	groundedBefore: boolean
	jumpCount: JumpCount
	requestedDirection: JumpDirection
	requestedImpulse: JumpImpulse
}>

export type AuthoritativeGrappleJump = Readonly<{
	acceptedDirection: JumpDirection
	acceptedImpulse: JumpImpulse
	instantaneousVerticalVelocity: number | null
	jumpCount: JumpCount
}>

export type AuthoritativeGrappleGroundTransition = Readonly<{
	applyGravity: boolean
	followsGroundContour: boolean
}>

export type AuthoritativeGrappleJumpEdge = Readonly<{
	lastObservedSequence: number
	requestedDirection: JumpDirection
	requestedImpulse: JumpImpulse
}>

export function observeAuthoritativeGrappleJumpEdge(input: {
	lastObservedSequence: number
	requestedDirection: JumpDirection
	requestedImpulse: JumpImpulse
	sequence: number
}): AuthoritativeGrappleJumpEdge {
	const isNew =
		input.requestedImpulse !== null &&
		input.sequence > input.lastObservedSequence
	return {
		lastObservedSequence: Math.max(input.lastObservedSequence, input.sequence),
		requestedDirection:
			isNew && input.requestedImpulse === 2 ? input.requestedDirection : null,
		requestedImpulse: isNew ? input.requestedImpulse : null,
	}
}

/**
 * Accepts only an explicit jump edge that is legal from authoritative state.
 * The replicated jump count is intentionally absent: it describes client
 * state and cannot distinguish a jump from an ordinary ledge departure.
 */
export function reconcileAuthoritativeGrappleJump(
	input: AuthoritativeGrappleJumpInput,
): AuthoritativeGrappleJump {
	const jumpCount = input.groundedBefore ? 0 : input.jumpCount
	if (input.requestedImpulse === 1 && input.groundedBefore) {
		return {
			acceptedDirection: null,
			acceptedImpulse: 1,
			instantaneousVerticalVelocity: JUMP_PHYSICS.jumpVelocity,
			jumpCount: 1,
		}
	}
	if (
		input.requestedImpulse === 2 &&
		!input.groundedBefore &&
		jumpCount === 1 &&
		input.requestedDirection !== null &&
		isBoundedDirectionalJumpDirection({
			x: input.requestedDirection[0],
			z: input.requestedDirection[1],
		})
	) {
		return {
			acceptedDirection: input.requestedDirection,
			acceptedImpulse: 2,
			instantaneousVerticalVelocity: JUMP_PHYSICS.doubleJumpVelocity,
			jumpCount: 2,
		}
	}
	return {
		acceptedDirection: null,
		acceptedImpulse: null,
		instantaneousVerticalVelocity: null,
		jumpCount,
	}
}

export function applyAuthoritativeGrappleJumpPlanarVelocity(
	velocity: Readonly<{ x: number; z: number }>,
	jump: AuthoritativeGrappleJump,
): { x: number; z: number } {
	const impulse = authoritativeGrappleJumpPlanarImpulse(jump)
	return { x: velocity.x + impulse.x, z: velocity.z + impulse.z }
}

export function authoritativeGrappleJumpPlanarImpulse(
	jump: AuthoritativeGrappleJump,
): { x: number; z: number } {
	if (jump.acceptedImpulse !== 2 || jump.acceptedDirection === null)
		return { x: 0, z: 0 }
	return directionalDoubleJumpImpulse({
		x: jump.acceptedDirection[0],
		z: jump.acceptedDirection[1],
	})
}

/**
 * Determines gravity from authoritative terrain rather than the replicated
 * jump count. A first jump starts from the ground without same-frame gravity;
 * an airborne step or a real contour break applies gravity before integration.
 */
export function reconcileAuthoritativeGrappleGroundTransition(input: {
	acceptedImpulse: JumpImpulse
	groundAfter: number
	groundBefore: number
	groundedBefore: boolean
	groundMidpoint: number
}): AuthoritativeGrappleGroundTransition {
	if (!input.groundedBefore)
		return { applyGravity: true, followsGroundContour: false }
	if (input.acceptedImpulse !== null)
		return { applyGravity: false, followsGroundContour: false }
	const followsGroundContour = canFollowGroundContour(
		input.groundBefore,
		input.groundMidpoint,
		input.groundAfter,
	)
	return {
		applyGravity: !followsGroundContour,
		followsGroundContour,
	}
}
