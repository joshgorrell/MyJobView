import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Eye, Download, CheckCircle, XCircle, Clock, Monitor, Smartphone,
  Tablet, Globe, Loader2, RefreshCw, Activity, BarChart2
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

interface ActivityRow {
  id: string;
  activity_type: string;
  user_agent: string | null;
  ip_address: string | null;
  duration_seconds: number | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

interface Stats {
  totalViews: number;
  uniqueIPs: number;
  downloads: number;
  approvals: number;
  declines: number;
  lastActivity: string | null;
}

const TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  viewed:     { label: 'Viewed',    icon: <Eye className="w-3.5 h-3.5" />,         color: 'text-blue-600 bg-blue-50' },
  downloaded: { label: 'Downloaded', icon: <Download className="w-3.5 h-3.5" />,   color: 'text-teal-600 bg-teal-50' },
  accepted:   { label: 'Approved',  icon: <CheckCircle className="w-3.5 h-3.5" />, color: 'text-green-600 bg-green-50' },
  declined:   { label: 'Declined',  icon: <XCircle className="w-3.5 h-3.5" />,     color: 'text-red-600 bg-red-50' },
};

function DeviceIcon({ deviceType }: { deviceType?: string }) {
  if (deviceType === 'mobile') return <Smartphone className="w-3.5 h-3.5 text-gray-400" />;
  if (deviceType === 'tablet') return <Tablet className="w-3.5 h-3.5 text-gray-400" />;
  return <Monitor className="w-3.5 h-3.5 text-gray-400" />;
}

function ActivityBadge({ type }: { type: string }) {
  const cfg = TYPE_CONFIG[type] ?? { label: type, icon: <Activity className="w-3.5 h-3.5" />, color: 'text-gray-600 bg-gray-50' };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

interface ProposalActivityPanelProps {
  proposalId: string;
  compact?: boolean;
}

export function ProposalActivityPanel({ proposalId, compact = false }: ProposalActivityPanelProps) {
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('proposal_activity')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const rows: ActivityRow[] = data ?? [];
      setActivities(rows);

      const views = rows.filter(r => r.activity_type === 'viewed');
      const ips = new Set(rows.map(r => r.ip_address).filter(Boolean));
      setStats({
        totalViews: views.length,
        uniqueIPs: ips.size,
        downloads: rows.filter(r => r.activity_type === 'downloaded').length,
        approvals: rows.filter(r => r.activity_type === 'accepted').length,
        declines: rows.filter(r => r.activity_type === 'declined').length,
        lastActivity: rows[0]?.created_at ?? null,
      });
    } finally {
      setLoading(false);
    }
  }, [proposalId]);

  useEffect(() => { load(); }, [load]);

  const filtered = typeFilter === 'all' ? activities : activities.filter(a => a.activity_type === typeFilter);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats summary */}
      {stats && !compact && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon={<Eye className="w-4 h-4 text-blue-500" />} label="Views" value={stats.totalViews} sub={`${stats.uniqueIPs} unique IP${stats.uniqueIPs !== 1 ? 's' : ''}`} />
          <StatCard icon={<Download className="w-4 h-4 text-teal-500" />} label="Downloads" value={stats.downloads} />
          <StatCard icon={<CheckCircle className="w-4 h-4 text-green-500" />} label="Approvals" value={stats.approvals} />
          <StatCard icon={<XCircle className="w-4 h-4 text-red-500" />} label="Declines" value={stats.declines} />
        </div>
      )}

      {/* Filter + refresh */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          {['all', 'viewed', 'downloaded', 'accepted', 'declined'].map(f => (
            <button
              key={f}
              onClick={() => setTypeFilter(f)}
              className={`px-2.5 py-1 text-xs rounded-lg capitalize transition-colors ${
                typeFilter === f ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f === 'all' ? 'All' : TYPE_CONFIG[f]?.label ?? f}
            </button>
          ))}
        </div>
        <button onClick={load} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg transition-colors" title="Refresh">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Timeline */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <BarChart2 className="w-8 h-8 text-gray-300 mb-2" />
          <p className="text-sm text-gray-400">No activity recorded yet.</p>
          <p className="text-xs text-gray-400 mt-1">Activity appears once the customer opens the proposal link.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map((row) => {
            const meta = row.metadata ?? {};
            const deviceType = meta.deviceType as string | undefined;
            const browser = meta.browser as string | undefined;
            const os = meta.os as string | undefined;
            const date = new Date(row.created_at);

            return (
              <div key={row.id} className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                <div className="flex-shrink-0 mt-0.5">
                  <ActivityBadge type={row.activity_type} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
                    <DeviceIcon deviceType={deviceType} />
                    {browser && <span>{browser}</span>}
                    {os && <span className="text-gray-400">· {os}</span>}
                    {row.ip_address && row.ip_address !== 'Unknown' && (
                      <span className="flex items-center gap-0.5 text-gray-400">
                        <Globe className="w-3 h-3" />
                        {row.ip_address}
                      </span>
                    )}
                    {row.duration_seconds != null && row.duration_seconds > 0 && (
                      <span className="flex items-center gap-0.5 text-gray-400">
                        <Clock className="w-3 h-3" />
                        {row.duration_seconds}s
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="text-xs font-medium text-gray-700">{format(date, 'MMM d, yyyy')}</p>
                  <p className="text-xs text-gray-400">{format(date, 'h:mm a')}</p>
                  <p className="text-xs text-gray-300 mt-0.5">{formatDistanceToNow(date, { addSuffix: true })}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number; sub?: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3 flex items-center gap-3">
      <div className="flex-shrink-0">{icon}</div>
      <div>
        <p className="text-xl font-bold text-gray-800">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
    </div>
  );
}
