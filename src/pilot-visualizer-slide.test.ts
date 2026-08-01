import assert from "node:assert/strict"
import { test } from "vitest"

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
import { slideAnimationLayer } from "./pilot/SlideAnimation.ts"
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
	const vector = samplePilotVisualizerSlideVector(37, 64)
	const slide = slideAnimationLayer(vector.motion, vector.heading)
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
