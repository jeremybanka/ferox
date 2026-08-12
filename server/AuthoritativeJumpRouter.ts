import type { AuthoritativeJumpSignal } from "./AuthoritativeMovement.ts"
import { consumeAuthoritativeJumpSignal } from "./AuthoritativeMovement.ts"

export type AuthoritativeJumpRouteState = Readonly<{
	lifeSequence: number
	sequence: number
}>

export type AuthoritativeJumpRoute = Readonly<{
	grapple: AuthoritativeJumpSignal | null
	movement: AuthoritativeJumpSignal | null
	state: AuthoritativeJumpRouteState
}>

export function initialAuthoritativeJumpRoute(
	lifeSequence: number,
): AuthoritativeJumpRouteState {
	return { lifeSequence, sequence: 0 }
}

/**
 * Owns the per-life jump edge sequence and sends each packet to exactly one
 * authority. Sequence gaps are consumed without an impulse; replayed or lower
 * sequences remain inert even if attachment changes between packets.
 */
export function routeAuthoritativeJumpSignal(
	previous: AuthoritativeJumpRouteState,
	input: Readonly<{
		grappleAttached: boolean
		lifeSequence: number
		reported: AuthoritativeJumpSignal
	}>,
): AuthoritativeJumpRoute {
	const active =
		input.lifeSequence === previous.lifeSequence
			? previous
			: initialAuthoritativeJumpRoute(input.lifeSequence)
	const consumed = consumeAuthoritativeJumpSignal(
		active.sequence,
		input.reported,
	)
	return {
		grapple: input.grappleAttached ? consumed : null,
		movement: input.grappleAttached ? null : consumed,
		state: {
			lifeSequence: input.lifeSequence,
			sequence: consumed.sequence,
		},
	}
}
