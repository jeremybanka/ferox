import * as THREE from "three"

import type { Vector3Tuple } from "../src/arena-protocol.ts"
import {
	SHOTGUN_CONE_HALF_ANGLE_RADIANS,
	SHOTGUN_PELLET_COUNT,
} from "../src/game-constants.ts"

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
const UINT32_RANGE = 0x1_0000_0000

export function shotgunVolleySeed(
	playerId: string,
	clientShotId: number,
	arenaSeed: number,
): number {
	let hash = (2_166_136_261 ^ arenaSeed ^ clientShotId) >>> 0
	for (let index = 0; index < playerId.length; index += 1) {
		hash ^= playerId.charCodeAt(index)
		hash = Math.imul(hash, 16_777_619) >>> 0
	}
	return hash
}

export function shotgunPelletDirections(
	direction: Vector3Tuple,
	seed: number,
): Vector3Tuple[] {
	const forward = new THREE.Vector3(...direction).normalize()
	const reference =
		Math.abs(forward.y) < 0.98
			? new THREE.Vector3(0, 1, 0)
			: new THREE.Vector3(1, 0, 0)
	const right = new THREE.Vector3().crossVectors(forward, reference).normalize()
	const up = new THREE.Vector3().crossVectors(right, forward).normalize()
	const rotation = ((seed >>> 0) / UINT32_RANGE) * Math.PI * 2
	const coneSlope = Math.tan(SHOTGUN_CONE_HALF_ANGLE_RADIANS)

	return Array.from({ length: SHOTGUN_PELLET_COUNT }, (_, index) => {
		const radius =
			index === 0
				? 0
				: coneSlope * Math.sqrt(index / (SHOTGUN_PELLET_COUNT - 1))
		const angle = rotation + index * GOLDEN_ANGLE
		return forward
			.clone()
			.addScaledVector(right, Math.cos(angle) * radius)
			.addScaledVector(up, Math.sin(angle) * radius)
			.normalize()
			.toArray()
	})
}
