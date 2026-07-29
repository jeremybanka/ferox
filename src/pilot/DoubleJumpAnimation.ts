import { alignBlasterHand } from "./BlasterPose.ts"
import type { PilotRig } from "./PilotModel.ts"

export const DOUBLE_JUMP_KEYFRAME_MARKERS = [
	{ label: "tuck", progress: 0 },
	{ label: "boost", progress: 0.5 },
	{ label: "stabilize", progress: 1 },
] as const

function smoothstep(value: number): number {
	return value * value * (3 - 2 * value)
}

function keyframe(
	progress: number,
	start: number,
	apex: number,
	finish: number,
): number {
	if (progress <= 0.5) {
		return start + (apex - start) * smoothstep(progress * 2)
	}

	return apex + (finish - apex) * smoothstep((progress - 0.5) * 2)
}

export function applyDoubleJumpAnimation(
	rig: PilotRig,
	progress: number,
): void {
	const phase = Math.min(1, Math.max(0, progress))
	const boost = Math.sin(phase * Math.PI)

	// The second boost starts as a tight midair tuck, snaps into a compact
	// asymmetric twist, then opens the heavy suit into a stable landing shape.
	rig.root.position.y = keyframe(phase, -0.1, 0.22, 0)
	rig.root.rotation.x = keyframe(phase, -0.16, 0.08, -0.04)
	rig.root.rotation.z = keyframe(phase, -0.04, 0.14, 0.02)

	rig.hips.position.y = keyframe(phase, 1.58, 1.8, 1.68)
	rig.hips.rotation.x = keyframe(phase, 0.22, -0.1, 0.04)
	rig.hips.rotation.y = keyframe(phase, -0.08, -0.42, -0.06)
	rig.hips.rotation.z = keyframe(phase, 0.04, -0.08, 0)

	rig.body.position.y = keyframe(phase, 0, 0.04, 0.02)
	rig.body.rotation.x = keyframe(phase, 0.25, -0.06, 0.12)
	rig.body.rotation.y = keyframe(phase, 0.06, 0.34, 0.08)
	rig.body.rotation.z = keyframe(phase, -0.04, 0.1, 0)
	rig.neck.rotation.x = keyframe(phase, -0.03, 0.05, -0.03)
	rig.neck.rotation.y = keyframe(phase, 0, -0.06, 0)
	rig.neck.rotation.z = keyframe(phase, 0.01, -0.03, 0)
	rig.head.rotation.x = keyframe(phase, -0.05, 0.07, -0.05)
	rig.head.rotation.y = keyframe(phase, 0, -0.08, 0)
	rig.head.rotation.z = keyframe(phase, 0.02, -0.05, 0)

	rig.leftShoulder.rotation.x = keyframe(phase, -0.34, -0.76, -0.18)
	rig.leftShoulder.rotation.z = keyframe(phase, -0.2, -0.58, -0.82)
	rig.rightShoulder.rotation.x = keyframe(phase, -0.22, 0.18, -0.12)
	rig.rightShoulder.rotation.z = keyframe(phase, 0.18, 0.42, 0.72)
	rig.leftArm.rotation.x = keyframe(phase, -0.7, -1.08, -0.4)
	rig.leftArm.rotation.z = keyframe(phase, -0.18, -0.32, -0.16)
	rig.rightArm.rotation.x = keyframe(phase, -0.5, -0.84, -0.34)
	rig.rightArm.rotation.z = keyframe(phase, 0.14, 0.26, 0.12)
	rig.leftElbow.rotation.x = keyframe(phase, 1.22, 1.55, 0.58)
	rig.leftElbow.rotation.y = keyframe(phase, 0.08, 0.28, 0)
	rig.rightElbow.rotation.x = keyframe(phase, 1.16, 1.38, 0.62)
	rig.rightElbow.rotation.y = keyframe(phase, -0.08, -0.24, 0)

	rig.leftLeg.rotation.x = keyframe(phase, -1.08, -0.82, -0.38)
	rig.leftLeg.rotation.y = keyframe(phase, 0.12, 0.28, 0.04)
	rig.leftLeg.rotation.z = keyframe(phase, -0.12, -0.32, -0.26)
	rig.rightLeg.rotation.x = keyframe(phase, -1.02, -1.22, -0.3)
	rig.rightLeg.rotation.y = keyframe(phase, -0.12, -0.24, -0.04)
	rig.rightLeg.rotation.z = keyframe(phase, 0.12, 0.28, 0.26)
	rig.leftKnee.rotation.x = keyframe(phase, -1.12, -1.46, -0.58)
	rig.rightKnee.rotation.x = keyframe(phase, -1.24, -1.58, -0.62)
	rig.leftFoot.rotation.x =
		-(rig.leftLeg.rotation.x + rig.leftKnee.rotation.x) +
		keyframe(phase, 0.08, -0.12, -0.04)
	rig.leftFoot.rotation.z = keyframe(phase, 0, -0.12, -0.08)
	rig.rightFoot.rotation.x = 0
	keyframe(phase, 0.06, -0.1, -0.04)
	rig.rightFoot.rotation.z = keyframe(phase, 0, 0.12, 0.08)
	rig.leftToe.rotation.x = keyframe(phase, 0.12, 0.34, 0.06)
	rig.rightToe.rotation.x = keyframe(phase, 0.1, 0.38, 0.06)

	// A short recoil pulse sells the backpack firing without needing extra bones.
	rig.body.position.z = -boost * 0.08
	rig.hips.position.z = boost * 0.045
	rig.leftHand.rotation.x = keyframe(phase, -0.08, 0.18, 0)
	alignBlasterHand(rig, keyframe(phase, -0.06, 0.14, 0))
}
