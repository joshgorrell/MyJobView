import React, { useState, useEffect, useRef } from 'react';
import { ProposalWithDetails } from '../../lib/types';
import { Save, Send, Eye, DollarSign, Users, RefreshCw, Clock, Mail, MessageSquare, RotateCcw, ChevronDown, ExternalLink, Activity, X, Check, Download, Globe, EyeOff, CreditCard as Edit2, Calendar, Ban, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import ResubmitProposalModal from './ResubmitProposalModal';
import { ProposalQA } from './ProposalQA';
import { ProposalSubmissionModal } from './ProposalSubmissionModal';
import { ReactivateProposalModal } from './ReactivateProposalModal';
import ConfirmModal from '../ui/ConfirmModal';

interface ProposalSummaryProps {
  proposal: ProposalWithDetails;
  onSave?: () => void;
  changeOrderMode?: boolean;
}

// Store override state outside component to persist across remounts
const statusOverrides = new Map<string, string>();

const DECLINE_REASON_LABELS: Record<string, string> = {
  price_too_high: 'Price Too High',
  went_with_competitor: 'Went with a Competitor',
  project_cancelled: 'Project Cancelled',
  no_response: 'No Response / Unresponsive',
  timing: 'Not the Right Time',
  budget_cut: 'Budget Cut',
  scope_change: 'Scope Changed / Not What Was Expected',
  changed_mind: 'Changed Mind',
  dont_want_rep: 'Does Not Want to Work with This Rep',
  dont_want_company: 'Does Not Want to Work with This Company',
  duplicate: 'Duplicate Proposal',
  customer_request: 'Customer Requested Cancellation',
  error: 'Created in Error',
  replaced_by_revision: 'Replaced by Revision',
  other: 'Other',
};

export default function ProposalSummary({ proposal, onSave, changeOrderMode = false }: ProposalSummaryProps) {
  const { profile } = useAuth();
  const [taxRate, setTaxRate] = useState(proposal.tax_rate);
  const [depositPercent, setDepositPercent] = useState(proposal.deposit_percent);
  const [currentStatus, setCurrentStatus] = useState(() => {
    // Check if there's an override for this proposal
    return statusOverrides.get(proposal.id) || proposal.status;
  });
  const [statusOverride, setStatusOverride] = useState(statusOverrides.has(proposal.id));
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [recalling, setRecalling] = useState(false);
  const [showResubmitModal, setShowResubmitModal] = useState(false);
  const [showQA, setShowQA] = useState(false);
  const [unreadQaCount, setUnreadQaCount] = useState(0);
  const [showPortalDropdown, setShowPortalDropdown] = useState(false);
  const [showActivityHistory, setShowActivityHistory] = useState(false);
  const [activityData, setActivityData] = useState<any>(null);
  const [showSubmissionModal, setShowSubmissionModal] = useState(false);
  const [showReactivateModal, setShowReactivateModal] = useState(false);
  const [showExpirationEditor, setShowExpirationEditor] = useState(false);
  const [pendingStatusChange, setPendingStatusChange] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  useEffect(() => {
    setTaxRate(proposal.tax_rate);
    setDepositPercent(proposal.deposit_percent);

    // If there's an override and the database has caught up, clear it
    const overriddenStatus = statusOverrides.get(proposal.id);
    if (overriddenStatus && overriddenStatus === proposal.status) {
      statusOverrides.delete(proposal.id);
      setStatusOverride(false);
    }

    if (!statusOverride) {
      setCurrentStatus(proposal.status);
    }
  }, [proposal.tax_rate, proposal.deposit_percent, proposal.status, statusOverride]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowPortalDropdown(false);
      }
    }

    if (showPortalDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showPortalDropdown]);

  useEffect(() => {
    loadUnreadQaCount();
  }, [proposal.id]);

  async function loadUnreadQaCount() {
    try {
      const { data: thread } = await supabase
        .from('message_threads')
        .select('id')
        .eq('proposal_id', proposal.id)
        .eq('context_type', 'proposal')
        .maybeSingle();
      if (!thread) return;
      const { count } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('thread_id', thread.id)
        .eq('author_type', 'customer')
        .eq('is_internal', false)
        .eq('is_read', false);
      setUnreadQaCount(count || 0);
    } catch {}
  }

  const expiresAt = proposal.expires_at ? new Date(proposal.expires_at) : null;
  const isExpired = expiresAt && expiresAt < new Date();
  const daysUntilExpiration = expiresAt ? Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;

  async function updateProposal(updates: Partial<ProposalWithDetails>) {
    try {
      setSaving(true);

      const { error } = await supabase
        .from('proposals')
        .update(updates)
        .eq('id', proposal.id);

      if (error) throw error;

      if (onSave) onSave();
    } catch (error) {
      console.error('Error updating proposal:', error);
    } finally {
      setSaving(false);
    }
  }

  async function handleTaxRateChange(newRate: number) {
    setTaxRate(newRate);

    try {
      // Update the tax rate first
      await updateProposal({
        tax_rate: newRate
      });

      // Recalculate all totals using the database function
      const { error: calcError } = await supabase.rpc('calculate_proposal_totals', {
        p_proposal_id: proposal.id
      });

      if (calcError) throw calcError;

      // Trigger a refresh
      if (onSave) onSave();
    } catch (error) {
      console.error('Error updating tax rate:', error);
    }
  }

  async function handleDepositPercentChange(newPercent: number) {
    setDepositPercent(newPercent);
    const depositAmount = proposal.total * (newPercent / 100);

    await updateProposal({
      deposit_percent: newPercent,
      deposit_amount: depositAmount
    });
  }

  async function handleStatusChange(newStatus: string) {
    // If changing to "sent" and not already sent, show the submission modal
    if (newStatus === 'sent' && !proposal.sent_at) {
      setPendingStatusChange(newStatus);
      setShowSubmissionModal(true);
      return;
    }

    // For all other status changes, proceed directly
    const updates: any = { status: newStatus };

    if (newStatus === 'sent' && !proposal.sent_at) {
      updates.sent_at = new Date().toISOString();
    }

    setCurrentStatus(newStatus);
    setStatusOverride(true);
    statusOverrides.set(proposal.id, newStatus);
    await updateProposal(updates);
  }

  async function handleSubmissionConfirm(sendToPortal: boolean, expiresAt: string, templateId: string | null, setAsDefault: boolean, includeVideos: boolean) {
    // Handle video visibility based on user's choice
    if (!includeVideos) {
      await supabase
        .from('proposal_recordings')
        .update({ is_portal_visible: false })
        .eq('proposal_id', proposal.id);
    } else {
      // Ensure all recordings are portal-visible when included
      await supabase
        .from('proposal_recordings')
        .update({ is_portal_visible: true })
        .eq('proposal_id', proposal.id);
    }

    // Save the chosen template to this proposal
    if (templateId !== undefined) {
      await supabase
        .from('proposals')
        .update({ report_template_id: templateId })
        .eq('id', proposal.id);
    }

    // Optionally save as user's default template
    if (setAsDefault && templateId && profile?.id) {
      await supabase
        .from('profiles')
        .update({ default_proposal_report_template_id: templateId })
        .eq('id', profile.id);
    }

    const updates: any = {
      status: 'sent',
      sent_at: new Date().toISOString(),
      expires_at: expiresAt,
      is_portal_visible: sendToPortal
    };

    setCurrentStatus('sent');
    setStatusOverride(true);
    statusOverrides.set(proposal.id, 'sent');
    await updateProposal(updates);

    // Save a portal version snapshot whenever the proposal goes live
    if (sendToPortal) {
      try {
        await supabase.rpc('save_portal_version_snapshot', {
          proposal_id_param: proposal.id,
          notes_param: null
        });
      } catch (snapErr) {
        console.error('Portal snapshot save failed (non-critical):', snapErr);
      }
    }

    setShowSubmissionModal(false);
    setPendingStatusChange(null);

    if (sendToPortal) {
      // Send email notification
      try {
        const { data, error: emailError } = await supabase.functions.invoke('send-proposal-email', {
          body: { proposalId: proposal.id }
        });

        if (emailError) {
          console.error('Error sending email:', emailError);
          alert(`Proposal submitted but email failed:\n\n${emailError.message || 'Unknown error'}`);
        } else if (data?.error) {
          console.error('Email API error:', data);
          alert(`Proposal submitted but email configuration error:\n\n${data.error}\n\n${data.details || ''}`);
        } else {
          alert('Proposal submitted to customer portal and email notification sent!');
        }
      } catch (error: any) {
        console.error('Error sending email:', error);
        alert(`Proposal submitted but email notification failed:\n\n${error.message || 'Unknown error'}`);
      }
    } else {
      alert('Proposal status updated to Sent (not visible on portal).');
    }
  }

  function handleSubmissionCancel() {
    setShowSubmissionModal(false);
    setPendingStatusChange(null);
    // Revert dropdown to current status
    setCurrentStatus(proposal.status);
  }

  async function handleSendToPortal() {
    try {
      setSending(true);
      console.log('Sending proposal to portal:', proposal.id);

      // Send email first (edge function will also update the status)
      const { data, error: emailError } = await supabase.functions.invoke('send-proposal-email', {
        body: { proposalId: proposal.id }
      });

      if (emailError) {
        console.error('Error sending email:', emailError);
        alert(`Failed to send proposal: ${emailError.message || 'Unknown error'}`);
        setSending(false);
        return;
      }

      // Check if the response contains an error (even with 200 status)
      if (data?.error) {
        console.error('Email API error:', data);
        alert(`Email Configuration Error:\n\n${data.error}\n\n${data.details || ''}`);
        setSending(false);
        return;
      }

      console.log('Email sent successfully:', data);

      // Save a portal version snapshot
      try {
        await supabase.rpc('save_portal_version_snapshot', {
          proposal_id_param: proposal.id,
          notes_param: null
        });
      } catch (snapErr) {
        console.error('Portal snapshot save failed (non-critical):', snapErr);
      }

      // Set local state to override any future prop updates
      setCurrentStatus('sent');
      setStatusOverride(true);
      statusOverrides.set(proposal.id, 'sent');

      alert('Proposal submitted to customer portal and email notification sent!');

      // Trigger parent refresh to update the proposal list
      if (onSave) {
        onSave();
      }
    } catch (error) {
      console.error('Error sending proposal:', error);
      alert('Failed to submit proposal. Please try again.');
    } finally {
      setSending(false);
    }
  }

  async function handleRenewProposal() {
    try {
      setRenewing(true);

      const { error } = await supabase.rpc('renew_proposal', {
        proposal_id: proposal.id
      });

      if (error) throw error;

      alert('Proposal renewed for 30 more days!');
      if (onSave) onSave();
    } catch (error) {
      console.error('Error renewing proposal:', error);
      alert('Failed to renew proposal. Please try again.');
    } finally {
      setRenewing(false);
    }
  }

  async function handleResubmit(revisionNotes: string) {
    try {
      setRenewing(true);

      const updates: any = {
        revision_notes: revisionNotes || null
      };

      await updateProposal(updates);

      const { error } = await supabase.rpc('renew_proposal', {
        proposal_id: proposal.id
      });

      if (error) throw error;

      const { data, error: emailError } = await supabase.functions.invoke('send-proposal-email', {
        body: { proposalId: proposal.id, isResubmission: true }
      });

      if (emailError) {
        console.error('Error sending email:', emailError);
        alert(`Proposal re-submitted but email failed:\n\n${emailError.message || 'Unknown error'}`);
      } else if (data?.error) {
        console.error('Email API error:', data);
        alert(`Proposal re-submitted but email configuration error:\n\n${data.error}\n\n${data.details || ''}`);
      } else {
        alert('Proposal re-submitted successfully! Customer notified via email.');
      }

      if (onSave) onSave();
    } catch (error) {
      console.error('Error resubmitting proposal:', error);
      alert('Failed to resubmit proposal. Please try again.');
      throw error;
    } finally {
      setRenewing(false);
    }
  }

  async function handleEmailProposal() {
    try {
      setSendingEmail(true);
      setShowPortalDropdown(false);

      const { data, error: emailError } = await supabase.functions.invoke('send-proposal-email', {
        body: { proposalId: proposal.id }
      });

      if (emailError) {
        console.error('Error sending email:', emailError);
        alert(`Failed to send email: ${emailError.message || 'Unknown error'}`);
        return;
      }

      if (data?.error) {
        console.error('Email API error:', data);
        alert(`Email Configuration Error:\n\n${data.error}\n\n${data.details || ''}`);
        return;
      }

      alert('Proposal email sent successfully!');
    } catch (error) {
      console.error('Error sending proposal email:', error);
      alert('Failed to send email. Please try again.');
    } finally {
      setSendingEmail(false);
    }
  }

  async function handleRecallProposal() {
    setConfirmModal({
      title: 'Recall Proposal',
      message: 'Recall this proposal from the customer portal? It will be returned to Designing status and customers will no longer be able to access it.',
      onConfirm: async () => {
        setConfirmModal(null);
        await doRecallProposal();
      }
    });
  }

  async function doRecallProposal() {
    try {
      setRecalling(true);

      const { error } = await supabase
        .from('proposals')
        .update({
          status: 'designing',
          sent_at: null,
          viewed_at: null
        })
        .eq('id', proposal.id);

      if (error) throw error;

      setCurrentStatus('designing');
      setStatusOverride(true);
      statusOverrides.set(proposal.id, 'designing');
      alert('Proposal recalled successfully! It has been returned to Designing status.');
      setShowPortalDropdown(false);

      // Don't trigger parent refresh - let the UI stay in this state
    } catch (error) {
      console.error('Error recalling proposal:', error);
      alert('Failed to recall proposal. Please try again.');
    } finally {
      setRecalling(false);
    }
  }

  async function fetchActivityData() {
    try {
      const { data, error } = await supabase.rpc('get_proposal_activity_summary', {
        p_proposal_id: proposal.id
      });

      if (error) throw error;
      setActivityData(data?.[0] || null);
      setShowActivityHistory(true);
      setShowPortalDropdown(false);

      // Mark activity as viewed to clear the "New" indicator
      try {
        const { error: markError } = await supabase.rpc('mark_proposal_activity_viewed', {
          p_proposal_id: proposal.id
        });

        if (markError) {
          console.error('Failed to mark activity as viewed:', markError);
        } else {
          // Trigger a refresh if onRefresh is available
          if (onRefresh) {
            onRefresh();
          }
        }
      } catch (markError) {
        console.error('Error marking activity as viewed:', markError);
      }
    } catch (error) {
      console.error('Error fetching activity data:', error);
      alert('Failed to load activity history');
    }
  }

  function openPortalPreview() {
    const portalUrl = `${window.location.origin}/portal/proposals/${proposal.id}`;
    window.open(portalUrl, '_blank');
    setShowPortalDropdown(false);
  }

  async function togglePortalVisibility() {
    const newVisibility = !proposal.is_portal_visible;
    try {
      await updateProposal({ is_portal_visible: newVisibility });
      alert(newVisibility
        ? 'Proposal is now visible on customer portal'
        : 'Proposal is now hidden from customer portal'
      );
    } catch (error) {
      console.error('Error toggling portal visibility:', error);
      alert('Failed to update portal visibility');
    }
  }

  async function handleExpirationUpdate(expiresAt: string) {
    try {
      await updateProposal({ expires_at: expiresAt });
      setShowExpirationEditor(false);
      alert('Expiration date updated successfully');
    } catch (error) {
      console.error('Error updating expiration:', error);
      alert('Failed to update expiration date');
    }
  }

  function handleReactivateSuccess() {
    setShowReactivateModal(false);
    if (onSave) onSave();
    alert('Proposal reactivated successfully!');
  }

  const profit = proposal.subtotal - (proposal.rooms?.reduce((sum, room) =>
    sum + room.line_items.reduce((itemSum, item) =>
      itemSum + ((item.cost || 0) * item.quantity), 0
    ), 0) || 0);

  const profitMargin = proposal.subtotal > 0 ? (profit / proposal.subtotal) * 100 : 0;

  return (
    <div className="w-full lg:w-96 bg-gray-900 border-t lg:border-t-0 lg:border-l border-gray-700 flex flex-col lg:h-[calc(100vh-4rem)] overflow-hidden">
      <div className="flex-1 overflow-y-auto">

      {/* Decline / Cancel Banner */}
      {(proposal.status === 'declined' || proposal.status === 'cancelled') && (
        <div className={`mx-4 mt-4 rounded-lg border px-4 py-3 ${
          proposal.status === 'declined'
            ? 'bg-red-900/20 border-red-800/50'
            : 'bg-gray-800 border-gray-700'
        }`}>
          <div className="flex items-center gap-2 mb-1.5">
            {proposal.status === 'declined' ? (
              <Ban size={14} className="text-red-400 flex-shrink-0" />
            ) : (
              <AlertTriangle size={14} className="text-gray-400 flex-shrink-0" />
            )}
            <span className={`text-xs font-bold uppercase tracking-wide ${
              proposal.status === 'declined' ? 'text-red-400' : 'text-gray-400'
            }`}>
              {proposal.status === 'declined' ? 'Declined' : 'Cancelled'}
            </span>
            {proposal.declined_at && (
              <span className="text-xs text-gray-500 ml-auto">
                {new Date(proposal.declined_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            )}
          </div>
          {proposal.decline_reason && (
            <p className="text-xs text-gray-300 mb-1">
              <span className="text-gray-500">Reason: </span>
              {DECLINE_REASON_LABELS[proposal.decline_reason] || proposal.decline_reason}
            </p>
          )}
          {proposal.declined_by && (
            <p className="text-xs text-gray-500">
              By: {proposal.declined_by === 'customer' ? 'Customer' : proposal.declined_by === 'company' ? 'Company' : 'Sales Rep'}
            </p>
          )}
          {(proposal as any).decline_notes && (
            <p className="text-xs text-gray-400 italic mt-1.5 border-t border-gray-700/50 pt-1.5">
              "{(proposal as any).decline_notes}"
            </p>
          )}
        </div>
      )}

      <div className="p-6 border-b border-gray-700">
        <h3 className="text-lg font-bold text-white mb-4">Summary</h3>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Subtotal</span>
            <span className="text-white font-semibold">
              ${proposal.subtotal?.toFixed(2) || '0.00'}
            </span>
          </div>

          {(proposal.discount_amount || 0) > 0 && (
            <div className="flex justify-between text-red-400">
              <span>Discount</span>
              <span>-${proposal.discount_amount.toFixed(2)}</span>
            </div>
          )}

          {(proposal.project_management_amount || 0) > 0 && (
            <div className="flex justify-between text-blue-400">
              <span>Project Management</span>
              <span>+${proposal.project_management_amount.toFixed(2)}</span>
            </div>
          )}

          {(proposal.project_design_amount || 0) > 0 && (
            <div className="flex justify-between text-blue-400">
              <span>Project Design</span>
              <span>+${proposal.project_design_amount.toFixed(2)}</span>
            </div>
          )}

          {(proposal.system_design_amount || 0) > 0 && (
            <div className="flex justify-between text-blue-400">
              <span>System Design</span>
              <span>+${proposal.system_design_amount.toFixed(2)}</span>
            </div>
          )}

          {(proposal.credit_card_fee_amount || 0) > 0 && (
            <div className="flex justify-between text-blue-400">
              <span>Credit Card Fee</span>
              <span>+${proposal.credit_card_fee_amount.toFixed(2)}</span>
            </div>
          )}

          {(proposal.misc_parts_amount || 0) > 0 && (
            <div className="flex justify-between text-blue-400">
              <span>Misc Parts</span>
              <span>+${proposal.misc_parts_amount.toFixed(2)}</span>
            </div>
          )}

          {(proposal.custom_modifier_1_amount || 0) > 0 && (
            <div className="flex justify-between text-blue-400">
              <span>Custom Modifier 1</span>
              <span>+${proposal.custom_modifier_1_amount.toFixed(2)}</span>
            </div>
          )}

          {(proposal.custom_modifier_2_amount || 0) > 0 && (
            <div className="flex justify-between text-blue-400">
              <span>Custom Modifier 2</span>
              <span>+${proposal.custom_modifier_2_amount.toFixed(2)}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-gray-700">
            <span className="text-gray-400">Tax Rate</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={taxRate}
                onChange={(e) => handleTaxRateChange(parseFloat(e.target.value) || 0)}
                className="w-20 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-right text-sm"
                min="0"
                max="100"
                step="0.1"
              />
              <span className="text-gray-400">%</span>
            </div>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-400">Tax Amount</span>
            <span className="text-white font-semibold">
              ${proposal.tax_amount?.toFixed(2) || '0.00'}
            </span>
          </div>

          <div className="border-t border-gray-700 pt-3 flex justify-between">
            <span className="text-white font-bold">Total</span>
            <div className="text-right">
              <div className="text-white font-bold text-lg">
                ${proposal.total?.toFixed(2) || '0.00'}
              </div>
              <div className={`text-xs mt-0.5 ${profitMargin >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {profitMargin.toFixed(1)}% margin
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-gray-700">
            <span className="text-gray-400">Deposit</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={depositPercent}
                onChange={(e) => handleDepositPercentChange(parseFloat(e.target.value) || 0)}
                className="w-20 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-white text-right text-sm"
                min="0"
                max="100"
                step="1"
              />
              <span className="text-gray-400">%</span>
            </div>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-400">Deposit Amount</span>
            <span className="text-green-400 font-semibold">
              ${proposal.deposit_amount.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      <div className="p-6 border-b border-gray-700">
        <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <DollarSign size={16} />
          Profitability
        </h4>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Gross Profit</span>
            <span className={`font-semibold ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              ${profit.toFixed(2)}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-400">Margin</span>
            <span className={`font-semibold ${profitMargin >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {profitMargin.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* Sent Date Display */}
      {proposal.sent_at && (
        <div className="p-6 border-b border-gray-700">
          <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Send size={16} />
            Portal Status
          </h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Sent to Portal</span>
              <span className="text-blue-400 font-medium">
                {new Date(proposal.sent_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit'
                })}
              </span>
            </div>
            {proposal.viewed_at && (
              <div className="flex justify-between items-center">
                <span className="text-gray-400">First Viewed</span>
                <span className="text-purple-400 font-medium">
                  {new Date(proposal.viewed_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                  })}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {(proposal.status === 'sent' || proposal.status === 'expired') && expiresAt && (
        <div className="p-6 border-b border-gray-700">
          <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Clock size={16} />
            Expiration
          </h4>
          <div className="space-y-2 text-sm">
            {isExpired ? (
              <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg">
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <p className="text-red-400 font-semibold">Expired</p>
                    <p className="text-red-300 text-xs">
                      Expired on {expiresAt.toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowExpirationEditor(!showExpirationEditor)}
                    className="p-1 hover:bg-red-500/30 rounded transition-colors"
                  >
                    <Edit2 size={14} className="text-red-300" />
                  </button>
                </div>
              </div>
            ) : (
              <div className={`p-3 rounded-lg ${
                daysUntilExpiration! <= 7
                  ? 'bg-orange-500/20 border border-orange-500/50'
                  : 'bg-blue-500/20 border border-blue-500/50'
              }`}>
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <p className={`font-semibold ${
                      daysUntilExpiration! <= 7 ? 'text-orange-400' : 'text-blue-400'
                    }`}>
                      {daysUntilExpiration} days remaining
                    </p>
                    <p className="text-gray-300 text-xs">
                      Expires on {expiresAt.toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowExpirationEditor(!showExpirationEditor)}
                    className={`p-1 rounded transition-colors ${
                      daysUntilExpiration! <= 7
                        ? 'hover:bg-orange-500/30'
                        : 'hover:bg-blue-500/30'
                    }`}
                  >
                    <Edit2 size={14} className="text-gray-300" />
                  </button>
                </div>
              </div>
            )}

            {/* Expiration Date Editor */}
            {showExpirationEditor && (
              <div className="p-3 bg-gray-800 border border-gray-600 rounded-lg space-y-2">
                <p className="text-gray-300 text-xs font-semibold mb-2">Update Expiration Date</p>
                <div className="grid grid-cols-3 gap-1">
                  {[7, 14, 30, 60, 90].map((days) => (
                    <button
                      key={days}
                      onClick={() => {
                        const date = new Date();
                        date.setDate(date.getDate() + days);
                        handleExpirationUpdate(date.toISOString());
                      }}
                      className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded transition-colors"
                    >
                      +{days}d
                    </button>
                  ))}
                </div>
                <input
                  type="date"
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => {
                    if (e.target.value) {
                      const date = new Date(e.target.value);
                      handleExpirationUpdate(date.toISOString());
                    }
                  }}
                  className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {proposal.renewal_count > 0 && (
              <p className="text-gray-400 text-xs">
                Renewed {proposal.renewal_count} time{proposal.renewal_count !== 1 ? 's' : ''}
              </p>
            )}
            {isExpired ? (
              <div className="space-y-2">
                <button
                  onClick={() => setShowReactivateModal(true)}
                  className="w-full py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                >
                  <RotateCcw size={14} />
                  Reactivate Proposal
                </button>
                <button
                  onClick={() => setShowResubmitModal(true)}
                  disabled={renewing}
                  className="w-full py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                >
                  <Mail size={14} />
                  {renewing ? 'Re-Submitting...' : 'Re-Submit to Customer'}
                </button>
              </div>
            ) : (
              <button
                onClick={handleRenewProposal}
                disabled={renewing}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2"
              >
                <RefreshCw size={14} className={renewing ? 'animate-spin' : ''} />
                {renewing ? 'Renewing...' : 'Renew for 30 Days'}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="p-6 border-b border-gray-700">
        <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Users size={16} />
          Commission Preview
        </h4>

        <div className="space-y-2 text-sm text-gray-400">
          <div className="flex justify-between">
            <span>Sales Rep (5%)</span>
            <span className="text-white">${(proposal.subtotal * 0.05).toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Project Manager (3%)</span>
            <span className="text-white">${(proposal.subtotal * 0.03).toFixed(2)}</span>
          </div>
          <div className="text-xs text-gray-500 mt-2">
            *Based on company defaults
          </div>
        </div>
      </div>
      </div>

      {changeOrderMode ? (
        <div className="flex-shrink-0 p-6 border-t border-gray-700 bg-gray-900">
          <div className="p-3 bg-amber-900/30 border border-amber-700/40 rounded-lg">
            <p className="text-amber-300 text-xs font-semibold mb-1">Change Order Mode</p>
            <p className="text-amber-200/70 text-xs leading-relaxed">
              All edits are tracked as change order line items. Submit the change order for approval when done.
            </p>
          </div>
        </div>
      ) : (
      <div className="flex-shrink-0 p-6 border-t border-gray-700 space-y-3 bg-gray-900">
        <select
          value={currentStatus}
          onChange={(e) => handleStatusChange(e.target.value)}
          className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="designing">Designing</option>
          <option value="ready_to_submit">Ready to Submit</option>
          <option value="sent">Submitted to Portal</option>
          <option value="viewed">Viewed</option>
          <option value="approved">Approved</option>
          <option value="declined">Declined</option>
          <option value="expired">Expired</option>
        </select>

        {/* Portal Visibility Toggle - Show for sent proposals and after */}
        {(currentStatus === 'sent' || currentStatus === 'viewed' || currentStatus === 'approved' || currentStatus === 'declined' || currentStatus === 'expired') && (
          <button
            onClick={togglePortalVisibility}
            className={`w-full px-4 py-2 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors ${
              proposal.is_portal_visible
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
            }`}
          >
            {proposal.is_portal_visible ? (
              <>
                <Globe size={18} />
                Visible on Customer Portal
              </>
            ) : (
              <>
                <EyeOff size={18} />
                Hidden from Portal
              </>
            )}
          </button>
        )}

        <button
          onClick={() => onSave?.()}
          disabled={saving}
          className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-medium flex items-center justify-center gap-2"
        >
          <Save size={18} />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>

        {(currentStatus === 'designing' || currentStatus === 'ready_to_submit') ? (
          <button
            onClick={handleSendToPortal}
            disabled={sending}
            className="w-full py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 text-white rounded-lg font-medium flex items-center justify-center gap-2"
          >
            <Mail size={18} />
            {sending ? 'Sending...' : 'Send to Portal'}
          </button>
        ) : (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowPortalDropdown(!showPortalDropdown)}
              className="w-full py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium flex items-center justify-center gap-2"
            >
              <Eye size={18} />
              In Portal
              <ChevronDown size={16} />
            </button>

            {showPortalDropdown && (
              <div className="absolute bottom-full mb-2 left-0 right-0 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-50">
                <button
                  onClick={fetchActivityData}
                  className="w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                >
                  <Activity size={16} />
                  View Customer Activity
                </button>
                <button
                  onClick={openPortalPreview}
                  className="w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                >
                  <ExternalLink size={16} />
                  Open Portal Preview
                </button>
                <button
                  onClick={() => {
                    setShowQA(true);
                    setShowPortalDropdown(false);
                  }}
                  className="w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-100 flex items-center gap-2 relative"
                >
                  <MessageSquare size={16} />
                  Customer Q&A
                  {unreadQaCount > 0 && (
                    <span className="ml-auto px-2 py-0.5 bg-red-500 text-white text-xs font-bold rounded-full">
                      {unreadQaCount}
                    </span>
                  )}
                </button>
                <div className="border-t border-gray-200 my-1"></div>
                <button
                  onClick={handleEmailProposal}
                  disabled={sendingEmail}
                  className="w-full px-4 py-2 text-left text-green-600 hover:bg-green-50 flex items-center gap-2 disabled:opacity-50"
                >
                  <Mail size={16} />
                  {sendingEmail ? 'Sending...' : 'Email Proposal'}
                </button>
                <div className="border-t border-gray-200 my-1"></div>
                <button
                  onClick={handleRecallProposal}
                  disabled={recalling}
                  className="w-full px-4 py-2 text-left text-amber-600 hover:bg-amber-50 flex items-center gap-2 disabled:opacity-50"
                >
                  <RotateCcw size={16} />
                  {recalling ? 'Recalling...' : 'Recall from Portal'}
                </button>
              </div>
            )}
          </div>
        )}

        <button
          className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium flex items-center justify-center gap-2"
        >
          <Eye size={18} />
          Preview PDF
        </button>
      </div>
      )}

      {showSubmissionModal && (
        <ProposalSubmissionModal
          proposalId={proposal.id}
          proposalNumber={proposal.proposal_number}
          currentTemplateId={proposal.report_template_id ?? null}
          onConfirm={handleSubmissionConfirm}
          onCancel={handleSubmissionCancel}
        />
      )}

      {showReactivateModal && (
        <ReactivateProposalModal
          proposalId={proposal.id}
          proposalNumber={proposal.proposal_number}
          lastModified={proposal.updated_at || proposal.created_at}
          totalAmount={proposal.total}
          onClose={() => setShowReactivateModal(false)}
          onSuccess={handleReactivateSuccess}
          onReview={() => {
            setShowReactivateModal(false);
            // Optionally trigger a preview or navigate to edit mode
          }}
        />
      )}

      {showResubmitModal && (
        <ResubmitProposalModal
          proposalNumber={proposal.proposal_number}
          onConfirm={handleResubmit}
          onClose={() => setShowResubmitModal(false)}
        />
      )}

      {showQA && (
        <ProposalQA
          proposalId={proposal.id}
          isPortal={false}
          onClose={() => setShowQA(false)}
        />
      )}

      {showActivityHistory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-full sm:max-w-2xl max-h-[80vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Customer Activity History</h2>
              <button
                onClick={() => setShowActivityHistory(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(80vh-80px)]">
              {activityData ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                      <div className="text-sm text-blue-600 font-medium mb-1">Total Views</div>
                      <div className="text-3xl font-bold text-blue-900">
                        {activityData.total_views || 0}
                      </div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                      <div className="text-sm text-green-600 font-medium mb-1">Unique Sessions</div>
                      <div className="text-3xl font-bold text-green-900">
                        {activityData.unique_sessions || 0}
                      </div>
                    </div>
                  </div>

                  {activityData.last_viewed_at && (
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <div className="text-sm text-gray-600 font-medium mb-1">Last Viewed</div>
                      <div className="text-lg font-semibold text-gray-900">
                        {new Date(activityData.last_viewed_at).toLocaleString()}
                      </div>
                    </div>
                  )}

                  {activityData.total_time_seconds > 0 && (
                    <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                      <div className="text-sm text-purple-600 font-medium mb-1">Total Time Spent</div>
                      <div className="text-lg font-semibold text-purple-900">
                        {Math.floor(activityData.total_time_seconds / 60)} minutes
                      </div>
                    </div>
                  )}

                  {activityData.activity_timeline && activityData.activity_timeline.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-3">Activity Timeline</h3>
                      <div className="space-y-2">
                        {activityData.activity_timeline.map((activity: any, index: number) => (
                          <div
                            key={index}
                            className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200"
                          >
                            <div className="flex-shrink-0 mt-0.5">
                              {activity.type === 'viewed' && <Eye size={16} className="text-blue-600" />}
                              {activity.type === 'downloaded' && <Download size={16} className="text-green-600" />}
                              {activity.type === 'accepted' && <Check size={16} className="text-green-600" />}
                              {activity.type === 'declined' && <X size={16} className="text-red-600" />}
                            </div>
                            <div className="flex-1">
                              <div className="text-sm font-medium text-gray-900 capitalize">
                                {activity.type}
                              </div>
                              <div className="text-xs text-gray-500">
                                {new Date(activity.created_at).toLocaleString()}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No activity recorded yet
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => setShowActivityHistory(false)}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg"
              >
                Close
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
