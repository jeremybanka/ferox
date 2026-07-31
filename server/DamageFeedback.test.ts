import { describe, expect, test, vi } from "vitest"

import type { PlayerDamageSnapshot } from "../src/arena-protocol.ts"
import {
	addDamageFlinch,
	BoundedDamageEffects,
	createDamageParticlePlan,
	damageFlinchAnimationLayer,
	DAMAGE_EFFECT_LIFETIME_SECONDS,
	DAMAGE_ELECTRIC_PARTICLE_COUNT,
	DAMAGE_FEEDBACK_MAX_EVENT_AGE_SECONDS,
	DAMAGE_FLINCH_KICK_SECONDS,
	DAMAGE_FLINCH_MAX_IMPULSE,
	DAMAGE_FLINCH_RECOVERY_SECONDS,
	DAMAGE_SPLATTER_PARTICLE_COUNT,
	initialDamageFeedbackTracker,
	initialDamageFlinchState,
	observeDamageFeedback,
	stepDamageFlinch,
	type DamageEffectHandle,
} from "../src/pilot/DamageFeedback.ts"

function damageEvent(
	sequence: number,
	overrides: Partial<PlayerDamageSnapshot> = {},
): PlayerDamageSnapshot {
	return {
		damage: 20,
		direction: [0.4, 0, -1],
		fatal: false,
		playerId: "victim",
		position: [3, 2, -4],
		sequence,
		serverTime: 10,
		...overrides,
	}
}

describe("authoritative damage feedback", () => {
	test("accepts each sequence once and rejects duplicates", () => {
		const first = observeDamageFeedback(
			initialDamageFeedbackTracker(),
			damageEvent(1),
			10.02,
		)
		expect(first.accepted).toBe(true)
		expect(first.tracker.sequence).toBe(1)
		expect(first.tracker.state.intensity).toBeGreaterThan(0)

		const duplicate = observeDamageFeedback(
			first.tracker,
			damageEvent(1),
			10.03,
		)
		expect(duplicate.accepted).toBe(false)
		expect(duplicate.tracker).toBe(first.tracker)
	})

	test("advances past stale events without replaying their feedback", () => {
		const stale = observeDamageFeedback(
			initialDamageFeedbackTracker(3),
			damageEvent(4),
			10 + DAMAGE_FEEDBACK_MAX_EVENT_AGE_SECONDS + 0.001,
		)
		expect(stale.accepted).toBe(false)
		expect(stale.tracker).toEqual(initialDamageFeedbackTracker(4))
	})

	test("repeated damage retriggers, caps, and decays to rest", () => {
		let state = addDamageFlinch(initialDamageFlinchState())
		state = stepDamageFlinch(
			state,
			DAMAGE_FLINCH_KICK_SECONDS + DAMAGE_FLINCH_RECOVERY_SECONDS / 3,
		)
		const decayed = state.intensity
		state = addDamageFlinch(state, 3)
		expect(state.intensity).toBeGreaterThan(decayed)
		expect(state.intensity).toBe(DAMAGE_FLINCH_MAX_IMPULSE)

		state = stepDamageFlinch(
			state,
			DAMAGE_FLINCH_KICK_SECONDS +
				DAMAGE_FLINCH_RECOVERY_SECONDS * DAMAGE_FLINCH_MAX_IMPULSE,
		)
		expect(state).toEqual(initialDamageFlinchState())
	})

	test("authors a subtle additive directional flinch layer", () => {
		const layer = damageFlinchAnimationLayer(1, [0.6, 0, -1])
		expect(layer.mode).toBe("additive")
		expect(Math.abs(layer.pose.body?.rotation?.z ?? 0)).toBeLessThanOrEqual(0.1)
		expect(layer.pose.head?.rotation?.z).not.toBe(0)
	})
})

describe("damage particle planning and cleanup", () => {
	test("creates deterministic bounded electric and splatter plans", () => {
		const first = createDamageParticlePlan(7, [0.4, 0, -1])
		const second = createDamageParticlePlan(7, [0.4, 0, -1])
		expect(first).toEqual(second)
		expect(first.electric).toHaveLength(DAMAGE_ELECTRIC_PARTICLE_COUNT)
		expect(first.splatter).toHaveLength(DAMAGE_SPLATTER_PARTICLE_COUNT)
		for (const particle of [...first.electric, ...first.splatter]) {
			expect(particle.lifetime).toBeGreaterThan(0)
			expect(particle.lifetime).toBeLessThanOrEqual(
				DAMAGE_EFFECT_LIFETIME_SECONDS,
			)
			expect(particle.velocity.every(Number.isFinite)).toBe(true)
		}
	})

	test("evicts over-budget effects and disposes expiry, removal, and clear", () => {
		const makeEffect = () => {
			let active = true
			return {
				dispose: vi.fn(() => undefined),
				expire: () => {
					active = false
				},
				update: vi.fn((_deltaSeconds: number) => active),
			} satisfies DamageEffectHandle & { expire: () => void }
		}
		const registry = new BoundedDamageEffects<ReturnType<typeof makeEffect>>(2)
		const first = makeEffect()
		const second = makeEffect()
		const third = makeEffect()
		registry.add(first)
		registry.add(second)
		registry.add(third)
		expect(registry.size).toBe(2)
		expect(first.dispose).toHaveBeenCalledOnce()

		third.expire()
		registry.update(0.1)
		expect(third.dispose).toHaveBeenCalledOnce()
		expect(registry.size).toBe(1)

		registry.remove((effect) => effect === second)
		expect(second.dispose).toHaveBeenCalledOnce()
		expect(registry.size).toBe(0)

		const final = makeEffect()
		registry.add(final)
		registry.clear()
		expect(final.dispose).toHaveBeenCalledOnce()
		expect(registry.size).toBe(0)
	})
})
