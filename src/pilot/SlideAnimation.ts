import {
	definePilotPose,
	type PilotAnimationLayer,
	type PilotPose,
} from "./PilotAnimation.ts"
import { slideDirectionFromMotion, type SlideMotion } from "./SlideDirection.ts"

export { slideDirectionFromMotion, type SlideMotion } from "./SlideDirection.ts"

export const SLIDE_DURATION_SECONDS = 1.4

export const SLIDE_KEYFRAME_MARKERS = [
	{ label: "enter", progress: 0 },
	{ label: "low silhouette", progress: 0.18 },
	{ label: "dust cadence", progress: 0.5 },
	{ label: "exit", progress: 0.82 },
	{ label: "neutral", progress: 1 },
] as const

export function sampleSlideAnimationPose(motion: SlideMotion): PilotPose {
	const direction = slideDirectionFromMotion(motion)
	const strafe = direction === "left" ? -1 : direction === "right" ? 1 : 0
	const forward =
		direction === "forward" ? 1 : direction === "backward" ? -1 : 0
	const bodyPitch = forward > 0 ? 0.58 : forward < 0 ? 0.22 : 0.42
	const hipsPitch = forward > 0 ? -0.52 : forward < 0 ? -0.18 : -0.34

	return definePilotPose({
		root: {
			position: { y: -0.16 },
			rotation: { x: -0.08 * forward, z: -0.04 - strafe * 0.14 },
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
		leftLeg: {
			rotation: { x: -0.92, y: -0.18, z: -0.1 - strafe * 0.16 },
		},
		leftKnee: { rotation: { x: 1.52 } },
		leftFoot: { rotation: { x: -0.42, z: strafe * 0.12 } },
		rightLeg: {
			rotation: { x: 0.46, y: 0.14, z: 0.08 - strafe * 0.12 },
		},
		rightKnee: { rotation: { x: 0.5 } },
		rightFoot: { rotation: { x: -0.16, z: strafe * 0.08 } },
		leftShoulder: {
			rotation: { x: -0.28, y: -0.2, z: -0.42 - strafe * 0.12 },
		},
		rightShoulder: {
			rotation: { x: 0.32, y: 0.1, z: 0.2 - strafe * 0.12 },
		},
	})
}

export function slideAnimationLayer(motion: SlideMotion): PilotAnimationLayer {
	const direction = slideDirectionFromMotion(motion)
	return {
		fadeSeconds: 0.16,
		id: `locomotion:slide-${direction}`,
		mode: "override",
		pose: sampleSlideAnimationPose(motion),
	}
}
