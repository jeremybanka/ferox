import { describe, expect, test } from "vitest"

import {
	activeEquipmentSlot,
	isEquipmentSnapshot,
	isInventoryActionIntent,
	isNewEquipmentSnapshot,
	isNewInventoryActionIntent,
} from "../arena-protocol.ts"
import {
	MINI_MISSILE_AMMO,
	MINI_MISSILE_CLIENT_COOLDOWN_SECONDS,
	MINI_MISSILE_SERVER_MINIMUM_INTERVAL_MS,
	MINI_MISSILE_SPEED,
} from "../game-constants.ts"
import {
	DEFAULT_GUN_ID,
	GUN_DEFINITIONS,
	GUN_IDS,
	gunDefinition,
	isGunId,
} from "./GunDefinitions.ts"

describe("gun definitions", () => {
	test("exhaustively defines every registered gun exactly once", () => {
		expect(Object.keys(GUN_DEFINITIONS).sort()).toEqual([...GUN_IDS].sort())
		for (const id of GUN_IDS) {
			const definition = gunDefinition(id)
			expect(definition.id).toBe(id)
			expect(definition.model).toBe(id)
			expect(definition.magazineSize).toBeGreaterThan(0)
			expect(definition.fire.clientCooldownSeconds).toBeGreaterThan(0)
			expect(definition.fire.serverMinimumIntervalMs).toBeGreaterThan(0)
			for (const view of ["firstPerson", "thirdPerson"] as const) {
				const transform = definition.presentation[view]
				expect(
					[
						...transform.position,
						...transform.rotation,
						...transform.scale,
					].every(Number.isFinite),
				).toBe(true)
			}
		}
		expect(DEFAULT_GUN_ID).toBe("arc-blaster")
	})

	test("describes distinct capabilities and tuning", () => {
		const blaster = gunDefinition("arc-blaster")
		const launcher = gunDefinition("mini-missile")
		expect(blaster.capabilities).toEqual({
			fire: true,
			pickup: false,
			reload: true,
		})
		expect(blaster.fire.type).toBe("projectile")
		expect(launcher.capabilities).toEqual({
			fire: true,
			pickup: true,
			reload: false,
		})
		expect(launcher.fire.type).toBe("guided-missile")
		expect(launcher.magazineSize).toBe(MINI_MISSILE_AMMO)
		expect(launcher.magazineSize).toBe(24)
		expect(launcher.fire.clientCooldownSeconds).toBe(
			MINI_MISSILE_CLIENT_COOLDOWN_SECONDS,
		)
		expect(launcher.fire.serverMinimumIntervalMs).toBe(
			MINI_MISSILE_SERVER_MINIMUM_INTERVAL_MS,
		)
		expect(launcher.tuning).toMatchObject({ speed: MINI_MISSILE_SPEED })
		expect(MINI_MISSILE_SPEED).toBe(14)
		expect(launcher.name).not.toBe(blaster.name)
	})

	test("validates registered IDs and rejects unknown network values", () => {
		for (const id of GUN_IDS) expect(isGunId(id)).toBe(true)
		expect(isGunId("railgun")).toBe(false)
		expect(isGunId(null)).toBe(false)
	})
})

describe("equipment protocol", () => {
	test("accepts strict sequenced inventory actions without client gun IDs", () => {
		expect(
			isInventoryActionIntent({ clientActionId: 1, type: "collect" }),
		).toBe(true)
		expect(
			isInventoryActionIntent({
				clientActionId: 2,
				direction: -1,
				type: "switch",
			}),
		).toBe(true)
		expect(
			isInventoryActionIntent({
				clientActionId: 3,
				type: "drop-mini-missile",
			}),
		).toBe(true)
		expect(isInventoryActionIntent({ clientActionId: 4, type: "reload" })).toBe(
			true,
		)
		expect(
			isInventoryActionIntent({
				clientActionId: 5,
				type: "switch",
				weapon: "mini-missile",
			}),
		).toBe(false)
		expect(
			isNewInventoryActionIntent({ clientActionId: 5, type: "collect" }, 4),
		).toBe(true)
		expect(
			isNewInventoryActionIntent({ clientActionId: 5, type: "collect" }, 5),
		).toBe(false)
	})

	test("accepts strict authoritative two-slot snapshots", () => {
		const snapshot = {
			activeSlot: 1,
			revision: 4,
			slots: [
				{ ammo: 27, weapon: "arc-blaster" },
				{ ammo: 0, weapon: "mini-missile" },
			],
		} as const
		expect(isEquipmentSnapshot(snapshot)).toBe(true)
		expect(isNewEquipmentSnapshot(snapshot, 3)).toBe(true)
		expect(isNewEquipmentSnapshot(snapshot, 4)).toBe(false)
		expect(activeEquipmentSlot(snapshot)).toEqual(snapshot.slots[1])
		expect(activeEquipmentSlot(snapshot).ammo).toBe(0)
		expect(isEquipmentSnapshot({ ...snapshot, activeSlot: 2 })).toBe(false)
		expect(isEquipmentSnapshot({ ...snapshot, revision: -1 })).toBe(false)
		expect(
			isEquipmentSnapshot({
				...snapshot,
				slots: [snapshot.slots[0], null],
			}),
		).toBe(false)
		expect(
			isEquipmentSnapshot({
				...snapshot,
				slots: [{ ammo: -1, weapon: "arc-blaster" }, snapshot.slots[1]],
			}),
		).toBe(false)
		expect(isEquipmentSnapshot({ ...snapshot, extra: true })).toBe(false)
	})
})
