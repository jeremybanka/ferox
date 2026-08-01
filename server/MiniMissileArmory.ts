import type {
	EquipmentSnapshot,
	EquipmentSlotSnapshot,
	IncomingLockSnapshot,
	MiniMissilePickupSnapshot,
	Vector3Tuple,
} from "../src/arena-protocol.ts"
import {
	MINI_MISSILE_PICKUP_RADIUS,
	MINI_MISSILE_PICKUP_RESPAWN_SECONDS,
} from "../src/game-constants.ts"
import { DEFAULT_GUN_ID, gunDefinition } from "../src/guns/GunDefinitions.ts"

export type LockUpdate = {
	playerId: string
	snapshot: IncomingLockSnapshot
}

function assertUnhandledWeapon(weapon: never): never {
	throw new Error(`Armory does not handle gun: ${String(weapon)}`)
}

type PlayerInventory = {
	activeSlot: 0 | 1
	revision: number
	slots: [EquipmentSlotSnapshot, EquipmentSlotSnapshot | null]
}

function defaultInventory(): PlayerInventory {
	return {
		activeSlot: 0,
		revision: 0,
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

	disconnect(playerId: string, now: number): LockUpdate[] {
		this.release(playerId, now)
		this.#inventories.delete(playerId)
		return this.clearLocksForPlayer(playerId)
	}

	collect(playerId: string, position: Vector3Tuple): boolean {
		const inventory = this.#inventories.get(playerId)
		if (inventory === undefined || inventory.slots[1] !== null) return false
		if (!this.#available || this.#ownerId !== null) return false
		const distance = Math.hypot(
			position[0] - this.#pickupPosition[0],
			position[1] - this.#pickupPosition[1],
			position[2] - this.#pickupPosition[2],
		)
		if (distance > MINI_MISSILE_PICKUP_RADIUS) return false
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

	switchActive(playerId: string, _direction: -1 | 1): boolean {
		const inventory = this.#inventories.get(playerId)
		if (inventory === undefined || inventory.slots[1] === null) return false
		inventory.activeSlot = inventory.activeSlot === 0 ? 1 : 0
		inventory.revision += 1
		return true
	}

	reloadActive(playerId: string): boolean {
		const inventory = this.#inventories.get(playerId)
		if (inventory === undefined) return false
		const slot = inventory.slots[inventory.activeSlot]
		if (slot === null) return false
		const gun = gunDefinition(slot.weapon)
		if (!gun.capabilities.reload || slot.ammo >= gun.magazineSize) return false
		slot.ammo = gun.magazineSize
		inventory.revision += 1
		return true
	}

	consumeActive(
		playerId: string,
		fireType: "guided-missile" | "projectile",
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
		// Only explicit drop, death, or disconnect reaches this path. Collection
		// creates a fresh full magazine after the configured world-return delay.
		const inventory = this.#inventories.get(playerId)
		this.#ownerId = null
		this.#available = false
		this.#respawnAt = now + MINI_MISSILE_PICKUP_RESPAWN_SECONDS * 1_000
		if (inventory !== undefined) {
			inventory.slots[1] = null
			inventory.activeSlot = 0
			inventory.revision += 1
		}
		return true
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

	activeWeapon(playerId: string): "arc-blaster" | "mini-missile" {
		const equipment = this.equipment(playerId)
		const weapon = equipment.slots[equipment.activeSlot]?.weapon
		if (weapon === "arc-blaster" || weapon === "mini-missile") return weapon
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
