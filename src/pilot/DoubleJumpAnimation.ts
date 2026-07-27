import type { PilotRig } from "./PilotModel.ts"

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

	rig.body.position.y = keyframe(phase, 2.38, 2.64, 2.5)
	rig.body.rotation.x = keyframe(phase, 0.25, -0.06, 0.12)
	rig.body.rotation.y = keyframe(phase, 0.06, 0.34, 0.08)
	rig.body.rotation.z = keyframe(phase, -0.04, 0.1, 0)
	rig.head.rotation.x = keyframe(phase, -0.08, 0.12, -0.08)
	rig.head.rotation.y = keyframe(phase, 0, -0.14, 0)
	rig.head.rotation.z = keyframe(phase, 0.03, -0.08, 0)

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
	rig.leftFoot.rotation.x = keyframe(phase, 0.62, 0.38, -0.18)
	rig.leftFoot.rotation.z = keyframe(phase, 0, -0.12, -0.08)
	rig.rightFoot.rotation.x = keyframe(phase, 0.58, 0.48, -0.2)
	rig.rightFoot.rotation.z = keyframe(phase, 0, 0.12, 0.08)

	// A short recoil pulse sells the backpack firing without needing extra bones.
	rig.body.position.z = -boost * 0.08
	rig.hips.position.z = boost * 0.045
	rig.weapon.rotation.x = -(
		rig.rightShoulder.rotation.x +
		rig.rightArm.rotation.x +
		rig.rightElbow.rotation.x
	)
}
