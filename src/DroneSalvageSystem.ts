import * as THREE from "three"

import type {
	ArenaSnapshot,
	DronePayloadSnapshot,
	DroneWreckSnapshot,
} from "./arena-protocol.ts"

type SalvageVisual = { group: THREE.Group; target: THREE.Vector3 }

export class DroneSalvageSystem {
	readonly #payloads = new Map<number, SalvageVisual>()
	readonly #scene: THREE.Scene
	readonly #wrecks = new Map<number, SalvageVisual>()

	constructor(scene: THREE.Scene) {
		this.#scene = scene
	}

	applySnapshot(snapshot: ArenaSnapshot): void {
		this.#reconcile(this.#wrecks, snapshot.droneWrecks, (wreck) =>
			this.#makeWreck(wreck),
		)
		this.#reconcile(this.#payloads, snapshot.dronePayloads, (payload) =>
			this.#makePayload(payload),
		)
		for (const payload of snapshot.dronePayloads) {
			const visual = this.#payloads.get(payload.id)
			if (visual !== undefined) visual.group.rotation.z = payload.rotation
		}
	}

	nearestWreck(
		position: THREE.Vector3,
		radius: number,
	): DroneWreckSnapshot | null {
		let nearest: DroneWreckSnapshot | null = null
		let nearestDistance = radius
		for (const [id, visual] of this.#wrecks) {
			const distance = position.distanceTo(visual.target)
			if (distance > nearestDistance) continue
			nearestDistance = distance
			nearest = { id, personality: "bully", position: visual.target.toArray() }
		}
		return nearest
	}

	update(delta: number): void {
		const amount = 1 - Math.exp(-delta * 18)
		for (const visual of [
			...this.#wrecks.values(),
			...this.#payloads.values(),
		]) {
			visual.group.position.lerp(visual.target, amount)
		}
		for (const visual of this.#payloads.values())
			visual.group.rotation.x += delta * 12
	}

	dispose(): void {
		for (const visual of [...this.#wrecks.values(), ...this.#payloads.values()])
			this.#removeVisual(visual)
		this.#wrecks.clear()
		this.#payloads.clear()
	}

	#reconcile<
		T extends { id: number; position: readonly [number, number, number] },
	>(
		visuals: Map<number, SalvageVisual>,
		snapshots: readonly T[],
		make: (snapshot: T) => THREE.Group,
	): void {
		const active = new Set(snapshots.map((snapshot) => snapshot.id))
		for (const snapshot of snapshots) {
			let visual = visuals.get(snapshot.id)
			if (visual === undefined) {
				const group = make(snapshot)
				group.position.set(...snapshot.position)
				visual = { group, target: group.position.clone() }
				visuals.set(snapshot.id, visual)
				this.#scene.add(group)
			}
			visual.target.set(...snapshot.position)
		}
		for (const [id, visual] of visuals) {
			if (active.has(id)) continue
			this.#removeVisual(visual)
			visuals.delete(id)
		}
	}

	#removeVisual(visual: SalvageVisual): void {
		this.#scene.remove(visual.group)
		const geometries = new Set<THREE.BufferGeometry>()
		const materials = new Set<THREE.Material>()
		visual.group.traverse((object) => {
			if (!(object instanceof THREE.Mesh)) return
			geometries.add(object.geometry)
			for (const material of Array.isArray(object.material)
				? object.material
				: [object.material]) {
				materials.add(material)
			}
		})
		for (const geometry of geometries) geometry.dispose()
		for (const material of materials) material.dispose()
	}

	#makeWreck(_wreck: DroneWreckSnapshot): THREE.Group {
		const group = new THREE.Group()
		const body = new THREE.Mesh(
			new THREE.IcosahedronGeometry(0.58, 1),
			new THREE.MeshStandardMaterial({
				color: "#453a4f",
				emissive: "#b347ff",
				emissiveIntensity: 0.38,
				metalness: 0.8,
			}),
		)
		const beacon = new THREE.Mesh(
			new THREE.TorusGeometry(0.82, 0.035, 6, 28),
			new THREE.MeshBasicMaterial({
				color: "#d787ff",
				transparent: true,
				opacity: 0.72,
			}),
		)
		beacon.rotation.x = Math.PI / 2
		group.add(body, beacon)
		return group
	}

	#makePayload(_payload: DronePayloadSnapshot): THREE.Group {
		const group = new THREE.Group()
		const material = new THREE.MeshStandardMaterial({
			color: "#62ffb4",
			emissive: "#33c987",
			emissiveIntensity: 0.65,
			metalness: 0.75,
		})
		for (let index = 0; index < 4; index += 1) {
			const blade = new THREE.Mesh(
				new THREE.BoxGeometry(1.25, 0.08, 0.22),
				material,
			)
			blade.rotation.y = (index * Math.PI) / 2
			group.add(blade)
		}
		return group
	}
}
