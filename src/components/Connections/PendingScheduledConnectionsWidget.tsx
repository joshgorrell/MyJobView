import { useState, useEffect, useRef } from 'react';
import { Calendar, Clock, AlertTriangle, ExternalLink, CheckCircle2, FileText, X, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { CompleteScheduledConnectionModal } from './CompleteScheduledConnectionModal';
import ConfirmModal from '../ui/ConfirmModal';

interface PendingConnection {
  id: string;
  occurrence_date: string;
  rollover_count: number;
  scheduled_connection: {
    id: string;
    prospect_id: string;
    prospect_name: string;
    connection_type: string;
    default_notes?: string;
    prospect?: {
      id: string;
      full_name: string;
      company_name?: string;
    };
  };
}

export function PendingScheduledConnectionsWidget() {
  const { profile } = useAuth();
  const [connections, setConnections] = useState<PendingConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState<string | null>(null);
  const [selectedConnection, setSelectedConnection] = useState<PendingConnection | null>(null);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [swipedItem, setSwipedItem] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const touchStartX = useRef<number>(0);
  const touchCurrentX = useRef<number>(0);

  useEffect(() => {
    loadPendingConnections();

    const subscription = supabase
      .channel('pending_connections_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scheduled_connection_occurrences',
          filter: `status=eq.pending`
        },
        () => {
          loadPendingConnections();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [profile]);

  async function loadPendingConnections(showRefreshIndicator = false) {
    try {
      if (showRefreshIndicator) {
        setRefreshing(true);
      }

      const today = new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('scheduled_connection_occurrences')
        .select(`
          id,
          occurrence_date,
          rollover_count,
          scheduled_connection:scheduled_connections (
            id,
            prospect_id,
            prospect_name,
            connection_type,
            default_notes,
            prospect:contacts (
              id,
              full_name,
              company_name
            )
          )
        `)
        .eq('status', 'pending')
        .lte('occurrence_date', today)
        .order('rollover_count', { ascending: false })
        .order('occurrence_date', { ascending: true })
        .limit(5);

      if (error) throw error;

      setConnections(data || []);
    } catch (error) {
      console.error('Error loading pending connections:', error);
    } finally {
      setLoading(false);
      if (showRefreshIndicator) {
        setTimeout(() => setRefreshing(false), 500);
      }
    }
  }

  async function handleSkip(occurrenceId: string) {
    try {
      const { error } = await supabase
        .from('scheduled_connection_occurrences')
        .update({
          status: 'skipped',
          skipped_at: new Date().toISOString()
        })
        .eq('id', occurrenceId);

      if (error) throw error;

      await loadPendingConnections();
      setSwipedItem(null);
    } catch (error) {
      console.error('Error skipping connection:', error);
      alert('Failed to skip connection. Please try again.');
    }
  }

  function handleSwipeStart(e: React.TouchEvent, itemId: string) {
    touchStartX.current = e.targetTouches[0].clientX;
    setSwipedItem(itemId);
  }

  function handleSwipeMove(e: React.TouchEvent) {
    touchCurrentX.current = e.targetTouches[0].clientX;
  }

  function handleSwipeEnd(connection: PendingConnection) {
    const diff = touchCurrentX.current - touchStartX.current;

    // Swipe right (> 100px) to complete
    if (diff > 100) {
      setSelectedConnection(connection);
      setShowCompleteModal(true);
    }
    // Swipe left (< -100px) to skip
    else if (diff < -100) {
      setConfirmModal({
        title: 'Skip Connection',
        message: 'Skip this connection?',
        onConfirm: () => {
          setConfirmModal(null);
          handleSkip(connection.id);
        }
      });
    }

    setSwipedItem(null);
    touchStartX.current = 0;
    touchCurrentX.current = 0;
  }


  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            <div className="h-16 bg-gray-100 rounded"></div>
            <div className="h-16 bg-gray-100 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (connections.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6 border border-gray-200">
        <div className="flex items-center gap-3 mb-4">
          <Calendar className="w-5 h-5 text-blue-600" />
          <h3 className="text-base sm:text-lg font-semibold text-gray-900">Today's Connections</h3>
        </div>
        <div className="text-center py-6 sm:py-8">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <p className="text-sm sm:text-base text-gray-500">All caught up! No pending connections for today.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-blue-600" />
            <div>
              <h3 className="text-base sm:text-lg font-semibold text-gray-900">Pending Connections</h3>
              <p className="text-xs text-gray-500 mt-0.5 sm:hidden">Swipe to complete or skip</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadPendingConnections(true)}
              disabled={refreshing}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 text-gray-600 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <a
              href="/connections/scheduled"
              className="hidden sm:flex text-sm text-blue-600 hover:text-blue-700 font-medium items-center gap-1"
            >
              View All
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* Connection Cards */}
        <div className="divide-y divide-gray-200">
          {connections.map((conn) => {
            const isOverdue = conn.rollover_count >= 2;
            const isRolledOver = conn.rollover_count >= 1;
            const prospectName = conn.scheduled_connection?.prospect?.full_name ||
                                 conn.scheduled_connection?.prospect_name ||
                                 'Unknown';
            const daysAgo = conn.rollover_count > 0 ? conn.rollover_count : 0;

            return (
              <div
                key={conn.id}
                onTouchStart={(e) => handleSwipeStart(e, conn.id)}
                onTouchMove={handleSwipeMove}
                onTouchEnd={() => handleSwipeEnd(conn)}
                className={`relative overflow-hidden transition-all ${
                  isOverdue
                    ? 'bg-red-50'
                    : isRolledOver
                    ? 'bg-yellow-50'
                    : 'bg-white hover:bg-gray-50'
                }`}
              >
                {/* Swipe hint background */}
                {swipedItem === conn.id && (
                  <div className="absolute inset-0 flex items-center justify-between px-4 pointer-events-none">
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle2 className="w-5 h-5" />
                      <span className="font-medium text-sm">Complete</span>
                    </div>
                    <div className="flex items-center gap-2 text-red-600">
                      <span className="font-medium text-sm">Skip</span>
                      <X className="w-5 h-5" />
                    </div>
                  </div>
                )}

                <div className="p-4 sm:p-5">
                  <div className="flex flex-col gap-3">
                    {/* Header with name and status */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {isOverdue && (
                            <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
                          )}
                          <h4 className="font-semibold text-gray-900 text-sm sm:text-base truncate">
                            {prospectName}
                          </h4>
                        </div>
                        <p className="text-xs sm:text-sm text-gray-600">
                          {conn.scheduled_connection?.connection_type.replace(/_/g, ' ')}
                        </p>
                      </div>
                      {daysAgo > 0 && (
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
                          isOverdue
                            ? 'bg-red-100 text-red-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {daysAgo}d overdue
                        </span>
                      )}
                    </div>

                    {/* Date and notes */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-xs sm:text-sm text-gray-600">
                        <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>
                          Scheduled: {new Date(conn.occurrence_date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: new Date(conn.occurrence_date).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
                          })}
                        </span>
                      </div>

                      {conn.scheduled_connection?.default_notes && (
                        <div className="flex items-start gap-1.5 text-xs sm:text-sm text-gray-600 bg-gray-50 rounded p-2">
                          <FileText className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                          <p className="line-clamp-2">{conn.scheduled_connection.default_notes}</p>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={() => {
                          setSelectedConnection(conn);
                          setShowCompleteModal(true);
                        }}
                        className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-sm touch-manipulation min-h-[44px] flex items-center justify-center gap-2"
                      >
                        <FileText className="w-4 h-4" />
                        Add Notes & Complete
                      </button>
                      <button
                        onClick={() => {
                          setConfirmModal({
                            title: 'Skip Connection',
                            message: 'Skip this connection?',
                            onConfirm: () => {
                              setConfirmModal(null);
                              handleSkip(conn.id);
                            }
                          });
                        }}
                        className="px-4 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm touch-manipulation min-h-[44px]"
                      >
                        Skip
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        {connections.length >= 5 && (
          <div className="p-4 bg-gray-50 border-t border-gray-200 text-center">
            <a
              href="/connections/scheduled"
              className="text-sm text-blue-600 hover:text-blue-700 font-medium inline-flex items-center gap-1"
            >
              View all pending connections
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}
      </div>

      {/* Complete Connection Modal */}
      {showCompleteModal && selectedConnection && (
        <CompleteScheduledConnectionModal
          occurrence={selectedConnection}
          onClose={() => {
            setShowCompleteModal(false);
            setSelectedConnection(null);
          }}
          onSuccess={() => {
            setShowCompleteModal(false);
            setSelectedConnection(null);
            loadPendingConnections();
          }}
        />
      )}
      <ConfirmModal
        isOpen={!!confirmModal}
        title={confirmModal?.title || ''}
        message={confirmModal?.message || ''}
        variant="warning"
        onConfirm={() => confirmModal?.onConfirm()}
        onCancel={() => setConfirmModal(null)}
      />
    </>
  );
}
