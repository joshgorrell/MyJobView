import { AlertCircle, AlertTriangle, Info, ChevronRight } from 'lucide-react';
import type { AttentionItem } from '../../lib/salesDashboardTypes';

interface SalesAttentionListProps {
  items: AttentionItem[];
  onNavigate: (tab: string) => void;
}

export function SalesAttentionList({ items, onNavigate }: SalesAttentionListProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Needs Attention</h3>
        <p className="text-sm text-gray-400 py-4 text-center">No items need attention right now.</p>
      </div>
    );
  }

  const iconMap = {
    critical: { Icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-50', border: 'border-red-200' },
    warning: { Icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50', border: 'border-amber-200' },
    info: { Icon: Info, color: 'text-blue-500', bg: 'bg-blue-50', border: 'border-blue-200' },
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-medium text-gray-700 mb-3">Needs Attention</h3>
      <div className="space-y-2">
        {items.map((item, i) => {
          const { Icon, color, bg, border } = iconMap[item.severity];
          return (
            <button
              key={i}
              onClick={() => onNavigate(item.actionTab)}
              className={`w-full flex items-start gap-3 p-3 rounded-lg ${bg} border ${border} hover:shadow-sm transition-shadow text-left`}
            >
              <Icon className={`w-5 h-5 ${color} flex-shrink-0 mt-0.5`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">{item.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
              </div>
              <div className="flex items-center gap-1 text-xs font-medium text-gray-400 flex-shrink-0 mt-0.5">
                {item.actionLabel}
                <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
