import { describe, expect, test } from "vitest"

import {
	isMiniMissilePickupIntent,
	isNewMiniMissilePickupIntent,
} from "./arena-protocol.ts"

import {
	inputEdge,
	isPickupGamepadInput,
	isPickupKeyboardInput,
	PICKUP_GAMEPAD_BUTTON,
} from "./game-input.ts"

describe("pickup input", () => {
	test("parses sequenced pickup intents and rejects malformed or replayed IDs", () => {
		expect(isMiniMissilePickupIntent({ clientPickupId: 3 })).toBe(true)
		expect(isMiniMissilePickupIntent({ clientPickupId: -1 })).toBe(false)
		expect(isMiniMissilePickupIntent({ clientPickupId: 1.5 })).toBe(false)
		expect(isMiniMissilePickupIntent(null)).toBe(false)
		expect(isNewMiniMissilePickupIntent({ clientPickupId: 4 }, 3)).toBe(true)
		expect(isNewMiniMissilePickupIntent({ clientPickupId: 3 }, 3)).toBe(false)
	})

	test("accepts one non-repeating E key edge", () => {
		expect(isPickupKeyboardInput("KeyE", false)).toBe(true)
		expect(isPickupKeyboardInput("KeyE", true)).toBe(false)
		expect(isPickupKeyboardInput("KeyF", false)).toBe(false)
	})

	test("maps controller Y / Triangle and ignores unrelated buttons", () => {
		const buttons = Array.from({ length: 16 }, () => ({
			pressed: false,
			value: 0,
		}))
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
