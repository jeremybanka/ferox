import { describe, expect, test } from "vitest"

import {
	INITIAL_MOVEMENT_CORE_STATE,
	isForwardish,
	resetMovementCore,
	stepMovementCore,
} from "./MovementCore.ts"

describe("movement core", () => {
	test("latches forward sprint on an LS edge until the stick returns neutral", () => {
		let step = stepMovementCore(INITIAL_MOVEMENT_CORE_STATE, {
			canSprint: true,
			leftStickPressed: true,
			stick: { x: 0.2, y: -0.9 },
		})
		expect(step.state.sprintLatched).toBe(true)
		step = stepMovementCore(step.state, {
			canSprint: true,
			leftStickPressed: false,
			stick: { x: 0.2, y: -0.9 },
		})
		expect(step.state.sprintLatched).toBe(true)
		step = stepMovementCore(step.state, {
			canSprint: true,
			leftStickPressed: false,
			stick: { x: 0.02, y: 0 },
		})
		expect(step.state.sprintLatched).toBe(false)
	})

	test("stationary LS toggles freerun and persists the last direction", () => {
		let step = stepMovementCore(INITIAL_MOVEMENT_CORE_STATE, {
			canSprint: true,
			leftStickPressed: true,
			stick: { x: 0, y: 0 },
		})
		expect(step.state.freerun).toBe(true)
		step = stepMovementCore(step.state, {
			canSprint: true,
			leftStickPressed: false,
			stick: { x: 0.8, y: 0 },
		})
		step = stepMovementCore(step.state, {
			canSprint: true,
			leftStickPressed: false,
			stick: { x: 0, y: 0 },
		})
		expect(step.direction).toEqual({ x: 1, y: 0 })
		step = stepMovementCore(step.state, {
			canSprint: true,
			leftStickPressed: true,
			stick: { x: 0, y: 0 },
		})
		expect(step.state.freerun).toBe(false)
		expect(step.direction).toEqual({ x: 0, y: 0 })
	})

	test("distinct forward pushes toggle freerun sprint without held-repeat", () => {
		let state = stepMovementCore(INITIAL_MOVEMENT_CORE_STATE, {
			canSprint: true,
			leftStickPressed: true,
			stick: { x: 0, y: 0 },
		}).state
		state = stepMovementCore(state, {
			canSprint: true,
			leftStickPressed: false,
			stick: { x: 0, y: -1 },
		}).state
		expect(state.sprintLatched).toBe(false)
		state = stepMovementCore(state, {
			canSprint: true,
			leftStickPressed: false,
			stick: { x: 0, y: 0 },
		}).state
		state = stepMovementCore(state, {
			canSprint: true,
			leftStickPressed: false,
			stick: { x: 0, y: -1 },
		}).state
		expect(state.sprintLatched).toBe(true)
		state = stepMovementCore(state, {
			canSprint: true,
			leftStickPressed: false,
			stick: { x: 0, y: -1 },
		}).state
		expect(state.sprintLatched).toBe(true)
	})

	test("rejects sideways sprint, ignores drift, and resets lifecycle state", () => {
		expect(isForwardish({ x: 1, y: 0 })).toBe(false)
		const step = stepMovementCore(INITIAL_MOVEMENT_CORE_STATE, {
			canSprint: true,
			leftStickPressed: true,
			stick: { x: 0.12, y: -0.02 },
		})
		expect(step.state).toMatchObject({ freerun: false, sprintLatched: false })
		expect(resetMovementCore()).toEqual(INITIAL_MOVEMENT_CORE_STATE)
	})
})
