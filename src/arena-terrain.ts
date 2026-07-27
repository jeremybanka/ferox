function seededValue(seed: number, x: number, z: number): number {
	const value = Math.sin(x * 127.1 + z * 311.7 + seed * 0.000_013) * 43_758.5453
	return value - Math.floor(value)
}

function smoothNoise(seed: number, x: number, z: number): number {
	const x0 = Math.floor(x)
	const z0 = Math.floor(z)
	const tx = x - x0
	const tz = z - z0
	const sx = tx * tx * (3 - 2 * tx)
	const sz = tz * tz * (3 - 2 * tz)
	const a = seededValue(seed, x0, z0)
	const b = seededValue(seed, x0 + 1, z0)
	const c = seededValue(seed, x0, z0 + 1)
	const d = seededValue(seed, x0 + 1, z0 + 1)
	return (a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz
}

export function arenaHeightAt(seed: number, x: number, z: number): number {
	const radial = Math.sqrt(x * x + z * z)
	const rim = Math.max(0, (radial - 42) / 11)
	let height = -1.4
	let amplitude = 7.2
	let frequency = 0.026
	for (let octave = 0; octave < 4; octave += 1) {
		height +=
			(smoothNoise(seed + octave * 19, x * frequency, z * frequency) - 0.5) *
			amplitude
		amplitude *= 0.5
		frequency *= 2.08
	}
	height += Math.sin(x * 0.08) * Math.cos(z * 0.065) * 1.7
	return height + rim * rim * 8
}

export function arenaSeededValue(seed: number, x: number, z: number): number {
	return seededValue(seed, x, z)
}
