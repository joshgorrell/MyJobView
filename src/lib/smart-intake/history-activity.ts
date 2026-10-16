export type ActivityEntry = { id: string; at: string; kind: 'message'|'event'|'attempt'|'delivery'; label: string };
export function mergeHistoryActivity(entries: ActivityEntry[]): ActivityEntry[] {
  return [...entries].sort((a,b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}
