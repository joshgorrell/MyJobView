import React, { useState, useEffect } from 'react';
import { Mail, X, FileText, Send, User, AlertCircle, ChevronDown, ChevronUp, Paperclip, CheckSquare, Square, Loader2, Info } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface EmailProposalModalProps {
  proposalId: string;
  proposalNumber: string;
  contactEmail: string;
  contactName: string;
  onClose: () => void;
}

interface DocumentAvailability {
  termsAvailable: boolean;
  termsBase64: string | null;
  paymentScheduleAvailable: boolean;
  paymentScheduleBase64: string | null;
  financingAvailable: boolean;
  financingFiles: Array<{ id: string; name: string; storagePath: string }>;
}

interface AttachmentState {
  proposal: boolean;
  terms: boolean;
  paymentSchedule: boolean;
  financing: boolean;
}

interface AttachmentToggleProps {
  label: string;
  description: string;
  enabled: boolean;
  available: boolean;
  unavailableReason?: string;
  loading: boolean;
  onChange: (val: boolean) => void;
}

function AttachmentToggle({ label, description, enabled, available, unavailableReason, loading, onChange }: AttachmentToggleProps) {
  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
        available
          ? enabled
            ? 'border-blue-500/40 bg-blue-500/10 cursor-pointer'
            : 'border-gray-600 bg-gray-700/50 cursor-pointer hover:border-gray-500'
          : 'border-gray-700 bg-gray-800/50 opacity-60 cursor-not-allowed'
      }`}
      onClick={() => available && !loading && onChange(!enabled)}
    >
      {loading ? (
        <Loader2 className="w-5 h-5 text-gray-400 animate-spin flex-shrink-0 mt-0.5" />
      ) : available ? (
        enabled ? (
          <CheckSquare className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
        ) : (
          <Square className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
        )
      ) : (
        <Square className="w-5 h-5 text-gray-600 flex-shrink-0 mt-0.5" />
      )}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${available ? 'text-white' : 'text-gray-500'}`}>{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{available ? description : (unavailableReason || description)}</p>
      </div>
      {available && enabled && (
        <span className="flex-shrink-0 text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full">Attached</span>
      )}
    </div>
  );
}

export function EmailProposalModal({
  proposalId,
  proposalNumber,
  contactEmail,
  contactName,
  onClose,
}: EmailProposalModalProps) {
  const [toEmail, setToEmail] = useState(contactEmail);
  const [ccEmails, setCcEmails] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'idle' | 'loading_docs' | 'sending'>('idle');
  const [error, setError] = useState('');
  const [showAttachments, setShowAttachments] = useState(true);

  const [docAvailability, setDocAvailability] = useState<DocumentAvailability | null>(null);
  const [docsLoading, setDocsLoading] = useState(true);

  const [attachments, setAttachments] = useState<AttachmentState>({
    proposal: true,
    terms: false,
    paymentSchedule: false,
    financing: false,
  });

  // Load template defaults
  useEffect(() => {
    loadDefaults();
    loadDocumentAvailability();
  }, []);

  async function loadDefaults() {
    const { data: settings } = await supabase
      .from('company_settings')
      .select('company_name')
      .maybeSingle();
    const companyName = settings?.company_name || 'Your Company';
    setSubject(`Proposal #${proposalNumber} from ${companyName}`);
    setMessage(`Dear ${contactName},\n\nPlease review your proposal #${proposalNumber}. We've carefully prepared this proposal to meet your needs and look forward to working with you.\n\nYou can view your proposal online using the secure link in this email.\n\nIf you have any questions, please don't hesitate to reach out.\n\nBest regards`);
  }

  async function loadDocumentAvailability() {
    try {
      setDocsLoading(true);
      const { data, error } = await supabase.functions.invoke('generate-proposal-documents', {
        body: { proposalId },
      });
      if (error) throw error;
      setDocAvailability(data);
    } catch (err) {
      console.error('Error loading document availability:', err);
      setDocAvailability({
        termsAvailable: false,
        termsBase64: null,
        paymentScheduleAvailable: false,
        paymentScheduleBase64: null,
        financingAvailable: false,
        financingFiles: [],
      });
    } finally {
      setDocsLoading(false);
    }
  }

  const attachmentCount = Object.values(attachments).filter(Boolean).length;

  const handleSend = async () => {
    if (!toEmail) {
      setError('Please enter a recipient email address');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const emailAttachments: Array<{ filename: string; content: string }> = [];
      const sentAttachmentsRecord: Record<string, boolean> = {};

      setStep('loading_docs');

      // Generate proposal PDF if selected
      if (attachments.proposal) {
        const { data: pdfData, error: pdfError } = await supabase.functions.invoke('generate-proposal-pdf', {
          body: { proposalId },
        });
        if (!pdfError && pdfData?.base64) {
          emailAttachments.push({
            filename: `Proposal-${proposalNumber}.pdf`,
            content: pdfData.base64,
          });
          sentAttachmentsRecord.proposal = true;
        }
      }

      // Terms & Conditions
      if (attachments.terms && docAvailability?.termsBase64) {
        emailAttachments.push({
          filename: `Terms-Conditions-${proposalNumber}.html`,
          content: docAvailability.termsBase64,
        });
        sentAttachmentsRecord.terms = true;
      }

      // Payment Schedule
      if (attachments.paymentSchedule && docAvailability?.paymentScheduleBase64) {
        emailAttachments.push({
          filename: `Payment-Schedule-${proposalNumber}.html`,
          content: docAvailability.paymentScheduleBase64,
        });
        sentAttachmentsRecord.paymentSchedule = true;
      }

      // Financing files — download from storage and encode
      if (attachments.financing && docAvailability?.financingFiles?.length) {
        for (const file of docAvailability.financingFiles) {
          try {
            const { data: fileData, error: dlError } = await supabase.storage
              .from('attachments')
              .download(file.storagePath);
            if (!dlError && fileData) {
              const arrayBuffer = await fileData.arrayBuffer();
              const uint8 = new Uint8Array(arrayBuffer);
              let binary = '';
              for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
              emailAttachments.push({
                filename: file.name,
                content: btoa(binary),
              });
            }
          } catch (_) {
            // skip if individual file fails
          }
        }
        sentAttachmentsRecord.financing = true;
      }

      setStep('sending');

      const { error: emailError } = await supabase.functions.invoke('send-proposal-email', {
        body: {
          proposalId,
          toEmail,
          ccEmails: ccEmails.split(',').map(e => e.trim()).filter(Boolean),
          subject,
          message,
          attachments: emailAttachments,
          sentAttachments: sentAttachmentsRecord,
        },
      });

      if (emailError) throw emailError;

      onClose();
    } catch (err: any) {
      console.error('Error sending email:', err);
      setError(err.message || 'Failed to send email. Please try again.');
      setStep('idle');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-gray-800 rounded-t-2xl sm:rounded-lg shadow-2xl w-full sm:max-w-2xl max-h-[95vh] sm:max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-500/10 rounded-lg flex items-center justify-center">
              <Mail className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-white">Send Proposal</h2>
              <p className="text-xs text-gray-400">#{proposalNumber}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-gray-700 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* To */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
              To <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="email"
                value={toEmail}
                onChange={(e) => setToEmail(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="customer@example.com"
                disabled={loading}
              />
            </div>
          </div>

          {/* CC */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
              CC (optional)
            </label>
            <input
              type="text"
              value={ccEmails}
              onChange={(e) => setCcEmails(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="email1@example.com, email2@example.com"
              disabled={loading}
            />
            <p className="text-xs text-gray-500 mt-1">Separate multiple emails with commas</p>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
              Subject <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
            />
          </div>

          {/* Message */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">
              Message <span className="text-red-400">*</span>
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={8}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono resize-none"
              disabled={loading}
            />
            <p className="text-xs text-gray-500 mt-1">
              A secure portal link will be included automatically so the customer can review everything online.
            </p>
          </div>

          {/* PDF Attachments section */}
          <div className="border border-gray-600 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAttachments(!showAttachments)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-700/50 hover:bg-gray-700 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-white">PDF Attachments</span>
                {attachmentCount > 0 && (
                  <span className="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full font-medium">
                    {attachmentCount} selected
                  </span>
                )}
              </div>
              {showAttachments ? (
                <ChevronUp className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              )}
            </button>

            {showAttachments && (
              <div className="p-3 space-y-2 bg-gray-800/50">
                <div className="flex items-start gap-2 mb-3 p-2 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                  <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-300">
                    Attachments allow customers to print and review documents offline. The secure portal link is always included for interactive access.
                  </p>
                </div>

                <AttachmentToggle
                  label="Proposal PDF"
                  description="Full proposal with line items, pricing, and totals"
                  enabled={attachments.proposal}
                  available={true}
                  loading={false}
                  onChange={(val) => setAttachments(prev => ({ ...prev, proposal: val }))}
                />

                <AttachmentToggle
                  label="Terms & Conditions"
                  description="Contract terms attached to this proposal"
                  enabled={attachments.terms}
                  available={!docsLoading && (docAvailability?.termsAvailable ?? false)}
                  unavailableReason={docsLoading ? 'Checking availability...' : 'No contract template linked to this proposal'}
                  loading={docsLoading}
                  onChange={(val) => setAttachments(prev => ({ ...prev, terms: val }))}
                />

                <AttachmentToggle
                  label="Payment Schedule"
                  description="Deposit, milestone, and balance payment details"
                  enabled={attachments.paymentSchedule}
                  available={!docsLoading && (docAvailability?.paymentScheduleAvailable ?? false)}
                  unavailableReason={docsLoading ? 'Checking availability...' : 'No payment schedule configured for this proposal'}
                  loading={docsLoading}
                  onChange={(val) => setAttachments(prev => ({ ...prev, paymentSchedule: val }))}
                />

                <AttachmentToggle
                  label="Financing Promotions"
                  description={
                    docAvailability?.financingFiles?.length
                      ? `${docAvailability.financingFiles.length} financing document${docAvailability.financingFiles.length !== 1 ? 's' : ''} available`
                      : 'Financing PDFs uploaded to this proposal'
                  }
                  enabled={attachments.financing}
                  available={!docsLoading && (docAvailability?.financingAvailable ?? false)}
                  unavailableReason={docsLoading ? 'Checking availability...' : 'No financing PDFs attached to this proposal'}
                  loading={docsLoading}
                  onChange={(val) => setAttachments(prev => ({ ...prev, financing: val }))}
                />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-t border-gray-700 flex-shrink-0 gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2.5 text-sm text-gray-300 hover:text-white transition-colors disabled:opacity-50 rounded-lg hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={loading || !toEmail || !subject || !message}
            className="flex-1 sm:flex-none px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>
                  {step === 'loading_docs' ? 'Preparing attachments...' : 'Sending...'}
                </span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>
                  Send Email
                  {attachmentCount > 0 && (
                    <span className="ml-1.5 text-blue-200 font-normal">
                      + {attachmentCount} PDF{attachmentCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
