import { useState, useEffect } from 'react';
import { History, Eye, RotateCcw, X, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import ConfirmModal from '../ui/ConfirmModal';

interface ProposalVersion {
  id: string;
  version_number: number;
  snapshot: any;
  created_at: string;
  created_by_name: string;
  change_summary?: string;
}

interface ProposalVersionHistoryProps {
  proposalId: string;
  onClose: () => void;
  onRestore?: (versionId: string) => void;
}

export function ProposalVersionHistory({ proposalId, onClose, onRestore }: ProposalVersionHistoryProps) {
  const [versions, setVersions] = useState<ProposalVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<ProposalVersion | null>(null);
  const [compareVersion, setCompareVersion] = useState<ProposalVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [showComparison, setShowComparison] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  useEffect(() => {
    loadVersions();
  }, [proposalId]);

  async function loadVersions() {
    try {
      const { data, error } = await supabase
        .from('proposal_versions')
        .select(`
          id,
          version_number,
          snapshot,
          created_at,
          change_summary,
          created_by:profiles!proposal_versions_created_by_fkey(full_name)
        `)
        .eq('proposal_id', proposalId)
        .order('version_number', { ascending: false });

      if (error) throw error;

      const formattedVersions = (data || []).map(v => ({
        ...v,
        created_by_name: v.created_by?.full_name || 'Unknown'
      }));

      setVersions(formattedVersions);
    } catch (error) {
      console.error('Error loading versions:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleRestore(version: ProposalVersion) {
    setConfirmModal({
      title: 'Restore Version',
      message: `Are you sure you want to restore version ${version.version_number}? This will create a new version with this data.`,
      onConfirm: async () => {
        setConfirmModal(null);
        await doRestore(version);
      }
    });
  }

  async function doRestore(version: ProposalVersion) {
    try {
      const snapshot = version.snapshot;

      const { error } = await supabase
        .from('proposals')
        .update({
          contact_id: snapshot.contact_id,
          title: snapshot.title,
          description: snapshot.description,
          total: snapshot.total,
          valid_until: snapshot.valid_until,
          terms: snapshot.terms
        })
        .eq('id', proposalId);

      if (error) throw error;

      alert('Version restored successfully');
      if (onRestore) {
        onRestore(version.id);
      }
      onClose();
    } catch (error) {
      console.error('Error restoring version:', error);
      alert('Failed to restore version');
    }
  }

  function formatDate(dateString: string) {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  function calculateDiff(v1: any, v2: any): string[] {
    const changes: string[] = [];

    if (v1.title !== v2.title) {
      changes.push(`Title changed from "${v1.title}" to "${v2.title}"`);
    }
    if (v1.total !== v2.total) {
      changes.push(`Total changed from $${v1.total} to $${v2.total}`);
    }
    if (v1.status !== v2.status) {
      changes.push(`Status changed from "${v1.status}" to "${v2.status}"`);
    }
    if (v1.description !== v2.description) {
      changes.push('Description updated');
    }

    return changes;
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-gray-600 mt-4">Loading version history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <History className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Version History</h2>
              <p className="text-sm text-gray-600">{versions.length} version(s) saved</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {versions.length === 0 ? (
            <div className="text-center py-12">
              <History className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-300">No version history available</p>
            </div>
          ) : (
            <div className="space-y-3">
              {versions.map((version, index) => {
                const isSelected = selectedVersion?.id === version.id;
                const isCompare = compareVersion?.id === version.id;
                const prevVersion = versions[index + 1];

                return (
                  <div
                    key={version.id}
                    className={`border rounded-lg p-4 transition-colors ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : isCompare
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded">
                            v{version.version_number}
                          </span>
                          {index === 0 && (
                            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">
                              Current
                            </span>
                          )}
                          <span className="text-sm text-gray-600">
                            {formatDate(version.created_at)}
                          </span>
                        </div>

                        <p className="text-sm text-gray-700 mb-1">
                          By: <span className="font-medium">{version.created_by_name}</span>
                        </p>

                        {version.change_summary && (
                          <p className="text-sm text-gray-600 mb-2">{version.change_summary}</p>
                        )}

                        {prevVersion && (
                          <div className="mt-2 pt-2 border-t border-gray-200">
                            <p className="text-xs font-medium text-gray-700 mb-1">Changes from v{prevVersion.version_number}:</p>
                            <ul className="text-xs text-gray-600 space-y-0.5">
                              {calculateDiff(prevVersion.snapshot, version.snapshot).map((change, i) => (
                                <li key={i} className="flex items-start gap-1">
                                  <ChevronRight className="w-3 h-3 flex-shrink-0 mt-0.5" />
                                  <span>{change}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-2">
                        <button
                          onClick={() => setSelectedVersion(isSelected ? null : version)}
                          className={`px-3 py-1.5 rounded text-sm flex items-center gap-1 ${
                            isSelected
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          <Eye className="w-4 h-4" />
                          {isSelected ? 'Hide' : 'View'}
                        </button>

                        {index > 0 && (
                          <button
                            onClick={() => handleRestore(version)}
                            className="px-3 py-1.5 bg-orange-100 text-orange-700 rounded text-sm hover:bg-orange-200 flex items-center gap-1"
                          >
                            <RotateCcw className="w-4 h-4" />
                            Restore
                          </button>
                        )}
                      </div>
                    </div>

                    {isSelected && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <div className="bg-white rounded p-4 border border-gray-200">
                          <h4 className="font-medium text-gray-900 mb-3">Version Details</h4>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-gray-600">Title:</span>
                              <p className="font-medium text-gray-900">{version.snapshot.title}</p>
                            </div>
                            <div>
                              <span className="text-gray-600">Status:</span>
                              <p className="font-medium text-gray-900 capitalize">{version.snapshot.status}</p>
                            </div>
                            <div>
                              <span className="text-gray-600">Total Amount:</span>
                              <p className="font-medium text-gray-900">${version.snapshot.total}</p>
                            </div>
                            <div>
                              <span className="text-gray-600">Valid Until:</span>
                              <p className="font-medium text-gray-900">
                                {version.snapshot.valid_until ? new Date(version.snapshot.valid_until).toLocaleDateString() : 'N/A'}
                              </p>
                            </div>
                          </div>
                          {version.snapshot.description && (
                            <div className="mt-3">
                              <span className="text-gray-600 text-sm">Description:</span>
                              <p className="text-gray-900 mt-1">{version.snapshot.description}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Versions are automatically saved when you make changes
            </p>
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
            >
              Close
            </button>
          </div>
        </div>
      </div>
      <ConfirmModal
        isOpen={!!confirmModal}
        title={confirmModal?.title || ''}
        message={confirmModal?.message || ''}
        variant="warning"
        onConfirm={() => confirmModal?.onConfirm()}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}
