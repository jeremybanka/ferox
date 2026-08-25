import { describe, expect, test } from "vitest"

import {
	CONTROLLER_ACTION_IDS,
	CONTROLLER_ACTION_REGISTRY,
	controllerActionHeld,
	controllerBindingCompatible,
	controllerGameplayInputIsNeutral,
	CONTROLS_MENU_KEY_CODE,
	contextualRightBumperAction,
	BOMB_GAMEPAD_BUTTON,
	debounceWheelInput,
	DEFAULT_CONTROLLER_BINDINGS,
	IDLE_HOLD_INPUT_STATE,
	INITIAL_CONTROLLER_BINDING_CAPTURE_STATE,
	INITIAL_CONTROLLER_MENU_TOGGLE_STATE,
	inputEdge,
	gamepadGestureInputs,
	grappleTriggerHeld,
	isBombGamepadInput,
	isControlsMenuKeyboardInput,
	isGrappleKeyboardInput,
	isGrenadeSwitchGamepadInput,
	isGrenadeSwitchKeyboardInput,
	keyboardGestureInput,
	isPickupGamepadInput,
	isPickupKeyboardInput,
	isWeaponSwitchGamepadInput,
	isWeaponSwitchKeyboardInput,
	PICKUP_GAMEPAD_BUTTON,
	resolveControllerActions,
	stepControllerBindingCapture,
	stepControllerMenuToggle,
	updateControllerBinding,
	updateHoldInput,
	WEAPON_SWITCH_GAMEPAD_BUTTON,
	wheelDirection,
} from "./game-input.ts"

function controllerDevice(
	options: Readonly<{
		axes?: readonly number[]
		buttons?: Readonly<Record<number, number>>
	}> = {},
) {
	const buttons = Array.from({ length: 16 }, (_, index) => {
		const value = options.buttons?.[index] ?? 0
		return { pressed: value > 0.5, value }
	})
	return {
		axes: options.axes ?? [0, 0, 0, 0],
		buttons,
		connected: true,
	}
}

describe("semantic controller registry", () => {
	test("defines one compatible standard-gamepad binding for every action", () => {
		expect(Object.keys(CONTROLLER_ACTION_REGISTRY)).toEqual(
			CONTROLLER_ACTION_IDS,
		)
		expect(Object.keys(DEFAULT_CONTROLLER_BINDINGS)).toEqual(
			CONTROLLER_ACTION_IDS,
		)
		expect(CONTROLLER_ACTION_IDS).toContain("autorun")
		expect(CONTROLLER_ACTION_IDS).toContain("grapple")
		expect(CONTROLLER_ACTION_IDS).not.toContain("sprint")
		for (const actionId of CONTROLLER_ACTION_IDS) {
			expect(
				controllerBindingCompatible(
					actionId,
					DEFAULT_CONTROLLER_BINDINGS[actionId],
				),
			).toBe(true)
		}
	})

	test("resolves remapped buttons, analog triggers, axes, and inversion", () => {
		const swapped = updateControllerBinding(
			DEFAULT_CONTROLLER_BINDINGS,
			"jump",
			{ index: 2, kind: "button" },
		)
		expect(swapped.status).toBe("applied")
		if (swapped.status !== "applied") return
		expect(swapped.swappedAction).toBe("switchGrenade")

		const bindings = {
			...swapped.bindings,
			moveX: { index: 0, inverted: true, kind: "axis" as const },
		}
		const actions = resolveControllerActions(
			controllerDevice({
				axes: [0.75, 0, 0, 0],
				buttons: { 2: 1, 6: 0.61, 7: 0.42 },
			}),
			bindings,
		)

		expect(actions.values.moveX).toBe(-0.75)
		expect(controllerActionHeld(actions, "jump")).toBe(true)
		expect(controllerActionHeld(actions, "switchGrenade")).toBe(false)
		expect(actions.values.fire).toBe(0.42)
		expect(actions.values.grapple).toBe(0.61)
		expect(grappleTriggerHeld(actions.values.grapple, false)).toBe(false)
		expect(grappleTriggerHeld(0.62, false)).toBe(true)
	})

	test("neutralizes every gameplay action while preserving connection state", () => {
		const suppressed = resolveControllerActions(
			controllerDevice({ axes: [1, 0, 0, 0], buttons: { 0: 1, 7: 1 } }),
			DEFAULT_CONTROLLER_BINDINGS,
			true,
		)
		expect(suppressed.connected).toBe(true)
		expect(Object.values(suppressed.values).every((value) => value === 0)).toBe(
			true,
		)
		expect(controllerGameplayInputIsNeutral(suppressed)).toBe(true)

		const menuOnly = resolveControllerActions(
			controllerDevice({ buttons: { 9: 1 } }),
			DEFAULT_CONTROLLER_BINDINGS,
		)
		expect(controllerGameplayInputIsNeutral(menuOnly)).toBe(true)
	})

	test("swaps conflicts and protects incompatible or reserved sources", () => {
		const incompatible = updateControllerBinding(
			DEFAULT_CONTROLLER_BINDINGS,
			"jump",
			{ index: 0, inverted: false, kind: "axis" },
		)
		expect(incompatible).toMatchObject({
			reason: "incompatible",
			status: "rejected",
		})
		expect(
			updateControllerBinding(DEFAULT_CONTROLLER_BINDINGS, "menu", {
				index: 0,
				kind: "button",
			}),
		).toMatchObject({ reason: "reserved-action", status: "rejected" })
		expect(
			updateControllerBinding(DEFAULT_CONTROLLER_BINDINGS, "jump", {
				index: 9,
				kind: "button",
			}),
		).toMatchObject({ reason: "reserved-source", status: "rejected" })
	})
})

describe("controller menu and capture isolation", () => {
	test("opens from one non-repeating F1 edge", () => {
		expect(CONTROLS_MENU_KEY_CODE).toBe("F1")
		expect(isControlsMenuKeyboardInput("F1", false)).toBe(true)
		expect(isControlsMenuKeyboardInput("F1", true)).toBe(false)
		expect(isControlsMenuKeyboardInput("Escape", false)).toBe(false)
	})

	test("arms the menu only after the deployment press releases", () => {
		let step = stepControllerMenuToggle(
			INITIAL_CONTROLLER_MENU_TOGGLE_STATE,
			true,
		)
		expect(step.toggled).toBe(false)
		step = stepControllerMenuToggle(step.state, false)
		expect(step.toggled).toBe(false)
		step = stepControllerMenuToggle(step.state, true)
		expect(step.toggled).toBe(true)
		step = stepControllerMenuToggle(step.state, true)
		expect(step.toggled).toBe(false)
	})

	test("requires release before capture and never captures Start / Options", () => {
		let capture = stepControllerBindingCapture(
			INITIAL_CONTROLLER_BINDING_CAPTURE_STATE,
			controllerDevice({ buttons: { 0: 1, 9: 1 } }),
			"button",
		)
		expect(capture).toEqual({ binding: null, state: { armed: false } })
		capture = stepControllerBindingCapture(
			capture.state,
			controllerDevice(),
			"button",
		)
		expect(capture.state.armed).toBe(true)
		capture = stepControllerBindingCapture(
			capture.state,
			controllerDevice({ buttons: { 9: 1 } }),
			"button",
		)
		expect(capture.binding).toBeNull()
		capture = stepControllerBindingCapture(
			capture.state,
			controllerDevice({ buttons: { 4: 1 } }),
			"button",
		)
		expect(capture.binding).toEqual({ index: 4, kind: "button" })
	})

	test("captures a released axis with deterministic inversion", () => {
		let capture = stepControllerBindingCapture(
			INITIAL_CONTROLLER_BINDING_CAPTURE_STATE,
			controllerDevice({ axes: [0, 0, 0, 0] }),
			"axis",
		)
		expect(capture.state.armed).toBe(true)
		capture = stepControllerBindingCapture(
			capture.state,
			controllerDevice({ axes: [0, 0, -0.8, 0] }),
			"axis",
		)
		expect(capture.binding).toEqual({
			index: 2,
			inverted: true,
			kind: "axis",
		})
	})
})

describe("grapple and bomb input", () => {
	test("uses LT hysteresis and rearms only below the release threshold", () => {
		expect(grappleTriggerHeld(0.61, false)).toBe(false)
		expect(grappleTriggerHeld(0.62, false)).toBe(true)
		expect(grappleTriggerHeld(0.4, true)).toBe(true)
		expect(grappleTriggerHeld(0.38, true)).toBe(false)
	})

	test("provides keyboard parity and moves controller bomb to View", () => {
		expect(isGrappleKeyboardInput("KeyZ")).toBe(true)
		expect(isGrappleKeyboardInput("KeyF")).toBe(false)
		const buttons = Array.from({ length: 16 }, () => ({
			pressed: false,
			value: 0,
		}))
		buttons[6] = { pressed: true, value: 1 }
		expect(isBombGamepadInput(buttons)).toBe(false)
		buttons[BOMB_GAMEPAD_BUTTON] = { pressed: true, value: 1 }
		expect(isBombGamepadInput(buttons)).toBe(true)
	})
})

describe("pickup input", () => {
	test("accepts one non-repeating E key edge", () => {
		expect(isPickupKeyboardInput("KeyE", false)).toBe(true)
		expect(isPickupKeyboardInput("KeyE", true)).toBe(false)
		expect(isPickupKeyboardInput("KeyF", false)).toBe(false)
	})

	test("maps controller right bumper and ignores unrelated buttons", () => {
		const buttons = Array.from({ length: 16 }, () => ({
			pressed: false,
			value: 0,
		}))
		expect(isPickupGamepadInput(buttons)).toBe(false)
		buttons[WEAPON_SWITCH_GAMEPAD_BUTTON] = { pressed: true, value: 1 }
		expect(isPickupGamepadInput(buttons)).toBe(false)
		buttons[PICKUP_GAMEPAD_BUTTON] = { pressed: true, value: 1 }
		expect(isPickupGamepadInput(buttons)).toBe(true)
	})

	test("fires only on the rising edge and rearms after release", () => {
		expect(inputEdge(false, false)).toEqual({ held: false, triggered: false })
		expect(inputEdge(true, false)).toEqual({ held: true, triggered: true })
		expect(inputEdge(true, true)).toEqual({ held: true, triggered: false })
		expect(inputEdge(false, true)).toEqual({ held: false, triggered: false })
		expect(inputEdge(true, false)).toEqual({ held: true, triggered: true })
	})
})

describe("grenade selection input", () => {
	test("keeps grenade cycling independent from the salute fallback", () => {
		expect(isGrenadeSwitchKeyboardInput("Digit2", false)).toBe(true)
		expect(isGrenadeSwitchKeyboardInput("Digit2", true)).toBe(false)
		expect(isGrenadeSwitchKeyboardInput("KeyG", false)).toBe(false)
	})

	test("maps controller X without accepting other face buttons", () => {
		const buttons = Array.from({ length: 16 }, () => ({
			pressed: false,
			value: 0,
		}))
		expect(isGrenadeSwitchGamepadInput(buttons)).toBe(false)
		buttons[2] = { pressed: true, value: 1 }
		expect(isGrenadeSwitchGamepadInput(buttons)).toBe(true)
	})
})

describe("gesture input", () => {
	test("maps keyboard fallbacks without accepting repeat", () => {
		expect(keyboardGestureInput("KeyH", false)).toBe("punch")
		expect(keyboardGestureInput("KeyV", false)).toBe("wave")
		expect(keyboardGestureInput("KeyB", false)).toBe("fistbump")
		expect(keyboardGestureInput("KeyG", false)).toBe("salute")
		expect(keyboardGestureInput("KeyH", true)).toBeNull()
		expect(keyboardGestureInput("KeyR", false)).toBeNull()
	})

	test("keeps RS and each d-pad direction independent", () => {
		const buttons = Array.from({ length: 16 }, () => ({
			pressed: false,
			value: 0,
		}))
		buttons[11] = { pressed: true, value: 1 }
		buttons[15] = { pressed: true, value: 1 }
		expect(gamepadGestureInputs(buttons)).toEqual({
			fistbump: false,
			punch: true,
			salute: true,
			wave: false,
		})
	})
})

describe("pickup hold input", () => {
	test("recognizes E and right bumper as the hold sources", () => {
		expect(isPickupKeyboardInput("KeyE", false)).toBe(true)
		const buttons = Array.from({ length: 16 }, () => ({
			pressed: false,
			value: 0,
		}))
		buttons[PICKUP_GAMEPAD_BUTTON] = { pressed: true, value: 1 }
		expect(isPickupGamepadInput(buttons)).toBe(true)
	})

	test("starts, reports progress, and completes once while held", () => {
		const started = updateHoldInput(IDLE_HOLD_INPUT_STATE, true, 1_000, 600)
		expect(started).toEqual({
			event: "started",
			progress: 0,
			state: { completed: false, startedAtMs: 1_000 },
		})

		const progressing = updateHoldInput(started.state, true, 1_300, 600)
		expect(progressing.event).toBe("progress")
		expect(progressing.progress).toBe(0.5)

		const completed = updateHoldInput(progressing.state, true, 1_600, 600)
		expect(completed.event).toBe("completed")
		expect(completed.progress).toBe(1)
		expect(updateHoldInput(completed.state, true, 2_000, 600).event).toBe(
			"none",
		)
	})

	test("cancels an incomplete hold and rearms after release", () => {
		const started = updateHoldInput(IDLE_HOLD_INPUT_STATE, true, 10, 600)
		const cancelled = updateHoldInput(started.state, false, 200, 600)
		expect(cancelled).toEqual({
			event: "cancelled",
			progress: 0,
			state: IDLE_HOLD_INPUT_STATE,
		})

		const restarted = updateHoldInput(cancelled.state, true, 300, 600)
		expect(restarted.event).toBe("started")
		expect(restarted.state.startedAtMs).toBe(300)
	})

	test("resets a completed hold on release without reporting cancellation", () => {
		const started = updateHoldInput(IDLE_HOLD_INPUT_STATE, true, 0, 100)
		const completed = updateHoldInput(started.state, true, 100, 100)
		const released = updateHoldInput(completed.state, false, 101, 100)
		expect(released).toEqual({
			event: "none",
			progress: 0,
			state: IDLE_HOLD_INPUT_STATE,
		})
	})

	test("gives contextual pickup priority over right-bumper reload", () => {
		expect(contextualRightBumperAction(true, true)).toBe("pickup")
		expect(contextualRightBumperAction(true, false)).toBe("pickup")
		expect(contextualRightBumperAction(false, true)).toBe("reload")
		expect(contextualRightBumperAction(false, false)).toBeNull()
	})
})

describe("weapon switch input", () => {
	test("accepts one non-repeating Digit1 keyboard edge", () => {
		expect(isWeaponSwitchKeyboardInput("Digit1", false)).toBe(true)
		expect(isWeaponSwitchKeyboardInput("Digit1", true)).toBe(false)
		expect(isWeaponSwitchKeyboardInput("Numpad1", false)).toBe(false)
	})

	test("maps controller Y / Triangle and debounces it on the rising edge", () => {
		const buttons = Array.from({ length: 16 }, () => ({
			pressed: false,
			value: 0,
		}))
		expect(isWeaponSwitchGamepadInput(buttons)).toBe(false)
		buttons[WEAPON_SWITCH_GAMEPAD_BUTTON] = { pressed: true, value: 1 }
		const first = inputEdge(isWeaponSwitchGamepadInput(buttons), false)
		const held = inputEdge(isWeaponSwitchGamepadInput(buttons), first.held)
		expect(first.triggered).toBe(true)
		expect(held.triggered).toBe(false)
	})

	test("normalizes wheel direction and debounces rapid wheel events", () => {
		expect(wheelDirection(8)).toBe("next")
		expect(wheelDirection(-8)).toBe("previous")
		expect(wheelDirection(0)).toBeNull()

		const first = debounceWheelInput(5, 1_000, null, 180)
		expect(first).toEqual({
			direction: "next",
			lastEventAtMs: 1_000,
			triggered: true,
		})
		expect(debounceWheelInput(-5, 1_100, first.lastEventAtMs, 180)).toEqual({
			direction: "previous",
			lastEventAtMs: 1_100,
			triggered: false,
		})
		const burst = debounceWheelInput(-5, 1_100, first.lastEventAtMs, 180)
		expect(debounceWheelInput(-5, 1_180, burst.lastEventAtMs, 180)).toEqual({
			direction: "previous",
			lastEventAtMs: 1_180,
			triggered: false,
		})
		expect(debounceWheelInput(-5, 1_360, 1_180, 180)).toEqual({
			direction: "previous",
			lastEventAtMs: 1_360,
			triggered: true,
		})
	})
})
