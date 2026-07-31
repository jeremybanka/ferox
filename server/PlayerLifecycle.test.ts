import assert from "node:assert/strict"
import { test } from "vitest"

import { PLAYER_RESPAWN_DELAY_MS } from "../src/game-constants.ts"
import {
	cancelReload,
	initialReloadState,
	reloadProgress,
	spendRound,
	startReload,
	updateReload,
} from "../src/ReloadState.ts"
import { stepSlideDust } from "../src/SlideDustState.ts"
import { PlayerLifecycle } from "./PlayerLifecycle.ts"

test("lethal damage creates one exact five-second lifecycle", () => {
	const lifecycle = new PlayerLifecycle()
	lifecycle.add("pilot")
	lifecycle.awardScore("pilot")
	lifecycle.awardScore("pilot")

	assert.equal(lifecycle.damage("pilot", 120, 10_000), "died")
	assert.deepEqual(lifecycle.get("pilot"), {
		dead: true,
		deathStartedAt: 10_000,
		health: 0,
		respawnAt: 10_000 + PLAYER_RESPAWN_DELAY_MS,
		score: 1,
	})
	assert.equal(lifecycle.damage("pilot", 120, 10_001), "ignored")
	assert.equal(lifecycle.get("pilot")?.score, 1)
	assert.deepEqual(lifecycle.advance(14_999), [])
	assert.deepEqual(lifecycle.advance(15_000), ["pilot"])
	assert.deepEqual(lifecycle.advance(16_000), [])
	assert.deepEqual(lifecycle.get("pilot"), {
		dead: false,
		deathStartedAt: null,
		health: 100,
		respawnAt: null,
		score: 1,
	})
})

test("dead players are excluded and disconnects cancel pending respawns", () => {
	const lifecycle = new PlayerLifecycle()
	lifecycle.add("pilot")
	lifecycle.damage("pilot", 100, 0)
	assert.equal(lifecycle.isAlive("pilot"), false)
	lifecycle.delete("pilot")
	assert.deepEqual(lifecycle.advance(PLAYER_RESPAWN_DELAY_MS), [])
})

test("reload refills once at the defined phase and gates rounds", () => {
	let state = initialReloadState(7)
	state = startReload(state, 100)
	assert.equal(startReload(state, 101), state)
	assert.equal(spendRound(state), state)
	assert.ok(reloadProgress(state, 100.5) > 0)

	state = updateReload(state, 101.2)
	assert.equal(state.ammo, 28)
	assert.equal(state.reloading, true)
	state = updateReload(state, 101.65)
	assert.equal(state.ammo, 28)
	assert.equal(state.reloading, false)
})

test("reload eligibility and cancellation never award late ammo", () => {
	const full = initialReloadState()
	assert.equal(startReload(full, 10), full)
	const partial = startReload(initialReloadState(4), 10)
	const cancelled = cancelReload(partial)
	assert.equal(cancelled.reloading, false)
	assert.equal(updateReload(cancelled, 50).ammo, 4)
})

test("slide dust emits on entry and a bounded cadence, then resets", () => {
	let state = { active: false, elapsed: 0 }
	let step = stepSlideDust(state, true, 0.01)
	assert.equal(step.emissions, 1)
	state = step.state
	step = stepSlideDust(state, true, 0.12)
	assert.equal(step.emissions, 0)
	state = step.state
	step = stepSlideDust(state, true, 0.02)
	assert.equal(step.emissions, 1)
	step = stepSlideDust(step.state, false, 1)
	assert.deepEqual(step, {
		emissions: 0,
		state: { active: false, elapsed: 0 },
	})
})
