import { describe, expect, test, vi } from "vitest"

import type {
	FistContactResult,
	MeleeHitResult,
} from "../src/arena-protocol.ts"
import {
	FISTBUMP_ACTIVE_START_MS,
	MeleeCombat,
	PUNCH_DAMAGE,
	PUNCH_RECOVERY_MS,
	PUNCH_WINDUP_MS,
	type MeleeCombatPlayer,
} from "./MeleeCombat.ts"

function setup(players: MeleeCombatPlayer[]) {
	const hits: MeleeHitResult[] = []
	const contacts: FistContactResult[] = []
	const accepted = vi.fn()
	const combat = new MeleeCombat({
		getPlayers: () => players,
		onActionAccepted: accepted,
		onFistContact: (contact) => contacts.push(contact),
		onMeleeHit: (hit) => hits.push(hit),
	})
	return { accepted, combat, contacts, hits }
}

const attacker: MeleeCombatPlayer = {
	id: "attacker",
	position: [0, 1.72, 0],
	yaw: 0,
}

describe("authoritative melee", () => {
	test("rejects replay, stale IDs, and cadence bypass", () => {
		const { combat } = setup([attacker])
		expect(
			combat.accept("attacker", { clientActionId: 4, type: "punch" }, 1_000),
		).toBe(true)
		expect(
			combat.accept("attacker", { clientActionId: 4, type: "punch" }, 2_000),
		).toBe(false)
		expect(
			combat.accept("attacker", { clientActionId: 3, type: "punch" }, 2_000),
		).toBe(false)
		expect(
			combat.accept(
				"attacker",
				{ clientActionId: 5, type: "punch" },
				1_000 + PUNCH_RECOVERY_MS - 1,
			),
		).toBe(false)
		expect(
			combat.accept(
				"attacker",
				{ clientActionId: 6, type: "punch" },
				1_000 + PUNCH_RECOVERY_MS,
			),
		).toBe(true)
	})

	test("hits only during active frames and at most once per target", () => {
		const target: MeleeCombatPlayer = {
			id: "target",
			position: [0, 1.72, -1.5],
			yaw: Math.PI,
		}
		const { combat, hits } = setup([attacker, target])
		combat.accept("attacker", { clientActionId: 1, type: "punch" }, 2_000)
		combat.update(2_000 + PUNCH_WINDUP_MS - 1)
		expect(hits).toEqual([])
		combat.update(2_000 + PUNCH_WINDUP_MS)
		combat.update(2_000 + PUNCH_WINDUP_MS + 20)
		expect(hits).toHaveLength(1)
		expect(hits[0]).toMatchObject({
			classification: "punch",
			damage: PUNCH_DAMAGE,
			targetId: "target",
		})
	})

	test("classifies a rear strike from server transforms as an assassination", () => {
		const facingAway: MeleeCombatPlayer = {
			id: "target",
			position: [0, 1.72, -1.4],
			yaw: 0,
		}
		const { combat, hits } = setup([attacker, facingAway])
		combat.accept("attacker", { clientActionId: 1, type: "punch" }, 0)
		combat.update(PUNCH_WINDUP_MS)
		expect(hits[0]).toMatchObject({
			classification: "assassination",
			damage: 1_000,
		})
	})

	test("rejects self, side, distance, dead/removed, and inactive contacts", () => {
		const players: MeleeCombatPlayer[] = [
			attacker,
			{ id: "side", position: [1.5, 1.72, 0], yaw: 0 },
			{ id: "far", position: [0, 1.72, -2.2], yaw: 0 },
		]
		const { combat, hits } = setup(players)
		combat.accept("attacker", { clientActionId: 1, type: "punch" }, 0)
		players.splice(2, 1)
		combat.update(PUNCH_WINDUP_MS)
		expect(hits).toEqual([])
	})
})

describe("fist contacts", () => {
	test("deduplicates overlapping fistbump actions", () => {
		const other: MeleeCombatPlayer = {
			id: "other",
			position: [0, 1.72, -1.8],
			yaw: Math.PI,
		}
		const { combat, contacts } = setup([attacker, other])
		combat.accept("attacker", { clientActionId: 1, type: "fistbump" }, 0)
		combat.accept("other", { clientActionId: 2, type: "fistbump" }, 0)
		combat.update(FISTBUMP_ACTIVE_START_MS)
		combat.update(FISTBUMP_ACTIVE_START_MS + 30)
		expect(contacts).toHaveLength(1)
		expect(contacts[0]).toMatchObject({ kind: "fistbump" })
	})

	test("emits one punch-bump while retaining ordinary pilot damage", () => {
		const other: MeleeCombatPlayer = {
			id: "other",
			position: [0, 1.72, -1.5],
			yaw: Math.PI,
		}
		const { combat, contacts, hits } = setup([attacker, other])
		combat.accept("other", { clientActionId: 1, type: "fistbump" }, 0)
		combat.accept(
			"attacker",
			{ clientActionId: 2, type: "punch" },
			FISTBUMP_ACTIVE_START_MS - PUNCH_WINDUP_MS,
		)
		combat.update(FISTBUMP_ACTIVE_START_MS)
		expect(contacts).toHaveLength(1)
		expect(contacts[0]?.kind).toBe("punch-bump")
		expect(hits).toHaveLength(1)
	})
})
