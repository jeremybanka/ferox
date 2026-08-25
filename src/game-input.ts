import {
	GRAPPLE_TRIGGER_PRESS_THRESHOLD,
	GRAPPLE_TRIGGER_RELEASE_THRESHOLD,
	PICKUP_HOLD_DURATION_MS,
	WEAPON_SWITCH_WHEEL_DEBOUNCE_MS,
} from "./game-constants.ts"

export const CONTROLLER_ACTION_IDS = [
	"moveX",
	"moveY",
	"lookX",
	"lookY",
	"jump",
	"crouch",
	"fire",
	"grapple",
	"bomb",
	"lock",
	"pickupReload",
	"switchWeapon",
	"switchGrenade",
	"autorun",
	"punch",
	"wave",
	"fistbump",
	"salute",
	"menu",
] as const

export type ControllerActionId = (typeof CONTROLLER_ACTION_IDS)[number]
export type ControllerInputKind = "analog-button" | "axis" | "button"

export type ControllerActionDefinition = Readonly<{
	description: string
	id: ControllerActionId
	inputKind: ControllerInputKind
	label: string
	remappable: boolean
}>

export const CONTROLLER_ACTION_REGISTRY = {
	moveX: {
		description: "Strafe left or right",
		id: "moveX",
		inputKind: "axis",
		label: "Move left / right",
		remappable: true,
	},
	moveY: {
		description: "Move forward or backward",
		id: "moveY",
		inputKind: "axis",
		label: "Move forward / back",
		remappable: true,
	},
	lookX: {
		description: "Look left or right",
		id: "lookX",
		inputKind: "axis",
		label: "Look left / right",
		remappable: true,
	},
	lookY: {
		description: "Look up or down",
		id: "lookY",
		inputKind: "axis",
		label: "Look up / down",
		remappable: true,
	},
	jump: {
		description: "Jump or double jump",
		id: "jump",
		inputKind: "button",
		label: "Jump",
		remappable: true,
	},
	crouch: {
		description: "Crouch or slide",
		id: "crouch",
		inputKind: "button",
		label: "Crouch / slide",
		remappable: true,
	},
	fire: {
		description: "Fire or charge the equipped weapon",
		id: "fire",
		inputKind: "analog-button",
		label: "Fire",
		remappable: true,
	},
	grapple: {
		description: "Attach, hold, and release the grappling hook",
		id: "grapple",
		inputKind: "analog-button",
		label: "Grapple",
		remappable: true,
	},
	bomb: {
		description: "Throw the selected bomb",
		id: "bomb",
		inputKind: "button",
		label: "Throw bomb",
		remappable: true,
	},
	lock: {
		description: "Tap to lock or hold for free aim",
		id: "lock",
		inputKind: "button",
		label: "Lock / free aim",
		remappable: true,
	},
	pickupReload: {
		description: "Pick up nearby equipment or reload contextually",
		id: "pickupReload",
		inputKind: "button",
		label: "Pick up / reload",
		remappable: true,
	},
	switchWeapon: {
		description: "Switch equipped weapon",
		id: "switchWeapon",
		inputKind: "button",
		label: "Switch weapon",
		remappable: true,
	},
	switchGrenade: {
		description: "Switch bomb type",
		id: "switchGrenade",
		inputKind: "button",
		label: "Switch bomb",
		remappable: true,
	},
	autorun: {
		description: "Toggle persisted movement",
		id: "autorun",
		inputKind: "button",
		label: "Autorun",
		remappable: true,
	},
	punch: {
		description: "Punch",
		id: "punch",
		inputKind: "button",
		label: "Punch",
		remappable: true,
	},
	wave: {
		description: "Wave",
		id: "wave",
		inputKind: "button",
		label: "Wave",
		remappable: true,
	},
	fistbump: {
		description: "Fistbump",
		id: "fistbump",
		inputKind: "button",
		label: "Fistbump",
		remappable: true,
	},
	salute: {
		description: "Salute",
		id: "salute",
		inputKind: "button",
		label: "Salute",
		remappable: true,
	},
	menu: {
		description: "Open or close controller settings",
		id: "menu",
		inputKind: "button",
		label: "Controls menu",
		remappable: false,
	},
} as const satisfies Record<ControllerActionId, ControllerActionDefinition>

export type ControllerButtonBinding = Readonly<{
	index: number
	kind: "button"
}>

export type ControllerAxisBinding = Readonly<{
	index: number
	inverted: boolean
	kind: "axis"
}>

export type ControllerBinding = ControllerAxisBinding | ControllerButtonBinding
export type ControllerBindings = Readonly<
	Record<ControllerActionId, ControllerBinding>
>

export const DEFAULT_CONTROLLER_BINDINGS = {
	moveX: { index: 0, inverted: false, kind: "axis" },
	moveY: { index: 1, inverted: false, kind: "axis" },
	lookX: { index: 2, inverted: false, kind: "axis" },
	lookY: { index: 3, inverted: false, kind: "axis" },
	jump: { index: 0, kind: "button" },
	crouch: { index: 1, kind: "button" },
	fire: { index: 7, kind: "button" },
	grapple: { index: 6, kind: "button" },
	bomb: { index: 8, kind: "button" },
	lock: { index: 4, kind: "button" },
	pickupReload: { index: 5, kind: "button" },
	switchWeapon: { index: 3, kind: "button" },
	switchGrenade: { index: 2, kind: "button" },
	autorun: { index: 10, kind: "button" },
	punch: { index: 11, kind: "button" },
	wave: { index: 12, kind: "button" },
	fistbump: { index: 14, kind: "button" },
	salute: { index: 15, kind: "button" },
	menu: { index: 9, kind: "button" },
} as const satisfies ControllerBindings

export const CONTROLLER_MENU_BINDING = DEFAULT_CONTROLLER_BINDINGS.menu
export const CONTROLLER_CAPTURE_PRESS_THRESHOLD = 0.65
export const CONTROLLER_CAPTURE_RELEASE_THRESHOLD = 0.35
export const CONTROLS_MENU_KEY_CODE = "F1"

export function isControlsMenuKeyboardInput(
	code: string,
	repeat: boolean,
): boolean {
	return code === CONTROLS_MENU_KEY_CODE && !repeat
}

type ControllerButtonState = Readonly<{
	pressed?: boolean
	value?: number
}>

export type ControllerDeviceState = Readonly<{
	axes: readonly number[]
	buttons: readonly (ControllerButtonState | undefined)[]
	connected?: boolean
}>

export type ResolvedControllerActions = Readonly<{
	connected: boolean
	values: Readonly<Record<ControllerActionId, number>>
}>

function finiteClamped(
	value: number | undefined,
	minimum: number,
	maximum: number,
) {
	if (value === undefined || !Number.isFinite(value)) return 0
	return Math.max(minimum, Math.min(maximum, value))
}

function buttonValue(
	buttons: ControllerDeviceState["buttons"],
	index: number,
): number {
	const button = buttons[index]
	if (button === undefined) return 0
	return Math.max(
		button.pressed === true ? 1 : 0,
		finiteClamped(button.value, 0, 1),
	)
}

function analogButtonValue(
	buttons: ControllerDeviceState["buttons"],
	index: number,
): number {
	const button = buttons[index]
	if (button === undefined) return 0
	return button.value === undefined || !Number.isFinite(button.value)
		? button.pressed === true
			? 1
			: 0
		: finiteClamped(button.value, 0, 1)
}

export function controllerBindingSourceKey(binding: ControllerBinding): string {
	return `${binding.kind}:${binding.index}`
}

export function controllerBindingCompatible(
	actionId: ControllerActionId,
	binding: ControllerBinding,
): boolean {
	const inputKind = CONTROLLER_ACTION_REGISTRY[actionId].inputKind
	return inputKind === "axis"
		? binding.kind === "axis"
		: binding.kind === "button"
}

export function controllerBindingLabel(binding: ControllerBinding): string {
	if (binding.kind === "axis") {
		const label =
			["Left stick X", "Left stick Y", "Right stick X", "Right stick Y"][
				binding.index
			] ?? `Axis ${binding.index}`
		return binding.inverted ? `${label} (inverted)` : label
	}
	return (
		[
			"A / Cross",
			"B / Circle",
			"X / Square",
			"Y / Triangle",
			"Left bumper",
			"Right bumper",
			"Left trigger",
			"Right trigger",
			"View / Share",
			"Start / Options",
			"Left stick click",
			"Right stick click",
			"D-pad up",
			"D-pad down",
			"D-pad left",
			"D-pad right",
		][binding.index] ?? `Button ${binding.index}`
	)
}

function neutralControllerValues(): Record<ControllerActionId, number> {
	return Object.fromEntries(
		CONTROLLER_ACTION_IDS.map((actionId) => [actionId, 0]),
	) as Record<ControllerActionId, number>
}

export function resolveControllerActions(
	device: ControllerDeviceState | null,
	bindings: ControllerBindings,
	gameplaySuppressed = false,
): ResolvedControllerActions {
	const connected = device !== null && device.connected !== false
	const values = neutralControllerValues()
	if (!connected || device === null || gameplaySuppressed)
		return { connected, values }

	for (const actionId of CONTROLLER_ACTION_IDS) {
		const binding = bindings[actionId]
		if (!controllerBindingCompatible(actionId, binding)) continue
		const inputKind = CONTROLLER_ACTION_REGISTRY[actionId].inputKind
		values[actionId] =
			binding.kind === "axis"
				? finiteClamped(device.axes[binding.index], -1, 1) *
					(binding.inverted ? -1 : 1)
				: inputKind === "analog-button"
					? analogButtonValue(device.buttons, binding.index)
					: buttonValue(device.buttons, binding.index)
	}
	return { connected, values }
}

export function controllerActionHeld(
	actions: ResolvedControllerActions,
	actionId: ControllerActionId,
	threshold = 0.5,
): boolean {
	return actions.values[actionId] > threshold
}

export function controllerGameplayInputIsNeutral(
	actions: ResolvedControllerActions,
): boolean {
	return CONTROLLER_ACTION_IDS.every((actionId) => {
		if (actionId === "menu") return true
		const inputKind = CONTROLLER_ACTION_REGISTRY[actionId].inputKind
		const threshold = inputKind === "axis" ? 0.18 : 0.35
		return Math.abs(actions.values[actionId]) < threshold
	})
}

export type ControllerBindingUpdate =
	| Readonly<{
			bindings: ControllerBindings
			status: "applied"
			swappedAction: ControllerActionId | null
	  }>
	| Readonly<{
			bindings: ControllerBindings
			reason: "incompatible" | "reserved-action" | "reserved-source"
			status: "rejected"
	  }>

export function updateControllerBinding(
	bindings: ControllerBindings,
	actionId: ControllerActionId,
	binding: ControllerBinding,
): ControllerBindingUpdate {
	const definition = CONTROLLER_ACTION_REGISTRY[actionId]
	if (!definition.remappable)
		return { bindings, reason: "reserved-action", status: "rejected" }
	if (!controllerBindingCompatible(actionId, binding))
		return { bindings, reason: "incompatible", status: "rejected" }

	const sourceKey = controllerBindingSourceKey(binding)
	const conflict = CONTROLLER_ACTION_IDS.find(
		(candidate) =>
			candidate !== actionId &&
			controllerBindingSourceKey(bindings[candidate]) === sourceKey,
	)
	if (
		conflict !== undefined &&
		!CONTROLLER_ACTION_REGISTRY[conflict].remappable
	)
		return { bindings, reason: "reserved-source", status: "rejected" }

	const updated = { ...bindings, [actionId]: binding }
	if (conflict !== undefined) updated[conflict] = bindings[actionId]
	return {
		bindings: updated,
		status: "applied",
		swappedAction: conflict ?? null,
	}
}

export type ControllerMenuToggleState = Readonly<{
	armed: boolean
	held: boolean
}>

export const INITIAL_CONTROLLER_MENU_TOGGLE_STATE: ControllerMenuToggleState = {
	armed: false,
	held: false,
}

export function stepControllerMenuToggle(
	state: ControllerMenuToggleState,
	pressed: boolean,
): Readonly<{ state: ControllerMenuToggleState; toggled: boolean }> {
	if (!state.armed) {
		return {
			state: { armed: !pressed, held: pressed },
			toggled: false,
		}
	}
	return {
		state: { armed: true, held: pressed },
		toggled: pressed && !state.held,
	}
}

export type ControllerBindingCaptureState = Readonly<{ armed: boolean }>

export const INITIAL_CONTROLLER_BINDING_CAPTURE_STATE: ControllerBindingCaptureState =
	{ armed: false }

export function stepControllerBindingCapture(
	state: ControllerBindingCaptureState,
	device: ControllerDeviceState | null,
	inputKind: ControllerInputKind,
): Readonly<{
	binding: ControllerBinding | null
	state: ControllerBindingCaptureState
}> {
	if (device === null || device.connected === false)
		return {
			binding: null,
			state: INITIAL_CONTROLLER_BINDING_CAPTURE_STATE,
		}

	if (inputKind === "axis") {
		const neutral = device.axes.every(
			(value) =>
				Math.abs(finiteClamped(value, -1, 1)) <
				CONTROLLER_CAPTURE_RELEASE_THRESHOLD,
		)
		if (!state.armed) return { binding: null, state: { armed: neutral } }
		const index = device.axes.findIndex(
			(value) =>
				Math.abs(finiteClamped(value, -1, 1)) >=
				CONTROLLER_CAPTURE_PRESS_THRESHOLD,
		)
		if (index < 0) return { binding: null, state }
		return {
			binding: {
				index,
				inverted: finiteClamped(device.axes[index], -1, 1) < 0,
				kind: "axis",
			},
			state,
		}
	}

	const candidateValues = device.buttons.map((_, index) =>
		index === CONTROLLER_MENU_BINDING.index
			? 0
			: buttonValue(device.buttons, index),
	)
	const neutral = candidateValues.every(
		(value) => value < CONTROLLER_CAPTURE_RELEASE_THRESHOLD,
	)
	if (!state.armed) return { binding: null, state: { armed: neutral } }
	const index = candidateValues.findIndex(
		(value) => value >= CONTROLLER_CAPTURE_PRESS_THRESHOLD,
	)
	return index < 0
		? { binding: null, state }
		: { binding: { index, kind: "button" }, state }
}

export const GRAPPLE_GAMEPAD_AXIS_BUTTON =
	DEFAULT_CONTROLLER_BINDINGS.grapple.index
export const GRAPPLE_KEY_CODE = "KeyZ"
export const BOMB_GAMEPAD_BUTTON = DEFAULT_CONTROLLER_BINDINGS.bomb.index

export function isGrappleKeyboardInput(code: string): boolean {
	return code === GRAPPLE_KEY_CODE
}

/** Analog hysteresis avoids noisy LT values producing attach/detach chatter. */
export function grappleTriggerHeld(
	value: number,
	previouslyHeld: boolean,
): boolean {
	if (!Number.isFinite(value)) return false
	return previouslyHeld
		? value > GRAPPLE_TRIGGER_RELEASE_THRESHOLD
		: value >= GRAPPLE_TRIGGER_PRESS_THRESHOLD
}

export function isBombGamepadInput(
	buttons: readonly ({ pressed?: boolean; value?: number } | undefined)[],
): boolean {
	const button = buttons[BOMB_GAMEPAD_BUTTON]
	return button?.pressed === true || (button?.value ?? 0) > 0.5
}

export const WEAPON_SWITCH_GAMEPAD_BUTTON =
	DEFAULT_CONTROLLER_BINDINGS.switchWeapon.index
export const WEAPON_SWITCH_KEY_CODE = "Digit1"

export const PICKUP_GAMEPAD_BUTTON =
	DEFAULT_CONTROLLER_BINDINGS.pickupReload.index
export const PICKUP_KEY_CODE = "KeyE"
export const GRENADE_SWITCH_GAMEPAD_BUTTON =
	DEFAULT_CONTROLLER_BINDINGS.switchGrenade.index
export const GRENADE_SWITCH_KEY_CODE = "Digit2"

export function isGrenadeSwitchKeyboardInput(
	code: string,
	repeat: boolean,
): boolean {
	return code === GRENADE_SWITCH_KEY_CODE && !repeat
}

export function isGrenadeSwitchGamepadInput(
	buttons: readonly ({ pressed?: boolean; value?: number } | undefined)[],
): boolean {
	const button = buttons[GRENADE_SWITCH_GAMEPAD_BUTTON]
	return button?.pressed === true || (button?.value ?? 0) > 0.5
}

export const PUNCH_GAMEPAD_BUTTON = DEFAULT_CONTROLLER_BINDINGS.punch.index
export const PUNCH_KEY_CODE = "KeyH"
export const WAVE_GAMEPAD_BUTTON = DEFAULT_CONTROLLER_BINDINGS.wave.index
export const WAVE_KEY_CODE = "KeyV"
export const FISTBUMP_GAMEPAD_BUTTON =
	DEFAULT_CONTROLLER_BINDINGS.fistbump.index
export const FISTBUMP_KEY_CODE = "KeyB"
export const SALUTE_GAMEPAD_BUTTON = DEFAULT_CONTROLLER_BINDINGS.salute.index
export const SALUTE_KEY_CODE = "KeyG"

export type GestureInput = "fistbump" | "punch" | "salute" | "wave"

export function keyboardGestureInput(
	code: string,
	repeat: boolean,
): GestureInput | null {
	if (repeat) return null
	switch (code) {
		case PUNCH_KEY_CODE:
			return "punch"
		case WAVE_KEY_CODE:
			return "wave"
		case FISTBUMP_KEY_CODE:
			return "fistbump"
		case SALUTE_KEY_CODE:
			return "salute"
		default:
			return null
	}
}

export function gamepadGestureInputs(
	buttons: readonly ({ pressed?: boolean; value?: number } | undefined)[],
): Readonly<Record<GestureInput, boolean>> {
	const pressed = (index: number): boolean => {
		const button = buttons[index]
		return button?.pressed === true || (button?.value ?? 0) > 0.5
	}
	return {
		fistbump: pressed(FISTBUMP_GAMEPAD_BUTTON),
		punch: pressed(PUNCH_GAMEPAD_BUTTON),
		salute: pressed(SALUTE_GAMEPAD_BUTTON),
		wave: pressed(WAVE_GAMEPAD_BUTTON),
	}
}

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
