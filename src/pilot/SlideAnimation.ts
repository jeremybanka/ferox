import {
	definePilotPose,
	type PilotAnimationLayer,
	type PilotPose,
} from "./PilotAnimation.ts"
import {
	initialSlideHeading,
	type SlideHeading,
	type SlideMotion,
} from "./SlideDirection.ts"

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
): PilotPose {
	const strafe = heading.localX
	const forward = -heading.localZ
	const rootTilt = slideTravelTilt(heading, 0.14)
	const bodyPitch =
		0.42 + Math.max(0, forward) * 0.16 - Math.max(0, -forward) * 0.2
	const hipsPitch =
		-0.34 - Math.max(0, forward) * 0.18 + Math.max(0, -forward) * 0.16

	return definePilotPose({
		root: {
			position: { y: -0.76 },
			rotation: { x: rootTilt.x, z: rootTilt.z },
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
			rotation: { x: 1.72, y: 1.78, z: -0.5 - strafe * 0.16 },
		},
		leftKnee: { rotation: { x: -3.22 } },
		leftFoot: { rotation: { x: -0.42, z: strafe * 0.12 } },
		rightLeg: {
			rotation: { x: 2.46, y: 0.14, z: 0.08 - strafe * 0.12 },
		},
		rightKnee: { rotation: { x: 0.5 } },
		rightFoot: { rotation: { x: -0.16, z: strafe * 0.08 } },
		rightShoulder: { rotation: { x: 0.6, y: 1.08, z: 1.16 } },
	})
}

export function slideAnimationLayer(
	motion: SlideMotion,
	heading = initialSlideHeading(motion),
): PilotAnimationLayer {
	return {
		fadeSeconds: 0.16,
		id: "locomotion:slide",
		mode: "override",
		pose: sampleSlideAnimationPose(motion, heading),
	}
}
