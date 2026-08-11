export type ParkourTransitionKind =
	| "bank"
	| "half-pipe"
	| "quarter-pipe"
	| "slide"

export type ParkourTransition = Readonly<{
	apron: number
	floorLift: number
	height: number
	id: string
	kind: ParkourTransitionKind
	length: number
	width: number
	x: number
	yaw: number
	z: number
}>

export const PARKOUR_TRANSITIONS: readonly ParkourTransition[] = [
	{
		apron: 8,
		floorLift: 0.4,
		height: 11.5,
		id: "radical-half-pipe",
		kind: "half-pipe",
		length: 68,
		width: 30,
		x: 0,
		yaw: 0,
		z: -78,
	},
	{
		apron: 7,
		floorLift: 0.8,
		height: 14,
		id: "west-quarter-pipe",
		kind: "quarter-pipe",
		length: 32,
		width: 34,
		x: -105,
		yaw: 0,
		z: -25,
	},
	{
		apron: 7,
		floorLift: 0.8,
		height: 15,
		id: "east-quarter-pipe",
		kind: "quarter-pipe",
		length: 34,
		width: 36,
		x: 105,
		yaw: Math.PI,
		z: 28,
	},
	{
		apron: 7,
		floorLift: 0.5,
		height: 13,
		id: "north-quarter-pipe",
		kind: "quarter-pipe",
		length: 31,
		width: 32,
		x: -30,
		yaw: -Math.PI / 2,
		z: 116,
	},
	{
		apron: 7,
		floorLift: 0.5,
		height: 16,
		id: "south-quarter-pipe",
		kind: "quarter-pipe",
		length: 35,
		width: 35,
		x: 42,
		yaw: Math.PI / 2,
		z: -124,
	},
	{
		apron: 6,
		floorLift: 1,
		height: 27,
		id: "north-east-mega-slide",
		kind: "slide",
		length: 44,
		width: 12,
		x: 105,
		yaw: Math.PI / 4,
		z: 105,
	},
	{
		apron: 6,
		floorLift: 1,
		height: 25,
		id: "north-west-mega-slide",
		kind: "slide",
		length: 42,
		width: 12,
		x: -105,
		yaw: (Math.PI * 3) / 4,
		z: 105,
	},
	{
		apron: 6,
		floorLift: 0.8,
		height: 29,
		id: "south-east-mega-slide",
		kind: "slide",
		length: 46,
		width: 13,
		x: 108,
		yaw: -Math.PI / 4,
		z: -105,
	},
	{
		apron: 6,
		floorLift: 0.8,
		height: 26,
		id: "south-west-mega-slide",
		kind: "slide",
		length: 43,
		width: 12,
		x: -106,
		yaw: (-Math.PI * 3) / 4,
		z: -105,
	},
	{
		apron: 6,
		floorLift: 0.6,
		height: 23,
		id: "east-kicker-slide",
		kind: "slide",
		length: 38,
		width: 11,
		x: 138,
		yaw: 0,
		z: -54,
	},
	{
		apron: 6,
		floorLift: 0.6,
		height: 24,
		id: "west-kicker-slide",
		kind: "slide",
		length: 39,
		width: 11,
		x: -138,
		yaw: Math.PI,
		z: 54,
	},
	{
		apron: 5,
		floorLift: 0.8,
		height: 7,
		id: "north-east-bank",
		kind: "bank",
		length: 24,
		width: 20,
		x: 50,
		yaw: -Math.PI / 2,
		z: 55,
	},
	{
		apron: 5,
		floorLift: 0.8,
		height: 7.5,
		id: "north-west-bank",
		kind: "bank",
		length: 25,
		width: 20,
		x: -52,
		yaw: -Math.PI / 2,
		z: 52,
	},
	{
		apron: 5,
		floorLift: 0.8,
		height: 8,
		id: "south-east-bank",
		kind: "bank",
		length: 26,
		width: 20,
		x: 52,
		yaw: Math.PI / 2,
		z: -48,
	},
	{
		apron: 5,
		floorLift: 0.8,
		height: 6.5,
		id: "south-west-bank",
		kind: "bank",
		length: 23,
		width: 18,
		x: -50,
		yaw: Math.PI / 2,
		z: -50,
	},
]

type NaturalHeightAt = (seed: number, x: number, z: number) => number

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value))
}

function smootherStep(value: number): number {
	const clamped = clamp01(value)
	return clamped * clamped * clamped * (clamped * (clamped * 6 - 15) + 10)
}

export function parkourLocalPoint(
	transition: ParkourTransition,
	x: number,
	z: number,
): readonly [along: number, across: number] {
	const dx = x - transition.x
	const dz = z - transition.z
	const cosine = Math.cos(transition.yaw)
	const sine = Math.sin(transition.yaw)
	return [dx * cosine + dz * sine, -dx * sine + dz * cosine]
}

export function parkourWorldPoint(
	transition: ParkourTransition,
	along: number,
	across: number,
): readonly [x: number, z: number] {
	const cosine = Math.cos(transition.yaw)
	const sine = Math.sin(transition.yaw)
	return [
		transition.x + along * cosine - across * sine,
		transition.z + along * sine + across * cosine,
	]
}

function axisCoverage(
	distance: number,
	halfExtent: number,
	apron: number,
): number {
	return 1 - smootherStep((Math.abs(distance) - halfExtent) / apron)
}

function transitionCoverage(
	transition: ParkourTransition,
	along: number,
	across: number,
): number {
	return (
		axisCoverage(along, transition.length * 0.5, transition.apron) *
		axisCoverage(across, transition.width * 0.5, transition.apron)
	)
}

function transitionSurface(
	transition: ParkourTransition,
	anchorHeight: number,
	along: number,
	across: number,
): number {
	const floor = anchorHeight + transition.floorLift
	if (transition.kind === "half-pipe") {
		const flatHalfWidth = transition.width * 0.16
		const curve = smootherStep(
			(Math.abs(across) - flatHalfWidth) /
				(transition.width * 0.5 - flatHalfWidth),
		)
		return floor + transition.height * curve
	}
	const progress = clamp01(along / transition.length + 0.5)
	const curve =
		transition.kind === "quarter-pipe"
			? 1 - Math.cos(progress * Math.PI * 0.5)
			: transition.kind === "slide"
				? smootherStep(progress)
				: progress
	return floor + transition.height * curve
}

export function parkourFeatureInfluenceAt(x: number, z: number): number {
	let influence = 0
	for (const transition of PARKOUR_TRANSITIONS) {
		const [along, across] = parkourLocalPoint(transition, x, z)
		influence = Math.max(
			influence,
			transitionCoverage(transition, along, across),
		)
	}
	return influence
}

export function parkourArenaHeightAt(
	seed: number,
	x: number,
	z: number,
	naturalHeightAt: NaturalHeightAt,
): number {
	let height = naturalHeightAt(seed, x, z)
	for (const transition of PARKOUR_TRANSITIONS) {
		const [along, across] = parkourLocalPoint(transition, x, z)
		const coverage = transitionCoverage(transition, along, across)
		if (coverage <= 0) continue
		const anchorHeight = naturalHeightAt(seed, transition.x, transition.z)
		const surface = transitionSurface(transition, anchorHeight, along, across)
		height += (surface - height) * coverage
	}
	return height
}
