import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { CheckCircle, XCircle, History, AlertCircle } from 'lucide-react';

interface LaborPhase {
  id: string;
  name: string;
  description: string | null;
  counts_against_target: boolean;
}

interface AuditEntry {
  id: string;
  labor_phase_id: string;
  admin_name: string;
  old_value: boolean | null;
  new_value: boolean;
  reason: string;
  created_at: string;
}

export default function LaborPhasePerformanceMapping() {
  const [phases, setPhases] = useState<LaborPhase[]>([]);
  const [auditHistory, setAuditHistory] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [editingPhase, setEditingPhase] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchPhases();
    fetchAuditHistory();
  }, []);

  const fetchPhases = async () => {
    try {
      const { data, error } = await supabase
        .from('labor_phases')
        .select(`
          id,
          name,
          description,
          labor_phase_performance_mapping!inner(counts_against_target)
        `)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;

      const formattedPhases = data?.map(phase => ({
        id: phase.id,
        name: phase.name,
        description: phase.description,
        counts_against_target: (phase.labor_phase_performance_mapping as any)?.counts_against_target ?? true
      })) || [];

      setPhases(formattedPhases);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchAuditHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('labor_phase_mapping_audit')
        .select(`
          id,
          labor_phase_id,
          old_value,
          new_value,
          reason,
          created_at,
          profiles!labor_phase_mapping_audit_admin_id_fkey(full_name)
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const formatted = data?.map(entry => ({
        id: entry.id,
        labor_phase_id: entry.labor_phase_id,
        admin_name: (entry.profiles as any)?.full_name || 'Unknown',
        old_value: entry.old_value,
        new_value: entry.new_value,
        reason: entry.reason,
        created_at: entry.created_at
      })) || [];

      setAuditHistory(formatted);
    } catch (err: any) {
      console.error('Failed to fetch audit history:', err);
    }
  };

  const handleUpdateMapping = async (phaseId: string, newValue: boolean) => {
    if (!reason.trim()) {
      setError('Please provide a reason for this change');
      return;
    }

    try {
      setError(null);
      setSuccess(null);

      const { error: updateError } = await supabase.rpc('update_labor_phase_mapping', {
        p_labor_phase_id: phaseId,
        p_counts_against_target: newValue,
        p_reason: reason
      });

      if (updateError) throw updateError;

      setSuccess('Labor phase mapping updated successfully');
      setReason('');
      setEditingPhase(null);

      await fetchPhases();
      await fetchAuditHistory();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const startEdit = (phaseId: string) => {
    setEditingPhase(phaseId);
    setReason('');
    setError(null);
    setSuccess(null);
  };

  const cancelEdit = () => {
    setEditingPhase(null);
    setReason('');
    setError(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading labor phases...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Labor Phase Performance Mapping</h2>
            <p className="text-gray-600 mt-1">
              Configure which labor phases count against the 95% Field Target for Test & Tune bonus calculations
            </p>
          </div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-2 px-4 py-2 text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50"
          >
            <History className="w-4 h-4" />
            {showHistory ? 'Hide' : 'Show'} Audit Trail
          </button>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-red-800">{error}</div>
          </div>
        )}

        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="text-green-800">{success}</div>
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-900">
              <strong>Important:</strong> Changes to labor phase mappings only affect future work orders.
              Approved and paid bonuses are never affected by mapping changes. Always provide a clear
              reason when changing mappings for compliance purposes.
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-4 px-4 py-2 bg-gray-50 rounded-lg font-medium text-gray-700 text-sm">
            <div>Labor Phase</div>
            <div>Performance Classification</div>
            <div>Actions</div>
          </div>

          {phases.map(phase => (
            <div key={phase.id} className="border border-gray-200 rounded-lg p-4">
              <div className="grid grid-cols-3 gap-4 items-start">
                <div>
                  <div className="font-medium text-gray-900">{phase.name}</div>
                  {phase.description && (
                    <div className="text-sm text-gray-600 mt-1">{phase.description}</div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {phase.counts_against_target ? (
                    <div className="flex items-center gap-2 text-green-700">
                      <CheckCircle className="w-5 h-5" />
                      <span className="font-medium">Counts Against Target</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-gray-600">
                      <XCircle className="w-5 h-5" />
                      <span className="font-medium">Excluded (Non-Performance)</span>
                    </div>
                  )}
                </div>

                <div>
                  {editingPhase === phase.id ? (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleUpdateMapping(phase.id, true)}
                          disabled={phase.counts_against_target}
                          className={`flex-1 px-3 py-2 rounded border text-sm font-medium ${
                            phase.counts_against_target
                              ? 'bg-green-50 border-green-600 text-green-700 cursor-default'
                              : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          Counts Against Target
                        </button>
                        <button
                          onClick={() => handleUpdateMapping(phase.id, false)}
                          disabled={!phase.counts_against_target}
                          className={`flex-1 px-3 py-2 rounded border text-sm font-medium ${
                            !phase.counts_against_target
                              ? 'bg-gray-100 border-gray-600 text-gray-700 cursor-default'
                              : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          Exclude
                        </button>
                      </div>
                      <input
                        type="text"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Reason for change (required)"
                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={cancelEdit}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEdit(phase.id)}
                      className="px-4 py-2 text-blue-600 border border-blue-600 rounded hover:bg-blue-50 text-sm font-medium"
                    >
                      Change Classification
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showHistory && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Mapping Change Audit Trail</h3>

          {auditHistory.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No mapping changes recorded yet
            </div>
          ) : (
            <div className="space-y-3">
              {auditHistory.map(entry => {
                const phase = phases.find(p => p.id === entry.labor_phase_id);
                return (
                  <div key={entry.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{phase?.name || 'Unknown Phase'}</div>
                        <div className="text-sm text-gray-600 mt-1">
                          Changed from{' '}
                          <span className="font-medium">
                            {entry.old_value === null ? 'Not Set' : entry.old_value ? 'Counts Against Target' : 'Excluded'}
                          </span>
                          {' '}to{' '}
                          <span className="font-medium">
                            {entry.new_value ? 'Counts Against Target' : 'Excluded'}
                          </span>
                        </div>
                        <div className="text-sm text-gray-500 mt-2">
                          <strong>Reason:</strong> {entry.reason}
                        </div>
                      </div>
                      <div className="text-right text-sm text-gray-500">
                        <div>{entry.admin_name}</div>
                        <div>{new Date(entry.created_at).toLocaleString()}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
