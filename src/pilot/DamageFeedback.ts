import * as THREE from "three"

import type { PlayerDamageSnapshot, Vector3Tuple } from "../arena-protocol.ts"
import type {
	PilotAnimationLayer,
	PilotPose,
	PoseInfluence,
} from "./PilotAnimation.ts"

export const DAMAGE_FLINCH_IMPULSE = 0.68
export const DAMAGE_FLINCH_MAX_IMPULSE = 1.4
export const DAMAGE_FLINCH_KICK_SECONDS = 0.035
export const DAMAGE_FLINCH_RECOVERY_SECONDS = 0.18
export const DAMAGE_FEEDBACK_MAX_EVENT_AGE_SECONDS = 0.6
export const DAMAGE_EFFECT_LIFETIME_SECONDS = 0.52
export const DAMAGE_EFFECT_MAX_ACTIVE = 5
export const DAMAGE_ELECTRIC_PARTICLE_COUNT = 12
export const DAMAGE_SPLATTER_PARTICLE_COUNT = 9
export const DAMAGE_PREVIEW_CYCLE_SECONDS = 0.9
export const DAMAGE_PREVIEW_HITS = [0, 0.22] as const

export type DamageFlinchState = {
	intensity: number
	recoveryDelay: number
}

export type DamageFeedbackTracker = {
	sequence: number
	state: DamageFlinchState
}

export type ObservedDamageFeedback = {
	accepted: boolean
	direction: Vector3Tuple
	position: Vector3Tuple
	tracker: DamageFeedbackTracker
}

export type DamageParticleSeed = {
	lifetime: number
	offset: Vector3Tuple
	size: number
	velocity: Vector3Tuple
}

export type DamageParticlePlan = {
	electric: readonly DamageParticleSeed[]
	splatter: readonly DamageParticleSeed[]
}

export type DamageEffectHandle = {
	dispose: () => void
	update: (deltaSeconds: number) => boolean
}

const FLINCH_INFLUENCE = {
	body: 1,
	head: 0.7,
	hips: 0.55,
	leftShoulder: 0.48,
	neck: 0.8,
	rightShoulder: 0.48,
} as const satisfies PoseInfluence

const ZERO_VECTOR: Vector3Tuple = [0, 0, 0]

export function initialDamageFlinchState(): DamageFlinchState {
	return { intensity: 0, recoveryDelay: 0 }
}

export function initialDamageFeedbackTracker(
	sequence = 0,
): DamageFeedbackTracker {
	return {
		sequence: Number.isSafeInteger(sequence) ? sequence : 0,
		state: initialDamageFlinchState(),
	}
}

export function addDamageFlinch(
	state: DamageFlinchState,
	hitCount = 1,
): DamageFlinchState {
	if (hitCount <= 0) return state
	return {
		intensity: Math.min(
			DAMAGE_FLINCH_MAX_IMPULSE,
			state.intensity + DAMAGE_FLINCH_IMPULSE * hitCount,
		),
		recoveryDelay: DAMAGE_FLINCH_KICK_SECONDS,
	}
}

export function stepDamageFlinch(
	state: DamageFlinchState,
	deltaSeconds: number,
): DamageFlinchState {
	const elapsed = Math.max(0, deltaSeconds)
	if (elapsed === 0 || state.intensity === 0) return state
	if (state.recoveryDelay >= elapsed) {
		return { ...state, recoveryDelay: state.recoveryDelay - elapsed }
	}
	return {
		intensity: Math.max(
			0,
			state.intensity -
				(elapsed - state.recoveryDelay) / DAMAGE_FLINCH_RECOVERY_SECONDS,
		),
		recoveryDelay: 0,
	}
}

function validVector(value: unknown): value is Vector3Tuple {
	return (
		Array.isArray(value) &&
		value.length === 3 &&
		value.every((component) => Number.isFinite(component))
	)
}

export function observeDamageFeedback(
	tracker: DamageFeedbackTracker,
	event: PlayerDamageSnapshot,
	observedAt: number,
): ObservedDamageFeedback {
	const rejected = {
		accepted: false,
		direction: ZERO_VECTOR,
		position: ZERO_VECTOR,
		tracker,
	} as const
	if (
		!Number.isSafeInteger(event.sequence) ||
		!Number.isFinite(event.serverTime) ||
		!Number.isFinite(event.damage) ||
		event.damage <= 0 ||
		(event.source !== "grenade" &&
			event.source !== "kamikaze" &&
			event.source !== "projectile") ||
		!validVector(event.direction) ||
		!validVector(event.position)
	) {
		return rejected
	}
	if (event.sequence <= tracker.sequence) return rejected

	const eventAge = Math.max(0, observedAt - event.serverTime)
	if (eventAge >= DAMAGE_FEEDBACK_MAX_EVENT_AGE_SECONDS) {
		return {
			...rejected,
			tracker: initialDamageFeedbackTracker(event.sequence),
		}
	}
	const hitCount = Math.min(3, event.sequence - tracker.sequence)
	return {
		accepted: true,
		direction: event.direction,
		position: event.position,
		tracker: {
			sequence: event.sequence,
			state: stepDamageFlinch(
				addDamageFlinch(tracker.state, hitCount),
				eventAge,
			),
		},
	}
}

export function sampleDamageFlinchIntensity(
	elapsedSeconds: number,
	hitTimes: readonly number[] = [0],
): number {
	let state = initialDamageFlinchState()
	let cursor = 0
	for (const hitTime of hitTimes) {
		if (hitTime > elapsedSeconds) break
		state = stepDamageFlinch(state, hitTime - cursor)
		state = addDamageFlinch(state)
		cursor = hitTime
	}
	return stepDamageFlinch(state, elapsedSeconds - cursor).intensity
}

export function sampleDamageFlinchPose(
	intensity: number,
	direction: Vector3Tuple,
): PilotPose {
	const amount = THREE.MathUtils.smoothstep(
		THREE.MathUtils.clamp(intensity, 0, 1),
		0,
		1,
	)
	const horizontal = new THREE.Vector2(direction[0], direction[2])
	if (horizontal.lengthSq() < Number.EPSILON) horizontal.set(0, -1)
	horizontal.normalize()
	const pitch = -horizontal.y * 0.075 * amount
	const roll = -horizontal.x * 0.1 * amount
	return {
		body: { rotation: { x: pitch, z: roll } },
		head: { rotation: { x: -pitch * 0.42, z: -roll * 0.5 } },
		hips: { rotation: { x: pitch * 0.28, z: roll * 0.34 } },
		leftShoulder: { rotation: { z: -roll * 0.22 } },
		neck: { rotation: { x: -pitch * 0.3, z: -roll * 0.38 } },
		rightShoulder: { rotation: { z: -roll * 0.22 } },
	}
}

export function damageFlinchAnimationLayer(
	intensity: number,
	direction: Vector3Tuple,
): PilotAnimationLayer {
	return {
		fadeSeconds: 0,
		id: "damage:flinch",
		influence: FLINCH_INFLUENCE,
		mode: "additive",
		pose: sampleDamageFlinchPose(intensity, direction),
	}
}

function seededRandom(seed: number): () => number {
	let value = seed >>> 0
	return () => {
		value += 0x6d2b_79f5
		let mixed = value
		mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1)
		mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
		return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296
	}
}

export function createDamageParticlePlan(
	sequence: number,
	direction: Vector3Tuple,
): DamageParticlePlan {
	const random = seededRandom(sequence * 2_654_435_761)
	const incoming = new THREE.Vector3(...direction)
	if (incoming.lengthSq() < Number.EPSILON) incoming.set(0, 0.2, -1)
	incoming.normalize()
	const makeParticle = (kind: "electric" | "splatter"): DamageParticleSeed => {
		const radial = new THREE.Vector3(
			random() * 2 - 1,
			random() * 1.4 - 0.35,
			random() * 2 - 1,
		)
		if (radial.lengthSq() < Number.EPSILON) radial.set(0, 1, 0)
		radial.normalize()
		const electric = kind === "electric"
		const speed = electric ? 2.4 + random() * 3.2 : 1.2 + random() * 2.2
		const velocity = radial
			.multiplyScalar(speed)
			.addScaledVector(incoming, electric ? 0.45 : 0.8)
		return {
			lifetime:
				DAMAGE_EFFECT_LIFETIME_SECONDS *
				(electric ? 0.45 + random() * 0.45 : 0.7 + random() * 0.3),
			offset: [
				(random() - 0.5) * 0.34,
				(random() - 0.5) * 0.42,
				(random() - 0.5) * 0.34,
			],
			size: electric ? 0.06 + random() * 0.08 : 0.11 + random() * 0.13,
			velocity: velocity.toArray(),
		}
	}
	return {
		electric: Array.from({ length: DAMAGE_ELECTRIC_PARTICLE_COUNT }, () =>
			makeParticle("electric"),
		),
		splatter: Array.from({ length: DAMAGE_SPLATTER_PARTICLE_COUNT }, () =>
			makeParticle("splatter"),
		),
	}
}

export class BoundedDamageEffects<Effect extends DamageEffectHandle> {
	readonly #effects: Effect[] = []
	readonly #maximum: number

	constructor(maximum = DAMAGE_EFFECT_MAX_ACTIVE) {
		this.#maximum = Math.max(1, Math.floor(maximum))
	}

	get size(): number {
		return this.#effects.length
	}

	add(effect: Effect): void {
		while (this.#effects.length >= this.#maximum) {
			this.#effects.shift()?.dispose()
		}
		this.#effects.push(effect)
	}

	update(deltaSeconds: number): void {
		for (let index = this.#effects.length - 1; index >= 0; index -= 1) {
			const effect = this.#effects[index]
			if (effect === undefined || effect.update(deltaSeconds)) continue
			effect.dispose()
			this.#effects.splice(index, 1)
		}
	}

	remove(predicate: (effect: Effect) => boolean): void {
		for (let index = this.#effects.length - 1; index >= 0; index -= 1) {
			const effect = this.#effects[index]
			if (effect === undefined || !predicate(effect)) continue
			effect.dispose()
			this.#effects.splice(index, 1)
		}
	}

	clear(): void {
		for (const effect of this.#effects) effect.dispose()
		this.#effects.length = 0
	}
}
