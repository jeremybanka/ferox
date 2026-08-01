import assert from "node:assert/strict"
import { test } from "vitest"

import { gunDefinition } from "../guns/GunDefinitions.ts"
import {
	airborneVelocityLayer,
	risingFallingAnimationLayer,
} from "./AirborneAnimation.ts"
import {
	applyCrouchIdleAnimation,
	crouchRunAnimationLayer,
} from "./CrouchAnimation.ts"
import { idleAnimationLayer } from "./IdleAnimation.ts"
import {
	applyPilotAnimationLayers,
	FULL_BODY_INFLUENCE,
	sampleDraftAnimation,
	type PilotAnimationLayer,
	type PilotJoint,
} from "./PilotAnimation.ts"
import {
	createPilotModel,
	disposePilotModel,
	type PilotRig,
} from "./PilotModel.ts"
import {
	reloadAnimationLayer,
	reloadAnimationMarkers,
	sampleFirstPersonReloadPose,
	sampleReloadAnimationPhase,
	sampleReloadAnimationPose,
} from "./ReloadAnimation.ts"
import { runAnimationLayer } from "./RunAnimation.ts"
import { slideAnimationLayer } from "./SlideAnimation.ts"

const LOWER_BODY_JOINTS = [
	"root",
	"hips",
	"leftLeg",
	"leftKnee",
	"leftFoot",
	"leftToe",
	"rightLeg",
	"rightKnee",
	"rightFoot",
	"rightToe",
] as const satisfies readonly PilotJoint[]

function jointSnapshot(rig: PilotRig, joints: readonly PilotJoint[]): number[] {
	return joints.flatMap((joint) => {
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

function assertReloadPreservesLocomotion(
	baseLayers: readonly PilotAnimationLayer[],
): void {
	const baseRig = createPilotModel()
	const reloadRig = createPilotModel()
	const reload = gunDefinition("arc-blaster").reload
	try {
		applyPilotAnimationLayers(baseRig, baseLayers)
		applyPilotAnimationLayers(reloadRig, [
			...baseLayers,
			reloadAnimationLayer(
				reload.animation,
				reload.refillProgress * 0.8,
				reload.refillProgress,
			),
		])
		assertSamplesNear(
			jointSnapshot(reloadRig, LOWER_BODY_JOINTS),
			jointSnapshot(baseRig, LOWER_BODY_JOINTS),
		)
		assert.notEqual(
			reloadRig.weaponMount.rotation.z,
			baseRig.weaponMount.rotation.z,
		)
	} finally {
		disposePilotModel(baseRig)
		disposePilotModel(reloadRig)
	}
}

test("reload profiles expose deterministic gun-specific phases and refill markers", () => {
	for (const gunId of ["arc-blaster", "mini-missile"] as const) {
		const reload = gunDefinition(gunId).reload
		const markers = reloadAnimationMarkers(
			reload.animation,
			reload.refillProgress,
		)
		assert.equal(markers[0]?.id, "start")
		assert.equal(markers.at(-1)?.id, "ready")
		assert.equal(
			markers.find((marker) => marker.id === "refill")?.progress,
			reload.refillProgress,
		)
		assert.deepEqual(
			markers.map((marker) => marker.progress),
			markers.map((marker) => marker.progress).toSorted((a, b) => a - b),
		)
		assert.equal(
			sampleReloadAnimationPhase(
				reload.animation,
				reload.refillProgress,
				reload.refillProgress,
			).id,
			"refill",
		)
	}

	const arc = gunDefinition("arc-blaster").reload
	const mini = gunDefinition("mini-missile").reload
	assert.ok(
		reloadAnimationMarkers(arc.animation, arc.refillProgress).some(
			(marker) => marker.id === "release",
		),
	)
	assert.ok(
		reloadAnimationMarkers(mini.animation, mini.refillProgress).some(
			(marker) => marker.id === "service",
		),
	)
})

test("ARC cell and Mini-Missile tube service sample visibly distinct poses", () => {
	const arc = gunDefinition("arc-blaster").reload
	const mini = gunDefinition("mini-missile").reload
	const arcPose = sampleReloadAnimationPose(
		arc.animation,
		arc.refillProgress * 0.7,
		arc.refillProgress,
	)
	const miniPose = sampleReloadAnimationPose(
		mini.animation,
		mini.refillProgress * 0.7,
		mini.refillProgress,
	)
	assert.notDeepEqual(arcPose.weaponMount, miniPose.weaponMount)
	assert.notDeepEqual(arcPose.leftHand, miniPose.leftHand)

	const arcFirstPerson = sampleFirstPersonReloadPose(
		arc.animation,
		arc.refillProgress * 0.7,
		arc.refillProgress,
	)
	const miniFirstPerson = sampleFirstPersonReloadPose(
		mini.animation,
		mini.refillProgress * 0.7,
		mini.refillProgress,
	)
	assert.notDeepEqual(arcFirstPerson, miniFirstPerson)
	assert.ok(Math.abs(miniFirstPerson.positionOffset[0]) > 0.01)
	assert.equal(arcFirstPerson.positionOffset[0], 0)
})

test("reload upper-body layer preserves running lower-body animation", () => {
	assertReloadPreservesLocomotion([runAnimationLayer(0.37, 0.92, "forward")])
})

test("reload upper-body layer preserves idle lower-body animation", () => {
	assertReloadPreservesLocomotion([idleAnimationLayer(0.37)])
})

test("reload upper-body layer preserves crouch-idle lower-body animation", () => {
	assertReloadPreservesLocomotion([
		{
			fadeSeconds: 0,
			id: "test:crouch-idle",
			influence: FULL_BODY_INFLUENCE,
			mode: "override",
			pose: sampleDraftAnimation((rig) => {
				applyCrouchIdleAnimation(rig, 0.37, 1)
			}),
		},
	])
})

test("reload upper-body layer preserves crouch-running lower-body animation", () => {
	assertReloadPreservesLocomotion([crouchRunAnimationLayer(0.37, 1, "left")])
})

test("reload upper-body layer preserves directional slide lower-body animation", () => {
	assertReloadPreservesLocomotion([
		slideAnimationLayer({ localVelocityX: 7, localVelocityZ: -0.4 }),
	])
})

test("reload upper-body layer preserves airborne lower-body animation", () => {
	const motion = {
		jumpCount: 1,
		localVelocityX: -3,
		localVelocityZ: -7,
		verticalVelocity: 2.5,
	} as const
	assertReloadPreservesLocomotion([
		risingFallingAnimationLayer(motion),
		airborneVelocityLayer(motion),
	])
})
