export const JUMP_PHYSICS = {
	coyoteTimeSeconds: 0.1,
	doubleJumpVelocity: 9.4,
	gravity: 23,
	groundContactTolerance: 0.12,
	maximumGroundSnapDownPerSample: 0.45,
	jumpVelocity: 11.6,
	maximumStepSeconds: 0.04,
	previewStepSeconds: 1 / 60,
} as const

export type JumpCount = 0 | 1 | 2

export type JumpVerticalState = {
	coyoteRemaining?: number | null
	jumpCount: JumpCount
	positionY: number
	velocityY: number
}

export type JumpPhysicsStep = JumpVerticalState & {
	coyoteRemaining: number | null
	departedGround: boolean
	groundedBefore: boolean
	impulse: JumpCount | null
	impactVelocity: number
	landed: boolean
}

export function canFollowGroundContour(
	groundBefore: number,
	groundMidpoint: number,
	groundAfter: number,
): boolean {
	const comparisonTolerance = 1e-9
	return (
		groundBefore - groundMidpoint <=
			JUMP_PHYSICS.maximumGroundSnapDownPerSample + comparisonTolerance &&
		groundMidpoint - groundAfter <=
			JUMP_PHYSICS.maximumGroundSnapDownPerSample + comparisonTolerance
	)
}

export type JumpTrajectorySample = JumpVerticalState & {
	time: number
}

export type JumpTrajectory = {
	apexTime: number
	duration: number
	impactVelocity: number
	samples: readonly JumpTrajectorySample[]
	stepSeconds: number
}

export function isJumpGrounded(
	state: Pick<JumpVerticalState, "positionY" | "velocityY">,
	groundHeight: number,
): boolean {
	return (
		state.positionY <= groundHeight + JUMP_PHYSICS.groundContactTolerance &&
		state.velocityY <= 0
	)
}

export function stepJumpPhysics(
	state: JumpVerticalState,
	options: {
		delta: number
		groundAfter: number
		groundBefore: number
		groundMidpoint?: number
		gravityScale?: number
		jumpRequested: boolean
		ledgeCoyoteEligible?: boolean
		momentumDepartureVelocityY?: number
	},
): JumpPhysicsStep {
	let coyoteRemaining = state.coyoteRemaining ?? null
	let jumpCount = state.jumpCount
	let positionY = state.positionY
	let velocityY = state.velocityY
	const groundedBefore = isJumpGrounded(state, options.groundBefore)
	const landedBefore = groundedBefore && state.jumpCount > 0
	const incomingImpactVelocity = landedBefore ? Math.max(0, -velocityY) : 0

	if (groundedBefore) {
		positionY = options.groundBefore
		velocityY = Math.max(velocityY, 0)
		jumpCount = 0
		coyoteRemaining = null
	}

	let impulse: JumpCount | null = null
	if (options.jumpRequested) {
		if (groundedBefore) {
			velocityY = JUMP_PHYSICS.jumpVelocity
			jumpCount = 1
			impulse = 1
		} else if (coyoteRemaining !== null) {
			velocityY = JUMP_PHYSICS.jumpVelocity
			jumpCount = 1
			impulse = 1
			coyoteRemaining = null
		} else if (jumpCount < 2) {
			velocityY = JUMP_PHYSICS.doubleJumpVelocity
			jumpCount = 2
			impulse = 2
		}
	}
	const groundMidpoint =
		options.groundMidpoint ?? (options.groundBefore + options.groundAfter) * 0.5
	const momentumDepartureVelocityY = Math.max(
		0,
		options.momentumDepartureVelocityY ?? 0,
	)
	const momentumDeparture =
		groundedBefore && impulse === null && momentumDepartureVelocityY > 0
	const followsGround =
		groundedBefore &&
		impulse === null &&
		!momentumDeparture &&
		canFollowGroundContour(
			options.groundBefore,
			groundMidpoint,
			options.groundAfter,
		)
	const departedGround =
		groundedBefore && impulse === null && (momentumDeparture || !followsGround)
	if (departedGround) {
		jumpCount = 1
		if (momentumDeparture) {
			velocityY = momentumDepartureVelocityY
			coyoteRemaining = null
		} else if (options.ledgeCoyoteEligible !== false) {
			coyoteRemaining = JUMP_PHYSICS.coyoteTimeSeconds
		}
	}
	if (!groundedBefore && impulse === null && coyoteRemaining !== null) {
		coyoteRemaining -= options.delta
		if (coyoteRemaining < 0) coyoteRemaining = null
	}

	if (!groundedBefore || departedGround) {
		velocityY -=
			JUMP_PHYSICS.gravity *
			options.delta *
			Math.max(0, options.gravityScale ?? 1)
	}
	if (followsGround) {
		positionY = options.groundAfter
	} else {
		positionY += velocityY * options.delta
	}

	const landedAfter = positionY < options.groundAfter
	const landed = !departedGround && (landedBefore || landedAfter)
	const impactVelocity = landedAfter
		? Math.max(0, -velocityY)
		: incomingImpactVelocity
	if (landedAfter) {
		positionY = options.groundAfter
		velocityY = 0
	}

	return {
		coyoteRemaining,
		departedGround,
		groundedBefore,
		impactVelocity,
		impulse,
		jumpCount,
		landed,
		positionY,
		velocityY,
	}
}

export function simulateFlatGroundJump(
	stepSeconds = JUMP_PHYSICS.previewStepSeconds,
): JumpTrajectory {
	const samples: JumpTrajectorySample[] = [
		{
			jumpCount: 1,
			positionY: 0,
			time: 0,
			velocityY: JUMP_PHYSICS.jumpVelocity,
		},
	]
	let state: JumpVerticalState = {
		jumpCount: 0,
		positionY: 0,
		velocityY: 0,
	}
	let time = 0
	let apexTime = 0
	let apexHeight = 0
	let impactVelocity = 0
	let jumpRequested = true

	for (let step = 0; step < 600; step += 1) {
		const result = stepJumpPhysics(state, {
			delta: stepSeconds,
			groundAfter: 0,
			groundBefore: 0,
			jumpRequested,
		})
		jumpRequested = false
		time += stepSeconds
		state = {
			jumpCount: result.jumpCount,
			positionY: result.positionY,
			velocityY: result.velocityY,
		}
		samples.push({ ...state, time })
		if (state.positionY > apexHeight) {
			apexHeight = state.positionY
			apexTime = time
		}
		if (result.landed) {
			impactVelocity = result.impactVelocity
			break
		}
	}

	return {
		apexTime,
		duration: time,
		impactVelocity,
		samples,
		stepSeconds,
	}
}

export function simulateDoubleJumpWindow(
	duration: number,
	stepSeconds = JUMP_PHYSICS.previewStepSeconds,
): JumpTrajectory {
	const samples: JumpTrajectorySample[] = [
		{
			jumpCount: 2,
			positionY: 0,
			time: 0,
			velocityY: JUMP_PHYSICS.doubleJumpVelocity,
		},
	]
	let state: JumpVerticalState = {
		jumpCount: 1,
		positionY: 0,
		velocityY: 0,
	}
	let time = 0
	let apexTime = 0
	let apexHeight = 0
	let jumpRequested = true

	while (time < duration) {
		const result = stepJumpPhysics(state, {
			delta: stepSeconds,
			groundAfter: Number.NEGATIVE_INFINITY,
			groundBefore: Number.NEGATIVE_INFINITY,
			jumpRequested,
		})
		jumpRequested = false
		time += stepSeconds
		state = {
			jumpCount: result.jumpCount,
			positionY: result.positionY,
			velocityY: result.velocityY,
		}
		samples.push({ ...state, time })
		if (state.positionY > apexHeight) {
			apexHeight = state.positionY
			apexTime = time
		}
	}

	return {
		apexTime,
		duration,
		impactVelocity: 0,
		samples,
		stepSeconds,
	}
}

export function sampleJumpTrajectory(
	trajectory: JumpTrajectory,
	time: number,
): JumpTrajectorySample {
	const clampedTime = Math.max(0, Math.min(trajectory.duration, time))
	const fromIndex = Math.min(
		trajectory.samples.length - 1,
		Math.floor(clampedTime / trajectory.stepSeconds),
	)
	const from = trajectory.samples[fromIndex] ?? trajectory.samples[0]!
	const to = trajectory.samples[fromIndex + 1] ?? from
	const range = Math.max(0.000_001, to.time - from.time)
	const amount = Math.max(0, Math.min(1, (clampedTime - from.time) / range))
	return {
		jumpCount: amount < 1 ? from.jumpCount : to.jumpCount,
		positionY: from.positionY + (to.positionY - from.positionY) * amount,
		time: clampedTime,
		velocityY: from.velocityY + (to.velocityY - from.velocityY) * amount,
	}
}
