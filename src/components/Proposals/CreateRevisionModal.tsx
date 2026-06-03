import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { FileEdit, X, AlertCircle } from 'lucide-react';

interface CreateRevisionModalProps {
  proposalId: string;
  currentTitle: string;
  onClose: () => void;
  onSuccess: (newRevisionId?: string) => void;
}

export function CreateRevisionModal({
  proposalId,
  currentTitle,
  onClose,
  onSuccess
}: CreateRevisionModalProps) {
  const { profile } = useAuth();
  const [revisionNotes, setRevisionNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreateRevision() {
    try {
      setLoading(true);
      setError(null);

      if (!revisionNotes.trim()) {
        setError('Please provide revision notes describing the changes');
        setLoading(false);
        return;
      }

      if (!profile?.id) {
        setError('User profile not loaded. Please refresh the page.');
        setLoading(false);
        return;
      }

      // Use the RPC function to create a new revision
      console.log('Calling create_proposal_revision with:', {
        p_proposal_id: proposalId,
        p_revision_name: revisionNotes.trim(),
        p_created_by: profile.id
      });

      const { data: newRevisionId, error: createError } = await supabase.rpc('create_proposal_revision', {
        p_proposal_id: proposalId,
        p_revision_name: revisionNotes.trim(),
        p_created_by: profile.id
      });

      console.log('RPC result:', { data: newRevisionId, error: createError });

      if (createError) {
        console.error('RPC error details:', {
          message: createError.message,
          details: createError.details,
          hint: createError.hint,
          code: createError.code
        });
        throw createError;
      }

      onSuccess(newRevisionId);
    } catch (error: any) {
      console.error('Error creating revision:', error);
      // More detailed error message
      const errorMsg = error?.message || error?.error_description || error?.hint || JSON.stringify(error) || 'Failed to create revision';
      console.error('Detailed error:', errorMsg);
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg max-w-2xl w-full border border-gray-700">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-600/20 rounded-lg flex items-center justify-center">
              <FileEdit className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">Save as New Revision</h2>
              <p className="text-sm text-gray-400">Create a snapshot of current changes</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg flex items-start gap-2 text-red-300 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <h3 className="font-medium text-blue-300 mb-2">About Revisions</h3>
            <p className="text-sm text-gray-300">
              Revisions allow you to save snapshots of your proposal at different stages.
              You can view revision history and restore any previous revision if needed.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Current Proposal
            </label>
            <div className="px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white">
              {currentTitle}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Revision Notes <span className="text-red-400">*</span>
            </label>
            <textarea
              value={revisionNotes}
              onChange={(e) => setRevisionNotes(e.target.value)}
              placeholder="Describe what changes you made in this revision..."
              rows={4}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            />
            <p className="text-xs text-gray-400 mt-1">
              These notes will help you identify this version later
            </p>
          </div>

          <div className="p-4 bg-gray-700/50 rounded-lg border border-gray-600">
            <h4 className="text-sm font-medium text-gray-300 mb-2">Revision will include:</h4>
            <ul className="text-sm text-gray-400 space-y-1">
              <li>• All current proposal details</li>
              <li>• Line items and pricing</li>
              <li>• Terms and conditions</li>
              <li>• Current status and settings</li>
            </ul>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleCreateRevision}
            disabled={loading || !revisionNotes.trim()}
            className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Saving...
              </>
            ) : (
              <>
                <FileEdit className="w-4 h-4" />
                Save Revision
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
