import { SecurityActivationDates } from './SecurityActivationDates';
import SecurityContractReviewFields from './SecurityContractReviewFields';
import { sendSecurityInvitation, staffSecurityOnboarding } from '../../lib/securityOnboarding';
import { SecurityBillingPanel } from './SecurityBillingPanel';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { readableAgreementTerms, securityAgreementHtml, printSecurityAgreement } from '../../lib/securityAgreementDocument';
import { formatCurrency } from '../../lib/utils';
import { ArrowLeft, CheckCircle, Mail, AlertCircle, User, Shield, Phone, CreditCard, Ligature as FileSignature, MapPin, CreditCard as Edit, Printer, Trash2, Ban, Wrench, ShieldCheck } from 'lucide-react';
import ManualContractEntry from './ManualContractEntry';
import { BillingPrefBadge } from '../Shared/BillingPrefBadge';
import ConfirmModal from '../ui/ConfirmModal';
import { AGREEMENT_TYPE_LABELS, SYSTEM_TYPE_LABELS, SERVICE_SCHEDULE_LABELS, type AgreementType, type SystemType } from '../../lib/types';

interface SecurityContractDetailProps {
  contract?: any;
  contractId?: string;
  onClose: () => void;
  onUpdate?: () => void;
}

export default function SecurityContractDetail({ contract, contractId, onClose, onUpdate }: SecurityContractDetailProps) {
  const { profile } = useAuth();
  const resolvedContractId = contract?.id || contractId;
  const [contractData, setContractData] = useState<any>(null);
  const [canManage, setCanManage] = useState(false);
  const [editingReview, setEditingReview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [confirmSendInvitation, setConfirmSendInvitation] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmActivate, setConfirmActivate] = useState(false);
  const [monitoringStartDate, setMonitoringStartDate] = useState('');
  const [firstPaymentDate, setFirstPaymentDate] = useState('');
  const [editingActivationDates, setEditingActivationDates] = useState(false);
  const [cancellationDate, setCancellationDate] = useState('');
  const [cancellationReason, setCancellationReason] = useState('');
  const [immediateCancel, setImmediateCancel] = useState(true);
  const [billingUpdating, setBillingUpdating] = useState(false);
  const [billingError, setBillingError] = useState('');

  async function setSecurityBilling(mode: 'autopay' | 'mail') {
    setBillingUpdating(true);setBillingError('');
    try {
      const {error}=await supabase.from('security_contracts').update({security_billing_mode:mode}).eq('id',resolvedContractId);
      if(error) throw error;
      await loadContractDetails();onUpdate?.();
    } catch(e) {setBillingError(e instanceof Error ? e.message : 'Billing authorization could not be updated');}
    finally {setBillingUpdating(false);}
  }

  useEffect(() => {
    loadContractDetails();
  }, [resolvedContractId]);

  async function loadContractDetails() {
    try {
      const { data, error } = await supabase
        .from('security_contracts')
        .select(`
          *,
          contact:contacts(*),
          template:security_contract_templates(*),
          services:security_contract_services(*, service:monitoring_services(*)),
          responses:security_contract_responses(
            *,
            field:security_contract_fields(*)
          ),
          equipment:security_contract_equipment(*),
          emergency_contacts:security_contract_emergency_contacts(*),
          approvals:security_contract_approvals(*)
        `)
        .eq('id', resolvedContractId)
        .single();

      if (error) throw error;
      const { data: access } = await supabase.rpc('security_staff_access', { p_org: data.organization_id, p_manage: true });
      setCanManage(access === true);
      const accepted = data.onboarding_agreement_snapshot;
      setContractData(accepted ? { ...data,
        contact: { ...data.contact, ...(accepted.personalInfo || {}) },
        property_address: accepted.propertyInfo?.address_line1 ?? data.property_address,
        property_city: accepted.propertyInfo?.city ?? data.property_city,
        property_state: accepted.propertyInfo?.state ?? data.property_state,
        property_zip: accepted.propertyInfo?.zip_code ?? data.property_zip,
      } : data);
    } catch (error) {
      console.error('Error loading contract details:', error);
      alert('Failed to load contract details');
    } finally {
      setLoading(false);
    }
  }

  async function handleSendInvitation() {
    setSending(true);
    try {
      await sendSecurityInvitation(resolvedContractId);

      alert('Invitation sent successfully!');
      onUpdate?.();
      onClose();
    } catch (error: any) {
      console.error('Error sending invitation:', error);
      const errorMessage = error?.message || 'Unknown error occurred';
      alert(`Failed to send invitation: ${errorMessage}`);
    } finally {
      setSending(false);
    }
  }

  async function handleApprove() {
    if (editingReview) { alert('Save or cancel the field edit before approval.'); return; }
    setApproving(true);
    try {
      await staffSecurityOnboarding('approve', resolvedContractId, { revision: contractData.onboarding_revision || 0 });

      alert('Contract approved!');
      onUpdate?.();
      onClose();
    } catch (error) {
      console.error('Error approving contract:', error);
      alert(error instanceof Error ? error.message : 'Failed to approve contract');
    } finally {
      setApproving(false);
    }
  }

  async function handleReject() {
    if (!rejectionReason.trim()) {
      alert('Please provide a rejection reason');
      return;
    }

    setRejecting(true);
    try {
      await staffSecurityOnboarding('reject', resolvedContractId, { revision: contractData.onboarding_revision || 0, reason: rejectionReason });

      alert('Contract rejected');
      onUpdate?.();
      onClose();
    } catch (error) {
      console.error('Error rejecting contract:', error);
      alert(error instanceof Error ? error.message : 'Failed to reject contract');
    } finally {
      setRejecting(false);
    }
  }

  async function handleActivate() {
    if (editingReview) { alert('Save or cancel the field edit before activation.'); return; }
    try {
      await staffSecurityOnboarding('activate', resolvedContractId, { revision: contractData.onboarding_revision || 0, monitoring_start_date: monitoringStartDate, first_payment_date: firstPaymentDate });

      alert('Contract activated!');
      onUpdate?.();
      onClose();
    } catch (error) {
      console.error('Error activating contract:', error);
      alert(error instanceof Error ? error.message : 'Failed to activate contract');
    }
  }

  async function handleDelete() {
    try {
      const { error } = await supabase
        .from('security_contracts')
        .delete()
        .eq('id', resolvedContractId);

      if (error) throw error;

      alert('Contract deleted permanently');
      onUpdate?.();
      onClose();
    } catch (error) {
      console.error('Error deleting contract:', error);
      alert('Failed to delete contract');
    } finally {
      setShowDeleteConfirm(false);
    }
  }

  async function handleCancel() {
    if (!cancellationReason.trim()) {
      alert('Please provide a cancellation reason');
      return;
    }

    try {
      const finalBillingDate = immediateCancel ? new Date().toISOString().split('T')[0] : cancellationDate;

      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('security_contracts')
        .update({
          status: 'cancelled',
          cancellation_requested_at: new Date().toISOString(),
          final_billing_date: finalBillingDate,
          cancellation_reason: cancellationReason,
          cancelled_by_user_id: user?.id ?? null
        })
        .eq('id', resolvedContractId);

      if (error) throw error;

      alert(immediateCancel ? 'Contract cancelled immediately' : `Contract scheduled to cancel on ${finalBillingDate}`);
      onUpdate?.();
      onClose();
    } catch (error) {
      console.error('Error cancelling contract:', error);
      alert('Failed to cancel contract');
    } finally {
      setShowCancelModal(false);
    }
  }

  function handlePrint() {
    const d = contractData;
    if (d?.onboarding_agreement_snapshot) {
      const doc = d.onboarding_agreement_snapshot;
      const terms = readableAgreementTerms(doc.template?.contract_terms || '').replace(/\[term\]/g, `${doc.term_months} months`);
      try { printSecurityAgreement(securityAgreementHtml(doc, terms, undefined, d.customer_signature, d.customer_signature_date, undefined, {start_date:d.monitoring_start_date || null,first_payment_date:d.first_payment_date || null})); }
      catch (error) { alert(error instanceof Error ? error.message : 'Could not print the agreement.'); }
      return;
    }
    const doc = {
      contract_number: d.contract_number, monthly_price: d.monthly_price, term_months: d.term_months,
      renewal_term_months: d.renewal_term_months, cancellation_notice_days: d.cancellation_notice_days,
      billing_mode: d.security_billing_mode, mail_invoice_fee: d.mail_invoice_fee,
      template: d.template, dealer: null, services: (d.services || []).map((s: any) => ({ name: s.service?.name || '', monthly_price: s.monthly_price })),
      personalInfo: { full_name: d.contact?.full_name || `${d.contact?.first_name || ''} ${d.contact?.last_name || ''}`, email: d.contact?.email || '', phone: d.contact?.phone || '' },
      propertyInfo: { address_line1: d.property_address || '', city: d.property_city || '', state: d.property_state || '', zip_code: d.property_zip || '' },
    };
    const terms = readableAgreementTerms(d.template?.contract_terms || '').replace(/\[term\]/g, `${d.term_months} months`);
    try { printSecurityAgreement(securityAgreementHtml(doc, terms, undefined, d.customer_signature, d.customer_signature_date, undefined, {start_date:d.monitoring_start_date || null,first_payment_date:d.first_payment_date || null})); }
    catch (error) { alert(error instanceof Error ? error.message : 'Could not print the agreement.'); }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading contract details...</p>
        </div>
      </div>
    );
  }

  if (!contractData) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600">Contract not found</p>
        <button onClick={onClose} className="mt-4 text-blue-600 hover:underline">
          Go back
        </button>
      </div>
    );
  }

  const missingPhone = !contractData?.contact?.phone;
  const missingAddress = !contractData?.contact?.address_line1;

  const sections: any[] = [
    {
      id: 'personal',
      title: 'Step 1: Personal Information',
      icon: User,
      description: missingPhone ? 'Phone is missing — customer must enter it' : 'All prefilled - customer verifies only',
      missingRequiredFields: missingPhone,
      fields: [
        { label: 'Full Name', value: contractData?.contact?.full_name, prefilled: true, disabled: true },
        { label: 'Email', value: contractData?.contact?.email, prefilled: true, disabled: true },
        { label: 'Phone', value: contractData?.contact?.phone, prefilled: true, disabled: true, required: true }
      ],
      note: 'Customer sees: "Please verify your information above. If anything needs to be updated, contact us before proceeding."'
    },
    {
      id: 'property',
      title: 'Step 2: Property Details',
      icon: MapPin,
      description: missingAddress ? 'Service address is missing — customer must enter it' : 'All prefilled - customer verifies only',
      missingRequiredFields: missingAddress,
      fields: [
        { label: 'Service Address', value: contractData?.contact?.address_line1, prefilled: true, disabled: true, required: true },
        { label: 'City', value: contractData?.contact?.city, prefilled: true, disabled: true, thirdWidth: true },
        { label: 'State', value: contractData?.contact?.state, prefilled: true, disabled: true, thirdWidth: true },
        { label: 'ZIP Code', value: contractData?.contact?.zip_code, prefilled: true, disabled: true, thirdWidth: true }
      ]
    },
    {
      id: 'emergency',
      title: 'Step 3: Monitoring Station Call List',
      icon: Phone,
      description: 'Customer adds at least 2 contacts - monitoring station will call them in order during alarms',
      customerAdds: true,
      minRequired: 2,
      contactFields: ['Name (text)', 'Phone Number (text) - for call list', 'Password/Codeword (text) - unique to each contact for verification', 'Can authorize entry (checkbox)']
    },
    {
      id: 'billing',
      title: 'Step 4: Payment Method',
      icon: CreditCard,
      description: 'Customer selects payment method and enters billing details',
      fields: [
        {
          label: 'Monthly Monitoring Fee',
          value: contractData?.monthly_price ? `${formatCurrency(parseFloat(contractData.monthly_price))}/month` : '$XX.XX/month',
          prefilled: true
        },
        {
          label: 'Payment Method',
          value: contractData?.payment_method ? (contractData.payment_method === 'credit_card' ? 'Credit Card' : 'ACH / Bank Account') : 'Not set yet',
          prefilled: false
        },
        {
          label: 'Last Four Digits',
          value: contractData?.last_four ? `****${contractData.last_four}` : 'Not entered yet',
          prefilled: false
        }
      ],
      paymentOptions: ['Credit Card (Visa, Mastercard, Amex)', 'ACH / Bank Account (Direct bank transfer)'],
      note: 'Customer sees: "An invoice will be generated monthly and automatically charged to your payment method on file. Payment information is securely stored and processed through QuickBooks Online."'
    },
    {
      id: 'signature',
      title: 'Step 5: Sign Contract',
      icon: FileSignature,
      description: 'Customer reviews full contract terms and signs digitally',
      completed: !!contractData?.customer_signature,
      hasTerms: true,
      note: 'Customer sees: Full contract terms (from template) + signature pad + "By signing below, you acknowledge that you have read and agree to the terms and conditions of this security monitoring agreement."'
    }
  ];

  return (
    <>

      <div className="security-onboarding-controls p-8 contract-print-root">
        <SecurityBillingPanel contractId={contractData.id} organizationId={contractData.organization_id} canEdit={canManage && !contractData.customer_completed_at} />
        <div className="mb-6 no-print">
          <button
            onClick={onClose}
            className="flex items-center gap-2 text-gray-300 hover:text-white mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to contracts
          </button>

          <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg p-6 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-2xl font-bold text-white">Contract {contractData.contract_number}</h1>
                  {contractData.agreement_type && (
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      contractData.agreement_type === 'monitoring' ? 'bg-blue-100 text-blue-800' :
                      contractData.agreement_type === 'maintenance' ? 'bg-green-100 text-green-800' :
                      'bg-amber-100 text-amber-800'
                    }`}>
                      {contractData.agreement_type === 'monitoring' && <Shield className="w-3 h-3 inline mr-1" />}
                      {contractData.agreement_type === 'maintenance' && <Wrench className="w-3 h-3 inline mr-1" />}
                      {contractData.agreement_type === 'equipment_warranty' && <ShieldCheck className="w-3 h-3 inline mr-1" />}
                      {AGREEMENT_TYPE_LABELS[contractData.agreement_type as AgreementType] || contractData.agreement_type}
                    </span>
                  )}
                </div>
                <p className="text-blue-100 mt-1">{contractData.template?.name}</p>
                {contractData.system_type && contractData.system_type !== 'security' && (
                  <p className="text-sm text-blue-200 mt-1">System: {SYSTEM_TYPE_LABELS[contractData.system_type as SystemType] || contractData.system_type}</p>
                )}
                {contractData.service_schedule && (
                  <p className="text-sm text-blue-200 mt-1">Service Schedule: {SERVICE_SCHEDULE_LABELS[contractData.service_schedule] || contractData.service_schedule}</p>
                )}
                {contractData.warranty_start_date && contractData.warranty_end_date && (
                  <p className="text-sm text-blue-200 mt-1">
                    Warranty: {new Date(contractData.warranty_start_date).toLocaleDateString()} - {new Date(contractData.warranty_end_date).toLocaleDateString()}
                  </p>
                )}
                <p className="text-sm text-blue-200 mt-2">Preview as customer sees it</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-2 px-4 py-2 bg-white text-blue-600 rounded-lg hover:bg-blue-50 font-medium"
                >
                  <Printer className="w-4 h-4" />
                  Print Contract
                </button>
                {contractData.onboarding_original_snapshot?.document && <button type="button" onClick={() => {
                  const original = contractData.onboarding_original_snapshot;
                  const terms = readableAgreementTerms(original.document.template?.contract_terms || '').replace(/\[term\]/g, `${original.document.term_months} months`);
                  printSecurityAgreement(securityAgreementHtml(original.document, terms, undefined, original.signature, original.signed_at));
                }} className="px-4 py-2 bg-white text-blue-600 rounded-lg">Print Original Submission</button>}
                {(contractData.status === 'draft' || contractData.status === 'pending_customer') && (
                  <button
                    onClick={() => setShowManualEntry(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-white text-blue-600 rounded-lg hover:bg-blue-50 font-medium"
                  >
                    <Edit className="w-4 h-4" />
                    Fill Out Manually
                  </button>
                )}
                <div className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                  contractData.status === 'draft' ? 'bg-yellow-100 text-yellow-800' :
                  contractData.status === 'pending_customer' ? 'bg-blue-100 text-blue-800' :
                  contractData.status === 'pending_approval' ? 'bg-orange-100 text-orange-800' :
                  'bg-green-100 text-green-800'
                }`}>
                  {contractData.status.replace('_', ' ').toUpperCase()}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="border border-blue-200 bg-blue-50 rounded-xl p-4 space-y-3 print-hide">
          <p className="font-semibold text-blue-900">Security billing: {contractData.security_billing_mode === 'mail' ? 'Admin-approved mailed invoices' : 'Required AutoPay'}</p>
          <p className="text-sm text-blue-900">{contractData.security_billing_mode === 'mail' ? 'The monthly price includes the $7 mailed-invoice fee.' : 'The customer must add or select a verified payment method and authorize recurring automatic payments.'}</p>
          {profile?.role === 'admin' && !contractData.customer_completed_at && ['draft','pending_customer'].includes(contractData.status) &&
            <button disabled={billingUpdating} onClick={()=>void setSecurityBilling(contractData.security_billing_mode === 'mail' ? 'autopay' : 'mail')}
              className="px-4 py-2 bg-blue-900 text-white rounded-lg disabled:opacity-50">
              {contractData.security_billing_mode === 'mail' ? 'Require AutoPay (remove $7/month fee)' : 'Authorize mailed invoices (+$7/month)'}
            </button>}
          {billingError && <p role="alert" className="text-red-700">{billingError}</p>}
        </div>
        {/* Print Header - Only shows when printing */}
        <div className="print-show mb-8">
          <div className="text-center border-b-2 border-gray-800 pb-4 mb-6">
            <h1 className="text-3xl font-bold text-gray-900">Security Monitoring Contract</h1>
            <p className="text-lg text-gray-600 mt-2">Contract Number: {contractData.contract_number}</p>
            <p className="text-sm text-gray-500 mt-1">{contractData.template?.name}</p>
            <p className="text-xs text-gray-400 mt-2">Printed on {new Date().toLocaleString()}</p>
          </div>
        </div>

      <div className="grid grid-cols-1 gap-6">
        <div className="space-y-6">
          {contractData.customer_completed_at && <SecurityContractReviewFields contract={contractData} canAdmin={profile?.role === 'admin'} canEdit={canManage && ['customer_completed','pending_approval','approved','rejected'].includes(contractData.status)} onEditing={setEditingReview} onSaved={async () => { await loadContractDetails(); onUpdate?.(); }} />}
          {!contractData.customer_completed_at && sections.map((section) => {
            const Icon = section.icon;
            return (
              <div key={section.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className={`border-b border-gray-200 px-6 py-4 ${section.missingRequiredFields ? 'bg-amber-50' : 'bg-gradient-to-r from-blue-50 to-blue-50'}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${section.missingRequiredFields ? 'bg-amber-500' : 'bg-blue-600'}`}>
                      {section.missingRequiredFields ? <AlertCircle className="w-5 h-5 text-white" /> : <Icon className="w-5 h-5 text-white" />}
                    </div>
                    <div className="flex-1">
                      <h2 className="text-lg font-semibold text-gray-900">{section.title}</h2>
                      {section.description && (
                        <p className={`text-sm mt-1 ${section.missingRequiredFields ? 'text-amber-700 font-medium' : 'text-gray-600'}`}>{section.description}</p>
                      )}
                    </div>
                    {section.completed && (
                      <div className="flex items-center gap-2 text-green-600">
                        <CheckCircle className="w-5 h-5" />
                        <span className="text-sm font-medium">Completed</span>
                      </div>
                    )}
                    {section.missingRequiredFields && (
                      <div className="flex items-center gap-2 text-amber-600">
                        <AlertCircle className="w-5 h-5" />
                        <span className="text-sm font-semibold">Action Required</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-6">
                  {section.fields && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      {section.fields.map((field: any, idx: number) => (
                        <div key={idx} className={field.thirdWidth ? '' : field.options ? 'md:col-span-2' : ''}>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            {field.label}
                            {field.required && <span className="text-red-500 ml-1">*</span>}
                          </label>

                          {field.prefilled && field.value ? (
                            <div className="px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg">
                              <div className="flex items-center gap-2">
                                <CheckCircle className="w-4 h-4 text-blue-600 flex-shrink-0" />
                                <span className="text-gray-900 font-medium">{field.value}</span>
                              </div>
                              <div className="text-xs text-blue-600 mt-1 ml-6">Pre-filled from contact</div>
                            </div>
                          ) : field.value ? (
                            <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900">
                              {field.value}
                            </div>
                          ) : field.required ? (
                            <div className="px-4 py-3 bg-amber-50 border border-amber-400 rounded-lg">
                              <div className="flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                                <span className="text-amber-800 font-semibold text-sm">Required — not on file</span>
                              </div>
                              <div className="text-xs text-amber-700 mt-1 ml-6">Customer must enter this when completing the form</div>
                            </div>
                          ) : (
                            <div className="px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg text-gray-400 italic">
                              {field.note || 'Customer will fill this in'}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {section.note && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                      <p className="text-sm text-yellow-900">{section.note}</p>
                    </div>
                  )}

                  {section.paymentOptions && (
                    <div className="space-y-3">
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 no-print">
                        <div className="font-semibold text-gray-900 mb-2">Available Payment Methods:</div>
                        <div className="space-y-2">
                          {section.paymentOptions.map((option: string, idx: number) => (
                            <div key={idx} className="flex items-center gap-2 text-sm text-gray-700">
                              <CreditCard className="w-4 h-4 text-blue-600" />
                              <span>{option}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Comprehensive Payment Details for Print */}
                      {contractData?.payment_method && (
                        <div className="print-avoid-break mt-4 p-4 border-2 border-gray-300 rounded-lg bg-yellow-50">
                          <h3 className="font-bold text-gray-900 mb-3 text-lg">Payment Information on File</h3>

                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="font-semibold text-gray-700">Payment Method:</span>
                              <span className="text-gray-900">{contractData.payment_method === 'credit_card' ? 'Credit Card' : 'ACH / Bank Account'}</span>
                            </div>

                            {contractData.payment_method === 'credit_card' ? (
                              <>
                                <div className="flex justify-between">
                                  <span className="font-semibold text-gray-700">Card Ending In:</span>
                                  <span className="text-gray-900">****{contractData.last_four || 'XXXX'}</span>
                                </div>
                                <div className="print-show mt-3 p-3 bg-white border border-red-300 rounded">
                                  <p className="text-xs text-red-600 font-semibold mb-2">SENSITIVE PAYMENT DATA - KEEP SECURE</p>
                                  <div className="text-sm text-gray-900">
                                    Full card details are securely stored in QuickBooks Online and processed automatically for monthly billing.
                                  </div>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="flex justify-between">
                                  <span className="font-semibold text-gray-700">Account Ending In:</span>
                                  <span className="text-gray-900">****{contractData.last_four || 'XXXX'}</span>
                                </div>
                                <div className="print-show mt-3 p-3 bg-white border border-red-300 rounded">
                                  <p className="text-xs text-red-600 font-semibold mb-2">SENSITIVE PAYMENT DATA - KEEP SECURE</p>
                                  <div className="text-sm text-gray-900">
                                    Full bank account details are securely stored in QuickBooks Online and processed automatically for monthly billing.
                                  </div>
                                </div>
                              </>
                            )}

                            <div className="flex justify-between mt-4">
                              <span className="font-semibold text-gray-700">Monthly Amount:</span>
                              <span className="text-lg font-bold text-green-600">
                                ${parseFloat(contractData.monthly_price || 0).toFixed(2)}/month
                              </span>
                            </div>

                            <div className="flex justify-between">
                              <span className="font-semibold text-gray-700">Billing Cycle:</span>
                              <span className="text-gray-900">Monthly (auto-billing enabled)</span>
                            </div>

                            {contractData.payment_token && (
                              <div className="flex justify-between">
                                <span className="font-semibold text-gray-700">Payment Token:</span>
                                <span className="text-xs text-gray-600 font-mono">{contractData.payment_token}</span>
                              </div>
                            )}
                          </div>

                          <div className="mt-4 pt-4 border-t border-gray-300">
                            <p className="text-xs text-gray-600">
                              Monthly invoices will be automatically generated and charged to the payment method on file through QuickBooks Online.
                              Customer will receive invoice notification before each charge is processed.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {section.contactFields && (
                    <div className="space-y-3">
                      {section.minRequired && (
                        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                          <p className="text-sm text-orange-900">
                            <strong>Required:</strong> Customer must add at least {section.minRequired} emergency contacts
                          </p>
                        </div>
                      )}
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                        <div className="font-semibold text-gray-900 mb-2">Fields per Contact:</div>
                        <div className="text-sm text-gray-600 space-y-1">
                          {section.contactFields.map((field: string, idx: number) => (
                            <div key={idx}>• {field}</div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}


                  {section.hasTerms && !contractData?.customer_signature && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <div className="font-semibold text-gray-900 mb-2">Customer will see:</div>
                      <ul className="text-sm text-gray-600 space-y-2">
                        <li>• Full contract terms and conditions (scrollable view)</li>
                        <li>• Digital signature pad</li>
                        <li>• Agreement acknowledgment checkbox</li>
                        <li>• Submit button to complete onboarding</li>
                      </ul>
                    </div>
                  )}

                  {section.id === 'emergency' && contractData?.emergency_contacts && contractData.emergency_contacts.length > 0 && (
                    <div className="space-y-3 mt-4 print-avoid-break">
                      <div className="flex items-center justify-between mb-3">
                        <div className="font-semibold text-gray-900">Authorized Contacts Added:</div>
                        <div className="text-sm text-gray-600">{contractData.emergency_contacts.length} contacts</div>
                      </div>
                      {contractData.emergency_contacts.map((contact: any, idx: number) => (
                        <div key={idx} className="bg-blue-50 border border-blue-200 rounded-lg p-4 print-avoid-break">
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                              {idx + 1}
                            </div>
                            <div className="flex-1">
                              <div className="font-semibold text-gray-900 mb-2">{contact.contact_name}</div>
                              <div className="text-sm text-gray-700"><strong>Phone:</strong> {contact.phone_number || 'Not provided'}</div>
                              <div className="text-sm text-gray-700 mt-1">
                                <strong>Password/Codeword:</strong>
                                <span className="no-print"> ****</span>
                                <span className="print-show font-bold text-red-600"> {contact.password_codeword || 'Not set'}</span>
                              </div>
                              {contact.can_authorize_entry && (
                                <div className="inline-block mt-2 px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">
                                  ✓ Can authorize entry
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 no-print">
                        <p className="text-sm text-orange-900">
                          {contractData.emergency_contacts.length < 2
                            ? `⚠️ Customer must add at least ${2 - contractData.emergency_contacts.length} more contact(s) for call list - minimum 2 required`
                            : '✓ Minimum requirement met (2 contacts). Monitoring station will call in the order shown above.'}
                        </p>
                      </div>
                    </div>
                  )}

                  {section.id === 'signature' && contractData?.customer_signature && (
                    <div>
                      <div className="border border-gray-300 rounded-lg p-6 bg-gray-50">
                        <img
                          src={contractData.customer_signature}
                          alt="Customer signature"
                          className="max-h-32 mx-auto"
                        />
                      </div>
                      <div className="mt-3 text-sm text-gray-600 space-y-1">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-green-600" />
                          <span>Signed on {new Date(contractData.customer_signature_date).toLocaleString()}</span>
                        </div>
                        <div className="text-xs text-gray-500 ml-6">
                          IP: {contractData.customer_ip_address}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Customer Summary Section - Shows on Print */}
        <div className="print-show print-avoid-break mt-8 p-6 border-2 border-gray-800 rounded-lg bg-gray-50">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 border-b-2 border-gray-300 pb-3">Contract Summary</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <h3 className="font-bold text-gray-900 mb-3">Customer Information</h3>
              <div className="space-y-2 text-sm">
                <div><strong>Name:</strong> {contractData.contact?.full_name}</div>
                <div><strong>Email:</strong> {contractData.contact?.email}</div>
                <div><strong>Phone:</strong> {contractData.contact?.phone || 'Not provided'}</div>
              </div>

              <h3 className="font-bold text-gray-900 mb-3 mt-6">Service Address</h3>
              <div className="space-y-1 text-sm">
                <div>{contractData.contact?.address_line1}</div>
                <div>{contractData.contact?.city}, {contractData.contact?.state} {contractData.contact?.zip_code}</div>
              </div>
            </div>

            <div>
              <h3 className="font-bold text-gray-900 mb-3">Contract Details</h3>
              <div className="space-y-2 text-sm">
                <div><strong>Contract Number:</strong> {contractData.contract_number}</div>
                <div><strong>Template:</strong> {contractData.template?.name}</div>
                <div><strong>Status:</strong> <span className="uppercase font-semibold">{contractData.status?.replace('_', ' ')}</span></div>
                <div><strong>Monthly Fee:</strong> ${parseFloat(contractData.monthly_price || 0).toFixed(2)}/month</div>
                {contractData.contact_id && (
                  <div><strong>Billing Preference:</strong> <BillingPrefBadge contactId={contractData.contact_id} /></div>
                )}
                {contractData.customer_signature_date && (
                  <div><strong>Signed Date:</strong> {new Date(contractData.customer_signature_date).toLocaleDateString()}</div>
                )}
              </div>

              <h3 className="font-bold text-gray-900 mb-3 mt-6">Emergency Contacts</h3>
              <div className="space-y-2 text-sm">
                <div><strong>Total Contacts:</strong> {contractData.emergency_contacts?.length || 0}</div>
                {contractData.emergency_contacts?.length > 0 && (
                  <div className="text-xs text-gray-600">See detailed contact list above with passwords</div>
                )}
              </div>
            </div>
          </div>

          {contractData.notes && (
            <div className="mt-6 pt-4 border-t border-gray-300">
              <h3 className="font-bold text-gray-900 mb-2">Internal Notes</h3>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{contractData.notes}</p>
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-gray-300 text-xs text-gray-500">
            <p><strong>CONFIDENTIAL:</strong> This document contains sensitive customer information including payment details and security passwords. Store securely and handle according to company privacy policies.</p>
          </div>
        </div>

        {/* Sidebar - Hidden on Print */}
        <div className="space-y-6 no-print">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Customer Info</h2>
            <div className="space-y-3">
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wide">Name</div>
                <div className="font-medium text-gray-900">{contractData.contact?.full_name}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wide">Email</div>
                <div className="text-sm text-gray-900 break-words">{contractData.contact?.email}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wide">Phone</div>
                <div className="text-sm text-gray-900">{contractData.contact?.phone || 'Not provided'}</div>
              </div>
            </div>
          </div>

          {/* Account Info */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Account Info</h2>
            <div className="space-y-3">
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wide">Monitoring</div>
                <div className="mt-1">
                  {contractData.is_monitoring ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                      <ShieldCheck className="w-3 h-3" />
                      Monitoring Active
                    </span>
                  ) : (
                    <span className="text-sm text-gray-400 italic">Not monitored</span>
                  )}
                </div>
                {contractData.is_monitoring && contractData.account_number && (
                  <div className="text-sm text-gray-700 mt-1">
                    <span className="text-xs text-gray-500">Monitoring Account Number:</span> {contractData.account_number}
                  </div>
                )}
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wide">Account Type</div>
                <div className="mt-1">
                  {contractData.account_type ? (
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${
                      contractData.account_type === 'residential'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {contractData.account_type}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-400 italic">Not set</span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Services</div>
                {contractData.account_services && contractData.account_services.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {(contractData.account_services as string[]).map(svc => {
                      const labels: Record<string, string> = {
                        dial_up: 'Dial-Up',
                        telguard: 'Telguard',
                        alarmnet: 'Alarmnet',
                        alarm_com: 'Alarm.com',
                        video_monitoring: 'Video / CCTV',
                        access_control: 'Access Control',
                      };
                      return (
                        <span key={svc} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                          {labels[svc] ?? svc}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <span className="text-sm text-gray-400 italic">None selected</span>
                )}
              </div>
              {contractData.installation_date && (
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Installation Date</div>
                  <div className="font-medium text-gray-900">
                    {new Date(contractData.installation_date).toLocaleDateString()}
                  </div>
                </div>
              )}
              {contractData.service_account_numbers && Object.keys(contractData.service_account_numbers).length > 0 && (
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Service Account Numbers</div>
                  <div className="space-y-1">
                    {Object.entries(contractData.service_account_numbers as Record<string, string>).map(([svc, num]) => {
                      const labels: Record<string, string> = {
                        dial_up: 'Monitoring',
                        telguard: 'Telguard',
                        alarmnet: 'Alarmnet',
                        alarm_com: 'Alarm.com',
                      };
                      return (
                        <div key={svc} className="text-sm text-gray-700">
                          <span className="font-medium">{labels[svc] ?? svc}:</span> {num}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {(() => {
                const SERVICES_NEEDING_ACCT = ['dial_up', 'telguard', 'alarmnet', 'alarm_com'];
                const svcLabels: Record<string, string> = {
                  dial_up: 'Monitoring Account Number',
                  telguard: 'Telguard Account Number',
                  alarmnet: 'Alarmnet Account Number',
                  alarm_com: 'Alarm.com Account Number',
                };
                const missing: string[] = [];
                if (contractData.status === 'active' && !contractData.installation_date) {
                  missing.push('Installation Date');
                }
                const services = (contractData.account_services as string[]) || [];
                const acctNums = (contractData.service_account_numbers as Record<string, string>) || {};
                SERVICES_NEEDING_ACCT.forEach(svc => {
                  if (services.includes(svc) && !acctNums[svc]) {
                    missing.push(svcLabels[svc]);
                  }
                });
                if (missing.length === 0) return null;
                return (
                  <div className="mt-2 p-3 bg-amber-50 border border-amber-300 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold text-amber-800 text-sm">Missing Post-Install Data</div>
                        <div className="text-sm text-amber-700 mt-1">
                          {missing.join(', ')}
                        </div>
                        <div className="text-xs text-amber-600 mt-1">
                          Edit this contract to fill in the missing information.
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Initial Term</div>
                  <div className="font-medium text-gray-900">
                    {contractData.term_months ? `${contractData.term_months} mo` : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Renewal Term</div>
                  <div className="font-medium text-gray-900">
                    {contractData.renewal_term_months ? `${contractData.renewal_term_months} mo` : '—'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Timeline</h2>
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <CheckCircle className="w-4 h-4 text-blue-600" />
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">Created</div>
                  <div className="text-xs text-gray-500">
                    {new Date(contractData.created_at).toLocaleString()}
                  </div>
                </div>
              </div>

              {contractData.invitation_sent_at && (
                <div className="flex gap-3">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
                      <Mail className="w-4 h-4 text-yellow-600" />
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">Invitation Sent</div>
                    <div className="text-xs text-gray-500">
                      {new Date(contractData.invitation_sent_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              )}

              {contractData.customer_completed_at && (
                <div className="flex gap-3">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">Customer Completed</div>
                    <div className="text-xs text-gray-500">
                      {new Date(contractData.customer_completed_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              )}

              {contractData.approved_at && (
                <div className="flex gap-3">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">Approved</div>
                    <div className="text-xs text-gray-500">
                      {new Date(contractData.approved_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              )}

              {contractData.activated_at && (
                <div className="flex gap-3">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">Activated</div>
                    <div className="text-xs text-gray-500">
                      {new Date(contractData.activated_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {contractData.notes && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Notes</h2>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{contractData.notes}</p>
            </div>
          )}

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Actions</h2>
            <div className="space-y-3">
              {canManage && ['pending_approval','customer_completed'].includes(contractData.status) && <>
                <button type="button" disabled={editingReview || approving} onClick={()=>setConfirmApprove(true)} className="w-full bg-green-700 text-white rounded-lg p-3 disabled:opacity-50">Approve Contract</button>
                <button type="button" disabled={editingReview} onClick={()=>setRejecting(true)} className="w-full border border-red-300 text-red-700 rounded-lg p-3">Request Corrections</button>
              </>}
              {canManage && contractData.status==='approved' && <SecurityActivationDates startDate={monitoringStartDate} firstPaymentDate={firstPaymentDate} onEditing={setEditingActivationDates} onChange={(start,first)=>{setMonitoringStartDate(start);setFirstPaymentDate(first);}}/>}
              {canManage && contractData.status==='approved' && <button type="button" disabled={editingReview || editingActivationDates || !monitoringStartDate || !firstPaymentDate} onClick={()=>setConfirmActivate(true)} className="w-full bg-blue-700 text-white rounded-lg p-3 disabled:opacity-50">Complete and Activate</button>}
              {!contractData.customer_completed_at && ['draft','pending_customer','rejected'].includes(contractData.status) && <button type="button" disabled={sending} onClick={()=>setConfirmSendInvitation(true)} className="w-full bg-blue-700 text-white rounded-lg p-3">Send Invitation</button>}
              {(contractData.status === 'approved' || contractData.status === 'active') && (
                <button
                  onClick={() => setShowCancelModal(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors font-medium"
                >
                  <Ban className="w-4 h-4" />
                  Cancel Contract
                </button>
              )}
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium"
              >
                <Trash2 className="w-4 h-4" />
                Delete Permanently
              </button>
              <p className="text-xs text-gray-500 mt-2">
                <strong>Warning:</strong> Deleted contracts cannot be recovered. Use cancel to keep the contract record.
              </p>
            </div>
          </div>
        </div>
      </div>

      {rejecting && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-full sm:max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Reject Contract</h3>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Please provide a reason for rejection..."
              rows={4}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 mb-4"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setRejecting(false);
                  setRejectionReason('');
                }}
                className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                Reject Contract
              </button>
            </div>
          </div>
        </div>
      )}

      {showCancelModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-full sm:max-w-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                <Ban className="w-6 h-6 text-orange-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">Cancel Contract</h3>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Cancellation Type
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="radio"
                    checked={immediateCancel}
                    onChange={() => setImmediateCancel(true)}
                    className="w-4 h-4 text-orange-600"
                  />
                  <div>
                    <div className="font-medium text-gray-900">Cancel Immediately</div>
                    <div className="text-sm text-gray-500">Contract will be cancelled right now</div>
                  </div>
                </label>
                <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input
                    type="radio"
                    checked={!immediateCancel}
                    onChange={() => setImmediateCancel(false)}
                    className="w-4 h-4 text-orange-600"
                  />
                  <div>
                    <div className="font-medium text-gray-900">Schedule Cancellation</div>
                    <div className="text-sm text-gray-500">Set a future cancellation date</div>
                  </div>
                </label>
              </div>
            </div>

            {!immediateCancel && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cancellation Date
                </label>
                <input
                  type="date"
                  value={cancellationDate}
                  onChange={(e) => setCancellationDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Cancellation Reason
              </label>
              <textarea
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                placeholder="Why is this contract being cancelled? (e.g., customer request, moved, found better service, etc.)"
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCancelModal(false);
                  setCancellationReason('');
                  setCancellationDate('');
                  setImmediateCancel(true);
                }}
                className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCancel}
                disabled={!cancellationReason.trim() || (!immediateCancel && !cancellationDate)}
                className="flex-1 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel Contract
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-full sm:max-w-md p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">Delete Contract</h3>
            </div>

            <div className="mb-6">
              <p className="text-gray-700 mb-3">
                Are you sure you want to permanently delete this contract?
              </p>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex gap-2 items-start">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-red-800">
                    <p className="font-semibold mb-1">This action cannot be undone!</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>The contract will be permanently deleted</li>
                      <li>All associated data will be removed</li>
                      <li>This record will not appear in any reports</li>
                    </ul>
                    <p className="mt-2">
                      <strong>Consider using "Cancel Contract" instead</strong> to preserve the record for historical purposes.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {showManualEntry && (
        <ManualContractEntry
          contract={contractData}
          onClose={() => setShowManualEntry(false)}
          onComplete={() => {
            setShowManualEntry(false);
            loadContractDetails();
            onUpdate?.();
          }}
        />
      )}

      <ConfirmModal
        isOpen={confirmSendInvitation}
        title="Send Invitation"
        message="Send invitation email to customer?"
        variant="neutral"
        confirmLabel="Send"
        onConfirm={() => {
          setConfirmSendInvitation(false);
          handleSendInvitation();
        }}
        onCancel={() => setConfirmSendInvitation(false)}
      />

      <ConfirmModal
        isOpen={confirmApprove}
        title="Approve Contract"
        message="Approve this contract?"
        variant="neutral"
        confirmLabel="Approve"
        onConfirm={() => {
          setConfirmApprove(false);
          handleApprove();
        }}
        onCancel={() => setConfirmApprove(false)}
      />

      <ConfirmModal
        isOpen={confirmActivate}
        title="Activate Contract"
        message={`Monitoring starts ${monitoringStartDate}. First payment is scheduled for ${firstPaymentDate}, subject to advance notice. Activate this contract?`}
        variant="neutral"
        confirmLabel="Activate"
        onConfirm={() => {
          setConfirmActivate(false);
          handleActivate();
        }}
        onCancel={() => setConfirmActivate(false)}
      />
    </div>
    </>
  );
}
