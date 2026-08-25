import { describe, expect, test } from "vitest"

import {
	VAMP_HEALTH_PICKUP_CAP,
	VAMP_HEALTH_PICKUP_LIFETIME_MS,
} from "../src/game-constants.ts"
import { PlayerLifecycle } from "./PlayerLifecycle.ts"
import { VampHealthPickupField } from "./VampHealthPickups.ts"

describe("authoritative Vamp health pickups", () => {
	test("spawns one replicated +1 pickup per successful hit", () => {
		const field = new VampHealthPickupField()
		expect(field.spawn("shooter", [1, 2, 3], 100)).toEqual({
			amount: 1,
			expiresAt: 100 + VAMP_HEALTH_PICKUP_LIFETIME_MS,
			id: 0,
			ownerId: "shooter",
			position: [1, 2, 3],
		})
		expect(field.snapshots()).toHaveLength(1)
	})

	test("allows one eligible contender to heal once and consumes once", () => {
		const field = new VampHealthPickupField()
		const lifecycle = new PlayerLifecycle()
		lifecycle.add("first")
		lifecycle.add("second")
		lifecycle.damage("first", 2, 0)
		lifecycle.damage("second", 2, 0)
		field.spawn("shooter", [0, 0, 0], 0)
		expect(
			field.collect("ineligible", [0, 0, 0], false, () =>
				lifecycle.heal("first", 1),
			),
		).toBeNull()
		expect(
			field.collect("first", [0, 0, 0], true, () => lifecycle.heal("first", 1)),
		).not.toBeNull()
		expect(lifecycle.get("first")?.health).toBe(99)
		expect(
			field.collect("second", [0, 0, 0], true, () =>
				lifecycle.heal("second", 1),
			),
		).toBeNull()
		expect(lifecycle.get("second")?.health).toBe(98)
	})

	test("does not consume at the heal cap or for a dead carrier", () => {
		const field = new VampHealthPickupField()
		const lifecycle = new PlayerLifecycle()
		lifecycle.add("full")
		lifecycle.add("dead")
		lifecycle.damage("dead", 100, 0)
		field.spawn("shooter", [0, 0, 0], 0)
		expect(
			field.collect("full", [0, 0, 0], true, () => lifecycle.heal("full", 1)),
		).toBeNull()
		expect(
			field.collect("dead", [0, 0, 0], true, () => lifecycle.heal("dead", 1)),
		).toBeNull()
		expect(field.snapshots()).toHaveLength(1)
	})

	test("expires, clears owner state, and remains bounded", () => {
		const field = new VampHealthPickupField()
		for (let index = 0; index <= VAMP_HEALTH_PICKUP_CAP; index += 1) {
			field.spawn(index % 2 === 0 ? "even" : "odd", [index, 0, 0], index)
		}
		expect(field.snapshots()).toHaveLength(VAMP_HEALTH_PICKUP_CAP)
		expect(field.snapshots().some((pickup) => pickup.id === 0)).toBe(false)
		expect(field.clearOwner("even")).toBe(true)
		expect(field.snapshots().every((pickup) => pickup.ownerId === "odd")).toBe(
			true,
		)
		expect(
			field.advance(VAMP_HEALTH_PICKUP_LIFETIME_MS + VAMP_HEALTH_PICKUP_CAP),
		).toBe(true)
		expect(field.snapshots()).toEqual([])
	})
})
