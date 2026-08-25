import { describe, expect, test } from "vitest"

import {
	isVehicleDriverKeyboardCode,
	vehicleDriverInput,
} from "./VehicleInput.ts"

const noGamepad = {
	accelerator: 0,
	afterburner: false,
	brakeReverse: 0,
	handbrake: false,
	steering: 0,
}

describe("standard vehicle controls", () => {
	test("recognizes only dedicated driving keys for low-latency updates", () => {
		for (const code of ["KeyW", "ArrowDown", "KeyA", "Space", "ShiftLeft"])
			expect(isVehicleDriverKeyboardCode(code)).toBe(true)
		for (const code of ["KeyE", "KeyF", "KeyR"])
			expect(isVehicleDriverKeyboardCode(code)).toBe(false)
	})

	test("maps WASD and arrow keys to drive, brake/reverse, and steering", () => {
		expect(
			vehicleDriverInput("jeep", new Set(["ArrowUp", "ArrowRight"]), noGamepad),
		).toMatchObject({ steering: 1, throttle: 1 })
		expect(
			vehicleDriverInput("jeep", new Set(["KeyS", "KeyA"]), noGamepad),
		).toMatchObject({ steering: -1, throttle: -1 })
	})

	test("maps RT/LT, left stick, and A without using stick Y for throttle", () => {
		expect(
			vehicleDriverInput("jeep", new Set(), {
				accelerator: 0.8,
				afterburner: false,
				brakeReverse: 0.2,
				handbrake: true,
				steering: -0.55,
			}),
		).toEqual({
			afterburner: false,
			handbrake: true,
			steering: -0.55,
			throttle: 0.6000000000000001,
		})
	})

	test("keeps afterburner bike-only on Shift or LB", () => {
		const boost = { ...noGamepad, afterburner: true }
		expect(vehicleDriverInput("bike", new Set(), boost).afterburner).toBe(true)
		expect(vehicleDriverInput("jeep", new Set(), boost).afterburner).toBe(false)
	})
})
