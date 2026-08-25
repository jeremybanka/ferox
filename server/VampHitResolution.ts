import type { DirectHitResult, Vector3Tuple } from "../src/arena-protocol.ts"

export type VampTraceResult = Readonly<{
	beamId: number
	end: Vector3Tuple
	hit: DirectHitResult | null
	start: Vector3Tuple
}>

/** Performs one all-or-nothing Vamp interval with exactly-once side effects. */
export function resolveVampScheduledHit(
	options: Readonly<{
		consumeAmmo: () => boolean
		emitBeam: (result: VampTraceResult) => void
		onSuccess: () => void
		restoreAmmo: () => void
		spawnHealthPickup: (position: Vector3Tuple) => void
		targetId: string
		trace: () => VampTraceResult | null
	}>,
): boolean {
	if (!options.consumeAmmo()) return false
	const result = options.trace()
	if (
		result === null ||
		result.hit?.targetType !== "player" ||
		result.hit.targetId !== options.targetId ||
		result.hit.damage !== 1
	) {
		options.restoreAmmo()
		return false
	}
	options.emitBeam(result)
	options.spawnHealthPickup(result.end)
	options.onSuccess()
	return true
}
