import { FOLLOW_UP_PRESETS, followUpInMonths, dateInputValue } from '../../lib/followUpDates';
import { useEffect, useState } from 'react';
import { notify } from '../../lib/feedback';
import { Plus, UserRound } from 'lucide-react';
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

interface StagePreview { id: string; status: string | null; created_at: string | null; }

interface StageCounts {
  prospects: number | null;
  proposals: number | null;
  salesOrders: number | null;
}

interface Props {
  showAll: boolean;
  canViewProposals: boolean;
  canViewSalesOrders: boolean;
  onOpenLeads: () => void;
  onOpenProposals: () => void;
  onOpenSalesOrders: () => void;
  onOpenProspect: (id: string) => void;
  onAddProspect: () => void;
}

const PROSPECTS_PER_PAGE = 30;
const ACTIVE_PROPOSAL_STATUSES = ['designing', 'ready_to_submit', 'sent', 'viewed', 'portal', 'approved_pending_action'];
const OPEN_ORDER_STATUSES = ['pending_deposit', 'pending_po', 'planning', 'active'];

export function PipelineStageOverview({
  showAll, canViewProposals, canViewSalesOrders, onOpenLeads, onOpenProposals,
  onOpenSalesOrders, onOpenProspect, onAddProspect,
}: Props) {
  const { profile } = useAuth();
  const userId = profile?.id;
  const organizationId = profile?.organization_id;
  const canViewProspects = profile?.role === 'admin' || profile?.can_view_prospects === true;
  const isManager = profile?.role === 'admin' || profile?.role === 'manager';
  const proposalVisibility = (profile as any)?.proposal_visibility_scope || 'own';
  const [counts, setCounts] = useState<StageCounts>({ prospects: null, proposals: null, salesOrders: null });
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [proposalPreviews, setProposalPreviews] = useState<StagePreview[]>([]);
  const [orderPreviews, setOrderPreviews] = useState<StagePreview[]>([]);
  const [prospectPage, setProspectPage] = useState({ page: 0, showAll });
  const page = prospectPage.showAll === showAll ? prospectPage.page : 0;
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editingProspectId, setEditingProspectId] = useState<string | null>(null);
  const [followUpDate, setFollowUpDate] = useState('');
  const [savingFollowUp, setSavingFollowUp] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const today = dateInputValue(new Date());

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    let active = true;

    async function refresh() {
      if (!userId) return;
      try {
        // These are live stage snapshots, not activity counts limited by the 14/30/60/90-day filter.
        let prospectQuery = supabase.from('contacts')
          .select('id, contact_name, company_name, email, phone, created_at, prospect_follow_up_on', { count: 'exact' })
          .eq('contact_type', 'prospect')
          .order('prospect_follow_up_on', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: false }).order('id')
          .range(page * PROSPECTS_PER_PAGE, (page + 1) * PROSPECTS_PER_PAGE - 1);
        let proposalQuery = supabase.from('proposals')
          .select('id, status, created_at', { count: 'exact' })
          .order('created_at', { ascending: false }).limit(5)
          .eq('is_revision', false).is('sales_order_id', null)
          .in('status', ACTIVE_PROPOSAL_STATUSES);
        let orderQuery = supabase.from('sales_orders')
          .select('id', { count: 'exact', head: true })
          .in('status', OPEN_ORDER_STATUSES);

        if (organizationId) {
          prospectQuery = prospectQuery.eq('organization_id', organizationId);
          proposalQuery = proposalQuery.eq('organization_id', organizationId);
          orderQuery = orderQuery.eq('organization_id', organizationId);
        }
        if (!showAll) {
          prospectQuery = prospectQuery.or('assigned_to.eq.' + userId + ',created_by.eq.' + userId);
          proposalQuery = proposalQuery.eq('created_by', userId);
          orderQuery = orderQuery.or('sales_rep_id.eq.' + userId + ',created_by.eq.' + userId);
        } else {
          // All Pipeline does not override separate Proposals/Sales Orders visibility permissions.
          if (!isManager && proposalVisibility === 'own') proposalQuery = proposalQuery.eq('created_by', userId);
          if (!isManager) orderQuery = orderQuery.or('sales_rep_id.eq.' + userId + ',created_by.eq.' + userId);
        }

        const [prospectResult, proposalResult, orderResult] = await Promise.all([
          canViewProspects ? prospectQuery : Promise.resolve(null),
          canViewProposals ? proposalQuery : Promise.resolve(null),
          canViewSalesOrders ? orderQuery : Promise.resolve(null),
        ]);
        if (!active) return;
        setCounts({
          prospects: prospectResult?.error ? null : prospectResult?.count ?? null,
          proposals: proposalResult?.error ? null : proposalResult?.count ?? null,
          salesOrders: orderResult?.error ? null : orderResult?.count ?? null,
        });
        setProspects((prospectResult?.data || []) as Prospect[]);
        setProposalPreviews((proposalResult?.data || []) as StagePreview[]);
        setOrderPreviews((orderResult?.data || []) as StagePreview[]);
        const failed = Boolean(prospectResult?.error || proposalResult?.error || orderResult?.error);
        if (failed) console.error('Pipeline stage query failed', { prospect: prospectResult?.error, proposal: proposalResult?.error, order: orderResult?.error });
        setLoadError(failed);
      } catch (error) {
        if (active) setLoadError(true);
        console.error('Pipeline stage refresh failed', error);
      } finally {
        if (active) setLoading(false);
      }
    }

    void refresh();
    const channel = supabase.channel('pipeline_stage_summary_' + userId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, () => { void refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'proposals' }, () => { void refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_orders' }, () => { void refresh(); })
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [userId, organizationId, showAll, canViewProspects, canViewProposals, canViewSalesOrders, isManager, proposalVisibility, page, refreshVersion]);

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

  const label = (count: number | null, suffix: string, allowed = true) =>
    !allowed ? 'No access' : loading ? 'Loading…' : count === null ? 'Unavailable' : String(count) + ' ' + suffix;

  return (
    <>
      <nav aria-label="Sales pipeline stages" className="grid w-full grid-cols-2 gap-2 lg:grid-cols-4">
        <button type="button" disabled={!canViewProspects} onClick={() => setExpanded(value => !value)}
          aria-expanded={expanded} aria-controls="pipeline-prospects"
          className="min-w-0 rounded-lg border border-gray-200 bg-surface px-3 py-2 text-left hover:border-blue-300 disabled:opacity-50">
          <span className="block text-sm font-semibold text-primary">Prospects</span>
          <span className="block truncate text-xs text-muted">{label(counts.prospects, 'to nurture', canViewProspects)}</span>
        </button>
        <button type="button" onClick={() => onOpenLeads()}
          className="min-w-0 rounded-lg border border-gray-200 bg-surface px-3 py-2 text-left hover:border-blue-300">
          <span className="block text-sm font-semibold text-primary">Leads</span>
          <span className="block truncate text-xs text-muted">Active opportunities</span>
        </button>
        <button type="button" disabled={!canViewProposals} onClick={onOpenProposals}
          className="min-w-0 rounded-lg border border-gray-200 bg-surface px-3 py-2 text-left hover:border-blue-300 disabled:opacity-50">
          <span className="block text-sm font-semibold text-primary">Proposals</span>
          <span className="block truncate text-xs text-muted">{label(counts.proposals, 'active', canViewProposals)}</span>
        </button>
        <button type="button" disabled={!canViewSalesOrders} onClick={onOpenSalesOrders}
          className="min-w-0 rounded-lg border border-gray-200 bg-surface px-3 py-2 text-left hover:border-blue-300 disabled:opacity-50">
          <span className="block text-sm font-semibold text-primary">Sales Orders</span>
          <span className="block truncate text-xs text-muted">{label(counts.salesOrders, 'open', canViewSalesOrders)}</span>
        </button>
      </nav>
      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2" aria-label="Recent pipeline records">
        {canViewProposals && (
          <section className="min-w-0 rounded-lg border border-gray-200 bg-surface p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-primary">Recent Proposals</h3>
              <button type="button" onClick={onOpenProposals} className="text-xs font-medium text-blue-700 hover:underline">View all</button>
            </div>
            {proposalPreviews.length === 0 ? <p className="text-xs text-muted">{loading ? 'Loading…' : 'No active proposals in this view'}</p> : (
              <ul className="space-y-1">{proposalPreviews.map(item => (
                <li key={item.id}><button type="button" onClick={onOpenProposals} className="flex w-full items-center justify-between gap-2 rounded border border-gray-200 bg-white px-2 py-2 text-left text-xs hover:border-blue-300">
                  <span className="truncate font-medium">Proposal {item.id.slice(0, 8)}</span><span className="shrink-0 text-muted">{item.status?.replace(/_/g, ' ') || 'Active'}</span>
                </button></li>
              ))}</ul>
            )}
          </section>
        )}
        {canViewSalesOrders && (
          <section className="min-w-0 rounded-lg border border-gray-200 bg-surface p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-primary">Recent Sales Orders</h3>
              <button type="button" onClick={onOpenSalesOrders} className="text-xs font-medium text-blue-700 hover:underline">View all</button>
            </div>
            {orderPreviews.length === 0 ? <p className="text-xs text-muted">{loading ? 'Loading…' : 'No open sales orders in this view'}</p> : (
              <ul className="space-y-1">{orderPreviews.map(item => (
                <li key={item.id}><button type="button" onClick={onOpenSalesOrders} className="flex w-full items-center justify-between gap-2 rounded border border-gray-200 bg-white px-2 py-2 text-left text-xs hover:border-blue-300">
                  <span className="truncate font-medium">Sales Order {item.id.slice(0, 8)}</span><span className="shrink-0 text-muted">{item.status?.replace(/_/g, ' ') || 'Open'}</span>
                </button></li>
              ))}</ul>
            )}
          </section>
        )}
      </div>
      {loadError && <p role="status" className="basis-full text-xs text-amber-300">Some pipeline stage counts could not be loaded. Try refreshing.</p>}
      {expanded && canViewProspects && (
        <div id="pipeline-prospects" className="basis-full rounded-lg border border-gray-200 bg-white p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold text-gray-900">Prospects</h3>
              <p className="text-xs text-gray-500">Future opportunities. Open a contact to nurture or convert it to a Lead.</p>
            </div>
            <button type="button" onClick={onAddProspect} className="flex items-center gap-1 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
              <Plus className="h-4 w-4" /> New Prospect
            </button>
          </div>
          {prospects.length === 0 ? (
            <p className="rounded-md bg-gray-50 px-3 py-5 text-center text-sm text-gray-500">No prospects in this view yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
                            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900" />
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
                onClick={() => setProspectPage({ page: page - 1, showAll })}>Previous</button>
              <span>Page {page + 1} of {Math.max(1, Math.ceil((counts.prospects ?? 0) / PROSPECTS_PER_PAGE))}</span>
              <button type="button" disabled={(page + 1) * PROSPECTS_PER_PAGE >= (counts.prospects ?? 0)}
                className="rounded-md border border-gray-200 px-3 py-1.5 disabled:opacity-50"
                onClick={() => setProspectPage({ page: page + 1, showAll })}>Next</button>
            </nav>
          )}
        </div>
      )}
    </>
  );
}
