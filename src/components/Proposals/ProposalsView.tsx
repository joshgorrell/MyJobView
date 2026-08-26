import React, { useState, useEffect } from 'react';
import ProposalsList from './ProposalsList';
import ProposalBuilderCompact from './ProposalBuilderCompact';
import ProposalWorkflowBar from './ProposalWorkflowBar';
import CreateProposalModal from './CreateProposalModal';
import VideoLibrary from '../Sales/VideoLibrary';
import type { ProposalPrefill } from '../AIAssistant/AIAssistant';

interface ProposalsViewProps {
  isStandalone?: boolean; openProposalId?: string | null; onProposalOpened?: () => void; onSelectSalesOrder?: (salesOrderId: string) => void;
  aiPrefill?: ProposalPrefill | null; onAiPrefillConsumed?: () => void; onNavigateToSalesOrders?: () => void; onNavigateToSalesStats?: () => void;
  autoOpenQA?: boolean; autoThreadId?: string | null;
}

export default function ProposalsView({ isStandalone = false, openProposalId, onProposalOpened, onSelectSalesOrder, aiPrefill, onAiPrefillConsumed, onNavigateToSalesOrders, onNavigateToSalesStats, autoOpenQA = false, autoThreadId = null }: ProposalsViewProps) {
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(() => isStandalone ? new URLSearchParams(window.location.search).get('id') : null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showVideoLibrary, setShowVideoLibrary] = useState(false);
  const [targetRoomIds, setTargetRoomIds] = useState<Set<string>>(new Set());
  const [pendingPrefillRooms, setPendingPrefillRooms] = useState<ProposalPrefill['rooms'] | undefined>(undefined);

  const urlOpenQA = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('openQA') === 'true';
  const urlThreadId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('threadId') : null;
  const effectiveAutoOpenQA = autoOpenQA || urlOpenQA;
  const effectiveAutoThreadId = autoThreadId || urlThreadId;

  function navigateToProposal(proposalId: string) {
    setSelectedProposalId(proposalId);
    if (isStandalone) {
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('id', proposalId);
      window.history.pushState({}, '', newUrl);
    }
  }

  useEffect(() => {
    if (!isStandalone) return;
    const handlePopState = () => setSelectedProposalId(new URLSearchParams(window.location.search).get('id'));
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isStandalone]);

  useEffect(() => {
    const handleAutoRevision = (event: Event) => {
      const proposalId = (event as CustomEvent<{ proposalId?: string }>).detail?.proposalId;
      if (proposalId) navigateToProposal(proposalId);
    };
    window.addEventListener('proposal-auto-revision-created', handleAutoRevision);
    return () => window.removeEventListener('proposal-auto-revision-created', handleAutoRevision);
  }, [isStandalone]);

  useEffect(() => { if (openProposalId && !selectedProposalId) { setSelectedProposalId(openProposalId); onProposalOpened?.(); } }, [openProposalId, selectedProposalId, onProposalOpened]);
  useEffect(() => { if (aiPrefill) setShowCreateModal(true); }, [aiPrefill]);

  function handleProposalCreated(proposalId: string, prefillRooms?: ProposalPrefill['rooms']) {
    setShowCreateModal(false); setPendingPrefillRooms(prefillRooms); onAiPrefillConsumed?.(); navigateToProposal(proposalId);
  }

  if (selectedProposalId) return (
    <div className="w-full h-full flex flex-col min-h-0 bg-gray-900">
      <ProposalWorkflowBar proposalId={selectedProposalId} />
      <div className="min-h-0 flex-1">
        <ProposalBuilderCompact proposalId={selectedProposalId}
          onBack={() => { setSelectedProposalId(null); if (isStandalone) window.close(); }}
          onNavigateToSalesOrder={(salesOrderId) => { setSelectedProposalId(null); onSelectSalesOrder?.(salesOrderId); }}
          targetRoomIds={targetRoomIds} onTargetRoomsChange={setTargetRoomIds} isStandalone={isStandalone}
          aiPrefillRooms={pendingPrefillRooms} autoOpenQA={effectiveAutoOpenQA} autoThreadId={effectiveAutoThreadId}
          onProposalIdChange={navigateToProposal}
        />
      </div>
    </div>
  );

  if (isStandalone) return <div className="h-screen flex items-center justify-center bg-gray-900"><div className="text-center"><div className="text-yellow-400 text-lg mb-2">No Proposal ID</div><div className="text-gray-400 text-sm mb-4">This window requires a proposal ID in the URL</div><button onClick={() => window.close()} className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600">Close Window</button></div></div>;

  if (showVideoLibrary) return <div className="w-full h-full"><div className="bg-gray-900 border-b border-gray-700 px-4 py-2"><button onClick={() => setShowVideoLibrary(false)} className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">&larr; Back to Proposals</button></div><VideoLibrary /></div>;

  return <div className="w-full space-y-6">
    <ProposalsList onSelectProposal={setSelectedProposalId} onCreateNew={() => setShowCreateModal(true)} onSelectSalesOrder={onSelectSalesOrder} onNavigateToSalesOrders={onNavigateToSalesOrders} onNavigateToSalesStats={onNavigateToSalesStats} onOpenVideoLibrary={() => setShowVideoLibrary(true)} />
    {showCreateModal && <CreateProposalModal onClose={() => { setShowCreateModal(false); onAiPrefillConsumed?.(); }} onCreated={handleProposalCreated} prefill={aiPrefill ?? undefined} contactId={aiPrefill?.contactId} leadId={aiPrefill?.leadId} />}
  </div>;
}
