import { FOLLOW_UP_PRESETS, followUpInMonths, dateInputValue } from '../../lib/followUpDates';
import { useEffect, useState, type ReactNode } from 'react';
import { notify } from '../../lib/feedback';
import { Plus, UserRound, Settings } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Prospect {
  id: string;
  contact_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
  prospect_follow_up_on: string | null;
}



interface StageCounts {
  prospects: number | null;
  leads: number | null;
  proposals: number | null;
  salesOrders: number | null;
}

interface Props {
  tabList?: ReactNode;
  onOpenRecord: (kind: 'lead' | 'proposal' | 'order', id: string) => void;
  canViewLeads: boolean;
  canViewProposals: boolean;
  prospectRefresh: number;
  canViewSalesOrders: boolean;
  onOpenLeads: () => void;
  onOpenProposals: () => void;
  onOpenSalesOrders: () => void;
  onOpenProspect: (id: string) => void;
  onAddProspect: () => void;
}

const STAGE_KEYS = ['prospects', 'leads', 'proposals', 'salesOrders'] as const;
type StageRecord = { id: string; title: string; detail?: string };
const STAGE_PREVIEW_LIMIT = 10;
type StageKey = typeof STAGE_KEYS[number];
const STAGE_LABELS: Record<StageKey, string> = {
  prospects: 'Prospects', leads: 'Leads', proposals: 'Proposals', salesOrders: 'Sales Orders',
};

const STAGE_CARD_CLASS = 'min-w-0 rounded-lg border border-gray-200 bg-surface p-3';
const STAGE_HEADER_CLASS = 'mb-3 flex min-h-11 items-center gap-2';
const EMPTY_STAGE_CLASS = 'rounded-md border border-dashed border-gray-200 px-3 py-4 text-center text-sm text-muted';

const PROSPECTS_PER_PAGE = 30;
const ACTIVE_PROPOSAL_STATUSES = ['designing', 'ready_to_submit', 'sent', 'viewed', 'portal', 'approved_pending_action'];
const OPEN_ORDER_STATUSES = ['pending_deposit', 'pending_po', 'planning', 'active'];

export function PipelineStageOverview({
  tabList, onOpenRecord, canViewLeads, canViewProposals, prospectRefresh, canViewSalesOrders, onOpenLeads, onOpenProposals,
  onOpenSalesOrders, onOpenProspect, onAddProspect,
}: Props) {
  const { profile } = useAuth();
  const userId = profile?.id;
  const organizationId = profile?.organization_id;
  const canViewProspects = profile?.role === 'admin' || profile?.can_view_prospects === true;
  const isManager = profile?.role === 'admin' || profile?.role === 'manager';
  const [selection, setSelection] = useState('my');
  const [directory, setDirectory] = useState<{ organizationId: string; users: { id: string; full_name: string | null }[] } | null>(null);
  const users = isManager && directory?.organizationId === organizationId ? directory?.users ?? [] : [];
  const showAll = isManager && selection === 'all';
  const ownerId = showAll ? null : users.some(user => user.id === selection) ? selection : userId;
  const scope = JSON.stringify([organizationId, userId, ownerId, canViewProspects, canViewLeads, canViewProposals, canViewSalesOrders]);
  const [loadedScope, setLoadedScope] = useState('');
  const [leads, setLeads] = useState<StageRecord[]>([]);
  const [proposals, setProposals] = useState<StageRecord[]>([]);
  const [orders, setOrders] = useState<StageRecord[]>([]);

  useEffect(() => {
    if (!isManager || !organizationId) return;
    let active = true;
    void supabase.from('profiles').select('id, full_name')
      .eq('organization_id', organizationId).eq('is_active', true).order('full_name')
      .then(({ data, error }) => {
        if (active && !error) setDirectory({ organizationId, users: data ?? [] });
      });
    return () => { active = false; };
  }, [isManager, organizationId]);
  const [counts, setCounts] = useState<StageCounts>({ prospects: null, leads: null, proposals: null, salesOrders: null });
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [prospectPage, setProspectPage] = useState({ page: 0, scope });
  const page = prospectPage.scope === scope ? prospectPage.page : 0;
  const [expanded, setExpanded] = useState(false);
  const [visibleStages, setVisibleStages] = useState<StageKey[]>([...STAGE_KEYS]);
  const [showStageSettings, setShowStageSettings] = useState(false);

  useEffect(() => {
    if (!userId) return;
    try {
      const saved = window.localStorage.getItem('mjv.pipeline.stages.' + userId);
      if (!saved) { setVisibleStages([...STAGE_KEYS]); return; }
      const parsed: unknown = JSON.parse(saved);
      if (!Array.isArray(parsed)) return;
      const allowed = STAGE_KEYS.filter(key => parsed.includes(key));
      const next = allowed.length ? allowed : [...STAGE_KEYS];
      setVisibleStages(next);
    } catch (error) {
      console.warn('Could not load pipeline stage visibility', error);
    }
  }, [userId]);

  function toggleStage(key: StageKey) {
    setVisibleStages(current => {
      const next = current.includes(key) ? current.filter(value => value !== key) : STAGE_KEYS.filter(value => current.includes(value) || value === key);
      if (!next.length) return current;
      if (userId) {
        try { window.localStorage.setItem('mjv.pipeline.stages.' + userId, JSON.stringify(next)); }
        catch (error) { console.warn('Could not save pipeline stage visibility', error); }
      }
      return next;
    });
  }

  function resetStageVisibility() {
    setVisibleStages([...STAGE_KEYS]);
    if (userId) {
      try { window.localStorage.removeItem('mjv.pipeline.stages.' + userId); }
      catch (error) { console.warn('Could not reset pipeline stage visibility', error); }
    }
  }
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editingProspectId, setEditingProspectId] = useState<string | null>(null);
  const [followUpDate, setFollowUpDate] = useState('');
  const [savingFollowUp, setSavingFollowUp] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const today = dateInputValue(new Date());

  useEffect(() => {
    if (!userId || !organizationId) {
      setLoading(false);
      return;
    }
    let active = true;

    async function refresh() {
      if (!userId || !organizationId) return;
      try {
        // These are live stage snapshots, not activity counts limited by the 14/30/60/90-day filter.
        let prospectQuery = supabase.from('contacts')
          .select('id, contact_name, company_name, email, phone, created_at, prospect_follow_up_on', { count: 'exact' })
          .eq('contact_type', 'prospect')
          .order('prospect_follow_up_on', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: false }).order('id')
          .range(page * PROSPECTS_PER_PAGE, (page + 1) * PROSPECTS_PER_PAGE - 1);
        let leadQuery = supabase.from('leads')
          .select('id, contact_name, company_name, status', { count: 'exact' })
          .is('converted_at', null).not('status', 'in', '(closed_won,closed_lost)')
          .order('created_at', { ascending: false }).order('id').limit(STAGE_PREVIEW_LIMIT);
        let proposalQuery = supabase.from('proposals')
          .select('id, title, proposal_number, status', { count: 'exact' })
          .eq('is_revision', false).is('sales_order_id', null)
          .in('status', ACTIVE_PROPOSAL_STATUSES)
          .order('created_at', { ascending: false }).order('id').limit(STAGE_PREVIEW_LIMIT);
        let orderQuery = supabase.from('sales_orders')
          .select('id, order_number, status', { count: 'exact' })
          .in('status', OPEN_ORDER_STATUSES)
          .order('created_at', { ascending: false }).order('id').limit(STAGE_PREVIEW_LIMIT);

        prospectQuery = prospectQuery.eq('organization_id', organizationId);
        leadQuery = leadQuery.eq('organization_id', organizationId);
        proposalQuery = proposalQuery.eq('organization_id', organizationId);
        orderQuery = orderQuery.eq('organization_id', organizationId);
        if (ownerId) {
          prospectQuery = prospectQuery.or(`assigned_to.eq.${ownerId},and(assigned_to.is.null,created_by.eq.${ownerId})`);
          leadQuery = leadQuery.eq('assigned_to', ownerId);
          proposalQuery = proposalQuery.eq('created_by', ownerId);
          orderQuery = orderQuery.or(`sales_rep_id.eq.${ownerId},and(sales_rep_id.is.null,created_by.eq.${ownerId})`);
        }

        const [prospectResult, leadResult, proposalResult, orderResult] = await Promise.all([
          canViewProspects ? prospectQuery : Promise.resolve(null),
          canViewLeads ? leadQuery : Promise.resolve(null),
          canViewProposals ? proposalQuery : Promise.resolve(null),
          canViewSalesOrders ? orderQuery : Promise.resolve(null),
        ]);
        if (!active) return;
        setCounts({
          prospects: prospectResult?.error ? null : prospectResult?.count ?? null,
          leads: leadResult?.error ? null : leadResult?.count ?? null,
          proposals: proposalResult?.error ? null : proposalResult?.count ?? null,
          salesOrders: orderResult?.error ? null : orderResult?.count ?? null,
        });
        setProspects((prospectResult?.data || []) as Prospect[]);
        setLeads((leadResult?.data ?? []).map(item => ({ id: item.id, title: item.contact_name || item.company_name || 'Unnamed lead', detail: item.status })));
        setProposals((proposalResult?.data ?? []).map(item => ({ id: item.id, title: item.title || String(item.proposal_number ?? 'Untitled proposal'), detail: item.status })));
        setOrders((orderResult?.data ?? []).map(item => ({ id: item.id, title: 'Order ' + (item.order_number ?? item.id), detail: item.status })));
        setLoadedScope(scope);
        const failed = Boolean(prospectResult?.error || leadResult?.error || proposalResult?.error || orderResult?.error);
        if (failed) console.error('Pipeline stage query failed', { prospect: prospectResult?.error, lead: leadResult?.error, proposal: proposalResult?.error, order: orderResult?.error });
        setLoadError(failed);
      } catch (error) {
        if (active) {
          setCounts({ prospects: null, leads: null, proposals: null, salesOrders: null });
          setLoadedScope(scope);
          setLoadError(true);
        }
        console.error('Pipeline stage refresh failed', error);
      } finally {
        if (active) setLoading(false);
      }
    }

    void refresh();
    const channel = supabase.channel('pipeline_stage_summary_' + userId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, () => { void refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => { void refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'proposals' }, () => { void refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_orders' }, () => { void refresh(); })
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [userId, organizationId, scope, ownerId, canViewProspects, canViewLeads, canViewProposals, canViewSalesOrders, page, refreshVersion, prospectRefresh]);

  async function saveFollowUp(prospectId: string, date: string | null) {
    if (!canViewProspects || !organizationId || savingFollowUp) return;
    setSavingFollowUp(true);
    try {
      const { data, error } = await supabase.from('contacts')
        .update({ prospect_follow_up_on: date })
        .eq('id', prospectId)
        .eq('organization_id', organizationId)
        .eq('contact_type', 'prospect')
        .select('id')
        .maybeSingle();
      if (error || !data) throw error ?? new Error('Prospect could not be updated');
      setProspects(items => items.map(item => item.id === prospectId ? { ...item, prospect_follow_up_on: date } : item));
      setEditingProspectId(null);
      setRefreshVersion(version => version + 1);
      notify(date ? 'Prospect follow-up saved.' : 'Prospect follow-up cleared.', { theme: 'blue', tone: 'success' });
    } catch (error) {
      console.error('Unable to save prospect follow-up', error);
      notify('Unable to save prospect follow-up.', { theme: 'blue', tone: 'error' });
    } finally {
      setSavingFollowUp(false);
    }
  }

  const pending = loading || loadedScope !== scope;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {tabList && <div className="w-full min-w-0 sm:w-auto">{tabList}</div>}
        {isManager && (
          <select aria-label="Pipeline owner" value={showAll ? 'all' : ownerId === userId ? 'my' : selection}
            className="min-h-11 min-w-0 max-w-full flex-1 truncate rounded-md border border-gray-300 bg-surface px-3 py-2 text-base text-primary sm:max-w-64 sm:text-sm"
            onChange={event => { setSelection(event.target.value); setEditingProspectId(null); }}>
            <option value="my">My Pipeline</option>
            <option value="all">All users</option>
            {users.filter(user => user.id !== userId).map(user => <option key={user.id} value={user.id}>{user.full_name || 'Unnamed user'}</option>)}
          </select>
        )}
        <div className="ml-auto shrink-0">
          <div className="relative">
            <button type="button" aria-label="Choose visible pipeline stages" aria-expanded={showStageSettings} onClick={() => setShowStageSettings(open => !open)}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-md border border-gray-200 bg-surface p-2 text-muted hover:text-primary" title="Choose visible stages"><Settings className="h-4 w-4" /></button>
            {showStageSettings && (
              <div className="absolute right-0 top-full z-30 mt-1 w-56 max-w-[calc(100vw-2rem)] rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
                <p className="mb-2 text-xs font-semibold text-gray-800">Visible pipeline stages</p>
                {STAGE_KEYS.map(key => (
                  <label key={key} className="flex items-center gap-2 py-1.5 text-sm text-gray-700">
                    <input type="checkbox" checked={visibleStages.includes(key)} disabled={visibleStages.length === 1 && visibleStages.includes(key)} onChange={() => toggleStage(key)} />
                    {STAGE_LABELS[key]}
                  </label>
                ))}
                <button type="button" onClick={resetStageVisibility} className="mt-2 text-xs font-medium text-blue-700 hover:underline">Reset to default</button>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="min-w-0 space-y-3" role={tabList ? 'tabpanel' : undefined}>
        {loadError && !pending && <p role="status" className="text-xs text-amber-300">Some pipeline records could not be loaded.</p>}
        <div aria-label="Sales pipeline stages" className={`grid gap-3 ${expanded ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4'}`}>
          {visibleStages.includes('prospects') && (
            <section className={STAGE_CARD_CLASS}>
              <div className={STAGE_HEADER_CLASS}>
                <button type="button" disabled={!canViewProspects} onClick={() => setExpanded(value => !value)} className="min-w-0 flex-1 text-left hover:underline disabled:opacity-50">
                  <span className="block text-sm font-semibold text-primary">{expanded ? 'Back to Pipeline' : 'Prospects'}</span>
                  <span className="block text-xs text-muted">{!canViewProspects ? 'No access' : pending ? 'Loading…' : counts.prospects === null ? 'Unavailable' : counts.prospects + ' to nurture'}</span>
                </button>
                {canViewProspects && <button type="button" onClick={onAddProspect} title="New Prospect" aria-label="New Prospect" className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md border border-gray-200 p-2 text-primary"><Plus className="h-4 w-4" /></button>}
              </div>
              {canViewProspects && !pending && counts.prospects !== null && <>
                {prospects.length === 0 ? (
                  <p className={EMPTY_STAGE_CLASS}>No prospects in this view yet.</p>
                ) : (
                  <div className="space-y-2">
                    {prospects.map(prospect => (
                      <article key={prospect.id} className="min-w-0 rounded-md border border-gray-200 p-3">
                        <button type="button" onClick={() => onOpenProspect(prospect.id)}
                          className="flex w-full items-start gap-2 rounded-md text-left hover:bg-gray-50">
                          <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-gray-900">{prospect.contact_name || prospect.company_name || 'Unnamed prospect'}</span>
                            {prospect.company_name && <span className="block truncate text-xs text-gray-500">{prospect.company_name}</span>}
                            {prospect.email && <span className="block truncate text-xs text-gray-500">{prospect.email}</span>}
                          </span>
                        </button>
                        {prospect.prospect_follow_up_on && (
                          <p className={`mt-2 text-xs ${prospect.prospect_follow_up_on <= today ? 'font-semibold text-amber-700' : 'text-gray-600'}`}>
                            {prospect.prospect_follow_up_on < today ? 'Overdue' : prospect.prospect_follow_up_on === today ? 'Due today' : 'Follow-up'}{' · '}
                            <time dateTime={prospect.prospect_follow_up_on}>
                              {new Date(prospect.prospect_follow_up_on + 'T12:00:00').toLocaleDateString()}
                            </time>
                          </p>
                        )}
                        {editingProspectId === prospect.id ? (
                          <form className="mt-2 space-y-2" onSubmit={event => {
                            event.preventDefault();
                            if (followUpDate) void saveFollowUp(prospect.id, followUpDate);
                          }}>
                            <fieldset disabled={savingFollowUp} className="min-w-0 space-y-2">
                              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-blue-700">
                                {FOLLOW_UP_PRESETS.map(({ label, months }) => (
                                  <button key={months} type="button" onClick={() => setFollowUpDate(followUpInMonths(months))}>{label}</button>
                                ))}
                              </div>
                              <label className="block text-xs font-medium text-gray-700">
                                Custom
                                <input type="date" required value={followUpDate} onChange={event => setFollowUpDate(event.target.value)}
                                  className="mt-1 block min-h-11 w-full min-w-0 max-w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-base text-gray-900 sm:text-sm" />
                              </label>
                              <div className="flex flex-wrap items-center gap-3 text-xs">
                                <button type="submit" className="rounded-md bg-blue-600 px-3 py-1.5 font-medium text-white">Save reminder</button>
                                <button type="button" onClick={() => setEditingProspectId(null)} className="text-gray-700">Cancel</button>
                                {prospect.prospect_follow_up_on && (
                                  <button type="button" onClick={() => void saveFollowUp(prospect.id, null)} className="text-gray-700">Clear</button>
                                )}
                              </div>
                            </fieldset>
                          </form>
                        ) : (
                          <button type="button" disabled={savingFollowUp || !organizationId} onClick={() => {
                            setEditingProspectId(prospect.id);
                            setFollowUpDate(prospect.prospect_follow_up_on ?? '');
                          }} className="mt-2 text-xs font-semibold text-blue-700 hover:underline disabled:opacity-50">
                            {prospect.prospect_follow_up_on ? 'Edit reminder' : 'Set reminder'}
                          </button>
                        )}
                      </article>
                    ))}
                  </div>
                )}
                {(page > 0 || (counts.prospects ?? 0) > PROSPECTS_PER_PAGE) && (
                  <nav aria-label="Prospect pages" className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted">
                    <button type="button" disabled={page === 0} className="rounded-md border border-gray-200 px-3 py-1.5 disabled:opacity-50"
                      onClick={() => setProspectPage({ page: page - 1, scope })}>Previous</button>
                    <span>Page {page + 1} of {Math.max(1, Math.ceil((counts.prospects ?? 0) / PROSPECTS_PER_PAGE))}</span>
                    <button type="button" disabled={(page + 1) * PROSPECTS_PER_PAGE >= (counts.prospects ?? 0)}
                      className="rounded-md border border-gray-200 px-3 py-1.5 disabled:opacity-50"
                      onClick={() => setProspectPage({ page: page + 1, scope })}>Next</button>
                  </nav>
                )}
              </>}
            </section>
          )}
          {!expanded && ([
            { key: 'leads', records: leads, count: counts.leads, allowed: canViewLeads, open: onOpenLeads, kind: 'lead' },
            { key: 'proposals', records: proposals, count: counts.proposals, allowed: canViewProposals, open: onOpenProposals, kind: 'proposal' },
            { key: 'salesOrders', records: orders, count: counts.salesOrders, allowed: canViewSalesOrders, open: onOpenSalesOrders, kind: 'order' },
          ] as const).filter(stage => visibleStages.includes(stage.key)).map(stage => (
            <section key={stage.key} className={STAGE_CARD_CLASS}>
              <div className={STAGE_HEADER_CLASS}>
                <button type="button" disabled={!stage.allowed} onClick={stage.open} className="min-w-0 flex-1 text-left hover:underline disabled:opacity-50">
                  <span className="block text-sm font-semibold text-primary">{STAGE_LABELS[stage.key]}</span>
                  <span className="block text-xs text-muted">{!stage.allowed ? 'No access' : pending ? 'Loading…' : stage.count === null ? 'Unavailable' : stage.count + (stage.key === 'salesOrders' ? ' open' : ' active')}</span>
                </button>
              </div>
              {stage.allowed && !pending && stage.count !== null && (
                stage.records.length ? (
                  <ul className="space-y-1">
                    {stage.records.map(record => (
                      <li key={record.id}>
                        <button type="button" onClick={() => onOpenRecord(stage.kind, record.id)} className="block min-h-11 w-full rounded-md border border-gray-200 px-2.5 py-2 text-left text-sm text-primary hover:border-blue-300">
                          <span className="block truncate">{record.title}</span>
                          {record.detail && <span className="block text-xs capitalize text-muted">{record.detail.replace(/_/g, ' ')}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : <p className={EMPTY_STAGE_CLASS}>No records in this view.</p>
              )}
              {stage.allowed && !pending && (stage.count ?? 0) > STAGE_PREVIEW_LIMIT && (
                <button type="button" onClick={stage.open} className="mt-3 text-xs font-medium text-primary hover:underline">View all {STAGE_LABELS[stage.key].toLowerCase()}</button>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
