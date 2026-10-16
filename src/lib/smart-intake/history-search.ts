export type HistorySearchCriteria = { search?: string; status?: string; channel?: 'email'|'sms'|'mms'; from?: string; to?: string; limit?: number };
export function sanitizeHistorySearch(criteria: HistorySearchCriteria) {
  const search = criteria.search?.trim().slice(0, 160).replace(/[%_,()]/g, '') ?? '';
  const limit = Math.max(1, Math.min(criteria.limit ?? 50, 100));
  if (criteria.from && !/^\d{4}-\d{2}-\d{2}$/.test(criteria.from)) throw new Error('Invalid start date');
  if (criteria.to && !/^\d{4}-\d{2}-\d{2}$/.test(criteria.to)) throw new Error('Invalid end date');
  if (criteria.from && criteria.to && criteria.from > criteria.to) throw new Error('Date range is reversed');
  return { ...criteria, search, limit };
}
