import * as THREE from "three"

import {
	isGestureIntent,
	type FistContactResult,
	type GestureIntent,
	type MeleeHitResult,
	type Vector3Tuple,
} from "../src/arena-protocol.ts"

export const PUNCH_DAMAGE = 30
export const ASSASSINATION_DAMAGE = 1_000
export const PUNCH_WINDUP_MS = 120
export const PUNCH_ACTIVE_END_MS = 280
export const PUNCH_RECOVERY_MS = 620
export const PUNCH_REACH = 2.05
export const PUNCH_HALF_ARC_RADIANS = THREE.MathUtils.degToRad(55)
export const REAR_HALF_ANGLE_RADIANS = THREE.MathUtils.degToRad(55)
export const FISTBUMP_ACTIVE_START_MS = 350
export const FISTBUMP_ACTIVE_END_MS = 1_100
export const FISTBUMP_DURATION_MS = 1_450
export const FIST_CONTACT_RADIUS = 0.58
export const GESTURE_MINIMUM_INTERVAL_MS = 160

export type MeleeCombatPlayer = {
	id: string
	position: Vector3Tuple
	yaw: number
}

type ActiveAction = {
	clientActionId: number
	contactedTargets: Set<string>
	startedAtMs: number
	type: GestureIntent["type"]
}

type MeleeCombatOptions = {
	getPlayers: () => readonly MeleeCombatPlayer[]
	onActionAccepted?: (
		playerId: string,
		intent: GestureIntent,
		startedAtMs: number,
	) => void
	onFistContact: (result: FistContactResult) => void
	onMeleeHit: (result: MeleeHitResult) => void
}

const UP = new THREE.Vector3(0, 1, 0)

function forward(yaw: number): THREE.Vector3 {
	return new THREE.Vector3(0, 0, -1).applyAxisAngle(UP, yaw)
}

function flatPosition(player: MeleeCombatPlayer): THREE.Vector3 {
	return new THREE.Vector3(player.position[0], 0, player.position[2])
}

function fistPosition(player: MeleeCombatPlayer): THREE.Vector3 {
	return new THREE.Vector3(...player.position)
		.addScaledVector(forward(player.yaw), 0.95)
		.add(new THREE.Vector3(0, -0.48, 0))
}

function isWithinPunchArc(
	attacker: MeleeCombatPlayer,
	point: THREE.Vector3,
): boolean {
	const delta = point.clone().sub(flatPosition(attacker))
	delta.y = 0
	const distance = delta.length()
	if (distance <= Number.EPSILON || distance > PUNCH_REACH) return false
	return (
		forward(attacker.yaw).dot(delta.normalize()) >=
		Math.cos(PUNCH_HALF_ARC_RADIANS)
	)
}

export class MeleeCombat {
	readonly #actions = new Map<string, ActiveAction>()
	readonly #completedContacts = new Set<string>()
	readonly #getPlayers: MeleeCombatOptions["getPlayers"]
	readonly #lastAcceptedAction = new Map<string, number>()
	readonly #lastGestureStartedAt = new Map<string, number>()
	readonly #lastPunchStartedAt = new Map<string, number>()
	readonly #onActionAccepted: MeleeCombatOptions["onActionAccepted"]
	readonly #onFistContact: MeleeCombatOptions["onFistContact"]
	readonly #onMeleeHit: MeleeCombatOptions["onMeleeHit"]
	#nextContactId = 1

	constructor(options: MeleeCombatOptions) {
		this.#getPlayers = options.getPlayers
		this.#onActionAccepted = options.onActionAccepted
		this.#onFistContact = options.onFistContact
		this.#onMeleeHit = options.onMeleeHit
	}

	accept(playerId: string, value: unknown, nowMs: number): boolean {
		if (!isGestureIntent(value) || !Number.isFinite(nowMs)) return false
		if (value.clientActionId <= (this.#lastAcceptedAction.get(playerId) ?? -1))
			return false
		if (!this.#getPlayers().some((player) => player.id === playerId))
			return false
		if (
			nowMs - (this.#lastGestureStartedAt.get(playerId) ?? -Infinity) <
			GESTURE_MINIMUM_INTERVAL_MS
		)
			return false
		if (
			value.type === "punch" &&
			nowMs - (this.#lastPunchStartedAt.get(playerId) ?? -Infinity) <
				PUNCH_RECOVERY_MS
		)
			return false
		this.#lastAcceptedAction.set(playerId, value.clientActionId)
		this.#lastGestureStartedAt.set(playerId, nowMs)
		if (value.type === "punch") this.#lastPunchStartedAt.set(playerId, nowMs)
		this.#actions.set(playerId, {
			clientActionId: value.clientActionId,
			contactedTargets: new Set(),
			startedAtMs: nowMs,
			type: value.type,
		})
		this.#onActionAccepted?.(playerId, value, nowMs)
		return true
	}

	cancel(playerId: string): void {
		this.#actions.delete(playerId)
	}

	removePlayer(playerId: string): void {
		this.cancel(playerId)
		this.#lastAcceptedAction.delete(playerId)
		this.#lastGestureStartedAt.delete(playerId)
		this.#lastPunchStartedAt.delete(playerId)
	}

	update(nowMs: number): void {
		const players = this.#getPlayers()
		const byId = new Map(players.map((player) => [player.id, player]))
		for (const playerId of this.#actions.keys()) {
			if (!byId.has(playerId)) this.#actions.delete(playerId)
		}
		for (const [attackerId, action] of this.#actions) {
			const attacker = byId.get(attackerId)
			if (attacker === undefined) continue
			const elapsed = nowMs - action.startedAtMs
			if (
				action.type === "punch" &&
				elapsed >= PUNCH_WINDUP_MS &&
				elapsed <= PUNCH_ACTIVE_END_MS
			) {
				this.#resolvePunch(attacker, action, players, nowMs)
			}
			if (
				action.type === "fistbump" &&
				elapsed >= FISTBUMP_ACTIVE_START_MS &&
				elapsed <= FISTBUMP_ACTIVE_END_MS
			) {
				this.#resolveFistbump(attacker, action, players, nowMs)
			}
			const duration =
				action.type === "punch"
					? PUNCH_RECOVERY_MS
					: action.type === "fistbump"
						? FISTBUMP_DURATION_MS
						: 2_000
			if (elapsed > duration) this.#actions.delete(attackerId)
		}
	}

	#resolvePunch(
		attacker: MeleeCombatPlayer,
		action: ActiveAction,
		players: readonly MeleeCombatPlayer[],
		nowMs: number,
	): void {
		for (const target of players) {
			if (target.id === attacker.id || action.contactedTargets.has(target.id))
				continue
			const targetAction = this.#actions.get(target.id)
			if (
				targetAction?.type === "fistbump" &&
				nowMs - targetAction.startedAtMs >= FISTBUMP_ACTIVE_START_MS &&
				nowMs - targetAction.startedAtMs <= FISTBUMP_ACTIVE_END_MS &&
				isWithinPunchArc(attacker, fistPosition(target))
			)
				this.#emitContact(
					attacker,
					action,
					target,
					targetAction,
					"punch-bump",
					nowMs,
				)
			if (!isWithinPunchArc(attacker, flatPosition(target))) continue
			action.contactedTargets.add(target.id)
			const targetToAttacker = flatPosition(attacker)
				.sub(flatPosition(target))
				.normalize()
			const assassination =
				forward(target.yaw).dot(targetToAttacker) <=
				-Math.cos(REAR_HALF_ANGLE_RADIANS)
			const position: Vector3Tuple = [
				target.position[0],
				target.position[1] - 0.45,
				target.position[2],
			]
			this.#onMeleeHit({
				actionId: action.clientActionId,
				attackerId: attacker.id,
				classification: assassination ? "assassination" : "punch",
				damage: assassination ? ASSASSINATION_DAMAGE : PUNCH_DAMAGE,
				position,
				serverTime: nowMs / 1_000,
				targetId: target.id,
			})
		}
	}

	#resolveFistbump(
		player: MeleeCombatPlayer,
		action: ActiveAction,
		players: readonly MeleeCombatPlayer[],
		nowMs: number,
	): void {
		for (const other of players) {
			if (other.id === player.id) continue
			const otherAction = this.#actions.get(other.id)
			if (otherAction?.type !== "fistbump") continue
			const otherElapsed = nowMs - otherAction.startedAtMs
			if (
				otherElapsed < FISTBUMP_ACTIVE_START_MS ||
				otherElapsed > FISTBUMP_ACTIVE_END_MS
			)
				continue
			if (
				fistPosition(player).distanceTo(fistPosition(other)) >
				FIST_CONTACT_RADIUS * 2
			)
				continue
			this.#emitContact(player, action, other, otherAction, "fistbump", nowMs)
		}
	}

	#emitContact(
		first: MeleeCombatPlayer,
		firstAction: ActiveAction,
		second: MeleeCombatPlayer,
		secondAction: ActiveAction,
		kind: FistContactResult["kind"],
		nowMs: number,
	): void {
		const pair = [
			`${first.id}:${firstAction.clientActionId}`,
			`${second.id}:${secondAction.clientActionId}`,
		].sort()
		const key = `${kind}:${pair.join("|")}`
		if (this.#completedContacts.has(key)) return
		this.#completedContacts.add(key)
		if (this.#completedContacts.size > 256) {
			const oldest = this.#completedContacts.values().next().value
			if (oldest !== undefined) this.#completedContacts.delete(oldest)
		}
		const position = fistPosition(first)
			.add(fistPosition(second))
			.multiplyScalar(0.5)
		this.#onFistContact({
			actionIds: [firstAction.clientActionId, secondAction.clientActionId],
			id: this.#nextContactId++,
			kind,
			participantIds: [first.id, second.id],
			position: position.toArray(),
			serverTime: nowMs / 1_000,
		})
	}
}
