import type { ArenaSurfaceContact } from "./ArenaWorld.ts"
import { PLAYER_SPRINT_SPEED_LIMIT } from "./game-constants.ts"
import { SLIDE_PHYSICS, stepContactSlidePhysics } from "./SlidePhysics.ts"

export const WALL_MINIMUM_INCLINATION_RADIANS = (80 * Math.PI) / 180
export const WALL_RUN_ENTRY_SPEED = 7.2
export const WALL_RUN_EXIT_SPEED = 5.4
export const WALL_SLIDE_VIEW_ANGLE_RADIANS = (20 * Math.PI) / 180
export const WALL_SLIDE_VIEW_COSINE = Math.cos(WALL_SLIDE_VIEW_ANGLE_RADIANS)
export const WALL_RUN_MAXIMUM_SECONDS = 1.65
export const WALL_RUN_DOWNWARD_SPEED = 1.25
export const WALL_SLIDE_DOWNWARD_SPEED = 2.25
export const WALL_SLIDE_TANGENTIAL_DAMPING_PER_SECOND = -Math.log(0.78) * 60
export const WALL_JUMP_OUTWARD_SPEED = 6.8
export const WALL_JUMP_UPWARD_SPEED = 7.6
export const WALL_RECONTACT_SECONDS = 0.22
export const WALL_TRAVERSAL_MAXIMUM_PLANAR_SPEED =
	PLAYER_SPRINT_SPEED_LIMIT * 1.25

export type WallTraversalMode = "crouch-slide" | "none" | "run" | "slide"

export type WallTraversalState = Readonly<{
	elapsed: number
	mode: WallTraversalMode
	normal: readonly [number, number, number]
	recontactRemaining: number
	requiresContactRelease: boolean
	surfaceId: string | null
}>

export const INITIAL_WALL_TRAVERSAL_STATE: WallTraversalState = {
	elapsed: 0,
	mode: "none",
	normal: [0, 0, 0],
	recontactRemaining: 0,
	requiresContactRelease: false,
	surfaceId: null,
}

export type WallTraversalInput = Readonly<{
	blocked: boolean
	contact: ArenaSurfaceContact | null
	crouching: boolean
	delta: number
	grounded: boolean
	jumpRequested: boolean
	velocity: readonly [number, number, number]
	viewDirection: readonly [number, number, number]
}>

export type WallTraversalStep = Readonly<{
	consumedJump: boolean
	detachedByCrouch: boolean
	resetJumpAvailability: boolean
	state: WallTraversalState
	velocity: readonly [number, number, number]
}>

function resetWithCooldown(state: WallTraversalState): WallTraversalState {
	return {
		...INITIAL_WALL_TRAVERSAL_STATE,
		recontactRemaining:
			state.mode === "none" ? state.recontactRemaining : WALL_RECONTACT_SECONDS,
	}
}

export function horizontalViewDirectionFromYaw(
	yaw: number,
): readonly [number, number, number] {
	return [-Math.sin(yaw), 0, -Math.cos(yaw)]
}

export function viewPointsTowardWall(
	viewDirection: readonly [number, number, number],
	normal: readonly [number, number, number],
): boolean {
	const [viewX, , viewZ] = viewDirection
	const [normalX, , normalZ] = normal
	const viewLength = Math.hypot(viewX, viewZ)
	const normalLength = Math.hypot(normalX, normalZ)
	if (viewLength === 0 || normalLength === 0) return false
	const towardWallDot =
		(-viewX * normalX - viewZ * normalZ) / (viewLength * normalLength)
	return towardWallDot >= WALL_SLIDE_VIEW_COSINE
}

function runVelocityAlongWall(
	velocity: readonly [number, number, number],
	viewDirection: readonly [number, number, number],
	normal: readonly [number, number, number],
): readonly [number, number] {
	const [velocityX, , velocityZ] = velocity
	const [normalX, , normalZ] = normal
	const planarSpeed = Math.hypot(velocityX, velocityZ)
	if (planarSpeed === 0) return [0, 0]
	const normalSpeed = velocityX * normalX + velocityZ * normalZ
	const projectedX = velocityX - normalX * normalSpeed
	const projectedZ = velocityZ - normalZ * normalSpeed
	const projectedSpeed = Math.hypot(projectedX, projectedZ)
	if (projectedSpeed > 0.000_1) {
		return [
			(projectedX / projectedSpeed) * planarSpeed,
			(projectedZ / projectedSpeed) * planarSpeed,
		]
	}
	const normalLength = Math.hypot(normalX, normalZ)
	if (normalLength === 0) return [0, 0]
	const tangentX = -normalZ / normalLength
	const tangentZ = normalX / normalLength
	const viewTangent = viewDirection[0] * tangentX + viewDirection[2] * tangentZ
	const direction = viewTangent < 0 ? -1 : 1
	return [
		tangentX * planarSpeed * direction,
		tangentZ * planarSpeed * direction,
	]
}

function limitWallPlanarVelocity(
	velocity: readonly [number, number, number],
): readonly [number, number, number] {
	const speed = Math.hypot(velocity[0], velocity[2])
	if (speed <= WALL_TRAVERSAL_MAXIMUM_PLANAR_SPEED) return velocity
	const scale = WALL_TRAVERSAL_MAXIMUM_PLANAR_SPEED / speed
	return [velocity[0] * scale, velocity[1], velocity[2] * scale]
}

export function stepWallTraversal(
	state: WallTraversalState,
	input: WallTraversalInput,
): WallTraversalStep {
	const delta = Math.max(0, input.delta)
	const cooldown = Math.max(0, state.recontactRemaining - delta)
	if (state.requiresContactRelease) {
		if (input.contact === null) {
			return {
				consumedJump: false,
				detachedByCrouch: false,
				resetJumpAvailability: false,
				state: INITIAL_WALL_TRAVERSAL_STATE,
				velocity: input.velocity,
			}
		}
		return {
			consumedJump: false,
			detachedByCrouch: false,
			resetJumpAvailability: false,
			state: { ...state, recontactRemaining: cooldown },
			velocity: input.velocity,
		}
	}
	if (input.blocked || input.grounded || input.contact === null) {
		const next = resetWithCooldown({ ...state, recontactRemaining: cooldown })
		return {
			consumedJump: false,
			detachedByCrouch: false,
			resetJumpAvailability: false,
			state: next,
			velocity: input.velocity,
		}
	}
	const contact = input.contact
	if (contact.inclinationRadians <= SLIDE_PHYSICS.steepSurfaceRadians + 1e-12) {
		return {
			consumedJump: false,
			detachedByCrouch: false,
			resetJumpAvailability: false,
			state: resetWithCooldown({ ...state, recontactRemaining: cooldown }),
			velocity: input.velocity,
		}
	}
	if (
		cooldown > 0 &&
		state.mode === "none" &&
		(state.surfaceId === null || state.surfaceId === contact.surfaceId)
	) {
		return {
			consumedJump: false,
			detachedByCrouch: false,
			resetJumpAvailability: false,
			state: { ...INITIAL_WALL_TRAVERSAL_STATE, recontactRemaining: cooldown },
			velocity: input.velocity,
		}
	}
	const [normalX, , normalZ] = contact.normal
	const contactVelocity = input.crouching
		? input.velocity
		: limitWallPlanarVelocity(input.velocity)
	const [velocityX, velocityY, velocityZ] = contactVelocity
	const normalSpeed = velocityX * normalX + velocityZ * normalZ
	const tangentX = velocityX - normalX * normalSpeed
	const tangentZ = velocityZ - normalZ * normalSpeed
	if (input.crouching) {
		const continuingRegularSlide =
			state.mode === "crouch-slide" && state.surfaceId === contact.surfaceId
		const regularSlide = stepContactSlidePhysics(
			{ sliding: continuingRegularSlide, velocity: contactVelocity },
			{
				delta,
				surfaceNormal: contact.surfaceNormal ?? contact.normal,
			},
		)
		return {
			consumedJump: false,
			detachedByCrouch: false,
			resetJumpAvailability:
				state.mode === "none" || state.surfaceId !== contact.surfaceId,
			state: {
				elapsed:
					state.mode === "crouch-slide" && state.surfaceId === contact.surfaceId
						? state.elapsed + delta
						: 0,
				mode: "crouch-slide",
				normal: contact.normal,
				recontactRemaining: 0,
				requiresContactRelease: false,
				surfaceId: contact.surfaceId,
			},
			velocity: regularSlide.velocity,
		}
	}
	if (input.jumpRequested) {
		const [tangentX, tangentZ] = runVelocityAlongWall(
			contactVelocity,
			input.viewDirection,
			contact.normal,
		)
		return {
			consumedJump: true,
			detachedByCrouch: false,
			resetJumpAvailability: true,
			state: {
				...INITIAL_WALL_TRAVERSAL_STATE,
				recontactRemaining: WALL_RECONTACT_SECONDS,
				surfaceId: contact.surfaceId,
			},
			velocity: [
				tangentX + normalX * WALL_JUMP_OUTWARD_SPEED,
				WALL_JUMP_UPWARD_SPEED,
				tangentZ + normalZ * WALL_JUMP_OUTWARD_SPEED,
			],
		}
	}
	const planarSpeed = Math.hypot(velocityX, velocityZ)
	const [runVelocityX, runVelocityZ] = runVelocityAlongWall(
		contactVelocity,
		input.viewDirection,
		contact.normal,
	)
	const lookingIntoWall = viewPointsTowardWall(
		input.viewDirection,
		contact.normal,
	)
	const continuingRun =
		state.mode === "run" &&
		state.surfaceId === contact.surfaceId &&
		planarSpeed >= WALL_RUN_EXIT_SPEED &&
		state.elapsed < WALL_RUN_MAXIMUM_SECONDS
	const enteringRun =
		state.mode !== "run" &&
		planarSpeed >= WALL_RUN_ENTRY_SPEED &&
		(state.surfaceId !== contact.surfaceId ||
			state.elapsed < WALL_RUN_MAXIMUM_SECONDS)
	const runEligible =
		contact.inclinationRadians >= WALL_MINIMUM_INCLINATION_RADIANS
	const mode: WallTraversalMode =
		runEligible && !lookingIntoWall && (continuingRun || enteringRun)
			? "run"
			: "slide"
	const elapsed =
		state.surfaceId === contact.surfaceId ? state.elapsed + delta : 0
	const acquiredSurface =
		state.mode === "none" || state.surfaceId !== contact.surfaceId
	const slideDamping = Math.exp(
		-WALL_SLIDE_TANGENTIAL_DAMPING_PER_SECOND * delta,
	)
	return {
		consumedJump: false,
		detachedByCrouch: false,
		resetJumpAvailability: acquiredSurface,
		state: {
			elapsed,
			mode,
			normal: contact.normal,
			recontactRemaining: 0,
			requiresContactRelease: false,
			surfaceId: contact.surfaceId,
		},
		velocity:
			mode === "run"
				? [
						runVelocityX,
						Math.max(velocityY, -WALL_RUN_DOWNWARD_SPEED),
						runVelocityZ,
					]
				: [
						tangentX * slideDamping,
						Math.max(velocityY, -WALL_SLIDE_DOWNWARD_SPEED),
						tangentZ * slideDamping,
					],
	}
}

export function jumpCountAfterWallContact(
	hasWallContact: boolean,
	jumpCount: 0 | 1 | 2,
): 0 | 1 | 2 {
	return hasWallContact ? 1 : jumpCount
}
