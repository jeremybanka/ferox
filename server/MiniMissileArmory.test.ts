import assert from "node:assert/strict"
import { test } from "vitest"

import { activeEquipmentSlot } from "../src/arena-protocol.ts"
import {
	MINI_MISSILE_AMMO,
	MINI_MISSILE_PICKUP_RESPAWN_SECONDS,
} from "../src/game-constants.ts"
import { MiniMissileArmory } from "./MiniMissileArmory.ts"

test("connect creates a deterministic ARC-only two-slot inventory", () => {
	const armory = new MiniMissileArmory([0, 0, 0])
	assert.deepEqual(armory.connect("pilot"), {
		activeSlot: 0,
		revision: 0,
		slots: [{ ammo: 28, weapon: "arc-blaster" }, null],
	})
	assert.equal(armory.switchActive("pilot", 1), false)
	assert.equal(armory.switchActive("unknown", 1), false)
})

test("pickup fills slot two, activates it, and rejects range and contention", () => {
	const armory = new MiniMissileArmory([0, 0, 0])
	armory.connect("first")
	armory.connect("second")

	assert.equal(armory.collect("first", [3, 0, 0]), false)
	assert.equal(armory.collect("first", [1, 0, 0]), true)
	assert.equal(armory.collect("second", [0, 0, 0]), false)
	assert.deepEqual(armory.equipment("first"), {
		activeSlot: 1,
		revision: 1,
		slots: [
			{ ammo: 28, weapon: "arc-blaster" },
			{ ammo: MINI_MISSILE_AMMO, weapon: "mini-missile" },
		],
	})
	assert.equal(armory.collect("first", [0, 0, 0]), false)
})

test("switching preserves ownership and per-slot ammo", () => {
	const armory = new MiniMissileArmory([0, 0, 0])
	armory.connect("holder")
	armory.collect("holder", [0, 0, 0])
	assert.equal(armory.consumeMiniMissile("holder"), true)
	assert.equal(armory.switchActive("holder", -1), true)
	assert.equal(
		activeEquipmentSlot(armory.equipment("holder")).weapon,
		"arc-blaster",
	)
	assert.equal(armory.pickup().ownerId, "holder")
	assert.equal(armory.consumeActive("holder", "guided-missile"), false)
	assert.equal(armory.consumeActive("holder", "projectile"), true)
	assert.equal(armory.switchActive("holder", 1), true)
	assert.deepEqual(armory.equipment("holder").slots, [
		{ ammo: 27, weapon: "arc-blaster" },
		{ ammo: MINI_MISSILE_AMMO - 1, weapon: "mini-missile" },
	])
})

test("reload applies only to the authoritative active reloadable slot", () => {
	const armory = new MiniMissileArmory([0, 0, 0])
	armory.connect("pilot")
	assert.equal(armory.consumeActive("pilot", "projectile"), true)
	assert.equal(armory.reloadActive("pilot"), true)
	assert.equal(activeEquipmentSlot(armory.equipment("pilot")).ammo, 28)
	armory.collect("pilot", [0, 0, 0])
	assert.equal(armory.reloadActive("pilot"), false)
})

test("dropping clears only slot two and returns a fully refilled pickup", () => {
	const armory = new MiniMissileArmory([0, 0, 0])
	armory.connect("holder")
	armory.connect("next")
	armory.consumeActive("holder", "projectile")
	armory.collect("holder", [0, 0, 0])
	armory.switchActive("holder", 1)
	assert.equal(armory.release("holder", 1_000), true)
	assert.deepEqual(armory.equipment("holder").slots, [
		{ ammo: 27, weapon: "arc-blaster" },
		null,
	])
	assert.equal(armory.equipment("holder").activeSlot, 0)
	assert.equal(armory.pickup().ownerId, null)
	assert.equal(
		armory.update(1_000 + MINI_MISSILE_PICKUP_RESPAWN_SECONDS * 1_000 - 1),
		false,
	)
	assert.equal(
		armory.update(1_000 + MINI_MISSILE_PICKUP_RESPAWN_SECONDS * 1_000),
		true,
	)
	assert.equal(armory.collect("next", [0, 0, 0]), true)
	assert.deepEqual(armory.equipment("next").slots[1], {
		ammo: MINI_MISSILE_AMMO,
		weapon: "mini-missile",
	})
})

test("zero ammo retains launcher ownership, active model, and unavailable pickup", () => {
	const armory = new MiniMissileArmory([0, 0, 0])
	armory.connect("holder")
	armory.connect("observer")
	armory.collect("holder", [0, 0, 0])
	for (let shot = 0; shot < MINI_MISSILE_AMMO; shot += 1) {
		assert.equal(armory.consumeMiniMissile("holder"), true)
	}
	const empty = armory.equipment("holder")
	assert.equal(empty.activeSlot, 1)
	assert.deepEqual(activeEquipmentSlot(empty), {
		ammo: 0,
		weapon: "mini-missile",
	})
	assert.deepEqual(armory.pickup(), {
		available: false,
		ownerId: "holder",
		position: [0, 0, 0],
		respawnAt: null,
	})
	assert.equal(armory.collect("observer", [0, 0, 0]), false)
	assert.equal(armory.consumeMiniMissile("holder"), false)
	assert.deepEqual(armory.equipment("holder"), empty)

	assert.equal(armory.switchActive("holder", -1), true)
	assert.equal(armory.activeWeapon("holder"), "arc-blaster")
	assert.equal(armory.switchActive("holder", 1), true)
	assert.deepEqual(activeEquipmentSlot(armory.equipment("holder")), {
		ammo: 0,
		weapon: "mini-missile",
	})
	assert.equal(armory.update(100_000), false)
	assert.equal(armory.pickup().ownerId, "holder")
})

test("explicit death release of an empty launcher clears slot two", () => {
	const armory = new MiniMissileArmory([0, 0, 0])
	armory.connect("pilot")
	armory.collect("pilot", [0, 0, 0])
	for (let shot = 0; shot < MINI_MISSILE_AMMO; shot += 1) {
		armory.consumeMiniMissile("pilot")
	}
	assert.equal(armory.release("pilot", 2_000), true)
	assert.equal(armory.activeWeapon("pilot"), "arc-blaster")
	assert.equal(armory.equipment("pilot").slots[1], null)
	assert.equal(
		armory.pickup().respawnAt,
		2_000 + MINI_MISSILE_PICKUP_RESPAWN_SECONDS * 1_000,
	)
})

test("disconnect releases an empty launcher and reconnect starts ARC-only", () => {
	const armory = new MiniMissileArmory([0, 0, 0])
	armory.connect("pilot")
	armory.collect("pilot", [0, 0, 0])
	for (let shot = 0; shot < MINI_MISSILE_AMMO; shot += 1) {
		armory.consumeMiniMissile("pilot")
	}
	armory.disconnect("pilot", 2_001)
	assert.equal(armory.pickup().ownerId, null)
	assert.deepEqual(armory.connect("pilot"), {
		activeSlot: 0,
		revision: 0,
		slots: [{ ammo: 28, weapon: "arc-blaster" }, null],
	})
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
	assert.deepEqual(armory.disconnect("one", 500), [
		{ playerId: "victim", snapshot: { attackers: 1 } },
	])
})
