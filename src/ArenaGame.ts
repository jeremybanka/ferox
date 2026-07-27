import type { Socket } from "socket.io-client"
import * as THREE from "three"

import type {
	ArenaSnapshot,
	CombatSnapshot,
	DroneDestroyedSnapshot,
	FireIntent,
	ProjectileEndedSnapshot,
	ProjectileSnapshot,
} from "./arena-protocol.ts"
import { arenaHeightAt, arenaSeededValue } from "./arena-terrain.ts"
import { DroneBotSystem } from "./DroneBotSystem.ts"
import {
	FREE_AIM_TAP_THRESHOLD_MS,
	SMART_TARGET_RADIUS_SCREEN,
	TARGET_ESCAPE_DURATION_MS,
	TARGET_LOST_FLASH_MS,
} from "./game-constants.ts"
import type { GameHudState } from "./game-state.ts"
import { applyFreeAimPose } from "./pilot/AimPose.ts"
import {
	applyCrouchIdleAnimation,
	applyCrouchMoveAnimation,
} from "./pilot/CrouchAnimation.ts"
import { applyDoubleJumpAnimation } from "./pilot/DoubleJumpAnimation.ts"
import { applyJumpAnimation } from "./pilot/JumpAnimation.ts"
import {
	createPilotModel,
	resetPilotPose,
	type PilotRig,
} from "./pilot/PilotModel.ts"
import { applyRunAnimation, type RunDirection } from "./pilot/RunAnimation.ts"

type PlayerSnapshot = {
	crouching: boolean
	freeAim: boolean
	id: string
	jump: 0 | 1 | 2
	position: [number, number, number]
	rotation: [number, number]
	sprinting: boolean
	velocity: [number, number, number]
}

type SpawnSnapshot = {
	position: [number, number]
	yaw: number
}

type ArenaGameOptions = {
	canvas: HTMLCanvasElement
	onHud: (state: GameHudState) => void
	seed: number
	socket: Socket
}

type Projectile = {
	id: number
	life: number
	mesh: THREE.Mesh
	velocity: THREE.Vector3
}

type TargetingState =
	| "acquired"
	| "escaping"
	| "free"
	| "idle"
	| "locked"
	| "lost"

type RemotePilot = {
	crouching: boolean
	freeAim: boolean
	jump: 0 | 1 | 2
	pitch: number
	position: THREE.Vector3
	rig: PilotRig
	sprinting: boolean
	target: THREE.Vector3
	velocity: THREE.Vector3
	yaw: number
}

const PLAYER_EYE = 1.72
const CROUCH_EYE = 1.08
const ARENA_SIZE = 118
const REMOTE_MARKER_GEOMETRY = new THREE.OctahedronGeometry(0.2, 0)
const REMOTE_MARKER_MATERIAL = new THREE.MeshBasicMaterial({
	color: "#79f5e2",
	toneMapped: false,
})

export class ArenaGame {
	readonly #canvas: HTMLCanvasElement
	readonly #camera = new THREE.PerspectiveCamera(76, 1, 0.08, 280)
	readonly #drones: DroneBotSystem
	readonly #keys = new Set<string>()
	readonly #onHud: (state: GameHudState) => void
	readonly #player = {
		position: new THREE.Vector3(0, 8, 13),
		velocity: new THREE.Vector3(),
		yaw: Math.PI,
		pitch: -0.04,
		jumps: 0 as 0 | 1 | 2,
	}
	readonly #projectiles: Projectile[] = []
	readonly #remotePlayers = new Map<string, RemotePilot>()
	readonly #renderer: THREE.WebGLRenderer
	readonly #scene = new THREE.Scene()
	readonly #seed: number
	readonly #socket: Socket
	readonly #weapon = new THREE.Group()
	#ammo = 28
	#acquiredTargetId: number | null = null
	#animationFrame = 0
	#bumperTapTargetId: number | null = null
	#connected = false
	#crouching = false
	#disposed = false
	#fireCooldown = 0
	#freeAim = false
	#health = 100
	#hudElapsed = 0
	#jumpQueued = false
	#lastFrame = performance.now()
	#leftBumperDuration = 0
	#leftBumperHeld = false
	#lockedTargetId: number | null = null
	#lockToggleQueued = false
	#lookGamepad = new THREE.Vector2()
	#noiseTimer = 0
	#reticleX = 0.5
	#reticleY = 0.5
	#rightBumperHeld = false
	#score = 0
	#shotSequence = 0
	#shotHeld = false
	#slide = false
	#snapshotElapsed = 0
	#sprinting = false
	#targetEscapeRemaining = TARGET_ESCAPE_DURATION_MS
	#targetLostFlashRemaining = 0
	#targetingState: TargetingState = "idle"

	constructor(options: ArenaGameOptions) {
		this.#canvas = options.canvas
		this.#onHud = options.onHud
		this.#seed = options.seed
		this.#socket = options.socket
		this.#renderer = new THREE.WebGLRenderer({
			antialias: true,
			canvas: this.#canvas,
			powerPreference: "high-performance",
		})
		this.#renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75))
		this.#renderer.outputColorSpace = THREE.SRGBColorSpace
		this.#renderer.toneMapping = THREE.ACESFilmicToneMapping
		this.#renderer.toneMappingExposure = 1.1
		this.#scene.background = new THREE.Color("#171a31")
		this.#scene.fog = new THREE.FogExp2("#171a31", 0.014)
		this.#buildWorld()
		this.#buildWeapon()
		this.#drones = new DroneBotSystem({
			scene: this.#scene,
		})
		this.#bindEvents()
		this.#player.position.y = this.#heightAt(0, 13) + PLAYER_EYE
		this.#connected = this.#socket.connected
		this.#socket.connect()
		this.#animate()
	}

	start(): void {
		this.#canvas.focus()
		void this.#canvas.requestPointerLock()
	}

	dispose(): void {
		this.#disposed = true
		cancelAnimationFrame(this.#animationFrame)
		window.removeEventListener("keydown", this.#onKeyDown)
		window.removeEventListener("keyup", this.#onKeyUp)
		window.removeEventListener("mousemove", this.#onMouseMove)
		window.removeEventListener("mousedown", this.#onMouseDown)
		window.removeEventListener("resize", this.#resize)
		this.#socket.off("connect", this.#onConnect)
		this.#socket.off("disconnect", this.#onDisconnect)
		this.#socket.off("arena:players", this.#onPlayers)
		this.#socket.off("arena:spawn", this.#onSpawn)
		this.#socket.off("arena:combat", this.#onCombat)
		this.#socket.off("arena:drone-destroyed", this.#onDroneDestroyed)
		this.#socket.off("arena:projectile", this.#onProjectile)
		this.#socket.off("arena:projectile-ended", this.#onProjectileEnded)
		this.#socket.off("arena:snapshot", this.#onSnapshot)
		this.#drones.dispose()
		this.#renderer.dispose()
	}

	readonly #onKeyDown = (event: KeyboardEvent): void => {
		this.#keys.add(event.code)
		if (event.code === "Space" && !event.repeat) this.#jumpQueued = true
		if (event.code === "KeyR" && this.#ammo < 28) this.#ammo = 28
	}

	readonly #onKeyUp = (event: KeyboardEvent): void => {
		this.#keys.delete(event.code)
	}

	readonly #onMouseMove = (event: MouseEvent): void => {
		if (document.pointerLockElement !== this.#canvas) return
		const sensitivity = this.#freeAim ? 0.000_85 : 0.0018
		this.#player.yaw -= event.movementX * sensitivity
		this.#player.pitch = THREE.MathUtils.clamp(
			this.#player.pitch - event.movementY * sensitivity,
			-1.42,
			1.42,
		)
	}

	readonly #onMouseDown = (event: MouseEvent): void => {
		if (document.pointerLockElement !== this.#canvas) {
			this.start()
			return
		}
		if (event.button === 0) this.#fire()
	}

	readonly #resize = (): void => {
		const width = this.#canvas.clientWidth
		const height = this.#canvas.clientHeight
		this.#camera.aspect = width / Math.max(height, 1)
		this.#camera.updateProjectionMatrix()
		this.#renderer.setSize(width, height, false)
	}

	readonly #onConnect = (): void => {
		this.#connected = true
		this.#socket.emit("arena:ready")
	}

	readonly #onDisconnect = (): void => {
		this.#connected = false
		this.#drones.reset()
		for (const projectile of this.#projectiles) {
			this.#scene.remove(projectile.mesh)
		}
		this.#projectiles.length = 0
	}

	readonly #onSpawn = (spawn: SpawnSnapshot): void => {
		const [x, z] = spawn.position
		if (![x, z, spawn.yaw].every(Number.isFinite)) return
		this.#player.position.set(x, this.#heightAt(x, z) + PLAYER_EYE, z)
		this.#player.velocity.set(0, 0, 0)
		this.#player.yaw = spawn.yaw
		this.#player.pitch = -0.04
		this.#camera.position.copy(this.#player.position)
		this.#camera.rotation.set(this.#player.pitch, this.#player.yaw, 0, "YXZ")
		this.#socket.emit("arena:move", {
			crouching: false,
			freeAim: false,
			jump: 0,
			position: this.#player.position.toArray(),
			rotation: [this.#player.yaw, this.#player.pitch],
			sprinting: false,
			velocity: [0, 0, 0],
		})
	}

	readonly #onPlayers = (players: PlayerSnapshot[]): void => {
		const active = new Set<string>()
		for (const snapshot of players) {
			if (snapshot.id === this.#socket.id) continue
			active.add(snapshot.id)
			let model = this.#remotePlayers.get(snapshot.id)
			let isNew = false
			if (model === undefined) {
				const rig = createPilotModel()
				rig.root.scale.setScalar(0.54)
				const marker = new THREE.Mesh(
					REMOTE_MARKER_GEOMETRY,
					REMOTE_MARKER_MATERIAL,
				)
				marker.position.y = 4.45
				marker.rotation.y = Math.PI / 4
				rig.root.add(marker)
				model = {
					crouching: false,
					freeAim: false,
					jump: 0,
					pitch: 0,
					position: new THREE.Vector3(),
					rig,
					sprinting: false,
					target: new THREE.Vector3(),
					velocity: new THREE.Vector3(),
					yaw: 0,
				}
				this.#remotePlayers.set(snapshot.id, model)
				this.#scene.add(rig.root)
				isNew = true
			}
			model.target
				.set(...snapshot.position)
				.addScaledVector(
					new THREE.Vector3(0, 1, 0),
					snapshot.crouching ? -CROUCH_EYE : -PLAYER_EYE,
				)
			if (isNew) model.position.copy(model.target)
			model.velocity.set(...snapshot.velocity)
			model.yaw = snapshot.rotation[0]
			model.pitch = snapshot.rotation[1]
			model.crouching = snapshot.crouching
			model.freeAim = snapshot.freeAim
			model.jump = snapshot.jump
			model.sprinting = snapshot.sprinting
		}
		for (const [id, model] of this.#remotePlayers) {
			if (!active.has(id)) {
				this.#scene.remove(model.rig.root)
				this.#remotePlayers.delete(id)
			}
		}
	}

	readonly #onCombat = (combat: CombatSnapshot): void => {
		if (!Number.isFinite(combat.health) || !Number.isFinite(combat.score))
			return
		this.#health = combat.health
		this.#score = combat.score
	}

	readonly #onDroneDestroyed = (destroyed: DroneDestroyedSnapshot): void => {
		this.#drones.showDestroyed(destroyed)
	}

	readonly #onProjectile = (projectile: ProjectileSnapshot): void => {
		this.#spawnProjectile(
			projectile.id,
			new THREE.Vector3(...projectile.origin),
			new THREE.Vector3(...projectile.direction),
			projectile.color,
		)
	}

	readonly #onProjectileEnded = (ended: ProjectileEndedSnapshot): void => {
		const index = this.#projectiles.findIndex(
			(projectile) => projectile.id === ended.id,
		)
		if (index < 0) return
		const projectile = this.#projectiles[index]
		if (projectile !== undefined) this.#scene.remove(projectile.mesh)
		this.#projectiles.splice(index, 1)
	}

	readonly #onSnapshot = (snapshot: ArenaSnapshot): void => {
		this.#drones.applySnapshot(snapshot)
	}

	#bindEvents(): void {
		window.addEventListener("keydown", this.#onKeyDown)
		window.addEventListener("keyup", this.#onKeyUp)
		window.addEventListener("mousemove", this.#onMouseMove)
		window.addEventListener("mousedown", this.#onMouseDown)
		window.addEventListener("resize", this.#resize)
		this.#socket.on("connect", this.#onConnect)
		this.#socket.on("disconnect", this.#onDisconnect)
		this.#socket.on("arena:players", this.#onPlayers)
		this.#socket.on("arena:spawn", this.#onSpawn)
		this.#socket.on("arena:combat", this.#onCombat)
		this.#socket.on("arena:drone-destroyed", this.#onDroneDestroyed)
		this.#socket.on("arena:projectile", this.#onProjectile)
		this.#socket.on("arena:projectile-ended", this.#onProjectileEnded)
		this.#socket.on("arena:snapshot", this.#onSnapshot)
		this.#resize()
	}

	#heightAt(x: number, z: number): number {
		return arenaHeightAt(this.#seed, x, z)
	}

	#buildWorld(): void {
		const hemisphere = new THREE.HemisphereLight("#86d9d1", "#251522", 2.3)
		this.#scene.add(hemisphere)
		const sun = new THREE.DirectionalLight("#ffb06a", 5.4)
		sun.position.set(-34, 44, 18)
		this.#scene.add(sun)

		const geometry = new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE, 104, 104)
		geometry.rotateX(-Math.PI / 2)
		const positions = geometry.attributes.position
		if (positions === undefined) throw new Error("Terrain has no positions.")
		const colors = new Float32Array(positions.count * 3)
		const low = new THREE.Color("#243936")
		const high = new THREE.Color("#775c48")
		for (let index = 0; index < positions.count; index += 1) {
			const x = positions.getX(index)
			const z = positions.getZ(index)
			const y = this.#heightAt(x, z)
			positions.setY(index, y)
			const color = low
				.clone()
				.lerp(high, THREE.MathUtils.clamp((y + 6) / 20, 0, 1))
			const variation = arenaSeededValue(this.#seed, x, z) * 0.08
			colors[index * 3] = color.r + variation
			colors[index * 3 + 1] = color.g + variation
			colors[index * 3 + 2] = color.b + variation
		}
		geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3))
		geometry.computeVertexNormals()
		const terrain = new THREE.Mesh(
			geometry,
			new THREE.MeshStandardMaterial({
				color: "#ffffff",
				flatShading: true,
				roughness: 0.92,
				vertexColors: true,
			}),
		)
		this.#scene.add(terrain)

		const grid = new THREE.GridHelper(ARENA_SIZE, 36, "#79e7d4", "#4d6b6e")
		grid.position.y = -6
		const gridMaterial = grid.material
		if (!Array.isArray(gridMaterial)) {
			gridMaterial.transparent = true
			gridMaterial.opacity = 0.16
		}
		this.#scene.add(grid)

		const crystalGeometry = new THREE.OctahedronGeometry(0.62, 0)
		const crystalMaterial = new THREE.MeshStandardMaterial({
			color: "#73f2d3",
			emissive: "#20a991",
			emissiveIntensity: 2.2,
			metalness: 0.25,
			roughness: 0.22,
		})
		for (let index = 0; index < 18; index += 1) {
			const angle = arenaSeededValue(this.#seed, index, 2) * Math.PI * 2
			const radius = 13 + arenaSeededValue(this.#seed, index, 7) * 38
			const x = Math.cos(angle) * radius
			const z = Math.sin(angle) * radius
			const crystal = new THREE.Mesh(crystalGeometry, crystalMaterial)
			crystal.position.set(x, this.#heightAt(x, z) + 0.8, z)
			crystal.scale.y = 1.5 + arenaSeededValue(this.#seed, index, 4) * 2.8
			crystal.rotation.y = angle
			this.#scene.add(crystal)
		}

		const ring = new THREE.Mesh(
			new THREE.TorusGeometry(5.4, 0.26, 8, 48),
			new THREE.MeshStandardMaterial({
				color: "#ff9856",
				emissive: "#d45428",
				emissiveIntensity: 2.7,
			}),
		)
		ring.position.set(-18, this.#heightAt(-18, -15) + 5.6, -15)
		ring.rotation.y = Math.PI / 2
		this.#scene.add(ring)

		const moon = new THREE.Mesh(
			new THREE.SphereGeometry(7, 24, 16),
			new THREE.MeshBasicMaterial({ color: "#ffc99f" }),
		)
		moon.position.set(-76, 54, -118)
		this.#scene.add(moon)
	}

	#buildWeapon(): void {
		const dark = new THREE.MeshStandardMaterial({
			color: "#26303b",
			metalness: 0.72,
			roughness: 0.3,
		})
		const accent = new THREE.MeshStandardMaterial({
			color: "#e86d3f",
			emissive: "#a72819",
			emissiveIntensity: 0.8,
			metalness: 0.45,
			roughness: 0.28,
		})
		const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.62), dark)
		const barrel = new THREE.Mesh(
			new THREE.CylinderGeometry(0.07, 0.09, 0.46, 10),
			accent,
		)
		barrel.rotation.x = Math.PI / 2
		barrel.position.set(0, 0.03, -0.47)
		const sight = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.12), accent)
		sight.position.set(0, 0.14, -0.1)
		this.#weapon.add(body, barrel, sight)
		this.#weapon.position.set(0.35, -0.31, -0.7)
		this.#camera.add(this.#weapon)
		this.#scene.add(this.#camera)
	}

	#pollGamepad(): {
		crouch: boolean
		fire: boolean
		jump: boolean
		lock: boolean
		reload: boolean
		sprint: boolean
		x: number
		y: number
	} {
		const gamepad = navigator.getGamepads().find((pad) => pad !== null)
		if (gamepad === undefined || gamepad === null) {
			this.#lookGamepad.set(0, 0)
			return {
				crouch: false,
				fire: false,
				jump: false,
				lock: false,
				reload: false,
				sprint: false,
				x: 0,
				y: 0,
			}
		}
		const deadzone = (value: number): number =>
			Math.abs(value) < 0.14 ? 0 : value
		this.#lookGamepad.set(
			deadzone(gamepad.axes[2] ?? 0),
			deadzone(gamepad.axes[3] ?? 0),
		)
		const jump = gamepad.buttons[0]?.pressed ?? false
		const crouch = gamepad.buttons[1]?.pressed ?? false
		const fire = (gamepad.buttons[7]?.value ?? 0) > 0.25
		const lock = gamepad.buttons[4]?.pressed ?? false
		const reload = gamepad.buttons[5]?.pressed ?? false
		const sprint = gamepad.buttons[10]?.pressed ?? false
		return {
			crouch,
			fire,
			jump,
			lock,
			reload,
			sprint,
			x: deadzone(gamepad.axes[0] ?? 0),
			y: deadzone(gamepad.axes[1] ?? 0),
		}
	}

	#updatePhysics(delta: number): void {
		const gamepad = this.#pollGamepad()
		const freeAimPressed = gamepad.lock || this.#keys.has("KeyQ")
		if (freeAimPressed) {
			if (!this.#leftBumperHeld) {
				this.#leftBumperDuration = 0
				this.#bumperTapTargetId = this.#acquiredTargetId ?? this.#lockedTargetId
			}
			this.#leftBumperDuration += delta * 1_000
			this.#freeAim = true
		} else {
			if (
				this.#leftBumperHeld &&
				this.#leftBumperDuration < FREE_AIM_TAP_THRESHOLD_MS
			) {
				this.#lockToggleQueued = true
			}
			this.#leftBumperDuration = 0
			this.#freeAim = false
		}
		this.#leftBumperHeld = freeAimPressed
		if (gamepad.reload && !this.#rightBumperHeld) this.#ammo = 28
		this.#rightBumperHeld = gamepad.reload
		const lookSensitivity = this.#freeAim ? 1.15 : 2.7
		this.#player.yaw -= this.#lookGamepad.x * delta * lookSensitivity
		this.#player.pitch = THREE.MathUtils.clamp(
			this.#player.pitch - this.#lookGamepad.y * delta * lookSensitivity * 0.84,
			-1.42,
			1.42,
		)
		const crouch =
			this.#keys.has("ControlLeft") || this.#keys.has("KeyC") || gamepad.crouch
		this.#crouching = crouch
		const eye = crouch ? CROUCH_EYE : PLAYER_EYE
		const ground =
			this.#heightAt(this.#player.position.x, this.#player.position.z) + eye
		const grounded =
			this.#player.position.y <= ground + 0.12 && this.#player.velocity.y <= 0
		const speed = Math.hypot(this.#player.velocity.x, this.#player.velocity.z)
		this.#slide = grounded && crouch && speed > 4.3
		if (grounded) {
			this.#player.position.y = ground
			this.#player.velocity.y = Math.max(this.#player.velocity.y, 0)
			this.#player.jumps = 0
		}

		const keyboardX =
			Number(this.#keys.has("KeyD")) - Number(this.#keys.has("KeyA"))
		const keyboardY =
			Number(this.#keys.has("KeyS")) - Number(this.#keys.has("KeyW"))
		const input = new THREE.Vector2(
			keyboardX + gamepad.x,
			keyboardY + gamepad.y,
		)
		if (input.length() > 1) input.normalize()
		const sprint =
			this.#keys.has("ShiftLeft") ||
			this.#keys.has("ShiftRight") ||
			gamepad.sprint
		this.#sprinting = grounded && sprint && input.lengthSq() > 0 && !this.#slide
		if (grounded && input.lengthSq() > 0 && !this.#slide) {
			const forward = new THREE.Vector3(
				-Math.sin(this.#player.yaw),
				0,
				-Math.cos(this.#player.yaw),
			)
			const right = new THREE.Vector3(
				Math.cos(this.#player.yaw),
				0,
				-Math.sin(this.#player.yaw),
			)
			const force = forward
				.multiplyScalar(-input.y)
				.add(right.multiplyScalar(input.x))
				.normalize()
			const acceleration = sprint ? 31 : 23
			this.#player.velocity.addScaledVector(force, acceleration * delta)
		}
		const friction = grounded
			? this.#slide
				? 1.05
				: input.lengthSq() > 0
					? 1.7
					: 8.5
			: 0
		const damping = Math.exp(-friction * delta)
		this.#player.velocity.x *= damping
		this.#player.velocity.z *= damping
		const cap = sprint || this.#slide ? 14.8 : 9.2
		const horizontalSpeed = Math.hypot(
			this.#player.velocity.x,
			this.#player.velocity.z,
		)
		if (horizontalSpeed > cap) {
			const scale = cap / horizontalSpeed
			this.#player.velocity.x *= scale
			this.#player.velocity.z *= scale
		}

		const gamepadJumpPressed = gamepad.jump
		if (gamepadJumpPressed && !this.#shotHeld) this.#jumpQueued = true
		if (this.#jumpQueued) {
			if (grounded) {
				this.#player.velocity.y = 10.6
				this.#player.jumps = 1
			} else if (this.#player.jumps < 2) {
				this.#player.velocity.y = 9.4
				this.#player.jumps = 2
			}
			this.#jumpQueued = false
		}
		this.#shotHeld = gamepadJumpPressed
		if (!grounded) this.#player.velocity.y -= 23 * delta
		this.#player.position.addScaledVector(this.#player.velocity, delta)
		const boundary = ARENA_SIZE * 0.47
		this.#player.position.x = THREE.MathUtils.clamp(
			this.#player.position.x,
			-boundary,
			boundary,
		)
		this.#player.position.z = THREE.MathUtils.clamp(
			this.#player.position.z,
			-boundary,
			boundary,
		)
		const nextGround =
			this.#heightAt(this.#player.position.x, this.#player.position.z) + eye
		if (this.#player.position.y < nextGround) {
			this.#player.position.y = nextGround
			this.#player.velocity.y = 0
		}
		const trigger = gamepad.fire || this.#keys.has("KeyF")
		if (trigger && this.#fireCooldown <= 0) this.#fire()
		this.#fireCooldown -= delta
	}

	#fire(): void {
		if (this.#fireCooldown > 0 || this.#ammo === 0) return
		if (this.#sprinting) return
		if (
			this.#lockedTargetId !== null &&
			this.#acquiredTargetId === null &&
			!this.#freeAim
		)
			return
		this.#fireCooldown = 0.13
		this.#ammo -= 1
		const origin = this.#camera.getWorldPosition(new THREE.Vector3())
		const acquiredPosition =
			this.#acquiredTargetId === null
				? null
				: this.#drones.getTargetPosition(this.#acquiredTargetId)
		const direction =
			acquiredPosition === null
				? new THREE.Vector3(0, 0, -1)
						.applyQuaternion(this.#camera.quaternion)
						.normalize()
				: acquiredPosition.sub(origin).normalize()
		origin.addScaledVector(direction, 0.8)
		this.#noiseTimer = 0.85
		this.#weapon.position.z += 0.12
		this.#shotSequence += 1
		this.#socket.emit("arena:fire", {
			clientShotId: this.#shotSequence,
			direction: direction.toArray(),
			origin: origin.toArray(),
		} satisfies FireIntent)
	}

	#spawnProjectile(
		id: number,
		origin: THREE.Vector3,
		direction: THREE.Vector3,
		color: THREE.ColorRepresentation = "#b8fff1",
	): void {
		const mesh = new THREE.Mesh(
			new THREE.SphereGeometry(0.09, 8, 8),
			new THREE.MeshBasicMaterial({ color }),
		)
		const light = new THREE.PointLight(color, 3, 5)
		mesh.add(light)
		mesh.position.copy(origin)
		this.#scene.add(mesh)
		this.#projectiles.push({
			id,
			life: 2.4,
			mesh,
			velocity: direction.multiplyScalar(55),
		})
	}

	#updateProjectiles(delta: number): void {
		for (let index = this.#projectiles.length - 1; index >= 0; index -= 1) {
			const projectile = this.#projectiles[index]
			if (projectile === undefined) continue
			projectile.life -= delta
			projectile.mesh.position.addScaledVector(projectile.velocity, delta)
			const hitGround =
				projectile.mesh.position.y <=
				this.#heightAt(projectile.mesh.position.x, projectile.mesh.position.z) +
					0.12
			if (projectile.life <= 0 || hitGround) {
				this.#scene.remove(projectile.mesh)
				this.#projectiles.splice(index, 1)
			}
		}
	}

	#updateCamera(delta: number): void {
		this.#camera.position.copy(this.#player.position)
		this.#camera.rotation.set(this.#player.pitch, this.#player.yaw, 0, "YXZ")
		const speed = Math.hypot(this.#player.velocity.x, this.#player.velocity.z)
		const bob =
			Math.sin(performance.now() * 0.012) * Math.min(speed * 0.002, 0.025)
		this.#weapon.position.y = THREE.MathUtils.lerp(
			this.#weapon.position.y,
			-0.31 + bob,
			delta * 8,
		)
		this.#weapon.position.z = THREE.MathUtils.lerp(
			this.#weapon.position.z,
			-0.7,
			delta * 18,
		)
		const targetFov = speed > 10 ? 83 : 76
		this.#camera.fov = THREE.MathUtils.lerp(
			this.#camera.fov,
			targetFov,
			delta * 4,
		)
		this.#camera.updateProjectionMatrix()
		this.#camera.updateMatrixWorld()
	}

	#updateTargeting(delta: number): void {
		if (this.#freeAim) {
			this.#targetingState = "free"
			this.#acquiredTargetId = null
			this.#reticleX = 0.5
			this.#reticleY = 0.5
			return
		}

		if (this.#targetLostFlashRemaining > 0) {
			this.#targetLostFlashRemaining -= delta * 1_000
			this.#targetingState = "lost"
			this.#acquiredTargetId = null
			this.#reticleX = 0.5
			this.#reticleY = 0.5
			if (this.#targetLostFlashRemaining <= 0) this.#targetingState = "idle"
			return
		}

		if (this.#lockToggleQueued) {
			this.#lockToggleQueued = false
			if (this.#lockedTargetId !== null) {
				this.#lockedTargetId = null
				this.#targetEscapeRemaining = TARGET_ESCAPE_DURATION_MS
			} else {
				const targetId = this.#bumperTapTargetId ?? this.#acquiredTargetId
				if (targetId !== null) this.#lockedTargetId = targetId
				this.#targetEscapeRemaining = TARGET_ESCAPE_DURATION_MS
			}
			this.#bumperTapTargetId = null
		}

		if (this.#lockedTargetId !== null) {
			const lockedPosition = this.#drones.getTargetPosition(
				this.#lockedTargetId,
			)
			if (lockedPosition === null) {
				this.#loseTarget()
				return
			}
			const projected = this.#projectTarget(lockedPosition)
			if (projected !== null && projected.inside) {
				this.#acquiredTargetId = this.#lockedTargetId
				this.#targetingState = "locked"
				this.#targetEscapeRemaining = TARGET_ESCAPE_DURATION_MS
				this.#reticleX = projected.x
				this.#reticleY = projected.y
				return
			}
			this.#acquiredTargetId = null
			this.#targetingState = "escaping"
			this.#targetEscapeRemaining = Math.max(
				0,
				this.#targetEscapeRemaining - delta * 1_000,
			)
			this.#reticleX = 0.5
			this.#reticleY = 0.5
			if (this.#targetEscapeRemaining <= 0) this.#loseTarget()
			return
		}

		let best:
			| {
					distance: number
					id: number
					x: number
					y: number
			  }
			| undefined
		for (const candidate of this.#drones.getTargetCandidates()) {
			const projected = this.#projectTarget(candidate.position)
			if (projected === null || !projected.inside) continue
			if (best === undefined || projected.distance < best.distance) {
				best = {
					distance: projected.distance,
					id: candidate.id,
					x: projected.x,
					y: projected.y,
				}
			}
		}
		this.#acquiredTargetId = best?.id ?? null
		this.#targetingState = best === undefined ? "idle" : "acquired"
		this.#reticleX = best?.x ?? 0.5
		this.#reticleY = best?.y ?? 0.5
	}

	#projectTarget(position: THREE.Vector3): {
		distance: number
		inside: boolean
		x: number
		y: number
	} | null {
		const cameraSpace = this.#camera.worldToLocal(position.clone())
		if (cameraSpace.z >= 0) return null
		const projected = position.clone().project(this.#camera)
		const width = Math.max(this.#canvas.clientWidth, 1)
		const height = Math.max(this.#canvas.clientHeight, 1)
		const x = projected.x * 0.5 + 0.5
		const y = projected.y * -0.5 + 0.5
		const dx = (x - 0.5) * width
		const dy = (y - 0.5) * height
		const distance = Math.hypot(dx, dy)
		return {
			distance,
			inside:
				projected.z >= -1 &&
				projected.z <= 1 &&
				distance <= Math.min(width, height) * SMART_TARGET_RADIUS_SCREEN,
			x,
			y,
		}
	}

	#loseTarget(): void {
		this.#lockedTargetId = null
		this.#acquiredTargetId = null
		this.#targetEscapeRemaining = TARGET_ESCAPE_DURATION_MS
		this.#targetLostFlashRemaining = TARGET_LOST_FLASH_MS
		this.#targetingState = "lost"
	}

	#updateWeaponPosture(delta: number): void {
		const desired = new THREE.Quaternion()
		const targetPosition =
			this.#acquiredTargetId === null
				? null
				: this.#drones.getTargetPosition(this.#acquiredTargetId)
		if (this.#sprinting) {
			desired.setFromEuler(new THREE.Euler(1.05, 0, 0))
		} else if (targetPosition !== null) {
			const localTarget = this.#camera.worldToLocal(targetPosition)
			const direction = localTarget.sub(this.#weapon.position).normalize()
			desired.setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction)
		} else if (this.#targetingState === "escaping") {
			desired.setFromEuler(new THREE.Euler(1.05, 0, 0))
		}
		this.#weapon.quaternion.slerp(desired, Math.min(1, delta * 9))
	}

	#updateRemotePlayers(delta: number): void {
		for (const model of this.#remotePlayers.values()) {
			model.position.lerp(model.target, Math.min(1, delta * 12))
			resetPilotPose(model.rig)
			const horizontalSpeed = Math.hypot(model.velocity.x, model.velocity.z)
			const localVelocity = model.velocity
				.clone()
				.applyAxisAngle(new THREE.Vector3(0, 1, 0), -model.yaw)
			let direction: RunDirection
			if (Math.abs(localVelocity.x) > Math.abs(localVelocity.z)) {
				direction = localVelocity.x > 0 ? "right" : "left"
			} else {
				direction = localVelocity.z < 0 ? "forward" : "backward"
			}
			const animationTime = performance.now() / 1_000
			if (model.crouching) {
				if (horizontalSpeed > 0.35) {
					applyCrouchMoveAnimation(model.rig, animationTime, 1, direction)
				} else {
					applyCrouchIdleAnimation(model.rig, animationTime, 1)
				}
			} else if (model.jump === 2) {
				const progress = THREE.MathUtils.clamp(
					(9.4 - model.velocity.y) / 22,
					0,
					1,
				)
				applyDoubleJumpAnimation(model.rig, progress)
				model.rig.root.position.y = 0
			} else if (model.jump === 1) {
				const progress = THREE.MathUtils.clamp(
					(10.6 - model.velocity.y) / 23,
					0,
					1,
				)
				applyJumpAnimation(model.rig, progress)
				model.rig.root.position.y = 0
			} else if (horizontalSpeed > 0.35) {
				applyRunAnimation(
					model.rig,
					animationTime,
					THREE.MathUtils.clamp(horizontalSpeed / 8, 0.3, 1),
					direction,
				)
			}
			if (model.freeAim) {
				applyFreeAimPose(model.rig, model.pitch, 0, 1)
			}
			const poseOffset = model.rig.root.position.clone()
			model.rig.root.position.copy(model.position).add(poseOffset)
			model.rig.root.rotation.y += model.yaw
		}
	}

	#sendSnapshot(delta: number): void {
		this.#snapshotElapsed += delta
		if (!this.#connected || this.#snapshotElapsed < 0.05) return
		this.#snapshotElapsed = 0
		this.#socket.emit("arena:move", {
			crouching: this.#crouching,
			freeAim: this.#freeAim,
			jump: this.#player.jumps,
			position: this.#player.position.toArray(),
			rotation: [this.#player.yaw, this.#player.pitch],
			sprinting: this.#sprinting,
			velocity: this.#player.velocity.toArray(),
		})
	}

	#emitHud(delta: number): void {
		this.#hudElapsed += delta
		if (this.#hudElapsed < 0.09) return
		this.#hudElapsed = 0
		this.#onHud({
			ammo: this.#ammo,
			connection: this.#connected
				? "online"
				: this.#socket.active
					? "connecting"
					: "offline",
			health: this.#health,
			drones: this.#drones.count,
			jump: this.#player.jumps,
			lockCountdown: Math.ceil(this.#targetEscapeRemaining),
			players: this.#remotePlayers.size + 1,
			reticleX: this.#reticleX,
			reticleY: this.#reticleY,
			score: this.#score,
			sliding: this.#slide,
			speed: Math.round(
				Math.hypot(this.#player.velocity.x, this.#player.velocity.z) * 3.6,
			),
			targeting: this.#targetingState,
		})
	}

	#animate = (): void => {
		if (this.#disposed) return
		this.#animationFrame = requestAnimationFrame(this.#animate)
		const now = performance.now()
		const delta = Math.min((now - this.#lastFrame) / 1000, 0.04)
		this.#lastFrame = now
		this.#updatePhysics(delta)
		this.#noiseTimer = Math.max(0, this.#noiseTimer - delta)
		this.#drones.update(delta)
		this.#updateProjectiles(delta)
		this.#updateRemotePlayers(delta)
		this.#updateCamera(delta)
		this.#updateTargeting(delta)
		this.#updateWeaponPosture(delta)
		this.#sendSnapshot(delta)
		this.#emitHud(delta)
		this.#renderer.render(this.#scene, this.#camera)
	}
}
