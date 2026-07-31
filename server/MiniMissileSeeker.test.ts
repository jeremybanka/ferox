import assert from "node:assert/strict"

import { test } from "vitest"

import { isMiniMissileTargetRef } from "../src/arena-protocol.ts"
import {
	MINI_MISSILE_SEEKER_HALF_ANGLE,
	MINI_MISSILE_SEEKER_RANGE,
} from "../src/game-constants.ts"
import {
	selectMiniMissileSeekerTarget,
	validateMiniMissileDesignation,
	type MiniMissileSeekerCandidate,
} from "./MiniMissileSeeker.ts"

test("mini-missile target refs accept only strict pilot and drone identities", () => {
	assert.equal(isMiniMissileTargetRef({ id: "pilot-a", kind: "pilot" }), true)
	assert.equal(isMiniMissileTargetRef({ id: 4, kind: "drone" }), true)
	assert.equal(isMiniMissileTargetRef({ id: "", kind: "pilot" }), false)
	assert.equal(isMiniMissileTargetRef({ id: -1, kind: "drone" }), false)
	assert.equal(isMiniMissileTargetRef({ id: "4", kind: "drone" }), false)
	assert.equal(
		isMiniMissileTargetRef({ extra: true, id: "pilot-a", kind: "pilot" }),
		false,
	)
})

test("launch designation validation accepts either authoritative target kind", () => {
	const candidates: MiniMissileSeekerCandidate[] = [
		{ position: [3, 0, -12], ref: { id: "pilot-a", kind: "pilot" } },
		{ position: [-3, 0, -12], ref: { id: 9, kind: "drone" } },
	]

	assert.deepEqual(
		validateMiniMissileDesignation(
			{ id: "pilot-a", kind: "pilot" },
			[0, 0, 0],
			[0, 0, -1],
			candidates,
		)?.ref,
		{ id: "pilot-a", kind: "pilot" },
	)
	assert.deepEqual(
		validateMiniMissileDesignation(
			{ id: 9, kind: "drone" },
			[0, 0, 0],
			[0, 0, -1],
			candidates,
		)?.ref,
		{ id: 9, kind: "drone" },
	)
})

test("designation validation rejects spoofed, rearward, and out-of-range targets", () => {
	const candidates: MiniMissileSeekerCandidate[] = [
		{ position: [0, 0, 8], ref: { id: "rear", kind: "pilot" } },
		{
			position: [0, 0, -(MINI_MISSILE_SEEKER_RANGE + 0.01)],
			ref: { id: 7, kind: "drone" },
		},
	]

	for (const ref of [
		{ id: "missing", kind: "pilot" } as const,
		{ id: "rear", kind: "pilot" } as const,
		{ id: 7, kind: "drone" } as const,
	]) {
		assert.equal(
			validateMiniMissileDesignation(ref, [0, 0, 0], [0, 0, -1], candidates),
			null,
		)
	}
})

test("seeker orders candidates by alignment, then distance, then stable ID", () => {
	const origin: [number, number, number] = [0, 0, 0]
	const direction: [number, number, number] = [0, 0, -1]
	const alignedCandidates: MiniMissileSeekerCandidate[] = [
		{ position: [2, 0, -20], ref: { id: "closer", kind: "pilot" } },
		{ position: [0, 0, -30], ref: { id: "aligned", kind: "pilot" } },
	]
	assert.equal(
		selectMiniMissileSeekerTarget(origin, direction, alignedCandidates)?.ref.id,
		"aligned",
	)

	const distanceCandidates: MiniMissileSeekerCandidate[] = [
		{ position: [0, 0, -18], ref: { id: "far", kind: "pilot" } },
		{ position: [0, 0, -12], ref: { id: "near", kind: "pilot" } },
	]
	assert.equal(
		selectMiniMissileSeekerTarget(origin, direction, distanceCandidates)?.ref
			.id,
		"near",
	)

	const tiedCandidates: MiniMissileSeekerCandidate[] = [
		{ position: [0, 0, -12], ref: { id: "zeta", kind: "pilot" } },
		{ position: [0, 0, -12], ref: { id: 3, kind: "drone" } },
		{ position: [0, 0, -12], ref: { id: 2, kind: "drone" } },
	]
	assert.deepEqual(
		selectMiniMissileSeekerTarget(origin, direction, tiedCandidates)?.ref,
		{ id: 2, kind: "drone" },
	)
})

test("seeker excludes candidates behind or outside its forward cone", () => {
	const justOutsideAngle = MINI_MISSILE_SEEKER_HALF_ANGLE + 0.01
	const candidates: MiniMissileSeekerCandidate[] = [
		{ position: [0, 0, 10], ref: { id: "rear", kind: "pilot" } },
		{
			position: [
				Math.sin(justOutsideAngle) * 10,
				0,
				-Math.cos(justOutsideAngle) * 10,
			],
			ref: { id: 4, kind: "drone" },
		},
	]

	assert.equal(
		selectMiniMissileSeekerTarget([0, 0, 0], [0, 0, -1], candidates),
		null,
	)
})
