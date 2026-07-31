import { describe, expect, test } from "vitest"

import { isEquipIntent, isEquipmentSnapshot } from "../arena-protocol.ts"
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
		expect(launcher.name).not.toBe(blaster.name)
	})

	test("validates registered IDs and rejects unknown network values", () => {
		for (const id of GUN_IDS) expect(isGunId(id)).toBe(true)
		expect(isGunId("railgun")).toBe(false)
		expect(isGunId(null)).toBe(false)
	})
})

describe("equipment protocol", () => {
	test("accepts strict equip intents for every registered gun", () => {
		for (const weapon of GUN_IDS) expect(isEquipIntent({ weapon })).toBe(true)
		expect(isEquipIntent({ ammo: 0, weapon: "arc-blaster" })).toBe(false)
		expect(isEquipIntent({ weapon: "railgun" })).toBe(false)
		expect(isEquipIntent(null)).toBe(false)
	})

	test("accepts strict authoritative snapshots and rejects bad ammo or IDs", () => {
		for (const weapon of GUN_IDS) {
			expect(isEquipmentSnapshot({ ammo: 1, weapon })).toBe(true)
		}
		expect(isEquipmentSnapshot({ ammo: -1, weapon: "arc-blaster" })).toBe(false)
		expect(isEquipmentSnapshot({ ammo: 1.5, weapon: "arc-blaster" })).toBe(
			false,
		)
		expect(isEquipmentSnapshot({ ammo: 1, weapon: "railgun" })).toBe(false)
		expect(
			isEquipmentSnapshot({ ammo: 1, extra: true, weapon: "arc-blaster" }),
		).toBe(false)
	})
})
