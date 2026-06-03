import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  X,
  CheckCircle2,
  Clock,
  Award,
  Send,
  AlertCircle,
  Calendar,
  Users,
  Mail,
  Target,
  Star,
  TrendingUp,
  Phone,
  ShieldCheck,
} from 'lucide-react';

interface CompleteSalesOrderModalProps {
  salesOrder: {
    id: string;
    order_number: string;
    contact_id: string;
    project_id?: string;
    total_estimated_labor_hours?: number;
  };
  onClose: () => void;
  onComplete: () => void;
}

interface Contact {
  id: string;
  full_name: string;
  email: string;
  phone: string;
}

interface Project {
  id: string;
  title: string;
}

type ExistingPortalAccess =
  | { type: 'vip'; planName: string }
  | { type: 'test_and_tune'; daysRemaining: number }
  | { type: 'none' };

export function CompleteSalesOrderModal({ salesOrder, onClose, onComplete }: CompleteSalesOrderModalProps) {
  const [loading, setLoading] = useState(false);
  const [startTestTune, setStartTestTune] = useState(true);
  const [sendPunchlistInvite, setSendPunchlistInvite] = useState(true);
  const [contact, setContact] = useState<Contact | null>(null);
  const [editableEmail, setEditableEmail] = useState('');
  const [project, setProject] = useState<Project | null>(null);
  const [estimatedLabor, setEstimatedLabor] = useState(0);
  const [actualLabor, setActualLabor] = useState(0);
  const [fieldLaborTarget, setFieldLaborTarget] = useState(0);
  const [existingAccess, setExistingAccess] = useState<ExistingPortalAccess>({ type: 'none' });
  const [checkingAccess, setCheckingAccess] = useState(true);

  useEffect(() => {
    loadData();
  }, [salesOrder]);

  async function loadData() {
    try {
      setCheckingAccess(true);

      const { data: contactData } = await supabase
        .from('contacts')
        .select('id, full_name, email, phone')
        .eq('id', salesOrder.contact_id)
        .maybeSingle();

      if (contactData) {
        setContact(contactData);
        setEditableEmail(contactData.email || '');

        // Check VIP first
        const { data: vipData } = await supabase
          .from('recurring_subscriptions')
          .select('id, status, plan:recurring_plans(name)')
          .eq('contact_id', contactData.id)
          .in('status', ['active', 'trial'])
          .maybeSingle();

        if (vipData) {
          const planName = (vipData as any).plan?.name || 'VIP Plan';
          setExistingAccess({ type: 'vip', planName });
        } else {
          // Check active T&T grant
          const { data: ttData } = await supabase
            .from('punchlist_access_grants')
            .select('id, expiration_date')
            .eq('contact_id', contactData.id)
            .eq('access_type', 'test_and_tune')
            .eq('status', 'active')
            .maybeSingle();

          if (ttData?.expiration_date) {
            const msLeft = new Date(ttData.expiration_date).getTime() - Date.now();
            const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
            setExistingAccess({ type: 'test_and_tune', daysRemaining: daysLeft });
          }
        }
      }

      if (salesOrder.project_id) {
        const { data: projectData } = await supabase
          .from('projects')
          .select('id, title')
          .eq('id', salesOrder.project_id)
          .maybeSingle();

        if (projectData) setProject(projectData);
      }

      // Load estimated labor hours from proposal
      const { data: proposalData } = await supabase
        .from('sales_orders')
        .select('proposal_id, proposals!inner(proposal_line_items(labor_hours))')
        .eq('id', salesOrder.id)
        .maybeSingle();

      let estimatedHrs = 0;
      if (proposalData?.proposals?.proposal_line_items) {
        estimatedHrs = proposalData.proposals.proposal_line_items.reduce(
          (sum: number, item: { labor_hours: number }) => sum + (item.labor_hours || 0),
          0
        );
      } else if (salesOrder.total_estimated_labor_hours) {
        estimatedHrs = salesOrder.total_estimated_labor_hours;
      }
      setEstimatedLabor(estimatedHrs);
      setFieldLaborTarget(estimatedHrs * 0.95);

      // Load actual hours from work_orders linked to the project
      if (salesOrder.project_id) {
        const { data: woData } = await supabase
          .from('work_orders')
          .select('actual_hours')
          .eq('project_id', salesOrder.project_id);

        if (woData) {
          const totalActual = woData.reduce((sum, wo) => sum + (wo.actual_hours || 0), 0);
          setActualLabor(totalActual);
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setCheckingAccess(false);
    }
  }

  async function handleComplete() {
    if (!contact) return;

    setLoading(true);
    try {
      const today = new Date();
      const endDate = new Date(today);
      endDate.setDate(endDate.getDate() + 90);

      const updateData: Record<string, unknown> = {
        status: 'complete',
        completed_at: today.toISOString(),
      };

      if (startTestTune) {
        updateData.test_tune_status = 'active';
        updateData.test_tune_start_date = today.toISOString().split('T')[0];
        updateData.test_tune_end_date = endDate.toISOString().split('T')[0];
        updateData.total_estimated_labor_hours = estimatedLabor;
        updateData.field_labor_target_hours = fieldLaborTarget;
      }

      const { error: updateError } = await supabase
        .from('sales_orders')
        .update(updateData)
        .eq('id', salesOrder.id);

      if (updateError) throw updateError;

      if (project && startTestTune) {
        await supabase
          .from('projects')
          .update({
            substantial_completion_date: today.toISOString().split('T')[0],
            status: 'completed',
          })
          .eq('id', project.id);
      }

      // Only create a new access grant if they don't already have active access
      if (startTestTune && project && existingAccess.type === 'none') {
        const emailToUse = editableEmail.trim() || contact.email;

        // Update contact email if changed
        if (emailToUse && emailToUse !== contact.email) {
          await supabase
            .from('contacts')
            .update({ email: emailToUse })
            .eq('id', contact.id);
        }

        const { data: accessGrant, error: accessGrantError } = await supabase
          .from('punchlist_access_grants')
          .insert({
            contact_id: contact.id,
            access_type: 'test_and_tune',
            status: 'active',
            granted_date: today.toISOString(),
            expiration_date: endDate.toISOString(),
            sales_order_id: salesOrder.id,
            project_id: project.id,
            notes: `Test & Tune access automatically granted from sales order completion - Order ${salesOrder.order_number}`,
          })
          .select()
          .single();

        if (!accessGrantError && accessGrant && sendPunchlistInvite && emailToUse) {
          await supabase.functions.invoke('send-punchlist-invite', {
            body: {
              contact_email: emailToUse,
              contact_name: contact.full_name,
              project_name: project.title,
              expiration_date: accessGrant.expiration_date,
              access_type: 'test_and_tune',
            },
          });
        }
      }

      if (startTestTune) {
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from('notifications').insert({
          user_id: user?.id,
          type: 'test_tune_started',
          title: 'Test & Tune Program Started',
          message: `90-day Test & Tune period started for ${contact.full_name} - Order ${salesOrder.order_number}`,
          related_id: salesOrder.id,
        });
      }

      onComplete();
      onClose();
    } catch (error) {
      console.error('Error completing sales order:', error);
      alert('Failed to complete sales order. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const endDateDisplay = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toLocaleDateString();
  const hasExistingAccess = existingAccess.type !== 'none';

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      style={{ animation: 'fadeInBg 0.15s ease' }}
    >
      <style>{`@keyframes fadeInBg{from{opacity:0}to{opacity:1}} @keyframes slideUpSheet{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div
        className="bg-gray-900 w-full sm:max-w-2xl rounded-t-3xl sm:rounded-2xl shadow-2xl border-t border-gray-700/60 sm:border overflow-hidden"
        style={{ animation: 'slideUpSheet 0.22s ease-out', maxHeight: '94dvh' }}
      >
        {/* Drag handle — mobile only */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-gray-600" />
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: 'calc(94dvh - 20px)' }}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-3 pb-4 border-b border-gray-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Complete Sales Order</h2>
                <p className="text-xs text-gray-400">Order #{salesOrder.order_number}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-5 py-4 space-y-4">

            {/* ── Existing access banner (prominent) ───────────────────── */}
            {!checkingAccess && hasExistingAccess && existingAccess.type === 'vip' && (
              <div className="flex items-start gap-3 px-4 py-3.5 bg-amber-900/25 border border-amber-600/50 rounded-2xl">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                  <Star className="w-4 h-4 text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-amber-300">Already a VIP Member</p>
                  <p className="text-xs text-amber-400/70 mt-0.5 leading-relaxed">
                    {contact?.full_name} has an active <span className="font-semibold">{existingAccess.planName}</span> subscription.
                    Their portal access includes all punchlist features — no new grant needed.
                  </p>
                </div>
              </div>
            )}

            {!checkingAccess && hasExistingAccess && existingAccess.type === 'test_and_tune' && (
              <div className="flex items-start gap-3 px-4 py-3.5 bg-blue-900/25 border border-blue-600/50 rounded-2xl">
                <div className="w-9 h-9 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                  <ShieldCheck className="w-4 h-4 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-blue-300">Active T&amp;T Membership</p>
                  <p className="text-xs text-blue-400/70 mt-0.5 leading-relaxed">
                    {contact?.full_name} already has an active Test &amp; Tune membership with{' '}
                    <span className="font-semibold text-blue-300">{existingAccess.daysRemaining} days remaining</span>.
                    No new grant will be created — their existing access will continue.
                  </p>
                </div>
              </div>
            )}

            {/* ── Customer info ─────────────────────────────────────────── */}
            {contact && (
              <div className="bg-gray-800/60 border border-gray-700 rounded-2xl p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-xl bg-gray-700 flex items-center justify-center flex-shrink-0">
                    <Users className="w-4 h-4 text-gray-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{contact.full_name}</p>
                    {contact.phone && (
                      <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                        <Phone className="w-3 h-3" />
                        {contact.phone}
                      </p>
                    )}
                  </div>
                </div>

                {/* Email field — prominent, always visible */}
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5 flex items-center gap-1">
                    <Mail className="w-3 h-3" />
                    Email address for T&amp;T welcome email
                  </label>
                  <input
                    type="email"
                    value={editableEmail}
                    onChange={e => setEditableEmail(e.target.value)}
                    placeholder="customer@example.com"
                    className="w-full px-3 py-2.5 bg-gray-900 border border-gray-600 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60 transition-colors"
                  />
                  {!editableEmail && (
                    <p className="text-xs text-amber-400 mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      No email on file — customer won't receive the welcome email unless you add one
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* ── Labor progress ────────────────────────────────────────── */}
            {estimatedLabor > 0 && (() => {
              const progressPct = Math.min(100, (actualLabor / estimatedLabor) * 100);
              const isUnder80 = progressPct < 80;
              return (
                <div className="bg-gray-800/60 border border-gray-700 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-gray-400" />
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Labor Progress</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div className="bg-gray-900/60 rounded-xl px-3 py-2.5">
                      <div className="text-[10px] text-gray-500 uppercase tracking-wide">Estimated</div>
                      <div className="text-sm font-bold text-white mt-0.5">{estimatedLabor.toFixed(1)} <span className="text-xs font-normal text-gray-400">hrs</span></div>
                    </div>
                    <div className="bg-gray-900/60 rounded-xl px-3 py-2.5">
                      <div className="text-[10px] text-gray-500 uppercase tracking-wide">Actual</div>
                      <div className={`text-sm font-bold mt-0.5 ${isUnder80 ? 'text-amber-400' : 'text-green-400'}`}>{actualLabor.toFixed(1)} <span className="text-xs font-normal opacity-60">hrs</span></div>
                    </div>
                    <div className="bg-emerald-900/20 border border-emerald-700/40 rounded-xl px-3 py-2.5">
                      <div className="text-[10px] text-emerald-500/70 uppercase tracking-wide">Target (95%)</div>
                      <div className="text-sm font-bold text-emerald-400 mt-0.5">{fieldLaborTarget.toFixed(1)} <span className="text-xs font-normal text-emerald-500/60">hrs</span></div>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div>
                    <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
                      <span>Completion</span>
                      <span className={`font-bold ${isUnder80 ? 'text-amber-400' : 'text-green-400'}`}>{progressPct.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${isUnder80 ? 'bg-amber-500' : 'bg-green-500'}`}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>
                  {/* Soft warning for <80% */}
                  {isUnder80 && (
                    <div className="flex items-start gap-2.5 px-3 py-2.5 bg-amber-900/20 border border-amber-600/40 rounded-xl">
                      <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                      <div className="text-xs text-amber-300/90 leading-relaxed">
                        <span className="font-semibold">Project is only {progressPct.toFixed(0)}% complete by hours.</span>{' '}
                        You can still mark it complete now — this is informational only. Post-install labor tracking starts immediately once T&amp;T is active.
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── Test & Tune toggle ────────────────────────────────────── */}
            <div className={`border rounded-2xl transition-colors ${startTestTune ? 'border-cyan-500/40 bg-cyan-500/5' : 'border-gray-700 bg-gray-800/50'}`}>
              <label className="flex items-start gap-3 cursor-pointer px-4 pt-4 pb-3">
                <div className="relative mt-0.5 flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={startTestTune}
                    onChange={e => setStartTestTune(e.target.checked)}
                    className="sr-only"
                  />
                  <div
                    onClick={() => setStartTestTune(v => !v)}
                    className={`w-10 h-6 rounded-full transition-colors cursor-pointer flex items-center ${startTestTune ? 'bg-cyan-500' : 'bg-gray-600'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform mx-1 ${startTestTune ? 'translate-x-4' : 'translate-x-0'}`} />
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Award className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                    <span className="text-sm font-semibold text-white">Start 90-Day Test &amp; Tune Program</span>
                    <span className="text-[10px] px-2 py-0.5 bg-cyan-500/15 border border-cyan-500/30 rounded-full text-cyan-400 font-semibold">Recommended</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-400 leading-relaxed">
                    Starts performance tracking and grants the customer 90 days to fine-tune their system.
                    {estimatedLabor > 0 && ` Field teams earn bonuses by staying under the ${fieldLaborTarget.toFixed(1)} hr target.`}
                  </p>
                </div>
              </label>

              {startTestTune && (
                <div className="px-4 pb-4 space-y-3">
                  <div className="flex items-center gap-2 text-xs text-gray-300 bg-gray-800/60 border border-gray-700 rounded-xl px-3 py-2">
                    <Calendar className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                    <span>Program Period: <span className="font-semibold text-white">{new Date().toLocaleDateString()}</span> &ndash; <span className="font-semibold text-white">{endDateDisplay}</span></span>
                  </div>

                  {/* Access + Email send decision — only shown if no existing access */}
                  {!hasExistingAccess && (
                    <div className="border border-blue-500/30 bg-blue-500/5 rounded-xl p-3">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <div
                          onClick={() => setSendPunchlistInvite(v => !v)}
                          className={`relative mt-0.5 w-9 h-5 rounded-full transition-colors cursor-pointer flex items-center flex-shrink-0 ${sendPunchlistInvite ? 'bg-blue-500' : 'bg-gray-600'}`}
                        >
                          <div className={`w-3.5 h-3.5 bg-white rounded-full shadow transition-transform mx-0.5 ${sendPunchlistInvite ? 'translate-x-[14px]' : 'translate-x-0'}`} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5">
                            <Send className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                            <span className="text-xs font-semibold text-white">Send welcome email with portal access</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                            {sendPunchlistInvite
                              ? 'Customer will receive login instructions, program overview, and portal link.'
                              : 'Silent mode — access grant is created, but no email sent. You can share the portal link manually later.'}
                          </p>
                        </div>
                      </label>
                    </div>
                  )}

                  {hasExistingAccess && (
                    <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-800/60 border border-gray-700 rounded-xl px-3 py-2">
                      <ShieldCheck className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                      Existing portal access will be preserved — no new grant or email will be sent.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Warning: no project */}
            {!project && startTestTune && (
              <div className="flex items-start gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl">
                <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-amber-300 leading-relaxed">
                  <p className="font-semibold">No Project Found</p>
                  <p className="mt-0.5 text-amber-300/70">
                    This order has no linked project. T&amp;T tracking will start but portal access cannot be granted without a project.
                  </p>
                </div>
              </div>
            )}

            {/* Info: T&T skipped */}
            {!startTestTune && (
              <div className="flex items-start gap-3 px-4 py-3 bg-gray-800/60 border border-gray-700 rounded-2xl">
                <AlertCircle className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-gray-400 leading-relaxed">
                  Skipping T&amp;T means post-installation labor won't count toward performance bonuses
                  and the customer won't get portal access. You can enable it later from the sales order.
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3 px-5 py-4 border-t border-gray-800">
            <button
              onClick={onClose}
              className="w-full sm:w-auto px-5 py-3.5 sm:py-2.5 text-sm font-semibold text-gray-300 bg-gray-800 border border-gray-600 rounded-xl hover:bg-gray-700 hover:text-white transition-colors active:bg-gray-700 touch-manipulation"
            >
              Cancel
            </button>
            <button
              onClick={handleComplete}
              disabled={loading || checkingAccess}
              className="w-full sm:w-auto px-6 py-3.5 sm:py-2.5 text-sm font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-500 active:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 touch-manipulation shadow-lg shadow-emerald-900/30"
            >
              {loading ? (
                <>
                  <Clock className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : checkingAccess ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Checking access...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Complete Sales Order
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
