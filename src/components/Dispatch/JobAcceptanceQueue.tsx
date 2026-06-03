import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { notifyTechJobReassigned } from '../../lib/dispatchNotifications';
import ConfirmModal from '../ui/ConfirmModal';
import {
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  User,
  MapPin,
  Calendar,
  MessageSquare
} from 'lucide-react';

interface PendingAcceptance {
  id: string;
  work_order_number: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assigned_to: string;
  start_date: string | null;
  created_at: string;
  address: string | null;
  profiles: {
    id: string;
    full_name: string;
  };
  projects: {
    project_name: string;
    contacts: {
      full_name: string;
      phone: string | null;
    };
  };
  job_acceptance_log: Array<{
    action: string;
    reason: string | null;
    created_at: string;
  }>;
}

interface Technician {
  id: string;
  full_name: string;
  role: string;
}

export function JobAcceptanceQueue() {
  const [pendingJobs, setPendingJobs] = useState<PendingAcceptance[]>([]);
  const [techs, setTechs] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [reassigning, setReassigning] = useState<string | null>(null);
  const [selectedTech, setSelectedTech] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const [confirmForceAccept, setConfirmForceAccept] = useState<{ id: string; techId: string } | null>(null);

  useEffect(() => {
    loadData();
    loadTechs();

    const channel = supabase
      .channel('job-acceptance-queue')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'job_acceptance_log'
      }, loadData)
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, []);

  async function loadData() {
    try {
      const { data, error } = await supabase
        .from('work_orders')
        .select(`
          *,
          profiles!work_orders_assigned_to_fkey (
            id,
            full_name
          ),
          projects (
            project_name,
            contacts (
              full_name,
              phone
            )
          ),
          job_acceptance_log (
            action,
            reason,
            created_at
          )
        `)
        .eq('status', 'assigned')
        .not('assigned_to', 'is', null)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const pending = (data || []).filter(wo => {
        const hasAccepted = wo.job_acceptance_log?.some(log => log.action === 'accepted');
        return !hasAccepted;
      });

      setPendingJobs(pending);
    } catch (error) {
      console.error('Error loading pending acceptances:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadTechs() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('role', 'tech')
        .order('full_name');

      if (error) throw error;
      setTechs(data || []);
    } catch (error) {
      console.error('Error loading techs:', error);
    }
  }

  async function handleReassign(workOrderId: string, currentTechId: string, currentTechName: string) {
    if (!selectedTech) {
      alert('Please select a technician');
      return;
    }

    try {
      const wo = pendingJobs.find(j => j.id === workOrderId);
      if (!wo) return;

      await supabase
        .from('job_acceptance_log')
        .insert({
          work_order_id: workOrderId,
          technician_id: currentTechId,
          action: 'reassigned',
          reason: `Reassigned by dispatch - ${declineReason || 'No response'}`
        });

      const { error: updateError } = await supabase
        .from('work_orders')
        .update({
          assigned_to: selectedTech,
          updated_at: new Date().toISOString()
        })
        .eq('id', workOrderId);

      if (updateError) throw updateError;

      await notifyTechJobReassigned(selectedTech, {
        work_order_number: wo.work_order_number,
        title: wo.title,
        previous_tech: currentTechName,
        scheduled_date: wo.start_date || undefined
      });

      setReassigning(null);
      setSelectedTech('');
      setDeclineReason('');
      await loadData();
    } catch (error) {
      console.error('Error reassigning job:', error);
      alert('Failed to reassign job');
    }
  }

  async function handleForceAccept(workOrderId: string, techId: string) {

    try {
      const { error } = await supabase
        .from('job_acceptance_log')
        .insert({
          work_order_id: workOrderId,
          technician_id: techId,
          action: 'auto_accepted',
          reason: 'Auto-accepted by dispatch'
        });

      if (error) throw error;

      const { error: updateError } = await supabase
        .from('work_orders')
        .update({
          status: 'in_progress',
          updated_at: new Date().toISOString()
        })
        .eq('id', workOrderId);

      if (updateError) throw updateError;

      await loadData();
    } catch (error) {
      console.error('Error force accepting job:', error);
      alert('Failed to force accept job');
    }
  }

  function getPriorityColor(priority: string) {
    switch (priority) {
      case 'high':
        return 'text-red-400 bg-red-500/10 border-red-500/20';
      case 'medium':
        return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
      case 'low':
        return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
      default:
        return 'text-gray-400 bg-gray-500/10 border-gray-500/20';
    }
  }

  function getTimeAgo(timestamp: string) {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading acceptance queue...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-white">Job Acceptance Queue</h2>
        <p className="text-gray-400 text-sm mt-1">
          {pendingJobs.length} {pendingJobs.length === 1 ? 'job' : 'jobs'} waiting for technician acceptance
        </p>
      </div>

      {pendingJobs.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-12 text-center">
          <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">All Jobs Accepted!</h3>
          <p className="text-gray-400">No jobs waiting for technician acceptance.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pendingJobs.map(job => {
            const hasDeclined = job.job_acceptance_log?.some(log => log.action === 'declined');
            const timeSinceAssigned = getTimeAgo(job.created_at);

            return (
              <div
                key={job.id}
                className={`bg-gray-800 rounded-lg border transition-colors ${
                  hasDeclined ? 'border-red-500/50 bg-red-500/5' : 'border-gray-700'
                }`}
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-xs font-mono text-gray-500">
                          {job.work_order_number}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getPriorityColor(job.priority)}`}>
                          {job.priority.toUpperCase()}
                        </span>
                        {hasDeclined && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30">
                            <AlertCircle className="w-3 h-3" />
                            DECLINED
                          </span>
                        )}
                        <span className="text-xs text-gray-500">
                          <Clock className="w-3 h-3 inline mr-1" />
                          Assigned {timeSinceAssigned}
                        </span>
                      </div>

                      <div className="font-semibold text-white mb-2">{job.title}</div>

                      {job.description && (
                        <div className="text-sm text-gray-400 mb-3">{job.description}</div>
                      )}

                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2 text-gray-300">
                          <User className="w-4 h-4 text-gray-400" />
                          Assigned to: <span className="font-medium">{job.profiles.full_name}</span>
                        </div>

                        <div className="flex items-center gap-2 text-gray-300">
                          <User className="w-4 h-4 text-gray-400" />
                          Customer: {job.projects.contacts.full_name}
                        </div>

                        {job.address && (
                          <div className="flex items-center gap-2 text-gray-300">
                            <MapPin className="w-4 h-4 text-gray-400" />
                            {job.address}
                          </div>
                        )}

                        {job.start_date && (
                          <div className="flex items-center gap-2 text-gray-300">
                            <Calendar className="w-4 h-4 text-gray-400" />
                            {new Date(job.start_date).toLocaleDateString()}
                          </div>
                        )}
                      </div>

                      {job.job_acceptance_log && job.job_acceptance_log.length > 0 && (
                        <div className="mt-3 p-3 bg-gray-900 rounded border border-gray-700">
                          <div className="text-xs font-medium text-gray-400 mb-2 flex items-center gap-1">
                            <MessageSquare className="w-3 h-3" />
                            History
                          </div>
                          {job.job_acceptance_log.map((log, idx) => (
                            <div key={idx} className="text-xs text-gray-300 mb-1 last:mb-0">
                              <span className={`font-medium ${log.action === 'declined' ? 'text-red-400' : 'text-gray-400'}`}>
                                {log.action.charAt(0).toUpperCase() + log.action.slice(1)}
                              </span>
                              {log.reason && `: ${log.reason}`}
                              <span className="text-gray-500 ml-2">
                                ({getTimeAgo(log.created_at)})
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      {reassigning === job.id ? (
                        <div className="space-y-2 min-w-[200px]">
                          <select
                            value={selectedTech}
                            onChange={(e) => setSelectedTech(e.target.value)}
                            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">Select tech...</option>
                            {techs.filter(t => t.id !== job.assigned_to).map(tech => (
                              <option key={tech.id} value={tech.id}>{tech.full_name}</option>
                            ))}
                          </select>

                          <input
                            type="text"
                            value={declineReason}
                            onChange={(e) => setDeclineReason(e.target.value)}
                            placeholder="Reason (optional)"
                            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500"
                          />

                          <button
                            onClick={() => handleReassign(job.id, job.assigned_to, job.profiles.full_name)}
                            disabled={!selectedTech}
                            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50"
                          >
                            Confirm Reassign
                          </button>

                          <button
                            onClick={() => {
                              setReassigning(null);
                              setSelectedTech('');
                              setDeclineReason('');
                            }}
                            className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => setReassigning(job.id)}
                            className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-sm font-medium whitespace-nowrap"
                          >
                            Reassign Job
                          </button>

                          <button
                            onClick={() => setConfirmForceAccept({ id: job.id, techId: job.assigned_to })}
                            className="px-4 py-2 bg-green-600/20 text-green-400 border border-green-500/30 rounded-lg hover:bg-green-600/30 transition-colors text-sm font-medium whitespace-nowrap"
                          >
                            Force Accept
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <ConfirmModal
        isOpen={confirmForceAccept !== null}
        title="Force Accept Job"
        message="Force accept this job on behalf of the technician?"
        variant="warning"
        confirmLabel="Force Accept"
        onConfirm={() => {
          if (confirmForceAccept) {
            handleForceAccept(confirmForceAccept.id, confirmForceAccept.techId);
          }
          setConfirmForceAccept(null);
        }}
        onCancel={() => setConfirmForceAccept(null)}
      />
    </div>
  );
}
