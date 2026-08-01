import assert from "node:assert/strict"
import { test } from "vitest"
import * as THREE from "three"

import {
	applySlideWorldYaw,
	initialSlideHeading,
	SLIDE_LEG_ROTATION_LIMITS,
	SLIDE_ROOT_SURFACE_RESPONSE,
	sampleSlideAnimationPose,
	slideAnimationLayer,
	slidePresentationNormal,
	slideSurfaceRootRotation,
	slideTravelTilt,
	stepSlideHeading,
} from "./SlideAnimation.ts"
import { slideDirectionFromMotion } from "./SlideDirection.ts"
import { slideSurfaceFrameFromInclination } from "./SlideSurface.ts"
import { applyPilotAnimationLayers, PILOT_JOINTS } from "./PilotAnimation.ts"
import { createPilotModel, disposePilotModel } from "./PilotModel.ts"

const EPSILON = 0.000_001

function assertNear(actual: number, expected: number): void {
	assert.ok(
		Math.abs(actual - expected) < EPSILON,
		`expected ${expected}, received ${actual}`,
	)
}

test("slide direction maps dominant local momentum in all four directions", () => {
	assert.equal(
		slideDirectionFromMotion({ localVelocityX: 0.2, localVelocityZ: -8 }),
		"forward",
	)
	assert.equal(
		slideDirectionFromMotion({ localVelocityX: -0.2, localVelocityZ: 8 }),
		"backward",
	)
	assert.equal(
		slideDirectionFromMotion({ localVelocityX: -8, localVelocityZ: -0.2 }),
		"left",
	)
	assert.equal(
		slideDirectionFromMotion({ localVelocityX: 8, localVelocityZ: 0.2 }),
		"right",
	)
})

test("zero slide momentum falls back to forward without an unstable direction", () => {
	assert.equal(
		slideDirectionFromMotion({ localVelocityX: 0, localVelocityZ: 0 }),
		"forward",
	)
})

test("slide travel tilt banks around the axis perpendicular to all four headings", () => {
	assert.deepEqual(
		slideTravelTilt(
			initialSlideHeading({ localVelocityX: 0, localVelocityZ: -8 }),
			0.14,
		),
		{
			x: -0.14,
			z: -0,
		},
	)
	assert.deepEqual(
		slideTravelTilt(
			initialSlideHeading({ localVelocityX: 0, localVelocityZ: 8 }),
			0.14,
		),
		{
			x: 0.14,
			z: -0,
		},
	)
	assert.deepEqual(
		slideTravelTilt(
			initialSlideHeading({ localVelocityX: -8, localVelocityZ: 0 }),
			0.14,
		),
		{
			x: 0,
			z: 0.14,
		},
	)
	assert.deepEqual(
		slideTravelTilt(
			initialSlideHeading({ localVelocityX: 8, localVelocityZ: 0 }),
			0.14,
		),
		{
			x: 0,
			z: -0.14,
		},
	)
})

test("diagonal momentum produces a continuous heading and perpendicular bank", () => {
	const heading = initialSlideHeading({
		localVelocityX: 6,
		localVelocityZ: -8,
	})
	assertNear(heading.localX, 0.6)
	assertNear(heading.localZ, -0.8)
	const tilt = slideTravelTilt(heading, 0.14)
	assertNear(heading.localX * tilt.x + heading.localZ * tilt.z, 0)

	const pose = sampleSlideAnimationPose(
		{ localVelocityX: 6, localVelocityZ: -8 },
		heading,
	)
	const expected = slideSurfaceRootRotation(
		slideSurfaceFrameFromInclination(heading, 0),
	)
	assertNear(pose.root?.rotation?.x ?? Number.NaN, expected.x)
	assertNear(pose.root?.rotation?.y ?? Number.NaN, expected.y)
	assertNear(pose.root?.rotation?.z ?? Number.NaN, expected.z)
})

test("heading smoothing follows changed velocity instead of snapping cardinally", () => {
	const forward = initialSlideHeading({
		localVelocityX: 0,
		localVelocityZ: -9,
	})
	const diagonal = stepSlideHeading(
		forward,
		{ localVelocityX: 9, localVelocityZ: 0 },
		1 / 60,
	)
	assert.ok(diagonal.localX > 0)
	assert.ok(diagonal.localX < 1)
	assert.ok(diagonal.localZ < 0)
	assertNear(Math.hypot(diagonal.localX, diagonal.localZ), 1)
})

test("near-zero motion caches the last useful heading without jitter", () => {
	const cached = initialSlideHeading({
		localVelocityX: -4,
		localVelocityZ: 3,
	})
	const stopped = stepSlideHeading(
		cached,
		{ localVelocityX: 0.03, localVelocityZ: -0.02 },
		1 / 30,
	)
	assert.equal(stopped, cached)
})

test("slide pose keeps weapon channels free for reload composition", () => {
	const pose = sampleSlideAnimationPose({
		localVelocityX: 7,
		localVelocityZ: -3,
	})
	for (const joint of [
		"leftHand",
		"rightArm",
		"rightElbow",
		"rightHand",
		"weaponMount",
		"weapon",
	] as const) {
		assert.equal(pose[joint], undefined)
	}
	assert.notEqual(pose.leftShoulder, undefined)
	assert.notEqual(pose.rightShoulder, undefined)
})

test("direction and inclination grid keeps constrained legs below the hips", () => {
	for (const directionDegrees of [0, 45, 90, 135, 180, 225, 270, 315]) {
		const directionRadians = (directionDegrees * Math.PI) / 180
		const heading = {
			localX: Math.sin(directionRadians),
			localZ: -Math.cos(directionRadians),
		}
		const motion = {
			localVelocityX: heading.localX * 14.8,
			localVelocityZ: heading.localZ * 14.8,
		}
		for (const inclinationDegrees of [-60, -30, -1, 0, 1, 30, 60]) {
			const surface = slideSurfaceFrameFromInclination(
				heading,
				inclinationDegrees,
			)
			const layer = slideAnimationLayer(motion, heading, surface)
			const presentationNormal = slidePresentationNormal(surface)
			for (const jointPose of Object.values(layer.pose)) {
				for (const channels of [jointPose?.position, jointPose?.rotation]) {
					for (const value of Object.values(channels ?? {})) {
						assert.ok(Number.isFinite(value))
					}
				}
			}
			for (const [joint, limits] of Object.entries(SLIDE_LEG_ROTATION_LIMITS)) {
				const rotation = layer.pose[joint as keyof typeof layer.pose]?.rotation
				for (const axis of ["x", "y", "z"] as const) {
					const value = rotation?.[axis] ?? 0
					assert.ok(value >= limits[axis][0] - EPSILON)
					assert.ok(value <= limits[axis][1] + EPSILON)
				}
			}

			const rig = createPilotModel()
			try {
				applyPilotAnimationLayers(rig, [layer])
				rig.root.updateMatrixWorld(true)
				const hips = rig.hips.getWorldPosition(new THREE.Vector3())
				for (const joint of [
					"leftKnee",
					"leftFoot",
					"leftToe",
					"rightKnee",
					"rightFoot",
					"rightToe",
				] as const) {
					const endpoint = rig[joint].getWorldPosition(new THREE.Vector3())
					const relativeHeight = endpoint
						.sub(hips)
						.dot(
							new THREE.Vector3(
								presentationNormal.x,
								presentationNormal.y,
								presentationNormal.z,
							),
						)
					assert.ok(
						relativeHeight <= 0.13,
						`${joint} rose ${relativeHeight}m above hips at ${directionDegrees}°/${inclinationDegrees}°`,
					)
				}
				for (const joint of PILOT_JOINTS) {
					const quaternion = rig[joint].quaternion
					assert.ok(
						[quaternion.x, quaternion.y, quaternion.z, quaternion.w].every(
							Number.isFinite,
						),
					)
				}
			} finally {
				disposePilotModel(rig)
			}
		}
	}
})

test("slide pose stays continuous across flat inclination and azimuth wrap", () => {
	function rootQuaternion(
		directionDegrees: number,
		inclinationDegrees: number,
	) {
		const radians = (directionDegrees * Math.PI) / 180
		const heading = {
			localX: Math.sin(radians),
			localZ: -Math.cos(radians),
		}
		const surface = slideSurfaceFrameFromInclination(
			heading,
			inclinationDegrees,
		)
		const rotation = slideSurfaceRootRotation(surface)
		return new THREE.Quaternion().setFromEuler(
			new THREE.Euler(rotation.x, rotation.y, rotation.z),
		)
	}
	const acrossFlat = rootQuaternion(37, -0.001).angleTo(
		rootQuaternion(37, 0.001),
	)
	const acrossWrap = rootQuaternion(359.999, 30).angleTo(
		rootQuaternion(0.001, 30),
	)
	assert.ok(acrossFlat < 0.001)
	assert.ok(acrossWrap < 0.001)
})

test("world yaw composes outside the local surface frame", () => {
	const surface = slideSurfaceFrameFromInclination(
		{ localX: Math.SQRT1_2, localZ: -Math.SQRT1_2 },
		45,
	)
	const rotation = slideSurfaceRootRotation(surface)
	const local = new THREE.Quaternion().setFromEuler(
		new THREE.Euler(rotation.x, rotation.y, rotation.z),
	)
	const expected = new THREE.Quaternion()
		.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 1.2)
		.multiply(local)
	const offset = new THREE.Vector3(0.2, -0.7, -0.4)
	const expectedOffset = offset
		.clone()
		.applyAxisAngle(new THREE.Vector3(0, 1, 0), 1.2)
	applySlideWorldYaw(local, 1.2, offset)
	assert.ok(local.angleTo(expected) < EPSILON)
	assert.ok(offset.distanceTo(expectedOffset) < EPSILON)
	assert.ok(SLIDE_ROOT_SURFACE_RESPONSE > 0)
	assert.ok(SLIDE_ROOT_SURFACE_RESPONSE < 1)
})
