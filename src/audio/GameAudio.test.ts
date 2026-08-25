import { describe, expect, test } from "vitest"

import { GUN_IDS } from "../guns/GunDefinitions.ts"
import {
	deriveMusicIntensity,
	scaleDegreeFrequency,
	stepEngagementMomentum,
} from "./GameAudio.ts"
import { DEFAULT_GAME_AUDIO, GAME_SOUND_IDS } from "./GameAudioDefinitions.ts"
import { defineSynthPatch, midiToFrequency } from "./SynthComposer.ts"

describe("authored procedural audio", () => {
	test("defines every gameplay and weapon sound a priori", () => {
		expect(Object.keys(DEFAULT_GAME_AUDIO.effects).sort()).toEqual(
			[...GAME_SOUND_IDS].sort(),
		)
		expect(Object.keys(DEFAULT_GAME_AUDIO.weapons).sort()).toEqual(
			[...GUN_IDS].sort(),
		)
		for (const patch of [
			...Object.values(DEFAULT_GAME_AUDIO.effects),
			...Object.values(DEFAULT_GAME_AUDIO.weapons),
		]) {
			expect(patch.layers.length).toBeGreaterThan(0)
			expect(patch.baseFrequencyHz).toBeGreaterThan(0)
		}
	})

	test("authors crunchy running and a crackly ARC blaster", () => {
		expect(
			DEFAULT_GAME_AUDIO.effects["run-step"].layers.some(
				(layer) =>
					layer.source.kind === "noise" &&
					layer.source.texture === "crunch" &&
					"distortion" in layer &&
					layer.distortion > 0,
			),
		).toBe(true)
		expect(
			DEFAULT_GAME_AUDIO.weapons["arc-blaster"].layers.filter(
				(layer) =>
					layer.source.kind === "noise" && layer.source.texture === "crackle",
			),
		).toHaveLength(2)
	})

	test("builds musical intensity from live gameplay pressure", () => {
		const calm = deriveMusicIntensity({
			combatHeat: 0,
			connected: true,
			engagement: 0,
			health: 100,
			horizontalSpeed: 0,
			threats: 0,
		})
		const topSpeed = deriveMusicIntensity({
			combatHeat: 0,
			connected: true,
			engagement: 0,
			health: 100,
			horizontalSpeed: 14.8,
			threats: 0,
		})
		const pressured = deriveMusicIntensity({
			combatHeat: 1,
			connected: true,
			engagement: 1,
			health: 24,
			horizontalSpeed: 14.8,
			threats: 2,
		})
		expect(calm).toBeCloseTo(0.12)
		expect(topSpeed).toBeGreaterThan(calm)
		expect(pressured).toBe(1)
		expect(
			deriveMusicIntensity({
				combatHeat: 1,
				connected: false,
				engagement: 1,
				health: 1,
				horizontalSpeed: 14.8,
				threats: 3,
			}),
		).toBe(0)
	})

	test("builds engagement quickly and lets the percussion fall away slowly", () => {
		const engaged = stepEngagementMomentum(0, 1, 0.25)
		const released = stepEngagementMomentum(engaged, 0, 0.25)
		expect(engaged).toBeGreaterThan(0.65)
		expect(released).toBeGreaterThan(engaged * 0.8)
	})

	test("layers a seeded drum circle as engagement rises", () => {
		const drumCircle = DEFAULT_GAME_AUDIO.music.tracks.filter((track) =>
			track.id.includes("circle"),
		)
		expect(drumCircle).toHaveLength(4)
		expect(
			drumCircle.map((track) =>
				"minimumEngagement" in track ? track.minimumEngagement : undefined,
			),
		).toEqual([0.06, 0.22, 0.42, 0.58])
		expect(new Set(drumCircle.map((track) => track.pattern.length)).size).toBe(
			3,
		)
	})

	test("maps positive and negative scale degrees across octaves", () => {
		const scale = [0, 2, 3, 5, 7, 9, 10]
		expect(scaleDegreeFrequency(45, scale, 0)).toBeCloseTo(midiToFrequency(45))
		expect(scaleDegreeFrequency(45, scale, 7)).toBeCloseTo(midiToFrequency(57))
		expect(scaleDegreeFrequency(45, scale, -1)).toBeCloseTo(midiToFrequency(43))
	})

	test("rejects invalid authored synth patches at module load time", () => {
		expect(() =>
			defineSynthPatch({
				baseFrequencyHz: 0,
				id: "invalid",
				layers: [],
			}),
		).toThrow(/base frequency/)
	})
})
