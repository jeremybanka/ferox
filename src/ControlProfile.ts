import { z } from "zod"

import {
	CONTROLLER_ACTION_IDS,
	CONTROLLER_ACTION_REGISTRY,
	CONTROLLER_MENU_BINDING,
	controllerBindingCompatible,
	controllerBindingSourceKey,
	DEFAULT_CONTROLLER_BINDINGS,
	type ControllerActionId,
	type ControllerBinding,
	type ControllerBindings,
} from "./game-input.ts"

export const CONTROL_PROFILE_VERSION = 1 as const
export const CONTROL_PROFILE_STORAGE_KEY = "ferox:controller-profile"
export const CONTROL_PROFILE_IMPORT_MAX_BYTES = 64 * 1_024
export const CONTROL_PROFILE_EXPORT_FILENAME =
	"ferox-controller-profile-v1.json"

export type ControlProfile = Readonly<{
	bindings: ControllerBindings
	version: typeof CONTROL_PROFILE_VERSION
}>

const controllerBindingSchema = z.discriminatedUnion("kind", [
	z.strictObject({
		index: z.number().int().min(0).max(31),
		kind: z.literal("button"),
	}),
	z.strictObject({
		index: z.number().int().min(0).max(15),
		inverted: z.boolean(),
		kind: z.literal("axis"),
	}),
])

const controllerBindingShape = Object.fromEntries(
	CONTROLLER_ACTION_IDS.map((actionId) => [actionId, controllerBindingSchema]),
) as Record<ControllerActionId, typeof controllerBindingSchema>

export const controlProfileSchema = z
	.strictObject({
		bindings: z.strictObject(controllerBindingShape),
		version: z.literal(CONTROL_PROFILE_VERSION),
	})
	.superRefine((profile, context) => {
		const usedSources = new Map<string, ControllerActionId>()
		for (const actionId of CONTROLLER_ACTION_IDS) {
			const binding = profile.bindings[actionId]
			if (!controllerBindingCompatible(actionId, binding)) {
				context.addIssue({
					code: "custom",
					message: `${CONTROLLER_ACTION_REGISTRY[actionId].label} requires a ${CONTROLLER_ACTION_REGISTRY[actionId].inputKind === "axis" ? "stick axis" : "button or trigger"}`,
					path: ["bindings", actionId],
				})
			}
			const sourceKey = controllerBindingSourceKey(binding)
			const conflict = usedSources.get(sourceKey)
			if (conflict !== undefined) {
				context.addIssue({
					code: "custom",
					message: `${CONTROLLER_ACTION_REGISTRY[actionId].label} duplicates ${CONTROLLER_ACTION_REGISTRY[conflict].label}`,
					path: ["bindings", actionId],
				})
			} else {
				usedSources.set(sourceKey, actionId)
			}
		}

		const menuBinding = profile.bindings.menu
		if (
			menuBinding.kind !== "button" ||
			menuBinding.index !== CONTROLLER_MENU_BINDING.index
		) {
			context.addIssue({
				code: "custom",
				message: "Start / Options is reserved for the controls menu",
				path: ["bindings", "menu"],
			})
		}
	})

function cloneControllerBinding(binding: ControllerBinding): ControllerBinding {
	return binding.kind === "axis"
		? { index: binding.index, inverted: binding.inverted, kind: "axis" }
		: { index: binding.index, kind: "button" }
}

export function cloneControllerBindings(
	bindings: ControllerBindings,
): ControllerBindings {
	return Object.fromEntries(
		CONTROLLER_ACTION_IDS.map((actionId) => [
			actionId,
			cloneControllerBinding(bindings[actionId]),
		]),
	) as Record<ControllerActionId, ControllerBinding>
}

export const DEFAULT_CONTROL_PROFILE: ControlProfile = {
	bindings: cloneControllerBindings(DEFAULT_CONTROLLER_BINDINGS),
	version: CONTROL_PROFILE_VERSION,
}

export function cloneControlProfile(profile: ControlProfile): ControlProfile {
	return {
		bindings: cloneControllerBindings(profile.bindings),
		version: CONTROL_PROFILE_VERSION,
	}
}

export type ControlProfileValidation =
	| Readonly<{ profile: ControlProfile; success: true }>
	| Readonly<{ message: string; success: false }>

export function validateControlProfile(
	input: unknown,
): ControlProfileValidation {
	const result = controlProfileSchema.safeParse(input)
	if (!result.success) {
		return {
			message: result.error.issues[0]?.message ?? "Invalid control profile",
			success: false,
		}
	}
	return {
		profile: {
			bindings: cloneControllerBindings(result.data.bindings),
			version: CONTROL_PROFILE_VERSION,
		},
		success: true,
	}
}

export function canonicalControlProfileJson(profile: ControlProfile): string {
	const validation = validateControlProfile(profile)
	if (!validation.success) throw new Error(validation.message)
	return `${JSON.stringify(validation.profile, null, "\t")}\n`
}

export type ControlProfileStorage = Pick<
	Storage,
	"getItem" | "removeItem" | "setItem"
>

export type LoadedControlProfile = Readonly<{
	clearedInvalid: boolean
	message: string | null
	profile: ControlProfile
	source: "default" | "stored"
}>

export function loadControlProfile(
	storage: ControlProfileStorage,
): LoadedControlProfile {
	let stored: string | null
	try {
		stored = storage.getItem(CONTROL_PROFILE_STORAGE_KEY)
	} catch {
		return {
			clearedInvalid: false,
			message: "Controller profile storage is unavailable",
			profile: cloneControlProfile(DEFAULT_CONTROL_PROFILE),
			source: "default",
		}
	}
	if (stored === null) {
		return {
			clearedInvalid: false,
			message: null,
			profile: cloneControlProfile(DEFAULT_CONTROL_PROFILE),
			source: "default",
		}
	}

	let input: unknown
	try {
		input = JSON.parse(stored)
	} catch {
		try {
			storage.removeItem(CONTROL_PROFILE_STORAGE_KEY)
		} catch {
			// Defaults remain safe even when storage cleanup is denied.
		}
		return {
			clearedInvalid: true,
			message: "Invalid stored controller profile was cleared",
			profile: cloneControlProfile(DEFAULT_CONTROL_PROFILE),
			source: "default",
		}
	}

	const validation = validateControlProfile(input)
	if (!validation.success) {
		try {
			storage.removeItem(CONTROL_PROFILE_STORAGE_KEY)
		} catch {
			// Defaults remain safe even when storage cleanup is denied.
		}
		return {
			clearedInvalid: true,
			message: `Invalid stored controller profile was cleared: ${validation.message}`,
			profile: cloneControlProfile(DEFAULT_CONTROL_PROFILE),
			source: "default",
		}
	}
	return {
		clearedInvalid: false,
		message: null,
		profile: validation.profile,
		source: "stored",
	}
}

export function saveControlProfile(
	storage: ControlProfileStorage,
	profile: ControlProfile,
): ControlProfile {
	const validation = validateControlProfile(profile)
	if (!validation.success) throw new Error(validation.message)
	storage.setItem(
		CONTROL_PROFILE_STORAGE_KEY,
		canonicalControlProfileJson(validation.profile),
	)
	return validation.profile
}

export type ControlProfileImport =
	| Readonly<{ message: string; success: false }>
	| Readonly<{ profile: ControlProfile; success: true }>

function utf8ByteLength(text: string): number {
	return new TextEncoder().encode(text).byteLength
}

export function importControlProfileJson(text: string): ControlProfileImport {
	if (utf8ByteLength(text) > CONTROL_PROFILE_IMPORT_MAX_BYTES) {
		return {
			message: `Control profile exceeds ${CONTROL_PROFILE_IMPORT_MAX_BYTES} bytes`,
			success: false,
		}
	}

	let input: unknown
	try {
		input = JSON.parse(text)
	} catch {
		return { message: "Control profile is not valid JSON", success: false }
	}
	return validateControlProfile(input)
}

export async function importControlProfileFile(
	file: Pick<File, "size" | "text">,
): Promise<ControlProfileImport> {
	if (file.size > CONTROL_PROFILE_IMPORT_MAX_BYTES) {
		return {
			message: `Control profile exceeds ${CONTROL_PROFILE_IMPORT_MAX_BYTES} bytes`,
			success: false,
		}
	}
	try {
		return importControlProfileJson(await file.text())
	} catch {
		return { message: "Control profile could not be read", success: false }
	}
}

export type ControlProfileExport = Readonly<{
	filename: string
	mimeType: "application/json"
	text: string
}>

export function createControlProfileExport(
	profile: ControlProfile,
): ControlProfileExport {
	return {
		filename: CONTROL_PROFILE_EXPORT_FILENAME,
		mimeType: "application/json",
		text: canonicalControlProfileJson(profile),
	}
}
