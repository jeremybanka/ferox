import * as THREE from "three"

import type { BubbleSnapshot } from "./arena-protocol.ts"

export const BUBBLE_VISUAL_CAPACITY = 1_024

type BubbleVisual = {
	position: THREE.Vector3
	radius: number
	target: THREE.Vector3
	velocity: THREE.Vector3
}

/**
 * Packs every synchronized bubble into one draw call. Bubble snapshots retain
 * their own interpolation state, while geometry and material ownership stay
 * constant regardless of how many bubbles are active.
 */
export class BubbleVisualField {
	readonly mesh: THREE.InstancedMesh
	readonly #capacity: number
	readonly #matrixWriter = new THREE.Object3D()
	readonly #visuals = new Map<number, BubbleVisual>()

	constructor(capacity = BUBBLE_VISUAL_CAPACITY) {
		this.#capacity = Math.max(1, Math.floor(capacity))
		this.mesh = new THREE.InstancedMesh(
			new THREE.SphereGeometry(1, 14, 10),
			new THREE.MeshPhongMaterial({
				color: "#f58bdf",
				depthWrite: false,
				emissive: "#7f255f",
				emissiveIntensity: 0.28,
				opacity: 0.22,
				shininess: 92,
				specular: "#ffd8f5",
				transparent: true,
			}),
			this.#capacity,
		)
		this.mesh.count = 0
		this.mesh.frustumCulled = false
		this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
		this.mesh.name = "bubble field"
	}

	get count(): number {
		return this.#visuals.size
	}

	ids(): IterableIterator<number> {
		return this.#visuals.keys()
	}

	position(id: number): THREE.Vector3 | null {
		return this.#visuals.get(id)?.position ?? null
	}

	remove(id: number): boolean {
		return this.#visuals.delete(id)
	}

	upsert(snapshot: BubbleSnapshot): boolean {
		let visual = this.#visuals.get(snapshot.id)
		if (visual === undefined) {
			if (this.#visuals.size >= this.#capacity) return false
			visual = {
				position: new THREE.Vector3(...snapshot.position),
				radius: snapshot.radius,
				target: new THREE.Vector3(...snapshot.position),
				velocity: new THREE.Vector3(...snapshot.velocity),
			}
			this.#visuals.set(snapshot.id, visual)
		}
		visual.radius = snapshot.radius
		visual.target.set(...snapshot.position)
		visual.velocity.set(...snapshot.velocity)
		return true
	}

	update(delta: number): void {
		let index = 0
		for (const visual of this.#visuals.values()) {
			visual.target.addScaledVector(visual.velocity, delta)
			visual.position.lerp(visual.target, Math.min(1, delta * 14))
			this.#matrixWriter.position.copy(visual.position)
			this.#matrixWriter.scale.setScalar(visual.radius)
			this.#matrixWriter.updateMatrix()
			this.mesh.setMatrixAt(index, this.#matrixWriter.matrix)
			index += 1
		}
		this.mesh.count = index
		this.mesh.instanceMatrix.needsUpdate = true
	}

	dispose(): void {
		this.#visuals.clear()
		this.mesh.count = 0
		this.mesh.geometry.dispose()
		if (Array.isArray(this.mesh.material))
			this.mesh.material.forEach((material) => material.dispose())
		else this.mesh.material.dispose()
	}
}
