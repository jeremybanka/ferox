import { describe, expect, test } from "vitest"

import {
	isVampHealthPickupSnapshot,
	isVampTriggerIntent,
} from "./arena-protocol.ts"

describe("Vamp protocol", () => {
	test("accepts only exact monotonic-compatible trigger shapes", () => {
		expect(isVampTriggerIntent({ clientChainId: 1, type: "start" })).toBe(true)
		expect(isVampTriggerIntent({ clientChainId: 1, type: "release" })).toBe(
			true,
		)
		expect(isVampTriggerIntent({ clientChainId: -1, type: "start" })).toBe(
			false,
		)
		expect(
			isVampTriggerIntent({ clientChainId: 1, extra: true, type: "start" }),
		).toBe(false)
		expect(isVampTriggerIntent({ clientChainId: 1, type: "hit" })).toBe(false)
	})

	test("validates exact authoritative health pickup snapshots", () => {
		const pickup = {
			amount: 1,
			expiresAt: 12_000,
			id: 0,
			ownerId: "pilot",
			position: [1, 2, 3],
		}
		expect(isVampHealthPickupSnapshot(pickup)).toBe(true)
		expect(isVampHealthPickupSnapshot({ ...pickup, amount: 2 })).toBe(false)
		expect(isVampHealthPickupSnapshot({ ...pickup, id: -1 })).toBe(false)
		expect(isVampHealthPickupSnapshot({ ...pickup, extra: true })).toBe(false)
		expect(isVampHealthPickupSnapshot({ ...pickup, position: [1, 2] })).toBe(
			false,
		)
	})
})
