import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmModal from '../ui/ConfirmModal';
import {
  X,
  Merge,
  Search,
  CheckCircle,
  AlertCircle,
  User,
  Calendar,
  MapPin
} from 'lucide-react';

interface JobMergeModalProps {
  initialWorkOrders?: Array<{
    id: string;
    work_order_number: string;
    title: string;
  }>;
  onClose: () => void;
  onSuccess: () => void;
}

interface WorkOrder {
  id: string;
  work_order_number: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assigned_to: string | null;
  start_date: string | null;
  estimated_hours: number;
  address: string | null;
  projects: {
    contact_id: string;
    contacts: {
      full_name: string;
    };
  };
  profiles: {
    full_name: string;
  } | null;
}

export function JobMergeModal({ initialWorkOrders, onClose, onSuccess }: JobMergeModalProps) {
  const { profile } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<WorkOrder[]>([]);
  const [selectedJobs, setSelectedJobs] = useState<WorkOrder[]>([]);
  const [mergeReason, setMergeReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [targetJobId, setTargetJobId] = useState<string | null>(null);
  const [showMergeConfirm, setShowMergeConfirm] = useState(false);

  useEffect(() => {
    if (initialWorkOrders && initialWorkOrders.length > 0) {
      loadInitialJobs(initialWorkOrders.map(wo => wo.id));
    }
  }, []);

  useEffect(() => {
    if (searchQuery.length >= 2) {
      searchJobs();
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  async function loadInitialJobs(jobIds: string[]) {
    try {
      const { data, error } = await supabase
        .from('work_orders')
        .select(`
          *,
          profiles (
            full_name
          ),
          projects (
            contact_id,
            contacts (
              full_name
            )
          )
        `)
        .in('id', jobIds);

      if (error) throw error;
      if (data && data.length > 0) {
        setSelectedJobs(data);
        setTargetJobId(data[0].id);
      }
    } catch (error) {
      console.error('Error loading initial jobs:', error);
    }
  }

  async function searchJobs() {
    try {
      const { data, error } = await supabase
        .from('work_orders')
        .select(`
          *,
          profiles (
            full_name
          ),
          projects (
            contact_id,
            contacts (
              full_name
            )
          )
        `)
        .or(`work_order_number.ilike.%${searchQuery}%,title.ilike.%${searchQuery}%`)
        .in('status', ['pending', 'assigned', 'in_progress'])
        .limit(10);

      if (error) throw error;

      const filtered = (data || []).filter(
        wo => !selectedJobs.some(sj => sj.id === wo.id)
      );

      setSearchResults(filtered);
    } catch (error) {
      console.error('Error searching jobs:', error);
    }
  }

  function addJob(job: WorkOrder) {
    if (selectedJobs.some(sj => sj.id === job.id)) return;

    setSelectedJobs([...selectedJobs, job]);
    setSearchQuery('');
    setSearchResults([]);

    if (!targetJobId) {
      setTargetJobId(job.id);
    }
  }

  function removeJob(jobId: string) {
    if (selectedJobs.length <= 2) {
      alert('Must have at least 2 jobs to merge');
      return;
    }

    setSelectedJobs(selectedJobs.filter(j => j.id !== jobId));

    if (targetJobId === jobId && selectedJobs.length > 1) {
      setTargetJobId(selectedJobs.find(j => j.id !== jobId)?.id || null);
    }
  }

  function canMerge(): { valid: boolean; reason?: string } {
    if (selectedJobs.length < 2) {
      return { valid: false, reason: 'Select at least 2 jobs to merge' };
    }

    if (!targetJobId) {
      return { valid: false, reason: 'Select a target job' };
    }

    const uniqueContacts = new Set(selectedJobs.map(j => j.projects.contact_id));
    if (uniqueContacts.size > 1) {
      return { valid: false, reason: 'All jobs must be for the same customer' };
    }

    return { valid: true };
  }

  async function handleMerge() {
    const validation = canMerge();
    if (!validation.valid) {
      alert(validation.reason);
      return;
    }

    setLoading(true);
    try {
      const targetJob = selectedJobs.find(j => j.id === targetJobId);
      if (!targetJob) throw new Error('Target job not found');

      const sourceJobs = selectedJobs.filter(j => j.id !== targetJobId);

      const { data: mergeData, error: mergeError } = await supabase
        .from('job_merges')
        .insert({
          target_work_order_id: targetJobId,
          merge_reason: mergeReason,
          merged_by: profile?.id
        })
        .select()
        .single();

      if (mergeError) throw mergeError;

      for (const sourceJob of sourceJobs) {
        const { error: sourceError } = await supabase
          .from('job_merge_sources')
          .insert({
            job_merge_id: mergeData.id,
            source_work_order_id: sourceJob.id
          });

        if (sourceError) throw sourceError;

        const { error: updateError } = await supabase
          .from('work_orders')
          .update({
            status: 'merged',
            notes: `Merged into ${targetJob.work_order_number}`
          })
          .eq('id', sourceJob.id);

        if (updateError) throw updateError;
      }

      const totalHours = selectedJobs.reduce((sum, j) => sum + j.estimated_hours, 0);
      const mergedDescriptions = selectedJobs
        .map(j => `• ${j.title}${j.description ? `: ${j.description}` : ''}`)
        .join('\n');

      const { error: targetUpdateError } = await supabase
        .from('work_orders')
        .update({
          estimated_hours: totalHours,
          is_merge_target: true,
          merge_id: mergeData.id,
          description: `MERGED JOB:\n${mergedDescriptions}`,
          notes: `Merged from ${sourceJobs.length} job(s): ${sourceJobs.map(j => j.work_order_number).join(', ')}`
        })
        .eq('id', targetJobId);

      if (targetUpdateError) throw targetUpdateError;

      alert(`Successfully merged ${selectedJobs.length} jobs!`);
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error merging jobs:', error);
      alert('Failed to merge jobs');
    } finally {
      setLoading(false);
    }
  }

  const validation = canMerge();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-800 rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto border border-gray-700">
        <div className="p-6 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <Merge className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Merge Jobs</h3>
                <p className="text-sm text-gray-400 mt-1">
                  Combine multiple jobs for the same customer into one
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Search and Add Jobs
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by work order number or title..."
                className="w-full pl-10 pr-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-purple-500"
              />
            </div>

            {searchResults.length > 0 && (
              <div className="mt-2 bg-gray-900 border border-gray-700 rounded-lg max-h-64 overflow-y-auto">
                {searchResults.map(result => (
                  <button
                    key={result.id}
                    onClick={() => addJob(result)}
                    className="w-full text-left p-3 hover:bg-gray-800 transition-colors border-b border-gray-700 last:border-0"
                  >
                    <div className="font-medium text-white text-sm">{result.work_order_number}</div>
                    <div className="text-sm text-gray-400 mt-1">{result.title}</div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {result.projects.contacts.full_name}
                      </span>
                      {result.start_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(result.start_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedJobs.length > 0 && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-3">
                  Selected Jobs ({selectedJobs.length})
                </label>
                <div className="space-y-2">
                  {selectedJobs.map(job => (
                    <div
                      key={job.id}
                      className={`p-4 rounded-lg border-2 transition-all ${
                        targetJobId === job.id
                          ? 'border-purple-500 bg-purple-500/10'
                          : 'border-gray-700 bg-gray-900'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <input
                              type="radio"
                              checked={targetJobId === job.id}
                              onChange={() => setTargetJobId(job.id)}
                              className="w-4 h-4"
                            />
                            <div>
                              <div className="text-sm font-medium text-white">
                                {job.work_order_number}
                                {targetJobId === job.id && (
                                  <span className="ml-2 px-2 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded-full">
                                    TARGET
                                  </span>
                                )}
                              </div>
                              <div className="text-sm text-gray-400">{job.title}</div>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-3 text-xs text-gray-400 ml-7">
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {job.projects.contacts.full_name}
                            </span>
                            {job.profiles && (
                              <span className="flex items-center gap-1">
                                Tech: {job.profiles.full_name}
                              </span>
                            )}
                            <span>Est. {job.estimated_hours}h</span>
                            {job.start_date && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {new Date(job.start_date).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>

                        {selectedJobs.length > 2 && (
                          <button
                            onClick={() => removeJob(job.id)}
                            className="p-1 hover:bg-gray-800 rounded transition-colors"
                          >
                            <X className="w-4 h-4 text-red-400" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Merge Reason (Optional)
                </label>
                <textarea
                  value={mergeReason}
                  onChange={(e) => setMergeReason(e.target.value)}
                  rows={2}
                  placeholder="Why are these jobs being merged?"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {!validation.valid && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-red-300">{validation.reason}</div>
                </div>
              )}

              {validation.valid && targetJobId && (
                <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-purple-300">
                    <strong>Ready to merge:</strong> {selectedJobs.length} jobs will be merged into{' '}
                    {selectedJobs.find(j => j.id === targetJobId)?.work_order_number}. Source jobs will be marked as "merged" and the target job will be updated with combined details.
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-6 border-t border-gray-700 flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-6 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => { if (validation.valid) setShowMergeConfirm(true); }}
            disabled={loading || !validation.valid}
            className="px-8 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-semibold"
          >
            <Merge className="w-5 h-5" />
            {loading ? 'Merging...' : `Merge ${selectedJobs.length} Jobs`}
          </button>
        </div>
      </div>
      <ConfirmModal
        isOpen={showMergeConfirm}
        title="Merge Jobs"
        message={`Merge ${selectedJobs.length} jobs into one?`}
        variant="warning"
        confirmLabel="Merge"
        onConfirm={() => {
          setShowMergeConfirm(false);
          handleMerge();
        }}
        onCancel={() => setShowMergeConfirm(false)}
      />
    </div>
  );
}
