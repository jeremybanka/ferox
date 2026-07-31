import * as THREE from "three"
import { expect, test } from "vitest"

import {
	RECOIL_BASELINE_SPREAD_RADIANS,
	RECOIL_MAX_SPREAD_RADIANS,
} from "../src/game-constants.ts"
import {
	addRecoilShot,
	initialRecoilSpreadState,
	normalizedRecoilSpread,
	recoverRecoilSpread,
	spreadDirection,
} from "../src/RecoilSpread.ts"

test("recoil accumulates to its cap and normalizes for the HUD", () => {
	let state = initialRecoilSpreadState()
	for (let shot = 0; shot < 100; shot += 1) state = addRecoilShot(state)

	expect(state.spreadRadians).toBe(RECOIL_MAX_SPREAD_RADIANS)
	expect(normalizedRecoilSpread(state)).toBe(1)
})

test("recoil waits briefly, then recovers to baseline", () => {
	const fired = addRecoilShot(initialRecoilSpreadState())
	const delayed = recoverRecoilSpread(fired, 0.08)
	expect(delayed.spreadRadians).toBe(fired.spreadRadians)

	const recovered = recoverRecoilSpread(delayed, 2)
	expect(recovered.spreadRadians).toBe(RECOIL_BASELINE_SPREAD_RADIANS)
	expect(normalizedRecoilSpread(recovered)).toBe(0)
})

test("spread uses deterministic samples and remains inside its cone", () => {
	const base = new THREE.Vector3(0, 0, -1)
	const samples = [1, 0.25]
	const direction = spreadDirection(
		base,
		RECOIL_MAX_SPREAD_RADIANS,
		() => samples.shift() ?? 0,
	)
	const angle = base.angleTo(direction)

	expect(angle).toBeGreaterThan(0)
	expect(angle).toBeLessThanOrEqual(RECOIL_MAX_SPREAD_RADIANS + Number.EPSILON)
	expect(Math.abs(direction.length() - 1)).toBeLessThan(Number.EPSILON * 10)
})
