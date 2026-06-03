import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { X, RotateCcw, Globe, Clock, User, DollarSign, CheckCircle, AlertTriangle, FileText } from 'lucide-react';
import { format } from 'date-fns';

interface PortalVersion {
  id: string;
  proposal_id: string;
  portal_version_number: number;
  submitted_at: string;
  title: string | null;
  total: number | null;
  notes: string | null;
  submitted_by_profile?: {
    full_name?: string;
    first_name?: string;
    last_name?: string;
    username?: string;
  } | null;
}

interface PortalVersionHistoryModalProps {
  proposalId: string;
  proposalNumber: string;
  currentPortalVersion: number;
  onClose: () => void;
  onRestored: () => void;
}

export function PortalVersionHistoryModal({
  proposalId,
  proposalNumber,
  currentPortalVersion,
  onClose,
  onRestored,
}: PortalVersionHistoryModalProps) {
  const [versions, setVersions] = useState<PortalVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<PortalVersion | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    loadVersions();
  }, [proposalId]);

  async function loadVersions() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('proposal_portal_versions')
        .select('*, submitted_by_profile:submitted_by(full_name, first_name, last_name, username)')
        .eq('proposal_id', proposalId)
        .order('portal_version_number', { ascending: false });

      if (error) throw error;
      setVersions(data || []);
    } catch (err) {
      console.error('Error loading portal versions:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleRestore(version: PortalVersion) {
    setRestoring(version.id);
    try {
      const { data, error } = await supabase.rpc('restore_portal_version', {
        portal_version_id_param: version.id,
      });

      if (error) throw error;

      if (data?.success) {
        setToast(`Version ${version.portal_version_number} restored. Review and re-submit when ready.`);
        setTimeout(() => {
          setToast(null);
          onRestored();
        }, 2500);
      } else {
        alert(data?.error || 'Failed to restore version');
      }
    } catch (err: any) {
      console.error('Error restoring portal version:', err);
      alert('Failed to restore version: ' + err.message);
    } finally {
      setRestoring(null);
      setConfirmRestore(null);
    }
  }

  function getSubmitterName(v: PortalVersion): string {
    const p = v.submitted_by_profile;
    if (!p) return 'Unknown';
    if (p.full_name) return p.full_name;
    if (p.first_name || p.last_name) return [p.first_name, p.last_name].filter(Boolean).join(' ');
    return p.username || 'Unknown';
  }

  function formatCurrency(val: number | null): string {
    if (val == null) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl border border-gray-700 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="border-b border-gray-700 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
              <RotateCcw className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Portal Version History</h2>
              <p className="text-sm text-gray-400">Proposal #{proposalNumber}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1 rounded hover:bg-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Info bar */}
        <div className="px-6 py-3 bg-gray-750 border-b border-gray-700 flex-shrink-0">
          <p className="text-xs text-gray-400">
            Each entry below is a snapshot of the proposal as it was published to the customer portal.
            Restoring a version sets the proposal back to that state in an unlocked, editable state so you can review before re-submitting.
          </p>
        </div>

        {/* Version List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : versions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="w-10 h-10 text-gray-600 mb-3" />
              <p className="text-gray-400 text-sm">No portal versions recorded yet.</p>
              <p className="text-gray-500 text-xs mt-1">Versions are saved each time this proposal is submitted to the portal.</p>
            </div>
          ) : (
            versions.map((v) => {
              const isCurrent = v.portal_version_number === currentPortalVersion;
              const isRestoring = restoring === v.id;

              return (
                <div
                  key={v.id}
                  className={`rounded-lg border p-4 transition-colors ${
                    isCurrent
                      ? 'bg-green-500/5 border-green-500/30'
                      : 'bg-gray-750 border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        isCurrent ? 'bg-green-500/15' : 'bg-gray-700'
                      }`}>
                        {isCurrent ? (
                          <Globe className="w-4.5 h-4.5 text-green-400" />
                        ) : (
                          <span className="text-sm font-bold text-gray-400">v{v.portal_version_number}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-white">
                            Version {v.portal_version_number}
                          </span>
                          {isCurrent && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/15 text-green-400 border border-green-500/25">
                              <CheckCircle className="w-3 h-3" />
                              Current
                            </span>
                          )}
                        </div>
                        {v.title && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate">{v.title}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {format(new Date(v.submitted_at), 'MMM d, yyyy h:mm a')}
                          </span>
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {getSubmitterName(v)}
                          </span>
                          {v.total != null && (
                            <span className="flex items-center gap-1 text-gray-400">
                              <DollarSign className="w-3 h-3" />
                              {formatCurrency(v.total)}
                            </span>
                          )}
                        </div>
                        {v.notes && (
                          <p className="mt-1.5 text-xs text-gray-400 italic">"{v.notes}"</p>
                        )}
                      </div>
                    </div>

                    {!isCurrent && (
                      <button
                        onClick={() => setConfirmRestore(v)}
                        disabled={isRestoring || restoring !== null}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-medium transition-colors flex-shrink-0"
                      >
                        {isRestoring ? (
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <RotateCcw className="w-3.5 h-3.5" />
                        )}
                        <span>Restore</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="border-t border-gray-700 px-6 py-4 flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Confirm Restore Dialog */}
      {confirmRestore && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] p-4">
          <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-md border border-gray-700 p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 bg-yellow-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">
                  Restore Portal Version {confirmRestore.portal_version_number}?
                </h3>
                <p className="text-sm text-gray-400 mt-1">
                  The proposal will be reset to this version in an unlocked, editable state. It will be
                  hidden from the customer portal until you review and re-submit.
                </p>
              </div>
            </div>
            <div className="bg-gray-700/50 rounded-lg p-3 mb-5 text-xs text-gray-300 space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">Version</span>
                <span>v{confirmRestore.portal_version_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Submitted</span>
                <span>{format(new Date(confirmRestore.submitted_at), 'MMM d, yyyy')}</span>
              </div>
              {confirmRestore.total != null && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Total at that time</span>
                  <span>{formatCurrency(confirmRestore.total)}</span>
                </div>
              )}
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmRestore(null)}
                className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRestore(confirmRestore)}
                disabled={restoring !== null}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {restoring ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <RotateCcw className="w-4 h-4" />
                )}
                Restore Version
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] bg-green-700 text-white px-5 py-3 rounded-lg shadow-xl flex items-center gap-2 text-sm font-medium">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          {toast}
        </div>
      )}
    </div>
  );
}
