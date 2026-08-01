import { describe, expect, test } from "vitest"

import type { Vector3Tuple } from "../src/arena-protocol.ts"
import { pilotTorsoTargetFromEye } from "../src/pilot-targeting.ts"
import {
	StandardLockTracker,
	type StandardLockPilotState,
} from "./StandardLockTracker.ts"

function pilot(
	id: string,
	position: Vector3Tuple,
	aimDirection: Vector3Tuple = [0, 0, -1],
	overrides: Partial<StandardLockPilotState> = {},
): StandardLockPilotState {
	return {
		aimDirection,
		crouching: false,
		equippedWeapon: "arc-blaster",
		freeAim: false,
		id,
		position,
		sprinting: false,
		...overrides,
	}
}

function direction(from: Vector3Tuple, to: Vector3Tuple): Vector3Tuple {
	const delta = [to[0] - from[0], to[1] - from[1], to[2] - from[2]] as const
	const length = Math.hypot(...delta)
	return [delta[0] / length, delta[1] / length, delta[2] / length]
}

describe("authoritative standard lock tracking", () => {
	test.each([false, true])(
		"validates the exact shared torso target for crouching=%s",
		(crouching) => {
			const tracker = new StandardLockTracker()
			const attackerEye: Vector3Tuple = [0, 1.72, 0]
			const victimEye: Vector3Tuple = [3, crouching ? 1.08 : 1.72, -12]
			const attacker = pilot("attacker", attackerEye)
			const victim = pilot("victim", victimEye, [0, 0, 1], { crouching })
			attacker.aimDirection = direction(
				attackerEye,
				pilotTorsoTargetFromEye(victimEye, crouching),
			)
			const pilots = new Map([
				[attacker.id, attacker],
				[victim.id, victim],
			])

			tracker.acceptIntent("attacker", { active: true, clientLockId: 1 })
			expect(tracker.reconcile(pilots)).toEqual([
				{ playerId: "victim", snapshot: { attackers: 1 } },
			])
		},
	)

	test("requires a targetless transition and derives the victim from aim", () => {
		const tracker = new StandardLockTracker()
		const pilots = new Map([
			["attacker", pilot("attacker", [0, 1.72, 0])],
			["victim", pilot("victim", [0, 1.72, -10])],
			["off-axis", pilot("off-axis", [12, 1.72, -10])],
		])

		expect(tracker.reconcile(pilots)).toEqual([])
		expect(
			tracker.acceptIntent("attacker", {
				active: true,
				clientLockId: 1,
				targetId: "off-axis",
			}),
		).toBe(false)
		expect(tracker.reconcile(pilots)).toEqual([])
		expect(
			tracker.acceptIntent("attacker", { active: true, clientLockId: 1 }),
		).toBe(true)
		expect(tracker.reconcile(pilots)).toEqual([
			{ playerId: "victim", snapshot: { attackers: 1 } },
		])
		expect(tracker.incoming("off-axis")).toEqual({ attackers: 0 })
		expect(
			tracker.acceptIntent("attacker", { active: false, clientLockId: 1 }),
		).toBe(false)
	})

	test("reconciles target changes, eligibility, range, and unlock", () => {
		const tracker = new StandardLockTracker()
		const attacker = pilot("attacker", [0, 1.72, 0])
		const first = pilot("first", [0, 1.72, -10])
		const second = pilot("second", [10, 1.72, 0])
		const pilots = new Map([
			[attacker.id, attacker],
			[first.id, first],
			[second.id, second],
		])
		tracker.acceptIntent("attacker", { active: true, clientLockId: 1 })
		expect(tracker.reconcile(pilots)).toEqual([
			{ playerId: "first", snapshot: { attackers: 1 } },
		])
		tracker.acceptIntent("attacker", { active: false, clientLockId: 2 })
		expect(tracker.reconcile(pilots)).toEqual([
			{ playerId: "first", snapshot: { attackers: 0 } },
		])
		tracker.acceptIntent("attacker", { active: true, clientLockId: 3 })
		expect(tracker.reconcile(pilots)).toEqual([
			{ playerId: "first", snapshot: { attackers: 1 } },
		])

		attacker.aimDirection = [1, -0.067, 0]
		expect(tracker.reconcile(pilots)).toEqual([
			{ playerId: "first", snapshot: { attackers: 0 } },
			{ playerId: "second", snapshot: { attackers: 1 } },
		])
		second.position = [60, 1.72, 0]
		expect(tracker.reconcile(pilots)).toEqual([
			{ playerId: "second", snapshot: { attackers: 0 } },
		])
		second.position = [10, 1.72, 0]
		expect(tracker.reconcile(pilots)).toEqual([
			{ playerId: "second", snapshot: { attackers: 1 } },
		])
		attacker.sprinting = true
		expect(tracker.reconcile(pilots)).toEqual([
			{ playerId: "second", snapshot: { attackers: 0 } },
		])
		attacker.sprinting = false
		attacker.equippedWeapon = "mini-missile"
		expect(tracker.reconcile(pilots)).toEqual([])
		attacker.equippedWeapon = "arc-blaster"
		expect(tracker.reconcile(pilots)).toEqual([
			{ playerId: "second", snapshot: { attackers: 1 } },
		])
		tracker.acceptIntent("attacker", { active: false, clientLockId: 4 })
		expect(tracker.reconcile(pilots)).toEqual([
			{ playerId: "second", snapshot: { attackers: 0 } },
		])
	})

	test("aggregates attackers and clears either side on lifecycle cleanup", () => {
		const tracker = new StandardLockTracker()
		const pilots = new Map([
			["left", pilot("left", [-1, 1.72, 0], [0.1, -0.067, -1])],
			["right", pilot("right", [1, 1.72, 0], [-0.1, -0.067, -1])],
			["victim", pilot("victim", [0, 1.72, -10], [0, 0, 1])],
		])
		tracker.acceptIntent("left", { active: true, clientLockId: 1 })
		tracker.acceptIntent("right", { active: true, clientLockId: 1 })
		expect(tracker.reconcile(pilots)).toEqual([
			{ playerId: "victim", snapshot: { attackers: 2 } },
		])
		expect(tracker.clearPlayer("left")).toEqual([
			{ playerId: "victim", snapshot: { attackers: 1 } },
		])
		expect(tracker.clearPlayer("victim")).toEqual([
			{ playerId: "victim", snapshot: { attackers: 0 } },
		])
	})
})
