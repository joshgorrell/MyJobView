import React, { useState, useEffect } from 'react';
import { Clock, DollarSign, FileText, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import ApprovalActionModal from './ApprovalActionModal';

export default function PendingApprovalActionsWidget() {
  const [pendingProposals, setPendingProposals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProposal, setSelectedProposal] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    loadPendingProposals();

    const subscription = supabase
      .channel('pending_approvals')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'proposals',
          filter: 'status=eq.approved_pending_action',
        },
        () => {
          loadPendingProposals();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const loadPendingProposals = async () => {
    try {
      const { data, error } = await supabase
        .from('proposals')
        .select(`
          *,
          contacts:contacts!proposals_contact_id_fkey (
            id,
            full_name,
            email,
            phone
          ),
          profiles:created_by (
            id,
            full_name
          )
        `)
        .eq('status', 'approved_pending_action')
        .eq('billing_action_taken', false)
        .order('approval_completed_at', { ascending: true });

      if (error) throw error;

      setPendingProposals(data || []);
    } catch (err) {
      console.error('Error loading pending proposals:', err);
    } finally {
      setLoading(false);
    }
  };

  const getTimeAgo = (date: string) => {
    const now = new Date();
    const then = new Date(date);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else {
      return `${diffDays}d ago`;
    }
  };

  const getUrgencyColor = (date: string) => {
    const now = new Date();
    const then = new Date(date);
    const diffHours = (now.getTime() - then.getTime()) / (1000 * 60 * 60);

    if (diffHours >= 4) {
      return 'bg-red-50 border-red-200';
    } else if (diffHours >= 2) {
      return 'bg-yellow-50 border-yellow-200';
    } else {
      return 'bg-blue-50 border-blue-200';
    }
  };

  const getUrgencyIndicator = (date: string) => {
    const now = new Date();
    const then = new Date(date);
    const diffHours = (now.getTime() - then.getTime()) / (1000 * 60 * 60);

    if (diffHours >= 4) {
      return (
        <div className="flex items-center gap-1 text-red-600 text-xs font-medium">
          <AlertCircle className="w-4 h-4" />
          <span>Urgent</span>
        </div>
      );
    } else if (diffHours >= 2) {
      return (
        <div className="flex items-center gap-1 text-yellow-600 text-xs font-medium">
          <Clock className="w-4 h-4" />
          <span>Follow up soon</span>
        </div>
      );
    } else {
      return (
        <div className="flex items-center gap-1 text-blue-600 text-xs font-medium">
          <CheckCircle className="w-4 h-4" />
          <span>Recent</span>
        </div>
      );
    }
  };

  const getRecommendedAction = (proposal: any) => {
    if (proposal.require_deposit) {
      return {
        icon: <DollarSign className="w-4 h-4" />,
        text: 'Bill Deposit',
        color: 'text-green-600',
      };
    } else if (proposal.acceptance_methods?.includes('purchase_order')) {
      return {
        icon: <FileText className="w-4 h-4" />,
        text: 'Add PO',
        color: 'text-blue-600',
      };
    } else {
      return {
        icon: <CheckCircle className="w-4 h-4" />,
        text: 'Complete',
        color: 'text-gray-600',
      };
    }
  };

  const handleActionClick = (proposal: any) => {
    setSelectedProposal(proposal);
    setShowModal(true);
  };

  const handleModalClose = () => {
    setShowModal(false);
    setSelectedProposal(null);
    loadPendingProposals();
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            <div className="h-20 bg-gray-100 rounded"></div>
            <div className="h-20 bg-gray-100 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (pendingProposals.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Pending Approval Actions</h3>
          <span className="text-sm text-gray-500">0 pending</span>
        </div>
        <div className="text-center py-8">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <p className="text-gray-600">All caught up! No proposals waiting for action.</p>
        </div>
      </div>
    );
  }

  const totalDepositValue = pendingProposals
    .filter((p) => p.require_deposit)
    .reduce((sum, p) => sum + (p.deposit_amount_due || 0), 0);

  return (
    <>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Pending Approval Actions</h3>
          <div className="flex items-center gap-4">
            {totalDepositValue > 0 && (
              <div className="text-right">
                <p className="text-xs text-gray-500">Total Deposits Pending</p>
                <p className="text-lg font-semibold text-green-600">
                  ${totalDepositValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
            )}
            <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm font-medium">
              {pendingProposals.length} pending
            </span>
          </div>
        </div>

        <div className="space-y-3">
          {pendingProposals.map((proposal) => {
            const action = getRecommendedAction(proposal);
            return (
              <div
                key={proposal.id}
                className={`border-2 rounded-lg p-4 transition-all hover:shadow-md ${getUrgencyColor(
                  proposal.approval_completed_at
                )}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold text-gray-900 truncate">
                        {proposal.proposal_number}
                      </h4>
                      {getUrgencyIndicator(proposal.approval_completed_at)}
                    </div>

                    <p className="text-sm text-gray-700 mb-1">
                      {proposal.contacts?.full_name || 'Unknown Customer'}
                    </p>

                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Approved {getTimeAgo(proposal.approval_completed_at)}
                      </span>
                      <span className="font-medium">
                        ${proposal.total?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                      {proposal.require_deposit && (
                        <span className="text-green-600 font-medium">
                          Deposit: ${proposal.deposit_amount_due?.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => handleActionClick(proposal)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                      proposal.require_deposit
                        ? 'bg-green-600 text-white hover:bg-green-700'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {action.icon}
                    <span>{action.text}</span>
                  </button>
                </div>

                {proposal.profiles?.full_name && (
                  <div className="mt-2 pt-2 border-t border-gray-200">
                    <p className="text-xs text-gray-500">
                      Created by: {proposal.profiles.full_name}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {showModal && selectedProposal && (
        <ApprovalActionModal
          proposal={selectedProposal}
          contact={selectedProposal.contacts}
          onClose={handleModalClose}
          onComplete={handleModalClose}
        />
      )}
    </>
  );
}
