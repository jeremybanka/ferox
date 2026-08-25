import type { VehicleKind, Vector3Tuple } from "./arena-protocol.ts"

export type VehicleMotion = Readonly<{
	airborne: boolean
	lean: number
	pitch: number
	position: Vector3Tuple
	velocity: Vector3Tuple
	yaw: number
}>

export type VehiclePhysicsInput = Readonly<{
	afterburner: boolean
	handbrake: boolean
	steering: number
	throttle: number
}>

export type VehiclePhysicsWorld = Readonly<{
	groundAt: (x: number, z: number) => number
	resolveMotion: (
		start: readonly [number, number],
		requested: readonly [number, number],
		radius: number,
	) => Readonly<{ blocked: boolean; x: number; z: number }>
}>

export const VEHICLE_TUNING = {
	bike: {
		acceleration: 20,
		serviceBrake: 34,
		handbrake: 44,
		chassisHeight: 0.72,
		drag: 1.1,
		gravity: 21,
		lateralGrip: 7.4,
		maxReverse: 7,
		maxSpeed: 24,
		radius: 0.82,
		restitution: 0.18,
		steerRate: 1.72,
		wheelbase: 1.55,
	},
	jeep: {
		acceleration: 23,
		serviceBrake: 31,
		handbrake: 39,
		chassisHeight: 1.05,
		drag: 0.78,
		gravity: 21,
		lateralGrip: 4.2,
		maxReverse: 9,
		maxSpeed: 21,
		radius: 1.75,
		restitution: 0.64,
		steerRate: 1.18,
		wheelbase: 2.8,
	},
} as const

const clamp = (value: number, minimum: number, maximum: number): number =>
	Math.max(minimum, Math.min(maximum, value))

const moveToward = (
	value: number,
	target: number,
	maximumStep: number,
): number =>
	value < target
		? Math.min(target, value + maximumStep)
		: Math.max(target, value - maximumStep)

/**
 * Fixed-step arcade chassis integration shared by server authority and tests.
 * Front/rear support samples create readable pitch; a footprint-radius sweep
 * prevents pilot-capsule tunnelling while bounce energy is explicitly capped.
 */
export function stepVehicleMotion(
	kind: VehicleKind,
	motion: VehicleMotion,
	input: VehiclePhysicsInput,
	deltaSeconds: number,
	world: VehiclePhysicsWorld,
): VehicleMotion {
	const tuning = VEHICLE_TUNING[kind]
	const delta = clamp(deltaSeconds, 0, 1 / 20)
	const finite = [
		...motion.position,
		...motion.velocity,
		motion.yaw,
		motion.pitch,
		motion.lean,
	].every(Number.isFinite)
	if (!finite) return motion

	let yaw = motion.yaw
	let vx = motion.velocity[0]
	let vy = motion.velocity[1]
	let vz = motion.velocity[2]
	const forwardX = -Math.sin(yaw)
	const forwardZ = -Math.cos(yaw)
	const rightX = Math.cos(yaw)
	const rightZ = -Math.sin(yaw)
	let forwardSpeed = vx * forwardX + vz * forwardZ
	let lateralSpeed = vx * rightX + vz * rightZ
	const throttle = clamp(input.throttle, -1, 1)
	const steering = clamp(input.steering, -1, 1)
	const speedLimit =
		tuning.maxSpeed * (input.afterburner && kind === "bike" ? 1.48 : 1)
	const requestsOppositeDirection =
		Math.abs(forwardSpeed) > 0.35 && throttle * forwardSpeed < 0
	if (requestsOppositeDirection) {
		// S/down/LT is a service brake while rolling forward (and vice versa),
		// crossing into reverse only after the chassis has nearly stopped.
		forwardSpeed = moveToward(
			forwardSpeed,
			0,
			tuning.serviceBrake * Math.abs(throttle) * delta,
		)
	} else {
		const driveScale = throttle < 0 ? 0.72 : 1
		forwardSpeed += throttle * tuning.acceleration * driveScale * delta
	}
	if (input.afterburner && kind === "bike" && throttle > 0)
		forwardSpeed += 19 * throttle * delta
	if (input.handbrake) {
		forwardSpeed = moveToward(forwardSpeed, 0, tuning.handbrake * delta)
		lateralSpeed *= Math.exp(-11 * delta)
	}
	forwardSpeed = clamp(forwardSpeed, -tuning.maxReverse, speedLimit)
	lateralSpeed *= Math.exp(-tuning.lateralGrip * delta)
	const steerScale =
		clamp(Math.abs(forwardSpeed) / 4, 0.12, 1) *
		clamp(1 - Math.max(0, Math.abs(forwardSpeed) - 10) / 38, 0.58, 1)
	// In this coordinate system decreasing yaw turns the chassis right. Reverse
	// travel naturally inverts the yaw response like a conventional car.
	yaw -=
		steering *
		tuning.steerRate *
		steerScale *
		delta *
		Math.sign(forwardSpeed || 1)
	const nextForwardX = -Math.sin(yaw)
	const nextForwardZ = -Math.cos(yaw)
	const nextRightX = Math.cos(yaw)
	const nextRightZ = -Math.sin(yaw)
	vx = nextForwardX * forwardSpeed + nextRightX * lateralSpeed
	vz = nextForwardZ * forwardSpeed + nextRightZ * lateralSpeed
	const drag = Math.exp(
		-tuning.drag * delta * (Math.abs(throttle) < 0.05 ? 1 : 0.12),
	)
	vx *= drag
	vz *= drag
	vy -= tuning.gravity * delta

	const requested: [number, number] = [
		motion.position[0] + vx * delta,
		motion.position[2] + vz * delta,
	]
	const resolved = world.resolveMotion(
		[motion.position[0], motion.position[2]],
		requested,
		tuning.radius,
	)
	if (resolved.blocked) {
		vx *= -0.18
		vz *= -0.18
		forwardSpeed *= 0.2
	}
	const halfWheelbase = tuning.wheelbase * 0.5
	const previousFrontGround = world.groundAt(
		motion.position[0] + forwardX * halfWheelbase,
		motion.position[2] + forwardZ * halfWheelbase,
	)
	const previousRearGround = world.groundAt(
		motion.position[0] - forwardX * halfWheelbase,
		motion.position[2] - forwardZ * halfWheelbase,
	)
	const previousSupport =
		Math.max(previousFrontGround, previousRearGround) + tuning.chassisHeight
	const frontGround = world.groundAt(
		resolved.x + nextForwardX * halfWheelbase,
		resolved.z + nextForwardZ * halfWheelbase,
	)
	const rearGround = world.groundAt(
		resolved.x - nextForwardX * halfWheelbase,
		resolved.z - nextForwardZ * halfWheelbase,
	)
	const support = Math.max(frontGround, rearGround) + tuning.chassisHeight
	let y = motion.position[1] + vy * delta
	let airborne = y > support + 0.16
	if (y <= support) {
		const terrainImpactSpeed =
			delta > 0 ? Math.max(0, support - previousSupport) / delta : 0
		const landingSpeed = Math.max(0, -vy, terrainImpactSpeed * 0.52)
		y = support
		vy =
			landingSpeed > 2.5 ? Math.min(8.5, landingSpeed * tuning.restitution) : 0
		airborne = vy > 0.5
	}
	const terrainPitch = Math.atan2(frontGround - rearGround, tuning.wheelbase)
	const pitch =
		motion.pitch + (terrainPitch - motion.pitch) * clamp(delta * 8, 0, 1)
	const leanTarget =
		kind === "bike"
			? clamp(-steering * Math.abs(forwardSpeed) * 0.028, -0.58, 0.58)
			: clamp(-steering * Math.abs(forwardSpeed) * 0.01, -0.18, 0.18)
	const lean = motion.lean + (leanTarget - motion.lean) * clamp(delta * 6, 0, 1)
	return {
		airborne,
		lean,
		pitch,
		position: [resolved.x, y, resolved.z],
		velocity: [vx, clamp(vy, -32, 12), vz],
		yaw,
	}
}
