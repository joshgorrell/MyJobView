import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { ArrowLeft, Send, CheckCircle, XCircle, Eye, Mail, Clock, AlertCircle, User, Shield, Phone, CreditCard, Ligature as FileSignature, MapPin, CreditCard as Edit, Printer, Trash2, Ban } from 'lucide-react';
import ManualContractEntry from './ManualContractEntry';
import ConfirmModal from '../ui/ConfirmModal';

interface SecurityContractDetailProps {
  contract: any;
  onClose: () => void;
  onUpdate: () => void;
}

export default function SecurityContractDetail({ contract, onClose, onUpdate }: SecurityContractDetailProps) {
  const [contractData, setContractData] = useState<any>(null);
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
  const [cancellationDate, setCancellationDate] = useState('');
  const [cancellationReason, setCancellationReason] = useState('');
  const [immediateCancel, setImmediateCancel] = useState(true);

  useEffect(() => {
    loadContractDetails();
  }, [contract.id]);

  async function loadContractDetails() {
    try {
      const { data, error } = await supabase
        .from('security_contracts')
        .select(`
          *,
          contact:contacts(*),
          template:security_contract_templates(*),
          responses:security_contract_responses(
            *,
            field:security_contract_fields(*)
          ),
          equipment:security_contract_equipment(*),
          emergency_contacts:security_contract_emergency_contacts(*),
          approvals:security_contract_approvals(*)
        `)
        .eq('id', contract.id)
        .single();

      if (error) throw error;
      setContractData(data);
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
      const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      const { error } = await supabase
        .from('security_contracts')
        .update({
          magic_link_token: token,
          magic_link_expires_at: expiresAt.toISOString(),
          invitation_sent_at: new Date().toISOString(),
          status: 'pending_customer'
        })
        .eq('id', contract.id);

      if (error) throw error;

      // Use fetch directly to get better error handling
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-contract-invitation`;
      const { data: { session } } = await supabase.auth.getSession();

      const fetchResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contractId: contract.id,
          token,
          customerEmail: contractData.contact.email,
          customerName: contractData.contact.full_name
        })
      });

      const responseData = await fetchResponse.json();
      console.log('Edge function response:', responseData);

      if (!fetchResponse.ok || !responseData.success) {
        const errorMsg = responseData.error || 'Unknown error occurred';
        console.error('Edge function error:', errorMsg);
        throw new Error(errorMsg);
      }

      alert('Invitation sent successfully!');
      onUpdate();
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
    setApproving(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('security_contracts')
        .update({
          status: 'approved',
          approved_at: new Date().toISOString(),
          approved_by_user_id: user.user.id
        })
        .eq('id', contract.id);

      if (error) throw error;

      alert('Contract approved!');
      onUpdate();
      onClose();
    } catch (error) {
      console.error('Error approving contract:', error);
      alert('Failed to approve contract');
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
      const { error } = await supabase
        .from('security_contracts')
        .update({
          status: 'rejected',
          rejection_reason: rejectionReason
        })
        .eq('id', contract.id);

      if (error) throw error;

      alert('Contract rejected');
      onUpdate();
      onClose();
    } catch (error) {
      console.error('Error rejecting contract:', error);
      alert('Failed to reject contract');
    } finally {
      setRejecting(false);
    }
  }

  async function handleActivate() {
    try {
      const { error } = await supabase
        .from('security_contracts')
        .update({
          status: 'active',
          activated_at: new Date().toISOString()
        })
        .eq('id', contract.id);

      if (error) throw error;

      alert('Contract activated!');
      onUpdate();
      onClose();
    } catch (error) {
      console.error('Error activating contract:', error);
      alert('Failed to activate contract');
    }
  }

  async function handleDelete() {
    try {
      const { error } = await supabase
        .from('security_contracts')
        .delete()
        .eq('id', contract.id);

      if (error) throw error;

      alert('Contract deleted permanently');
      onUpdate();
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
        .eq('id', contract.id);

      if (error) throw error;

      alert(immediateCancel ? 'Contract cancelled immediately' : `Contract scheduled to cancel on ${finalBillingDate}`);
      onUpdate();
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
    const contact = d?.contact || {};
    const template = d?.template || {};
    const emergencyContacts = d?.emergency_contacts || [];
    const signedDate = d?.customer_signature_date
      ? new Date(d.customer_signature_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : null;

    const contractTermsHtml = (template.contract_terms || '')
      .replace(/\[term\]/g, `${d.term_months || '__'} months`);

    const emergencyContactsHtml = emergencyContacts.length > 0
      ? emergencyContacts.map((ec: any, i: number) => `
          <tr>
            <td style="padding:8pt 10pt;border-bottom:1pt solid #e5e7eb;font-weight:600;">${i + 1}. ${ec.contact_name || ''}</td>
            <td style="padding:8pt 10pt;border-bottom:1pt solid #e5e7eb;">${ec.phone_number || '—'}</td>
            <td style="padding:8pt 10pt;border-bottom:1pt solid #e5e7eb;font-family:monospace;">${ec.password_codeword || '—'}</td>
            <td style="padding:8pt 10pt;border-bottom:1pt solid #e5e7eb;text-align:center;">${ec.can_authorize_entry ? 'Yes' : 'No'}</td>
          </tr>`).join('')
      : `<tr><td colspan="4" style="padding:8pt 10pt;color:#6b7280;font-style:italic;">No emergency contacts on file</td></tr>`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Security Monitoring Contract — ${d.contract_number}</title>
  <style>
    @page {
      size: 8.5in 11in;
      margin: 0.75in 0.85in;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      font-size: 10pt;
      line-height: 1.5;
      color: #111827;
      background: #fff;
    }

    /* ── Header ── */
    .doc-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      padding-bottom: 14pt;
      border-bottom: 2pt solid #1e3a5f;
      margin-bottom: 18pt;
    }
    .doc-header h1 {
      font-size: 18pt;
      font-weight: 700;
      color: #1e3a5f;
      letter-spacing: -0.3pt;
    }
    .doc-header .meta {
      text-align: right;
      font-size: 8.5pt;
      color: #6b7280;
      line-height: 1.6;
    }
    .doc-header .meta strong {
      color: #111827;
      font-size: 9.5pt;
    }

    /* ── Section ── */
    .section {
      margin-bottom: 18pt;
      page-break-inside: avoid;
    }
    .section-title {
      font-size: 9.5pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.6pt;
      color: #1e3a5f;
      border-bottom: 1pt solid #1e3a5f;
      padding-bottom: 3pt;
      margin-bottom: 10pt;
    }

    /* ── Two-column info grid ── */
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6pt 20pt;
    }
    .info-grid.three-col {
      grid-template-columns: 2fr 1fr 1fr;
    }
    .field-label {
      font-size: 7.5pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.4pt;
      color: #6b7280;
      margin-bottom: 2pt;
    }
    .field-value {
      font-size: 10pt;
      color: #111827;
      border-bottom: 0.5pt solid #d1d5db;
      padding-bottom: 2pt;
      min-height: 14pt;
    }
    .field-value.empty {
      color: #9ca3af;
      font-style: italic;
    }

    /* ── Emergency contacts table ── */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9.5pt;
    }
    thead tr {
      background: #f3f4f6;
    }
    th {
      padding: 6pt 10pt;
      text-align: left;
      font-size: 8pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.4pt;
      color: #374151;
      border-bottom: 1.5pt solid #d1d5db;
    }

    /* ── Contract terms box ── */
    .terms-box {
      border: 1pt solid #d1d5db;
      border-radius: 4pt;
      padding: 12pt 14pt;
      font-size: 8.5pt;
      line-height: 1.6;
      color: #374151;
      max-height: none;
    }
    .terms-box p, .terms-box li { margin-bottom: 4pt; }
    .terms-box h2, .terms-box h3 { font-size: 10pt; margin: 8pt 0 4pt; color: #111827; }

    /* ── Signature block ── */
    .signature-block {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20pt;
      margin-top: 14pt;
    }
    .sig-box {
      border-top: 1pt solid #374151;
      padding-top: 6pt;
    }
    .sig-label {
      font-size: 8pt;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.4pt;
    }
    .sig-image {
      max-height: 48pt;
      max-width: 100%;
      display: block;
      margin-bottom: 4pt;
    }
    .sig-name {
      font-size: 10pt;
      font-weight: 600;
      color: #111827;
      margin-bottom: 2pt;
    }
    .sig-date {
      font-size: 8.5pt;
      color: #6b7280;
    }
    .sig-ip {
      font-size: 7.5pt;
      color: #9ca3af;
      font-family: monospace;
      margin-top: 2pt;
    }

    /* ── Payment block ── */
    .payment-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 6pt 20pt;
    }

    /* ── Footer ── */
    .doc-footer {
      margin-top: 24pt;
      padding-top: 10pt;
      border-top: 1pt solid #d1d5db;
      font-size: 7.5pt;
      color: #9ca3af;
      text-align: center;
    }

    /* ── Confidential banner ── */
    .confidential-banner {
      background: #fef2f2;
      border: 1pt solid #fca5a5;
      border-radius: 3pt;
      padding: 5pt 10pt;
      font-size: 7.5pt;
      font-weight: 700;
      color: #991b1b;
      text-align: center;
      letter-spacing: 0.8pt;
      text-transform: uppercase;
      margin-bottom: 16pt;
    }

    /* ── Status badge ── */
    .status-badge {
      display: inline-block;
      padding: 2pt 8pt;
      border-radius: 3pt;
      font-size: 8pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5pt;
      border: 1pt solid #d1d5db;
      color: #374151;
    }
  </style>
</head>
<body>

  <div class="confidential-banner">Confidential — Security Monitoring Contract</div>

  <!-- Header -->
  <div class="doc-header">
    <div>
      <h1>Security Monitoring Agreement</h1>
      <div style="font-size:9.5pt;color:#6b7280;margin-top:4pt;">${template.name || 'Standard Contract'}</div>
    </div>
    <div class="meta">
      <div><strong>Contract #: ${d.contract_number}</strong></div>
      <div>Status: <span class="status-badge">${(d.status || '').replace(/_/g, ' ')}</span></div>
      <div style="margin-top:4pt;">Printed: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
      ${d.created_at ? `<div>Created: ${new Date(d.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>` : ''}
    </div>
  </div>

  <!-- Section 1: Customer Information -->
  <div class="section">
    <div class="section-title">1. Customer Information</div>
    <div class="info-grid">
      <div>
        <div class="field-label">Full Name</div>
        <div class="field-value">${contact.full_name || '&nbsp;'}</div>
      </div>
      <div>
        <div class="field-label">Email Address</div>
        <div class="field-value">${contact.email || '&nbsp;'}</div>
      </div>
      <div>
        <div class="field-label">Phone Number</div>
        <div class="field-value ${!contact.phone ? 'empty' : ''}">${contact.phone || 'Not provided'}</div>
      </div>
      <div>
        <div class="field-label">Contract Date</div>
        <div class="field-value">${signedDate || (d.created_at ? new Date(d.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '&nbsp;')}</div>
      </div>
    </div>
  </div>

  <!-- Section 2: Service Address -->
  <div class="section">
    <div class="section-title">2. Service Address</div>
    <div class="info-grid three-col">
      <div style="grid-column:1/-1">
        <div class="field-label">Street Address</div>
        <div class="field-value ${!contact.address_line1 ? 'empty' : ''}">${contact.address_line1 || 'Not provided'}</div>
      </div>
      <div>
        <div class="field-label">City</div>
        <div class="field-value ${!contact.city ? 'empty' : ''}">${contact.city || '&nbsp;'}</div>
      </div>
      <div>
        <div class="field-label">State</div>
        <div class="field-value ${!contact.state ? 'empty' : ''}">${contact.state || '&nbsp;'}</div>
      </div>
      <div>
        <div class="field-label">ZIP Code</div>
        <div class="field-value ${!contact.zip_code ? 'empty' : ''}">${contact.zip_code || '&nbsp;'}</div>
      </div>
    </div>
  </div>

  <!-- Section 3: Monitoring Details & Payment -->
  <div class="section">
    <div class="section-title">3. Monitoring &amp; Billing Details</div>
    <div class="payment-grid">
      <div>
        <div class="field-label">Monthly Monitoring Fee</div>
        <div class="field-value" style="font-weight:700;font-size:11pt;">$${parseFloat(d.monthly_price || 0).toFixed(2)}/month</div>
      </div>
      <div>
        <div class="field-label">Payment Method</div>
        <div class="field-value">${d.payment_method ? (d.payment_method === 'credit_card' ? 'Credit Card' : 'ACH / Bank Account') : 'Not set'}</div>
      </div>
      <div>
        <div class="field-label">Account / Card Ending</div>
        <div class="field-value">${d.last_four ? `****${d.last_four}` : '—'}</div>
      </div>
      <div>
        <div class="field-label">Billing Cycle</div>
        <div class="field-value">Monthly (auto-billing)</div>
      </div>
      <div>
        <div class="field-label">Term Length</div>
        <div class="field-value">${d.term_months ? `${d.term_months} months` : '—'}</div>
      </div>
      <div>
        <div class="field-label">Start Date</div>
        <div class="field-value">${d.activated_at ? new Date(d.activated_at).toLocaleDateString() : (signedDate || '—')}</div>
      </div>
    </div>
  </div>

  <!-- Section 4: Emergency / Monitoring Call List -->
  <div class="section">
    <div class="section-title">4. Monitoring Station Call List</div>
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Phone Number</th>
          <th>Codeword</th>
          <th>Can Authorize Entry</th>
        </tr>
      </thead>
      <tbody>
        ${emergencyContactsHtml}
      </tbody>
    </table>
    <div style="margin-top:6pt;font-size:7.5pt;color:#6b7280;">
      Monitoring station will contact these individuals in the order listed when an alarm is triggered. Codeword is required to verify caller identity.
    </div>
  </div>

  <!-- Section 5: Terms & Conditions -->
  ${contractTermsHtml ? `
  <div class="section" style="page-break-before:always;">
    <div class="section-title">5. Terms &amp; Conditions</div>
    <div class="terms-box">
      ${contractTermsHtml}
    </div>
  </div>` : ''}

  <!-- Section 6: Signature -->
  <div class="section">
    <div class="section-title">${contractTermsHtml ? '6' : '5'}. Signatures</div>
    <div style="font-size:8.5pt;color:#374151;margin-bottom:12pt;line-height:1.6;">
      By signing below, the customer acknowledges that they have read, understood, and agree to all terms and conditions of this Security Monitoring Agreement, including automatic monthly billing to the payment method provided above.
    </div>
    <div class="signature-block">
      <div>
        <div class="sig-label">Customer Signature</div>
        ${d.customer_signature
          ? `<img class="sig-image" src="${d.customer_signature}" alt="Customer signature" />`
          : `<div style="height:40pt;"></div>`
        }
        <div class="sig-box" style="margin-top:${d.customer_signature ? '0' : '40pt'};">
          <div class="sig-name">${contact.full_name || '____________________________'}</div>
          <div class="sig-date">Date: ${signedDate || '____________________________'}</div>
          ${d.customer_ip_address ? `<div class="sig-ip">IP: ${d.customer_ip_address}</div>` : ''}
        </div>
      </div>
      <div>
        <div class="sig-label">Company Representative</div>
        <div style="height:40pt;"></div>
        <div class="sig-box" style="margin-top:0;">
          <div class="sig-name">____________________________</div>
          <div class="sig-date">Date: ____________________________</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div class="doc-footer">
    Contract #${d.contract_number} &nbsp;|&nbsp; ${template.name || 'Security Monitoring Agreement'} &nbsp;|&nbsp;
    Generated ${new Date().toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
    <br/>This document is confidential. Unauthorized distribution is prohibited.
  </div>

</body>
</html>`;

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 400);
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

  const sections = [
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
          value: contractData?.monthly_price ? `$${parseFloat(contractData.monthly_price).toFixed(2)}/month` : '$XX.XX/month',
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

      <div className="p-8 contract-print-root">
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
                <h1 className="text-2xl font-bold text-white">Contract {contractData.contract_number}</h1>
                <p className="text-blue-100 mt-1">{contractData.template?.name}</p>
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
          {sections.map((section) => {
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
                      {section.fields.map((field, idx) => (
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
              {contractData.account_number && (
                <div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Account Number</div>
                  <div className="font-medium text-gray-900">{contractData.account_number}</div>
                </div>
              )}
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
                        monitored_alarm: 'Monitored Alarm',
                        testing_inspection: 'T&I',
                        service_agreement: 'Service Agreement',
                        video_monitoring: 'Video / CCTV',
                        access_control: 'Access Control',
                        other: 'Other',
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
          contract={contract}
          onClose={() => setShowManualEntry(false)}
          onComplete={() => {
            setShowManualEntry(false);
            loadContractDetails();
            onUpdate();
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
        message="Activate this contract and create recurring subscription?"
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
