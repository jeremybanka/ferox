import * as THREE from "three"

import type {
	PilotAnimationLayer,
	PilotPose,
	PoseInfluence,
} from "./PilotAnimation.ts"

export const REMOTE_RECOIL_IMPULSE = 0.72
export const REMOTE_RECOIL_MAX_IMPULSE = 1.8
export const REMOTE_RECOIL_KICK_SECONDS = 0.045
export const REMOTE_RECOIL_RECOVERY_SECONDS = 0.21
export const REMOTE_RECOIL_MAX_EVENT_AGE_SECONDS = 0.5
export const REMOTE_RECOIL_PREVIEW_CYCLE_SECONDS = 0.8
export const REMOTE_RECOIL_PREVIEW_SHOTS = [0, 0.13, 0.26] as const

export type RemoteRecoilState = {
	intensity: number
	recoveryDelay: number
}

export type RemoteRecoilTracker = {
	sequence: number
	state: RemoteRecoilState
}

export type RemoteRecoilEvent = {
	recoilSequence: number
	recoilStartedAt: number
}

const RECOIL_INFLUENCE = {
	rightElbow: 1,
	rightHand: 1,
	rightShoulder: 1,
	weapon: 1,
	weaponMount: 1,
} as const satisfies PoseInfluence

export function initialRemoteRecoilState(): RemoteRecoilState {
	return { intensity: 0, recoveryDelay: 0 }
}

export function initialRemoteRecoilTracker(sequence = 0): RemoteRecoilTracker {
	return {
		sequence: Number.isSafeInteger(sequence) ? sequence : 0,
		state: initialRemoteRecoilState(),
	}
}

export function addRemoteRecoilImpulse(
	state: RemoteRecoilState,
	acceptedShots = 1,
): RemoteRecoilState {
	if (acceptedShots <= 0) return state
	return {
		intensity: Math.min(
			REMOTE_RECOIL_MAX_IMPULSE,
			state.intensity + REMOTE_RECOIL_IMPULSE * acceptedShots,
		),
		recoveryDelay: REMOTE_RECOIL_KICK_SECONDS,
	}
}

export function stepRemoteRecoil(
	state: RemoteRecoilState,
	deltaSeconds: number,
): RemoteRecoilState {
	const elapsed = Math.max(0, deltaSeconds)
	if (elapsed === 0 || state.intensity === 0) return state
	if (state.recoveryDelay >= elapsed) {
		return { ...state, recoveryDelay: state.recoveryDelay - elapsed }
	}
	const recoveryElapsed = elapsed - state.recoveryDelay
	return {
		intensity: Math.max(
			0,
			state.intensity - recoveryElapsed / REMOTE_RECOIL_RECOVERY_SECONDS,
		),
		recoveryDelay: 0,
	}
}

export function observeRemoteRecoilEvent(
	tracker: RemoteRecoilTracker,
	event: RemoteRecoilEvent,
	observedAt: number,
): RemoteRecoilTracker {
	if (
		!Number.isSafeInteger(event.recoilSequence) ||
		!Number.isFinite(event.recoilStartedAt)
	) {
		return tracker
	}
	if (event.recoilSequence < tracker.sequence) {
		return initialRemoteRecoilTracker(event.recoilSequence)
	}
	if (event.recoilSequence === tracker.sequence) return tracker

	const acceptedShots = Math.min(4, event.recoilSequence - tracker.sequence)
	const eventAge = Math.max(0, observedAt - event.recoilStartedAt)
	return {
		sequence: event.recoilSequence,
		state:
			eventAge >= REMOTE_RECOIL_MAX_EVENT_AGE_SECONDS
				? initialRemoteRecoilState()
				: stepRemoteRecoil(
						addRemoteRecoilImpulse(tracker.state, acceptedShots),
						eventAge,
					),
	}
}

export function sampleRemoteRecoilIntensity(
	elapsedSeconds: number,
	shotTimes: readonly number[] = [0],
): number {
	let state = initialRemoteRecoilState()
	let cursor = 0
	for (const shotTime of shotTimes) {
		if (shotTime > elapsedSeconds) break
		state = stepRemoteRecoil(state, shotTime - cursor)
		state = addRemoteRecoilImpulse(state)
		cursor = shotTime
	}
	return stepRemoteRecoil(state, elapsedSeconds - cursor).intensity
}

export function sampleRecoilAnimationPose(intensity: number): PilotPose {
	const normalized = THREE.MathUtils.clamp(intensity, 0, 1)
	const amount = normalized * normalized * (3 - 2 * normalized)
	return {
		rightElbow: { rotation: { z: 0.05 * amount } },
		rightHand: { rotation: { z: 0.1 * amount } },
		rightShoulder: { rotation: { z: -0.035 * amount } },
		weapon: {
			position: { z: 0.13 * amount },
			rotation: { x: -0.08 * amount },
		},
		weaponMount: {
			position: { y: 0.035 * amount, z: 0.06 * amount },
			rotation: { x: -0.15 * amount },
		},
	}
}

export function recoilAnimationLayer(intensity: number): PilotAnimationLayer {
	return {
		fadeSeconds: 0,
		id: "combat:recoil",
		influence: RECOIL_INFLUENCE,
		mode: "additive",
		pose: sampleRecoilAnimationPose(intensity),
	}
}
