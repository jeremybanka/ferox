import * as THREE from "three"

import type { FistContactResult } from "./arena-protocol.ts"
import type { DamageEffectHandle } from "./pilot/DamageFeedback.ts"

export const FIST_CONTACT_EFFECT_LIFETIME_SECONDS = 0.48

export class FistContactParticleBurst implements DamageEffectHandle {
	readonly #geometry: THREE.BufferGeometry
	readonly #group = new THREE.Group()
	readonly #light: THREE.PointLight
	readonly #material: THREE.PointsMaterial
	readonly #points: THREE.Points
	readonly #scene: THREE.Scene
	readonly #velocities: THREE.Vector3[]
	#age = 0
	#disposed = false

	constructor(scene: THREE.Scene, event: FistContactResult) {
		this.#scene = scene
		const count = 12
		const positions = new Float32Array(count * 3)
		this.#velocities = Array.from({ length: count }, (_, index) => {
			const angle = (index / count) * Math.PI * 2 + event.id * 0.37
			const rise = 0.35 + (index % 3) * 0.16
			return new THREE.Vector3(
				Math.cos(angle) * 1.25,
				rise,
				Math.sin(angle) * 1.25,
			)
		})
		this.#geometry = new THREE.BufferGeometry()
		this.#geometry.setAttribute(
			"position",
			new THREE.BufferAttribute(positions, 3),
		)
		this.#material = new THREE.PointsMaterial({
			blending: THREE.AdditiveBlending,
			color: "#ff83df",
			depthWrite: false,
			opacity: 0.9,
			size: 7,
			sizeAttenuation: false,
			transparent: true,
		})
		this.#points = new THREE.Points(this.#geometry, this.#material)
		this.#light = new THREE.PointLight("#ff91e4", 4, 3.2)
		this.#group.add(this.#points, this.#light)
		this.#group.position.set(...event.position)
		this.#scene.add(this.#group)
	}

	update(deltaSeconds: number): boolean {
		if (this.#disposed) return false
		const delta = Math.max(0, deltaSeconds)
		this.#age += delta
		const positions = this.#geometry.getAttribute("position")
		if (positions instanceof THREE.BufferAttribute) {
			for (const [index, velocity] of this.#velocities.entries()) {
				positions.setXYZ(
					index,
					positions.getX(index) + velocity.x * delta,
					positions.getY(index) + velocity.y * delta,
					positions.getZ(index) + velocity.z * delta,
				)
				velocity.multiplyScalar(Math.max(0, 1 - delta * 3.5))
			}
			positions.needsUpdate = true
		}
		const remaining = Math.max(
			0,
			1 - this.#age / FIST_CONTACT_EFFECT_LIFETIME_SECONDS,
		)
		this.#material.opacity = remaining * 0.9
		this.#light.intensity = remaining * 4
		return remaining > 0
	}

	dispose(): void {
		if (this.#disposed) return
		this.#disposed = true
		this.#scene.remove(this.#group)
		this.#geometry.dispose()
		this.#material.dispose()
	}
}
