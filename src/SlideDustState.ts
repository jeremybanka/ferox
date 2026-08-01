import { PLAYER_SLIDE_DUST_CADENCE_SECONDS } from "./game-constants.ts"

export type SlideDustState = {
	active: boolean
	elapsed: number
}

export type SlideDustStep = {
	emissions: number
	state: SlideDustState
}

export function stepSlideDust(
	state: SlideDustState,
	sliding: boolean,
	delta: number,
): SlideDustStep {
	if (!sliding) return { emissions: 0, state: { active: false, elapsed: 0 } }
	const elapsed = state.elapsed + Math.max(0, delta)
	const cadenceEmissions = Math.floor(
		elapsed / PLAYER_SLIDE_DUST_CADENCE_SECONDS,
	)
	return {
		emissions: cadenceEmissions + (state.active ? 0 : 1),
		state: {
			active: true,
			elapsed: elapsed - cadenceEmissions * PLAYER_SLIDE_DUST_CADENCE_SECONDS,
		},
	}
}
