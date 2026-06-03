import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { GitBranch, Check, ChevronDown, X } from 'lucide-react';

interface Revision {
  id: string;
  proposal_number: string;
  revision_name: string | null;
  revision_number: number;
  is_active_revision: boolean;
  is_revision: boolean;
  created_at: string;
  created_by_name: string | null;
}

interface ProposalRevisionSelectorProps {
  proposalId: string;
  currentRevisionName: string | null;
  isRevision: boolean;
  onRevisionChange: (newProposalId: string) => void;
}

export function ProposalRevisionSelector({
  proposalId,
  currentRevisionName,
  isRevision,
  onRevisionChange
}: ProposalRevisionSelectorProps) {
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadRevisions();
  }, [proposalId]);

  async function loadRevisions() {
    try {
      setLoading(true);

      // Get the root proposal ID
      const { data: currentProposal } = await supabase
        .from('proposals')
        .select('id, parent_proposal_id')
        .eq('id', proposalId)
        .maybeSingle();

      if (!currentProposal) return;

      const rootProposalId = currentProposal.parent_proposal_id || currentProposal.id;

      // Get all revisions including the root
      const { data, error } = await supabase
        .from('proposals')
        .select(`
          id,
          proposal_number,
          revision_name,
          revision_number,
          is_active_revision,
          is_revision,
          created_at,
          created_by_name
        `)
        .or(`id.eq.${rootProposalId},parent_proposal_id.eq.${rootProposalId}`)
        .order('revision_number', { ascending: true });

      if (error) throw error;

      setRevisions(data || []);
    } catch (error) {
      console.error('Error loading revisions:', error);
    } finally {
      setLoading(false);
    }
  }

  async function setActiveRevision(revisionId: string) {
    try {
      // Get root proposal ID
      const { data: currentProposal } = await supabase
        .from('proposals')
        .select('id, parent_proposal_id')
        .eq('id', proposalId)
        .maybeSingle();

      if (!currentProposal) return;

      const rootProposalId = currentProposal.parent_proposal_id || currentProposal.id;

      // Set all revisions to inactive
      await supabase
        .from('proposals')
        .update({ is_active_revision: false })
        .or(`id.eq.${rootProposalId},parent_proposal_id.eq.${rootProposalId}`);

      // Set selected revision as active
      await supabase
        .from('proposals')
        .update({ is_active_revision: true })
        .eq('id', revisionId);

      await loadRevisions();
      setShowDropdown(false);
    } catch (error) {
      console.error('Error setting active revision:', error);
    }
  }

  if (revisions.length <= 1) {
    return null;
  }

  const currentRevision = revisions.find(r => r.id === proposalId);
  const displayName = currentRevision?.is_revision
    ? (currentRevision.revision_name || `Revision ${currentRevision.revision_number}`)
    : 'Original Proposal';

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg border border-gray-600 transition-colors"
      >
        <GitBranch className="w-4 h-4" />
        <div className="flex flex-col items-start">
          <span className="text-xs text-gray-400">Current Revision</span>
          <span className="text-sm font-medium">{displayName}</span>
        </div>
        <ChevronDown className={`w-4 h-4 transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
      </button>

      {showDropdown && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowDropdown(false)}
          />
          <div className="absolute top-full right-0 mt-2 w-80 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
            <div className="p-3 border-b border-gray-700 bg-gray-900 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-blue-400" />
                <h3 className="font-semibold text-white">Proposal Revisions</h3>
              </div>
              <button
                onClick={() => setShowDropdown(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {revisions.map((revision) => {
                const isCurrentRevision = revision.id === proposalId;
                const revisionLabel = revision.is_revision
                  ? (revision.revision_name || `Revision ${revision.revision_number}`)
                  : 'Original Proposal';

                return (
                  <div
                    key={revision.id}
                    className={`p-4 border-b border-gray-700 transition-colors ${
                      isCurrentRevision
                        ? 'bg-blue-600/20 border-l-4 border-l-blue-500'
                        : 'hover:bg-gray-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`font-medium ${isCurrentRevision ? 'text-blue-300' : 'text-white'}`}>
                            {revisionLabel}
                          </span>
                          {revision.is_active_revision && (
                            <span className="px-2 py-0.5 bg-green-600 text-white text-xs font-medium rounded">
                              Active
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400">
                          {revision.proposal_number}
                        </div>
                        {revision.created_by_name && (
                          <div className="text-xs text-gray-500 mt-1">
                            Created by {revision.created_by_name}
                          </div>
                        )}
                        <div className="text-xs text-gray-500">
                          {new Date(revision.created_at).toLocaleDateString()} at{' '}
                          {new Date(revision.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {isCurrentRevision ? (
                          <Check className="w-5 h-5 text-blue-400 flex-shrink-0" />
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                onRevisionChange(revision.id);
                                setShowDropdown(false);
                              }}
                              className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                            >
                              View
                            </button>
                            {!revision.is_active_revision && (
                              <button
                                onClick={() => setActiveRevision(revision.id)}
                                className="text-xs px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
                                title="Set as active"
                              >
                                Set Active
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-3 bg-gray-900 border-t border-gray-700">
              <div className="text-xs text-gray-400">
                <strong>Active:</strong> The revision sent to customers
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
