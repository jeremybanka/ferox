import * as THREE from "three"

export type PilotRig = {
	body: THREE.Group
	head: THREE.Group
	hips: THREE.Group
	leftArm: THREE.Group
	leftElbow: THREE.Group
	leftFoot: THREE.Group
	leftHand: THREE.Group
	leftKnee: THREE.Group
	leftLeg: THREE.Group
	leftShoulder: THREE.Group
	leftToe: THREE.Group
	neck: THREE.Group
	rightArm: THREE.Group
	rightElbow: THREE.Group
	rightFoot: THREE.Group
	rightHand: THREE.Group
	rightKnee: THREE.Group
	rightLeg: THREE.Group
	rightShoulder: THREE.Group
	rightToe: THREE.Group
	root: THREE.Group
	weapon: THREE.Group
	weaponMount: THREE.Group
}

const armorMaterial = new THREE.MeshStandardMaterial({
	color: "#d9d2c2",
	metalness: 0.58,
	roughness: 0.36,
})
const armorDarkMaterial = new THREE.MeshStandardMaterial({
	color: "#333a42",
	metalness: 0.72,
	roughness: 0.3,
})
const undersuitMaterial = new THREE.MeshStandardMaterial({
	color: "#11171c",
	metalness: 0.18,
	roughness: 0.72,
})
const accentMaterial = new THREE.MeshStandardMaterial({
	color: "#e76536",
	emissive: "#6b1d10",
	emissiveIntensity: 0.46,
	metalness: 0.52,
	roughness: 0.3,
})
const visorMaterial = new THREE.MeshStandardMaterial({
	color: "#79f5e2",
	emissive: "#1ca995",
	emissiveIntensity: 2.3,
	metalness: 0.48,
	roughness: 0.12,
})

function box(
	width: number,
	height: number,
	depth: number,
	material: THREE.Material,
): THREE.Mesh {
	return new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material)
}

function joint(radius: number): THREE.Mesh {
	const mesh = new THREE.Mesh(
		new THREE.IcosahedronGeometry(radius, 0),
		undersuitMaterial,
	)
	mesh.scale.y = 0.88
	return mesh
}

function makeArm(side: -1 | 1): {
	arm: THREE.Group
	elbow: THREE.Group
	hand: THREE.Group
	shoulder: THREE.Group
} {
	const shoulder = new THREE.Group()
	shoulder.position.set(side * 0.78, 1.2, 0)
	const shoulderJoint = joint(0.27)
	const pauldron = box(0.46, 0.34, 0.58, armorMaterial)
	pauldron.position.set(side * 0.08, 0.04, 0)
	pauldron.rotation.z = side * -0.12
	const stripe = box(0.12, 0.35, 0.6, accentMaterial)
	stripe.position.set(side * 0.13, 0.04, -0.015)
	shoulder.add(shoulderJoint, pauldron, stripe)

	const arm = new THREE.Group()
	const upperArm = box(0.34, 0.64, 0.38, armorDarkMaterial)
	upperArm.position.y = -0.38
	const upperPlate = box(0.39, 0.44, 0.43, armorMaterial)
	upperPlate.position.set(0, -0.27, -0.015)
	arm.add(upperArm, upperPlate)
	shoulder.add(arm)

	const elbow = new THREE.Group()
	elbow.position.y = -0.72
	elbow.add(joint(0.2))
	const forearm = box(0.38, 0.58, 0.44, armorMaterial)
	forearm.position.y = -0.34
	const forearmInset = box(0.22, 0.46, 0.47, armorDarkMaterial)
	forearmInset.position.set(0, -0.34, -0.02)
	elbow.add(forearm, forearmInset)
	arm.add(elbow)

	const hand = new THREE.Group()
	hand.position.y = -0.69
	const glove = box(0.31, 0.26, 0.34, undersuitMaterial)
	glove.position.y = -0.1
	hand.add(glove)
	elbow.add(hand)
	return { arm, elbow, hand, shoulder }
}

function makeLeg(side: -1 | 1): {
	foot: THREE.Group
	knee: THREE.Group
	leg: THREE.Group
	toe: THREE.Group
} {
	const leg = new THREE.Group()
	leg.position.set(side * 0.37, 0, 0)
	leg.add(joint(0.29))
	const thigh = box(0.48, 0.83, 0.55, armorDarkMaterial)
	thigh.position.y = -0.49
	const thighPlate = box(0.52, 0.57, 0.59, armorMaterial)
	thighPlate.position.set(0, -0.39, -0.02)
	leg.add(thigh, thighPlate)

	const knee = new THREE.Group()
	knee.position.y = -0.95
	knee.add(joint(0.24))
	const kneePlate = box(0.42, 0.3, 0.24, accentMaterial)
	kneePlate.position.set(0, -0.02, -0.27)
	knee.add(kneePlate)
	const shin = box(0.46, 0.72, 0.52, armorMaterial)
	shin.position.y = -0.45
	const calf = box(0.31, 0.5, 0.21, armorDarkMaterial)
	calf.position.set(0, -0.42, 0.32)
	knee.add(shin, calf)
	leg.add(knee)

	const foot = new THREE.Group()
	foot.position.y = -0.86
	const boot = box(0.5, 0.28, 0.73, armorDarkMaterial)
	boot.position.set(0, -0.06, -0.11)
	const toe = new THREE.Group()
	toe.position.set(0, -0.1, -0.28)
	const toePlate = box(0.52, 0.2, 0.32, armorMaterial)
	toePlate.position.z = -0.16
	toe.add(toePlate)
	foot.add(boot, toe)
	knee.add(foot)
	return { foot, knee, leg, toe }
}

function makeWeapon(): THREE.Group {
	const weapon = new THREE.Group()
	weapon.name = "blaster trigger attachment"
	const triggerPoint = new THREE.Vector3(0, -0.1, 0.04)
	const body = box(0.25, 0.26, 0.88, armorDarkMaterial)
	const shroud = box(0.31, 0.18, 0.48, accentMaterial)
	shroud.position.set(0, 0.06, -0.17)
	const barrel = new THREE.Mesh(
		new THREE.CylinderGeometry(0.075, 0.095, 0.55, 8),
		armorMaterial,
	)
	barrel.rotation.x = Math.PI / 2
	barrel.position.z = -0.66
	const emitter = new THREE.Mesh(
		new THREE.CylinderGeometry(0.09, 0.09, 0.05, 10),
		visorMaterial,
	)
	emitter.rotation.x = Math.PI / 2
	emitter.position.z = -0.95
	const grip = box(0.15, 0.38, 0.2, undersuitMaterial)
	grip.position.set(0, -0.25, 0.12)
	grip.rotation.x = -0.22
	const trigger = box(0.045, 0.1, 0.05, undersuitMaterial)
	trigger.position.copy(triggerPoint)
	weapon.add(body, shroud, barrel, emitter, grip, trigger)
	for (const part of weapon.children) {
		part.position.sub(triggerPoint)
	}
	return weapon
}

export function createPilotModel(): PilotRig {
	const root = new THREE.Group()
	root.name = "FEROX pilot"

	const hips = new THREE.Group()
	hips.position.y = 1.72
	const pelvis = box(0.86, 0.45, 0.56, armorDarkMaterial)
	const belt = box(0.98, 0.18, 0.62, accentMaterial)
	belt.position.y = 0.18
	hips.add(pelvis, belt)
	root.add(hips)

	const body = new THREE.Group()
	const chestShell = new THREE.Group()
	chestShell.position.y = 0.8
	const core = box(0.9, 1.05, 0.58, undersuitMaterial)
	const chest = box(1.2, 0.72, 0.72, armorMaterial)
	chest.position.set(0, 0.14, -0.03)
	const chestInset = box(0.56, 0.38, 0.75, armorDarkMaterial)
	chestInset.position.set(0, 0.12, -0.02)
	const sternum = box(0.2, 0.44, 0.78, accentMaterial)
	sternum.position.set(0, 0.11, -0.02)
	const abdomen = box(0.74, 0.32, 0.5, armorDarkMaterial)
	abdomen.position.y = -0.5
	chestShell.add(core, chest, chestInset, sternum, abdomen)
	body.add(chestShell)
	hips.add(body)

	const backpack = new THREE.Group()
	backpack.position.set(0, 0.86, 0.48)
	const pack = box(0.8, 0.82, 0.34, armorDarkMaterial)
	const leftCell = box(0.21, 0.62, 0.4, accentMaterial)
	leftCell.position.x = -0.38
	const rightCell = leftCell.clone()
	rightCell.position.x = 0.38
	backpack.add(pack, leftCell, rightCell)
	body.add(backpack)

	const neck = new THREE.Group()
	neck.position.y = 1.45
	const neckJoint = joint(0.24)
	neck.add(neckJoint)
	body.add(neck)
	const head = new THREE.Group()
	head.position.y = 0.29
	const helmet = new THREE.Mesh(
		new THREE.DodecahedronGeometry(0.48, 0),
		armorMaterial,
	)
	helmet.scale.set(1.02, 0.96, 1.08)
	const helmetCrown = box(0.54, 0.13, 0.66, accentMaterial)
	helmetCrown.position.set(0, 0.44, 0.02)
	const jaw = box(0.58, 0.22, 0.5, armorDarkMaterial)
	jaw.position.set(0, -0.26, -0.08)
	const visor = box(0.68, 0.24, 0.12, visorMaterial)
	visor.position.set(0, 0.06, -0.46)
	visor.rotation.x = -0.08
	const visorBrow = box(0.75, 0.1, 0.18, armorDarkMaterial)
	visorBrow.position.set(0, 0.22, -0.43)
	head.add(helmet, helmetCrown, jaw, visor, visorBrow)
	neck.add(head)

	const left = makeArm(-1)
	const right = makeArm(1)
	body.add(left.shoulder, right.shoulder)

	const leftLeg = makeLeg(-1)
	const rightLeg = makeLeg(1)
	hips.add(leftLeg.leg, rightLeg.leg)

	const weapon = makeWeapon()
	const weaponMount = new THREE.Group()
	weaponMount.name = "right index-finger weapon socket"
	weaponMount.position.set(0, -0.08, -0.16)
	weaponMount.add(weapon)
	// Trigger and index-finger sockets coincide. Aim and recoil are wrist motion.
	right.hand.add(weaponMount)

	root.traverse((child) => {
		if (child instanceof THREE.Mesh) {
			child.castShadow = true
			child.receiveShadow = true
		}
	})

	return {
		body,
		head,
		hips,
		leftArm: left.arm,
		leftElbow: left.elbow,
		leftFoot: leftLeg.foot,
		leftHand: left.hand,
		leftKnee: leftLeg.knee,
		leftLeg: leftLeg.leg,
		leftShoulder: left.shoulder,
		leftToe: leftLeg.toe,
		neck,
		rightArm: right.arm,
		rightElbow: right.elbow,
		rightFoot: rightLeg.foot,
		rightHand: right.hand,
		rightKnee: rightLeg.knee,
		rightLeg: rightLeg.leg,
		rightShoulder: right.shoulder,
		rightToe: rightLeg.toe,
		root,
		weapon,
		weaponMount,
	}
}

export function resetPilotPose(rig: PilotRig): void {
	rig.root.position.y = 0
	rig.root.rotation.set(0, 0, 0)
	rig.body.position.set(0, 0, 0)
	rig.body.rotation.set(0, 0, 0)
	rig.hips.position.set(0, 1.72, 0)
	rig.hips.rotation.set(0, 0, 0)
	rig.head.rotation.set(0, 0, 0)
	rig.neck.rotation.set(0, 0, 0)
	rig.leftShoulder.rotation.set(0, 0, 0)
	rig.rightShoulder.rotation.set(0, 0, 0)
	rig.leftArm.rotation.set(0, 0, 0)
	rig.rightArm.rotation.set(0, 0, 0)
	rig.leftElbow.rotation.set(0, 0, 0)
	rig.rightElbow.rotation.set(0, 0, 0)
	rig.leftHand.rotation.set(0, 0, 0)
	rig.rightHand.rotation.set(0, 0, 0)
	rig.leftLeg.rotation.set(0, 0, 0)
	rig.rightLeg.rotation.set(0, 0, 0)
	rig.leftKnee.rotation.set(0, 0, 0)
	rig.rightKnee.rotation.set(0, 0, 0)
	rig.leftFoot.rotation.set(0, 0, 0)
	rig.rightFoot.rotation.set(0, 0, 0)
	rig.leftToe.rotation.set(0, 0, 0)
	rig.rightToe.rotation.set(0, 0, 0)
	rig.weaponMount.position.set(0, -0.08, -0.16)
	rig.weaponMount.rotation.set(0, 0, 0)
	rig.weapon.position.set(0, 0, 0)
	rig.weapon.rotation.set(0, 0, 0)
}
