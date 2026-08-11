import {
	PLAYER_CROUCH_BASE_SPEED_LIMIT,
	PLAYER_RUN_SPEED_LIMIT,
	PLAYER_SPRINT_SPEED_LIMIT,
} from "./game-constants.ts"

export const SLIDE_PHYSICS = {
	entryPlanarSpeed: PLAYER_RUN_SPEED_LIMIT,
	entrySlopeDegrees: 30,
	entrySlopeNormalUpDot: Math.cos(Math.PI / 6),
	entrySlopeRadians: Math.PI / 6,
	flatFriction: 1.05,
	gravity: 23,
	maximumSpeed: PLAYER_SPRINT_SPEED_LIMIT,
	minimumDynamicSlopeGrade: 0.015,
	exitSpeed: PLAYER_CROUCH_BASE_SPEED_LIMIT * 0.5,
	terrainSampleDistance: 0.4,
} as const

export type PlanarVelocity = {
	x: number
	z: number
}

export type TerrainGradient = {
	x: number
	z: number
}

export type SlidePhysicsState = PlanarVelocity & {
	sliding: boolean
}

export type MovementState = "airborne" | "crouching" | "running" | "sliding"

export type SlidePhysicsStep = SlidePhysicsState & {
	downhillAcceleration: PlanarVelocity
	movementState: MovementState
	slopeAngleRadians: number
	slopeGrade: number
}

export function resolveMovementState(options: {
	crouching: boolean
	grounded: boolean
	planarSpeed: number
	slopeNormalUpDot: number
	wasSliding: boolean
}): MovementState {
	if (!options.grounded) return "airborne"
	if (!options.crouching) return "running"
	if (
		options.slopeNormalUpDot <= SLIDE_PHYSICS.entrySlopeNormalUpDot ||
		options.planarSpeed > SLIDE_PHYSICS.entryPlanarSpeed ||
		(options.wasSliding && options.planarSpeed > SLIDE_PHYSICS.exitSpeed)
	) {
		return "sliding"
	}
	return "crouching"
}

export function slopeAngleFromTerrainGradient(
	terrainGradient: TerrainGradient,
): number {
	return Math.acos(slopeNormalUpDotFromTerrainGradient(terrainGradient))
}

export function slopeNormalUpDotFromTerrainGradient(
	terrainGradient: TerrainGradient,
): number {
	const normalLength = Math.hypot(terrainGradient.x, 1, terrainGradient.z)
	if (Number.isNaN(normalLength)) return 1
	if (!Number.isFinite(normalLength)) return 0
	return Math.min(1, Math.max(-1, 1 / normalLength))
}

export function movementSpeedLimit(options: {
	crouching: boolean
	grounded: boolean
	sliding: boolean
	sprinting: boolean
}): number | null {
	if (!options.grounded) return null
	if (options.sliding || options.sprinting) {
		return PLAYER_SPRINT_SPEED_LIMIT
	}
	return options.crouching
		? PLAYER_CROUCH_BASE_SPEED_LIMIT
		: PLAYER_RUN_SPEED_LIMIT
}

export function limitHorizontalSpeed(
	velocity: PlanarVelocity,
	options: {
		crouching: boolean
		grounded: boolean
		sliding: boolean
		sprinting: boolean
	},
): PlanarVelocity {
	const cap = movementSpeedLimit(options)
	if (cap === null) return velocity
	const speed = Math.hypot(velocity.x, velocity.z)
	if (speed <= cap) return velocity
	const scale = cap / speed
	return { x: velocity.x * scale, z: velocity.z * scale }
}

export function sampleTerrainGradient(
	heightAt: (x: number, z: number) => number,
	x: number,
	z: number,
	sampleDistance = SLIDE_PHYSICS.terrainSampleDistance,
): TerrainGradient {
	const distance = Math.max(0.001, Math.abs(sampleDistance))
	return {
		x: (heightAt(x + distance, z) - heightAt(x - distance, z)) / (2 * distance),
		z: (heightAt(x, z + distance) - heightAt(x, z - distance)) / (2 * distance),
	}
}

export function stepSlidePhysics(
	state: SlidePhysicsState,
	options: {
		crouching: boolean
		delta: number
		grounded: boolean
		terrainGradient: TerrainGradient
	},
): SlidePhysicsStep {
	const delta = Math.max(0, options.delta)
	const slopeGrade = Math.hypot(
		options.terrainGradient.x,
		options.terrainGradient.z,
	)
	const slopeNormalUpDot = slopeNormalUpDotFromTerrainGradient(
		options.terrainGradient,
	)
	const slopeAngleRadians = Math.acos(slopeNormalUpDot)
	const speed = Math.hypot(state.x, state.z)
	const slopeAffectsMotion =
		slopeGrade >= SLIDE_PHYSICS.minimumDynamicSlopeGrade
	const movementState = resolveMovementState({
		crouching: options.crouching,
		grounded: options.grounded,
		planarSpeed: speed,
		slopeNormalUpDot,
		wasSliding: state.sliding,
	})
	const sliding = movementState === "sliding"

	if (!sliding) {
		return {
			downhillAcceleration: { x: 0, z: 0 },
			movementState,
			slopeAngleRadians,
			slopeGrade,
			sliding: false,
			x: state.x,
			z: state.z,
		}
	}

	if (!slopeAffectsMotion) {
		const damping = Math.exp(-SLIDE_PHYSICS.flatFriction * delta)
		return limitSlideSpeed({
			downhillAcceleration: { x: 0, z: 0 },
			movementState,
			slopeAngleRadians,
			slopeGrade,
			sliding: true,
			x: state.x * damping,
			z: state.z * damping,
		})
	}

	const gradientScale =
		-SLIDE_PHYSICS.gravity / Math.sqrt(1 + slopeGrade * slopeGrade)
	const downhillAcceleration = {
		x: options.terrainGradient.x * gradientScale,
		z: options.terrainGradient.z * gradientScale,
	}
	const downhillX = downhillAcceleration.x / SLIDE_PHYSICS.gravity
	const downhillZ = downhillAcceleration.z / SLIDE_PHYSICS.gravity
	const downhillLength = Math.hypot(downhillX, downhillZ)
	const directionX = downhillX / downhillLength
	const directionZ = downhillZ / downhillLength
	const velocityX = state.x + downhillAcceleration.x * delta
	const velocityZ = state.z + downhillAcceleration.z * delta
	const downhillSpeed = velocityX * directionX + velocityZ * directionZ
	const crossSlopeX = velocityX - directionX * downhillSpeed
	const crossSlopeZ = velocityZ - directionZ * downhillSpeed
	const crossSlopeDamping = Math.exp(-SLIDE_PHYSICS.flatFriction * delta)

	return limitSlideSpeed({
		downhillAcceleration,
		movementState,
		slopeAngleRadians,
		slopeGrade,
		sliding: true,
		x: directionX * downhillSpeed + crossSlopeX * crossSlopeDamping,
		z: directionZ * downhillSpeed + crossSlopeZ * crossSlopeDamping,
	})
}

function limitSlideSpeed(step: SlidePhysicsStep): SlidePhysicsStep {
	const speed = Math.hypot(step.x, step.z)
	if (speed <= SLIDE_PHYSICS.maximumSpeed) return step
	const scale = SLIDE_PHYSICS.maximumSpeed / speed
	return { ...step, x: step.x * scale, z: step.z * scale }
}
