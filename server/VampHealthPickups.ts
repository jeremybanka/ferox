import type {
	VampHealthPickupSnapshot,
	Vector3Tuple,
} from "../src/arena-protocol.ts"
import {
	VAMP_HEALTH_PICKUP_CAP,
	VAMP_HEALTH_PICKUP_LIFETIME_MS,
	VAMP_HEALTH_PICKUP_RADIUS,
} from "../src/game-constants.ts"

export class VampHealthPickupField {
	readonly #pickups = new Map<number, VampHealthPickupSnapshot>()
	#nextId = 0

	spawn(
		ownerId: string,
		position: Vector3Tuple,
		nowMs: number,
	): VampHealthPickupSnapshot | null {
		if (
			ownerId.length === 0 ||
			!position.every(Number.isFinite) ||
			!Number.isFinite(nowMs)
		)
			return null
		while (this.#pickups.size >= VAMP_HEALTH_PICKUP_CAP) {
			const oldestId = this.#pickups.keys().next().value
			if (oldestId === undefined) break
			this.#pickups.delete(oldestId)
		}
		const pickup: VampHealthPickupSnapshot = {
			amount: 1,
			expiresAt: nowMs + VAMP_HEALTH_PICKUP_LIFETIME_MS,
			id: this.#nextId++,
			ownerId,
			position: [...position],
		}
		this.#pickups.set(pickup.id, pickup)
		return { ...pickup, position: [...pickup.position] }
	}

	collect(
		_playerId: string,
		position: Vector3Tuple,
		eligible: boolean,
		heal: () => number,
	): VampHealthPickupSnapshot | null {
		if (!eligible || !position.every(Number.isFinite)) return null
		let nearest: VampHealthPickupSnapshot | null = null
		let nearestDistance = Number.POSITIVE_INFINITY
		for (const pickup of this.#pickups.values()) {
			const distance = Math.hypot(
				position[0] - pickup.position[0],
				position[1] - pickup.position[1],
				position[2] - pickup.position[2],
			)
			if (distance <= VAMP_HEALTH_PICKUP_RADIUS && distance < nearestDistance) {
				nearest = pickup
				nearestDistance = distance
			}
		}
		if (nearest === null || heal() !== 1) return null
		this.#pickups.delete(nearest.id)
		return { ...nearest, position: [...nearest.position] }
	}

	advance(nowMs: number): boolean {
		let changed = false
		for (const [id, pickup] of this.#pickups) {
			if (nowMs < pickup.expiresAt) continue
			this.#pickups.delete(id)
			changed = true
		}
		return changed
	}

	clearOwner(ownerId: string): boolean {
		let changed = false
		for (const [id, pickup] of this.#pickups) {
			if (pickup.ownerId !== ownerId) continue
			this.#pickups.delete(id)
			changed = true
		}
		return changed
	}

	snapshots(): VampHealthPickupSnapshot[] {
		return [...this.#pickups.values()].map((pickup) => ({
			...pickup,
			position: [...pickup.position],
		}))
	}
}
