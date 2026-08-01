import {
	initialSlideHeading,
	SLIDE_HEADING_MIN_SPEED,
	type SlideHeading,
	type SlideMotion,
} from "./SlideDirection.ts"

export const SLIDE_INCLINATION_LIMIT_DEGREES = 60
export const SLIDE_INCLINATION_LIMIT_RADIANS = Math.PI / 3

export type SlideVector3 = {
	x: number
	y: number
	z: number
}

export type SlideSurfaceFrame = {
	/** Positive downhill, negative uphill, zero across a flat/cross-slope path. */
	inclinationRadians: number
	lateral: SlideVector3
	normal: SlideVector3
	tangent: SlideVector3
}

const UP = { x: 0, y: 1, z: 0 } as const
const FORWARD = { localX: 0, localZ: -1 } as const

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value))
}

function normalize3(
	vector: SlideVector3,
	fallback: SlideVector3,
): SlideVector3 {
	const length = Math.hypot(vector.x, vector.y, vector.z)
	if (!Number.isFinite(length) || length < 0.000_001) return { ...fallback }
	return {
		x: vector.x / length,
		y: vector.y / length,
		z: vector.z / length,
	}
}

function normalizeHeading(heading: SlideHeading): SlideHeading {
	const length = Math.hypot(heading.localX, heading.localZ)
	if (!Number.isFinite(length) || length < 0.000_001) return { ...FORWARD }
	return {
		localX: heading.localX / length,
		localZ: heading.localZ / length,
	}
}

function cross(a: SlideVector3, b: SlideVector3): SlideVector3 {
	return {
		x: a.y * b.z - a.z * b.y,
		y: a.z * b.x - a.x * b.z,
		z: a.x * b.y - a.y * b.x,
	}
}

function dot(a: SlideVector3, b: SlideVector3): number {
	return a.x * b.x + a.y * b.y + a.z * b.z
}

export function clampSlideInclinationDegrees(degrees: number): number {
	if (!Number.isFinite(degrees)) return 0
	return clamp(
		degrees,
		-SLIDE_INCLINATION_LIMIT_DEGREES,
		SLIDE_INCLINATION_LIMIT_DEGREES,
	)
}

export function slideGroundNormalFromGradient(gradient: {
	x: number
	z: number
}): SlideVector3 {
	return normalize3({ x: -gradient.x, y: 1, z: -gradient.z }, UP)
}

/**
 * Builds the stable local tangent frame used by both the arena and previews.
 * The planar heading is projected onto the grounded tangent plane, then the
 * frame is re-orthogonalized to prevent scaled normals and network noise from
 * leaking into the pose.
 */
export function slideSurfaceFrameFromGroundNormal(
	heading: SlideHeading,
	groundNormal: SlideVector3,
): SlideSurfaceFrame {
	const planar = normalizeHeading(heading)
	let normal = normalize3(groundNormal, UP)
	if (normal.y < 0) {
		normal = { x: -normal.x, y: -normal.y, z: -normal.z }
	}
	const surfaceTilt = Math.acos(clamp(normal.y, -1, 1))
	if (surfaceTilt > SLIDE_INCLINATION_LIMIT_RADIANS) {
		const horizontal = normalize3(
			{ x: normal.x, y: 0, z: normal.z },
			{ x: 0, y: 0, z: 1 },
		)
		normal = {
			x: horizontal.x * Math.sin(SLIDE_INCLINATION_LIMIT_RADIANS),
			y: Math.cos(SLIDE_INCLINATION_LIMIT_RADIANS),
			z: horizontal.z * Math.sin(SLIDE_INCLINATION_LIMIT_RADIANS),
		}
	}
	const planar3 = { x: planar.localX, y: 0, z: planar.localZ }
	const normalProjection = dot(planar3, normal)
	const projected = {
		x: planar3.x - normal.x * normalProjection,
		y: -normal.y * normalProjection,
		z: planar3.z - normal.z * normalProjection,
	}
	const fallbackLateral = normalize3(
		{ x: -planar.localZ, y: 0, z: planar.localX },
		{ x: 1, y: 0, z: 0 },
	)
	const fallbackTangent = normalize3(cross(normal, fallbackLateral), planar3)
	let tangent = normalize3(projected, fallbackTangent)
	let lateral = normalize3(cross(tangent, normal), fallbackLateral)
	// Rebuild the tangent from the other two axes so all three remain exactly
	// orthogonal even when the supplied normal is non-unit or nearly vertical.
	tangent = normalize3(cross(normal, lateral), tangent)
	lateral = normalize3(cross(tangent, normal), lateral)
	const inclinationRadians = clamp(
		-Math.asin(clamp(tangent.y, -1, 1)),
		-SLIDE_INCLINATION_LIMIT_RADIANS,
		SLIDE_INCLINATION_LIMIT_RADIANS,
	)
	return { inclinationRadians, lateral, normal, tangent }
}

/** Synthesizes a surface with no cross-slope component for the visualizer. */
export function slideSurfaceFrameFromInclination(
	heading: SlideHeading,
	inclinationDegrees: number,
): SlideSurfaceFrame {
	const planar = normalizeHeading(heading)
	const radians =
		(clampSlideInclinationDegrees(inclinationDegrees) * Math.PI) / 180
	const tangent = normalize3(
		{
			x: planar.localX * Math.cos(radians),
			y: -Math.sin(radians),
			z: planar.localZ * Math.cos(radians),
		},
		{ x: planar.localX, y: 0, z: planar.localZ },
	)
	const lateral = normalize3(
		{ x: -planar.localZ, y: 0, z: planar.localX },
		{ x: 1, y: 0, z: 0 },
	)
	const normal = normalize3(cross(lateral, tangent), UP)
	return { inclinationRadians: radians, lateral, normal, tangent }
}

export function slideSurfaceFrameFromMotion(
	motion: SlideMotion,
	groundNormal: SlideVector3,
	cachedHeading: SlideHeading = initialSlideHeading(),
): SlideSurfaceFrame {
	const speed = Math.hypot(motion.localVelocityX, motion.localVelocityZ)
	const heading =
		Number.isFinite(speed) && speed >= SLIDE_HEADING_MIN_SPEED
			? initialSlideHeading(motion)
			: cachedHeading
	return slideSurfaceFrameFromGroundNormal(heading, groundNormal)
}
