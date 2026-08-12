import type { LockChargeSnapshot } from "../src/arena-protocol.ts"
import { gunDefinition } from "../src/guns/GunDefinitions.ts"

export type LockHitscanWeapon = "heavy-laser" | "ion-beam-rifle"

export type LockChargeResolution = {
	damage: number | null
	snapshot: LockChargeSnapshot
}

export class LockHitscanChargeController {
	readonly #active = new Map<string, LockChargeSnapshot>()
	readonly #lastChargeId = new Map<string, number>()

	start(
		ownerId: string,
		clientChargeId: number,
		weapon: LockHitscanWeapon,
		nowMs: number,
	): LockChargeSnapshot | null {
		if (
			!Number.isSafeInteger(clientChargeId) ||
			clientChargeId <= (this.#lastChargeId.get(ownerId) ?? -1) ||
			this.#active.has(ownerId) ||
			!Number.isFinite(nowMs)
		)
			return null
		const tuning = gunDefinition(weapon).tuning
		if (tuning.kind !== "hitscan") return null
		this.#lastChargeId.set(ownerId, clientChargeId)
		const snapshot: LockChargeSnapshot = {
			chargeId: clientChargeId,
			completesAt: nowMs + tuning.chargeMs,
			ownerId,
			phase: "charging",
			startedAt: nowMs,
			weapon,
		}
		this.#active.set(ownerId, snapshot)
		return { ...snapshot }
	}

	release(
		ownerId: string,
		clientChargeId: number,
		nowMs: number,
	): LockChargeResolution | null {
		const active = this.#active.get(ownerId)
		if (active === undefined || active.chargeId !== clientChargeId) return null
		this.#active.delete(ownerId)
		const tuning = gunDefinition(active.weapon).tuning
		if (tuning.kind !== "hitscan") return null
		const matured = nowMs >= active.completesAt
		const damage = matured
			? tuning.chargedDamage
			: active.weapon === "heavy-laser"
				? tuning.tapDamage
				: null
		return {
			damage,
			snapshot: { ...active, phase: damage === null ? "cancelled" : "fired" },
		}
	}

	advance(
		nowMs: number,
		isValid: (snapshot: LockChargeSnapshot) => boolean,
	): LockChargeResolution[] {
		const resolved: LockChargeResolution[] = []
		for (const [ownerId, active] of this.#active) {
			if (!isValid(active)) {
				this.#active.delete(ownerId)
				resolved.push({
					damage: null,
					snapshot: { ...active, phase: "cancelled" },
				})
				continue
			}
			if (nowMs < active.completesAt) continue
			this.#active.delete(ownerId)
			const tuning = gunDefinition(active.weapon).tuning
			if (tuning.kind !== "hitscan") continue
			resolved.push({
				damage: tuning.chargedDamage,
				snapshot: { ...active, phase: "fired" },
			})
		}
		return resolved
	}

	cancel(ownerId: string): LockChargeSnapshot | null {
		const active = this.#active.get(ownerId)
		if (active === undefined) return null
		this.#active.delete(ownerId)
		return { ...active, phase: "cancelled" }
	}

	active(ownerId: string): LockChargeSnapshot | null {
		const active = this.#active.get(ownerId)
		return active === undefined ? null : { ...active }
	}

	disconnect(ownerId: string): LockChargeSnapshot | null {
		const cancelled = this.cancel(ownerId)
		this.#lastChargeId.delete(ownerId)
		return cancelled
	}
}
