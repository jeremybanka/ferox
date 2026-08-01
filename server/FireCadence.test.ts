import { describe, expect, test } from "vitest"

import { gunDefinition } from "../src/guns/GunDefinitions.ts"
import { isFireCadenceReady } from "./FireCadence.ts"

describe("server fire cadence", () => {
	test("accepts the first mini missile and rejects rapid follow-up input", () => {
		const interval = gunDefinition("mini-missile").fire.serverMinimumIntervalMs
		expect(isFireCadenceReady(undefined, 1_000, interval)).toBe(true)
		expect(isFireCadenceReady(1_000, 1_000 + interval - 1, interval)).toBe(
			false,
		)
		expect(isFireCadenceReady(1_000, 1_000 + interval, interval)).toBe(true)
	})

	test("rejects invalid timing instead of weakening authority", () => {
		expect(isFireCadenceReady(0, Number.NaN, 150)).toBe(false)
		expect(isFireCadenceReady(0, 100, -1)).toBe(false)
	})
})
