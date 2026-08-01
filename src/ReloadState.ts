import type {
	ReloadSnapshot,
	WeaponKind,
	WeaponSlotIndex,
} from "./arena-protocol.ts"
import { gunDefinition } from "./guns/GunDefinitions.ts"

export type ReloadState = ReloadSnapshot | null

export type ReloadRequest = {
	ammo: number
	gunId: WeaponKind
	slot: WeaponSlotIndex
}

export type ReloadStep = {
	completed: boolean
	refill: ReloadSnapshot | null
	state: ReloadState
}

export function startReload(
	request: ReloadRequest,
	nowSeconds: number,
): ReloadState {
	const gun = gunDefinition(request.gunId)
	if (
		!gun.capabilities.reload ||
		request.ammo < 0 ||
		request.ammo >= gun.magazineSize ||
		!Number.isFinite(nowSeconds)
	)
		return null
	const refillAt =
		nowSeconds + gun.reload.durationSeconds * gun.reload.refillProgress
	return {
		completesAt: nowSeconds + gun.reload.durationSeconds,
		gunId: request.gunId,
		refillAt,
		refilled: false,
		slot: request.slot,
		startedAt: nowSeconds,
	}
}

export function cancelReload(_state: ReloadState): ReloadState {
	return null
}

export function reloadProgress(state: ReloadState, nowSeconds: number): number {
	if (state === null) return 0
	const duration = state.completesAt - state.startedAt
	if (duration <= 0) return 1
	return Math.min(1, Math.max(0, nowSeconds - state.startedAt) / duration)
}

export function advanceReload(
	state: ReloadState,
	nowSeconds: number,
): ReloadStep {
	if (state === null) return { completed: false, refill: null, state: null }
	const refill = !state.refilled && nowSeconds >= state.refillAt ? state : null
	const next = refill === null ? state : { ...state, refilled: true }
	if (nowSeconds >= state.completesAt) {
		return { completed: true, refill, state: null }
	}
	return { completed: false, refill, state: next }
}

export function isReloadForEquipment(
	state: ReloadState,
	slot: WeaponSlotIndex,
	gunId: WeaponKind,
): boolean {
	return state !== null && state.slot === slot && state.gunId === gunId
}
