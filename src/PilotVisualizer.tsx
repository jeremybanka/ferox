import * as THREE from "three"
import type { VNode } from "preact"
import { useEffect, useRef, useState } from "preact/hooks"

import css from "./PilotVisualizer.module.css"
import { applyFreeAimPose } from "./pilot/AimPose.ts"
import {
	applyCrouchIdleAnimation,
	applyCrouchMoveAnimation,
} from "./pilot/CrouchAnimation.ts"
import { applyDoubleJumpAnimation } from "./pilot/DoubleJumpAnimation.ts"
import { applyJumpAnimation } from "./pilot/JumpAnimation.ts"
import { createPilotModel, resetPilotPose } from "./pilot/PilotModel.ts"
import { applyRunAnimation, type RunDirection } from "./pilot/RunAnimation.ts"

type PreviewMode =
	| RunDirection
	| "crouch"
	| "crouch-run"
	| "double-jump"
	| "free-aim"
	| "jump"

const MODES: readonly PreviewMode[] = [
	"forward",
	"left",
	"backward",
	"right",
	"jump",
	"double-jump",
	"crouch",
	"crouch-run",
	"free-aim",
]

export function PilotVisualizer(): VNode {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const [mode, setMode] = useState<PreviewMode>("forward")

	useEffect(() => {
		const canvas = canvasRef.current
		if (canvas === null) return
		const scene = new THREE.Scene()
		scene.background = new THREE.Color("#111827")
		scene.fog = new THREE.Fog("#111827", 9, 18)
		const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 40)
		camera.position.set(5.4, 3.8, -7.6)
		camera.lookAt(0, 1.9, 0)
		const renderer = new THREE.WebGLRenderer({ antialias: true, canvas })
		renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8))
		renderer.outputColorSpace = THREE.SRGBColorSpace
		renderer.toneMapping = THREE.ACESFilmicToneMapping
		renderer.toneMappingExposure = 1.15
		renderer.shadowMap.enabled = true

		const hemisphere = new THREE.HemisphereLight("#d6f7ff", "#19151a", 2.2)
		const key = new THREE.DirectionalLight("#fff0d4", 5.2)
		key.position.set(4, 8, -5)
		key.castShadow = true
		const rim = new THREE.DirectionalLight("#5cf4dc", 3.5)
		rim.position.set(-5, 3, -4)
		scene.add(hemisphere, key, rim)

		const rig = createPilotModel()
		rig.root.rotation.y = 0.42
		scene.add(rig.root)
		const floor = new THREE.Mesh(
			new THREE.CylinderGeometry(3.6, 4, 0.32, 8),
			new THREE.MeshStandardMaterial({
				color: "#151e26",
				metalness: 0.72,
				roughness: 0.35,
			}),
		)
		floor.position.y = -0.31
		floor.receiveShadow = true
		scene.add(floor)
		const grid = new THREE.GridHelper(14, 28, "#4fe1ca", "#293f48")
		grid.position.y = -0.14
		scene.add(grid)

		let frame = 0
		const started = performance.now()
		const resize = (): void => {
			const width = canvas.clientWidth
			const height = canvas.clientHeight
			camera.aspect = width / Math.max(height, 1)
			camera.updateProjectionMatrix()
			renderer.setSize(width, height, false)
		}
		const animate = (): void => {
			frame = requestAnimationFrame(animate)
			const time = (performance.now() - started) / 1_000
			resetPilotPose(rig)
			rig.root.rotation.y = 0.42
			if (
				mode === "forward" ||
				mode === "backward" ||
				mode === "left" ||
				mode === "right"
			) {
				applyRunAnimation(rig, time, 0.92, mode)
			} else if (mode === "jump") {
				applyJumpAnimation(rig, (time * 0.52) % 1)
			} else if (mode === "double-jump") {
				applyDoubleJumpAnimation(rig, (time * 0.62) % 1)
			} else if (mode === "crouch") {
				applyCrouchIdleAnimation(rig, time, 1)
			} else if (mode === "crouch-run") {
				applyCrouchMoveAnimation(rig, time, 1, "forward")
			} else {
				applyFreeAimPose(rig, -0.18, 0.3, 1)
			}
			renderer.render(scene, camera)
		}
		window.addEventListener("resize", resize)
		resize()
		animate()
		return () => {
			cancelAnimationFrame(frame)
			window.removeEventListener("resize", resize)
			renderer.dispose()
		}
	}, [mode])

	return (
		<pilot-visualizer className={css.class}>
			<canvas ref={canvasRef} aria-label="Animated FEROX pilot model" />
			<model-header>
				<p>FEROX // ARMOR LAB</p>
				<h1>MK-I PILOT</h1>
				<span>PRIMITIVE RIG / LIVE ANIMATION SYSTEM</span>
			</model-header>
			<nav aria-label="Pilot animation">
				{MODES.map((option) => (
					<button
						type="button"
						data-active={mode === option}
						onClick={() => {
							setMode(option)
						}}
					>
						{option}
					</button>
				))}
			</nav>
			<aside>
				<strong>{mode.toUpperCase()}</strong>
				<span>FULL-BODY RIG</span>
			</aside>
		</pilot-visualizer>
	)
}
