import { describe, expect, test } from "vitest"

import { isGestureIntent, isPilotEmote } from "./arena-protocol.ts"

describe("gesture protocol", () => {
	test.each(["wave", "salute", "fistbump"])("accepts the %s emote", (emote) =>
		expect(isPilotEmote(emote)).toBe(true),
	)

	test("rejects invalid emote values", () => {
		expect(isPilotEmote("punch")).toBe(false)
		expect(isPilotEmote("dance")).toBe(false)
	})

	test.each(["wave", "salute", "fistbump", "punch"])(
		"accepts a sequenced %s intent",
		(type) => expect(isGestureIntent({ clientActionId: 4, type })).toBe(true),
	)

	test("rejects malformed, extra, and negative intent data", () => {
		expect(isGestureIntent({ clientActionId: -1, type: "punch" })).toBe(false)
		expect(isGestureIntent({ clientActionId: 1, type: "dance" })).toBe(false)
		expect(
			isGestureIntent({
				classification: "assassination",
				clientActionId: 1,
				type: "punch",
			}),
		).toBe(false)
	})
})
