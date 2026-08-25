import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type {
  SalesDashboardResult,
  LeaderboardResult,
  HotLead,
  StaleLead,
  DeclineReason,
  RecentProposal,
  RecentActivityItem,
  PeriodStats,
} from '../lib/salesDashboardTypes';

const REASON_LABELS: Record<string, string> = {
  price_too_high: 'Price Too High',
  went_with_competitor: 'Went with Competitor',
  project_cancelled: 'Project Cancelled',
  no_response: 'No Response',
  timing: 'Not the Right Time',
  budget_cut: 'Budget Cut',
  scope_change: 'Scope Changed',
  changed_mind: 'Changed Mind',
  dont_want_rep: 'Rep Relationship',
  dont_want_company: 'Company Relationship',
  duplicate: 'Duplicate',
  customer_request: 'Customer Request',
  error: 'Created in Error',
  replaced_by_revision: 'Replaced by Revision',
  other: 'Other',
};

interface UseSalesDashboardOptions {
  repId: string | null;
  isManagerView: boolean;
}

interface UseSalesDashboardReturn {
  data: SalesDashboardResult | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useSalesDashboard({ repId, isManagerView }: UseSalesDashboardOptions): UseSalesDashboardReturn {
  const [data, setData] = useState<SalesDashboardResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!repId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const rpcName = isManagerView ? 'get_sales_rep_dashboard' : 'get_my_sales_dashboard';
        const params = isManagerView ? { p_target_rep_id: repId } : {};

        const safe = (q: any) => Promise.resolve(q).catch(() => ({ data: null, count: null, error: null }));

        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const [
          rpcResult,
          hotLeadsResult,
          staleLeadsResult,
          declinedProposalsResult,
          expiredCountResult,
          allRepsResult,
          recentProposalsResult,
          recentConnectionsResult,
          recentLeadsResult,
          contactsCountResult,
          connectionsCountResult,
          proposalsCountResult,
        ] = await Promise.all([
          supabase.rpc(rpcName, params),

          safe(supabase
            .from('leads')
            .select('id, company_name, contact_name, estimated_value, priority, status')
            .eq('assigned_to', repId)
            .in('status', ['new', 'contacted', 'qualified', 'proposal', 'negotiation'])
            .or('priority.eq.critical,priority.eq.high')
            .order('estimated_value', { ascending: false })
            .limit(5)),

          safe(supabase
            .from('leads')
            .select('id, company_name, contact_name, estimated_value, priority, status, last_contact_date, created_at')
            .eq('assigned_to', repId)
            .in('status', ['new', 'contacted', 'qualified', 'proposal', 'negotiation'])
            .lt('last_contact_date', sevenDaysAgo.toISOString())
            .order('last_contact_date', { ascending: true, nullsFirst: true })
            .limit(5)),

          safe(supabase
            .from('proposals')
            .select('id, status, decline_reason, declined_by')
            .eq('created_by', repId)
            .in('status', ['declined', 'cancelled'])
            .gte('created_at', startOfMonth)
            .lte('created_at', endOfMonth)),

          safe(supabase
            .from('proposals')
            .select('id', { count: 'exact', head: true })
            .eq('created_by', repId)
            .eq('status', 'expired')
            .gte('created_at', startOfMonth)
            .lte('created_at', endOfMonth)),

          safe(supabase
            .from('profiles')
            .select('id, points_earned')
            .gt('points_earned', 0)
            .order('points_earned', { ascending: false })),

          safe(supabase
            .from('proposals')
            .select('id, proposal_number, status, total, created_at, contact:contacts!proposals_contact_id_fkey(full_name, company_name)')
            .eq('created_by', repId)
            .order('created_at', { ascending: false })
            .limit(5)),

          safe(supabase
            .from('connections')
            .select('id, connection_type, connection_date, notes, contact:contacts!connections_contact_id_fkey(full_name, company_name)')
            .eq('user_id', repId)
            .order('connection_date', { ascending: false })
            .limit(5)),

          safe(supabase
            .from('leads')
            .select('id, company_name, contact_name, estimated_value, created_at')
            .or(`created_by.eq.${repId},assigned_to.eq.${repId}`)
            .order('created_at', { ascending: false })
            .limit(5)),

          safe(supabase
            .from('contacts')
            .select('id', { count: 'exact', head: true })
            .eq('created_by', repId)
            .gte('created_at', startOfMonth)
            .lte('created_at', endOfMonth)),

          safe(supabase
            .from('connections')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', repId)
            .gte('created_at', startOfMonth)
            .lte('created_at', endOfMonth)),

          safe(supabase
            .from('proposals')
            .select('id', { count: 'exact', head: true })
            .eq('created_by', repId)
            .gte('created_at', startOfMonth)
            .lte('created_at', endOfMonth)),
        ]);

        if (cancelled) return;

        const rpcError = rpcResult.error;
        const rpcData = rpcResult.data;

        if (rpcError) {
          setError(rpcError.message);
          setData(null);
          return;
        }

        const base = (rpcData && !rpcData.error ? rpcData : null) as SalesDashboardResult | null;
        if (!base) {
          setError('No dashboard data returned');
          setData(null);
          return;
        }

        // Process hot leads
        const hotLeads: HotLead[] = (hotLeadsResult.data || []).map((l: any) => ({
          id: l.id,
          companyName: l.company_name || '',
          contactName: l.contact_name || '',
          estimatedValue: parseFloat(l.estimated_value || '0'),
          priority: l.priority || '',
          status: l.status || '',
        }));

        // Process stale leads
        const staleLeads: StaleLead[] = (staleLeadsResult.data || []).map((l: any) => {
          const lastContact = l.last_contact_date || l.created_at;
          const daysSince = lastContact
            ? Math.floor((Date.now() - new Date(lastContact).getTime()) / (1000 * 60 * 60 * 24))
            : 999;
          return {
            id: l.id,
            companyName: l.company_name || '',
            contactName: l.contact_name || '',
            estimatedValue: parseFloat(l.estimated_value || '0'),
            priority: l.priority || '',
            lastContactDate: l.last_contact_date,
            daysSinceContact: daysSince,
          };
        });

        // Process decline reasons
        const declinedProposals = declinedProposalsResult.data || [];
        const reasonMap = new Map<string, DeclineReason>();
        declinedProposals.forEach((p: any) => {
          const r = p.decline_reason || 'other';
          if (!reasonMap.has(r)) {
            reasonMap.set(r, { reason: r, count: 0, byCustomer: 0, byRep: 0 });
          }
          const entry = reasonMap.get(r)!;
          entry.count++;
          if (p.declined_by === 'customer') entry.byCustomer++;
          else entry.byRep++;
        });
        const declineReasons = Array.from(reasonMap.values()).sort((a, b) => b.count - a.count);

        // Team rank
        const allReps = allRepsResult.data || [];
        const myRank = allReps.findIndex((r: any) => r.id === repId) + 1;
        const teamRank = myRank > 0 ? { rank: myRank, total: allReps.length } : null;

        // Recent proposals
        const recentProposals: RecentProposal[] = (recentProposalsResult.data || []).map((p: any) => ({
          id: p.id,
          proposalNumber: p.proposal_number || '',
          status: p.status || '',
          total: parseFloat(p.total || '0'),
          customerName: p.contact?.full_name || p.contact?.company_name || 'Unknown',
          createdAt: p.created_at,
        }));

        // Recent activity feed
        const activities: RecentActivityItem[] = [];
        (recentConnectionsResult.data || []).forEach((c: any) => {
          activities.push({
            id: `conn-${c.id}`,
            type: 'connection',
            createdAt: c.connection_date,
            title: `${(c.connection_type || 'connection').replace('_', ' ')}`,
            description: c.contact?.full_name || c.contact?.company_name || 'Contact',
          });
        });
        (recentLeadsResult.data || []).forEach((l: any) => {
          activities.push({
            id: `lead-${l.id}`,
            type: 'lead_created',
            createdAt: l.created_at,
            title: 'Created lead',
            description: `${l.contact_name || l.company_name}`,
          });
        });
        (recentProposalsResult.data || []).forEach((p: any) => {
          activities.push({
            id: `prop-${p.id}`,
            type: 'proposal_created',
            createdAt: p.created_at,
            title: `Proposal ${p.proposal_number}`,
            description: p.contact?.full_name || p.contact?.company_name || 'Customer',
          });
        });
        activities.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const recentActivity = activities.slice(0, 8);

        // Period stats
        const declinedCount = declinedProposals.length;
        const periodStats: PeriodStats = {
          contactsAdded: contactsCountResult.count || 0,
          connectionsLogged: connectionsCountResult.count || 0,
          proposalsCreated: proposalsCountResult.count || 0,
          proposalsExpired: expiredCountResult.count || 0,
          proposalsDeclined: declinedCount,
        };

        const enriched: SalesDashboardResult = {
          ...base,
          hotLeads,
          staleLeads,
          declineReasons,
          expiredProposalsCount: expiredCountResult.count || 0,
          teamRank,
          recentProposals,
          recentActivity,
          periodStats,
        };

        setData(enriched);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load dashboard');
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [repId, isManagerView, refreshKey]);

  return { data, loading, error, refresh };
}

export function useSalesLeaderboard(): {
  data: LeaderboardResult | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const [data, setData] = useState<LeaderboardResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const { data: result, error: rpcError } = await supabase.rpc('get_sales_goal_leaderboard');

        if (cancelled) return;

        if (rpcError) {
          setError(rpcError.message);
          setData(null);
        } else if (result && !result.error) {
          setData(result as LeaderboardResult);
        } else if (result?.error) {
          setError(result.error);
          setData(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load leaderboard');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return { data, loading, error, refresh };
}

export { REASON_LABELS };
