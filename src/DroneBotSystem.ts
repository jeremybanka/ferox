import * as THREE from "three"

import {
	DRONE_AUDITORY_RADIUS,
	DRONE_POPULATION_CAP,
	DRONE_VISION_DISTANCE,
	DRONE_VISION_HALF_ANGLE,
} from "./game-constants.ts"

type DronePersonality = "bully" | "coward" | "kamikaze"
type DroneMood = "angry" | "berserk" | "haughty" | "idle" | "scared"

type DroneBot = {
	attackCooldown: number
	broughtAllies: Set<number>
	burstRounds: number
	group: THREE.Group
	health: number
	id: number
	mood: DroneMood
	opponent: "player" | null
	personality: DronePersonality
	rotors: THREE.Mesh[]
	statusMaterial: THREE.MeshBasicMaterial
	velocity: THREE.Vector3
	visionMaterial: THREE.MeshBasicMaterial
	wanderAngle: number
}

type DroneEffect = {
	life: number
	mesh: THREE.Mesh
}

type DroneBotSystemOptions = {
	heightAt: (x: number, z: number) => number
	onBotDestroyed: () => void
	onPlayerDamage: (damage: number) => void
	scene: THREE.Scene
	shoot: (
		origin: THREE.Vector3,
		direction: THREE.Vector3,
		damage: number,
		color: THREE.ColorRepresentation,
	) => void
}

const PERSONALITIES: readonly DronePersonality[] = [
	"coward",
	"kamikaze",
	"bully",
]
const PERSONALITY_COLORS: Record<DronePersonality, THREE.ColorRepresentation> =
	{
		bully: "#3c8dff",
		coward: "#ffd84f",
		kamikaze: "#ff4b44",
	}
const BODY_HEALTH: Record<DronePersonality, number> = {
	bully: 44,
	coward: 30,
	kamikaze: 24,
}
const SAFE_DISTANCE = 27
const TMP_A = new THREE.Vector3()
const TMP_B = new THREE.Vector3()

export class DroneBotSystem {
	readonly #bots: DroneBot[] = []
	readonly #effects: DroneEffect[] = []
	readonly #heightAt: (x: number, z: number) => number
	readonly #onBotDestroyed: () => void
	readonly #onPlayerDamage: (damage: number) => void
	readonly #scene: THREE.Scene
	readonly #shoot: DroneBotSystemOptions["shoot"]
	#nextId = 1
	#nextSpawn = 1.2
	#spawnElapsed = 0

	constructor(options: DroneBotSystemOptions) {
		this.#heightAt = options.heightAt
		this.#onBotDestroyed = options.onBotDestroyed
		this.#onPlayerDamage = options.onPlayerDamage
		this.#scene = options.scene
		this.#shoot = options.shoot
	}

	get count(): number {
		return this.#bots.length
	}

	dispose(): void {
		for (const bot of this.#bots) this.#scene.remove(bot.group)
		for (const effect of this.#effects) this.#scene.remove(effect.mesh)
		this.#bots.length = 0
		this.#effects.length = 0
	}

	damageNear(position: THREE.Vector3, damage: number): boolean {
		let target: DroneBot | undefined
		let nearest = 1.35
		for (const bot of this.#bots) {
			const distance = bot.group.position.distanceTo(position)
			if (distance < nearest) {
				nearest = distance
				target = bot
			}
		}
		if (target === undefined) return false
		target.health -= damage
		this.#gainAggro(target)
		if (target.health <= 0) this.#destroy(target, false)
		return true
	}

	update(
		delta: number,
		playerPosition: THREE.Vector3,
		playerVelocity: THREE.Vector3,
		playerNoise: number,
	): void {
		this.#updateSpawning(delta, playerPosition)
		this.#detectPlayer(playerPosition, playerNoise)
		this.#spreadAggro()
		for (let index = this.#bots.length - 1; index >= 0; index -= 1) {
			const bot = this.#bots[index]
			if (bot === undefined) continue
			this.#updateBot(bot, delta, playerPosition)
			for (const rotor of bot.rotors) rotor.rotation.y += delta * 22
		}
		this.#updateEffects(delta)

		if (playerVelocity.lengthSq() > 70) {
			this.#detectPlayer(playerPosition, 0.7)
		}
	}

	#updateSpawning(delta: number, playerPosition: THREE.Vector3): void {
		if (this.#bots.length >= DRONE_POPULATION_CAP) {
			this.#spawnElapsed = 0
			return
		}
		this.#spawnElapsed += delta
		if (this.#spawnElapsed < this.#nextSpawn) return
		this.#spawnElapsed = 0
		this.#nextSpawn = 2.4 + Math.random() * 2.8
		this.#spawn(playerPosition)
	}

	#spawn(playerPosition: THREE.Vector3): void {
		const personality =
			PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)] ?? "bully"
		const angle = Math.random() * Math.PI * 2
		const radius = 22 + Math.random() * 23
		const x = THREE.MathUtils.clamp(
			playerPosition.x + Math.cos(angle) * radius,
			-52,
			52,
		)
		const z = THREE.MathUtils.clamp(
			playerPosition.z + Math.sin(angle) * radius,
			-52,
			52,
		)
		const { group, rotors, statusMaterial, visionMaterial } =
			this.#makeDrone(personality)
		group.position.set(x, this.#heightAt(x, z) + 3.4, z)
		group.rotation.y = Math.random() * Math.PI * 2
		this.#scene.add(group)
		this.#bots.push({
			attackCooldown: Math.random(),
			broughtAllies: new Set(),
			burstRounds: 0,
			group,
			health: BODY_HEALTH[personality],
			id: this.#nextId,
			mood: "idle",
			opponent: null,
			personality,
			rotors,
			statusMaterial,
			velocity: new THREE.Vector3(),
			visionMaterial,
			wanderAngle: Math.random() * Math.PI * 2,
		})
		this.#nextId += 1
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

	#detectPlayer(playerPosition: THREE.Vector3, playerNoise: number): void {
		for (const bot of this.#bots) {
			if (bot.opponent !== null) continue
			const toPlayer = TMP_A.copy(playerPosition).sub(bot.group.position)
			const distance = toPlayer.length()
			const heard = playerNoise > 0 && distance <= DRONE_AUDITORY_RADIUS
			const seen =
				distance <= DRONE_VISION_DISTANCE &&
				this.#isInVision(bot, toPlayer.normalize())
			if (seen || heard) this.#gainAggro(bot)
		}
	}

	#spreadAggro(): void {
		const aggroed = this.#bots.filter((bot) => bot.opponent !== null)
		for (const source of aggroed) {
			for (const observer of this.#bots) {
				if (observer.opponent !== null || observer === source) continue
				const toSource = TMP_A.copy(source.group.position).sub(
					observer.group.position,
				)
				const distance = toSource.length()
				const perceived =
					distance <= DRONE_AUDITORY_RADIUS ||
					(distance <= DRONE_VISION_DISTANCE &&
						this.#isInVision(observer, toSource.normalize()))
				if (!perceived) continue
				this.#gainAggro(observer)
				if (source.personality === "coward" && source.mood === "scared") {
					source.broughtAllies.add(observer.id)
					source.mood = "haughty"
				}
			}
		}
	}

	#isInVision(bot: DroneBot, normalizedDirection: THREE.Vector3): boolean {
		const forward = TMP_B.set(0, 0, -1).applyQuaternion(bot.group.quaternion)
		return forward.dot(normalizedDirection) >= Math.cos(DRONE_VISION_HALF_ANGLE)
	}

	#gainAggro(bot: DroneBot): void {
		if (bot.opponent !== null) return
		bot.opponent = "player"
		bot.mood =
			bot.personality === "coward"
				? "scared"
				: bot.personality === "kamikaze"
					? "berserk"
					: "angry"
		bot.statusMaterial.color.set("#ffefe0")
		bot.visionMaterial.opacity = 0.15
	}

	#updateBot(
		bot: DroneBot,
		delta: number,
		playerPosition: THREE.Vector3,
	): void {
		bot.attackCooldown -= delta
		const toPlayer = TMP_A.copy(playerPosition).sub(bot.group.position)
		const distance = toPlayer.length()
		const direction =
			distance > 0.001 ? toPlayer.normalize().clone() : new THREE.Vector3()
		let desired = new THREE.Vector3()
		let speed = 2.2

		if (bot.opponent === null) {
			bot.wanderAngle += delta * (0.25 + (bot.id % 4) * 0.04)
			desired.set(Math.cos(bot.wanderAngle), 0, Math.sin(bot.wanderAngle))
		} else if (bot.mood === "scared") {
			speed = 8.2
			if (distance < SAFE_DISTANCE) {
				desired.copy(direction).multiplyScalar(-1)
			} else {
				const ally = this.#nearestUnaggroedAlly(bot)
				if (ally === undefined) {
					desired.copy(direction).multiplyScalar(-0.35)
				} else {
					desired.copy(ally.group.position).sub(bot.group.position).normalize()
				}
			}
		} else if (bot.mood === "haughty") {
			speed = 5.2
			desired.copy(this.#rangeKeepingDirection(direction, distance, 21, 26))
			if (distance < 36 && bot.attackCooldown <= 0) {
				this.#fireAt(bot, playerPosition, 7, "#ffe16b")
				bot.attackCooldown = 1.15
			}
		} else if (bot.mood === "berserk") {
			speed = 10.2
			desired.copy(direction)
			if (distance < 3.3) {
				this.#detonate(bot, distance)
				return
			}
		} else if (bot.mood === "angry") {
			speed = 7
			desired.copy(this.#rangeKeepingDirection(direction, distance, 10, 14))
			if (distance < 18) this.#updateBullyWeapon(bot, playerPosition)
		}

		desired.y = 0
		if (desired.lengthSq() > 0.001) desired.normalize().multiplyScalar(speed)
		bot.velocity.lerp(desired, Math.min(1, delta * 3.6))
		bot.group.position.addScaledVector(bot.velocity, delta)
		const hoverHeight =
			this.#heightAt(bot.group.position.x, bot.group.position.z) +
			3.2 +
			Math.sin(performance.now() * 0.0025 + bot.id) * 0.25
		bot.group.position.y = THREE.MathUtils.lerp(
			bot.group.position.y,
			hoverHeight,
			Math.min(1, delta * 4),
		)
		if (desired.lengthSq() > 0.01) {
			const targetYaw = Math.atan2(-desired.x, -desired.z)
			bot.group.rotation.y = this.#lerpAngle(
				bot.group.rotation.y,
				targetYaw,
				Math.min(1, delta * 4.5),
			)
		}
	}

	#nearestUnaggroedAlly(bot: DroneBot): DroneBot | undefined {
		let nearest: DroneBot | undefined
		let distance = Number.POSITIVE_INFINITY
		for (const candidate of this.#bots) {
			if (candidate === bot || candidate.opponent !== null) continue
			const candidateDistance = candidate.group.position.distanceTo(
				bot.group.position,
			)
			if (candidateDistance < distance) {
				distance = candidateDistance
				nearest = candidate
			}
		}
		return nearest
	}

	#rangeKeepingDirection(
		direction: THREE.Vector3,
		distance: number,
		minimum: number,
		maximum: number,
	): THREE.Vector3 {
		if (distance < minimum) return direction.clone().multiplyScalar(-1)
		if (distance > maximum) return direction.clone()
		return new THREE.Vector3(-direction.z, 0, direction.x).multiplyScalar(0.45)
	}

	#updateBullyWeapon(bot: DroneBot, playerPosition: THREE.Vector3): void {
		if (bot.attackCooldown > 0) return
		if (bot.burstRounds === 0) bot.burstRounds = 9
		this.#fireAt(bot, playerPosition, 2.8, "#62a5ff")
		bot.burstRounds -= 1
		bot.attackCooldown = bot.burstRounds === 0 ? 1.7 : 0.12
	}

	#fireAt(
		bot: DroneBot,
		playerPosition: THREE.Vector3,
		damage: number,
		color: THREE.ColorRepresentation,
	): void {
		const origin = bot.group.position.clone()
		origin.y -= 0.1
		const direction = playerPosition
			.clone()
			.sub(origin)
			.normalize()
			.add(
				new THREE.Vector3(
					(Math.random() - 0.5) * 0.025,
					(Math.random() - 0.5) * 0.025,
					(Math.random() - 0.5) * 0.025,
				),
			)
			.normalize()
		this.#shoot(origin, direction, damage, color)
	}

	#detonate(bot: DroneBot, distance: number): void {
		const damage = THREE.MathUtils.lerp(
			52,
			34,
			THREE.MathUtils.clamp(distance / 3.3, 0, 1),
		)
		this.#onPlayerDamage(damage)
		this.#destroy(bot, true)
	}

	#destroy(bot: DroneBot, selfDestructed: boolean): void {
		const explosionMaterial = new THREE.MeshBasicMaterial({
			color: selfDestructed ? "#ff4b44" : PERSONALITY_COLORS[bot.personality],
			opacity: 0.72,
			transparent: true,
			wireframe: true,
		})
		const explosion = new THREE.Mesh(
			new THREE.IcosahedronGeometry(selfDestructed ? 2.6 : 1.1, 1),
			explosionMaterial,
		)
		explosion.position.copy(bot.group.position)
		this.#scene.add(explosion)
		this.#effects.push({ life: 0.45, mesh: explosion })
		this.#scene.remove(bot.group)
		const index = this.#bots.indexOf(bot)
		if (index >= 0) this.#bots.splice(index, 1)
		if (!selfDestructed) this.#onBotDestroyed()

		for (const survivor of this.#bots) {
			if (
				survivor.personality === "coward" &&
				survivor.broughtAllies.delete(bot.id)
			) {
				survivor.mood = "scared"
			}
		}
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
