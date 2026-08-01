import assert from "node:assert/strict"
import { test } from "vitest"

import { PLAYER_RESPAWN_DELAY_MS } from "../game-constants.ts"
import {
	DEATH_ANIMATION_MARKERS,
	DEATH_ANIMATION_TIMELINE,
	DEATH_BACKWARD_SHUFFLE_LEFT_POSE,
	DEATH_BACKWARD_SHUFFLE_RIGHT_POSE,
	DEATH_BOTH_KNEES_DROP_POSE,
	DEATH_BOTH_KNEES_HOLD_POSE,
	DEATH_FORWARD_FALL_ARMS_UP_POSE,
	DEATH_IMPACT_UPRIGHT_POSE,
	DEATH_PRESENTATION_DURATION_SECONDS,
	DEATH_RAGDOLL_HANDOFF_SECONDS,
	DEATH_RAGDOLL_MOMENTUM_GUIDE_POSE,
	deathAnimationLayer,
	deathAnimationPhase,
	sampleDeathAnimationPose,
} from "./DeathAnimation.ts"
import type { PilotPose } from "./PilotAnimation.ts"

const EXPECTED_PHASES = [
	["impact", "impact upright"],
	["shuffle-left", "backward shuffle left"],
	["shuffle-right", "backward shuffle right"],
	["knee-drop", "both knees drop"],
	["knees-hold", "both knees hold"],
	["forward-fall", "forward fall arms up"],
] as const

function authoredPose(atSeconds: number): PilotPose {
	const pose = sampleDeathAnimationPose(atSeconds)
	assert.ok(pose)
	return pose
}

test("one named timeline drives the authored death cadence and ragdoll handoff", () => {
	assert.deepEqual(
		DEATH_ANIMATION_TIMELINE.map(({ id, poseName }) => [id, poseName]),
		EXPECTED_PHASES,
	)
	assert.equal(
		DEATH_RAGDOLL_HANDOFF_SECONDS,
		DEATH_ANIMATION_TIMELINE.at(-1)?.atSeconds,
	)
	assert.equal(
		DEATH_PRESENTATION_DURATION_SECONDS,
		PLAYER_RESPAWN_DELAY_MS / 1_000,
	)
	assert.ok(DEATH_RAGDOLL_HANDOFF_SECONDS < DEATH_PRESENTATION_DURATION_SECONDS)
	assert.deepEqual(
		DEATH_ANIMATION_MARKERS,
		DEATH_ANIMATION_TIMELINE.map(({ atSeconds, id, label }) => ({
			id,
			label,
			progress: atSeconds / DEATH_PRESENTATION_DURATION_SECONDS,
		})),
	)
	const namedPoses = [
		DEATH_IMPACT_UPRIGHT_POSE,
		DEATH_BACKWARD_SHUFFLE_LEFT_POSE,
		DEATH_BACKWARD_SHUFFLE_RIGHT_POSE,
		DEATH_BOTH_KNEES_DROP_POSE,
		DEATH_BOTH_KNEES_HOLD_POSE,
		DEATH_FORWARD_FALL_ARMS_UP_POSE,
	]
	for (const [index, phase] of DEATH_ANIMATION_TIMELINE.entries()) {
		assert.strictEqual(phase.pose, namedPoses[index])
		assert.equal(
			deathAnimationPhase(
				phase.atSeconds / DEATH_PRESENTATION_DURATION_SECONDS,
			),
			phase.id,
		)
	}
})

test("death cadence sways, holds on both knees, then reaches handoff at speed", () => {
	const phase = (id: (typeof DEATH_ANIMATION_TIMELINE)[number]["id"]) =>
		DEATH_ANIMATION_TIMELINE.find((candidate) => candidate.id === id)!
	const shuffleRight = phase("shuffle-right")
	const kneeDrop = phase("knee-drop")
	const kneesHold = phase("knees-hold")
	const forwardFall = phase("forward-fall")
	const preKneeSeconds = kneeDrop.atSeconds - shuffleRight.atSeconds
	const kneeHoldSeconds = kneesHold.atSeconds - kneeDrop.atSeconds
	const holdToFallSeconds = forwardFall.atSeconds - kneesHold.atSeconds

	assert.equal(shuffleRight.atSeconds, 0.5)
	assert.equal(kneeDrop.atSeconds, 0.6)
	assert.equal(kneesHold.atSeconds, 0.72)
	assert.equal(forwardFall.atSeconds, 1)
	assert.ok(Math.abs(preKneeSeconds - 0.1) < 1e-9)
	assert.ok(Math.abs(kneeHoldSeconds - 0.12) < 1e-9)
	assert.equal(holdToFallSeconds, 0.28)
	assert.equal(kneeDrop.easingFromPrevious, "smoothstep")
	assert.equal(kneesHold.easingFromPrevious, "linear")
	assert.equal(forwardFall.easingFromPrevious, "linear")

	const sampleRootPitch = (atSeconds: number) =>
		authoredPose(atSeconds).root?.rotation?.x ?? 0
	const epsilon = 0.01
	const kneePitch = sampleRootPitch(kneeDrop.atSeconds)
	assert.ok(
		Math.abs(sampleRootPitch(kneeDrop.atSeconds + epsilon) - kneePitch) < 1e-9,
	)
	assert.ok(
		Math.abs(sampleRootPitch(kneesHold.atSeconds - epsilon) - kneePitch) < 1e-9,
	)
	assert.ok(
		Math.abs(sampleRootPitch(kneesHold.atSeconds + epsilon) - kneePitch) > 0.01,
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
		const pose = authoredPose(atSeconds)
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
	const approachingMotion = visualMotion(
		forwardFall.atSeconds - epsilon * 2,
		forwardFall.atSeconds - epsilon,
	)
	const arrivingMotion = visualMotion(
		forwardFall.atSeconds - epsilon,
		forwardFall.atSeconds,
	)
	assert.ok(approachingMotion / epsilon > 4)
	assert.ok(arrivingMotion / epsilon > 4)
	assert.ok(arrivingMotion / approachingMotion > 0.8)
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

	const knees = authoredPose(
		DEATH_ANIMATION_TIMELINE.find(({ id }) => id === "knee-drop")?.atSeconds ??
			0,
	)
	assert.equal(knees.root?.position?.y, 0)
	assert.ok((knees.leftLeg?.rotation?.x ?? 0) > 0.7)
	assert.ok((knees.rightLeg?.rotation?.x ?? 0) > 0.7)
	assert.ok((knees.leftKnee?.rotation?.x ?? 0) < -1.5)
	assert.ok((knees.rightKnee?.rotation?.x ?? 0) < -1.5)
})

test("forward fall flexes elbows naturally and carries momentum into ragdoll", () => {
	const pose = DEATH_FORWARD_FALL_ARMS_UP_POSE
	assert.ok((pose.leftElbow?.rotation?.x ?? 0) > 0)
	assert.ok((pose.rightElbow?.rotation?.x ?? 0) > 0)
	assert.ok((pose.leftShoulder?.rotation?.x ?? 0) > 0)
	assert.ok((pose.rightShoulder?.rotation?.x ?? 0) > 0)
	assert.ok((pose.leftShoulder?.rotation?.z ?? 0) < -1.7)
	assert.ok((pose.rightShoulder?.rotation?.z ?? 0) > 1.7)
	assert.ok(
		(DEATH_RAGDOLL_MOMENTUM_GUIDE_POSE.root?.rotation?.x ?? 0) <
			(pose.root?.rotation?.x ?? 0),
	)
})

test("authored animation ends exactly where presentation hands off to ragdoll", () => {
	const handoffPose = sampleDeathAnimationPose(DEATH_RAGDOLL_HANDOFF_SECONDS)
	assert.deepEqual(handoffPose, DEATH_FORWARD_FALL_ARMS_UP_POSE)
	assert.equal(
		sampleDeathAnimationPose(DEATH_RAGDOLL_HANDOFF_SECONDS + 0.000_001),
		null,
	)
	const layer = deathAnimationLayer(DEATH_RAGDOLL_HANDOFF_SECONDS)
	assert.ok(layer)
	assert.equal(layer.id, "lifecycle:death")
	assert.equal(layer.mode, "override")
	assert.equal(
		deathAnimationLayer(DEATH_RAGDOLL_HANDOFF_SECONDS + 0.000_001),
		null,
	)
	assert.equal(
		deathAnimationPhase(
			(DEATH_RAGDOLL_HANDOFF_SECONDS + 0.01) /
				DEATH_PRESENTATION_DURATION_SECONDS,
		),
		"ragdoll",
	)
})
