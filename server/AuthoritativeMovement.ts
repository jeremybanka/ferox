import type {
	MantleSnapshot,
	WallTraversalSnapshot,
} from "../src/arena-protocol.ts"
import type { ArenaLedge, ArenaSurfaceContact } from "../src/ArenaWorld.ts"
import {
	INITIAL_MANTLE_STATE,
	stepMantleTraversal,
	type MantleState,
} from "../src/MantleTraversal.ts"
import { stepSlidePhysics, type TerrainGradient } from "../src/SlidePhysics.ts"
import { JUMP_PHYSICS } from "../src/JumpPhysics.ts"
import {
	INITIAL_WALL_TRAVERSAL_STATE,
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
	mantleCandidate?: ArenaLedge | null
	position?: readonly [number, number, number]
	previousCoyoteRemaining?: number | null
	previousGrounded?: boolean
	previousMantle?: MantleState
	previousSliding?: boolean
	previousWallTraversal: WallTraversalState
	reportedWallTraversal: WallTraversalSnapshot
	sliding: boolean
	terrainGradient?: TerrainGradient
	velocity: readonly [number, number, number]
	viewDirection: readonly [number, number, number]
}>

export type AuthoritativeMovementState = Readonly<{
	jump: 0 | 1 | 2
	coyoteRemaining: number | null
	mantle: MantleSnapshot
	mantlePosition: readonly [number, number, number] | null
	mantleState: MantleState
	sliding: boolean
	surfaceSliding: boolean
	traversalState: WallTraversalState
	wallTraversal: WallTraversalSnapshot
}>

export function reconcileAuthoritativeMovement(
	input: AuthoritativeMovementInput,
): AuthoritativeMovementState {
	const mantleStep = stepMantleTraversal(
		input.previousMantle ?? INITIAL_MANTLE_STATE,
		{
			blocked: input.crouching,
			candidate: input.mantleCandidate ?? null,
			delta: input.delta,
			position: input.position ?? [0, 0, 0],
		},
	)
	if (mantleStep.handled && mantleStep.position !== null) {
		return {
			coyoteRemaining: null,
			jump: input.jump,
			mantle:
				mantleStep.state.mode === "mantle"
					? {
							active: true,
							progress: mantleStep.progress,
							surfaceId: mantleStep.state.surfaceId,
						}
					: { active: false, progress: 0, surfaceId: null },
			mantlePosition: mantleStep.position,
			mantleState: mantleStep.state,
			sliding: false,
			surfaceSliding: false,
			traversalState: INITIAL_WALL_TRAVERSAL_STATE,
			wallTraversal: { mode: "none", normal: [0, 0, 0] },
		}
	}
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
	const terrainSlide =
		input.terrainGradient === undefined
			? null
			: stepSlidePhysics(
					{
						sliding: input.previousSliding ?? false,
						surfaceSliding: false,
						x: input.velocity[0],
						z: input.velocity[2],
					},
					{
						crouching: input.crouching,
						delta: 0,
						grounded: input.grounded,
						terrainGradient: input.terrainGradient,
					},
				)
	const surfaceSliding =
		mode === "none" && terrainSlide?.surfaceSliding === true
	const wallRegularSlide = mode === "crouch-slide"
	const wallTraversal: WallTraversalSnapshot =
		surfaceSliding && input.terrainGradient !== undefined
			? (() => {
					const gradient = input.terrainGradient
					const length = Math.hypot(gradient.x, 1, gradient.z)
					return {
						mode: "slide" as const,
						normal: [-gradient.x / length, 1 / length, -gradient.z / length],
					}
				})()
			: mode === "none" || mode === "crouch-slide"
				? { mode: "none", normal: [0, 0, 0] }
				: { mode, normal: [...traversal.state.normal] }
	let coyoteRemaining = input.previousCoyoteRemaining ?? null
	let jump = jumpCountAfterWallContact(
		traversal.resetJumpAvailability,
		input.jump,
	)
	if (input.grounded || mode !== "none") {
		coyoteRemaining = null
	} else if (
		input.previousGrounded === true &&
		input.velocity[1] <= 0 &&
		input.previousSliding !== true &&
		!surfaceSliding
	) {
		coyoteRemaining = JUMP_PHYSICS.coyoteTimeSeconds
	} else if (input.previousGrounded === false && coyoteRemaining !== null) {
		coyoteRemaining -= Math.max(0, input.delta)
		if (coyoteRemaining < 0) coyoteRemaining = null
	}
	if (
		input.previousGrounded === false &&
		input.velocity[1] > 0 &&
		input.jump === 1
	) {
		if (coyoteRemaining !== null) coyoteRemaining = null
		else jump = 2
	}
	return {
		coyoteRemaining,
		jump,
		mantle: { active: false, progress: 0, surfaceId: null },
		mantlePosition: null,
		mantleState: INITIAL_MANTLE_STATE,
		sliding:
			wallRegularSlide ||
			(mode === "none" &&
				(terrainSlide === null ? input.sliding : terrainSlide.sliding)),
		surfaceSliding,
		traversalState: traversal.state,
		wallTraversal,
	}
}
