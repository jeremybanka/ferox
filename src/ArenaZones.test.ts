import { describe, expect, test } from "vitest"

import {
	arenaGravityScaleAtStepStart,
	pointInsideZeroGravityZone,
	ZERO_GRAVITY_ZONE,
	zeroGravityAffectsBody,
} from "./ArenaZones.ts"

describe("zero-gravity arena zone", () => {
	test("uses one deterministic inclusive spherical boundary", () => {
		const [x, y, z] = ZERO_GRAVITY_ZONE.center
		expect(pointInsideZeroGravityZone([x, y, z])).toBe(true)
		expect(
			pointInsideZeroGravityZone([x + ZERO_GRAVITY_ZONE.radius, y, z]),
		).toBe(true)
		expect(
			pointInsideZeroGravityZone([x + ZERO_GRAVITY_ZONE.radius + 1e-6, y, z]),
		).toBe(false)
	})

	test("documents every existing gravity-body policy", () => {
		for (const affected of [
			"pilot",
			"grenade",
			"falling-mini-missile",
			"rail-ballistic",
		] as const)
			expect(zeroGravityAffectsBody(affected)).toBe(true)
		for (const unaffected of [
			"drone",
			"powered-mini-missile",
			"projectile",
			"ragdoll",
		] as const)
			expect(zeroGravityAffectsBody(unaffected)).toBe(false)
	})

	test("samples high-speed crossings at step start without changing inertia", () => {
		const [x, y, z] = ZERO_GRAVITY_ZONE.center
		const entryVelocity = 80
		const delta = 0.1
		const outside = [x - ZERO_GRAVITY_ZONE.radius - 1, y, z] as const
		const inside = [outside[0] + entryVelocity * delta, y, z] as const

		expect(arenaGravityScaleAtStepStart("pilot", outside)).toBe(1)
		expect(pointInsideZeroGravityZone(inside)).toBe(true)
		expect(arenaGravityScaleAtStepStart("pilot", inside)).toBe(0)
		expect(entryVelocity).toBe(80)
	})
})
