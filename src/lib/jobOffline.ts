import { supabase } from "./supabase";
export type VisitEvent = {
  p_assignment_id: string;
  p_disposition: string;
  p_notes: string | null;
  p_complete_project: boolean;
  p_event_id: string;
  p_expected_version: number;
};
export type PendingVisitEvent = { event: VisitEvent; error?: string };
const queueKey = (user: string) => `mjv-visit-events:${user}`;
const packetKey = (user: string, order: string) =>
  `mjv-visit-packet:${user}:${order}`;
export function pendingVisitEvents(user: string): PendingVisitEvent[] {
  return JSON.parse(localStorage.getItem(queueKey(user)) || "[]");
}
export function discardVisitEvent(user: string, id: string) {
  localStorage.setItem(
    queueKey(user),
    JSON.stringify(
      pendingVisitEvents(user).filter((p) => p.event.p_event_id !== id),
    ),
  );
}
export function cacheVisitPacket(user: string, order: string, packet: unknown) {
  localStorage.setItem(
    packetKey(user, order),
    JSON.stringify({ packet, savedAt: new Date().toISOString() }),
  );
}
export function readVisitPacket(user: string, order: string) {
  return JSON.parse(localStorage.getItem(packetKey(user, order)) || "null");
}
export function queueVisitEvent(user: string, event: VisitEvent) {
  const queue = pendingVisitEvents(user);
  if (!queue.some((p) => p.event.p_event_id === event.p_event_id))
    localStorage.setItem(queueKey(user), JSON.stringify([...queue, { event }]));
}
const locks = new Map<string, Promise<void>>();
export function syncVisitEvents(user: string): Promise<void> {
  if (locks.has(user)) return locks.get(user)!;
  const run = (async () => {
    if (!navigator.onLine) return;
    const session = await supabase.auth.getSession();
    if (session.data.session?.user.id !== user)
      throw new Error("Sign in as the owner of these saved updates to sync.");
    for (const saved of pendingVisitEvents(user)) {
      const result = await supabase.rpc(
        "record_visit_task_progress",
        saved.event,
      );
      if (result.error) {
        const queue = pendingVisitEvents(user);
        const item = queue.find(
          (p) => p.event.p_event_id === saved.event.p_event_id,
        );
        if (item) item.error = result.error.message;
        localStorage.setItem(queueKey(user), JSON.stringify(queue));
        throw result.error;
      }
      discardVisitEvent(user, saved.event.p_event_id);
    }
  })();
  locks.set(user, run);
  run.finally(() => locks.delete(user)).catch(() => {});
  return run;
}
