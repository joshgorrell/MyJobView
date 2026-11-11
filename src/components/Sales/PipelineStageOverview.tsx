import { useEffect, useState } from 'react';
import { ArrowRight, Plus, UserRound } from 'lucide-react';
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
  leads: number | null;
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
  const [counts, setCounts] = useState<StageCounts>({ prospects: null, leads: null, proposals: null, salesOrders: null });
  const [prospects, setProspects] = useState<Prospect[]>([]);
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
          .eq('contact_type', 'prospect').order('created_at', { ascending: false }).limit(100);
        let leadQuery = supabase.from('leads')
          .select('id', { count: 'exact', head: true })
          .is('converted_at', null).not('status', 'in', '(closed_won,closed_lost)');
        let proposalQuery = supabase.from('proposals')
          .select('id', { count: 'exact', head: true })
          .eq('is_revision', false).is('sales_order_id', null)
          .in('status', ACTIVE_PROPOSAL_STATUSES);
        let orderQuery = supabase.from('sales_orders')
          .select('id', { count: 'exact', head: true })
          .in('status', OPEN_ORDER_STATUSES);

        if (organizationId) {
          prospectQuery = prospectQuery.eq('organization_id', organizationId);
          leadQuery = leadQuery.eq('organization_id', organizationId);
          proposalQuery = proposalQuery.eq('organization_id', organizationId);
          orderQuery = orderQuery.eq('organization_id', organizationId);
        }
        if (!showAll) {
          // Shared, unclaimed Leads remain visible to salespeople alongside their own Leads.
          prospectQuery = prospectQuery.or('assigned_to.eq.' + userId + ',created_by.eq.' + userId);
          leadQuery = leadQuery.or('assigned_to.eq.' + userId + ',created_by.eq.' + userId + ',and(is_fishbowl.eq.true,assigned_to.is.null)');
          proposalQuery = proposalQuery.eq('created_by', userId);
          orderQuery = orderQuery.or('sales_rep_id.eq.' + userId + ',created_by.eq.' + userId);
        } else {
          // All Pipeline does not override separate Proposals/Sales Orders visibility permissions.
          if (!isManager && proposalVisibility === 'own') proposalQuery = proposalQuery.eq('created_by', userId);
          if (!isManager) orderQuery = orderQuery.or('sales_rep_id.eq.' + userId + ',created_by.eq.' + userId);
        }

        const [prospectResult, leadResult, proposalResult, orderResult] = await Promise.all([
          canViewProspects ? prospectQuery : Promise.resolve(null),
          leadQuery,
          canViewProposals ? proposalQuery : Promise.resolve(null),
          canViewSalesOrders ? orderQuery : Promise.resolve(null),
        ]);
        if (!active) return;
        setCounts({
          prospects: prospectResult?.error ? null : prospectResult?.count ?? null,
          leads: leadResult.error ? null : leadResult.count ?? null,
          proposals: proposalResult?.error ? null : proposalResult?.count ?? null,
          salesOrders: orderResult?.error ? null : orderResult?.count ?? null,
        });
        setProspects((prospectResult?.data || []) as Prospect[]);
        const failed = Boolean(prospectResult?.error || leadResult.error || proposalResult?.error || orderResult?.error);
        if (failed) console.error('Pipeline stage query failed', { prospect: prospectResult?.error, lead: leadResult.error, proposal: proposalResult?.error, order: orderResult?.error });
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => { void refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'proposals' }, () => { void refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_orders' }, () => { void refresh(); })
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [userId, organizationId, showAll, canViewProspects, canViewProposals, canViewSalesOrders, isManager, proposalVisibility]);

  const label = (count: number | null, suffix: string, allowed = true) =>
    !allowed ? 'No access' : loading ? 'Loading…' : count === null ? 'Unavailable' : String(count) + ' ' + suffix;

  return (
    <section aria-label="Sales pipeline stages" className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button type="button" disabled={!canViewProspects} onClick={() => setExpanded(value => !value)}
          aria-expanded={expanded} aria-controls="pipeline-prospects"
          className="rounded-lg border border-white/20 bg-white/10 px-3 py-3 text-left text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-50">
          <span className="flex items-center justify-between">Prospects <ArrowRight className="h-4 w-4" /></span>
          <span className="mt-1 block text-xs font-normal text-gray-300">{label(counts.prospects, 'to nurture', canViewProspects)}</span>
        </button>
        <button type="button" onClick={onOpenLeads}
          className="rounded-lg border border-white/20 bg-white/10 px-3 py-3 text-left text-sm font-semibold text-white hover:bg-white/20">
          <span className="flex items-center justify-between">Leads <ArrowRight className="h-4 w-4" /></span>
          <span className="mt-1 block text-xs font-normal text-gray-300">{label(counts.leads, 'open')}</span>
        </button>
        <button type="button" disabled={!canViewProposals} onClick={onOpenProposals}
          className="rounded-lg border border-white/20 bg-white/10 px-3 py-3 text-left text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-50">
          <span className="flex items-center justify-between">Proposals <ArrowRight className="h-4 w-4" /></span>
          <span className="mt-1 block text-xs font-normal text-gray-300">{label(counts.proposals, 'active', canViewProposals)}</span>
        </button>
        <button type="button" disabled={!canViewSalesOrders} onClick={onOpenSalesOrders}
          className="rounded-lg border border-white/20 bg-white/10 px-3 py-3 text-left text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-50">
          <span className="flex items-center justify-between">Sales Orders <ArrowRight className="h-4 w-4" /></span>
          <span className="mt-1 block text-xs font-normal text-gray-300">{label(counts.salesOrders, 'open', canViewSalesOrders)}</span>
        </button>
      </div>
      {loadError && <p role="status" className="text-xs text-amber-300">Some pipeline stage counts could not be loaded. Try refreshing.</p>}
      {expanded && canViewProspects && (
        <div id="pipeline-prospects" className="rounded-lg border border-gray-200 bg-white p-3 sm:p-4">
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
          {counts.prospects !== null && counts.prospects > prospects.length && (
            <p className="mt-2 text-xs text-gray-500">Showing the {prospects.length} most recent of {counts.prospects} prospects.</p>
          )}
        </div>
      )}
    </section>
  );
}
