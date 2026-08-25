import type { VehicleKind } from "./arena-protocol.ts"
import {
	controllerActionHeld,
	type ResolvedControllerActions,
} from "./game-input.ts"

export type VehicleGamepadInput = Readonly<{
	accelerator: number
	afterburner: boolean
	brakeReverse: number
	handbrake: boolean
	steering: number
}>

export type VehicleDriverInput = Readonly<{
	afterburner: boolean
	handbrake: boolean
	steering: number
	throttle: number
}>

export type VehicleControllerInput = VehicleGamepadInput &
	Readonly<{ action: boolean }>

const clamp = (value: number): number =>
	Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0))

const VEHICLE_DRIVER_KEY_CODES = new Set([
	"ArrowDown",
	"ArrowLeft",
	"ArrowRight",
	"ArrowUp",
	"KeyA",
	"KeyD",
	"KeyS",
	"KeyW",
	"ShiftLeft",
	"ShiftRight",
	"Space",
])

export function isVehicleDriverKeyboardCode(code: string): boolean {
	return VEHICLE_DRIVER_KEY_CODES.has(code)
}

/**
 * Reuses the active controller profile contextually: fire/RT drives,
 * grapple/LT brakes and reverses, jump/A handbrakes, switch/Y enters or exits,
 * and lock/LB activates the bike afterburner.
 */
export function vehicleControllerInput(
	actions: ResolvedControllerActions,
): VehicleControllerInput {
	return {
		accelerator: actions.values.fire,
		action: controllerActionHeld(actions, "switchWeapon"),
		afterburner: controllerActionHeld(actions, "lock"),
		brakeReverse: actions.values.grapple,
		handbrake: controllerActionHeld(actions, "jump"),
		steering: actions.values.moveX,
	}
}

/**
 * Conventional driving map shared by the live client and focused input tests.
 * W/up or RT drives; S/down or LT requests braking then reverse; A/D or the
 * left stick steers; Space/A is the handbrake; Shift/LB boosts the bike.
 */
export function vehicleDriverInput(
	kind: VehicleKind,
	keys: ReadonlySet<string>,
	gamepad: VehicleGamepadInput,
): VehicleDriverInput {
	const keyboardAccelerator = Number(keys.has("KeyW") || keys.has("ArrowUp"))
	const keyboardBrakeReverse = Number(keys.has("KeyS") || keys.has("ArrowDown"))
	const keyboardSteering =
		Number(keys.has("KeyD") || keys.has("ArrowRight")) -
		Number(keys.has("KeyA") || keys.has("ArrowLeft"))
	return {
		afterburner:
			kind === "bike" &&
			(keys.has("ShiftLeft") || keys.has("ShiftRight") || gamepad.afterburner),
		handbrake: keys.has("Space") || gamepad.handbrake,
		steering: clamp(keyboardSteering + gamepad.steering),
		throttle: clamp(
			keyboardAccelerator -
				keyboardBrakeReverse +
				Math.max(0, gamepad.accelerator) -
				Math.max(0, gamepad.brakeReverse),
		),
	}
}
