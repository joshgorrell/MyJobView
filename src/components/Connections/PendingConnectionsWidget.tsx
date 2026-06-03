import { useState, useEffect } from 'react';
import { Calendar, CheckCircle2, X, Clock, AlertTriangle, RefreshCw, Phone, Mail, Users, MapPin } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface PendingOccurrence {
  id: string;
  scheduled_date: string;
  scheduled_time: string | null;
  is_rolled_over: boolean;
  original_scheduled_date: string;
  rollover_count: number;
  scheduled_connection_id: string;
  prospect_id: string;
  prospect: {
    first_name: string;
    last_name: string;
    full_name: string;
    company_name: string;
  };
  schedule: {
    connection_type: string;
    default_notes: string | null;
    default_location: string | null;
  };
}

interface PendingConnectionsWidgetProps {
  onComplete: (occurrenceId: string) => void;
  onSkip: (occurrenceId: string) => void;
  compact?: boolean;
}

export function PendingConnectionsWidget({ onComplete, onSkip, compact = false }: PendingConnectionsWidgetProps) {
  const { profile } = useAuth();
  const [occurrences, setOccurrences] = useState<PendingOccurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'today' | 'overdue'>('all');

  useEffect(() => {
    loadPendingOccurrences();

    // Set up real-time subscription
    const subscription = supabase
      .channel('pending_occurrences')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'scheduled_connection_occurrences',
        filter: `is_completed=eq.false`
      }, () => {
        loadPendingOccurrences();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [profile]);

  async function loadPendingOccurrences() {
    if (!profile) return;

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('scheduled_connection_occurrences')
        .select(`
          *,
          prospect:contacts!scheduled_connection_occurrences_prospect_id_fkey (
            first_name,
            last_name,
            full_name,
            company_name
          ),
          schedule:scheduled_connections!scheduled_connection_occurrences_scheduled_connection_id_fkey (
            connection_type,
            default_notes,
            default_location
          )
        `)
        .eq('is_completed', false)
        .eq('is_skipped', false)
        .order('scheduled_date', { ascending: true })
        .order('scheduled_time', { ascending: true, nullsFirst: false });

      if (error) throw error;

      // Filter to only show occurrences from user's schedules
      const userScheduleIds = new Set<string>();
      const { data: userSchedules } = await supabase
        .from('scheduled_connections')
        .select('id')
        .eq('created_by_user_id', profile.id);

      userSchedules?.forEach(s => userScheduleIds.add(s.id));

      const filtered = (data || []).filter(occ =>
        userScheduleIds.has(occ.scheduled_connection_id)
      );

      setOccurrences(filtered);
    } catch (error) {
      console.error('Error loading pending occurrences:', error);
    } finally {
      setLoading(false);
    }
  }

  function getFilteredOccurrences(): PendingOccurrence[] {
    const today = new Date().toISOString().split('T')[0];

    switch (filter) {
      case 'today':
        return occurrences.filter(o => o.scheduled_date === today);
      case 'overdue':
        return occurrences.filter(o => o.scheduled_date < today || o.is_rolled_over);
      default:
        return occurrences;
    }
  }

  function groupOccurrencesByDate() {
    const filtered = getFilteredOccurrences();
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    const groups = {
      today: [] as PendingOccurrence[],
      tomorrow: [] as PendingOccurrence[],
      thisWeek: [] as PendingOccurrence[],
      later: [] as PendingOccurrence[]
    };

    filtered.forEach(occ => {
      if (occ.scheduled_date === today) {
        groups.today.push(occ);
      } else if (occ.scheduled_date === tomorrow) {
        groups.tomorrow.push(occ);
      } else if (new Date(occ.scheduled_date) < new Date(Date.now() + 7 * 86400000)) {
        groups.thisWeek.push(occ);
      } else {
        groups.later.push(occ);
      }
    });

    return groups;
  }

  async function handleComplete(occurrence: PendingOccurrence) {
    onComplete(occurrence.id);
  }

  async function handleSkip(occurrence: PendingOccurrence) {
    const reason = prompt('Why are you skipping this connection? (Optional)');

    try {
      const { error } = await supabase
        .from('scheduled_connection_occurrences')
        .update({
          is_skipped: true,
          skipped_at: new Date().toISOString(),
          skipped_reason: reason || 'Skipped by user'
        })
        .eq('id', occurrence.id);

      if (error) throw error;

      await loadPendingOccurrences();
      onSkip(occurrence.id);
    } catch (error) {
      console.error('Error skipping occurrence:', error);
      alert('Failed to skip occurrence');
    }
  }

  function getConnectionTypeIcon(type: string) {
    switch (type) {
      case 'call':
        return Phone;
      case 'email':
        return Mail;
      case 'meeting':
      case 'site_visit':
        return Users;
      default:
        return Calendar;
    }
  }

  function formatConnectionType(type: string): string {
    return type.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="w-6 h-6 text-blue-600 animate-spin" />
      </div>
    );
  }

  const groups = groupOccurrencesByDate();
  const totalPending = occurrences.length;

  if (compact) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Pending Connections</h3>
          <span className="px-2.5 py-0.5 bg-blue-100 text-blue-700 text-sm font-medium rounded-full">
            {totalPending}
          </span>
        </div>

        {totalPending === 0 ? (
          <div className="text-center py-8">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-2" />
            <p className="text-gray-500">All caught up!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {occurrences.slice(0, 5).map((occurrence) => {
              const Icon = getConnectionTypeIcon(occurrence.schedule.connection_type);
              return (
                <div
                  key={occurrence.id}
                  className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg border border-gray-200"
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    occurrence.is_rolled_over ? 'bg-amber-100' : 'bg-blue-100'
                  }`}>
                    <Icon className={`w-5 h-5 ${
                      occurrence.is_rolled_over ? 'text-amber-600' : 'text-blue-600'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">
                      {occurrence.prospect.full_name || occurrence.prospect.company_name}
                    </div>
                    <div className="text-sm text-gray-500 flex items-center gap-2">
                      {formatConnectionType(occurrence.schedule.connection_type)}
                      {occurrence.is_rolled_over && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                          Rolled {occurrence.rollover_count}x
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleComplete(occurrence)}
                      className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors"
                      title="Complete"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleSkip(occurrence)}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Skip"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Pending Connections</h2>
          <p className="text-gray-400 mt-1">Complete your scheduled touchpoints</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            All ({occurrences.length})
          </button>
          <button
            onClick={() => setFilter('today')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === 'today'
                ? 'bg-blue-600 text-white'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            Today ({groups.today.length})
          </button>
          <button
            onClick={() => setFilter('overdue')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === 'overdue'
                ? 'bg-blue-600 text-white'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            Overdue ({occurrences.filter(o => o.is_rolled_over).length})
          </button>
        </div>
      </div>

      {/* Groups */}
      {totalPending === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">All Caught Up!</h3>
          <p className="text-gray-500">You have no pending connection appointments</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.today.length > 0 && (
            <OccurrenceGroup
              title="Today"
              occurrences={groups.today}
              onComplete={handleComplete}
              onSkip={handleSkip}
              getConnectionTypeIcon={getConnectionTypeIcon}
              formatConnectionType={formatConnectionType}
            />
          )}

          {groups.tomorrow.length > 0 && (
            <OccurrenceGroup
              title="Tomorrow"
              occurrences={groups.tomorrow}
              onComplete={handleComplete}
              onSkip={handleSkip}
              getConnectionTypeIcon={getConnectionTypeIcon}
              formatConnectionType={formatConnectionType}
            />
          )}

          {groups.thisWeek.length > 0 && (
            <OccurrenceGroup
              title="This Week"
              occurrences={groups.thisWeek}
              onComplete={handleComplete}
              onSkip={handleSkip}
              getConnectionTypeIcon={getConnectionTypeIcon}
              formatConnectionType={formatConnectionType}
            />
          )}

          {groups.later.length > 0 && (
            <OccurrenceGroup
              title="Later"
              occurrences={groups.later}
              onComplete={handleComplete}
              onSkip={handleSkip}
              getConnectionTypeIcon={getConnectionTypeIcon}
              formatConnectionType={formatConnectionType}
            />
          )}
        </div>
      )}
    </div>
  );
}

interface OccurrenceGroupProps {
  title: string;
  occurrences: PendingOccurrence[];
  onComplete: (occurrence: PendingOccurrence) => void;
  onSkip: (occurrence: PendingOccurrence) => void;
  getConnectionTypeIcon: (type: string) => any;
  formatConnectionType: (type: string) => string;
}

function OccurrenceGroup({ title, occurrences, onComplete, onSkip, getConnectionTypeIcon, formatConnectionType }: OccurrenceGroupProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-4 py-3 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-blue-600" />
          {title}
          <span className="text-sm font-normal text-gray-500">({occurrences.length})</span>
        </h3>
      </div>
      <div className="divide-y divide-gray-200">
        {occurrences.map((occurrence) => {
          const Icon = getConnectionTypeIcon(occurrence.schedule.connection_type);
          return (
            <div
              key={occurrence.id}
              className={`p-4 hover:bg-gray-50 transition-colors ${
                occurrence.is_rolled_over ? 'bg-amber-50/50' : ''
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  occurrence.is_rolled_over ? 'bg-amber-100' : 'bg-blue-100'
                }`}>
                  <Icon className={`w-6 h-6 ${
                    occurrence.is_rolled_over ? 'text-amber-600' : 'text-blue-600'
                  }`} />
                </div>

                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-gray-900 mb-1">
                    {occurrence.prospect.full_name || occurrence.prospect.company_name}
                  </h4>
                  {occurrence.prospect.company_name && occurrence.prospect.full_name && (
                    <p className="text-sm text-gray-600 mb-2">{occurrence.prospect.company_name}</p>
                  )}

                  <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 mb-2">
                    <span className="font-medium">{formatConnectionType(occurrence.schedule.connection_type)}</span>
                    <span>•</span>
                    <span>
                      {new Date(occurrence.scheduled_date).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </span>
                    {occurrence.scheduled_time && (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {occurrence.scheduled_time.slice(0, 5)}
                        </span>
                      </>
                    )}
                  </div>

                  {occurrence.is_rolled_over && (
                    <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-100 px-2 py-1 rounded w-fit mb-2">
                      <AlertTriangle className="w-4 h-4" />
                      Rolled over {occurrence.rollover_count} time{occurrence.rollover_count > 1 ? 's' : ''} from{' '}
                      {new Date(occurrence.original_scheduled_date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric'
                      })}
                    </div>
                  )}

                  {occurrence.schedule.default_notes && (
                    <p className="text-sm text-gray-600 bg-gray-50 rounded p-2">
                      {occurrence.schedule.default_notes}
                    </p>
                  )}
                </div>

                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => onComplete(occurrence)}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Complete
                  </button>
                  <button
                    onClick={() => onSkip(occurrence)}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                  >
                    <X className="w-4 h-4" />
                    Skip
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
