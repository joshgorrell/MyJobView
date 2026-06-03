import React from 'react';
import { AlertTriangle, GitBranch, Unlock, X } from 'lucide-react';

interface UnlockProposalModalProps {
  proposalNumber: string;
  onCreateRevision: () => void;
  onUnlockAndEdit: () => void;
  onClose: () => void;
}

export function UnlockProposalModal({
  proposalNumber,
  onCreateRevision,
  onUnlockAndEdit,
  onClose,
}: UnlockProposalModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl">
        <div className="border-b border-gray-700 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-500/10 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-yellow-500" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">Proposal is Live on Customer Portal</h2>
              <p className="text-sm text-gray-400">Proposal #{proposalNumber}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
            <p className="text-sm text-yellow-200">
              This proposal is currently visible to the customer on their portal. Any changes you make will be immediately visible to them.
            </p>
          </div>

          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <button
                onClick={onCreateRevision}
                className="group relative bg-blue-600 hover:bg-blue-700 text-white rounded-lg p-6 text-left transition-all border-2 border-transparent hover:border-blue-400"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <GitBranch className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-lg">Create Revision</h3>
                      <span className="text-xs bg-blue-400/20 text-blue-200 px-2 py-0.5 rounded">Recommended</span>
                    </div>
                    <p className="text-sm text-blue-100 mb-3">
                      Work privately on changes without affecting the live proposal
                    </p>
                    <ul className="space-y-1 text-xs text-blue-200">
                      <li className="flex items-center gap-2">
                        <div className="w-1 h-1 bg-blue-300 rounded-full"></div>
                        <span>Edit safely without customer seeing changes</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="w-1 h-1 bg-blue-300 rounded-full"></div>
                        <span>Promote to Live when ready</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="w-1 h-1 bg-blue-300 rounded-full"></div>
                        <span>Keep revision history</span>
                      </li>
                    </ul>
                  </div>
                </div>
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="text-xs font-medium text-blue-200">Click to continue →</div>
                </div>
              </button>

              <button
                onClick={onUnlockAndEdit}
                className="group relative bg-gray-700 hover:bg-gray-600 text-white rounded-lg p-6 text-left transition-all border-2 border-gray-600 hover:border-yellow-500"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-yellow-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Unlock className="w-5 h-5 text-yellow-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg mb-2">Unlock and Edit</h3>
                    <p className="text-sm text-gray-300 mb-3">
                      Edit the live proposal directly
                    </p>
                    <ul className="space-y-1 text-xs text-gray-400">
                      <li className="flex items-center gap-2">
                        <div className="w-1 h-1 bg-yellow-400 rounded-full"></div>
                        <span>Changes visible to customer immediately</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="w-1 h-1 bg-yellow-400 rounded-full"></div>
                        <span>No revision history created</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="w-1 h-1 bg-yellow-400 rounded-full"></div>
                        <span>Use for quick fixes only</span>
                      </li>
                    </ul>
                  </div>
                </div>
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="text-xs font-medium text-yellow-400">Click to continue →</div>
                </div>
              </button>
            </div>
          </div>

          <div className="bg-gray-700/50 rounded-lg p-4 border border-gray-600">
            <h4 className="text-sm font-medium text-white mb-2 flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-blue-400" />
              What are Revisions?
            </h4>
            <p className="text-xs text-gray-400 leading-relaxed">
              Revisions let you create alternative versions of a proposal (like "Budget Option" or "With Add-ons") and work on them privately. When you're ready, you can promote a revision to become the new Live version that customers see. This is the safest way to make changes to active proposals.
            </p>
          </div>
        </div>

        <div className="border-t border-gray-700 px-6 py-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
