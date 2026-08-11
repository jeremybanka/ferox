import { describe, expect, test } from "vitest"

import {
	CAMERA_BASE_FOV_DEGREES,
	cameraFovTarget,
	stepCameraFov,
	stepCameraRoll,
	WALL_RUN_CAMERA_ROLL_RADIANS,
	WALL_SLIDE_CAMERA_ROLL_RADIANS,
	wallCameraRollTarget,
} from "./CameraFeedback.ts"

describe("speed-based camera FOV", () => {
	test.each([
		[0, 76],
		[50 / 3.6, 83.5],
		[100 / 3.6, 91],
		[500 / 3.6, 91],
		[-20, 76],
		[Number.NaN, 76],
		[Number.POSITIVE_INFINITY, 76],
	])("maps %s m/s to a clamped %s-degree target", (speed, expected) => {
		expect(cameraFovTarget(speed)).toBeCloseTo(expected)
	})

	test("approaches the target monotonically without overshoot", () => {
		const first = stepCameraFov(CAMERA_BASE_FOV_DEGREES, 100 / 3.6, 1 / 60)
		const second = stepCameraFov(first, 100 / 3.6, 1 / 60)
		expect(first).toBeGreaterThan(CAMERA_BASE_FOV_DEGREES)
		expect(second).toBeGreaterThan(first)
		expect(second).toBeLessThan(91)
		expect(stepCameraFov(91, 0, 1 / 60)).toBeLessThan(91)
		expect(stepCameraFov(91, 0, 0)).toBe(91)
		expect(stepCameraFov(200, 500 / 3.6, 1 / 60)).toBe(91)
		expect(stepCameraFov(0, 0, 1 / 60)).toBe(76)
	})

	test("uses elapsed time rather than frame count", () => {
		const oneStep = stepCameraFov(76, 100 / 3.6, 1 / 30)
		const twoSteps = stepCameraFov(
			stepCameraFov(76, 100 / 3.6, 1 / 60),
			100 / 3.6,
			1 / 60,
		)
		expect(oneStep).toBeCloseTo(twoSteps, 10)
	})
})

describe("wall traversal camera roll", () => {
	test("rolls away from left and right walls with mirrored run targets", () => {
		const leftWall = wallCameraRollTarget("run", [1, 0, 0], 0)
		const rightWall = wallCameraRollTarget("run", [-1, 0, 0], 0)
		expect(leftWall).toBe(-WALL_RUN_CAMERA_ROLL_RADIANS)
		expect(rightWall).toBe(WALL_RUN_CAMERA_ROLL_RADIANS)
	})

	test("keeps the existing wall-slide direction explicit", () => {
		expect(wallCameraRollTarget("slide", [1, 0, 0], 0)).toBe(
			WALL_SLIDE_CAMERA_ROLL_RADIANS,
		)
		expect(wallCameraRollTarget("slide", [-1, 0, 0], 0)).toBe(
			-WALL_SLIDE_CAMERA_ROLL_RADIANS,
		)
	})

	test("returns neutral without traversal or a usable wall normal", () => {
		expect(wallCameraRollTarget("none", [1, 0, 0], 0)).toBe(0)
		expect(wallCameraRollTarget("run", [0, 1, 0], 0)).toBe(0)
	})

	test("smooths entry, exit, and side changes by elapsed time", () => {
		const entered = stepCameraRoll(0, -WALL_RUN_CAMERA_ROLL_RADIANS, 1 / 60)
		const exited = stepCameraRoll(entered, 0, 1 / 60)
		const mirrored = stepCameraRoll(
			entered,
			WALL_RUN_CAMERA_ROLL_RADIANS,
			1 / 60,
		)
		expect(entered).toBeLessThan(0)
		expect(entered).toBeGreaterThan(-WALL_RUN_CAMERA_ROLL_RADIANS)
		expect(Math.abs(exited)).toBeLessThan(Math.abs(entered))
		expect(mirrored).toBeGreaterThan(entered)

		const oneStep = stepCameraRoll(0, WALL_RUN_CAMERA_ROLL_RADIANS, 1 / 30)
		const twoSteps = stepCameraRoll(
			stepCameraRoll(0, WALL_RUN_CAMERA_ROLL_RADIANS, 1 / 60),
			WALL_RUN_CAMERA_ROLL_RADIANS,
			1 / 60,
		)
		expect(oneStep).toBeCloseTo(twoSteps, 10)
	})
})
