import type {
	GrapplePickupSnapshot,
	GrappleStateSnapshot,
	Vector3Tuple,
} from "../src/arena-protocol.ts"
import {
	GRAPPLE_MAX_ATTACH_SECONDS,
	GRAPPLE_MIN_ROPE_LENGTH,
	GRAPPLE_PICKUP_RADIUS,
	GRAPPLE_PICKUP_RESPAWN_MS,
} from "../src/game-constants.ts"
import type { ArenaAnchorHit } from "../src/ArenaWorld.ts"

const distance = (left: Vector3Tuple, right: Vector3Tuple): number =>
	Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2])

export class GrappleUtility {
	readonly #connected = new Set<string>()
	readonly #pickupPosition: Vector3Tuple
	#available = true
	#availableAt: number | null = null
	#ownerId: string | null = null
	#sequence = 0
	#state: GrappleStateSnapshot = {
		anchor: null,
		attachedAt: null,
		ownerId: null,
		phase: "idle",
		ropeLength: null,
		sequence: 0,
		surfaceId: null,
	}

	constructor(position: Vector3Tuple) {
		this.#pickupPosition = [...position]
	}

	connect(playerId: string): void {
		this.#connected.add(playerId)
	}

	disconnect(playerId: string, nowMs: number): boolean {
		this.#connected.delete(playerId)
		return this.release(playerId, nowMs)
	}

	collect(playerId: string, position: Vector3Tuple): boolean {
		if (
			!this.#connected.has(playerId) ||
			!this.#available ||
			this.#ownerId !== null ||
			distance(position, this.#pickupPosition) > GRAPPLE_PICKUP_RADIUS
		)
			return false
		this.#available = false
		this.#availableAt = null
		this.#ownerId = playerId
		this.#setIdle(playerId)
		return true
	}

	attach(
		playerId: string,
		playerPosition: Vector3Tuple,
		hit: ArenaAnchorHit,
		nowMs: number,
	): boolean {
		if (
			this.#ownerId !== playerId ||
			this.#state.phase === "attached" ||
			!this.#connected.has(playerId)
		)
			return false
		const ropeLength = Math.max(
			GRAPPLE_MIN_ROPE_LENGTH,
			distance(playerPosition, [...hit.point]),
		)
		this.#sequence += 1
		this.#state = {
			anchor: [...hit.point],
			attachedAt: nowMs,
			ownerId: playerId,
			phase: "attached",
			ropeLength,
			sequence: this.#sequence,
			surfaceId: hit.surfaceId,
		}
		return true
	}

	detach(playerId: string): boolean {
		if (this.#ownerId !== playerId || this.#state.phase !== "attached")
			return false
		this.#setIdle(playerId)
		return true
	}

	release(playerId: string, nowMs: number): boolean {
		if (this.#ownerId !== playerId) return false
		this.#ownerId = null
		this.#available = false
		this.#availableAt = nowMs + GRAPPLE_PICKUP_RESPAWN_MS
		this.#setIdle(null)
		return true
	}

	update(nowMs: number): boolean {
		let changed = false
		if (
			this.#state.phase === "attached" &&
			this.#state.attachedAt !== null &&
			nowMs - this.#state.attachedAt >= GRAPPLE_MAX_ATTACH_SECONDS * 1_000
		) {
			this.#setIdle(this.#ownerId)
			changed = true
		}
		if (this.#availableAt !== null && nowMs >= this.#availableAt) {
			this.#available = true
			this.#availableAt = null
			changed = true
		}
		return changed
	}

	ownedBy(playerId: string): boolean {
		return this.#ownerId === playerId
	}

	pickup(): GrapplePickupSnapshot {
		return {
			available: this.#available,
			availableAt: this.#availableAt,
			ownerId: this.#ownerId,
			position: [...this.#pickupPosition],
		}
	}

	state(): GrappleStateSnapshot {
		return {
			...this.#state,
			anchor: this.#state.anchor === null ? null : [...this.#state.anchor],
		}
	}

	#setIdle(ownerId: string | null): void {
		this.#sequence += 1
		this.#state = {
			anchor: null,
			attachedAt: null,
			ownerId,
			phase: "idle",
			ropeLength: null,
			sequence: this.#sequence,
			surfaceId: null,
		}
	}
}
