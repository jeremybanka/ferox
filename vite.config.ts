import preact from "@preact/preset-vite"
import { defineConfig } from "vite-plus"

export default defineConfig({
	plugins: [preact()],
	server: {
		proxy: {
			"/socket.io": {
				target: "http://localhost:4317",
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
