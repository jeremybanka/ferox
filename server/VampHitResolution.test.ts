import { describe, expect, test, vi } from "vitest"

import { resolveVampScheduledHit } from "./VampHitResolution.ts"

function successfulTrace() {
	return {
		beamId: 4,
		end: [1, 2, 3] as [number, number, number],
		hit: {
			classification: "normal" as const,
			clientShotId: 2,
			damage: 1,
			projectileId: 4,
			targetId: "target",
			targetType: "player" as const,
		},
		start: [0, 0, 0] as [number, number, number],
	}
}

describe("Vamp scheduled hit resolution", () => {
	test("applies each successful interval and pickup spawn exactly once", () => {
		const emitBeam = vi.fn()
		const spawnHealthPickup = vi.fn()
		const onSuccess = vi.fn()
		expect(
			resolveVampScheduledHit({
				consumeAmmo: () => true,
				emitBeam,
				onSuccess,
				restoreAmmo: vi.fn(),
				spawnHealthPickup,
				targetId: "target",
				trace: successfulTrace,
			}),
		).toBe(true)
		expect(emitBeam).toHaveBeenCalledTimes(1)
		expect(spawnHealthPickup).toHaveBeenCalledTimes(1)
		expect(spawnHealthPickup).toHaveBeenCalledWith([1, 2, 3])
		expect(onSuccess).toHaveBeenCalledTimes(1)
	})

	test.each([
		["miss", null],
		[
			"occluder",
			{
				...successfulTrace(),
				hit: { ...successfulTrace().hit!, targetId: "other" },
			},
		],
	])(
		"resets a %s interval without beam or pickup side effects",
		(_label, trace) => {
			const restoreAmmo = vi.fn()
			const emitBeam = vi.fn()
			const spawnHealthPickup = vi.fn()
			expect(
				resolveVampScheduledHit({
					consumeAmmo: () => true,
					emitBeam,
					onSuccess: vi.fn(),
					restoreAmmo,
					spawnHealthPickup,
					targetId: "target",
					trace: () => trace,
				}),
			).toBe(false)
			expect(restoreAmmo).toHaveBeenCalledTimes(1)
			expect(emitBeam).not.toHaveBeenCalled()
			expect(spawnHealthPickup).not.toHaveBeenCalled()
		},
	)

	test("does not trace or restore when ammo eligibility fails", () => {
		const trace = vi.fn()
		const restoreAmmo = vi.fn()
		expect(
			resolveVampScheduledHit({
				consumeAmmo: () => false,
				emitBeam: vi.fn(),
				onSuccess: vi.fn(),
				restoreAmmo,
				spawnHealthPickup: vi.fn(),
				targetId: "target",
				trace,
			}),
		).toBe(false)
		expect(trace).not.toHaveBeenCalled()
		expect(restoreAmmo).not.toHaveBeenCalled()
	})
})
