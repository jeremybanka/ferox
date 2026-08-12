import type {
	EquipmentSnapshot,
	EquipmentSlotSnapshot,
	ArenaWeaponPickupSnapshot,
	IncomingLockSnapshot,
	MiniMissilePickupSnapshot,
	ReloadSnapshot,
	Vector3Tuple,
} from "../src/arena-protocol.ts"
import {
	MINI_MISSILE_PICKUP_RADIUS,
	MINI_MISSILE_PICKUP_RESPAWN_SECONDS,
	ARENA_WEAPON_INITIAL_DELAY_MS,
	ARENA_WEAPON_PICKUP_RADIUS,
	ARENA_WEAPON_RESPAWN_MS,
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
	slots: [EquipmentSlotSnapshot, EquipmentSlotSnapshot | null]
}

type SecondaryGunId = Exclude<GunId, "arc-blaster" | "mini-missile">

type ArenaWeaponPickupState = {
	ammo: number
	available: boolean
	availableAt: number | null
	ownerId: string | null
	padIndex: number
	weapon: SecondaryGunId
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
	readonly #arenaPickups = new Map<SecondaryGunId, ArenaWeaponPickupState>()
	readonly #arenaPickupPads: readonly (readonly [number, number, number])[]
	readonly #incomingLocks = new Map<string, Set<string>>()
	readonly #inventories = new Map<string, PlayerInventory>()
	readonly #pickupPosition: Vector3Tuple
	#available = true
	#ownerId: string | null = null
	#respawnAt: number | null = null

	constructor(
		pickupPosition: Vector3Tuple,
		arenaPickupPads: readonly (readonly [number, number, number])[] = [],
		startedAt = 0,
	) {
		this.#pickupPosition = pickupPosition
		this.#arenaPickupPads = arenaPickupPads
		const guns = [
			"shotgun",
			"bubble-gun",
			"rail-gun",
			"ion-beam-rifle",
			"heavy-laser",
		] as const
		const preferredPads = [0, 2, 4, 1, 3]
		const occupied = new Set<number>()
		for (const [index, weapon] of guns.entries()) {
			if (arenaPickupPads.length === 0) continue
			let padIndex = (preferredPads[index] ?? index) % arenaPickupPads.length
			while (occupied.has(padIndex))
				padIndex = (padIndex + 1) % arenaPickupPads.length
			occupied.add(padIndex)
			const delay = ARENA_WEAPON_INITIAL_DELAY_MS[weapon]
			this.#arenaPickups.set(weapon, {
				ammo: gunDefinition(weapon).magazineSize,
				available: delay === 0,
				availableAt: delay === 0 ? null : startedAt + delay,
				ownerId: null,
				padIndex,
				weapon,
			})
		}
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

	collect(playerId: string, position: Vector3Tuple, now = Date.now()): boolean {
		const inventory = this.#inventories.get(playerId)
		if (inventory === undefined) return false
		if (!this.#available || this.#ownerId !== null) return false
		const distance = Math.hypot(
			position[0] - this.#pickupPosition[0],
			position[1] - this.#pickupPosition[1],
			position[2] - this.#pickupPosition[2],
		)
		if (distance > MINI_MISSILE_PICKUP_RADIUS) return false
		this.release(playerId, now)
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

	collectArenaWeapon(
		playerId: string,
		weapon: SecondaryGunId,
		position: Vector3Tuple,
		now: number,
	): boolean {
		const inventory = this.#inventories.get(playerId)
		const pickup = this.#arenaPickups.get(weapon)
		if (
			inventory === undefined ||
			pickup === undefined ||
			!pickup.available ||
			pickup.ownerId !== null
		)
			return false
		const pickupPosition = this.#arenaPickupPads[pickup.padIndex]
		if (pickupPosition === undefined) return false
		const distance = Math.hypot(
			position[0] - pickupPosition[0],
			position[1] - pickupPosition[1],
			position[2] - pickupPosition[2],
		)
		if (distance > ARENA_WEAPON_PICKUP_RADIUS) return false
		this.release(playerId, now)
		pickup.available = false
		pickup.availableAt = null
		pickup.ownerId = playerId
		inventory.slots[1] = {
			ammo: pickup.ammo,
			weapon,
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
		this.#saveOwnedAmmo(playerId, inventory)
		return true
	}

	consumeActive(
		playerId: string,
		fireType:
			| "ballistic"
			| "bubbles"
			| "guided-missile"
			| "hitscan"
			| "projectile"
			| "shotgun",
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
		this.#saveOwnedAmmo(playerId, inventory)
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
		this.#saveOwnedAmmo(playerId, inventory)
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
		const inventory = this.#inventories.get(playerId)
		let released = false
		if (this.#ownerId === playerId) {
			this.#ownerId = null
			this.#available = false
			this.#respawnAt = now + MINI_MISSILE_PICKUP_RESPAWN_SECONDS * 1_000
			released = true
		} else {
			const pickup = [...this.#arenaPickups.values()].find(
				(candidate) => candidate.ownerId === playerId,
			)
			if (pickup !== undefined) {
				this.#saveOwnedAmmo(playerId, inventory)
				pickup.ownerId = null
				pickup.available = false
				pickup.availableAt = now + ARENA_WEAPON_RESPAWN_MS[pickup.weapon]
				pickup.padIndex = this.#nextPadIndex(pickup)
				released = true
			}
		}
		if (released && inventory !== undefined) {
			inventory.slots[1] = null
			inventory.activeSlot = 0
			inventory.revision += 1
		}
		return released
	}

	update(now: number): boolean {
		let changed = false
		if (this.#respawnAt !== null && now >= this.#respawnAt) {
			this.#available = true
			this.#respawnAt = null
			changed = true
		}
		for (const pickup of this.#arenaPickups.values()) {
			if (pickup.availableAt === null || now < pickup.availableAt) continue
			pickup.available = true
			pickup.availableAt = null
			changed = true
		}
		return changed
	}

	arenaPickups(): ArenaWeaponPickupSnapshot[] {
		return [...this.#arenaPickups.values()].map((pickup) => ({
			available: pickup.available,
			availableAt: pickup.availableAt,
			ownerId: pickup.ownerId,
			position: [...(this.#arenaPickupPads[pickup.padIndex] ?? [0, 0, 0])],
			weapon: pickup.weapon,
		}))
	}

	#saveOwnedAmmo(
		playerId: string,
		inventory: PlayerInventory | undefined,
	): void {
		const slot = inventory?.slots[1]
		if (
			slot === null ||
			slot === undefined ||
			slot.weapon === "arc-blaster" ||
			slot.weapon === "mini-missile"
		)
			return
		const pickup = this.#arenaPickups.get(slot.weapon)
		if (pickup?.ownerId === playerId) pickup.ammo = slot.ammo
	}

	#nextPadIndex(pickup: ArenaWeaponPickupState): number {
		const occupied = new Set(
			[...this.#arenaPickups.values()]
				.filter((candidate) => candidate !== pickup)
				.map((candidate) => candidate.padIndex),
		)
		for (let offset = 1; offset < this.#arenaPickupPads.length; offset += 1) {
			const candidate =
				(pickup.padIndex + offset) % this.#arenaPickupPads.length
			if (!occupied.has(candidate)) return candidate
		}
		return pickup.padIndex
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
