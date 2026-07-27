import type { PilotRig } from "./PilotModel.ts"

function smoothstep(value: number): number {
	return value * value * (3 - 2 * value)
}

export function applyWaveAnimation(rig: PilotRig, progress: number): void {
	const clamped = Math.min(1, Math.max(0, progress))
	const entrance = smoothstep(Math.min(1, clamped * 6))
	const exit = smoothstep(Math.min(1, (1 - clamped) * 6))
	const weight = Math.min(entrance, exit)
	const wave = Math.sin(clamped * Math.PI * 8)

	rig.body.rotation.z = 0.05 * weight
	rig.neck.rotation.z = -0.08 * weight
	rig.head.rotation.z = -0.1 * weight

	// The left hand is unarmed, so the pilot can wave without brandishing
	// the wrist-mounted blaster.
	rig.leftShoulder.rotation.x = 1.7 * weight
	rig.leftShoulder.rotation.y = 0.1 * weight
	rig.leftShoulder.rotation.z = -1.5 * weight
	rig.leftArm.rotation.y = -0.18 * weight
	rig.leftElbow.rotation.x = 1.18 * weight
	rig.leftHand.rotation.x = -0.18 * weight
	rig.leftHand.rotation.z = (-0.52 - wave * 0.42) * weight

	// casual bend knees
	rig.leftLeg.rotation.x = 0.1 * weight
	rig.leftLeg.rotation.y = 0.1 * weight
	rig.rightLeg.rotation.x = 0.1 * weight
	rig.rightLeg.rotation.y = -0.1 * weight

	rig.rightShoulder.rotation.z = 0.12 * weight
	rig.rightElbow.rotation.x = 0.28 * weight
	rig.hips.rotation.z = 0.025 * weight
}
