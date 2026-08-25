import { describe, expect, test, vi } from "vitest"

import {
	canonicalControlProfileJson,
	cloneControlProfile,
	CONTROL_PROFILE_IMPORT_MAX_BYTES,
	CONTROL_PROFILE_STORAGE_KEY,
	createControlProfileExport,
	DEFAULT_CONTROL_PROFILE,
	importControlProfileFile,
	importControlProfileJson,
	loadControlProfile,
	saveControlProfile,
	validateControlProfile,
	type ControlProfileStorage,
} from "./ControlProfile.ts"
import { updateControllerBinding } from "./game-input.ts"

class MemoryControlProfileStorage implements ControlProfileStorage {
	readonly values = new Map<string, string>()
	readonly removed: string[] = []

	getItem(key: string): string | null {
		return this.values.get(key) ?? null
	}

	removeItem(key: string): void {
		this.removed.push(key)
		this.values.delete(key)
	}

	setItem(key: string, value: string): void {
		this.values.set(key, value)
	}
}

type EditableProfile = {
	bindings: Record<string, unknown>
	version: number
	[key: string]: unknown
}

function editableDefaultProfile(): EditableProfile {
	return JSON.parse(
		canonicalControlProfileJson(DEFAULT_CONTROL_PROFILE),
	) as EditableProfile
}

describe("controller profile schema", () => {
	test("accepts the complete versioned default with autorun and grapple", () => {
		const validation = validateControlProfile(DEFAULT_CONTROL_PROFILE)
		expect(validation.success).toBe(true)
		if (!validation.success) return
		expect(validation.profile.bindings.autorun).toEqual({
			index: 10,
			kind: "button",
		})
		expect(validation.profile.bindings.grapple).toEqual({
			index: 6,
			kind: "button",
		})
		expect("sprint" in validation.profile.bindings).toBe(false)
	})

	test("rejects unknown keys, versions, kinds, ranges, and duplicates", () => {
		const unknownTopLevel = editableDefaultProfile()
		unknownTopLevel.deviceId = "private-device-metadata"
		expect(validateControlProfile(unknownTopLevel).success).toBe(false)

		const unknownAction = editableDefaultProfile()
		unknownAction.bindings.prototype = { index: 4, kind: "button" }
		expect(validateControlProfile(unknownAction).success).toBe(false)

		const wrongVersion = editableDefaultProfile()
		wrongVersion.version = 2
		expect(validateControlProfile(wrongVersion).success).toBe(false)

		const wrongKind = editableDefaultProfile()
		wrongKind.bindings.moveX = { index: 0, kind: "button" }
		expect(validateControlProfile(wrongKind).success).toBe(false)

		const invalidRange = editableDefaultProfile()
		invalidRange.bindings.jump = { index: 500, kind: "button" }
		expect(validateControlProfile(invalidRange).success).toBe(false)

		const duplicate = editableDefaultProfile()
		duplicate.bindings.jump = duplicate.bindings.crouch
		expect(validateControlProfile(duplicate).success).toBe(false)

		const remappedMenu = editableDefaultProfile()
		remappedMenu.bindings.menu = { index: 13, kind: "button" }
		expect(validateControlProfile(remappedMenu).success).toBe(false)
	})
})

describe("controller profile storage", () => {
	test("uses defaults when missing and restores a valid saved mapping", () => {
		const storage = new MemoryControlProfileStorage()
		const missing = loadControlProfile(storage)
		expect(missing).toMatchObject({
			clearedInvalid: false,
			source: "default",
		})

		const update = updateControllerBinding(missing.profile.bindings, "jump", {
			index: 2,
			kind: "button",
		})
		expect(update.status).toBe("applied")
		if (update.status !== "applied") return
		const saved = saveControlProfile(storage, {
			bindings: update.bindings,
			version: 1,
		})
		const loaded = loadControlProfile(storage)
		expect(loaded.source).toBe("stored")
		expect(loaded.profile).toEqual(saved)
	})

	test("clears malformed JSON and schema-invalid stored data", () => {
		const malformed = new MemoryControlProfileStorage()
		malformed.setItem(CONTROL_PROFILE_STORAGE_KEY, "{nope")
		const malformedResult = loadControlProfile(malformed)
		expect(malformedResult.clearedInvalid).toBe(true)
		expect(malformed.removed).toEqual([CONTROL_PROFILE_STORAGE_KEY])
		expect(malformedResult.profile).toEqual(DEFAULT_CONTROL_PROFILE)

		const invalid = new MemoryControlProfileStorage()
		const invalidProfile = editableDefaultProfile()
		invalidProfile.bindings.jump = { index: 99, kind: "button" }
		invalid.setItem(CONTROL_PROFILE_STORAGE_KEY, JSON.stringify(invalidProfile))
		const invalidResult = loadControlProfile(invalid)
		expect(invalidResult.clearedInvalid).toBe(true)
		expect(invalid.removed).toEqual([CONTROL_PROFILE_STORAGE_KEY])
		expect(invalidResult.profile).toEqual(DEFAULT_CONTROL_PROFILE)
	})
})

describe("controller profile import and export", () => {
	test("round-trips canonical data without browser or device metadata", () => {
		const artifact = createControlProfileExport(DEFAULT_CONTROL_PROFILE)
		expect(artifact.filename).toBe("ferox-controller-profile-v1.json")
		expect(artifact.mimeType).toBe("application/json")
		expect(artifact.text.endsWith("\n")).toBe(true)
		expect(artifact.text).not.toContain("localStorage")
		expect(artifact.text).not.toContain("gamepad")
		const imported = importControlProfileJson(artifact.text)
		expect(imported).toEqual({
			profile: DEFAULT_CONTROL_PROFILE,
			success: true,
		})
	})

	test("rejects invalid and oversized imports without mutating active data", () => {
		const active = cloneControlProfile(DEFAULT_CONTROL_PROFILE)
		expect(importControlProfileJson("not json")).toMatchObject({
			success: false,
		})
		expect(
			importControlProfileJson(
				"x".repeat(CONTROL_PROFILE_IMPORT_MAX_BYTES + 1),
			),
		).toMatchObject({ success: false })
		expect(active).toEqual(DEFAULT_CONTROL_PROFILE)
	})

	test("bounds files before reading and accepts a valid exported file", async () => {
		const text = vi.fn(async () =>
			canonicalControlProfileJson(DEFAULT_CONTROL_PROFILE),
		)
		const oversized = await importControlProfileFile({
			size: CONTROL_PROFILE_IMPORT_MAX_BYTES + 1,
			text,
		})
		expect(oversized.success).toBe(false)
		expect(text).not.toHaveBeenCalled()

		const validText = canonicalControlProfileJson(DEFAULT_CONTROL_PROFILE)
		const valid = await importControlProfileFile({
			size: new TextEncoder().encode(validText).byteLength,
			text: async () => validText,
		})
		expect(valid).toEqual({
			profile: DEFAULT_CONTROL_PROFILE,
			success: true,
		})
	})
})
