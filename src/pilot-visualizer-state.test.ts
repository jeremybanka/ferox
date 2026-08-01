import assert from "node:assert/strict"
import { test } from "vitest"

import {
	BASE_ANIMATIONS,
	OVERLAY_ANIMATIONS,
	RELOAD_IS_OVERLAY_ONLY,
} from "./pilot-visualizer-state.ts"

test("reload is catalogued only as a stackable overlay", () => {
	assert.equal(RELOAD_IS_OVERLAY_ONLY, true)
	assert.equal((BASE_ANIMATIONS as readonly string[]).includes("reload"), false)
	assert.equal(OVERLAY_ANIMATIONS.includes("reload"), true)
})
