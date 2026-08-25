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

const neutral = {
	afterburner: false,
	handbrake: false,
	steering: 0,
	throttle: 0,
}

const flatWorld = { ...world, groundAt: () => 0 }

describe("vehicle fixed-step motion", () => {
	test("bounds afterburner speed and remains finite", () => {
		let state = initial
		for (let index = 0; index < 1_800; index += 1)
			state = stepVehicleMotion(
				"bike",
				state,
				{
					afterburner: true,
					handbrake: false,
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
				{ afterburner: false, handbrake: false, steering: 0, throttle: 0 },
				1 / 60,
				world,
			)
			maximumUpward = Math.max(maximumUpward, state.velocity[1])
		}
		expect(maximumUpward).toBeGreaterThan(5)
		expect(maximumUpward).toBeLessThanOrEqual(9)
		expect(state.position[1]).toBeGreaterThanOrEqual(1.05)
	})

	test("applies strong forward drive impulse relative to chassis heading", () => {
		let state = initial
		for (let index = 0; index < 30; index += 1)
			state = stepVehicleMotion(
				"jeep",
				state,
				{ ...neutral, throttle: 1 },
				1 / 60,
				flatWorld,
			)
		expect(state.velocity[2]).toBeLessThan(-9)
		expect(Math.abs(state.velocity[0])).toBeLessThan(0.01)
	})

	test("right steering turns right and scales with forward speed", () => {
		const slow = stepVehicleMotion(
			"jeep",
			initial,
			{ ...neutral, steering: 1, throttle: 1 },
			1 / 30,
			flatWorld,
		)
		const fast = stepVehicleMotion(
			"jeep",
			{ ...initial, velocity: [0, 0, -12] },
			{ ...neutral, steering: 1, throttle: 1 },
			1 / 30,
			flatWorld,
		)
		expect(slow.yaw).toBeLessThan(0)
		expect(fast.yaw).toBeLessThan(slow.yaw)
		expect(fast.velocity[0]).toBeGreaterThan(0)
	})

	test("does not pivot in place from steering alone", () => {
		let state = initial
		for (let index = 0; index < 120; index += 1)
			state = stepVehicleMotion(
				"jeep",
				state,
				{ ...neutral, steering: 1 },
				1 / 60,
				flatWorld,
			)
		expect(state.yaw).toBe(0)
		expect(state.position).toEqual(initial.position)
	})

	test("brakes before crossing into reverse", () => {
		let state: VehicleMotion = { ...initial, velocity: [0, 0, -12] }
		state = stepVehicleMotion(
			"jeep",
			state,
			{ ...neutral, throttle: -1 },
			1 / 30,
			flatWorld,
		)
		expect(state.velocity[2]).toBeLessThan(0)
		expect(state.velocity[2]).toBeGreaterThan(-12)
		for (let index = 0; index < 50; index += 1)
			state = stepVehicleMotion(
				"jeep",
				state,
				{ ...neutral, throttle: -1 },
				1 / 30,
				flatWorld,
			)
		expect(state.velocity[2]).toBeGreaterThan(3)
		expect(state.velocity[2]).toBeLessThanOrEqual(9)
	})

	test("handbrake rapidly settles planar velocity without reversing", () => {
		let state: VehicleMotion = { ...initial, velocity: [4, 0, -14] }
		for (let index = 0; index < 30; index += 1)
			state = stepVehicleMotion(
				"jeep",
				state,
				{ ...neutral, handbrake: true },
				1 / 60,
				flatWorld,
			)
		expect(Math.hypot(state.velocity[0], state.velocity[2])).toBeLessThan(0.2)
	})

	test("settles completely at idle without chassis jitter", () => {
		let state = initial
		let maximumVerticalSpeed = 0
		for (let index = 0; index < 900; index += 1) {
			state = stepVehicleMotion("jeep", state, neutral, 1 / 60, flatWorld)
			maximumVerticalSpeed = Math.max(
				maximumVerticalSpeed,
				Math.abs(state.velocity[1]),
			)
		}
		expect(state.position).toEqual([0, 1.05, 0])
		expect(maximumVerticalSpeed).toBe(0)
	})

	test("turns a terrain step impact into one bounded suspension bounce", () => {
		const stepWorld = {
			...world,
			groundAt: (_x: number, z: number) => (z < -3 ? 0.65 : 0),
		}
		let state: VehicleMotion = { ...initial, velocity: [0, 0, -11] }
		let maximumUpwardSpeed = 0
		for (let index = 0; index < 120; index += 1) {
			state = stepVehicleMotion(
				"jeep",
				state,
				{ ...neutral, throttle: 1 },
				1 / 60,
				stepWorld,
			)
			maximumUpwardSpeed = Math.max(maximumUpwardSpeed, state.velocity[1])
		}
		expect(maximumUpwardSpeed).toBeGreaterThan(2)
		expect(maximumUpwardSpeed).toBeLessThanOrEqual(8.5)
	})

	test("keeps energy bounded across common server timesteps", () => {
		const run = (delta: number): VehicleMotion => {
			let state: VehicleMotion = { ...initial, position: [0, 8, 0] }
			for (let elapsed = 0; elapsed < 6; elapsed += delta)
				state = stepVehicleMotion(
					"jeep",
					state,
					{ ...neutral, steering: 0.4, throttle: 1 },
					delta,
					flatWorld,
				)
			return state
		}
		for (const state of [run(1 / 30), run(1 / 60), run(1 / 120)]) {
			expect([...state.position, ...state.velocity]).toSatisfy(
				(values: number[]) => values.every(Number.isFinite),
			)
			expect(Math.hypot(...state.velocity)).toBeLessThan(25)
			expect(state.position[1]).toBeLessThan(7)
		}
	})

	test("footprint collision damps instead of adding energy", () => {
		const blockedWorld = {
			...world,
			resolveMotion: () => ({ blocked: true, x: 0, z: -0.5 }),
		}
		const state = stepVehicleMotion(
			"jeep",
			{ ...initial, velocity: [0, 0, -18] },
			{ afterburner: false, handbrake: false, steering: 0, throttle: 1 },
			1 / 30,
			blockedWorld,
		)
		expect(Math.hypot(state.velocity[0], state.velocity[2])).toBeLessThan(5)
	})
})
