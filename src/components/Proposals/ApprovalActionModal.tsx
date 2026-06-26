import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, DollarSign, FileText, CheckCircle, Mail, Copy, AlertCircle, Clock, ChevronDown, ChevronUp, Save, Check, Percent } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import BillingConfigSummary from './BillingConfigSummary';

interface ApprovalActionModalProps {
  proposal: any;
  contact: any;
  onClose: () => void;
  onComplete: () => void;
}

export default function ApprovalActionModal({ proposal, contact, onClose, onComplete }: ApprovalActionModalProps) {
  const [selectedAction, setSelectedAction] = useState<'deposit' | 'po' | 'no_deposit' | null>(null);
  const [sendNotification, setSendNotification] = useState(true);
  const [poNumber, setPoNumber] = useState('');
  const [poFile, setPoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [recentNotifications, setRecentNotifications] = useState<any[]>([]);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [customDepositAmount, setCustomDepositAmount] = useState(proposal.deposit_amount_due || 0);
  const [depositReceived, setDepositReceived] = useState(false);
  const [proposalTotal, setProposalTotal] = useState(proposal.total || 0);
  const [showDepositConfig, setShowDepositConfig] = useState(false);
  const [depositType, setDepositType] = useState<'percentage' | 'parts_total' | 'custom' | 'none'>('percentage');
  const [depositPercent, setDepositPercent] = useState(50);
  const [proposalSettingsId, setProposalSettingsId] = useState<string | null>(null);
  const [autoSaving, setAutoSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadRecentNotifications();
    loadProposalSettings();
    determineRecommendedAction();
  }, [proposal]);

  useEffect(() => {
    // Auto-save when deposit settings change
    if (proposalSettingsId && showDepositConfig) {
      debouncedAutoSave();
    }
  }, [depositType, depositPercent, customDepositAmount]);

  const debouncedAutoSave = useCallback(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(() => {
      autoSaveToDatabase();
    }, 500);
  }, [proposalSettingsId, depositType, depositPercent, customDepositAmount]);

  async function autoSaveToDatabase() {
    if (!proposalSettingsId) return;

    try {
      setAutoSaving(true);

      const settingsUpdate: any = {
        deposit_type: depositType,
        deposit_percent: depositPercent,
        deposit_amount: depositType === 'custom' ? customDepositAmount : null,
        require_deposit: depositType !== 'none'
      };

      const { error: settingsError } = await supabase
        .from('proposal_settings')
        .update(settingsUpdate)
        .eq('id', proposalSettingsId);

      if (settingsError) throw settingsError;

      // Recalculate proposal totals to sync deposit_amount_due
      await supabase.rpc('calculate_proposal_totals', { p_proposal_id: proposal.id });

      // Reload the updated deposit amount
      const { data: updatedProposal } = await supabase
        .from('proposals')
        .select('deposit_amount_due')
        .eq('id', proposal.id)
        .maybeSingle();

      if (updatedProposal) {
        setCustomDepositAmount(updatedProposal.deposit_amount_due || 0);
      }

      setLastSaved(new Date());
    } catch (error) {
      console.error('Error auto-saving settings:', error);
    } finally {
      setAutoSaving(false);
    }
  }

  const loadProposalSettings = async () => {
    try {
      const { data: proposalData, error } = await supabase
        .from('proposals')
        .select(`
          proposal_settings_id,
          proposal_settings:proposal_settings_id (
            id,
            deposit_type,
            deposit_percent,
            deposit_amount,
            require_deposit
          )
        `)
        .eq('id', proposal.id)
        .maybeSingle();

      if (error) throw error;

      const settings = proposalData?.proposal_settings as any;

      if (settings) {
        setProposalSettingsId(settings.id);
        setDepositType(settings.deposit_type || 'percentage');
        setDepositPercent(settings.deposit_percent || 50);
      }
    } catch (err) {
      console.error('Error loading proposal settings:', err);
    }
  };

  const loadRecentNotifications = async () => {
    try {
      const { data, error } = await supabase
        .from('proposal_notifications')
        .select('*')
        .eq('proposal_id', proposal.id)
        .order('sent_at', { ascending: false })
        .limit(5);

      if (error) throw error;
      setRecentNotifications(data || []);
    } catch (err) {
      console.error('Error loading notifications:', err);
    }
  };

  const determineRecommendedAction = () => {
    if (proposal.require_deposit) {
      setSelectedAction('deposit');
    } else if (proposal.acceptance_methods?.includes('purchase_order')) {
      setSelectedAction('po');
    } else {
      setSelectedAction('no_deposit');
    }
  };

  const validatePOBillingInfo = () => {
    // Check if customer has complete billing information required for PO acceptance
    const missingFields = [];

    if (!contact.company_name) missingFields.push('Company Name');
    if (!contact.street_address) missingFields.push('Street Address');
    if (!contact.city) missingFields.push('City');
    if (!contact.state) missingFields.push('State');
    if (!contact.zip_code) missingFields.push('ZIP Code');
    if (!contact.default_payment_terms) missingFields.push('Payment Terms');

    return {
      isComplete: missingFields.length === 0,
      missingFields,
      acceptsPO: contact.accepts_po === true
    };
  };

  const poValidation = validatePOBillingInfo();

  const checkDuplicateNotification = (actionType: string) => {
    const notificationMap: Record<string, string[]> = {
      deposit: ['deposit_invoice_sent'],
      po: ['po_confirmation'],
      no_deposit: ['approval_confirmation'],
    };

    const relevantTypes = notificationMap[actionType] || [];
    const recent = recentNotifications.find(
      (n) =>
        relevantTypes.includes(n.notification_type) &&
        new Date(n.sent_at) > new Date(Date.now() - 24 * 60 * 60 * 1000)
    );

    if (recent) {
      setShowDuplicateWarning(true);
      return recent;
    }
    setShowDuplicateWarning(false);
    return null;
  };

  const handleActionSelect = (action: 'deposit' | 'po' | 'no_deposit') => {
    setSelectedAction(action);
    checkDuplicateNotification(action);
    setError(null);
  };

  const uploadPOFile = async () => {
    if (!poFile) return null;

    try {
      const fileExt = poFile.name.split('.').pop();
      const fileName = `${proposal.id}_${Date.now()}.${fileExt}`;
      const filePath = `purchase-orders/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(filePath, poFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('attachments')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (err) {
      console.error('Error uploading PO file:', err);
      throw new Error('Failed to upload PO file');
    }
  };

  const handleSubmit = async () => {
    if (!selectedAction) {
      setError('Please select an action');
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      let result;

      if (selectedAction === 'deposit') {
        const { data, error } = await supabase.rpc('handle_deposit_billing_action', {
          p_proposal_id: proposal.id,
          p_send_notification: sendNotification,
        });

        if (error) throw error;
        result = data;
      } else if (selectedAction === 'po') {
        // PO number is now optional - if not provided, will go to "PO Pending" status
        let poFileUrl = null;
        if (poFile) {
          setUploading(true);
          poFileUrl = await uploadPOFile();
          setUploading(false);
        }

        if (poNumber.trim()) {
          // If PO number provided, use the old RPC function for backwards compatibility
          const { data, error } = await supabase.rpc('handle_po_acceptance_action', {
            p_proposal_id: proposal.id,
            p_po_number: poNumber,
            p_po_file_url: poFileUrl,
            p_send_notification: sendNotification,
          });

          if (error) throw error;
          result = data;
        } else {
          // If no PO number, just approve with PO method - will set po_pending flag
          const { data: { user } } = await supabase.auth.getUser();

          const updateData: any = {
            status: 'approved',
            approved_by: user?.id,
            approval_completed_at: new Date().toISOString(),
            accepted_via_method: 'purchase_order',
            updated_at: new Date().toISOString()
          };

          if (poFileUrl) {
            updateData.po_document_url = poFileUrl;
          }

          const { error } = await supabase
            .from('proposals')
            .update(updateData)
            .eq('id', proposal.id);

          if (error) throw error;

          result = {
            success: true,
            message: 'Proposal approved with Purchase Order method. PO number can be added later.',
            po_pending: true
          };
        }
      } else if (selectedAction === 'no_deposit') {
        const { data, error } = await supabase.rpc('handle_no_deposit_action', {
          p_proposal_id: proposal.id,
          p_send_notification: sendNotification,
        });

        if (error) throw error;
        result = data;
      }

      setResult(result);

      if (!sendNotification) {
        setTimeout(() => {
          onComplete();
          onClose();
        }, 2000);
      }
    } catch (err: any) {
      console.error('Error processing approval action:', err);
      setError(err.message || 'Failed to process approval action');
      setProcessing(false);
    }
  };

  const handleSendEmail = async () => {
    if (!result || !result.invoice_id) return;

    try {
      const { error } = await supabase.functions.invoke('send-invoice-email', {
        body: {
          invoiceId: result.invoice_id,
          proposalId: proposal.id,
        },
      });

      if (error) throw error;

      onComplete();
      onClose();
    } catch (err) {
      console.error('Error sending email:', err);
      setError('Failed to send email');
      setProcessing(false);
    }
  };

  const copyPortalLink = () => {
    const portalUrl = `${window.location.origin}/portal/proposals/${proposal.id}`;
    navigator.clipboard.writeText(portalUrl);
    alert('Portal link copied to clipboard!');
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'deposit':
        return <DollarSign className="w-6 h-6" />;
      case 'po':
        return <FileText className="w-6 h-6" />;
      case 'no_deposit':
        return <CheckCircle className="w-6 h-6" />;
      default:
        return null;
    }
  };

  const getActionDescription = (action: string) => {
    switch (action) {
      case 'deposit':
        return {
          title: 'Request Deposit Payment',
          description: `Creates a deposit invoice for ${formatCurrency(proposal.deposit_amount_due ?? 0)} and sends it to the customer.`,
          nextSteps: [
            'Deposit invoice will be created',
            'Sales order will be marked as "Pending Deposit"',
            'Customer can view and pay invoice in portal',
          ],
        };
      case 'po':
        return {
          title: 'Add Purchase Order',
          description: 'Record the customer\'s PO number to finalize this sale. No deposit required for PO customers.',
          nextSteps: [
            'Sales order will be created as "Planning"',
            'No invoice will be generated',
            'Project can be scheduled immediately',
          ],
        };
      case 'no_deposit':
        return {
          title: 'Complete Approval',
          description: 'No deposit or PO required. Sales order will be created and ready for scheduling.',
          nextSteps: [
            'Sales order will be created as "Planning"',
            'Project can be scheduled immediately',
            'Final invoice will be created upon completion',
          ],
        };
      default:
        return { title: '', description: '', nextSteps: [] };
    }
  };

  if (result && selectedAction === 'deposit') {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
          <div className="flex items-center justify-between p-6 border-b">
            <h2 className="text-xl font-semibold text-gray-900">Deposit Invoice Created</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="p-6">
            <div className="flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>

            <p className="text-center text-gray-700 mb-6">
              Deposit invoice has been created and is ready to send to {contact.full_name}.
            </p>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-medium text-blue-900 mb-1">Send Invoice to Customer</p>
                  <p className="text-sm text-blue-700">
                    Email: {contact.email}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleSendEmail}
                disabled={processing}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Mail className="w-5 h-5" />
                Email Invoice to Customer
              </button>

              <button
                onClick={copyPortalLink}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                <Copy className="w-5 h-5" />
                Copy Portal Link
              </button>

              <button
                onClick={() => {
                  onComplete();
                  onClose();
                }}
                className="w-full px-4 py-3 text-gray-600 hover:text-gray-900"
              >
                Skip - I'll notify customer manually
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
          <div className="flex items-center justify-between p-6 border-b">
            <h2 className="text-xl font-semibold text-gray-900">Action Completed</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="p-6 text-center">
            <div className="flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>

            <p className="text-gray-700 mb-4">
              {selectedAction === 'po'
                ? 'Purchase Order recorded. Sales order created and ready for scheduling.'
                : 'Approval completed. Sales order created and ready for scheduling.'}
            </p>

            <button
              onClick={() => {
                onComplete();
                onClose();
              }}
              className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Proposal Approved - Choose Next Action</h2>
            <p className="text-sm text-gray-600 mt-1">
              Proposal {proposal.proposal_number} for {contact.full_name}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-red-900">Error</p>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        )}

        {showDuplicateWarning && (
          <div className="mx-6 mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-3">
            <Clock className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-yellow-900">Notification Already Sent</p>
              <p className="text-sm text-yellow-700">
                A notification for this action was sent within the last 24 hours.
                You can still proceed, but the customer may receive duplicate emails.
              </p>
            </div>
          </div>
        )}

        <div className="p-6">
          <div className="grid grid-cols-1 gap-4 mb-6">
            {proposal.require_deposit && (
              <button
                onClick={() => handleActionSelect('deposit')}
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  selectedAction === 'deposit'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${
                    selectedAction === 'deposit' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
                  }`}>
                    <DollarSign className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 mb-1">
                      Request Deposit Payment
                      {proposal.require_deposit && (
                        <span className="ml-2 text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                          Deposit Required
                        </span>
                      )}
                    </h3>
                    <p className="text-sm text-gray-600 mb-2">
                      Configure deposit amount and payment options for this sale.
                    </p>
                    {selectedAction === 'deposit' && (
                      <div className="mt-3 space-y-3">
                        {/* Auto-save indicator */}
                        {(autoSaving || lastSaved) && (
                          <div className="flex items-center justify-end gap-2 text-xs">
                            {autoSaving ? (
                              <>
                                <Save className="w-3 h-3 text-blue-600 animate-pulse" />
                                <span className="text-blue-600">Saving...</span>
                              </>
                            ) : lastSaved ? (
                              <>
                                <Check className="w-3 h-3 text-green-600" />
                                <span className="text-green-600">Saved</span>
                              </>
                            ) : null}
                          </div>
                        )}

                        {/* Collapsible Deposit Configuration */}
                        <div className="border border-blue-200 rounded-lg overflow-hidden">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setShowDepositConfig(!showDepositConfig); }}
                            className="w-full px-3 py-2 bg-blue-50 hover:bg-blue-100 transition-colors flex items-center justify-between"
                          >
                            <div className="flex items-center gap-2">
                              <DollarSign className="w-4 h-4 text-blue-600" />
                              <span className="text-sm font-medium text-gray-900">Deposit Configuration</span>
                              {!showDepositConfig && (
                                <span className="text-xs text-gray-600">
                                  {depositType === 'percentage' ? `${depositPercent}% • ` :
                                   depositType === 'parts_total' ? 'Parts Total • ' :
                                   depositType === 'custom' ? 'Custom • ' : ''}
                                  ${customDepositAmount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                </span>
                              )}
                            </div>
                            {showDepositConfig ? (
                              <ChevronUp className="w-4 h-4 text-gray-400" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-gray-400" />
                            )}
                          </button>

                          {showDepositConfig && (
                            <div className="p-3 bg-white space-y-3" onClick={(e) => e.stopPropagation()}>
                              {/* Deposit Type */}
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Deposit Type</label>
                                <select
                                  value={depositType}
                                  onChange={(e) => {
                                    const newType = e.target.value as any;
                                    setDepositType(newType);
                                    if (newType === 'percentage') {
                                      setCustomDepositAmount((proposalTotal * depositPercent) / 100);
                                    }
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                  <option value="percentage">Percentage</option>
                                  <option value="parts_total">Parts Total</option>
                                  <option value="custom">Custom Amount</option>
                                </select>
                              </div>

                              {/* Deposit Percent (if percentage type) */}
                              {depositType === 'percentage' && (
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 mb-1">Percentage</label>
                                  <div className="relative">
                                    <input
                                      type="number"
                                      value={depositPercent}
                                      onChange={(e) => {
                                        const percent = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
                                        setDepositPercent(percent);
                                        setCustomDepositAmount((proposalTotal * percent) / 100);
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      min="0"
                                      max="100"
                                      step="5"
                                      className="w-full pr-7 pl-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                    <Percent className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                                  </div>
                                </div>
                              )}

                              {/* Deposit Amount */}
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">Amount</label>
                                <div className="relative">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">$</span>
                                  <input
                                    type="number"
                                    value={customDepositAmount}
                                    onChange={(e) => {
                                      const value = parseFloat(e.target.value) || 0;
                                      setCustomDepositAmount(Math.min(value, proposalTotal));
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    min="0"
                                    max={proposalTotal}
                                    step="0.01"
                                    disabled={depositType === 'parts_total'}
                                    className="w-full pl-6 pr-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                                  />
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                  {proposalTotal > 0 && `${((customDepositAmount / proposalTotal) * 100).toFixed(1)}% of $${proposalTotal.toLocaleString()}`}
                                </p>
                              </div>

                              {/* Quick presets */}
                              <div className="flex gap-1 flex-wrap">
                                {[25, 50, 75, 100].map(percent => (
                                  <button
                                    key={percent}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDepositPercent(percent);
                                      setCustomDepositAmount(proposalTotal * (percent / 100));
                                      if (depositType !== 'custom') {
                                        setDepositType('percentage');
                                      }
                                    }}
                                    className="px-2 py-1 text-xs bg-white border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
                                  >
                                    {percent}%
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Deposit Status */}
                        <label
                          className="flex items-center gap-3 p-3 bg-white border-2 rounded-lg cursor-pointer hover:bg-gray-50"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={depositReceived}
                            onChange={(e) => setDepositReceived(e.target.checked)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-4 h-4"
                          />
                          <div className="flex-1">
                            <p className="font-medium text-gray-900 text-sm">Deposit already received</p>
                            <p className="text-xs text-gray-600">
                              Check if customer already paid (invoice will be marked as PAID)
                            </p>
                          </div>
                          <CheckCircle className={`w-5 h-5 ${depositReceived ? 'text-green-600' : 'text-gray-300'}`} />
                        </label>

                        <div className={`p-3 rounded-lg border ${depositReceived ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                          <p className={`text-sm font-medium ${depositReceived ? 'text-green-900' : 'text-amber-900'}`}>
                            {depositReceived ? 'Billing Impact: Deposit Paid' : 'Billing Impact: Awaiting Payment'}
                          </p>
                          <ul className={`text-xs ${depositReceived ? 'text-green-700' : 'text-amber-700'} space-y-1 mt-2 pl-3`}>
                            <li>• Deposit invoice for ${customDepositAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} will be created</li>
                            <li>• {depositReceived ? 'Invoice marked as PAID, sales order ready for planning' : 'Invoice available on portal, sales order pending deposit'}</li>
                            <li>• {depositReceived ? 'Payment record automatically generated' : 'Customer can pay online or you can apply payment manually'}</li>
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </button>
            )}

            {!proposal.require_deposit && proposal.acceptance_methods?.includes('purchase_order') && (
              <>
                <button
                  onClick={() => {
                    if (!poValidation.acceptsPO) {
                      setError('Customer must be approved for PO acceptance. Update customer settings to enable PO acceptance.');
                      return;
                    }
                    if (!poValidation.isComplete) {
                      setError(`Cannot accept PO - customer billing information incomplete. Missing: ${poValidation.missingFields.join(', ')}`);
                      return;
                    }
                    handleActionSelect('po');
                  }}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    selectedAction === 'po'
                      ? 'border-blue-500 bg-blue-50'
                      : (!poValidation.acceptsPO || !poValidation.isComplete)
                      ? 'border-red-200 bg-red-50 opacity-75'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  disabled={!poValidation.acceptsPO || !poValidation.isComplete}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${
                      selectedAction === 'po'
                        ? 'bg-blue-100 text-blue-600'
                        : (!poValidation.acceptsPO || !poValidation.isComplete)
                        ? 'bg-red-100 text-red-600'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      <FileText className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 mb-1">
                        Add Purchase Order
                        {(!poValidation.acceptsPO || !poValidation.isComplete) && (
                          <span className="ml-2 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                            Unavailable
                          </span>
                        )}
                      </h3>

                      {!poValidation.acceptsPO && (
                        <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-medium text-amber-900">PO Acceptance Not Enabled</p>
                              <p className="text-xs text-amber-700 mt-1">
                                This customer is not approved to submit purchase orders. Update customer settings to enable PO acceptance.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {poValidation.acceptsPO && !poValidation.isComplete && (
                        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-medium text-red-900">Incomplete Billing Information</p>
                              <p className="text-xs text-red-700 mt-1">
                                Cannot accept PO - missing required fields: {poValidation.missingFields.join(', ')}
                              </p>
                              <a
                                href={`#contact/${contact.id}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onClose();
                                }}
                                className="text-xs text-blue-600 hover:text-blue-700 underline mt-2 inline-block"
                              >
                                Edit Customer Record →
                              </a>
                            </div>
                          </div>
                        </div>
                      )}

                      {poValidation.acceptsPO && poValidation.isComplete && (
                        <>
                          <p className="text-sm text-gray-600 mb-2">
                            Record the customer's PO number to finalize this sale. No deposit required for PO customers.
                          </p>
                          {selectedAction === 'po' && (
                            <>
                              <ul className="text-sm text-gray-600 space-y-1 mt-2 mb-3 pl-5 list-disc">
                                <li>Sales order will be created as "Planning"</li>
                                <li>No invoice will be generated initially</li>
                                <li>Progress billing will use Net 30 terms</li>
                                <li>Project can be scheduled immediately</li>
                              </ul>
                              <div className="space-y-3 mt-3 pt-3 border-t">
                                <div className="p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700 mb-2">
                                  <strong>Note:</strong> PO number can be added now or later. Approval will proceed even without it.
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    PO Number (Optional)
                                  </label>
                                  <input
                                    type="text"
                                    value={poNumber}
                                    onChange={(e) => setPoNumber(e.target.value)}
                                    placeholder="Enter PO number (can be added later)"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                  />
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    PO File (Optional)
                                  </label>
                                  <input
                                    type="file"
                                    onChange={(e) => setPoFile(e.target.files?.[0] || null)}
                                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                                    className="w-full text-sm"
                                  />
                                </div>
                              </div>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </button>
              </>
            )}

            {!proposal.require_deposit && (
              <button
                onClick={() => handleActionSelect('no_deposit')}
                className={`p-4 rounded-lg border-2 text-left transition-all ${
                  selectedAction === 'no_deposit'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${
                    selectedAction === 'no_deposit' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
                  }`}>
                    <CheckCircle className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 mb-1">Complete Approval</h3>
                    <p className="text-sm text-gray-600 mb-2">
                      No deposit or PO required. Sales order will be created and ready for scheduling.
                    </p>
                    {selectedAction === 'no_deposit' && (
                      <ul className="text-sm text-gray-600 space-y-1 mt-2 pl-5 list-disc">
                        <li>Sales order will be created as "Planning"</li>
                        <li>Project can be scheduled immediately</li>
                        <li>Final invoice will be created upon completion</li>
                      </ul>
                    )}
                  </div>
                </div>
              </button>
            )}
          </div>

          {/* Enhanced Email Notification Control */}
          <div className={`rounded-xl border-2 transition-all ${sendNotification ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50'}`}>
            <label className="flex items-start gap-4 cursor-pointer p-5">
              <div className="flex items-center mt-1">
                <input
                  type="checkbox"
                  checked={sendNotification}
                  onChange={(e) => setSendNotification(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Mail className={`w-5 h-5 ${sendNotification ? 'text-blue-600' : 'text-gray-400'}`} />
                  <p className={`font-semibold ${sendNotification ? 'text-blue-900' : 'text-gray-700'}`}>
                    Send Email Notification to Customer
                  </p>
                </div>

                {sendNotification ? (
                  <div className="space-y-3">
                    <div className="flex items-start gap-2 text-sm">
                      <div className="flex-1">
                        <p className="text-gray-700 mb-1">
                          <strong>Recipient:</strong> {contact.email}
                        </p>
                        <p className="text-gray-700">
                          <strong>Template:</strong> {
                            selectedAction === 'po'
                              ? 'Purchase Order Request (Purple Gradient Header)'
                              : selectedAction === 'deposit'
                              ? 'Deposit Payment Request (Green Gradient Header)'
                              : 'Approval Confirmation'
                          }
                        </p>
                      </div>
                    </div>

                    <div className="p-3 bg-white rounded-lg border border-blue-200">
                      <p className="text-sm font-medium text-blue-900 mb-2">Email will include:</p>
                      <ul className="text-sm text-blue-800 space-y-1.5">
                        {selectedAction === 'po' && (
                          <>
                            <li className="flex items-start gap-2">
                              <span className="text-blue-600 mt-0.5">•</span>
                              <span>Large "Upload Purchase Order" button</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="text-blue-600 mt-0.5">•</span>
                              <span>Total project amount: ${proposal.total?.toLocaleString()}</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="text-blue-600 mt-0.5">•</span>
                              <span>Multiple PO submission options</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="text-blue-600 mt-0.5">•</span>
                              <span>Direct portal link for easy access</span>
                            </li>
                          </>
                        )}
                        {selectedAction === 'deposit' && (
                          <>
                            <li className="flex items-start gap-2">
                              <span className="text-blue-600 mt-0.5">•</span>
                              <span>Large "Pay Deposit Now" button</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="text-blue-600 mt-0.5">•</span>
                              <span>Deposit amount: ${customDepositAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="text-blue-600 mt-0.5">•</span>
                              <span>Multiple payment options clearly listed</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="text-blue-600 mt-0.5">•</span>
                              <span>Security badge and payment instructions</span>
                            </li>
                          </>
                        )}
                        {selectedAction === 'no_deposit' && (
                          <>
                            <li className="flex items-start gap-2">
                              <span className="text-blue-600 mt-0.5">•</span>
                              <span>Approval confirmation details</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="text-blue-600 mt-0.5">•</span>
                              <span>Next steps and project timeline</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="text-blue-600 mt-0.5">•</span>
                              <span>Contact information for questions</span>
                            </li>
                          </>
                        )}
                      </ul>
                    </div>

                    <div className="flex items-start gap-2 p-3 bg-blue-100 rounded-lg">
                      <AlertCircle className="w-4 h-4 text-blue-700 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-blue-800 leading-relaxed">
                        <strong>Note:</strong> Customer portal access is automatic regardless of email.
                        They can always log in to view invoices, proposals, and take action even if they don't receive this email.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-600 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                      <span>No email will be sent. You'll notify the customer manually or they can access the portal directly.</span>
                    </p>
                    <div className="p-3 bg-gray-100 rounded-lg border border-gray-300">
                      <p className="text-xs text-gray-700">
                        The customer can still access everything through the portal.
                        This only controls whether they receive an email notification right now.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </label>
          </div>

          {recentNotifications.length > 0 && (
            <div className="mb-6">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Recent Notifications</h4>
              <div className="space-y-2">
                {recentNotifications.slice(0, 3).map((notification) => (
                  <div
                    key={notification.id}
                    className="text-sm p-3 bg-gray-50 rounded border border-gray-200"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-700">
                        {notification.notification_type.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                      </span>
                      <span className="text-gray-500">
                        {new Date(notification.sent_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-gray-600 mt-1">To: {notification.recipient_email}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={processing}
              className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!selectedAction || processing || uploading}
              className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {processing ? 'Processing...' : uploading ? 'Uploading...' : 'Continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
