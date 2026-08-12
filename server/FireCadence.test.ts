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

	test("enforces shotgun volley cadence from one trigger event", () => {
		const interval = gunDefinition("shotgun").fire.serverMinimumIntervalMs
		expect(interval).toBe(720)
		expect(isFireCadenceReady(undefined, 5_000, interval)).toBe(true)
		expect(isFireCadenceReady(5_000, 5_719, interval)).toBe(false)
		expect(isFireCadenceReady(5_000, 5_720, interval)).toBe(true)
	})

	test("enforces the faster rail semi-auto release cadence", () => {
		const rail = gunDefinition("rail-gun").fire
		expect(rail.serverMinimumIntervalMs).toBe(450)
		expect(rail.clientCooldownSeconds).toBe(0.45)
		expect(isFireCadenceReady(undefined, 8_000, 450)).toBe(true)
		expect(isFireCadenceReady(8_000, 8_449, 450)).toBe(false)
		expect(isFireCadenceReady(8_000, 8_450, 450)).toBe(true)
	})
})
