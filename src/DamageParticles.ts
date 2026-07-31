import * as THREE from "three"

import {
	createDamageParticlePlan,
	DAMAGE_EFFECT_LIFETIME_SECONDS,
	type DamageEffectHandle,
	type DamageParticleSeed,
} from "./pilot/DamageFeedback.ts"
import type { PlayerDamageSnapshot } from "./arena-protocol.ts"

type ParticleCloud = {
	geometry: THREE.BufferGeometry
	material: THREE.PointsMaterial
	points: THREE.Points
	seeds: readonly DamageParticleSeed[]
	velocities: THREE.Vector3[]
}

function createCloud(
	seeds: readonly DamageParticleSeed[],
	material: THREE.PointsMaterial,
): ParticleCloud {
	const positions = new Float32Array(seeds.length * 3)
	for (const [index, seed] of seeds.entries()) {
		positions.set(seed.offset, index * 3)
	}
	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
	return {
		geometry,
		material,
		points: new THREE.Points(geometry, material),
		seeds,
		velocities: seeds.map((seed) => new THREE.Vector3(...seed.velocity)),
	}
}

export class DamageParticleBurst implements DamageEffectHandle {
	readonly #electric: ParticleCloud
	readonly #group = new THREE.Group()
	readonly #light: THREE.PointLight
	readonly #scene: THREE.Scene
	readonly #splatter: ParticleCloud
	#age = 0
	#disposed = false
	readonly playerId: string

	constructor(
		scene: THREE.Scene,
		event: PlayerDamageSnapshot,
		presentationPosition = event.position,
	) {
		this.#scene = scene
		this.playerId = event.playerId
		const plan = createDamageParticlePlan(event.sequence, event.direction)
		this.#electric = createCloud(
			plan.electric,
			new THREE.PointsMaterial({
				blending: THREE.AdditiveBlending,
				color: "#7ffff3",
				depthWrite: false,
				opacity: 1,
				size: 5,
				sizeAttenuation: false,
				transparent: true,
			}),
		)
		this.#splatter = createCloud(
			plan.splatter,
			new THREE.PointsMaterial({
				color: "#08080b",
				depthWrite: false,
				opacity: 0.94,
				size: 7,
				sizeAttenuation: false,
				transparent: true,
			}),
		)
		this.#light = new THREE.PointLight("#65fff1", 7, 4.5)
		this.#group.add(this.#electric.points, this.#splatter.points, this.#light)
		this.#group.position.set(...presentationPosition)
		this.#scene.add(this.#group)
	}

	update(deltaSeconds: number): boolean {
		if (this.#disposed) return false
		const delta = Math.max(0, deltaSeconds)
		this.#age += delta
		this.#updateCloud(this.#electric, delta, false)
		this.#updateCloud(this.#splatter, delta, true)
		const progress = THREE.MathUtils.clamp(
			this.#age / DAMAGE_EFFECT_LIFETIME_SECONDS,
			0,
			1,
		)
		const electricStrength =
			(1 - progress) * (0.65 + Math.sin(this.#age * 95) * 0.35)
		this.#electric.material.opacity = Math.max(0, electricStrength)
		this.#splatter.material.opacity = Math.pow(1 - progress, 1.4) * 0.94
		this.#light.intensity = Math.max(0, electricStrength) * 7
		return this.#age < DAMAGE_EFFECT_LIFETIME_SECONDS
	}

	dispose(): void {
		if (this.#disposed) return
		this.#disposed = true
		this.#scene.remove(this.#group)
		this.#electric.geometry.dispose()
		this.#electric.material.dispose()
		this.#splatter.geometry.dispose()
		this.#splatter.material.dispose()
	}

	#updateCloud(cloud: ParticleCloud, delta: number, gravity: boolean): void {
		const position = cloud.geometry.getAttribute("position")
		if (!(position instanceof THREE.BufferAttribute)) return
		for (let index = 0; index < cloud.seeds.length; index += 1) {
			const velocity = cloud.velocities[index]
			const seed = cloud.seeds[index]
			if (velocity === undefined || seed === undefined) continue
			if (gravity) velocity.y -= 7.5 * delta
			position.setXYZ(
				index,
				position.getX(index) + velocity.x * delta,
				position.getY(index) + velocity.y * delta,
				position.getZ(index) + velocity.z * delta,
			)
		}
		position.needsUpdate = true
	}
}
