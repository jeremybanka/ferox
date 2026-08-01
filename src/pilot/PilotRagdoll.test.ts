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
import {
	PILOT_RAGDOLL_PHYSICS,
	PilotRagdollPresentation,
} from "./PilotRagdoll.ts"

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

function directMeshMinimumY(objects: readonly THREE.Object3D[]): number {
	const bounds = new THREE.Box3()
	for (const object of objects) bounds.expandByObject(object)
	return bounds.min.y
}

function visibleSupportClearances(rig: PilotRig): Record<string, number> {
	rig.root.updateMatrixWorld(true)
	return {
		chest: directMeshMinimumY([rig.body.children[0]!]),
		head: directMeshMinimumY(
			rig.head.children.filter((child) => child instanceof THREE.Mesh),
		),
		leftFoot: directMeshMinimumY(
			rig.leftFoot.children.filter((child) => child instanceof THREE.Mesh),
		),
		leftHand: directMeshMinimumY(
			rig.leftHand.children.filter((child) => child instanceof THREE.Mesh),
		),
		pelvis: directMeshMinimumY(
			rig.hips.children.filter((child) => child instanceof THREE.Mesh),
		),
		rightFoot: directMeshMinimumY(
			rig.rightFoot.children.filter((child) => child instanceof THREE.Mesh),
		),
		rightHand: directMeshMinimumY(
			rig.rightHand.children.filter((child) => child instanceof THREE.Mesh),
		),
	}
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

test("airborne root preserves handoff momentum and falls with world gravity", () => {
	const rig = createDeathRig()
	const ragdoll = new PilotRagdollPresentation()
	applyAuthoredDeath(rig, DEATH_RAGDOLL_HANDOFF_SECONDS - 1 / 120)
	ragdoll.observeAuthored(rig, DEATH_RAGDOLL_HANDOFF_SECONDS - 1 / 120)
	applyAuthoredDeath(rig, DEATH_RAGDOLL_HANDOFF_SECONDS)
	const handoffY = rig.root.position.y
	ragdoll.update(rig, {
		delta: 0,
		elapsedSeconds: DEATH_RAGDOLL_HANDOFF_SECONDS,
		groundHeightAt: () => -100,
	})
	const handoffVelocity = ragdoll.debugState(rig, () => -100).verticalVelocity
	assert.ok(handoffVelocity < -0.3)
	assert.ok(handoffVelocity > -0.5)

	const samples = new Map<number, { displacement: number; velocity: number }>()
	const sampleSteps = new Set([12, 30, 60])
	for (let step = 1; step <= 60; step += 1) {
		ragdoll.update(rig, {
			delta: 1 / 120,
			elapsedSeconds: DEATH_RAGDOLL_HANDOFF_SECONDS + step / 120,
			groundHeightAt: () => -100,
		})
		if (sampleSteps.has(step)) {
			samples.set(step, {
				displacement: rig.root.position.y - handoffY,
				velocity: ragdoll.debugState(rig, () => -100).verticalVelocity,
			})
		}
	}

	for (const step of sampleSteps) {
		const sample = samples.get(step)!
		const delta = 1 / 120
		const elapsed = step * delta
		const expectedVelocity =
			handoffVelocity - PILOT_RAGDOLL_PHYSICS.gravity * elapsed
		const expectedDisplacement =
			handoffVelocity * elapsed -
			(PILOT_RAGDOLL_PHYSICS.gravity * delta * delta * step * (step + 1)) / 2
		assert.ok(Math.abs(sample.velocity - expectedVelocity) < 1e-9)
		assert.ok(Math.abs(sample.displacement - expectedDisplacement) < 1e-9)
	}
	assert.ok(samples.get(12)!.displacement < -0.15)
	assert.ok(samples.get(30)!.displacement < -0.8)
	assert.ok(samples.get(60)!.displacement < -3)

	ragdoll.dispose()
	disposePilotModel(rig)
})

test("one metre of clearance reaches terrain with decisive weight", () => {
	const rig = createDeathRig()
	const ragdoll = new PilotRagdollPresentation()
	applyAuthoredDeath(rig, DEATH_RAGDOLL_HANDOFF_SECONDS - 1 / 120)
	ragdoll.observeAuthored(rig, DEATH_RAGDOLL_HANDOFF_SECONDS - 1 / 120)
	applyAuthoredDeath(rig, DEATH_RAGDOLL_HANDOFF_SECONDS)
	const clearanceAtZero = ragdoll.debugState(
		rig,
		() => 0,
	).minimumGroundClearance
	const groundHeight = clearanceAtZero - 1
	const groundHeightAt = () => groundHeight
	ragdoll.update(rig, {
		delta: 0,
		elapsedSeconds: DEATH_RAGDOLL_HANDOFF_SECONDS,
		groundHeightAt,
	})
	assert.ok(
		Math.abs(
			ragdoll.debugState(rig, groundHeightAt).minimumGroundClearance - 1,
		) < 1e-9,
	)
	let contactSeconds: number | null = null
	for (let step = 1; step <= 60; step += 1) {
		ragdoll.update(rig, {
			delta: 1 / 120,
			elapsedSeconds: DEATH_RAGDOLL_HANDOFF_SECONDS + step / 120,
			groundHeightAt,
		})
		if (
			ragdoll.debugState(rig, groundHeightAt).minimumGroundClearance <= 0.001
		) {
			contactSeconds = step / 120
			break
		}
	}
	assert.ok(contactSeconds !== null)
	assert.ok(contactSeconds >= 0.2)
	assert.ok(contactSeconds <= 0.3)

	ragdoll.dispose()
	disposePilotModel(rig)
})

test("torso lands first, articulated contacts settle visible geometry onto terrain", () => {
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

	const firstContacts = new Map<string, number>()
	let visiblySettledAt: number | null = null
	let maximumTransientVisiblePenetration = 0
	let maximumSettledVisiblePenetration = 0
	for (let step = 1; step <= 240; step += 1) {
		const seconds = step / 120
		ragdoll.update(rig, {
			delta: 1 / 120,
			elapsedSeconds: DEATH_RAGDOLL_HANDOFF_SECONDS + seconds,
			groundHeightAt: () => 0,
		})
		const debug = ragdoll.debugState(rig, () => 0)
		maximumTransientVisiblePenetration = Math.max(
			maximumTransientVisiblePenetration,
			-debug.visibleGroundClearance,
		)
		if (debug.contactSeconds >= PILOT_RAGDOLL_PHYSICS.settlingSeconds) {
			maximumSettledVisiblePenetration = Math.max(
				maximumSettledVisiblePenetration,
				-debug.visibleGroundClearance,
			)
		}
		for (const contact of debug.contactedColliders) {
			if (!firstContacts.has(contact)) firstContacts.set(contact, seconds)
		}
		const supportClearances = Object.values(visibleSupportClearances(rig))
		if (
			visiblySettledAt === null &&
			Math.min(...supportClearances) >= -0.1 &&
			Math.max(...supportClearances) <= 0.08 &&
			debug.rootSpeed < 0.1 &&
			debug.maxAngularSpeed < 0.2
		) {
			visiblySettledAt = seconds
		}
	}

	assert.ok(firstContacts.get("pelvis")! <= 0.1)
	assert.ok(firstContacts.get("chest")! <= 0.4)
	assert.ok(firstContacts.get("head")! <= 0.6)
	for (const contact of [
		"left hand",
		"right hand",
		"left knee",
		"right knee",
	] as const) {
		assert.ok(firstContacts.has(contact), `${contact} never contacted terrain`)
		assert.ok(
			firstContacts.get(contact)! >=
				PILOT_RAGDOLL_PHYSICS.limbContactDelaySeconds,
		)
	}
	assert.ok(visiblySettledAt !== null)
	assert.ok(visiblySettledAt <= 1)
	assert.ok(maximumTransientVisiblePenetration <= 0.18)
	assert.ok(maximumSettledVisiblePenetration <= 0.1)

	const supportClearances = Object.values(visibleSupportClearances(rig))
	assert.ok(Math.min(...supportClearances) >= -0.1)
	assert.ok(Math.max(...supportClearances) <= 0.08)
	const settledDebug = ragdoll.debugState(rig, () => 0)
	assert.ok(settledDebug.colliderGroundClearances["abdomen"]! <= 0.08)
	assert.ok(settledDebug.visibleGroundClearance >= -0.1)
	assert.ok(settledDebug.sleepSeconds >= 0.45)

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
			assert.ok(stepDebug.visibleGroundClearance >= -0.18)
			if (stepDebug.contactSeconds >= PILOT_RAGDOLL_PHYSICS.settlingSeconds) {
				assert.ok(stepDebug.minimumGroundClearance >= -0.02)
				assert.ok(stepDebug.visibleGroundClearance >= -0.1)
			}
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
	assert.ok(debug.minimumGroundClearance >= -0.01)
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
		assert.ok(debug.visibleGroundClearance >= -0.18)
		if (debug.contactSeconds >= PILOT_RAGDOLL_PHYSICS.settlingSeconds) {
			assert.ok(debug.minimumGroundClearance >= -0.02)
			assert.ok(debug.visibleGroundClearance >= -0.1)
		}
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
			colliderGroundClearances: ragdoll.debugState(rig, () => 0)
				.colliderGroundClearances,
			contactSeconds: 0,
			contactedColliders: [],
			disposed: true,
			fastestJoint: null,
			finite: true,
			limitViolations: 0,
			maxAngularSpeed: 0,
			minimumGroundClearance: ragdoll.debugState(rig, () => 0)
				.minimumGroundClearance,
			rootSpeed: 0,
			sleepSeconds: 0,
			verticalVelocity: 0,
			visibleGroundClearance: ragdoll.debugState(rig, () => 0)
				.visibleGroundClearance,
		},
	)
	disposePilotModel(rig)
})
