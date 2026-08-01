import * as THREE from "three"
import { describe, expect, test, vi } from "vitest"

import {
	applyGunPresentation,
	createGunModel,
	reconcileMountedGun,
	replaceMountedGun,
} from "./GunModel.ts"

function sizeOf(object: THREE.Object3D): THREE.Vector3 {
	object.updateMatrixWorld(true)
	return new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3())
}

describe("shared gun models", () => {
	test("builds distinct blaster and launcher silhouettes with finite muzzles", () => {
		const blaster = createGunModel("arc-blaster")
		const launcher = createGunModel("mini-missile")
		const blasterSize = sizeOf(blaster.root)
		const launcherSize = sizeOf(launcher.root)

		expect(blaster.root.name).toContain("ARC BLASTER")
		expect(launcher.root.name).toContain("MINI-MISSILE")
		expect(launcher.root.children.length).not.toBe(blaster.root.children.length)
		expect(launcherSize.x).toBeGreaterThan(blasterSize.x)
		for (const model of [blaster, launcher]) {
			expect(model.muzzle.parent).toBe(model.root)
			expect(model.muzzle.position.toArray().every(Number.isFinite)).toBe(true)
			model.dispose()
		}
	})

	test("resolves explicit first- and third-person transforms", () => {
		const mount = new THREE.Group()
		applyGunPresentation(mount, "mini-missile", "firstPerson")
		expect(mount.position.toArray()).toEqual([0.36, -0.3, -0.72])
		expect(mount.scale.toArray()).toEqual([1.04, 1.04, 1.04])
		applyGunPresentation(mount, "arc-blaster", "thirdPerson")
		expect(mount.position.toArray()).toEqual([0, -0.08, -0.16])
		expect(mount.rotation.x).toBeCloseTo(-Math.PI / 2)
	})

	test("replacement removes and disposes the previous model", () => {
		const mount = new THREE.Group()
		const blaster = createGunModel("arc-blaster")
		mount.add(blaster.root)
		const dispose = vi.spyOn(blaster, "dispose")
		const launcher = createGunModel("mini-missile")

		expect(replaceMountedGun(mount, blaster, launcher)).toBe(launcher)
		expect(dispose).toHaveBeenCalledOnce()
		expect(mount.children).toEqual([launcher.root])
		launcher.dispose()
	})

	test("reconciliation preserves the mount and replaces only changed IDs", () => {
		const mount = new THREE.Group()
		const first = reconcileMountedGun(mount, null, "arc-blaster")
		const dispose = vi.spyOn(first.model, "dispose")
		const unchanged = reconcileMountedGun(mount, first.model, "arc-blaster")
		expect(unchanged).toEqual({ changed: false, model: first.model })
		expect(dispose).not.toHaveBeenCalled()
		expect(mount.children).toEqual([first.model.root])

		const changed = reconcileMountedGun(mount, first.model, "mini-missile")
		expect(changed.changed).toBe(true)
		expect(dispose).toHaveBeenCalledOnce()
		expect(mount.children).toEqual([changed.model.root])
		changed.model.dispose()
	})
})
