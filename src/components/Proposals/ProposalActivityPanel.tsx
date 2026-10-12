import { useState, useEffect, useCallback } from 'react';
import { ENGAGEMENT_ACTIONS, sectionLabel, summarizeEngagement } from '../../lib/proposalEngagement';
import { supabase } from '../../lib/supabase';
import {
  Eye, Download, CheckCircle, XCircle, Clock, Monitor, Smartphone,
  Tablet, Globe, Loader2, RefreshCw, Activity, BarChart2, Timer
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

interface ActivityRow {
  id: string;
  activity_type: string;
  user_agent: string | null;
  ip_address: string | null;
  duration_seconds: number | null;
  viewer_user_id?: string | null;
  portal_version_number?: number | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

interface Stats {
  totalViews: number;
  verifiedViewers: number;
  downloads: number;
  approvals: number;
  declines: number;
  totalEngagedSeconds: number;
  firstViewedAt: string | null;
  lastViewedAt: string | null;
  lastActivity: string | null;
}

const TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  viewed:     { label: 'Viewed', icon: <Eye className="w-3.5 h-3.5" />, color: 'text-blue-600 bg-blue-50' },
  downloaded: { label: 'Downloaded', icon: <Download className="w-3.5 h-3.5" />, color: 'text-teal-600 bg-teal-50' },
  accepted:   { label: 'Approved', icon: <CheckCircle className="w-3.5 h-3.5" />, color: 'text-green-600 bg-green-50' },
  declined:   { label: 'Declined', icon: <XCircle className="w-3.5 h-3.5" />, color: 'text-red-600 bg-red-50' },
};

function DeviceIcon({ deviceType }: { deviceType?: string }) {
  if (!deviceType) return null;
  if (deviceType === 'mobile') return <Smartphone className="w-3.5 h-3.5 text-gray-400" />;
  if (deviceType === 'tablet') return <Tablet className="w-3.5 h-3.5 text-gray-400" />;
  return <Monitor className="w-3.5 h-3.5 text-gray-400" />;
}

function ActivityBadge({ type }: { type: string }) {
  const cfg = TYPE_CONFIG[type] ?? { label: type, icon: <Activity className="w-3.5 h-3.5" />, color: 'text-gray-600 bg-gray-50' };
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>{cfg.icon}{cfg.label}</span>;
}

function formatDuration(seconds: number) {
  if (!seconds) return '—';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (minutes < 60) return remaining ? `${minutes}m ${remaining}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

interface ProposalActivityPanelProps {
  proposalId: string;
  compact?: boolean;
}

export function ProposalActivityPanel({ proposalId, compact = false }: ProposalActivityPanelProps) {
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [roomNames, setRoomNames] = useState<Record<string, string>>({});
  const engagement = summarizeEngagement(activities);
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [activityResult, roomResult] = await Promise.all([
        supabase.from('proposal_activity').select('*').eq('proposal_id', proposalId).order('created_at', { ascending: false }),
        supabase.from('proposal_rooms').select('id,name').eq('proposal_id', proposalId),
      ]);
      const { data, error } = activityResult;
      if (roomResult.error) throw roomResult.error;
      setRoomNames(Object.fromEntries((roomResult.data || []).map(room => [room.id, room.name])));

      if (error) throw error;
      const rows: ActivityRow[] = data ?? [];
      setActivities(rows);

      const views = rows.filter(r => r.activity_type === 'viewed');
      const chronologicalViews = [...views].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const summary = summarizeEngagement(rows);
      setStats({
        totalViews: views.length,
        verifiedViewers: summary.verifiedViewers,
        downloads: rows.filter(r => r.activity_type === 'downloaded').length,
        approvals: rows.filter(r => r.activity_type === 'accepted').length,
        declines: rows.filter(r => r.activity_type === 'declined').length,
        totalEngagedSeconds: summary.activeSeconds,
        firstViewedAt: chronologicalViews[0]?.created_at ?? null,
        lastViewedAt: views[0]?.created_at ?? null,
        lastActivity: rows[0]?.created_at ?? null,
      });
    } catch (error) {
      console.error('Failed to load proposal activity', error);
      setActivities([]); setStats(null);
      setLoadError('Customer activity could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [proposalId]);

  useEffect(() => { load(); }, [load]);

  const filtered = typeFilter === 'all' ? activities : activities.filter(a => a.activity_type === typeFilter);

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 text-gray-400 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      {stats && !compact && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard icon={<Eye className="w-4 h-4 text-blue-500" />} label="Views" value={stats.totalViews} sub={`${stats.verifiedViewers} verified customer${stats.verifiedViewers !== 1 ? 's' : ''}`} />
            <StatCard icon={<Timer className="w-4 h-4 text-violet-500" />} label="Active Viewing" value={formatDuration(stats.totalEngagedSeconds)} sub={engagement.trackedVisits ? 'Approximate; pauses when idle' : 'No visits with active timing yet'} />
            <StatCard icon={<Download className="w-4 h-4 text-teal-500" />} label="Downloads" value={stats.downloads} />
            <StatCard icon={<CheckCircle className="w-4 h-4 text-green-500" />} label="Approvals" value={stats.approvals} />
          </div>
          {(stats.firstViewedAt || stats.lastViewedAt) && (
            <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs text-blue-800">
              {stats.firstViewedAt && <span><strong>First viewed:</strong> {format(new Date(stats.firstViewedAt), 'MMM d, yyyy h:mm a')}</span>}
              {stats.lastViewedAt && <span><strong>Last viewed:</strong> {formatDistanceToNow(new Date(stats.lastViewedAt), { addSuffix: true })}</span>}
              {stats.lastActivity && <span><strong>Last activity:</strong> {formatDistanceToNow(new Date(stats.lastActivity), { addSuffix: true })}</span>}
            </div>
          )}
        </>
      )}

      {loadError && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{loadError}</div>}
      {stats && !compact && stats.totalViews > 0 && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900">Activity</h3>
          <p className="text-sm text-gray-700">
            Opened {stats.totalViews} time{stats.totalViews === 1 ? '' : 's'}.
            {engagement.activeSeconds > 0 && ` Approximately ${formatDuration(engagement.activeSeconds)} of active viewing.`}
            {Object.keys(engagement.sections).some(key => engagement.sections[key] > 0) && ` Most active viewing in ${sectionLabel(Object.entries(engagement.sections).sort((a, b) => b[1] - a[1])[0][0], roomNames)}.`}
          </p>
          {Object.entries(engagement.sections).filter(([, seconds]) => seconds > 0).length > 0 && (
            <div className="space-y-2" aria-label="Section engagement">
              {Object.entries(engagement.sections).filter(([, seconds]) => seconds > 0).sort((a, b) => b[1] - a[1]).map(([key, seconds]) => (
                <div key={key}>
                  <div className="mb-1 flex justify-between gap-3 text-xs text-gray-600"><span className="min-w-0 break-words">{sectionLabel(key, roomNames)}</span><span className="flex-shrink-0">{formatDuration(seconds)}</span></div>
                  <div className="h-1.5 rounded-full bg-gray-100"><div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.min(100, seconds / Math.max(1, engagement.activeSeconds) * 100)}%` }} /></div>
                </div>
              ))}
            </div>
          )}
          {Object.entries(engagement.clicks).length > 0 && <div className="flex flex-wrap gap-2">{Object.entries(engagement.clicks).map(([key, count]) => <span key={key} className="rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-800">{ENGAGEMENT_ACTIONS[key as keyof typeof ENGAGEMENT_ACTIONS]} · {count}</span>)}</div>}
          <p className="text-xs text-gray-500">Visits are separate sessions, not unique people. Clicks show interest, not completed approvals or payments. Viewing time does not prove content was read.</p>
          {engagement.legacySeconds > 0 && <p className="text-xs text-gray-500">Older records contain {formatDuration(engagement.legacySeconds)} of foreground time, excluded from active viewing.</p>}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex flex-wrap items-center gap-1">
          {['all', 'viewed', 'downloaded', 'accepted', 'declined'].map(f => (
            <button key={f} onClick={() => setTypeFilter(f)} className={`px-2.5 py-1 text-xs rounded-lg capitalize transition-colors ${typeFilter === f ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {f === 'all' ? 'All' : TYPE_CONFIG[f]?.label ?? f}
            </button>
          ))}
        </div>
        <button onClick={load} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg transition-colors" title="Refresh"><RefreshCw className="w-3.5 h-3.5" /></button>
      </div>

      {!loadError && (filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <BarChart2 className="w-8 h-8 text-gray-300 mb-2" />
          <p className="text-sm text-gray-400">No customer activity recorded yet.</p>
          <p className="text-xs text-gray-400 mt-1">Activity appears once the customer opens the live proposal.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map(row => {
            const meta = row.metadata ?? {};
            const deviceType = meta.deviceType as string | undefined;
            const browser = meta.browser as string | undefined;
            const os = meta.os as string | undefined;
            const date = new Date(row.created_at);
            return (
              <div key={row.id} className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                <div className="flex-shrink-0 mt-0.5"><ActivityBadge type={row.activity_type} /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
                    {row.portal_version_number != null && <span className="rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-700">v{row.portal_version_number}</span>}
                    {row.viewer_user_id && <span className="font-medium text-blue-700">Verified customer</span>}
                    <DeviceIcon deviceType={deviceType} />
                    {browser && <span>{browser}</span>}
                    {os && <span className="text-gray-400">· {os}</span>}
                    {row.ip_address && row.ip_address !== 'Unknown' && <span className="flex items-center gap-0.5 text-gray-400"><Globe className="w-3 h-3" />{row.ip_address}</span>}
                    {row.duration_seconds != null && row.duration_seconds > 0 && <span title={meta.engagement?.trackingVersion === 1 ? 'Approximate active viewing' : 'Legacy foreground time'} className="flex items-center gap-0.5 text-gray-400"><Clock className="w-3 h-3" />{formatDuration(row.duration_seconds)}</span>}
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
      ))}
    </div>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number | string; sub?: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3 flex items-center gap-3">
      <div className="flex-shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-xl font-bold text-gray-800 truncate">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
    </div>
  );
}
