import { useState, useEffect } from 'react';
import { X, CreditCard, FileText, Upload, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ProposalApprovalModalProps {
  proposalId: string;
  proposalNumber: string;
  onClose: () => void;
  onSuccess: () => void;
}

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
  const [selectedMethod, setSelectedMethod] = useState<'payment' | 'purchase_order' | null>(null);
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState('');
  const [poFile, setPoFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);

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

      // Use proposal-level settings (overrides template)
      setRequireDeposit(proposal?.require_deposit ?? true);
      setDepositAmount(proposal?.deposit_amount_due ?? 0);

      // Get acceptance methods from proposal or fall back to template
      const methods = proposal?.acceptance_methods ||
                     (proposal?.proposal_settings as any)?.acceptance_methods ||
                     ['payment'];
      setAcceptanceMethods(methods);

      // Auto-select if only one method and it's valid based on requirements
      if (methods.length === 1) {
        const method = methods[0];
        // Only auto-select if it's a valid option (PO requires no deposit)
        if (method !== 'purchase_order' || !proposal?.require_deposit) {
          setSelectedMethod(method as 'payment' | 'purchase_order');
        }
      }
    } catch (error) {
      console.error('Error loading proposal settings:', error);
      alert('Error loading proposal settings');
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

  async function handleApprove() {
    if (!selectedMethod) {
      alert('Please select an acceptance method');
      return;
    }

    // Validate purchase order method is only used when deposit is not required
    if (selectedMethod === 'purchase_order' && requireDeposit) {
      alert('Purchase order cannot be used when deposit is required. Please select payment method.');
      return;
    }

    setSubmitting(true);
    try {
      // Get current user session
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.user) {
        throw new Error('Not authenticated');
      }

      const updateData: any = {
        status: 'approved',
        approved_by: session.user.id,
        approval_completed_at: new Date().toISOString(),
        accepted_via_method: selectedMethod,
        updated_at: new Date().toISOString()
      };

      // Handle payment method
      if (selectedMethod === 'payment') {
        updateData.deposit_paid = true;
        updateData.deposit_payment_date = new Date().toISOString();
      }

      // Handle purchase order method
      if (selectedMethod === 'purchase_order') {
        // PO number is optional - if not provided, will go to "PO Pending" status
        if (purchaseOrderNumber.trim()) {
          updateData.purchase_order_number = purchaseOrderNumber.trim();
        }

        if (poFile) {
          const fileUrl = await handleFileUpload(poFile);
          if (fileUrl) {
            updateData.po_document_url = fileUrl;
          }
        }
      }

      const { error } = await supabase
        .from('proposals')
        .update(updateData)
        .eq('id', proposalId);

      if (error) throw error;

      // Show appropriate success message based on payment status
      let successMessage = 'Proposal approved successfully! ';

      if (selectedMethod === 'payment') {
        if (requireDeposit) {
          successMessage += 'A deposit invoice has been created. Your sales representative will send you payment instructions. Once the deposit is paid, your order will be ready for scheduling.';
        } else {
          successMessage += 'A sales order has been created and is ready for scheduling. Your sales representative has been notified.';
        }
      } else if (selectedMethod === 'purchase_order') {
        if (purchaseOrderNumber.trim()) {
          successMessage += 'A sales order has been created with your purchase order. Your sales representative has been notified.';
        } else {
          successMessage += 'Your approval has been received. Please provide your PO number to complete the process. You or your sales representative can add it later.';
        }
      }

      alert(successMessage);
      onSuccess();
    } catch (error: any) {
      console.error('Error approving proposal:', error);
      alert(error.message || 'Error approving proposal. Please ensure all requirements are met.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg p-6">
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90dvh] overflow-y-auto">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Approve Proposal</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="px-4 sm:px-6 py-4 space-y-4">
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
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm font-medium text-yellow-900 mb-2">
                Deposit Required: ${depositAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-yellow-700">
                Payment method required. Order will be ready for scheduling once deposit is confirmed.
              </p>
            </div>
          )}

          <div className="space-y-3">
            <label className="text-sm font-medium text-gray-700 block">
              Select Acceptance Method
            </label>

            {acceptanceMethods.includes('payment') && (
              <button
                onClick={() => setSelectedMethod('payment')}
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
                      Payment
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      I have made the deposit payment
                    </p>
                  </div>
                  {selectedMethod === 'payment' && (
                    <CheckCircle className="w-5 h-5 text-blue-600" />
                  )}
                </div>
              </button>
            )}

            {acceptanceMethods.includes('purchase_order') && !requireDeposit && (
              <button
                onClick={() => setSelectedMethod('purchase_order')}
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
                  {selectedMethod === 'purchase_order' && (
                    <CheckCircle className="w-5 h-5 text-blue-600" />
                  )}
                </div>
              </button>
            )}
          </div>

          {/* Purchase Order Fields */}
          {selectedMethod === 'purchase_order' && !requireDeposit && (
            <div className="space-y-3 pt-2">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs text-blue-700">
                  <strong>Note:</strong> You can provide your PO number now or later. If you don't have it yet, you or your sales representative can add it after approval.
                </p>
              </div>

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
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3 flex-wrap">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleApprove}
            disabled={submitting || !selectedMethod || uploadingFile}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {submitting ? 'Approving...' : uploadingFile ? 'Uploading...' : 'Approve Proposal'}
          </button>
        </div>
      </div>
    </div>
  );
}
