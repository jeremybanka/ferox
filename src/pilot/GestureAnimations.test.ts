import { expect, test } from "vitest"

import { sampleFistbumpAnimationPose } from "./FistbumpAnimation.ts"
import { samplePunchAnimationPose } from "./PunchAnimation.ts"
import { sampleSaluteAnimationPose } from "./SaluteAnimation.ts"

test.each([
	["salute", sampleSaluteAnimationPose],
	["fistbump", sampleFistbumpAnimationPose],
	["punch", samplePunchAnimationPose],
] as const)(
	"%s enters, holds a pose, and restores claimed joints",
	(_name, sample) => {
		expect(sample(0)).toMatchObject({})
		expect(sample(0.5).rightShoulder?.rotation?.x).not.toBe(0)
		const end = sample(1)
		expect(end.rightShoulder?.rotation?.x ?? 0).toBeCloseTo(0)
	},
)
