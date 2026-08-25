import { describe, expect, test } from "vitest"

import type {
	PlayerDamageImpact,
	VehicleControlIntent,
	VehicleSeatIntent,
	VehicleTurretIntent,
} from "../src/arena-protocol.ts"
import { arenaHeightAt } from "../src/arena-terrain.ts"
import { resolveArenaMotion } from "../src/ArenaWorld.ts"
import { ARENA_SEED } from "../src/game-constants.ts"
import {
	STARTING_ROOM_RADIUS,
	VEHICLE_ENTRY_RADIUS,
	VEHICLE_SPAWNS,
	VehicleAuthority,
	type VehicleAuthorityPlayer,
} from "./VehicleAuthority.ts"

const makeHarness = () => {
	let now = 10_000
	const players: VehicleAuthorityPlayer[] = [
		{
			dead: false,
			id: "alpha",
			position: [0, 0.72, 12],
			velocity: [0, 0, 0],
		},
		{
			dead: false,
			id: "beta",
			position: [1, 0.72, 12],
			velocity: [0, 0, 0],
		},
		{
			dead: false,
			id: "driver",
			position: [0, 1.05, 28],
			velocity: [0, 0, 0],
		},
		{
			dead: false,
			id: "passenger",
			position: [0, 1.05, 29],
			velocity: [0, 0, 0],
		},
		{
			dead: false,
			id: "gunner",
			position: [1, 1.05, 28],
			velocity: [0, 0, 0],
		},
		{
			dead: false,
			id: "target",
			position: [0, 4.15, 0],
			velocity: [0, 0, 0],
		},
	]
	const damage: {
		damage: number
		impact: PlayerDamageImpact
		playerId: string
	}[] = []
	const authority = new VehicleAuthority({
		applyDamage: (playerId, amount, impact) =>
			damage.push({ damage: amount, impact, playerId }),
		getPlayers: () => players,
		nowMs: () => now,
		world: {
			groundAt: () => 0,
			resolveMotion: (_start, requested) => ({
				blocked: false,
				x: requested[0],
				z: requested[1],
			}),
		},
	})
	return {
		authority,
		damage,
		players,
		tick: (delta = 1 / 30) => {
			now += delta * 1_000
			authority.update(delta)
		},
	}
}

const seat = (
	clientActionId: number,
	type: "enter" | "switch",
	vehicleId: string,
	seatId: "driver" | "rider" | "shotgun" | "turret",
): VehicleSeatIntent => ({ clientActionId, seatId, type, vehicleId })

describe("vehicle occupancy authority", () => {
	test("spawns the jeep outside the starting room on a clear arena footprint", () => {
		const { authority } = makeHarness()
		const jeep = authority
			.snapshots()
			.find((vehicle) => vehicle.id === "jeep-1")!
		expect(Math.hypot(jeep.position[0], jeep.position[2])).toBeGreaterThan(
			STARTING_ROOM_RADIUS,
		)
		expect([jeep.position[0], jeep.position[2]]).toEqual([
			VEHICLE_SPAWNS.jeep.position[0],
			VEHICLE_SPAWNS.jeep.position[2],
		])
		const [x, , z] = VEHICLE_SPAWNS.jeep.position
		const result = resolveArenaMotion(
			ARENA_SEED,
			[x, z],
			[x, z],
			arenaHeightAt(ARENA_SEED, x, z) + 1,
			1.75,
		)
		expect(result).toMatchObject({ contact: null, x, z })
	})

	test("requires normal close proximity to enter", () => {
		const { authority, players } = makeHarness()
		const driver = players.find((player) => player.id === "driver")!
		driver.position = [0, 1.05, 28 + VEHICLE_ENTRY_RADIUS + 0.1]
		expect(
			authority.requestSeat("driver", seat(1, "enter", "jeep-1", "driver")),
		).toBe(false)
		driver.position = [0, 1.05, 28 + VEHICLE_ENTRY_RADIUS - 0.1]
		expect(
			authority.requestSeat("driver", seat(2, "enter", "jeep-1", "driver")),
		).toBe(true)
	})

	test("resolves contention and rejects stale, distant, and cross-role control", () => {
		const { authority } = makeHarness()
		expect(
			authority.requestSeat("alpha", seat(1, "enter", "bike-1", "rider")),
		).toBe(true)
		expect(
			authority.requestSeat("beta", seat(1, "enter", "bike-1", "rider")),
		).toBe(false)
		expect(
			authority.requestSeat("alpha", { clientActionId: 1, type: "exit" }),
		).toBe(false)
		expect(
			authority.control("beta", {
				afterburner: true,
				handbrake: false,
				clientInputId: 1,
				steering: 0,
				throttle: 1,
				vehicleId: "bike-1",
			}),
		).toBe(false)
		expect(
			authority.requestSeat("alpha", { clientActionId: 2, type: "exit" }),
		).toBe(true)
		expect(
			authority.requestSeat("target", seat(1, "enter", "bike-1", "rider")),
		).toBe(false)
	})

	test("supports all three jeep roles and role-authorized controls", () => {
		const { authority } = makeHarness()
		expect(
			authority.requestSeat("driver", seat(1, "enter", "jeep-1", "driver")),
		).toBe(true)
		expect(
			authority.requestSeat("passenger", seat(1, "enter", "jeep-1", "shotgun")),
		).toBe(true)
		expect(
			authority.requestSeat("gunner", seat(1, "enter", "jeep-1", "turret")),
		).toBe(true)
		const control: VehicleControlIntent = {
			afterburner: false,
			handbrake: false,
			clientInputId: 1,
			steering: 0.2,
			throttle: 1,
			vehicleId: "jeep-1",
		}
		expect(authority.control("driver", control)).toBe(true)
		expect(
			authority.control("passenger", { ...control, clientInputId: 2 }),
		).toBe(false)
		const turret: VehicleTurretIntent = {
			clientInputId: 1,
			direction: [0, 0, 1],
			fire: false,
			vehicleId: "jeep-1",
		}
		expect(authority.turret("gunner", turret)).toBe(true)
		expect(authority.turret("driver", { ...turret, clientInputId: 2 })).toBe(
			false,
		)
		expect(
			authority.snapshots().find((vehicle) => vehicle.id === "jeep-1")?.seats,
		).toEqual([
			{ id: "driver", occupantId: "driver" },
			{ id: "shotgun", occupantId: "passenger" },
			{ id: "turret", occupantId: "gunner" },
		])
	})

	test("cleans occupancy exactly once on death or disconnect", () => {
		const { authority } = makeHarness()
		authority.requestSeat("driver", seat(1, "enter", "jeep-1", "driver"))
		expect(authority.removePlayer("driver")).toBe(true)
		expect(authority.removePlayer("driver")).toBe(false)
		expect(authority.seat("driver")).toBe(null)
	})
})

describe("vehicle combat authority", () => {
	test("afterburner is bounded and leaves expiring authoritative napalm", () => {
		const { authority, tick } = makeHarness()
		authority.requestSeat("alpha", seat(1, "enter", "bike-1", "rider"))
		authority.control("alpha", {
			afterburner: true,
			handbrake: false,
			clientInputId: 1,
			steering: 0,
			throttle: 1,
			vehicleId: "bike-1",
		})
		for (let index = 0; index < 60; index += 1) tick()
		expect(authority.hazards().length).toBeGreaterThan(0)
		expect(authority.hazards().length).toBeLessThanOrEqual(48)
		expect(authority.snapshots()[0]?.afterburner).toBe(false)
		for (let index = 0; index < 180; index += 1) tick()
		expect(authority.hazards()).toHaveLength(0)
	})

	test("turret fire uses cadence and damages the closest ray target", () => {
		const { authority, damage, tick } = makeHarness()
		authority.requestSeat("gunner", seat(1, "enter", "jeep-1", "turret"))
		const intent: VehicleTurretIntent = {
			clientInputId: 1,
			direction: [0, 0, -1],
			fire: true,
			vehicleId: "jeep-1",
		}
		expect(authority.turret("gunner", intent)).toBe(true)
		expect(damage).toEqual([
			expect.objectContaining({
				damage: 14,
				playerId: "target",
				impact: expect.objectContaining({ source: "vehicle-turret" }),
			}),
		])
		expect(authority.turret("gunner", { ...intent, clientInputId: 2 })).toBe(
			true,
		)
		expect(damage).toHaveLength(1)
		for (let index = 0; index < 8; index += 1) tick()
		expect(authority.turret("gunner", { ...intent, clientInputId: 3 })).toBe(
			true,
		)
		expect(damage).toHaveLength(2)
	})
})
