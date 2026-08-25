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
		if (tuning.kind !== "hitscan" || tuning.mode !== "charged") return null
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
		// A release at or beyond the deadline cannot turn into the charged shot.
		// Leave it active for the authoritative deadline resolver instead.
		if (nowMs >= active.completesAt) return null
		this.#active.delete(ownerId)
		const tuning = gunDefinition(active.weapon).tuning
		if (tuning.kind !== "hitscan" || tuning.mode !== "charged") return null
		const damage = active.weapon === "heavy-laser" ? tuning.tapDamage : null
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
		for (const active of this.#active.values()) {
			const resolution = this.resolveDue(
				active.ownerId,
				active.chargeId,
				nowMs,
				isValid,
			)
			if (resolution !== null) resolved.push(resolution)
		}
		return resolved
	}

	resolveDue(
		ownerId: string,
		clientChargeId: number,
		nowMs: number,
		isValid: (snapshot: LockChargeSnapshot) => boolean,
	): LockChargeResolution | null {
		const active = this.#active.get(ownerId)
		if (active === undefined || active.chargeId !== clientChargeId) return null
		if (!isValid(active)) {
			this.#active.delete(ownerId)
			return {
				damage: null,
				snapshot: { ...active, phase: "cancelled" },
			}
		}
		if (nowMs < active.completesAt) return null
		this.#active.delete(ownerId)
		const tuning = gunDefinition(active.weapon).tuning
		if (tuning.kind !== "hitscan" || tuning.mode !== "charged") return null
		return {
			damage: tuning.chargedDamage,
			snapshot: { ...active, phase: "fired" },
		}
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
