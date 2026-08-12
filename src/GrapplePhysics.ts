import {
	GRAPPLE_MAX_SPEED,
	GRAPPLE_STEERING_ACCELERATION,
	GRAPPLE_TENSION_ACCELERATION,
} from "./game-constants.ts"

export type GrappleVector = Readonly<{ x: number; y: number; z: number }>

export type GrappleMotion = Readonly<{
	position: GrappleVector
	velocity: GrappleVector
}>

export type GrappleConstraintInput = Readonly<{
	anchor: GrappleVector
	delta: number
	ropeLength: number
	steering: GrappleVector
}>

export type GrappleAuthorityInput = GrappleConstraintInput &
	Readonly<{
		applyGravity: boolean
		gravity: number
		instantaneousVerticalVelocity: number | null
		maximumInputAcceleration: number
	}>

export type GrappleDirectionalJumpInput = GrappleConstraintInput &
	Readonly<{
		gravity: number
		instantaneousVerticalVelocity: number
		planarImpulse: Readonly<{ x: number; z: number }>
	}>

const length = (vector: GrappleVector): number =>
	Math.hypot(vector.x, vector.y, vector.z)

const dot = (left: GrappleVector, right: GrappleVector): number =>
	left.x * right.x + left.y * right.y + left.z * right.z

/**
 * Grapple has the last word after ordinary movement, gravity, and collision.
 * It never invents a launch impulse: tangential speed survives, outward radial
 * speed is removed only when the fixed rope is taut, and steering cannot reel.
 */
export function constrainGrappleMotion(
	motion: GrappleMotion,
	input: GrappleConstraintInput,
): GrappleMotion {
	if (
		![
			motion.position.x,
			motion.position.y,
			motion.position.z,
			motion.velocity.x,
			motion.velocity.y,
			motion.velocity.z,
			input.anchor.x,
			input.anchor.y,
			input.anchor.z,
			input.delta,
			input.ropeLength,
		].every(Number.isFinite) ||
		input.ropeLength <= 0
	)
		return motion

	const delta = Math.max(0, Math.min(input.delta, 0.1))
	const offset = {
		x: motion.position.x - input.anchor.x,
		y: motion.position.y - input.anchor.y,
		z: motion.position.z - input.anchor.z,
	}
	const distance = length(offset)
	if (distance < 1e-6) return motion
	const radial = {
		x: offset.x / distance,
		y: offset.y / distance,
		z: offset.z / distance,
	}
	const steeringRadial = dot(input.steering, radial)
	const steering = {
		x: input.steering.x - radial.x * steeringRadial,
		y: input.steering.y - radial.y * steeringRadial,
		z: input.steering.z - radial.z * steeringRadial,
	}
	const steeringLength = length(steering)
	let velocity = { ...motion.velocity }
	if (steeringLength > 1e-6 && delta > 0) {
		const acceleration = GRAPPLE_STEERING_ACCELERATION * delta
		velocity = {
			x: velocity.x + (steering.x / steeringLength) * acceleration,
			y: velocity.y + (steering.y / steeringLength) * acceleration,
			z: velocity.z + (steering.z / steeringLength) * acceleration,
		}
	}

	const taut = distance >= input.ropeLength - 0.04
	if (taut) {
		const outwardSpeed = dot(velocity, radial)
		if (outwardSpeed > 0) {
			velocity = {
				x: velocity.x - radial.x * outwardSpeed,
				y: velocity.y - radial.y * outwardSpeed,
				z: velocity.z - radial.z * outwardSpeed,
			}
		}
		const tension = GRAPPLE_TENSION_ACCELERATION * delta
		velocity = {
			x: velocity.x - radial.x * tension,
			y: velocity.y - radial.y * tension,
			z: velocity.z - radial.z * tension,
		}
	}

	const speed = length(velocity)
	if (speed > GRAPPLE_MAX_SPEED) {
		const scale = GRAPPLE_MAX_SPEED / speed
		velocity = {
			x: velocity.x * scale,
			y: velocity.y * scale,
			z: velocity.z * scale,
		}
	}
	const position =
		distance <= input.ropeLength
			? motion.position
			: {
					x: input.anchor.x + radial.x * input.ropeLength,
					y: input.anchor.y + radial.y * input.ropeLength,
					z: input.anchor.z + radial.z * input.ropeLength,
				}
	return { position, velocity }
}

/**
 * Server-owned grapple integration. Client position is deliberately absent:
 * reported velocity is only a desired input, rate-limited from the previous
 * authoritative velocity before server time advances authoritative position.
 */
export function stepAuthoritativeGrappleMotion(
	previous: GrappleMotion,
	reportedVelocity: GrappleVector,
	input: GrappleAuthorityInput,
): GrappleMotion {
	const delta = Math.max(0, Math.min(input.delta, 0.1))
	const safePrevious = constrainGrappleMotion(previous, {
		...input,
		delta: 0,
		steering: { x: 0, y: 0, z: 0 },
	})
	let baselineVelocity = { ...safePrevious.velocity }
	if (input.instantaneousVerticalVelocity !== null) {
		baselineVelocity.y = input.instantaneousVerticalVelocity
	}
	if (input.applyGravity) {
		baselineVelocity.y -= Math.max(0, input.gravity) * delta
	}
	const expected = constrainGrappleMotion(
		{ position: previous.position, velocity: baselineVelocity },
		{ ...input, delta, steering: { x: 0, y: 0, z: 0 } },
	)
	const desired = constrainGrappleMotion(
		{ position: previous.position, velocity: reportedVelocity },
		{ ...input, delta: 0, steering: { x: 0, y: 0, z: 0 } },
	)
	const requestedChange = {
		x: desired.velocity.x - expected.velocity.x,
		y: desired.velocity.y - expected.velocity.y,
		z: desired.velocity.z - expected.velocity.z,
	}
	const requestedChangeLength = length(requestedChange)
	const allowedChange = Math.max(0, input.maximumInputAcceleration) * delta
	const changeScale =
		requestedChangeLength > allowedChange && requestedChangeLength > 1e-9
			? allowedChange / requestedChangeLength
			: 1
	const velocity = {
		x: expected.velocity.x + requestedChange.x * changeScale,
		y: expected.velocity.y + requestedChange.y * changeScale,
		z: expected.velocity.z + requestedChange.z * changeScale,
	}
	const integrated = {
		position: {
			x:
				safePrevious.position.x +
				(safePrevious.velocity.x + velocity.x) * 0.5 * delta,
			y: safePrevious.position.y + velocity.y * delta,
			z:
				safePrevious.position.z +
				(safePrevious.velocity.z + velocity.z) * 0.5 * delta,
		},
		velocity,
	}
	return constrainGrappleMotion(integrated, {
		...input,
		delta: 0,
		steering: { x: 0, y: 0, z: 0 },
	})
}

/**
 * Mirrors the client double-jump order without trying to invert its already
 * constrained velocity report: integrate prior server motion, add the
 * one-shot impulse, then apply steering/tension at the resulting position.
 */
export function stepAuthoritativeGrappleDirectionalJumpMotion(
	previous: GrappleMotion,
	input: GrappleDirectionalJumpInput,
): GrappleMotion {
	const delta = Math.max(0, Math.min(input.delta, 0.1))
	const safePrevious = constrainGrappleMotion(previous, {
		...input,
		delta: 0,
		steering: { x: 0, y: 0, z: 0 },
	})
	const verticalVelocity =
		input.instantaneousVerticalVelocity - Math.max(0, input.gravity) * delta
	const integrated = {
		position: {
			x: safePrevious.position.x + safePrevious.velocity.x * delta,
			y: safePrevious.position.y + verticalVelocity * delta,
			z: safePrevious.position.z + safePrevious.velocity.z * delta,
		},
		velocity: {
			x: safePrevious.velocity.x + input.planarImpulse.x,
			y: verticalVelocity,
			z: safePrevious.velocity.z + input.planarImpulse.z,
		},
	}
	return constrainGrappleMotion(integrated, input)
}
