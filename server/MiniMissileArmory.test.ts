import assert from "node:assert/strict"
import { test } from "vitest"

import {
	MINI_MISSILE_AMMO,
	MINI_MISSILE_PICKUP_RESPAWN_SECONDS,
} from "../src/game-constants.ts"
import { MiniMissileArmory } from "./MiniMissileArmory.ts"

test("pickup collection is range checked, contested, and holder-only", () => {
	const armory = new MiniMissileArmory([0, 0, 0])
	armory.connect("first")
	armory.connect("second")

	assert.equal(armory.collect("first", [3, 0, 0]), false)
	assert.equal(armory.collect("first", [1, 0, 0]), true)
	assert.equal(armory.collect("second", [0, 0, 0]), false)
	assert.deepEqual(armory.equipment("first"), {
		ammo: MINI_MISSILE_AMMO,
		weapon: "mini-missile",
	})
	assert.equal(armory.consumeMiniMissile("second"), false)
	assert.equal(armory.consumeMiniMissile("first"), true)
	assert.equal(armory.equipment("first").ammo, MINI_MISSILE_AMMO - 1)
})

test("dropping the weapon clears ownership and respawns it after the named delay", () => {
	const armory = new MiniMissileArmory([0, 0, 0])
	armory.connect("holder")
	armory.collect("holder", [0, 0, 0])
	assert.equal(armory.equip("holder", "arc-blaster", 1_000), true)
	assert.equal(armory.pickup().available, false)
	assert.equal(armory.pickup().ownerId, null)
	assert.equal(
		armory.update(1_000 + MINI_MISSILE_PICKUP_RESPAWN_SECONDS * 1_000 - 1),
		false,
	)
	assert.equal(
		armory.update(1_000 + MINI_MISSILE_PICKUP_RESPAWN_SECONDS * 1_000),
		true,
	)
	assert.equal(armory.pickup().available, true)
})

test("incoming locks aggregate unique attackers and clear independently", () => {
	const armory = new MiniMissileArmory([0, 0, 0])
	assert.deepEqual(armory.setLock("one", "victim", true), [
		{ playerId: "victim", snapshot: { attackers: 1 } },
	])
	assert.deepEqual(armory.setLock("one", "victim", true), [])
	assert.deepEqual(armory.setLock("two", "victim", true), [
		{ playerId: "victim", snapshot: { attackers: 2 } },
	])
	assert.deepEqual(armory.setLock("one", "victim", false), [
		{ playerId: "victim", snapshot: { attackers: 1 } },
	])
	assert.deepEqual(armory.incoming("victim"), { attackers: 1 })
})

test("disconnect releases inventory and clears attacker and victim lock state", () => {
	const armory = new MiniMissileArmory([0, 0, 0])
	armory.connect("departing")
	armory.collect("departing", [0, 0, 0])
	armory.setLock("departing", "other", true)
	armory.setLock("other", "departing", true)

	const updates = armory.disconnect("departing", 500)
	assert.deepEqual(updates, [
		{ playerId: "departing", snapshot: { attackers: 0 } },
		{ playerId: "other", snapshot: { attackers: 0 } },
	])
	assert.equal(armory.pickup().ownerId, null)
	assert.deepEqual(armory.equipment("departing"), {
		ammo: 28,
		weapon: "arc-blaster",
	})
})

test("depletion waits for active missiles before resetting to the default gun", () => {
	const armory = new MiniMissileArmory([0, 0, 0])
	armory.connect("holder")
	armory.collect("holder", [0, 0, 0])
	for (let shot = 0; shot < MINI_MISSILE_AMMO; shot += 1) {
		assert.equal(armory.consumeMiniMissile("holder"), true)
	}
	assert.equal(armory.releaseIfSpent("holder", 1, 1_000), false)
	assert.deepEqual(armory.equipment("holder"), {
		ammo: 0,
		weapon: "mini-missile",
	})
	assert.equal(armory.releaseIfSpent("holder", 0, 1_001), true)
	assert.deepEqual(armory.equipment("holder"), {
		ammo: 28,
		weapon: "arc-blaster",
	})
})

test("death release and reconnect both restore a clean blaster loadout", () => {
	const armory = new MiniMissileArmory([0, 0, 0])
	armory.connect("pilot")
	armory.collect("pilot", [0, 0, 0])
	assert.equal(armory.release("pilot", 2_000), true)
	assert.deepEqual(armory.equipment("pilot"), {
		ammo: 28,
		weapon: "arc-blaster",
	})

	armory.disconnect("pilot", 2_001)
	assert.deepEqual(armory.connect("pilot"), {
		ammo: 28,
		weapon: "arc-blaster",
	})
})
