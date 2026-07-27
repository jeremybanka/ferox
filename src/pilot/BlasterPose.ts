import type { PilotRig } from "./PilotModel.ts"

export function alignBlasterHand(rig: PilotRig, elevation = 0, yaw = 0): void {
	rig.rightHand.rotation.x = elevation
	rig.rightHand.rotation.y += yaw
}
