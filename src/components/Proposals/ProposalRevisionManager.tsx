import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Proposal } from '../../lib/types';
import { GitBranch, Plus, Check, Eye, EyeOff, Star, CreditCard as Edit2, Trash2, X, CheckCircle2, Globe } from 'lucide-react';
import ConfirmModal from '../ui/ConfirmModal';

interface ProposalRevisionManagerProps {
  proposalId: string;
  onSelectRevision: (revisionId: string) => void;
  onPromoteToLive?: (revisionId: string) => void;
  onClose: () => void;
}

export default function ProposalRevisionManager({
  proposalId,
  onSelectRevision,
  onPromoteToLive,
  onClose
}: ProposalRevisionManagerProps) {
  const [revisions, setRevisions] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRevisionName, setNewRevisionName] = useState('');
  const [creating, setCreating] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  useEffect(() => {
    loadRevisions();
  }, [proposalId]);

  async function loadRevisions() {
    try {
      const rootId = await getRootProposalId(proposalId);

      const { data, error } = await supabase
        .from('proposals')
        .select('*')
        .or(`id.eq.${rootId},parent_proposal_id.eq.${rootId}`)
        .order('revision_number', { ascending: true });

      if (error) throw error;
      setRevisions(data || []);
    } catch (error) {
      console.error('Error loading revisions:', error);
    } finally {
      setLoading(false);
    }
  }

  async function getRootProposalId(id: string): Promise<string> {
    const { data, error } = await supabase.rpc('get_root_proposal_id', {
      p_proposal_id: id
    });

    if (error) {
      console.error('Error getting root proposal:', error);
      return id;
    }

    return data || id;
  }

  async function handleCreateRevision() {
    if (!newRevisionName.trim()) return;

    try {
      setCreating(true);
      const { data: userData } = await supabase.auth.getUser();

      const { data, error } = await supabase.rpc('create_proposal_revision', {
        p_proposal_id: proposalId,
        p_revision_name: newRevisionName.trim(),
        p_created_by: userData?.user?.id
      });

      if (error) throw error;

      setShowCreateModal(false);
      setNewRevisionName('');
      await loadRevisions();

      if (data) {
        onSelectRevision(data);
      }
    } catch (error) {
      console.error('Error creating revision:', error);
      alert('Failed to create revision');
    } finally {
      setCreating(false);
    }
  }

  async function handleSetActive(revisionId: string) {
    // Check if any revision is currently live on the portal
    const liveRevision = revisions.find(r => r.is_portal_visible);

    if (liveRevision && liveRevision.id !== revisionId) {
      setConfirmModal({
        title: 'Take portal offline?',
        message: 'The customer portal is currently live. Switching the active revision will take it offline. You will need to review the portal view and turn it back on when ready.',
        onConfirm: async () => {
          setConfirmModal(null);
          // Hide the currently live revision before switching
          await supabase
            .from('proposals')
            .update({ is_portal_visible: false })
            .eq('id', liveRevision.id);
          await doSetActive(revisionId);
        },
      });
      return;
    }

    await doSetActive(revisionId);
  }

  async function doSetActive(revisionId: string) {
    try {
      const { error } = await supabase.rpc('set_active_revision', {
        p_proposal_id: revisionId
      });

      if (error) throw error;
      await loadRevisions();
    } catch (error) {
      console.error('Error setting active revision:', error);
      alert('Failed to set active revision');
    }
  }

  async function handleTogglePortalVisibility(revisionId: string) {
    try {
      const { error } = await supabase.rpc('toggle_revision_portal_visibility', {
        p_proposal_id: revisionId
      });

      if (error) throw error;
      await loadRevisions();
    } catch (error) {
      console.error('Error toggling visibility:', error);
      alert('Failed to toggle portal visibility');
    }
  }

  async function handleDeleteRevision(revisionId: string) {
    setConfirmModal({
      title: 'Delete Revision',
      message: 'Are you sure you want to delete this revision? This cannot be undone.',
      onConfirm: async () => {
        setConfirmModal(null);
        await doDeleteRevision(revisionId);
      }
    });
  }

  async function doDeleteRevision(revisionId: string) {
    try {
      const { error } = await supabase
        .from('proposals')
        .delete()
        .eq('id', revisionId);

      if (error) throw error;
      await loadRevisions();
    } catch (error) {
      console.error('Error deleting revision:', error);
      alert('Failed to delete revision');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-gray-400">Loading revisions...</div>
      </div>
    );
  }

  const activeRevision = revisions.find(r => r.is_active_revision);

  return (
    <div className="bg-white rounded-lg shadow-xl w-full max-w-full sm:max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GitBranch className="w-5 h-5 text-blue-600" />
          <div>
            <h2 className="text-lg font-bold text-gray-900">Proposal Revisions</h2>
            <p className="text-sm text-gray-500">{revisions.length} revision{revisions.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} />
            <span>New Revision</span>
          </button>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-3">
          {revisions.map((revision) => (
            <div
              key={revision.id}
              className={`border-2 rounded-lg transition-all ${
                revision.is_active_revision
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white'
              }`}
            >
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-gray-900">
                        {revision.is_revision ? revision.revision_name : 'Original Proposal'}
                      </h3>
                      <span className="text-xs text-gray-500">
                        Rev {revision.revision_number || 1}
                      </span>
                      {revision.is_active_revision && revision.is_portal_visible && (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-green-600 text-white text-xs rounded-full">
                          <Globe size={10} />
                          Live on Portal
                        </span>
                      )}
                      {revision.is_active_revision && !revision.is_portal_visible && (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                          <Star size={10} />
                          Active
                        </span>
                      )}
                      {!revision.is_active_revision && revision.is_portal_visible && (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-gray-200 text-gray-700 text-xs rounded-full">
                          <Eye size={10} />
                          Visible
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600">
                      <div>Total: ${revision.total?.toFixed(2) || '0.00'}</div>
                      <div className="text-xs text-gray-500">
                        Created {new Date(revision.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 px-4 pb-3 border-t border-gray-200 pt-2 flex-wrap">
                <button
                  onClick={() => onSelectRevision(revision.id)}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors font-medium"
                >
                  <Edit2 size={14} />
                  Edit
                </button>
                {!revision.is_active_revision && onPromoteToLive && (
                  <button
                    onClick={() => {
                      onPromoteToLive(revision.id);
                      onClose();
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-medium"
                  >
                    <CheckCircle2 size={14} />
                    Promote to Live
                  </button>
                )}
                {!revision.is_active_revision && revision.is_revision && (
                  <button
                    onClick={() => handleDeleteRevision(revision.id)}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium ml-auto"
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-full sm:max-w-md">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">Create New Revision</h3>
              <p className="text-sm text-gray-500 mt-1">
                This will create a copy of the current proposal as a new revision
              </p>
            </div>

            <div className="p-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Revision Name
              </label>
              <input
                type="text"
                value={newRevisionName}
                onChange={(e) => setNewRevisionName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateRevision()}
                placeholder="e.g., Option A, Budget Version, With Upgrades"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewRevisionName('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateRevision}
                disabled={!newRevisionName.trim() || creating}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? 'Creating...' : 'Create Revision'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!confirmModal}
        title={confirmModal?.title || ''}
        message={confirmModal?.message || ''}
        variant="danger"
        onConfirm={() => confirmModal?.onConfirm()}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}
