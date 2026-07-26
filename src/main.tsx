import "./globals.css"

import { RealtimeProvider } from "atom.io/realtime-react"
import { render } from "preact"
import { io } from "socket.io-client"

import { AppShell } from "./AppShell.tsx"

const appRoot = document.getElementById("app")

if (appRoot === null) {
	throw new Error("Expected the app root to exist.")
}

const storedPilotId = globalThis.localStorage.getItem("ferox-pilot-id")
const pilotId = storedPilotId ?? crypto.randomUUID()
globalThis.localStorage.setItem("ferox-pilot-id", pilotId)

const socket = io({
	autoConnect: false,
	auth: {
		token: "ferox-local",
		username: `user::${pilotId}`,
	},
})

render(
	<RealtimeProvider socket={socket}>
		<AppShell socket={socket} />
	</RealtimeProvider>,
	appRoot,
)
