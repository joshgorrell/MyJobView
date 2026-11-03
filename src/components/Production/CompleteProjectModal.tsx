import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  X,
  CheckCircle2,
  CheckCircle,
  Mail,
  Building,
  ExternalLink,
} from 'lucide-react';
import { useToast } from '../Shared/Toast';

export interface UpcomingCustomer {
  contact_id: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  project_id: string;
  project_name: string;
  project_number: string;
  project_status: string;
  target_completion_date: string | null;
  days_until_completion: number | null;
  assigned_pm_name: string | null;
  sales_order_id: string | null;
  sales_order_number: string | null;
  total_actual_hours: number | null;
  total_estimated_hours: number | null;
  progress_percent: number | null;
}

interface CompleteProjectModalProps {
  customer: UpcomingCustomer;
  onClose: () => void;
  onComplete: () => void;
  onOpenSalesOrder?: (salesOrderId: string) => void;
}

type Step = 'confirm' | 'sending';
type CompletionChoice = 'close' | 'test_and_tune';

export function CompleteProjectModal({ customer, onClose, onComplete, onOpenSalesOrder }: CompleteProjectModalProps) {
  const toast = useToast();
  const [step, setStep] = useState<Step>('confirm');
  const [sendEmail, setSendEmail] = useState(true);
  const [emailAddress, setEmailAddress] = useState(customer.contact_email || '');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [completionChoice, setCompletionChoice] = useState<CompletionChoice>('close');
  const [ttDays, setTtDays] = useState(90);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('test_tune_settings')
        .select('test_tune_period_days')
        .limit(1)
        .maybeSingle();
      if (data?.test_tune_period_days) setTtDays(data.test_tune_period_days);
    })();
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !loading) onClose();
    }
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose, loading]);


  async function handleComplete() {
    if (completionChoice === 'test_and_tune' && sendEmail && !emailAddress.trim()) {
      toast.error('Enter a customer email or turn off the invitation.', 'Email required');
      return;
    }
    setLoading(true);
    setStep('sending');
    try {
      // Server transaction must validate tenant authorization and atomically
      // complete the project, optionally activating T&T exactly once.
      // No direct table updates here: partial completion is not acceptable.
      const { data, error } = await supabase.rpc('complete_sales_order_project', {
        p_project_id: customer.project_id,
        p_choice: completionChoice,
      });
      if (error) throw error;
      if (!data) throw new Error('Project completion was not confirmed');

      if (completionChoice === 'test_and_tune' && sendEmail) {
        // Use the established customer-program grant before emailing a portal link.
        // If access provisioning fails, do not send an unusable invitation.
        try {
          const { data: grantId, error: grantError } = await supabase.rpc('grant_customer_program', {
            p_contact_id: customer.contact_id,
            p_program: 'test_and_tune',
            p_project_id: customer.project_id,
            p_days: ttDays,
          });
          if (grantError) throw grantError;
          if (!grantId) throw new Error('Customer access was not confirmed');

          const { data: grant, error: grantLookupError } = await supabase
            .from('punchlist_access_grants')
            .select('expiration_date')
            .eq('id', grantId)
            .single();
          if (grantLookupError || !grant) throw new Error('Customer access expiration could not be confirmed');

          const { data: inviteResult, error: inviteError } = await supabase.functions.invoke('send-punchlist-invite', {
            body: {
              contact_email: emailAddress.trim(),
              contact_name: customer.contact_name,
              project_name: customer.project_name,
              expiration_date: grant.expiration_date,
              access_type: 'test_and_tune',
            },
          });
          if (inviteError || inviteResult?.success !== true) {
            throw new Error(inviteResult?.error || inviteError?.message || 'Invitation delivery was not confirmed');
          }
        } catch (inviteError) {
          console.error('Project completed; customer invitation requires attention:', inviteError);
          toast.error('Project completed, but customer invitation needs attention. Review access and resend from Test & Tune.', 'Invitation not confirmed');
        }
      }
      setDone(true);
      setTimeout(() => { onComplete(); onClose(); }, 1800);
    } catch (err: any) {
      console.error('Error completing project:', err);
      toast.error(err.message || 'Failed to complete project', 'Error');
      setStep('confirm');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={() => { if (!loading) onClose(); }}
      style={{ animation: 'fadeIn 0.15s ease' }}
    >
      <style>{`
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes scaleIn{from{opacity:0;transform:scale(0.85)}to{opacity:1;transform:scale(1)}}
      `}</style>

      <div
        className="bg-gray-900 w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl border-t border-gray-700/60 sm:border overflow-hidden"
        style={{ animation: 'slideUp 0.22s ease-out', maxHeight: '92dvh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle mobile */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-gray-600" />
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: 'calc(92dvh - 20px)' }}>

          {/* ── Success state ───────────────────────────────── */}
          {done && (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center" style={{ animation: 'scaleIn 0.25s ease-out' }}>
              <div className="w-16 h-16 rounded-full bg-green-500/20 border-2 border-green-500 flex items-center justify-center mb-4">
                <CheckCircle className="w-8 h-8 text-green-400" />
              </div>
              <h2 className="text-lg font-bold text-white mb-1">Project Marked Complete!</h2>
              <p className="text-sm text-gray-400">
                {completionChoice === 'close' ? 'Project closed without Test & Tune.' : 'Test & Tune activated for this project.'}
              </p>
            </div>
          )}

          {/* ── Sending state ───────────────────────────────── */}
          {step === 'sending' && !done && (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <div className="w-12 h-12 border-3 border-green-500 border-t-transparent rounded-full animate-spin mb-4" style={{ borderWidth: 3 }} />
              <p className="text-sm text-gray-400">Completing project...</p>
            </div>
          )}

          {/* ── Step 1: Confirm ─────────────────────────────── */}
          {step === 'confirm' && !done && (
            <>
              {/* Header */}
              <div className="px-5 pt-4 pb-4 flex items-start justify-between gap-3 border-b border-gray-800">
                <div>
                  <h2 className="text-base font-bold text-white">Mark Project Complete</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Review what happens before confirming</p>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-800 text-gray-400 hover:text-white transition-colors flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-5 py-5 space-y-4">
                {/* Customer + project card */}
                <div className="bg-gray-800 border border-gray-700 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                      {customer.contact_name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-white truncate">{customer.contact_name}</div>
                      {customer.contact_email && (
                        <div className="text-xs text-gray-400 truncate">{customer.contact_email}</div>
                      )}
                    </div>
                  </div>
                  <div className="pt-2 border-t border-gray-700 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <Building className="w-3.5 h-3.5 flex-shrink-0 text-gray-500" />
                      <span className="truncate font-medium text-gray-300">{customer.project_name}</span>
                      {customer.project_number && (
                        <span className="text-gray-600 flex-shrink-0">#{customer.project_number}</span>
                      )}
                    </div>
                    {customer.sales_order_id && customer.sales_order_number && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="w-3.5" />
                        {onOpenSalesOrder ? (
                          <button
                            type="button"
                            onClick={() => { onOpenSalesOrder(customer.sales_order_id!); onClose(); }}
                            className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Sales Order #{customer.sales_order_number}
                          </button>
                        ) : (
                          <span className="text-gray-500">Sales Order #{customer.sales_order_number}</span>
                        )}
                      </div>
                    )}
                    {/* Hours progress */}
                    {customer.total_estimated_hours != null && customer.total_estimated_hours > 0 && (
                      <div className="pt-1">
                        <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
                          <span>Labor Progress</span>
                          <span className="font-semibold text-gray-400">
                            {(customer.total_actual_hours ?? 0).toFixed(1)} / {customer.total_estimated_hours.toFixed(1)} hrs
                            {customer.progress_percent != null && (
                              <span className={`ml-1.5 font-bold ${customer.progress_percent >= 80 ? 'text-green-400' : 'text-amber-400'}`}>
                                ({customer.progress_percent.toFixed(0)}%)
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              (customer.progress_percent ?? 0) >= 80 ? 'bg-green-500' : 'bg-amber-500'
                            }`}
                            style={{ width: `${Math.min(100, customer.progress_percent ?? 0)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-3" role="radiogroup" aria-label="Project completion outcome">
                  <label className="flex gap-3 rounded-xl border border-gray-700 p-4 cursor-pointer">
                    <input type="radio" name="completionChoice" checked={completionChoice === 'close'} onChange={() => setCompletionChoice('close')} />
                    <span><strong className="block text-white text-sm">Complete &amp; Close</strong><span className="text-xs text-gray-400">Finish this job. No Test &amp; Tune period or invitation.</span></span>
                  </label>
                  <label className="flex gap-3 rounded-xl border border-gray-700 p-4 cursor-pointer">
                    <input type="radio" name="completionChoice" checked={completionChoice === 'test_and_tune'} onChange={() => setCompletionChoice('test_and_tune')} />
                    <span><strong className="block text-white text-sm">Start Test &amp; Tune</strong><span className="text-xs text-gray-400">Start the {ttDays}-day period immediately. Existing access dates will not reset.</span></span>
                  </label>
                  {completionChoice === 'test_and_tune' && (
                    <div className="rounded-xl bg-gray-800 p-4 space-y-3">
                      <label className="flex items-center gap-2 text-sm text-white">
                        <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} />
                        Email customer their Test &amp; Tune invitation
                      </label>
                      {sendEmail && (
                        <label className="block text-xs text-gray-400">
                          <Mail className="inline w-3 h-3 mr-1" />Customer email
                          <input type="email" value={emailAddress} onChange={e => setEmailAddress(e.target.value)} className="mt-2 w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white" placeholder="customer@example.com" />
                        </label>
                      )}
                    </div>
                  )}
                </div>
                <button onClick={handleComplete} disabled={loading || (completionChoice === 'test_and_tune' && sendEmail && !emailAddress.trim())} className="w-full py-3.5 bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white font-semibold rounded-xl">
                  {completionChoice === 'close' ? 'Complete & Close' : 'Start Test & Tune'}
                </button>
                <button onClick={onClose} className="w-full py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
