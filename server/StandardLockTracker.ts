import {
	isNewStandardLockIntent,
	type StandardLockIntent,
	type Vector3Tuple,
} from "../src/arena-protocol.ts"
import {
	STANDARD_LOCK_DIRECTION_COSINE,
	STANDARD_LOCK_MAX_RANGE,
} from "../src/game-constants.ts"
import { pilotTorsoTargetFromEye } from "../src/pilot-targeting.ts"

export type StandardLockPilotState = {
	aimDirection: Vector3Tuple
	crouching: boolean
	equippedWeapon: "arc-blaster" | "mini-missile"
	freeAim: boolean
	id: string
	position: Vector3Tuple
	sprinting: boolean
}

export type StandardLockUpdate = {
	playerId: string
	snapshot: { attackers: number }
}

function vectorLength([x, y, z]: Vector3Tuple): number {
	return Math.hypot(x, y, z)
}

export function selectValidatedStandardLockTarget(
	attacker: StandardLockPilotState,
	pilots: ReadonlyMap<string, StandardLockPilotState>,
): string | null {
	if (
		attacker.equippedWeapon !== "arc-blaster" ||
		attacker.freeAim ||
		attacker.sprinting
	)
		return null
	const aimLength = vectorLength(attacker.aimDirection)
	if (!Number.isFinite(aimLength) || aimLength < 0.5) return null
	const aim = attacker.aimDirection.map(
		(component) => component / aimLength,
	) as Vector3Tuple

	let best: { cosine: number; distance: number; id: string } | null = null
	for (const [id, target] of pilots) {
		if (id === attacker.id) continue
		const torso = pilotTorsoTargetFromEye(target.position, target.crouching)
		const offset: Vector3Tuple = [
			torso[0] - attacker.position[0],
			torso[1] - attacker.position[1],
			torso[2] - attacker.position[2],
		]
		const distance = vectorLength(offset)
		if (distance <= 0 || distance > STANDARD_LOCK_MAX_RANGE) continue
		const cosine =
			(aim[0] * offset[0] + aim[1] * offset[1] + aim[2] * offset[2]) / distance
		if (cosine < STANDARD_LOCK_DIRECTION_COSINE) continue
		if (
			best === null ||
			cosine > best.cosine ||
			(cosine === best.cosine && distance < best.distance)
		) {
			best = { cosine, distance, id }
		}
	}
	return best?.id ?? null
}

export class StandardLockTracker {
	readonly #activeAttackers = new Set<string>()
	readonly #lastIntent = new Map<string, number>()
	#targetsByAttacker = new Map<string, string>()

	acceptIntent(
		attackerId: string,
		value: unknown,
	): value is StandardLockIntent {
		const previous = this.#lastIntent.get(attackerId) ?? -1
		if (!isNewStandardLockIntent(value, previous)) return false
		this.#lastIntent.set(attackerId, value.clientLockId)
		if (value.active) this.#activeAttackers.add(attackerId)
		else this.#activeAttackers.delete(attackerId)
		return true
	}

	incoming(playerId: string): { attackers: number } {
		let attackers = 0
		for (const targetId of this.#targetsByAttacker.values()) {
			if (targetId === playerId) attackers += 1
		}
		return { attackers }
	}

	reconcile(
		pilots: ReadonlyMap<string, StandardLockPilotState>,
	): StandardLockUpdate[] {
		const nextTargets = new Map<string, string>()
		for (const attackerId of this.#activeAttackers) {
			const attacker = pilots.get(attackerId)
			if (attacker === undefined) continue
			const targetId = selectValidatedStandardLockTarget(attacker, pilots)
			if (targetId !== null) nextTargets.set(attackerId, targetId)
		}
		return this.#applyTargets(nextTargets)
	}

	clearPlayer(playerId: string): StandardLockUpdate[] {
		this.#activeAttackers.delete(playerId)
		this.#lastIntent.delete(playerId)
		return this.#applyTargets(
			new Map(
				[...this.#targetsByAttacker].filter(
					([attackerId, targetId]) =>
						attackerId !== playerId && targetId !== playerId,
				),
			),
		)
	}

	#applyTargets(nextTargets: Map<string, string>): StandardLockUpdate[] {
		const affected = new Set<string>([
			...this.#targetsByAttacker.values(),
			...nextTargets.values(),
		])
		const previousCounts = new Map(
			[...affected].map((id) => [id, this.incoming(id)]),
		)
		this.#targetsByAttacker = nextTargets
		const updates: StandardLockUpdate[] = []
		for (const playerId of affected) {
			const previous = previousCounts.get(playerId)?.attackers ?? 0
			const snapshot = this.incoming(playerId)
			if (snapshot.attackers !== previous) updates.push({ playerId, snapshot })
		}
		return updates
	}
}
