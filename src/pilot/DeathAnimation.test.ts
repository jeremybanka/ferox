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
	DEATH_BOTH_KNEES_HOLD_POSE,
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
	["knees-hold", "both knees hold"],
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
		DEATH_BOTH_KNEES_HOLD_POSE,
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

test("death cadence sways, holds on both knees, then flows through an accelerating fall", () => {
	const phase = (id: (typeof DEATH_ANIMATION_TIMELINE)[number]["id"]) =>
		DEATH_ANIMATION_TIMELINE.find((candidate) => candidate.id === id)!
	const shuffleRight = phase("shuffle-right")
	const kneeDrop = phase("knee-drop")
	const kneesHold = phase("knees-hold")
	const forwardFall = phase("forward-fall")
	const finalProne = phase("final-prone")
	const preKneeSeconds = kneeDrop.atSeconds - shuffleRight.atSeconds
	const kneeHoldSeconds = kneesHold.atSeconds - kneeDrop.atSeconds
	const holdToFallSeconds = forwardFall.atSeconds - kneesHold.atSeconds
	const fallToProneSeconds = finalProne.atSeconds - forwardFall.atSeconds

	assert.equal(shuffleRight.atSeconds, 0.5)
	assert.equal(kneeDrop.atSeconds, 0.6)
	assert.equal(kneesHold.atSeconds, 0.72)
	assert.ok(Math.abs(preKneeSeconds - 0.1) < 1e-9)
	assert.ok(Math.abs(kneeHoldSeconds - 0.12) < 1e-9)
	assert.ok(fallToProneSeconds < holdToFallSeconds)
	assert.equal(kneeDrop.easingFromPrevious, "smoothstep")
	assert.equal(kneesHold.easingFromPrevious, "linear")
	assert.equal(forwardFall.easingFromPrevious, "linear")
	assert.equal(finalProne.easingFromPrevious, "linear")
	assert.ok(
		(DEATH_BOTH_KNEES_DROP_POSE.root?.position?.z ?? 0) >
			(DEATH_FORWARD_FALL_ARMS_UP_POSE.root?.position?.z ?? 0),
	)
	assert.ok(
		(DEATH_FORWARD_FALL_ARMS_UP_POSE.root?.position?.z ?? 0) >
			(DEATH_FINAL_PRONE_ARMS_UP_POSE.root?.position?.z ?? 0),
	)

	const sampleRootPitch = (atSeconds: number) =>
		sampleDeathAnimationPose(atSeconds).root?.rotation?.x ?? 0
	const epsilon = 0.01
	const kneePitch = sampleRootPitch(kneeDrop.atSeconds)
	const fallPitch = sampleRootPitch(forwardFall.atSeconds)
	assert.ok(
		Math.abs(sampleRootPitch(kneeDrop.atSeconds + epsilon) - kneePitch) < 1e-9,
	)
	assert.ok(
		Math.abs(sampleRootPitch(kneesHold.atSeconds - epsilon) - kneePitch) < 1e-9,
	)
	assert.ok(
		Math.abs(sampleRootPitch(kneesHold.atSeconds + epsilon) - kneePitch) > 0.01,
	)
	assert.ok(
		Math.abs(fallPitch - sampleRootPitch(forwardFall.atSeconds - epsilon)) >
			0.01,
	)
	assert.ok(
		Math.abs(sampleRootPitch(forwardFall.atSeconds + epsilon) - fallPitch) >
			0.01,
	)

	const dominantJoints = [
		"root",
		"hips",
		"body",
		"neck",
		"head",
		"leftShoulder",
		"leftArm",
		"leftElbow",
		"rightShoulder",
		"rightArm",
		"rightElbow",
		"leftLeg",
		"leftKnee",
		"rightLeg",
		"rightKnee",
	] as const
	const visualVector = (atSeconds: number) => {
		const pose = sampleDeathAnimationPose(atSeconds)
		return dominantJoints.flatMap((joint) =>
			(["position", "rotation"] as const).flatMap((kind) =>
				(["x", "y", "z"] as const).map(
					(axis) => pose[joint]?.[kind]?.[axis] ?? 0,
				),
			),
		)
	}
	const visualMotion = (fromSeconds: number, toSeconds: number) => {
		const from = visualVector(fromSeconds)
		const to = visualVector(toSeconds)
		return Math.hypot(...to.map((value, index) => value - from[index]!))
	}
	assert.ok(
		visualMotion(kneeDrop.atSeconds + epsilon, kneesHold.atSeconds - epsilon) <
			1e-9,
	)
	assert.ok(
		visualMotion(kneesHold.atSeconds, kneesHold.atSeconds + epsilon) / epsilon >
			4,
	)
	const arrivingMotion = visualMotion(
		forwardFall.atSeconds - epsilon,
		forwardFall.atSeconds,
	)
	const departingMotion = visualMotion(
		forwardFall.atSeconds,
		forwardFall.atSeconds + epsilon,
	)
	const motionRatio =
		Math.min(arrivingMotion, departingMotion) /
		Math.max(arrivingMotion, departingMotion)
	assert.ok(arrivingMotion / epsilon > 4)
	assert.ok(departingMotion / epsilon > 4)
	assert.ok(motionRatio > 0.9)
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
