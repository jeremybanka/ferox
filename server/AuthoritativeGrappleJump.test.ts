import { describe, expect, test } from "vitest"

import {
	constrainGrappleMotion,
	stepAuthoritativeGrappleDirectionalJumpMotion,
	stepAuthoritativeGrappleMotion,
} from "../src/GrapplePhysics.ts"
import { JUMP_PHYSICS, stepJumpPhysics } from "../src/JumpPhysics.ts"
import {
	applyAuthoritativeGrappleJumpPlanarVelocity,
	authoritativeGrappleJumpPlanarImpulse,
	observeAuthoritativeGrappleJumpEdge,
	reconcileAuthoritativeGrappleGroundTransition,
	reconcileAuthoritativeGrappleJump,
} from "./AuthoritativeGrappleJump.ts"

const delta = 0.05
const motionInput = (
	applyGravity: boolean,
	instantaneousVerticalVelocity: number | null,
) => ({
	anchor: { x: 0, y: 100, z: 0 },
	applyGravity,
	delta,
	gravity: JUMP_PHYSICS.gravity,
	instantaneousVerticalVelocity,
	maximumInputAcceleration: 10,
	ropeLength: 200,
	steering: { x: 0, y: 0, z: 0 },
})

describe("authoritative grapple jump protocol", () => {
	test("honest ledge departure applies gravity without inventing a jump", () => {
		const client = stepJumpPhysics(
			{ jumpCount: 0, positionY: 5, velocityY: 0 },
			{
				delta,
				groundAfter: 4,
				groundBefore: 5,
				groundMidpoint: 4,
				jumpRequested: false,
			},
		)
		const jump = reconcileAuthoritativeGrappleJump({
			groundedBefore: true,
			jumpCount: 0,
			requestedDirection: null,
			requestedImpulse: null,
		})
		const ground = reconcileAuthoritativeGrappleGroundTransition({
			acceptedImpulse: jump.acceptedImpulse,
			groundAfter: 4,
			groundBefore: 5,
			groundedBefore: true,
			groundMidpoint: 4,
		})
		const server = stepAuthoritativeGrappleMotion(
			{
				position: { x: 0, y: 5, z: 0 },
				velocity: { x: 0, y: 0, z: 0 },
			},
			{ x: 0, y: client.velocityY, z: 0 },
			motionInput(ground.applyGravity, jump.instantaneousVerticalVelocity),
		)

		expect(client.departedGround).toBe(true)
		expect(client.velocityY).toBeCloseTo(-1.15)
		expect(client.positionY).toBeCloseTo(4.9425)
		expect(jump).toMatchObject({ acceptedImpulse: null, jumpCount: 0 })
		expect(ground).toEqual({
			applyGravity: true,
			followsGroundContour: false,
		})
		expect(server.velocity.y).toBeCloseTo(client.velocityY, 8)
		expect(server.position.y).toBeCloseTo(client.positionY, 8)
	})

	test("first jump matches the grounded client step and skips same-frame gravity", () => {
		const client = stepJumpPhysics(
			{ jumpCount: 0, positionY: 5, velocityY: 0 },
			{
				delta,
				groundAfter: 5,
				groundBefore: 5,
				jumpRequested: true,
			},
		)
		const jump = reconcileAuthoritativeGrappleJump({
			groundedBefore: true,
			jumpCount: 0,
			requestedDirection: null,
			requestedImpulse: 1,
		})
		const ground = reconcileAuthoritativeGrappleGroundTransition({
			acceptedImpulse: jump.acceptedImpulse,
			groundAfter: 5,
			groundBefore: 5,
			groundedBefore: true,
			groundMidpoint: 5,
		})
		const server = stepAuthoritativeGrappleMotion(
			{
				position: { x: 0, y: 5, z: 0 },
				velocity: { x: 0, y: 0, z: 0 },
			},
			{ x: 0, y: client.velocityY, z: 0 },
			motionInput(ground.applyGravity, jump.instantaneousVerticalVelocity),
		)

		expect(client.impulse).toBe(1)
		expect(client.velocityY).toBeCloseTo(10.6)
		expect(client.positionY).toBeCloseTo(5.53)
		expect(jump).toMatchObject({ acceptedImpulse: 1, jumpCount: 1 })
		expect(ground.applyGravity).toBe(false)
		expect(server.velocity.y).toBeCloseTo(client.velocityY, 8)
		expect(server.position.y).toBeCloseTo(client.positionY, 8)
	})

	test("double jump matches client impulse-then-gravity ordering", () => {
		const client = stepJumpPhysics(
			{ jumpCount: 1, positionY: 5, velocityY: 0 },
			{
				delta,
				groundAfter: 0,
				groundBefore: 0,
				jumpRequested: true,
			},
		)
		const jump = reconcileAuthoritativeGrappleJump({
			groundedBefore: false,
			jumpCount: 1,
			requestedDirection: [0, 0],
			requestedImpulse: 2,
		})
		const ground = reconcileAuthoritativeGrappleGroundTransition({
			acceptedImpulse: jump.acceptedImpulse,
			groundAfter: 0,
			groundBefore: 0,
			groundedBefore: false,
			groundMidpoint: 0,
		})
		const server = stepAuthoritativeGrappleMotion(
			{
				position: { x: 0, y: 5, z: 0 },
				velocity: { x: 0, y: 0, z: 0 },
			},
			{ x: 0, y: client.velocityY, z: 0 },
			motionInput(ground.applyGravity, jump.instantaneousVerticalVelocity),
		)

		expect(client.velocityY).toBeCloseTo(8.25)
		expect(client.positionY).toBeCloseTo(5.4125)
		expect(jump).toMatchObject({ acceptedImpulse: 2, jumpCount: 2 })
		expect(ground.applyGravity).toBe(true)
		expect(server.velocity.y).toBeCloseTo(client.velocityY, 8)
		expect(server.position.y).toBeCloseTo(client.positionY, 8)
	})

	test.each([
		{
			direction: [1, 0] as [number, number],
			expectedVelocity: {
				x: -1.2170479625809507,
				y: 7.667456603686249,
				z: 0,
			},
			label: "taut cardinal",
		},
		{
			direction: [Math.SQRT1_2, Math.SQRT1_2] as [number, number],
			expectedVelocity: {
				x: -1.2344471446297145,
				y: 8.089254956383538,
				z: 2.6624023975875617,
			},
			label: "taut outward diagonal",
		},
		{
			direction: [-1, 0] as [number, number],
			expectedVelocity: {
				x: -4.115721252659031,
				y: 8.612566666185101,
				z: 0,
			},
			label: "taut inward",
		},
		{
			direction: [0, 0] as [number, number],
			expectedVelocity: {
				x: -1.2389696933101206,
				y: 8.198892500150958,
				z: 0,
			},
			label: "taut zero",
		},
	])("$label matches client position and velocity", (sample) => {
		const anchor = { x: 0, y: 0, z: 0 }
		const previous = {
			position: { x: 10, y: 0, z: 0 },
			velocity: { x: 0, y: 0, z: 0 },
		}
		const jump = reconcileAuthoritativeGrappleJump({
			groundedBefore: false,
			jumpCount: 1,
			requestedDirection: sample.direction,
			requestedImpulse: 2,
		})
		const planarImpulse = authoritativeGrappleJumpPlanarImpulse(jump)
		const steering = {
			x: sample.direction[0],
			y: 0,
			z: sample.direction[1],
		}
		const verticalVelocity =
			JUMP_PHYSICS.doubleJumpVelocity - JUMP_PHYSICS.gravity * delta
		const client = constrainGrappleMotion(
			{
				position: {
					x: previous.position.x + previous.velocity.x * delta,
					y: previous.position.y + verticalVelocity * delta,
					z: previous.position.z + previous.velocity.z * delta,
				},
				velocity: {
					x: previous.velocity.x + planarImpulse.x,
					y: verticalVelocity,
					z: previous.velocity.z + planarImpulse.z,
				},
			},
			{ anchor, delta, ropeLength: 10, steering },
		)
		const server = stepAuthoritativeGrappleDirectionalJumpMotion(previous, {
			anchor,
			delta,
			gravity: JUMP_PHYSICS.gravity,
			instantaneousVerticalVelocity: JUMP_PHYSICS.doubleJumpVelocity,
			planarImpulse,
			ropeLength: 10,
			steering,
		})

		expect(server.position.x).toBeCloseTo(client.position.x, 10)
		expect(server.position.y).toBeCloseTo(client.position.y, 10)
		expect(server.position.z).toBeCloseTo(client.position.z, 10)
		expect(server.position.x).toBeCloseTo(9.991503029558418, 10)
		expect(server.position.y).toBeCloseTo(0.4121494999692848, 10)
		expect(server.position.z).toBe(0)
		expect(server.velocity.x).toBeCloseTo(client.velocity.x, 10)
		expect(server.velocity.y).toBeCloseTo(client.velocity.y, 10)
		expect(server.velocity.z).toBeCloseTo(client.velocity.z, 10)
		expect(server.velocity.x).toBeCloseTo(sample.expectedVelocity.x, 10)
		expect(server.velocity.y).toBeCloseTo(sample.expectedVelocity.y, 10)
		expect(server.velocity.z).toBeCloseTo(sample.expectedVelocity.z, 10)
	})

	test.each([
		{
			direction: [1, 0] as [number, number],
			expectedVelocity: {
				x: 3.2328882669150754,
				y: 7.851354340423324,
				z: 0,
			},
		},
		{
			direction: [Math.SQRT1_2, Math.SQRT1_2] as [number, number],
			expectedVelocity: {
				x: 2.2654367009674603,
				y: 8.217333319145355,
				z: 2.6613964689025424,
			},
		},
		{
			direction: [0, 0] as [number, number],
			expectedVelocity: { x: 0, y: 8.25, z: 0 },
		},
	])(
		"slack direction $direction preserves client ordering",
		({ direction, expectedVelocity }) => {
			const jump = reconcileAuthoritativeGrappleJump({
				groundedBefore: false,
				jumpCount: 1,
				requestedDirection: direction,
				requestedImpulse: 2,
			})
			const planarImpulse = authoritativeGrappleJumpPlanarImpulse(jump)
			const steering = { x: direction[0], y: 0, z: direction[1] }
			const server = stepAuthoritativeGrappleDirectionalJumpMotion(
				{
					position: { x: 5, y: 0, z: 0 },
					velocity: { x: 0, y: 0, z: 0 },
				},
				{
					anchor: { x: 0, y: 0, z: 0 },
					delta,
					gravity: JUMP_PHYSICS.gravity,
					instantaneousVerticalVelocity: JUMP_PHYSICS.doubleJumpVelocity,
					planarImpulse,
					ropeLength: 10,
					steering,
				},
			)

			expect(server.position.x).toBe(5)
			expect(server.position.y).toBeCloseTo(0.4125, 10)
			expect(server.position.z).toBe(0)
			expect(server.velocity.x).toBeCloseTo(expectedVelocity.x, 10)
			expect(server.velocity.y).toBeCloseTo(expectedVelocity.y, 10)
			expect(server.velocity.z).toBeCloseTo(expectedVelocity.z, 10)
		},
	)

	test("rejects illegal and replayed impulse edges", () => {
		expect(
			reconcileAuthoritativeGrappleJump({
				groundedBefore: false,
				jumpCount: 1,
				requestedDirection: null,
				requestedImpulse: 1,
			}),
		).toMatchObject({ acceptedImpulse: null, jumpCount: 1 })
		expect(
			reconcileAuthoritativeGrappleJump({
				groundedBefore: true,
				jumpCount: 0,
				requestedDirection: [1, 0],
				requestedImpulse: 2,
			}),
		).toMatchObject({ acceptedImpulse: null, jumpCount: 0 })

		const first = observeAuthoritativeGrappleJumpEdge({
			lastObservedSequence: 4,
			requestedDirection: null,
			requestedImpulse: 1,
			sequence: 5,
		})
		expect(first).toEqual({
			lastObservedSequence: 5,
			requestedDirection: null,
			requestedImpulse: 1,
		})
		expect(
			observeAuthoritativeGrappleJumpEdge({
				lastObservedSequence: first.lastObservedSequence,
				requestedDirection: null,
				requestedImpulse: 1,
				sequence: 5,
			}),
		).toEqual({
			lastObservedSequence: 5,
			requestedDirection: null,
			requestedImpulse: null,
		})

		const directional = observeAuthoritativeGrappleJumpEdge({
			lastObservedSequence: 5,
			requestedDirection: [1, 0],
			requestedImpulse: 2,
			sequence: 6,
		})
		expect(directional.requestedDirection).toEqual([1, 0])
		expect(
			observeAuthoritativeGrappleJumpEdge({
				lastObservedSequence: directional.lastObservedSequence,
				requestedDirection: [1, 0],
				requestedImpulse: 2,
				sequence: 6,
			}),
		).toEqual({
			lastObservedSequence: 6,
			requestedDirection: null,
			requestedImpulse: null,
		})
	})

	test("subnormal direction cannot produce non-finite authoritative motion", () => {
		const jump = reconcileAuthoritativeGrappleJump({
			groundedBefore: false,
			jumpCount: 1,
			requestedDirection: [Number.MIN_VALUE, 0],
			requestedImpulse: 2,
		})
		const integrated = stepAuthoritativeGrappleMotion(
			{
				position: { x: 0, y: 5, z: 0 },
				velocity: { x: 0, y: 0, z: 0 },
			},
			{ x: 0, y: 0, z: 0 },
			motionInput(true, jump.instantaneousVerticalVelocity),
		)
		const outputPlanar = applyAuthoritativeGrappleJumpPlanarVelocity(
			{ x: integrated.velocity.x, z: integrated.velocity.z },
			jump,
		)

		expect(jump.acceptedImpulse).toBeNull()
		expect(
			[
				integrated.position.x,
				integrated.position.y,
				integrated.position.z,
				outputPlanar.x,
				integrated.velocity.y,
				outputPlanar.z,
			].every(Number.isFinite),
		).toBe(true)
	})
})
