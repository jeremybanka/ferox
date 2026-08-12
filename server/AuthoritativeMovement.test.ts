import { describe, expect, test } from "vitest"

import type { ArenaSurfaceContact } from "../src/ArenaWorld.ts"
import { SLIDE_PHYSICS } from "../src/SlidePhysics.ts"
import {
	INITIAL_WALL_TRAVERSAL_STATE,
	stepWallTraversal,
	WALL_TRAVERSAL_MAXIMUM_PLANAR_SPEED,
	type WallTraversalState,
} from "../src/WallTraversal.ts"
import {
	AUTHORITATIVE_TRAVERSAL_TRAVEL_TOLERANCE,
	consumeAuthoritativeJumpSignal,
	limitAuthoritativeTraversalDestination,
	reconcileAuthoritativeMovement,
} from "./AuthoritativeMovement.ts"

const wallContact: ArenaSurfaceContact = {
	inclinationRadians: Math.PI / 2,
	normal: [1, 0, 0],
	point: [0, 3, 0],
	surfaceId: "wall-a",
	time: 1,
}

describe("authoritative wall movement", () => {
	test("does not reset jump availability for a forged wall mode away from geometry", () => {
		const state = reconcileAuthoritativeMovement({
			contact: null,
			crouching: false,
			delta: 1 / 60,
			grounded: false,
			jump: 2,
			previousWallTraversal: INITIAL_WALL_TRAVERSAL_STATE,
			reportedWallTraversal: { mode: "run", normal: [1, 0, 0] },
			sliding: false,
			velocity: [0, -2, 9],
			viewDirection: [0, 0, 1],
		})

		expect(state.jump).toBe(2)
		expect(state.wallTraversal).toEqual({ mode: "none", normal: [0, 0, 0] })
	})

	test("derives steep terrain presentation instead of trusting slide flags", () => {
		const state = reconcileAuthoritativeMovement({
			contact: null,
			crouching: false,
			delta: 1 / 60,
			grounded: true,
			jump: 0,
			previousWallTraversal: INITIAL_WALL_TRAVERSAL_STATE,
			reportedWallTraversal: { mode: "none", normal: [0, 0, 0] },
			sliding: true,
			terrainGradient: { x: Math.tan((60.1 * Math.PI) / 180), z: 0 },
			velocity: [0, 0, 0],
			viewDirection: [0, 0, 1],
		})

		expect(state.surfaceSliding).toBe(true)
		expect(state.sliding).toBe(false)
		expect(state.wallTraversal.mode).toBe("slide")
	})

	test("rejects a forged first-jump impulse after coyote time expires", () => {
		const state = reconcileAuthoritativeMovement({
			contact: null,
			crouching: false,
			delta: 1 / 60,
			grounded: false,
			jump: 1,
			jumpImpulse: 1,
			previousCoyoteRemaining: null,
			previousGrounded: false,
			previousJump: 1,
			previousVelocity: [0, -2, 0],
			previousWallTraversal: INITIAL_WALL_TRAVERSAL_STATE,
			reportedWallTraversal: { mode: "none", normal: [0, 0, 0] },
			sliding: false,
			velocity: [0, 10, 0],
			viewDirection: [0, 0, 1],
		})

		expect(state.jump).toBe(1)
		expect(state.coyoteRemaining).toBeNull()
		expect(state.velocity[1]).toBeCloseTo(-2 - 23 / 60)
	})

	test("opens and advances coyote only for ordinary unsupported departure", () => {
		const departed = reconcileAuthoritativeMovement({
			contact: null,
			crouching: false,
			delta: 0.05,
			grounded: false,
			jump: 1,
			previousGrounded: true,
			previousJump: 0,
			previousSliding: false,
			previousSurfaceSliding: false,
			previousVelocity: [5, 0, 0],
			previousWallTraversal: INITIAL_WALL_TRAVERSAL_STATE,
			reportedWallTraversal: { mode: "none", normal: [0, 0, 0] },
			sliding: false,
			velocity: [5, 1_000, 0],
			viewDirection: [0, 0, 1],
		})
		const nextPacket = reconcileAuthoritativeMovement({
			contact: null,
			crouching: false,
			delta: 0.04,
			grounded: false,
			jump: 1,
			previousCoyoteRemaining: departed.coyoteRemaining,
			previousGrounded: false,
			previousJump: departed.jump,
			previousSliding: false,
			previousSurfaceSliding: false,
			previousVelocity: departed.velocity,
			previousWallTraversal: departed.traversalState,
			reportedWallTraversal: departed.wallTraversal,
			sliding: false,
			velocity: [5, -2, 0],
			viewDirection: [0, 0, 1],
		})

		expect(departed.coyoteRemaining).toBe(0.1)
		expect(nextPacket.coyoteRemaining).toBeCloseTo(0.06)
	})

	test.each([
		{
			label: "regular slide crest",
			previousSliding: true,
			previousSurfaceSliding: false,
			previousWallTraversal: INITIAL_WALL_TRAVERSAL_STATE,
		},
		{
			label: "automatic steep-surface release",
			previousSliding: false,
			previousSurfaceSliding: true,
			previousWallTraversal: INITIAL_WALL_TRAVERSAL_STATE,
		},
		{
			label: "wall release",
			previousSliding: false,
			previousSurfaceSliding: false,
			previousWallTraversal: {
				...INITIAL_WALL_TRAVERSAL_STATE,
				mode: "slide" as const,
				surfaceId: "wall-a",
			},
		},
	])("does not open coyote after $label", (cause) => {
		const state = reconcileAuthoritativeMovement({
			contact: null,
			crouching: false,
			delta: 0.05,
			grounded: false,
			jump: 1,
			previousGrounded: true,
			previousSliding: cause.previousSliding,
			previousSurfaceSliding: cause.previousSurfaceSliding,
			previousWallTraversal: cause.previousWallTraversal,
			reportedWallTraversal: { mode: "none", normal: [0, 0, 0] },
			sliding: false,
			velocity: [5, -1, 0],
			viewDirection: [0, 0, 1],
		})

		expect(state.coyoteRemaining).toBeNull()
	})

	test("accepts the inclusive coyote boundary but rejects the next packet", () => {
		const atBoundary = reconcileAuthoritativeMovement({
			contact: null,
			coyoteDelta: 0.05,
			crouching: false,
			delta: 0.05,
			grounded: false,
			jump: 1,
			jumpImpulse: 1,
			previousCoyoteRemaining: 0.05,
			previousGrounded: false,
			previousJump: 1,
			previousVelocity: [5, -1, 0],
			previousWallTraversal: INITIAL_WALL_TRAVERSAL_STATE,
			reportedWallTraversal: { mode: "none", normal: [0, 0, 0] },
			resolvedPosition: [0.25, 5.4725, 0],
			sliding: false,
			velocity: [5, 9.45, 0],
			viewDirection: [0, 0, 1],
		})
		const expired = reconcileAuthoritativeMovement({
			contact: null,
			coyoteDelta: 0.050_001,
			crouching: false,
			delta: 0.05,
			grounded: false,
			jump: 1,
			jumpImpulse: 1,
			previousCoyoteRemaining: 0.05,
			previousGrounded: false,
			previousJump: 1,
			previousVelocity: [5, -1, 0],
			previousWallTraversal: INITIAL_WALL_TRAVERSAL_STATE,
			reportedWallTraversal: { mode: "none", normal: [0, 0, 0] },
			sliding: false,
			velocity: [5, 8, 0],
			viewDirection: [0, 0, 1],
		})

		expect(atBoundary.jump).toBe(1)
		expect(atBoundary.coyoteRemaining).toBeNull()
		expect(atBoundary.resolvedPosition).toEqual([0.25, 5.4725, 0])
		expect(atBoundary.velocity[1]).toBeCloseTo(9.45)
		expect(expired.jump).toBe(1)
		expect(expired.coyoteRemaining).toBeNull()
		expect(expired.velocity[1]).toBeCloseTo(-1 - 23 * 0.05)
	})

	test("expires coyote across an arbitrarily long legal-sequence packet gap", () => {
		const jumpSignal = consumeAuthoritativeJumpSignal(7, {
			direction: null,
			impulse: 1,
			sequence: 8,
		})
		const state = reconcileAuthoritativeMovement({
			contact: null,
			coyoteDelta: 60,
			crouching: false,
			delta: 0.1,
			grounded: false,
			jump: 1,
			jumpImpulse: jumpSignal.impulse,
			previousCoyoteRemaining: 0.1,
			previousGrounded: false,
			previousJump: 1,
			previousVelocity: [0, -1, 0],
			previousWallTraversal: INITIAL_WALL_TRAVERSAL_STATE,
			reportedWallTraversal: { mode: "none", normal: [0, 0, 0] },
			sliding: false,
			velocity: [0, 1_000, 0],
			viewDirection: [0, 0, 1],
		})

		expect(jumpSignal).toEqual({ direction: null, impulse: 1, sequence: 8 })
		expect(state.coyoteRemaining).toBeNull()
		expect(state.jump).toBe(1)
		expect(state.velocity[1]).toBeCloseTo(-1 - 23 * 0.1)
	})

	test("owns a validated mantle path and suppresses simultaneous wall state", () => {
		const state = reconcileAuthoritativeMovement({
			contact: wallContact,
			crouching: false,
			delta: 0.1,
			grounded: false,
			jump: 1,
			mantleCandidate: {
				rise: 1,
				surfaceId: wallContact.surfaceId,
				target: [0, 4, 0],
			},
			position: [1, 3, 0],
			previousWallTraversal: INITIAL_WALL_TRAVERSAL_STATE,
			reportedWallTraversal: { mode: "run", normal: [1, 0, 0] },
			sliding: true,
			velocity: [-1, 0, 0],
			viewDirection: [-1, 0, 0],
		})

		expect(state.mantle.active).toBe(true)
		expect(state.mantle.surfaceId).toBe(wallContact.surfaceId)
		expect(state.mantlePosition).not.toEqual([1, 3, 0])
		expect(state.velocity).not.toEqual([-1, 0, 0])
		expect(state.sliding).toBe(false)
		expect(state.wallTraversal.mode).toBe("none")
	})

	test("ignores a forged slide and derives run from resolved contact and view", () => {
		const state = reconcileAuthoritativeMovement({
			contact: wallContact,
			crouching: false,
			delta: 1 / 60,
			grounded: false,
			jump: 2,
			previousWallTraversal: INITIAL_WALL_TRAVERSAL_STATE,
			reportedWallTraversal: { mode: "slide", normal: [-1, 0, 0] },
			sliding: true,
			velocity: [-1, -2, 9],
			viewDirection: [0, 0, 1],
		})

		expect(state.jump).toBe(1)
		expect(state.sliding).toBe(false)
		expect(state.wallTraversal).toEqual({ mode: "run", normal: [1, 0, 0] })
	})

	test("normalizes a forged run to slide when replicated yaw faces the wall", () => {
		const state = reconcileAuthoritativeMovement({
			contact: wallContact,
			crouching: false,
			delta: 1 / 60,
			grounded: false,
			jump: 2,
			previousWallTraversal: INITIAL_WALL_TRAVERSAL_STATE,
			reportedWallTraversal: { mode: "run", normal: [-1, 0, 0] },
			sliding: false,
			velocity: [0, -2, 9],
			viewDirection: [-1, 0, 0],
		})

		expect(state.jump).toBe(1)
		expect(state.wallTraversal).toEqual({ mode: "slide", normal: [1, 0, 0] })
	})

	test("replaces forged wall-slide velocity with the bounded resolved value", () => {
		const state = reconcileAuthoritativeMovement({
			contact: wallContact,
			crouching: false,
			delta: 1 / 60,
			grounded: false,
			jump: 2,
			previousJump: 2,
			previousVelocity: [0, -2, 10],
			previousWallTraversal: INITIAL_WALL_TRAVERSAL_STATE,
			reportedWallTraversal: { mode: "slide", normal: [1, 0, 0] },
			sliding: false,
			velocity: [-80, -500, 1_000_000],
			viewDirection: [-1, 0, 0],
		})

		expect(state.wallTraversal.mode).toBe("slide")
		expect(state.velocity[0]).toBe(0)
		expect(state.velocity[1]).toBe(-2)
		expect(state.velocity[2]).toBeCloseTo(7.8)
	})

	test("bounds forged wall-run tangent speed from prior server velocity", () => {
		const state = reconcileAuthoritativeMovement({
			contact: wallContact,
			crouching: false,
			delta: 0.05,
			grounded: false,
			jump: 2,
			previousGrounded: false,
			previousJump: 2,
			previousVelocity: [0, -1, 10],
			previousWallTraversal: INITIAL_WALL_TRAVERSAL_STATE,
			reportedWallTraversal: { mode: "run", normal: [1, 0, 0] },
			sliding: false,
			velocity: [0, 1_000, 1_000_000],
			viewDirection: [0, 0, 1],
		})

		expect(state.wallTraversal.mode).toBe("run")
		expect(
			Math.hypot(state.velocity[0], state.velocity[2]),
		).toBeLessThanOrEqual(WALL_TRAVERSAL_MAXIMUM_PLANAR_SPEED)
		expect(state.velocity).toEqual([0, -1, 10])
	})

	test("crouching selects authoritative regular slide during wall contact", () => {
		const state = reconcileAuthoritativeMovement({
			contact: wallContact,
			crouching: true,
			delta: 1 / 60,
			grounded: false,
			jump: 2,
			previousWallTraversal: {
				...INITIAL_WALL_TRAVERSAL_STATE,
				mode: "run",
				surfaceId: wallContact.surfaceId,
			},
			reportedWallTraversal: { mode: "run", normal: [1, 0, 0] },
			sliding: false,
			velocity: [0, -2, 9],
			viewDirection: [0, 0, 1],
		})

		expect(state.jump).toBe(2)
		expect(state.sliding).toBe(true)
		expect(state.traversalState.mode).toBe("crouch-slide")
		expect(state.wallTraversal.mode).toBe("none")
	})

	test("authoritative crouch slide caps forged speed without refilling jump", () => {
		const contact = { ...wallContact, surfaceNormal: [1, 0, 0] as const }
		const acquired = reconcileAuthoritativeMovement({
			contact,
			crouching: true,
			delta: 1 / 60,
			grounded: false,
			jump: 2,
			previousWallTraversal: INITIAL_WALL_TRAVERSAL_STATE,
			reportedWallTraversal: { mode: "none", normal: [0, 0, 0] },
			sliding: false,
			velocity: [-500, -500, 500],
			viewDirection: [0, 0, 1],
		})
		const sustained = reconcileAuthoritativeMovement({
			contact,
			crouching: true,
			delta: 1 / 60,
			grounded: false,
			jump: 2,
			previousJump: acquired.jump,
			previousVelocity: acquired.velocity,
			previousWallTraversal: acquired.traversalState,
			reportedWallTraversal: acquired.wallTraversal,
			sliding: true,
			velocity: acquired.velocity,
			viewDirection: [0, 0, 1],
		})

		expect(Math.hypot(...acquired.velocity)).toBeCloseTo(
			SLIDE_PHYSICS.maximumSpeed,
		)
		expect(acquired.jump).toBe(1)
		expect(sustained.jump).toBe(1)
		expect(sustained.sliding).toBe(true)
	})

	test("matches three client crouch-slide frames with one 50ms server step", () => {
		const priorTraversal = {
			...INITIAL_WALL_TRAVERSAL_STATE,
			mode: "run" as const,
			normal: wallContact.normal,
			surfaceId: wallContact.surfaceId,
		}
		const startVelocity = [0, 0, 10] as const
		let clientTraversal: WallTraversalState = priorTraversal
		let clientVelocity: readonly [number, number, number] = startVelocity
		for (let frame = 0; frame < 3; frame += 1) {
			const step = stepWallTraversal(clientTraversal, {
				blocked: false,
				contact: wallContact,
				crouching: true,
				delta: 1 / 60,
				grounded: false,
				jumpRequested: false,
				velocity: clientVelocity,
				viewDirection: [0, 0, 1],
			})
			clientTraversal = step.state
			clientVelocity = step.velocity
		}

		const server = reconcileAuthoritativeMovement({
			contact: wallContact,
			crouching: true,
			delta: 0.05,
			grounded: false,
			jump: 1,
			previousGrounded: false,
			previousJump: 1,
			previousVelocity: startVelocity,
			previousWallTraversal: priorTraversal,
			reportedWallTraversal: { mode: "none", normal: [0, 0, 0] },
			sliding: true,
			velocity: clientVelocity,
			viewDirection: [0, 0, 1],
		})

		for (const index of [0, 1, 2] as const)
			expect(server.velocity[index]).toBeCloseTo(clientVelocity[index], 10)
	})
})

describe("authoritative movement packet envelopes", () => {
	test("consumes a jump sequence once and discards gaps and replays", () => {
		expect(
			consumeAuthoritativeJumpSignal(5, {
				direction: [1, 0],
				impulse: 2,
				sequence: 5,
			}),
		).toEqual({ direction: null, impulse: null, sequence: 5 })
		expect(
			consumeAuthoritativeJumpSignal(5, {
				direction: null,
				impulse: 1,
				sequence: 4,
			}),
		).toEqual({ direction: null, impulse: null, sequence: 5 })
		expect(
			consumeAuthoritativeJumpSignal(5, {
				direction: [0, -1],
				impulse: 2,
				sequence: 6,
			}),
		).toEqual({ direction: [0, -1], impulse: 2, sequence: 6 })
		expect(
			consumeAuthoritativeJumpSignal(6, {
				direction: null,
				impulse: 1,
				sequence: 9,
			}),
		).toEqual({ direction: null, impulse: null, sequence: 9 })
	})

	test("bounds active traversal travel by server elapsed time", () => {
		const destination = limitAuthoritativeTraversalDestination(
			[0, 2, 0],
			[1_000, 2, 0],
			10,
			0.05,
		)

		expect(destination).toEqual([
			0.5 + AUTHORITATIVE_TRAVERSAL_TRAVEL_TOLERANCE,
			2,
			0,
		])
	})

	test("never trusts replicated jump count or vertical velocity in air", () => {
		const first = reconcileAuthoritativeMovement({
			contact: null,
			crouching: false,
			delta: 0.05,
			grounded: false,
			jump: 0,
			jumpImpulse: null,
			previousGrounded: false,
			previousJump: 2,
			previousVelocity: [0, 3, 0],
			previousWallTraversal: INITIAL_WALL_TRAVERSAL_STATE,
			reportedWallTraversal: { mode: "none", normal: [0, 0, 0] },
			sliding: false,
			velocity: [0, 1_000, 0],
			viewDirection: [0, 0, 1],
		})
		const replay = reconcileAuthoritativeMovement({
			contact: null,
			crouching: false,
			delta: 0.05,
			grounded: false,
			jump: 1,
			jumpDirection: [1, 0],
			jumpImpulse: 2,
			previousGrounded: false,
			previousJump: first.jump,
			previousVelocity: first.velocity,
			previousWallTraversal: first.traversalState,
			reportedWallTraversal: { mode: "none", normal: [0, 0, 0] },
			sliding: false,
			velocity: [3.2, 1_000, 0],
			viewDirection: [0, 0, 1],
		})

		expect(first.jump).toBe(2)
		expect(first.velocity[1]).toBeCloseTo(3 - 23 * 0.05)
		expect(replay.jump).toBe(2)
		expect(replay.velocity[0]).toBe(0)
		expect(replay.velocity[1]).toBeCloseTo(3 - 23 * 0.1)
	})

	test("accepts bounded first and double-jump edges in sequence", () => {
		const first = reconcileAuthoritativeMovement({
			contact: null,
			crouching: false,
			delta: 0.05,
			grounded: true,
			jump: 1,
			jumpImpulse: 1,
			previousGrounded: true,
			previousJump: 0,
			previousVelocity: [0, 0, 0],
			previousWallTraversal: INITIAL_WALL_TRAVERSAL_STATE,
			reportedWallTraversal: { mode: "none", normal: [0, 0, 0] },
			sliding: false,
			velocity: [0, 1_000, 0],
			viewDirection: [0, 0, 1],
		})
		const second = reconcileAuthoritativeMovement({
			contact: null,
			crouching: false,
			delta: 0.05,
			grounded: false,
			jump: 2,
			jumpDirection: [0, -1],
			jumpImpulse: 2,
			previousGrounded: false,
			previousJump: first.jump,
			previousVelocity: first.velocity,
			previousWallTraversal: INITIAL_WALL_TRAVERSAL_STATE,
			reportedWallTraversal: { mode: "none", normal: [0, 0, 0] },
			sliding: false,
			velocity: [0, 1_000, -3.2],
			viewDirection: [0, 0, 1],
		})

		expect(first.jump).toBe(1)
		expect(first.velocity[1]).toBe(10.6)
		expect(second.jump).toBe(2)
		expect(second.velocity[1]).toBeCloseTo(8.25)
		expect(second.velocity[2]).toBe(-3.2)
	})

	test("matches the client's canonical directional double-jump impulse", () => {
		const direction = [0.6, 0.8] as const
		const state = reconcileAuthoritativeMovement({
			contact: null,
			crouching: false,
			delta: 0.05,
			grounded: false,
			jump: 2,
			jumpDirection: direction,
			jumpImpulse: 2,
			previousGrounded: false,
			previousJump: 1,
			previousVelocity: [4, -2, 2],
			previousWallTraversal: INITIAL_WALL_TRAVERSAL_STATE,
			reportedWallTraversal: { mode: "none", normal: [0, 0, 0] },
			sliding: false,
			velocity: [4 + 3.2 * direction[0], 1_000, 2 + 3.2 * direction[1]],
			viewDirection: [0, 0, 1],
		})

		expect(state.velocity).toEqual([
			4 + 3.2 * direction[0],
			8.25,
			2 + 3.2 * direction[1],
		])
	})

	test.each([
		{
			clientVelocity: [3.2, 1_000, 0] as const,
			direction: [1, 0] as const,
			expectedVelocity: [3.2, 8.25, 0] as const,
			label: "cardinal",
			previousVelocity: [0, -2, 0] as const,
			resolvedPosition: [0, 5.4125, 0] as const,
		},
		{
			clientVelocity: [3.2 * Math.SQRT1_2, 1_000, 3.2 * Math.SQRT1_2] as const,
			direction: [Math.SQRT1_2, Math.SQRT1_2] as const,
			expectedVelocity: [3.2 * Math.SQRT1_2, 8.25, 3.2 * Math.SQRT1_2] as const,
			label: "diagonal",
			previousVelocity: [0, -2, 0] as const,
			resolvedPosition: [0, 5.4125, 0] as const,
		},
		{
			clientVelocity: [0.8, 1_000, 0] as const,
			direction: [-1, 0] as const,
			expectedVelocity: [0.8, 8.25, 0] as const,
			label: "opposite",
			previousVelocity: [4, -2, 0] as const,
			resolvedPosition: [0.2, 5.4125, 0] as const,
		},
		{
			clientVelocity: [2, 1_000, 1] as const,
			direction: [0, 0] as const,
			expectedVelocity: [2, 8.25, 1] as const,
			label: "zero",
			previousVelocity: [2, -2, 1] as const,
			resolvedPosition: [0.1, 5.4125, 0.05] as const,
		},
	])(
		"applies $label double-jump velocity after planar position integration",
		({
			clientVelocity,
			direction,
			expectedVelocity,
			previousVelocity,
			resolvedPosition,
		}) => {
			const state = reconcileAuthoritativeMovement({
				contact: null,
				crouching: false,
				delta: 0.05,
				grounded: false,
				jump: 2,
				jumpDirection: direction,
				jumpImpulse: 2,
				previousGrounded: false,
				previousJump: 1,
				previousVelocity,
				previousWallTraversal: INITIAL_WALL_TRAVERSAL_STATE,
				reportedWallTraversal: { mode: "none", normal: [0, 0, 0] },
				resolvedPosition,
				sliding: false,
				velocity: clientVelocity,
				viewDirection: [0, 0, 1],
			})

			expect(state.resolvedPosition).toEqual(resolvedPosition)
			for (const index of [0, 1, 2] as const)
				expect(state.velocity[index]).toBeCloseTo(expectedVelocity[index], 12)
		},
	)

	test("keeps authoritative state finite for a subnormal direction", () => {
		const state = reconcileAuthoritativeMovement({
			contact: null,
			crouching: false,
			delta: 0.05,
			grounded: false,
			jump: 2,
			jumpDirection: [Number.MIN_VALUE, 0],
			jumpImpulse: 2,
			previousGrounded: false,
			previousJump: 1,
			previousVelocity: [0, -2, 0],
			previousWallTraversal: INITIAL_WALL_TRAVERSAL_STATE,
			reportedWallTraversal: { mode: "none", normal: [0, 0, 0] },
			resolvedPosition: [0, 5, 0],
			sliding: false,
			velocity: [Number.MIN_VALUE, 1_000, 0],
			viewDirection: [0, 0, 1],
		})

		expect(state.resolvedPosition?.every(Number.isFinite)).toBe(true)
		expect(state.velocity.every(Number.isFinite)).toBe(true)
	})
})
