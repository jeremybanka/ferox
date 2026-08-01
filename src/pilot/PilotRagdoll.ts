import * as THREE from "three"

import { JUMP_PHYSICS } from "../JumpPhysics.ts"
import {
	DEATH_RAGDOLL_HANDOFF_SECONDS,
	sampleDeathAnimationPose,
} from "./DeathAnimation.ts"
import type { PilotJoint, PilotPose } from "./PilotAnimation.ts"
import type { PilotRig } from "./PilotModel.ts"

type AxisLimits = {
	x: readonly [number, number]
	y: readonly [number, number]
	z: readonly [number, number]
}

type RagdollJoint = Exclude<PilotJoint, "weapon" | "weaponMount">

type JointPhysics = {
	end: readonly [number, number, number]
	joint: RagdollJoint
	limits: AxisLimits
	torque: number
}

type Collider = {
	joint: RagdollJoint
	offset: readonly [number, number, number]
	radius: number
}

type RigSnapshot = {
	elapsedSeconds: number
	localQuaternions: Map<RagdollJoint, THREE.Quaternion>
	rootPosition: THREE.Vector3
}

export type PilotRagdollGround = (x: number, z: number) => number

export type PilotRagdollDebugState = {
	active: boolean
	disposed: boolean
	fastestJoint: string | null
	finite: boolean
	limitViolations: number
	maxAngularSpeed: number
	minimumGroundClearance: number
	rootSpeed: number
	verticalVelocity: number
}

export const PILOT_RAGDOLL_PHYSICS = {
	airborneAngularDrag: 1.2,
	airbornePlanarDrag: 0.12,
	angularGravityScale: 0.03,
	contactAngularDamping: 6.5,
	contactFriction: 0.7,
	contactJointVelocityRetention: 0.58,
	contactPlanarDrag: 0.32,
	gravity: JUMP_PHYSICS.gravity,
	penetrationAngularCoupling: 0.28,
	penetrationCorrectionStrength: 18,
	restitution: 0.08,
} as const

const UNBOUNDED: AxisLimits = {
	x: [-Math.PI, Math.PI],
	y: [-Math.PI, Math.PI],
	z: [-Math.PI, Math.PI],
}

const JOINT_PHYSICS: readonly JointPhysics[] = [
	{
		end: [0, 1.45, 0],
		joint: "body",
		limits: { x: [-0.08, 0.52], y: [-0.16, 0.16], z: [-0.16, 0.16] },
		torque: 0.4,
	},
	{
		end: [0, 0.29, 0],
		joint: "neck",
		limits: { x: [-0.85, 0.85], y: [-0.75, 0.75], z: [-0.65, 0.65] },
		torque: 2.2,
	},
	{
		end: [0, 0.38, 0],
		joint: "head",
		limits: { x: [-0.95, 0.95], y: [-0.85, 0.85], z: [-0.75, 0.75] },
		torque: 1.7,
	},
	{
		end: [0, -0.72, 0],
		joint: "leftShoulder",
		limits: { x: [-1.75, 1.75], y: [-1.2, 1.2], z: [-2.55, 0.5] },
		torque: 4.4,
	},
	{
		end: [0, -0.72, 0],
		joint: "leftArm",
		limits: { x: [-1.8, 1.8], y: [-1.1, 1.1], z: [-1.15, 1.15] },
		torque: 3.5,
	},
	{
		end: [0, -0.69, 0],
		joint: "leftElbow",
		limits: { x: [-0.15, 2.7], y: [-0.7, 0.7], z: [-0.45, 0.45] },
		torque: 3.1,
	},
	{
		end: [0, -0.25, 0],
		joint: "leftHand",
		limits: { x: [-0.9, 0.9], y: [-0.8, 0.8], z: [-0.75, 0.75] },
		torque: 1.2,
	},
	{
		end: [0, -0.72, 0],
		joint: "rightShoulder",
		limits: { x: [-1.75, 1.75], y: [-1.2, 1.2], z: [-0.5, 2.55] },
		torque: 4.4,
	},
	{
		end: [0, -0.72, 0],
		joint: "rightArm",
		limits: { x: [-1.8, 1.8], y: [-1.1, 1.1], z: [-1.15, 1.15] },
		torque: 3.5,
	},
	{
		end: [0, -0.69, 0],
		joint: "rightElbow",
		limits: { x: [-0.15, 2.7], y: [-0.7, 0.7], z: [-0.45, 0.45] },
		torque: 3.1,
	},
	{
		end: [0, -0.25, 0],
		joint: "rightHand",
		limits: { x: [-0.9, 0.9], y: [-0.8, 0.8], z: [-0.75, 0.75] },
		torque: 1.2,
	},
	{
		end: [0, -0.95, 0],
		joint: "leftLeg",
		limits: { x: [-1.15, 1.5], y: [-0.65, 0.65], z: [-0.55, 0.55] },
		torque: 5.1,
	},
	{
		end: [0, -0.86, 0],
		joint: "leftKnee",
		limits: { x: [-2.45, 0.1], y: [-0.18, 0.18], z: [-0.18, 0.18] },
		torque: 4.3,
	},
	{
		end: [0, -0.05, -0.5],
		joint: "leftFoot",
		limits: { x: [-1.1, 1.1], y: [-0.4, 0.4], z: [-0.35, 0.35] },
		torque: 2.3,
	},
	{
		end: [0, 0, -0.32],
		joint: "leftToe",
		limits: { x: [-0.55, 0.55], y: [-0.25, 0.25], z: [-0.2, 0.2] },
		torque: 1.1,
	},
	{
		end: [0, -0.95, 0],
		joint: "rightLeg",
		limits: { x: [-1.15, 1.5], y: [-0.65, 0.65], z: [-0.55, 0.55] },
		torque: 5.1,
	},
	{
		end: [0, -0.86, 0],
		joint: "rightKnee",
		limits: { x: [-2.45, 0.1], y: [-0.18, 0.18], z: [-0.18, 0.18] },
		torque: 4.3,
	},
	{
		end: [0, -0.05, -0.5],
		joint: "rightFoot",
		limits: { x: [-1.1, 1.1], y: [-0.4, 0.4], z: [-0.35, 0.35] },
		torque: 2.3,
	},
	{
		end: [0, 0, -0.32],
		joint: "rightToe",
		limits: { x: [-0.55, 0.55], y: [-0.25, 0.25], z: [-0.2, 0.2] },
		torque: 1.1,
	},
]

const COLLIDERS: readonly Collider[] = [
	{ joint: "hips", offset: [0, 0.18, 0], radius: 0.34 },
	{ joint: "body", offset: [0, 0.25, 0], radius: 0.38 },
	{ joint: "body", offset: [0, 0.86, 0], radius: 0.5 },
	{ joint: "head", offset: [0, 0.08, 0], radius: 0.48 },
	{ joint: "leftElbow", offset: [0, -0.34, 0], radius: 0.22 },
	{ joint: "leftHand", offset: [0, -0.12, 0], radius: 0.19 },
	{ joint: "rightElbow", offset: [0, -0.34, 0], radius: 0.22 },
	{ joint: "rightHand", offset: [0, -0.12, 0], radius: 0.19 },
	{ joint: "leftKnee", offset: [0, -0.1, -0.15], radius: 0.25 },
	{ joint: "leftFoot", offset: [0, -0.08, -0.18], radius: 0.22 },
	{ joint: "rightKnee", offset: [0, -0.1, -0.15], radius: 0.25 },
	{ joint: "rightFoot", offset: [0, -0.08, -0.18], radius: 0.22 },
]

const CONTROLLED_JOINTS = [
	"root",
	"hips",
	...JOINT_PHYSICS.map(({ joint }) => joint),
] as const satisfies readonly RagdollJoint[]

const FIXED_STEP_SECONDS = 1 / 120
const MAX_STEPS_PER_FRAME = 12
const GRAVITY = new THREE.Vector3(0, -PILOT_RAGDOLL_PHYSICS.gravity, 0)
const ZERO = new THREE.Vector3()

function finiteVector(vector: THREE.Vector3): boolean {
	return [vector.x, vector.y, vector.z].every(Number.isFinite)
}

function quaternionVelocity(
	from: THREE.Quaternion,
	to: THREE.Quaternion,
	delta: number,
): THREE.Vector3 {
	if (delta <= 0) return new THREE.Vector3()
	const difference = from.clone().invert().multiply(to).normalize()
	if (difference.w < 0) {
		difference.set(-difference.x, -difference.y, -difference.z, -difference.w)
	}
	const angle = 2 * Math.acos(THREE.MathUtils.clamp(difference.w, -1, 1))
	const sine = Math.sqrt(Math.max(0, 1 - difference.w * difference.w))
	if (sine < 1e-6 || angle < 1e-6) return new THREE.Vector3()
	return new THREE.Vector3(
		difference.x / sine,
		difference.y / sine,
		difference.z / sine,
	)
		.multiplyScalar(angle / delta)
		.clampLength(0, 14)
}

function poseQuaternion(
	pose: PilotPose,
	joint: RagdollJoint,
): THREE.Quaternion {
	const rotation = pose[joint]?.rotation
	return new THREE.Quaternion().setFromEuler(
		new THREE.Euler(rotation?.x ?? 0, rotation?.y ?? 0, rotation?.z ?? 0),
	)
}

function captureRig(rig: PilotRig, elapsedSeconds: number): RigSnapshot {
	rig.root.updateMatrixWorld(true)
	return {
		elapsedSeconds,
		localQuaternions: new Map(
			CONTROLLED_JOINTS.map((joint) => [joint, rig[joint].quaternion.clone()]),
		),
		rootPosition: rig.root.getWorldPosition(new THREE.Vector3()),
	}
}

function terrainNormal(
	heightAt: PilotRagdollGround,
	x: number,
	z: number,
): THREE.Vector3 {
	const distance = 0.08
	return new THREE.Vector3(
		-(heightAt(x + distance, z) - heightAt(x - distance, z)) / (2 * distance),
		1,
		-(heightAt(x, z + distance) - heightAt(x, z - distance)) / (2 * distance),
	).normalize()
}

function clampJoint(
	joint: THREE.Object3D,
	limits: AxisLimits,
	angularVelocity?: THREE.Vector3,
): void {
	const euler = new THREE.Euler().setFromQuaternion(
		joint.quaternion,
		joint.rotation.order,
	)
	for (const axis of ["x", "y", "z"] as const) {
		const clamped = THREE.MathUtils.clamp(euler[axis], ...limits[axis])
		if (clamped !== euler[axis] && angularVelocity !== undefined) {
			angularVelocity[axis] = 0
		}
		euler[axis] = clamped
	}
	joint.quaternion.setFromEuler(euler).normalize()
}

/**
 * Deterministic presentation-only articulated solver. The rendered rig stays
 * connected through its native hierarchy; fixed-step angular dynamics, joint
 * limits, and terrain contacts provide the ragdoll motion without a runtime
 * rigid-body dependency.
 */
export class PilotRagdollPresentation {
	readonly #angularVelocity = new Map<RagdollJoint, THREE.Vector3>()
	#accumulator = 0
	#active = false
	#disposed = false
	#grounded = false
	#previous: RigSnapshot | null = null
	readonly #rootVelocity = new THREE.Vector3()
	#sleepSeconds = 0

	get active(): boolean {
		return this.#active
	}

	get disposed(): boolean {
		return this.#disposed
	}

	observeAuthored(rig: PilotRig, elapsedSeconds: number): void {
		if (this.#active || this.#disposed) return
		this.#previous = captureRig(rig, elapsedSeconds)
	}

	update(
		rig: PilotRig,
		options: {
			carrierVelocity?: THREE.Vector3
			delta: number
			elapsedSeconds: number
			groundHeightAt: PilotRagdollGround
		},
	): boolean {
		if (this.#disposed) return false
		if (!this.#active) {
			if (options.elapsedSeconds < DEATH_RAGDOLL_HANDOFF_SECONDS) {
				this.observeAuthored(rig, options.elapsedSeconds)
				return false
			}
			this.#activate(rig, options.carrierVelocity ?? ZERO)
			const catchup = Math.min(
				Math.max(0, options.elapsedSeconds - DEATH_RAGDOLL_HANDOFF_SECONDS),
				Math.max(0, options.delta),
			)
			if (catchup <= 0) return true
			this.#accumulator += catchup
		} else {
			this.#accumulator += Math.min(0.1, Math.max(0, options.delta))
		}
		let steps = 0
		while (
			this.#accumulator >= FIXED_STEP_SECONDS &&
			steps < MAX_STEPS_PER_FRAME
		) {
			this.#step(rig, options.groundHeightAt, FIXED_STEP_SECONDS)
			this.#accumulator -= FIXED_STEP_SECONDS
			steps += 1
		}
		if (steps === MAX_STEPS_PER_FRAME) this.#accumulator = 0
		return true
	}

	debugState(
		rig: PilotRig,
		groundHeightAt: PilotRagdollGround,
	): PilotRagdollDebugState {
		rig.root.updateMatrixWorld(true)
		let finite = finiteVector(this.#rootVelocity)
		let fastestJoint: string | null = null
		let limitViolations = 0
		let maxAngularSpeed = 0
		for (const config of JOINT_PHYSICS) {
			const velocity = this.#angularVelocity.get(config.joint) ?? ZERO
			finite &&= finiteVector(velocity)
			if (velocity.length() > maxAngularSpeed) {
				maxAngularSpeed = velocity.length()
				fastestJoint = config.joint
			}
			const euler = new THREE.Euler().setFromQuaternion(
				rig[config.joint].quaternion,
				rig[config.joint].rotation.order,
			)
			for (const axis of ["x", "y", "z"] as const) {
				const [minimum, maximum] = config.limits[axis]
				if (euler[axis] < minimum - 1e-6 || euler[axis] > maximum + 1e-6) {
					limitViolations += 1
				}
			}
		}
		let minimumGroundClearance = Infinity
		for (const collider of COLLIDERS) {
			const point = rig[collider.joint].localToWorld(
				new THREE.Vector3(...collider.offset),
			)
			const scale = rig[collider.joint].getWorldScale(new THREE.Vector3())
			const radius = collider.radius * Math.max(scale.x, scale.y, scale.z)
			minimumGroundClearance = Math.min(
				minimumGroundClearance,
				point.y - radius - groundHeightAt(point.x, point.z),
			)
		}
		return {
			active: this.#active,
			disposed: this.#disposed,
			fastestJoint,
			finite,
			limitViolations,
			maxAngularSpeed,
			minimumGroundClearance,
			rootSpeed: this.#rootVelocity.length(),
			verticalVelocity: this.#rootVelocity.y,
		}
	}

	dispose(): void {
		this.#disposed = true
		this.#active = false
		this.#angularVelocity.clear()
		this.#previous = null
		this.#rootVelocity.set(0, 0, 0)
		this.#accumulator = 0
		this.#grounded = false
	}

	#activate(rig: PilotRig, carrierVelocity: THREE.Vector3): void {
		const current = captureRig(rig, DEATH_RAGDOLL_HANDOFF_SECONDS)
		const previous = this.#previous
		const fallbackDelta = 1 / 120
		const previousPose = sampleDeathAnimationPose(
			DEATH_RAGDOLL_HANDOFF_SECONDS - fallbackDelta,
		)
		const delta =
			previous === null
				? fallbackDelta
				: Math.max(
						fallbackDelta,
						DEATH_RAGDOLL_HANDOFF_SECONDS - previous.elapsedSeconds,
					)
		for (const joint of CONTROLLED_JOINTS) {
			const from =
				previous?.localQuaternions.get(joint) ??
				(previousPose === null
					? current.localQuaternions.get(joint)
					: poseQuaternion(previousPose, joint))
			const to = current.localQuaternions.get(joint)
			this.#angularVelocity.set(
				joint,
				from === undefined || to === undefined
					? new THREE.Vector3()
					: quaternionVelocity(from, to, delta),
			)
		}
		if (previous !== null) {
			this.#rootVelocity
				.copy(current.rootPosition)
				.sub(previous.rootPosition)
				.divideScalar(delta)
		} else {
			const previousRoot = previousPose?.root?.position
			const currentRoot = sampleDeathAnimationPose(
				DEATH_RAGDOLL_HANDOFF_SECONDS,
			)?.root?.position
			this.#rootVelocity.set(
				((currentRoot?.x ?? 0) - (previousRoot?.x ?? 0)) / fallbackDelta,
				((currentRoot?.y ?? 0) - (previousRoot?.y ?? 0)) / fallbackDelta,
				((currentRoot?.z ?? 0) - (previousRoot?.z ?? 0)) / fallbackDelta,
			)
		}
		if (previous === null) this.#rootVelocity.add(carrierVelocity)
		this.#rootVelocity.clampLength(0, 24)
		this.#active = true
		this.#previous = null
	}

	#step(
		rig: PilotRig,
		groundHeightAt: PilotRagdollGround,
		delta: number,
	): void {
		if (this.#sleepSeconds >= 0.45) return
		this.#rootVelocity.addScaledVector(GRAVITY, delta)
		const planarDrag = this.#grounded
			? PILOT_RAGDOLL_PHYSICS.contactPlanarDrag
			: PILOT_RAGDOLL_PHYSICS.airbornePlanarDrag
		this.#rootVelocity.x *= Math.exp(-planarDrag * delta)
		this.#rootVelocity.z *= Math.exp(-planarDrag * delta)
		rig.root.position.addScaledVector(this.#rootVelocity, delta)

		const angularDamping = this.#grounded
			? PILOT_RAGDOLL_PHYSICS.contactAngularDamping
			: PILOT_RAGDOLL_PHYSICS.airborneAngularDrag
		this.#integrateJoint(
			rig,
			"root",
			UNBOUNDED,
			0,
			delta,
			undefined,
			angularDamping,
		)
		for (const config of JOINT_PHYSICS) {
			this.#integrateJoint(
				rig,
				config.joint,
				config.limits,
				config.torque,
				delta,
				config.end,
				angularDamping,
			)
		}
		rig.root.updateMatrixWorld(true)

		let maximumPenetration = 0
		let contactCount = 0
		const contactNormal = new THREE.Vector3()
		const rootPosition = rig.root.getWorldPosition(new THREE.Vector3())
		const rootAngularVelocity = this.#angularVelocity.get("root") ?? ZERO
		for (const collider of COLLIDERS) {
			const joint = rig[collider.joint]
			const point = joint.localToWorld(new THREE.Vector3(...collider.offset))
			const scale = joint.getWorldScale(new THREE.Vector3())
			const radius = collider.radius * Math.max(scale.x, scale.y, scale.z)
			const ground = groundHeightAt(point.x, point.z)
			const penetration = ground + radius - point.y
			if (penetration <= 0) continue
			maximumPenetration = Math.max(maximumPenetration, penetration)
			contactCount += 1
			contactNormal.add(terrainNormal(groundHeightAt, point.x, point.z))
			const lever = point.sub(rootPosition)
			const impulse = new THREE.Vector3(
				0,
				penetration * PILOT_RAGDOLL_PHYSICS.penetrationCorrectionStrength,
				0,
			)
			rootAngularVelocity.addScaledVector(
				lever.cross(impulse),
				delta * PILOT_RAGDOLL_PHYSICS.penetrationAngularCoupling,
			)
			this.#angularVelocity
				.get(collider.joint)
				?.multiplyScalar(PILOT_RAGDOLL_PHYSICS.contactJointVelocityRetention)
		}
		if (maximumPenetration > 0) {
			rig.root.position.y += maximumPenetration + 1e-4
			contactNormal.normalize()
			const intoGround = this.#rootVelocity.dot(contactNormal)
			if (intoGround < 0) {
				this.#rootVelocity.addScaledVector(
					contactNormal,
					-intoGround * (1 + PILOT_RAGDOLL_PHYSICS.restitution),
				)
			}
			const normalSpeed = this.#rootVelocity.dot(contactNormal)
			const tangent = this.#rootVelocity
				.clone()
				.addScaledVector(contactNormal, -normalSpeed)
			this.#rootVelocity.addScaledVector(
				tangent,
				-PILOT_RAGDOLL_PHYSICS.contactFriction,
			)
			const downhillGravity = GRAVITY.clone().addScaledVector(
				contactNormal,
				-GRAVITY.dot(contactNormal),
			)
			this.#rootVelocity.addScaledVector(downhillGravity, delta * 0.22)
		}
		this.#grounded = contactCount > 0
		rootAngularVelocity.clampLength(0, 10)
		const maxAngularSpeed = Math.max(
			...Array.from(this.#angularVelocity.values(), (velocity) =>
				velocity.length(),
			),
		)
		if (
			contactCount >= 2 &&
			this.#rootVelocity.lengthSq() < 0.0036 &&
			maxAngularSpeed < 0.12
		) {
			this.#sleepSeconds += delta
		} else {
			this.#sleepSeconds = 0
		}
	}

	#integrateJoint(
		rig: PilotRig,
		jointName: RagdollJoint,
		limits: AxisLimits,
		torque: number,
		delta: number,
		end: readonly [number, number, number] = [0, 1, 0],
		angularDamping: number = PILOT_RAGDOLL_PHYSICS.airborneAngularDrag,
	): void {
		const joint = rig[jointName]
		const angularVelocity = this.#angularVelocity.get(jointName)
		if (angularVelocity === undefined) return
		if (torque > 0) {
			const worldQuaternion = joint.getWorldQuaternion(new THREE.Quaternion())
			const lever = new THREE.Vector3(...end).applyQuaternion(worldQuaternion)
			const torqueWorld = lever
				.cross(GRAVITY)
				.multiplyScalar(torque * PILOT_RAGDOLL_PHYSICS.angularGravityScale)
			const parentQuaternion =
				joint.parent?.getWorldQuaternion(new THREE.Quaternion()) ??
				new THREE.Quaternion()
			angularVelocity.addScaledVector(
				torqueWorld.applyQuaternion(parentQuaternion.invert()),
				delta,
			)
		}
		angularVelocity
			.multiplyScalar(Math.exp(-angularDamping * delta))
			.clampLength(0, 14)
		const angle = angularVelocity.length() * delta
		if (angle > 1e-7) {
			joint.quaternion
				.multiply(
					new THREE.Quaternion().setFromAxisAngle(
						angularVelocity.clone().normalize(),
						angle,
					),
				)
				.normalize()
		}
		clampJoint(joint, limits, angularVelocity)
	}
}
