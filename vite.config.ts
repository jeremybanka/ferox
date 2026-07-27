import preact from "@preact/preset-vite"
import { defineConfig } from "vite-plus"

export default defineConfig({
	plugins: [preact()],
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
