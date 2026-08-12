import * as THREE from "three"

import type {
	NapalmHazardSnapshot,
	VehicleKind,
	VehicleSeatId,
	VehicleSnapshot,
} from "./arena-protocol.ts"

type VehicleVisual = {
	kind: VehicleKind
	lastFireSequence: number
	root: THREE.Group
	seats: VehicleSnapshot["seats"]
	targetLean: number
	targetPitch: number
	targetPosition: THREE.Vector3
	targetVelocity: THREE.Vector3
	targetYaw: number
	turret: THREE.Group | null
}

type HazardVisual = {
	expiresAt: number
	mesh: THREE.Mesh
}

export class VehicleVisualSystem {
	readonly #hazards = new Map<number, HazardVisual>()
	readonly #scene: THREE.Scene
	readonly #vehicles = new Map<string, VehicleVisual>()

	constructor(scene: THREE.Scene) {
		this.#scene = scene
	}

	reconcile(
		vehicles: readonly VehicleSnapshot[],
		hazards: readonly NapalmHazardSnapshot[],
	): void {
		const activeVehicles = new Set(vehicles.map((vehicle) => vehicle.id))
		for (const snapshot of vehicles) this.#upsertVehicle(snapshot)
		for (const [id, visual] of this.#vehicles) {
			if (activeVehicles.has(id)) continue
			this.#disposeGroup(visual.root)
			this.#vehicles.delete(id)
		}
		const activeHazards = new Set(hazards.map((hazard) => hazard.id))
		for (const snapshot of hazards) this.#upsertHazard(snapshot)
		for (const [id, visual] of this.#hazards) {
			if (activeHazards.has(id)) continue
			this.#scene.remove(visual.mesh)
			visual.mesh.geometry.dispose()
			;(visual.mesh.material as THREE.Material).dispose()
			this.#hazards.delete(id)
		}
	}

	update(delta: number): void {
		for (const visual of this.#vehicles.values()) {
			visual.root.position.lerp(visual.targetPosition, Math.min(1, delta * 12))
			visual.root.rotation.y = this.#lerpAngle(
				visual.root.rotation.y,
				visual.targetYaw,
				Math.min(1, delta * 10),
			)
			visual.root.rotation.x = THREE.MathUtils.lerp(
				visual.root.rotation.x,
				visual.targetPitch,
				Math.min(1, delta * 8),
			)
			visual.root.rotation.z = THREE.MathUtils.lerp(
				visual.root.rotation.z,
				visual.targetLean,
				Math.min(1, delta * 8),
			)
		}
		const now = Date.now()
		for (const visual of this.#hazards.values()) {
			const remaining = Math.max(0, (visual.expiresAt - now) / 4_000)
			visual.mesh.scale.setScalar(0.7 + Math.sin(now * 0.018) * 0.08)
			;(visual.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(
				0.62,
				remaining,
			)
		}
	}

	localSeat(playerId: string | undefined): Readonly<{
		kind: VehicleKind
		seatId: VehicleSeatId
		vehicleId: string
	}> | null {
		if (playerId === undefined) return null
		for (const [vehicleId, visual] of this.#vehicles) {
			const seat = visual.seats.find(
				(candidate) => candidate.occupantId === playerId,
			)
			if (seat !== undefined)
				return { kind: visual.kind, seatId: seat.id, vehicleId }
		}
		return null
	}

	nearestAvailableSeat(
		position: THREE.Vector3,
		maximumDistance = 13.5,
	): Readonly<{
		kind: VehicleKind
		seatId: VehicleSeatId
		vehicleId: string
	}> | null {
		let nearest: {
			distance: number
			kind: VehicleKind
			seatId: VehicleSeatId
			vehicleId: string
		} | null = null
		for (const [vehicleId, visual] of this.#vehicles) {
			const seat = visual.seats.find(
				(candidate) => candidate.occupantId === null,
			)
			if (seat === undefined) continue
			const distance = visual.targetPosition.distanceTo(position)
			if (
				distance > maximumDistance ||
				(nearest !== null && distance >= nearest.distance)
			)
				continue
			nearest = { distance, kind: visual.kind, seatId: seat.id, vehicleId }
		}
		return nearest
	}

	vehiclePosition(
		vehicleId: string,
		target = new THREE.Vector3(),
	): THREE.Vector3 | null {
		const visual = this.#vehicles.get(vehicleId)
		return visual === undefined ? null : target.copy(visual.targetPosition)
	}

	vehicleVelocity(
		vehicleId: string,
		target = new THREE.Vector3(),
	): THREE.Vector3 | null {
		const visual = this.#vehicles.get(vehicleId)
		return visual === undefined ? null : target.copy(visual.targetVelocity)
	}

	dispose(): void {
		for (const visual of this.#vehicles.values())
			this.#disposeGroup(visual.root)
		this.#vehicles.clear()
		for (const visual of this.#hazards.values()) {
			this.#scene.remove(visual.mesh)
			visual.mesh.geometry.dispose()
			;(visual.mesh.material as THREE.Material).dispose()
		}
		this.#hazards.clear()
	}

	#upsertVehicle(snapshot: VehicleSnapshot): void {
		let visual = this.#vehicles.get(snapshot.id)
		if (visual === undefined) {
			const built =
				snapshot.kind === "bike" ? this.#buildBike() : this.#buildJeep()
			built.root.position.set(...snapshot.position)
			built.root.rotation.order = "YXZ"
			this.#scene.add(built.root)
			visual = {
				kind: snapshot.kind,
				lastFireSequence: snapshot.turretFireSequence,
				root: built.root,
				seats: snapshot.seats,
				targetLean: snapshot.lean,
				targetPitch: snapshot.pitch,
				targetPosition: new THREE.Vector3(...snapshot.position),
				targetVelocity: new THREE.Vector3(...snapshot.velocity),
				targetYaw: snapshot.yaw,
				turret: built.turret,
			}
			this.#vehicles.set(snapshot.id, visual)
		}
		visual.seats = snapshot.seats
		visual.targetPosition.set(...snapshot.position)
		visual.targetVelocity.set(...snapshot.velocity)
		visual.targetYaw = snapshot.yaw
		visual.targetPitch = snapshot.pitch
		visual.targetLean = snapshot.lean
		if (visual.turret !== null) {
			visual.turret.rotation.y = snapshot.turretYaw
			const barrel = visual.turret.getObjectByName("turret-barrel")
			if (barrel !== undefined) barrel.rotation.x = snapshot.turretPitch
		}
		const flame = visual.root.getObjectByName("afterburner-flame")
		if (flame !== undefined) flame.visible = snapshot.afterburner
		if (snapshot.turretFireSequence > visual.lastFireSequence) {
			visual.lastFireSequence = snapshot.turretFireSequence
			const flash = visual.root.getObjectByName("turret-flash")
			if (flash !== undefined) {
				flash.visible = true
				setTimeout(() => {
					flash.visible = false
				}, 70)
			}
		}
	}

	#upsertHazard(snapshot: NapalmHazardSnapshot): void {
		const existing = this.#hazards.get(snapshot.id)
		if (existing !== undefined) {
			existing.expiresAt = snapshot.expiresAt
			return
		}
		const material = new THREE.MeshBasicMaterial({
			blending: THREE.AdditiveBlending,
			color: "#ff5a16",
			depthWrite: false,
			opacity: 0.58,
			transparent: true,
		})
		const mesh = new THREE.Mesh(
			new THREE.CircleGeometry(snapshot.radius, 18),
			material,
		)
		mesh.name = "authoritative napalm hazard"
		mesh.position.set(...snapshot.position)
		mesh.rotation.x = -Math.PI / 2
		this.#scene.add(mesh)
		this.#hazards.set(snapshot.id, { expiresAt: snapshot.expiresAt, mesh })
	}

	#buildBike(): { root: THREE.Group; turret: null } {
		const root = new THREE.Group()
		root.name = "napalm afterburner bike"
		const dark = new THREE.MeshStandardMaterial({
			color: "#171c23",
			metalness: 0.82,
			roughness: 0.3,
		})
		const orange = new THREE.MeshStandardMaterial({
			color: "#ff6b2c",
			emissive: "#7a1f08",
			emissiveIntensity: 0.65,
		})
		const chassis = new THREE.Mesh(
			new THREE.BoxGeometry(0.55, 0.42, 1.65),
			orange,
		)
		chassis.position.y = 0.2
		const tank = new THREE.Mesh(
			new THREE.CapsuleGeometry(0.36, 0.55, 5, 10),
			dark,
		)
		tank.rotation.x = Math.PI / 2
		tank.position.set(0, 0.55, -0.15)
		root.add(chassis, tank)
		for (const z of [-1.05, 1.05]) {
			const wheel = new THREE.Mesh(
				new THREE.TorusGeometry(0.48, 0.12, 8, 18),
				dark,
			)
			wheel.rotation.y = Math.PI / 2
			wheel.position.set(0, -0.05, z)
			root.add(wheel)
		}
		const flame = new THREE.Mesh(
			new THREE.ConeGeometry(0.26, 1.2, 10),
			new THREE.MeshBasicMaterial({ color: "#ffcb42" }),
		)
		flame.name = "afterburner-flame"
		flame.rotation.x = -Math.PI / 2
		flame.position.set(0, 0.16, 1.65)
		flame.visible = false
		root.add(flame)
		return { root, turret: null }
	}

	#buildJeep(): { root: THREE.Group; turret: THREE.Group } {
		const root = new THREE.Group()
		root.name = "bouncy multiplayer jeep"
		const bodyMaterial = new THREE.MeshStandardMaterial({
			color: "#5c8649",
			metalness: 0.35,
			roughness: 0.62,
		})
		const dark = new THREE.MeshStandardMaterial({
			color: "#161c1a",
			metalness: 0.65,
			roughness: 0.4,
		})
		const body = new THREE.Mesh(
			new THREE.BoxGeometry(2.4, 0.72, 3.6),
			bodyMaterial,
		)
		body.position.y = 0.45
		root.add(body)
		for (const x of [-1.25, 1.25])
			for (const z of [-1.25, 1.25]) {
				const wheel = new THREE.Mesh(
					new THREE.CylinderGeometry(0.58, 0.58, 0.32, 12),
					dark,
				)
				wheel.rotation.z = Math.PI / 2
				wheel.position.set(x, 0, z)
				root.add(wheel)
			}
		const cage = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 2.25), dark)
		cage.position.y = 1.42
		root.add(cage)
		const turret = new THREE.Group()
		turret.name = "independent turret"
		turret.position.y = 1.55
		const mount = new THREE.Mesh(
			new THREE.CylinderGeometry(0.42, 0.55, 0.32, 12),
			dark,
		)
		const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 2.15), dark)
		barrel.name = "turret-barrel"
		barrel.position.z = -1.05
		const flash = new THREE.Mesh(
			new THREE.SphereGeometry(0.2, 8, 6),
			new THREE.MeshBasicMaterial({ color: "#ffe26c" }),
		)
		flash.name = "turret-flash"
		flash.position.z = -2.15
		flash.visible = false
		barrel.add(flash)
		turret.add(mount, barrel)
		root.add(turret)
		return { root, turret }
	}

	#disposeGroup(root: THREE.Group): void {
		this.#scene.remove(root)
		root.traverse((child) => {
			if (!(child instanceof THREE.Mesh)) return
			child.geometry.dispose()
			if (Array.isArray(child.material))
				child.material.forEach((material) => material.dispose())
			else child.material.dispose()
		})
	}

	#lerpAngle(from: number, to: number, alpha: number): number {
		const delta =
			THREE.MathUtils.euclideanModulo(to - from + Math.PI, Math.PI * 2) -
			Math.PI
		return from + delta * alpha
	}
}
