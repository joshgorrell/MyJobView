export function browserInstallationId(): string {
  const key = 'mjv-browser-installation';
  try {
    const existing = localStorage.getItem(key);
    if (existing && /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(existing)) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(key, id);
    return id;
  } catch {
    // Without storage, an installation cannot be recognized across visits.
    return crypto.randomUUID();
  }
}
export type SessionStatus = 'Online' | 'Idle' | 'Ended';
export function sessionStatus(session: { is_active: boolean; session_end: string | null; last_activity: string }, now = Date.now()): SessionStatus {
  const age = now - Date.parse(session.last_activity);
  if (session.session_end || !session.is_active || !Number.isFinite(age) || age >= 30 * 60_000) return 'Ended';
  return age < 6 * 60_000 ? 'Online' : 'Idle';
}
export function sessionDeviceKey(session: { device_signature?: string | null; user_id: string; device_type: string | null; browser_name: string | null; os_name: string | null }) {
  return session.device_signature || `legacy:${session.user_id}:${session.device_type || 'unknown'}|${session.browser_name || 'unknown'}|${session.os_name || 'unknown'}`;
}
