import type { WallTraversalMode } from "./WallTraversal.ts"

export const CAMERA_BASE_FOV_DEGREES = 76
export const CAMERA_MAX_SPEED_FOV_BONUS_DEGREES = 15
export const CAMERA_MAX_SPEED_FOV_KMH = 100
export const WALL_RUN_CAMERA_ROLL_RADIANS = 0.11
export const WALL_SLIDE_CAMERA_ROLL_RADIANS = 0.065

const CAMERA_FOV_RESPONSE_PER_SECOND = 4
const CAMERA_ROLL_RESPONSE_PER_SECOND = 10
const METERS_PER_SECOND_TO_KILOMETERS_PER_HOUR = 3.6

function finiteNonNegative(value: number): number {
	return Number.isFinite(value) ? Math.max(0, value) : 0
}

function exponentialResponse(responsePerSecond: number, delta: number): number {
	return 1 - Math.exp(-responsePerSecond * finiteNonNegative(delta))
}

function approach(
	current: number,
	target: number,
	delta: number,
	responsePerSecond: number,
): number {
	const safeCurrent = Number.isFinite(current) ? current : target
	return (
		safeCurrent +
		(target - safeCurrent) * exponentialResponse(responsePerSecond, delta)
	)
}

export function cameraFovTarget(planarSpeedMetersPerSecond: number): number {
	const speedKmh =
		finiteNonNegative(planarSpeedMetersPerSecond) *
		METERS_PER_SECOND_TO_KILOMETERS_PER_HOUR
	const progress = Math.min(speedKmh / CAMERA_MAX_SPEED_FOV_KMH, 1)
	return CAMERA_BASE_FOV_DEGREES + CAMERA_MAX_SPEED_FOV_BONUS_DEGREES * progress
}

export function stepCameraFov(
	currentFovDegrees: number,
	planarSpeedMetersPerSecond: number,
	delta: number,
): number {
	const target = cameraFovTarget(planarSpeedMetersPerSecond)
	return Math.min(
		CAMERA_BASE_FOV_DEGREES + CAMERA_MAX_SPEED_FOV_BONUS_DEGREES,
		Math.max(
			CAMERA_BASE_FOV_DEGREES,
			approach(
				currentFovDegrees,
				target,
				delta,
				CAMERA_FOV_RESPONSE_PER_SECOND,
			),
		),
	)
}

export function wallCameraRollTarget(
	mode: WallTraversalMode,
	wallNormal: readonly [number, number, number],
	pilotYaw: number,
): number {
	if (mode === "none") return 0
	const normalX = Number.isFinite(wallNormal[0]) ? wallNormal[0] : 0
	const normalZ = Number.isFinite(wallNormal[2]) ? wallNormal[2] : 0
	const yaw = Number.isFinite(pilotYaw) ? pilotYaw : 0
	const planarLength = Math.hypot(normalX, normalZ)
	if (planarLength === 0) return 0
	const wallSide =
		(normalX * Math.cos(yaw) - normalZ * Math.sin(yaw)) / planarLength
	return mode === "run"
		? -wallSide * WALL_RUN_CAMERA_ROLL_RADIANS
		: wallSide * WALL_SLIDE_CAMERA_ROLL_RADIANS
}

export function stepCameraRoll(
	currentRollRadians: number,
	targetRollRadians: number,
	delta: number,
): number {
	const safeTarget = Number.isFinite(targetRollRadians) ? targetRollRadians : 0
	return approach(
		currentRollRadians,
		safeTarget,
		delta,
		CAMERA_ROLL_RESPONSE_PER_SECOND,
	)
}
