import * as THREE from "three"

import type {
	ShotgunPelletSnapshot,
	ShotgunVolleySnapshot,
} from "./arena-protocol.ts"
import {
	SHOTGUN_MAX_ACTIVE_PELLETS,
	SHOTGUN_PELLET_MAX_DISTANCE,
	SHOTGUN_PELLET_SPEED,
} from "./game-constants.ts"

type PelletVisual = {
	direction: THREE.Vector3
	distance: number
	origin: THREE.Vector3
	phase: ShotgunPelletSnapshot["phase"]
	position: THREE.Vector3
}

export class ShotgunPelletField {
	readonly mesh: THREE.InstancedMesh
	readonly #capacity: number
	readonly #matrixWriter = new THREE.Object3D()
	readonly #pellets = new Map<number, PelletVisual>()
	readonly #zAxis = new THREE.Vector3(0, 0, 1)

	constructor(capacity = SHOTGUN_MAX_ACTIVE_PELLETS) {
		this.#capacity = Math.max(1, Math.floor(capacity))
		this.mesh = new THREE.InstancedMesh(
			new THREE.SphereGeometry(1, 6, 4),
			new THREE.MeshBasicMaterial({
				blending: THREE.AdditiveBlending,
				color: "#ffbd86",
				depthWrite: false,
				opacity: 0.82,
				transparent: true,
			}),
			this.#capacity,
		)
		this.mesh.count = 0
		this.mesh.frustumCulled = false
		this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
		this.mesh.name = "shotgun pellet field"
	}

	get count(): number {
		return this.#pellets.size
	}

	addVolley(volley: ShotgunVolleySnapshot): void {
		for (const pellet of volley.pellets) this.upsert(pellet)
	}

	reconcile(snapshots: readonly ShotgunPelletSnapshot[]): void {
		const active = new Set(snapshots.map((snapshot) => snapshot.id))
		for (const id of this.#pellets.keys()) {
			if (!active.has(id)) this.#pellets.delete(id)
		}
		for (const snapshot of snapshots) this.upsert(snapshot)
	}

	remove(id: number): boolean {
		return this.#pellets.delete(id)
	}

	upsert(snapshot: ShotgunPelletSnapshot): void {
		if (!this.#pellets.has(snapshot.id) && this.#pellets.size >= this.#capacity)
			return
		const direction = new THREE.Vector3(...snapshot.direction).normalize()
		const origin = new THREE.Vector3(...snapshot.origin)
		const position = new THREE.Vector3(...snapshot.position)
		this.#pellets.set(snapshot.id, {
			direction,
			distance: Math.min(
				SHOTGUN_PELLET_MAX_DISTANCE,
				position.distanceTo(origin),
			),
			origin,
			phase: snapshot.phase,
			position,
		})
	}

	update(delta: number): void {
		let index = 0
		for (const pellet of this.#pellets.values()) {
			if (pellet.phase === "flying") {
				pellet.distance = Math.min(
					SHOTGUN_PELLET_MAX_DISTANCE,
					pellet.distance + SHOTGUN_PELLET_SPEED * delta,
				)
				pellet.position
					.copy(pellet.origin)
					.addScaledVector(pellet.direction, pellet.distance)
				if (pellet.distance === SHOTGUN_PELLET_MAX_DISTANCE)
					pellet.phase = "suspended"
			}
			this.#matrixWriter.position.copy(pellet.position)
			this.#matrixWriter.quaternion.setFromUnitVectors(
				this.#zAxis,
				pellet.direction,
			)
			this.#matrixWriter.scale.set(
				0.035,
				0.035,
				pellet.phase === "flying" ? 0.24 : 0.1,
			)
			this.#matrixWriter.updateMatrix()
			this.mesh.setMatrixAt(index, this.#matrixWriter.matrix)
			index += 1
		}
		this.mesh.count = index
		this.mesh.instanceMatrix.needsUpdate = true
	}

	dispose(): void {
		this.#pellets.clear()
		this.mesh.count = 0
		this.mesh.geometry.dispose()
		if (Array.isArray(this.mesh.material))
			this.mesh.material.forEach((material) => material.dispose())
		else this.mesh.material.dispose()
	}
}
