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

const MODE_DURATION_SECONDS: Readonly<Record<PreviewMode, number>> = {
	backward: 1,
	crouch: 2.4,
	"crouch-run": 0.8,
	"double-jump": 1.6,
	forward: 1,
	"free-aim": 1,
	jump: 1.9,
	left: 1,
	right: 1,
}

type SampleInterval = 0.05 | 0.1

const FILM_FRAME_WIDTH = 192
const FILM_FRAME_HEIGHT = 120

type PreviewControls = {
	isPlaying: boolean
	mode: PreviewMode
	sampleInterval: SampleInterval
	selectedTime: number
	speed: number
	yaw: number
}

function getSampleTimes(
	duration: number,
	interval: SampleInterval,
): readonly number[] {
	const times: number[] = []
	for (let time = 0; time <= duration + 0.001; time += interval) {
		times.push(Math.round(time * 100) / 100)
	}
	if (times.at(-1) !== duration) times.push(duration)
	return times
}

function formatTime(time: number): string {
	const isTenth = Math.abs(time * 10 - Math.round(time * 10)) < 0.001
	return `${time.toFixed(isTenth ? 1 : 2)}s`
}

function applyPreviewPose(
	rig: ReturnType<typeof createPilotModel>,
	mode: PreviewMode,
	time: number,
): void {
	const duration = MODE_DURATION_SECONDS[mode]
	const progress = Math.min(1, Math.max(0, time / duration))
	if (
		mode === "forward" ||
		mode === "backward" ||
		mode === "left" ||
		mode === "right"
	) {
		applyRunAnimation(rig, (progress * Math.PI * 2) / 11, 0.92, mode)
	} else if (mode === "jump") {
		applyJumpAnimation(rig, progress)
	} else if (mode === "double-jump") {
		applyDoubleJumpAnimation(rig, progress)
	} else if (mode === "crouch") {
		applyCrouchIdleAnimation(rig, (progress * Math.PI * 2) / 2.6, 1)
	} else if (mode === "crouch-run") {
		applyCrouchMoveAnimation(rig, (progress * Math.PI * 2) / 7.6, 1, "forward")
	} else {
		applyFreeAimPose(rig, -0.18, 0.3, 1)
	}
}

export function PilotVisualizer(): VNode {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const filmCanvasRef = useRef<HTMLCanvasElement>(null)
	const dragXRef = useRef<number | null>(null)
	const timelineRef = useRef(0)
	const [mode, setMode] = useState<PreviewMode>("forward")
	const [speed, setSpeed] = useState(1)
	const [yaw, setYaw] = useState(0.42)
	const [isPlaying, setIsPlaying] = useState(true)
	const [sampleInterval, setSampleInterval] = useState<SampleInterval>(0.1)
	const [selectedTime, setSelectedTime] = useState(0)
	const controlsRef = useRef<PreviewControls>({
		isPlaying,
		mode,
		sampleInterval,
		selectedTime,
		speed,
		yaw,
	})

	controlsRef.current = {
		isPlaying,
		mode,
		sampleInterval,
		selectedTime,
		speed,
		yaw,
	}
	const duration = MODE_DURATION_SECONDS[mode]
	const sampleTimes = getSampleTimes(duration, sampleInterval)

	const selectMode = (nextMode: PreviewMode): void => {
		timelineRef.current = 0
		setSelectedTime(0)
		setIsPlaying(true)
		setMode(nextMode)
	}

	const selectTime = (time: number): void => {
		const snapped = Math.min(
			MODE_DURATION_SECONDS[mode],
			Math.max(0, Math.round(time * 100) / 100),
		)
		timelineRef.current = snapped
		setSelectedTime(snapped)
		setIsPlaying(false)
	}

	const rotatePilot = (nextYaw: number): void => {
		const wrapped = THREE.MathUtils.euclideanModulo(
			nextYaw + Math.PI,
			Math.PI * 2,
		)
		setYaw(wrapped - Math.PI)
	}

	const rotatePilotBy = (deltaYaw: number): void => {
		setYaw((currentYaw) => {
			const wrapped = THREE.MathUtils.euclideanModulo(
				currentYaw + deltaYaw + Math.PI,
				Math.PI * 2,
			)
			return wrapped - Math.PI
		})
	}

	useEffect(() => {
		const canvas = canvasRef.current
		if (canvas === null) return
		const scene = new THREE.Scene()
		scene.background = new THREE.Color("#111827")
		scene.fog = new THREE.Fog("#111827", 9, 18)
		const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 40)
		camera.position.set(6.2, 4.15, -8.75)
		camera.lookAt(0, 2, 0)
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
		let previousTime = performance.now()
		let lastTimelineUpdate = 0
		const resize = (): void => {
			const width = canvas.clientWidth
			const height = canvas.clientHeight
			camera.aspect = width / Math.max(height, 1)
			camera.updateProjectionMatrix()
			renderer.setSize(width, height, false)
		}
		const animate = (now: number): void => {
			frame = requestAnimationFrame(animate)
			const elapsed = Math.min(0.1, (now - previousTime) / 1_000)
			previousTime = now
			const controls = controlsRef.current
			const activeDuration = MODE_DURATION_SECONDS[controls.mode]
			if (controls.isPlaying) {
				timelineRef.current =
					(timelineRef.current + elapsed * controls.speed) % activeDuration
				if (now - lastTimelineUpdate >= 75) {
					lastTimelineUpdate = now
					setSelectedTime(Math.round(timelineRef.current * 10) / 10)
				}
			} else {
				timelineRef.current = controls.selectedTime
			}
			resetPilotPose(rig)
			rig.root.rotation.y = controls.yaw
			applyPreviewPose(rig, controls.mode, timelineRef.current)
			camera.lookAt(0, 2 + rig.root.position.y, 0)
			renderer.render(scene, camera)
		}
		window.addEventListener("resize", resize)
		resize()
		frame = requestAnimationFrame(animate)
		return () => {
			cancelAnimationFrame(frame)
			window.removeEventListener("resize", resize)
			renderer.dispose()
		}
	}, [])

	useEffect(() => {
		const canvas = filmCanvasRef.current
		if (canvas === null) return
		const scene = new THREE.Scene()
		const camera = new THREE.PerspectiveCamera(
			31,
			FILM_FRAME_WIDTH / FILM_FRAME_HEIGHT,
			0.1,
			40,
		)
		camera.position.set(6.8, 4.25, -9.6)
		const renderer = new THREE.WebGLRenderer({ antialias: true, canvas })
		renderer.setPixelRatio(1)
		renderer.outputColorSpace = THREE.SRGBColorSpace
		renderer.toneMapping = THREE.ACESFilmicToneMapping
		renderer.toneMappingExposure = 1.15
		renderer.setClearColor("#0b121b")
		renderer.setScissorTest(true)

		const hemisphere = new THREE.HemisphereLight("#d6f7ff", "#19151a", 2.4)
		const key = new THREE.DirectionalLight("#fff0d4", 5)
		key.position.set(4, 8, -5)
		const rim = new THREE.DirectionalLight("#5cf4dc", 3.2)
		rim.position.set(-5, 3, -4)
		scene.add(hemisphere, key, rim)

		const rig = createPilotModel()
		scene.add(rig.root)
		const grid = new THREE.GridHelper(8, 16, "#377f76", "#20343c")
		grid.position.y = -0.14
		scene.add(grid)

		let frame = 0
		let previousSignature = ""
		const renderFilmstrip = (): void => {
			frame = requestAnimationFrame(renderFilmstrip)
			const controls = controlsRef.current
			const signature = `${controls.mode}:${controls.sampleInterval}:${controls.yaw.toFixed(4)}`
			if (signature === previousSignature) return
			previousSignature = signature
			const activeDuration = MODE_DURATION_SECONDS[controls.mode]
			const times = getSampleTimes(activeDuration, controls.sampleInterval)
			const totalHeight = times.length * FILM_FRAME_HEIGHT
			renderer.setSize(FILM_FRAME_WIDTH, totalHeight, false)

			for (const [index, time] of times.entries()) {
				const y = totalHeight - (index + 1) * FILM_FRAME_HEIGHT
				renderer.setViewport(0, y, FILM_FRAME_WIDTH, FILM_FRAME_HEIGHT)
				renderer.setScissor(0, y, FILM_FRAME_WIDTH, FILM_FRAME_HEIGHT)
				resetPilotPose(rig)
				rig.root.rotation.y = controls.yaw
				applyPreviewPose(rig, controls.mode, time)
				camera.lookAt(0, 2 + rig.root.position.y, 0)
				renderer.render(scene, camera)
			}
		}
		frame = requestAnimationFrame(renderFilmstrip)
		return () => {
			cancelAnimationFrame(frame)
			renderer.dispose()
		}
	}, [])

	return (
		<pilot-visualizer className={css.class}>
			<canvas
				ref={canvasRef}
				aria-label="Animated FEROX pilot model. Drag horizontally to rotate."
				onPointerDown={(event) => {
					dragXRef.current = event.clientX
					event.currentTarget.setPointerCapture(event.pointerId)
				}}
				onPointerMove={(event) => {
					const previousX = dragXRef.current
					if (previousX === null) return
					dragXRef.current = event.clientX
					rotatePilotBy((event.clientX - previousX) * 0.012)
				}}
				onPointerCancel={() => {
					dragXRef.current = null
				}}
				onPointerUp={(event) => {
					dragXRef.current = null
					event.currentTarget.releasePointerCapture(event.pointerId)
				}}
			/>
			<model-header>
				<p>FEROX // ARMOR LAB</p>
				<h1>MK-I PILOT</h1>
				<span>DRAG TO ROTATE / SCRUB TO FREEZE</span>
			</model-header>
			<nav aria-label="Pilot animation">
				{MODES.map((option) => (
					<button
						key={option}
						type="button"
						data-active={mode === option}
						onClick={() => {
							selectMode(option)
						}}
					>
						{option}
					</button>
				))}
			</nav>
			<animation-console>
				<control-bank>
					<button
						type="button"
						aria-label={isPlaying ? "Pause animation" : "Play animation"}
						data-playing={isPlaying}
						onClick={() => {
							setIsPlaying(!isPlaying)
						}}
					>
						{isPlaying ? "Ⅱ PAUSE" : "▶ PLAY"}
					</button>
					<label>
						<span>SPEED</span>
						<input
							aria-label="Animation speed"
							type="range"
							min="0.1"
							max="1"
							step="0.1"
							value={speed}
							onInput={(event) => {
								setSpeed(Number(event.currentTarget.value))
							}}
						/>
						<output>{speed.toFixed(1)}×</output>
					</label>
					<label>
						<span>ANGLE</span>
						<input
							aria-label="Pilot rotation"
							type="range"
							min="-180"
							max="180"
							step="1"
							value={THREE.MathUtils.radToDeg(yaw)}
							onInput={(event) => {
								rotatePilot(
									THREE.MathUtils.degToRad(Number(event.currentTarget.value)),
								)
							}}
						/>
						<output>{Math.round(THREE.MathUtils.radToDeg(yaw))}°</output>
					</label>
				</control-bank>
				<timeline-control>
					<button
						type="button"
						aria-label="Previous tenth of a second"
						onClick={() => {
							selectTime(selectedTime - 0.1)
						}}
					>
						−.1s
					</button>
					<label>
						<span>TIMELINE</span>
						<input
							aria-label="Animation time"
							type="range"
							min="0"
							max={duration}
							step="0.05"
							value={Math.min(selectedTime, duration)}
							onInput={(event) => {
								selectTime(Number(event.currentTarget.value))
							}}
						/>
					</label>
					<button
						type="button"
						aria-label="Next tenth of a second"
						onClick={() => {
							selectTime(selectedTime + 0.1)
						}}
					>
						+.1s
					</button>
					<output aria-live="polite">
						<strong>{isPlaying ? "PLAYING" : "FROZEN"}</strong>
						<span>
							{formatTime(Math.min(selectedTime, duration))} /{" "}
							{formatTime(duration)}
						</span>
					</output>
				</timeline-control>
			</animation-console>
			<filmstrip-panel>
				<filmstrip-header>
					<section>
						<strong>POSE FILM</strong>
						<span>{sampleTimes.length} EXPOSURES</span>
					</section>
					<fieldset>
						<legend>Frame interval</legend>
						{([0.1, 0.05] as const).map((interval) => (
							<button
								key={interval}
								type="button"
								aria-label={`Sample every ${interval.toFixed(2)} seconds`}
								data-active={sampleInterval === interval}
								onClick={() => {
									setSampleInterval(interval)
								}}
							>
								{interval.toFixed(2)}s
							</button>
						))}
					</fieldset>
				</filmstrip-header>
				<filmstrip-viewport>
					<filmstrip-rail>
						<canvas
							ref={filmCanvasRef}
							aria-label={`${mode} animation sampled every ${sampleInterval.toFixed(2)} seconds`}
							width={FILM_FRAME_WIDTH}
							height={sampleTimes.length * FILM_FRAME_HEIGHT}
						/>
						<ol>
							{sampleTimes.map((time) => (
								<li key={time}>
									<button
										type="button"
										aria-label={`Freeze animation at ${time.toFixed(2)} seconds`}
										data-active={
											!isPlaying && Math.abs(selectedTime - time) < 0.01
										}
										onClick={() => {
											selectTime(time)
										}}
									>
										<span>{formatTime(time)}</span>
									</button>
								</li>
							))}
						</ol>
					</filmstrip-rail>
				</filmstrip-viewport>
			</filmstrip-panel>
			<aside>
				<strong>{mode.toUpperCase()}</strong>
				<span>FULL-BODY RIG</span>
			</aside>
		</pilot-visualizer>
	)
}
