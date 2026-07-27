import * as THREE from "three"

import {
	createPilotModel,
	resetPilotPose,
	type PilotRig,
} from "./PilotModel.ts"

export const PILOT_JOINTS = [
	"root",
	"hips",
	"body",
	"neck",
	"head",
	"leftShoulder",
	"leftArm",
	"leftElbow",
	"leftHand",
	"rightShoulder",
	"rightArm",
	"rightElbow",
	"rightHand",
	"leftLeg",
	"leftKnee",
	"leftFoot",
	"leftToe",
	"rightLeg",
	"rightKnee",
	"rightFoot",
	"rightToe",
	"weaponMount",
	"weapon",
] as const

export type PilotJoint = (typeof PILOT_JOINTS)[number]

export type PoseChannels = {
	x?: number
	y?: number
	z?: number
}

export type JointPose = {
	position?: PoseChannels
	rotation?: PoseChannels
}

/**
 * A sampled animation pose. Omitted joints and channels make no claim on the
 * result, which keeps animation authorship declarative and layers composable.
 */
export type PilotPose = Partial<Record<PilotJoint, JointPose>>

/**
 * Relative influence per joint. Influences are normalized against every other
 * active override that affects the joint; they are not ownership masks.
 */
export type PoseInfluence = Partial<Record<PilotJoint, number>>

export type PilotAnimationLayer = {
	fadeSeconds?: number
	id: string
	influence?: PoseInfluence
	mode: "additive" | "override"
	pose: PilotPose
	weight?: number
}

export type PilotAnimationConstraint = (rig: PilotRig) => void

export type PilotKeyframe = {
	at: number
	pose: PilotPose
}

export type PilotKeyframedAnimation = {
	keyframes: readonly PilotKeyframe[]
	loop?: boolean
}

type ActiveLayer = {
	currentWeight: number
	layer: PilotAnimationLayer
	targetWeight: number
}

function createInfluence(
	joints: readonly PilotJoint[],
	weight = 1,
): Readonly<PoseInfluence> {
	return Object.fromEntries(joints.map((joint) => [joint, weight]))
}

export const FULL_BODY_INFLUENCE = createInfluence(PILOT_JOINTS)

export const RUN_INFLUENCE = {
	body: 0.58,
	head: 0.2,
	hips: 1,
	leftArm: 0.34,
	leftElbow: 0.34,
	leftFoot: 1,
	leftHand: 0.22,
	leftKnee: 1,
	leftLeg: 1,
	leftShoulder: 0.34,
	leftToe: 1,
	neck: 0.26,
	rightArm: 0.34,
	rightElbow: 0.34,
	rightFoot: 1,
	rightHand: 0.22,
	rightKnee: 1,
	rightLeg: 1,
	rightShoulder: 0.34,
	rightToe: 1,
	root: 1,
} as const satisfies PoseInfluence

export const AIM_INFLUENCE = {
	body: 0.56,
	head: 1,
	leftArm: 0.78,
	leftElbow: 0.78,
	leftHand: 0.78,
	leftShoulder: 0.78,
	neck: 1,
	rightArm: 1,
	rightElbow: 1,
	rightHand: 1,
	rightShoulder: 1,
	weapon: 1,
	weaponMount: 1,
} as const satisfies PoseInfluence

/** Gives pose literals contextual types without hiding their underlying data. */
export function definePilotPose(pose: PilotPose): PilotPose {
	return pose
}

export function definePilotKeyframes(
	animation: PilotKeyframedAnimation,
): PilotKeyframedAnimation {
	if (animation.keyframes.length < 2) {
		throw new Error("Pilot animations require at least two keyframes.")
	}
	let previousTime = -Infinity
	for (const keyframe of animation.keyframes) {
		if (keyframe.at < previousTime) {
			throw new Error("Pilot animation keyframes must be ordered by time.")
		}
		previousTime = keyframe.at
	}
	return animation
}

function interpolateAngle(from: number, to: number, amount: number): number {
	const distance =
		THREE.MathUtils.euclideanModulo(to - from + Math.PI, Math.PI * 2) - Math.PI
	return from + distance * amount
}

function interpolateChannels(
	from: PoseChannels | undefined,
	to: PoseChannels | undefined,
	amount: number,
	angles: boolean,
): PoseChannels | undefined {
	if (from === undefined && to === undefined) return undefined
	const result: PoseChannels = {}
	for (const axis of ["x", "y", "z"] as const) {
		const fromValue = from?.[axis] ?? to?.[axis]
		const toValue = to?.[axis] ?? from?.[axis]
		if (fromValue === undefined || toValue === undefined) continue
		result[axis] = angles
			? interpolateAngle(fromValue, toValue, amount)
			: THREE.MathUtils.lerp(fromValue, toValue, amount)
	}
	return result
}

export function samplePilotKeyframes(
	animation: PilotKeyframedAnimation,
	progress: number,
): PilotPose {
	const keyframes = animation.keyframes
	const first = keyframes[0]
	const last = keyframes.at(-1)
	if (first === undefined || last === undefined) return {}
	const sampleTime = animation.loop
		? THREE.MathUtils.euclideanModulo(progress, 1)
		: THREE.MathUtils.clamp(progress, first.at, last.at)
	let fromIndex = 0
	while (
		fromIndex < keyframes.length - 2 &&
		sampleTime > (keyframes[fromIndex + 1]?.at ?? last.at)
	) {
		fromIndex += 1
	}
	const from = keyframes[fromIndex] ?? first
	const to = keyframes[fromIndex + 1] ?? last
	const range = Math.max(0.000_001, to.at - from.at)
	const amount = THREE.MathUtils.smoothstep(
		sampleTime,
		from.at,
		from.at + range,
	)
	const pose: PilotPose = {}
	for (const joint of PILOT_JOINTS) {
		const fromJoint = from.pose[joint]
		const toJoint = to.pose[joint]
		if (fromJoint === undefined && toJoint === undefined) continue
		const position = interpolateChannels(
			fromJoint?.position,
			toJoint?.position,
			amount,
			false,
		)
		const rotation = interpolateChannels(
			fromJoint?.rotation,
			toJoint?.rotation,
			amount,
			true,
		)
		pose[joint] = {
			...(position === undefined ? {} : { position }),
			...(rotation === undefined ? {} : { rotation }),
		}
	}
	return pose
}

function getJoint(rig: PilotRig, joint: PilotJoint): THREE.Object3D {
	return rig[joint]
}

/** Applies a sampled pose without resetting or blending the rig. */
export function applyPilotPose(rig: PilotRig, pose: PilotPose): void {
	for (const jointName of PILOT_JOINTS) {
		const jointPose = pose[jointName]
		if (jointPose === undefined) continue
		const joint = getJoint(rig, jointName)
		if (jointPose.position?.x !== undefined)
			joint.position.x = jointPose.position.x
		if (jointPose.position?.y !== undefined)
			joint.position.y = jointPose.position.y
		if (jointPose.position?.z !== undefined)
			joint.position.z = jointPose.position.z
		if (jointPose.rotation?.x !== undefined)
			joint.rotation.x = jointPose.rotation.x
		if (jointPose.rotation?.y !== undefined)
			joint.rotation.y = jointPose.rotation.y
		if (jointPose.rotation?.z !== undefined)
			joint.rotation.z = jointPose.rotation.z
	}
}

function channelValue(
	channels: PoseChannels,
	axis: "x" | "y" | "z",
	fallback: number,
): number {
	return channels[axis] ?? fallback
}

function layerGlobalWeight(layer: PilotAnimationLayer): number {
	return THREE.MathUtils.clamp(layer.weight ?? 1, 0, 1)
}

function influencedLayerWeight(
	layer: PilotAnimationLayer,
	joint: PilotJoint,
): number {
	const influence =
		layer.influence === undefined ? 1 : (layer.influence[joint] ?? 0)
	return layerGlobalWeight(layer) * Math.max(0, influence)
}

function applyOverrideGroup(
	rig: PilotRig,
	layers: readonly PilotAnimationLayer[],
): void {
	for (const jointName of PILOT_JOINTS) {
		const joint = getJoint(rig, jointName)
		for (const axis of ["x", "y", "z"] as const) {
			let weightedValue = 0
			let totalWeight = 0
			let totalActivation = 0
			for (const layer of layers) {
				const value = layer.pose[jointName]?.position?.[axis]
				const weight = influencedLayerWeight(layer, jointName)
				if (value === undefined || weight <= 0) continue
				weightedValue += value * weight
				totalWeight += weight
				totalActivation += layerGlobalWeight(layer)
			}
			if (totalWeight <= 0) continue
			joint.position[axis] = THREE.MathUtils.lerp(
				joint.position[axis],
				weightedValue / totalWeight,
				Math.min(1, totalActivation),
			)
		}

		let blendedRotation: THREE.Quaternion | undefined
		let totalRotationWeight = 0
		let totalRotationActivation = 0
		for (const layer of layers) {
			const rotation = layer.pose[jointName]?.rotation
			const weight = influencedLayerWeight(layer, jointName)
			if (rotation === undefined || weight <= 0) continue
			const target = new THREE.Quaternion().setFromEuler(
				new THREE.Euler(
					channelValue(rotation, "x", joint.rotation.x),
					channelValue(rotation, "y", joint.rotation.y),
					channelValue(rotation, "z", joint.rotation.z),
					joint.rotation.order,
				),
			)
			if (blendedRotation === undefined) {
				blendedRotation = target
				totalRotationWeight = weight
			} else {
				totalRotationWeight += weight
				blendedRotation.slerp(target, weight / totalRotationWeight)
			}
			totalRotationActivation += layerGlobalWeight(layer)
		}
		if (blendedRotation !== undefined) {
			joint.quaternion.slerp(
				blendedRotation,
				Math.min(1, totalRotationActivation),
			)
		}
	}
}

function applyAdditive(
	joint: THREE.Object3D,
	pose: JointPose,
	weight: number,
): void {
	if (pose.position !== undefined) {
		joint.position.x += (pose.position.x ?? 0) * weight
		joint.position.y += (pose.position.y ?? 0) * weight
		joint.position.z += (pose.position.z ?? 0) * weight
	}
	if (pose.rotation === undefined) return
	const delta = new THREE.Quaternion().setFromEuler(
		new THREE.Euler(
			(pose.rotation.x ?? 0) * weight,
			(pose.rotation.y ?? 0) * weight,
			(pose.rotation.z ?? 0) * weight,
			joint.rotation.order,
		),
	)
	joint.quaternion.multiply(delta)
}

export function applyPilotAnimationLayers(
	rig: PilotRig,
	layers: readonly PilotAnimationLayer[],
	constraints: readonly PilotAnimationConstraint[] = [],
): void {
	resetPilotPose(rig)
	applyOverrideGroup(
		rig,
		layers.filter((layer) => layer.mode === "override"),
	)
	for (const layer of layers) {
		if (layer.mode !== "additive") continue
		for (const jointName of PILOT_JOINTS) {
			const jointPose = layer.pose[jointName]
			const weight = influencedLayerWeight(layer, jointName)
			if (jointPose === undefined || weight <= 0) continue
			applyAdditive(getJoint(rig, jointName), jointPose, weight)
		}
	}
	for (const constrain of constraints) constrain(rig)
}

/**
 * Maintains layer activation weights across frames. Callers describe only what
 * should be active now; missing layers fade out automatically.
 */
export class PilotAnimationMixer {
	readonly #activeLayers = new Map<string, ActiveLayer>()

	update(
		rig: PilotRig,
		requestedLayers: readonly PilotAnimationLayer[],
		delta: number,
		constraints: readonly PilotAnimationConstraint[] = [],
	): void {
		for (const active of this.#activeLayers.values()) {
			active.targetWeight = 0
		}
		for (const layer of requestedLayers) {
			const targetWeight = THREE.MathUtils.clamp(layer.weight ?? 1, 0, 1)
			const active = this.#activeLayers.get(layer.id)
			if (active === undefined) {
				this.#activeLayers.set(layer.id, {
					currentWeight: layer.fadeSeconds === 0 ? targetWeight : 0,
					layer,
					targetWeight,
				})
			} else {
				active.layer = layer
				active.targetWeight = targetWeight
			}
		}

		const layers: PilotAnimationLayer[] = []
		for (const [id, active] of this.#activeLayers) {
			const fadeSeconds = Math.max(0, active.layer.fadeSeconds ?? 0.12)
			const step = fadeSeconds === 0 ? 1 : delta / fadeSeconds
			if (active.currentWeight < active.targetWeight) {
				active.currentWeight = Math.min(
					active.targetWeight,
					active.currentWeight + step,
				)
			} else {
				active.currentWeight = Math.max(
					active.targetWeight,
					active.currentWeight - step,
				)
			}
			if (active.currentWeight <= 0 && active.targetWeight <= 0) {
				this.#activeLayers.delete(id)
				continue
			}
			layers.push({
				...active.layer,
				weight: active.currentWeight,
			})
		}
		applyPilotAnimationLayers(rig, layers, constraints)
	}
}

const legacySamplerRig = createPilotModel()

/**
 * Temporary bridge for draft animation functions. Blessed animations should
 * sample PilotPose data directly so their joint ownership remains explicit.
 */
export function sampleDraftAnimation(
	mutate: (rig: PilotRig) => void,
): PilotPose {
	resetPilotPose(legacySamplerRig)
	mutate(legacySamplerRig)
	const pose: PilotPose = {}
	for (const jointName of PILOT_JOINTS) {
		const joint = getJoint(legacySamplerRig, jointName)
		pose[jointName] = {
			position: {
				x: joint.position.x,
				y: joint.position.y,
				z: joint.position.z,
			},
			rotation: {
				x: joint.rotation.x,
				y: joint.rotation.y,
				z: joint.rotation.z,
			},
		}
	}
	return pose
}
