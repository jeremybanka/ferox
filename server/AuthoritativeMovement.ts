import type {
	MantleSnapshot,
	WallTraversalSnapshot,
} from "../src/arena-protocol.ts"
import type { ArenaLedge, ArenaSurfaceContact } from "../src/ArenaWorld.ts"
import {
	applyDirectionalDoubleJump,
	directionalDoubleJumpImpulse,
} from "../src/DirectionalJumpPhysics.ts"
import {
	PLAYER_AIR_CONTROL_ACCELERATION,
	PLAYER_EXTERNAL_IMPULSE_SPEED_LIMIT,
	PLAYER_STANDING_ACCELERATION,
	PLAYER_STANDING_SPEED_LIMIT,
} from "../src/game-constants.ts"
import {
	INITIAL_MANTLE_STATE,
	stepMantleTraversal,
	type MantleState,
} from "../src/MantleTraversal.ts"
import {
	SLIDE_PHYSICS,
	slopeNormalUpDotFromTerrainGradient,
	stepSlidePhysics,
	type TerrainGradient,
} from "../src/SlidePhysics.ts"
import { JUMP_PHYSICS } from "../src/JumpPhysics.ts"
import {
	INITIAL_WALL_TRAVERSAL_STATE,
	jumpCountAfterWallContact,
	stepWallTraversal,
	WALL_TRAVERSAL_MAXIMUM_PLANAR_SPEED,
	type WallTraversalState,
} from "../src/WallTraversal.ts"

export const AUTHORITATIVE_TRAVERSAL_TRAVEL_TOLERANCE = 0.12
export const AUTHORITATIVE_GROUND_ACCELERATION = PLAYER_STANDING_ACCELERATION
export const AUTHORITATIVE_AIR_ACCELERATION = PLAYER_AIR_CONTROL_ACCELERATION
export const AUTHORITATIVE_VELOCITY_TOLERANCE = 0.35
export const AUTHORITATIVE_EXTERNAL_SPEED_LIMIT =
	PLAYER_EXTERNAL_IMPULSE_SPEED_LIMIT

export function applyAuthoritativeExternalImpulse(
	velocity: readonly [number, number, number],
	impulse: readonly [number, number, number],
): readonly [number, number, number] {
	if (![...velocity, ...impulse].every(Number.isFinite)) return velocity
	const next = [
		velocity[0] + impulse[0],
		velocity[1] + impulse[1],
		velocity[2] + impulse[2],
	] as const
	const speed = Math.hypot(...next)
	if (speed <= AUTHORITATIVE_EXTERNAL_SPEED_LIMIT || speed <= Number.EPSILON)
		return next
	const scale = AUTHORITATIVE_EXTERNAL_SPEED_LIMIT / speed
	return [next[0] * scale, next[1] * scale, next[2] * scale]
}

export type AuthoritativeJumpSignal = Readonly<{
	direction: readonly [number, number] | null
	impulse: 1 | 2 | null
	sequence: number
}>

/**
 * Consumes each strictly newer jump sequence once. A gap is consumed without
 * applying its impulse so a client cannot skip ahead and later replay it.
 */
export function consumeAuthoritativeJumpSignal(
	previousSequence: number,
	reported: AuthoritativeJumpSignal,
): AuthoritativeJumpSignal {
	if (reported.sequence <= previousSequence)
		return { direction: null, impulse: null, sequence: previousSequence }
	const acceptsEdge = reported.sequence === previousSequence + 1
	return {
		direction:
			acceptsEdge && reported.impulse === 2 ? reported.direction : null,
		impulse: acceptsEdge ? reported.impulse : null,
		sequence: reported.sequence,
	}
}

export function authoritativeTraversalSpeedLimit(
	options: Readonly<{
		previousSliding: boolean
		previousSurfaceSliding: boolean
		previousWallTraversal: WallTraversalState
	}>,
): number | null {
	if (
		options.previousSliding ||
		options.previousSurfaceSliding ||
		options.previousWallTraversal.mode === "crouch-slide"
	)
		return SLIDE_PHYSICS.maximumSpeed
	if (options.previousWallTraversal.mode !== "none")
		return WALL_TRAVERSAL_MAXIMUM_PLANAR_SPEED
	return null
}

/** Bounds a traversal packet's requested displacement to elapsed server time. */
export function limitAuthoritativeTraversalDestination(
	start: readonly [number, number, number],
	desired: readonly [number, number, number],
	maximumSpeed: number | null,
	delta: number,
): readonly [number, number, number] {
	if (maximumSpeed === null) return desired
	const displacement = [
		desired[0] - start[0],
		desired[1] - start[1],
		desired[2] - start[2],
	] as const
	const distance = Math.hypot(...displacement)
	const maximumDistance =
		maximumSpeed * Math.max(0, delta) + AUTHORITATIVE_TRAVERSAL_TRAVEL_TOLERANCE
	if (distance <= maximumDistance || distance <= 1e-9) return desired
	const scale = maximumDistance / distance
	return [
		start[0] + displacement[0] * scale,
		start[1] + displacement[1] * scale,
		start[2] + displacement[2] * scale,
	]
}

/**
 * Treats replicated ordinary locomotion velocity as desired input, not state.
 * Traversal itself uses the prior server-owned velocity and bypasses this path.
 */
export function limitAuthoritativeDesiredVelocity(
	previous: readonly [number, number, number],
	desired: readonly [number, number, number],
	delta: number,
	grounded = true,
): readonly [number, number, number] {
	const previousSpeed = Math.hypot(previous[0], previous[2])
	const desiredSpeed = Math.hypot(desired[0], desired[2])
	const maximumSpeed = grounded
		? Math.max(previousSpeed, PLAYER_STANDING_SPEED_LIMIT)
		: Number.POSITIVE_INFINITY
	const speedScale =
		desiredSpeed > maximumSpeed ? maximumSpeed / desiredSpeed : 1
	const desiredX = desired[0] * speedScale
	const desiredZ = desired[2] * speedScale
	const differenceX = desiredX - previous[0]
	const differenceZ = desiredZ - previous[2]
	const difference = Math.hypot(differenceX, differenceZ)
	const maximumDifference =
		(grounded
			? AUTHORITATIVE_GROUND_ACCELERATION
			: AUTHORITATIVE_AIR_ACCELERATION) *
			Math.max(0, delta) +
		AUTHORITATIVE_VELOCITY_TOLERANCE
	const scale =
		difference > maximumDifference && difference > 1e-9
			? maximumDifference / difference
			: 1
	return [
		previous[0] + differenceX * scale,
		desired[1],
		previous[2] + differenceZ * scale,
	]
}

export type AuthoritativeMovementInput = Readonly<{
	contact: ArenaSurfaceContact | null
	coyoteDelta?: number
	crouching: boolean
	delta: number
	gravityScale?: number
	grappleAttached?: boolean
	grounded: boolean
	jump: 0 | 1 | 2
	jumpDirection?: readonly [number, number] | null
	jumpImpulse?: 1 | 2 | null
	mantleCandidate?: ArenaLedge | null
	position?: readonly [number, number, number]
	previousCoyoteRemaining?: number | null
	previousGrounded?: boolean
	previousJump?: 0 | 1 | 2
	previousMantle?: MantleState
	previousSliding?: boolean
	previousSurfaceSliding?: boolean
	previousVelocity?: readonly [number, number, number]
	previousWallTraversal: WallTraversalState
	reportedWallTraversal: WallTraversalSnapshot
	resolvedPosition?: readonly [number, number, number]
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
	resolvedPosition: readonly [number, number, number] | null
	sliding: boolean
	surfaceSliding: boolean
	traversalState: WallTraversalState
	velocity: readonly [number, number, number]
	wallTraversal: WallTraversalSnapshot
}>

export function reconcileAuthoritativeMovement(
	input: AuthoritativeMovementInput,
): AuthoritativeMovementState {
	const mantleStep = stepMantleTraversal(
		input.previousMantle ?? INITIAL_MANTLE_STATE,
		{
			blocked: input.crouching || input.grappleAttached === true,
			candidate: input.mantleCandidate ?? null,
			delta: input.delta,
			position: input.position ?? [0, 0, 0],
		},
	)
	if (mantleStep.handled && mantleStep.position !== null) {
		return {
			coyoteRemaining: null,
			jump: input.previousJump ?? input.jump,
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
			resolvedPosition: mantleStep.position,
			sliding: false,
			surfaceSliding: false,
			traversalState: INITIAL_WALL_TRAVERSAL_STATE,
			velocity: mantleStep.velocity,
			wallTraversal: { mode: "none", normal: [0, 0, 0] },
		}
	}
	const previousAuthoritativeMode =
		input.previousWallTraversal.mode !== "none" ||
		input.previousSliding === true ||
		input.previousSurfaceSliding === true
	const currentSteepContact =
		input.contact !== null &&
		input.contact.inclinationRadians > SLIDE_PHYSICS.steepSurfaceRadians + 1e-12
	const currentSteepTerrain =
		input.terrainGradient !== undefined &&
		slopeNormalUpDotFromTerrainGradient(input.terrainGradient) <
			Math.cos(SLIDE_PHYSICS.steepSurfaceRadians) - 1e-12
	const serverOwnsTraversalVelocity =
		input.previousVelocity !== undefined &&
		(previousAuthoritativeMode || currentSteepContact || currentSteepTerrain)
	const reportedJumpDirection =
		input.jumpDirection === null || input.jumpDirection === undefined
			? null
			: { x: input.jumpDirection[0], z: input.jumpDirection[1] }
	const reportedPlanarJumpImpulse =
		input.jumpImpulse === 2
			? directionalDoubleJumpImpulse(reportedJumpDirection)
			: { x: 0, z: 0 }
	const desiredWithoutJumpImpulse = [
		input.velocity[0] - reportedPlanarJumpImpulse.x,
		input.velocity[1],
		input.velocity[2] - reportedPlanarJumpImpulse.z,
	] as const
	const desiredVelocity =
		input.previousVelocity === undefined
			? desiredWithoutJumpImpulse
			: serverOwnsTraversalVelocity
				? input.previousVelocity
				: limitAuthoritativeDesiredVelocity(
						input.previousVelocity,
						desiredWithoutJumpImpulse,
						input.delta,
						input.grounded,
					)
	const traversal = stepWallTraversal(input.previousWallTraversal, {
		blocked: input.grappleAttached === true,
		contact: input.contact,
		crouching: input.crouching,
		delta: input.delta,
		grounded: input.grounded,
		jumpRequested: false,
		velocity: desiredVelocity,
		viewDirection: input.viewDirection,
	})
	const mode = traversal.state.mode
	const serverOwnsVelocity = input.previousVelocity !== undefined
	const terrainVelocity = desiredVelocity
	const terrainSlide =
		input.terrainGradient === undefined
			? null
			: stepSlidePhysics(
					{
						sliding: input.previousSliding ?? false,
						surfaceSliding: false,
						x: terrainVelocity[0],
						z: terrainVelocity[2],
					},
					{
						crouching: input.crouching,
						delta: serverOwnsVelocity ? input.delta : 0,
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
		input.previousJump ?? input.jump,
	)
	let velocity: readonly [number, number, number] =
		mode === "none" && terrainSlide !== null
			? [terrainSlide.x, terrainVelocity[1], terrainSlide.z]
			: traversal.velocity
	if (serverOwnsVelocity && mode === "none") {
		const gravityScale = Math.max(0, input.gravityScale ?? 1)
		velocity = [
			velocity[0],
			input.grounded
				? 0
				: input.previousVelocity![1] -
					JUMP_PHYSICS.gravity * input.delta * gravityScale,
			velocity[2],
		]
	}
	if (input.grounded || mode !== "none") {
		coyoteRemaining = null
	} else if (
		input.previousGrounded === true &&
		(input.jumpImpulse ?? null) === null &&
		(input.previousVelocity?.[1] ?? terrainVelocity[1]) <= 0 &&
		input.previousSliding !== true &&
		input.previousSurfaceSliding !== true &&
		input.previousWallTraversal.mode === "none" &&
		(input.previousMantle ?? INITIAL_MANTLE_STATE).mode === "none" &&
		input.contact === null &&
		(input.mantleCandidate ?? null) === null &&
		!surfaceSliding
	) {
		coyoteRemaining = JUMP_PHYSICS.coyoteTimeSeconds
		jump = 1
	} else if (input.previousGrounded === false && coyoteRemaining !== null) {
		coyoteRemaining -= Math.max(0, input.coyoteDelta ?? input.delta)
		if (coyoteRemaining < 0) coyoteRemaining = null
	}
	const impulse = input.jumpImpulse ?? null
	const acceptsSupportedFirstJump =
		impulse === 1 &&
		mode === "none" &&
		input.previousGrounded === true &&
		(input.previousJump ?? input.jump) === 0
	const acceptsCoyoteFirstJump =
		impulse === 1 &&
		mode === "none" &&
		input.previousGrounded === false &&
		coyoteRemaining !== null &&
		(input.previousJump ?? input.jump) === 1
	const acceptsFirstJump = acceptsSupportedFirstJump || acceptsCoyoteFirstJump
	const acceptsDoubleJump =
		impulse === 2 &&
		mode === "none" &&
		input.previousGrounded === false &&
		(input.previousJump ?? input.jump) === 1
	if (acceptsFirstJump) {
		jump = 1
		coyoteRemaining = null
		velocity = [
			velocity[0],
			JUMP_PHYSICS.jumpVelocity -
				(acceptsCoyoteFirstJump
					? JUMP_PHYSICS.gravity *
						input.delta *
						Math.max(0, input.gravityScale ?? 1)
					: 0),
			velocity[2],
		]
	} else if (acceptsDoubleJump) {
		jump = 2
		coyoteRemaining = null
		const directionalVelocity = applyDirectionalDoubleJump(
			{ x: velocity[0], z: velocity[2] },
			reportedJumpDirection,
			2,
		)
		velocity = [
			directionalVelocity.x,
			JUMP_PHYSICS.doubleJumpVelocity -
				JUMP_PHYSICS.gravity *
					input.delta *
					Math.max(0, input.gravityScale ?? 1),
			directionalVelocity.z,
		]
	}
	if (input.grounded && impulse === null) jump = 0
	return {
		coyoteRemaining: input.grappleAttached === true ? null : coyoteRemaining,
		jump:
			input.grappleAttached === true
				? (input.previousJump ?? input.jump)
				: jump,
		mantle: { active: false, progress: 0, surfaceId: null },
		mantlePosition: null,
		mantleState: INITIAL_MANTLE_STATE,
		resolvedPosition: input.resolvedPosition ?? null,
		sliding:
			input.grappleAttached === true
				? false
				: wallRegularSlide ||
					(mode === "none" &&
						(terrainSlide === null ? input.sliding : terrainSlide.sliding)),
		surfaceSliding: input.grappleAttached === true ? false : surfaceSliding,
		traversalState: traversal.state,
		velocity: input.grappleAttached === true ? input.velocity : velocity,
		wallTraversal:
			input.grappleAttached === true
				? { mode: "none", normal: [0, 0, 0] }
				: wallTraversal,
	}
}
