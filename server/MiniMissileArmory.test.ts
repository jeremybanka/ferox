import assert from "node:assert/strict"
import { test } from "vitest"

import { activeEquipmentSlot } from "../src/arena-protocol.ts"
import {
	ARENA_WEAPON_INITIAL_DELAY_MS,
	ARENA_WEAPON_RESPAWN_MS,
	MINI_MISSILE_AMMO,
	MINI_MISSILE_PICKUP_RESPAWN_SECONDS,
} from "../src/game-constants.ts"
import { MiniMissileArmory } from "./MiniMissileArmory.ts"

const ARENA_TEST_PADS = [
	[-12, 0, 0],
	[0, 0, -12],
	[12, 0, 0],
	[0, 0, 12],
	[9, 0, 9],
	[-9, 0, -9],
	[14, 0, -4],
] as const

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

test("arena pickups have deterministic distinct pads and staggered openings", () => {
	const startedAt = 1_000
	const armory = new MiniMissileArmory([40, 0, 40], ARENA_TEST_PADS, startedAt)
	const initial = armory.arenaPickups()
	assert.equal(
		new Set(initial.map((pickup) => pickup.position.join(","))).size,
		5,
	)
	assert.equal(
		initial.find((pickup) => pickup.weapon === "shotgun")?.available,
		true,
	)
	assert.equal(
		initial.find((pickup) => pickup.weapon === "bubble-gun")?.availableAt,
		startedAt + ARENA_WEAPON_INITIAL_DELAY_MS["bubble-gun"],
	)
	assert.equal(
		initial.find((pickup) => pickup.weapon === "rail-gun")?.availableAt,
		startedAt + ARENA_WEAPON_INITIAL_DELAY_MS["rail-gun"],
	)
	assert.equal(armory.update(startedAt + 3_999), false)
	assert.equal(armory.update(startedAt + 4_000), true)
	assert.equal(
		armory.arenaPickups().find((pickup) => pickup.weapon === "bubble-gun")
			?.available,
		true,
	)
})

test("arena pickup collection is proximity validated, contended, rotating, and ammo persistent", () => {
	const armory = new MiniMissileArmory([40, 0, 40], ARENA_TEST_PADS, 0)
	armory.connect("first")
	armory.connect("second")
	armory.update(ARENA_WEAPON_INITIAL_DELAY_MS["rail-gun"])
	const firstPad = armory
		.arenaPickups()
		.find((pickup) => pickup.weapon === "shotgun")!
	assert.equal(
		armory.collectArenaWeapon("first", "shotgun", [0, 0, 0], 9_100),
		false,
	)
	assert.equal(
		armory.collectArenaWeapon("first", "shotgun", firstPad.position, 9_100),
		true,
	)
	assert.equal(
		armory.collectArenaWeapon("second", "shotgun", firstPad.position, 9_100),
		false,
	)
	assert.equal(armory.consumeActive("first", "shotgun"), true)
	assert.equal(armory.consumeActive("first", "shotgun"), true)
	assert.equal(armory.release("first", 10_000), true)
	const returning = armory
		.arenaPickups()
		.find((pickup) => pickup.weapon === "shotgun")!
	assert.notDeepEqual(returning.position, firstPad.position)
	assert.equal(returning.availableAt, 10_000 + ARENA_WEAPON_RESPAWN_MS.shotgun)
	assert.equal(
		new Set(armory.arenaPickups().map((pickup) => pickup.position.join(",")))
			.size,
		5,
	)
	assert.equal(armory.update(returning.availableAt! - 1), false)
	assert.equal(armory.update(returning.availableAt!), true)
	assert.equal(
		armory.collectArenaWeapon(
			"second",
			"shotgun",
			returning.position,
			returning.availableAt!,
		),
		true,
	)
	assert.deepEqual(activeEquipmentSlot(armory.equipment("second")), {
		ammo: 4,
		weapon: "shotgun",
	})
})

test("replacement, mini collection, death release, and disconnect never orphan pickup ownership", () => {
	const armory = new MiniMissileArmory([40, 0, 40], ARENA_TEST_PADS, 0)
	armory.connect("pilot")
	armory.update(ARENA_WEAPON_INITIAL_DELAY_MS["bubble-gun"])
	const shotgun = armory
		.arenaPickups()
		.find((pickup) => pickup.weapon === "shotgun")!
	const bubble = armory
		.arenaPickups()
		.find((pickup) => pickup.weapon === "bubble-gun")!
	assert.equal(
		armory.collectArenaWeapon("pilot", "shotgun", shotgun.position, 5_000),
		true,
	)
	assert.equal(
		armory.collectArenaWeapon("pilot", "bubble-gun", bubble.position, 5_001),
		true,
	)
	assert.equal(
		armory.arenaPickups().find((pickup) => pickup.weapon === "shotgun")
			?.ownerId,
		null,
	)
	assert.equal(
		armory.arenaPickups().find((pickup) => pickup.weapon === "bubble-gun")
			?.ownerId,
		"pilot",
	)
	assert.equal(armory.collect("pilot", [40, 0, 40], 5_002), true)
	assert.equal(armory.pickup().ownerId, "pilot")
	assert.equal(
		armory.arenaPickups().find((pickup) => pickup.weapon === "bubble-gun")
			?.ownerId,
		null,
	)
	assert.equal(armory.release("pilot", 6_000), true)
	assert.equal(armory.pickup().ownerId, null)
	armory.disconnect("pilot", 6_001)
	assert.equal(
		armory.arenaPickups().some((pickup) => pickup.ownerId === "pilot"),
		false,
	)
})

test("Bubble Gun carries eight rounds and refills its full magazine", () => {
	const armory = new MiniMissileArmory([40, 0, 40], ARENA_TEST_PADS, 0)
	armory.connect("pilot")
	armory.update(ARENA_WEAPON_INITIAL_DELAY_MS["bubble-gun"])
	const bubble = armory
		.arenaPickups()
		.find((pickup) => pickup.weapon === "bubble-gun")!
	assert.equal(
		armory.collectArenaWeapon("pilot", "bubble-gun", bubble.position, 5_000),
		true,
	)
	assert.equal(activeEquipmentSlot(armory.equipment("pilot")).ammo, 8)
	assert.equal(armory.consumeActive("pilot", "bubbles"), true)
	assert.equal(activeEquipmentSlot(armory.equipment("pilot")).ammo, 7)
	assert.equal(
		armory.refillReload("pilot", { gunId: "bubble-gun", slot: 1 }),
		true,
	)
	assert.equal(activeEquipmentSlot(armory.equipment("pilot")).ammo, 8)
})

test("captured reload refills ARC and Mini only while slot and gun stay active", () => {
	const armory = new MiniMissileArmory([0, 0, 0])
	armory.connect("pilot")
	assert.equal(armory.consumeActive("pilot", "projectile"), true)
	assert.equal(
		armory.refillReload("pilot", { gunId: "arc-blaster", slot: 0 }),
		true,
	)
	assert.equal(activeEquipmentSlot(armory.equipment("pilot")).ammo, 28)
	assert.equal(
		armory.refillReload("pilot", { gunId: "arc-blaster", slot: 0 }),
		false,
	)
	armory.collect("pilot", [0, 0, 0])
	assert.equal(armory.consumeMiniMissile("pilot"), true)
	assert.equal(
		armory.refillReload("pilot", { gunId: "arc-blaster", slot: 0 }),
		false,
	)
	assert.equal(
		armory.refillReload("pilot", { gunId: "mini-missile", slot: 1 }),
		true,
	)
	assert.equal(activeEquipmentSlot(armory.equipment("pilot")).ammo, 24)
})

test("switch, drop, and death invalidate captured reloads without late ammo", () => {
	const armory = new MiniMissileArmory([0, 0, 0])
	armory.connect("pilot")
	armory.collect("pilot", [0, 0, 0])
	armory.consumeMiniMissile("pilot")
	const miniReload = { gunId: "mini-missile", slot: 1 } as const
	assert.equal(armory.switchActive("pilot", -1), true)
	assert.equal(armory.refillReload("pilot", miniReload), false)
	assert.equal(armory.equipment("pilot").slots[1]?.ammo, 23)
	assert.equal(armory.switchActive("pilot", 1), true)
	assert.equal(armory.release("pilot", 1_000), true)
	assert.equal(armory.refillReload("pilot", miniReload), false)
	assert.equal(armory.equipment("pilot").slots[1], null)
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

test("respawn reset restores a full ARC-only default loadout", () => {
	const armory = new MiniMissileArmory([0, 0, 0])
	armory.connect("pilot")
	armory.consumeActive("pilot", "projectile")
	armory.collect("pilot", [0, 0, 0])
	armory.consumeMiniMissile("pilot")
	assert.equal(armory.release("pilot", 2_000), true)
	assert.equal(armory.resetLoadout("pilot"), true)
	assert.deepEqual(armory.equipment("pilot"), {
		activeSlot: 0,
		revision: 5,
		slots: [{ ammo: 28, weapon: "arc-blaster" }, null],
	})
	assert.equal(armory.resetLoadout("unknown"), false)
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
