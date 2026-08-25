import { AlertTriangle, ChevronRight } from 'lucide-react';
import type { StaleLead } from '../../lib/salesDashboardTypes';

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

interface StaleLeadsCardProps {
  leads: StaleLead[];
  onNavigateToPipeline?: () => void;
}

export function StaleLeadsCard({ leads, onNavigateToPipeline }: StaleLeadsCardProps) {
  if (leads.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          <h3 className="text-sm font-medium text-gray-700">Stale Leads</h3>
        </div>
        <p className="text-sm text-gray-400 py-4 text-center">All leads are up to date.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          <h3 className="text-sm font-medium text-gray-700">Stale Leads</h3>
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
        {leads.map((lead) => (
          <div key={lead.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition-colors">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">
                {lead.contactName || lead.companyName || 'Unknown'}
              </p>
              <p className="text-xs text-gray-400 truncate">{lead.companyName}</p>
            </div>
            <div className="text-right">
              <span className="text-sm font-semibold text-gray-700 tabular-nums block">
                {formatCurrency(lead.estimatedValue)}
              </span>
              <span className="text-xs text-amber-600 font-medium">
                {lead.daysSinceContact >= 999 ? 'Never contacted' : `${lead.daysSinceContact}d ago`}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
