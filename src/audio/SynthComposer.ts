export type NoiseTexture = "crackle" | "crunch" | "white"

export type SynthEnvelope = {
	attackSeconds: number
	decaySeconds: number
	releaseSeconds: number
	sustain: number
}

export type SynthFilter = {
	endFrequencyRatio?: number
	frequencyRatio: number
	kind: BiquadFilterType
	q?: number
}

export type SynthSource =
	| {
			kind: "noise"
			density?: number
			texture: NoiseTexture
	  }
	| {
			kind: "oscillator"
			waveform: OscillatorType
	  }

export type SynthLayer = {
	delaySeconds?: number
	detuneCents?: number
	distortion?: number
	durationSeconds: number
	envelope: SynthEnvelope
	filter?: SynthFilter
	frequencyEndRatio?: number
	frequencyRatio?: number
	gain: number
	pan?: number
	source: SynthSource
}

export type SynthPatch = {
	baseFrequencyHz: number
	id: string
	layers: readonly SynthLayer[]
	pitchJitterCents?: number
}

export type SynthPlayOptions = {
	baseFrequencyHz?: number
	destination?: AudioNode
	durationScale?: number
	gain?: number
	pan?: number
	when?: number
}

function finitePositive(value: number, label: string): void {
	if (!Number.isFinite(value) || value <= 0) {
		throw new Error(`${label} must be a finite positive number.`)
	}
}

/** Validates authored sound data while preserving its concrete literal type. */
export function defineSynthPatch<const Patch extends SynthPatch>(
	patch: Patch,
): Patch {
	if (patch.id.length === 0) throw new Error("Synth patches require an id.")
	finitePositive(patch.baseFrequencyHz, `${patch.id} base frequency`)
	if (patch.layers.length === 0) {
		throw new Error(`${patch.id} requires at least one synth layer.`)
	}
	for (const [index, layer] of patch.layers.entries()) {
		const label = `${patch.id} layer ${index}`
		finitePositive(layer.durationSeconds, `${label} duration`)
		if (!Number.isFinite(layer.gain) || layer.gain < 0) {
			throw new Error(`${label} gain must be finite and non-negative.`)
		}
		if (
			layer.envelope.attackSeconds < 0 ||
			layer.envelope.decaySeconds < 0 ||
			layer.envelope.releaseSeconds < 0 ||
			layer.envelope.sustain < 0 ||
			layer.envelope.sustain > 1
		) {
			throw new Error(`${label} has an invalid envelope.`)
		}
		if (layer.frequencyRatio !== undefined) {
			finitePositive(layer.frequencyRatio, `${label} frequency ratio`)
		}
	}
	return patch
}

export function midiToFrequency(midi: number): number {
	return 440 * 2 ** ((midi - 69) / 12)
}

function distortionCurve(amount: number): Float32Array<ArrayBuffer> {
	const samples = 256
	const curve = new Float32Array(samples)
	const drive = Math.max(0, amount) * 42
	for (let index = 0; index < samples; index += 1) {
		const x = (index * 2) / (samples - 1) - 1
		curve[index] = ((Math.PI + drive) * x) / (Math.PI + drive * Math.abs(x))
	}
	return curve
}

function scheduleEnvelope(
	parameter: AudioParam,
	start: number,
	duration: number,
	peak: number,
	envelope: SynthEnvelope,
): void {
	const end = start + duration
	const attackEnd = Math.min(end, start + envelope.attackSeconds)
	const decayEnd = Math.min(end, attackEnd + envelope.decaySeconds)
	const releaseStart = Math.max(decayEnd, end - envelope.releaseSeconds)
	const floor = 0.000_01
	const sustain = Math.max(floor, peak * envelope.sustain)
	parameter.setValueAtTime(floor, start)
	parameter.linearRampToValueAtTime(Math.max(floor, peak), attackEnd)
	parameter.exponentialRampToValueAtTime(sustain, decayEnd)
	parameter.setValueAtTime(sustain, releaseStart)
	parameter.exponentialRampToValueAtTime(floor, end)
}

export class SynthComposer {
	readonly #context: AudioContext
	readonly #destination: AudioNode
	#randomState: number

	constructor(context: AudioContext, destination: AudioNode, seed: number) {
		this.#context = context
		this.#destination = destination
		this.#randomState = seed | 0 || 0x51f_15e
	}

	play(patch: SynthPatch, options: SynthPlayOptions = {}): void {
		const destination = options.destination ?? this.#destination
		const patchGain = Math.max(0, options.gain ?? 1)
		const durationScale = Math.max(0.05, options.durationScale ?? 1)
		const baseFrequency = options.baseFrequencyHz ?? patch.baseFrequencyHz
		const jitter = patch.pitchJitterCents ?? 0
		const pitchScale = 2 ** (((this.#random() * 2 - 1) * jitter) / 1_200)
		const start = Math.max(
			this.#context.currentTime,
			options.when ?? this.#context.currentTime,
		)
		for (const layer of patch.layers) {
			this.#playLayer(
				layer,
				baseFrequency * pitchScale,
				start,
				durationScale,
				patchGain,
				Math.max(-1, Math.min(1, (options.pan ?? 0) + (layer.pan ?? 0))),
				destination,
			)
		}
	}

	#playLayer(
		layer: SynthLayer,
		baseFrequency: number,
		patchStart: number,
		durationScale: number,
		patchGain: number,
		pan: number,
		destination: AudioNode,
	): void {
		const start = patchStart + (layer.delaySeconds ?? 0) * durationScale
		const duration = layer.durationSeconds * durationScale
		const end = start + duration
		const layerGain = this.#context.createGain()
		const stereo = this.#context.createStereoPanner()
		stereo.pan.setValueAtTime(pan, start)
		scheduleEnvelope(
			layerGain.gain,
			start,
			duration,
			layer.gain * patchGain,
			layer.envelope,
		)
		layerGain.connect(stereo)
		stereo.connect(destination)

		let input: AudioNode = layerGain
		if (layer.distortion !== undefined && layer.distortion > 0) {
			const shaper = this.#context.createWaveShaper()
			shaper.curve = distortionCurve(layer.distortion)
			shaper.oversample = "2x"
			shaper.connect(input)
			input = shaper
		}
		if (layer.filter !== undefined) {
			const filter = this.#context.createBiquadFilter()
			filter.type = layer.filter.kind
			filter.Q.setValueAtTime(layer.filter.q ?? 0.7, start)
			const from = Math.max(20, baseFrequency * layer.filter.frequencyRatio)
			const to = Math.max(
				20,
				baseFrequency *
					(layer.filter.endFrequencyRatio ?? layer.filter.frequencyRatio),
			)
			filter.frequency.setValueAtTime(from, start)
			filter.frequency.exponentialRampToValueAtTime(to, end)
			filter.connect(input)
			input = filter
		}

		if (layer.source.kind === "oscillator") {
			const oscillator = this.#context.createOscillator()
			const from =
				baseFrequency *
				(layer.frequencyRatio ?? 1) *
				2 ** ((layer.detuneCents ?? 0) / 1_200)
			const to =
				baseFrequency *
				(layer.frequencyEndRatio ?? layer.frequencyRatio ?? 1) *
				2 ** ((layer.detuneCents ?? 0) / 1_200)
			oscillator.type = layer.source.waveform
			oscillator.frequency.setValueAtTime(Math.max(20, from), start)
			oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), end)
			oscillator.connect(input)
			oscillator.start(start)
			oscillator.stop(end + 0.01)
			return
		}

		const noise = this.#context.createBufferSource()
		noise.buffer = this.#noiseBuffer(
			layer.source.texture,
			duration,
			layer.source.density,
		)
		noise.connect(input)
		noise.start(start)
		noise.stop(end + 0.01)
	}

	#noiseBuffer(
		texture: NoiseTexture,
		duration: number,
		density = 180,
	): AudioBuffer {
		const length = Math.max(2, Math.ceil(this.#context.sampleRate * duration))
		const buffer = this.#context.createBuffer(
			1,
			length,
			this.#context.sampleRate,
		)
		const data = buffer.getChannelData(0)
		if (texture === "white") {
			for (let index = 0; index < length; index += 1) {
				data[index] = this.#random() * 2 - 1
			}
			return buffer
		}
		if (texture === "crunch") {
			let held = 0
			const holdSamples = Math.max(
				2,
				Math.round(this.#context.sampleRate / 5_600),
			)
			for (let index = 0; index < length; index += 1) {
				if (index % holdSamples === 0) {
					const raw = this.#random() * 2 - 1
					held = Math.round(raw * 7) / 7
				}
				data[index] = held
			}
			return buffer
		}

		let impulse = 0
		const impulseChance = density / this.#context.sampleRate
		for (let index = 0; index < length; index += 1) {
			if (this.#random() < impulseChance) {
				impulse = (this.#random() * 2 - 1) * (0.55 + this.#random() * 0.45)
			}
			impulse *= 0.82
			data[index] = impulse + (this.#random() * 2 - 1) * 0.018
		}
		return buffer
	}

	#random(): number {
		let value = this.#randomState
		value ^= value << 13
		value ^= value >>> 17
		value ^= value << 5
		this.#randomState = value | 0
		return (value >>> 0) / 4_294_967_296
	}
}
