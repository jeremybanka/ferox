import type { ArenaSurfaceContact } from "./ArenaWorld.ts"

export const WALL_MINIMUM_INCLINATION_RADIANS = (80 * Math.PI) / 180
export const WALL_RUN_ENTRY_SPEED = 7.2
export const WALL_RUN_EXIT_SPEED = 5.4
export const WALL_RUN_ENTRY_ANGLE_RADIANS = (50 * Math.PI) / 180
export const WALL_RUN_PARALLEL_COSINE = Math.cos(WALL_RUN_ENTRY_ANGLE_RADIANS)
export const WALL_RUN_MAXIMUM_SECONDS = 1.65
export const WALL_RUN_DOWNWARD_SPEED = 1.25
export const WALL_SLIDE_DOWNWARD_SPEED = 2.25
export const WALL_JUMP_OUTWARD_SPEED = 6.8
export const WALL_JUMP_UPWARD_SPEED = 7.6
export const WALL_RECONTACT_SECONDS = 0.22

export type WallTraversalMode = "none" | "run" | "slide"

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

export function wallRunVelocityQualifies(
	velocity: readonly [number, number, number],
	normal: readonly [number, number, number],
	minimumSpeed = WALL_RUN_ENTRY_SPEED,
): boolean {
	const [velocityX, , velocityZ] = velocity
	const [normalX, , normalZ] = normal
	const planarSpeed = Math.hypot(velocityX, velocityZ)
	const normalSpeed = velocityX * normalX + velocityZ * normalZ
	const tangentSpeed = Math.hypot(
		velocityX - normalX * normalSpeed,
		velocityZ - normalZ * normalSpeed,
	)
	return (
		planarSpeed >= minimumSpeed &&
		tangentSpeed / planarSpeed >= WALL_RUN_PARALLEL_COSINE
	)
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
	if (input.crouching) {
		const detachedByCrouch = state.mode !== "none"
		return {
			consumedJump: false,
			detachedByCrouch,
			resetJumpAvailability: false,
			state: {
				...INITIAL_WALL_TRAVERSAL_STATE,
				recontactRemaining: detachedByCrouch
					? WALL_RECONTACT_SECONDS
					: cooldown,
				requiresContactRelease: detachedByCrouch && input.contact !== null,
				surfaceId: detachedByCrouch ? state.surfaceId : null,
			},
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
	if (contact.inclinationRadians < WALL_MINIMUM_INCLINATION_RADIANS) {
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
	if (input.jumpRequested) {
		const [velocityX, , velocityZ] = input.velocity
		const normalSpeed = velocityX * normalX + velocityZ * normalZ
		const tangentX = velocityX - normalX * normalSpeed
		const tangentZ = velocityZ - normalZ * normalSpeed
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
	const [velocityX, velocityY, velocityZ] = input.velocity
	const planarSpeed = Math.hypot(velocityX, velocityZ)
	const normalSpeed = velocityX * normalX + velocityZ * normalZ
	const tangentX = velocityX - normalX * normalSpeed
	const tangentZ = velocityZ - normalZ * normalSpeed
	const continuingRun =
		state.mode === "run" &&
		state.surfaceId === contact.surfaceId &&
		planarSpeed >= WALL_RUN_EXIT_SPEED &&
		state.elapsed < WALL_RUN_MAXIMUM_SECONDS
	const enteringRun =
		(state.mode === "none" || state.surfaceId !== contact.surfaceId) &&
		wallRunVelocityQualifies(input.velocity, contact.normal)
	const mode: WallTraversalMode = continuingRun || enteringRun ? "run" : "slide"
	const elapsed =
		state.surfaceId === contact.surfaceId ? state.elapsed + delta : 0
	return {
		consumedJump: false,
		detachedByCrouch: false,
		resetJumpAvailability: true,
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
				? [tangentX, Math.max(velocityY, -WALL_RUN_DOWNWARD_SPEED), tangentZ]
				: [
						tangentX * 0.78,
						Math.max(velocityY, -WALL_SLIDE_DOWNWARD_SPEED),
						tangentZ * 0.78,
					],
	}
}

export function jumpCountAfterWallContact(
	hasWallContact: boolean,
	jumpCount: 0 | 1 | 2,
): 0 | 1 | 2 {
	return hasWallContact ? 1 : jumpCount
}
