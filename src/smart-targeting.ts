import type { MiniMissileTargetRef, Vector3Tuple } from "./arena-protocol.ts"
import { pilotTorsoTargetFromRoot } from "./pilot-targeting.ts"

export type SmartTargetRef = MiniMissileTargetRef

export type SmartTargetCandidate = {
	position: Vector3Tuple
	ref: SmartTargetRef
}

export type ProjectedSmartTarget = {
	distance: number
	x: number
	y: number
}

export type SmartTargetLeadState = Readonly<{
	velocityX: number
	velocityY: number
	x: number
	y: number
}>

export const INITIAL_SMART_TARGET_LEAD: SmartTargetLeadState = {
	velocityX: 0,
	velocityY: 0,
	x: 0,
	y: 0,
}

export type SmartTargetLeadTuning = Readonly<{
	damping: number
	deadZone: number
	drive: number
	maxOffset: number
	maxStepSeconds: number
	spring: number
}>

function drivenAngularVelocity(value: number, deadZone: number): number {
	const magnitude = Math.abs(value)
	return magnitude <= deadZone ? 0 : Math.sign(value) * (magnitude - deadZone)
}

/**
 * Drives a screen-space mass with camera angular velocity while a damped
 * spring pulls it back to the true target. Small integration steps keep the
 * same rubberband response across render frame rates.
 */
export function stepSmartTargetLead(
	state: SmartTargetLeadState,
	angularVelocity: Readonly<{ x: number; y: number }>,
	deltaSeconds: number,
	tuning: SmartTargetLeadTuning,
	active = true,
): SmartTargetLeadState {
	const delta = Math.max(0, deltaSeconds)
	if (delta === 0) return state
	const maximumStep = Math.max(1 / 1_000, tuning.maxStepSeconds)
	const stepCount = Math.max(1, Math.ceil(delta / maximumStep))
	const step = delta / stepCount
	const inputX = active
		? drivenAngularVelocity(angularVelocity.x, tuning.deadZone)
		: 0
	const inputY = active
		? drivenAngularVelocity(angularVelocity.y, tuning.deadZone)
		: 0
	let { velocityX, velocityY, x, y } = state
	for (let index = 0; index < stepCount; index += 1) {
		velocityX +=
			(inputX * tuning.drive - x * tuning.spring - velocityX * tuning.damping) *
			step
		velocityY +=
			(inputY * tuning.drive - y * tuning.spring - velocityY * tuning.damping) *
			step
		x += velocityX * step
		y += velocityY * step
		const clampedX = Math.max(-tuning.maxOffset, Math.min(tuning.maxOffset, x))
		const clampedY = Math.max(-tuning.maxOffset, Math.min(tuning.maxOffset, y))
		if (clampedX !== x && Math.sign(velocityX) === Math.sign(x)) velocityX = 0
		if (clampedY !== y && Math.sign(velocityY) === Math.sign(y)) velocityY = 0
		x = clampedX
		y = clampedY
	}
	return { velocityX, velocityY, x, y }
}

export function pilotSmartTargetCandidate(
	localPlayerId: string | undefined,
	pilotId: string,
	position: Vector3Tuple,
): SmartTargetCandidate | null {
	if (localPlayerId === pilotId) return null
	return { position, ref: { id: pilotId, kind: "pilot" } }
}

export function pilotSmartTargetCandidateFromRoot(
	localPlayerId: string | undefined,
	pilotId: string,
	rootPosition: Vector3Tuple,
	crouching: boolean,
): SmartTargetCandidate | null {
	return pilotSmartTargetCandidate(
		localPlayerId,
		pilotId,
		pilotTorsoTargetFromRoot(rootPosition, crouching),
	)
}

export function sameSmartTarget(
	left: SmartTargetRef | null,
	right: SmartTargetRef | null,
): boolean {
	return left?.kind === right?.kind && left?.id === right?.id
}

export function selectBestSmartTarget(
	candidates: readonly SmartTargetCandidate[],
	project: (candidate: SmartTargetCandidate) => ProjectedSmartTarget | null,
): (ProjectedSmartTarget & { ref: SmartTargetRef }) | null {
	let best: (ProjectedSmartTarget & { ref: SmartTargetRef }) | null = null
	for (const candidate of candidates) {
		const projected = project(candidate)
		if (projected === null) continue
		if (best === null || projected.distance < best.distance) {
			best = { ...projected, ref: candidate.ref }
		}
	}
	return best
}
