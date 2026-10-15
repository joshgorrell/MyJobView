export type IntakeChannel = 'email' | 'sms' | 'mms';
export type HistoryFilter = { search: string; channel: 'all' | IntakeChannel; status: string; dateFrom: string; dateTo: string };
export const defaultHistoryFilter: HistoryFilter = { search: '', channel: 'all', status: 'all', dateFrom: '', dateTo: '' };
export function cleanHistoryFilter(filter: HistoryFilter): HistoryFilter {
  return { search: filter.search.trim().slice(0, 200), channel: filter.channel, status: filter.status, dateFrom: filter.dateFrom, dateTo: filter.dateTo };
}
