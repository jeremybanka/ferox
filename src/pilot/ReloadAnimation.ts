import * as THREE from "three"

import {
	definePilotPose,
	type PilotAnimationLayer,
	type PoseInfluence,
} from "./PilotAnimation.ts"

const RELOAD_INFLUENCE = {
	body: 0.28,
	leftArm: 1,
	leftElbow: 1,
	leftHand: 1,
	leftShoulder: 1,
	rightArm: 1,
	rightElbow: 1,
	rightHand: 1,
	rightShoulder: 1,
	weapon: 1,
	weaponMount: 1,
} as const satisfies PoseInfluence

export function reloadAnimationLayer(progress: number): PilotAnimationLayer {
	const folded = Math.sin(THREE.MathUtils.clamp(progress, 0, 1) * Math.PI)
	const snap = Math.sin(THREE.MathUtils.clamp(progress * 1.35, 0, 1) * Math.PI)
	return {
		fadeSeconds: 0.08,
		id: "combat:reload",
		influence: RELOAD_INFLUENCE,
		mode: "override",
		pose: definePilotPose({
			body: { rotation: { y: -0.1 * folded } },
			leftShoulder: {
				rotation: { x: -0.95 * folded, y: -0.48 * folded, z: -0.34 * folded },
			},
			leftArm: { rotation: { x: -0.55 * folded } },
			leftElbow: { rotation: { x: -1.45 * folded, y: 0.35 * folded } },
			rightShoulder: {
				rotation: { x: 0.72 * folded, y: 0.28 * folded, z: 0.2 * folded },
			},
			rightElbow: { rotation: { x: -0.82 * folded } },
			rightHand: { rotation: { x: 0.42 * folded, z: 0.2 * folded } },
			weaponMount: {
				rotation: { x: -Math.PI / 2 + 0.5 * folded, z: 0.3 * folded },
			},
			weapon: {
				position: { y: -0.18 * folded },
				rotation: { x: -0.35 * folded + 0.14 * snap },
			},
		}),
	}
}
