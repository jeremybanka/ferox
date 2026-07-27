import * as THREE from "three"
import type { VNode } from "preact"
import { useEffect, useMemo, useState } from "preact/hooks"

import css from "./PoseContactSheet.module.css"
import { createPilotModel, resetPilotPose } from "./pilot/PilotModel.ts"
import {
	applyPracticePose,
	POSE_BUCKETS,
	type PoseBucket,
	PRACTICE_POSES,
} from "./pilot/PracticePoses.ts"

type PoseFilter = "all" | PoseBucket

function renderPoseThumbnails(): readonly string[] {
	const canvas = document.createElement("canvas")
	canvas.width = 300
	canvas.height = 360
	const renderer = new THREE.WebGLRenderer({
		alpha: true,
		antialias: true,
		canvas,
		preserveDrawingBuffer: true,
	})
	renderer.setPixelRatio(1)
	renderer.outputColorSpace = THREE.SRGBColorSpace
	renderer.toneMapping = THREE.ACESFilmicToneMapping
	renderer.toneMappingExposure = 1.2
	renderer.shadowMap.enabled = true
	const scene = new THREE.Scene()
	const camera = new THREE.PerspectiveCamera(32, 300 / 360, 0.1, 30)
	camera.position.set(4.2, 3.1, -7.3)
	camera.lookAt(0, 1.82, 0)
	scene.add(new THREE.HemisphereLight("#d9fbff", "#15131a", 2.8))
	const key = new THREE.DirectionalLight("#fff0d7", 5)
	key.position.set(3, 7, -5)
	scene.add(key)
	const rim = new THREE.DirectionalLight("#56f3d7", 2.8)
	rim.position.set(-4, 2, -4)
	scene.add(rim)
	const rig = createPilotModel()
	scene.add(rig.root)

	const thumbnails = PRACTICE_POSES.map((pose, index) => {
		resetPilotPose(rig)
		rig.root.rotation.y = 0.34
		applyPracticePose(rig, pose, index)
		renderer.render(scene, camera)
		return canvas.toDataURL("image/webp", 0.88)
	})

	renderer.dispose()
	return thumbnails
}

export function PoseContactSheet(): VNode {
	const [filter, setFilter] = useState<PoseFilter>("all")
	const [thumbnails, setThumbnails] = useState<readonly string[]>([])

	useEffect(() => {
		setThumbnails(renderPoseThumbnails())
	}, [])

	const visiblePoses = useMemo(
		() =>
			PRACTICE_POSES.map((pose, index) => ({ index, pose })).filter(
				({ pose }) => filter === "all" || pose.bucket === filter,
			),
		[filter],
	)

	return (
		<pose-contact-sheet className={css.class} data-filter={filter}>
			<header>
				<p>FEROX // POSE EVALUATION</p>
				<h1>50-POSE DRILL</h1>
				<span>Silhouette study / field grading</span>
				<nav aria-label="Pose bucket">
					<button
						type="button"
						data-active={filter === "all"}
						onClick={() => {
							setFilter("all")
						}}
					>
						ALL // 50
					</button>
					{POSE_BUCKETS.map((bucket) => (
						<button
							type="button"
							data-active={filter === bucket.id}
							onClick={() => {
								setFilter(bucket.id)
							}}
						>
							{bucket.label} //{" "}
							{
								PRACTICE_POSES.filter((pose) => pose.bucket === bucket.id)
									.length
							}
						</button>
					))}
				</nav>
			</header>
			<main aria-busy={thumbnails.length !== PRACTICE_POSES.length}>
				{visiblePoses.map(({ index, pose }) => (
					<article data-bucket={pose.bucket}>
						<img
							alt={`${pose.name} pilot pose`}
							src={thumbnails[index] ?? ""}
						/>
						<pose-caption>
							<small>{String(index + 1).padStart(2, "0")}</small>
							<strong>{pose.name}</strong>
							<span>{pose.bucket}</span>
						</pose-caption>
					</article>
				))}
			</main>
		</pose-contact-sheet>
	)
}
