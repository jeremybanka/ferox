import type { WallTraversalSnapshot } from "../src/arena-protocol.ts"
import type { ArenaSurfaceContact } from "../src/ArenaWorld.ts"
import {
	jumpCountAfterWallContact,
	WALL_MINIMUM_INCLINATION_RADIANS,
	WALL_RUN_EXIT_SPEED,
	wallRunVelocityQualifies,
} from "../src/WallTraversal.ts"

export type AuthoritativeMovementInput = Readonly<{
	contact: ArenaSurfaceContact | null
	crouching: boolean
	jump: 0 | 1 | 2
	sliding: boolean
	velocity: readonly [number, number, number]
	wallTraversal: WallTraversalSnapshot
}>

export type AuthoritativeMovementState = Readonly<{
	jump: 0 | 1 | 2
	sliding: boolean
	wallTraversal: WallTraversalSnapshot
}>

export function reconcileAuthoritativeMovement(
	input: AuthoritativeMovementInput,
): AuthoritativeMovementState {
	const contact = input.contact
	const hasTraversableContact =
		!input.crouching &&
		contact !== null &&
		contact.inclinationRadians >= WALL_MINIMUM_INCLINATION_RADIANS
	let mode: WallTraversalSnapshot["mode"] = "none"
	if (hasTraversableContact && input.wallTraversal.mode === "slide") {
		mode = "slide"
	} else if (hasTraversableContact && input.wallTraversal.mode === "run") {
		mode = wallRunVelocityQualifies(
			input.velocity,
			contact.normal,
			WALL_RUN_EXIT_SPEED,
		)
			? "run"
			: "slide"
	}
	const wallTraversal: WallTraversalSnapshot =
		mode === "none" || contact === null
			? { mode: "none", normal: [0, 0, 0] }
			: { mode, normal: [...contact.normal] }
	return {
		jump: jumpCountAfterWallContact(mode !== "none", input.jump),
		sliding: mode === "none" && input.sliding,
		wallTraversal,
	}
}
