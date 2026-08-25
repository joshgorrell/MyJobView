import { Flame, ChevronRight } from 'lucide-react';
import type { HotLead } from '../../lib/salesDashboardTypes';

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-50 text-red-700 border-red-200',
  high: 'bg-orange-50 text-orange-700 border-orange-200',
  medium: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  low: 'bg-gray-50 text-gray-600 border-gray-200',
};

interface HotLeadsCardProps {
  leads: HotLead[];
  onNavigateToPipeline?: () => void;
}

export function HotLeadsCard({ leads, onNavigateToPipeline }: HotLeadsCardProps) {
  if (leads.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Flame className="w-5 h-5 text-orange-500" />
          <h3 className="text-sm font-medium text-gray-700">Hot Leads</h3>
        </div>
        <p className="text-sm text-gray-400 py-4 text-center">No high-priority leads right now.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Flame className="w-5 h-5 text-orange-500" />
          <h3 className="text-sm font-medium text-gray-700">Hot Leads</h3>
        </div>
        {onNavigateToPipeline && (
          <button
            onClick={onNavigateToPipeline}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-0.5"
          >
            View all <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="space-y-2">
        {leads.map((lead) => {
          const priorityCls = PRIORITY_COLORS[lead.priority] || PRIORITY_COLORS.low;
          return (
            <div key={lead.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition-colors">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${priorityCls}`}>
                {lead.priority}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">
                  {lead.contactName || lead.companyName || 'Unknown'}
                </p>
                <p className="text-xs text-gray-400 truncate">{lead.companyName}</p>
              </div>
              <span className="text-sm font-semibold text-gray-700 tabular-nums">
                {formatCurrency(lead.estimatedValue)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
