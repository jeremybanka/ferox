import type { Socket } from "socket.io-client"
import * as THREE from "three"

import type {
	ArenaSnapshot,
	ArenaWeaponPickupSnapshot,
	BallisticEndedSnapshot,
	BallisticSnapshot,
	BubblePoppedSnapshot,
	BubbleSnapshot,
	CombatSnapshot,
	DirectHitResult,
	DroneDestroyedSnapshot,
	EquipmentSlots,
	FireIntent,
	FistContactResult,
	GestureAction,
	GestureIntent,
	GrenadeExplodedSnapshot,
	GrenadeIntent,
	GrenadeSnapshot,
	HitscanSnapshot,
	IncomingLockSnapshot,
	IncomingStandardLockSnapshot,
	InventoryActionIntent,
	MiniMissileEndedSnapshot,
	MiniMissileExplodedSnapshot,
	MiniMissileIntent,
	MiniMissilePickupSnapshot,
	MiniMissileSnapshot,
	MeleeHitResult,
	PlayerMoveSnapshot,
	PlayerDamageSnapshot,
	PlayerSnapshot,
	ReloadSnapshot,
	ProjectileEndedSnapshot,
	ProjectileSnapshot,
	StandardLockIntent,
	WeaponSlotIndex,
	PilotEmote,
	VisorExpression,
	WeaponKind,
} from "./arena-protocol.ts"
import {
	activeEquipmentSlot,
	isNewEquipmentSnapshot,
	isVisorExpression,
} from "./arena-protocol.ts"
import { arenaHeightAt, arenaSeededValue } from "./arena-terrain.ts"
import { GameAudio } from "./audio/GameAudio.ts"
import type { GameAudioDefinition } from "./audio/GameAudioDefinitions.ts"
import { BubbleVisualField } from "./BubbleVisualField.ts"
import { DamageParticleBurst } from "./DamageParticles.ts"
import { FistContactParticleBurst } from "./FistContactParticles.ts"
import { DroneBotSystem } from "./DroneBotSystem.ts"
import {
	FREE_AIM_TAP_THRESHOLD_MS,
	ARENA_WEAPON_PICKUP_RADIUS,
	GRENADE_BOUNCE_DAMPING,
	GRENADE_FUSE_SECONDS,
	GRENADE_GRAVITY,
	GRENADE_RADIUS,
	GRENADE_RESTITUTION,
	HIT_MARKER_DURATION_SECONDS,
	MINI_MISSILE_PICKUP_POSITION,
	MINI_MISSILE_PICKUP_RADIUS,
	PLAYER_SLIDE_DUST_BUDGET,
	PLAYER_SLIDE_DUST_LIFETIME_SECONDS,
	RAIL_CHARGE_MAX_MS,
	SMART_TARGET_RADIUS_SCREEN,
	TARGET_ESCAPE_DURATION_MS,
	TARGET_LOST_FLASH_MS,
} from "./game-constants.ts"
import {
	contextualRightBumperAction,
	debounceWheelInput,
	IDLE_HOLD_INPUT_STATE,
	inputEdge,
	gamepadGestureInputs,
	isPickupGamepadInput,
	isWeaponSwitchGamepadInput,
	isWeaponSwitchKeyboardInput,
	keyboardGestureInput,
	updateHoldInput,
	type HoldInputState,
} from "./game-input.ts"
import type { GameHudState } from "./game-state.ts"
import {
	DEFAULT_GUN_ID,
	gunDefinition,
	gunPresentation,
	isGunId,
} from "./guns/GunDefinitions.ts"
import {
	applyGunPresentation,
	createGunModel,
	reconcileMountedGun,
	type GunModel,
} from "./guns/GunModel.ts"
import { isJumpGrounded, JUMP_PHYSICS, stepJumpPhysics } from "./JumpPhysics.ts"
import {
	createMiniMissileTrailVisual,
	disposeMiniMissileTrailVisual,
	updateMiniMissileTrailVisual,
	type MiniMissileTrailVisual,
} from "./MiniMissileTrailVisual.ts"
import {
	addRecoilShot,
	initialRecoilSpreadState,
	normalizedRecoilSpread,
	recoverRecoilSpread,
	spreadDirection,
	type RecoilSpreadState,
} from "./RecoilSpread.ts"
import {
	BoundedDamageEffects,
	damageFlinchAnimationLayer,
	initialDamageFeedbackTracker,
	observeDamageFeedback,
	stepDamageFlinch,
	type DamageFeedbackTracker,
} from "./pilot/DamageFeedback.ts"
import {
	initialRemoteRecoilState,
	initialRemoteRecoilTracker,
	observeRemoteRecoilEvent,
	recoilAnimationLayer,
	stepRemoteRecoil,
	type RemoteRecoilState,
} from "./pilot/RecoilAnimation.ts"
import {
	pilotTorsoTargetFromRoot,
	PILOT_CROUCH_EYE_HEIGHT,
	PILOT_STANDING_EYE_HEIGHT,
} from "./pilot-targeting.ts"
import {
	cancelReload,
	reloadProgress,
	type ReloadState,
} from "./ReloadState.ts"
import { stepSlideDust } from "./SlideDustState.ts"
import {
	movementSpeedLimit,
	sampleTerrainGradient,
	stepSlidePhysics,
} from "./SlidePhysics.ts"
import {
	airborneMomentumLayer,
	airborneVelocityLayer,
	DOUBLE_JUMP_BURST_SECONDS,
	doubleJumpBurstLayer,
	LANDING_PREP_SECONDS,
	LANDING_RECOVERY_SECONDS,
	landingPreparationLayer,
	landingRecoveryLayer,
	limitAirborneShoulderSpread,
	risingFallingAnimationLayer,
} from "./pilot/AirborneAnimation.ts"
import {
	applyCrouchIdleAnimation,
	crouchRunAnimationLayer,
} from "./pilot/CrouchAnimation.ts"
import {
	lookTowardConstraint,
	pointBlasterConstraint,
	waveTowardConstraint,
} from "./pilot/DirectionalConstraints.ts"
import {
	DEATH_RAGDOLL_HANDOFF_SECONDS,
	deathAnimationLayer,
} from "./pilot/DeathAnimation.ts"
import { idleAnimationLayer } from "./pilot/IdleAnimation.ts"
import { PILOT_MODEL_SCALE } from "./pilot/PilotDimensions.ts"
import {
	createPilotModel,
	disposePilotModel,
	setPilotGun,
	type PilotRig,
} from "./pilot/PilotModel.ts"
import {
	applyPilotAnimationLayers,
	FULL_BODY_INFLUENCE,
	PilotAnimationMixer,
	sampleDraftAnimation,
	type PilotAnimationLayer,
} from "./pilot/PilotAnimation.ts"
import { PilotRagdollPresentation } from "./pilot/PilotRagdoll.ts"
import {
	runAnimationLayer,
	runDirectionFromLocalVelocity,
} from "./pilot/RunAnimation.ts"
import {
	reloadAnimationLayer,
	sampleFirstPersonReloadPose,
} from "./pilot/ReloadAnimation.ts"
import {
	applySlideWorldYaw,
	initialSlideHeading,
	slideAnimationLayer,
	slideTravelTilt,
	stepSlideHeading,
	type SlideHeading,
} from "./pilot/SlideAnimation.ts"
import {
	slideGroundNormalFromGradient,
	slideSurfaceFrameFromGroundNormal,
	type SlideSurfaceFrame,
} from "./pilot/SlideSurface.ts"
import {
	WAVE_DURATION_SECONDS,
	waveAnimationLayer,
} from "./pilot/WaveAnimation.ts"
import {
	FISTBUMP_DURATION_SECONDS,
	fistbumpAnimationLayer,
} from "./pilot/FistbumpAnimation.ts"
import {
	PUNCH_DURATION_SECONDS,
	punchAnimationLayer,
} from "./pilot/PunchAnimation.ts"
import {
	SALUTE_DURATION_SECONDS,
	saluteAnimationLayer,
} from "./pilot/SaluteAnimation.ts"
import { weaponsFreeLayer } from "./pilot/WeaponsFreePose.ts"
import {
	pilotSmartTargetCandidateFromRoot,
	selectBestSmartTarget,
	type SmartTargetCandidate,
	type SmartTargetRef,
} from "./smart-targeting.ts"

type SpawnSnapshot = {
	damageSequence: number
	position: [number, number]
	yaw: number
}

type ArenaGameOptions = {
	audioDefinition?: GameAudioDefinition
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

type SyncedOrb = {
	mesh: THREE.Mesh
	target: THREE.Vector3
	velocity: THREE.Vector3
}

type ArenaPickupVisual = {
	available: boolean
	availableAt: number | null
	group: THREE.Group
	model: GunModel
	ownerId: string | null
	position: THREE.Vector3
	weapon: "bubble-gun" | "rail-gun" | "shotgun"
}

type MiniMissileVisual = {
	id: number
	mesh: THREE.Group
	phase: "falling" | "powered"
	target: THREE.Vector3
	trail: MiniMissileTrailVisual
	velocity: THREE.Vector3
}

type Grenade = {
	id: number
	life: number
	mesh: THREE.Group
	velocity: THREE.Vector3
}

type GrenadeExplosion = {
	life: number
	light: THREE.PointLight
	material: THREE.MeshBasicMaterial
	mesh: THREE.Mesh
	radius: number
}

type MuzzleFlash = {
	life: number
	light: THREE.PointLight
	material: THREE.MeshBasicMaterial
	mesh: THREE.Mesh
}

type DustParticle = {
	life: number
	mesh: THREE.Mesh
}

type TargetingState =
	| "acquired"
	| "escaping"
	| "free"
	| "idle"
	| "locked"
	| "lost"

type RemotePilot = {
	aimDirection: THREE.Vector3
	animator: PilotAnimationMixer
	crouching: boolean
	dead: boolean
	deathStartedAt: number | null
	dustActive: boolean
	dustElapsed: number
	doubleJumpStartedAt: number
	damageDirection: THREE.Vector3
	damageTracker: DamageFeedbackTracker
	emote: PilotEmote | null
	emoteSignalAt: number
	emoteStartedAt: number
	freeAim: boolean
	jump: 0 | 1 | 2
	landingImpactVelocity: number
	landingStartedAt: number
	lifeSequence: number
	pitch: number
	punchSequence: number
	punchStartedAt: number
	position: THREE.Vector3
	recoilSequence: number
	recoilState: RemoteRecoilState
	ragdoll: PilotRagdollPresentation | null
	rig: PilotRig
	reload: ReloadSnapshot | null
	slideHeading: SlideHeading
	sliding: boolean
	sprinting: boolean
	target: THREE.Vector3
	velocity: THREE.Vector3
	visorExpression: VisorExpression
	visorStartedAt: number
	weaponsFree: boolean
	weaponsFreeWeight: number
	weapon: WeaponKind
	yaw: number
}

const ARENA_SIZE = 118
const WEAPONS_FREE_COOLDOWN_SECONDS = 2
const REMOTE_MARKER_GEOMETRY = new THREE.OctahedronGeometry(0.2, 0)
const REMOTE_MARKER_MATERIAL = new THREE.MeshBasicMaterial({
	color: "#79f5e2",
	toneMapped: false,
})

export class ArenaGame {
	readonly #ballistics = new Map<number, SyncedOrb>()
	readonly #bubbleField = new BubbleVisualField()
	readonly #arenaPickupVisuals = new Map<
		ArenaPickupVisual["weapon"],
		ArenaPickupVisual
	>()
	readonly #audio: GameAudio
	readonly #canvas: HTMLCanvasElement
	readonly #camera = new THREE.PerspectiveCamera(76, 1, 0.08, 280)
	readonly #drones: DroneBotSystem
	readonly #damageEffects = new BoundedDamageEffects<DamageParticleBurst>()
	readonly #fistContactEffects =
		new BoundedDamageEffects<FistContactParticleBurst>()
	readonly #dustGeometry = new THREE.SphereGeometry(0.18, 5, 4)
	readonly #dustMaterial = new THREE.MeshBasicMaterial({
		color: "#bfa987",
		depthWrite: false,
		opacity: 0.34,
		transparent: true,
	})
	readonly #dustParticles: DustParticle[] = []
	readonly #grenadeExplosions: GrenadeExplosion[] = []
	readonly #grenades: Grenade[] = []
	readonly #keys = new Set<string>()
	readonly #onHud: (state: GameHudState) => void
	readonly #player = {
		position: new THREE.Vector3(0, 8, 13),
		velocity: new THREE.Vector3(),
		yaw: Math.PI,
		pitch: -0.04,
		jumps: 0 as 0 | 1 | 2,
	}
	readonly #muzzleFlashes: MuzzleFlash[] = []
	readonly #missiles = new Map<number, MiniMissileVisual>()
	readonly #missilePickup = new THREE.Group()
	readonly #projectiles: Projectile[] = []
	readonly #pendingShotIds = new Set<number>()
	readonly #remotePlayers = new Map<string, RemotePilot>()
	readonly #renderer: THREE.WebGLRenderer
	readonly #scene = new THREE.Scene()
	readonly #seed: number
	readonly #socket: Socket
	readonly #weapon = new THREE.Group()
	#gunModel: GunModel | null = null
	#weaponMuzzle = new THREE.Group()
	#ammo = gunDefinition(DEFAULT_GUN_ID).magazineSize
	#acquiredTargetId: SmartTargetRef | null = null
	#animationFrame = 0
	#audioJumpImpulse: 1 | 2 | null = null
	#audioLandingImpact = 0
	#bumperTapTargetId: SmartTargetRef | null = null
	#connected = false
	#crouching = false
	#dead = false
	#deathStartedAt: number | null = null
	#gestureHeld: Record<GestureAction, boolean> = {
		fistbump: false,
		punch: false,
		salute: false,
		wave: false,
	}
	#gestureSequence = 0
	#activeEmoteUntil = 0
	#punchStartedAt = -Infinity
	#punchUntil = 0
	#lastFistContactId = 0
	#disposed = false
	#fireCooldown = 0
	#railCharging = false
	#railChargeStartedAt = 0
	#triggerHeld = false
	#freeAim = false
	#grenadeCooldown = 0
	#grenadeHeld = false
	#grenadeSequence = 0
	#health = 100
	#localDamageTracker = initialDamageFeedbackTracker()
	#localDeathRagdoll: PilotRagdollPresentation | null = null
	#localDeathRig: PilotRig | null = null
	#hitMarkerClassification: DirectHitResult["classification"] = "normal"
	#hitMarkerSequence = 0
	#hitMarkerUntil = 0
	#incomingMissileLocks = 0
	#incomingStandardLocks = 0
	#hudElapsed = 0
	#jumpQueued = false
	#lastFrame = performance.now()
	#leftBumperDuration = 0
	#leftBumperHeld = false
	#lockedTargetId: SmartTargetRef | null = null
	#lockToggleQueued = false
	#lookGamepad = new THREE.Vector2()
	#noiseTimer = 0
	#reticleX = 0.5
	#reticleY = 0.5
	#recoilPulse = 0
	#recoilState: RecoilSpreadState = initialRecoilSpreadState()
	#rightBumperHeld = false
	#reload: ReloadState = null
	#respawnAt: number | null = null
	#score = 0
	#shotSequence = 0
	#missileSequence = 0
	#pickupAvailable = false
	#pickupHoldState: HoldInputState = IDLE_HOLD_INPUT_STATE
	#pickupProgress = 0
	#pickupOwnerId: string | null = null
	readonly #pickupPosition = new THREE.Vector3()
	#inventoryActionSequence = 0
	#switchHeld = false
	#lastWheelEventAt: number | null = null
	#shotHeld = false
	#slide = false
	#slideDustElapsed = 0
	#slideHeading = initialSlideHeading()
	#slidePoseWeight = 0
	#wasSliding = false
	#snapshotElapsed = 0
	#sprinting = false
	#standardLockReported = false
	#standardLockSequence = 0
	#targetEscapeRemaining = TARGET_ESCAPE_DURATION_MS
	#targetLostFlashRemaining = 0
	#targetingState: TargetingState = "idle"
	#visorExpression: VisorExpression = "boot"
	#visorHurtUntil = 0
	#visorStartedAt = Date.now() / 1_000
	#weaponsFreeUntil = 0
	#weaponKind: WeaponKind = DEFAULT_GUN_ID
	#activeSlot: WeaponSlotIndex = 0
	#equipmentRevision = -1
	#equipmentSlots: EquipmentSlots = [
		{
			ammo: gunDefinition(DEFAULT_GUN_ID).magazineSize,
			weapon: DEFAULT_GUN_ID,
		},
		null,
	]

	constructor(options: ArenaGameOptions) {
		this.#audio =
			options.audioDefinition === undefined
				? new GameAudio(options.seed)
				: new GameAudio(options.seed, options.audioDefinition)
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
		this.#player.position.y = this.#heightAt(0, 13) + PILOT_STANDING_EYE_HEIGHT
		this.#connected = this.#socket.connected
		this.#socket.connect()
		this.#animate()
	}

	start(): void {
		void this.#audio.start()
		this.#canvas.focus()
		void this.#canvas.requestPointerLock().catch(() => undefined)
	}

	dispose(): void {
		this.#disposed = true
		this.#disposeLocalDeathRagdoll()
		this.#reload = cancelReload(this.#reload)
		this.#audio.dispose()
		cancelAnimationFrame(this.#animationFrame)
		window.removeEventListener("keydown", this.#onKeyDown)
		window.removeEventListener("keyup", this.#onKeyUp)
		window.removeEventListener("mousemove", this.#onMouseMove)
		window.removeEventListener("mousedown", this.#onMouseDown)
		window.removeEventListener("mouseup", this.#onMouseUp)
		window.removeEventListener("wheel", this.#onWheel)
		window.removeEventListener("contextmenu", this.#onContextMenu)
		window.removeEventListener("resize", this.#resize)
		this.#socket.off("connect", this.#onConnect)
		this.#socket.off("disconnect", this.#onDisconnect)
		this.#socket.off("arena:players", this.#onPlayers)
		this.#socket.off("arena:spawn", this.#onSpawn)
		this.#socket.off("arena:combat", this.#onCombat)
		this.#socket.off("arena:direct-hit", this.#onDirectHit)
		this.#socket.off("arena:player-damaged", this.#onPlayerDamaged)
		this.#socket.off("arena:melee-hit", this.#onMeleeHit)
		this.#socket.off("arena:fist-contact", this.#onFistContact)
		this.#socket.off("arena:drone-destroyed", this.#onDroneDestroyed)
		this.#socket.off("arena:grenade", this.#onGrenade)
		this.#socket.off("arena:grenade-exploded", this.#onGrenadeExploded)
		this.#socket.off("arena:equipment", this.#onEquipment)
		this.#socket.off("arena:incoming-lock", this.#onIncomingLock)
		this.#socket.off(
			"arena:incoming-standard-lock",
			this.#onIncomingStandardLock,
		)
		this.#socket.off("arena:mini-missile", this.#onMiniMissile)
		this.#socket.off("arena:mini-missile-ended", this.#onMiniMissileEnded)
		this.#socket.off("arena:mini-missile-exploded", this.#onMiniMissileExploded)
		this.#socket.off("arena:mini-missile-pickup", this.#onMiniMissilePickup)
		this.#socket.off("arena:weapon-pickups", this.#onArenaWeaponPickups)
		this.#socket.off("arena:projectile", this.#onProjectile)
		this.#socket.off("arena:projectile-ended", this.#onProjectileEnded)
		this.#socket.off("arena:bubble", this.#onBubble)
		this.#socket.off("arena:bubble-popped", this.#onBubblePopped)
		this.#socket.off("arena:ballistic", this.#onBallistic)
		this.#socket.off("arena:ballistic-ended", this.#onBallisticEnded)
		this.#socket.off("arena:hitscan", this.#onHitscan)
		this.#socket.off("arena:snapshot", this.#onSnapshot)
		this.#drones.dispose()
		this.#damageEffects.clear()
		this.#fistContactEffects.clear()
		for (const flash of this.#muzzleFlashes) {
			this.#scene.remove(flash.mesh)
			flash.mesh.geometry.dispose()
			flash.material.dispose()
		}
		this.#muzzleFlashes.length = 0
		if (this.#gunModel !== null) {
			this.#weapon.remove(this.#gunModel.root)
			this.#gunModel.dispose()
			this.#gunModel = null
		}
		for (const id of this.#missiles.keys()) this.#removeMiniMissileVisual(id)
		for (const pickup of this.#arenaPickupVisuals.values()) {
			this.#scene.remove(pickup.group)
			pickup.group.remove(pickup.model.root)
			pickup.model.dispose()
			pickup.group.traverse((child) => {
				if (child instanceof THREE.Mesh) {
					child.geometry.dispose()
					if (Array.isArray(child.material))
						child.material.forEach((material) => material.dispose())
					else child.material.dispose()
				}
			})
		}
		this.#arenaPickupVisuals.clear()
		this.#scene.remove(this.#bubbleField.mesh)
		this.#bubbleField.dispose()
		for (const visual of this.#ballistics.values()) {
			this.#scene.remove(visual.mesh)
			visual.mesh.geometry.dispose()
			;(visual.mesh.material as THREE.Material).dispose()
		}
		this.#ballistics.clear()
		for (const model of this.#remotePlayers.values()) {
			model.ragdoll?.dispose()
			this.#scene.remove(model.rig.root)
			disposePilotModel(model.rig)
		}
		this.#remotePlayers.clear()
		for (const particle of this.#dustParticles) {
			this.#scene.remove(particle.mesh)
		}
		this.#dustParticles.length = 0
		this.#dustGeometry.dispose()
		this.#dustMaterial.dispose()
		this.#renderer.dispose()
	}

	readonly #onKeyDown = (event: KeyboardEvent): void => {
		if (this.#dead) return
		this.#keys.add(event.code)
		if (event.code === "Space" && !event.repeat) this.#jumpQueued = true
		if (event.code === "KeyR" && !event.repeat) this.#requestReload()
		if (isWeaponSwitchKeyboardInput(event.code, event.repeat))
			this.#requestSwitch(1)
		if (event.code === "KeyX" && !event.repeat) this.#requestDrop()
		const gesture = keyboardGestureInput(event.code, event.repeat)
		if (gesture !== null) this.#requestGesture(gesture)
	}

	readonly #onKeyUp = (event: KeyboardEvent): void => {
		this.#keys.delete(event.code)
		if (event.code === "KeyF") this.#releaseRailCharge()
	}

	readonly #onMouseMove = (event: MouseEvent): void => {
		if (this.#dead) return
		if (document.pointerLockElement !== this.#canvas) return
		const sensitivity = this.#freeAim ? 0.000_85 : 0.0018
		this.#player.yaw -= event.movementX * sensitivity
		this.#player.pitch = THREE.MathUtils.clamp(
			this.#player.pitch - event.movementY * sensitivity,
			-1.42,
			1.42,
		)
	}

	readonly #onWheel = (event: WheelEvent): void => {
		const update = debounceWheelInput(
			event.deltaY,
			performance.now(),
			this.#lastWheelEventAt,
		)
		this.#lastWheelEventAt = update.lastEventAtMs
		if (!update.triggered || update.direction === null) return
		this.#requestSwitch(update.direction === "next" ? 1 : -1)
	}

	readonly #onMouseDown = (event: MouseEvent): void => {
		if (document.pointerLockElement !== this.#canvas) {
			if (event.target !== this.#canvas) return
			this.start()
		}
		if (event.button === 0) {
			if (this.#weaponKind === "rail-gun") this.#beginRailCharge()
			else this.#fire()
		}
		if (event.button === 2) this.#throwGrenade()
	}

	readonly #onMouseUp = (event: MouseEvent): void => {
		if (event.button === 0) this.#releaseRailCharge()
	}

	readonly #onContextMenu = (event: MouseEvent): void => {
		if (event.target === this.#canvas) event.preventDefault()
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
		this.#equipmentRevision = -1
		this.#socket.emit("arena:ready")
	}

	readonly #onDisconnect = (): void => {
		this.#connected = false
		this.#disposeLocalDeathRagdoll()
		this.#pickupHoldState = IDLE_HOLD_INPUT_STATE
		this.#pickupProgress = 0
		this.#equipmentRevision = -1
		this.#cancelReloadPresentation()
		this.#drones.reset()
		for (const projectile of this.#projectiles) {
			this.#scene.remove(projectile.mesh)
		}
		this.#projectiles.length = 0
		for (const grenade of this.#grenades) this.#scene.remove(grenade.mesh)
		this.#grenades.length = 0
		for (const explosion of this.#grenadeExplosions) {
			this.#scene.remove(explosion.mesh)
		}
		this.#grenadeExplosions.length = 0
		this.#damageEffects.clear()
		this.#fistContactEffects.clear()
		for (const model of this.#remotePlayers.values()) {
			model.ragdoll?.dispose()
			this.#scene.remove(model.rig.root)
			disposePilotModel(model.rig)
		}
		this.#remotePlayers.clear()
		for (const id of this.#missiles.keys()) this.#removeMiniMissileVisual(id)
		this.#incomingMissileLocks = 0
		this.#incomingStandardLocks = 0
		this.#standardLockReported = false
	}

	readonly #onSpawn = (spawn: SpawnSnapshot): void => {
		const [x, z] = spawn.position
		if (
			![x, z, spawn.yaw].every(Number.isFinite) ||
			!Number.isSafeInteger(spawn.damageSequence)
		)
			return
		this.#pickupHoldState = IDLE_HOLD_INPUT_STATE
		this.#pickupProgress = 0
		this.#player.position.set(
			x,
			this.#heightAt(x, z) + PILOT_STANDING_EYE_HEIGHT,
			z,
		)
		this.#player.velocity.set(0, 0, 0)
		this.#player.yaw = spawn.yaw
		this.#player.pitch = -0.04
		this.#dead = false
		this.#deathStartedAt = null
		this.#respawnAt = null
		this.#disposeLocalDeathRagdoll()
		this.#cancelReloadPresentation()
		this.#resetTransientState()
		this.#camera.position.copy(this.#player.position)
		this.#camera.rotation.set(this.#player.pitch, this.#player.yaw, 0, "YXZ")
		this.#localDamageTracker = initialDamageFeedbackTracker(
			spawn.damageSequence,
		)
		this.#clearDamageEffects(this.#socket.id)
		this.#socket.emit("arena:move", {
			aimDirection: new THREE.Vector3(0, 0, -1)
				.applyQuaternion(this.#camera.quaternion)
				.toArray(),
			crouching: false,
			freeAim: false,
			jump: 0,
			position: this.#player.position.toArray(),
			rotation: [this.#player.yaw, this.#player.pitch],
			sliding: false,
			sprinting: false,
			velocity: [0, 0, 0],
			visorExpression: this.#visorExpression,
			visorStartedAt: this.#visorStartedAt,
			weaponsFree: false,
		} satisfies PlayerMoveSnapshot)
	}

	readonly #onPlayers = (players: PlayerSnapshot[]): void => {
		const active = new Set<string>()
		for (const snapshot of players) {
			if (snapshot.id === this.#socket.id) {
				this.#reload = snapshot.dead ? null : snapshot.reload
				continue
			}
			if (!isGunId(snapshot.equippedWeapon)) continue
			active.add(snapshot.id)
			let model = this.#remotePlayers.get(snapshot.id)
			let isNew = false
			if (model === undefined) {
				const rig = createPilotModel(undefined, snapshot.equippedWeapon)
				rig.root.scale.setScalar(PILOT_MODEL_SCALE)
				const marker = new THREE.Mesh(
					REMOTE_MARKER_GEOMETRY,
					REMOTE_MARKER_MATERIAL,
				)
				marker.position.y = 4.45
				marker.rotation.y = Math.PI / 4
				rig.root.add(marker)
				model = {
					aimDirection: new THREE.Vector3(0, 0, -1),
					animator: new PilotAnimationMixer(),
					crouching: false,
					damageDirection: new THREE.Vector3(0, 0, -1),
					damageTracker: initialDamageFeedbackTracker(),
					dead: false,
					deathStartedAt: null,
					dustActive: false,
					dustElapsed: 0,
					doubleJumpStartedAt: -Infinity,
					emote: null,
					emoteSignalAt: 0,
					emoteStartedAt: -Infinity,
					freeAim: false,
					jump: 0,
					landingImpactVelocity: 0,
					landingStartedAt: -Infinity,
					lifeSequence: Number.isSafeInteger(snapshot.lifeSequence)
						? snapshot.lifeSequence
						: 0,
					pitch: 0,
					punchSequence: Number.isSafeInteger(snapshot.punchSequence)
						? snapshot.punchSequence
						: 0,
					punchStartedAt: -Infinity,
					position: new THREE.Vector3(),
					recoilSequence: initialRemoteRecoilTracker(snapshot.recoilSequence)
						.sequence,
					recoilState: initialRemoteRecoilState(),
					ragdoll: null,
					rig,
					reload: null,
					slideHeading: initialSlideHeading(),
					sliding: false,
					sprinting: false,
					target: new THREE.Vector3(),
					velocity: new THREE.Vector3(),
					visorExpression: "boot",
					visorStartedAt: Date.now() / 1_000,
					weaponsFree: false,
					weaponsFreeWeight: 0,
					weapon: snapshot.equippedWeapon,
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
					snapshot.crouching
						? -PILOT_CROUCH_EYE_HEIGHT
						: -PILOT_STANDING_EYE_HEIGHT,
				)
			if (isNew) model.position.copy(model.target)
			const wasDead = model.dead
			const wasSliding = model.sliding
			const previousJump = model.jump
			const previousVerticalVelocity = model.velocity.y
			const animationEventTime = performance.now() / 1_000
			model.velocity.set(...snapshot.velocity)
			if (
				Array.isArray(snapshot.aimDirection) &&
				snapshot.aimDirection.length === 3 &&
				snapshot.aimDirection.every(Number.isFinite)
			) {
				model.aimDirection.set(...snapshot.aimDirection).normalize()
			}
			model.yaw = snapshot.rotation[0]
			model.pitch = snapshot.rotation[1]
			model.crouching = snapshot.crouching
			model.dead = snapshot.dead === true
			model.deathStartedAt = snapshot.deathStartedAt
			if (!wasDead && model.dead) {
				model.ragdoll?.dispose()
				model.ragdoll = new PilotRagdollPresentation()
			}
			if (wasDead && !model.dead) {
				model.ragdoll?.dispose()
				model.ragdoll = null
				model.position.copy(model.target)
			}
			if (
				snapshot.emote !== null &&
				(model.emote !== snapshot.emote ||
					model.emoteSignalAt !== snapshot.emoteStartedAt)
			) {
				model.emoteStartedAt =
					performance.now() / 1_000 -
					Math.max(0, Date.now() / 1_000 - snapshot.emoteStartedAt)
			}
			model.emote = snapshot.emote
			model.emoteSignalAt = snapshot.emoteStartedAt
			if (
				Number.isSafeInteger(snapshot.punchSequence) &&
				snapshot.punchSequence > model.punchSequence
			) {
				model.punchSequence = snapshot.punchSequence
				model.punchStartedAt =
					performance.now() / 1_000 -
					Math.max(0, Date.now() / 1_000 - snapshot.punchStartedAt)
			}
			model.freeAim = snapshot.freeAim
			if (
				Number.isSafeInteger(snapshot.lifeSequence) &&
				snapshot.lifeSequence !== model.lifeSequence
			) {
				model.lifeSequence = snapshot.lifeSequence
				model.damageTracker = {
					...model.damageTracker,
					state: initialDamageFeedbackTracker().state,
				}
				model.recoilState = initialRemoteRecoilState()
				model.ragdoll?.dispose()
				model.ragdoll = model.dead ? new PilotRagdollPresentation() : null
				model.position.copy(model.target)
				this.#clearDamageEffects(snapshot.id)
			}
			const recoil = observeRemoteRecoilEvent(
				{
					sequence: model.recoilSequence,
					state: model.recoilState,
				},
				snapshot,
				Date.now() / 1_000,
			)
			model.recoilSequence = recoil.sequence
			model.recoilState = recoil.state
			model.jump = snapshot.jump
			if (model.jump > 0 && previousJump === 0) {
				model.landingStartedAt = -Infinity
			}
			if (model.jump === 2 && previousJump !== 2) {
				model.doubleJumpStartedAt = animationEventTime
			}
			if (model.jump === 0 && previousJump > 0) {
				model.landingStartedAt = animationEventTime
				model.landingImpactVelocity = Math.max(0, -previousVerticalVelocity)
			}
			model.sprinting = snapshot.sprinting
			model.reload = model.dead ? null : snapshot.reload
			model.sliding = snapshot.sliding === true && !model.dead
			if (model.sliding && !wasSliding) {
				const localSlideVelocity = model.velocity
					.clone()
					.applyAxisAngle(new THREE.Vector3(0, 1, 0), -model.yaw)
				model.slideHeading = initialSlideHeading({
					localVelocityX: localSlideVelocity.x,
					localVelocityZ: localSlideVelocity.z,
				})
			}
			model.weaponsFree = snapshot.weaponsFree === true
			model.weapon = snapshot.equippedWeapon
			setPilotGun(model.rig, model.weapon)
			if (
				isVisorExpression(snapshot.visorExpression) &&
				Number.isFinite(snapshot.visorStartedAt)
			) {
				model.visorExpression = snapshot.visorExpression
				model.visorStartedAt = snapshot.visorStartedAt
			}
		}
		for (const [id, model] of this.#remotePlayers) {
			if (!active.has(id)) {
				this.#clearDamageEffects(id)
				model.ragdoll?.dispose()
				this.#scene.remove(model.rig.root)
				disposePilotModel(model.rig)
				this.#remotePlayers.delete(id)
			}
		}
	}

	readonly #onCombat = (combat: CombatSnapshot): void => {
		if (
			!Number.isFinite(combat.health) ||
			!Number.isFinite(combat.score) ||
			typeof combat.dead !== "boolean"
		)
			return
		this.#health = combat.health
		this.#score = combat.score
		this.#deathStartedAt = combat.deathStartedAt
		this.#respawnAt = combat.respawnAt
		if (combat.dead && !this.#dead) {
			this.#dead = true
			this.#cancelReloadPresentation()
			this.#fistContactEffects.clear()
			this.#resetTransientState()
		}
		if (!combat.dead) {
			this.#dead = false
			this.#disposeLocalDeathRagdoll()
		}
	}

	readonly #onDirectHit = (result: DirectHitResult): void => {
		if (
			!Number.isSafeInteger(result.clientShotId) ||
			!Number.isSafeInteger(result.projectileId) ||
			!Number.isFinite(result.damage) ||
			(result.classification !== "normal" &&
				result.classification !== "headshot") ||
			!this.#pendingShotIds.delete(result.clientShotId)
		)
			return
		this.#hitMarkerClassification = result.classification
		this.#hitMarkerSequence += 1
		this.#hitMarkerUntil =
			performance.now() / 1_000 + HIT_MARKER_DURATION_SECONDS
		this.#audio.playEffect("hit-confirm", {
			gain: result.classification === "headshot" ? 1.2 : 0.86,
		})
	}

	readonly #onPlayerDamaged = (event: PlayerDamageSnapshot): void => {
		const observedAt = Date.now() / 1_000
		if (event.playerId === this.#socket.id) {
			const observed = observeDamageFeedback(
				this.#localDamageTracker,
				event,
				observedAt,
			)
			this.#localDamageTracker = observed.tracker
			if (!observed.accepted) return
			this.#audio.playEffect("damage", {
				gain: event.fatal ? 1.25 : 0.75 + Math.min(0.35, event.damage / 100),
			})
			this.#noiseTimer = 0.85
			this.#visorHurtUntil = performance.now() / 1_000 + 0.45
			const localEffectPosition = this.#camera.position
				.clone()
				.addScaledVector(
					new THREE.Vector3(0, 0, -1).applyQuaternion(this.#camera.quaternion),
					0.72,
				)
				.add(new THREE.Vector3(0, -0.18, 0))
			this.#damageEffects.add(
				new DamageParticleBurst(
					this.#scene,
					event,
					localEffectPosition.toArray(),
				),
			)
			return
		}
		const model = this.#remotePlayers.get(event.playerId)
		if (model === undefined) return
		const observed = observeDamageFeedback(
			model.damageTracker,
			event,
			observedAt,
		)
		model.damageTracker = observed.tracker
		if (!observed.accepted) return
		model.damageDirection.set(...observed.direction).normalize()
		this.#damageEffects.add(new DamageParticleBurst(this.#scene, event))
	}

	readonly #onMeleeHit = (result: MeleeHitResult): void => {
		if (
			!Number.isSafeInteger(result.actionId) ||
			(result.classification !== "punch" &&
				result.classification !== "assassination") ||
			result.attackerId !== this.#socket.id
		)
			return
		this.#hitMarkerClassification =
			result.classification === "assassination" ? "headshot" : "normal"
		this.#hitMarkerSequence += 1
		this.#hitMarkerUntil =
			performance.now() / 1_000 + HIT_MARKER_DURATION_SECONDS
		this.#audio.playEffect("hit-confirm", {
			gain: result.classification === "assassination" ? 1.3 : 0.92,
		})
	}

	readonly #onFistContact = (event: FistContactResult): void => {
		if (
			!Number.isSafeInteger(event.id) ||
			event.id <= this.#lastFistContactId ||
			!Array.isArray(event.position) ||
			event.position.length !== 3 ||
			event.position.some((value) => !Number.isFinite(value))
		)
			return
		this.#lastFistContactId = event.id
		this.#fistContactEffects.add(
			new FistContactParticleBurst(this.#scene, event),
		)
		const cameraSpace = this.#camera.worldToLocal(
			new THREE.Vector3(...event.position),
		)
		this.#audio.playEffect("fist-contact", {
			gain: event.participantIds.includes(this.#socket.id ?? "") ? 1 : 0.72,
			pan: THREE.MathUtils.clamp(cameraSpace.x / 8, -0.7, 0.7),
		})
	}

	readonly #onDroneDestroyed = (destroyed: DroneDestroyedSnapshot): void => {
		this.#drones.showDestroyed(destroyed)
	}

	readonly #onGrenade = (grenade: GrenadeSnapshot): void => {
		this.#spawnGrenade(grenade)
	}

	readonly #onGrenadeExploded = (explosion: GrenadeExplodedSnapshot): void => {
		const grenadeIndex = this.#grenades.findIndex(
			(grenade) => grenade.id === explosion.id,
		)
		if (grenadeIndex >= 0) {
			const grenade = this.#grenades[grenadeIndex]
			if (grenade !== undefined) this.#scene.remove(grenade.mesh)
			this.#grenades.splice(grenadeIndex, 1)
		}
		this.#spawnGrenadeExplosion(explosion)
	}

	readonly #onEquipment = (equipment: unknown): void => {
		if (!isNewEquipmentSnapshot(equipment, this.#equipmentRevision)) return
		const previousRevision = this.#equipmentRevision
		const previousActiveSlot = this.#activeSlot
		const previousSecondaryWeapon = this.#equipmentSlots[1]?.weapon ?? null
		const active = activeEquipmentSlot(equipment)
		if (this.#reload !== null) {
			const matchesRequestedSlot =
				equipment.activeSlot === this.#reload.slot &&
				active.weapon === this.#reload.gunId
			if (!matchesRequestedSlot) {
				this.#cancelReloadPresentation()
			}
		}
		this.#equipmentRevision = equipment.revision
		this.#activeSlot = equipment.activeSlot
		this.#equipmentSlots = [
			{ ...equipment.slots[0] },
			equipment.slots[1] === null ? null : { ...equipment.slots[1] },
		]
		this.#weaponKind = active.weapon
		if (active.weapon !== "rail-gun") this.#railCharging = false
		this.#ammo = active.ammo
		this.#setLocalGunModel(active.weapon)
		if (previousRevision >= 0) {
			if (
				equipment.slots[1] !== null &&
				equipment.slots[1].weapon !== previousSecondaryWeapon
			) {
				this.#audio.playEffect("pickup")
			} else if (previousActiveSlot !== equipment.activeSlot) {
				this.#audio.playEffect("weapon-switch")
			}
		}
	}

	readonly #onIncomingLock = (lock: IncomingLockSnapshot): void => {
		if (!Number.isSafeInteger(lock.attackers) || lock.attackers < 0) return
		if (lock.attackers > this.#incomingMissileLocks) {
			this.#audio.playEffect("target-lock", { gain: 1.15 })
		}
		this.#incomingMissileLocks = lock.attackers
	}

	readonly #onIncomingStandardLock = (
		lock: IncomingStandardLockSnapshot,
	): void => {
		if (!Number.isSafeInteger(lock.attackers) || lock.attackers < 0) return
		if (lock.attackers > this.#incomingStandardLocks) {
			this.#audio.playEffect("target-lock")
		}
		this.#incomingStandardLocks = lock.attackers
	}

	readonly #onMiniMissilePickup = (pickup: MiniMissilePickupSnapshot): void => {
		if (
			!Array.isArray(pickup.position) ||
			pickup.position.length !== 3 ||
			pickup.position.some((component) => !Number.isFinite(component))
		)
			return
		this.#missilePickup.position.set(...pickup.position)
		this.#missilePickup.visible = pickup.available
		this.#pickupPosition.set(...pickup.position)
		this.#pickupAvailable = pickup.available
		this.#pickupOwnerId = pickup.ownerId
	}

	readonly #onArenaWeaponPickups = (
		pickups: ArenaWeaponPickupSnapshot[],
	): void => {
		if (!Array.isArray(pickups)) return
		for (const pickup of pickups) {
			const visual = this.#arenaPickupVisuals.get(pickup.weapon)
			if (
				visual === undefined ||
				!Array.isArray(pickup.position) ||
				pickup.position.length !== 3 ||
				pickup.position.some((component) => !Number.isFinite(component))
			)
				continue
			visual.available = pickup.available
			visual.availableAt = pickup.availableAt
			visual.ownerId = pickup.ownerId
			visual.position.set(...pickup.position)
			visual.group.position.copy(visual.position)
			visual.group.visible = pickup.available
		}
	}

	readonly #onMiniMissile = (missile: MiniMissileSnapshot): void => {
		this.#applyMissileSnapshot(missile)
	}

	readonly #onMiniMissileEnded = (ended: MiniMissileEndedSnapshot): void => {
		this.#removeMiniMissileVisual(ended.id)
	}

	readonly #onMiniMissileExploded = (
		explosion: MiniMissileExplodedSnapshot,
	): void => {
		this.#onMiniMissileEnded({ id: explosion.id })
		this.#spawnGrenadeExplosion(explosion)
	}

	readonly #onProjectile = (projectile: ProjectileSnapshot): void => {
		const origin = new THREE.Vector3(...projectile.origin)
		const direction = new THREE.Vector3(...projectile.direction)
		this.#spawnMuzzleFlash(origin, direction, projectile.color)
		this.#spawnProjectile(projectile.id, origin, direction, projectile.color)
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

	readonly #onBubble = (snapshot: BubbleSnapshot): void => {
		this.#bubbleField.upsert(snapshot)
	}

	readonly #onBubblePopped = (snapshot: BubblePoppedSnapshot): void => {
		if (!this.#bubbleField.remove(snapshot.id)) return
		this.#spawnMuzzleFlash(
			new THREE.Vector3(...snapshot.position),
			new THREE.Vector3(0, 1, 0),
			"#ff8de6",
		)
	}

	readonly #onBallistic = (snapshot: BallisticSnapshot): void => {
		let visual = this.#ballistics.get(snapshot.id)
		if (visual === undefined) {
			const mesh = new THREE.Mesh(
				new THREE.SphereGeometry(0.1 + snapshot.charge * 0.07, 10, 8),
				new THREE.MeshBasicMaterial({ color: "#ffcf66" }),
			)
			mesh.position.set(...snapshot.position)
			this.#scene.add(mesh)
			visual = {
				mesh,
				target: new THREE.Vector3(...snapshot.position),
				velocity: new THREE.Vector3(...snapshot.velocity),
			}
			this.#ballistics.set(snapshot.id, visual)
		}
		visual.target.set(...snapshot.position)
		visual.velocity.set(...snapshot.velocity)
	}

	readonly #onBallisticEnded = (snapshot: BallisticEndedSnapshot): void => {
		const visual = this.#ballistics.get(snapshot.id)
		if (visual === undefined) return
		this.#scene.remove(visual.mesh)
		visual.mesh.geometry.dispose()
		;(visual.mesh.material as THREE.Material).dispose()
		this.#ballistics.delete(snapshot.id)
		this.#spawnMuzzleFlash(
			new THREE.Vector3(...snapshot.position),
			new THREE.Vector3(0, 1, 0),
			"#ffb63e",
		)
	}

	readonly #onHitscan = (snapshot: HitscanSnapshot): void => {
		const origin = new THREE.Vector3(...snapshot.origin)
		const direction = new THREE.Vector3(...snapshot.direction)
		this.#spawnMuzzleFlash(origin, direction, "#ffd49a")
		this.#spawnProjectile(1_000_000 + snapshot.id, origin, direction, "#ffd49a")
	}

	readonly #onSnapshot = (snapshot: ArenaSnapshot): void => {
		this.#drones.applySnapshot(snapshot)
		const activeMissiles = new Set<number>()
		for (const missile of snapshot.missiles) {
			activeMissiles.add(missile.id)
			this.#applyMissileSnapshot(missile)
		}
		for (const id of this.#missiles.keys()) {
			if (activeMissiles.has(id)) continue
			this.#removeMiniMissileVisual(id)
		}
		const activeBubbles = new Set<number>()
		for (const bubble of snapshot.bubbles ?? []) {
			activeBubbles.add(bubble.id)
			this.#onBubble(bubble)
		}
		for (const id of this.#bubbleField.ids()) {
			const position = this.#bubbleField.position(id)
			if (!activeBubbles.has(id) && position !== null)
				this.#onBubblePopped({ id, position: position.toArray() })
		}
		const activeBallistics = new Set<number>()
		for (const ballistic of snapshot.ballistics ?? []) {
			activeBallistics.add(ballistic.id)
			this.#onBallistic(ballistic)
		}
		for (const [id, visual] of this.#ballistics) {
			if (!activeBallistics.has(id))
				this.#onBallisticEnded({ id, position: visual.mesh.position.toArray() })
		}
	}

	#bindEvents(): void {
		window.addEventListener("keydown", this.#onKeyDown)
		window.addEventListener("keyup", this.#onKeyUp)
		window.addEventListener("mousemove", this.#onMouseMove)
		window.addEventListener("mousedown", this.#onMouseDown)
		window.addEventListener("mouseup", this.#onMouseUp)
		window.addEventListener("wheel", this.#onWheel, { passive: true })
		window.addEventListener("contextmenu", this.#onContextMenu)
		window.addEventListener("resize", this.#resize)
		this.#socket.on("connect", this.#onConnect)
		this.#socket.on("disconnect", this.#onDisconnect)
		this.#socket.on("arena:players", this.#onPlayers)
		this.#socket.on("arena:spawn", this.#onSpawn)
		this.#socket.on("arena:combat", this.#onCombat)
		this.#socket.on("arena:direct-hit", this.#onDirectHit)
		this.#socket.on("arena:player-damaged", this.#onPlayerDamaged)
		this.#socket.on("arena:melee-hit", this.#onMeleeHit)
		this.#socket.on("arena:fist-contact", this.#onFistContact)
		this.#socket.on("arena:drone-destroyed", this.#onDroneDestroyed)
		this.#socket.on("arena:grenade", this.#onGrenade)
		this.#socket.on("arena:grenade-exploded", this.#onGrenadeExploded)
		this.#socket.on("arena:equipment", this.#onEquipment)
		this.#socket.on("arena:incoming-lock", this.#onIncomingLock)
		this.#socket.on(
			"arena:incoming-standard-lock",
			this.#onIncomingStandardLock,
		)
		this.#socket.on("arena:mini-missile", this.#onMiniMissile)
		this.#socket.on("arena:mini-missile-ended", this.#onMiniMissileEnded)
		this.#socket.on("arena:mini-missile-exploded", this.#onMiniMissileExploded)
		this.#socket.on("arena:mini-missile-pickup", this.#onMiniMissilePickup)
		this.#socket.on("arena:weapon-pickups", this.#onArenaWeaponPickups)
		this.#socket.on("arena:projectile", this.#onProjectile)
		this.#socket.on("arena:projectile-ended", this.#onProjectileEnded)
		this.#socket.on("arena:bubble", this.#onBubble)
		this.#socket.on("arena:bubble-popped", this.#onBubblePopped)
		this.#socket.on("arena:ballistic", this.#onBallistic)
		this.#socket.on("arena:ballistic-ended", this.#onBallisticEnded)
		this.#socket.on("arena:hitscan", this.#onHitscan)
		this.#socket.on("arena:snapshot", this.#onSnapshot)
		this.#resize()
	}

	#heightAt(x: number, z: number): number {
		return arenaHeightAt(this.#seed, x, z)
	}

	#clearDamageEffects(playerId: string | undefined): void {
		if (playerId === undefined) return
		this.#damageEffects.remove((effect) => effect.playerId === playerId)
	}

	#buildWorld(): void {
		this.#scene.add(this.#bubbleField.mesh)
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

		const pickupShell = new THREE.Mesh(
			new THREE.CylinderGeometry(0.24, 0.34, 1.35, 10),
			new THREE.MeshStandardMaterial({
				color: "#435063",
				emissive: "#51221b",
				emissiveIntensity: 0.7,
				metalness: 0.75,
				roughness: 0.26,
			}),
		)
		pickupShell.rotation.x = Math.PI / 2
		const pickupBand = new THREE.Mesh(
			new THREE.TorusGeometry(0.3, 0.055, 7, 16),
			new THREE.MeshBasicMaterial({ color: "#ff7549" }),
		)
		pickupBand.rotation.x = Math.PI / 2
		const pickupLight = new THREE.PointLight("#ff7549", 5, 8)
		this.#missilePickup.add(pickupShell, pickupBand, pickupLight)
		const [pickupX, pickupZ] = MINI_MISSILE_PICKUP_POSITION
		this.#missilePickup.position.set(
			pickupX,
			this.#heightAt(pickupX, pickupZ) + 0.72,
			pickupZ,
		)
		this.#missilePickup.rotation.z = Math.PI / 2
		this.#scene.add(this.#missilePickup)

		const arenaPickupColors = {
			"bubble-gun": "#f58bdf",
			"rail-gun": "#ffc15c",
			shotgun: "#ff7657",
		} as const
		for (const weapon of ["shotgun", "bubble-gun", "rail-gun"] as const) {
			const color = arenaPickupColors[weapon]
			const group = new THREE.Group()
			group.name = `${weapon} world pickup`
			const pad = new THREE.Mesh(
				new THREE.CylinderGeometry(1.15, 1.35, 0.16, 16),
				new THREE.MeshStandardMaterial({
					color: "#17202a",
					emissive: color,
					emissiveIntensity: 0.65,
					metalness: 0.72,
					roughness: 0.28,
				}),
			)
			pad.position.y = -0.55
			const marker = new THREE.Mesh(
				new THREE.TorusGeometry(0.78, 0.055, 8, 28),
				new THREE.MeshBasicMaterial({ color }),
			)
			marker.rotation.x = Math.PI / 2
			marker.position.y = -0.43
			const model = createGunModel(weapon, {
				accent: color,
				accentEmissive: color,
				body: "#202936",
			})
			model.root.rotation.y = Math.PI / 2
			model.root.scale.setScalar(0.78)
			const light = new THREE.PointLight(color, 4.5, 8)
			light.position.y = 0.55
			group.add(pad, marker, model.root, light)
			group.visible = false
			this.#scene.add(group)
			this.#arenaPickupVisuals.set(weapon, {
				available: false,
				availableAt: null,
				group,
				model,
				ownerId: null,
				position: new THREE.Vector3(),
				weapon,
			})
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
		this.#weapon.name = "first-person equipped gun"
		this.#setLocalGunModel(this.#weaponKind)
		this.#camera.add(this.#weapon)
		this.#scene.add(this.#camera)
	}

	#setLocalGunModel(gunId: WeaponKind): void {
		const reconciled = reconcileMountedGun(this.#weapon, this.#gunModel, gunId)
		this.#gunModel = reconciled.model
		this.#weaponMuzzle = reconciled.model.muzzle
		applyGunPresentation(this.#weapon, gunId, "firstPerson")
	}

	#cancelReloadPresentation(): void {
		this.#reload = cancelReload(this.#reload)
	}

	#resetTransientState(): void {
		this.#keys.clear()
		this.#player.velocity.set(0, 0, 0)
		this.#player.jumps = 0
		this.#crouching = false
		this.#slide = false
		this.#slideHeading = initialSlideHeading()
		this.#slidePoseWeight = 0
		this.#wasSliding = false
		this.#slideDustElapsed = 0
		this.#sprinting = false
		this.#freeAim = false
		this.#leftBumperHeld = false
		this.#rightBumperHeld = false
		this.#shotHeld = false
		this.#grenadeHeld = false
		this.#jumpQueued = false
		this.#weaponsFreeUntil = 0
		this.#activeEmoteUntil = 0
		this.#punchUntil = 0
		this.#punchStartedAt = -Infinity
		this.#gestureHeld = {
			fistbump: false,
			punch: false,
			salute: false,
			wave: false,
		}
		this.#acquiredTargetId = null
		this.#lockedTargetId = null
		this.#targetingState = "idle"
		this.#reticleX = 0.5
		this.#reticleY = 0.5
	}

	#pollGamepad(): {
		crouch: boolean
		fire: boolean
		fistbump: boolean
		grenade: boolean
		jump: boolean
		lock: boolean
		punch: boolean
		pickup: boolean
		reload: boolean
		salute: boolean
		sprint: boolean
		switchWeapon: boolean
		wave: boolean
		x: number
		y: number
	} {
		const gamepad = navigator.getGamepads().find((pad) => pad !== null)
		if (gamepad === undefined || gamepad === null) {
			this.#lookGamepad.set(0, 0)
			return {
				crouch: false,
				fire: false,
				fistbump: false,
				grenade: false,
				jump: false,
				lock: false,
				punch: false,
				pickup: false,
				reload: false,
				salute: false,
				sprint: false,
				switchWeapon: false,
				wave: false,
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
		const grenade = (gamepad.buttons[6]?.value ?? 0) > 0.25
		const lock = gamepad.buttons[4]?.pressed ?? false
		const pickup = isPickupGamepadInput(gamepad.buttons)
		const reload = gamepad.buttons[5]?.pressed ?? false
		const sprint = gamepad.buttons[10]?.pressed ?? false
		const switchWeapon = isWeaponSwitchGamepadInput(gamepad.buttons)
		const gestures = gamepadGestureInputs(gamepad.buttons)
		return {
			crouch,
			fire,
			fistbump: gestures.fistbump,
			grenade,
			jump,
			lock,
			punch: gestures.punch,
			pickup,
			reload,
			salute: gestures.salute,
			sprint,
			switchWeapon,
			wave: gestures.wave,
			x: deadzone(gamepad.axes[0] ?? 0),
			y: deadzone(gamepad.axes[1] ?? 0),
		}
	}

	#updatePhysics(delta: number): void {
		if (
			this.#reload !== null &&
			Date.now() / 1_000 >= this.#reload.completesAt
		) {
			this.#cancelReloadPresentation()
		}
		if (this.#dead) {
			this.#player.velocity.set(0, 0, 0)
			this.#fireCooldown = Math.max(0, this.#fireCooldown - delta)
			this.#grenadeCooldown = Math.max(0, this.#grenadeCooldown - delta)
			return
		}
		const gamepad = this.#pollGamepad()
		const switchEdge = inputEdge(gamepad.switchWeapon, this.#switchHeld)
		this.#switchHeld = switchEdge.held
		if (switchEdge.triggered) this.#requestSwitch(1)
		const pickupNearby = this.#isPickupNearby()
		const activeGun = gunDefinition(this.#weaponKind)
		const rightBumperAction = contextualRightBumperAction(
			pickupNearby,
			activeGun.capabilities.reload && this.#ammo < activeGun.magazineSize,
		)
		const pickupPressed =
			this.#keys.has("KeyE") ||
			(gamepad.pickup && rightBumperAction === "pickup")
		const pickupHold = updateHoldInput(
			this.#pickupHoldState,
			this.#connected && pickupNearby && pickupPressed,
			performance.now(),
		)
		this.#pickupHoldState = pickupHold.state
		this.#pickupProgress = pickupHold.progress
		if (pickupHold.event === "completed") this.#requestPickup()
		for (const gesture of ["punch", "wave", "fistbump", "salute"] as const) {
			const edge = inputEdge(gamepad[gesture], this.#gestureHeld[gesture])
			this.#gestureHeld[gesture] = edge.held
			if (edge.triggered) this.#requestGesture(gesture)
		}
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
		if (
			gamepad.reload &&
			!this.#rightBumperHeld &&
			rightBumperAction === "reload"
		)
			this.#requestReload()
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
		const previousEye = this.#crouching
			? PILOT_CROUCH_EYE_HEIGHT
			: PILOT_STANDING_EYE_HEIGHT
		const terrainHeight = this.#heightAt(
			this.#player.position.x,
			this.#player.position.z,
		)
		const wasGrounded = isJumpGrounded(
			{
				positionY: this.#player.position.y,
				velocityY: this.#player.velocity.y,
			},
			terrainHeight + previousEye,
		)
		this.#crouching = crouch
		const eye = crouch ? PILOT_CROUCH_EYE_HEIGHT : PILOT_STANDING_EYE_HEIGHT
		if (wasGrounded && eye !== previousEye) {
			this.#player.position.y += eye - previousEye
		}
		const ground = terrainHeight + eye
		const grounded = isJumpGrounded(
			{
				positionY: this.#player.position.y,
				velocityY: this.#player.velocity.y,
			},
			ground,
		)
		const wasPhysicsSliding = this.#slide
		const slideStep = stepSlidePhysics(
			{
				sliding: this.#slide,
				x: this.#player.velocity.x,
				z: this.#player.velocity.z,
			},
			{
				crouching: crouch,
				delta,
				grounded,
				terrainGradient: sampleTerrainGradient(
					(x, z) => this.#heightAt(x, z),
					this.#player.position.x,
					this.#player.position.z,
				),
			},
		)
		this.#player.velocity.x = slideStep.x
		this.#player.velocity.z = slideStep.z
		this.#slide = slideStep.sliding
		if (this.#slide && !wasPhysicsSliding) {
			const localSlideVelocity = this.#player.velocity
				.clone()
				.applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.#player.yaw)
			this.#slideHeading = initialSlideHeading({
				localVelocityX: localSlideVelocity.x,
				localVelocityZ: localSlideVelocity.z,
			})
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
		this.#sprinting =
			grounded && !crouch && sprint && input.lengthSq() > 0 && !this.#slide
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
			const acceleration = crouch ? 18 : sprint ? 31 : 23
			this.#player.velocity.addScaledVector(force, acceleration * delta)
		}
		const friction = grounded
			? this.#slide
				? 0
				: input.lengthSq() > 0
					? 1.7
					: 8.5
			: 0
		const damping = Math.exp(-friction * delta)
		this.#player.velocity.x *= damping
		this.#player.velocity.z *= damping
		const cap = movementSpeedLimit({
			crouching: crouch,
			grounded,
			sliding: this.#slide,
			sprinting: this.#sprinting,
		})
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
		this.#shotHeld = gamepadJumpPressed
		const boundary = ARENA_SIZE * 0.47
		const nextX = THREE.MathUtils.clamp(
			this.#player.position.x + this.#player.velocity.x * delta,
			-boundary,
			boundary,
		)
		const nextZ = THREE.MathUtils.clamp(
			this.#player.position.z + this.#player.velocity.z * delta,
			-boundary,
			boundary,
		)
		const midpointGround =
			this.#heightAt(
				(this.#player.position.x + nextX) * 0.5,
				(this.#player.position.z + nextZ) * 0.5,
			) + eye
		const nextGround = this.#heightAt(nextX, nextZ) + eye
		const jumpStep = stepJumpPhysics(
			{
				jumpCount: this.#player.jumps,
				positionY: this.#player.position.y,
				velocityY: this.#player.velocity.y,
			},
			{
				delta,
				groundAfter: nextGround,
				groundBefore: ground,
				groundMidpoint: midpointGround,
				jumpRequested: this.#jumpQueued,
			},
		)
		this.#jumpQueued = false
		this.#player.jumps = jumpStep.jumpCount
		if (jumpStep.impulse !== null || jumpStep.departedGround) {
			this.#slide = false
		} else if (jumpStep.landed && crouch) {
			this.#slide = stepSlidePhysics(
				{
					sliding: false,
					x: this.#player.velocity.x,
					z: this.#player.velocity.z,
				},
				{
					crouching: true,
					delta: 0,
					grounded: true,
					terrainGradient: sampleTerrainGradient(
						(x, z) => this.#heightAt(x, z),
						nextX,
						nextZ,
					),
				},
			).sliding
		}
		this.#updateLocalSlideDust(delta)
		this.#player.position.set(nextX, jumpStep.positionY, nextZ)
		this.#player.velocity.y = jumpStep.velocityY
		this.#audioJumpImpulse =
			jumpStep.impulse === 1 || jumpStep.impulse === 2 ? jumpStep.impulse : null
		this.#audioLandingImpact = jumpStep.landed ? jumpStep.impactVelocity : 0
		const trigger = gamepad.fire || this.#keys.has("KeyF")
		if (this.#weaponKind === "rail-gun") {
			if (trigger && !this.#triggerHeld) this.#beginRailCharge()
			if (!trigger && this.#triggerHeld) this.#releaseRailCharge()
		} else if (trigger && this.#fireCooldown <= 0) this.#fire()
		this.#triggerHeld = trigger
		if (gamepad.grenade && !this.#grenadeHeld) this.#throwGrenade()
		this.#grenadeHeld = gamepad.grenade
		this.#fireCooldown -= delta
		this.#grenadeCooldown -= delta
	}

	#nearbyPickupWeapon(): Exclude<WeaponKind, "arc-blaster"> | null {
		let nearest: {
			distance: number
			weapon: Exclude<WeaponKind, "arc-blaster">
		} | null = null
		if (this.#pickupAvailable) {
			const distance = this.#player.position.distanceTo(this.#pickupPosition)
			if (distance <= MINI_MISSILE_PICKUP_RADIUS)
				nearest = { distance, weapon: "mini-missile" }
		}
		for (const pickup of this.#arenaPickupVisuals.values()) {
			if (!pickup.available) continue
			const distance = this.#player.position.distanceTo(pickup.position)
			if (
				distance <= ARENA_WEAPON_PICKUP_RADIUS &&
				(nearest === null || distance < nearest.distance)
			)
				nearest = { distance, weapon: pickup.weapon }
		}
		return nearest?.weapon ?? null
	}

	#isPickupNearby(): boolean {
		return this.#nearbyPickupWeapon() !== null
	}

	#nextInventoryActionId(): number {
		this.#inventoryActionSequence += 1
		return this.#inventoryActionSequence
	}

	#requestPickup(): void {
		if (!this.#connected || this.#dead) return
		const weapon = this.#nearbyPickupWeapon()
		if (weapon === null) return
		this.#releaseRailCharge()
		this.#socket.emit("arena:inventory-action", {
			clientActionId: this.#nextInventoryActionId(),
			type: "collect",
			weapon,
		} satisfies InventoryActionIntent)
	}

	#requestSwitch(direction: -1 | 1): void {
		if (!this.#connected || this.#dead || this.#equipmentSlots[1] === null)
			return
		this.#socket.emit("arena:inventory-action", {
			clientActionId: this.#nextInventoryActionId(),
			direction,
			type: "switch",
		} satisfies InventoryActionIntent)
	}

	#requestDrop(): void {
		if (!this.#connected || this.#dead || this.#equipmentSlots[1] === null)
			return
		this.#socket.emit("arena:inventory-action", {
			clientActionId: this.#nextInventoryActionId(),
			type: "drop-secondary",
		} satisfies InventoryActionIntent)
	}

	#requestReload(): void {
		const gun = gunDefinition(this.#weaponKind)
		if (
			!this.#connected ||
			this.#dead ||
			this.#reload !== null ||
			!gun.capabilities.reload ||
			this.#ammo >= gun.magazineSize
		)
			return
		this.#audio.playEffect("reload")
		this.#socket.emit("arena:inventory-action", {
			clientActionId: this.#nextInventoryActionId(),
			type: "reload",
		} satisfies InventoryActionIntent)
	}

	#requestGesture(type: GestureAction): void {
		if (!this.#connected || this.#dead) return
		const now = performance.now() / 1_000
		if (type === "punch" && now < this.#punchUntil) return
		this.#gestureSequence += 1
		this.#socket.emit("arena:gesture", {
			clientActionId: this.#gestureSequence,
			type,
		} satisfies GestureIntent)
		if (type === "punch") {
			this.#activeEmoteUntil = 0
			this.#punchStartedAt = now
			this.#punchUntil = now + PUNCH_DURATION_SECONDS
			this.#cancelReloadPresentation()
			return
		}
		this.#punchUntil = 0
		const duration =
			type === "wave"
				? WAVE_DURATION_SECONDS
				: type === "salute"
					? SALUTE_DURATION_SECONDS
					: FISTBUMP_DURATION_SECONDS
		this.#activeEmoteUntil = now + duration
	}

	#fire(): void {
		if (this.#reload !== null && this.#weaponKind === "shotgun") {
			this.#cancelReloadPresentation()
		}
		if (
			this.#dead ||
			this.#reload !== null ||
			this.#fireCooldown > 0 ||
			this.#ammo === 0
		)
			return
		if (this.#sprinting) return
		if (
			this.#lockedTargetId !== null &&
			this.#acquiredTargetId === null &&
			!this.#freeAim
		)
			return
		const gun = gunDefinition(this.#weaponKind)
		if (gun.fire.type === "ballistic") return
		this.#audio.playWeapon(this.#weaponKind)
		this.#fireCooldown = gun.fire.clientCooldownSeconds
		this.#weaponsFreeUntil =
			performance.now() / 1_000 + WEAPONS_FREE_COOLDOWN_SECONDS
		this.#camera.position.copy(this.#player.position)
		this.#camera.rotation.set(this.#player.pitch, this.#player.yaw, 0, "YXZ")
		this.#camera.updateMatrixWorld(true)
		const origin = this.#weaponMuzzle.getWorldPosition(new THREE.Vector3())
		const aimDirection = this.#getAimDirection(origin)
		this.#noiseTimer = 0.85
		this.#weapon.position.z += 0.12
		this.#shotSequence += 1
		if (gun.fire.type === "guided-missile") {
			this.#missileSequence += 1
			this.#socket.emit("arena:fire-mini-missile", {
				clientMissileId: this.#missileSequence,
				direction: aimDirection.toArray(),
				origin: origin.toArray(),
				...(this.#acquiredTargetId === null
					? {}
					: { target: this.#acquiredTargetId }),
			} satisfies MiniMissileIntent)
		} else {
			this.#recoilState = addRecoilShot(this.#recoilState)
			const direction = spreadDirection(
				aimDirection,
				this.#recoilState.spreadRadians,
			)
			this.#recoilPulse += 1
			this.#pendingShotIds.add(this.#shotSequence)
			for (const shotId of this.#pendingShotIds) {
				if (shotId < this.#shotSequence - 128)
					this.#pendingShotIds.delete(shotId)
			}
			this.#socket.emit("arena:fire", {
				clientShotId: this.#shotSequence,
				direction: direction.toArray(),
				origin: origin.toArray(),
			} satisfies FireIntent)
		}
	}

	#beginRailCharge(): void {
		if (
			this.#weaponKind !== "rail-gun" ||
			this.#railCharging ||
			this.#dead ||
			this.#reload !== null ||
			this.#ammo === 0 ||
			this.#fireCooldown > 0
		)
			return
		this.#shotSequence += 1
		this.#railCharging = true
		this.#railChargeStartedAt = performance.now()
		this.#socket.emit("arena:rail-charge", {
			clientChargeId: this.#shotSequence,
			type: "start",
		})
	}

	#releaseRailCharge(): void {
		if (!this.#railCharging) return
		this.#railCharging = false
		if (this.#weaponKind !== "rail-gun" || this.#dead) return
		this.#camera.position.copy(this.#player.position)
		this.#camera.rotation.set(this.#player.pitch, this.#player.yaw, 0, "YXZ")
		this.#camera.updateMatrixWorld(true)
		const origin = this.#weaponMuzzle.getWorldPosition(new THREE.Vector3())
		const direction = this.#getAimDirection(origin)
		this.#pendingShotIds.add(this.#shotSequence)
		this.#socket.emit("arena:rail-charge", {
			clientChargeId: this.#shotSequence,
			direction: direction.toArray(),
			origin: origin.toArray(),
			type: "release",
		})
		this.#audio.playWeapon("rail-gun")
		this.#fireCooldown = gunDefinition("rail-gun").fire.clientCooldownSeconds
		this.#recoilState = addRecoilShot(this.#recoilState)
		this.#recoilPulse += 1
	}

	#throwGrenade(): void {
		if (this.#dead || this.#grenadeCooldown > 0) return
		this.#grenadeCooldown = 1
		this.#audio.playEffect("grenade-throw")
		const direction = new THREE.Vector3(0, 0, -1).applyEuler(
			new THREE.Euler(this.#player.pitch, this.#player.yaw, 0, "YXZ"),
		)
		direction.y += 0.22
		direction.normalize()
		const origin = this.#player.position.clone().addScaledVector(direction, 0.7)
		this.#grenadeSequence += 1
		this.#noiseTimer = 0.85
		this.#socket.emit("arena:throw-grenade", {
			clientGrenadeId: this.#grenadeSequence,
			direction: direction.toArray(),
			origin: origin.toArray(),
		} satisfies GrenadeIntent)
	}

	#spawnGrenade(grenade: GrenadeSnapshot): void {
		if (this.#grenades.some((candidate) => candidate.id === grenade.id)) return
		const mesh = new THREE.Group()
		const shell = new THREE.Mesh(
			new THREE.IcosahedronGeometry(GRENADE_RADIUS, 1),
			new THREE.MeshStandardMaterial({
				color: "#283936",
				emissive: "#173a32",
				emissiveIntensity: 0.8,
				metalness: 0.72,
				roughness: 0.28,
			}),
		)
		const band = new THREE.Mesh(
			new THREE.TorusGeometry(GRENADE_RADIUS * 0.72, 0.035, 6, 12),
			new THREE.MeshBasicMaterial({ color: "#ff7b43" }),
		)
		band.rotation.x = Math.PI / 2
		const light = new THREE.PointLight("#ff7b43", 2.4, 3.5)
		mesh.add(shell, band, light)
		mesh.position.set(...grenade.origin)
		this.#scene.add(mesh)
		this.#grenades.push({
			id: grenade.id,
			life: GRENADE_FUSE_SECONDS + 1,
			mesh,
			velocity: new THREE.Vector3(...grenade.velocity),
		})
	}

	#spawnGrenadeExplosion(explosion: GrenadeExplodedSnapshot): void {
		this.#audio.playEffect("explosion")
		const material = new THREE.MeshBasicMaterial({
			blending: THREE.AdditiveBlending,
			color: "#ff8a46",
			depthWrite: false,
			opacity: 0.65,
			side: THREE.DoubleSide,
			transparent: true,
			wireframe: true,
		})
		const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), material)
		const light = new THREE.PointLight("#ff6b32", 18, explosion.radius * 2)
		mesh.add(light)
		mesh.position.set(...explosion.position)
		mesh.scale.setScalar(0.15)
		this.#scene.add(mesh)
		this.#grenadeExplosions.push({
			life: 0.48,
			light,
			material,
			mesh,
			radius: explosion.radius,
		})
	}

	#applyMissileSnapshot(snapshot: MiniMissileSnapshot): void {
		if (
			!Number.isSafeInteger(snapshot.id) ||
			!Array.isArray(snapshot.position) ||
			!Array.isArray(snapshot.velocity) ||
			(snapshot.phase !== "powered" && snapshot.phase !== "falling") ||
			snapshot.position.length !== 3 ||
			snapshot.velocity.length !== 3 ||
			[...snapshot.position, ...snapshot.velocity].some(
				(component) => !Number.isFinite(component),
			)
		)
			return
		let missile = this.#missiles.get(snapshot.id)
		if (missile === undefined) {
			const mesh = new THREE.Group()
			const body = new THREE.Mesh(
				new THREE.CapsuleGeometry(0.075, 0.22, 3, 7),
				new THREE.MeshStandardMaterial({
					color: "#d7e1e3",
					emissive: "#762f19",
					emissiveIntensity: 0.9,
					metalness: 0.7,
					roughness: 0.25,
				}),
			)
			body.rotation.x = Math.PI / 2
			const exhaust = new THREE.Mesh(
				new THREE.ConeGeometry(0.07, 0.24, 7),
				new THREE.MeshBasicMaterial({ color: "#ff7b3c" }),
			)
			exhaust.position.z = 0.28
			exhaust.rotation.x = -Math.PI / 2
			const light = new THREE.PointLight("#ff6c35", 3.5, 4)
			mesh.add(body, exhaust, light)
			mesh.position.set(...snapshot.position)
			const trail = createMiniMissileTrailVisual()
			this.#scene.add(mesh, trail.points)
			missile = {
				id: snapshot.id,
				mesh,
				phase: snapshot.phase,
				target: new THREE.Vector3(...snapshot.position),
				trail,
				velocity: new THREE.Vector3(...snapshot.velocity),
			}
			updateMiniMissileTrailVisual(
				trail,
				snapshot.position,
				performance.now() / 1_000,
				snapshot.phase,
			)
			this.#missiles.set(snapshot.id, missile)
		}
		missile.phase = snapshot.phase
		missile.target.set(...snapshot.position)
		missile.velocity.set(...snapshot.velocity)
	}

	#removeMiniMissileVisual(id: number): void {
		const missile = this.#missiles.get(id)
		if (missile === undefined) return
		this.#scene.remove(missile.mesh, missile.trail.points)
		disposeMiniMissileTrailVisual(missile.trail)
		missile.mesh.traverse((object) => {
			if (!(object instanceof THREE.Mesh)) return
			object.geometry.dispose()
			const materials = Array.isArray(object.material)
				? object.material
				: [object.material]
			for (const material of materials) material.dispose()
		})
		this.#missiles.delete(id)
	}

	#updateMiniMissiles(delta: number): void {
		const forward = new THREE.Vector3(0, 0, -1)
		for (const missile of this.#missiles.values()) {
			missile.target.addScaledVector(missile.velocity, delta)
			missile.mesh.position.lerp(missile.target, Math.min(1, delta * 18))
			updateMiniMissileTrailVisual(
				missile.trail,
				missile.mesh.position.toArray(),
				performance.now() / 1_000,
				missile.phase,
			)
			if (missile.velocity.lengthSq() > 0.01) {
				missile.mesh.quaternion.setFromUnitVectors(
					forward,
					missile.velocity.clone().normalize(),
				)
			}
			const exhaust = missile.mesh.children[1]
			if (exhaust !== undefined) exhaust.visible = missile.phase === "powered"
		}
		this.#missilePickup.rotation.y += delta * 1.8
		for (const pickup of this.#arenaPickupVisuals.values()) {
			pickup.model.root.rotation.y += delta * 1.1
		}
	}

	#updateGrenades(delta: number): void {
		for (let index = this.#grenades.length - 1; index >= 0; index -= 1) {
			const grenade = this.#grenades[index]
			if (grenade === undefined) continue
			grenade.life -= delta
			grenade.velocity.y -= GRENADE_GRAVITY * delta
			grenade.mesh.position.addScaledVector(grenade.velocity, delta)
			grenade.mesh.rotation.x += delta * 7.5
			grenade.mesh.rotation.z += delta * 4.5
			const ground =
				this.#heightAt(grenade.mesh.position.x, grenade.mesh.position.z) +
				GRENADE_RADIUS
			if (grenade.mesh.position.y <= ground) {
				grenade.mesh.position.y = ground
				if (grenade.velocity.y < 0) {
					grenade.velocity.y *= -GRENADE_RESTITUTION
					grenade.velocity.x *= GRENADE_BOUNCE_DAMPING
					grenade.velocity.z *= GRENADE_BOUNCE_DAMPING
				}
				if (Math.abs(grenade.velocity.y) < 0.6) grenade.velocity.y = 0
			}
			if (grenade.life > 0) continue
			this.#scene.remove(grenade.mesh)
			this.#grenades.splice(index, 1)
		}

		for (
			let index = this.#grenadeExplosions.length - 1;
			index >= 0;
			index -= 1
		) {
			const explosion = this.#grenadeExplosions[index]
			if (explosion === undefined) continue
			explosion.life -= delta
			const progress = THREE.MathUtils.clamp(1 - explosion.life / 0.48, 0, 1)
			explosion.mesh.scale.setScalar(
				explosion.radius * THREE.MathUtils.lerp(0.08, 1, progress),
			)
			explosion.material.opacity = (1 - progress) * 0.65
			explosion.light.intensity = (1 - progress) * 18
			if (explosion.life > 0) continue
			this.#scene.remove(explosion.mesh)
			explosion.mesh.geometry.dispose()
			explosion.material.dispose()
			this.#grenadeExplosions.splice(index, 1)
		}
	}

	#getAimDirection(origin = this.#camera.position): THREE.Vector3 {
		const acquiredPosition =
			this.#acquiredTargetId === null
				? null
				: this.#getSmartTargetPosition(this.#acquiredTargetId)
		return acquiredPosition === null
			? new THREE.Vector3(0, 0, -1)
					.applyQuaternion(this.#camera.quaternion)
					.normalize()
			: acquiredPosition.sub(origin).normalize()
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

	#spawnMuzzleFlash(
		origin: THREE.Vector3,
		direction: THREE.Vector3,
		color: THREE.ColorRepresentation,
	): void {
		const material = new THREE.MeshBasicMaterial({
			blending: THREE.AdditiveBlending,
			color,
			depthWrite: false,
			opacity: 1,
			transparent: true,
		})
		const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), material)
		mesh.position.copy(origin).addScaledVector(direction, 0.06)
		mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction)
		mesh.scale.set(0.11, 0.11, 0.34)
		const light = new THREE.PointLight(color, 5, 4)
		mesh.add(light)
		this.#scene.add(mesh)
		this.#muzzleFlashes.push({
			life: 0.075,
			light,
			material,
			mesh,
		})
	}

	#updateMuzzleFlashes(delta: number): void {
		for (let index = this.#muzzleFlashes.length - 1; index >= 0; index -= 1) {
			const flash = this.#muzzleFlashes[index]
			if (flash === undefined) continue
			flash.life -= delta
			const strength = THREE.MathUtils.clamp(flash.life / 0.075, 0, 1)
			flash.material.opacity = strength
			flash.light.intensity = strength * 5
			flash.mesh.scale.set(
				0.11 + (1 - strength) * 0.08,
				0.11 + (1 - strength) * 0.08,
				0.34 + (1 - strength) * 0.16,
			)
			if (flash.life > 0) continue
			this.#scene.remove(flash.mesh)
			flash.mesh.geometry.dispose()
			flash.material.dispose()
			this.#muzzleFlashes.splice(index, 1)
		}
	}

	#emitDustAt(x: number, z: number): void {
		for (let index = 0; index < 2; index += 1) {
			if (this.#dustParticles.length >= PLAYER_SLIDE_DUST_BUDGET) {
				const oldest = this.#dustParticles.shift()
				if (oldest !== undefined) this.#scene.remove(oldest.mesh)
			}
			const mesh = new THREE.Mesh(this.#dustGeometry, this.#dustMaterial)
			const angle = Math.random() * Math.PI * 2
			const radius = 0.16 + Math.random() * 0.3
			const particleX = x + Math.cos(angle) * radius
			const particleZ = z + Math.sin(angle) * radius
			mesh.position.set(
				particleX,
				this.#heightAt(particleX, particleZ) + 0.09,
				particleZ,
			)
			mesh.scale.setScalar(0.65 + Math.random() * 0.45)
			this.#scene.add(mesh)
			this.#dustParticles.push({
				life: PLAYER_SLIDE_DUST_LIFETIME_SECONDS,
				mesh,
			})
		}
	}

	#updateLocalSlideDust(delta: number): void {
		const step = stepSlideDust(
			{ active: this.#wasSliding, elapsed: this.#slideDustElapsed },
			this.#slide,
			delta,
		)
		this.#wasSliding = step.state.active
		this.#slideDustElapsed = step.state.elapsed
		for (let index = 0; index < step.emissions; index += 1) {
			this.#emitDustAt(this.#player.position.x, this.#player.position.z)
		}
	}

	#updateDustParticles(delta: number): void {
		for (let index = this.#dustParticles.length - 1; index >= 0; index -= 1) {
			const particle = this.#dustParticles[index]
			if (particle === undefined) continue
			particle.life -= delta
			particle.mesh.position.y += delta * 0.22
			particle.mesh.scale.multiplyScalar(1 + delta * 1.8)
			if (particle.life <= 0) {
				this.#scene.remove(particle.mesh)
				this.#dustParticles.splice(index, 1)
			}
		}
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

	#updateSyncedWeaponVisuals(delta: number): void {
		this.#bubbleField.update(delta)
		for (const visual of this.#ballistics.values()) {
			visual.target.addScaledVector(visual.velocity, delta)
			visual.mesh.position.lerp(visual.target, Math.min(1, delta * 14))
			visual.mesh.rotation.y += delta * 2.2
		}
	}

	#disposeLocalDeathRagdoll(): void {
		this.#localDeathRagdoll?.dispose()
		this.#localDeathRagdoll = null
		if (this.#localDeathRig !== null) disposePilotModel(this.#localDeathRig)
		this.#localDeathRig = null
	}

	#updateLocalDeathRagdoll(
		delta: number,
		deathElapsed: number,
	): PilotRig | null {
		if (!this.#dead) {
			this.#disposeLocalDeathRagdoll()
			return null
		}
		if (this.#localDeathRig === null) {
			this.#localDeathRig = createPilotModel(undefined, this.#weaponKind)
			this.#localDeathRig.root.scale.setScalar(PILOT_MODEL_SCALE)
			this.#localDeathRagdoll = new PilotRagdollPresentation()
		}
		const rig = this.#localDeathRig
		const ragdoll = this.#localDeathRagdoll
		if (ragdoll === null) return null
		if (!ragdoll.active) {
			const authoredDeath = deathAnimationLayer(
				Math.min(deathElapsed, DEATH_RAGDOLL_HANDOFF_SECONDS),
			)
			applyPilotAnimationLayers(
				rig,
				authoredDeath === null ? [] : [authoredDeath],
			)
			const poseOffset = rig.root.position.clone()
			rig.root.position
				.copy(this.#player.position)
				.add(new THREE.Vector3(0, -PILOT_STANDING_EYE_HEIGHT, 0))
				.add(poseOffset)
			rig.root.rotation.y += this.#player.yaw
		}
		ragdoll.update(rig, {
			carrierVelocity: this.#player.velocity,
			delta,
			elapsedSeconds: deathElapsed,
			groundHeightAt: (x, z) => this.#heightAt(x, z),
		})
		return ragdoll.active ? rig : null
	}

	#updateCamera(delta: number): void {
		if (this.#slide) {
			const localSlideVelocity = this.#player.velocity
				.clone()
				.applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.#player.yaw)
			this.#slideHeading = stepSlideHeading(
				this.#slideHeading,
				{
					localVelocityX: localSlideVelocity.x,
					localVelocityZ: localSlideVelocity.z,
				},
				delta,
			)
		}
		this.#slidePoseWeight = THREE.MathUtils.lerp(
			this.#slidePoseWeight,
			this.#slide && !this.#dead ? 1 : 0,
			Math.min(1, delta * (this.#slide ? 12 : 6)),
		)
		this.#camera.position.copy(this.#player.position)
		const deathElapsed =
			this.#dead && this.#deathStartedAt !== null
				? Math.max(0, Date.now() / 1_000 - this.#deathStartedAt / 1_000)
				: 0
		const deathProgress = THREE.MathUtils.smoothstep(deathElapsed, 0, 0.75)
		const localDeathRig = this.#updateLocalDeathRagdoll(delta, deathElapsed)
		const slideSurface = this.#slideSurfaceAt(
			this.#player.position.x,
			this.#player.position.z,
			this.#player.yaw,
			this.#slideHeading,
		)
		const slideTilt = slideTravelTilt(this.#slideHeading, 0.055)
		if (localDeathRig === null) {
			this.#camera.position.y -= deathProgress * 0.82
			this.#camera.rotation.set(
				this.#player.pitch +
					deathProgress * 0.24 +
					slideSurface.inclinationRadians * 0.16 * this.#slidePoseWeight +
					slideTilt.x * this.#slidePoseWeight,
				this.#player.yaw,
				deathProgress * 0.2 + slideTilt.z * this.#slidePoseWeight,
				"YXZ",
			)
		} else {
			localDeathRig.head.getWorldPosition(this.#camera.position)
			this.#camera.position.y += 0.08
			const ragdollLook = localDeathRig.head.getWorldQuaternion(
				new THREE.Quaternion(),
			)
			this.#camera.quaternion.slerp(ragdollLook, Math.min(1, delta * 5))
		}
		const speed = Math.hypot(this.#player.velocity.x, this.#player.velocity.z)
		const bob =
			Math.sin(performance.now() * 0.012) * Math.min(speed * 0.002, 0.025)
		const presentation = gunPresentation(this.#weaponKind, "firstPerson")
		const punchElapsed = performance.now() / 1_000 - this.#punchStartedAt
		const punchProgress = THREE.MathUtils.clamp(
			punchElapsed / PUNCH_DURATION_SECONDS,
			0,
			1,
		)
		const punchWeight =
			punchElapsed >= 0 && punchElapsed < PUNCH_DURATION_SECONDS
				? Math.sin(punchProgress * Math.PI)
				: 0
		const reloadPose =
			this.#reload === null
				? { positionOffset: [0, 0, 0] as const }
				: sampleFirstPersonReloadPose(
						gunDefinition(this.#reload.gunId).reload.animation,
						reloadProgress(this.#reload, Date.now() / 1_000),
						gunDefinition(this.#reload.gunId).reload.refillProgress,
					)
		this.#weapon.position.y = THREE.MathUtils.lerp(
			this.#weapon.position.y,
			presentation.position[1] +
				bob +
				reloadPose.positionOffset[1] +
				punchWeight * -0.32 +
				deathProgress * 0.38,
			delta * 8,
		)
		this.#weapon.position.z = THREE.MathUtils.lerp(
			this.#weapon.position.z,
			presentation.position[2] +
				reloadPose.positionOffset[2] +
				punchWeight * 0.28 +
				deathProgress * 0.5,
			delta * 18,
		)
		this.#weapon.position.x = THREE.MathUtils.lerp(
			this.#weapon.position.x,
			presentation.position[0] +
				reloadPose.positionOffset[0] +
				punchWeight * 0.38 +
				this.#slidePoseWeight * 0.09,
			delta * 9,
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

	#slideSurfaceAt(
		x: number,
		z: number,
		yaw: number,
		heading: SlideHeading,
	): SlideSurfaceFrame {
		const gradient = sampleTerrainGradient(
			(sampleX, sampleZ) => this.#heightAt(sampleX, sampleZ),
			x,
			z,
		)
		const worldNormal = slideGroundNormalFromGradient(gradient)
		const localNormal = new THREE.Vector3(
			worldNormal.x,
			worldNormal.y,
			worldNormal.z,
		).applyAxisAngle(new THREE.Vector3(0, 1, 0), -yaw)
		return slideSurfaceFrameFromGroundNormal(heading, {
			x: localNormal.x,
			y: localNormal.y,
			z: localNormal.z,
		})
	}

	#updateTargeting(delta: number): void {
		if (this.#dead) {
			this.#targetingState = "idle"
			this.#reticleX = 0.5
			this.#reticleY = 0.5
			return
		}
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
			const lockedPosition = this.#getSmartTargetPosition(this.#lockedTargetId)
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

		const best = selectBestSmartTarget(
			this.#getSmartTargetCandidates(),
			(candidate) => {
				const projected = this.#projectTarget(
					new THREE.Vector3(...candidate.position),
				)
				if (projected === null || !projected.inside) return null
				return projected
			},
		)
		this.#acquiredTargetId = best?.ref ?? null
		this.#targetingState = best === null ? "idle" : "acquired"
		this.#reticleX = best?.x ?? 0.5
		this.#reticleY = best?.y ?? 0.5
	}

	#syncStandardLockIntent(): void {
		const gun = gunDefinition(this.#weaponKind)
		const active =
			this.#connected &&
			gun.fire.type === "projectile" &&
			this.#targetingState === "locked" &&
			this.#lockedTargetId?.kind === "pilot"
		if (active === this.#standardLockReported) return
		this.#standardLockReported = active
		this.#standardLockSequence += 1
		this.#socket.emit("arena:standard-lock", {
			active,
			clientLockId: this.#standardLockSequence,
		} satisfies StandardLockIntent)
	}

	#getSmartTargetCandidates(): SmartTargetCandidate[] {
		const candidates: SmartTargetCandidate[] = this.#drones
			.getTargetCandidates()
			.map((candidate) => ({
				position: candidate.position.toArray(),
				ref: { id: candidate.id, kind: "drone" },
			}))
		for (const [id, pilot] of this.#remotePlayers) {
			const candidate = pilotSmartTargetCandidateFromRoot(
				this.#socket.id,
				id,
				pilot.position.toArray(),
				pilot.crouching,
			)
			if (candidate !== null) candidates.push(candidate)
		}
		return candidates
	}

	#getSmartTargetPosition(target: SmartTargetRef): THREE.Vector3 | null {
		if (target.kind === "drone") {
			return this.#drones.getTargetPosition(target.id)
		}
		const pilot = this.#remotePlayers.get(target.id)
		return pilot === undefined
			? null
			: new THREE.Vector3(
					...pilotTorsoTargetFromRoot(
						pilot.position.toArray(),
						pilot.crouching,
					),
				)
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
		const presentation = gunPresentation(this.#weaponKind, "firstPerson")
		const desired = new THREE.Quaternion().setFromEuler(
			new THREE.Euler(...presentation.rotation),
		)
		const targetPosition =
			this.#acquiredTargetId === null
				? null
				: this.#getSmartTargetPosition(this.#acquiredTargetId)
		if (this.#dead) {
			desired.multiply(
				new THREE.Quaternion().setFromEuler(new THREE.Euler(0.8, 0, 0.5)),
			)
		} else if (performance.now() / 1_000 < this.#punchUntil) {
			desired.multiply(
				new THREE.Quaternion().setFromEuler(new THREE.Euler(0.45, 0.2, 0.55)),
			)
		} else if (this.#slide) {
			desired.multiply(
				new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.08, 0, 0.13)),
			)
		} else if (this.#sprinting) {
			desired.multiply(
				new THREE.Quaternion().setFromEuler(new THREE.Euler(1.05, 0, 0)),
			)
		} else if (targetPosition !== null) {
			const localTarget = this.#camera.worldToLocal(targetPosition)
			const direction = localTarget.sub(this.#weapon.position).normalize()
			desired.setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction)
		} else if (this.#targetingState === "escaping") {
			desired.setFromEuler(new THREE.Euler(1.05, 0, 0))
		}
		if (!this.#dead && this.#reload !== null) {
			const reload = gunDefinition(this.#reload.gunId).reload
			const pose = sampleFirstPersonReloadPose(
				reload.animation,
				reloadProgress(this.#reload, Date.now() / 1_000),
				reload.refillProgress,
			)
			desired.multiply(
				new THREE.Quaternion().setFromEuler(new THREE.Euler(...pose.rotation)),
			)
		}
		this.#weapon.quaternion.slerp(desired, Math.min(1, delta * 9))
	}

	#updateRemotePlayers(delta: number): void {
		for (const model of this.#remotePlayers.values()) {
			model.damageTracker = {
				...model.damageTracker,
				state: stepDamageFlinch(model.damageTracker.state, delta),
			}
			model.recoilState = stepRemoteRecoil(model.recoilState, delta)
			model.position.lerp(model.target, Math.min(1, delta * 12))
			const horizontalSpeed = Math.hypot(model.velocity.x, model.velocity.z)
			const localVelocity = model.velocity
				.clone()
				.applyAxisAngle(new THREE.Vector3(0, 1, 0), -model.yaw)
			const direction = runDirectionFromLocalVelocity(localVelocity)
			const animationTime = performance.now() / 1_000
			const layers: PilotAnimationLayer[] = []
			const deathElapsed =
				model.deathStartedAt === null
					? 0
					: Math.max(0, Date.now() / 1_000 - model.deathStartedAt / 1_000)
			const ragdollWasActive = model.ragdoll?.active ?? false
			if (model.dead) {
				if (!ragdollWasActive) {
					const authoredDeath = deathAnimationLayer(
						Math.min(deathElapsed, DEATH_RAGDOLL_HANDOFF_SECONDS),
					)
					if (authoredDeath !== null) layers.push(authoredDeath)
				}
			} else if (model.jump > 0) {
				const airborneMotion = {
					jumpCount: model.jump === 2 ? (2 as const) : (1 as const),
					localVelocityX: localVelocity.x,
					localVelocityZ: localVelocity.z,
					verticalVelocity: model.velocity.y,
				}
				layers.push(risingFallingAnimationLayer(airborneMotion))
				const doubleJumpElapsed = animationTime - model.doubleJumpStartedAt
				if (model.jump === 2 && doubleJumpElapsed < DOUBLE_JUMP_BURST_SECONDS) {
					layers.push(doubleJumpBurstLayer(doubleJumpElapsed, airborneMotion))
				}
				let momentumWeight = 1
				if (model.velocity.y < -0.1) {
					const groundClearance = Math.max(
						0,
						model.position.y -
							this.#heightAt(model.position.x, model.position.z),
					)
					const predictedImpactSeconds =
						groundClearance / Math.max(0.1, -model.velocity.y)
					if (predictedImpactSeconds < LANDING_PREP_SECONDS) {
						momentumWeight = predictedImpactSeconds / LANDING_PREP_SECONDS
						layers.push(
							landingPreparationLayer(
								1 - predictedImpactSeconds / LANDING_PREP_SECONDS,
								-model.velocity.y,
								airborneMotion,
							),
						)
					}
				}
				layers.push(airborneVelocityLayer(airborneMotion))
				layers.push(airborneMomentumLayer(airborneMotion, momentumWeight))
			} else if (model.sliding) {
				const slideMotion = {
					localVelocityX: localVelocity.x,
					localVelocityZ: localVelocity.z,
				}
				model.slideHeading = stepSlideHeading(
					model.slideHeading,
					slideMotion,
					delta,
				)
				layers.push(
					slideAnimationLayer(
						slideMotion,
						model.slideHeading,
						this.#slideSurfaceAt(
							model.position.x,
							model.position.z,
							model.yaw,
							model.slideHeading,
						),
					),
				)
			} else if (model.crouching) {
				if (horizontalSpeed > 0.35) {
					layers.push(
						crouchRunAnimationLayer(
							animationTime,
							THREE.MathUtils.clamp(horizontalSpeed / 6, 0.35, 1),
							direction,
						),
					)
				} else {
					layers.push({
						fadeSeconds: 0.14,
						id: "draft:crouch-idle",
						influence: FULL_BODY_INFLUENCE,
						mode: "override",
						pose: sampleDraftAnimation((rig) => {
							applyCrouchIdleAnimation(rig, animationTime, 1)
						}),
					})
				}
			} else if (horizontalSpeed > 0.35) {
				layers.push(
					runAnimationLayer(
						animationTime,
						THREE.MathUtils.clamp(horizontalSpeed / 8, 0.3, 1),
						direction,
					),
				)
			} else {
				layers.push(idleAnimationLayer(animationTime))
			}
			const landingElapsed = animationTime - model.landingStartedAt
			if (!model.dead && landingElapsed < LANDING_RECOVERY_SECONDS) {
				layers.push(
					landingRecoveryLayer(landingElapsed, model.landingImpactVelocity),
				)
			}
			const lookDirection = { pitch: model.pitch, yaw: 0 }
			const emoteElapsed = animationTime - model.emoteStartedAt
			const emoteDuration =
				model.emote === "wave"
					? WAVE_DURATION_SECONDS
					: model.emote === "salute"
						? SALUTE_DURATION_SECONDS
						: model.emote === "fistbump"
							? FISTBUMP_DURATION_SECONDS
							: 0
			const emoteActive =
				model.emote !== null &&
				emoteElapsed >= 0 &&
				emoteElapsed < emoteDuration
			if (emoteActive && !model.dead) {
				const progress = emoteElapsed / emoteDuration
				if (model.emote === "wave") layers.push(waveAnimationLayer(progress))
				if (model.emote === "salute")
					layers.push(saluteAnimationLayer(progress))
				if (model.emote === "fistbump")
					layers.push(fistbumpAnimationLayer(progress))
			}
			const punchElapsed = animationTime - model.punchStartedAt
			const punching =
				!emoteActive &&
				punchElapsed >= 0 &&
				punchElapsed < PUNCH_DURATION_SECONDS
			if (punching && !model.dead)
				layers.push(punchAnimationLayer(punchElapsed / PUNCH_DURATION_SECONDS))
			if (model.reload !== null && !model.dead) {
				const progress = reloadProgress(model.reload, Date.now() / 1_000)
				const reload = gunDefinition(model.reload.gunId).reload
				layers.push(
					reloadAnimationLayer(
						reload.animation,
						progress,
						reload.refillProgress,
					),
				)
			}
			const localAimDirection = model.aimDirection
				.clone()
				.applyAxisAngle(new THREE.Vector3(0, 1, 0), -model.yaw)
			const pointingDirection = {
				pitch: Math.asin(THREE.MathUtils.clamp(localAimDirection.y, -1, 1)),
				yaw: Math.atan2(-localAimDirection.x, -localAimDirection.z),
			}
			const weaponsFreeTarget = model.weaponsFree ? 1 : 0
			const weaponsFreeTransition =
				weaponsFreeTarget > model.weaponsFreeWeight ? 0.1 : 0.28
			const weaponsFreeStep = delta / weaponsFreeTransition
			model.weaponsFreeWeight =
				weaponsFreeTarget > model.weaponsFreeWeight
					? Math.min(
							weaponsFreeTarget,
							model.weaponsFreeWeight + weaponsFreeStep,
						)
					: Math.max(
							weaponsFreeTarget,
							model.weaponsFreeWeight - weaponsFreeStep,
						)
			if (model.weaponsFree && model.reload === null && !model.dead) {
				layers.push(
					weaponsFreeLayer(pointingDirection.pitch, pointingDirection.yaw),
				)
			}
			if (model.recoilState.intensity > 0) {
				layers.push(recoilAnimationLayer(model.recoilState.intensity))
			}
			if (model.damageTracker.state.intensity > 0) {
				const localDamageDirection = model.damageDirection
					.clone()
					.applyAxisAngle(new THREE.Vector3(0, 1, 0), -model.yaw)
					.toArray()
				layers.push(
					damageFlinchAnimationLayer(
						model.damageTracker.state.intensity,
						localDamageDirection,
					),
				)
			}
			const constraints = model.dead
				? []
				: [lookTowardConstraint(lookDirection, 0.92)]
			if (model.emote === "wave" && emoteActive) {
				constraints.push(waveTowardConstraint(lookDirection, 0.9))
			}
			if (
				model.weaponsFreeWeight > 0 &&
				!model.sprinting &&
				model.reload === null &&
				!model.dead
			) {
				constraints.push(
					pointBlasterConstraint(pointingDirection, model.weaponsFreeWeight),
				)
			}
			if (model.jump > 0 && !model.dead) {
				constraints.push(limitAirborneShoulderSpread)
			}
			if (!ragdollWasActive) {
				model.animator.update(model.rig, layers, delta, constraints)
			}
			const visorTime = Date.now() / 1_000
			if (model.dead) {
				model.rig.visorDisplay.setSignal(
					"defeated",
					"defeated",
					model.deathStartedAt === null
						? visorTime
						: model.deathStartedAt / 1_000,
				)
			} else {
				model.rig.visorDisplay.clearSignal("defeated")
				model.rig.visorDisplay.setSignal(
					"combat",
					model.visorExpression,
					model.visorStartedAt,
				)
			}
			model.rig.visorDisplay.update(visorTime)
			if (!ragdollWasActive) {
				const poseOffset = model.rig.root.position.clone()
				if (model.sliding) {
					applySlideWorldYaw(model.rig.root.quaternion, model.yaw, poseOffset)
				} else {
					model.rig.root.rotation.y += model.yaw
				}
				model.rig.root.position.copy(model.position).add(poseOffset)
			}
			if (model.dead) {
				model.ragdoll ??= new PilotRagdollPresentation()
				model.ragdoll.update(model.rig, {
					carrierVelocity: model.velocity,
					delta,
					elapsedSeconds: deathElapsed,
					groundHeightAt: (x, z) => this.#heightAt(x, z),
				})
			}
			const dustStep = stepSlideDust(
				{ active: model.dustActive, elapsed: model.dustElapsed },
				model.sliding && !model.dead,
				delta,
			)
			model.dustActive = dustStep.state.active
			model.dustElapsed = dustStep.state.elapsed
			for (let index = 0; index < dustStep.emissions; index += 1) {
				this.#emitDustAt(model.position.x, model.position.z)
			}
		}
	}

	#sendSnapshot(delta: number): void {
		this.#snapshotElapsed += delta
		if (!this.#connected || this.#dead || this.#snapshotElapsed < 0.05) return
		this.#snapshotElapsed = 0
		const now = performance.now() / 1_000
		const emoteActive = now < this.#activeEmoteUntil
		const horizontalSpeed = Math.hypot(
			this.#player.velocity.x,
			this.#player.velocity.z,
		)
		const visorExpression: VisorExpression =
			now < this.#visorHurtUntil
				? "hurt"
				: emoteActive
					? "happy"
					: this.#freeAim
						? "focus"
						: this.#fireCooldown > 0
							? "angry"
							: this.#sprinting || horizontalSpeed > 6
								? "angry"
								: "neutral"
		if (visorExpression !== this.#visorExpression) {
			this.#visorExpression = visorExpression
			this.#visorStartedAt = Date.now() / 1_000
		}
		this.#socket.emit("arena:move", {
			aimDirection: this.#getAimDirection().toArray(),
			crouching: this.#crouching,
			freeAim: this.#freeAim,
			jump: this.#player.jumps,
			position: this.#player.position.toArray(),
			rotation: [this.#player.yaw, this.#player.pitch],
			sliding: this.#slide,
			sprinting: this.#sprinting,
			velocity: this.#player.velocity.toArray(),
			visorExpression: this.#visorExpression,
			visorStartedAt: this.#visorStartedAt,
			weaponsFree: now < this.#weaponsFreeUntil,
		} satisfies PlayerMoveSnapshot)
	}

	#emitHud(delta: number): void {
		this.#hudElapsed += delta
		if (this.#hudElapsed < 0.09) return
		this.#hudElapsed = 0
		const nearbyPickup = this.#nearbyPickupWeapon()
		const pickupNearby = nearbyPickup !== null
		this.#onHud({
			ammo: this.#ammo,
			chargeProgress: this.#railCharging
				? Math.min(
						1,
						(performance.now() - this.#railChargeStartedAt) /
							RAIL_CHARGE_MAX_MS,
					)
				: 0,
			activeSlot: this.#activeSlot,
			connection: this.#connected
				? "online"
				: this.#socket.active
					? "connecting"
					: "offline",
			dead: this.#dead,
			health: Math.round(this.#health),
			hitMarkerClassification: this.#hitMarkerClassification,
			hitMarkerSequence: this.#hitMarkerSequence,
			hitMarkerVisible: performance.now() / 1_000 < this.#hitMarkerUntil,
			incomingMissileLocks: this.#incomingMissileLocks,
			incomingStandardLocks: this.#incomingStandardLocks,
			drones: this.#drones.count,
			jump: this.#player.jumps,
			lockCountdown: Math.ceil(this.#targetEscapeRemaining),
			nearbyPickup,
			players: this.#remotePlayers.size + 1,
			pickup:
				this.#pickupOwnerId !== null
					? "carried"
					: pickupNearby
						? "nearby"
						: this.#pickupAvailable
							? "available"
							: "respawning",
			pickupProgress: pickupNearby ? this.#pickupProgress : 0,
			pickupStatuses: [...this.#arenaPickupVisuals.values()].map((pickup) => ({
				remaining:
					pickup.availableAt === null
						? 0
						: Math.max(0, Math.ceil((pickup.availableAt - Date.now()) / 1_000)),
				status: pickup.available
					? "available"
					: pickup.ownerId !== null
						? "carried"
						: "returning",
				weapon: pickup.weapon,
			})),
			reticleX: this.#reticleX,
			reticleY: this.#reticleY,
			recoilPulse: this.#recoilPulse,
			recoilSpread: normalizedRecoilSpread(this.#recoilState),
			reloading: this.#reload !== null,
			reloadProgress: reloadProgress(this.#reload, Date.now() / 1_000),
			respawnRemaining:
				this.#dead && this.#respawnAt !== null
					? Math.max(0, Math.ceil((this.#respawnAt - Date.now()) / 1_000))
					: 0,
			score: this.#score,
			sliding: this.#slide,
			speed: Math.round(
				Math.hypot(this.#player.velocity.x, this.#player.velocity.z) * 3.6,
			),
			targeting: this.#targetingState,
			weapon: this.#weaponKind,
			weaponSlots: [
				{ ...this.#equipmentSlots[0] },
				this.#equipmentSlots[1] === null
					? null
					: { ...this.#equipmentSlots[1] },
			],
		})
	}

	#audioEngagement(): number {
		const targeting =
			this.#targetingState === "locked"
				? 1
				: this.#targetingState === "escaping"
					? 0.86
					: this.#targetingState === "acquired"
						? 0.62
						: this.#targetingState === "free"
							? 0.3
							: this.#targetingState === "lost"
								? 0.16
								: 0
		const incoming = Math.min(
			1,
			(this.#incomingMissileLocks + this.#incomingStandardLocks) * 0.68,
		)
		return Math.max(targeting, incoming, this.#noiseTimer > 0 ? 0.78 : 0)
	}

	#animate = (): void => {
		if (this.#disposed) return
		this.#animationFrame = requestAnimationFrame(this.#animate)
		const now = performance.now()
		const delta = Math.min(
			(now - this.#lastFrame) / 1000,
			JUMP_PHYSICS.maximumStepSeconds,
		)
		this.#lastFrame = now
		this.#updatePhysics(delta)
		this.#audio.update({
			combatHeat: this.#noiseTimer / 0.85,
			connected: this.#connected,
			delta,
			engagement: this.#audioEngagement(),
			grounded: this.#player.jumps === 0,
			health: this.#health,
			horizontalSpeed: Math.hypot(
				this.#player.velocity.x,
				this.#player.velocity.z,
			),
			jumpImpulse: this.#audioJumpImpulse,
			landingImpact: this.#audioLandingImpact,
			sliding: this.#slide,
			sprinting: this.#sprinting,
			threats: this.#incomingMissileLocks + this.#incomingStandardLocks,
		})
		this.#audioJumpImpulse = null
		this.#audioLandingImpact = 0
		this.#recoilState = recoverRecoilSpread(this.#recoilState, delta)
		this.#localDamageTracker = {
			...this.#localDamageTracker,
			state: stepDamageFlinch(this.#localDamageTracker.state, delta),
		}
		this.#noiseTimer = Math.max(0, this.#noiseTimer - delta)
		this.#drones.update(delta)
		this.#updateMuzzleFlashes(delta)
		this.#damageEffects.update(delta)
		this.#fistContactEffects.update(delta)
		this.#updateProjectiles(delta)
		this.#updateSyncedWeaponVisuals(delta)
		this.#updateGrenades(delta)
		this.#updateMiniMissiles(delta)
		this.#updateDustParticles(delta)
		this.#updateRemotePlayers(delta)
		this.#updateCamera(delta)
		this.#updateTargeting(delta)
		this.#syncStandardLockIntent()
		this.#updateWeaponPosture(delta)
		this.#sendSnapshot(delta)
		this.#emitHud(delta)
		this.#renderer.render(this.#scene, this.#camera)
	}
}
