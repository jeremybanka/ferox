import { describe, expect, test } from "vitest"

import { pilotTorsoTargetFromRoot } from "./pilot-targeting.ts"
import {
	pilotSmartTargetCandidate,
	pilotSmartTargetCandidateFromRoot,
	sameSmartTarget,
	selectBestSmartTarget,
	stepSmartTargetLead,
	type SmartTargetCandidate,
} from "./smart-targeting.ts"

describe("smart target selection", () => {
	test("chooses the closest visible screen target across drones and pilots", () => {
		const candidates: SmartTargetCandidate[] = [
			{ position: [0, 0, 0], ref: { id: 4, kind: "drone" } },
			{ position: [0, 0, 0], ref: { id: "enemy", kind: "pilot" } },
		]
		const selected = selectBestSmartTarget(candidates, (candidate) => ({
			distance: candidate.ref.kind === "pilot" ? 8 : 14,
			x: candidate.ref.kind === "pilot" ? 0.52 : 0.56,
			y: 0.48,
		}))
		expect(selected).toEqual({
			distance: 8,
			ref: { id: "enemy", kind: "pilot" },
			x: 0.52,
			y: 0.48,
		})
	})

	test("preserves drone selection when it is the nearest visible candidate", () => {
		const candidates: SmartTargetCandidate[] = [
			{ position: [0, 0, 0], ref: { id: 7, kind: "drone" } },
			{ position: [0, 0, 0], ref: { id: "enemy", kind: "pilot" } },
		]
		const selected = selectBestSmartTarget(candidates, (candidate) => ({
			distance: candidate.ref.kind === "drone" ? 3 : 20,
			x: 0.5,
			y: 0.5,
		}))
		expect(selected?.ref).toEqual({ id: 7, kind: "drone" })
	})

	test("never creates a pilot candidate for the local player", () => {
		expect(pilotSmartTargetCandidate("self", "self", [1, 2, 3])).toBeNull()
		expect(pilotSmartTargetCandidate("self", "other", [1, 2, 3])).toEqual({
			position: [1, 2, 3],
			ref: { id: "other", kind: "pilot" },
		})
	})

	test.each([false, true])(
		"projects the exact shared torso target for crouching=%s",
		(crouching) => {
			const root: [number, number, number] = [1, 2, 3]
			expect(
				pilotSmartTargetCandidateFromRoot("self", "other", root, crouching),
			).toEqual({
				position: pilotTorsoTargetFromRoot(root, crouching),
				ref: { id: "other", kind: "pilot" },
			})
			expect(
				pilotSmartTargetCandidateFromRoot("self", "self", root, crouching),
			).toBeNull()
		},
	)

	test("compares discriminated IDs without colliding drone and pilot keys", () => {
		expect(
			sameSmartTarget({ id: 1, kind: "drone" }, { id: "1", kind: "pilot" }),
		).toBe(false)
	})
})

describe("smart target camera lead", () => {
	const tuning = {
		damping: 11.5,
		deadZone: 0.1,
		drive: 2.5,
		maxOffset: 0.055,
		maxStepSeconds: 1 / 240,
		spring: 64,
	}
	const initial = () => ({ velocityX: 0, velocityY: 0, x: 0, y: 0 })
	const advance = (
		duration: number,
		delta: number,
		angularVelocity: { x: number; y: number },
		start = initial(),
		active = true,
	) => {
		let state = start
		for (
			let elapsed = 0;
			elapsed < duration - Number.EPSILON;
			elapsed += delta
		) {
			state = stepSmartTargetLead(
				state,
				angularVelocity,
				Math.min(delta, duration - elapsed),
				tuning,
				active,
			)
		}
		return state
	}

	test("camera motion drives and sustains a readable directional offset", () => {
		const moving = advance(0.25, 1 / 60, { x: 2.4, y: -1.6 })
		expect(moving.x).toBeGreaterThan(0.025)
		expect(moving.y).toBeLessThan(-0.015)
		const sustained = advance(0.75, 1 / 60, { x: 2.4, y: -1.6 }, moving)
		expect(sustained.x).toBeGreaterThan(0.035)
		expect(sustained.x).toBeLessThanOrEqual(tuning.maxOffset)
		expect(sustained.y).toBeLessThan(-0.025)
	})

	test("clamps extreme drive without retaining outward velocity", () => {
		const clamped = advance(0.4, 1 / 30, { x: 100, y: -100 })
		expect(clamped.x).toBe(tuning.maxOffset)
		expect(clamped.y).toBe(-tuning.maxOffset)
		expect(clamped.velocityX).toBe(0)
		expect(clamped.velocityY).toBe(0)
	})

	test("ignores angular jitter inside the named dead zone", () => {
		expect(
			stepSmartTargetLead(initial(), { x: 0.09, y: -0.09 }, 1, tuning),
		).toEqual(initial())
	})

	test("is frame-rate independent across common and stalled frame deltas", () => {
		const at120 = advance(0.6, 1 / 120, { x: 2, y: 1 })
		const at60 = advance(0.6, 1 / 60, { x: 2, y: 1 })
		const at30 = advance(0.6, 1 / 30, { x: 2, y: 1 })
		const stalled = advance(0.6, 0.2, { x: 2, y: 1 })
		for (const state of [at60, at30, stalled]) {
			expect(state.x).toBeCloseTo(at120.x, 4)
			expect(state.y).toBeCloseTo(at120.y, 4)
			expect(state.velocityX).toBeCloseTo(at120.velocityX, 3)
		}
	})

	test("stopping produces a gentle elastic return without stale jitter", () => {
		const driven = advance(0.7, 1 / 60, { x: 2.2, y: 0 })
		let returned = driven
		let minimum = driven.x
		for (let index = 0; index < 90; index += 1) {
			returned = stepSmartTargetLead(returned, { x: 0, y: 0 }, 1 / 60, tuning)
			minimum = Math.min(minimum, returned.x)
		}
		expect(minimum).toBeLessThan(0)
		expect(minimum).toBeGreaterThan(-0.004)
		expect(Math.abs(returned.x)).toBeLessThan(0.000_02)
		expect(Math.abs(returned.velocityX)).toBeLessThan(0.000_2)
	})

	test("inactive lead decays under the same spring with input ignored", () => {
		const driven = advance(0.4, 1 / 60, { x: 2, y: -1 })
		const decayed = advance(0.5, 1 / 60, { x: 100, y: 100 }, driven, false)
		expect(Math.abs(decayed.x)).toBeLessThan(Math.abs(driven.x) * 0.1)
		expect(Math.abs(decayed.y)).toBeLessThan(Math.abs(driven.y) * 0.1)
	})
})
