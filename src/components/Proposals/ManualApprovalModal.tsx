import { useState, useEffect, useRef } from 'react';
import { X, CheckCircle, AlertTriangle, Send, Percent, ArrowRight, ClipboardCheck, Mail, CreditCard as Edit2, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface ManualApprovalModalProps {
  proposalId: string;
  proposalNumber: string;
  contactEmail: string;
  depositAmount: number;
  onClose: () => void;
  onSuccess: (salesOrderId?: string) => void;
}

export function ManualApprovalModal({
  proposalId,
  proposalNumber,
  contactEmail,
  depositAmount,
  onClose,
  onSuccess
}: ManualApprovalModalProps) {
  const { profile } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const [successPhase, setSuccessPhase] = useState<'magic' | 'done'>('magic');
  const [newSalesOrderId, setNewSalesOrderId] = useState<string | null>(null);

  const [acceptanceMethod, setAcceptanceMethod] = useState<'purchase_order' | 'verbal'>('verbal');
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState('');
  const [acceptanceMethods, setAcceptanceMethods] = useState<string[]>(['verbal']);

  const [requireDeposit, setRequireDeposit] = useState(true);
  const [depositType, setDepositType] = useState<'percentage' | 'parts_total' | 'custom' | 'none'>('percentage');
  const [depositPercent, setDepositPercent] = useState(50);
  const [customDepositAmount, setCustomDepositAmount] = useState(depositAmount);
  const [depositReceived, setDepositReceived] = useState(false);
  const [sendEmailNotification, setSendEmailNotification] = useState(true);

  const [paymentTerms, setPaymentTerms] = useState('Net 10');
  const [paymentTermsSource, setPaymentTermsSource] = useState<'contact' | 'settings' | 'default'>('default');
  const [proposalTotal, setProposalTotal] = useState(0);
  const [contactId, setContactId] = useState<string | null>(null);
  const [contactName, setContactName] = useState('');
  const [contactEmailResolved, setContactEmailResolved] = useState(contactEmail);
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailInput, setEmailInput] = useState(contactEmail);
  const [proposalSettingsId, setProposalSettingsId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const [projectManagementPercent, setProjectManagementPercent] = useState(0);
  const [systemDesignPercent, setSystemDesignPercent] = useState(0);
  const [creditCardFeePercent, setCreditCardFeePercent] = useState(0);
  const [miscPartsPercent, setMiscPartsPercent] = useState(0);
  const [showModifiers, setShowModifiers] = useState(false);

  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadProposalSettings();
  }, []);

  useEffect(() => {
    if (proposalSettingsId) {
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = setTimeout(() => autoSaveToDatabase(), 600);
    }
  }, [depositType, depositPercent, customDepositAmount, requireDeposit, projectManagementPercent, systemDesignPercent, creditCardFeePercent, miscPartsPercent, paymentTerms]);

  async function autoSaveToDatabase() {
    if (!proposalSettingsId) return;
    try {
      await supabase.from('proposal_settings').update({
        deposit_type: depositType,
        deposit_percent: depositPercent,
        deposit_amount: depositType === 'custom' ? customDepositAmount : null,
        require_deposit: requireDeposit,
        project_management_percent: projectManagementPercent,
        system_design_percent: systemDesignPercent,
        credit_card_fee_percent: creditCardFeePercent,
        misc_parts_percent: miscPartsPercent,
        balance_payment_terms: paymentTerms
      }).eq('id', proposalSettingsId);

      await supabase.rpc('calculate_proposal_totals', { p_proposal_id: proposalId });

      const { data: proposal } = await supabase
        .from('proposals')
        .select('deposit_amount_due, require_deposit')
        .eq('id', proposalId)
        .maybeSingle();

      if (proposal) {
        setCustomDepositAmount(proposal.deposit_amount_due || 0);
      }
    } catch (error) {
      console.error('Auto-save error:', error);
    }
  }

  async function loadProposalSettings() {
    try {
      const { data: proposal } = await supabase
        .from('proposals')
        .select('require_deposit, acceptance_methods, total, contact_id, deposit_amount_due')
        .eq('id', proposalId)
        .maybeSingle();

      const { data: settings } = await supabase
        .from('proposal_settings')
        .select(`
          id, acceptance_methods, deposit_type, deposit_percent, deposit_amount,
          require_deposit, project_management_percent, system_design_percent,
          credit_card_fee_percent, misc_parts_percent, balance_payment_terms
        `)
        .eq('proposal_id', proposalId)
        .maybeSingle();

      setProposalSettingsId(settings?.id || null);
      setContactId(proposal?.contact_id || null);

      const total = proposal?.total || 0;
      setProposalTotal(total);

      const req = proposal?.require_deposit ?? settings?.require_deposit ?? true;
      setRequireDeposit(req);

      if (settings) {
        const depType = settings.deposit_type || 'percentage';
        setDepositType(depType);
        setDepositPercent(settings.deposit_percent || 50);
        setProjectManagementPercent(settings.project_management_percent || 0);
        setSystemDesignPercent(settings.system_design_percent || 0);
        setCreditCardFeePercent(settings.credit_card_fee_percent || 0);
        setMiscPartsPercent(settings.misc_parts_percent || 0);
        if (settings.balance_payment_terms) {
          setPaymentTerms(settings.balance_payment_terms);
          setPaymentTermsSource('settings');
        }

        const precalculated = proposal?.deposit_amount_due || depositAmount || 0;
        setCustomDepositAmount(depType === 'none' ? 0 : precalculated);
      } else {
        setCustomDepositAmount(depositAmount);
      }

      const methods = (proposal?.acceptance_methods || settings?.acceptance_methods || ['verbal'])
        .filter((m: string) => m !== 'payment');
      setAcceptanceMethods(methods);

      // Load contact details including payment terms and email
      if (proposal?.contact_id) {
        const { data: contact } = await supabase
          .from('contacts')
          .select('default_payment_terms, email, first_name, last_name, full_name')
          .eq('id', proposal.contact_id)
          .maybeSingle();

        if (contact) {
          const name = contact.full_name || [contact.first_name, contact.last_name].filter(Boolean).join(' ') || '';
          setContactName(name);

          if (contact.email) {
            setContactEmailResolved(contact.email);
            setEmailInput(contact.email);
          }

          if (contact.default_payment_terms) {
            setPaymentTerms(contact.default_payment_terms);
            setPaymentTermsSource('contact');
          } else if (!settings?.balance_payment_terms) {
            setPaymentTerms('Net 10');
            setPaymentTermsSource('default');
          }
        }
      }
    } catch (error) {
      console.error('Error loading proposal settings:', error);
    }
  }

  const finalDepositAmount = Math.min(customDepositAmount, proposalTotal);

  function getDepositLabel() {
    if (!requireDeposit || depositType === 'none') return 'No deposit required';
    if (depositType === 'percentage') return `${depositPercent}% — $${finalDepositAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    if (depositType === 'parts_total') return `Parts total — $${finalDepositAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    if (depositType === 'custom') return `Custom — $${finalDepositAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    return '';
  }

  function getOutcomeInfo() {
    if (acceptanceMethod === 'purchase_order') {
      return { icon: ClipboardCheck, color: 'blue', label: 'PO — No deposit invoice', detail: 'Sales order proceeds to planning immediately.' };
    }
    if (!requireDeposit || depositType === 'none') {
      return { icon: CheckCircle, color: 'green', label: 'No deposit required', detail: 'Sales order proceeds to planning immediately.' };
    }
    if (depositReceived) {
      return { icon: CheckCircle, color: 'green', label: `Deposit of $${finalDepositAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} — marked PAID`, detail: 'Sales order proceeds to planning immediately.' };
    }
    const emailToUse = emailInput.trim() || contactEmailResolved;
    return {
      icon: AlertTriangle,
      color: 'amber',
      label: `Deposit invoice for $${finalDepositAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} will be sent`,
      detail: `Sales order status: Pending Deposit.${sendEmailNotification && emailToUse ? ` Email sent to ${emailToUse}.` : ''}`
    };
  }

  const emailMissing = !contactEmailResolved && !emailInput.trim();

  async function handleApprove() {
    if (acceptanceMethod === 'purchase_order' && !purchaseOrderNumber.trim()) {
      alert('Please enter a purchase order number');
      return;
    }

    setSubmitting(true);
    setSuccessPhase('magic');
    setShowSuccessAnimation(true);
    try {
      if (!profile?.id) throw new Error('User not authenticated');

      const updateData: any = {
        status: 'approved',
        approved_by: profile.id,
        approval_completed_at: new Date().toISOString(),
        accepted_via_method: acceptanceMethod,
        deposit_paid: depositReceived,
        payment_terms: paymentTerms,
        updated_at: new Date().toISOString()
      };

      if (depositReceived) updateData.deposit_payment_date = new Date().toISOString();
      if (acceptanceMethod === 'verbal' && !depositReceived && requireDeposit && depositType !== 'none') {
        updateData.deposit_request_sent = true;
        updateData.deposit_request_sent_at = new Date().toISOString();
      }
      if (acceptanceMethod === 'purchase_order') {
        updateData.purchase_order_number = purchaseOrderNumber.trim();
      }
      if (notes.trim()) updateData.approval_notes = notes.trim();

      // Use .select() to get the trigger-written sales_order_id back immediately
      const { data: updatedProposal, error: updateError } = await supabase
        .from('proposals')
        .update(updateData)
        .eq('id', proposalId)
        .select('sales_order_id, billing_action_taken')
        .maybeSingle();
      if (updateError) throw updateError;

      let salesOrderId: string | null = updatedProposal?.sales_order_id ?? null;

      // Update contact email if it was changed
      if (contactId && emailInput !== contactEmailResolved && emailInput.trim()) {
        try {
          await supabase.from('contacts').update({ email: emailInput.trim() }).eq('id', contactId);
          setContactEmailResolved(emailInput.trim());
        } catch { }
      }

      if (contactId) {
        try {
          await supabase.rpc('convert_prospect_to_customer', {
            p_contact_id: contactId,
            p_proposal_id: proposalId,
            p_proposal_number: proposalNumber
          });
        } catch { }
      }

      // Update proposal_settings separately (do NOT call calculate_proposal_totals here
      // as it triggers a second UPDATE on proposals that can interfere with the approval flow)
      await supabase.from('proposal_settings').update({
        deposit_type: depositType,
        deposit_percent: depositPercent,
        deposit_amount: depositType === 'custom' ? finalDepositAmount : null,
        require_deposit: requireDeposit,
        project_management_percent: projectManagementPercent,
        system_design_percent: systemDesignPercent,
        credit_card_fee_percent: creditCardFeePercent,
        misc_parts_percent: miscPartsPercent,
        balance_payment_terms: paymentTerms
      }).eq('proposal_id', proposalId);

      const emailToUse = emailInput.trim() || contactEmailResolved;
      if (acceptanceMethod === 'verbal' && !depositReceived && requireDeposit && depositType !== 'none' && sendEmailNotification && emailToUse) {
        try {
          await supabase.functions.invoke('send-proposal-email', {
            body: { proposalId, emailType: 'deposit_request', recipientEmail: emailToUse }
          });
        } catch { }
      }

      // If the trigger didn't return sales_order_id in the UPDATE response (can happen
      // due to RLS evaluation timing), do a short retry loop as fallback
      if (!salesOrderId) {
        for (let i = 0; i < 8; i++) {
          await new Promise(r => setTimeout(r, 600));
          const { data } = await supabase
            .from('proposals')
            .select('sales_order_id')
            .eq('id', proposalId)
            .maybeSingle();
          if (data?.sales_order_id) {
            salesOrderId = data.sales_order_id;
            break;
          }
        }
      }

      // If still no sales_order_id, the trigger may have failed - surface the error
      if (!salesOrderId) {
        // Try one direct DB lookup via RPC to bypass RLS
        const { data: soData } = await supabase
          .rpc('get_proposal_sales_order_id', { p_proposal_id: proposalId })
          .maybeSingle();
        if (soData) salesOrderId = soData as string;
      }

      setNewSalesOrderId(salesOrderId);
      setSuccessPhase('done');

      // Navigate after showing done animation
      setTimeout(() => {
        onSuccess(salesOrderId || undefined);
      }, 2000);
    } catch (error: any) {
      console.error('Error approving proposal:', error);
      setShowSuccessAnimation(false);
      setSuccessPhase('magic');
      alert(error.message || 'Error approving proposal. Please try again.');
      setSubmitting(false);
    }
  }

  const outcome = getOutcomeInfo();
  const hasModifiers = projectManagementPercent > 0 || systemDesignPercent > 0 || creditCardFeePercent > 0 || miscPartsPercent > 0;

  if (showSuccessAnimation) {
    const isMagic = successPhase === 'magic';
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div className="bg-gray-900 rounded-2xl shadow-2xl p-10 flex flex-col items-center gap-6 max-w-sm w-full mx-4 border border-gray-700" style={{ animation: 'fadeIn 0.25s ease-out both' }}>

          {isMagic ? (
            <>
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <div className="w-10 h-10 border-4 border-blue-400 border-t-transparent rounded-full" style={{ animation: 'spin 0.9s linear infinite' }} />
                </div>
                <div className="absolute inset-0 rounded-full border-2 border-blue-400/20" style={{ animation: 'ripple 1.8s ease-out 0.1s infinite' }} />
              </div>
              <div className="text-center">
                <h3 className="text-xl font-bold text-white mb-2">Magic happening...</h3>
                <p className="text-gray-400 text-sm">Creating your sales order &amp; invoice.</p>
                <p className="text-blue-400 text-sm mt-1 font-medium">Please wait just a moment.</p>
              </div>
              <div className="flex gap-1.5">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-2 h-2 rounded-full bg-blue-400" style={{ animation: `bounce 0.8s ease-in-out ${i * 0.15}s infinite` }} />
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="relative">
                <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center">
                  <CheckCircle className="w-10 h-10 text-green-400" style={{ animation: 'checkPop 0.4s ease-out 0.1s both' }} />
                </div>
                <div className="absolute inset-0 rounded-full border-2 border-green-400/30" style={{ animation: 'ripple 1.5s ease-out 0.3s infinite' }} />
              </div>
              <div className="text-center">
                <h3 className="text-xl font-bold text-white mb-2">Proposal Approved!</h3>
                <p className="text-gray-400 text-sm">Sales order created successfully.</p>
                <p className="text-green-400 text-sm mt-1 font-medium">Opening sales order...</p>
              </div>
              <div className="flex gap-1.5">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-2 h-2 rounded-full bg-green-400" style={{ animation: `bounce 0.8s ease-in-out ${i * 0.15}s infinite` }} />
                ))}
              </div>
            </>
          )}
        </div>
        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
          @keyframes checkPop {
            0% { transform: scale(0) rotate(-20deg); opacity: 0; }
            60% { transform: scale(1.15) rotate(5deg); opacity: 1; }
            100% { transform: scale(1) rotate(0); opacity: 1; }
          }
          @keyframes ripple {
            0% { transform: scale(1); opacity: 0.6; }
            100% { transform: scale(1.8); opacity: 0; }
          }
          @keyframes bounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-6px); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3 sm:p-4">
      <div className="bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col border border-gray-700">

        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white">Approve Proposal</h2>
            <p className="text-xs text-gray-400 mt-0.5">{proposalNumber} · Contract total: <span className="text-white font-semibold">${proposalTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></p>
          </div>
          <button onClick={onClose} disabled={submitting} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">

          {/* Section 1: Acceptance Method */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">1. How did the customer approve?</p>
            <div className="space-y-2">
              {acceptanceMethods.includes('verbal') && (
                <label className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${acceptanceMethod === 'verbal' ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700 hover:border-gray-600 bg-gray-800/50'}`}>
                  <input
                    type="radio"
                    name="acceptanceMethod"
                    value="verbal"
                    checked={acceptanceMethod === 'verbal'}
                    onChange={() => setAcceptanceMethod('verbal')}
                    className="accent-blue-500"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">Verbal / In-Person</p>
                    <p className="text-xs text-gray-400">Customer approved verbally or in person</p>
                  </div>
                </label>
              )}
              {acceptanceMethods.includes('purchase_order') && (
                <label className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${acceptanceMethod === 'purchase_order' ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700 hover:border-gray-600 bg-gray-800/50'}`}>
                  <input
                    type="radio"
                    name="acceptanceMethod"
                    value="purchase_order"
                    checked={acceptanceMethod === 'purchase_order'}
                    onChange={() => setAcceptanceMethod('purchase_order')}
                    className="accent-blue-500"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">Purchase Order</p>
                    <p className="text-xs text-gray-400">Customer issued a PO — no deposit required</p>
                  </div>
                </label>
              )}
            </div>

            {acceptanceMethod === 'purchase_order' && (
              <div className="mt-3">
                <label className="block text-xs font-medium text-gray-300 mb-1.5">PO Number *</label>
                <input
                  type="text"
                  value={purchaseOrderNumber}
                  onChange={(e) => setPurchaseOrderNumber(e.target.value)}
                  placeholder="e.g. PO-2024-00123"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
            )}
          </div>

          {/* Section 2: Deposit Settings (only for verbal) */}
          {acceptanceMethod === 'verbal' && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">2. Deposit settings</p>

              <div className="bg-gray-800/60 rounded-xl border border-gray-700 p-4 space-y-4">
                {/* Require deposit toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white">Require Deposit</p>
                    <p className="text-xs text-gray-400">{getDepositLabel()}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !requireDeposit;
                      setRequireDeposit(next);
                      if (!next) setDepositType('none');
                      else if (depositType === 'none') {
                        setDepositType('percentage');
                        setCustomDepositAmount((proposalTotal * depositPercent) / 100);
                      }
                    }}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out cursor-pointer focus:outline-none ${requireDeposit ? 'bg-blue-500' : 'bg-gray-600'}`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${requireDeposit ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>

                {requireDeposit && depositType !== 'none' && (
                  <>
                    {/* Deposit type + amount row */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1.5">Deposit Type</label>
                        <select
                          value={depositType}
                          onChange={async (e) => {
                            const newType = e.target.value as any;
                            setDepositType(newType);
                            if (newType === 'percentage') {
                              setCustomDepositAmount((proposalTotal * depositPercent) / 100);
                            } else if (newType === 'parts_total') {
                              const { data } = await supabase.from('proposals').select('parts_total').eq('id', proposalId).maybeSingle();
                              setCustomDepositAmount(data?.parts_total || 0);
                            } else if (newType === 'none') {
                              setCustomDepositAmount(0);
                              setRequireDeposit(false);
                            }
                          }}
                          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="percentage">Percentage</option>
                          <option value="parts_total">Parts Total</option>
                          <option value="custom">Custom</option>
                          <option value="none">No Deposit</option>
                        </select>
                      </div>

                      {depositType === 'percentage' && (
                        <div>
                          <label className="block text-xs font-medium text-gray-400 mb-1.5">Percentage</label>
                          <div className="relative">
                            <input
                              type="number"
                              value={depositPercent}
                              onChange={(e) => {
                                const p = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
                                setDepositPercent(p);
                                setCustomDepositAmount((proposalTotal * p) / 100);
                              }}
                              min="0" max="100" step="1"
                              className="w-full pr-7 pl-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <Percent className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                          </div>
                        </div>
                      )}

                      {depositType === 'custom' && (
                        <div>
                          <label className="block text-xs font-medium text-gray-400 mb-1.5">Amount</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                            <input
                              type="number"
                              value={customDepositAmount}
                              onChange={(e) => setCustomDepositAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                              min="0" step="0.01"
                              className="w-full pl-7 pr-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                      )}

                      {depositType === 'parts_total' && (
                        <div>
                          <label className="block text-xs font-medium text-gray-400 mb-1.5">Calculated Amount</label>
                          <div className="px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg text-white text-sm font-semibold">
                            ${customDepositAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Quick % buttons */}
                    {depositType === 'percentage' && (
                      <div className="grid grid-cols-4 gap-2">
                        {[25, 50, 75, 100].map(p => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => { setDepositPercent(p); setCustomDepositAmount((proposalTotal * p) / 100); }}
                            className={`py-1.5 text-xs rounded-lg border transition-colors ${depositPercent === p ? 'bg-blue-500 border-blue-500 text-white' : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-500'}`}
                          >
                            {p}%
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Deposit amount summary */}
                    <div className="flex items-center justify-between py-2 border-t border-gray-700">
                      <span className="text-xs text-gray-400">Deposit invoice amount</span>
                      <span className="text-base font-bold text-white">${finalDepositAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                    </div>

                    {/* Already received toggle */}
                    <label className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${depositReceived ? 'border-green-500 bg-green-500/10' : 'border-gray-700 hover:border-gray-600 bg-gray-800/30'}`}>
                      <input
                        type="checkbox"
                        checked={depositReceived}
                        onChange={(e) => setDepositReceived(e.target.checked)}
                        className="accent-green-500"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-white">Deposit already received</p>
                        <p className="text-xs text-gray-400">Invoice will be created and marked as PAID</p>
                      </div>
                      <CheckCircle className={`w-5 h-5 flex-shrink-0 ${depositReceived ? 'text-green-400' : 'text-gray-600'}`} />
                    </label>

                    {/* Send email toggle (only when not received) */}
                    {!depositReceived && (
                      <label className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                        emailMissing ? 'border-gray-700 bg-gray-800/20 opacity-50 cursor-not-allowed' :
                        sendEmailNotification ? 'border-blue-500/50 bg-blue-500/5' : 'border-gray-700 hover:border-gray-600 bg-gray-800/30'
                      }`}>
                        <input
                          type="checkbox"
                          checked={sendEmailNotification && !emailMissing}
                          onChange={(e) => !emailMissing && setSendEmailNotification(e.target.checked)}
                          disabled={emailMissing}
                          className="accent-blue-500"
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-white">Send deposit request email</p>
                          <p className="text-xs text-gray-400">
                            {emailMissing ? 'Add customer email above to enable' : `To: ${emailInput || contactEmailResolved}`}
                          </p>
                        </div>
                        <Send className={`w-4 h-4 flex-shrink-0 ${sendEmailNotification && !emailMissing ? 'text-blue-400' : 'text-gray-600'}`} />
                      </label>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Customer & Terms */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              {acceptanceMethod === 'verbal' ? '3.' : '2.'} Confirm customer details
            </p>
            <div className="space-y-3">

              {/* Payment terms — read-only display */}
              <div className="flex items-center justify-between px-4 py-3 bg-gray-800/60 rounded-xl border border-gray-700">
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Payment Terms</p>
                  <p className="text-sm font-semibold text-white">{paymentTerms}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    paymentTermsSource === 'contact' ? 'bg-green-500/20 text-green-400' :
                    paymentTermsSource === 'settings' ? 'bg-blue-500/20 text-blue-400' :
                    'bg-gray-600/60 text-gray-400'
                  }`}>
                    {paymentTermsSource === 'contact' ? 'from customer profile' :
                     paymentTermsSource === 'settings' ? 'from proposal' :
                     'default'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowModifiers(!showModifiers)}
                    className="text-xs text-gray-500 hover:text-gray-300 transition-colors underline"
                  >
                    override
                  </button>
                </div>
              </div>

              {showModifiers && (
                <div className="space-y-3 p-3 bg-gray-800/60 rounded-xl border border-gray-700">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Balance Payment Terms</label>
                    <select
                      value={paymentTerms}
                      onChange={(e) => { setPaymentTerms(e.target.value); setPaymentTermsSource('settings'); }}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="Net 10">Net 10</option>
                      <option value="Due on Receipt">Due on Receipt</option>
                      <option value="Net 15">Net 15</option>
                      <option value="Net 30">Net 30</option>
                      <option value="Net 45">Net 45</option>
                      <option value="Net 60">Net 60</option>
                      <option value="Net 90">Net 90</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Project Mgmt %', value: projectManagementPercent, setter: setProjectManagementPercent },
                      { label: 'System Design %', value: systemDesignPercent, setter: setSystemDesignPercent },
                      { label: 'Credit Card Fee %', value: creditCardFeePercent, setter: setCreditCardFeePercent },
                      { label: 'Misc Parts %', value: miscPartsPercent, setter: setMiscPartsPercent },
                    ].map(({ label, value, setter }) => (
                      <div key={label}>
                        <label className="block text-xs text-gray-400 mb-1">{label}</label>
                        <div className="relative">
                          <input
                            type="number" value={value}
                            onChange={(e) => setter(Math.max(0, parseFloat(e.target.value) || 0))}
                            min="0" step="0.1" placeholder="0"
                            className="w-full pr-7 pl-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <Percent className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Customer email */}
              <div className="px-4 py-3 bg-gray-800/60 rounded-xl border border-gray-700">
                <div className="flex items-center justify-between mb-0.5">
                  <p className="text-xs text-gray-400">Customer Email</p>
                  {!editingEmail && (
                    <button
                      type="button"
                      onClick={() => setEditingEmail(true)}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      <Edit2 size={10} />
                      <span>edit</span>
                    </button>
                  )}
                </div>
                {editingEmail ? (
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="email"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder="Enter customer email"
                      autoFocus
                      className="flex-1 px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => { setContactEmailResolved(emailInput.trim()); setEditingEmail(false); }}
                      className="px-2 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg transition-colors"
                    >
                      Save
                    </button>
                  </div>
                ) : emailInput ? (
                  <div className="flex items-center gap-2">
                    <Mail size={12} className="text-gray-400 flex-shrink-0" />
                    <p className="text-sm text-white truncate">{emailInput}</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <AlertCircle size={12} className="text-amber-400 flex-shrink-0" />
                    <p className="text-sm text-amber-400">No email on file — add one to send notifications</p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Approval Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any notes about this approval..."
                  rows={2}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>
          </div>

          {/* Outcome preview */}
          <div className={`rounded-xl border p-4 ${
            outcome.color === 'green' ? 'bg-green-500/10 border-green-500/30' :
            outcome.color === 'amber' ? 'bg-amber-500/10 border-amber-500/30' :
            'bg-blue-500/10 border-blue-500/30'
          }`}>
            <div className="flex items-start gap-3">
              <outcome.icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                outcome.color === 'green' ? 'text-green-400' :
                outcome.color === 'amber' ? 'text-amber-400' :
                'text-blue-400'
              }`} />
              <div>
                <p className={`text-sm font-semibold ${
                  outcome.color === 'green' ? 'text-green-300' :
                  outcome.color === 'amber' ? 'text-amber-300' :
                  'text-blue-300'
                }`}>{outcome.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{outcome.detail}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-700 flex items-center justify-between flex-shrink-0 gap-3">
          <button onClick={onClose} disabled={submitting} className="px-4 py-2.5 text-sm text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button
            onClick={handleApprove}
            disabled={submitting}
            className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-xl font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-green-900/30"
          >
            {submitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Approving...</span>
              </>
            ) : (
              <>
                <CheckCircle size={16} />
                <span>Approve & Create Sales Order</span>
                <ArrowRight size={14} className="opacity-70" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
