import { describe, expect, test, vi } from "vitest"

import { MINI_MISSILE_TRAIL_MAX_POINTS } from "./game-constants.ts"
import {
	createMiniMissileTrailVisual,
	disposeMiniMissileTrailVisual,
	updateMiniMissileTrailVisual,
} from "./MiniMissileTrailVisual.ts"

describe("mini-missile trail visual resources", () => {
	test("reuses fixed geometry buffers while updating the draw range", () => {
		const visual = createMiniMissileTrailVisual()
		const positions = visual.geometry.getAttribute("position")
		const colors = visual.geometry.getAttribute("color")
		expect(positions.count).toBe(MINI_MISSILE_TRAIL_MAX_POINTS)
		expect(colors.count).toBe(MINI_MISSILE_TRAIL_MAX_POINTS)

		updateMiniMissileTrailVisual(visual, [0, 0, 0], 0, "powered")
		updateMiniMissileTrailVisual(visual, [1, 0, 0], 0.1, "powered")

		expect(visual.geometry.getAttribute("position")).toBe(positions)
		expect(visual.geometry.getAttribute("color")).toBe(colors)
		expect(visual.geometry.drawRange.count).toBe(2)
		expect(visual.points.visible).toBe(true)
		disposeMiniMissileTrailVisual(visual)
	})

	test("dims falling samples and disposes owned GPU resources once", () => {
		const visual = createMiniMissileTrailVisual()
		updateMiniMissileTrailVisual(visual, [0, 0, 0], 0, "powered")
		updateMiniMissileTrailVisual(visual, [0, 0, 0], 0.1, "falling")
		const colors = visual.geometry.getAttribute("color")
		expect(colors.getX(0)).toBeGreaterThan(0)
		expect(colors.getX(1)).toBeLessThan(1)

		const disposeGeometry = vi.spyOn(visual.geometry, "dispose")
		const disposeMaterial = vi.spyOn(visual.material, "dispose")
		disposeMiniMissileTrailVisual(visual)
		disposeMiniMissileTrailVisual(visual)
		expect(disposeGeometry).toHaveBeenCalledOnce()
		expect(disposeMaterial).toHaveBeenCalledOnce()
	})
})
