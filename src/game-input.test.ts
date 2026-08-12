import { describe, expect, test } from "vitest"

import {
	contextualRightBumperAction,
	BOMB_GAMEPAD_BUTTON,
	debounceWheelInput,
	IDLE_HOLD_INPUT_STATE,
	inputEdge,
	gamepadGestureInputs,
	grappleTriggerHeld,
	isBombGamepadInput,
	isGrappleKeyboardInput,
	isGrenadeSwitchGamepadInput,
	isGrenadeSwitchKeyboardInput,
	keyboardGestureInput,
	isPickupGamepadInput,
	isPickupKeyboardInput,
	isWeaponSwitchGamepadInput,
	isWeaponSwitchKeyboardInput,
	PICKUP_GAMEPAD_BUTTON,
	updateHoldInput,
	WEAPON_SWITCH_GAMEPAD_BUTTON,
	wheelDirection,
} from "./game-input.ts"

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
