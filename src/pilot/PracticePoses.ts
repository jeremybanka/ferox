import { applyFreeAimPose } from "./AimPose.ts"
import { alignBlasterHand } from "./BlasterPose.ts"
import type { PilotRig } from "./PilotModel.ts"

export type PoseBucket = "apex" | "badass" | "goofy" | "jank"

type ArmPose =
	| "aim"
	| "crossed"
	| "guard"
	| "high"
	| "loose"
	| "point"
	| "spread"
	| "twist"

type StancePose =
	| "airborne"
	| "crouch"
	| "kneel"
	| "left-lunge"
	| "neutral"
	| "right-lunge"
	| "tiptoe"
	| "wide"

export type PracticePose = {
	arms: ArmPose
	bucket: PoseBucket
	head: number
	id: string
	lean: number
	name: string
	stance: StancePose
	twist: number
}

export const POSE_BUCKETS: ReadonlyArray<{
	id: PoseBucket
	label: string
	note: string
}> = [
	{ id: "apex", label: "S // APEX", note: "Certified poster material" },
	{ id: "badass", label: "A // BADASS", note: "Combat-readable and mean" },
	{ id: "goofy", label: "G // GOOFY", note: "Wrong in a useful way" },
	{ id: "jank", label: "J // JANK", note: "Back to the rigging bay" },
]

const recipes: ReadonlyArray<
	readonly [string, PoseBucket, StancePose, ArmPose, number, number, number]
> = [
	["Last Light", "apex", "left-lunge", "aim", 0.16, -0.18, 0.08],
	["Iron Vow", "badass", "wide", "crossed", -0.08, 0.12, -0.04],
	["Breach Saint", "apex", "crouch", "aim", 0.22, 0.14, -0.08],
	["Deadeye", "apex", "kneel", "aim", 0.14, -0.1, 0.04],
	["No Surrender", "badass", "wide", "high", -0.1, -0.16, -0.1],
	["Ash Walker", "apex", "right-lunge", "guard", 0.18, 0.22, 0.06],
	["Zero Hour", "apex", "airborne", "aim", -0.12, -0.28, 0.02],
	["Void Marshal", "badass", "neutral", "crossed", -0.06, 0.24, -0.08],
	["Drop Shock", "badass", "kneel", "high", 0.3, -0.2, -0.14],
	["Red Horizon", "badass", "left-lunge", "point", 0.12, 0.3, 0.08],
	["Grav Hammer", "badass", "wide", "high", 0.2, -0.22, 0.06],
	["Final Warning", "badass", "right-lunge", "point", 0.18, -0.3, -0.04],
	["Forward Guard", "badass", "neutral", "guard", 0.08, 0.06, -0.03],
	["Corner Slice", "apex", "left-lunge", "aim", 0.2, 0.1, 0.04],
	["Low Hunter", "badass", "crouch", "guard", 0.24, -0.08, -0.1],
	["Watch Six", "apex", "wide", "aim", -0.04, 0.34, 0.12],
	["Hard Landing", "badass", "kneel", "guard", 0.28, 0.16, -0.08],
	["Mag Check", "badass", "neutral", "twist", 0.06, -0.12, 0.12],
	["Hold Fast", "badass", "wide", "guard", 0.04, 0.08, 0],
	["Skyline", "badass", "airborne", "spread", -0.14, 0.16, -0.05],
	["Pursuit", "badass", "right-lunge", "guard", 0.26, -0.08, -0.06],
	["Sentinel", "badass", "neutral", "aim", -0.02, 0.18, 0.04],
	["Counterfire", "apex", "left-lunge", "aim", 0.12, -0.26, 0.1],
	["Shield Line", "badass", "wide", "crossed", 0.04, -0.12, 0],
	["Close Quarters", "badass", "crouch", "twist", 0.2, 0.22, -0.08],
	["High Ready", "badass", "neutral", "high", -0.06, -0.06, -0.04],
	["Overwatch", "apex", "kneel", "aim", 0.1, 0.24, 0.06],
	["Ridge Runner", "apex", "right-lunge", "aim", 0.18, 0.16, 0.04],
	["Finger Guns", "goofy", "wide", "point", -0.1, 0.12, 0.18],
	["Disco Armor", "goofy", "tiptoe", "high", -0.16, 0.34, 0.2],
	["Big Shrug", "goofy", "neutral", "spread", -0.08, -0.04, 0.22],
	["Sneaky Boots", "goofy", "tiptoe", "guard", 0.24, -0.24, -0.16],
	["Victory Lap", "goofy", "airborne", "high", -0.18, 0.32, 0.1],
	["Where Ammo", "goofy", "wide", "spread", 0.08, -0.32, -0.2],
	["Tiny Salute", "goofy", "neutral", "high", -0.04, 0.26, -0.18],
	["Crab Tactics", "goofy", "crouch", "spread", 0.18, 0.38, 0.14],
	["Moonwalk", "goofy", "right-lunge", "loose", -0.18, -0.28, 0.12],
	["Drama Cape", "goofy", "left-lunge", "spread", -0.16, 0.3, -0.14],
	["Tea Kettle", "goofy", "tiptoe", "crossed", -0.2, -0.36, 0.2],
	["Lost Tourist", "goofy", "neutral", "point", 0.02, 0.42, -0.22],
	["Noodle Collapse", "jank", "crouch", "loose", 0.52, 0.5, 0.36],
	["Pretzel Protocol", "jank", "kneel", "twist", -0.44, -0.72, 0.42],
	["Broken Compass", "jank", "wide", "point", 0.46, 0.8, -0.5],
	["Backward Knees", "jank", "tiptoe", "guard", -0.5, -0.48, 0.38],
	["Shoulder Error", "jank", "neutral", "high", 0.38, 0.68, -0.44],
	["Crab Emergency", "jank", "crouch", "twist", -0.42, -0.66, 0.46],
	["Physics Pending", "jank", "airborne", "loose", 0.48, 0.72, -0.4],
	["Marionette Lag", "jank", "tiptoe", "spread", -0.38, 0.62, 0.48],
	["Helmet First", "jank", "right-lunge", "loose", 0.58, -0.58, 0.5],
	["Warranty Void", "jank", "left-lunge", "twist", -0.56, 0.76, -0.46],
]

export const PRACTICE_POSES: readonly PracticePose[] = recipes.map(
	([name, bucket, stance, arms, lean, twist, head], index) => ({
		arms,
		bucket,
		head,
		id: `${String(index + 1).padStart(2, "0")}-${name
			.toLowerCase()
			.replaceAll(" ", "-")}`,
		lean,
		name,
		stance,
		twist,
	}),
)

function applyStance(rig: PilotRig, stance: StancePose): void {
	switch (stance) {
		case "wide": {
			rig.leftLeg.rotation.z = -0.28
			rig.rightLeg.rotation.z = 0.28
			rig.leftKnee.rotation.x = -0.14
			rig.rightKnee.rotation.x = -0.14
			rig.leftFoot.rotation.z = 0.12
			rig.rightFoot.rotation.z = -0.12
			break
		}
		case "left-lunge": {
			rig.leftLeg.rotation.x = -0.72
			rig.rightLeg.rotation.x = 0.42
			rig.leftKnee.rotation.x = -0.42
			rig.rightKnee.rotation.x = -0.88
			rig.leftFoot.rotation.x = 1.14
			rig.rightFoot.rotation.x = 0.46
			rig.rightToe.rotation.x = 0.18
			rig.hips.rotation.y = -0.18
			break
		}
		case "right-lunge": {
			rig.leftLeg.rotation.x = 0.42
			rig.rightLeg.rotation.x = -0.72
			rig.leftKnee.rotation.x = -0.88
			rig.rightKnee.rotation.x = -0.42
			rig.leftFoot.rotation.x = 0.46
			rig.rightFoot.rotation.x = 1.14
			rig.leftToe.rotation.x = 0.18
			rig.hips.rotation.y = 0.18
			break
		}
		case "crouch": {
			rig.root.position.y = -0.38
			rig.hips.position.y = 1.48
			rig.body.position.y = 0
			rig.leftLeg.rotation.x = 0.58
			rig.rightLeg.rotation.x = 0.58
			rig.leftLeg.rotation.z = -0.22
			rig.rightLeg.rotation.z = 0.22
			rig.leftKnee.rotation.x = -1.18
			rig.rightKnee.rotation.x = -1.18
			rig.leftFoot.rotation.x = 0.6
			rig.rightFoot.rotation.x = 0.6
			rig.leftToe.rotation.x = 0.12
			rig.rightToe.rotation.x = 0.12
			break
		}
		case "kneel": {
			rig.root.position.y = -0.52
			rig.leftLeg.rotation.x = -0.2
			rig.rightLeg.rotation.x = 1.14
			rig.leftKnee.rotation.x = -0.76
			rig.rightKnee.rotation.x = -1.52
			rig.leftFoot.rotation.x = 0.96
			rig.rightFoot.rotation.x = 0.38
			rig.leftToe.rotation.x = 0.16
			rig.rightToe.rotation.x = 0.28
			rig.hips.rotation.x = 0.18
			break
		}
		case "airborne": {
			rig.root.position.y = 0.54
			rig.leftLeg.rotation.x = -0.74
			rig.rightLeg.rotation.x = 0.58
			rig.leftKnee.rotation.x = -1.08
			rig.rightKnee.rotation.x = -1.28
			rig.leftFoot.rotation.x = 1.82
			rig.rightFoot.rotation.x = 0.7
			rig.leftToe.rotation.x = 0.32
			rig.rightToe.rotation.x = 0.26
			break
		}
		case "tiptoe": {
			rig.root.position.y = 0.16
			rig.leftKnee.rotation.x = -0.18
			rig.rightKnee.rotation.x = -0.18
			rig.leftFoot.rotation.x = -0.72
			rig.rightFoot.rotation.x = -0.72
			rig.leftToe.rotation.x = 0.72
			rig.rightToe.rotation.x = 0.72
			rig.leftLeg.rotation.z = -0.08
			rig.rightLeg.rotation.z = 0.08
			break
		}
		case "neutral": {
			break
		}
	}
}

function applyArms(rig: PilotRig, arms: ArmPose): void {
	switch (arms) {
		case "aim": {
			applyFreeAimPose(rig, -0.08, 0.04, 1)
			break
		}
		case "guard": {
			rig.leftShoulder.rotation.x = 0.52
			rig.rightShoulder.rotation.x = 0.7
			rig.leftElbow.rotation.x = 0.86
			rig.rightElbow.rotation.x = 0.98
			rig.leftHand.rotation.x = 0.12
			rig.rightHand.rotation.x = 0.12
			break
		}
		case "crossed": {
			rig.leftShoulder.rotation.x = 0.68
			rig.rightShoulder.rotation.x = 0.68
			rig.leftShoulder.rotation.z = 0.48
			rig.rightShoulder.rotation.z = -0.48
			rig.leftElbow.rotation.x = 1.22
			rig.rightElbow.rotation.x = 1.22
			rig.leftHand.rotation.z = -0.32
			rig.rightHand.rotation.z = 0.32
			break
		}
		case "high": {
			rig.leftShoulder.rotation.x = 0.34
			rig.rightShoulder.rotation.x = 0.2
			rig.leftShoulder.rotation.z = -1.6
			rig.rightShoulder.rotation.z = 1.18
			rig.leftElbow.rotation.x = 0.52
			rig.rightElbow.rotation.x = 0.72
			rig.leftHand.rotation.x = 0.24
			rig.rightHand.rotation.x = 0.2
			break
		}
		case "point": {
			rig.leftShoulder.rotation.x = 1.34
			rig.leftElbow.rotation.x = 0.08
			rig.rightShoulder.rotation.x = 0.48
			rig.rightElbow.rotation.x = 0.82
			rig.leftHand.rotation.x = -0.1
			rig.rightHand.rotation.x = 0.14
			break
		}
		case "spread": {
			rig.leftShoulder.rotation.z = -1.28
			rig.rightShoulder.rotation.z = 1.28
			rig.leftElbow.rotation.x = 0.22
			rig.rightElbow.rotation.x = 0.22
			rig.leftHand.rotation.z = -0.18
			rig.rightHand.rotation.z = 0.18
			break
		}
		case "twist": {
			rig.leftShoulder.rotation.x = 1.08
			rig.rightShoulder.rotation.x = -0.42
			rig.leftShoulder.rotation.z = 0.36
			rig.rightShoulder.rotation.z = -0.48
			rig.leftElbow.rotation.x = 1.36
			rig.rightElbow.rotation.x = 0.36
			rig.leftHand.rotation.x = 0.22
			rig.rightHand.rotation.z = -0.2
			break
		}
		case "loose": {
			rig.leftShoulder.rotation.z = 0.38
			rig.rightShoulder.rotation.z = -0.42
			rig.leftElbow.rotation.z = -0.52
			rig.rightElbow.rotation.z = 0.62
			rig.leftHand.rotation.z = -0.24
			rig.rightHand.rotation.z = 0.28
			break
		}
	}
}

export function applyPracticePose(
	rig: PilotRig,
	pose: PracticePose,
	index: number,
): void {
	applyStance(rig, pose.stance)
	applyArms(rig, pose.arms)

	const variation = Math.sin(index * 2.17) * 0.05
	rig.body.rotation.x -= pose.lean
	rig.body.rotation.y += pose.twist
	rig.body.rotation.z += variation
	rig.hips.rotation.y -= pose.twist * 0.44
	rig.neck.rotation.x += pose.head * 0.4
	rig.neck.rotation.y -= pose.twist * 0.1
	rig.head.rotation.x += pose.head * 0.6
	rig.head.rotation.y -= pose.twist * 0.18

	if (pose.bucket === "goofy") {
		rig.head.rotation.z += Math.sin(index) * 0.24
		rig.leftFoot.rotation.y += Math.cos(index) * 0.3
		rig.leftToe.rotation.x += Math.max(0, Math.sin(index)) * 0.36
	}

	if (pose.bucket === "jank") {
		rig.leftLeg.rotation.z += Math.sin(index * 1.3) * 0.58
		rig.rightLeg.rotation.z += Math.cos(index * 1.7) * 0.58
		rig.leftKnee.rotation.x += Math.sin(index * 1.9) * 0.42
		rig.rightKnee.rotation.x += Math.cos(index * 1.5) * 0.42
		rig.leftShoulder.rotation.y += Math.sin(index) * 0.72
		rig.rightShoulder.rotation.y -= Math.cos(index) * 0.72
		rig.rightHand.rotation.z += Math.sin(index * 2) * 0.48
	}

	if (pose.arms !== "aim") {
		alignBlasterHand(rig, rig.rightHand.rotation.x)
	}
}
