import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Plus, MapPin, Pencil, Users, Car, FileText, Clock, Trash2, ClipboardList } from 'lucide-react';
import LogProjectActivityModal from './LogProjectActivityModal';

interface ProjectActivityLogProps {
  projectId: string;
  projectName: string;
  canLog: boolean;
}

interface ActivityEntry {
  id: string;
  activity_type: string;
  duration_minutes: number;
  notes: string;
  logged_at: string;
  created_at: string;
  logged_by: string;
  profiles: { full_name: string } | null;
}

const ACTIVITY_META: Record<string, { label: string; icon: React.ReactNode; badgeClass: string }> = {
  site_survey: {
    label: 'Site Survey',
    icon: <MapPin size={14} />,
    badgeClass: 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30',
  },
  planning_design: {
    label: 'Planning / Design',
    icon: <Pencil size={14} />,
    badgeClass: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  },
  client_meeting: {
    label: 'Client Meeting',
    icon: <Users size={14} />,
    badgeClass: 'bg-green-500/15 text-green-400 border border-green-500/30',
  },
  travel: {
    label: 'Travel',
    icon: <Car size={14} />,
    badgeClass: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  },
  other: {
    label: 'Other',
    icon: <FileText size={14} />,
    badgeClass: 'bg-gray-500/15 text-gray-400 border border-gray-500/30',
  },
};

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 10) / 10;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function isWithin24Hours(createdAt: string): boolean {
  const created = new Date(createdAt).getTime();
  return Date.now() - created < 24 * 60 * 60 * 1000;
}

export default function ProjectActivityLog({ projectId, projectName, canLog }: ProjectActivityLogProps) {
  const { profile } = useAuth();
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isAdmin = profile?.role === 'admin' || profile?.role === 'manager';

  const loadEntries = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('project_activity_logs')
        .select('*, profiles(full_name)')
        .eq('project_id', projectId)
        .order('logged_at', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEntries(data || []);
    } catch (err) {
      console.error('Error loading activity logs:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  async function handleDelete(id: string) {
    if (!confirm('Delete this activity log entry?')) return;
    setDeletingId(id);
    try {
      const { error } = await supabase.from('project_activity_logs').delete().eq('id', id);
      if (error) throw error;
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      console.error('Error deleting entry:', err);
    } finally {
      setDeletingId(null);
    }
  }

  function canDelete(entry: ActivityEntry): boolean {
    if (isAdmin) return true;
    if (entry.logged_by === profile?.id && isWithin24Hours(entry.created_at)) return true;
    return false;
  }

  // Summary calculations
  const totalMinutes = entries.reduce((sum, e) => sum + e.duration_minutes, 0);
  const byType = entries.reduce<Record<string, number>>((acc, e) => {
    acc[e.activity_type] = (acc[e.activity_type] || 0) + e.duration_minutes;
    return acc;
  }, {});

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header row */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-semibold text-white">Activity Log</h2>
            {totalMinutes > 0 && (
              <p className="text-sm text-gray-400 mt-0.5">
                {minutesToHours(totalMinutes)}h total across {entries.length} entr{entries.length === 1 ? 'y' : 'ies'}
              </p>
            )}
          </div>
          {canLog && (
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors"
            >
              <Plus size={16} />
              Log Activity
            </button>
          )}
        </div>

        {/* Summary pills */}
        {totalMinutes > 0 && (
          <div className="flex flex-wrap gap-2 mb-5">
            {Object.entries(byType).map(([type, mins]) => {
              const meta = ACTIVITY_META[type];
              if (!meta) return null;
              return (
                <span
                  key={type}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${meta.badgeClass}`}
                >
                  {meta.icon}
                  {meta.label}: {minutesToHours(mins)}h
                </span>
              );
            })}
          </div>
        )}

        {/* Entries list */}
        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading...</div>
        ) : entries.length === 0 ? (
          <div className="text-center py-16">
            <ClipboardList size={40} className="text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400 font-medium">No activity logged yet</p>
            {canLog && (
              <p className="text-gray-500 text-sm mt-1">
                Log site surveys, meetings, and other project time using the button above.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => {
              const meta = ACTIVITY_META[entry.activity_type] || ACTIVITY_META.other;
              return (
                <div
                  key={entry.id}
                  className="bg-gray-800 border border-gray-700 rounded-xl p-4 hover:border-gray-600 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Top row: badge + duration + date */}
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${meta.badgeClass}`}>
                          {meta.icon}
                          {meta.label}
                        </span>
                        <span className="flex items-center gap-1 text-sm font-semibold text-white">
                          <Clock size={14} className="text-gray-400" />
                          {formatDuration(entry.duration_minutes)}
                        </span>
                        <span className="text-xs text-gray-500">{formatDate(entry.logged_at)}</span>
                      </div>

                      {/* Notes */}
                      <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">
                        {entry.notes}
                      </p>

                      {/* Footer: logged by */}
                      <p className="text-xs text-gray-500 mt-2">
                        Logged by {entry.profiles?.full_name || 'Unknown'}
                      </p>
                    </div>

                    {/* Delete button */}
                    {canDelete(entry) && (
                      <button
                        onClick={() => handleDelete(entry.id)}
                        disabled={deletingId === entry.id}
                        className="p-2 text-gray-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors shrink-0 disabled:opacity-50"
                        title="Delete entry"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showModal && (
        <LogProjectActivityModal
          projectId={projectId}
          projectName={projectName}
          onClose={() => setShowModal(false)}
          onSave={loadEntries}
        />
      )}
    </div>
  );
}
