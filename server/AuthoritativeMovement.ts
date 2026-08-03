import type { WallTraversalSnapshot } from "../src/arena-protocol.ts"
import type { ArenaSurfaceContact } from "../src/ArenaWorld.ts"
import {
	jumpCountAfterWallContact,
	stepWallTraversal,
	type WallTraversalState,
} from "../src/WallTraversal.ts"

export type AuthoritativeMovementInput = Readonly<{
	contact: ArenaSurfaceContact | null
	crouching: boolean
	delta: number
	grounded: boolean
	jump: 0 | 1 | 2
	previousWallTraversal: WallTraversalState
	reportedWallTraversal: WallTraversalSnapshot
	sliding: boolean
	velocity: readonly [number, number, number]
	viewDirection: readonly [number, number, number]
}>

export type AuthoritativeMovementState = Readonly<{
	jump: 0 | 1 | 2
	sliding: boolean
	traversalState: WallTraversalState
	wallTraversal: WallTraversalSnapshot
}>

export function reconcileAuthoritativeMovement(
	input: AuthoritativeMovementInput,
): AuthoritativeMovementState {
	const traversal = stepWallTraversal(input.previousWallTraversal, {
		blocked: false,
		contact: input.contact,
		crouching: input.crouching,
		delta: input.delta,
		grounded: input.grounded,
		jumpRequested: false,
		velocity: input.velocity,
		viewDirection: input.viewDirection,
	})
	const mode = traversal.state.mode
	const wallTraversal: WallTraversalSnapshot =
		mode === "none"
			? { mode: "none", normal: [0, 0, 0] }
			: { mode, normal: [...traversal.state.normal] }
	return {
		jump: jumpCountAfterWallContact(
			traversal.resetJumpAvailability,
			input.jump,
		),
		sliding: mode === "none" && input.sliding,
		traversalState: traversal.state,
		wallTraversal,
	}
}
