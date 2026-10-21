import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

interface CompetitionEntry {
  rank: number;
  repDisplayName: string;
  monthlyTotal: number;
  isCurrentUser: boolean;
}
interface CompetitionResult {
  month: string;
  leaderboard: CompetitionEntry[];
}

export function MonthlySalesCompetition() {
  const [data, setData] = useState<CompetitionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    supabase.rpc('get_current_month_sales_competition').then(({ data: result, error: failure }) => {
      if (!active) return;
      if (failure) setError('Monthly sales competition is unavailable.');
      else setData(result as unknown as CompetitionResult);
    });
    return () => { active = false; };
  }, []);

  return (
    <section className="rounded-xl border border-gray-700 bg-gray-800 p-4" aria-label="Monthly sales competition">
      <div className="mb-3">
        <h3 className="font-semibold text-white text-sm">Monthly Sales Competition</h3>
        <p className="text-xs text-gray-400">Current month · billed sales and booked projects · before tax</p>
      </div>
      {error && <p className="text-xs text-gray-400">{error}</p>}
      {!data && !error && <p className="text-xs text-gray-400">Loading standings…</p>}
      {data && (
        <div className="space-y-2">
          {data.leaderboard.length === 0 && <p className="text-xs text-gray-400">No sales reps found.</p>}
          {data.leaderboard.map((entry, index) => (
            <div key={index} className={`flex items-center gap-3 rounded-lg px-3 py-2 ${entry.isCurrentUser ? 'bg-blue-900/40 border border-blue-600' : 'bg-gray-900/60'}`}>
              <span className="w-7 text-sm font-bold text-gray-300">#{entry.rank}</span>
              <span className="flex-1 min-w-0 truncate text-sm text-white">{entry.repDisplayName}</span>
              <span className="text-sm font-semibold text-white tabular-nums">
                {Number(entry.monthlyTotal || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
