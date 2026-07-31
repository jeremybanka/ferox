import * as THREE from "three"

import { definePilotPose, type PilotAnimationLayer } from "./PilotAnimation.ts"

export function deathAnimationLayer(
	elapsedSeconds: number,
): PilotAnimationLayer {
	const progress = THREE.MathUtils.smoothstep(elapsedSeconds, 0, 0.72)
	return {
		fadeSeconds: 0.08,
		id: "lifecycle:death",
		mode: "override",
		pose: definePilotPose({
			root: {
				position: { y: -0.76 * progress, z: 0.34 * progress },
				rotation: { x: -1.42 * progress, z: 0.24 * progress },
			},
			hips: { position: { y: 1.72 - 0.34 * progress } },
			body: { rotation: { x: 0.38 * progress, z: -0.16 * progress } },
			neck: { rotation: { x: 0.44 * progress } },
			leftShoulder: { rotation: { x: -0.8 * progress, z: -0.75 * progress } },
			rightShoulder: { rotation: { x: -0.6 * progress, z: 0.7 * progress } },
			leftLeg: { rotation: { x: -0.42 * progress, z: -0.2 * progress } },
			rightLeg: { rotation: { x: 0.3 * progress, z: 0.18 * progress } },
			weapon: { rotation: { x: 0.6 * progress, z: 0.5 * progress } },
		}),
	}
}
