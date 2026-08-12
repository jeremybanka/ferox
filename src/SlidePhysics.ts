import {
	PLAYER_CROUCH_BASE_SPEED_LIMIT,
	PLAYER_RUN_SPEED_LIMIT,
	PLAYER_SPRINT_SPEED_LIMIT,
} from "./game-constants.ts"

export const SLIDE_PHYSICS = {
	contactSeparationTolerance: 0.035,
	entrySpeedBoost: 1.2,
	entryPlanarSpeed: PLAYER_RUN_SPEED_LIMIT,
	entrySlopeDegrees: 30,
	entrySlopeNormalUpDot: Math.cos(Math.PI / 6),
	entrySlopeRadians: Math.PI / 6,
	flatFriction: 1.05,
	gravity: 23,
	maximumSpeed: 500 / 3.6,
	minimumTakeoffVerticalSpeed: 0.5,
	minimumDynamicSlopeGrade: 0.015,
	steepSurfaceDegrees: 60,
	steepSurfaceRadians: Math.PI / 3,
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
	surfaceSliding?: boolean
}

export type MovementState =
	| "airborne"
	| "blocked"
	| "crouching"
	| "running"
	| "sliding"
	| "surface-sliding"

export type SlidePhysicsStep = SlidePhysicsState & {
	downhillAcceleration: PlanarVelocity
	movementState: MovementState
	slopeAngleRadians: number
	slopeGrade: number
	surfaceSliding: boolean
}

export type SlideSurfaceContact = {
	detached: boolean
	verticalVelocity: number
}

export type ContactSlidePhysicsState = Readonly<{
	sliding: boolean
	velocity: readonly [number, number, number]
}>

export type ContactSlidePhysicsStep = Readonly<{
	downhillAcceleration: readonly [number, number, number]
	velocity: readonly [number, number, number]
}>

/**
 * Applies the regular slide's one-shot boost, projected gravity, cross-slope
 * friction, and speed cap to an arbitrary contacted surface plane.
 */
export function stepContactSlidePhysics(
	state: ContactSlidePhysicsState,
	options: Readonly<{
		delta: number
		surfaceNormal: readonly [number, number, number]
	}>,
): ContactSlidePhysicsStep {
	const normalLength = Math.hypot(...options.surfaceNormal)
	if (normalLength <= 1e-9) {
		return {
			downhillAcceleration: [0, 0, 0],
			velocity: state.velocity,
		}
	}
	const normal = options.surfaceNormal.map((value) => value / normalLength) as [
		number,
		number,
		number,
	]
	const normalSpeed =
		state.velocity[0] * normal[0] +
		state.velocity[1] * normal[1] +
		state.velocity[2] * normal[2]
	let velocity = state.velocity.map(
		(value, index) => value - normal[index]! * normalSpeed,
	) as [number, number, number]
	const entrySpeed = Math.hypot(...velocity)
	if (!state.sliding && entrySpeed > 0) {
		const scale = (entrySpeed + SLIDE_PHYSICS.entrySpeedBoost) / entrySpeed
		velocity = velocity.map((value) => value * scale) as [
			number,
			number,
			number,
		]
	}
	const gravity: readonly [number, number, number] = [
		0,
		-SLIDE_PHYSICS.gravity,
		0,
	]
	const gravityNormal =
		gravity[0] * normal[0] + gravity[1] * normal[1] + gravity[2] * normal[2]
	const downhillAcceleration = gravity.map(
		(value, index) => value - normal[index]! * gravityNormal,
	) as [number, number, number]
	const delta = Math.max(0, options.delta)
	velocity = velocity.map(
		(value, index) => value + downhillAcceleration[index]! * delta,
	) as [number, number, number]
	const downhillLength = Math.hypot(...downhillAcceleration)
	if (downhillLength > 1e-9) {
		const downhill = downhillAcceleration.map(
			(value) => value / downhillLength,
		) as [number, number, number]
		const downhillSpeed =
			velocity[0] * downhill[0] +
			velocity[1] * downhill[1] +
			velocity[2] * downhill[2]
		const damping = Math.exp(-SLIDE_PHYSICS.flatFriction * delta)
		velocity = velocity.map((value, index) => {
			const downhillVelocity = downhill[index]! * downhillSpeed
			return downhillVelocity + (value - downhillVelocity) * damping
		}) as [number, number, number]
	}
	const speed = Math.hypot(...velocity)
	if (speed > SLIDE_PHYSICS.maximumSpeed) {
		const scale = SLIDE_PHYSICS.maximumSpeed / speed
		velocity = velocity.map((value) => value * scale) as [
			number,
			number,
			number,
		]
	}
	return { downhillAcceleration, velocity }
}

export function resolveMovementState(options: {
	crouching: boolean
	grounded: boolean
	planarSpeed: number
	slopeNormalUpDot: number
	wasSliding: boolean
}): MovementState {
	if (!options.grounded) return "airborne"
	const steepSurface =
		options.slopeNormalUpDot <
		Math.cos(SLIDE_PHYSICS.steepSurfaceRadians) - 1e-12
	if (!options.crouching && steepSurface) return "surface-sliding"
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
	if (options.sliding) return SLIDE_PHYSICS.maximumSpeed
	if (options.sprinting) return PLAYER_SPRINT_SPEED_LIMIT
	return options.crouching
		? PLAYER_CROUCH_BASE_SPEED_LIMIT
		: PLAYER_RUN_SPEED_LIMIT
}

/**
 * Projects a grounded slide's planar velocity onto the local terrain tangent
 * and compares that ballistic trajectory with the terrain sampled ahead.
 */
export function resolveSlideSurfaceContact(options: {
	delta: number
	groundAfter: number
	groundBefore: number
	groundMidpoint: number
	terrainGradient: TerrainGradient
	velocity: PlanarVelocity
}): SlideSurfaceContact {
	const delta = Math.max(0, options.delta)
	const verticalVelocity =
		options.terrainGradient.x * options.velocity.x +
		options.terrainGradient.z * options.velocity.z
	if (
		delta === 0 ||
		verticalVelocity < SLIDE_PHYSICS.minimumTakeoffVerticalSpeed
	) {
		return { detached: false, verticalVelocity: 0 }
	}

	const midpointDelta = delta * 0.5
	const ballisticHeightAt = (time: number): number =>
		options.groundBefore +
		verticalVelocity * time -
		0.5 * SLIDE_PHYSICS.gravity * time * time
	const midpointSeparation =
		ballisticHeightAt(midpointDelta) - options.groundMidpoint
	const finalSeparation = ballisticHeightAt(delta) - options.groundAfter
	const detached =
		midpointSeparation > SLIDE_PHYSICS.contactSeparationTolerance &&
		finalSeparation > SLIDE_PHYSICS.contactSeparationTolerance

	return {
		detached,
		verticalVelocity: detached ? verticalVelocity : 0,
	}
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
		blocked?: boolean
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
	if (options.blocked === true) {
		return {
			downhillAcceleration: { x: 0, z: 0 },
			movementState: "blocked",
			slopeAngleRadians,
			slopeGrade,
			sliding: false,
			surfaceSliding: false,
			x: state.x,
			z: state.z,
		}
	}
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
	const surfaceSliding = movementState === "surface-sliding"

	if (!sliding && !surfaceSliding) {
		return {
			downhillAcceleration: { x: 0, z: 0 },
			movementState,
			slopeAngleRadians,
			slopeGrade,
			sliding: false,
			surfaceSliding: false,
			x: state.x,
			z: state.z,
		}
	}
	const continuingSurfaceSlide = surfaceSliding && state.surfaceSliding === true
	const entrySpeed =
		state.sliding || continuingSurfaceSlide || surfaceSliding
			? speed
			: speed + SLIDE_PHYSICS.entrySpeedBoost
	const entryScale = speed > 0 ? entrySpeed / speed : 1
	const entryVelocity = {
		x: state.x * entryScale,
		z: state.z * entryScale,
	}

	if (!slopeAffectsMotion) {
		const damping = Math.exp(-SLIDE_PHYSICS.flatFriction * delta)
		return limitSlideSpeed({
			downhillAcceleration: { x: 0, z: 0 },
			movementState,
			slopeAngleRadians,
			slopeGrade,
			sliding,
			surfaceSliding,
			x: entryVelocity.x * damping,
			z: entryVelocity.z * damping,
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
	const velocityX = entryVelocity.x + downhillAcceleration.x * delta
	const velocityZ = entryVelocity.z + downhillAcceleration.z * delta
	const downhillSpeed = velocityX * directionX + velocityZ * directionZ
	const crossSlopeX = velocityX - directionX * downhillSpeed
	const crossSlopeZ = velocityZ - directionZ * downhillSpeed
	const crossSlopeDamping = Math.exp(-SLIDE_PHYSICS.flatFriction * delta)

	return limitSlideSpeed({
		downhillAcceleration,
		movementState,
		slopeAngleRadians,
		slopeGrade,
		sliding,
		surfaceSliding,
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
