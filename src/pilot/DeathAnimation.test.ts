import assert from "node:assert/strict"
import { test } from "vitest"

import { PLAYER_RESPAWN_DELAY_MS } from "../game-constants.ts"
import {
	DEATH_ANIMATION_DURATION_SECONDS,
	DEATH_ANIMATION_MARKERS,
	DEATH_ANIMATION_TIMELINE,
	DEATH_BACKWARD_SHUFFLE_LEFT_POSE,
	DEATH_BACKWARD_SHUFFLE_RIGHT_POSE,
	DEATH_BOTH_KNEES_DROP_POSE,
	DEATH_DEFEATED_HOLD_POSE,
	DEATH_FINAL_PRONE_ARMS_UP_POSE,
	DEATH_FORWARD_FALL_ARMS_UP_POSE,
	DEATH_IMPACT_UPRIGHT_POSE,
	deathAnimationLayer,
	deathAnimationPhase,
	sampleDeathAnimationPose,
} from "./DeathAnimation.ts"

const EXPECTED_PHASES = [
	["impact", "impact upright"],
	["shuffle-left", "backward shuffle left"],
	["shuffle-right", "backward shuffle right"],
	["knee-drop", "both knees drop"],
	["forward-fall", "forward fall arms up"],
	["final-prone", "final prone arms up"],
	["defeated-hold", "defeated hold"],
] as const

test("one named timeline drives death phase order, timing, markers, and duration", () => {
	assert.deepEqual(
		DEATH_ANIMATION_TIMELINE.map(({ id, poseName }) => [id, poseName]),
		EXPECTED_PHASES,
	)
	assert.equal(
		DEATH_ANIMATION_DURATION_SECONDS,
		DEATH_ANIMATION_TIMELINE.at(-1)?.atSeconds,
	)
	assert.ok(DEATH_ANIMATION_DURATION_SECONDS < PLAYER_RESPAWN_DELAY_MS / 1_000)
	assert.deepEqual(
		DEATH_ANIMATION_MARKERS,
		DEATH_ANIMATION_TIMELINE.map(({ atSeconds, id, label }) => ({
			id,
			label,
			progress: atSeconds / DEATH_ANIMATION_DURATION_SECONDS,
		})),
	)
	const namedPoses = [
		DEATH_IMPACT_UPRIGHT_POSE,
		DEATH_BACKWARD_SHUFFLE_LEFT_POSE,
		DEATH_BACKWARD_SHUFFLE_RIGHT_POSE,
		DEATH_BOTH_KNEES_DROP_POSE,
		DEATH_FORWARD_FALL_ARMS_UP_POSE,
		DEATH_FINAL_PRONE_ARMS_UP_POSE,
		DEATH_DEFEATED_HOLD_POSE,
	]
	for (const [index, phase] of DEATH_ANIMATION_TIMELINE.entries()) {
		assert.strictEqual(phase.pose, namedPoses[index])
	}
	for (const phase of DEATH_ANIMATION_TIMELINE) {
		assert.equal(
			deathAnimationPhase(phase.atSeconds / DEATH_ANIMATION_DURATION_SECONDS),
			phase.id,
		)
	}
})

test("death shuffle and kneel use forward-flexing knees", () => {
	for (const pose of [
		DEATH_BACKWARD_SHUFFLE_LEFT_POSE,
		DEATH_BACKWARD_SHUFFLE_RIGHT_POSE,
		DEATH_BOTH_KNEES_DROP_POSE,
	]) {
		assert.ok((pose.leftKnee?.rotation?.x ?? 0) < 0)
		assert.ok((pose.rightKnee?.rotation?.x ?? 0) < 0)
	}

	const knees = sampleDeathAnimationPose(
		DEATH_ANIMATION_TIMELINE.find(({ id }) => id === "knee-drop")?.atSeconds ??
			0,
	)
	assert.ok((knees.root?.position?.y ?? 0) < -0.5)
	assert.ok((knees.leftLeg?.rotation?.x ?? 0) > 0.7)
	assert.ok((knees.rightLeg?.rotation?.x ?? 0) > 0.7)
	assert.ok((knees.leftKnee?.rotation?.x ?? 0) < -1.5)
	assert.ok((knees.rightKnee?.rotation?.x ?? 0) < -1.5)
})

test("fall and prone poses flex elbows naturally with arms outward and up", () => {
	for (const pose of [
		DEATH_FORWARD_FALL_ARMS_UP_POSE,
		DEATH_FINAL_PRONE_ARMS_UP_POSE,
		DEATH_DEFEATED_HOLD_POSE,
	]) {
		assert.ok((pose.leftElbow?.rotation?.x ?? 0) > 0)
		assert.ok((pose.rightElbow?.rotation?.x ?? 0) > 0)
		assert.ok((pose.leftShoulder?.rotation?.x ?? 0) > 0)
		assert.ok((pose.rightShoulder?.rotation?.x ?? 0) > 0)
		assert.ok((pose.leftShoulder?.rotation?.z ?? 0) < -1.7)
		assert.ok((pose.rightShoulder?.rotation?.z ?? 0) > 1.7)
	}

	const prone = sampleDeathAnimationPose(
		DEATH_ANIMATION_TIMELINE.find(({ id }) => id === "final-prone")
			?.atSeconds ?? 0,
	)
	assert.ok((prone.root?.rotation?.x ?? 0) < -1.4)
	assert.ok((prone.root?.position?.z ?? 0) > 0.4)
	assert.ok((prone.leftShoulder?.rotation?.z ?? 0) < -2)
	assert.ok((prone.rightShoulder?.rotation?.z ?? 0) > 2)
})

test("death pose holds after the authored sequence", () => {
	const held = sampleDeathAnimationPose(DEATH_ANIMATION_DURATION_SECONDS + 4)
	assert.deepEqual(
		held,
		sampleDeathAnimationPose(DEATH_ANIMATION_DURATION_SECONDS),
	)
	const layer = deathAnimationLayer(DEATH_ANIMATION_DURATION_SECONDS)
	assert.equal(layer.id, "lifecycle:death")
	assert.equal(layer.mode, "override")
})
