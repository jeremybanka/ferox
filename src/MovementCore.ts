export const MOVEMENT_INPUT_DEADZONE = 0.18
export const MOVEMENT_DIRECTION_UPDATE_THRESHOLD = 0.24

export type MovementDirection = Readonly<{ x: number; y: number }>

export type MovementCoreState = Readonly<{
	autorun: boolean
	leftStickHeld: boolean
	rememberedDirection: MovementDirection | null
}>

export const INITIAL_MOVEMENT_CORE_STATE: MovementCoreState = {
	autorun: false,
	leftStickHeld: false,
	rememberedDirection: null,
}

export type MovementCoreInput = Readonly<{
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

export function resetMovementCore(): MovementCoreState {
	return INITIAL_MOVEMENT_CORE_STATE
}

/**
 * Resolves physical movement into a semantic direction. LS is an edge-triggered
 * autorun toggle; it has no speed-mode meaning. Intentional input always wins
 * and refreshes the direction autorun will use after the stick returns neutral.
 */
export function stepMovementCore(
	state: MovementCoreState,
	input: MovementCoreInput,
): MovementCoreStep {
	const stickMagnitude = magnitude(input.stick)
	const stickActive = stickMagnitude >= MOVEMENT_INPUT_DEADZONE
	const stickDirection = stickActive ? normalize(input.stick) : { x: 0, y: 0 }
	const leftStickEdge = input.leftStickPressed && !state.leftStickHeld
	const autorun = leftStickEdge ? !state.autorun : state.autorun
	const rememberedDirection =
		stickMagnitude >= MOVEMENT_DIRECTION_UPDATE_THRESHOLD
			? stickDirection
			: state.rememberedDirection

	return {
		direction:
			autorun && !stickActive
				? (rememberedDirection ?? { x: 0, y: 0 })
				: stickDirection,
		state: {
			autorun,
			leftStickHeld: input.leftStickPressed,
			rememberedDirection,
		},
	}
}
