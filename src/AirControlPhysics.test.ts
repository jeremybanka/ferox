import { describe, expect, test } from "vitest"

import {
	AIR_CONTROL_PHYSICS,
	airControlOwner,
	applyAirControl,
} from "./AirControlPhysics.ts"
import { PLAYER_STANDING_ACCELERATION } from "./game-constants.ts"

describe("air control", () => {
	test("adds weaker, delta-invariant cardinal and diagonal acceleration", () => {
		expect(AIR_CONTROL_PHYSICS.acceleration).toBeLessThan(
			PLAYER_STANDING_ACCELERATION,
		)
		const oneStep = applyAirControl(
			{ x: 0, z: 0 },
			{ x: 1, z: -1 },
			0.04,
			"ordinary",
		)
		const halfStep = applyAirControl(
			applyAirControl({ x: 0, z: 0 }, { x: 1, z: -1 }, 0.02, "ordinary"),
			{ x: 1, z: -1 },
			0.02,
			"ordinary",
		)
		expect(halfStep.x).toBeCloseTo(oneStep.x)
		expect(halfStep.z).toBeCloseTo(oneStep.z)
		expect(Math.hypot(oneStep.x, oneStep.z)).toBeCloseTo(
			AIR_CONTROL_PHYSICS.acceleration * 0.04,
		)
	})

	test("preserves no-input and high incoming momentum without a speed clamp", () => {
		const incoming = { x: 80, z: -35 }
		expect(applyAirControl(incoming, null, 0.04, "ordinary")).toBe(incoming)
		const steered = applyAirControl(incoming, { x: 0, z: 1 }, 0.04, "ordinary")
		expect(steered.x).toBe(80)
		expect(steered.z).toBeGreaterThan(-35)
		expect(Math.hypot(steered.x, steered.z)).toBeGreaterThan(80)
	})

	test("supports gradual reversal and lateral steering", () => {
		const lateral = applyAirControl(
			{ x: 10, z: 0 },
			{ x: 0, z: -1 },
			0.1,
			"ordinary",
		)
		const reversal = applyAirControl(
			{ x: 10, z: 0 },
			{ x: -1, z: 0 },
			0.1,
			"ordinary",
		)
		expect(lateral).toEqual({ x: 10, z: -0.55 })
		expect(reversal.x).toBeCloseTo(9.45)
		expect(reversal.x).toBeGreaterThan(0)
	})

	test.each([
		{
			expected: "grapple",
			grappleAttached: true,
			mantling: false,
			sliding: false,
			wallTraversal: false,
		},
		{
			expected: "mantle",
			grappleAttached: false,
			mantling: true,
			sliding: false,
			wallTraversal: false,
		},
		{
			expected: "slide",
			grappleAttached: false,
			mantling: false,
			sliding: true,
			wallTraversal: false,
		},
		{
			expected: "wall",
			grappleAttached: false,
			mantling: false,
			sliding: false,
			wallTraversal: true,
		},
		{
			expected: "ordinary",
			grappleAttached: false,
			mantling: false,
			sliding: false,
			wallTraversal: false,
		},
	] as const)(
		"assigns $expected movement ownership",
		({ expected, ...state }) => {
			const owner = airControlOwner(state)
			expect(owner).toBe(expected)
			const velocity = { x: 2, z: 3 }
			const result = applyAirControl(velocity, { x: 1, z: 0 }, 0.1, owner)
			if (owner === "ordinary") expect(result.x).toBeGreaterThan(velocity.x)
			else expect(result).toBe(velocity)
		},
	)

	test("rejects non-finite direction and delta", () => {
		const velocity = { x: 4, z: -2 }
		expect(
			applyAirControl(velocity, { x: Number.NaN, z: 0 }, 0.1, "ordinary"),
		).toBe(velocity)
		expect(
			applyAirControl(velocity, { x: 1, z: 0 }, Number.NaN, "ordinary"),
		).toEqual(velocity)
	})
})
