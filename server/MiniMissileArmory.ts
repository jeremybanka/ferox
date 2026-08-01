import type {
	EquipmentSnapshot,
	EquipmentSlotSnapshot,
	IncomingLockSnapshot,
	MiniMissilePickupSnapshot,
	ReloadSnapshot,
	Vector3Tuple,
} from "../src/arena-protocol.ts"
import {
	MINI_MISSILE_PICKUP_RADIUS,
	MINI_MISSILE_PICKUP_RESPAWN_SECONDS,
} from "../src/game-constants.ts"
import {
	DEFAULT_GUN_ID,
	gunDefinition,
	type GunId,
} from "../src/guns/GunDefinitions.ts"

export type LockUpdate = {
	playerId: string
	snapshot: IncomingLockSnapshot
}

function assertUnhandledWeapon(weapon: never): never {
	throw new Error(`Armory does not handle gun: ${String(weapon)}`)
}

function assertUnhandledReloadRule(rule: never): never {
	throw new Error(`Armory does not handle reload rule: ${String(rule)}`)
}

type PlayerInventory = {
	activeSlot: 0 | 1
	revision: number
	secondaryAmmo: Partial<Record<SecondaryGunId, number>>
	selectedSecondary: SecondaryGunId | null
	slots: [EquipmentSlotSnapshot, EquipmentSlotSnapshot | null]
}

type SecondaryGunId = Exclude<GunId, "arc-blaster" | "mini-missile">

function defaultInventory(): PlayerInventory {
	return {
		activeSlot: 0,
		revision: 0,
		secondaryAmmo: {},
		selectedSecondary: null,
		slots: [
			{
				ammo: gunDefinition(DEFAULT_GUN_ID).magazineSize,
				weapon: DEFAULT_GUN_ID,
			},
			null,
		],
	}
}

export class MiniMissileArmory {
	readonly #incomingLocks = new Map<string, Set<string>>()
	readonly #inventories = new Map<string, PlayerInventory>()
	readonly #pickupPosition: Vector3Tuple
	#available = true
	#ownerId: string | null = null
	#respawnAt: number | null = null

	constructor(pickupPosition: Vector3Tuple) {
		this.#pickupPosition = pickupPosition
	}

	connect(playerId: string): EquipmentSnapshot {
		this.#inventories.set(playerId, defaultInventory())
		return this.equipment(playerId)
	}

	resetLoadout(playerId: string): boolean {
		const inventory = this.#inventories.get(playerId)
		if (inventory === undefined) return false
		const reset = defaultInventory()
		reset.revision = inventory.revision + 1
		this.#inventories.set(playerId, reset)
		return true
	}

	disconnect(playerId: string, now: number): LockUpdate[] {
		this.release(playerId, now)
		this.#inventories.delete(playerId)
		return this.clearLocksForPlayer(playerId)
	}

	collect(playerId: string, position: Vector3Tuple): boolean {
		const inventory = this.#inventories.get(playerId)
		if (inventory === undefined) return false
		if (!this.#available || this.#ownerId !== null) return false
		const distance = Math.hypot(
			position[0] - this.#pickupPosition[0],
			position[1] - this.#pickupPosition[1],
			position[2] - this.#pickupPosition[2],
		)
		if (distance > MINI_MISSILE_PICKUP_RADIUS) return false
		this.#saveSecondarySlot(inventory)
		this.#available = false
		this.#ownerId = playerId
		this.#respawnAt = null
		inventory.slots[1] = {
			ammo: gunDefinition("mini-missile").magazineSize,
			weapon: "mini-missile",
		}
		inventory.activeSlot = 1
		inventory.revision += 1
		return true
	}

	selectSecondary(playerId: string, weapon: SecondaryGunId): boolean {
		const inventory = this.#inventories.get(playerId)
		if (inventory === undefined || this.#ownerId === playerId) return false
		if (inventory.slots[1]?.weapon === weapon) {
			if (inventory.activeSlot === 1) return false
			inventory.activeSlot = 1
			inventory.revision += 1
			return true
		}
		this.#saveSecondarySlot(inventory)
		const gun = gunDefinition(weapon)
		const ammo = inventory.secondaryAmmo[weapon] ?? gun.magazineSize
		if (ammo < 0 || ammo > gun.magazineSize) return false
		inventory.slots[1] = {
			ammo,
			weapon,
		}
		inventory.selectedSecondary = weapon
		inventory.activeSlot = 1
		inventory.revision += 1
		this.#saveSecondarySlot(inventory)
		return true
	}

	switchActive(playerId: string, _direction: -1 | 1): boolean {
		const inventory = this.#inventories.get(playerId)
		if (inventory === undefined || inventory.slots[1] === null) return false
		inventory.activeSlot = inventory.activeSlot === 0 ? 1 : 0
		inventory.revision += 1
		return true
	}

	refillReload(
		playerId: string,
		reload: Pick<ReloadSnapshot, "gunId" | "slot">,
	): boolean {
		const inventory = this.#inventories.get(playerId)
		if (inventory === undefined || inventory.activeSlot !== reload.slot)
			return false
		const slot = inventory.slots[reload.slot]
		if (slot === null || slot.weapon !== reload.gunId) return false
		const gun = gunDefinition(slot.weapon)
		if (!gun.capabilities.reload || slot.ammo >= gun.magazineSize) return false
		switch (gun.reload.ammoRule) {
			case "insert-shell":
				slot.ammo += 1
				break
			case "refill-magazine":
				slot.ammo = gun.magazineSize
				break
			default:
				return assertUnhandledReloadRule(gun.reload.ammoRule)
		}
		inventory.revision += 1
		this.#saveSecondarySlot(inventory)
		return true
	}

	consumeActive(
		playerId: string,
		fireType:
			| "ballistic"
			| "bubbles"
			| "guided-missile"
			| "hitscan"
			| "projectile",
	): boolean {
		const inventory = this.#inventories.get(playerId)
		if (inventory === undefined) return false
		const slot = inventory.slots[inventory.activeSlot]
		if (
			slot === null ||
			gunDefinition(slot.weapon).fire.type !== fireType ||
			slot.ammo <= 0
		)
			return false
		slot.ammo -= 1
		inventory.revision += 1
		this.#saveSecondarySlot(inventory)
		return true
	}

	consumeMiniMissile(playerId: string): boolean {
		if (
			this.#ownerId !== playerId ||
			this.activeWeapon(playerId) !== "mini-missile"
		)
			return false
		return this.consumeActive(playerId, "guided-missile")
	}

	restoreActive(playerId: string): void {
		const inventory = this.#inventories.get(playerId)
		if (inventory === undefined) return
		const slot = inventory.slots[inventory.activeSlot]
		if (slot === null) return
		slot.ammo = Math.min(gunDefinition(slot.weapon).magazineSize, slot.ammo + 1)
		inventory.revision += 1
		this.#saveSecondarySlot(inventory)
	}

	restoreMiniMissile(playerId: string): void {
		const inventory = this.#inventories.get(playerId)
		const slot = inventory?.slots[1]
		if (this.#ownerId === playerId && inventory !== undefined && slot != null) {
			slot.ammo = Math.min(
				gunDefinition("mini-missile").magazineSize,
				slot.ammo + 1,
			)
			inventory.revision += 1
		}
	}

	release(playerId: string, now: number): boolean {
		if (this.#ownerId !== playerId) return false
		// Only explicit drop, death, or disconnect reaches this path. Return the
		// launcher to the world and reveal the preserved selectable secondary.
		const inventory = this.#inventories.get(playerId)
		this.#ownerId = null
		this.#available = false
		this.#respawnAt = now + MINI_MISSILE_PICKUP_RESPAWN_SECONDS * 1_000
		if (inventory !== undefined) {
			const secondary = inventory.selectedSecondary
			inventory.slots[1] =
				secondary === null
					? null
					: {
							ammo:
								inventory.secondaryAmmo[secondary] ??
								gunDefinition(secondary).magazineSize,
							weapon: secondary,
						}
			inventory.activeSlot = 0
			inventory.revision += 1
		}
		return true
	}

	#saveSecondarySlot(inventory: PlayerInventory): void {
		const secondary = inventory.slots[1]
		if (
			secondary === null ||
			secondary.weapon === "arc-blaster" ||
			secondary.weapon === "mini-missile"
		)
			return
		inventory.secondaryAmmo[secondary.weapon] = secondary.ammo
		inventory.selectedSecondary = secondary.weapon
	}

	update(now: number): boolean {
		if (this.#respawnAt === null || now < this.#respawnAt) return false
		this.#available = true
		this.#respawnAt = null
		return true
	}

	equipment(playerId: string): EquipmentSnapshot {
		const inventory = this.#inventories.get(playerId) ?? defaultInventory()
		return {
			activeSlot: inventory.activeSlot,
			revision: inventory.revision,
			slots: [
				{ ...inventory.slots[0] },
				inventory.slots[1] === null ? null : { ...inventory.slots[1] },
			],
		}
	}

	activeWeapon(playerId: string): GunId {
		const equipment = this.equipment(playerId)
		const weapon = equipment.slots[equipment.activeSlot]?.weapon
		if (weapon !== undefined) return weapon
		return assertUnhandledWeapon(weapon as never)
	}

	pickup(): MiniMissilePickupSnapshot {
		return {
			available: this.#available,
			ownerId: this.#ownerId,
			position: [...this.#pickupPosition],
			respawnAt: this.#respawnAt,
		}
	}

	setLock(attackerId: string, targetId: string, locked: boolean): LockUpdate[] {
		if (attackerId === targetId) return []
		let attackers = this.#incomingLocks.get(targetId)
		if (attackers === undefined) {
			attackers = new Set()
			this.#incomingLocks.set(targetId, attackers)
		}
		const previousCount = attackers.size
		if (locked) attackers.add(attackerId)
		else attackers.delete(attackerId)
		if (attackers.size === 0) this.#incomingLocks.delete(targetId)
		if (attackers.size === previousCount) return []
		return [{ playerId: targetId, snapshot: { attackers: attackers.size } }]
	}

	clearLocksForPlayer(playerId: string): LockUpdate[] {
		const updates: LockUpdate[] = []
		if (this.#incomingLocks.delete(playerId)) {
			updates.push({ playerId, snapshot: { attackers: 0 } })
		}
		for (const [targetId, attackers] of this.#incomingLocks) {
			if (!attackers.delete(playerId)) continue
			if (attackers.size === 0) this.#incomingLocks.delete(targetId)
			updates.push({
				playerId: targetId,
				snapshot: { attackers: attackers.size },
			})
		}
		return updates
	}

	incoming(playerId: string): IncomingLockSnapshot {
		return { attackers: this.#incomingLocks.get(playerId)?.size ?? 0 }
	}
}
