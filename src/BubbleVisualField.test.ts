import { describe, expect, it } from "vitest"
import * as THREE from "three"

import type { BubbleSnapshot } from "./arena-protocol.ts"
import { BubbleVisualField } from "./BubbleVisualField.ts"

function bubble(id: number): BubbleSnapshot {
	return {
		health: 80,
		id,
		ownerId: "pilot",
		position: [id * 0.1, 2, -4],
		radius: 0.72,
		velocity: [0, 0, -3.4],
	}
}

describe("BubbleVisualField", () => {
	it("renders a sustained 115-bubble stress load with one shared mesh", () => {
		const field = new BubbleVisualField(128)
		for (let id = 1; id <= 115; id += 1) {
			expect(field.upsert(bubble(id))).toBe(true)
		}

		field.update(1 / 60)

		expect(field.count).toBe(115)
		expect(field.mesh.count).toBe(115)
		expect(field.mesh).toBeInstanceOf(THREE.InstancedMesh)
		expect(field.mesh.material).toBeInstanceOf(THREE.MeshPhongMaterial)
		expect(field.mesh.material).not.toBeInstanceOf(THREE.MeshPhysicalMaterial)
		field.dispose()
	})

	it("bounds visual allocation and reuses capacity after a bubble pops", () => {
		const field = new BubbleVisualField(2)
		expect(field.upsert(bubble(1))).toBe(true)
		expect(field.upsert(bubble(2))).toBe(true)
		expect(field.upsert(bubble(3))).toBe(false)

		expect(field.remove(1)).toBe(true)
		expect(field.upsert(bubble(3))).toBe(true)
		field.update(0)
		expect([...field.ids()]).toEqual([2, 3])
		expect(field.mesh.count).toBe(2)
		field.dispose()
	})
})
