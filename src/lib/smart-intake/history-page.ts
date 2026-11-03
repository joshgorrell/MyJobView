export type IntakeHistoryCursor = { createdAt: string; id: string };
export function encodeHistoryCursor(cursor: IntakeHistoryCursor): string {
  if (!cursor.createdAt || !cursor.id) throw new Error('Incomplete history cursor');
  return JSON.stringify([cursor.createdAt, cursor.id]);
}
export function decodeHistoryCursor(value: string): IntakeHistoryCursor {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.length !== 2 || typeof parsed[0] !== 'string' || typeof parsed[1] !== 'string') throw new Error('Invalid history cursor');
  if (!Number.isFinite(Date.parse(parsed[0])) || !/^[0-9a-f-]{36}$/i.test(parsed[1])) throw new Error('Invalid history cursor');
  return { createdAt: parsed[0], id: parsed[1] };
}
