import { Activity, Phone, Plus, FileText, ChevronRight } from 'lucide-react';
import type { RecentActivityItem } from '../../lib/salesDashboardTypes';

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getActivityIcon(type: string): typeof Activity {
  switch (type) {
    case 'connection': return Phone;
    case 'lead_created': return Plus;
    case 'proposal_created': return FileText;
    default: return Activity;
  }
}

function getActivityColor(type: string): string {
  switch (type) {
    case 'connection': return 'text-teal-600 bg-teal-50';
    case 'lead_created': return 'text-orange-600 bg-orange-50';
    case 'proposal_created': return 'text-blue-600 bg-blue-50';
    default: return 'text-gray-600 bg-gray-50';
  }
}

interface RecentActivityCardProps {
  activities: RecentActivityItem[];
  onNavigateToActivity?: () => void;
}

export function RecentActivityCard({ activities, onNavigateToActivity }: RecentActivityCardProps) {
  if (activities.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-5 h-5 text-gray-400" />
          <h3 className="text-sm font-medium text-gray-700">Recent Activity</h3>
        </div>
        <p className="text-sm text-gray-400 py-4 text-center">No recent activity.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-500" />
          <h3 className="text-sm font-medium text-gray-700">Recent Activity</h3>
        </div>
        {onNavigateToActivity && (
          <button
            onClick={onNavigateToActivity}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-0.5"
          >
            View all <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="space-y-2">
        {activities.map((a) => {
          const Icon = getActivityIcon(a.type);
          const colorCls = getActivityColor(a.type);
          return (
            <div key={a.id} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition-colors">
              <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg ${colorCls} flex-shrink-0`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 capitalize">{a.title}</p>
                <p className="text-xs text-gray-400 truncate">{a.description}</p>
              </div>
              <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">
                {formatRelativeTime(a.createdAt)}
              </span>
            </div>
          );
        })}
      </div>
      {onNavigateToActivity && (
        <button
          onClick={onNavigateToActivity}
          className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-gray-50 text-gray-700 text-sm font-medium hover:bg-gray-100 transition-colors"
        >
          Go to Activity <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
