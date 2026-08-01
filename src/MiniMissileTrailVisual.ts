import * as THREE from "three"

import {
	MINI_MISSILE_TRAIL_COLOR,
	MINI_MISSILE_TRAIL_MAX_POINTS,
} from "./game-constants.ts"
import {
	appendMiniMissileTrail,
	createMiniMissileTrail,
	type MiniMissileTrailPhase,
	type MiniMissileTrailState,
} from "./mini-missile-trail.ts"

export type MiniMissileTrailVisual = {
	disposed: boolean
	geometry: THREE.BufferGeometry
	history: MiniMissileTrailState
	material: THREE.PointsMaterial
	points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>
}

const trailColor = new THREE.Color(MINI_MISSILE_TRAIL_COLOR)

export function createMiniMissileTrailVisual(): MiniMissileTrailVisual {
	const geometry = new THREE.BufferGeometry()
	const positions = new THREE.BufferAttribute(
		new Float32Array(MINI_MISSILE_TRAIL_MAX_POINTS * 3),
		3,
	)
	positions.setUsage(THREE.DynamicDrawUsage)
	const colors = new THREE.BufferAttribute(
		new Float32Array(MINI_MISSILE_TRAIL_MAX_POINTS * 3),
		3,
	)
	colors.setUsage(THREE.DynamicDrawUsage)
	geometry.setAttribute("position", positions)
	geometry.setAttribute("color", colors)
	geometry.setDrawRange(0, 0)
	const material = new THREE.PointsMaterial({
		blending: THREE.AdditiveBlending,
		depthWrite: false,
		opacity: 0.92,
		size: 0.2,
		sizeAttenuation: true,
		transparent: true,
		vertexColors: true,
	})
	const points = new THREE.Points(geometry, material)
	points.frustumCulled = false
	points.name = "MINI-MISSILE ORANGE TRAIL"
	points.visible = false
	return {
		disposed: false,
		geometry,
		history: createMiniMissileTrail(),
		material,
		points,
	}
}

export function updateMiniMissileTrailVisual(
	visual: MiniMissileTrailVisual,
	position: readonly [number, number, number],
	sampledAt: number,
	phase: MiniMissileTrailPhase,
): void {
	if (visual.disposed) return
	visual.history = appendMiniMissileTrail(
		visual.history,
		position,
		sampledAt,
		phase,
	)
	const positions = visual.geometry.getAttribute("position")
	const colors = visual.geometry.getAttribute("color")
	const lastIndex = Math.max(1, visual.history.points.length - 1)
	visual.history.points.forEach((point, index) => {
		positions.setXYZ(index, ...point.position)
		const ageFade = 0.08 + 0.92 * (index / lastIndex)
		const phaseFade = point.phase === "powered" ? 1 : 0.35
		colors.setXYZ(
			index,
			trailColor.r * phaseFade * ageFade,
			trailColor.g * phaseFade * ageFade,
			trailColor.b * phaseFade * ageFade,
		)
	})
	positions.needsUpdate = true
	colors.needsUpdate = true
	visual.geometry.setDrawRange(0, visual.history.points.length)
	visual.points.visible = visual.history.points.length >= 2
}

export function disposeMiniMissileTrailVisual(
	visual: MiniMissileTrailVisual,
): void {
	if (visual.disposed) return
	visual.disposed = true
	visual.geometry.dispose()
	visual.material.dispose()
}
