import * as THREE from "three"

import {
	gunDefinition,
	gunPresentation,
	type GunId,
	type GunPresentationView,
	type GunTransform,
} from "./GunDefinitions.ts"

export type GunPalette = {
	accent: THREE.ColorRepresentation
	accentEmissive: THREE.ColorRepresentation
	body: THREE.ColorRepresentation
}

export const DEFAULT_GUN_PALETTE: GunPalette = {
	accent: "#e86d3f",
	accentEmissive: "#a72819",
	body: "#26303b",
}

export type GunModel = {
	dispose: () => void
	id: GunId
	muzzle: THREE.Group
	root: THREE.Group
}

function materialPalette(palette: GunPalette): {
	accent: THREE.MeshStandardMaterial
	body: THREE.MeshStandardMaterial
} {
	return {
		accent: new THREE.MeshStandardMaterial({
			color: palette.accent,
			emissive: palette.accentEmissive,
			emissiveIntensity: 0.8,
			metalness: 0.45,
			roughness: 0.28,
		}),
		body: new THREE.MeshStandardMaterial({
			color: palette.body,
			metalness: 0.72,
			roughness: 0.3,
		}),
	}
}

function box(
	width: number,
	height: number,
	depth: number,
	material: THREE.Material,
): THREE.Mesh {
	return new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material)
}

function buildArcBlaster(
	root: THREE.Group,
	muzzle: THREE.Group,
	materials: ReturnType<typeof materialPalette>,
): void {
	const triggerPoint = new THREE.Vector3(0, -0.1, 0.04)
	const body = box(0.25, 0.26, 0.88, materials.body)
	const shroud = box(0.31, 0.18, 0.48, materials.body)
	shroud.position.set(0, 0.06, -0.17)
	const barrel = new THREE.Mesh(
		new THREE.CylinderGeometry(0.075, 0.095, 0.55, 8),
		materials.accent,
	)
	barrel.rotation.x = Math.PI / 2
	barrel.position.z = -0.66
	const grip = box(0.15, 0.38, 0.2, materials.body)
	grip.position.set(0, -0.25, 0.12)
	grip.rotation.x = -0.22
	const trigger = box(0.045, 0.1, 0.05, materials.accent)
	trigger.position.copy(triggerPoint)
	const sight = box(0.07, 0.11, 0.14, materials.accent)
	sight.position.set(0, 0.19, -0.2)
	root.add(body, shroud, barrel, grip, trigger, sight)
	for (const part of root.children) part.position.sub(triggerPoint)
	muzzle.position.set(0, 0.1, -0.975)
}

function buildMiniMissileLauncher(
	root: THREE.Group,
	muzzle: THREE.Group,
	materials: ReturnType<typeof materialPalette>,
): void {
	const triggerPoint = new THREE.Vector3(0, -0.11, 0.06)
	const tube = new THREE.Mesh(
		new THREE.CylinderGeometry(0.2, 0.23, 1.02, 10),
		materials.body,
	)
	tube.rotation.x = Math.PI / 2
	tube.position.z = -0.38
	const frontBand = new THREE.Mesh(
		new THREE.CylinderGeometry(0.245, 0.245, 0.16, 10),
		materials.accent,
	)
	frontBand.rotation.x = Math.PI / 2
	frontBand.position.z = -0.84
	const rearBand = new THREE.Mesh(
		new THREE.CylinderGeometry(0.245, 0.245, 0.16, 10),
		materials.accent,
	)
	rearBand.rotation.x = Math.PI / 2
	rearBand.position.z = 0.03
	const topPod = box(0.23, 0.2, 0.48, materials.accent)
	topPod.position.set(0, 0.24, -0.34)
	const warhead = new THREE.Mesh(
		new THREE.ConeGeometry(0.12, 0.32, 8),
		materials.accent,
	)
	warhead.rotation.x = -Math.PI / 2
	warhead.position.set(0, 0.02, -1.04)
	const grip = box(0.17, 0.4, 0.22, materials.body)
	grip.position.set(0, -0.28, 0.02)
	grip.rotation.x = -0.18
	const sideCell = box(0.12, 0.3, 0.42, materials.accent)
	sideCell.position.set(0.23, 0.02, -0.3)
	root.add(tube, frontBand, rearBand, topPod, warhead, grip, sideCell)
	for (const part of root.children) part.position.sub(triggerPoint)
	muzzle.position.set(0, 0.02, -1.22).sub(triggerPoint)
}

function buildLongGun(
	root: THREE.Group,
	muzzle: THREE.Group,
	materials: ReturnType<typeof materialPalette>,
	id: "heavy-laser" | "ion-beam-rifle" | "rail-gun" | "shotgun",
): void {
	const triggerPoint = new THREE.Vector3(0, -0.1, 0.08)
	const precision = id === "rail-gun" || id === "ion-beam-rifle"
	const body = box(
		precision ? 0.3 : 0.34,
		id === "heavy-laser" ? 0.32 : 0.25,
		1.12,
		materials.body,
	)
	body.position.z = -0.3
	const barrel = new THREE.Mesh(
		new THREE.CylinderGeometry(precision ? 0.055 : 0.085, 0.1, 0.92, 10),
		materials.accent,
	)
	barrel.rotation.x = Math.PI / 2
	barrel.position.z = -0.92
	const stock = box(0.24, 0.3, 0.46, materials.body)
	stock.position.set(0, -0.02, 0.34)
	const grip = box(0.16, 0.4, 0.2, materials.body)
	grip.position.set(0, -0.28, 0.06)
	grip.rotation.x = -0.2
	const rail = box(
		precision ? 0.42 : id === "heavy-laser" ? 0.3 : 0.12,
		0.08,
		0.82,
		materials.accent,
	)
	rail.position.set(0, 0.18, -0.4)
	root.add(body, barrel, stock, grip, rail)
	for (const part of root.children) part.position.sub(triggerPoint)
	muzzle.position.set(0, 0.1, -1.45).sub(triggerPoint)
}

function buildBubbleGun(
	root: THREE.Group,
	muzzle: THREE.Group,
	materials: ReturnType<typeof materialPalette>,
): void {
	const triggerPoint = new THREE.Vector3(0, -0.08, 0.08)
	const tank = new THREE.Mesh(
		new THREE.SphereGeometry(0.3, 12, 8),
		materials.accent,
	)
	tank.scale.z = 1.35
	tank.position.z = -0.18
	const body = box(0.28, 0.25, 0.74, materials.body)
	body.position.z = -0.42
	const ring = new THREE.Mesh(
		new THREE.TorusGeometry(0.25, 0.06, 8, 18),
		materials.accent,
	)
	ring.position.z = -0.9
	const grip = box(0.16, 0.38, 0.2, materials.body)
	grip.position.set(0, -0.27, 0.06)
	root.add(tank, body, ring, grip)
	for (const part of root.children) part.position.sub(triggerPoint)
	muzzle.position.set(0, 0.08, -1.02).sub(triggerPoint)
}

function assertUnhandledGun(id: never): never {
	throw new Error(`No model builder registered for gun: ${String(id)}`)
}

export function applyGunTransform(
	object: THREE.Object3D,
	transform: GunTransform,
): void {
	object.position.set(...transform.position)
	object.rotation.set(...transform.rotation)
	object.scale.set(...transform.scale)
}

export function createGunModel(
	id: GunId,
	palette: GunPalette = DEFAULT_GUN_PALETTE,
): GunModel {
	const root = new THREE.Group()
	root.name = `${gunDefinition(id).name} model`
	const muzzle = new THREE.Group()
	muzzle.name = `${id} muzzle`
	const materials = materialPalette(palette)
	switch (id) {
		case "arc-blaster":
			buildArcBlaster(root, muzzle, materials)
			break
		case "mini-missile":
			buildMiniMissileLauncher(root, muzzle, materials)
			break
		case "shotgun":
			buildLongGun(root, muzzle, materials, "shotgun")
			break
		case "bubble-gun":
			buildBubbleGun(root, muzzle, materials)
			break
		case "rail-gun":
			buildLongGun(root, muzzle, materials, "rail-gun")
			break
		case "ion-beam-rifle":
			buildLongGun(root, muzzle, materials, "ion-beam-rifle")
			break
		case "heavy-laser":
			buildLongGun(root, muzzle, materials, "heavy-laser")
			break
		default:
			assertUnhandledGun(id)
	}
	root.add(muzzle)
	root.traverse((child) => {
		if (child instanceof THREE.Mesh) {
			child.castShadow = true
			child.receiveShadow = true
		}
	})
	let disposed = false
	return {
		dispose: () => {
			if (disposed) return
			disposed = true
			root.traverse((child) => {
				if (child instanceof THREE.Mesh) child.geometry.dispose()
			})
			materials.accent.dispose()
			materials.body.dispose()
		},
		id,
		muzzle,
		root,
	}
}

export function replaceMountedGun(
	mount: THREE.Group,
	current: GunModel | null,
	next: GunModel,
): GunModel {
	if (current !== null) {
		mount.remove(current.root)
		current.dispose()
	}
	mount.add(next.root)
	return next
}

export function reconcileMountedGun(
	mount: THREE.Group,
	current: GunModel | null,
	gunId: GunId,
	palette: GunPalette = DEFAULT_GUN_PALETTE,
): { changed: boolean; model: GunModel } {
	if (current?.id === gunId) return { changed: false, model: current }
	const next = createGunModel(gunId, palette)
	return {
		changed: true,
		model: replaceMountedGun(mount, current, next),
	}
}

export function applyGunPresentation(
	mount: THREE.Group,
	id: GunId,
	view: GunPresentationView,
): void {
	applyGunTransform(mount, gunPresentation(id, view))
}
