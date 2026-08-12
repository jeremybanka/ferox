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
	brake: boolean
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
		brake: 34,
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
		acceleration: 16,
		brake: 28,
		chassisHeight: 1.05,
		drag: 0.78,
		gravity: 21,
		lateralGrip: 4.2,
		maxReverse: 9,
		maxSpeed: 19,
		radius: 1.75,
		restitution: 0.64,
		steerRate: 1.18,
		wheelbase: 2.8,
	},
} as const

const clamp = (value: number, minimum: number, maximum: number): number =>
	Math.max(minimum, Math.min(maximum, value))

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
	forwardSpeed += throttle * tuning.acceleration * delta
	if (input.afterburner && kind === "bike" && throttle > 0)
		forwardSpeed += 19 * throttle * delta
	if (input.brake)
		forwardSpeed *= Math.exp(
			(-tuning.brake * delta) / Math.max(1, Math.abs(forwardSpeed)),
		)
	forwardSpeed = clamp(forwardSpeed, -tuning.maxReverse, speedLimit)
	lateralSpeed *= Math.exp(-tuning.lateralGrip * delta)
	const steerScale = clamp(Math.abs(forwardSpeed) / 4, 0.18, 1)
	yaw +=
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
		const landingSpeed = Math.max(0, -vy)
		y = support
		vy = landingSpeed > 2.5 ? Math.min(9, landingSpeed * tuning.restitution) : 0
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
