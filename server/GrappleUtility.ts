import type {
	GrappleStateSnapshot,
	Vector3Tuple,
} from "../src/arena-protocol.ts"
import {
	GRAPPLE_MAX_ATTACH_SECONDS,
	GRAPPLE_MIN_ROPE_LENGTH,
} from "../src/game-constants.ts"
import { advanceGrappleRopeLength } from "../src/GrapplePhysics.ts"
import type { ArenaAnchorHit } from "../src/ArenaWorld.ts"

const distance = (left: Vector3Tuple, right: Vector3Tuple): number =>
	Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2])

const copy = (state: GrappleStateSnapshot): GrappleStateSnapshot => ({
	...state,
	anchor: state.anchor === null ? null : [...state.anchor],
})

/** Server-owned, independent always-equipped grapple state for every pilot. */
export class GrappleUtility {
	readonly #states = new Map<string, GrappleStateSnapshot>()

	connect(playerId: string): GrappleStateSnapshot {
		const current = this.#states.get(playerId)
		if (current !== undefined) return copy(current)
		const state = this.#idle(playerId, 0)
		this.#states.set(playerId, state)
		return copy(state)
	}

	disconnect(playerId: string): GrappleStateSnapshot | null {
		const state = this.#states.get(playerId)
		if (state === undefined) return null
		const idle = this.#idle(playerId, state.sequence + 1)
		this.#states.delete(playerId)
		return copy(idle)
	}

	attach(
		playerId: string,
		playerPosition: Vector3Tuple,
		hit: ArenaAnchorHit,
		nowMs: number,
		attachmentId: number,
	): GrappleStateSnapshot | null {
		const current = this.#states.get(playerId)
		if (current === undefined || current.phase === "attached") return null
		const state: GrappleStateSnapshot = {
			anchor: [...hit.point],
			attachmentId,
			attachedAt: nowMs,
			ownerId: playerId,
			phase: "attached",
			ropeLength: Math.max(
				GRAPPLE_MIN_ROPE_LENGTH,
				distance(playerPosition, [...hit.point]),
			),
			sequence: current.sequence + 1,
			surfaceId: hit.surfaceId,
		}
		this.#states.set(playerId, state)
		return copy(state)
	}

	detach(playerId: string): GrappleStateSnapshot | null {
		const current = this.#states.get(playerId)
		if (current === undefined || current.phase !== "attached") return null
		const state = this.#idle(playerId, current.sequence + 1)
		this.#states.set(playerId, state)
		return copy(state)
	}

	reset(playerId: string): GrappleStateSnapshot | null {
		const current = this.#states.get(playerId)
		if (current === undefined || current.phase === "idle") return null
		const state = this.#idle(playerId, current.sequence + 1)
		this.#states.set(playerId, state)
		return copy(state)
	}

	reel(
		playerId: string,
		position: Vector3Tuple,
		aimDirection: Vector3Tuple,
		delta: number,
	): GrappleStateSnapshot | null {
		const current = this.#states.get(playerId)
		if (
			current === undefined ||
			current.phase !== "attached" ||
			current.anchor === null ||
			current.ropeLength === null
		)
			return null
		const ropeLength = advanceGrappleRopeLength({
			aimDirection: {
				x: aimDirection[0],
				y: aimDirection[1],
				z: aimDirection[2],
			},
			anchor: {
				x: current.anchor[0],
				y: current.anchor[1],
				z: current.anchor[2],
			},
			delta,
			position: { x: position[0], y: position[1], z: position[2] },
			ropeLength: current.ropeLength,
		})
		if (ropeLength === current.ropeLength) return null
		const state = { ...current, ropeLength, sequence: current.sequence + 1 }
		this.#states.set(playerId, state)
		return copy(state)
	}

	update(nowMs: number): GrappleStateSnapshot[] {
		const updates: GrappleStateSnapshot[] = []
		for (const [playerId, state] of this.#states) {
			if (
				state.phase === "attached" &&
				state.attachedAt !== null &&
				nowMs - state.attachedAt >= GRAPPLE_MAX_ATTACH_SECONDS * 1_000
			) {
				const idle = this.#idle(playerId, state.sequence + 1)
				this.#states.set(playerId, idle)
				updates.push(copy(idle))
			}
		}
		return updates
	}

	state(playerId: string): GrappleStateSnapshot | null {
		const state = this.#states.get(playerId)
		return state === undefined ? null : copy(state)
	}

	states(): GrappleStateSnapshot[] {
		return [...this.#states.values()].map(copy)
	}

	#idle(playerId: string, sequence: number): GrappleStateSnapshot {
		return {
			anchor: null,
			attachmentId: null,
			attachedAt: null,
			ownerId: playerId,
			phase: "idle",
			ropeLength: null,
			sequence,
			surfaceId: null,
		}
	}
}
