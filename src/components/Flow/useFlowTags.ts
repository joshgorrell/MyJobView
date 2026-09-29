import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { FlowTarget } from '../../lib/flow/types';

export type TagChoice = { kind: 'person'; id: string; label: string; username: string } | (FlowTarget & { username?: never });
export function activeTag(text: string, cursor: number) {
  const match = text.slice(0, cursor).match(/(^|\s)([@#])([\w-]*)$/);
  return match ? { symbol: match[2], query: match[3], start: cursor - match[2].length - match[3].length } : null;
}
export function useFlowTags(text: string, cursor: number, organizationId?: string) {
  const tag = activeTag(text, cursor);
  const [result, setResult] = useState<{ key: string; choices: TagChoice[] }>({ key: '', choices: [] });
  const key = tag ? `${tag.symbol}:${tag.query}:${organizationId}` : '';
  useEffect(() => {
    let cancelled = false;
    if (!tag || !organizationId) return;
    const timer = setTimeout(async () => {
      if (tag.symbol === '@') {
        const { data } = await supabase.from('profiles').select('id,username,full_name')
          .eq('organization_id', organizationId).eq('is_active', true)
          .ilike('username', `${tag.query}%`).limit(8);
        if (!cancelled) setResult({ key, choices: (data || []).filter(p => p.username).map(p => ({ kind: 'person', id: p.id, username: p.username, label: p.full_name || p.username })) });
      } else {
        const { data } = await supabase.rpc('search_flow_targets', { p_search: tag.query, p_contact: null });
        if (!cancelled) setResult({ key, choices: (data || []) as FlowTarget[] });
      }
    }, 180);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [tag?.symbol, tag?.query, organizationId]);
  return { tag, choices: result.key === key ? result.choices : [] };
}
export function insertFlowTag(text: string, cursor: number, start: number, choice: TagChoice) {
  const replacement = choice.kind === 'person' ? `@${choice.username}` : `#${choice.label.replace(/\s+/g, ' ').trim()}`;
  const next = `${text.slice(0, start)}${replacement} ${text.slice(cursor)}`;
  return { text: next, cursor: start + replacement.length + 1 };
}
