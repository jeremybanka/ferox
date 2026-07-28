import * as THREE from "three"

import type { PilotAnimationConstraint } from "./PilotAnimation.ts"
import type { PilotRig } from "./PilotModel.ts"

export type PilotPointDirection = {
	pitch: number
	yaw: number
}

export type BlasterAlignment = {
	closestPoint: THREE.Vector3
	headOrigin: THREE.Vector3
	hit: boolean
	missDistance: number
	muzzleOrigin: THREE.Vector3
	rayEnd: THREE.Vector3
	target: THREE.Vector3
}

const FORWARD = new THREE.Vector3(0, 0, -1)

function blendAngle(from: number, to: number, weight: number): number {
	const distance =
		THREE.MathUtils.euclideanModulo(to - from + Math.PI, Math.PI * 2) - Math.PI
	return from + distance * THREE.MathUtils.clamp(weight, 0, 1)
}

function limitedDirection(direction: PilotPointDirection): PilotPointDirection {
	return {
		pitch: THREE.MathUtils.clamp(direction.pitch, -0.78, 0.72),
		yaw: THREE.MathUtils.clamp(direction.yaw, -0.92, 0.92),
	}
}

function directionRelativeToBody(
	rig: PilotRig,
	direction: PilotPointDirection,
): PilotPointDirection {
	return {
		pitch: THREE.MathUtils.clamp(
			direction.pitch - rig.hips.rotation.x - rig.body.rotation.x,
			-1.05,
			1.05,
		),
		yaw: THREE.MathUtils.clamp(
			direction.yaw - rig.hips.rotation.y - rig.body.rotation.y,
			-1.1,
			1.1,
		),
	}
}

/**
 * Keeps the helmet oriented toward the pilot's view direction while preserving
 * animation-authored roll. Neck and head share the physically limited turn.
 */
export function lookTowardConstraint(
	direction: PilotPointDirection,
	weight = 1,
): PilotAnimationConstraint {
	const limited = limitedDirection(direction)
	return (rig) => {
		const local = directionRelativeToBody(rig, limited)
		rig.neck.rotation.x = blendAngle(
			rig.neck.rotation.x,
			local.pitch * 0.42,
			weight,
		)
		rig.head.rotation.x = blendAngle(
			rig.head.rotation.x,
			local.pitch * 0.58,
			weight,
		)
		rig.neck.rotation.y = blendAngle(
			rig.neck.rotation.y,
			local.yaw * 0.36,
			weight,
		)
		rig.head.rotation.y = blendAngle(
			rig.head.rotation.y,
			local.yaw * 0.64,
			weight,
		)
	}
}

/**
 * Raises the waving arm beside the helmet and turns its plane toward the same
 * direction as the pilot's gaze. The elbow remains animation-driven so the
 * wave motion itself is not proceduralized away.
 */
export function waveTowardConstraint(
	direction: PilotPointDirection,
	weight = 1,
): PilotAnimationConstraint {
	const limited = limitedDirection(direction)
	return (rig) => {
		const local = directionRelativeToBody(rig, limited)
		rig.leftShoulder.rotation.x = blendAngle(
			rig.leftShoulder.rotation.x,
			1.72 + local.pitch * 0.32,
			weight,
		)
		rig.leftShoulder.rotation.y = blendAngle(
			rig.leftShoulder.rotation.y,
			0.1 + local.yaw * 0.34,
			weight,
		)
		rig.leftShoulder.rotation.z = blendAngle(
			rig.leftShoulder.rotation.z,
			-1.5,
			weight,
		)
		rig.leftArm.rotation.y = blendAngle(
			rig.leftArm.rotation.y,
			-0.18 + local.yaw * 0.22,
			weight,
		)
	}
}

/**
 * Solves the wrist-blaster direction after animation blending. The authored
 * arm shape stays intact while the final correction rotates the entire chain
 * from the shoulder, so the weapon cannot act like a gimbal in the hand.
 */
export function pointBlasterConstraint(
	direction: PilotPointDirection,
	weight = 1,
): PilotAnimationConstraint {
	const limited = limitedDirection(direction)
	return (rig) => {
		const local = directionRelativeToBody(rig, limited)
		rig.rightShoulder.rotation.x = blendAngle(
			rig.rightShoulder.rotation.x,
			1.02 + local.pitch * 0.5,
			weight,
		)
		rig.rightShoulder.rotation.y = blendAngle(
			rig.rightShoulder.rotation.y,
			-0.22 - local.yaw * 0.3,
			weight,
		)
		rig.rightArm.rotation.x = blendAngle(
			rig.rightArm.rotation.x,
			0.16 + local.pitch * 0.18,
			weight,
		)
		rig.rightElbow.rotation.x = blendAngle(
			rig.rightElbow.rotation.x,
			0.48,
			weight,
		)
		rig.rightHand.rotation.x = blendAngle(
			rig.rightHand.rotation.x,
			0.08,
			weight,
		)
		rig.rightHand.rotation.y = blendAngle(
			rig.rightHand.rotation.y,
			-0.12,
			weight,
		)

		for (let iteration = 0; iteration < 6; iteration += 1) {
			rig.root.updateMatrixWorld(true)
			const headOrigin = rig.head.getWorldPosition(new THREE.Vector3())
			const headDirection = FORWARD.clone().applyQuaternion(
				rig.head.getWorldQuaternion(new THREE.Quaternion()),
			)
			const target = headOrigin.addScaledVector(headDirection, 10)
			const muzzleOrigin = rig.muzzle.getWorldPosition(new THREE.Vector3())
			const muzzleDirection = FORWARD.clone().applyQuaternion(
				rig.muzzle.getWorldQuaternion(new THREE.Quaternion()),
			)
			const desiredDirection = target.sub(muzzleOrigin).normalize()
			const shoulderCorrection = new THREE.Quaternion().setFromUnitVectors(
				muzzleDirection,
				desiredDirection,
			)
			const currentShoulderWorld = rig.rightShoulder.getWorldQuaternion(
				new THREE.Quaternion(),
			)
			const parentWorld = rig.body.getWorldQuaternion(new THREE.Quaternion())
			const desiredShoulderLocal = parentWorld
				.invert()
				.multiply(shoulderCorrection)
				.multiply(currentShoulderWorld)
			rig.rightShoulder.quaternion.slerp(desiredShoulderLocal, weight)
		}
	}
}

export function measureBlasterAlignment(
	rig: PilotRig,
	targetDistance = 10,
	targetRadius = 0.3,
): BlasterAlignment {
	rig.root.updateMatrixWorld(true)
	const headOrigin = rig.head.getWorldPosition(new THREE.Vector3())
	const headDirection = FORWARD.clone()
		.applyQuaternion(rig.head.getWorldQuaternion(new THREE.Quaternion()))
		.normalize()
	const target = headOrigin
		.clone()
		.addScaledVector(headDirection, targetDistance)
	const muzzleOrigin = rig.muzzle.getWorldPosition(new THREE.Vector3())
	const muzzleDirection = FORWARD.clone()
		.applyQuaternion(rig.muzzle.getWorldQuaternion(new THREE.Quaternion()))
		.normalize()
	const targetOffset = target.clone().sub(muzzleOrigin)
	const distanceAlongRay = Math.max(0, targetOffset.dot(muzzleDirection))
	const closestPoint = muzzleOrigin
		.clone()
		.addScaledVector(muzzleDirection, distanceAlongRay)
	const missDistance = closestPoint.distanceTo(target)
	return {
		closestPoint,
		headOrigin,
		hit: distanceAlongRay > 0 && missDistance <= targetRadius,
		missDistance,
		muzzleOrigin,
		rayEnd: muzzleOrigin
			.clone()
			.addScaledVector(muzzleDirection, targetDistance + 2),
		target,
	}
}
