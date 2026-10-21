import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type {
  SalesDashboardResult,
  LeaderboardResult,
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
  unknown:'Unknown / Feedback Needed',
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

        const { data: result, error: rpcError } = await supabase.rpc(rpcName, params);
        if (cancelled) return;
        if (rpcError) throw rpcError;
        if (!result || result.error) throw new Error(result?.error || 'No dashboard data returned');

        // Goals/trends retain the existing imported-sales RPC. Counts and record lists
        // are loaded together by useSalesDashboardRecords, so they cannot diverge.
        const { data: ranks } = await supabase.from('profiles').select('id,points_earned').gt('points_earned', 0).order('points_earned', { ascending: false });
        if (cancelled) return;
        const rank = (ranks || []).findIndex(r => r.id === repId) + 1;
        setData({ ...result, teamRank: rank > 0 ? { rank, total: ranks!.length } : null } as SalesDashboardResult);
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
