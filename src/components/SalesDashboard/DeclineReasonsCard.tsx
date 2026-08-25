import { TrendingDown } from 'lucide-react';
import type { DeclineReason } from '../../lib/salesDashboardTypes';
import { REASON_LABELS } from '../../hooks/useSalesDashboard';

interface DeclineReasonsCardProps {
  reasons: DeclineReason[];
}

export function DeclineReasonsCard({ reasons }: DeclineReasonsCardProps) {
  if (reasons.length === 0) {
    return null;
  }

  const maxCount = Math.max(...reasons.map((r) => r.count), 1);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <TrendingDown className="w-5 h-5 text-red-500" />
        <h3 className="text-sm font-medium text-gray-700">Decline Reasons This Month</h3>
      </div>
      <div className="space-y-3">
        {reasons.slice(0, 5).map((r) => {
          const label = REASON_LABELS[r.reason] || r.reason;
          const barWidth = (r.count / maxCount) * 100;
          return (
            <div key={r.reason}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-700">{label}</span>
                <span className="text-sm font-semibold text-gray-900 tabular-nums">{r.count}</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-red-400 transition-all duration-500"
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                <span>Customer: {r.byCustomer}</span>
                <span>Rep: {r.byRep}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
