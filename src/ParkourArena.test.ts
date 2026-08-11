import { describe, expect, test } from "vitest"

import { ARENA_SEED } from "./game-constants.ts"
import { arenaHeightAt } from "./arena-terrain.ts"
import {
	PARKOUR_TRANSITIONS,
	parkourFeatureInfluenceAt,
	parkourWorldPoint,
} from "./ParkourArena.ts"

function heightAtLocal(id: string, along: number, across: number): number {
	const transition = PARKOUR_TRANSITIONS.find(
		(candidate) => candidate.id === id,
	)!
	const [x, z] = parkourWorldPoint(transition, along, across)
	return arenaHeightAt(ARENA_SEED, x, z)
}

describe("Radical Yard parkour arena", () => {
	test("provides a dense deterministic skate-park layout", () => {
		expect(
			PARKOUR_TRANSITIONS.filter(({ kind }) => kind === "half-pipe"),
		).toHaveLength(1)
		expect(
			PARKOUR_TRANSITIONS.filter(({ kind }) => kind === "quarter-pipe"),
		).toHaveLength(4)
		expect(
			PARKOUR_TRANSITIONS.filter(({ kind }) => kind === "slide"),
		).toHaveLength(6)
		expect(
			PARKOUR_TRANSITIONS.filter(({ kind }) => kind === "bank"),
		).toHaveLength(4)
		expect(new Set(PARKOUR_TRANSITIONS.map(({ id }) => id)).size).toBe(
			PARKOUR_TRANSITIONS.length,
		)
		const sample = PARKOUR_TRANSITIONS.map((transition) =>
			heightAtLocal(transition.id, 0, 0),
		)
		expect(
			PARKOUR_TRANSITIONS.map((transition) =>
				heightAtLocal(transition.id, 0, 0),
			),
		).toEqual(sample)
	})

	test("forms a full half-pipe with two high curved transitions", () => {
		const halfPipe = PARKOUR_TRANSITIONS.find(
			({ kind }) => kind === "half-pipe",
		)!
		const center = heightAtLocal(halfPipe.id, 0, 0)
		const leftLip = heightAtLocal(halfPipe.id, 0, -halfPipe.width * 0.48)
		const rightLip = heightAtLocal(halfPipe.id, 0, halfPipe.width * 0.48)
		expect(leftLip - center).toBeGreaterThan(halfPipe.height * 0.85)
		expect(rightLip - center).toBeGreaterThan(halfPipe.height * 0.85)
		expect(leftLip).toBeCloseTo(rightLip, 5)
	})

	test("makes quarter pipes and slide chutes steep enough to ride", () => {
		for (const transition of PARKOUR_TRANSITIONS.filter(
			({ kind }) => kind === "quarter-pipe",
		)) {
			const low = heightAtLocal(transition.id, -transition.length * 0.47, 0)
			const high = heightAtLocal(transition.id, transition.length * 0.47, 0)
			expect(high - low).toBeGreaterThan(transition.height * 0.85)
		}
		for (const transition of PARKOUR_TRANSITIONS.filter(
			({ kind }) => kind === "slide",
		)) {
			const low = heightAtLocal(transition.id, -transition.length * 0.35, 0)
			const high = heightAtLocal(transition.id, transition.length * 0.35, 0)
			expect(high - low).toBeGreaterThan(transition.height * 0.55)
		}
	})

	test("keeps feature influence local to each park footprint", () => {
		for (const transition of PARKOUR_TRANSITIONS) {
			expect(parkourFeatureInfluenceAt(transition.x, transition.z)).toBe(1)
		}
		expect(parkourFeatureInfluenceAt(0, 0)).toBe(0)
	})
})
