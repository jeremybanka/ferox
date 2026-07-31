import {
	PLAYER_CROUCH_BASE_SPEED_LIMIT,
	PLAYER_RUN_SPEED_LIMIT,
	PLAYER_SPRINT_SPEED_LIMIT,
} from "./game-constants.ts"

export const SLIDE_PHYSICS = {
	flatFriction: 1.05,
	gravity: 23,
	maximumSpeed: PLAYER_SPRINT_SPEED_LIMIT,
	minimumSlopeGrade: 0.015,
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
	slopeGrade: number
}

export function resolveMovementState(options: {
	crouching: boolean
	grounded: boolean
	planarSpeed: number
	slopeGrade: number
	wasSliding: boolean
}): MovementState {
	if (!options.grounded) return "airborne"
	if (!options.crouching) return "running"
	if (
		options.slopeGrade >= SLIDE_PHYSICS.minimumSlopeGrade ||
		options.planarSpeed > PLAYER_CROUCH_BASE_SPEED_LIMIT ||
		(options.wasSliding && options.planarSpeed > SLIDE_PHYSICS.exitSpeed)
	) {
		return "sliding"
	}
	return "crouching"
}

export function movementSpeedLimit(options: {
	crouching: boolean
	grounded: boolean
	sliding: boolean
	sprinting: boolean
}): number {
	if (!options.grounded || options.sliding || options.sprinting) {
		return PLAYER_SPRINT_SPEED_LIMIT
	}
	return options.crouching
		? PLAYER_CROUCH_BASE_SPEED_LIMIT
		: PLAYER_RUN_SPEED_LIMIT
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
	const speed = Math.hypot(state.x, state.z)
	const slopeCanInitiate = slopeGrade >= SLIDE_PHYSICS.minimumSlopeGrade
	const movementState = resolveMovementState({
		crouching: options.crouching,
		grounded: options.grounded,
		planarSpeed: speed,
		slopeGrade,
		wasSliding: state.sliding,
	})
	const sliding = movementState === "sliding"

	if (!sliding) {
		return {
			downhillAcceleration: { x: 0, z: 0 },
			movementState,
			slopeGrade,
			sliding: false,
			x: state.x,
			z: state.z,
		}
	}

	if (!slopeCanInitiate) {
		const damping = Math.exp(-SLIDE_PHYSICS.flatFriction * delta)
		return limitSlideSpeed({
			downhillAcceleration: { x: 0, z: 0 },
			movementState,
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
