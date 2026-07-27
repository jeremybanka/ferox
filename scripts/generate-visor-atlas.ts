import { deflateSync } from "node:zlib"
import { writeFileSync } from "node:fs"

const CELL_SIZE = 32
const COLUMNS = 8
const ROWS = 4
const width = CELL_SIZE * COLUMNS
const height = CELL_SIZE * ROWS
const pixels = new Uint8Array(width * height)

type Draw = {
	line: (x0: number, y0: number, x1: number, y1: number) => void
	pixel: (x: number, y: number) => void
	rect: (x: number, y: number, width: number, height: number) => void
}

function drawFrame(index: number, paint: (draw: Draw) => void): void {
	const cellX = (index % COLUMNS) * CELL_SIZE
	const cellY = Math.floor(index / COLUMNS) * CELL_SIZE
	const pixel = (x: number, y: number): void => {
		if (x < 0 || x >= CELL_SIZE || y < 0 || y >= CELL_SIZE) return
		pixels[(cellY + y) * width + cellX + x] = 255
	}
	const rect = (
		x: number,
		y: number,
		rectWidth: number,
		rectHeight: number,
	) => {
		for (let dy = 0; dy < rectHeight; dy += 1) {
			for (let dx = 0; dx < rectWidth; dx += 1) pixel(x + dx, y + dy)
		}
	}
	const line = (x0: number, y0: number, x1: number, y1: number): void => {
		const dx = Math.abs(x1 - x0)
		const sx = x0 < x1 ? 1 : -1
		const dy = -Math.abs(y1 - y0)
		const sy = y0 < y1 ? 1 : -1
		let error = dx + dy
		while (true) {
			pixel(x0, y0)
			if (x0 === x1 && y0 === y1) break
			const doubled = error * 2
			if (doubled >= dy) {
				error += dy
				x0 += sx
			}
			if (doubled <= dx) {
				error += dx
				y0 += sy
			}
		}
	}
	paint({ line, pixel, rect })
}

function eyes(
	draw: Draw,
	left: readonly [number, number, number, number],
	right: readonly [number, number, number, number],
): void {
	draw.rect(...left)
	draw.rect(...right)
}

// Eye pixels in every frame stay inside x=4..27 and y=10..21.
drawFrame(0, (draw) => eyes(draw, [7, 13, 6, 4], [19, 13, 6, 4]))
drawFrame(1, (draw) => eyes(draw, [7, 14, 6, 3], [19, 14, 6, 3]))
drawFrame(2, (draw) => eyes(draw, [7, 15, 6, 1], [19, 15, 6, 1]))
drawFrame(3, (draw) => eyes(draw, [7, 14, 6, 2], [19, 14, 6, 2]))
drawFrame(4, ({ rect }) => {
	rect(8, 14, 5, 3)
	rect(19, 14, 5, 3)
	rect(10, 13, 3, 1)
	rect(19, 13, 3, 1)
})
drawFrame(5, ({ rect }) => {
	rect(9, 14, 4, 3)
	rect(19, 14, 4, 3)
	rect(11, 13, 2, 1)
	rect(19, 13, 2, 1)
})
drawFrame(6, ({ line, rect }) => {
	line(6, 12, 12, 15)
	line(7, 13, 12, 16)
	line(25, 12, 19, 15)
	line(24, 13, 19, 16)
	rect(9, 15, 4, 3)
	rect(19, 15, 4, 3)
})
drawFrame(7, ({ line, rect }) => {
	line(6, 11, 12, 15)
	line(25, 11, 19, 15)
	rect(9, 15, 4, 3)
	rect(19, 15, 4, 3)
})
drawFrame(8, ({ line, rect }) => {
	line(7, 16, 11, 12)
	line(11, 12, 14, 16)
	line(18, 16, 21, 12)
	line(21, 12, 25, 16)
	rect(14, 19, 4, 1)
})
drawFrame(9, ({ line, rect }) => {
	line(7, 17, 11, 13)
	line(11, 13, 14, 17)
	line(18, 17, 21, 13)
	line(21, 13, 25, 17)
	rect(13, 19, 6, 1)
})
drawFrame(10, ({ rect }) => {
	rect(7, 11, 6, 8)
	rect(19, 11, 6, 8)
	rect(9, 13, 2, 4)
	rect(21, 13, 2, 4)
	rect(14, 24, 4, 4)
})
drawFrame(11, ({ rect }) => {
	rect(6, 10, 8, 10)
	rect(18, 10, 8, 10)
	rect(9, 13, 2, 4)
	rect(21, 13, 2, 4)
	rect(13, 24, 6, 5)
})
drawFrame(12, ({ line }) => {
	line(7, 12, 13, 18)
	line(13, 12, 7, 18)
	line(19, 12, 25, 18)
	line(25, 12, 19, 18)
	line(11, 26, 21, 26)
})
drawFrame(13, ({ line }) => {
	line(7, 11, 13, 17)
	line(13, 11, 7, 17)
	line(19, 11, 25, 17)
	line(25, 11, 19, 17)
	line(10, 25, 22, 25)
})
drawFrame(14, ({ rect }) => {
	rect(5, 14, 3, 3)
	rect(20, 13, 7, 4)
})
drawFrame(15, ({ rect }) => {
	rect(5, 13, 7, 4)
	rect(24, 14, 3, 3)
})
drawFrame(16, ({ rect }) => {
	rect(6, 13, 5, 5)
	rect(21, 13, 5, 5)
	rect(12, 25, 8, 1)
})
drawFrame(17, ({ rect }) => {
	rect(8, 13, 3, 5)
	rect(21, 13, 3, 5)
	rect(12, 24, 8, 3)
})
drawFrame(18, ({ rect }) => {
	rect(9, 13, 2, 5)
	rect(21, 13, 2, 5)
	rect(13, 23, 6, 6)
})
drawFrame(19, ({ rect }) => {
	rect(10, 14, 1, 3)
	rect(21, 14, 1, 3)
	rect(15, 24, 2, 3)
})
drawFrame(20, ({ rect }) => {
	rect(4, 10, 2, 12)
	rect(26, 10, 2, 12)
	rect(9, 13, 4, 5)
	rect(19, 13, 4, 5)
})
drawFrame(21, ({ rect }) => {
	rect(5, 11, 2, 10)
	rect(25, 11, 2, 10)
	rect(10, 13, 3, 5)
	rect(19, 13, 3, 5)
})
drawFrame(22, ({ rect }) => {
	rect(7, 12, 2, 8)
	rect(23, 12, 2, 8)
	rect(11, 14, 2, 3)
	rect(19, 14, 2, 3)
})
drawFrame(23, ({ rect }) => {
	rect(11, 14, 2, 3)
	rect(19, 14, 2, 3)
})
drawFrame(24, ({ rect }) => {
	rect(7, 13, 6, 4)
	rect(19, 13, 6, 4)
	rect(4, 15, 2, 1)
	rect(26, 15, 2, 1)
})
drawFrame(25, ({ rect }) => {
	rect(8, 13, 5, 4)
	rect(19, 13, 5, 4)
	rect(5, 15, 2, 1)
	rect(25, 15, 2, 1)
})
drawFrame(26, ({ rect }) => {
	rect(9, 14, 4, 3)
	rect(19, 14, 4, 3)
	rect(7, 15, 1, 1)
	rect(24, 15, 1, 1)
})
drawFrame(27, ({ rect }) => {
	rect(10, 14, 3, 3)
	rect(19, 14, 3, 3)
})
drawFrame(28, ({ rect }) => {
	rect(6, 15, 4, 2)
	rect(14, 15, 4, 2)
	rect(22, 15, 4, 2)
})
drawFrame(29, ({ rect }) => {
	rect(5, 13, 3, 2)
	rect(11, 16, 3, 2)
	rect(17, 12, 3, 2)
	rect(23, 15, 3, 2)
})
drawFrame(30, ({ rect }) => {
	rect(7, 12, 2, 2)
	rect(11, 16, 2, 2)
	rect(15, 13, 2, 2)
	rect(19, 17, 2, 2)
	rect(23, 11, 2, 2)
})
drawFrame(31, (draw) => eyes(draw, [7, 13, 6, 4], [19, 13, 6, 4]))

function crc32(buffer: Uint8Array): number {
	let crc = 0xffffffff
	for (const byte of buffer) {
		crc ^= byte
		for (let bit = 0; bit < 8; bit += 1) {
			crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
		}
	}
	return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Buffer {
	const typeBytes = Buffer.from(type, "ascii")
	const payload = Buffer.concat([typeBytes, data])
	const output = Buffer.alloc(data.length + 12)
	output.writeUInt32BE(data.length, 0)
	payload.copy(output, 4)
	output.writeUInt32BE(crc32(payload), data.length + 8)
	return output
}

const scanlines = Buffer.alloc((width + 1) * height)
for (let y = 0; y < height; y += 1) {
	const offset = y * (width + 1)
	scanlines[offset] = 0
	scanlines.set(pixels.subarray(y * width, (y + 1) * width), offset + 1)
}
const header = Buffer.alloc(13)
header.writeUInt32BE(width, 0)
header.writeUInt32BE(height, 4)
header[8] = 8
header[9] = 0
const png = Buffer.concat([
	Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
	chunk("IHDR", header),
	chunk("IDAT", deflateSync(scanlines, { level: 9 })),
	chunk("IEND", new Uint8Array()),
])
writeFileSync(new URL("../public/visor-faces.png", import.meta.url), png)
