import { expect, test } from "vitest"
import * as THREE from "three"

import type { ShotgunPelletSnapshot } from "./arena-protocol.ts"
import { SHOTGUN_PELLET_MAX_DISTANCE } from "./game-constants.ts"
import { ShotgunPelletField } from "./ShotgunPelletField.ts"

function pellet(id: number, phase: "flying" | "suspended" = "flying") {
	return {
		direction: [0, 0, -1],
		id,
		origin: [0, 4, 0],
		ownerId: "pilot",
		phase,
		position: phase === "flying" ? [0, 4, 0] : [0, 4, -20],
	} satisfies ShotgunPelletSnapshot
}

test("shotgun pellets share one bounded instanced visual field", () => {
	const field = new ShotgunPelletField(300)
	field.reconcile(Array.from({ length: 280 }, (_, index) => pellet(index)))
	field.update(0)

	expect(field.count).toBe(280)
	expect(field.mesh.count).toBe(280)
	expect(field.mesh).toBeInstanceOf(THREE.InstancedMesh)
	expect(field.mesh.material).toBeInstanceOf(THREE.MeshBasicMaterial)
	field.dispose()
})

test("client prediction stops at 20m and authoritative removal is single-use", () => {
	const field = new ShotgunPelletField(20)
	field.upsert(pellet(1))
	field.update(1)

	const matrix = new THREE.Matrix4()
	field.mesh.getMatrixAt(0, matrix)
	const position = new THREE.Vector3().setFromMatrixPosition(matrix)
	expect(position.z).toBeCloseTo(-SHOTGUN_PELLET_MAX_DISTANCE)
	expect(field.remove(1)).toBe(true)
	expect(field.remove(1)).toBe(false)
	field.update(0)
	expect(field.mesh.count).toBe(0)
	field.dispose()
})
