import { gunDefinition } from "../src/guns/GunDefinitions.ts"

export type VampChainSnapshot = Readonly<{
	chainId: number
	dueAt: number
	hitCount: number
	intervalMs: number
	ownerId: string
}>

export type VampDueResolution = Readonly<{
	next: VampChainSnapshot | null
	outcome: "cancelled" | "hit"
	snapshot: VampChainSnapshot
}>

/**
 * Server-owned continuous-fire ladder. Client messages only bracket how long
 * the trigger is held; every damaging attempt and its next deadline are
 * derived here. A missed due attempt ends the chain, so a later start always
 * begins again at the documented 1000 ms interval.
 */
export class VampContinuousFireController {
	readonly #active = new Map<string, VampChainSnapshot>()
	readonly #lastChainId = new Map<string, number>()

	start(
		ownerId: string,
		clientChainId: number,
		nowMs: number,
	): VampChainSnapshot | null {
		if (
			!Number.isSafeInteger(clientChainId) ||
			clientChainId <= (this.#lastChainId.get(ownerId) ?? -1) ||
			this.#active.has(ownerId) ||
			!Number.isFinite(nowMs)
		)
			return null
		const tuning = gunDefinition("vamp").tuning
		if (tuning.kind !== "hitscan" || tuning.mode !== "continuous") return null
		this.#lastChainId.set(ownerId, clientChainId)
		const snapshot: VampChainSnapshot = {
			chainId: clientChainId,
			dueAt: nowMs + tuning.firstIntervalMs,
			hitCount: 0,
			intervalMs: tuning.firstIntervalMs,
			ownerId,
		}
		this.#active.set(ownerId, snapshot)
		return { ...snapshot }
	}

	resolveDue(
		ownerId: string,
		clientChainId: number,
		nowMs: number,
		attemptDamage: (snapshot: VampChainSnapshot) => boolean,
	): VampDueResolution | null {
		const active = this.#active.get(ownerId)
		if (active === undefined || active.chainId !== clientChainId) return null
		if (!Number.isFinite(nowMs) || nowMs < active.dueAt) return null
		// Remove before invoking game logic so re-entry/replay cannot double-hit.
		this.#active.delete(ownerId)
		if (!attemptDamage(active)) {
			return { next: null, outcome: "cancelled", snapshot: { ...active } }
		}
		const tuning = gunDefinition("vamp").tuning
		if (tuning.kind !== "hitscan" || tuning.mode !== "continuous") {
			return { next: null, outcome: "cancelled", snapshot: { ...active } }
		}
		const nextIntervalMs = Math.max(
			tuning.minimumIntervalMs,
			active.intervalMs - tuning.intervalStepMs,
		)
		const next: VampChainSnapshot = {
			...active,
			dueAt: nowMs + nextIntervalMs,
			hitCount: active.hitCount + 1,
			intervalMs: nextIntervalMs,
		}
		this.#active.set(ownerId, next)
		return { next: { ...next }, outcome: "hit", snapshot: { ...active } }
	}

	release(ownerId: string, clientChainId: number): VampChainSnapshot | null {
		const active = this.#active.get(ownerId)
		if (active === undefined || active.chainId !== clientChainId) return null
		this.#active.delete(ownerId)
		return { ...active }
	}

	cancel(ownerId: string): VampChainSnapshot | null {
		const active = this.#active.get(ownerId)
		if (active === undefined) return null
		this.#active.delete(ownerId)
		return { ...active }
	}

	active(ownerId: string): VampChainSnapshot | null {
		const active = this.#active.get(ownerId)
		return active === undefined ? null : { ...active }
	}

	disconnect(ownerId: string): VampChainSnapshot | null {
		const cancelled = this.cancel(ownerId)
		this.#lastChainId.delete(ownerId)
		return cancelled
	}
}
