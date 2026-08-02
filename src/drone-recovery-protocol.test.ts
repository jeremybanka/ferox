import { describe, expect, test } from "vitest"

import {
	isDroneRecoveryIntent,
	isGrenadeSelectionIntent,
} from "./arena-protocol.ts"

describe("drone recovery protocol", () => {
	test("rejects malformed high-ID recovery actions before replay handling", () => {
		expect(isDroneRecoveryIntent({ clientActionId: 999, wreckId: "bad" })).toBe(
			false,
		)
		expect(isDroneRecoveryIntent({ clientActionId: 999 })).toBe(false)
		expect(
			isDroneRecoveryIntent({ clientActionId: 999, extra: true, wreckId: 1 }),
		).toBe(false)
		expect(isDroneRecoveryIntent({ clientActionId: 2, wreckId: 1 })).toBe(true)
	})

	test("requires an exact non-negative grenade-selection shape", () => {
		expect(isGrenadeSelectionIntent({ clientActionId: 3 })).toBe(true)
		expect(isGrenadeSelectionIntent({ clientActionId: -1 })).toBe(false)
		expect(isGrenadeSelectionIntent({ clientActionId: 3, wreckId: 1 })).toBe(
			false,
		)
	})
})
