import type { ArenaLedge } from "./ArenaWorld.ts"
import { JUMP_PHYSICS } from "./JumpPhysics.ts"

export const MANTLE_MAXIMUM_RISE =
	(JUMP_PHYSICS.jumpVelocity * JUMP_PHYSICS.jumpVelocity) /
	(4 * JUMP_PHYSICS.gravity)
export const MANTLE_DURATION_SECONDS = 0.26

export type MantleState =
	| Readonly<{ mode: "none" }>
	| Readonly<{
			elapsed: number
			mode: "mantle"
			start: readonly [number, number, number]
			surfaceId: string
			target: readonly [number, number, number]
	  }>

export const INITIAL_MANTLE_STATE: MantleState = { mode: "none" }

export type MantleStep = Readonly<{
	completed: boolean
	handled: boolean
	position: readonly [number, number, number] | null
	progress: number
	started: boolean
	state: MantleState
	velocity: readonly [number, number, number]
}>

function smoothstep(progress: number): number {
	return progress * progress * (3 - 2 * progress)
}

export function stepMantleTraversal(
	state: MantleState,
	options: Readonly<{
		blocked: boolean
		candidate: ArenaLedge | null
		delta: number
		position: readonly [number, number, number]
	}>,
): MantleStep {
	if (options.blocked) {
		return {
			completed: false,
			handled: state.mode === "mantle",
			position: null,
			progress: 0,
			started: false,
			state: INITIAL_MANTLE_STATE,
			velocity: [0, 0, 0],
		}
	}
	const started = state.mode === "none" && options.candidate !== null
	const active: MantleState = started
		? {
				elapsed: 0,
				mode: "mantle",
				start: options.position,
				surfaceId: options.candidate!.surfaceId,
				target: options.candidate!.target,
			}
		: state
	if (active.mode === "none") {
		return {
			completed: false,
			handled: false,
			position: null,
			progress: 0,
			started: false,
			state: active,
			velocity: [0, 0, 0],
		}
	}
	const elapsed = Math.min(
		MANTLE_DURATION_SECONDS,
		active.elapsed + Math.max(0, options.delta),
	)
	const progress = elapsed / MANTLE_DURATION_SECONDS
	const amount = smoothstep(progress)
	const position = active.start.map(
		(value, index) => value + (active.target[index]! - value) * amount,
	) as [number, number, number]
	const derivative = (6 * progress * (1 - progress)) / MANTLE_DURATION_SECONDS
	const velocity = active.start.map(
		(value, index) => (active.target[index]! - value) * derivative,
	) as [number, number, number]
	const completed = progress >= 1
	return {
		completed,
		handled: true,
		position,
		progress,
		started,
		state: completed ? INITIAL_MANTLE_STATE : { ...active, elapsed },
		velocity: completed ? [0, 0, 0] : velocity,
	}
}
