import { describe, expect, test } from "vitest"

import { stepVehicleMotion, type VehicleMotion } from "./VehiclePhysics.ts"

const world = {
	groundAt: (x: number, z: number) => x * 0.02 + z * 0.01,
	resolveMotion: (
		_start: readonly [number, number],
		requested: readonly [number, number],
		_radius: number,
	) => ({ blocked: false, x: requested[0], z: requested[1] }),
}
const initial: VehicleMotion = {
	airborne: false,
	lean: 0,
	pitch: 0,
	position: [0, 1.05, 0],
	velocity: [0, 0, 0],
	yaw: 0,
}

describe("vehicle fixed-step motion", () => {
	test("bounds afterburner speed and remains finite", () => {
		let state = initial
		for (let index = 0; index < 1_800; index += 1)
			state = stepVehicleMotion(
				"bike",
				state,
				{
					afterburner: true,
					brake: false,
					steering: Math.sin(index / 40),
					throttle: 1,
				},
				1 / 60,
				world,
			)
		expect([...state.position, ...state.velocity, state.yaw]).toSatisfy(
			(values: number[]) => values.every(Number.isFinite),
		)
		expect(Math.hypot(state.velocity[0], state.velocity[2])).toBeLessThan(36)
	})

	test("jeep landing bounce is energetic but bounded", () => {
		let state: VehicleMotion = {
			...initial,
			position: [0, 12, 0],
			velocity: [0, -18, 0],
		}
		let maximumUpward = 0
		for (let index = 0; index < 240; index += 1) {
			state = stepVehicleMotion(
				"jeep",
				state,
				{ afterburner: false, brake: false, steering: 0, throttle: 0 },
				1 / 60,
				world,
			)
			maximumUpward = Math.max(maximumUpward, state.velocity[1])
		}
		expect(maximumUpward).toBeGreaterThan(5)
		expect(maximumUpward).toBeLessThanOrEqual(9)
		expect(state.position[1]).toBeGreaterThanOrEqual(1.05)
	})

	test("footprint collision damps instead of adding energy", () => {
		const blockedWorld = {
			...world,
			resolveMotion: () => ({ blocked: true, x: 0, z: -0.5 }),
		}
		const state = stepVehicleMotion(
			"jeep",
			{ ...initial, velocity: [0, 0, -18] },
			{ afterburner: false, brake: false, steering: 0, throttle: 1 },
			1 / 30,
			blockedWorld,
		)
		expect(Math.hypot(state.velocity[0], state.velocity[2])).toBeLessThan(5)
	})
})
