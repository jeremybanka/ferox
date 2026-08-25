import { useI, useO } from "atom.io/react"
import { useCallback, useEffect, useRef } from "preact/hooks"
import type { TargetedEvent, VNode } from "preact"

import {
	cloneControlProfile,
	createControlProfileExport,
	DEFAULT_CONTROL_PROFILE,
	importControlProfileFile,
	saveControlProfile,
	type ControlProfile,
} from "./ControlProfile.ts"
import css from "./ControlsMenu.module.css"
import {
	controlProfileAtom,
	controlsMenuStateAtom,
	type ControlsMenuStatus,
} from "./game-state.ts"
import {
	CONTROLLER_ACTION_IDS,
	CONTROLLER_ACTION_REGISTRY,
	controllerBindingLabel,
	INITIAL_CONTROLLER_BINDING_CAPTURE_STATE,
	stepControllerBindingCapture,
	updateControllerBinding,
	type ControllerActionId,
	type ControllerBindingCaptureState,
} from "./game-input.ts"

type ControlsMenuProps = Readonly<{
	onClose: () => void
}>

export function ControlsMenu({ onClose }: ControlsMenuProps): VNode {
	const profile = useO(controlProfileAtom)
	const menu = useO(controlsMenuStateAtom)
	const setProfile = useI(controlProfileAtom)
	const setMenu = useI(controlsMenuStateAtom)
	const closeButtonRef = useRef<HTMLButtonElement>(null)
	const rootRef = useRef<HTMLElement>(null)
	const captureStateRef = useRef<ControllerBindingCaptureState>(
		INITIAL_CONTROLLER_BINDING_CAPTURE_STATE,
	)
	const captureConnectedRef = useRef<boolean | null>(null)

	const updateStatus = useCallback(
		(status: ControlsMenuStatus, capturing = menu.capturing): void => {
			setMenu({ capturing, open: true, status })
		},
		[menu.capturing, setMenu],
	)

	const commitProfile = useCallback(
		(nextProfile: ControlProfile, status: ControlsMenuStatus): boolean => {
			try {
				const saved = saveControlProfile(globalThis.localStorage, nextProfile)
				setProfile(saved)
				setMenu({ capturing: null, open: true, status })
				return true
			} catch {
				setMenu({
					capturing: null,
					open: true,
					status: {
						kind: "error",
						message: "The controller profile could not be saved",
					},
				})
				return false
			}
		},
		[setMenu, setProfile],
	)

	useEffect(() => {
		closeButtonRef.current?.focus()
		const handleKeyboard = (event: KeyboardEvent): void => {
			if (event.key === "Escape") {
				event.preventDefault()
				event.stopPropagation()
				onClose()
				return
			}
			if (event.key !== "Tab") return
			const focusable = Array.from(
				rootRef.current?.querySelectorAll<HTMLElement>(
					'button:not([disabled]), input:not([disabled]), [tabindex="0"]',
				) ?? [],
			)
			if (focusable.length === 0) return
			const first = focusable[0]
			const last = focusable.at(-1)
			if (first === undefined || last === undefined) return
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault()
				last.focus()
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault()
				first.focus()
			}
		}
		window.addEventListener("keydown", handleKeyboard, true)
		return () => window.removeEventListener("keydown", handleKeyboard, true)
	}, [onClose])

	useEffect(() => {
		const capturingAction = menu.capturing
		if (capturingAction === null) {
			captureStateRef.current = INITIAL_CONTROLLER_BINDING_CAPTURE_STATE
			captureConnectedRef.current = null
			return
		}
		captureStateRef.current = INITIAL_CONTROLLER_BINDING_CAPTURE_STATE
		captureConnectedRef.current = null
		let animationFrame = 0
		const pollCapture = (): void => {
			const gamepad =
				typeof navigator.getGamepads === "function"
					? (navigator.getGamepads().find((candidate) => candidate !== null) ??
						null)
					: null
			const connected = gamepad !== null && gamepad.connected !== false
			if (captureConnectedRef.current !== connected) {
				captureConnectedRef.current = connected
				if (!connected) {
					updateStatus(
						{
							kind: "error",
							message: "Connect a controller to continue capture",
						},
						capturingAction,
					)
				} else {
					updateStatus(
						{
							kind: "idle",
							message: "Release controls, then actuate the new input",
						},
						capturingAction,
					)
				}
			}
			const capture = stepControllerBindingCapture(
				captureStateRef.current,
				gamepad,
				CONTROLLER_ACTION_REGISTRY[capturingAction].inputKind,
			)
			captureStateRef.current = capture.state
			if (capture.binding !== null) {
				const update = updateControllerBinding(
					profile.bindings,
					capturingAction,
					capture.binding,
				)
				if (update.status === "rejected") {
					updateStatus(
						{
							kind: "error",
							message:
								update.reason === "reserved-source"
									? "Start / Options is reserved for the controls menu"
									: "That input is not compatible with this action",
						},
						capturingAction,
					)
					captureStateRef.current = INITIAL_CONTROLLER_BINDING_CAPTURE_STATE
				} else {
					const swapped = update.swappedAction
					commitProfile(
						{ bindings: update.bindings, version: profile.version },
						{
							kind: "success",
							message:
								swapped === null
									? `${CONTROLLER_ACTION_REGISTRY[capturingAction].label} mapped to ${controllerBindingLabel(capture.binding)}`
									: `${CONTROLLER_ACTION_REGISTRY[capturingAction].label} swapped with ${CONTROLLER_ACTION_REGISTRY[swapped].label}`,
						},
					)
					return
				}
			}
			animationFrame = requestAnimationFrame(pollCapture)
		}
		animationFrame = requestAnimationFrame(pollCapture)
		return () => cancelAnimationFrame(animationFrame)
	}, [commitProfile, menu.capturing, profile, updateStatus])

	const beginCapture = (actionId: ControllerActionId): void => {
		captureStateRef.current = INITIAL_CONTROLLER_BINDING_CAPTURE_STATE
		setMenu({
			capturing: actionId,
			open: true,
			status: {
				kind: "idle",
				message: "Release controls, then actuate the new input",
			},
		})
	}

	const cancelCapture = (): void => {
		setMenu({
			capturing: null,
			open: true,
			status: { kind: "idle", message: "Input capture cancelled" },
		})
	}

	const restoreDefaults = (): void => {
		commitProfile(cloneControlProfile(DEFAULT_CONTROL_PROFILE), {
			kind: "success",
			message: "Standard gamepad defaults restored",
		})
	}

	const exportProfile = (): void => {
		try {
			const artifact = createControlProfileExport(profile)
			const url = URL.createObjectURL(
				new Blob([artifact.text], { type: artifact.mimeType }),
			)
			const anchor = document.createElement("a")
			anchor.download = artifact.filename
			anchor.href = url
			document.body.append(anchor)
			anchor.click()
			anchor.remove()
			URL.revokeObjectURL(url)
			updateStatus({ kind: "success", message: "Controller profile exported" })
		} catch {
			updateStatus({
				kind: "error",
				message: "The controller profile could not be exported",
			})
		}
	}

	const importProfile = async (
		event: TargetedEvent<HTMLInputElement, Event>,
	): Promise<void> => {
		const input = event.currentTarget
		const file = input.files?.[0]
		input.value = ""
		if (file === undefined) return
		const imported = await importControlProfileFile(file)
		if (!imported.success) {
			updateStatus({ kind: "error", message: imported.message })
			return
		}
		commitProfile(imported.profile, {
			kind: "success",
			message: "Controller profile imported",
		})
	}

	return (
		<controls-menu
			className={css.class}
			ref={rootRef}
			role="dialog"
			aria-modal="true"
			aria-labelledby="controls-menu-title"
			aria-describedby="controls-menu-description"
		>
			<controls-panel>
				<header>
					<header-copy>
						<small>OPTIONS // INPUT</small>
						<h2 id="controls-menu-title">Controller mapping</h2>
						<p id="controls-menu-description">
							Select an action, release the controller, then press its new
							button or move its new axis. Conflicts swap bindings.
						</p>
					</header-copy>
					<button ref={closeButtonRef} type="button" onClick={onClose}>
						Close <kbd>F1 / Start / Esc</kbd>
					</button>
				</header>

				<main>
					<ul aria-label="Controller actions">
						{CONTROLLER_ACTION_IDS.map((actionId) => {
							const action = CONTROLLER_ACTION_REGISTRY[actionId]
							const capturing = menu.capturing === actionId
							return (
								<li key={actionId} data-capturing={capturing}>
									<action-copy>
										<strong>{action.label}</strong>
										<small>{action.description}</small>
									</action-copy>
									<binding-value>
										{controllerBindingLabel(profile.bindings[actionId])}
									</binding-value>
									{action.remappable ? (
										<button
											type="button"
											aria-pressed={capturing}
											onClick={() => beginCapture(actionId)}
										>
											{capturing ? "Listening…" : "Remap"}
										</button>
									) : (
										<small>Reserved</small>
									)}
								</li>
							)
						})}
					</ul>
				</main>

				<footer>
					<menu-status
						role="status"
						aria-live="polite"
						data-kind={menu.status.kind}
					>
						{menu.status.message || "Profile version 1 ready"}
					</menu-status>
					<menu-actions>
						{menu.capturing !== null && (
							<button type="button" onClick={cancelCapture}>
								Cancel capture
							</button>
						)}
						<button type="button" onClick={restoreDefaults}>
							Restore defaults
						</button>
						<label>
							<span>Import JSON</span>
							<input
								type="file"
								accept=".json,application/json"
								onChange={importProfile}
							/>
						</label>
						<button type="button" onClick={exportProfile}>
							Export JSON
						</button>
					</menu-actions>
				</footer>
			</controls-panel>
		</controls-menu>
	)
}
