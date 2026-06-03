import { useState, useEffect } from 'react';
import { X, CheckCircle2, AlertCircle, ChevronDown, ChevronRight, Send, Loader2, Wrench } from 'lucide-react';
import { checkProposalReadiness, markAllSectionsReviewed, type ValidationSection } from '../../lib/proposalValidation';

interface PreSendValidationModalProps {
  proposalId: string;
  proposalNumber: string;
  onClose: () => void;
  onSend: (approvalWindow: number) => void;
  onNavigateToSettings: (section: ValidationSection['name']) => void;
}

const APPROVAL_WINDOWS = [7, 14, 30, 45, 60, 90];

export function PreSendValidationModal({
  proposalId,
  proposalNumber,
  onClose,
  onSend,
  onNavigateToSettings,
}: PreSendValidationModalProps) {
  const [loading, setLoading] = useState(true);
  const [validationData, setValidationData] = useState<any>(null);
  const [approvalWindow, setApprovalWindow] = useState(30);
  const [sending, setSending] = useState(false);
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

  function handleSend() {
    if (!validationData?.isReady || sending) return;
    setSending(true);
    onSend(approvalWindow);
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-lg p-8 flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          <p className="text-gray-300 text-sm">Validating proposal...</p>
        </div>
      </div>
    );
  }

  const { sections = [], overallProgress = 0, isReady = false } = validationData || {};
  const invalidSections = sections.filter((s: ValidationSection) => !s.isValid);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-xl flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700/60">
          <div>
            <h2 className="text-lg font-semibold text-white">Send Proposal</h2>
            <p className="text-gray-400 text-xs mt-0.5">#{proposalNumber}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg p-1.5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
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
                ? '1 section needs attention before sending.'
                : `${invalidSections.length} sections need attention before sending.`}
            </p>
          </div>
        )}

        {/* Approval window */}
        <div className="px-6 pb-4 border-b border-gray-700/60">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2.5">Approval Window</p>
          <div className="flex items-center gap-2">
            {APPROVAL_WINDOWS.map(days => (
              <button
                key={days}
                onClick={() => setApprovalWindow(days)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                  approvalWindow === days
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-gray-800 border-gray-600 text-gray-300 hover:border-gray-500 hover:text-white'
                }`}
              >
                {days}d
              </button>
            ))}
            <span className="text-xs text-gray-500 ml-1">from submission</span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex items-center gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-gray-300 hover:text-white hover:bg-gray-700 rounded-xl font-medium transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={!isReady || sending}
            className={`flex-1 py-2.5 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
              isReady && !sending
                ? 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-900/30'
                : 'bg-gray-700 text-gray-500 cursor-not-allowed'
            }`}
          >
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Send Proposal
              </>
            )}
          </button>
        </div>

        {isReady && (
          <p className="text-center text-xs text-green-400 pb-3 -mt-2 flex items-center justify-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Ready to send
          </p>
        )}
      </div>
    </div>
  );
}
