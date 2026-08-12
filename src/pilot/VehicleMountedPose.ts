import type { VehicleSeatId } from "../arena-protocol.ts"
import {
	definePilotPose,
	FULL_BODY_INFLUENCE,
	type PilotAnimationLayer,
} from "./PilotAnimation.ts"

/** Stable seated silhouette used for every remote vehicle occupant role. */
export function vehicleMountedLayer(
	seatId: VehicleSeatId,
): PilotAnimationLayer {
	const handsForward = seatId === "driver" || seatId === "rider"
	return {
		fadeSeconds: 0.12,
		id: `vehicle:${seatId}`,
		influence: FULL_BODY_INFLUENCE,
		mode: "override",
		pose: definePilotPose({
			body: { rotation: { x: seatId === "rider" ? -0.3 : -0.12 } },
			hips: { position: { y: 1.5 }, rotation: { x: -0.18 } },
			leftArm: { rotation: { x: handsForward ? -1.05 : -0.38, z: -0.16 } },
			leftElbow: { rotation: { x: handsForward ? -1.22 : -0.72 } },
			leftLeg: { rotation: { x: 1.05, z: -0.12 } },
			leftKnee: { rotation: { x: -1.5 } },
			rightArm: { rotation: { x: handsForward ? -1.05 : -0.38, z: 0.16 } },
			rightElbow: { rotation: { x: handsForward ? -1.22 : -0.72 } },
			rightLeg: { rotation: { x: 1.05, z: 0.12 } },
			rightKnee: { rotation: { x: -1.5 } },
			root: { position: { y: -0.72 } },
			weaponMount: { rotation: { x: Math.PI / 2 } },
		}),
		weight: 1,
	}
}
