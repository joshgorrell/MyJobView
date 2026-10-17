import { useState, useEffect } from 'react';
import { X, CheckCircle2, AlertCircle, ChevronDown, ChevronRight, Loader2, Wrench, Copy, Mail, Printer, ShieldCheck } from 'lucide-react';
import { checkProposalReadiness, markAllSectionsReviewed, type ValidationSection } from '../../lib/proposalValidation';

interface PreSendValidationModalProps {
  proposalId: string;
  proposalNumber: string;
  onClose: () => void;
  onSend: (approvalWindow: number, visibleInPortal: boolean) => Promise<void>;
  initialPortalVisibility?: boolean;
  onEmailProposal?: () => void;
  onPrintProposal?: () => void;
  onCopyLink?: () => void;
  copyingLink?: boolean;
  canCopyLink?: boolean;
  allowSubmission?: boolean;
  alreadySubmitted?: boolean;
  onNavigateToSettings: (section: ValidationSection['name']) => void;
}


export function PreSendValidationModal({
  proposalId,
  proposalNumber,
  onClose,
  onSend,
  initialPortalVisibility = false,
  onEmailProposal,
  onPrintProposal,
  onCopyLink,
  copyingLink = false,
  canCopyLink = false,
  allowSubmission = true,
  alreadySubmitted = false,
  onNavigateToSettings,
}: PreSendValidationModalProps) {
  const [loading, setLoading] = useState(true);
  const [validationData, setValidationData] = useState<any>(null);
  const approvalWindow = 30; // Dealer policy is resolved by the submission handler.
  const [visibleInPortal, setVisibleInPortal] = useState(initialPortalVisibility);
  const [sending, setSending] = useState(false);
  const [linkActivated, setLinkActivated] = useState(alreadySubmitted);
  const [submissionError, setSubmissionError] = useState('');
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadAndAutoConfirm();
  }, [proposalId]);

  async function loadAndAutoConfirm() {
    setLoading(true);
    try {
      const data = await checkProposalReadiness(proposalId);
      const allValid = data.sections.every((s: ValidationSection) => s.isValid);
      const anyUnreviewed = data.sections.some((s: ValidationSection) => !s.isReviewed);

      if (allValid && anyUnreviewed) {
        await markAllSectionsReviewed(proposalId);
        const refreshed = await checkProposalReadiness(proposalId);
        setValidationData(refreshed);
      } else {
        setValidationData(data);
      }
    } catch (error) {
      console.error('Error loading validation:', error);
    } finally {
      setLoading(false);
    }
  }

  function toggleIssues(sectionName: string, e: React.MouseEvent) {
    e.stopPropagation();
    setExpandedIssues(prev => {
      const next = new Set(prev);
      if (next.has(sectionName)) next.delete(sectionName);
      else next.add(sectionName);
      return next;
    });
  }

  function handleSectionClick(section: ValidationSection) {
    onNavigateToSettings(section.name);
    onClose();
  }

  async function handleSend() {
    if (!allowSubmission || !validationData?.isReady || sending) return;
    setSending(true);
    try {
      await onSend(approvalWindow, visibleInPortal);
      setLinkActivated(true);
      setSubmissionError('');
    } catch (error) {
      // The parent displays the failure; leave this dialog open so the user can retry.
      console.error('Proposal submission failed:', error);
      setSubmissionError('Could not activate the proposal. Please try again.');
    } finally {
      setSending(false);
    }
  }

  async function handleActivateLink(checked: boolean) {
    if (!checked || linkActivated || sending || !allowSubmission || !validationData?.isReady) return;
    await handleSend();
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-lg p-8 flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          <p className="text-gray-300 text-sm">Validating proposal...</p>
        </div>
      </div>
    );
  }

  const { sections = [], overallProgress = 0, isReady: _isReady = false } = validationData || {};
  const invalidSections = sections.filter((s: ValidationSection) => !s.isValid);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-xl max-h-[95dvh] sm:max-h-[90dvh] overflow-y-auto flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700/60">
          <div>
            <h2 className="text-lg font-semibold text-white">Proposal delivery</h2>
            <p className="text-gray-400 text-xs mt-0.5">#{proposalNumber}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg p-1.5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 sm:px-6 py-4 border-b border-gray-700/60 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-blue-400" />
            <div>
              <p className="text-sm font-semibold text-white">Optional delivery actions</p>
              <p className="text-xs text-gray-400">Submit without sending anything, or choose how to share the proposal.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button type="button" onClick={onEmailProposal} disabled={!onEmailProposal}
              className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-gray-600 bg-gray-800 px-3 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50">
              <Mail className="h-4 w-4" /> Email
            </button>
            <button type="button" onClick={onCopyLink} disabled={!onCopyLink || !(canCopyLink || linkActivated) || copyingLink}
              title={canCopyLink || linkActivated ? 'Copy the reusable customer link' : 'Activate the customer proposal link first'}
              className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-gray-600 bg-gray-800 px-3 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50">
              <Copy className="h-4 w-4" /> {copyingLink ? 'Copying…' : 'Copy link'}
            </button>
            <button type="button" onClick={onPrintProposal} disabled={!onPrintProposal}
              className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-gray-600 bg-gray-800 px-3 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50">
              <Printer className="h-4 w-4" /> Print / PDF
            </button>
          </div>
          {!canCopyLink && !linkActivated && <p className="text-xs text-gray-400">Activate the customer proposal link below to enable copying.</p>}
        </div>

        <div className="px-4 sm:px-6 py-3 border-b border-gray-700/60">
          <label className={`flex items-start gap-3 rounded-xl border p-4 ${linkActivated ? 'border-green-600/40 bg-green-500/10' : 'border-blue-500/40 bg-blue-500/10'}`}>
            <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-blue-500"
              checked={linkActivated} disabled={linkActivated || sending || !allowSubmission || !validationData?.isReady}
              onChange={e => void handleActivateLink(e.target.checked)} />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-white">{linkActivated ? 'Customer proposal link is active' : 'Activate customer proposal link'}</span>
              <span className="mt-1 block text-xs leading-5 text-gray-300">{linkActivated
                ? 'This proposal has been submitted. Use Copy link, Email, or Print / PDF above to share it.'
                : 'Checking this box submits the proposal immediately, starts the dealer-wide approval window, and enables the reusable customer link. No email is sent.'}</span>
            </span>
          </label>
          {!allowSubmission && !linkActivated && <p className="mt-2 text-xs text-amber-300">This proposal cannot be submitted in its current status.</p>}
          {!validationData?.isReady && !linkActivated && <p className="mt-2 text-xs text-amber-300">Resolve the readiness issues below to activate the link.</p>}
          {submissionError && <p role="alert" className="mt-2 text-xs text-red-300">{submissionError}</p>}
        </div>

        {/* Progress bar */}
        <div className="px-6 pt-4 pb-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Proposal Readiness</span>
            <span className={`text-sm font-bold ${overallProgress === 100 ? 'text-green-400' : 'text-amber-400'}`}>
              {overallProgress}%
            </span>
          </div>
          <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${overallProgress === 100 ? 'bg-green-500' : 'bg-amber-500'}`}
              style={{ width: `${overallProgress}%` }}
            />
          </div>
        </div>

        {/* Sections — no scroll, all visible */}
        <div className="px-6 pb-3 space-y-1.5">
          {sections.map((section: ValidationSection) => {
            const isExpanded = expandedIssues.has(section.name);
            const hasIssues = section.issues.length > 0;
            const isError = !section.isValid;

            return (
              <div
                key={section.name}
                className={`rounded-xl border transition-all cursor-pointer group ${
                  isError
                    ? 'border-red-500/30 bg-red-500/5 hover:bg-red-500/10 hover:border-red-500/50'
                    : 'border-green-500/20 bg-green-500/5 hover:bg-gray-700/50 hover:border-gray-600'
                }`}
                onClick={() => handleSectionClick(section)}
              >
                <div className="flex items-center gap-3 px-4 py-2.5">
                  {isError ? (
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                  )}

                  <div className="flex-1 min-w-0 flex items-center">
                    <span className="text-sm font-medium text-white">{section.label}</span>
                    <span className="mx-2 text-gray-600">·</span>
                    <span className={`text-sm truncate ${isError ? 'text-red-400' : 'text-gray-400'}`}>
                      {section.summary}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {hasIssues && (
                      <button
                        onClick={(e) => toggleIssues(section.name, e)}
                        className="text-gray-500 hover:text-gray-300 transition-colors"
                      >
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                    )}
                    {isError ? (
                      <Wrench className="w-3.5 h-3.5 text-red-400 opacity-60 group-hover:opacity-100 transition-opacity" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400 transition-colors" />
                    )}
                  </div>
                </div>

                {/* Collapsible issues */}
                {isExpanded && hasIssues && (
                  <div className="px-4 pb-2.5 pt-0 border-t border-red-500/20">
                    <ul className="mt-2 space-y-1">
                      {section.issues.map((issue: string, idx: number) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-red-400">
                          <span className="mt-0.5 text-red-500">•</span>
                          {issue}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Issues alert if any invalid */}
        {invalidSections.length > 0 && (
          <div className="mx-6 mb-3 flex items-start gap-3 px-4 py-2.5 bg-red-500/10 border border-red-500/30 rounded-xl">
            <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-300">
              {invalidSections.length === 1
                ? '1 section needs attention before submission.'
                : `${invalidSections.length} sections need attention before sending.`}
            </p>
          </div>
        )}

        <div className="px-6 pb-4 border-b border-gray-700/60">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Approval &amp; Viewing Window</p>
          <p className="mt-1 text-sm text-gray-300">Uses the dealer-wide proposal setting. The deadline restarts when this proposal is resubmitted.</p>
        </div>

        <div className="px-4 sm:px-6 py-3 border-b border-gray-700/60">
          <label className="flex items-center justify-between gap-3 text-sm text-white cursor-pointer min-h-[44px]">
            <span><span className="block font-medium">Visible in Customer Portal</span><span className="block text-xs text-gray-400 mt-1">Choose whether to show this proposal in the customer portal when activated. No email is sent.</span></span>
            <input type="checkbox" className="h-5 w-5 shrink-0 accent-blue-500" checked={visibleInPortal} disabled={linkActivated || sending || !allowSubmission} onChange={event => setVisibleInPortal(event.target.checked)} />
          </label>
        </div>

        <div className="sticky bottom-0 border-t border-gray-700 bg-gray-900 px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <p className="text-xs text-gray-400">{linkActivated ? 'Submitted — choose a delivery method above.' : 'No email is sent automatically.'}</p>
          <button type="button" onClick={onClose} className="min-h-11 rounded-xl bg-gray-700 px-5 text-sm font-semibold text-white hover:bg-gray-600">Done</button>
        </div>
      </div>
    </div>
  );
}
