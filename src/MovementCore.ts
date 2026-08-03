export const MOVEMENT_INPUT_DEADZONE = 0.18
export const MOVEMENT_STATIONARY_THRESHOLD = 0.08
export const MOVEMENT_FORWARD_COSINE = Math.cos(Math.PI / 3)
export const MOVEMENT_DIRECTION_UPDATE_THRESHOLD = 0.24
export const MOVEMENT_FORWARD_REARM_THRESHOLD = 0.12

export type MovementDirection = Readonly<{ x: number; y: number }>

export type MovementCoreState = Readonly<{
	forwardPushArmed: boolean
	freerun: boolean
	leftStickHeld: boolean
	rememberedDirection: MovementDirection | null
	sprintLatched: boolean
}>

export const INITIAL_MOVEMENT_CORE_STATE: MovementCoreState = {
	forwardPushArmed: true,
	freerun: false,
	leftStickHeld: false,
	rememberedDirection: null,
	sprintLatched: false,
}

export type MovementCoreInput = Readonly<{
	canSprint: boolean
	leftStickPressed: boolean
	stick: MovementDirection
}>

export type MovementCoreStep = Readonly<{
	direction: MovementDirection
	state: MovementCoreState
}>

function magnitude(direction: MovementDirection): number {
	return Math.hypot(direction.x, direction.y)
}

function normalize(direction: MovementDirection): MovementDirection {
	const length = magnitude(direction)
	return length === 0
		? { x: 0, y: 0 }
		: { x: direction.x / length, y: direction.y / length }
}

export function isForwardish(direction: MovementDirection): boolean {
	const normalized = normalize(direction)
	return normalized.y <= -MOVEMENT_FORWARD_COSINE
}

export function resetMovementCore(): MovementCoreState {
	return INITIAL_MOVEMENT_CORE_STATE
}

export function stepMovementCore(
	state: MovementCoreState,
	input: MovementCoreInput,
): MovementCoreStep {
	const stickMagnitude = magnitude(input.stick)
	const stickActive = stickMagnitude >= MOVEMENT_INPUT_DEADZONE
	const directionUpdate = stickMagnitude >= MOVEMENT_DIRECTION_UPDATE_THRESHOLD
	const stickDirection = stickActive ? normalize(input.stick) : { x: 0, y: 0 }
	const leftStickEdge = input.leftStickPressed && !state.leftStickHeld
	let freerun = state.freerun
	let rememberedDirection = state.rememberedDirection
	let sprintLatched = state.sprintLatched
	let forwardPushArmed = state.forwardPushArmed

	if (leftStickEdge) {
		if (freerun) {
			freerun = false
			rememberedDirection = null
			sprintLatched = false
		} else if (stickActive && isForwardish(stickDirection)) {
			sprintLatched = input.canSprint
		} else if (stickMagnitude <= MOVEMENT_STATIONARY_THRESHOLD) {
			freerun = true
			sprintLatched = false
		}
	}

	if (freerun) {
		if (directionUpdate) {
			const hadDirection = rememberedDirection !== null
			const forwardGesture = isForwardish(stickDirection)
			if (hadDirection && forwardGesture && forwardPushArmed) {
				sprintLatched = input.canSprint && !sprintLatched
				forwardPushArmed = false
			}
			rememberedDirection = stickDirection
		} else if (stickMagnitude <= MOVEMENT_FORWARD_REARM_THRESHOLD) {
			forwardPushArmed = true
		}
	} else if (!stickActive) {
		sprintLatched = false
	}

	if (!input.canSprint) sprintLatched = false
	return {
		direction:
			freerun && !stickActive
				? (rememberedDirection ?? { x: 0, y: 0 })
				: stickDirection,
		state: {
			forwardPushArmed,
			freerun,
			leftStickHeld: input.leftStickPressed,
			rememberedDirection,
			sprintLatched,
		},
	}
}
