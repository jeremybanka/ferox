export function isFireCadenceReady(
	lastAcceptedAt: number | undefined,
	now: number,
	minimumIntervalMs: number,
): boolean {
	if (!Number.isFinite(now) || !Number.isFinite(minimumIntervalMs)) return false
	if (minimumIntervalMs < 0) return false
	return (
		lastAcceptedAt === undefined || now - lastAcceptedAt >= minimumIntervalMs
	)
}
