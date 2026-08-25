import { FileText, ChevronRight, ArrowRight } from 'lucide-react';
import type { RecentProposal } from '../../lib/salesDashboardTypes';

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

const STATUS_COLORS: Record<string, string> = {
  sent: 'bg-blue-50 text-blue-700 border-blue-200',
  portal: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  approved: 'bg-green-50 text-green-700 border-green-200',
  approved_pending_action: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  declined: 'bg-red-50 text-red-700 border-red-200',
  expired: 'bg-amber-50 text-amber-700 border-amber-200',
  cancelled: 'bg-gray-50 text-gray-600 border-gray-200',
  designing: 'bg-purple-50 text-purple-700 border-purple-200',
  ready_to_submit: 'bg-cyan-50 text-cyan-700 border-cyan-200',
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface RecentProposalsCardProps {
  proposals: RecentProposal[];
  onNavigateToProposals?: () => void;
}

export function RecentProposalsCard({ proposals, onNavigateToProposals }: RecentProposalsCardProps) {
  if (proposals.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-5 h-5 text-blue-500" />
          <h3 className="text-sm font-medium text-gray-700">Recent Proposals</h3>
        </div>
        <p className="text-sm text-gray-400 py-4 text-center">No proposals yet this period.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-500" />
          <h3 className="text-sm font-medium text-gray-700">Recent Proposals</h3>
        </div>
        {onNavigateToProposals && (
          <button
            onClick={onNavigateToProposals}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-0.5"
          >
            View all <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="space-y-2">
        {proposals.map((p) => {
          const statusCls = STATUS_COLORS[p.status] || 'bg-gray-50 text-gray-600 border-gray-200';
          return (
            <div key={p.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition-colors">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${statusCls}`}>
                {p.status.replace(/_/g, ' ')}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{p.proposalNumber}</p>
                <p className="text-xs text-gray-400 truncate">{p.customerName}</p>
              </div>
              <span className="text-sm font-semibold text-gray-700 tabular-nums">{formatCurrency(p.total)}</span>
              <span className="text-xs text-gray-400 whitespace-nowrap">{formatDate(p.createdAt)}</span>
            </div>
          );
        })}
      </div>
      {onNavigateToProposals && (
        <button
          onClick={onNavigateToProposals}
          className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100 transition-colors"
        >
          Go to Proposals <ArrowRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
