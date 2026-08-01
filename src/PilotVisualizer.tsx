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
	type SlideAnimation,
} from "./pilot-visualizer-state.ts"
import {
	JUMP_PHYSICS,
	sampleJumpTrajectory,
	simulateDoubleJumpWindow,
	simulateFlatGroundJump,
} from "./JumpPhysics.ts"
import {
	DEFAULT_GUN_ID,
	GUN_IDS,
	gunDefinition,
	isGunId,
	type GunId,
} from "./guns/GunDefinitions.ts"
import {
	AIRBORNE_VELOCITY_MODEL,
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
	sampleAirbornePhase,
	sampleAirborneVelocityResponse,
	type AirborneMotion,
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
import {
	DEATH_ANIMATION_DURATION_SECONDS,
	DEATH_ANIMATION_MARKERS,
	deathAnimationLayer,
	deathAnimationPhase,
	deathAnimationProgress,
} from "./pilot/DeathAnimation.ts"
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
import {
	createPilotModel,
	disposePilotModel,
	setPilotGun,
} from "./pilot/PilotModel.ts"
import {
	damageFlinchAnimationLayer,
	DAMAGE_PREVIEW_CYCLE_SECONDS,
	DAMAGE_PREVIEW_HITS,
	sampleDamageFlinchIntensity,
} from "./pilot/DamageFeedback.ts"
import {
	recoilAnimationLayer,
	REMOTE_RECOIL_PREVIEW_CYCLE_SECONDS,
	REMOTE_RECOIL_PREVIEW_SHOTS,
	sampleRemoteRecoilIntensity,
} from "./pilot/RecoilAnimation.ts"
import {
	runAnimationLayer,
	RUN_KEYFRAME_MARKERS,
	type RunDirection,
} from "./pilot/RunAnimation.ts"
import {
	reloadAnimationLayer,
	reloadAnimationMarkers,
} from "./pilot/ReloadAnimation.ts"
import {
	slideAnimationLayer,
	SLIDE_DURATION_SECONDS,
	SLIDE_KEYFRAME_MARKERS,
	type SlideMotion,
} from "./pilot/SlideAnimation.ts"
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
	"slide-forward",
	"slide-left",
	"slide-backward",
	"slide-right",
	"reload",
	"death",
	"crouch",
	"crouch-run-forward",
	"crouch-run-left",
	"crouch-run-backward",
	"crouch-run-right",
]

const OVERLAY_ANIMATIONS: readonly OverlayAnimation[] = [
	"weapons-free",
	"recoil",
	"flinch",
	"wave",
]

const JUMP_TRAJECTORY = simulateFlatGroundJump()
const DOUBLE_JUMP_TRAJECTORY = simulateDoubleJumpWindow(
	DOUBLE_JUMP_BURST_SECONDS,
)
const JUMP_RECOVERY_SECONDS = LANDING_RECOVERY_SECONDS
const JUMP_PREVIEW_DURATION_SECONDS =
	JUMP_TRAJECTORY.duration + JUMP_RECOVERY_SECONDS

type NonReloadBaseAnimation = Exclude<BaseAnimation, "reload">

const BASE_DURATION_SECONDS: Readonly<Record<NonReloadBaseAnimation, number>> =
	{
		backward: 1,
		crouch: 2.4,
		"crouch-run-backward": CROUCH_RUN_DURATION_SECONDS,
		"crouch-run-forward": CROUCH_RUN_DURATION_SECONDS,
		"crouch-run-left": CROUCH_RUN_DURATION_SECONDS,
		"crouch-run-right": CROUCH_RUN_DURATION_SECONDS,
		death: DEATH_ANIMATION_DURATION_SECONDS,
		"double-jump": DOUBLE_JUMP_BURST_SECONDS,
		forward: 1,
		idle: IDLE_DURATION_SECONDS,
		jump: JUMP_PREVIEW_DURATION_SECONDS,
		left: 1,
		right: 1,
		slide: SLIDE_DURATION_SECONDS,
		"slide-backward": SLIDE_DURATION_SECONDS,
		"slide-forward": SLIDE_DURATION_SECONDS,
		"slide-left": SLIDE_DURATION_SECONDS,
		"slide-right": SLIDE_DURATION_SECONDS,
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

type PreviewAirborneSample = {
	impactTime: number | null
	momentumWeight: number
	motion: AirborneMotion
	rootHeight: number
}

type PoseStat = {
	label: string
	max: number
	signed: boolean
	unit: string
	value: number
}

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

function getSlideDirection(baseAnimation: BaseAnimation): RunDirection | null {
	switch (baseAnimation) {
		case "slide":
		case "slide-forward":
			return "forward"
		case "slide-backward":
			return "backward"
		case "slide-left":
			return "left"
		case "slide-right":
			return "right"
		default:
			return null
	}
}

function slidePreviewMotion(direction: RunDirection): SlideMotion {
	return {
		localVelocityX: direction === "left" ? -8 : direction === "right" ? 8 : 0,
		localVelocityZ:
			direction === "forward" ? -8 : direction === "backward" ? 8 : 0,
	}
}

function supportsBunnyhop(baseAnimation: BaseAnimation): boolean {
	return baseAnimation === "idle" || isRunDirection(baseAnimation)
}

function supportsOverlay(
	baseAnimation: BaseAnimation,
	_overlay: OverlayAnimation,
): boolean {
	return baseAnimation !== "death" && baseAnimation !== "reload"
}

function isLifecycleAnimation(
	baseAnimation: BaseAnimation,
): baseAnimation is "death" | "reload" | "slide" | SlideAnimation {
	return (
		baseAnimation === "death" ||
		baseAnimation === "reload" ||
		getSlideDirection(baseAnimation) !== null
	)
}

function slidePreviewWeight(progress: number): number {
	if (progress < 0.18) return THREE.MathUtils.smoothstep(progress, 0, 0.18)
	if (progress > 0.82) {
		return 1 - THREE.MathUtils.smoothstep(progress, 0.82, 1)
	}
	return 1
}

function getPreviewDuration(
	baseAnimation: BaseAnimation,
	bunnyhopping: boolean,
	gunId: GunId = DEFAULT_GUN_ID,
): number {
	if (baseAnimation === "reload") {
		return gunDefinition(gunId).reload.durationSeconds
	}
	return bunnyhopping && supportsBunnyhop(baseAnimation)
		? BUNNYHOP_DURATION_SECONDS
		: BASE_DURATION_SECONDS[baseAnimation]
}

function getAnimationMarkers(
	baseAnimation: BaseAnimation,
	bunnyhopping = false,
	gunId: GunId = DEFAULT_GUN_ID,
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
	if (getSlideDirection(baseAnimation) !== null) return SLIDE_KEYFRAME_MARKERS
	if (baseAnimation === "reload") {
		const reload = gunDefinition(gunId).reload
		return reloadAnimationMarkers(reload.animation, reload.refillProgress)
	}
	if (baseAnimation === "death") return DEATH_ANIMATION_MARKERS
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

function getPreviewPlanarVelocity(baseAnimation: BaseAnimation): {
	x: number
	z: number
} {
	return {
		x: baseAnimation === "left" ? -7 : baseAnimation === "right" ? 7 : 0,
		z:
			baseAnimation === "forward" ? -8 : baseAnimation === "backward" ? 6.4 : 0,
	}
}

function samplePreviewAirborneMotion(
	baseAnimation: BaseAnimation,
	bunnyhopping: boolean,
	time: number,
): PreviewAirborneSample | null {
	if (bunnyhopping && supportsBunnyhop(baseAnimation)) {
		if (time >= JUMP_TRAJECTORY.duration) return null
		const jumpSample = sampleJumpTrajectory(JUMP_TRAJECTORY, time)
		const planarVelocity = getPreviewPlanarVelocity(baseAnimation)
		const impactTime = JUMP_TRAJECTORY.duration - time
		return {
			impactTime,
			momentumWeight: Math.min(1, impactTime / LANDING_PREP_SECONDS),
			motion: {
				jumpCount: 1,
				localVelocityX: planarVelocity.x,
				localVelocityZ: planarVelocity.z,
				verticalVelocity: jumpSample.velocityY,
			},
			rootHeight: jumpSample.positionY,
		}
	}
	if (baseAnimation === "jump") {
		if (time >= JUMP_TRAJECTORY.duration) return null
		const jumpSample = sampleJumpTrajectory(JUMP_TRAJECTORY, time)
		const impactTime = JUMP_TRAJECTORY.duration - time
		return {
			impactTime,
			momentumWeight: Math.min(1, impactTime / LANDING_PREP_SECONDS),
			motion: {
				jumpCount: 1,
				localVelocityX: 0,
				localVelocityZ: -7.2,
				verticalVelocity: jumpSample.velocityY,
			},
			rootHeight: jumpSample.positionY,
		}
	}
	if (baseAnimation === "double-jump") {
		const jumpSample = sampleJumpTrajectory(DOUBLE_JUMP_TRAJECTORY, time)
		return {
			impactTime: null,
			momentumWeight: 1,
			motion: {
				jumpCount: 2,
				localVelocityX: 1.4,
				localVelocityZ: -7.2,
				verticalVelocity: jumpSample.velocityY,
			},
			rootHeight: jumpSample.positionY,
		}
	}
	return null
}

function getPoseStats(
	sample: PreviewAirborneSample | null,
): readonly PoseStat[] {
	const motion = sample?.motion
	const phase =
		motion === undefined
			? { apex: 0, fall: 0, rise: 0 }
			: sampleAirbornePhase(motion)
	const response =
		motion === undefined
			? { pitch: 0, roll: 0, shoulderSpread: 0 }
			: sampleAirborneVelocityResponse(motion)
	return [
		{
			label: "LOCAL X",
			max: AIRBORNE_VELOCITY_MODEL.planarSpeedAtFullTilt,
			signed: true,
			unit: "m/s",
			value: motion?.localVelocityX ?? 0,
		},
		{
			label: "LOCAL Z",
			max: AIRBORNE_VELOCITY_MODEL.planarSpeedAtFullTilt,
			signed: true,
			unit: "m/s",
			value: motion?.localVelocityZ ?? 0,
		},
		{
			label: "VERTICAL",
			max: Math.max(
				JUMP_PHYSICS.jumpVelocity,
				AIRBORNE_VELOCITY_MODEL.verticalFallSpeedAtFullLift,
			),
			signed: true,
			unit: "m/s",
			value: motion?.verticalVelocity ?? 0,
		},
		{ label: "RISE", max: 1, signed: false, unit: "", value: phase.rise },
		{ label: "APEX", max: 1, signed: false, unit: "", value: phase.apex },
		{ label: "FALL", max: 1, signed: false, unit: "", value: phase.fall },
		{
			label: "PITCH",
			max: AIRBORNE_VELOCITY_MODEL.maxPlanarTilt,
			signed: true,
			unit: "°",
			value: response.pitch,
		},
		{
			label: "ROLL",
			max: AIRBORNE_VELOCITY_MODEL.maxPlanarTilt,
			signed: true,
			unit: "°",
			value: response.roll,
		},
		{
			label: "SPREAD",
			max: AIRBORNE_VELOCITY_MODEL.maxShoulderSpread,
			signed: false,
			unit: "°",
			value: response.shoulderSpread,
		},
		{
			label: "GESTURE",
			max: 1,
			signed: false,
			unit: "",
			value: sample?.momentumWeight ?? 0,
		},
	]
}

function getLifecyclePoseStats(
	baseAnimation: BaseAnimation,
	time: number,
	gunId: GunId,
): readonly PoseStat[] | null {
	if (!isLifecycleAnimation(baseAnimation)) return null
	const duration = getPreviewDuration(baseAnimation, false, gunId)
	const progress = THREE.MathUtils.clamp(time / duration, 0, 1)
	const slideDirection = getSlideDirection(baseAnimation)
	if (slideDirection !== null) {
		const weight = slidePreviewWeight(progress)
		const motion = slidePreviewMotion(slideDirection)
		return [
			{ label: "TIMELINE", max: 1, signed: false, unit: "", value: progress },
			{ label: "POSE", max: 1, signed: false, unit: "", value: weight },
			{
				label: "DUST",
				max: 1,
				signed: false,
				unit: "",
				value: weight >= 0.95 ? 1 : 0,
			},
			{
				label: "LATERAL",
				max: 8,
				signed: true,
				unit: "m/s",
				value: motion.localVelocityX,
			},
			{
				label: "FORWARD",
				max: 8,
				signed: true,
				unit: "m/s",
				value: -motion.localVelocityZ,
			},
		]
	}
	if (baseAnimation === "reload") {
		const reload = gunDefinition(gunId).reload
		return [
			{ label: "TIMELINE", max: 1, signed: false, unit: "", value: progress },
			{
				label: "HANDLING",
				max: 1,
				signed: false,
				unit: "",
				value: Math.sin(progress * Math.PI),
			},
			{
				label: "REFILLED",
				max: 1,
				signed: false,
				unit: "",
				value: progress >= reload.refillProgress ? 1 : 0,
			},
		]
	}
	return [
		{ label: "TIMELINE", max: 1, signed: false, unit: "", value: progress },
		{
			label: "COLLAPSE",
			max: 1,
			signed: false,
			unit: "",
			value: deathAnimationProgress(time),
		},
		{
			label: "DEFEATED",
			max: 1,
			signed: false,
			unit: "",
			value: ["flat", "hold"].includes(deathAnimationPhase(progress)) ? 1 : 0,
		},
	]
}

function PoseStatBar({ stat }: { stat: PoseStat }): VNode {
	const normalized = THREE.MathUtils.clamp(stat.value / stat.max, -1, 1)
	const start = stat.signed ? (normalized < 0 ? 50 + normalized * 50 : 50) : 0
	const width = Math.abs(normalized) * (stat.signed ? 50 : 100)
	const displayValue =
		stat.unit === "°" ? THREE.MathUtils.radToDeg(stat.value) : stat.value
	const formattedValue =
		stat.unit === "" ? displayValue.toFixed(2) : displayValue.toFixed(1)

	return (
		<pose-stat-bar data-negative={normalized < 0} data-signed={stat.signed}>
			<label>{stat.label}</label>
			<pose-stat-meter
				role="meter"
				aria-label={stat.label}
				aria-valuemin={stat.signed ? -stat.max : 0}
				aria-valuemax={stat.max}
				aria-valuenow={stat.value}
			>
				<i style={`left: ${start}%; width: ${width}%`} />
			</pose-stat-meter>
			<output>
				{formattedValue}
				{stat.unit}
			</output>
		</pose-stat-bar>
	)
}

function applyPreviewPose(
	rig: ReturnType<typeof createPilotModel>,
	baseAnimation: BaseAnimation,
	overlays: readonly OverlayAnimation[],
	time: number,
	direction: PilotPointDirection,
	overlayWeights: Partial<Record<OverlayAnimation, number>> = {},
	bunnyhopping = false,
	gunId: GunId = DEFAULT_GUN_ID,
): void {
	const activeBunnyhop = bunnyhopping && supportsBunnyhop(baseAnimation)
	const duration = getPreviewDuration(baseAnimation, activeBunnyhop, gunId)
	const progress = Math.min(1, Math.max(0, time / duration))
	const weaponsFreeWeight =
		overlayWeights["weapons-free"] ??
		(overlays.includes("weapons-free") ? 1 : 0)
	const overlaysAllowed =
		baseAnimation !== "death" && baseAnimation !== "reload"
	const layers: PilotAnimationLayer[] = []
	let isAirborne = false
	let rootHeight = 0
	if (baseAnimation === "death") {
		layers.push(deathAnimationLayer(time))
	} else if (baseAnimation === "reload") {
		const reload = gunDefinition(gunId).reload
		layers.push(idleAnimationLayer(time))
		layers.push(
			reloadAnimationLayer(reload.animation, progress, reload.refillProgress),
		)
	} else if (getSlideDirection(baseAnimation) !== null) {
		const slideDirection = getSlideDirection(baseAnimation) ?? "forward"
		layers.push(idleAnimationLayer(time))
		layers.push({
			...slideAnimationLayer(slidePreviewMotion(slideDirection)),
			fadeSeconds: 0,
			weight: slidePreviewWeight(progress),
		})
	} else if (activeBunnyhop) {
		const airborneSample = samplePreviewAirborneMotion(
			baseAnimation,
			bunnyhopping,
			time,
		)
		if (airborneSample !== null) {
			isAirborne = true
			const { impactTime, momentumWeight, motion } = airborneSample
			rootHeight = airborneSample.rootHeight
			layers.push(risingFallingAnimationLayer(motion))
			layers.push(airborneVelocityLayer(motion))
			layers.push(airborneMomentumLayer(motion, momentumWeight))
			if (impactTime !== null && impactTime < LANDING_PREP_SECONDS) {
				layers.push(
					landingPreparationLayer(
						1 - impactTime / LANDING_PREP_SECONDS,
						Math.max(0, -motion.verticalVelocity),
						motion,
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
		const airborneSample = samplePreviewAirborneMotion(
			baseAnimation,
			bunnyhopping,
			time,
		)
		if (airborneSample !== null) {
			isAirborne = true
			const { impactTime, momentumWeight, motion } = airborneSample
			rootHeight = airborneSample.rootHeight
			layers.push(risingFallingAnimationLayer(motion))
			layers.push(airborneVelocityLayer(motion))
			layers.push(airborneMomentumLayer(motion, momentumWeight))
			if (impactTime !== null && impactTime < LANDING_PREP_SECONDS) {
				layers.push(
					landingPreparationLayer(
						1 - impactTime / LANDING_PREP_SECONDS,
						Math.max(0, -motion.verticalVelocity),
						motion,
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
		const airborneSample = samplePreviewAirborneMotion(
			baseAnimation,
			bunnyhopping,
			time,
		)
		if (airborneSample === null) return
		isAirborne = true
		rootHeight = airborneSample.rootHeight
		layers.push(risingFallingAnimationLayer(airborneSample.motion))
		layers.push(airborneVelocityLayer(airborneSample.motion))
		layers.push(
			airborneMomentumLayer(
				airborneSample.motion,
				airborneSample.momentumWeight,
			),
		)
		layers.push(
			doubleJumpBurstLayer(
				progress * DOUBLE_JUMP_BURST_SECONDS,
				airborneSample.motion,
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
	if (overlaysAllowed && weaponsFreeWeight > 0) {
		layers.push(
			weaponsFreeLayer(direction.pitch, direction.yaw, weaponsFreeWeight),
		)
	}
	if (overlaysAllowed && overlays.includes("recoil")) {
		const recoilTime = THREE.MathUtils.euclideanModulo(
			time,
			REMOTE_RECOIL_PREVIEW_CYCLE_SECONDS,
		)
		layers.push(
			recoilAnimationLayer(
				sampleRemoteRecoilIntensity(recoilTime, REMOTE_RECOIL_PREVIEW_SHOTS),
			),
		)
	}
	if (overlaysAllowed && overlays.includes("flinch")) {
		const damageTime = THREE.MathUtils.euclideanModulo(
			time,
			DAMAGE_PREVIEW_CYCLE_SECONDS,
		)
		layers.push(
			damageFlinchAnimationLayer(
				sampleDamageFlinchIntensity(damageTime, DAMAGE_PREVIEW_HITS),
				[0.55, 0, -1],
			),
		)
	}
	if (overlaysAllowed && overlays.includes("wave")) {
		layers.push(waveAnimationLayer(progress))
	}
	const constraints =
		baseAnimation === "death" ? [] : [lookTowardConstraint(direction, 0.94)]
	if (overlaysAllowed && overlays.includes("wave")) {
		constraints.push(waveTowardConstraint(direction, 0.9))
	}
	if (overlaysAllowed && weaponsFreeWeight > 0) {
		constraints.push(pointBlasterConstraint(direction, weaponsFreeWeight))
	}
	if (isAirborne) {
		constraints.push(limitAirborneShoulderSpread)
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
	let source: "combat" | "damage" | "defeated" | "emote" | "movement" | null =
		null
	let expression:
		| "alarm"
		| "angry"
		| "defeated"
		| "focus"
		| "happy"
		| "hurt"
		| null = null
	if (baseAnimation === "death") {
		source = "defeated"
		expression = "defeated"
	} else if (baseAnimation !== "reload" && overlays.includes("flinch")) {
		source = "damage"
		expression = "hurt"
	} else if (baseAnimation !== "reload" && overlays.includes("wave")) {
		source = "emote"
		expression = "happy"
	} else if (
		baseAnimation !== "reload" &&
		(overlays.includes("recoil") || overlays.includes("weapons-free"))
	) {
		source = "combat"
		expression = "focus"
	} else if (baseAnimation === "double-jump") {
		source = "movement"
		expression = "alarm"
	} else if (
		getSlideDirection(baseAnimation) !== null ||
		baseAnimation === "crouch" ||
		getCrouchRunDirection(baseAnimation) !== null
	) {
		source = "movement"
		expression = "angry"
	}
	for (const candidate of [
		"combat",
		"damage",
		"defeated",
		"emote",
		"movement",
	] as const) {
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
	const gunId = isGunId(controls.gunId) ? controls.gunId : DEFAULT_GUN_ID
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
	const setGunId = (next: GunId): void => {
		timelineRef.current = 0
		setSelectedTime(0)
		setControl("gunId", next)
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
	const duration = getPreviewDuration(baseAnimation, bunnyhopping, gunId)
	const keyframeMarkers = getAnimationMarkers(
		baseAnimation,
		bunnyhopping,
		gunId,
	)
	const sampleTimes = getSampleTimes(duration, sampleInterval)
	const poseSample = samplePreviewAirborneMotion(
		baseAnimation,
		bunnyhopping,
		Math.min(selectedTime, duration),
	)
	const lifecyclePoseStats = getLifecyclePoseStats(
		baseAnimation,
		Math.min(selectedTime, duration),
		gunId,
	)
	const poseStats = lifecyclePoseStats ?? getPoseStats(poseSample)
	const poseDiagnosticsActive =
		poseSample !== null || lifecyclePoseStats !== null
	const poseDiagnosticsLabel =
		lifecyclePoseStats === null
			? poseSample === null
				? "NO AIRBORNE SAMPLE"
				: "AIRBORNE LIVE"
			: `${baseAnimation.toUpperCase()} PHASE`
	const stackLabels = [
		...(bunnyhopping ? ["AUTO BUNNYHOP"] : []),
		...overlays
			.filter((overlay) => supportsOverlay(baseAnimation, overlay))
			.map((overlay) => overlay.toUpperCase()),
	]

	const selectBaseAnimation = (nextAnimation: BaseAnimation): void => {
		timelineRef.current = 0
		setSelectedTime(0)
		setIsPlaying(true)
		if (!supportsBunnyhop(nextAnimation)) setBunnyhopping(false)
		setOverlays((current) =>
			current.filter((overlay) => supportsOverlay(nextAnimation, overlay)),
		)
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
		if (!supportsOverlay(baseAnimation, overlay)) return
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

		const initialGunId = isGunId(controlsRef.current.gunId)
			? controlsRef.current.gunId
			: DEFAULT_GUN_ID
		const rig = createPilotModel(undefined, initialGunId)
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

		const updateAlignmentSweep = (): void => {
			let sweepSamples = 0
			let maxSweepMiss = 0
			let sweepPassed = true
			for (const marker of RUN_KEYFRAME_MARKERS) {
				for (let pitch = -45; pitch <= 40; pitch += 5) {
					for (let yaw = -50; yaw <= 50; yaw += 5) {
						applyPreviewPose(
							rig,
							"forward",
							["weapons-free"],
							marker.progress,
							{
								pitch: THREE.MathUtils.degToRad(pitch),
								yaw: THREE.MathUtils.degToRad(yaw),
							},
						)
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
		}
		updateAlignmentSweep()

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
			const nextGunId = isGunId(controls.gunId)
				? controls.gunId
				: DEFAULT_GUN_ID
			if (setPilotGun(rig, nextGunId)) updateAlignmentSweep()
			const activeDuration = getPreviewDuration(
				controls.baseAnimation,
				controls.bunnyhopping,
				nextGunId,
			)
			if (controls.isPlaying) {
				timelineRef.current =
					(timelineRef.current + elapsed * controls.speed) % activeDuration
				if (now - lastTimelineUpdate >= 75) {
					lastTimelineUpdate = now
					setSelectedTime(Math.round(timelineRef.current * 1_000) / 1_000)
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
				nextGunId,
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
			disposePilotModel(rig)
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

		const initialGunId = isGunId(controlsRef.current.gunId)
			? controlsRef.current.gunId
			: DEFAULT_GUN_ID
		const rig = createPilotModel(undefined, initialGunId)
		scene.add(rig.root)
		const grid = new THREE.GridHelper(8, 16, "#377f76", "#20343c")
		grid.position.y = -0.14
		scene.add(grid)

		let frame = 0
		let previousSignature = ""
		const renderFilmstrip = (): void => {
			frame = requestAnimationFrame(renderFilmstrip)
			const controls = controlsRef.current
			const nextGunId = isGunId(controls.gunId)
				? controls.gunId
				: DEFAULT_GUN_ID
			setPilotGun(rig, nextGunId)
			const signature =
				`${nextGunId}:${controls.baseAnimation}:${controls.bunnyhopping}:` +
				`${controls.overlays.join(",")}:` +
				`${controls.sampleInterval}:${controls.yaw.toFixed(4)}:` +
				`${controls.targetPitch.toFixed(4)}:${controls.targetYaw.toFixed(4)}`
			if (signature === previousSignature) return
			previousSignature = signature
			const activeDuration = getPreviewDuration(
				controls.baseAnimation,
				controls.bunnyhopping,
				nextGunId,
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
					nextGunId,
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
			disposePilotModel(rig)
			renderer.dispose()
		}
	}, [])

	return (
		<pilot-visualizer className={css.class} data-gun={gunId}>
			<canvas
				ref={canvasRef}
				data-gun={gunId}
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
				<span>
					{gunDefinition(gunId).name} / DRAG TO ROTATE / SCRUB TO FREEZE
				</span>
			</model-header>
			<animation-stack>
				<fieldset>
					<legend>GUN // EQUIPPED</legend>
					{GUN_IDS.map((candidate) => (
						<button
							key={candidate}
							type="button"
							aria-label={`Equip ${gunDefinition(candidate).name}`}
							aria-pressed={gunId === candidate}
							data-active={gunId === candidate}
							onClick={() => {
								setGunId(candidate)
							}}
						>
							{gunDefinition(candidate).name}
						</button>
					))}
				</fieldset>
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
							aria-pressed={
								overlays.includes(overlay) &&
								supportsOverlay(baseAnimation, overlay)
							}
							data-active={
								overlays.includes(overlay) &&
								supportsOverlay(baseAnimation, overlay)
							}
							disabled={!supportsOverlay(baseAnimation, overlay)}
							onClick={() => {
								toggleOverlay(overlay)
							}}
						>
							{overlays.includes(overlay) &&
							supportsOverlay(baseAnimation, overlay)
								? "+ "
								: "  "}
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
			<pose-diagnostics data-active={poseDiagnosticsActive}>
				<pose-diagnostics-header>
					<strong>POSE INPUTS</strong>
					<span>{poseDiagnosticsLabel}</span>
				</pose-diagnostics-header>
				<section>
					{poseStats.map((stat) => (
						<PoseStatBar key={stat.label} stat={stat} />
					))}
				</section>
			</pose-diagnostics>
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
							data-gun={gunId}
							aria-label={`${gunDefinition(gunId).name} ${baseAnimation} animation${bunnyhopping ? " with automatic bunnyhopping" : ""} and ${overlays.length} overlays sampled every ${sampleInterval.toFixed(2)} seconds`}
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
