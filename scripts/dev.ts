import { spawn } from "node:child_process"

const children = [
	spawn("node", ["server/arena-server.ts"], { stdio: "inherit" }),
	spawn("pnpm", ["vite"], { stdio: "inherit" }),
	spawn("pnpm", ["visor:watch"], { stdio: "inherit" }),
]

function stop(): void {
	for (const child of children) child.kill("SIGTERM")
}

process.on("SIGINT", stop)
process.on("SIGTERM", stop)
