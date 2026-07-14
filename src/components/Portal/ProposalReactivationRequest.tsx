import { useState } from 'react';
import { RotateCcw, X, MessageSquare, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ProposalReactivationRequestProps {
  proposalId: string;
  proposalNumber: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ProposalReactivationRequest({
  proposalId,
  proposalNumber,
  onClose,
  onSuccess
}: ProposalReactivationRequestProps) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!message.trim()) {
      alert('Please enter a message explaining why you need this proposal reactivated.');
      return;
    }

    setSending(true);

    try {
      // Get proposal details
      const { data: proposal, error: proposalError } = await supabase
        .from('proposals')
        .select('created_by, contact_id, proposal_number')
        .eq('id', proposalId)
        .single();

      if (proposalError) throw proposalError;

      // Find or create message thread for this proposal
      let threadId: string;

      const { data: existingThread } = await supabase
        .from('message_threads')
        .select('id')
        .eq('proposal_id', proposalId)
        .eq('context_type', 'proposal')
        .single();

      if (existingThread) {
        threadId = existingThread.id;
      } else {
        // Create new thread
        const { data: newThread, error: threadError } = await supabase
          .from('message_threads')
          .insert({
            subject: `Reactivation Request: Proposal ${proposal.proposal_number}`,
            context_type: 'proposal',
            context_id: proposalId,
            proposal_id: proposalId,
            contact_id: proposal.contact_id,
            assigned_sales_rep_id: proposal.created_by,
            visibility: 'public',
            created_by: proposal.contact_id
          })
          .select('id')
          .single();

        if (threadError) throw threadError;
        threadId = newThread.id;
      }

      // Send the reactivation request message
      const { error: messageError } = await supabase
        .from('messages')
        .insert({
          thread_id: threadId,
          author_id: proposal.contact_id,
          author_name: 'Customer',
          author_type: 'customer',
          body: `**REACTIVATION REQUEST**\n\n${message}`,
          is_read: false,
          is_internal: false
        });

      if (messageError) throw messageError;

      // Send notification to sales rep
      const { error: notificationError } = await supabase
        .from('notifications')
        .insert({
          user_id: proposal.created_by,
          type: 'proposal_reactivation_request',
          title: 'Proposal Reactivation Requested',
          message: `Customer has requested reactivation of proposal ${proposal.proposal_number}`,
          related_id: proposalId
        });

      if (notificationError) console.error('Notification error:', notificationError);

      onSuccess?.();
      onClose();

      alert('Your reactivation request has been sent to your sales representative. They will review and respond shortly.');
    } catch (error) {
      console.error('Error sending reactivation request:', error);
      alert('Failed to send reactivation request. Please try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90dvh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <RotateCcw className="w-6 h-6 text-orange-600" />
            <h2 className="text-xl font-bold text-gray-900">Request Proposal Reactivation</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6">
          <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-semibold mb-1">This proposal has expired</p>
                <p>Pricing is no longer guaranteed. Your sales representative will need to review and may adjust pricing before reactivating this proposal.</p>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-2">
              Why do you need this proposal reactivated?
            </label>
            <textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Please explain why you need this proposal reactivated. This will help your sales representative prioritize your request."
              rows={5}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
            <p className="mt-1 text-xs text-gray-500">
              Your sales representative will be notified immediately.
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 flex-wrap">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending || !message.trim()}
              className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
            >
              {sending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <MessageSquare size={16} />
                  Send Request
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
