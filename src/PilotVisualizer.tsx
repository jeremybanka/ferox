import * as THREE from "three"
import { useI, useO } from "atom.io/react"
import type { VNode } from "preact"
import { useEffect, useRef } from "preact/hooks"

import css from "./PilotVisualizer.module.css"
import {
	pilotVisualizerAlignmentAtom,
	pilotVisualizerAlignmentSweepAtom,
	pilotVisualizerControlsAtom,
	type BaseAnimation,
	type OverlayAnimation,
	type PilotVisualizerControls,
	type SampleInterval,
} from "./pilot-visualizer-state.ts"
import {
	sampleJumpTrajectory,
	simulateDoubleJumpWindow,
	simulateFlatGroundJump,
} from "./JumpPhysics.ts"
import {
	airborneMomentumLayer,
	DOUBLE_JUMP_BURST_SECONDS,
	doubleJumpBurstLayer,
	LANDING_PREP_SECONDS,
	LANDING_RECOVERY_SECONDS,
	landingPreparationLayer,
	landingRecoveryLayer,
	risingFallingAnimationLayer,
} from "./pilot/AirborneAnimation.ts"
import {
	applyCrouchIdleAnimation,
	CROUCH_RUN_DURATION_SECONDS,
	CROUCH_RUN_KEYFRAME_MARKERS,
	crouchRunAnimationLayer,
} from "./pilot/CrouchAnimation.ts"
import { DOUBLE_JUMP_KEYFRAME_MARKERS } from "./pilot/DoubleJumpAnimation.ts"
import {
	lookTowardConstraint,
	measureBlasterAlignment,
	pointBlasterConstraint,
	waveTowardConstraint,
	type PilotPointDirection,
} from "./pilot/DirectionalConstraints.ts"
import { JUMP_KEYFRAME_MARKERS } from "./pilot/JumpAnimation.ts"
import {
	idleAnimationLayer,
	IDLE_DURATION_SECONDS,
} from "./pilot/IdleAnimation.ts"
import {
	applyPilotAnimationLayers,
	FULL_BODY_INFLUENCE,
	sampleDraftAnimation,
	type PilotAnimationLayer,
} from "./pilot/PilotAnimation.ts"
import { createPilotModel } from "./pilot/PilotModel.ts"
import {
	runAnimationLayer,
	RUN_KEYFRAME_MARKERS,
	type RunDirection,
} from "./pilot/RunAnimation.ts"
import { waveAnimationLayer } from "./pilot/WaveAnimation.ts"
import { weaponsFreeLayer } from "./pilot/WeaponsFreePose.ts"

type AnimationMarker = {
	label: string
	progress: number
}

const BASE_ANIMATIONS: readonly BaseAnimation[] = [
	"idle",
	"forward",
	"left",
	"backward",
	"right",
	"jump",
	"double-jump",
	"crouch",
	"crouch-run-forward",
	"crouch-run-left",
	"crouch-run-backward",
	"crouch-run-right",
]

const OVERLAY_ANIMATIONS: readonly OverlayAnimation[] = ["weapons-free", "wave"]

const JUMP_TRAJECTORY = simulateFlatGroundJump()
const DOUBLE_JUMP_TRAJECTORY = simulateDoubleJumpWindow(
	DOUBLE_JUMP_BURST_SECONDS,
)
const JUMP_RECOVERY_SECONDS = LANDING_RECOVERY_SECONDS
const JUMP_PREVIEW_DURATION_SECONDS =
	JUMP_TRAJECTORY.duration + JUMP_RECOVERY_SECONDS

const BASE_DURATION_SECONDS: Readonly<Record<BaseAnimation, number>> = {
	backward: 1,
	crouch: 2.4,
	"crouch-run-backward": CROUCH_RUN_DURATION_SECONDS,
	"crouch-run-forward": CROUCH_RUN_DURATION_SECONDS,
	"crouch-run-left": CROUCH_RUN_DURATION_SECONDS,
	"crouch-run-right": CROUCH_RUN_DURATION_SECONDS,
	"double-jump": DOUBLE_JUMP_BURST_SECONDS,
	forward: 1,
	idle: IDLE_DURATION_SECONDS,
	jump: JUMP_PREVIEW_DURATION_SECONDS,
	left: 1,
	right: 1,
}

const BUNNYHOP_GROUND_SECONDS = 0.22
const BUNNYHOP_DURATION_SECONDS =
	JUMP_TRAJECTORY.duration + BUNNYHOP_GROUND_SECONDS

function alignJumpMarkers(
	progresses: readonly number[],
): readonly AnimationMarker[] {
	return JUMP_KEYFRAME_MARKERS.map((marker, index) => ({
		label: marker.label,
		progress: progresses[index] ?? marker.progress,
	}))
}

const JUMP_PREVIEW_MARKERS = alignJumpMarkers([
	0,
	JUMP_TRAJECTORY.apexTime / JUMP_PREVIEW_DURATION_SECONDS,
	JUMP_TRAJECTORY.duration / JUMP_PREVIEW_DURATION_SECONDS,
])
const BUNNYHOP_MARKERS = alignJumpMarkers([
	0,
	JUMP_TRAJECTORY.apexTime / BUNNYHOP_DURATION_SECONDS,
	JUMP_TRAJECTORY.duration / BUNNYHOP_DURATION_SECONDS,
])

const FILM_FRAME_WIDTH = 192
const FILM_FRAME_HEIGHT = 120

type StateUpdate<Value> = Value | ((current: Value) => Value)

function resolveStateUpdate<Value>(
	current: Value,
	next: StateUpdate<Value>,
): Value {
	return typeof next === "function"
		? (next as (current: Value) => Value)(current)
		: next
}

function isRunDirection(
	baseAnimation: BaseAnimation,
): baseAnimation is RunDirection {
	return (
		baseAnimation === "forward" ||
		baseAnimation === "backward" ||
		baseAnimation === "left" ||
		baseAnimation === "right"
	)
}

function getCrouchRunDirection(
	baseAnimation: BaseAnimation,
): RunDirection | null {
	switch (baseAnimation) {
		case "crouch-run-backward":
			return "backward"
		case "crouch-run-forward":
			return "forward"
		case "crouch-run-left":
			return "left"
		case "crouch-run-right":
			return "right"
		default:
			return null
	}
}

function supportsBunnyhop(baseAnimation: BaseAnimation): boolean {
	return baseAnimation === "idle" || isRunDirection(baseAnimation)
}

function getPreviewDuration(
	baseAnimation: BaseAnimation,
	bunnyhopping: boolean,
): number {
	return bunnyhopping && supportsBunnyhop(baseAnimation)
		? BUNNYHOP_DURATION_SECONDS
		: BASE_DURATION_SECONDS[baseAnimation]
}

function getAnimationMarkers(
	baseAnimation: BaseAnimation,
	bunnyhopping = false,
): readonly AnimationMarker[] {
	if (bunnyhopping && supportsBunnyhop(baseAnimation)) {
		return BUNNYHOP_MARKERS
	}
	if (isRunDirection(baseAnimation)) {
		return RUN_KEYFRAME_MARKERS
	}
	if (getCrouchRunDirection(baseAnimation) !== null) {
		return CROUCH_RUN_KEYFRAME_MARKERS
	}
	if (baseAnimation === "jump") return JUMP_PREVIEW_MARKERS
	if (baseAnimation === "double-jump") return DOUBLE_JUMP_KEYFRAME_MARKERS
	return []
}

function getSampleTimes(
	duration: number,
	interval: SampleInterval,
): readonly number[] {
	const times: number[] = []
	for (let time = 0; time <= duration + 0.001; time += interval) {
		times.push(Math.round(time * 100) / 100)
	}
	if (times.at(-1) !== duration) times.push(duration)
	return times
}

function formatTime(time: number): string {
	const isTenth = Math.abs(time * 10 - Math.round(time * 10)) < 0.001
	return `${time.toFixed(isTenth ? 1 : 2)}s`
}

function applyPreviewPose(
	rig: ReturnType<typeof createPilotModel>,
	baseAnimation: BaseAnimation,
	overlays: readonly OverlayAnimation[],
	time: number,
	direction: PilotPointDirection,
	overlayWeights: Partial<Record<OverlayAnimation, number>> = {},
	bunnyhopping = false,
): void {
	const activeBunnyhop = bunnyhopping && supportsBunnyhop(baseAnimation)
	const duration = getPreviewDuration(baseAnimation, activeBunnyhop)
	const progress = Math.min(1, Math.max(0, time / duration))
	const weaponsFreeWeight =
		overlayWeights["weapons-free"] ??
		(overlays.includes("weapons-free") ? 1 : 0)
	const layers: PilotAnimationLayer[] = []
	let rootHeight = 0
	if (activeBunnyhop) {
		if (time < JUMP_TRAJECTORY.duration) {
			const jumpSample = sampleJumpTrajectory(JUMP_TRAJECTORY, time)
			const localVelocityX =
				baseAnimation === "left" ? -7 : baseAnimation === "right" ? 7 : 0
			const localVelocityZ =
				baseAnimation === "forward"
					? -8
					: baseAnimation === "backward"
						? 6.4
						: 0
			const airborneMotion = {
				jumpCount: 1 as const,
				localVelocityX,
				localVelocityZ,
				verticalVelocity: jumpSample.velocityY,
			}
			rootHeight = jumpSample.positionY
			const impactTime = JUMP_TRAJECTORY.duration - time
			layers.push(risingFallingAnimationLayer(airborneMotion))
			layers.push(
				airborneMomentumLayer(
					airborneMotion,
					Math.min(1, impactTime / LANDING_PREP_SECONDS),
				),
			)
			if (impactTime < LANDING_PREP_SECONDS) {
				layers.push(
					landingPreparationLayer(
						1 - impactTime / LANDING_PREP_SECONDS,
						Math.max(0, -jumpSample.velocityY),
						airborneMotion,
					),
				)
			}
		} else {
			if (baseAnimation === "idle") {
				layers.push(idleAnimationLayer(time))
			} else if (isRunDirection(baseAnimation)) {
				layers.push(runAnimationLayer(time, 0.92, baseAnimation))
			}
			layers.push(
				landingRecoveryLayer(
					time - JUMP_TRAJECTORY.duration,
					JUMP_TRAJECTORY.impactVelocity,
				),
			)
		}
	} else if (baseAnimation === "idle") {
		layers.push(idleAnimationLayer(time))
	} else if (isRunDirection(baseAnimation)) {
		layers.push(
			runAnimationLayer((progress * Math.PI * 2) / 11, 0.92, baseAnimation),
		)
	} else if (baseAnimation === "jump") {
		if (time < JUMP_TRAJECTORY.duration) {
			const jumpSample = sampleJumpTrajectory(JUMP_TRAJECTORY, time)
			const airborneMotion = {
				jumpCount: 1 as const,
				localVelocityX: 0,
				localVelocityZ: -7.2,
				verticalVelocity: jumpSample.velocityY,
			}
			rootHeight = jumpSample.positionY
			const impactTime = JUMP_TRAJECTORY.duration - time
			layers.push(risingFallingAnimationLayer(airborneMotion))
			layers.push(
				airborneMomentumLayer(
					airborneMotion,
					Math.min(1, impactTime / LANDING_PREP_SECONDS),
				),
			)
			if (impactTime < LANDING_PREP_SECONDS) {
				layers.push(
					landingPreparationLayer(
						1 - impactTime / LANDING_PREP_SECONDS,
						Math.max(0, -jumpSample.velocityY),
						airborneMotion,
					),
				)
			}
		} else {
			layers.push(idleAnimationLayer(time))
			layers.push(
				landingRecoveryLayer(
					time - JUMP_TRAJECTORY.duration,
					JUMP_TRAJECTORY.impactVelocity,
				),
			)
		}
	} else if (baseAnimation === "double-jump") {
		const jumpSample = sampleJumpTrajectory(DOUBLE_JUMP_TRAJECTORY, time)
		const airborneMotion = {
			jumpCount: 2 as const,
			localVelocityX: 1.4,
			localVelocityZ: -7.2,
			verticalVelocity: jumpSample.velocityY,
		}
		rootHeight = jumpSample.positionY
		layers.push(risingFallingAnimationLayer(airborneMotion))
		layers.push(airborneMomentumLayer(airborneMotion))
		layers.push(
			doubleJumpBurstLayer(
				progress * DOUBLE_JUMP_BURST_SECONDS,
				airborneMotion,
			),
		)
	} else if (baseAnimation === "crouch") {
		layers.push(
			draftPreviewLayer("crouch", (draftRig) => {
				applyCrouchIdleAnimation(draftRig, (progress * Math.PI * 2) / 2.6, 1)
			}),
		)
	} else if (getCrouchRunDirection(baseAnimation) !== null) {
		const crouchDirection = getCrouchRunDirection(baseAnimation) ?? "forward"
		layers.push(crouchRunAnimationLayer(time, 1, crouchDirection))
	}
	if (weaponsFreeWeight > 0) {
		layers.push(
			weaponsFreeLayer(direction.pitch, direction.yaw, weaponsFreeWeight),
		)
	}
	if (overlays.includes("wave")) {
		layers.push(waveAnimationLayer(progress))
	}
	const constraints = [lookTowardConstraint(direction, 0.94)]
	if (overlays.includes("wave")) {
		constraints.push(waveTowardConstraint(direction, 0.9))
	}
	if (weaponsFreeWeight > 0) {
		constraints.push(pointBlasterConstraint(direction, weaponsFreeWeight))
	}
	applyPilotAnimationLayers(rig, layers, constraints)
	if (baseAnimation === "jump") {
		rig.root.position.y += rootHeight
	} else if (baseAnimation === "double-jump") {
		rig.root.position.y += rootHeight
	} else if (activeBunnyhop) {
		rig.root.position.y += rootHeight
	}
}

function draftPreviewLayer(
	id: string,
	mutate: Parameters<typeof sampleDraftAnimation>[0],
): PilotAnimationLayer {
	return {
		fadeSeconds: 0,
		id: `draft:${id}`,
		influence: FULL_BODY_INFLUENCE,
		mode: "override",
		pose: sampleDraftAnimation(mutate),
	}
}

function applyPreviewVisor(
	rig: ReturnType<typeof createPilotModel>,
	baseAnimation: BaseAnimation,
	overlays: readonly OverlayAnimation[],
	now: number,
): void {
	let source: "combat" | "emote" | "movement" | null = null
	let expression: "alarm" | "angry" | "focus" | "happy" | null = null
	if (overlays.includes("wave")) {
		source = "emote"
		expression = "happy"
	} else if (overlays.includes("weapons-free")) {
		source = "combat"
		expression = "focus"
	} else if (baseAnimation === "double-jump") {
		source = "movement"
		expression = "alarm"
	} else if (
		baseAnimation === "crouch" ||
		getCrouchRunDirection(baseAnimation) !== null
	) {
		source = "movement"
		expression = "angry"
	}
	for (const candidate of ["combat", "damage", "emote", "movement"] as const) {
		if (candidate !== source) rig.visorDisplay.clearSignal(candidate)
	}
	if (source !== null && expression !== null)
		rig.visorDisplay.setSignal(source, expression, now)
	rig.visorDisplay.update(now)
}

export function PilotVisualizer(): VNode {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const filmCanvasRef = useRef<HTMLCanvasElement>(null)
	const dragXRef = useRef<number | null>(null)
	const controls = useO(pilotVisualizerControlsAtom)
	const setControls = useI(pilotVisualizerControlsAtom)
	const alignment = useO(pilotVisualizerAlignmentAtom)
	const setAlignment = useI(pilotVisualizerAlignmentAtom)
	const alignmentSweep = useO(pilotVisualizerAlignmentSweepAtom)
	const setAlignmentSweep = useI(pilotVisualizerAlignmentSweepAtom)
	const {
		baseAnimation,
		bunnyhopping,
		isPlaying,
		overlays,
		sampleInterval,
		selectedTime,
		speed,
		targetPitch,
		targetYaw,
		yaw,
	} = controls
	const timelineRef = useRef(selectedTime)
	const controlsRef = useRef<PilotVisualizerControls>(controls)
	controlsRef.current = controls

	function setControl<Key extends keyof PilotVisualizerControls>(
		key: Key,
		next: StateUpdate<PilotVisualizerControls[Key]>,
	): void {
		setControls((current) => ({
			...current,
			[key]: resolveStateUpdate(current[key], next),
		}))
	}

	const setBaseAnimation = (next: BaseAnimation): void => {
		setControl("baseAnimation", next)
	}
	const setBunnyhopping = (
		next: boolean | ((current: boolean) => boolean),
	): void => {
		setControl("bunnyhopping", next)
	}
	const setIsPlaying = (next: boolean): void => {
		setControl("isPlaying", next)
	}
	const setOverlays = (
		next: StateUpdate<readonly OverlayAnimation[]>,
	): void => {
		setControl("overlays", next)
	}
	const setSampleInterval = (next: SampleInterval): void => {
		setControl("sampleInterval", next)
	}
	const setSelectedTime = (next: number): void => {
		setControl("selectedTime", next)
	}
	const setSpeed = (next: number): void => {
		setControl("speed", next)
	}
	const setTargetPitch = (next: number): void => {
		setControl("targetPitch", next)
	}
	const setTargetYaw = (next: number): void => {
		setControl("targetYaw", next)
	}
	const setYaw = (next: number | ((current: number) => number)): void => {
		setControl("yaw", next)
	}
	const duration = getPreviewDuration(baseAnimation, bunnyhopping)
	const keyframeMarkers = getAnimationMarkers(baseAnimation, bunnyhopping)
	const sampleTimes = getSampleTimes(duration, sampleInterval)
	const stackLabels = [
		...(bunnyhopping ? ["AUTO BUNNYHOP"] : []),
		...overlays.map((overlay) => overlay.toUpperCase()),
	]

	const selectBaseAnimation = (nextAnimation: BaseAnimation): void => {
		timelineRef.current = 0
		setSelectedTime(0)
		setIsPlaying(true)
		if (!supportsBunnyhop(nextAnimation)) setBunnyhopping(false)
		setBaseAnimation(nextAnimation)
	}

	const toggleBunnyhopping = (): void => {
		if (!supportsBunnyhop(baseAnimation)) return
		timelineRef.current = 0
		setSelectedTime(0)
		setIsPlaying(true)
		setBunnyhopping((current) => !current)
	}

	const toggleOverlay = (overlay: OverlayAnimation): void => {
		setOverlays((current) =>
			current.includes(overlay)
				? current.filter((candidate) => candidate !== overlay)
				: [...current, overlay],
		)
	}

	const selectTime = (time: number): void => {
		const snapped = Math.min(duration, Math.max(0, time))
		timelineRef.current = snapped
		setSelectedTime(snapped)
		setIsPlaying(false)
	}

	const rotatePilot = (nextYaw: number): void => {
		const wrapped = THREE.MathUtils.euclideanModulo(
			nextYaw + Math.PI,
			Math.PI * 2,
		)
		setYaw(wrapped - Math.PI)
	}

	const rotatePilotBy = (deltaYaw: number): void => {
		setYaw((currentYaw) => {
			const wrapped = THREE.MathUtils.euclideanModulo(
				currentYaw + deltaYaw + Math.PI,
				Math.PI * 2,
			)
			return wrapped - Math.PI
		})
	}

	useEffect(() => {
		const canvas = canvasRef.current
		if (canvas === null) return
		const scene = new THREE.Scene()
		scene.background = new THREE.Color("#172230")
		scene.fog = new THREE.Fog("#172230", 15, 30)
		const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 40)
		const cameraNormalPosition = new THREE.Vector3(6.2, 4.15, -8.75)
		camera.position.copy(cameraNormalPosition)
		camera.lookAt(0, 2, 0)
		const renderer = new THREE.WebGLRenderer({ antialias: true, canvas })
		renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8))
		renderer.outputColorSpace = THREE.SRGBColorSpace
		renderer.toneMapping = THREE.ACESFilmicToneMapping
		renderer.toneMappingExposure = 1.15
		renderer.shadowMap.enabled = true

		const ambient = new THREE.AmbientLight("#b8d7df", 1.15)
		const hemisphere = new THREE.HemisphereLight("#d6f7ff", "#201a20", 2.8)
		const key = new THREE.DirectionalLight("#fff0d4", 5.2)
		key.position.set(4, 8, -5)
		key.castShadow = true
		const rim = new THREE.DirectionalLight("#5cf4dc", 3.5)
		rim.position.set(-5, 3, -4)
		scene.add(ambient, hemisphere, key, rim)

		const rig = createPilotModel()
		scene.add(rig.root)
		const floor = new THREE.Mesh(
			new THREE.CylinderGeometry(3.6, 4, 0.32, 8),
			new THREE.MeshStandardMaterial({
				color: "#151e26",
				metalness: 0.72,
				roughness: 0.35,
			}),
		)
		floor.position.y = -0.31
		floor.receiveShadow = true
		scene.add(floor)
		const grid = new THREE.GridHelper(14, 28, "#4fe1ca", "#293f48")
		grid.position.y = -0.14
		scene.add(grid)
		const targetMaterial = new THREE.MeshBasicMaterial({
			color: "#ff5b4d",
			side: THREE.DoubleSide,
			toneMapped: false,
		})
		const targetMarker = new THREE.Mesh(
			new THREE.RingGeometry(0.22, 0.34, 24),
			targetMaterial,
		)
		targetMarker.visible = false
		const hitscanGeometry = new THREE.BufferGeometry()
		hitscanGeometry.setAttribute(
			"position",
			new THREE.BufferAttribute(new Float32Array(6), 3),
		)
		const hitscanMaterial = new THREE.LineBasicMaterial({
			color: "#ff5b4d",
			toneMapped: false,
		})
		const hitscan = new THREE.Line(hitscanGeometry, hitscanMaterial)
		hitscan.visible = false
		scene.add(targetMarker, hitscan)

		let sweepSamples = 0
		let maxSweepMiss = 0
		let sweepPassed = true
		for (const marker of RUN_KEYFRAME_MARKERS) {
			for (let pitch = -45; pitch <= 40; pitch += 5) {
				for (let yaw = -50; yaw <= 50; yaw += 5) {
					applyPreviewPose(rig, "forward", ["weapons-free"], marker.progress, {
						pitch: THREE.MathUtils.degToRad(pitch),
						yaw: THREE.MathUtils.degToRad(yaw),
					})
					const measured = measureBlasterAlignment(rig)
					sweepSamples += 1
					maxSweepMiss = Math.max(maxSweepMiss, measured.missDistance)
					sweepPassed &&= measured.hit
				}
			}
		}
		setAlignmentSweep({
			maxMissDistance: maxSweepMiss,
			passed: sweepPassed,
			samples: sweepSamples,
		})

		let frame = 0
		let previousTime = performance.now()
		let lastTimelineUpdate = 0
		let lastAlignmentUpdate = 0
		let weaponsFreePreviewWeight = controlsRef.current.overlays.includes(
			"weapons-free",
		)
			? 1
			: 0
		const cameraViewCenter = new THREE.Vector3()
		const cameraViewDirection = new THREE.Vector3()
		const cameraDiagnosticPosition = new THREE.Vector3()
		const cameraLookTarget = new THREE.Vector3()
		const cameraNormalFocus = new THREE.Vector3()
		const cameraOrbitAxis = new THREE.Vector3(0, 1, 0)
		const cameraViewSide = new THREE.Vector3()
		const resize = (): void => {
			const width = canvas.clientWidth
			const height = canvas.clientHeight
			camera.aspect = width / Math.max(height, 1)
			camera.updateProjectionMatrix()
			renderer.setSize(width, height, false)
		}
		const animate = (now: number): void => {
			frame = requestAnimationFrame(animate)
			const elapsed = Math.min(0.1, (now - previousTime) / 1_000)
			previousTime = now
			const controls = controlsRef.current
			const activeDuration = getPreviewDuration(
				controls.baseAnimation,
				controls.bunnyhopping,
			)
			if (controls.isPlaying) {
				timelineRef.current =
					(timelineRef.current + elapsed * controls.speed) % activeDuration
				if (now - lastTimelineUpdate >= 75) {
					lastTimelineUpdate = now
					setSelectedTime(Math.round(timelineRef.current * 10) / 10)
				}
			} else {
				timelineRef.current = controls.selectedTime
			}
			const weaponsFreeTarget = controls.overlays.includes("weapons-free")
				? 1
				: 0
			const weaponsFreeTransition =
				weaponsFreeTarget > weaponsFreePreviewWeight ? 0.1 : 0.28
			const weaponsFreeStep = elapsed / weaponsFreeTransition
			weaponsFreePreviewWeight =
				weaponsFreeTarget > weaponsFreePreviewWeight
					? Math.min(
							weaponsFreeTarget,
							weaponsFreePreviewWeight + weaponsFreeStep,
						)
					: Math.max(
							weaponsFreeTarget,
							weaponsFreePreviewWeight - weaponsFreeStep,
						)
			applyPreviewPose(
				rig,
				controls.baseAnimation,
				controls.overlays,
				timelineRef.current,
				{
					pitch: controls.targetPitch,
					yaw: controls.targetYaw,
				},
				{ "weapons-free": weaponsFreePreviewWeight },
				controls.bunnyhopping,
			)
			rig.root.rotation.y = controls.yaw
			const showAlignment = weaponsFreePreviewWeight > 0
			targetMarker.visible = showAlignment
			hitscan.visible = showAlignment
			if (showAlignment) {
				const measured = measureBlasterAlignment(rig)
				const color = measured.hit ? "#56f3a5" : "#ff5b4d"
				targetMaterial.color.set(color)
				hitscanMaterial.color.set(color)
				targetMarker.position.copy(measured.target)
				targetMarker.quaternion.copy(
					rig.head.getWorldQuaternion(new THREE.Quaternion()),
				)
				const positions = hitscanGeometry.getAttribute("position")
				positions.setXYZ(
					0,
					measured.muzzleOrigin.x,
					measured.muzzleOrigin.y,
					measured.muzzleOrigin.z,
				)
				positions.setXYZ(
					1,
					measured.rayEnd.x,
					measured.rayEnd.y,
					measured.rayEnd.z,
				)
				positions.needsUpdate = true
				const targetFocus = 0.5 * Math.pow(Math.abs(Math.cos(controls.yaw)), 6)
				cameraViewCenter
					.copy(measured.muzzleOrigin)
					.lerp(measured.target, targetFocus)
				cameraViewDirection
					.copy(measured.target)
					.sub(measured.muzzleOrigin)
					.normalize()
				cameraViewSide
					.set(-cameraViewDirection.z, 0, cameraViewDirection.x)
					.normalize()
					.applyAxisAngle(cameraOrbitAxis, controls.yaw)
				cameraDiagnosticPosition
					.copy(cameraViewCenter)
					.addScaledVector(cameraViewSide, 13)
				cameraDiagnosticPosition.y += 4
				cameraNormalFocus.set(0, 2 + rig.root.position.y, 0)
				camera.position
					.copy(cameraNormalPosition)
					.lerp(cameraDiagnosticPosition, weaponsFreePreviewWeight)
				cameraLookTarget
					.copy(cameraNormalFocus)
					.lerp(cameraViewCenter, weaponsFreePreviewWeight)
				camera.lookAt(cameraLookTarget)
				if (now - lastAlignmentUpdate >= 75) {
					lastAlignmentUpdate = now
					setAlignment({
						hit: measured.hit,
						missDistance: measured.missDistance,
					})
				}
			} else if (now - lastAlignmentUpdate >= 75) {
				lastAlignmentUpdate = now
				setAlignment(null)
			}
			if (!showAlignment) {
				camera.position.copy(cameraNormalPosition)
				camera.lookAt(0, 2 + rig.root.position.y, 0)
			}
			applyPreviewVisor(
				rig,
				controls.baseAnimation,
				controls.overlays,
				now / 1_000,
			)
			renderer.render(scene, camera)
		}
		window.addEventListener("resize", resize)
		resize()
		frame = requestAnimationFrame(animate)
		return () => {
			cancelAnimationFrame(frame)
			window.removeEventListener("resize", resize)
			hitscanGeometry.dispose()
			hitscanMaterial.dispose()
			targetMarker.geometry.dispose()
			targetMaterial.dispose()
			renderer.dispose()
		}
	}, [])

	useEffect(() => {
		const canvas = filmCanvasRef.current
		if (canvas === null) return
		const scene = new THREE.Scene()
		const camera = new THREE.PerspectiveCamera(
			31,
			FILM_FRAME_WIDTH / FILM_FRAME_HEIGHT,
			0.1,
			40,
		)
		camera.position.set(6.8, 4.25, -9.6)
		const renderer = new THREE.WebGLRenderer({ antialias: true, canvas })
		renderer.setPixelRatio(1)
		renderer.outputColorSpace = THREE.SRGBColorSpace
		renderer.toneMapping = THREE.ACESFilmicToneMapping
		renderer.toneMappingExposure = 1.15
		renderer.setClearColor("#0b121b")
		renderer.setScissorTest(true)

		const hemisphere = new THREE.HemisphereLight("#d6f7ff", "#19151a", 2.4)
		const key = new THREE.DirectionalLight("#fff0d4", 5)
		key.position.set(4, 8, -5)
		const rim = new THREE.DirectionalLight("#5cf4dc", 3.2)
		rim.position.set(-5, 3, -4)
		scene.add(hemisphere, key, rim)

		const rig = createPilotModel()
		scene.add(rig.root)
		const grid = new THREE.GridHelper(8, 16, "#377f76", "#20343c")
		grid.position.y = -0.14
		scene.add(grid)

		let frame = 0
		let previousSignature = ""
		const renderFilmstrip = (): void => {
			frame = requestAnimationFrame(renderFilmstrip)
			const controls = controlsRef.current
			const signature =
				`${controls.baseAnimation}:${controls.bunnyhopping}:` +
				`${controls.overlays.join(",")}:` +
				`${controls.sampleInterval}:${controls.yaw.toFixed(4)}:` +
				`${controls.targetPitch.toFixed(4)}:${controls.targetYaw.toFixed(4)}`
			if (signature === previousSignature) return
			previousSignature = signature
			const activeDuration = getPreviewDuration(
				controls.baseAnimation,
				controls.bunnyhopping,
			)
			const times = getSampleTimes(activeDuration, controls.sampleInterval)
			const totalHeight = times.length * FILM_FRAME_HEIGHT
			renderer.setSize(FILM_FRAME_WIDTH, totalHeight, false)

			for (const [index, time] of times.entries()) {
				const y = totalHeight - (index + 1) * FILM_FRAME_HEIGHT
				renderer.setViewport(0, y, FILM_FRAME_WIDTH, FILM_FRAME_HEIGHT)
				renderer.setScissor(0, y, FILM_FRAME_WIDTH, FILM_FRAME_HEIGHT)
				applyPreviewPose(
					rig,
					controls.baseAnimation,
					controls.overlays,
					time,
					{
						pitch: controls.targetPitch,
						yaw: controls.targetYaw,
					},
					{},
					controls.bunnyhopping,
				)
				rig.root.rotation.y = controls.yaw
				applyPreviewVisor(rig, controls.baseAnimation, controls.overlays, time)
				camera.lookAt(0, 2 + rig.root.position.y, 0)
				renderer.render(scene, camera)
			}
		}
		frame = requestAnimationFrame(renderFilmstrip)
		return () => {
			cancelAnimationFrame(frame)
			renderer.dispose()
		}
	}, [])

	return (
		<pilot-visualizer className={css.class}>
			<canvas
				ref={canvasRef}
				aria-label="Animated FEROX pilot model. Drag horizontally to rotate."
				onPointerDown={(event) => {
					dragXRef.current = event.clientX
					event.currentTarget.setPointerCapture(event.pointerId)
				}}
				onPointerMove={(event) => {
					const previousX = dragXRef.current
					if (previousX === null) return
					dragXRef.current = event.clientX
					rotatePilotBy((event.clientX - previousX) * 0.012)
				}}
				onPointerCancel={() => {
					dragXRef.current = null
				}}
				onPointerUp={(event) => {
					dragXRef.current = null
					event.currentTarget.releasePointerCapture(event.pointerId)
				}}
			/>
			<model-header>
				<p>FEROX // ARMOR LAB</p>
				<h1>MK-I PILOT</h1>
				<span>DRAG TO ROTATE / SCRUB TO FREEZE</span>
			</model-header>
			<animation-stack>
				<fieldset>
					<legend>BASE // EXCLUSIVE</legend>
					{BASE_ANIMATIONS.map((animation) => (
						<button
							key={animation}
							type="button"
							aria-pressed={baseAnimation === animation}
							data-active={baseAnimation === animation}
							onClick={() => {
								selectBaseAnimation(animation)
							}}
						>
							{animation}
						</button>
					))}
				</fieldset>
				<fieldset>
					<legend>OVERLAYS // STACKABLE + AUTO</legend>
					{OVERLAY_ANIMATIONS.map((overlay) => (
						<button
							key={overlay}
							type="button"
							aria-pressed={overlays.includes(overlay)}
							data-active={overlays.includes(overlay)}
							onClick={() => {
								toggleOverlay(overlay)
							}}
						>
							{overlays.includes(overlay) ? "+ " : "  "}
							{overlay}
						</button>
					))}
					<button
						type="button"
						aria-pressed={bunnyhopping}
						data-active={bunnyhopping}
						data-scenario
						disabled={!supportsBunnyhop(baseAnimation)}
						onClick={toggleBunnyhopping}
					>
						<small>AUTO</small>
						{bunnyhopping ? "+ " : "  "}
						bunnyhop
					</button>
				</fieldset>
			</animation-stack>
			<animation-console>
				<control-bank>
					<button
						type="button"
						aria-label={isPlaying ? "Pause animation" : "Play animation"}
						data-playing={isPlaying}
						onClick={() => {
							setIsPlaying(!isPlaying)
						}}
					>
						{isPlaying ? "Ⅱ PAUSE" : "▶ PLAY"}
					</button>
					<label>
						<span>SPEED</span>
						<input
							aria-label="Animation speed"
							type="range"
							min="0.1"
							max="1"
							step="0.1"
							value={speed}
							onInput={(event) => {
								setSpeed(Number(event.currentTarget.value))
							}}
						/>
						<output>{speed.toFixed(1)}×</output>
					</label>
					<label>
						<span>ANGLE</span>
						<input
							aria-label="Pilot rotation"
							type="range"
							min="-180"
							max="180"
							step="1"
							value={THREE.MathUtils.radToDeg(yaw)}
							onInput={(event) => {
								rotatePilot(
									THREE.MathUtils.degToRad(Number(event.currentTarget.value)),
								)
							}}
						/>
						<output>{Math.round(THREE.MathUtils.radToDeg(yaw))}°</output>
					</label>
				</control-bank>
				<direction-control>
					<strong>POINT TARGET</strong>
					<label>
						<span>YAW</span>
						<input
							aria-label="Point target yaw"
							type="range"
							min="-50"
							max="50"
							step="1"
							value={THREE.MathUtils.radToDeg(targetYaw)}
							onInput={(event) => {
								setTargetYaw(
									THREE.MathUtils.degToRad(Number(event.currentTarget.value)),
								)
							}}
						/>
						<output>{Math.round(THREE.MathUtils.radToDeg(targetYaw))}°</output>
					</label>
					<label>
						<span>PITCH</span>
						<input
							aria-label="Point target pitch"
							type="range"
							min="-45"
							max="40"
							step="1"
							value={THREE.MathUtils.radToDeg(targetPitch)}
							onInput={(event) => {
								setTargetPitch(
									THREE.MathUtils.degToRad(Number(event.currentTarget.value)),
								)
							}}
						/>
						<output>
							{Math.round(THREE.MathUtils.radToDeg(targetPitch))}°
						</output>
					</label>
					<output aria-live="polite" data-hit={alignment?.hit ?? false}>
						<strong>
							{alignment === null
								? "STANDBY"
								: alignment.hit
									? "INTERSECT"
									: "MISS"}
						</strong>
						<span>
							{alignment === null
								? "ENABLE WEAPONS-FREE"
								: `${(alignment.missDistance * 100).toFixed(1)} cm`}
						</span>
						<small data-pass={alignmentSweep?.passed ?? false}>
							{alignmentSweep === null
								? "RANGE SWEEP…"
								: `${alignmentSweep.passed ? "RANGE PASS" : "RANGE FAIL"} · ${
										alignmentSweep.samples
									} · ${(alignmentSweep.maxMissDistance * 100).toFixed(
										2,
									)} cm max`}
						</small>
					</output>
				</direction-control>
				<keyframe-control>
					<strong>KEYFRAMES</strong>
					{keyframeMarkers.length === 0 ? (
						<span>NO AUTHORED KEYS</span>
					) : (
						<fieldset>
							<legend>
								{bunnyhopping
									? `${baseAnimation} + bunnyhop animation keyframes`
									: `${baseAnimation} animation keyframes`}
							</legend>
							{keyframeMarkers.map((marker, index) => {
								const keyframeTime = marker.progress * duration
								return (
									<button
										key={`${marker.label}:${marker.progress}`}
										type="button"
										aria-label={`Jump to ${marker.label} keyframe`}
										data-active={
											!isPlaying &&
											Math.abs(selectedTime - keyframeTime) < 0.001
										}
										onClick={() => {
											selectTime(keyframeTime)
										}}
									>
										<small>{String(index + 1).padStart(2, "0")}</small>
										{marker.label}
									</button>
								)
							})}
						</fieldset>
					)}
				</keyframe-control>
				<timeline-control>
					<button
						type="button"
						aria-label="Previous tenth of a second"
						onClick={() => {
							selectTime(selectedTime - 0.1)
						}}
					>
						−.1s
					</button>
					<label>
						<span>TIMELINE</span>
						<input
							aria-label="Animation time"
							type="range"
							min="0"
							max={duration}
							step="0.001"
							value={Math.min(selectedTime, duration)}
							onInput={(event) => {
								selectTime(Number(event.currentTarget.value))
							}}
						/>
					</label>
					<button
						type="button"
						aria-label="Next tenth of a second"
						onClick={() => {
							selectTime(selectedTime + 0.1)
						}}
					>
						+.1s
					</button>
					<output aria-live="polite">
						<strong>{isPlaying ? "PLAYING" : "FROZEN"}</strong>
						<span>
							{formatTime(Math.min(selectedTime, duration))} /{" "}
							{formatTime(duration)}
						</span>
					</output>
				</timeline-control>
			</animation-console>
			<filmstrip-panel>
				<filmstrip-header>
					<section>
						<strong>POSE FILM</strong>
						<span>{sampleTimes.length} EXPOSURES</span>
					</section>
					<fieldset>
						<legend>Frame interval</legend>
						{([0.167, 0.0833] as const).map((interval) => (
							<button
								key={interval}
								type="button"
								aria-label={`Sample every ${interval.toFixed(2)} seconds`}
								data-active={sampleInterval === interval}
								onClick={() => {
									setSampleInterval(interval)
								}}
							>
								{interval.toFixed(2)}s
							</button>
						))}
					</fieldset>
				</filmstrip-header>
				<filmstrip-viewport>
					<filmstrip-rail>
						<canvas
							ref={filmCanvasRef}
							aria-label={`${baseAnimation} animation${bunnyhopping ? " with automatic bunnyhopping" : ""} and ${overlays.length} overlays sampled every ${sampleInterval.toFixed(2)} seconds`}
							width={FILM_FRAME_WIDTH}
							height={sampleTimes.length * FILM_FRAME_HEIGHT}
						/>
						<ol>
							{sampleTimes.map((time) => (
								<li key={time}>
									<button
										type="button"
										aria-label={`Freeze animation at ${time.toFixed(2)} seconds`}
										data-active={
											!isPlaying && Math.abs(selectedTime - time) < 0.01
										}
										onClick={() => {
											selectTime(time)
										}}
									>
										<span>{formatTime(time)}</span>
									</button>
								</li>
							))}
						</ol>
					</filmstrip-rail>
				</filmstrip-viewport>
			</filmstrip-panel>
			<aside>
				<strong>{baseAnimation.toUpperCase()}</strong>
				<span>
					{stackLabels.length === 0
						? "BASE POSE"
						: `+ ${stackLabels.join(" + ")}`}
				</span>
			</aside>
		</pilot-visualizer>
	)
}
