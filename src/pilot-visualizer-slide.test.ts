import assert from "node:assert/strict"
import { test } from "vitest"
import * as THREE from "three"

import { gunDefinition } from "./guns/GunDefinitions.ts"
import { samplePilotVisualizerSlideVector } from "./pilot-visualizer-slide.ts"
import {
	applyPilotAnimationLayers,
	type PilotAnimationLayer,
	type PilotJoint,
} from "./pilot/PilotAnimation.ts"
import {
	createPilotModel,
	disposePilotModel,
	type PilotRig,
} from "./pilot/PilotModel.ts"
import { reloadAnimationLayer } from "./pilot/ReloadAnimation.ts"
import { idleAnimationLayer } from "./pilot/IdleAnimation.ts"
import {
	applySlideWorldYaw,
	slideAnimationLayer,
	slidePresentationNormal,
} from "./pilot/SlideAnimation.ts"
import { waveAnimationLayer } from "./pilot/WaveAnimation.ts"

const SLIDE_LOWER_BODY_JOINTS = [
	"root",
	"leftFoot",
	"rightFoot",
] as const satisfies readonly PilotJoint[]

function jointSnapshot(rig: PilotRig): number[] {
	return SLIDE_LOWER_BODY_JOINTS.flatMap((joint) => {
		const part = rig[joint]
		return [
			part.position.x,
			part.position.y,
			part.position.z,
			part.quaternion.x,
			part.quaternion.y,
			part.quaternion.z,
			part.quaternion.w,
		]
	})
}

function assertSamplesNear(
	actual: readonly number[],
	expected: readonly number[],
): void {
	assert.equal(actual.length, expected.length)
	for (const [index, value] of actual.entries()) {
		assert.ok(
			Math.abs(value - expected[index]!) < 0.000_001,
			`sample ${index} expected ${expected[index]}, received ${value}`,
		)
	}
}

test("continuous slide vector preserves reload and wave overlay composition", () => {
	const vector = samplePilotVisualizerSlideVector(37, -42)
	const slide = slideAnimationLayer(
		vector.motion,
		vector.heading,
		vector.surface,
	)
	const reload = gunDefinition("arc-blaster").reload
	const overlays: readonly PilotAnimationLayer[] = [
		reloadAnimationLayer(
			reload.animation,
			reload.refillProgress * 0.75,
			reload.refillProgress,
		),
		waveAnimationLayer(0.42),
	]
	const slideRig = createPilotModel()
	const composedRig = createPilotModel()
	try {
		applyPilotAnimationLayers(slideRig, [slide])
		applyPilotAnimationLayers(composedRig, [slide, ...overlays])
		assertSamplesNear(jointSnapshot(composedRig), jointSnapshot(slideRig))
		assert.notEqual(
			composedRig.weaponMount.quaternion.z,
			slideRig.weaponMount.quaternion.z,
		)
		assert.notEqual(
			composedRig.rightShoulder.quaternion.x,
			slideRig.rightShoulder.quaternion.x,
		)
		assert.notEqual(composedRig.hips.quaternion.z, slideRig.hips.quaternion.z)
	} finally {
		disposePilotModel(slideRig)
		disposePilotModel(composedRig)
	}
})

test("actual preview composition keeps limbs bounded through every slide phase", () => {
	function previewWeight(progress: number): number {
		if (progress < 0.18) return THREE.MathUtils.smoothstep(progress, 0, 0.18)
		if (progress > 0.82) {
			return 1 - THREE.MathUtils.smoothstep(progress, 0.82, 1)
		}
		return 1
	}

	for (const direction of [0, 45, 90, 135, 180, 225, 270, 315]) {
		for (const inclination of [-60, -30, 0, 30, 60]) {
			const vector = samplePilotVisualizerSlideVector(direction, inclination)
			const normal = slidePresentationNormal(vector.surface)
			const worldNormal = new THREE.Vector3(
				normal.x,
				normal.y,
				normal.z,
			).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.42)
			for (const time of [0, 0.126, 0.252, 0.7, 1.148, 1.274, 1.4]) {
				const slide = {
					...slideAnimationLayer(vector.motion, vector.heading, vector.surface),
					fadeSeconds: 0,
					weight: previewWeight(time / 1.4),
				}
				const rig = createPilotModel()
				try {
					applyPilotAnimationLayers(rig, [idleAnimationLayer(time), slide])
					applySlideWorldYaw(rig.root.quaternion, 0.42, rig.root.position)
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
						const height = endpoint.sub(hips).dot(worldNormal)
						assert.ok(
							height <= 0.14,
							`${joint} rose ${height}m at ${direction}°/${inclination}°/${time}s`,
						)
					}
					for (const joint of Object.values(rig)) {
						if (!(joint instanceof THREE.Object3D)) continue
						assert.ok(
							[
								joint.quaternion.x,
								joint.quaternion.y,
								joint.quaternion.z,
								joint.quaternion.w,
							].every(Number.isFinite),
						)
					}
				} finally {
					disposePilotModel(rig)
				}
			}
		}
	}
})
