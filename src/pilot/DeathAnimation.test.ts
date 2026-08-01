import assert from "node:assert/strict"
import { test } from "vitest"

import { PLAYER_RESPAWN_DELAY_MS } from "../game-constants.ts"
import {
	DEATH_ANIMATION_DURATION_SECONDS,
	DEATH_ANIMATION_MARKERS,
	deathAnimationLayer,
	deathAnimationPhase,
	sampleDeathAnimationPose,
} from "./DeathAnimation.ts"

test("death sequence phases are ordered and finish before respawn", () => {
	assert.ok(DEATH_ANIMATION_DURATION_SECONDS < PLAYER_RESPAWN_DELAY_MS / 1_000)
	assert.deepEqual(
		DEATH_ANIMATION_MARKERS.map((marker) => marker.progress),
		DEATH_ANIMATION_MARKERS.map((marker) => marker.progress).toSorted(
			(a, b) => a - b,
		),
	)
	assert.equal(deathAnimationPhase(0), "impact")
	assert.equal(deathAnimationPhase(0.2), "shuffle")
	assert.equal(deathAnimationPhase(0.46), "knees")
	assert.equal(deathAnimationPhase(0.7), "fall")
	assert.equal(deathAnimationPhase(0.9), "flat")
	assert.equal(deathAnimationPhase(1), "hold")
})

test("death pose shuffles backward before landing on both knees", () => {
	const shuffle = sampleDeathAnimationPose(
		DEATH_ANIMATION_DURATION_SECONDS * 0.2,
	)
	assert.ok((shuffle.root?.position?.z ?? 0) > 0.25)
	assert.ok(Math.abs(shuffle.root?.rotation?.x ?? 0) < 0.1)

	const knees = sampleDeathAnimationPose(
		DEATH_ANIMATION_DURATION_SECONDS * 0.46,
	)
	assert.ok((knees.root?.position?.y ?? 0) < -0.5)
	assert.ok((knees.leftKnee?.rotation?.x ?? 0) > 1.5)
	assert.ok((knees.rightKnee?.rotation?.x ?? 0) > 1.5)
})

test("death pose falls flat forward with both arms raised", () => {
	const flat = sampleDeathAnimationPose(DEATH_ANIMATION_DURATION_SECONDS * 0.9)
	assert.ok((flat.root?.rotation?.x ?? 0) < -1.4)
	assert.ok((flat.root?.position?.z ?? 0) > 0.4)
	assert.ok((flat.leftShoulder?.rotation?.x ?? 0) < -1.4)
	assert.ok((flat.rightShoulder?.rotation?.x ?? 0) < -1.4)

	const held = sampleDeathAnimationPose(DEATH_ANIMATION_DURATION_SECONDS + 4)
	assert.deepEqual(
		held,
		sampleDeathAnimationPose(DEATH_ANIMATION_DURATION_SECONDS),
	)
	const layer = deathAnimationLayer(DEATH_ANIMATION_DURATION_SECONDS)
	assert.equal(layer.id, "lifecycle:death")
	assert.equal(layer.mode, "override")
})
