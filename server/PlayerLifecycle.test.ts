import assert from "node:assert/strict"
import { test } from "vitest"

import { PLAYER_RESPAWN_DELAY_MS } from "../src/game-constants.ts"
import {
	advanceReload,
	cancelReload,
	reloadProgress,
	startReload,
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

test("ARC reload captures authoritative timing and emits one refill phase", () => {
	let state = startReload({ ammo: 7, gunId: "arc-blaster", slot: 0 }, 100)
	assert.deepEqual(state, {
		completesAt: 101.65,
		gunId: "arc-blaster",
		refillAt: 101.188,
		refilled: false,
		slot: 0,
		startedAt: 100,
	})
	assert.ok(reloadProgress(state, 100.5) > 0)

	let step = advanceReload(state, 101.187)
	assert.equal(step.refill, null)
	state = step.state
	step = advanceReload(state, 101.188)
	assert.equal(step.refill?.gunId, "arc-blaster")
	assert.equal(step.state?.refilled, true)
	state = step.state
	step = advanceReload(state, 101.4)
	assert.equal(step.refill, null)
	assert.equal(step.completed, false)
	step = advanceReload(step.state, 101.65)
	assert.deepEqual(step, { completed: true, refill: null, state: null })
})

test("per-gun timing, eligibility, and cancellation never emit late refill", () => {
	assert.equal(
		startReload({ ammo: 28, gunId: "arc-blaster", slot: 0 }, 10),
		null,
	)
	const mini = startReload({ ammo: 4, gunId: "mini-missile", slot: 1 }, 10)
	assert.deepEqual(mini, {
		completesAt: 12.4,
		gunId: "mini-missile",
		refillAt: 11.872,
		refilled: false,
		slot: 1,
		startedAt: 10,
	})
	const cancelled = cancelReload(mini)
	assert.equal(cancelled, null)
	assert.deepEqual(advanceReload(cancelled, 50), {
		completed: false,
		refill: null,
		state: null,
	})
})

test("Bubble Gun reload captures the competitive two-second refill", () => {
	const bubble = startReload({ ammo: 1, gunId: "bubble-gun", slot: 1 }, 20)
	assert.deepEqual(bubble, {
		completesAt: 22,
		gunId: "bubble-gun",
		refillAt: 21.72,
		refilled: false,
		slot: 1,
		startedAt: 20,
	})
	assert.equal(advanceReload(bubble, 21.719).refill, null)
	assert.equal(advanceReload(bubble, 21.72).refill?.gunId, "bubble-gun")
	assert.equal(
		advanceReload({ ...bubble!, refilled: true }, 22).completed,
		true,
	)
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
