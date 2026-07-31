import { definePilotPose, type PilotAnimationLayer } from "./PilotAnimation.ts"

const SLIDE_POSE = definePilotPose({
	root: { position: { y: -0.16 }, rotation: { x: -0.08, z: -0.08 } },
	hips: { position: { y: 1.08, z: 0.18 }, rotation: { x: -0.52, y: 0.08 } },
	body: { rotation: { x: 0.58, y: -0.12, z: 0.1 } },
	leftLeg: { rotation: { x: -0.92, y: -0.18, z: -0.1 } },
	leftKnee: { rotation: { x: 1.52 } },
	leftFoot: { rotation: { x: -0.42 } },
	rightLeg: { rotation: { x: 0.46, y: 0.14, z: 0.08 } },
	rightKnee: { rotation: { x: 0.5 } },
	rightFoot: { rotation: { x: -0.16 } },
	leftShoulder: { rotation: { x: -0.28, y: -0.2, z: -0.42 } },
	rightShoulder: { rotation: { x: 0.32, y: 0.1, z: 0.2 } },
})

export function slideAnimationLayer(): PilotAnimationLayer {
	return {
		fadeSeconds: 0.16,
		id: "locomotion:slide",
		mode: "override",
		pose: SLIDE_POSE,
	}
}
