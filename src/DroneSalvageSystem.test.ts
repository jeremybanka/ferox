import * as THREE from "three"
import { expect, test, vi } from "vitest"

import type { ArenaSnapshot } from "./arena-protocol.ts"
import { DroneSalvageSystem } from "./DroneSalvageSystem.ts"

function snapshot(overrides: Partial<ArenaSnapshot> = {}): ArenaSnapshot {
	return {
		dronePayloads: [],
		droneWrecks: [],
		drones: [],
		missiles: [],
		sequence: 1,
		serverTime: 0,
		...overrides,
	}
}

test("reconciliation disposes shared payload resources once", () => {
	const scene = new THREE.Scene()
	const system = new DroneSalvageSystem(scene)
	system.applySnapshot(
		snapshot({
			dronePayloads: [
				{
					id: 1,
					ownerId: "owner",
					position: [0, 1, 0],
					rotation: 0,
					velocity: [0, 0, -1],
				},
			],
		}),
	)
	const group = scene.children[0]
	expect(group).toBeInstanceOf(THREE.Group)
	const blade = group?.children[0]
	expect(blade).toBeInstanceOf(THREE.Mesh)
	if (!(blade instanceof THREE.Mesh)) throw new Error("Expected payload blade")
	const material = blade.material as THREE.Material
	const geometryDispose = vi.spyOn(blade.geometry, "dispose")
	const materialDispose = vi.spyOn(material, "dispose")

	system.applySnapshot(snapshot({ sequence: 2 }))
	expect(geometryDispose).toHaveBeenCalledTimes(1)
	expect(materialDispose).toHaveBeenCalledTimes(1)
	system.dispose()
	expect(geometryDispose).toHaveBeenCalledTimes(1)
	expect(materialDispose).toHaveBeenCalledTimes(1)
})

test("dispose releases wreck resources and is idempotent", () => {
	const scene = new THREE.Scene()
	const system = new DroneSalvageSystem(scene)
	system.applySnapshot(
		snapshot({
			droneWrecks: [{ id: 2, personality: "coward", position: [1, 2, 3] }],
		}),
	)
	const group = scene.children[0]
	const body = group?.children[0]
	if (!(body instanceof THREE.Mesh)) throw new Error("Expected wreck body")
	const geometryDispose = vi.spyOn(body.geometry, "dispose")
	const materialDispose = vi.spyOn(body.material as THREE.Material, "dispose")
	system.dispose()
	system.dispose()
	expect(geometryDispose).toHaveBeenCalledTimes(1)
	expect(materialDispose).toHaveBeenCalledTimes(1)
	expect(scene.children).toHaveLength(0)
})
