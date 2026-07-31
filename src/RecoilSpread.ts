import * as THREE from "three"

import {
	RECOIL_BASELINE_SPREAD_RADIANS,
	RECOIL_MAX_SPREAD_RADIANS,
	RECOIL_PER_SHOT_INCREASE_RADIANS,
	RECOIL_RECOVERY_DELAY_SECONDS,
	RECOIL_RECOVERY_SECONDS,
} from "./game-constants.ts"

export type RecoilSpreadState = {
	recoveryDelay: number
	spreadRadians: number
}

export const initialRecoilSpreadState = (): RecoilSpreadState => ({
	recoveryDelay: 0,
	spreadRadians: RECOIL_BASELINE_SPREAD_RADIANS,
})

export function addRecoilShot(state: RecoilSpreadState): RecoilSpreadState {
	return {
		recoveryDelay: RECOIL_RECOVERY_DELAY_SECONDS,
		spreadRadians: Math.min(
			RECOIL_MAX_SPREAD_RADIANS,
			state.spreadRadians + RECOIL_PER_SHOT_INCREASE_RADIANS,
		),
	}
}

export function recoverRecoilSpread(
	state: RecoilSpreadState,
	deltaSeconds: number,
): RecoilSpreadState {
	const elapsed = Math.max(0, deltaSeconds)
	if (elapsed === 0) return state
	if (state.recoveryDelay >= elapsed) {
		return { ...state, recoveryDelay: state.recoveryDelay - elapsed }
	}
	const recoveryElapsed = elapsed - state.recoveryDelay
	const recoveryRate =
		(RECOIL_MAX_SPREAD_RADIANS - RECOIL_BASELINE_SPREAD_RADIANS) /
		RECOIL_RECOVERY_SECONDS
	return {
		recoveryDelay: 0,
		spreadRadians: Math.max(
			RECOIL_BASELINE_SPREAD_RADIANS,
			state.spreadRadians - recoveryElapsed * recoveryRate,
		),
	}
}

export function normalizedRecoilSpread(state: RecoilSpreadState): number {
	return THREE.MathUtils.clamp(
		(state.spreadRadians - RECOIL_BASELINE_SPREAD_RADIANS) /
			(RECOIL_MAX_SPREAD_RADIANS - RECOIL_BASELINE_SPREAD_RADIANS),
		0,
		1,
	)
}

export function spreadDirection(
	baseDirection: THREE.Vector3,
	spreadRadians: number,
	random: () => number = Math.random,
): THREE.Vector3 {
	const forward = baseDirection.clone().normalize()
	const reference =
		Math.abs(forward.y) < 0.99
			? new THREE.Vector3(0, 1, 0)
			: new THREE.Vector3(1, 0, 0)
	const right = new THREE.Vector3().crossVectors(forward, reference).normalize()
	const up = new THREE.Vector3().crossVectors(right, forward).normalize()
	const radius = Math.sqrt(THREE.MathUtils.clamp(random(), 0, 1))
	const angle = THREE.MathUtils.clamp(random(), 0, 1) * Math.PI * 2
	const tangent = Math.tan(Math.max(0, spreadRadians) * radius)
	return forward
		.addScaledVector(right, Math.cos(angle) * tangent)
		.addScaledVector(up, Math.sin(angle) * tangent)
		.normalize()
}
