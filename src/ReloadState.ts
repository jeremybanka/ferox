import {
	WEAPON_MAGAZINE_SIZE,
	WEAPON_RELOAD_DURATION_SECONDS,
	WEAPON_RELOAD_REFILL_PROGRESS,
} from "./game-constants.ts"

export type ReloadState = {
	ammo: number
	refilled: boolean
	reloading: boolean
	startedAt: number
}

export function initialReloadState(ammo = WEAPON_MAGAZINE_SIZE): ReloadState {
	return { ammo, refilled: false, reloading: false, startedAt: 0 }
}

export function startReload(
	state: ReloadState,
	nowSeconds: number,
): ReloadState {
	if (state.reloading || state.ammo >= WEAPON_MAGAZINE_SIZE) return state
	return { ...state, refilled: false, reloading: true, startedAt: nowSeconds }
}

export function cancelReload(state: ReloadState): ReloadState {
	if (!state.reloading) return state
	return { ...state, refilled: false, reloading: false, startedAt: 0 }
}

export function reloadProgress(state: ReloadState, nowSeconds: number): number {
	if (!state.reloading) return 0
	return Math.min(
		1,
		Math.max(0, nowSeconds - state.startedAt) / WEAPON_RELOAD_DURATION_SECONDS,
	)
}

export function updateReload(
	state: ReloadState,
	nowSeconds: number,
): ReloadState {
	if (!state.reloading) return state
	const progress = reloadProgress(state, nowSeconds)
	let next = state
	if (!state.refilled && progress >= WEAPON_RELOAD_REFILL_PROGRESS) {
		next = { ...next, ammo: WEAPON_MAGAZINE_SIZE, refilled: true }
	}
	if (progress >= 1) {
		return { ...next, refilled: false, reloading: false, startedAt: 0 }
	}
	return next
}

export function spendRound(state: ReloadState): ReloadState {
	if (state.reloading || state.ammo <= 0) return state
	return { ...state, ammo: state.ammo - 1 }
}
