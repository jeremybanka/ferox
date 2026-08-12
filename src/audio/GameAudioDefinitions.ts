import type { GunId } from "../guns/GunDefinitions.ts"
import {
	defineSynthPatch,
	type SynthEnvelope,
	type SynthPatch,
} from "./SynthComposer.ts"

export const GAME_SOUND_IDS = [
	"damage",
	"double-jump",
	"explosion",
	"grenade-throw",
	"fist-contact",
	"hit-confirm",
	"jump",
	"land",
	"pickup",
	"reload",
	"run-step",
	"slide-grit",
	"slide-start",
	"target-lock",
	"weapon-switch",
] as const

export type GameSoundId = (typeof GAME_SOUND_IDS)[number]

export type MusicTrackDefinition = {
	chance?: number
	followsProgression?: boolean
	gain: number
	gateBeats: number
	id: string
	minimumEngagement?: number
	minimumIntensity: number
	octave: number
	patch: SynthPatch
	pattern: readonly (number | null)[]
}

export type DynamicMusicDefinition = {
	beatsPerMinute: number
	lookAheadSeconds: number
	progression: readonly number[]
	rootMidi: number
	scale: readonly number[]
	stepsPerBeat: number
	tracks: readonly MusicTrackDefinition[]
}

export type GameAudioDefinition = {
	effects: Readonly<Record<GameSoundId, SynthPatch>>
	mix: {
		effectsGain: number
		masterGain: number
		musicGain: number
	}
	music: DynamicMusicDefinition
	weapons: Readonly<Record<GunId, SynthPatch>>
}

/** Validates a complete authored soundscape before a game starts. */
export function defineGameAudio<const Definition extends GameAudioDefinition>(
	definition: Definition,
): Definition {
	for (const [name, gain] of Object.entries(definition.mix)) {
		if (!Number.isFinite(gain) || gain < 0) {
			throw new Error(`${name} must be finite and non-negative.`)
		}
	}
	const music = definition.music
	if (!Number.isFinite(music.beatsPerMinute) || music.beatsPerMinute <= 0) {
		throw new Error("Music tempo must be a finite positive number.")
	}
	if (!Number.isSafeInteger(music.stepsPerBeat) || music.stepsPerBeat <= 0) {
		throw new Error("Music steps per beat must be a positive integer.")
	}
	if (music.scale.length === 0 || music.progression.length === 0) {
		throw new Error("Music requires a scale and chord progression.")
	}
	for (const track of music.tracks) {
		if (track.pattern.length === 0) {
			throw new Error(`${track.id} requires a note pattern.`)
		}
		if (track.minimumIntensity < 0 || track.minimumIntensity > 1) {
			throw new Error(`${track.id} has an invalid intensity threshold.`)
		}
		if (
			track.minimumEngagement !== undefined &&
			(track.minimumEngagement < 0 || track.minimumEngagement > 1)
		) {
			throw new Error(`${track.id} has an invalid engagement threshold.`)
		}
	}
	return definition
}

const pluckEnvelope = {
	attackSeconds: 0.004,
	decaySeconds: 0.08,
	releaseSeconds: 0.09,
	sustain: 0.2,
} as const satisfies SynthEnvelope

const impactEnvelope = {
	attackSeconds: 0.002,
	decaySeconds: 0.035,
	releaseSeconds: 0.08,
	sustain: 0.12,
} as const satisfies SynthEnvelope

const padEnvelope = {
	attackSeconds: 0.18,
	decaySeconds: 0.28,
	releaseSeconds: 0.55,
	sustain: 0.64,
} as const satisfies SynthEnvelope

const runStep = defineSynthPatch({
	baseFrequencyHz: 92,
	id: "run-step-crunch",
	layers: [
		{
			distortion: 0.88,
			durationSeconds: 0.095,
			envelope: impactEnvelope,
			filter: {
				endFrequencyRatio: 11,
				frequencyRatio: 24,
				kind: "bandpass",
				q: 0.78,
			},
			gain: 0.42,
			source: { kind: "noise", texture: "crunch" },
		},
		{
			durationSeconds: 0.085,
			envelope: impactEnvelope,
			frequencyEndRatio: 0.52,
			gain: 0.28,
			source: { kind: "oscillator", waveform: "triangle" },
		},
	],
	pitchJitterCents: 105,
})

const slideGrit = defineSynthPatch({
	baseFrequencyHz: 120,
	id: "slide-grit",
	layers: [
		{
			distortion: 0.66,
			durationSeconds: 0.19,
			envelope: {
				attackSeconds: 0.015,
				decaySeconds: 0.04,
				releaseSeconds: 0.08,
				sustain: 0.68,
			},
			filter: {
				endFrequencyRatio: 7,
				frequencyRatio: 15,
				kind: "bandpass",
				q: 1.25,
			},
			gain: 0.3,
			source: { kind: "noise", texture: "crunch" },
		},
	],
	pitchJitterCents: 150,
})

const arcBlaster = defineSynthPatch({
	baseFrequencyHz: 310,
	id: "arc-blaster-crackle",
	layers: [
		{
			distortion: 0.42,
			durationSeconds: 0.16,
			envelope: impactEnvelope,
			filter: {
				endFrequencyRatio: 4,
				frequencyRatio: 12,
				kind: "lowpass",
				q: 3.4,
			},
			frequencyEndRatio: 0.42,
			frequencyRatio: 1.45,
			gain: 0.4,
			source: { kind: "oscillator", waveform: "sawtooth" },
		},
		{
			distortion: 0.72,
			durationSeconds: 0.21,
			envelope: {
				attackSeconds: 0.001,
				decaySeconds: 0.045,
				releaseSeconds: 0.12,
				sustain: 0.18,
			},
			filter: {
				endFrequencyRatio: 3,
				frequencyRatio: 8,
				kind: "highpass",
				q: 0.8,
			},
			gain: 0.58,
			source: { density: 820, kind: "noise", texture: "crackle" },
		},
		{
			delaySeconds: 0.048,
			distortion: 0.5,
			durationSeconds: 0.13,
			envelope: impactEnvelope,
			filter: {
				frequencyRatio: 15,
				kind: "bandpass",
				q: 2.1,
			},
			gain: 0.28,
			source: { density: 480, kind: "noise", texture: "crackle" },
		},
	],
	pitchJitterCents: 36,
})

const miniMissile = defineSynthPatch({
	baseFrequencyHz: 76,
	id: "mini-missile-launch",
	layers: [
		{
			distortion: 0.34,
			durationSeconds: 0.52,
			envelope: {
				attackSeconds: 0.012,
				decaySeconds: 0.11,
				releaseSeconds: 0.2,
				sustain: 0.62,
			},
			filter: {
				endFrequencyRatio: 16,
				frequencyRatio: 4,
				kind: "lowpass",
				q: 1.6,
			},
			frequencyEndRatio: 2.8,
			gain: 0.46,
			source: { kind: "oscillator", waveform: "sawtooth" },
		},
		{
			durationSeconds: 0.58,
			envelope: {
				attackSeconds: 0.008,
				decaySeconds: 0.08,
				releaseSeconds: 0.24,
				sustain: 0.72,
			},
			filter: {
				endFrequencyRatio: 22,
				frequencyRatio: 8,
				kind: "bandpass",
				q: 0.9,
			},
			gain: 0.33,
			source: { kind: "noise", texture: "white" },
		},
	],
	pitchJitterCents: 22,
})

const shotgun = defineSynthPatch({
	baseFrequencyHz: 68,
	id: "shotgun-blast",
	layers: [
		{
			distortion: 0.82,
			durationSeconds: 0.34,
			envelope: impactEnvelope,
			gain: 0.72,
			source: { kind: "noise", texture: "crunch" },
		},
	],
	pitchJitterCents: 18,
})

const bubbleGun = defineSynthPatch({
	baseFrequencyHz: 420,
	id: "bubble-gun-bloom",
	layers: [
		{
			durationSeconds: 0.38,
			envelope: pluckEnvelope,
			frequencyEndRatio: 1.8,
			gain: 0.48,
			source: { kind: "oscillator", waveform: "sine" },
		},
	],
	pitchJitterCents: 45,
})

const railGun = defineSynthPatch({
	baseFrequencyHz: 92,
	id: "rail-gun-release",
	layers: [
		{
			distortion: 0.48,
			durationSeconds: 0.52,
			envelope: impactEnvelope,
			frequencyEndRatio: 4.2,
			gain: 0.65,
			source: { kind: "oscillator", waveform: "sawtooth" },
		},
	],
	pitchJitterCents: 12,
})

const musicPad = defineSynthPatch({
	baseFrequencyHz: 110,
	id: "music-heat-haze",
	layers: [
		{
			detuneCents: -8,
			durationSeconds: 2.15,
			envelope: padEnvelope,
			filter: {
				endFrequencyRatio: 5.5,
				frequencyRatio: 2.4,
				kind: "lowpass",
				q: 0.8,
			},
			gain: 0.19,
			source: { kind: "oscillator", waveform: "triangle" },
		},
		{
			detuneCents: 9,
			durationSeconds: 2.15,
			envelope: padEnvelope,
			filter: {
				endFrequencyRatio: 6,
				frequencyRatio: 2.7,
				kind: "lowpass",
			},
			frequencyRatio: 2,
			gain: 0.085,
			source: { kind: "oscillator", waveform: "sine" },
		},
	],
})

const musicBass = defineSynthPatch({
	baseFrequencyHz: 55,
	id: "music-reactor-bass",
	layers: [
		{
			distortion: 0.18,
			durationSeconds: 0.38,
			envelope: pluckEnvelope,
			filter: {
				endFrequencyRatio: 2.2,
				frequencyRatio: 5,
				kind: "lowpass",
				q: 2.2,
			},
			gain: 0.35,
			source: { kind: "oscillator", waveform: "sawtooth" },
		},
	],
})

const musicArpeggio = defineSynthPatch({
	baseFrequencyHz: 220,
	id: "music-arc-arpeggio",
	layers: [
		{
			durationSeconds: 0.2,
			envelope: pluckEnvelope,
			filter: {
				endFrequencyRatio: 4,
				frequencyRatio: 10,
				kind: "lowpass",
				q: 3.4,
			},
			gain: 0.22,
			source: { kind: "oscillator", waveform: "square" },
		},
		{
			durationSeconds: 0.12,
			envelope: impactEnvelope,
			filter: {
				frequencyRatio: 16,
				kind: "highpass",
			},
			gain: 0.055,
			source: { density: 220, kind: "noise", texture: "crackle" },
		},
	],
	pitchJitterCents: 7,
})

const musicKick = defineSynthPatch({
	baseFrequencyHz: 68,
	id: "music-kick",
	layers: [
		{
			durationSeconds: 0.17,
			envelope: impactEnvelope,
			frequencyEndRatio: 0.38,
			frequencyRatio: 1.7,
			gain: 0.48,
			source: { kind: "oscillator", waveform: "sine" },
		},
	],
})

const musicCrunch = defineSynthPatch({
	baseFrequencyHz: 160,
	id: "music-crunch-percussion",
	layers: [
		{
			distortion: 0.58,
			durationSeconds: 0.075,
			envelope: impactEnvelope,
			filter: {
				frequencyRatio: 20,
				kind: "highpass",
			},
			gain: 0.2,
			source: { kind: "noise", texture: "crunch" },
		},
	],
	pitchJitterCents: 110,
})

const musicLowHandDrum = defineSynthPatch({
	baseFrequencyHz: 74,
	id: "music-low-hand-drum",
	layers: [
		{
			durationSeconds: 0.28,
			envelope: {
				attackSeconds: 0.002,
				decaySeconds: 0.09,
				releaseSeconds: 0.12,
				sustain: 0.16,
			},
			frequencyEndRatio: 0.68,
			frequencyRatio: 1.75,
			gain: 0.46,
			pan: -0.22,
			source: { kind: "oscillator", waveform: "sine" },
		},
		{
			durationSeconds: 0.075,
			envelope: impactEnvelope,
			filter: {
				endFrequencyRatio: 4,
				frequencyRatio: 11,
				kind: "lowpass",
				q: 1.2,
			},
			gain: 0.18,
			pan: -0.22,
			source: { kind: "noise", texture: "crunch" },
		},
	],
	pitchJitterCents: 38,
})

const musicHandDrum = defineSynthPatch({
	baseFrequencyHz: 126,
	id: "music-hand-drum-tone",
	layers: [
		{
			distortion: 0.12,
			durationSeconds: 0.19,
			envelope: impactEnvelope,
			filter: {
				endFrequencyRatio: 5,
				frequencyRatio: 8,
				kind: "lowpass",
				q: 1.8,
			},
			frequencyEndRatio: 0.78,
			frequencyRatio: 1.25,
			gain: 0.32,
			pan: 0.24,
			source: { kind: "oscillator", waveform: "triangle" },
		},
		{
			durationSeconds: 0.09,
			envelope: impactEnvelope,
			filter: {
				frequencyRatio: 13,
				kind: "bandpass",
				q: 1.35,
			},
			gain: 0.17,
			pan: 0.24,
			source: { kind: "noise", texture: "crunch" },
		},
	],
	pitchJitterCents: 62,
})

const musicRimClack = defineSynthPatch({
	baseFrequencyHz: 275,
	id: "music-rim-clack",
	layers: [
		{
			distortion: 0.28,
			durationSeconds: 0.055,
			envelope: impactEnvelope,
			frequencyEndRatio: 0.72,
			frequencyRatio: 1.6,
			gain: 0.2,
			pan: -0.44,
			source: { kind: "oscillator", waveform: "square" },
		},
		{
			durationSeconds: 0.065,
			envelope: impactEnvelope,
			filter: {
				frequencyRatio: 12,
				kind: "highpass",
				q: 0.9,
			},
			gain: 0.13,
			pan: -0.44,
			source: { density: 360, kind: "noise", texture: "crackle" },
		},
	],
	pitchJitterCents: 90,
})

const musicShaker = defineSynthPatch({
	baseFrequencyHz: 190,
	id: "music-seed-shaker",
	layers: [
		{
			distortion: 0.16,
			durationSeconds: 0.09,
			envelope: {
				attackSeconds: 0.002,
				decaySeconds: 0.025,
				releaseSeconds: 0.05,
				sustain: 0.12,
			},
			filter: {
				endFrequencyRatio: 24,
				frequencyRatio: 16,
				kind: "highpass",
				q: 0.7,
			},
			gain: 0.13,
			pan: 0.46,
			source: { kind: "noise", texture: "crunch" },
		},
	],
	pitchJitterCents: 140,
})

const effects = {
	damage: defineSynthPatch({
		baseFrequencyHz: 88,
		id: "damage",
		layers: [
			{
				distortion: 0.46,
				durationSeconds: 0.3,
				envelope: impactEnvelope,
				frequencyEndRatio: 0.45,
				gain: 0.52,
				source: { kind: "oscillator", waveform: "sawtooth" },
			},
			{
				durationSeconds: 0.18,
				envelope: impactEnvelope,
				filter: {
					frequencyRatio: 14,
					kind: "bandpass",
					q: 1.1,
				},
				gain: 0.34,
				source: { kind: "noise", texture: "crunch" },
			},
		],
	}),
	"double-jump": defineSynthPatch({
		baseFrequencyHz: 145,
		id: "double-jump",
		layers: [
			{
				durationSeconds: 0.3,
				envelope: pluckEnvelope,
				frequencyEndRatio: 4,
				gain: 0.34,
				source: { kind: "oscillator", waveform: "sawtooth" },
			},
			{
				durationSeconds: 0.18,
				envelope: impactEnvelope,
				filter: {
					frequencyRatio: 18,
					kind: "highpass",
				},
				gain: 0.24,
				source: { kind: "noise", texture: "white" },
			},
		],
	}),
	explosion: defineSynthPatch({
		baseFrequencyHz: 58,
		id: "explosion",
		layers: [
			{
				distortion: 0.5,
				durationSeconds: 0.72,
				envelope: {
					attackSeconds: 0.002,
					decaySeconds: 0.16,
					releaseSeconds: 0.38,
					sustain: 0.4,
				},
				filter: {
					endFrequencyRatio: 2.4,
					frequencyRatio: 11,
					kind: "lowpass",
				},
				gain: 0.75,
				source: { kind: "noise", texture: "white" },
			},
			{
				durationSeconds: 0.42,
				envelope: impactEnvelope,
				frequencyEndRatio: 0.32,
				frequencyRatio: 1.8,
				gain: 0.6,
				source: { kind: "oscillator", waveform: "sine" },
			},
		],
		pitchJitterCents: 45,
	}),
	"fist-contact": defineSynthPatch({
		baseFrequencyHz: 440,
		id: "fist-contact",
		layers: [
			{
				durationSeconds: 0.16,
				envelope: pluckEnvelope,
				frequencyEndRatio: 1.5,
				gain: 0.32,
				source: { kind: "oscillator", waveform: "triangle" },
			},
			{
				durationSeconds: 0.09,
				envelope: impactEnvelope,
				filter: { frequencyRatio: 10, kind: "bandpass", q: 1.4 },
				gain: 0.2,
				source: { kind: "noise", texture: "crackle" },
			},
		],
		pitchJitterCents: 24,
	}),
	"grenade-throw": defineSynthPatch({
		baseFrequencyHz: 135,
		id: "grenade-throw",
		layers: [
			{
				durationSeconds: 0.22,
				envelope: pluckEnvelope,
				filter: {
					endFrequencyRatio: 10,
					frequencyRatio: 4,
					kind: "bandpass",
				},
				gain: 0.3,
				source: { kind: "noise", texture: "white" },
			},
		],
	}),
	"hit-confirm": defineSynthPatch({
		baseFrequencyHz: 620,
		id: "hit-confirm",
		layers: [
			{
				durationSeconds: 0.09,
				envelope: impactEnvelope,
				frequencyEndRatio: 1.6,
				gain: 0.24,
				source: { kind: "oscillator", waveform: "square" },
			},
		],
	}),
	jump: defineSynthPatch({
		baseFrequencyHz: 118,
		id: "jump",
		layers: [
			{
				durationSeconds: 0.24,
				envelope: pluckEnvelope,
				frequencyEndRatio: 2.5,
				gain: 0.3,
				source: { kind: "oscillator", waveform: "triangle" },
			},
			{
				durationSeconds: 0.15,
				envelope: impactEnvelope,
				filter: {
					frequencyRatio: 12,
					kind: "highpass",
				},
				gain: 0.18,
				source: { kind: "noise", texture: "white" },
			},
		],
	}),
	land: defineSynthPatch({
		baseFrequencyHz: 72,
		id: "land",
		layers: [
			{
				durationSeconds: 0.16,
				envelope: impactEnvelope,
				frequencyEndRatio: 0.42,
				gain: 0.5,
				source: { kind: "oscillator", waveform: "sine" },
			},
			{
				distortion: 0.7,
				durationSeconds: 0.12,
				envelope: impactEnvelope,
				filter: {
					frequencyRatio: 15,
					kind: "bandpass",
				},
				gain: 0.34,
				source: { kind: "noise", texture: "crunch" },
			},
		],
		pitchJitterCents: 65,
	}),
	pickup: defineSynthPatch({
		baseFrequencyHz: 330,
		id: "pickup",
		layers: [
			{
				durationSeconds: 0.34,
				envelope: pluckEnvelope,
				frequencyEndRatio: 2,
				gain: 0.28,
				source: { kind: "oscillator", waveform: "sine" },
			},
		],
	}),
	reload: defineSynthPatch({
		baseFrequencyHz: 210,
		id: "reload",
		layers: [
			{
				durationSeconds: 0.11,
				envelope: impactEnvelope,
				gain: 0.3,
				source: { kind: "oscillator", waveform: "square" },
			},
			{
				delaySeconds: 0.12,
				durationSeconds: 0.13,
				envelope: impactEnvelope,
				frequencyRatio: 1.5,
				gain: 0.26,
				source: { kind: "oscillator", waveform: "square" },
			},
		],
	}),
	"run-step": runStep,
	"slide-grit": slideGrit,
	"slide-start": defineSynthPatch({
		baseFrequencyHz: 105,
		id: "slide-start",
		layers: [
			{
				distortion: 0.82,
				durationSeconds: 0.34,
				envelope: {
					attackSeconds: 0.004,
					decaySeconds: 0.07,
					releaseSeconds: 0.14,
					sustain: 0.6,
				},
				filter: {
					endFrequencyRatio: 7,
					frequencyRatio: 22,
					kind: "bandpass",
					q: 1.1,
				},
				gain: 0.48,
				source: { kind: "noise", texture: "crunch" },
			},
		],
	}),
	"target-lock": defineSynthPatch({
		baseFrequencyHz: 760,
		id: "target-lock",
		layers: [
			{
				durationSeconds: 0.1,
				envelope: impactEnvelope,
				gain: 0.23,
				source: { kind: "oscillator", waveform: "square" },
			},
			{
				delaySeconds: 0.13,
				durationSeconds: 0.12,
				envelope: impactEnvelope,
				frequencyRatio: 1.35,
				gain: 0.25,
				source: { kind: "oscillator", waveform: "square" },
			},
		],
	}),
	"weapon-switch": defineSynthPatch({
		baseFrequencyHz: 165,
		id: "weapon-switch",
		layers: [
			{
				durationSeconds: 0.12,
				envelope: impactEnvelope,
				frequencyEndRatio: 0.72,
				gain: 0.24,
				source: { kind: "oscillator", waveform: "triangle" },
			},
		],
	}),
} as const satisfies Record<GameSoundId, SynthPatch>

export const DEFAULT_GAME_AUDIO = defineGameAudio({
	effects,
	mix: {
		effectsGain: 0.82,
		masterGain: 0.74,
		musicGain: 0.42,
	},
	music: {
		beatsPerMinute: 112,
		lookAheadSeconds: 0.14,
		progression: [0, -2, -4, -1],
		rootMidi: 45,
		scale: [0, 2, 3, 5, 7, 9, 10],
		stepsPerBeat: 4,
		tracks: [
			{
				followsProgression: true,
				gain: 0.72,
				gateBeats: 4,
				id: "heat-haze",
				minimumIntensity: 0,
				octave: 0,
				patch: musicPad,
				pattern: [
					0,
					null,
					null,
					null,
					null,
					null,
					null,
					null,
					null,
					null,
					null,
					null,
					null,
					null,
					null,
					null,
				],
			},
			{
				followsProgression: true,
				gain: 0.72,
				gateBeats: 0.7,
				id: "reactor-bass",
				minimumIntensity: 0.1,
				octave: -1,
				patch: musicBass,
				pattern: [
					0,
					null,
					null,
					0,
					null,
					null,
					4,
					null,
					0,
					null,
					null,
					2,
					null,
					4,
					null,
					null,
				],
			},
			{
				gain: 0.62,
				gateBeats: 0.35,
				id: "kick",
				minimumIntensity: 0.2,
				octave: -2,
				patch: musicKick,
				pattern: [
					0,
					null,
					null,
					null,
					0,
					null,
					null,
					null,
					0,
					null,
					null,
					0,
					null,
					null,
					0,
					null,
				],
			},
			{
				chance: 0.96,
				gain: 0.72,
				gateBeats: 0.55,
				id: "low-hand-drum-circle",
				minimumEngagement: 0.06,
				minimumIntensity: 0.22,
				octave: -1,
				patch: musicLowHandDrum,
				pattern: [
					0,
					null,
					null,
					0,
					null,
					null,
					2,
					null,
					0,
					null,
					null,
					0,
					null,
					2,
					null,
					null,
				],
			},
			{
				chance: 0.91,
				gain: 0.64,
				gateBeats: 0.38,
				id: "answering-hand-drum-circle",
				minimumEngagement: 0.22,
				minimumIntensity: 0.3,
				octave: 0,
				patch: musicHandDrum,
				pattern: [null, 0, null, 2, null, null, 0, null, 3, null, 0, 2],
			},
			{
				chance: 0.82,
				gain: 0.58,
				gateBeats: 0.18,
				id: "rim-circle",
				minimumEngagement: 0.42,
				minimumIntensity: 0.38,
				octave: 1,
				patch: musicRimClack,
				pattern: [null, 0, null, null, 2, null, 0, null, null, 3],
			},
			{
				chance: 0.78,
				gain: 0.54,
				gateBeats: 0.22,
				id: "seed-shaker-circle",
				minimumEngagement: 0.58,
				minimumIntensity: 0.46,
				octave: 1,
				patch: musicShaker,
				pattern: [
					0,
					null,
					2,
					null,
					0,
					null,
					3,
					null,
					0,
					null,
					2,
					null,
					0,
					3,
					2,
					null,
				],
			},
			{
				chance: 0.86,
				gain: 0.5,
				gateBeats: 0.2,
				id: "crunch-grid",
				minimumIntensity: 0.36,
				octave: 1,
				patch: musicCrunch,
				pattern: [
					0,
					null,
					2,
					null,
					0,
					null,
					3,
					null,
					0,
					null,
					2,
					null,
					0,
					3,
					2,
					null,
				],
			},
			{
				chance: 0.9,
				followsProgression: true,
				gain: 0.56,
				gateBeats: 0.42,
				id: "arc-arpeggio",
				minimumIntensity: 0.55,
				octave: 1,
				patch: musicArpeggio,
				pattern: [0, 2, null, 4, 1, null, 5, 3, 0, null, 4, 2, 6, 4, 2, 1],
			},
		],
	},
	weapons: {
		"arc-blaster": arcBlaster,
		"bubble-gun": bubbleGun,
		"heavy-laser": railGun,
		"ion-beam-rifle": arcBlaster,
		"mini-missile": miniMissile,
		"rail-gun": railGun,
		shotgun,
	},
} as const satisfies GameAudioDefinition)
