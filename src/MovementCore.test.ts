import { describe, expect, test } from "vitest"

import {
	INITIAL_MOVEMENT_CORE_STATE,
	resetMovementCore,
	stepMovementCore,
} from "./MovementCore.ts"

describe("movement core", () => {
	test("LS toggles autorun on an edge at rest and waits for intentional input", () => {
		let step = stepMovementCore(INITIAL_MOVEMENT_CORE_STATE, {
			leftStickPressed: true,
			stick: { x: 0, y: 0 },
		})
		expect(step.state.autorun).toBe(true)
		expect(step.direction).toEqual({ x: 0, y: 0 })

		step = stepMovementCore(step.state, {
			leftStickPressed: true,
			stick: { x: 0, y: 0 },
		})
		expect(step.state.autorun).toBe(true)
	})

	test("autorun remembers and updates the latest intentional direction", () => {
		let step = stepMovementCore(INITIAL_MOVEMENT_CORE_STATE, {
			leftStickPressed: true,
			stick: { x: 0.8, y: 0 },
		})
		expect(step.state.autorun).toBe(true)
		expect(step.direction).toEqual({ x: 1, y: 0 })

		step = stepMovementCore(step.state, {
			leftStickPressed: false,
			stick: { x: 0, y: -0.9 },
		})
		step = stepMovementCore(step.state, {
			leftStickPressed: false,
			stick: { x: 0, y: 0 },
		})
		expect(step.direction).toEqual({ x: 0, y: -1 })
	})

	test("LS toggles autorun off in motion without held-repeat", () => {
		let step = stepMovementCore(INITIAL_MOVEMENT_CORE_STATE, {
			leftStickPressed: true,
			stick: { x: 0, y: -1 },
		})
		step = stepMovementCore(step.state, {
			leftStickPressed: false,
			stick: { x: 0, y: 0 },
		})
		expect(step.direction).toEqual({ x: 0, y: -1 })
		step = stepMovementCore(step.state, {
			leftStickPressed: true,
			stick: { x: 0.4, y: -0.8 },
		})
		expect(step.state.autorun).toBe(false)
		expect(step.direction.x).toBeCloseTo(1 / Math.sqrt(5))
		expect(step.direction.y).toBeCloseTo(-2 / Math.sqrt(5))
	})

	test("ignores drift and lifecycle reset clears autorun memory", () => {
		const step = stepMovementCore(INITIAL_MOVEMENT_CORE_STATE, {
			leftStickPressed: false,
			stick: { x: 0.12, y: -0.02 },
		})
		expect(step.direction).toEqual({ x: 0, y: 0 })
		expect(step.state.rememberedDirection).toBeNull()
		expect(resetMovementCore()).toEqual(INITIAL_MOVEMENT_CORE_STATE)
	})
})
