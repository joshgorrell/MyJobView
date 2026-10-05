import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { Star, Plus, Pencil as Edit2, Save, X, DollarSign, Calendar, CheckCircle2, Users, Check, Mail, Phone, Clock, Send, Search, RefreshCw } from 'lucide-react';
import { useToast } from '../Shared/Toast';
import { QuickActionModal } from '../Shared/QuickActionModal';
import ConfirmModal from '../ui/ConfirmModal';

interface InviteContact { id: string; full_name: string; email: string | null; phone: string | null; }

interface VIPPlan {
  id: string;
  plan_name: string;
  description: string | null;
  billing_frequency: string;
  amount: number;
  tax_rate: number;
  is_active: boolean;
  plan_type: string;
  show_on_portal: boolean;
  created_at: string;
}

interface Subscription {
  id: string;
  contact: {
    full_name: string;
    email: string;
  };
  plan: {
    plan_name: string;
    plan_type: string;
  } | null;
  status: string;
  start_date: string;
  next_billing_date: string | null;
  trial_source?: 'vip_trial'|'test_and_tune_legacy';
  trial_end_date: string | null;
  trial_started_date: string | null;
  notes: string | null;
}

interface AbandonedSignup {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  selected_plan_id: string | null;
  current_step: string;
  status: string;
  last_activity_at: string;
  created_at: string;
  recurring_plans?: {
    plan_name: string;
    amount: number;
  };
}

export function VIPPlanManagement() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [loadErrors, setLoadErrors] = useState<Record<string, string>>({});
  const [savingPlan, setSavingPlan] = useState(false);
  const [busySubscription, setBusySubscription] = useState<string | null>(null);
  const [extendTrial, setExtendTrial] = useState<Subscription | null>(null);
  const [extensionDays, setExtensionDays] = useState(30);
  const inviteSearchVersion = useRef(0);
  const [searchingContacts, setSearchingContacts] = useState(false);
  const [memberStatus, setMemberStatus] = useState('active');
  const matches = (...values: (string | null | undefined)[]) => values.some(value => value?.toLowerCase().includes(search.trim().toLowerCase()));
  const dateLabel = (value: string) => new Date(value.slice(0, 10) + 'T12:00:00').toLocaleDateString();
  const recordLoadError = useCallback((section: string, failed: boolean) => {
    setLoadErrors(previous => {
      const next = { ...previous };
      if (failed) next[section] = `Could not load ${section}. Refresh to try again.`;
      else delete next[section];
      return next;
    });
  }, []);


  const [plans, setPlans] = useState<VIPPlan[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [abandonedSignups, setAbandonedSignups] = useState<AbandonedSignup[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [editingPlan, setEditingPlan] = useState<VIPPlan | null>(null);
  const [selectedTab, setSelectedTab] = useState<'plans' | 'subscriptions' | 'trials' | 'pending' | 'abandoned'>('subscriptions');

  const [confirmDeleteSignupId, setConfirmDeleteSignupId] = useState<string | null>(null);
  const [confirmActivateSubId, setConfirmActivateSubId] = useState<string | null>(null);
  const [showVIPInviteModal, setShowVIPInviteModal] = useState(false);
  const [vipInviteSearch, setVipInviteSearch] = useState('');
  const [vipInviteSearchResults, setVipInviteSearchResults] = useState<InviteContact[]>([]);
  const [vipInviteContact, setVipInviteContact] = useState<InviteContact | null>(null);
  const [vipInviteEmail, setVipInviteEmail] = useState('');
  const [sendingVIPInvite, setSendingVIPInvite] = useState(false);
  const [vipInviteSuccess, setVipInviteSuccess] = useState(false);

  const [formData, setFormData] = useState({
    plan_name: '',
    description: '',
    billing_frequency: 'monthly',
    amount: 0,
    tax_rate: 0,
    plan_type: 'vip_plan' as const,
    is_active: true,
    show_on_portal: true,
  });

  const loadPlans = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('recurring_plans')
        .select('*')
        .eq('plan_type', 'vip_plan')
        .order('plan_name');

      if (error) throw error;
      setPlans(data || []);
      recordLoadError('plans', false);
    } catch (error) {
      console.error('Error loading plans:', error);
      recordLoadError('plans', true);
    }
  }, [recordLoadError]);

  const loadSubscriptions = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('recurring_subscriptions')
        .select(`
          id,
          status,
          start_date,
          next_billing_date,
          trial_source,
          trial_end_date,
          trial_started_date,
          notes,
          contact:contacts!inner(full_name, email),
          plan:recurring_plans(plan_name, plan_type)
        `)
        .order('start_date', { ascending: false });

      if (error) throw error;
      // Promotional VIP trials intentionally have no plan; other recurring products do not belong here.
      setSubscriptions((data || []).filter((sub: Subscription) => sub.plan?.plan_type === 'vip_plan' || (sub.status === 'trial' && !sub.plan)));
      recordLoadError('memberships', false);
    } catch (error) {
      console.error('Error loading subscriptions:', error);
      recordLoadError('memberships', true);
    }
  }, [recordLoadError]);

  const loadAbandonedSignups = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('signup_attempts')
        .select(`
          *,
          recurring_plans (
            plan_name,
            amount
          )
        `)
        .neq('status', 'completed')
        .order('last_activity_at', { ascending: false });

      if (error) throw error;
      setAbandonedSignups(data || []);
      recordLoadError('incomplete signups', false);
    } catch (error) {
      console.error('Error loading abandoned signups:', error);
      recordLoadError('incomplete signups', true);
    }
  }, [recordLoadError]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadPlans(), loadSubscriptions(), loadAbandonedSignups()]);
    setLoading(false);
  }, [loadPlans, loadSubscriptions, loadAbandonedSignups]);
  useEffect(() => { void refreshAll(); }, [refreshAll]);

  async function searchContactsForVIPInvite(query: string) {
    const version = ++inviteSearchVersion.current;
    const term = query.trim().replace(/[,%()]/g, ' ');
    if (term.length < 2) {
      setVipInviteSearchResults([]);
      setSearchingContacts(false);
      return;
    }
    setSearchingContacts(true);
    const { data, error } = await supabase.from('contacts')
      .select('id, full_name, email, phone')
      .or(`full_name.ilike.%${term}%,email.ilike.%${term}%`).limit(8);
    if (version !== inviteSearchVersion.current) return;
    setSearchingContacts(false);
    setVipInviteSearchResults(data || []);
    if (error) toast.error('Could not search contacts. Try again.');
  }

  async function handleSendVIPInvite() {
    if (!vipInviteContact || !vipInviteEmail.trim() || !vipInviteEmail.includes('@')) return;
    setSendingVIPInvite(true);
    try {
      const result = await supabase.functions.invoke('send-punchlist-invite', {
        body: {
          contact_email: vipInviteEmail.trim(),
          contact_name: vipInviteContact.full_name,
          access_type: 'vip_signup',
        }
      });
      if (result.error) throw new Error(result.error.message);
      if (result.data?.error) throw new Error(result.data.error);
      setVipInviteSuccess(true);

    } catch (err: unknown) {
      toast.error(`Failed to send invite: ${err instanceof Error ? err.message : 'Please try again.'}`);
    } finally {
      setSendingVIPInvite(false);
    }
  }

  function resetVIPInviteModal() {
    ++inviteSearchVersion.current;
    setSearchingContacts(false);
    setShowVIPInviteModal(false);
    setVipInviteSearch('');
    setVipInviteSearchResults([]);
    setVipInviteContact(null);
    setVipInviteEmail('');
    setVipInviteSuccess(false);
  }

  async function handleSavePlan() {
    if (savingPlan) return;
    if (!formData.plan_name.trim() || !Number.isFinite(formData.amount) || formData.amount <= 0 || formData.tax_rate < 0 || formData.tax_rate > 1) {
      toast.error('Enter a plan name, a price greater than zero, and a tax rate between 0 and 100%.');
      return;
    }
    setSavingPlan(true);
    try {
      if (editingPlan) {
        const { error } = await supabase
          .from('recurring_plans')
          .update({
            plan_name: formData.plan_name.trim(),
            description: formData.description,
            billing_frequency: formData.billing_frequency,
            amount: formData.amount,
            tax_rate: formData.tax_rate,
            plan_type: formData.plan_type,
            is_active: formData.is_active,
            show_on_portal: formData.show_on_portal,
          })
          .eq('id', editingPlan.id);

        if (error) throw error;
        toast.success('Plan updated.');
      } else {
        const { error } = await supabase.from('recurring_plans').insert({
          plan_name: formData.plan_name.trim(),
          description: formData.description,
          billing_frequency: formData.billing_frequency,
          amount: formData.amount,
          tax_rate: formData.tax_rate,
          plan_type: formData.plan_type,
          is_active: formData.is_active,
          show_on_portal: formData.show_on_portal,
        });

        if (error) throw error;
        toast.success('Plan created.');
      }

      resetForm();
      loadPlans();
      loadSubscriptions();
    } catch (error) {
      console.error('Error saving plan:', error);
      toast.error('Failed to save plan. Your changes are still in the form.');
    } finally {
      setSavingPlan(false);
    }
  }

  function handleEditPlan(plan: VIPPlan) {
    setEditingPlan(plan);
    setFormData({
      plan_name: plan.plan_name,
      description: plan.description || '',
      billing_frequency: plan.billing_frequency,
      amount: plan.amount,
      tax_rate: plan.tax_rate,
      plan_type: 'vip_plan' as const,
      is_active: plan.is_active,
      show_on_portal: plan.show_on_portal,
    });
    setIsCreating(true);
  }

  async function handleDeleteSignup(signupId: string) {
    const { error } = await supabase.from('signup_attempts').delete().eq('id', signupId);
    if (error) { toast.error('Could not delete the signup attempt.'); return; }
    toast.success('Signup attempt deleted.');
    void loadAbandonedSignups();
  }

  async function handleActivateSubscription(subId: string) {
    const sub = subscriptions.find(s => s.id === subId);
    if (!sub || busySubscription) return;
    setBusySubscription(subId);
    try {
      const { error } = await supabase
        .from('recurring_subscriptions')
        .update({
          status: 'active',
          notes: (sub.notes || '') + '\n\nActivated by admin after payment received on ' + new Date().toISOString()
        })
        .eq('id', subId);
      if (error) throw error;
      toast.success('VIP membership activated.');
      loadSubscriptions();
    } catch (error: unknown) {
      console.error('Error activating subscription:', error);
      toast.error(`Failed to activate: ${error instanceof Error ? error.message : 'Please try again.'}`);
    } finally {
      setBusySubscription(null);
    }
  }

  async function handleExtendTrial() {
    if (!extendTrial?.trial_end_date || busySubscription) return;
    if (!Number.isInteger(extensionDays) || extensionDays < 1 || extensionDays > 365) {
      toast.error('Enter a whole number from 1 to 365 days.'); return;
    }
    setBusySubscription(extendTrial.id);
    const newEnd = new Date(extendTrial.trial_end_date.slice(0, 10) + 'T12:00:00Z');
    newEnd.setUTCDate(newEnd.getUTCDate() + extensionDays);
    try {
      const { error } = await supabase.from('recurring_subscriptions').update({ trial_end_date: newEnd.toISOString().slice(0, 10) }).eq('id', extendTrial.id);
      if (error) throw error;
      toast.success(`Trial extended to ${dateLabel(newEnd.toISOString())}.`);
      setExtendTrial(null);
      await loadSubscriptions();
    } catch { toast.error('Could not extend this trial. Try again.'); }
    finally { setBusySubscription(null); }
  }

  function resetForm() {
    setIsCreating(false);
    setEditingPlan(null);
    setFormData({
      plan_name: '',
      description: '',
      billing_frequency: 'monthly',
      amount: 0,
      tax_rate: 0,
      plan_type: 'vip_plan' as const,
      is_active: true,
      show_on_portal: true,
    });
  }

  const tabs = [
    { id: 'subscriptions', label: 'Members', count: subscriptions.filter(s => !['trial', 'pending_payment'].includes(s.status)).length },
    { id: 'trials', label: 'Trials', count: subscriptions.filter(s => s.status === 'trial').length },
    { id: 'pending', label: 'Awaiting payment', count: subscriptions.filter(s => s.status === 'pending_payment').length },
    { id: 'abandoned', label: 'Incomplete signups', count: abandonedSignups.length },
    { id: 'plans', label: 'Plan setup', count: plans.length },
  ] as const;
  const descriptions = {
    subscriptions: 'Review customer memberships and their next billing dates.',
    trials: 'Review trial dates and follow up before access ends. Test & Tune dates are managed on the project.',
    pending: 'Verify payment has been received before activating a membership.',
    abandoned: 'Follow up with customers who started signup but have not finished.',
    plans: 'Set pricing, billing frequency, and which plans customers can choose on the membership page.',
  };
  const visibleSubscriptions = subscriptions.filter(sub => matches(sub.contact.full_name, sub.contact.email, sub.plan?.plan_name));
  const visibleSignups = abandonedSignups.filter(signup => matches(`${signup.first_name} ${signup.last_name}`, signup.email, signup.phone, signup.recurring_plans?.plan_name));
  const visiblePlans = plans.filter(plan => matches(plan.plan_name, plan.description));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-primary flex items-center gap-2"><Star className="w-6 h-6 text-warning" />VIP Memberships</h2>
          <p className="text-secondary mt-1 text-sm">Customers, trials, signup follow-ups, and plan setup.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => void refreshAll()} disabled={loading} className="p-2.5 rounded-lg border border-subtle text-secondary hover:bg-surface" aria-label="Refresh VIP memberships"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
          <button onClick={() => setShowVIPInviteModal(true)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 font-medium"><Send className="w-4 h-4" />Invite customer</button>
          {selectedTab === 'plans' && <button onClick={() => { resetForm(); setIsCreating(true); }} className="px-4 py-2 border border-subtle text-primary hover:bg-surface rounded-lg flex items-center gap-2"><Plus className="w-4 h-4" />New plan</button>}
        </div>
      </div>
      {Object.values(loadErrors).length > 0 && <div role="alert" className="p-3 bg-dangerSoft text-danger rounded-lg">{Object.values(loadErrors).map(message => <p key={message}>{message}</p>)}</div>}
      <div className="bg-canvas border border-subtle rounded-xl overflow-hidden">
        <nav aria-label="VIP membership sections" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1 p-2 border-b border-subtle">
          {tabs.map(tab => <button key={tab.id} aria-pressed={selectedTab === tab.id} onClick={() => { setSelectedTab(tab.id); setSearch(''); }} className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm font-medium ${selectedTab === tab.id ? 'bg-infoSoft text-info' : 'text-secondary hover:bg-surface'}`}><span>{tab.label}</span><span className="text-xs tabular-nums rounded-full px-2 py-0.5 bg-surface text-primary">{loading ? '…' : tab.count}</span></button>)}
        </nav>
        <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <p className="text-sm text-secondary max-w-xl">{descriptions[selectedTab]}</p>
          <div className="flex flex-col sm:flex-row gap-2">
            {selectedTab === 'subscriptions' && <select aria-label="Membership status" value={memberStatus} onChange={e => setMemberStatus(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 text-sm"><option value="active">Active</option><option value="all">All statuses</option>{Array.from(new Set(subscriptions.filter(s => !['active', 'trial', 'pending_payment'].includes(s.status)).map(s => s.status))).map(status => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select>}
            <div className="relative"><Search className="absolute left-3 top-3 w-4 h-4 text-secondary" /><input aria-label="Search VIP section" value={search} onChange={e => setSearch(e.target.value)} placeholder={selectedTab === 'plans' ? 'Search plans…' : 'Search customers…'} className="w-full sm:w-56 pl-9 pr-3 py-2 text-base sm:text-sm bg-white text-gray-900 border border-gray-300 rounded-lg text-sm" /></div>
          </div>
        </div>
      </div>
      <details className="text-sm text-secondary">
        <summary className="cursor-pointer text-brand font-medium">How VIP membership works</summary>
        <p className="mt-2 max-w-3xl">Invite a customer → they choose a plan and complete payment → review their membership. Promotional VIP trials have their own dates. The project’s 90-day Test &amp; Tune period is managed separately. An invitation does not activate a paid membership.</p>
      </details>
      {loading ? <div role="status" className="py-12 text-center text-secondary">Loading VIP memberships…</div> : <>
      {selectedTab === 'abandoned' && (
        <div className="space-y-4">
          {visibleSignups.map(signup => {
            const hoursSinceActivity = Math.floor(
              (new Date().getTime() - new Date(signup.last_activity_at).getTime()) / (1000 * 60 * 60)
            );
            const isRecent = hoursSinceActivity < 24;
            const fullName = `${signup.first_name} ${signup.last_name}`.trim();

            const getStepLabel = (step: string) => {
              const labels: Record<string, string> = {
                info: 'Contact Information',
                plan: 'Plan Selection',
                payment: 'Payment'
              };
              return labels[step] || step;
            };

            const getStepMessage = (step: string) => {
              const messages: Record<string, string> = {
                info: 'Started signup - needs to enter contact information',
                plan: 'Entered info but did not select a plan',
                payment: 'Selected a plan but did not complete payment'
              };
              return messages[step] || 'Started signup but did not complete';
            };

            return (
              <div
                key={signup.id}
                className={`bg-canvas border rounded-lg p-4 ${
                  isRecent ? 'border-orange-600' : 'border-subtle'
                }`}
              >
                <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <h3 className="text-lg font-semibold text-primary">
                        {fullName || 'No name provided'}
                      </h3>
                      {isRecent && (
                        <span className="px-2 py-0.5 bg-warningSoft text-warning text-xs rounded">
                          Recent
                        </span>
                      )}
                      <span className={`px-2 py-0.5 text-xs rounded ${
                        signup.status === 'in_progress'
                          ? 'bg-infoSoft text-info'
                          : 'bg-surface text-secondary'
                      }`}>
                        {signup.status === 'in_progress' ? 'In Progress' : 'Abandoned'}
                      </span>
                      <span className="px-2 py-0.5 bg-infoSoft text-info text-xs rounded">
                        {getStepLabel(signup.current_step)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-secondary mb-2">
                      <span className="flex items-center gap-1">
                        <Mail className="w-4 h-4" />
                        {signup.email}
                      </span>
                      {signup.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-4 h-4" />
                          {signup.phone}
                        </span>
                      )}
                      {signup.recurring_plans && (
                        <span className="flex items-center gap-1 text-success">
                          <Check className="w-4 h-4" />
                          Selected: {signup.recurring_plans.plan_name}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {hoursSinceActivity < 1
                          ? 'Less than 1 hour ago'
                          : hoursSinceActivity < 24
                          ? `${hoursSinceActivity} hour${hoursSinceActivity > 1 ? 's' : ''} ago`
                          : `${Math.floor(hoursSinceActivity / 24)} day${Math.floor(hoursSinceActivity / 24) > 1 ? 's' : ''} ago`}
                      </span>
                    </div>
                    <div className="text-xs text-warning bg-warningSoft border border-orange-700 rounded px-2 py-1 inline-block">
                      {getStepMessage(signup.current_step)}
                    </div>
                  </div>
                  <div className="flex flex-wrap sm:flex-col items-start sm:items-end gap-2">
                    <button
                      onClick={() => setConfirmDeleteSignupId(signup.id)}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
                    >
                      Delete
                    </button>
                    <a
                      href={`mailto:${encodeURIComponent(signup.email)}?subject=${encodeURIComponent('Complete your VIP membership')}&body=${encodeURIComponent(`Hi ${fullName || 'there'},\n\nYou can finish your VIP membership signup here: ${window.location.origin}/vip-membership`)}`}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm flex items-center gap-1"
                    >
                      <Mail className="w-3 h-3" />
                      Draft follow-up
                    </a>
                  </div>
                </div>
              </div>
            );
          })}

          {visibleSignups.length === 0 && (
            <div className="text-center py-12 text-secondary">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{search ? 'No signups match your search' : 'No incomplete signups'}</p>
            </div>
          )}
        </div>
      )}

      {selectedTab === 'pending' && (
        <div className="space-y-4">
          {visibleSubscriptions
            .filter(sub => sub.status === 'pending_payment')
            .map(sub => (
              <div
                key={sub.id}
                className="bg-canvas border border-yellow-600 rounded-lg p-4"
              >
                <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-primary mb-1">
                      {sub.contact.full_name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-secondary mb-2">
                      <span>{sub.contact.email}</span>
                      {sub.plan && (
                        <span className="flex items-center gap-1">
                          <Star className="w-4 h-4 text-warning" />
                          {sub.plan.plan_name}
                        </span>
                      )}
                      <span>Requested: {dateLabel(sub.start_date)}</span>
                    </div>
                    <div className="text-xs text-warning bg-warningSoft border border-yellow-700 rounded px-2 py-1 inline-block">
                      Self-service signup - payment required before activation
                    </div>
                  </div>
                  <div className="flex flex-wrap sm:flex-col items-start sm:items-end gap-2">
                    <span className="px-3 py-1 bg-warningSoft text-warning rounded text-sm font-medium">
                      Awaiting Payment
                    </span>
                    <button
                      disabled={busySubscription !== null}
                      onClick={() => setConfirmActivateSubId(sub.id)}
                      className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      Confirm payment & activate
                    </button>
                  </div>
                </div>
              </div>
            ))}

          {visibleSubscriptions.filter(sub => sub.status === 'pending_payment').length === 0 && (
            <div className="text-center py-12 text-secondary">
              <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{search ? 'No customers match your search' : 'No memberships awaiting payment'}</p>
              <p className="text-sm mt-2">Self-service signups will appear here</p>
            </div>
          )}
        </div>
      )}

      {selectedTab === 'trials' && (
        <div className="space-y-4">
          {visibleSubscriptions
            .filter(sub => sub.status === 'trial')
            .map(sub => {
              const trialEndsIn = sub.trial_end_date
                ? Math.ceil((new Date(sub.trial_end_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                : null;
              const isExpiringSoon = trialEndsIn !== null && trialEndsIn <= 7;

              return (
                <div
                  key={sub.id}
                  className={`bg-canvas border rounded-lg p-4 ${
                    isExpiringSoon ? 'border-yellow-600' : 'border-subtle'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-primary mb-1">
                        {sub.contact.full_name}
                      </h3>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-secondary">
                        <span>{sub.contact.email}</span>
                        {sub.trial_started_date && (
                          <span>Started: {dateLabel(sub.trial_started_date)}</span>
                        )}
                        {sub.trial_end_date && (
                          <span className={isExpiringSoon ? 'text-warning font-medium' : ''}>
                            Ends: {dateLabel(sub.trial_end_date)}
                            {trialEndsIn !== null && (
                              <span className="ml-1">({trialEndsIn < 0 ? 'Expired' : `${trialEndsIn} days left`})</span>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap sm:flex-col items-start sm:items-end gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 bg-infoSoft text-info rounded text-sm font-medium">
                          {sub.trial_source==='test_and_tune_legacy'?'Legacy Test & Tune record':'VIP Trial'}
                        </span>
                        <CheckCircle2 className="w-5 h-5 text-success" aria-label="Trial record" />
                      </div>
                      <button
                        disabled={sub.trial_source === 'test_and_tune_legacy' || !sub.trial_end_date || busySubscription !== null}
                        onClick={() => { setExtendTrial(sub); setExtensionDays(30); }}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm flex items-center gap-1"
                      >
                        <Calendar className="w-3 h-3" />
                        Extend Trial
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

          {visibleSubscriptions.filter(sub => sub.status === 'trial').length === 0 && (
            <div className="text-center py-12 text-secondary">
              <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{search ? 'No trials match your search' : 'No customers currently on trial'}</p>
            </div>
          )}
        </div>
      )}

      {selectedTab === 'subscriptions' && (
        <div className="space-y-4">
          {visibleSubscriptions
            .filter(sub => !['trial', 'pending_payment'].includes(sub.status) && (memberStatus === 'all' || sub.status === memberStatus))
            .map(sub => (
              <div
                key={sub.id}
                className="bg-canvas border border-subtle rounded-lg p-4 flex flex-col sm:flex-row gap-3 sm:items-center justify-between"
              >
                <div>
                  <h3 className="text-lg font-semibold text-primary mb-1">
                    {sub.contact.full_name}
                  </h3>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-secondary">
                    <span>{sub.contact.email}</span>
                    {sub.plan && (
                      <span className="flex items-center gap-1">
                        <Star className="w-4 h-4 text-warning" />
                        {sub.plan.plan_name}
                      </span>
                    )}
                    {sub.next_billing_date && (
                      <span>Next billing: {dateLabel(sub.next_billing_date)}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded text-sm font-medium ${sub.status === 'active' ? 'bg-successSoft text-success' : 'bg-surface text-secondary'}`}>
                    {sub.status.replaceAll('_', ' ')}
                  </span>
                  {sub.status === 'active' && sub.plan?.plan_type === 'vip_plan' && (
                    <CheckCircle2 className="w-5 h-5 text-success" aria-label="VIP Portal Access" />
                  )}
                </div>
              </div>
            ))}

          {subscriptions.filter(sub => !['trial', 'pending_payment'].includes(sub.status) && (memberStatus === 'all' || sub.status === memberStatus)).length === 0 && (
            <div className="text-center py-12 text-secondary">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No memberships match this status or search.</p>
            </div>
          )}
        </div>
      )}

      {selectedTab === 'plans' && (
        <>
          {isCreating && (
            <QuickActionModal title={editingPlan ? 'Edit VIP plan' : 'New VIP plan'} subtitle="1. Name & benefits · 2. Pricing · 3. Availability" icon={<Star className="w-5 h-5" />} onClose={() => { if (!savingPlan) resetForm(); }}>
            <form onSubmit={e => { e.preventDefault(); void handleSavePlan(); }} className="p-5 sm:p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-secondary mb-2">
                    Plan Name *
                  </label>
                  <input
                    aria-label="Plan name"
                    type="text"
                    value={formData.plan_name}
                    onChange={e => setFormData({ ...formData, plan_name: e.target.value })}
                    placeholder="e.g., VIP Gold, VIP Platinum"
                    className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-secondary mb-2">
                    Description
                  </label>
                  <textarea
                    aria-label="Plan description"
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Plan features and benefits"
                    rows={3}
                    className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-secondary mb-2">
                      Billing Frequency *
                    </label>
                    <select
                      aria-label="Billing frequency"
                    value={formData.billing_frequency}
                      onChange={e =>
                        setFormData({ ...formData, billing_frequency: e.target.value })
                      }
                      className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900"
                    >
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-secondary mb-2">
                      Amount *
                    </label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-secondary" />
                      <input
                        aria-label="Plan amount"
                    type="number"
                        step="0.01" min="0.01" required
                        value={formData.amount}
                        onChange={e =>
                          setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full pl-10 pr-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-secondary mb-2">
                    Tax Rate (%)
                  </label>
                  <input
                    aria-label="Tax rate"
                    type="number"
                    step="0.01" min="0" max="100" required
                    value={formData.tax_rate * 100}
                    onChange={e =>
                      setFormData({ ...formData, tax_rate: parseFloat(e.target.value) / 100 || 0 })
                    }
                    className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900"
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                      className="w-5 h-5 rounded border-strong text-blue-600"
                    />
                    <span className="font-medium text-primary">Plan Active</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.show_on_portal}
                      onChange={e => setFormData({ ...formData, show_on_portal: e.target.checked })}
                      className="w-5 h-5 rounded border-strong text-blue-600"
                    />
                    <div>
                      <div className="font-medium text-primary">Show on Portal</div>
                      <div className="text-sm text-secondary">
                        Display this plan on the public membership page
                      </div>
                    </div>
                  </label>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    disabled={savingPlan || !formData.plan_name.trim()}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    {savingPlan ? 'Saving…' : editingPlan ? 'Save changes' : 'Create plan'}
                  </button>
                  <button
                    type="button" disabled={savingPlan} onClick={resetForm}
                    className="px-4 py-2 bg-surface hover:bg-elevated text-primary rounded-lg"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </form>
            </QuickActionModal>
          )}

          <div className="grid gap-4">
            {visiblePlans.map(plan => (
              <div
                key={plan.id}
                className="bg-canvas border border-subtle rounded-lg p-6 hover:border-strong transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <h3 className="text-xl font-bold text-primary">{plan.plan_name}</h3>
                      {plan.show_on_portal && (
                        <span className="px-2 py-1 bg-infoSoft text-info text-xs rounded">
                          Visible on Portal
                        </span>
                      )}
                      {!plan.is_active && (
                        <span className="px-2 py-1 bg-dangerSoft text-danger text-xs rounded">
                          Inactive
                        </span>
                      )}
                    </div>
                    {plan.description && (
                      <p className="text-secondary mb-3">{plan.description}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-4 text-sm text-secondary">
                      <span className="flex items-center gap-1">
                        <DollarSign className="w-4 h-4" />
                        ${plan.amount.toFixed(2)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {plan.billing_frequency}
                      </span>
                      {plan.tax_rate > 0 && (
                        <span>Tax: {(plan.tax_rate * 100).toFixed(2)}%</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleEditPlan(plan)}
                    className="px-3 py-2 bg-surface hover:bg-elevated text-primary rounded-lg flex items-center gap-2"
                  >
                    <Edit2 className="w-4 h-4" />
                    Edit
                  </button>
                </div>
              </div>
            ))}

            {visiblePlans.length === 0 && !isCreating && (
              <div className="text-center py-12 text-secondary">
                <Star className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="mb-4">{search ? 'No plans match your search' : 'No VIP plans created yet'}</p>
                <button
                  onClick={() => setIsCreating(true)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg inline-flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Create Your First Plan
                </button>
              </div>
            )}
          </div>
        </>
      )}

      </>}
      {extendTrial && <QuickActionModal title="Extend VIP trial" icon={<Calendar className="w-5 h-5" />} onClose={() => { if (!busySubscription) setExtendTrial(null); }}>
        <form onSubmit={e => { e.preventDefault(); void handleExtendTrial(); }} className="p-5 space-y-4">
          <p className="text-secondary text-sm">{extendTrial.contact.full_name} · Current end date: {dateLabel(extendTrial.trial_end_date!)}</p>
          <label className="block text-primary text-sm">Days to add<input type="number" min="1" max="365" step="1" required value={extensionDays} onChange={e => setExtensionDays(Number(e.target.value))} className="block mt-2 w-full bg-white text-gray-900 border border-gray-300 rounded-lg px-3 py-2" /></label>
          <p className="text-secondary text-sm">Days are added to the existing end date. An expired trial may need a longer extension to restore access.</p>
          <div className="flex gap-2"><button type="submit" disabled={busySubscription !== null} className="px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-50">{busySubscription ? 'Saving…' : 'Extend trial'}</button><button type="button" disabled={busySubscription !== null} onClick={() => setExtendTrial(null)} className="px-4 py-2 rounded-lg border border-subtle text-primary">Cancel</button></div>
        </form>
      </QuickActionModal>}
      {showVIPInviteModal && (
        <QuickActionModal title="Invite customer to VIP" subtitle={vipInviteContact ? '2. Review email & send invitation' : '1. Choose a customer'} icon={<Send className="w-5 h-5" />} onClose={() => { if (!sendingVIPInvite) resetVIPInviteModal(); }}>
            {vipInviteSuccess ? (
              <div className="p-8 text-center">
                <div className="w-16 h-16 rounded-full bg-green-900/30 border border-green-600 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8 text-success" />
                </div>
                <h4 className="text-lg font-bold text-primary mb-1">Invite Sent!</h4>
                <p className="text-secondary text-sm">
                  VIP signup invitation sent to <span className="text-primary font-medium">{vipInviteContact?.full_name}</span>
                </p>
                <button onClick={resetVIPInviteModal} className="mt-4 px-4 py-2 rounded-lg bg-blue-600 text-white">Done</button>
              </div>
            ) : (
              <div className="p-5 space-y-4">
                {!vipInviteContact ? (
                  <div>
                    <label className="block text-sm font-medium text-secondary mb-2">
                      Search for a contact
                    </label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary" />
                      <input
                        type="text"
                        value={vipInviteSearch}
                        onChange={e => {
                          setVipInviteSearch(e.target.value);
                          searchContactsForVIPInvite(e.target.value);
                        }}
                        placeholder="Search by name or email..."
                        className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:border-yellow-500"
                        autoFocus
                      />
                    </div>
                    {vipInviteSearchResults.length > 0 && (
                      <div className="mt-2 bg-canvas border border-strong rounded-lg overflow-hidden">
                        {vipInviteSearchResults.map(contact => (
                          <button
                            key={contact.id}
                            onClick={() => {
                              setVipInviteContact(contact);
                              setVipInviteEmail(contact.email || '');
                              setVipInviteSearchResults([]);
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface transition-colors text-left border-b border-subtle last:border-0"
                          >
                            <div className="w-8 h-8 rounded-full bg-yellow-900/40 border border-yellow-700/50 flex items-center justify-center flex-shrink-0">
                              <span className="text-warning text-sm font-bold">
                                {contact.full_name?.charAt(0)?.toUpperCase() || '?'}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-primary truncate">{contact.full_name}</div>
                              {contact.email && (
                                <div className="text-xs text-secondary truncate">{contact.email}</div>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {searchingContacts && <p role="status" className="text-sm text-secondary mt-2">Searching contacts…</p>}
                    {!searchingContacts && vipInviteSearch.length >= 2 && vipInviteSearchResults.length === 0 && (
                      <p className="text-sm text-secondary mt-2 text-center py-2">No contacts found</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-3 bg-canvas rounded-lg border border-subtle">
                      <div className="w-10 h-10 rounded-full bg-yellow-900/40 border border-yellow-700/50 flex items-center justify-center flex-shrink-0">
                        <span className="text-warning font-bold">
                          {vipInviteContact.full_name?.charAt(0)?.toUpperCase() || '?'}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-primary">{vipInviteContact.full_name}</div>
                        {vipInviteContact.phone && (
                          <div className="text-xs text-secondary">{vipInviteContact.phone}</div>
                        )}
                      </div>
                      <button
                        disabled={sendingVIPInvite} aria-label="Choose a different customer"
                        onClick={() => {
                          setVipInviteContact(null);
                          setVipInviteEmail('');
                          setVipInviteSearch('');
                        }}
                        className="p-1.5 text-secondary hover:text-primary rounded hover:bg-surface"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-secondary mb-2">
                        Send invite to email
                      </label>
                      <input
                        aria-label="Invitation email"
                        type="email" disabled={sendingVIPInvite}
                        value={vipInviteEmail}
                        onChange={e => setVipInviteEmail(e.target.value)}
                        placeholder="customer@example.com"
                        className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:border-yellow-500"
                      />
                    </div>

                    <div className="bg-yellow-900/10 border border-yellow-700/40 rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <Star className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-warning/80">
                          This will send a VIP signup invitation email directing the customer to activate their portal membership subscription.
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-3 pt-1">
                      <button
                        onClick={handleSendVIPInvite}
                        disabled={sendingVIPInvite || !vipInviteEmail.trim() || !vipInviteEmail.includes('@')}
                        className="flex-1 px-4 py-2.5 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
                      >
                        {sendingVIPInvite ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Sending...
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4" />
                            Send Invite
                          </>
                        )}
                      </button>
                      <button
                        disabled={sendingVIPInvite} onClick={resetVIPInviteModal}
                        className="px-4 py-2.5 bg-surface hover:bg-elevated text-primary rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
        </QuickActionModal>
      )}

      <ConfirmModal
        isOpen={confirmDeleteSignupId !== null}
        title="Delete Signup Attempt"
        message="Delete this signup attempt?"
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => {
          if (confirmDeleteSignupId) {
            handleDeleteSignup(confirmDeleteSignupId);
          }
          setConfirmDeleteSignupId(null);
        }}
        onCancel={() => setConfirmDeleteSignupId(null)}
      />

      <ConfirmModal
        isOpen={confirmActivateSubId !== null}
        title="Activate Membership"
        message={`Confirm you have received payment from ${subscriptions.find(sub => sub.id === confirmActivateSubId)?.contact.full_name || 'this customer'}. This activates VIP access; it does not collect a payment.`}
        variant="neutral"
        confirmLabel="Activate Membership"
        onConfirm={() => {
          if (confirmActivateSubId) {
            handleActivateSubscription(confirmActivateSubId);
          }
          setConfirmActivateSubId(null);
        }}
        onCancel={() => setConfirmActivateSubId(null)}
      />
    </div>
  );
}
