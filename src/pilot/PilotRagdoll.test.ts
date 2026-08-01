import assert from "node:assert/strict"
import * as THREE from "three"
import { test } from "vitest"

import { PILOT_MODEL_SCALE } from "./PilotDimensions.ts"
import { applyPilotAnimationLayers, PILOT_JOINTS } from "./PilotAnimation.ts"
import {
	DEATH_RAGDOLL_HANDOFF_SECONDS,
	deathAnimationLayer,
} from "./DeathAnimation.ts"
import {
	createPilotModel,
	disposePilotModel,
	type PilotRig,
} from "./PilotModel.ts"
import { PilotRagdollPresentation } from "./PilotRagdoll.ts"

function applyAuthoredDeath(rig: PilotRig, elapsedSeconds: number): void {
	const layer = deathAnimationLayer(elapsedSeconds)
	assert.ok(layer)
	applyPilotAnimationLayers(rig, [layer])
	rig.root.updateMatrixWorld(true)
}

function createDeathRig(): PilotRig {
	const rig = createPilotModel()
	rig.root.scale.setScalar(PILOT_MODEL_SCALE)
	return rig
}

function snapshot(rig: PilotRig): readonly number[] {
	rig.root.updateMatrixWorld(true)
	return PILOT_JOINTS.flatMap((joint) => {
		const object = rig[joint]
		return [
			object.position.x,
			object.position.y,
			object.position.z,
			object.quaternion.x,
			object.quaternion.y,
			object.quaternion.z,
			object.quaternion.w,
		]
	})
}

function assertNear(
	actual: readonly number[],
	expected: readonly number[],
	epsilon = 1e-9,
): void {
	assert.equal(actual.length, expected.length)
	for (const [index, value] of actual.entries()) {
		assert.ok(
			Math.abs(value - expected[index]!) <= epsilon,
			`channel ${index} differed: ${value} versus ${expected[index]}`,
		)
	}
}

function torsoBendRadians(rig: PilotRig): number {
	return (
		2 * Math.acos(THREE.MathUtils.clamp(Math.abs(rig.body.quaternion.w), 0, 1))
	)
}

test("ragdoll activation preserves the exact authored handoff transform", () => {
	const rig = createDeathRig()
	const ragdoll = new PilotRagdollPresentation()
	applyAuthoredDeath(rig, DEATH_RAGDOLL_HANDOFF_SECONDS - 1 / 120)
	ragdoll.observeAuthored(rig, DEATH_RAGDOLL_HANDOFF_SECONDS - 1 / 120)
	applyAuthoredDeath(rig, DEATH_RAGDOLL_HANDOFF_SECONDS)
	const handoff = snapshot(rig)

	assert.equal(
		ragdoll.update(rig, {
			delta: 0,
			elapsedSeconds: DEATH_RAGDOLL_HANDOFF_SECONDS,
			groundHeightAt: () => -100,
		}),
		true,
	)
	assert.equal(ragdoll.active, true)
	assertNear(snapshot(rig), handoff)

	ragdoll.dispose()
	disposePilotModel(rig)
})

test("fixed-step ragdoll is deterministic, constrained, finite, and terrain-aware", () => {
	const groundHeightAt = (x: number, z: number) => 0.08 * x - 0.04 * z
	const rigs = [createDeathRig(), createDeathRig()]
	const ragdolls = [
		new PilotRagdollPresentation(),
		new PilotRagdollPresentation(),
	]
	for (let index = 0; index < rigs.length; index += 1) {
		const rig = rigs[index]!
		const ragdoll = ragdolls[index]!
		applyAuthoredDeath(rig, DEATH_RAGDOLL_HANDOFF_SECONDS - 1 / 120)
		ragdoll.observeAuthored(rig, DEATH_RAGDOLL_HANDOFF_SECONDS - 1 / 120)
		applyAuthoredDeath(rig, DEATH_RAGDOLL_HANDOFF_SECONDS)
		ragdoll.update(rig, {
			carrierVelocity: new THREE.Vector3(0.8, 0, -0.35),
			delta: 0,
			elapsedSeconds: DEATH_RAGDOLL_HANDOFF_SECONDS,
			groundHeightAt,
		})
	}

	let maximumTorsoBend = 0
	for (let step = 1; step <= 480; step += 1) {
		for (let index = 0; index < rigs.length; index += 1) {
			ragdolls[index]!.update(rigs[index]!, {
				delta: 1 / 120,
				elapsedSeconds: DEATH_RAGDOLL_HANDOFF_SECONDS + step / 120,
				groundHeightAt,
			})
			const stepDebug = ragdolls[index]!.debugState(
				rigs[index]!,
				groundHeightAt,
			)
			assert.equal(stepDebug.finite, true)
			assert.equal(stepDebug.limitViolations, 0)
			assert.ok(stepDebug.minimumGroundClearance >= -0.001)
			maximumTorsoBend = Math.max(
				maximumTorsoBend,
				torsoBendRadians(rigs[index]!),
			)
		}
	}

	assertNear(snapshot(rigs[0]!), snapshot(rigs[1]!), 1e-8)
	const debug = ragdolls[0]!.debugState(rigs[0]!, groundHeightAt)
	assert.equal(debug.active, true)
	assert.equal(debug.disposed, false)
	assert.equal(debug.finite, true)
	assert.equal(debug.limitViolations, 0)
	assert.ok(debug.minimumGroundClearance >= -0.001)
	assert.ok(debug.rootSpeed < 0.25)
	assert.ok(
		debug.maxAngularSpeed < 0.3,
		`expected angular settling, got ${JSON.stringify(debug)}`,
	)
	assert.ok(
		maximumTorsoBend <= THREE.MathUtils.degToRad(35),
		`midriff bent ${THREE.MathUtils.radToDeg(maximumTorsoBend).toFixed(1)}°`,
	)

	for (let index = 0; index < rigs.length; index += 1) {
		ragdolls[index]!.dispose()
		disposePilotModel(rigs[index]!)
	}
})

test("pelvis and chest remain a stiff compound silhouette on flat ground", () => {
	const rig = createDeathRig()
	const ragdoll = new PilotRagdollPresentation()
	applyAuthoredDeath(rig, DEATH_RAGDOLL_HANDOFF_SECONDS - 1 / 120)
	ragdoll.observeAuthored(rig, DEATH_RAGDOLL_HANDOFF_SECONDS - 1 / 120)
	applyAuthoredDeath(rig, DEATH_RAGDOLL_HANDOFF_SECONDS)
	ragdoll.update(rig, {
		delta: 0,
		elapsedSeconds: DEATH_RAGDOLL_HANDOFF_SECONDS,
		groundHeightAt: () => 0,
	})
	let maximumTorsoBend = 0
	for (let step = 1; step <= 480; step += 1) {
		ragdoll.update(rig, {
			delta: 1 / 120,
			elapsedSeconds: DEATH_RAGDOLL_HANDOFF_SECONDS + step / 120,
			groundHeightAt: () => 0,
		})
		const debug = ragdoll.debugState(rig, () => 0)
		assert.equal(debug.finite, true)
		assert.equal(debug.limitViolations, 0)
		assert.ok(debug.minimumGroundClearance >= -0.001)
		maximumTorsoBend = Math.max(maximumTorsoBend, torsoBendRadians(rig))
	}
	assert.ok(
		maximumTorsoBend <= THREE.MathUtils.degToRad(35),
		`midriff bent ${THREE.MathUtils.radToDeg(maximumTorsoBend).toFixed(1)}°`,
	)
	ragdoll.dispose()
	disposePilotModel(rig)
})

test("disposed ragdoll releases state and rejects later updates", () => {
	const rig = createDeathRig()
	const ragdoll = new PilotRagdollPresentation()
	ragdoll.dispose()
	assert.equal(
		ragdoll.update(rig, {
			delta: 1 / 60,
			elapsedSeconds: DEATH_RAGDOLL_HANDOFF_SECONDS + 1,
			groundHeightAt: () => 0,
		}),
		false,
	)
	assert.deepEqual(
		ragdoll.debugState(rig, () => 0),
		{
			active: false,
			disposed: true,
			fastestJoint: null,
			finite: true,
			limitViolations: 0,
			maxAngularSpeed: 0,
			minimumGroundClearance: ragdoll.debugState(rig, () => 0)
				.minimumGroundClearance,
			rootSpeed: 0,
		},
	)
	disposePilotModel(rig)
})
