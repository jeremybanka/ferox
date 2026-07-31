import { spawn, type ChildProcess } from "node:child_process"
import { watch } from "node:fs"
import { fileURLToPath } from "node:url"

const generatorUrl = new URL("./generate-visor-atlas.ts", import.meta.url)
const generatorPath = fileURLToPath(generatorUrl)
let generator: ChildProcess | undefined
let generateAgain = false

function generate(): void {
	if (generator !== undefined) {
		generateAgain = true
		return
	}

	generator = spawn(process.execPath, [generatorPath], { stdio: "inherit" })
	generator.once("exit", () => {
		generator = undefined
		if (generateAgain) {
			generateAgain = false
			generate()
		}
	})
}

watch(generatorUrl, generate)
generate()
