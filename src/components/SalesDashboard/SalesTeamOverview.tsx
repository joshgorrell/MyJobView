import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { SalesDashboardResult } from '../../lib/salesDashboardTypes';

interface Props {
  orgId: string;
  onSelectRep: (repId: string) => void;
}

const currency = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);

export function SalesTeamOverview({ orgId, onSelectRep }: Props) {
  const [reps, setReps] = useState<SalesDashboardResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { data: profiles, error: profileError } = await supabase.from('profiles')
          .select('id').eq('organization_id', orgId).eq('is_sales_rep', true).eq('is_active', true);
        if (profileError) throw profileError;
        const ids = (profiles ?? []).map(p => p.id);
        if (!ids.length) {
          if (!cancelled) setReps([]);
          return;
        }
        // The server RPC enforces manager authorization and same-organization membership.
        const { data, error: rpcError } = await supabase.rpc('get_sales_team_dashboard', { p_rep_ids: ids });
        if (rpcError) throw rpcError;
        if (data?.error) throw new Error(data.error);
        const results = (data?.reps ?? []) as SalesDashboardResult[];
        if (results.some(rep => !rep || (rep as any).error)) throw new Error('Unable to load one or more sales reps');
        if (!cancelled) setReps(results);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Unable to load team sales');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [orgId, refreshKey]);

  const totals = useMemo(() => reps.reduce((sum, rep) => ({
    booked: sum.booked + Number(rep.bookedSales?.total ?? 0),
    bookedCount: sum.bookedCount + Number(rep.bookedSales?.count ?? 0),
    pipeline: sum.pipeline + Number(rep.pipeline?.total ?? 0),
    pipelineCount: sum.pipelineCount + Number(rep.pipeline?.count ?? 0),
    won: sum.won + Number(rep.closeRate?.wonCount ?? 0),
    lost: sum.lost + Number(rep.closeRate?.lostCount ?? 0),
  }), { booked: 0, bookedCount: 0, pipeline: 0, pipelineCount: 0, won: 0, lost: 0 }), [reps]);
  const closeRate = totals.won + totals.lost ? Math.round(totals.won / (totals.won + totals.lost) * 1000) / 10 : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="text-lg font-semibold text-white">All sales reps</h2>
          <p className="text-xs text-gray-400">Company team totals from active sales reps. Individual quota periods may differ.</p></div>
        <button type="button" onClick={() => setRefreshKey(k => k + 1)} aria-label="Refresh team sales" className="rounded-lg border border-gray-600 p-2 text-gray-200 hover:bg-gray-700"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>
      {loading ? <p className="text-sm text-gray-300">Loading team sales…</p> : error ? <p role="alert" className="text-sm text-red-300">{error}</p> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {[
              ['Booked sales', currency(totals.booked)],
              ['Active pipeline', currency(totals.pipeline)],
              ['Booked jobs', totals.bookedCount.toLocaleString()],
              ['Close rate', `${closeRate}%`],
            ].map(([label, value]) => <div key={label} className="rounded-xl border border-gray-700 bg-gray-800 p-3"><p className="text-xs text-gray-400">{label}</p><p className="mt-1 text-lg font-semibold text-white tabular-nums">{value}</p></div>)}
          </div>
          <div className="rounded-xl border border-gray-700 bg-gray-800 p-3 sm:p-4">
            <h3 className="mb-3 text-sm font-semibold text-white">Salespeople ({reps.length})</h3>
            {reps.length === 0 ? <p className="text-sm text-gray-400">No active sales reps found.</p> :
              <div className="divide-y divide-gray-700">
                {reps.map(rep => <button type="button" key={rep.repId} onClick={() => onSelectRep(rep.repId)} className="flex w-full items-center justify-between gap-2 py-3 text-left hover:bg-gray-700/40">
                  <span className="flex min-w-0 items-center gap-2 text-sm text-white"><Users className="h-4 w-4 shrink-0 text-blue-400" /><span className="truncate">{rep.repDisplayName}</span></span>
                  <span className="shrink-0 text-sm font-medium tabular-nums text-white">{currency(Number(rep.bookedSales?.total ?? 0))}</span>
                </button>)}
              </div>}
          </div>
        </>
      )}
    </div>
  );
}
