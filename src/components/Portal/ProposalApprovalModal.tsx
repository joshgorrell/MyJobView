import { useState, useEffect } from 'react';
import { X, CreditCard, FileText, Upload, CheckCircle, AlertCircle, ArrowRight, ArrowLeft, Loader } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ProposalApprovalModalProps {
  proposalId: string;
  proposalNumber: string;
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 'method' | 'payment' | 'purchase_order' | 'success';
type Method = 'payment' | 'purchase_order' | null;

export function ProposalApprovalModal({
  proposalId,
  proposalNumber,
  onClose,
  onSuccess
}: ProposalApprovalModalProps) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [requireDeposit, setRequireDeposit] = useState(false);
  const [depositAmount, setDepositAmount] = useState(0);
  const [acceptanceMethods, setAcceptanceMethods] = useState<string[]>([]);
  const [step, setStep] = useState<Step>('method');
  const [selectedMethod, setSelectedMethod] = useState<Method>(null);
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState('');
  const [poFile, setPoFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [depositInvoiceId, setDepositInvoiceId] = useState<string | null>(null);
  const [qboInvoiceId, setQboInvoiceId] = useState<string | null>(null);
  const [paymentWindowOpened, setPaymentWindowOpened] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    loadProposalSettings();
  }, []);

  async function loadProposalSettings() {
    try {
      const { data: proposal, error: propError } = await supabase
        .from('proposals')
        .select(`
          deposit_amount_due,
          acceptance_methods,
          require_deposit,
          proposal_settings:proposal_settings_id (
            acceptance_methods
          )
        `)
        .eq('id', proposalId)
        .maybeSingle();

      if (propError) throw propError;

      setRequireDeposit(proposal?.require_deposit ?? true);
      setDepositAmount(proposal?.deposit_amount_due ?? 0);

      const methods = proposal?.acceptance_methods ||
                     (proposal?.proposal_settings as any)?.acceptance_methods ||
                     ['payment'];
      setAcceptanceMethods(methods);

      if (methods.length === 1) {
        const method = methods[0];
        if (method !== 'purchase_order' || !proposal?.require_deposit) {
          setSelectedMethod(method as Method);
        }
      }

      // Try to find the deposit invoice for this proposal
      const { data: invoice } = await supabase
        .from('invoices')
        .select('id, qbo_invoice_id')
        .eq('proposal_id', proposalId)
        .eq('invoice_type', 'deposit')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (invoice) {
        setDepositInvoiceId(invoice.id);
        setQboInvoiceId(invoice.qbo_invoice_id);
      }
    } catch (error) {
      console.error('Error loading proposal settings:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleFileUpload(file: File) {
    try {
      setUploadingFile(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `${proposalId}_${Date.now()}.${fileExt}`;
      const filePath = `purchase-orders/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('attachments')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Error uploading file');
      return null;
    } finally {
      setUploadingFile(false);
    }
  }

  async function approveProposal(method: Method, poNumber?: string, poDocUrl?: string) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error('Not authenticated');

    const updateData: any = {
      status: 'approved',
      approved_by: session.user.id,
      approval_completed_at: new Date().toISOString(),
      accepted_via_method: method,
      updated_at: new Date().toISOString()
    };

    if (method === 'payment') {
      updateData.deposit_paid = true;
      updateData.deposit_payment_date = new Date().toISOString();
    }

    if (method === 'purchase_order') {
      if (poNumber?.trim()) {
        updateData.purchase_order_number = poNumber.trim();
      }
      if (poDocUrl) {
        updateData.po_document_url = poDocUrl;
      }
    }

    const { error } = await supabase
      .from('proposals')
      .update(updateData)
      .eq('id', proposalId);

    if (error) throw error;
  }

  async function handlePayDeposit() {
    setSubmitting(true);
    try {
      // Open QuickBooks payment window if we have a QBO invoice ID
      if (qboInvoiceId) {
        const paymentUrl = `https://app.qbo.intuit.com/app/paynow?invoiceId=${qboInvoiceId}`;
        window.open(paymentUrl, '_blank');
        setPaymentWindowOpened(true);
      }

      await approveProposal('payment');

      const msg = requireDeposit
        ? 'Your proposal has been approved and a deposit payment window has been opened. Complete the payment in the new window. Your sales representative will confirm once the deposit is received and your order will be ready for scheduling.'
        : 'Your proposal has been approved! A sales order has been created and is ready for scheduling. Your sales representative has been notified.';

      setSuccessMessage(msg);
      setStep('success');
    } catch (error: any) {
      console.error('Error approving proposal:', error);
      alert(error.message || 'Error approving proposal. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePurchaseOrderApprove() {
    setSubmitting(true);
    try {
      let poDocUrl: string | undefined;
      if (poFile) {
        const url = await handleFileUpload(poFile);
        if (url) poDocUrl = url;
      }

      await approveProposal('purchase_order', purchaseOrderNumber, poDocUrl);

      const msg = purchaseOrderNumber.trim()
        ? 'Your proposal has been approved with your purchase order. A sales order has been created and your sales representative has been notified.'
        : 'Your approval has been received. Please provide your PO number to complete the process. You or your sales representative can add it later.';

      setSuccessMessage(msg);
      setStep('success');
    } catch (error: any) {
      console.error('Error approving proposal:', error);
      alert(error.message || 'Error approving proposal. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleMethodSelect(method: Method) {
    setSelectedMethod(method);
    if (method === 'payment') {
      setStep('payment');
    } else if (method === 'purchase_order') {
      setStep('purchase_order');
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg p-6 flex items-center gap-3">
          <Loader className="w-5 h-5 text-blue-600 animate-spin" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90dvh] overflow-y-auto">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            {step !== 'method' && step !== 'success' && (
              <button
                onClick={() => setStep('method')}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h2 className="text-xl font-bold text-gray-900">
              {step === 'success' ? 'Approved!' : 'Approve Proposal'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="px-4 sm:px-6 py-4 space-y-4">
          {/* Step: Method Selection */}
          {step === 'method' && (
            <>
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-900">
                    Proposal {proposalNumber}
                  </p>
                  <p className="text-xs text-blue-700 mt-1">
                    A sales order will be created immediately upon approval. Your sales representative will be notified.
                  </p>
                </div>
              </div>

              {requireDeposit && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm font-medium text-amber-900 mb-1">
                    Deposit Required: ${depositAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-amber-700">
                    Complete your deposit payment to finalize approval. Your order will be ready for scheduling once the deposit is confirmed.
                  </p>
                </div>
              )}

              <div className="space-y-3">
                <label className="text-sm font-medium text-gray-700 block">
                  Select Acceptance Method
                </label>

                {acceptanceMethods.includes('payment') && (
                  <button
                    onClick={() => handleMethodSelect('payment')}
                    className={`w-full p-4 border-2 rounded-lg text-left transition-all ${
                      selectedMethod === 'payment'
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <CreditCard className={`w-5 h-5 flex-shrink-0 ${
                        selectedMethod === 'payment' ? 'text-blue-600' : 'text-gray-400'
                      }`} />
                      <div className="flex-1">
                        <p className={`font-medium ${
                          selectedMethod === 'payment' ? 'text-blue-900' : 'text-gray-900'
                        }`}>
                          {requireDeposit ? 'Pay Deposit & Approve' : 'Approve Proposal'}
                        </p>
                        <p className="text-sm text-gray-600 mt-1">
                          {requireDeposit
                            ? `Pay your $${depositAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} deposit now to finalize approval`
                            : 'Approve this proposal and create a sales order'}
                        </p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-gray-400 mt-1" />
                    </div>
                  </button>
                )}

                {acceptanceMethods.includes('purchase_order') && !requireDeposit && (
                  <button
                    onClick={() => handleMethodSelect('purchase_order')}
                    className={`w-full p-4 border-2 rounded-lg text-left transition-all ${
                      selectedMethod === 'purchase_order'
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <FileText className={`w-5 h-5 flex-shrink-0 ${
                        selectedMethod === 'purchase_order' ? 'text-blue-600' : 'text-gray-400'
                      }`} />
                      <div className="flex-1">
                        <p className={`font-medium ${
                          selectedMethod === 'purchase_order' ? 'text-blue-900' : 'text-gray-900'
                        }`}>
                          Purchase Order
                        </p>
                        <p className="text-sm text-gray-600 mt-1">
                          I have a purchase order for this proposal (no deposit required)
                        </p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-gray-400 mt-1" />
                    </div>
                  </button>
                )}
              </div>
            </>
          )}

          {/* Step: Payment */}
          {step === 'payment' && (
            <>
              <div className="text-center py-2">
                <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CreditCard className="w-7 h-7 text-blue-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-1">
                  {requireDeposit ? 'Pay Your Deposit' : 'Confirm Approval'}
                </h3>
                <p className="text-sm text-gray-500">
                  {requireDeposit
                    ? 'Click below to open the secure payment window and complete your deposit.'
                    : 'Click below to approve this proposal and create your sales order.'}
                </p>
              </div>

              {requireDeposit && (
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Deposit Amount</span>
                    <span className="text-lg font-bold text-gray-900">
                      ${depositAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  {qboInvoiceId ? (
                    <p className="text-xs text-green-600 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      Deposit invoice ready for online payment
                    </p>
                  ) : (
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Your sales rep will send payment instructions shortly
                    </p>
                  )}
                </div>
              )}

              {paymentWindowOpened && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-green-700">
                    A payment window has been opened. Complete the payment there, then return here. If you don't see it, check your popup blocker.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  onClick={() => setStep('method')}
                  disabled={submitting}
                  className="px-4 py-2.5 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  onClick={handlePayDeposit}
                  disabled={submitting}
                  className="flex-1 px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Approving...
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4" />
                      {requireDeposit ? 'Pay Deposit & Approve' : 'Approve Proposal'}
                    </>
                  )}
                </button>
              </div>
            </>
          )}

          {/* Step: Purchase Order */}
          {step === 'purchase_order' && (
            <>
              <div className="text-center py-2">
                <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-7 h-7 text-blue-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-1">Purchase Order</h3>
                <p className="text-sm text-gray-500">
                  Provide your PO number now or later to complete the approval.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Purchase Order Number (Optional)
                  </label>
                  <input
                    type="text"
                    value={purchaseOrderNumber}
                    onChange={(e) => setPurchaseOrderNumber(e.target.value)}
                    placeholder="Enter PO number (can be added later)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Upload PO Document (Optional)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      onChange={(e) => setPoFile(e.target.files?.[0] || null)}
                      accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                      className="hidden"
                      id="po-file-upload"
                    />
                    <label
                      htmlFor="po-file-upload"
                      className="flex-1 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-center cursor-pointer hover:border-blue-500 transition-colors"
                    >
                      <Upload className="w-5 h-5 mx-auto mb-1 text-gray-400" />
                      <span className="text-sm text-gray-600">
                        {poFile ? poFile.name : 'Click to upload'}
                      </span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  onClick={() => setStep('method')}
                  disabled={submitting || uploadingFile}
                  className="px-4 py-2.5 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  onClick={handlePurchaseOrderApprove}
                  disabled={submitting || uploadingFile}
                  className="flex-1 px-6 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Approving...
                    </>
                  ) : uploadingFile ? (
                    'Uploading...'
                  ) : (
                    'Approve with PO'
                  )}
                </button>
              </div>
            </>
          )}

          {/* Step: Success */}
          {step === 'success' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Proposal Approved!</h3>
              <p className="text-sm text-gray-600 max-w-sm mx-auto">{successMessage}</p>
              <button
                onClick={onSuccess}
                className="mt-6 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
