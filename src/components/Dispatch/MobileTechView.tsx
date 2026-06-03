import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmModal from '../ui/ConfirmModal';
import {
  MapPin,
  Clock,
  Phone,
  Navigation,
  CheckCircle,
  PlayCircle,
  AlertCircle,
  ChevronRight,
  Calendar,
  User,
  Wrench
} from 'lucide-react';

interface MobileJob {
  id: string;
  work_order_number: string;
  scheduled_date: string;
  scheduled_start_time: string;
  scheduled_end_time: string;
  status: string;
  priority: string;
  project_name: string;
  customer_name: string;
  customer_phone: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  zip: string;
  estimated_duration: number;
  notes: string;
}

export function MobileTechView() {
  const { profile } = useAuth();
  const [jobs, setJobs] = useState<MobileJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [viewDays, setViewDays] = useState(1);
  const [confirmCompleteJobId, setConfirmCompleteJobId] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.id) {
      loadMyJobs();

      const channel = supabase
        .channel('tech-mobile-jobs')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'work_orders',
          filter: `assigned_to=eq.${profile.id}`
        }, () => {
          loadMyJobs();
        })
        .subscribe();

      return () => {
        channel.unsubscribe();
      };
    }
  }, [profile?.id, viewDays]);

  async function loadMyJobs() {
    if (!profile?.id) return;

    try {
      const today = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + viewDays);

      const { data, error } = await supabase
        .from('work_orders')
        .select(`
          id,
          work_order_number,
          scheduled_date,
          scheduled_start_time,
          scheduled_end_time,
          status,
          priority,
          estimated_duration,
          special_instructions,
          project:projects (
            project_name,
            contacts (
              full_name,
              company_name,
              phone,
              address_line1,
              address_line2,
              city,
              state,
              zip
            )
          )
        `)
        .eq('assigned_to', profile.id)
        .gte('scheduled_date', today.toISOString().split('T')[0])
        .lte('scheduled_date', endDate.toISOString().split('T')[0])
        .in('status', ['assigned', 'in_progress'])
        .order('scheduled_date')
        .order('scheduled_start_time');

      if (error) throw error;

      const mobileJobs: MobileJob[] = (data || []).map((wo: any) => ({
        id: wo.id,
        work_order_number: wo.work_order_number,
        scheduled_date: wo.scheduled_date || '',
        scheduled_start_time: wo.scheduled_start_time || '',
        scheduled_end_time: wo.scheduled_end_time || '',
        status: wo.status,
        priority: wo.priority,
        project_name: wo.project?.project_name || 'Untitled',
        customer_name: wo.project?.contacts?.full_name || wo.project?.contacts?.company_name || 'Unknown',
        customer_phone: wo.project?.contacts?.phone || '',
        address_line1: wo.project?.contacts?.address_line1 || '',
        address_line2: wo.project?.contacts?.address_line2 || '',
        city: wo.project?.contacts?.city || '',
        state: wo.project?.contacts?.state || '',
        zip: wo.project?.contacts?.zip || '',
        estimated_duration: wo.estimated_duration || 60,
        notes: wo.special_instructions || ''
      }));

      setJobs(mobileJobs);

      const inProgress = mobileJobs.find(j => j.status === 'in_progress');
      if (inProgress) {
        setCurrentJobId(inProgress.id);
      } else if (mobileJobs.length > 0) {
        setCurrentJobId(mobileJobs[0].id);
      }
    } catch (error) {
      console.error('Error loading jobs:', error);
    } finally {
      setLoading(false);
    }
  }

  async function startJob(jobId: string) {
    try {
      const { error } = await supabase
        .from('work_orders')
        .update({ status: 'in_progress' })
        .eq('id', jobId);

      if (error) throw error;
      setCurrentJobId(jobId);
      await loadMyJobs();
    } catch (error) {
      console.error('Error starting job:', error);
      alert('Failed to start job');
    }
  }

  async function completeJob(jobId: string) {
    try {
      const { error } = await supabase
        .from('work_orders')
        .update({ status: 'completed' })
        .eq('id', jobId);

      if (error) throw error;

      setCurrentJobId(null);
      await loadMyJobs();
    } catch (error) {
      console.error('Error completing job:', error);
      alert('Failed to complete job');
    }
  }

  function openNavigation(job: MobileJob) {
    const address = `${job.address_line1}, ${job.city}, ${job.state} ${job.zip}`;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
    window.open(url, '_blank');
  }

  function callCustomer(phone: string) {
    window.location.href = `tel:${phone}`;
  }

  function getJobCardStyle(job: MobileJob, isCurrent: boolean) {
    if (job.status === 'in_progress') {
      return 'border-blue-500 bg-blue-50';
    }
    if (isCurrent) {
      return 'border-green-500 bg-green-50';
    }
    return 'border-gray-200 bg-white';
  }

  function getPriorityBadge(priority: string) {
    const styles: any = {
      critical: 'bg-red-600 text-white',
      high: 'bg-orange-500 text-white',
      medium: 'bg-yellow-500 text-white',
      normal: 'bg-gray-500 text-white',
      low: 'bg-blue-500 text-white'
    };
    return styles[priority] || styles.normal;
  }

  function isToday(dateStr: string) {
    const date = new Date(dateStr);
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-gray-500">Loading your schedule...</div>
      </div>
    );
  }

  const currentJob = jobs.find(j => j.id === currentJobId);
  const nextJob = jobs.find(j => j.id !== currentJobId && j.status === 'assigned');
  const todayJobs = jobs.filter(j => isToday(j.scheduled_date));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile Header */}
      <div className="bg-blue-600 text-white p-4 sticky top-0 z-10 shadow-md">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-xl font-bold">My Schedule</h1>
            <p className="text-sm text-blue-100">
              {profile?.full_name || 'Technician'}
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">{todayJobs.length}</div>
            <div className="text-xs text-blue-100">Today's Jobs</div>
          </div>
        </div>

        {/* View Toggle */}
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => setViewDays(1)}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
              viewDays === 1
                ? 'bg-white text-blue-600'
                : 'bg-blue-500 text-white hover:bg-blue-400'
            }`}
          >
            Today
          </button>
          <button
            onClick={() => setViewDays(3)}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
              viewDays === 3
                ? 'bg-white text-blue-600'
                : 'bg-blue-500 text-white hover:bg-blue-400'
            }`}
          >
            Next 3 Days
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4 pb-24">
        {jobs.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              All Clear!
            </h3>
            <p className="text-gray-600">
              No scheduled jobs for the next {viewDays === 1 ? 'day' : `${viewDays} days`}
            </p>
          </div>
        ) : (
          <>
            {/* Current/Next Job Card - Prominent */}
            {currentJob && (
              <div className={`border-4 rounded-2xl shadow-lg p-6 ${getJobCardStyle(currentJob, true)}`}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-xs font-semibold text-gray-500 uppercase mb-1">
                      {currentJob.status === 'in_progress' ? 'Current Job' : 'Next Job'}
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900">
                      #{currentJob.work_order_number}
                    </h2>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${getPriorityBadge(currentJob.priority)}`}>
                    {currentJob.priority}
                  </span>
                </div>

                <div className="space-y-3 mb-6">
                  <div>
                    <div className="text-sm font-medium text-gray-500">Customer</div>
                    <div className="text-lg font-semibold text-gray-900">{currentJob.customer_name}</div>
                  </div>

                  <div>
                    <div className="text-sm font-medium text-gray-500">Address</div>
                    <div className="text-gray-900">
                      {currentJob.address_line1}
                      {currentJob.address_line2 && `, ${currentJob.address_line2}`}
                      <br />
                      {currentJob.city}, {currentJob.state} {currentJob.zip}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-sm font-medium text-gray-500">Scheduled Time</div>
                      <div className="flex items-center gap-2 text-gray-900 font-medium">
                        <Clock className="w-4 h-4" />
                        {currentJob.scheduled_start_time || 'TBD'}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-500">Duration</div>
                      <div className="text-gray-900 font-medium">
                        {currentJob.estimated_duration} min
                      </div>
                    </div>
                  </div>

                  {currentJob.notes && (
                    <div>
                      <div className="text-sm font-medium text-gray-500">Notes</div>
                      <div className="text-sm text-gray-700 bg-yellow-50 border border-yellow-200 rounded p-2 mt-1">
                        {currentJob.notes}
                      </div>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => openNavigation(currentJob)}
                    className="flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                  >
                    <Navigation className="w-5 h-5" />
                    Navigate
                  </button>
                  {currentJob.customer_phone && (
                    <button
                      onClick={() => callCustomer(currentJob.customer_phone)}
                      className="flex items-center justify-center gap-2 py-3 px-4 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
                    >
                      <Phone className="w-5 h-5" />
                      Call
                    </button>
                  )}
                </div>

                {currentJob.status === 'assigned' ? (
                  <button
                    onClick={() => startJob(currentJob.id)}
                    className="w-full mt-3 flex items-center justify-center gap-2 py-4 px-4 bg-green-600 text-white rounded-lg font-bold text-lg hover:bg-green-700 transition-colors shadow-lg"
                  >
                    <PlayCircle className="w-6 h-6" />
                    START JOB
                  </button>
                ) : (
                  <button
                    onClick={() => setConfirmCompleteJobId(currentJob.id)}
                    className="w-full mt-3 flex items-center justify-center gap-2 py-4 px-4 bg-green-600 text-white rounded-lg font-bold text-lg hover:bg-green-700 transition-colors shadow-lg"
                  >
                    <CheckCircle className="w-6 h-6" />
                    COMPLETE JOB
                  </button>
                )}
              </div>
            )}

            {/* Upcoming Jobs List */}
            <div className="space-y-3">
              <h3 className="text-lg font-bold text-gray-900 px-1">
                {viewDays === 1 ? 'Other Jobs Today' : 'Upcoming Jobs'}
              </h3>
              {jobs
                .filter(j => j.id !== currentJobId)
                .map(job => (
                  <div
                    key={job.id}
                    className={`border-2 rounded-xl shadow-sm p-4 ${getJobCardStyle(job, false)} cursor-pointer hover:shadow-md transition-shadow`}
                    onClick={() => setCurrentJobId(job.id)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="font-bold text-gray-900 text-lg">
                          #{job.work_order_number}
                        </div>
                        <div className="text-sm text-gray-600">{job.project_name}</div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0 mt-1" />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-gray-900">
                        <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span className="truncate">{job.customer_name}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span className="truncate">
                          {job.city}, {job.state}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-2 text-gray-600">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          {new Date(job.scheduled_date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric'
                          })}
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                          <Clock className="w-4 h-4 text-gray-400" />
                          {job.scheduled_start_time || 'TBD'}
                        </div>
                        <span className={`ml-auto px-2 py-1 rounded text-xs font-bold uppercase ${getPriorityBadge(job.priority)}`}>
                          {job.priority}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </>
        )}
      </div>
      <ConfirmModal
        isOpen={confirmCompleteJobId !== null}
        title="Complete Job"
        message="Mark this job as completed?"
        variant="neutral"
        confirmLabel="Complete"
        onConfirm={() => {
          if (confirmCompleteJobId) {
            completeJob(confirmCompleteJobId);
          }
          setConfirmCompleteJobId(null);
        }}
        onCancel={() => setConfirmCompleteJobId(null)}
      />
    </div>
  );
}
