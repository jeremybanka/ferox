import type { PilotRig } from "./PilotModel.ts"

export function alignBlasterHand(rig: PilotRig, elevation = 0, yaw = 0): void {
	rig.rightHand.rotation.x =
		-(
			rig.rightShoulder.rotation.x +
			rig.rightArm.rotation.x +
			rig.rightElbow.rotation.x
		) + elevation
	rig.rightHand.rotation.y += yaw
}
