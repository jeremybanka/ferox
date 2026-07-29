import * as THREE from "three"

import type { VisorExpression } from "../arena-protocol.ts"

const ATLAS_COLUMNS = 8
const ATLAS_ROWS = 4
const FACE_SIZE = 32
const EYE_SAFE_AREA = { height: 12, width: 24, x: 4, y: 10 } as const

export type VisorSignalSource =
	| "combat"
	| "damage"
	| "defeated"
	| "emote"
	| "movement"

export type VisorPalette = {
	background: THREE.ColorRepresentation
	glow: THREE.ColorRepresentation
	pixels: THREE.ColorRepresentation
}

type VisorClip = {
	frames: readonly number[]
	framesPerSecond: number
	loop: boolean
}

type VisorSignal = {
	expiresAt: number | null
	expression: VisorExpression
	startedAt: number
}

const CLIPS: Readonly<Record<VisorExpression, VisorClip>> = {
	"aim-left": { frames: [14], framesPerSecond: 1, loop: true },
	"aim-right": { frames: [15], framesPerSecond: 1, loop: true },
	alarm: { frames: [10, 11], framesPerSecond: 8, loop: true },
	angry: { frames: [6, 7], framesPerSecond: 5, loop: true },
	boot: { frames: [28, 29, 30, 31], framesPerSecond: 9, loop: false },
	defeated: { frames: [12, 13], framesPerSecond: 3, loop: true },
	focus: { frames: [4, 4, 5], framesPerSecond: 0.25, loop: true },
	happy: { frames: [8, 9], framesPerSecond: 4, loop: true },
	hurt: { frames: [20, 21, 22, 23], framesPerSecond: 12, loop: false },
	neutral: { frames: [0], framesPerSecond: 1, loop: true },
	talk: { frames: [16, 17, 18, 17, 19], framesPerSecond: 9, loop: true },
}

const PRIORITY: Readonly<Record<VisorSignalSource, number>> = {
	combat: 400,
	damage: 500,
	defeated: 600,
	emote: 200,
	movement: 300,
}

const atlasTexture = new THREE.TextureLoader().load("/visor-faces.png")
atlasTexture.colorSpace = THREE.NoColorSpace
atlasTexture.magFilter = THREE.NearestFilter
atlasTexture.minFilter = THREE.LinearMipmapLinearFilter
atlasTexture.wrapS = THREE.ClampToEdgeWrapping
atlasTexture.wrapT = THREE.ClampToEdgeWrapping

function setFrameUvs(geometry: THREE.BufferGeometry, frame: number): void {
	const column = frame % ATLAS_COLUMNS
	const row = Math.floor(frame / ATLAS_COLUMNS)
	const atlasWidth = ATLAS_COLUMNS * FACE_SIZE
	const atlasHeight = ATLAS_ROWS * FACE_SIZE
	const left = (column * FACE_SIZE + EYE_SAFE_AREA.x) / atlasWidth
	const right =
		(column * FACE_SIZE + EYE_SAFE_AREA.x + EYE_SAFE_AREA.width) / atlasWidth
	const top = 1 - (row * FACE_SIZE + EYE_SAFE_AREA.y) / atlasHeight
	const bottom =
		1 -
		(row * FACE_SIZE + EYE_SAFE_AREA.y + EYE_SAFE_AREA.height) /
			atlasHeight
	const uvs = geometry.getAttribute("uv")
	uvs.setXY(0, left, top)
	uvs.setXY(1, right, top)
	uvs.setXY(2, left, bottom)
	uvs.setXY(3, right, bottom)
	uvs.needsUpdate = true
}

export class VisorDisplay {
	readonly group = new THREE.Group()
	readonly #geometry = new THREE.PlaneGeometry(0.66, 0.32)
	readonly #signals = new Map<VisorSignalSource, VisorSignal>()
	readonly #idlePhase: number
	#activeExpression: VisorExpression = "boot"
	#activeStartedAt = 0
	#frame = -1

	constructor(palette: VisorPalette, idlePhase = Math.random() * 5.4) {
		this.#idlePhase = idlePhase
		const glowMaterial = new THREE.MeshBasicMaterial({
			alphaMap: atlasTexture,
			blending: THREE.AdditiveBlending,
			color: palette.glow,
			depthWrite: false,
			opacity: 0.28,
			side: THREE.DoubleSide,
			toneMapped: false,
			transparent: true,
		})
		const pixelMaterial = new THREE.MeshBasicMaterial({
			alphaMap: atlasTexture,
			blending: THREE.AdditiveBlending,
			color: palette.pixels,
			depthWrite: false,
			side: THREE.DoubleSide,
			toneMapped: false,
			transparent: true,
		})
		const glow = new THREE.Mesh(this.#geometry, glowMaterial)
		glow.scale.set(1.025, 1.05, 1)
		glow.position.z = 0.001
		const pixels = new THREE.Mesh(this.#geometry, pixelMaterial)
		pixels.position.z = -0.001
		this.group.add(glow, pixels)
		this.update(0)
	}

	clearSignal(source: VisorSignalSource): void {
		this.#signals.delete(source)
	}

	setSignal(
		source: VisorSignalSource,
		expression: VisorExpression,
		startedAt: number,
		duration?: number,
	): void {
		const current = this.#signals.get(source)
		if (current?.expression === expression && duration === undefined) return
		this.#signals.set(source, {
			expiresAt: duration === undefined ? null : startedAt + duration,
			expression,
			startedAt,
		})
	}

	update(now: number): void {
		let selected: VisorSignal | undefined
		let selectedPriority = -1
		for (const [source, signal] of this.#signals) {
			if (signal.expiresAt !== null && now >= signal.expiresAt) {
				this.#signals.delete(source)
				continue
			}
			const priority = PRIORITY[source]
			if (
				priority > selectedPriority ||
				(priority === selectedPriority &&
					signal.startedAt > (selected?.startedAt ?? -1))
			) {
				selected = signal
				selectedPriority = priority
			}
		}

		const expression = selected?.expression ?? "neutral"
		const startedAt = selected?.startedAt ?? 0
		if (
			expression !== this.#activeExpression ||
			startedAt !== this.#activeStartedAt
		) {
			this.#activeExpression = expression
			this.#activeStartedAt = startedAt
		}

		let frame: number
		if (expression === "neutral") {
			const idleTime = (now + this.#idlePhase) % 5.4
			frame = idleTime < 0.1 ? 2 : idleTime < 0.18 ? 3 : 0
		} else {
			const clip = CLIPS[expression]
			const elapsedFrames = Math.max(
				0,
				Math.floor((now - this.#activeStartedAt) * clip.framesPerSecond),
			)
			const frameIndex = clip.loop
				? elapsedFrames % clip.frames.length
				: Math.min(elapsedFrames, clip.frames.length - 1)
			frame = clip.frames[frameIndex] ?? clip.frames[0] ?? 0
		}
		if (frame === this.#frame) return
		this.#frame = frame
		setFrameUvs(this.#geometry, frame)
	}
}
