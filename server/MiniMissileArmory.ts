import type {
	EquipmentSnapshot,
	IncomingLockSnapshot,
	MiniMissilePickupSnapshot,
	Vector3Tuple,
	WeaponKind,
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

export class MiniMissileArmory {
	readonly #incomingLocks = new Map<string, Set<string>>()
	readonly #pickupPosition: Vector3Tuple
	readonly #weapons = new Map<string, WeaponKind>()
	#ammo = 0
	#available = true
	#ownerId: string | null = null
	#respawnAt: number | null = null

	constructor(pickupPosition: Vector3Tuple) {
		this.#pickupPosition = pickupPosition
	}

	connect(playerId: string): EquipmentSnapshot {
		this.#weapons.set(playerId, DEFAULT_GUN_ID)
		return this.equipment(playerId)
	}

	disconnect(playerId: string, now: number): LockUpdate[] {
		this.release(playerId, now)
		this.#weapons.delete(playerId)
		return this.clearLocksForPlayer(playerId)
	}

	collect(playerId: string, position: Vector3Tuple): boolean {
		if (!this.#available || this.#ownerId !== null) return false
		const distance = Math.hypot(
			position[0] - this.#pickupPosition[0],
			position[1] - this.#pickupPosition[1],
			position[2] - this.#pickupPosition[2],
		)
		if (distance > MINI_MISSILE_PICKUP_RADIUS) return false
		this.#available = false
		this.#ownerId = playerId
		this.#ammo = gunDefinition("mini-missile").magazineSize
		this.#respawnAt = null
		this.#weapons.set(playerId, "mini-missile")
		return true
	}

	equip(playerId: string, weapon: WeaponKind, now: number): boolean {
		if (!this.#weapons.has(playerId)) return false
		switch (weapon) {
			case "mini-missile":
				if (this.#ownerId !== playerId || this.#ammo <= 0) return false
				this.#weapons.set(playerId, weapon)
				return true
			case "arc-blaster":
				this.#weapons.set(playerId, weapon)
				if (this.#ownerId === playerId) this.release(playerId, now)
				return true
			default:
				return assertUnhandledWeapon(weapon)
		}
	}

	consumeMiniMissile(playerId: string): boolean {
		if (
			this.#ownerId !== playerId ||
			this.#weapons.get(playerId) !== "mini-missile" ||
			this.#ammo <= 0
		)
			return false
		this.#ammo -= 1
		return true
	}

	restoreMiniMissile(playerId: string): void {
		if (this.#ownerId === playerId)
			this.#ammo = Math.min(
				gunDefinition("mini-missile").magazineSize,
				this.#ammo + 1,
			)
	}

	releaseIfSpent(
		playerId: string,
		activeMissiles: number,
		now: number,
	): boolean {
		if (this.#ownerId !== playerId || this.#ammo > 0 || activeMissiles > 0) {
			return false
		}
		this.release(playerId, now)
		return true
	}

	release(playerId: string, now: number): boolean {
		if (this.#ownerId !== playerId) return false
		this.#ownerId = null
		this.#ammo = 0
		this.#available = false
		this.#respawnAt = now + MINI_MISSILE_PICKUP_RESPAWN_SECONDS * 1_000
		this.#weapons.set(playerId, DEFAULT_GUN_ID)
		return true
	}

	update(now: number): boolean {
		if (this.#respawnAt === null || now < this.#respawnAt) return false
		this.#available = true
		this.#respawnAt = null
		return true
	}

	equipment(playerId: string): EquipmentSnapshot {
		const weapon = this.#weapons.get(playerId) ?? DEFAULT_GUN_ID
		let ammo: number
		switch (weapon) {
			case "arc-blaster":
				ammo = gunDefinition(weapon).magazineSize
				break
			case "mini-missile":
				ammo = this.#ownerId === playerId ? this.#ammo : 0
				break
			default:
				return assertUnhandledWeapon(weapon)
		}
		return {
			ammo,
			weapon,
		}
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
