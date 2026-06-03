import React from 'react';
import { Plus } from 'lucide-react';

interface ProposalsListProps {
  onSelectProposal: (proposalId: string) => void;
  onCreateNew: () => void;
}

export default function ProposalsListSimple({ onSelectProposal, onCreateNew }: ProposalsListProps) {
  return (
    <div className="h-full flex flex-col bg-gray-900 p-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white mb-4">Proposals - Simplified Test View</h1>
        <p className="text-gray-400 mb-4">This is a test version to verify the page loads.</p>
        <button
          onClick={onCreateNew}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 mx-auto"
        >
          <Plus size={20} />
          Create New Proposal
        </button>
        <div className="mt-8 text-gray-500 text-sm">
          If you see this, the routing and component loading works.
          <br />
          The issue is in the full ProposalsList component.
        </div>
      </div>
    </div>
  );
}
