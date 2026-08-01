import * as THREE from "three"

import {
	definePilotPose,
	type PilotAnimationLayer,
	type PoseChannels,
	type PilotPose,
} from "./PilotAnimation.ts"
import {
	initialSlideHeading,
	type SlideHeading,
	type SlideMotion,
} from "./SlideDirection.ts"
import {
	slideSurfaceFrameFromInclination,
	type SlideSurfaceFrame,
	type SlideVector3,
} from "./SlideSurface.ts"

export {
	initialSlideHeading,
	SLIDE_HEADING_MIN_SPEED,
	SLIDE_HEADING_RESPONSE,
	slideDirectionFromMotion,
	stepSlideHeading,
	type SlideHeading,
	type SlideMotion,
} from "./SlideDirection.ts"

export const SLIDE_DURATION_SECONDS = 1.4

export const SLIDE_KEYFRAME_MARKERS = [
	{ label: "enter", progress: 0 },
	{ label: "low silhouette", progress: 0.18 },
	{ label: "dust cadence", progress: 0.5 },
	{ label: "exit", progress: 0.82 },
	{ label: "neutral", progress: 1 },
] as const

/** Keeps a sliding torso readable while the full tangent still drives travel. */
export const SLIDE_ROOT_SURFACE_RESPONSE = 0.42

export const SLIDE_LEG_ROTATION_LIMITS = {
	leftFoot: { x: [-0.8, 0.65], y: [-0.45, 0.45], z: [-0.45, 0.45] },
	leftKnee: { x: [0, 1.1], y: [-0.35, 0.35], z: [-0.35, 0.35] },
	leftLeg: { x: [-1.2, 0.9], y: [-0.55, 0.55], z: [-0.45, 0.45] },
	rightFoot: { x: [-0.8, 0.65], y: [-0.45, 0.45], z: [-0.45, 0.45] },
	rightKnee: { x: [0, 1.8], y: [-0.35, 0.35], z: [-0.35, 0.35] },
	rightLeg: { x: [-1.2, 1.1], y: [-0.55, 0.55], z: [-0.45, 0.45] },
} as const

type LegJoint = keyof typeof SLIDE_LEG_ROTATION_LIMITS

export function applySlideWorldYaw(
	localSurfaceRotation: THREE.Quaternion,
	yawRadians: number,
	localSurfaceOffset?: THREE.Vector3,
): void {
	localSurfaceOffset?.applyAxisAngle(new THREE.Vector3(0, 1, 0), yawRadians)
	localSurfaceRotation.premultiply(
		new THREE.Quaternion().setFromAxisAngle(
			new THREE.Vector3(0, 1, 0),
			yawRadians,
		),
	)
}

export function slidePresentationNormal(
	surface: SlideSurfaceFrame,
): SlideVector3 {
	const normal = new THREE.Vector3(0, 1, 0).lerp(
		new THREE.Vector3(surface.normal.x, surface.normal.y, surface.normal.z),
		SLIDE_ROOT_SURFACE_RESPONSE,
	)
	normal.normalize()
	return { x: normal.x, y: normal.y, z: normal.z }
}

function wrappedAngle(angle: number): number {
	return Math.atan2(Math.sin(angle), Math.cos(angle))
}

function constrainLegRotation(
	joint: LegJoint,
	rotation: Required<PoseChannels>,
): Required<PoseChannels> {
	const limits = SLIDE_LEG_ROTATION_LIMITS[joint]
	return Object.fromEntries(
		(["x", "y", "z"] as const).map((axis) => [
			axis,
			THREE.MathUtils.clamp(
				wrappedAngle(rotation[axis]),
				limits[axis][0],
				limits[axis][1],
			),
		]),
	) as Required<PoseChannels>
}

export function slideSurfaceRootRotation(
	surface: SlideSurfaceFrame,
	leanRadians = 0.14,
): Required<PoseChannels> {
	const presentationNormal = slidePresentationNormal(surface)
	const surfaceAlignment = new THREE.Quaternion().setFromUnitVectors(
		new THREE.Vector3(0, 1, 0),
		new THREE.Vector3(
			presentationNormal.x,
			presentationNormal.y,
			presentationNormal.z,
		).normalize(),
	)
	const directionalLean = new THREE.Quaternion().setFromAxisAngle(
		new THREE.Vector3(
			surface.lateral.x,
			surface.lateral.y,
			surface.lateral.z,
		).normalize(),
		-leanRadians,
	)
	const euler = new THREE.Euler().setFromQuaternion(
		directionalLean.multiply(surfaceAlignment),
		"XYZ",
	)
	return { x: euler.x, y: euler.y, z: euler.z }
}

function slideSurfaceRootPosition(
	surface: SlideSurfaceFrame,
	depth = 0.76,
): Required<PoseChannels> {
	const normal = slidePresentationNormal(surface)
	return {
		x: -normal.x * depth,
		y: -normal.y * depth,
		z: -normal.z * depth,
	}
}

export function slideTravelTilt(
	heading: SlideHeading,
	amount: number,
): { x: number; z: number } {
	return {
		x: heading.localZ * amount,
		z: -heading.localX * amount,
	}
}

export function sampleSlideAnimationPose(
	motion: SlideMotion,
	heading = initialSlideHeading(motion),
	surface = slideSurfaceFrameFromInclination(heading, 0),
): PilotPose {
	const strafe = heading.localX
	const forward = -heading.localZ
	const rootRotation = slideSurfaceRootRotation(surface)
	const bodyPitch =
		0.42 + Math.max(0, forward) * 0.16 - Math.max(0, -forward) * 0.2
	const hipsPitch =
		-0.34 - Math.max(0, forward) * 0.18 + Math.max(0, -forward) * 0.16

	return definePilotPose({
		root: {
			position: slideSurfaceRootPosition(surface),
			rotation: rootRotation,
		},
		hips: {
			position: { y: 1.08, z: 0.18 - forward * 0.04 },
			rotation: { x: hipsPitch, y: forward * 0.08, z: -strafe * 0.16 },
		},
		body: {
			rotation: {
				x: bodyPitch,
				y: -forward * 0.12,
				z: 0.06 - strafe * 0.24,
			},
		},
		leftShoulder: { rotation: { x: -0.8, y: -0.12, z: -0.8 } },
		leftArm: { rotation: { z: -0.16 } },
		leftElbow: { rotation: { x: 2.36 } },
		leftLeg: {
			rotation: constrainLegRotation("leftLeg", {
				x: 1.72,
				y: 1.78,
				z: -0.5 - strafe * 0.16,
			}),
		},
		leftKnee: {
			rotation: constrainLegRotation("leftKnee", { x: -3.22, y: 0, z: 0 }),
		},
		leftFoot: {
			rotation: constrainLegRotation("leftFoot", {
				x: -0.42,
				y: 0,
				z: strafe * 0.12,
			}),
		},
		rightLeg: {
			rotation: constrainLegRotation("rightLeg", {
				x: 2.46,
				y: 0.14,
				z: 0.08 - strafe * 0.12,
			}),
		},
		rightKnee: {
			rotation: constrainLegRotation("rightKnee", { x: 0.5, y: 0, z: 0 }),
		},
		rightFoot: {
			rotation: constrainLegRotation("rightFoot", {
				x: -0.16,
				y: 0,
				z: strafe * 0.08,
			}),
		},
		rightShoulder: { rotation: { x: 0.6, y: 1.08, z: 1.16 } },
	})
}

export function slideAnimationLayer(
	motion: SlideMotion,
	heading = initialSlideHeading(motion),
	surface = slideSurfaceFrameFromInclination(heading, 0),
): PilotAnimationLayer {
	return {
		fadeSeconds: 0.16,
		id: "locomotion:slide",
		mode: "override",
		pose: sampleSlideAnimationPose(motion, heading, surface),
	}
}
