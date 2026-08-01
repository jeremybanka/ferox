import {
	PICKUP_HOLD_DURATION_MS,
	WEAPON_SWITCH_WHEEL_DEBOUNCE_MS,
} from "./game-constants.ts"

export const WEAPON_SWITCH_GAMEPAD_BUTTON = 3
export const WEAPON_SWITCH_KEY_CODE = "Digit1"

export const PICKUP_GAMEPAD_BUTTON = 5
export const PICKUP_KEY_CODE = "KeyE"

export type InputEdge = {
	held: boolean
	triggered: boolean
}

export function inputEdge(
	pressed: boolean,
	previouslyHeld: boolean,
): InputEdge {
	return { held: pressed, triggered: pressed && !previouslyHeld }
}

export function isPickupKeyboardInput(code: string, repeat: boolean): boolean {
	return code === PICKUP_KEY_CODE && !repeat
}

export function isPickupGamepadInput(
	buttons: readonly ({ pressed?: boolean; value?: number } | undefined)[],
): boolean {
	const button = buttons[PICKUP_GAMEPAD_BUTTON]
	return button?.pressed === true || (button?.value ?? 0) > 0.5
}

export type HoldInputState = Readonly<{
	completed: boolean
	startedAtMs: number | null
}>

export type HoldInputEvent =
	| "none"
	| "started"
	| "progress"
	| "cancelled"
	| "completed"

export type HoldInputUpdate = Readonly<{
	event: HoldInputEvent
	progress: number
	state: HoldInputState
}>

export const IDLE_HOLD_INPUT_STATE: HoldInputState = {
	completed: false,
	startedAtMs: null,
}

/**
 * Advances a hold interaction without retaining input state internally.
 * `active` should combine the physical button state and contextual eligibility,
 * so releasing the button or leaving pickup range cancels an incomplete hold.
 */
export function updateHoldInput(
	state: HoldInputState,
	active: boolean,
	nowMs: number,
	durationMs = PICKUP_HOLD_DURATION_MS,
): HoldInputUpdate {
	if (!active) {
		const cancelled = state.startedAtMs !== null && !state.completed
		return {
			event: cancelled ? "cancelled" : "none",
			progress: 0,
			state: IDLE_HOLD_INPUT_STATE,
		}
	}

	if (state.completed) {
		return { event: "none", progress: 1, state }
	}

	const safeDurationMs = Math.max(0, durationMs)
	if (state.startedAtMs === null) {
		if (safeDurationMs === 0) {
			const completedState = { completed: true, startedAtMs: nowMs }
			return {
				event: "completed",
				progress: 1,
				state: completedState,
			}
		}
		return {
			event: "started",
			progress: 0,
			state: { completed: false, startedAtMs: nowMs },
		}
	}

	const progress = Math.min(
		1,
		Math.max(0, nowMs - state.startedAtMs) / safeDurationMs,
	)
	if (progress < 1) return { event: "progress", progress, state }

	return {
		event: "completed",
		progress: 1,
		state: { completed: true, startedAtMs: state.startedAtMs },
	}
}

export type RightBumperAction = "pickup" | "reload" | null

/** Pickup owns right bumper while it is contextually available. */
export function contextualRightBumperAction(
	pickupNearby: boolean,
	reloadAvailable: boolean,
): RightBumperAction {
	if (pickupNearby) return "pickup"
	return reloadAvailable ? "reload" : null
}

export function isWeaponSwitchKeyboardInput(
	code: string,
	repeat: boolean,
): boolean {
	return code === WEAPON_SWITCH_KEY_CODE && !repeat
}

export function isWeaponSwitchGamepadInput(
	buttons: readonly ({ pressed?: boolean; value?: number } | undefined)[],
): boolean {
	const button = buttons[WEAPON_SWITCH_GAMEPAD_BUTTON]
	return button?.pressed === true || (button?.value ?? 0) > 0.5
}

export type WheelDirection = "next" | "previous"

export function wheelDirection(deltaY: number): WheelDirection | null {
	if (deltaY > 0) return "next"
	if (deltaY < 0) return "previous"
	return null
}

export type WheelInputUpdate = Readonly<{
	direction: WheelDirection | null
	lastEventAtMs: number | null
	triggered: boolean
}>

export function debounceWheelInput(
	deltaY: number,
	nowMs: number,
	lastEventAtMs: number | null,
	debounceMs = WEAPON_SWITCH_WHEEL_DEBOUNCE_MS,
): WheelInputUpdate {
	const direction = wheelDirection(deltaY)
	const elapsed = lastEventAtMs === null ? Infinity : nowMs - lastEventAtMs
	const triggered = direction !== null && elapsed >= Math.max(0, debounceMs)
	return {
		direction,
		lastEventAtMs: direction === null ? lastEventAtMs : nowMs,
		triggered,
	}
}
