import { describe, expect, test } from "vitest"

import { nextAcceptedRecoilSignal } from "../src/arena-protocol.ts"
import {
	addRemoteRecoilImpulse,
	initialRemoteRecoilState,
	initialRemoteRecoilTracker,
	observeRemoteRecoilEvent,
	recoilAnimationLayer,
	REMOTE_RECOIL_KICK_SECONDS,
	REMOTE_RECOIL_MAX_IMPULSE,
	REMOTE_RECOIL_RECOVERY_SECONDS,
	sampleRemoteRecoilIntensity,
	stepRemoteRecoil,
} from "../src/pilot/RecoilAnimation.ts"

describe("remote recoil signals", () => {
	test("advances only when the server accepts a shot", () => {
		expect(
			nextAcceptedRecoilSignal(
				{ recoilSequence: 17, recoilStartedAt: 12.5 },
				13.25,
			),
		).toEqual({ recoilSequence: 18, recoilStartedAt: 13.25 })
	})

	test("holds the near-instant kick before recovering", () => {
		const fired = addRemoteRecoilImpulse(initialRemoteRecoilState())
		const held = stepRemoteRecoil(fired, REMOTE_RECOIL_KICK_SECONDS / 2)
		expect(held.intensity).toBe(fired.intensity)

		const recovered = stepRemoteRecoil(
			held,
			REMOTE_RECOIL_KICK_SECONDS + REMOTE_RECOIL_RECOVERY_SECONDS,
		)
		expect(recovered).toEqual(initialRemoteRecoilState())
	})

	test("repeated accepted shots retrigger and cap the impulse", () => {
		let state = addRemoteRecoilImpulse(initialRemoteRecoilState())
		state = stepRemoteRecoil(
			state,
			REMOTE_RECOIL_KICK_SECONDS + REMOTE_RECOIL_RECOVERY_SECONDS / 4,
		)
		const decayedIntensity = state.intensity
		state = addRemoteRecoilImpulse(state, 4)

		expect(state.intensity).toBeGreaterThan(decayedIntensity)
		expect(state.intensity).toBe(REMOTE_RECOIL_MAX_IMPULSE)
		expect(state.recoveryDelay).toBe(REMOTE_RECOIL_KICK_SECONDS)
	})

	test("drops stale events and resets on a server sequence rollback", () => {
		const active = {
			sequence: 8,
			state: addRemoteRecoilImpulse(initialRemoteRecoilState()),
		}
		const stale = observeRemoteRecoilEvent(
			active,
			{ recoilSequence: 9, recoilStartedAt: 10 },
			11,
		)
		expect(stale).toEqual(initialRemoteRecoilTracker(9))

		const restarted = observeRemoteRecoilEvent(
			active,
			{ recoilSequence: 0, recoilStartedAt: 0 },
			11,
		)
		expect(restarted).toEqual(initialRemoteRecoilTracker())
	})

	test("the burst preview retriggers before settling to rest", () => {
		const firstKick = sampleRemoteRecoilIntensity(0.02, [0, 0.13, 0.26])
		const burstKick = sampleRemoteRecoilIntensity(0.28, [0, 0.13, 0.26])
		const settled = sampleRemoteRecoilIntensity(1, [0, 0.13, 0.26])

		expect(firstKick).toBeGreaterThan(0)
		expect(burstKick).toBeGreaterThan(firstKick)
		expect(settled).toBe(0)
	})

	test("authors recoil as an additive right-hand and weapon layer", () => {
		const layer = recoilAnimationLayer(1)

		expect(layer.mode).toBe("additive")
		expect(layer.pose.rightHand?.rotation?.z).toBeGreaterThan(0)
		expect(layer.pose.weapon?.position?.z).toBeGreaterThan(0)
		expect(layer.pose.weaponMount?.rotation?.x).toBeLessThan(0)
	})
})
