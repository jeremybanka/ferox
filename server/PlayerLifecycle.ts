import { PLAYER_RESPAWN_DELAY_MS } from "../src/game-constants.ts"

export type PlayerLifecycleState = {
	dead: boolean
	deathStartedAt: number | null
	health: number
	respawnAt: number | null
	score: number
}

export type DamageResult = "damaged" | "died" | "ignored"

export class PlayerLifecycle {
	readonly #players = new Map<string, PlayerLifecycleState>()

	add(playerId: string): PlayerLifecycleState {
		const state = {
			dead: false,
			deathStartedAt: null,
			health: 100,
			respawnAt: null,
			score: 0,
		} satisfies PlayerLifecycleState
		this.#players.set(playerId, state)
		return state
	}

	delete(playerId: string): void {
		this.#players.delete(playerId)
	}

	get(playerId: string): PlayerLifecycleState | undefined {
		return this.#players.get(playerId)
	}

	isAlive(playerId: string): boolean {
		return this.#players.get(playerId)?.dead === false
	}

	awardScore(playerId: string): void {
		const state = this.#players.get(playerId)
		if (state !== undefined) state.score += 1
	}

	damage(playerId: string, damage: number, nowMs: number): DamageResult {
		const state = this.#players.get(playerId)
		if (state === undefined || state.dead || damage <= 0) return "ignored"
		state.health = Math.max(0, state.health - damage)
		if (state.health > 0) return "damaged"
		state.dead = true
		state.deathStartedAt = nowMs
		state.respawnAt = nowMs + PLAYER_RESPAWN_DELAY_MS
		state.score = Math.max(0, state.score - 1)
		return "died"
	}

	advance(nowMs: number): string[] {
		const respawned: string[] = []
		for (const [playerId, state] of this.#players) {
			if (!state.dead || state.respawnAt === null || nowMs < state.respawnAt) {
				continue
			}
			state.dead = false
			state.deathStartedAt = null
			state.health = 100
			state.respawnAt = null
			respawned.push(playerId)
		}
		return respawned
	}
}
