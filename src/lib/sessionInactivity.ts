// Shared session-idle policy. The clock is based only on activity in MyJobView.
export const MJV_IDLE_TIMEOUT_MS = 60 * 60 * 1000;
export const MJV_IDLE_WARNING_MS = 5 * 60 * 1000;

export function remainingIdleMs(lastInteractionAt: number, now = Date.now()): number {
  if (!Number.isFinite(lastInteractionAt) || lastInteractionAt <= 0 || lastInteractionAt > now) return 0;
  return Math.max(0, MJV_IDLE_TIMEOUT_MS - (now - lastInteractionAt));
}

export function mayResetOnReload(
  navigationType: string | undefined,
  previousActivityAt: number,
  now: number,
  isVisible: boolean
): boolean {
  return navigationType === 'reload' &&
    isVisible &&
    previousActivityAt > 0 &&
    remainingIdleMs(previousActivityAt, now) > 0;
}
