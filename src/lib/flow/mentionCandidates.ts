export type MentionPerson = { id: string; full_name: string; username?: string | null; nickname?: string | null };
export type MentionCandidate = { start: number; end: number; personIds: string[]; explicit: boolean; spoken: boolean; text: string };

const normalize = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();
const escapeRegExp = (value: string) => value.replace(/[.*+?^\u0024{}()|[\]\\]/g, '\\$&');

/**
 * Pure candidate discovery for text entered by keyboard or operating-system dictation.
 * Never sends notifications or silently resolves an ambiguous person to an ID.
 * Callers must require an explicit user selection before persisting a mention.
 */
export function findEmployeeMentionCandidates(text: string, people: MentionPerson[]): MentionCandidate[] {
  if (!text.trim() || !people.length) return [];
  const names = new Map<string, Set<string>>();
  for (const person of people) {
    if (!person.id) continue;
    const aliases = [person.full_name, person.username, person.nickname,
      ...person.full_name.trim().split(/\s+/).filter(part => part.length >= 2)];
    for (const alias of aliases) {
      const key = normalize(alias || '');
      if (!key || key.length < 2) continue;
      if (!names.has(key)) names.set(key, new Set());
      names.get(key)!.add(person.id);
    }
  }
  const results: MentionCandidate[] = [];
  for (const [name, ids] of names) {
    const pattern = new RegExp('(^|[^\\p{L}\\p{N}_])(@|at\\s+)?(' + escapeRegExp(name).replace(/\\ /g, '\\s+') + ')(?=$|[^\\p{L}\\p{N}_])', 'giu');
    for (const match of text.matchAll(pattern)) {
      const start = (match.index || 0) + match[1].length;
      const end = start + match[0].length - match[1].length;
      const prefix = match[2] || '';
      results.push({ start, end, personIds: [...ids], explicit: !!prefix, spoken: /^at\s+/i.test(prefix), text: text.slice(start, end) });
    }
  }
  // Prefer full names over overlapping first-name matches.
  return results.sort((a,b) => a.start - b.start || b.end - a.end)
    .filter((candidate, index, all) => !all.some((other, j) => j !== index && other.start <= candidate.start && other.end >= candidate.end && (other.end - other.start > candidate.end - candidate.start)));
}
