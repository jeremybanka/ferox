import { describe, expect, test } from "vitest"

import {
	pilotSmartTargetCandidate,
	sameSmartTarget,
	selectBestSmartTarget,
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

	test("compares discriminated IDs without colliding drone and pilot keys", () => {
		expect(
			sameSmartTarget({ id: 1, kind: "drone" }, { id: "1", kind: "pilot" }),
		).toBe(false)
	})
})
