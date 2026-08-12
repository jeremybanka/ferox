import { describe, expect, test } from "vitest"

import {
	constrainGrappleMotion,
	stepAuthoritativeGrappleMotion,
} from "./GrapplePhysics.ts"

const anchor = { x: 0, y: 10, z: 0 }

describe("grapple constraint", () => {
	test("preserves tangential inertia while removing outward rope velocity", () => {
		const result = constrainGrappleMotion(
			{
				position: { x: 0, y: 0, z: 0 },
				velocity: { x: 12, y: -4, z: 0 },
			},
			{ anchor, delta: 0, ropeLength: 10, steering: { x: 0, y: 0, z: 0 } },
		)
		expect(result.velocity.x).toBe(12)
		expect(result.velocity.y).toBe(0)
	})

	test("does not teleport, stop, or redirect motion while the rope is slack", () => {
		const motion = {
			position: { x: 0, y: 5, z: 0 },
			velocity: { x: 7, y: 2, z: -3 },
		}
		expect(
			constrainGrappleMotion(motion, {
				anchor,
				delta: 1 / 60,
				ropeLength: 10,
				steering: { x: 0, y: 0, z: 0 },
			}),
		).toEqual(motion)
	})

	test("projects overshoot to rope length without changing tangential speed", () => {
		const result = constrainGrappleMotion(
			{
				position: { x: 0, y: -1, z: 0 },
				velocity: { x: 9, y: -2, z: 0 },
			},
			{ anchor, delta: 0, ropeLength: 10, steering: { x: 0, y: 0, z: 0 } },
		)
		expect(result.position).toEqual({ x: 0, y: 0, z: 0 })
		expect(result.velocity).toEqual({ x: 9, y: 0, z: 0 })
	})

	test("projects steering tangent to the rope and caps pathological speed", () => {
		const result = constrainGrappleMotion(
			{
				position: { x: 0, y: 0, z: 0 },
				velocity: { x: 100, y: 100, z: 0 },
			},
			{ anchor, delta: 0.1, ropeLength: 10, steering: { x: 1, y: 1, z: 0 } },
		)
		expect(
			Math.hypot(result.velocity.x, result.velocity.y, result.velocity.z),
		).toBeCloseTo(32)
		expect(Number.isFinite(result.velocity.x)).toBe(true)
	})

	test("produces the same bounded acceleration across fixed substeps", () => {
		const motion = {
			position: { x: 0, y: 0, z: 0 },
			velocity: { x: 6, y: 0, z: 0 },
		}
		const input = {
			anchor,
			delta: 1 / 60,
			ropeLength: 10,
			steering: { x: 1, y: 0, z: 0 },
		}
		const oneStep = constrainGrappleMotion(motion, input)
		const halfStep = constrainGrappleMotion(motion, {
			...input,
			delta: 1 / 120,
		})
		const twoSteps = constrainGrappleMotion(halfStep, {
			...input,
			delta: 1 / 120,
		})
		expect(twoSteps.velocity.x).toBeCloseTo(oneStep.velocity.x, 8)
		expect(twoSteps.velocity.y).toBeCloseTo(oneStep.velocity.y, 8)
	})

	test("rate-limits forged instant velocity reversals from authoritative state", () => {
		const result = stepAuthoritativeGrappleMotion(
			{
				position: { x: 0, y: 0, z: 0 },
				velocity: { x: 20, y: 0, z: 0 },
			},
			{ x: -32, y: 0, z: 0 },
			{
				anchor: { x: 0, y: 100, z: 0 },
				delta: 0.01,
				gravity: 0,
				applyGravity: true,
				instantaneousVerticalVelocity: null,
				maximumInputAcceleration: 10,
				ropeLength: 200,
				steering: { x: 0, y: 0, z: 0 },
			},
		)
		expect(result.velocity.x).toBeCloseTo(19.9)
		expect(result.position.x).toBeCloseTo(0.1995)
	})

	test("gives zero-time packet spam no acceleration or travel budget", () => {
		const previous = {
			position: { x: 1, y: 2, z: 3 },
			velocity: { x: 4, y: 0, z: 0 },
		}
		const result = stepAuthoritativeGrappleMotion(
			previous,
			{ x: -32, y: 32, z: 32 },
			{
				anchor: { x: 1, y: 102, z: 3 },
				delta: 0,
				gravity: 23,
				applyGravity: true,
				instantaneousVerticalVelocity: null,
				maximumInputAcceleration: 40,
				ropeLength: 200,
				steering: { x: 0, y: 0, z: 0 },
			},
		)
		expect(result).toEqual(previous)
	})

	test("packet subdivision cannot amplify acceleration budget", () => {
		const input = {
			anchor: { x: 0, y: 100, z: 0 },
			delta: 0.1,
			gravity: 0,
			applyGravity: false,
			instantaneousVerticalVelocity: null,
			maximumInputAcceleration: 10,
			ropeLength: 200,
			steering: { x: 0, y: 0, z: 0 },
		}
		const previous = {
			position: { x: 0, y: 0, z: 0 },
			velocity: { x: 0, y: 0, z: 0 },
		}
		const single = stepAuthoritativeGrappleMotion(
			previous,
			{ x: 32, y: 0, z: 0 },
			input,
		)
		let subdivided = previous
		for (let index = 0; index < 100; index += 1) {
			subdivided = stepAuthoritativeGrappleMotion(
				subdivided,
				{ x: 32, y: 0, z: 0 },
				{ ...input, delta: 0.001 },
			)
		}
		expect(subdivided.velocity.x).toBeCloseTo(single.velocity.x, 8)
		expect(subdivided.position.x).toBeCloseTo(single.position.x, 8)
	})

	test("sanitizes a forged pre-attach velocity before integrating travel", () => {
		const result = stepAuthoritativeGrappleMotion(
			{
				position: { x: 0, y: 0, z: 0 },
				velocity: { x: 1_000_000, y: 0, z: 0 },
			},
			{ x: 1_000_000, y: 0, z: 0 },
			{
				anchor: { x: 0, y: 100, z: 0 },
				delta: 0.05,
				gravity: 0,
				applyGravity: false,
				instantaneousVerticalVelocity: null,
				maximumInputAcceleration: 10,
				ropeLength: 200,
				steering: { x: 0, y: 0, z: 0 },
			},
		)
		expect(result.velocity.x).toBe(32)
		expect(result.position.x).toBeCloseTo(1.6)
	})
})
