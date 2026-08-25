import type { GunId } from "../guns/GunDefinitions.ts"
import { PLAYER_STANDING_SPEED_LIMIT } from "../game-constants.ts"
import {
	DEFAULT_GAME_AUDIO,
	type GameAudioDefinition,
	type GameSoundId,
	type MusicTrackDefinition,
} from "./GameAudioDefinitions.ts"
import {
	midiToFrequency,
	SynthComposer,
	type SynthPatch,
} from "./SynthComposer.ts"

export type GameAudioFrame = {
	combatHeat: number
	connected: boolean
	delta: number
	engagement: number
	grounded: boolean
	health: number
	horizontalSpeed: number
	jumpImpulse: 1 | 2 | null
	landingImpact: number
	sliding: boolean
	threats: number
}

export type GameSoundOptions = {
	gain?: number
	pan?: number
}

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value))
}

export function deriveMusicIntensity(
	frame: Pick<
		GameAudioFrame,
		| "combatHeat"
		| "connected"
		| "engagement"
		| "health"
		| "horizontalSpeed"
		| "threats"
	>,
): number {
	if (!frame.connected) return 0
	const motion = clamp01(frame.horizontalSpeed / PLAYER_STANDING_SPEED_LIMIT)
	const combat = clamp01(frame.combatHeat)
	const engagement = clamp01(frame.engagement)
	const danger = clamp01(frame.threats / 2)
	const damage = clamp01((58 - frame.health) / 58)
	return clamp01(
		0.12 +
			motion * 0.22 +
			combat * 0.3 +
			engagement * 0.34 +
			danger * 0.34 +
			damage * 0.16,
	)
}

export function stepEngagementMomentum(
	current: number,
	target: number,
	delta: number,
): number {
	const rate = target > current ? 4.8 : 0.62
	const response = 1 - Math.exp(-Math.max(0, delta) * rate)
	return clamp01(current + (clamp01(target) - current) * response)
}

export function scaleDegreeFrequency(
	rootMidi: number,
	scale: readonly number[],
	degree: number,
	octave = 0,
): number {
	if (scale.length === 0) throw new Error("Music scales cannot be empty.")
	const scaleLength = scale.length
	const scaleOctave = Math.floor(degree / scaleLength)
	const scaleIndex = ((degree % scaleLength) + scaleLength) % scaleLength
	const semitones = scale[scaleIndex]
	if (semitones === undefined) throw new Error("Invalid scale degree.")
	return midiToFrequency(rootMidi + semitones + (scaleOctave + octave) * 12)
}

function authoredRandom(seed: number, step: number, track: number): number {
	let value =
		(seed ^
			Math.imul(step + 1, 0x9e37_79b1) ^
			Math.imul(track + 7, 0x85eb_ca6b)) |
		0
	value ^= value >>> 16
	value = Math.imul(value, 0x7feb_352d)
	value ^= value >>> 15
	value = Math.imul(value, 0x846c_a68b)
	value ^= value >>> 16
	return (value >>> 0) / 4_294_967_296
}

function patchDuration(patch: SynthPatch): number {
	return Math.max(
		...patch.layers.map(
			(layer) => layer.durationSeconds + (layer.delaySeconds ?? 0),
		),
	)
}

export class GameAudio {
	readonly #definition: GameAudioDefinition
	readonly #seed: number
	#composer: SynthComposer | null = null
	#context: AudioContext | null = null
	#disposed = false
	#effectsBus: GainNode | null = null
	#engagementMomentum = 0
	#footstepDistance = 0
	#footstepSide: -1 | 1 = -1
	#musicBus: GainNode | null = null
	#musicIntensity = 0
	#musicStep = 0
	#nextMusicStepAt = 0
	#previousSliding = false
	#slideGritRemaining = 0

	constructor(
		seed: number,
		definition: GameAudioDefinition = DEFAULT_GAME_AUDIO,
	) {
		this.#definition = definition
		this.#seed = seed | 0
	}

	async start(): Promise<void> {
		if (this.#disposed) return
		if (this.#context === null) this.#createGraph()
		if (this.#context?.state === "suspended") {
			await this.#context.resume().catch(() => undefined)
		}
	}

	dispose(): void {
		if (this.#disposed) return
		this.#disposed = true
		const context = this.#context
		this.#composer = null
		this.#context = null
		this.#effectsBus = null
		this.#musicBus = null
		if (context !== null && context.state !== "closed") void context.close()
	}

	playEffect(id: GameSoundId, options: GameSoundOptions = {}): void {
		if (this.#composer === null || this.#effectsBus === null) return
		this.#composer.play(this.#definition.effects[id], {
			destination: this.#effectsBus,
			...(options.gain === undefined ? {} : { gain: options.gain }),
			...(options.pan === undefined ? {} : { pan: options.pan }),
		})
	}

	playWeapon(id: GunId, options: GameSoundOptions = {}): void {
		if (this.#composer === null || this.#effectsBus === null) return
		this.#composer.play(this.#definition.weapons[id], {
			destination: this.#effectsBus,
			...(options.gain === undefined ? {} : { gain: options.gain }),
			...(options.pan === undefined ? {} : { pan: options.pan }),
		})
	}

	update(frame: GameAudioFrame): void {
		if (
			this.#disposed ||
			this.#context === null ||
			this.#composer === null ||
			this.#musicBus === null
		)
			return
		this.#updateLocomotion(frame)
		this.#engagementMomentum = stepEngagementMomentum(
			this.#engagementMomentum,
			frame.engagement,
			frame.delta,
		)
		const targetIntensity = deriveMusicIntensity({
			...frame,
			engagement: this.#engagementMomentum,
		})
		const response = 1 - Math.exp(-frame.delta * 2.4)
		this.#musicIntensity += (targetIntensity - this.#musicIntensity) * response
		this.#scheduleMusic()
	}

	#createGraph(): void {
		if (typeof AudioContext === "undefined") return
		const context = new AudioContext({ latencyHint: "interactive" })
		const effectsBus = context.createGain()
		const musicBus = context.createGain()
		const master = context.createGain()
		const compressor = context.createDynamicsCompressor()
		effectsBus.gain.value = this.#definition.mix.effectsGain
		musicBus.gain.value = this.#definition.mix.musicGain
		master.gain.value = this.#definition.mix.masterGain
		compressor.threshold.value = -12
		compressor.knee.value = 14
		compressor.ratio.value = 5
		compressor.attack.value = 0.004
		compressor.release.value = 0.18
		effectsBus.connect(master)
		musicBus.connect(master)
		master.connect(compressor)
		compressor.connect(context.destination)
		this.#context = context
		this.#effectsBus = effectsBus
		this.#musicBus = musicBus
		this.#composer = new SynthComposer(context, master, this.#seed)
		this.#nextMusicStepAt = context.currentTime + 0.055
	}

	#updateLocomotion(frame: GameAudioFrame): void {
		if (frame.jumpImpulse !== null) {
			this.playEffect(frame.jumpImpulse === 1 ? "jump" : "double-jump")
		}
		if (frame.landingImpact > 1.5) {
			this.playEffect("land", {
				gain: 0.45 + clamp01(frame.landingImpact / 12) * 0.55,
			})
		}
		if (frame.sliding && !this.#previousSliding) {
			this.playEffect("slide-start", {
				gain:
					0.6 +
					clamp01(frame.horizontalSpeed / PLAYER_STANDING_SPEED_LIMIT) * 0.4,
			})
			this.#slideGritRemaining = 0.08
		}
		this.#previousSliding = frame.sliding

		if (frame.sliding) {
			this.#slideGritRemaining -= frame.delta
			if (this.#slideGritRemaining <= 0) {
				this.playEffect("slide-grit", {
					gain:
						0.35 +
						clamp01(frame.horizontalSpeed / PLAYER_STANDING_SPEED_LIMIT) * 0.38,
					pan: this.#footstepSide * 0.08,
				})
				this.#footstepSide *= -1
				this.#slideGritRemaining = 0.13
			}
			this.#footstepDistance = 0
			return
		}

		if (
			!frame.grounded ||
			frame.horizontalSpeed < 1.7 ||
			frame.jumpImpulse !== null
		) {
			this.#footstepDistance = 0
			return
		}
		this.#footstepDistance += frame.horizontalSpeed * frame.delta
		const speedFraction = clamp01(
			frame.horizontalSpeed / PLAYER_STANDING_SPEED_LIMIT,
		)
		const stride = 1.7 + (2.25 - 1.7) * speedFraction
		if (this.#footstepDistance < stride) return
		this.#footstepDistance %= stride
		this.playEffect("run-step", {
			gain: 0.42 + speedFraction * 0.48,
			pan: this.#footstepSide * 0.14,
		})
		this.#footstepSide *= -1
	}

	#scheduleMusic(): void {
		const context = this.#context
		const composer = this.#composer
		const musicBus = this.#musicBus
		if (context === null || composer === null || musicBus === null) return
		const music = this.#definition.music
		const tempo = music.beatsPerMinute * (1 + this.#engagementMomentum * 0.14)
		const secondsPerBeat = 60 / tempo
		const secondsPerStep = secondsPerBeat / music.stepsPerBeat
		const stepsPerBar = music.stepsPerBeat * 4
		if (this.#nextMusicStepAt < context.currentTime - secondsPerStep) {
			this.#nextMusicStepAt = context.currentTime + 0.035
		}
		while (
			this.#nextMusicStepAt <
			context.currentTime + music.lookAheadSeconds
		) {
			const bar = Math.floor(this.#musicStep / stepsPerBar)
			const progressionDegree =
				music.progression[bar % music.progression.length] ?? 0
			for (const [trackIndex, track] of music.tracks.entries()) {
				this.#scheduleMusicTrack(
					track,
					trackIndex,
					progressionDegree,
					secondsPerBeat,
				)
			}
			this.#musicStep += 1
			this.#nextMusicStepAt += secondsPerStep
		}
	}

	#scheduleMusicTrack(
		track: MusicTrackDefinition,
		trackIndex: number,
		progressionDegree: number,
		secondsPerBeat: number,
	): void {
		const composer = this.#composer
		const musicBus = this.#musicBus
		if (composer === null || musicBus === null) return
		const degree = track.pattern[this.#musicStep % track.pattern.length]
		if (degree === null || degree === undefined) return
		const chance = track.chance ?? 1
		if (authoredRandom(this.#seed, this.#musicStep, trackIndex) > chance) return
		const intensityActivation = clamp01(
			(this.#musicIntensity - track.minimumIntensity) / 0.22,
		)
		const engagementActivation =
			track.minimumEngagement === undefined
				? 1
				: clamp01((this.#engagementMomentum - track.minimumEngagement) / 0.2)
		const activation = intensityActivation * engagementActivation
		if (activation <= 0.001) return
		const score = this.#definition.music
		const absoluteDegree =
			degree + (track.followsProgression === true ? progressionDegree : 0)
		const frequency = scaleDegreeFrequency(
			score.rootMidi,
			score.scale,
			absoluteDegree,
			track.octave,
		)
		const gateSeconds = track.gateBeats * secondsPerBeat
		composer.play(track.patch, {
			baseFrequencyHz: frequency,
			destination: musicBus,
			durationScale: gateSeconds / patchDuration(track.patch),
			gain: track.gain * activation,
			when: this.#nextMusicStepAt,
		})
	}
}
