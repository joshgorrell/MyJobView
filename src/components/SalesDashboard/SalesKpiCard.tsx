import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { KpiCardData } from '../../lib/salesDashboardTypes';

interface SalesKpiCardProps {
  data: KpiCardData;
  accentColor?: string;
}

export function SalesKpiCard({ data, accentColor = 'blue' }: SalesKpiCardProps) {
  const colorMap: Record<string, { bg: string; text: string; border: string; iconBg: string }> = {
    blue: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', iconBg: 'bg-blue-100' },
    green: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', iconBg: 'bg-green-100' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', iconBg: 'bg-amber-100' },
    teal: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200', iconBg: 'bg-teal-100' },
  };

  const c = colorMap[accentColor] ?? colorMap.blue;

  const TrendIcon = data.trend === 'up' ? TrendingUp : data.trend === 'down' ? TrendingDown : Minus;
  const trendColor = data.trend === 'up' ? 'text-green-600' : data.trend === 'down' ? 'text-red-600' : 'text-gray-400';

  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} p-5 transition-shadow hover:shadow-md`}>
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-600 leading-tight">{data.title}</h3>
        {data.trendPct !== null && (
          <div className={`flex items-center gap-1 ${trendColor} text-xs font-semibold`}>
            <TrendIcon className="w-3.5 h-3.5" />
            {data.trendPct > 0 ? '+' : ''}{data.trendPct}%
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-gray-900 mb-1">{data.value}</p>
      <p className="text-xs text-gray-500">{data.supportingText}</p>
      {data.comparisonBadge && (
        <div className={`mt-3 inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${c.iconBg} ${c.text}`}>
          {data.comparisonBadge}
        </div>
      )}
    </div>
  );
}
