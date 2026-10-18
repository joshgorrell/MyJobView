import type { LucideIcon } from 'lucide-react';
export type { FilterOption } from './ReviewFilterBar';
import { ReviewFilterBar } from './ReviewFilterBar';
export { ReviewFilterBar };

export interface StatItem {
  label: string;
  value: string | number;
  sublabel?: string;
  icon: LucideIcon;
  iconColor?: string;
  valueColor?: string;
}

export function ReviewStatCard({ stat }: { stat: StatItem }) {
  const Icon = stat.icon;
  const iconColor = stat.iconColor || 'text-gray-500';
  const valueColor = stat.valueColor || 'text-white';
  return (
    <div className="bg-gray-800 min-w-0 rounded-xl p-3 sm:p-5 border border-gray-700">
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-400 text-sm">{stat.label}</span>
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>
      <div className={`text-3xl font-bold ${valueColor}`}>{stat.value}</div>
      {stat.sublabel && <div className="text-xs text-gray-500 mt-1">{stat.sublabel}</div>}
    </div>
  );
}

export function ReviewStatsRow({ stats }: { stats: StatItem[] }) {
  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-4">
      {stats.map((stat, i) => (
        <ReviewStatCard key={i} stat={stat} />
      ))}
    </div>
  );
}
