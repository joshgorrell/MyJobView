import { FormEvent, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquare, Send } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { QuickActionModal } from '../Shared/QuickActionModal';
import { FlowScope } from '../../lib/flow/types';
import { EnrichedThread } from './conversationTypes';
import { coworkerRecipientKey, sendCoworkerReply } from './coworkerConversations';
import { parseHashtags, resolveMentions } from '../../lib/username';

type Recipient = { id: string; name: string };
export function NewTeamMessage({ scope, threads, canTeam, canCustomer, onCustomer, onClose, onSent }: {
  scope: FlowScope; threads: EnrichedThread[]; canTeam: boolean; canCustomer: boolean;
  onCustomer: () => void; onClose: () => void; onSent: (id: string) => Promise<void>;
}) {
  const { profile } = useAuth();
  const [kind, setKind] = useState<'direct' | 'department' | 'company'>('direct');
  const [people, setPeople] = useState<Recipient[]>([]);
  const [departments, setDepartments] = useState<Recipient[]>([]);
  const [selected, setSelected] = useState<Recipient[]>([]);
  const [search, setSearch] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(canTeam);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  useEffect(() => {
    if (!canTeam || !profile?.organization_id) return;
    let cancelled = false;
    async function load() {
      try {
        // Page the directory instead of hiding employees behind the API row limit.
        const allPeople: Recipient[] = [], allDepartments: Recipient[] = [];
        for (const table of ['profiles', 'departments']) {
          for (let offset = 0; ; offset += 500) {
            const result = await supabase.from(table).select(table === 'profiles' ? 'id,full_name' : 'id,display_name,name')
              .eq('organization_id', profile!.organization_id).eq('is_active', true).order('id').range(offset, offset + 499)
              .returns<{ id: string; full_name?: string; display_name?: string; name?: string }[]>();
            if (result.error) throw result.error;
            for (const row of result.data || []) {
              if (table === 'profiles' && row.id !== profile!.id) allPeople.push({ id: row.id, name: row.full_name || 'Teammate' });
              if (table === 'departments') allDepartments.push({ id: row.id, name: row.display_name || row.name || 'Department' });
            }
            if ((result.data || []).length < 500) break;
          }
        }
        if (!cancelled) { setPeople(allPeople.sort((a,b) => a.name.localeCompare(b.name))); setDepartments(allDepartments.sort((a,b) => a.name.localeCompare(b.name))); }
      } catch { if (!cancelled) setError('Unable to load recipients. Close and try again.'); }
      finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [canTeam, profile?.id, profile?.organization_id]);
  const choices = (kind === 'department' ? departments : people).filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
  async function send(event: FormEvent) {
    event.preventDefault();
    if (busy.current || !profile?.organization_id || !canTeam || !body.trim() || (kind !== 'company' && !selected.length)) return;
    busy.current = true; setSending(true); setError('');
    let sentId: string | undefined;
    try {
      const recordScope = { contact_id: scope.contactId || null, project_id: scope.projectId || null, work_order_id: scope.workOrderId || null };
      const key = coworkerRecipientKey(kind, [profile.id, ...selected.map(p => p.id)], kind === 'department' ? selected[0].id : null, recordScope);
      const existing = threads.find(t => t.source === 'coworker' && t.recipient_key === key);
      if (existing) {
        await sendCoworkerReply(profile.organization_id, profile.id, existing.id, body.trim());
        sentId = existing.id;
      } else {
        const { userMentions } = await resolveMentions(body, supabase);
        const { data, error: saveError } = await supabase.from('discussion_posts').insert({
          organization_id: profile.organization_id, user_id: profile.id, parent_id: null, content: body.trim(), post_type: 'general',
          audience_type: kind, audience_user_ids: kind === 'direct' ? selected.map(p => p.id) : [],
          audience_department_id: kind === 'department' ? selected[0].id : null, is_private: kind !== 'company',
          mentions: [...new Set([...userMentions, ...(kind === 'direct' ? selected.map(p => p.id) : [])])], hashtags: parseHashtags(body), ...recordScope,
        }).select('id').single();
        if (saveError) throw saveError;
        sentId = data.id;
      }
    } catch { setError('Message could not be sent. Your draft is still here.'); }
    if (sentId) {
      // A refresh failure must never offer to send the already-saved message again.
      await onSent(sentId);
    } else { busy.current = false; setSending(false); }
  }
  return createPortal(<QuickActionModal title="New message" icon={<MessageSquare className="w-5 h-5" />} onClose={() => { if (!busy.current) onClose(); }} scrollBody={false}>
    <form onSubmit={send} className="team-message-form flex min-h-0 flex-1 flex-col text-primary">
      <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Message recipients">
          {canTeam && (['direct', 'department', 'company'] as const).map(value => <button key={value} type="button" aria-pressed={kind === value} disabled={sending} onClick={() => { setKind(value); setSelected([]); setSearch(''); }} className={`min-h-11 rounded-lg px-3 text-sm ${kind === value ? 'bg-blue-600 text-white' : 'bg-elevated text-primary'}`}>{value === 'direct' ? 'People' : value === 'department' ? 'Departments' : 'Everyone'}</button>)}
          {canCustomer && <button type="button" disabled={sending} onClick={onCustomer} className="min-h-11 rounded-lg bg-elevated px-3 text-sm">Customer</button>}
        </div>
        {canTeam && kind !== 'company' && <>
          <label className="block text-sm font-medium" htmlFor="team-recipient-search">To</label>
          <input id="team-recipient-search" autoFocus type="search" value={search} disabled={sending} onChange={e => setSearch(e.target.value)} placeholder={kind === 'direct' ? 'Search people by name…' : 'Search departments…'} className="w-full rounded-lg border border-subtle bg-canvas p-2 text-base" />
          {!!selected.length && <div className="flex flex-wrap gap-2">{selected.map(p => <button type="button" key={p.id} disabled={sending} onClick={() => setSelected(selected.filter(r => r.id !== p.id))} aria-label={`Remove ${p.name}`} className="rounded-full bg-blue-100 px-3 py-2 text-sm text-blue-800">{p.name} ×</button>)}</div>}
          <div className="max-h-36 overflow-y-auto rounded-lg border border-subtle" aria-label="Recipient results">
            {loading ? <p className="p-3 text-sm">Loading recipients…</p> : choices.length ? choices.map(p => <button type="button" key={p.id} disabled={sending} aria-pressed={selected.some(r => r.id === p.id)} onClick={() => { setSelected(kind === 'department' ? [p] : selected.some(r => r.id === p.id) ? selected.filter(r => r.id !== p.id) : [...selected, p]); }} className={`block w-full min-h-11 px-3 py-2 text-left text-sm ${selected.some(r => r.id === p.id) ? 'bg-blue-100 text-blue-800' : 'hover:bg-elevated'}`}>{p.name}</button>) : <p className="p-3 text-sm text-secondary">No matching recipients.</p>}
          </div>
        </>}
        {canTeam && kind === 'company' && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">This message will be visible to everyone in the company with Flow access.</p>}
        {canTeam && <label className="block text-sm font-medium">Message<textarea value={body} disabled={sending} onChange={e => setBody(e.target.value)} rows={3} placeholder="Type your message…" className="mt-2 block w-full resize-none rounded-lg border border-subtle bg-canvas p-3 text-base" /></label>}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </div>
      {canTeam && <div className="shrink-0 border-t border-subtle p-3 flex justify-end"><button type="submit" disabled={sending || loading || !body.trim() || (kind !== 'company' && !selected.length)} className="flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-5 text-white disabled:opacity-50"><Send size={18} />{sending ? 'Sending…' : 'Send'}</button></div>}
    </form>
  </QuickActionModal>, document.body);
}
