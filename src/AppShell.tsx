import { useI, useO } from "atom.io/react"
import { useCallback, useEffect, useRef, useState } from "preact/hooks"
import type { VNode } from "preact"
import type { Socket } from "socket.io-client"

import { ArenaGame } from "./ArenaGame.ts"
import css from "./AppShell.module.css"
import {
	DRONE_POPULATION_CAP,
	PLAYER_POPULATION_CAP,
} from "./game-constants.ts"
import { arenaSeedAtom, gameHudStateAtom } from "./game-state.ts"
import { gunDefinition } from "./guns/GunDefinitions.ts"

type AppShellProps = {
	socket: Socket
}

export function AppShell({ socket }: AppShellProps): VNode {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const deployedRef = useRef(false)
	const gameRef = useRef<ArenaGame | null>(null)
	const [deployed, setDeployed] = useState(false)
	const hud = useO(gameHudStateAtom)
	const seed = useO(arenaSeedAtom)
	const setHud = useI(gameHudStateAtom)
	const incomingThreats = hud.incomingMissileLocks + hud.incomingStandardLocks
	const gun = gunDefinition(hud.weapon)
	const incomingThreatKind =
		hud.incomingMissileLocks > 0 && hud.incomingStandardLocks > 0
			? "combined"
			: hud.incomingMissileLocks > 0
				? "missile"
				: "standard"

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

	const deploy = useCallback((): void => {
		if (deployedRef.current) return
		deployedRef.current = true
		setDeployed(true)
		gameRef.current?.start()
	}, [])

	useEffect(() => {
		if (deployed || typeof navigator.getGamepads !== "function") return

		let animationFrame = 0
		const pollForDeploy = (): void => {
			const requested = Array.from(navigator.getGamepads()).some(
				(gamepad) =>
					gamepad !== null &&
					(gamepad.buttons[0]?.pressed === true ||
						gamepad.buttons[9]?.pressed === true),
			)
			if (requested) {
				deploy()
				return
			}
			animationFrame = requestAnimationFrame(pollForDeploy)
		}

		animationFrame = requestAnimationFrame(pollForDeploy)
		return () => cancelAnimationFrame(animationFrame)
	}, [deploy, deployed])

	return (
		<app-shell className={css.class} data-deployed={deployed}>
			<canvas ref={canvasRef} tabIndex={-1} aria-label="FEROX 3D arena" />
			<game-vignette aria-hidden="true" />
			<game-hud aria-label="Arena heads-up display" data-dead={hud.dead}>
				<game-header>
					<brand-mark>
						<mark>W//</mark>
						<strong>FEROX</strong>
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
						<span>
							{hud.players}/{PLAYER_POPULATION_CAP} PILOTS
						</span>
						<i aria-hidden="true">•</i>
						<span>
							{hud.drones}/{DRONE_POPULATION_CAP} DRONES
						</span>
					</match-status>
					<score-board>
						<small>SKIRMISH</small>
						<strong>{String(hud.score).padStart(2, "0")}</strong>
						<i>/</i>
						<span>15</span>
					</score-board>
				</game-header>

				<incoming-threat
					data-active={incomingThreats > 0}
					data-kind={incomingThreatKind}
					data-missile-locks={hud.incomingMissileLocks}
					data-standard-locks={hud.incomingStandardLocks}
					role="status"
					aria-live="assertive"
					aria-hidden={incomingThreats === 0}
				>
					<strong>
						{incomingThreatKind === "combined"
							? "⚠ TARGET + MISSILE LOCK"
							: incomingThreatKind === "missile"
								? "⚠ MISSILE LOCK"
								: "⚠ TARGET LOCK"}
					</strong>
					<span>
						{incomingThreatKind === "combined"
							? `${hud.incomingStandardLocks} TARGETING • ${hud.incomingMissileLocks} MISSILE`
							: incomingThreatKind === "missile"
								? hud.incomingMissileLocks === 1
									? "1 INCOMING PILOT"
									: `${hud.incomingMissileLocks} INCOMING PILOTS`
								: hud.incomingStandardLocks === 1
									? "1 PILOT TARGETING YOU"
									: `${hud.incomingStandardLocks} PILOTS TARGETING YOU`}
					</span>
				</incoming-threat>

				<pickup-prompt
					data-active={hud.pickup === "nearby"}
					aria-hidden={hud.pickup !== "nearby"}
					style={{ "--pickup-progress": hud.pickupProgress }}
				>
					<strong>MINI-MISSILE READY</strong>
					<span>
						<kbd>E</kbd>
						<kbd>RB</kbd>
						HOLD TO PICK UP
					</span>
					<pickup-progress aria-hidden="true">
						<i />
					</pickup-progress>
				</pickup-prompt>

				<drone-recovery-prompt
					data-active={hud.droneWreckNearby}
					aria-hidden={!hud.droneWreckNearby}
				>
					<strong>DRONE CORE RECOVERABLE</strong>
					<span>
						<kbd>E</kbd>
						<kbd>RB</kbd> TAP TO SALVAGE
					</span>
				</drone-recovery-prompt>

				<smart-target-zone data-state={hud.targeting} aria-hidden="true">
					<free-aim-label>
						<strong>FREE AIM</strong>
						<span>MANUAL BALLISTICS</span>
					</free-aim-label>
					<target-warning>
						<strong>
							{hud.targeting === "escaping"
								? String(hud.lockCountdown).padStart(4, "0")
								: "0000"}
							<small>ms</small>
						</strong>
						<span>
							{hud.targeting === "lost"
								? "❌ TARGET LOST"
								: "⚠ TARGET ESCAPING"}
						</span>
					</target-warning>
				</smart-target-zone>

				<cross-hair
					data-state={hud.targeting}
					style={{
						"--reticle-x": `${hud.reticleX * 100}%`,
						"--reticle-y": `${hud.reticleY * 100}%`,
						"--weapon-spread-offset": `${hud.recoilSpread * 0.85}rem`,
					}}
					aria-hidden="true"
				>
					<recoil-arms key={`recoil-${hud.recoilPulse}`}>
						<i />
						<i />
						<i />
						<i />
					</recoil-arms>
					<b />
					{hud.hitMarkerVisible && (
						<hit-marker
							key={`hit-${hud.hitMarkerSequence}`}
							data-classification={hud.hitMarkerClassification}
						>
							<i />
							<i />
							<i />
							<i />
						</hit-marker>
					)}
					<target-lock-box>
						<small>✅ TARGET LOCKED</small>
					</target-lock-box>
				</cross-hair>
				<lead-cross-hair
					data-visible={hud.leadReticleVisible}
					style={{
						"--lead-reticle-x": `${hud.leadReticleX * 100}%`,
						"--lead-reticle-y": `${hud.leadReticleY * 100}%`,
					}}
					aria-hidden="true"
				>
					<i />
					<i />
				</lead-cross-hair>

				<speed-readout data-active={hud.speed > 2}>
					<small>VELOCITY</small>
					<strong>{String(hud.speed).padStart(3, "0")}</strong>
					<span>KM/H</span>
					<velocity-bar>
						<i style={{ "--speed": `${Math.min(hud.speed / 54, 1)}` }} />
					</velocity-bar>
					<em>
						{hud.wallTraversal === "run"
							? "WALL RUN"
							: hud.wallTraversal === "slide"
								? "WALL SLIDE"
								: hud.sliding
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
					<grenade-status data-active={hud.grenadeKind === "drone"}>
						<kbd>2 / X</kbd>
						<strong>
							{hud.grenadeKind === "drone" ? "DRONE SHURIKEN" : "FRAG"}
						</strong>
						<span>×{hud.droneGrenades}</span>
					</grenade-status>
					<weapon-slots aria-label="Weapon slots">
						{hud.weaponSlots.map((slot, index) => (
							<weapon-slot key={index} data-active={hud.activeSlot === index}>
								<b>{index + 1}</b>
								<span>
									{slot === null
										? "EMPTY"
										: `${gunDefinition(slot.weapon).name} ${String(slot.ammo).padStart(2, "0")}`}
								</span>
							</weapon-slot>
						))}
					</weapon-slots>
					<small>{gun.name}</small>
					<ammo-count>
						<strong>{String(hud.ammo).padStart(2, "0")}</strong>
						<span>/ {String(gun.magazineSize).padStart(2, "0")}</span>
					</ammo-count>
					<em>
						{hud.reloading
							? `RELOADING ${Math.round(hud.reloadProgress * 100)}%`
							: gun.fire.type === "guided-missile"
								? hud.ammo === 0
									? "PRESS RB / R TO SERVICE LAUNCHER"
									: "GUIDANCE ARMED • 1 / Y / WHEEL TO SWITCH • X TO DROP"
								: hud.pickup === "nearby"
									? "HOLD E / RB TO PICK UP"
									: hud.ammo === 0
										? "PRESS RB / R TO RELOAD"
										: hud.pickup === "available"
											? "MINI-MISSILE AVAILABLE"
											: hud.pickup === "carried"
												? "MINI-MISSILE CARRIED"
												: "MINI-MISSILE RESPAWNING"}
					</em>
				</weapon-status>

				{hud.dead && (
					<respawn-status role="status" aria-live="assertive">
						<small>PILOT DOWN</small>
						<strong>{hud.respawnRemaining}</strong>
						<span>RESPAWNING</span>
					</respawn-status>
				)}

				<game-footer>
					<control-hint>
						<kbd>WASD</kbd>
						<span>MOVE</span>
						<kbd>SHIFT</kbd>
						<span>SPRINT</span>
						<kbd>V / CAPS / LS</kbd>
						<span>FREERUN</span>
						<kbd>SPACE ×2</kbd>
						<span>DOUBLE JUMP</span>
						<kbd>C</kbd>
						<span>SLIDE</span>
					</control-hint>
					<arena-id>SEED // {seed}</arena-id>
					<control-hint>
						<kbd>LB TAP</kbd>
						<span>LOCK</span>
						<kbd>LB HOLD</kbd>
						<span>FREE AIM</span>
						<kbd>1 / Y / WHEEL</kbd>
						<span>SWITCH</span>
						<kbd>RMB / LT</kbd>
						<span>GRENADE</span>
						<kbd>2 / X</kbd>
						<span>GRENADE TYPE</span>
						<kbd>HOLD E / RB</kbd>
						<span>PICK UP</span>
						<kbd>R / RB</kbd>
						<span>RELOAD</span>
						<kbd>V / D-PAD ↑</kbd>
						<span>WAVE</span>
						<kbd>G / D-PAD →</kbd>
						<span>SALUTE</span>
						<kbd>B / D-PAD ←</kbd>
						<span>FISTBUMP</span>
						<kbd>H / RS</kbd>
						<span>PUNCH</span>
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
						<small>Click or press A / Start on gamepad</small>
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
