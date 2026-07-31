import { describe, expect, test } from "vitest"

import {
	isNewStandardLockIntent,
	isStandardLockIntent,
} from "./arena-protocol.ts"

describe("standard lock protocol", () => {
	test("accepts only sequenced targetless lock transitions", () => {
		expect(isStandardLockIntent({ active: true, clientLockId: 2 })).toBe(true)
		expect(
			isStandardLockIntent({
				active: true,
				clientLockId: 2,
				targetId: "spoofed-victim",
			}),
		).toBe(false)
		expect(isStandardLockIntent({ active: "true", clientLockId: 2 })).toBe(
			false,
		)
		expect(isStandardLockIntent({ active: true, clientLockId: -1 })).toBe(false)
	})

	test("rejects replays and accepts the next transition", () => {
		expect(isNewStandardLockIntent({ active: true, clientLockId: 4 }, 3)).toBe(
			true,
		)
		expect(isNewStandardLockIntent({ active: false, clientLockId: 4 }, 4)).toBe(
			false,
		)
		expect(isNewStandardLockIntent({ active: false, clientLockId: 5 }, 4)).toBe(
			true,
		)
	})
})
