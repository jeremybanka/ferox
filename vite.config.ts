import preact from "@preact/preset-vite"
import { readFileSync, watch } from "node:fs"
import { defineConfig } from "vite-plus"

export default defineConfig({
	plugins: [
		preact(),
		{
			name: "visor-atlas-reload",
			apply: "serve",
			configureServer(server) {
				const atlasUrl = new URL("./public/visor-faces.png", import.meta.url)
				let atlasContents = readFileSync(atlasUrl)
				let reloadTimer: ReturnType<typeof setTimeout> | undefined
				const atlasWatcher = watch(atlasUrl, () => {
					clearTimeout(reloadTimer)
					reloadTimer = setTimeout(() => {
						const nextContents = readFileSync(atlasUrl)
						if (nextContents.equals(atlasContents)) return
						atlasContents = nextContents
						server.ws.send({ type: "full-reload" })
					}, 30)
				})
				server.httpServer?.once("close", () => {
					clearTimeout(reloadTimer)
					atlasWatcher.close()
				})
			},
		},
	],
	server: {
		host: "0.0.0.0",
		proxy: {
			"/socket.io": {
				target: "http://127.0.0.1:4317",
				ws: true,
			},
		},
	},
	lint: {
		ignorePatterns: ["**/dist/**", "**/node_modules/**"],
	},
	staged: {
		"*": ["dprint fmt", "vp check --no-fmt --fix"],
	},
})
