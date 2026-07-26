import { useI, useO } from "atom.io/react"
import { useEffect, useRef, useState } from "preact/hooks"
import type { VNode } from "preact"
import type { Socket } from "socket.io-client"

import { ArenaGame } from "./ArenaGame.ts"
import css from "./AppShell.module.css"
import { arenaSeedAtom, gameHudStateAtom } from "./game-state.ts"

type AppShellProps = {
	socket: Socket
}

export function AppShell({ socket }: AppShellProps): VNode {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const gameRef = useRef<ArenaGame | null>(null)
	const [deployed, setDeployed] = useState(false)
	const hud = useO(gameHudStateAtom)
	const seed = useO(arenaSeedAtom)
	const setHud = useI(gameHudStateAtom)

	useEffect(() => {
		const canvas = canvasRef.current
		if (canvas === null) return
		const game = new ArenaGame({ canvas, onHud: setHud, seed, socket })
		gameRef.current = game
		return () => {
			game.dispose()
			gameRef.current = null
		}
	}, [seed, setHud, socket])

	const deploy = (): void => {
		setDeployed(true)
		gameRef.current?.start()
	}

	return (
		<app-shell className={css.class} data-deployed={deployed}>
			<canvas ref={canvasRef} tabIndex={-1} aria-label="Wayfarer 3D arena" />
			<game-vignette aria-hidden="true" />
			<game-hud aria-label="Arena heads-up display">
				<game-header>
					<brand-mark>
						<mark>W//</mark>
						<strong>WAYFARER</strong>
						<small>TRIAL GROUND</small>
					</brand-mark>
					<match-status>
						<status-light data-status={hud.connection} />
						<span>
							{hud.connection === "online"
								? "SYNCED"
								: hud.connection.toUpperCase()}
						</span>
						<i aria-hidden="true">•</i>
						<span>{hud.players}/12 PILOTS</span>
					</match-status>
					<score-board>
						<small>SKIRMISH</small>
						<strong>{String(hud.score).padStart(2, "0")}</strong>
						<i>/</i>
						<span>15</span>
					</score-board>
				</game-header>

				<cross-hair aria-hidden="true">
					<i />
					<i />
					<i />
					<i />
					<b />
				</cross-hair>

				<speed-readout data-active={hud.speed > 2}>
					<small>VELOCITY</small>
					<strong>{String(hud.speed).padStart(3, "0")}</strong>
					<span>KM/H</span>
					<velocity-bar>
						<i style={{ "--speed": `${Math.min(hud.speed / 54, 1)}` }} />
					</velocity-bar>
					<em>
						{hud.sliding
							? "SLIDE VECTOR"
							: hud.jump === 2
								? "DOUBLE JUMP"
								: "SURFACE LOCK"}
					</em>
				</speed-readout>

				<player-vitals>
					<vital-icon aria-hidden="true">+</vital-icon>
					<vital-copy>
						<small>INTEGRITY</small>
						<strong>{hud.health}</strong>
					</vital-copy>
					<vital-meter>
						<i style={{ "--health": `${hud.health / 100}` }} />
					</vital-meter>
				</player-vitals>

				<weapon-status>
					<small>ARC BLASTER</small>
					<ammo-count>
						<strong>{String(hud.ammo).padStart(2, "0")}</strong>
						<span>/ 28</span>
					</ammo-count>
					<em>{hud.ammo === 0 ? "PRESS R TO RELOAD" : "PLASMA CELLS"}</em>
				</weapon-status>

				<game-footer>
					<control-hint>
						<kbd>WASD</kbd>
						<span>MOVE</span>
						<kbd>SHIFT</kbd>
						<span>SPRINT</span>
						<kbd>SPACE ×2</kbd>
						<span>DOUBLE JUMP</span>
						<kbd>C</kbd>
						<span>SLIDE</span>
					</control-hint>
					<arena-id>SEED // {seed}</arena-id>
					<control-hint>
						<kbd>◉</kbd>
						<span>GAMEPAD READY</span>
					</control-hint>
				</game-footer>
			</game-hud>

			{!deployed && (
				<deploy-screen>
					<deploy-panel>
						<p>LIVE COMBAT SIMULATION</p>
						<h1>
							Own the
							<br />
							momentum.
						</h1>
						<blockquote>
							Every hill is leverage. Every landing is a choice. Keep moving.
						</blockquote>
						<button type="button" onClick={deploy}>
							<span>DEPLOY TO ARENA</span>
							<i aria-hidden="true">→</i>
						</button>
						<small>Mouse + keyboard or gamepad</small>
					</deploy-panel>
					<terrain-readout>
						<i />
						<span>PROCEDURAL TERRAIN</span>
						<strong>SEED {seed}</strong>
					</terrain-readout>
				</deploy-screen>
			)}
		</app-shell>
	)
}
