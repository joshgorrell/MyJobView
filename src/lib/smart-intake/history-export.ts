export type HistoryExportRow = { id: string; channel: string; source_address: string; subject: string | null; status: string; created_at: string };
function escapeCsv(value: unknown): string {
  const text = String(value ?? '');
  const safe = /^[=+@\-\t\r]/.test(text) ? "'" + text : text;
  return '"' + safe.replace(/"/g, '""') + '"';
}
export function makeHistoryCsv(rows: HistoryExportRow[]): string {
  const keys: Array<keyof HistoryExportRow> = ['id','channel','source_address','subject','status','created_at'];
  return [keys.join(','), ...rows.map(row => keys.map(key => escapeCsv(row[key])).join(','))].join('\r\n');
}
