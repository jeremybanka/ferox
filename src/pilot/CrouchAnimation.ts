import type { PilotRig } from "./PilotModel.ts"
import {
	definePilotKeyframes,
	definePilotPose,
	PILOT_JOINTS,
	RUN_INFLUENCE,
	sampleDraftAnimation,
	samplePilotKeyframes,
	type PilotAnimationLayer,
	type PilotJoint,
	type PilotPose,
	type PoseChannels,
} from "./PilotAnimation.ts"
import type { RunDirection } from "./RunAnimation.ts"

export const CROUCH_RUN_DURATION_SECONDS = 1

type CrouchLegFrame = {
	foot: number
	hip: number
	knee: number
	toe: number
}

type CrouchGaitFrame = {
	bodyY: number
	bodyYaw: number
	hipsRoll: number
	hipsY: number
	hipsYaw: number
	left: CrouchLegFrame
	right: CrouchLegFrame
	rootY: number
}

function crouchLeg(
	hip: number,
	knee: number,
	foot: number,
	toe: number,
): CrouchLegFrame {
	return { foot, hip, knee, toe }
}

const contactLeft: CrouchGaitFrame = {
	bodyY: -0.06,
	bodyYaw: -0.055,
	hipsRoll: -0.035,
	hipsY: 1.52,
	hipsYaw: 0.09,
	left: crouchLeg(1.42, -1.46, 0.08, 0.12),
	right: crouchLeg(0.38, -1.92, 0.68, 0.14),
	rootY: -0.5,
}

const passingLeft: CrouchGaitFrame = {
	bodyY: -0.05,
	bodyYaw: 0.015,
	hipsRoll: -0.02,
	hipsY: 1.54,
	hipsYaw: -0.02,
	left: crouchLeg(1.12, -1.55, 0.3, 0.12),
	right: crouchLeg(0.78, -2.05, 0.85, 0.28),
	rootY: -0.49,
}

const pushLeft: CrouchGaitFrame = {
	bodyY: -0.09,
	bodyYaw: -0.035,
	hipsRoll: -0.045,
	hipsY: 1.48,
	hipsYaw: 0.04,
	left: crouchLeg(0.7, -1.88, 0.78, 0.45),
	right: crouchLeg(1.05, -1.85, 0.55, 0.2),
	rootY: -0.53,
}

const flightLeft: CrouchGaitFrame = {
	bodyY: -0.03,
	bodyYaw: 0.065,
	hipsRoll: 0.03,
	hipsY: 1.59,
	hipsYaw: -0.08,
	left: crouchLeg(0.35, -2.02, 0.82, 0.28),
	right: crouchLeg(1.28, -1.62, 0.18, 0.14),
	rootY: -0.46,
}

function mirrorFrame(frame: CrouchGaitFrame): CrouchGaitFrame {
	return {
		...frame,
		bodyYaw: -frame.bodyYaw,
		hipsRoll: -frame.hipsRoll,
		hipsYaw: -frame.hipsYaw,
		left: frame.right,
		right: frame.left,
	}
}

function crouchGaitPose(frame: CrouchGaitFrame): PilotPose {
	return definePilotPose({
		body: {
			position: { y: frame.bodyY },
			rotation: { x: -0.57, y: frame.bodyYaw },
		},
		hips: {
			position: { y: frame.hipsY },
			rotation: {
				x: -0.12,
				y: frame.hipsYaw,
				z: frame.hipsRoll,
			},
		},
		leftFoot: { rotation: { x: frame.left.foot } },
		leftKnee: { rotation: { x: frame.left.knee } },
		leftLeg: { rotation: { x: frame.left.hip } },
		leftToe: { rotation: { x: frame.left.toe } },
		rightFoot: { rotation: { x: frame.right.foot } },
		rightKnee: { rotation: { x: frame.right.knee } },
		rightLeg: { rotation: { x: frame.right.hip } },
		rightToe: { rotation: { x: frame.right.toe } },
		root: { position: { y: frame.rootY } },
	})
}

const CROUCH_RUN_KEYFRAMES = [
	{ at: 0, label: "contact L", pose: crouchGaitPose(contactLeft) },
	{ at: 0.125, label: "passing L", pose: crouchGaitPose(passingLeft) },
	{ at: 0.208, label: "push L", pose: crouchGaitPose(pushLeft) },
	{ at: 0.33, label: "flight L", pose: crouchGaitPose(flightLeft) },
	{ at: 0.5, label: "contact R", pose: crouchGaitPose(mirrorFrame(contactLeft)) },
	{
		at: 0.625,
		label: "passing R",
		pose: crouchGaitPose(mirrorFrame(passingLeft)),
	},
	{ at: 0.708, label: "push R", pose: crouchGaitPose(mirrorFrame(pushLeft)) },
	{
		at: 0.83,
		label: "flight R",
		pose: crouchGaitPose(mirrorFrame(flightLeft)),
	},
	{ at: 1, label: "loop", pose: crouchGaitPose(contactLeft) },
] as const

const CROUCH_RUN_ANIMATION = definePilotKeyframes({
	keyframes: CROUCH_RUN_KEYFRAMES,
	loop: true,
})

export const CROUCH_RUN_KEYFRAME_MARKERS = CROUCH_RUN_KEYFRAMES.map(
	({ at, label }) => ({ label, progress: at }),
)

function crouchWeight(weight: number): number {
	return Math.max(0, Math.min(1, weight))
}

function applyGuardedCrouch(rig: PilotRig, weight: number): void {
	const amount = crouchWeight(weight)

	rig.root.position.y = -0.5 * amount
	rig.hips.position.y = 1.72 - 0.2 * amount
	rig.hips.rotation.x = -0.08 * amount
	rig.body.position.y = -0.06 * amount
	rig.body.rotation.x = -0.52 * amount
	rig.neck.rotation.x = -0.05 * amount
	rig.head.rotation.x = -0.07 * amount

	rig.leftLeg.rotation.x = 1.5 * amount
	rig.leftLeg.rotation.z = -0.22 * amount
	rig.rightLeg.rotation.x = 0.5 * amount
	rig.rightLeg.rotation.z = 0.22 * amount
	rig.leftKnee.rotation.x = -1.52 * amount
	rig.rightKnee.rotation.x = -1.92 * amount
	rig.leftFoot.rotation.x = 0.1 * amount
	rig.leftFoot.rotation.z = 0.1 * amount
	rig.rightFoot.rotation.x = 0.62 * amount
	rig.rightFoot.rotation.z = -0.1 * amount
	rig.leftToe.rotation.x = 0.12 * amount
	rig.rightToe.rotation.x = 0.12 * amount

	rig.leftShoulder.rotation.x = 0.62 * amount
	rig.leftShoulder.rotation.z = -0.18 * amount
	rig.leftArm.rotation.x = -0.28 * amount
	rig.leftArm.rotation.z = -0.42 * amount
	rig.leftElbow.rotation.x = 0.38 * amount
	rig.leftElbow.rotation.z = -0.16 * amount
	rig.leftHand.rotation.x = 0.2 * amount

	rig.rightShoulder.rotation.x = 0.74 * amount
	rig.rightShoulder.rotation.z = -0.12 * amount
	rig.rightArm.rotation.x = 0.1 * amount
	rig.rightArm.rotation.z = 0.2 * amount
	rig.rightElbow.rotation.x = 0.78 * amount
	rig.rightElbow.rotation.z = -0.68 * amount
	// alignBlasterHand(rig, 0.16 * amount)
}

const GUARDED_CROUCH_POSE = sampleDraftAnimation((rig) => {
	applyGuardedCrouch(rig, 1)
})

function blendChannels(
	crouch: PoseChannels | undefined,
	gait: PoseChannels | undefined,
	amount: number,
): PoseChannels | undefined {
	if (crouch === undefined && gait === undefined) return undefined
	const channels: PoseChannels = {}
	for (const axis of ["x", "y", "z"] as const) {
		const crouchValue = crouch?.[axis] ?? gait?.[axis]
		const gaitValue = gait?.[axis] ?? crouch?.[axis]
		if (crouchValue === undefined || gaitValue === undefined) continue
		channels[axis] = crouchValue + (gaitValue - crouchValue) * amount
	}
	return channels
}

function blendJoint(
	crouch: PilotPose[PilotJoint],
	gait: PilotPose[PilotJoint],
	amount: number,
): PilotPose[PilotJoint] {
	if (crouch === undefined && gait === undefined) return undefined
	const position = blendChannels(crouch?.position, gait?.position, amount)
	const rotation = blendChannels(crouch?.rotation, gait?.rotation, amount)
	return {
		...(position === undefined ? {} : { position }),
		...(rotation === undefined ? {} : { rotation }),
	}
}

function offsetRotation(
	pose: PilotPose,
	joint: PilotJoint,
	axis: "x" | "y" | "z",
	offset: number,
): void {
	const jointPose = pose[joint]
	if (jointPose === undefined) return
	jointPose.rotation ??= {}
	jointPose.rotation[axis] = (jointPose.rotation[axis] ?? 0) + offset
}

export function sampleCrouchRunAnimationPose(
	time: number,
	intensity: number,
	direction: RunDirection,
): PilotPose {
	const phaseDirection = direction === "backward" ? -1 : 1
	const progress =
		(time / CROUCH_RUN_DURATION_SECONDS) * phaseDirection
	const gaitPose = samplePilotKeyframes(CROUCH_RUN_ANIMATION, progress)
	const amount = crouchWeight(intensity)
	const pose: PilotPose = {}
	for (const joint of PILOT_JOINTS) {
		const blended = blendJoint(
			GUARDED_CROUCH_POSE[joint],
			gaitPose[joint],
			amount,
		)
		if (blended !== undefined) pose[joint] = blended
	}
	const strafe = direction === "left" ? -1 : direction === "right" ? 1 : 0
	offsetRotation(
		pose,
		"body",
		"x",
		(direction === "backward" ? 0.1 : direction === "forward" ? -0.04 : 0.02) *
			amount,
	)
	offsetRotation(pose, "root", "z", -strafe * 0.065 * amount)
	offsetRotation(pose, "hips", "z", -strafe * 0.075 * amount)
	offsetRotation(pose, "body", "z", -strafe * 0.12 * amount)
	offsetRotation(pose, "neck", "z", strafe * 0.03 * amount)
	offsetRotation(pose, "head", "z", strafe * 0.045 * amount)
	offsetRotation(pose, "leftLeg", "z", -strafe * 0.1 * amount)
	offsetRotation(pose, "rightLeg", "z", -strafe * 0.1 * amount)
	return pose
}

export function crouchRunAnimationLayer(
	time: number,
	intensity: number,
	direction: RunDirection,
): PilotAnimationLayer {
	return {
		fadeSeconds: 0.12,
		id: `locomotion:crouch-${direction}`,
		influence: RUN_INFLUENCE,
		mode: "override",
		pose: sampleCrouchRunAnimationPose(time, intensity, direction),
	}
}

export function applyCrouchIdleAnimation(
	rig: PilotRig,
	time: number,
	weight: number,
): void {
	const amount = crouchWeight(weight)
	const breathing = Math.sin(time * 2.6)
	const scan = Math.sin(time * 0.82)

	applyGuardedCrouch(rig, amount)
	rig.root.position.y += breathing * 0.018 * amount
	rig.hips.rotation.y = scan * 0.035 * amount
	rig.body.position.y += breathing * 0.014 * amount
	rig.body.rotation.y = scan * 0.025 * amount
	rig.neck.rotation.y = scan * 0.04 * amount
	rig.head.rotation.y = scan * 0.06 * amount
	rig.leftElbow.rotation.x += breathing * 0.025 * amount
	rig.rightElbow.rotation.x -= breathing * 0.02 * amount
}
