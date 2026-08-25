import { describe, expect, test } from "vitest"

import {
	PLAYER_STANDING_ACCELERATION,
	PLAYER_STANDING_SPEED_LIMIT,
} from "./game-constants.ts"
import { stepGroundMovement } from "./GroundMovementPhysics.ts"

describe("ground movement", () => {
	test("sustained standing input accelerates smoothly to one top speed", () => {
		let velocity = { x: 0, z: 0 }
		const speeds: number[] = []
		for (let index = 0; index < 120; index += 1) {
			velocity = stepGroundMovement(velocity, {
				crouching: false,
				delta: 1 / 60,
				desiredDirection: { x: 1, z: 0 },
			})
			speeds.push(Math.hypot(velocity.x, velocity.z))
		}
		expect(PLAYER_STANDING_ACCELERATION).toBe(31)
		expect(speeds[0]).toBeGreaterThan(0)
		expect(speeds[0]).toBeLessThan(PLAYER_STANDING_SPEED_LIMIT)
		expect(speeds.every((speed) => speed <= PLAYER_STANDING_SPEED_LIMIT)).toBe(
			true,
		)
		expect(speeds.at(-1)).toBeCloseTo(PLAYER_STANDING_SPEED_LIMIT)
	})

	test("neutral input decelerates while airborne momentum remains separate", () => {
		const moving = { x: PLAYER_STANDING_SPEED_LIMIT, z: 0 }
		const neutral = stepGroundMovement(moving, {
			crouching: false,
			delta: 0.1,
			desiredDirection: null,
		})
		expect(neutral.x).toBeGreaterThan(0)
		expect(neutral.x).toBeLessThan(moving.x)
	})

	test("equivalent diagonal and cardinal input produce equal acceleration", () => {
		const cardinal = stepGroundMovement(
			{ x: 0, z: 0 },
			{
				crouching: false,
				delta: 0.04,
				desiredDirection: { x: 1, z: 0 },
			},
		)
		const diagonal = stepGroundMovement(
			{ x: 0, z: 0 },
			{
				crouching: false,
				delta: 0.04,
				desiredDirection: { x: 1, z: -1 },
			},
		)
		expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(cardinal.x)
	})
})
