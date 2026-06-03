import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  X,
  CheckCircle2,
  CheckCircle,
  AlertCircle,
  Star,
  TrendingUp,
  Mail,
  Send,
  Clock,
  Building,
  ChevronRight,
  ExternalLink,
  Award,
  ShieldCheck,
  Calendar,
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

type Step = 'confirm' | 'tt_decision' | 'sending';

interface ExistingAccess {
  type: 'vip' | 'test_and_tune' | 'none';
  daysRemaining?: number;
  planName?: string;
}

export function CompleteProjectModal({ customer, onClose, onComplete, onOpenSalesOrder }: CompleteProjectModalProps) {
  const toast = useToast();
  const [step, setStep] = useState<Step>('confirm');
  const [confirmed, setConfirmed] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);
  const [emailAddress, setEmailAddress] = useState(customer.contact_email || '');
  const [existingAccess, setExistingAccess] = useState<ExistingAccess>({ type: 'none' });
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

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

  async function checkExistingAccess() {
    setCheckingAccess(true);
    try {
      // Check VIP subscription first
      const { data: vipData } = await supabase
        .from('recurring_subscriptions')
        .select('id, status, recurring_plans(name)')
        .eq('contact_id', customer.contact_id)
        .in('status', ['active', 'trial'])
        .maybeSingle();

      if (vipData) {
        setExistingAccess({
          type: 'vip',
          planName: (vipData as any).recurring_plans?.name || 'VIP Plan',
        });
        return;
      }

      // Check active T&T access grant
      const { data: grantData } = await supabase
        .from('punchlist_access_grants')
        .select('id, expiration_date, access_type')
        .eq('contact_id', customer.contact_id)
        .in('status', ['active', 'suspended'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (grantData?.expiration_date) {
        const days = Math.ceil(
          (new Date(grantData.expiration_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        setExistingAccess({ type: 'test_and_tune', daysRemaining: Math.max(0, days) });
      } else {
        setExistingAccess({ type: 'none' });
      }
    } catch (err) {
      console.error('Error checking access:', err);
      setExistingAccess({ type: 'none' });
    } finally {
      setCheckingAccess(false);
    }
  }

  function handleConfirmNext() {
    if (!confirmed) return;
    checkExistingAccess();
    setStep('tt_decision');
  }

  async function handleComplete(skipEmail: boolean) {
    setLoading(true);
    setStep('sending');
    try {
      const today = new Date();
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + 90);

      // 1. Mark project substantially complete
      const { error: projectError } = await supabase
        .from('projects')
        .update({
          substantial_completion_date: today.toISOString().split('T')[0],
          status: 'completed',
        })
        .eq('id', customer.project_id);

      if (projectError) throw projectError;

      // 2. Update associated sales order to complete if one exists
      if (customer.sales_order_id) {
        await supabase
          .from('sales_orders')
          .update({
            status: 'complete',
            completed_at: today.toISOString(),
            test_tune_status: 'active',
            test_tune_start_date: today.toISOString().split('T')[0],
            test_tune_end_date: endDate.toISOString().split('T')[0],
          })
          .eq('id', customer.sales_order_id);
      }

      // 3. Create access grant if no existing active access
      if (existingAccess.type === 'none') {
        const { data: accessGrant, error: grantError } = await supabase
          .from('punchlist_access_grants')
          .insert({
            contact_id: customer.contact_id,
            access_type: 'test_and_tune',
            status: 'active',
            granted_date: today.toISOString(),
            expiration_date: endDate.toISOString(),
            project_id: customer.project_id,
            sales_order_id: customer.sales_order_id || null,
            notes: `Test & Tune access granted on project completion — ${customer.project_name}`,
          })
          .select()
          .single();

        if (grantError) throw grantError;

        // 4. Send email if requested
        if (!skipEmail && emailAddress.trim() && emailAddress.includes('@')) {
          try {
            await supabase.functions.invoke('send-punchlist-invite', {
              body: {
                contact_email: emailAddress.trim(),
                contact_name: customer.contact_name,
                project_name: customer.project_name,
                expiration_date: accessGrant?.expiration_date,
                access_type: 'test_and_tune',
              },
            });
          } catch (emailErr) {
            console.error('Email send error:', emailErr);
          }
        }
      }

      setDone(true);
      setTimeout(() => {
        onComplete();
        onClose();
      }, 2200);
    } catch (err: any) {
      console.error('Error completing project:', err);
      toast.error(err.message || 'Failed to complete project', 'Error');
      setStep('tt_decision');
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
                {existingAccess.type === 'none'
                  ? sendEmail
                    ? `T&T access created and welcome email sent to ${customer.contact_name}.`
                    : `T&T access created. Welcome email not sent.`
                  : `Project complete. No new access needed — ${customer.contact_name} already has active access.`}
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

                {/* What happens next panel */}
                <div className="bg-gray-800/50 border border-gray-700 rounded-2xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-700/60">
                    <p className="text-xs font-bold text-gray-300 uppercase tracking-wider">What happens next</p>
                  </div>
                  <div className="divide-y divide-gray-700/40">
                    <div className="flex items-start gap-3 px-4 py-3">
                      <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-white">Sales order marked complete</p>
                        <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">
                          {customer.sales_order_number ? `Order #${customer.sales_order_number} ` : 'The linked sales order '}
                          will be closed and the project status updated to completed.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 px-4 py-3">
                      <div className="w-6 h-6 rounded-full bg-cyan-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Award className="w-3.5 h-3.5 text-cyan-400" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-white">90-Day Test &amp; Tune starts today</p>
                        <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">
                          The T&amp;T period runs from today through{' '}
                          <span className="text-white font-semibold">
                            {new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>.
                          Post-install service hours count toward performance bonuses.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 px-4 py-3">
                      <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-white">Customer gets portal access</p>
                        <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">
                          {customer.contact_name} will be granted portal access to submit punchlist items and service requests.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 px-4 py-3">
                      <div className="w-6 h-6 rounded-full bg-violet-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Mail className="w-3.5 h-3.5 text-violet-400" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-white">Welcome email sent (optional)</p>
                        <p className="text-[11px] text-gray-400 mt-0.5 leading-relaxed">
                          You'll choose on the next screen whether to send a welcome email with their portal login link.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Confirmation checkbox */}
                <label className={`flex items-start gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                  confirmed ? 'border-green-600 bg-green-900/20' : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                }`}>
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${
                    confirmed ? 'border-green-500 bg-green-500' : 'border-gray-600'
                  }`}>
                    {confirmed && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                  </div>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={confirmed}
                    onChange={e => setConfirmed(e.target.checked)}
                  />
                  <div>
                    <div className="text-sm font-semibold text-white">This project is substantially complete</div>
                    <div className="text-xs text-gray-400 mt-0.5">All major work has been finished and the system is ready for use.</div>
                  </div>
                </label>

                <button
                  onClick={handleConfirmNext}
                  disabled={!confirmed}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-green-600 hover:bg-green-500 active:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-2xl transition-colors"
                >
                  Next — Set Up T&T Access
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}

          {/* ── Step 2: T&T Decision ─────────────────────────── */}
          {step === 'tt_decision' && !done && (
            <>
              {/* Header */}
              <div className="px-5 pt-4 pb-4 flex items-start justify-between gap-3 border-b border-gray-800">
                <div>
                  <h2 className="text-base font-bold text-white">Test &amp; Tune Access</h2>
                  <p className="text-xs text-gray-500 mt-0.5">{customer.contact_name} &middot; {customer.project_name}</p>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-800 text-gray-400 hover:text-white transition-colors flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-5 py-5 space-y-4">

                {checkingAccess ? (
                  <div className="flex items-center justify-center py-8 gap-3 text-gray-400 text-sm">
                    <div className="w-5 h-5 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
                    Checking customer access...
                  </div>
                ) : (
                  <>
                    {/* Already has VIP */}
                    {existingAccess.type === 'vip' && (
                      <div className="bg-amber-900/20 border border-amber-700 rounded-2xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Star className="w-4 h-4 text-amber-400 flex-shrink-0" />
                          <span className="text-sm font-semibold text-amber-300">Already a VIP Member</span>
                        </div>
                        <p className="text-xs text-amber-300/70 leading-relaxed">
                          {customer.contact_name} has an active VIP membership
                          {existingAccess.planName ? ` (${existingAccess.planName})` : ''} which already includes
                          full punchlist access. No new T&T invite is needed.
                        </p>
                      </div>
                    )}

                    {/* Already has active T&T */}
                    {existingAccess.type === 'test_and_tune' && (
                      <div className="bg-blue-900/20 border border-blue-700 rounded-2xl p-4 space-y-2">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-blue-400 flex-shrink-0" />
                          <span className="text-sm font-semibold text-blue-300">Already on Test &amp; Tune</span>
                        </div>
                        <p className="text-xs text-blue-300/70 leading-relaxed">
                          {customer.contact_name} already has an active T&amp;T access grant
                          {existingAccess.daysRemaining != null
                            ? ` with ${existingAccess.daysRemaining} days remaining`
                            : ''}.
                        </p>
                        <p className="text-xs text-amber-300/80 leading-relaxed bg-amber-900/20 border border-amber-700/40 rounded-xl px-3 py-2">
                          Completing this project will <span className="font-semibold text-amber-300">reset their 90-day clock</span> — their existing access will be extended from today.
                          Confirm below if that is intended.
                        </p>
                      </div>
                    )}

                    {/* No existing access — show email option */}
                    {existingAccess.type === 'none' && (
                      <>
                        <div className="bg-green-900/15 border border-green-700/60 rounded-2xl p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                            <span className="text-sm font-semibold text-green-300">Grant 90-Day T&T Access</span>
                          </div>
                          <p className="text-xs text-gray-400 leading-relaxed">
                            A new 90-day Test &amp; Tune access grant will be created for this customer,
                            letting them submit punchlist items and service requests through the portal.
                          </p>
                        </div>

                        {/* Email toggle */}
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Send Welcome Email?</p>
                          <div className="space-y-2">
                            <label className={`flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                              sendEmail ? 'border-blue-600 bg-blue-900/20' : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                            }`}>
                              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                sendEmail ? 'border-blue-500 bg-blue-500' : 'border-gray-600'
                              }`}>
                                {sendEmail && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                              </div>
                              <input type="radio" className="sr-only" checked={sendEmail} onChange={() => setSendEmail(true)} />
                              <div>
                                <div className="text-sm font-medium text-white flex items-center gap-1.5">
                                  <Send className="w-3.5 h-3.5 text-blue-400" />
                                  Send Welcome Email
                                </div>
                                <div className="text-xs text-gray-400 mt-0.5">Notify them with portal link &amp; instructions</div>
                              </div>
                            </label>

                            <label className={`flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${
                              !sendEmail ? 'border-gray-500 bg-gray-800' : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                            }`}>
                              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                !sendEmail ? 'border-gray-400 bg-gray-400' : 'border-gray-600'
                              }`}>
                                {!sendEmail && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                              </div>
                              <input type="radio" className="sr-only" checked={!sendEmail} onChange={() => setSendEmail(false)} />
                              <div>
                                <div className="text-sm font-medium text-white">Skip Email for Now</div>
                                <div className="text-xs text-gray-400 mt-0.5">Access created silently — send from Punchlist later</div>
                              </div>
                            </label>
                          </div>
                        </div>

                        {/* Email address field */}
                        {sendEmail && (
                          <div>
                            <label className="block text-xs font-semibold text-gray-400 mb-1.5">
                              <Mail className="w-3 h-3 inline mr-1" />
                              Send to
                            </label>
                            <input
                              type="email"
                              value={emailAddress}
                              onChange={e => setEmailAddress(e.target.value)}
                              placeholder="customer@example.com"
                              className="w-full px-3 py-2.5 bg-gray-800 border border-gray-600 rounded-xl text-white text-sm focus:border-blue-500 focus:outline-none"
                            />
                            {!emailAddress && (
                              <p className="text-xs text-orange-400 mt-1 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" />
                                No email on file. Enter an address or skip email.
                              </p>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    {/* Action buttons */}
                    <div className="space-y-2 pt-1">
                      {existingAccess.type === 'none' ? (
                        <button
                          onClick={() => handleComplete(!sendEmail)}
                          disabled={sendEmail && !emailAddress.trim()}
                          className="w-full flex items-center justify-center gap-2 py-3.5 bg-green-600 hover:bg-green-500 active:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-2xl transition-colors"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Complete Project
                          {sendEmail ? ' & Send Email' : ''}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleComplete(true)}
                          className="w-full flex items-center justify-center gap-2 py-3.5 bg-green-600 hover:bg-green-500 active:bg-green-700 text-white font-semibold text-sm rounded-2xl transition-colors"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Mark Complete Only
                        </button>
                      )}
                      <button
                        onClick={() => setStep('confirm')}
                        className="w-full py-3 text-sm text-gray-400 hover:text-white transition-colors"
                      >
                        Back
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
