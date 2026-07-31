export const PICKUP_GAMEPAD_BUTTON = 3
export const PICKUP_KEY_CODE = "KeyE"

export type InputEdge = {
	held: boolean
	triggered: boolean
}

export function inputEdge(
	pressed: boolean,
	previouslyHeld: boolean,
): InputEdge {
	return { held: pressed, triggered: pressed && !previouslyHeld }
}

export function isPickupKeyboardInput(code: string, repeat: boolean): boolean {
	return code === PICKUP_KEY_CODE && !repeat
}

export function isPickupGamepadInput(
	buttons: readonly ({ pressed?: boolean; value?: number } | undefined)[],
): boolean {
	const button = buttons[PICKUP_GAMEPAD_BUTTON]
	return button?.pressed === true || (button?.value ?? 0) > 0.5
}
