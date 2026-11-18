import { useEffect, useState } from 'react';
import { ChevronDown, Plus, UserRound } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Prospect {
  id: string;
  contact_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
}

interface StageCounts {
  prospects: number | null;
  proposals: number | null;
  salesOrders: number | null;
}

interface Props {
  showAll: boolean;
  canViewProposals: boolean;
  canViewSalesOrders: boolean;
  onOpenProposals: () => void;
  onOpenSalesOrders: () => void;
  onOpenProspect: (id: string) => void;
  onAddProspect: () => void;
}

const PROSPECTS_PER_PAGE = 30;
const ACTIVE_PROPOSAL_STATUSES = ['designing', 'ready_to_submit', 'sent', 'viewed', 'portal', 'approved_pending_action'];
const OPEN_ORDER_STATUSES = ['pending_deposit', 'pending_po', 'planning', 'active'];

export function PipelineStageOverview({
  showAll, canViewProposals, canViewSalesOrders, onOpenProposals,
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
  const [prospectPage, setProspectPage] = useState({ page: 0, showAll });
  const page = prospectPage.showAll === showAll ? prospectPage.page : 0;
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

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
          .select('id, contact_name, company_name, email, phone, created_at', { count: 'exact' })
          .eq('contact_type', 'prospect')
          .order('created_at', { ascending: false }).order('id')
          .range(page * PROSPECTS_PER_PAGE, (page + 1) * PROSPECTS_PER_PAGE - 1);
        let proposalQuery = supabase.from('proposals')
          .select('id', { count: 'exact', head: true })
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
  }, [userId, organizationId, showAll, canViewProspects, canViewProposals, canViewSalesOrders, isManager, proposalVisibility, page]);

  const label = (count: number | null, suffix: string, allowed = true) =>
    !allowed ? 'No access' : loading ? 'Loading…' : count === null ? 'Unavailable' : String(count) + ' ' + suffix;

  return (
    <>
      <details className="relative self-start sm:self-auto">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-gray-300 bg-surface px-3 py-2.5 text-sm font-medium text-primary [&::-webkit-details-marker]:hidden">
          Sales stages <ChevronDown className="h-4 w-4" />
        </summary>
        <div className="absolute left-0 z-20 mt-1 w-56 rounded-lg border border-gray-200 bg-surface p-1 shadow-lg sm:left-auto sm:right-0">
          <button type="button" disabled={!canViewProspects}
            onClick={event => {
              setExpanded(value => !value);
              event.currentTarget.closest('details')?.removeAttribute('open');
            }}
            aria-expanded={expanded} aria-controls={expanded ? 'pipeline-prospects' : undefined}
            className="block w-full rounded-md px-3 py-2 text-left text-sm text-primary hover:bg-gray-100 disabled:opacity-50">
            <span className="font-medium">Prospects</span>
            <span className="block text-xs text-muted">{label(counts.prospects, 'to nurture', canViewProspects)}</span>
          </button>
          <button type="button" disabled={!canViewProposals} onClick={onOpenProposals}
            className="block w-full rounded-md px-3 py-2 text-left text-sm text-primary hover:bg-gray-100 disabled:opacity-50">
            <span className="font-medium">Proposals</span>
            <span className="block text-xs text-muted">{label(counts.proposals, 'active', canViewProposals)}</span>
          </button>
          <button type="button" disabled={!canViewSalesOrders} onClick={onOpenSalesOrders}
            className="block w-full rounded-md px-3 py-2 text-left text-sm text-primary hover:bg-gray-100 disabled:opacity-50">
            <span className="font-medium">Sales Orders</span>
            <span className="block text-xs text-muted">{label(counts.salesOrders, 'open', canViewSalesOrders)}</span>
          </button>
        </div>
      </details>
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
                <button key={prospect.id} type="button" onClick={() => onOpenProspect(prospect.id)}
                  className="flex items-start gap-2 rounded-md border border-gray-200 p-3 text-left hover:border-blue-400 hover:bg-blue-50">
                  <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-gray-900">{prospect.contact_name || prospect.company_name || 'Unnamed prospect'}</span>
                    {prospect.company_name && <span className="block truncate text-xs text-gray-500">{prospect.company_name}</span>}
                    {prospect.email && <span className="block truncate text-xs text-gray-500">{prospect.email}</span>}
                  </span>
                </button>
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
