import * as THREE from "three"

import type {
	ArenaSnapshot,
	DroneDestroyedSnapshot,
	DroneMood,
	DronePersonality,
	DroneSnapshot,
} from "./arena-protocol.ts"
import {
	DRONE_VISION_DISTANCE,
	DRONE_VISION_HALF_ANGLE,
} from "./game-constants.ts"

type RenderDrone = {
	group: THREE.Group
	id: number
	mood: DroneMood
	personality: DronePersonality
	rotors: THREE.Mesh[]
	statusMaterial: THREE.MeshBasicMaterial
	targetPosition: THREE.Vector3
	targetYaw: number
	visionMaterial: THREE.MeshBasicMaterial
}

type DroneEffect = {
	life: number
	mesh: THREE.Mesh
}

type DroneBotSystemOptions = {
	scene: THREE.Scene
}

const PERSONALITY_COLORS: Record<DronePersonality, THREE.ColorRepresentation> =
	{
		bully: "#3c8dff",
		coward: "#ffd84f",
		kamikaze: "#ff4b44",
	}

export class DroneBotSystem {
	readonly #bots = new Map<number, RenderDrone>()
	readonly #effects: DroneEffect[] = []
	readonly #scene: THREE.Scene
	#lastSequence = -1

	constructor(options: DroneBotSystemOptions) {
		this.#scene = options.scene
	}

	get count(): number {
		return this.#bots.size
	}

	getTargetCandidates(): { id: number; position: THREE.Vector3 }[] {
		return [...this.#bots.values()].map((bot) => ({
			id: bot.id,
			position: bot.group.position.clone(),
		}))
	}

	getTargetPosition(id: number): THREE.Vector3 | null {
		return this.#bots.get(id)?.group.position.clone() ?? null
	}

	applySnapshot(snapshot: ArenaSnapshot): void {
		if (snapshot.sequence <= this.#lastSequence) return
		this.#lastSequence = snapshot.sequence
		const active = new Set<number>()
		for (const drone of snapshot.drones) {
			active.add(drone.id)
			this.#applyDroneSnapshot(drone)
		}
		for (const [id, bot] of this.#bots) {
			if (active.has(id)) continue
			this.#scene.remove(bot.group)
			this.#bots.delete(id)
		}
	}

	showDestroyed(destroyed: DroneDestroyedSnapshot): void {
		const bot = this.#bots.get(destroyed.id)
		if (bot !== undefined) {
			this.#scene.remove(bot.group)
			this.#bots.delete(destroyed.id)
		}
		const material = new THREE.MeshBasicMaterial({
			color: destroyed.selfDestructed
				? "#ff4b44"
				: PERSONALITY_COLORS[destroyed.personality],
			opacity: 0.72,
			transparent: true,
			wireframe: true,
		})
		const explosion = new THREE.Mesh(
			new THREE.IcosahedronGeometry(destroyed.selfDestructed ? 2.6 : 1.1, 1),
			material,
		)
		explosion.position.set(...destroyed.position)
		this.#scene.add(explosion)
		this.#effects.push({ life: 0.45, mesh: explosion })
	}

	update(delta: number): void {
		const smoothing = 1 - Math.exp(-delta * 14)
		for (const bot of this.#bots.values()) {
			bot.group.position.lerp(bot.targetPosition, smoothing)
			bot.group.rotation.y = this.#lerpAngle(
				bot.group.rotation.y,
				bot.targetYaw,
				smoothing,
			)
			for (const rotor of bot.rotors) rotor.rotation.y += delta * 22
		}
		this.#updateEffects(delta)
	}

	dispose(): void {
		this.reset()
	}

	reset(): void {
		for (const bot of this.#bots.values()) this.#scene.remove(bot.group)
		for (const effect of this.#effects) this.#scene.remove(effect.mesh)
		this.#bots.clear()
		this.#effects.length = 0
		this.#lastSequence = -1
	}

	#applyDroneSnapshot(snapshot: DroneSnapshot): void {
		let bot = this.#bots.get(snapshot.id)
		if (bot === undefined) {
			const visual = this.#makeDrone(snapshot.personality)
			visual.group.position.set(...snapshot.position)
			visual.group.rotation.y = snapshot.yaw
			bot = {
				...visual,
				id: snapshot.id,
				mood: snapshot.mood,
				personality: snapshot.personality,
				targetPosition: new THREE.Vector3(...snapshot.position),
				targetYaw: snapshot.yaw,
			}
			this.#bots.set(snapshot.id, bot)
			this.#scene.add(bot.group)
		}
		bot.targetPosition.set(...snapshot.position)
		bot.targetYaw = snapshot.yaw
		if (bot.mood !== snapshot.mood) {
			bot.mood = snapshot.mood
			const aggroed = snapshot.mood !== "idle"
			bot.statusMaterial.color.set(aggroed ? "#ffefe0" : "#8b949d")
			bot.visionMaterial.opacity = aggroed ? 0.15 : 0.085
		}
	}

	#makeDrone(personality: DronePersonality): {
		group: THREE.Group
		rotors: THREE.Mesh[]
		statusMaterial: THREE.MeshBasicMaterial
		visionMaterial: THREE.MeshBasicMaterial
	} {
		const color = PERSONALITY_COLORS[personality]
		const group = new THREE.Group()
		const bodyMaterial = new THREE.MeshStandardMaterial({
			color,
			emissive: color,
			emissiveIntensity: 0.24,
			metalness: 0.58,
			roughness: 0.32,
		})
		const darkMaterial = new THREE.MeshStandardMaterial({
			color: "#171d25",
			metalness: 0.78,
			roughness: 0.3,
		})
		const body = new THREE.Mesh(
			new THREE.BoxGeometry(1.05, 0.34, 0.72),
			bodyMaterial,
		)
		const canopy = new THREE.Mesh(
			new THREE.SphereGeometry(0.32, 10, 6),
			darkMaterial,
		)
		canopy.scale.set(1, 0.55, 1.15)
		canopy.position.set(0, 0.24, -0.08)
		group.add(body, canopy)

		const rotors: THREE.Mesh[] = []
		for (const [x, z] of [
			[-0.86, -0.58],
			[0.86, -0.58],
			[-0.86, 0.58],
			[0.86, 0.58],
		] as const) {
			const arm = new THREE.Mesh(
				new THREE.BoxGeometry(0.78, 0.08, 0.08),
				darkMaterial,
			)
			arm.position.set(x * 0.52, 0, z * 0.52)
			arm.rotation.y = Math.atan2(z, x)
			const motor = new THREE.Mesh(
				new THREE.CylinderGeometry(0.13, 0.13, 0.17, 8),
				bodyMaterial,
			)
			motor.position.set(x, 0.08, z)
			const rotor = new THREE.Mesh(
				new THREE.BoxGeometry(0.82, 0.025, 0.08),
				darkMaterial,
			)
			rotor.position.set(x, 0.2, z)
			rotors.push(rotor)
			group.add(arm, motor, rotor)
		}

		const statusMaterial = new THREE.MeshBasicMaterial({ color: "#8b949d" })
		const status = new THREE.Mesh(
			new THREE.SphereGeometry(0.1, 8, 6),
			statusMaterial,
		)
		status.position.set(0, 0.04, -0.39)
		group.add(status)

		const visionMaterial = new THREE.MeshBasicMaterial({
			color,
			depthWrite: false,
			opacity: 0.085,
			side: THREE.DoubleSide,
			transparent: true,
		})
		const coneLength = DRONE_VISION_DISTANCE
		const coneRadius = Math.tan(DRONE_VISION_HALF_ANGLE) * coneLength
		const vision = new THREE.Mesh(
			new THREE.ConeGeometry(coneRadius, coneLength, 20, 1, true),
			visionMaterial,
		)
		vision.rotation.x = Math.PI / 2
		vision.position.z = -coneLength / 2
		group.add(vision)
		return { group, rotors, statusMaterial, visionMaterial }
	}

	#updateEffects(delta: number): void {
		for (let index = this.#effects.length - 1; index >= 0; index -= 1) {
			const effect = this.#effects[index]
			if (effect === undefined) continue
			effect.life -= delta
			effect.mesh.scale.multiplyScalar(1 + delta * 5)
			const material = effect.mesh.material
			if (!Array.isArray(material)) material.opacity = effect.life * 1.7
			if (effect.life > 0) continue
			this.#scene.remove(effect.mesh)
			this.#effects.splice(index, 1)
		}
	}

	#lerpAngle(from: number, to: number, amount: number): number {
		const difference = Math.atan2(Math.sin(to - from), Math.cos(to - from))
		return from + difference * amount
	}
}
