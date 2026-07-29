import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { SalesDashboardResult, LeaderboardResult } from '../lib/salesDashboardTypes';

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
        const params = isManagerView
          ? { p_target_rep_id: repId }
          : {};

        const { data: result, error: rpcError } = await supabase.rpc(rpcName, params);

        if (cancelled) return;

        if (rpcError) {
          setError(rpcError.message);
          setData(null);
        } else if (result && !result.error) {
          setData(result as SalesDashboardResult);
        } else if (result?.error) {
          setError(result.error);
          setData(null);
        } else {
          setData(result as SalesDashboardResult);
        }
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
