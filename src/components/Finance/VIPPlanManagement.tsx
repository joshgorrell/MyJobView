import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Star, Plus, CreditCard as Edit2, Save, X, DollarSign, Calendar, CheckCircle2, Users, Check, AlertCircle, Mail, Phone, Clock, Send, Search } from 'lucide-react';
import ConfirmModal from '../ui/ConfirmModal';

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
  const [plans, setPlans] = useState<VIPPlan[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [abandonedSignups, setAbandonedSignups] = useState<AbandonedSignup[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [editingPlan, setEditingPlan] = useState<VIPPlan | null>(null);
  const [selectedTab, setSelectedTab] = useState<'plans' | 'subscriptions' | 'trials' | 'pending' | 'abandoned'>('abandoned');

  const [confirmDeleteSignupId, setConfirmDeleteSignupId] = useState<string | null>(null);
  const [confirmActivateSubId, setConfirmActivateSubId] = useState<string | null>(null);
  const [showVIPInviteModal, setShowVIPInviteModal] = useState(false);
  const [vipInviteSearch, setVipInviteSearch] = useState('');
  const [vipInviteSearchResults, setVipInviteSearchResults] = useState<any[]>([]);
  const [vipInviteContact, setVipInviteContact] = useState<any>(null);
  const [vipInviteEmail, setVipInviteEmail] = useState('');
  const [sendingVIPInvite, setSendingVIPInvite] = useState(false);
  const [vipInviteSuccess, setVipInviteSuccess] = useState(false);

  const [formData, setFormData] = useState({
    plan_name: '',
    description: '',
    billing_frequency: 'monthly',
    amount: 0,
    tax_rate: 0,
    plan_type: 'vip_plan' as 'vip_plan',
    is_active: true,
    show_on_portal: true,
  });

  useEffect(() => {
    loadPlans();
    loadSubscriptions();
    loadAbandonedSignups();
  }, []);

  async function loadPlans() {
    try {
      const { data, error } = await supabase
        .from('recurring_plans')
        .select('*')
        .order('plan_name');

      if (error) throw error;
      setPlans(data || []);
    } catch (error) {
      console.error('Error loading plans:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadSubscriptions() {
    try {
      const { data, error } = await supabase
        .from('recurring_subscriptions')
        .select(`
          id,
          status,
          start_date,
          next_billing_date,
          trial_end_date,
          trial_started_date,
          notes,
          contact:contacts!inner(full_name, email),
          plan:recurring_plans(plan_name, plan_type)
        `)
        .or('plan.plan_type.eq.vip_plan,status.eq.trial,status.eq.pending_payment')
        .order('start_date', { ascending: false });

      if (error) throw error;
      setSubscriptions(data || []);
    } catch (error) {
      console.error('Error loading subscriptions:', error);
    }
  }

  async function loadAbandonedSignups() {
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
    } catch (error) {
      console.error('Error loading abandoned signups:', error);
    }
  }

  async function searchContactsForVIPInvite(query: string) {
    if (!query.trim() || query.trim().length < 2) {
      setVipInviteSearchResults([]);
      return;
    }
    const { data } = await supabase
      .from('contacts')
      .select('id, full_name, email, phone')
      .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
      .limit(8);
    setVipInviteSearchResults(data || []);
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
      setTimeout(() => {
        setVipInviteSuccess(false);
        resetVIPInviteModal();
      }, 2500);
    } catch (err: any) {
      alert(`Failed to send invite: ${err.message}`);
    } finally {
      setSendingVIPInvite(false);
    }
  }

  function resetVIPInviteModal() {
    setShowVIPInviteModal(false);
    setVipInviteSearch('');
    setVipInviteSearchResults([]);
    setVipInviteContact(null);
    setVipInviteEmail('');
    setVipInviteSuccess(false);
  }

  async function handleSavePlan() {
    try {
      if (editingPlan) {
        const { error } = await supabase
          .from('recurring_plans')
          .update({
            plan_name: formData.plan_name,
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
        alert('Plan updated successfully!');
      } else {
        const { error } = await supabase.from('recurring_plans').insert({
          plan_name: formData.plan_name,
          description: formData.description,
          billing_frequency: formData.billing_frequency,
          amount: formData.amount,
          tax_rate: formData.tax_rate,
          plan_type: formData.plan_type,
          is_active: formData.is_active,
          show_on_portal: formData.show_on_portal,
        });

        if (error) throw error;
        alert('Plan created successfully!');
      }

      resetForm();
      loadPlans();
      loadSubscriptions();
    } catch (error) {
      console.error('Error saving plan:', error);
      alert('Failed to save plan');
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
      plan_type: 'vip_plan' as 'vip_plan',
      is_active: plan.is_active,
      show_on_portal: plan.show_on_portal,
    });
    setIsCreating(true);
  }

  async function handleDeleteSignup(signupId: string) {
    await supabase.from('signup_attempts').delete().eq('id', signupId);
    loadAbandonedSignups();
  }

  async function handleActivateSubscription(subId: string) {
    const sub = subscriptions.find(s => s.id === subId);
    if (!sub) return;
    try {
      const { error } = await supabase
        .from('recurring_subscriptions')
        .update({
          status: 'active',
          notes: sub.notes + '\n\nActivated by admin after payment received on ' + new Date().toISOString()
        })
        .eq('id', subId);
      if (error) throw error;
      alert('VIP membership activated! Customer now has full portal access.');
      loadSubscriptions();
    } catch (error: any) {
      console.error('Error activating subscription:', error);
      alert(`Failed to activate: ${error.message}`);
    }
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
      plan_type: 'vip_plan' as 'vip_plan',
      is_active: true,
      show_on_portal: true,
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading VIP plans...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Star className="w-6 h-6 text-yellow-400" />
            VIP Plan Management
          </h2>
          <p className="text-gray-300 mt-1">
            Manage VIP membership plans and customer subscriptions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowVIPInviteModal(true)}
            className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg flex items-center gap-2 font-medium transition-colors"
          >
            <Send className="w-4 h-4" />
            Send VIP Invite
          </button>
          {!isCreating && selectedTab === 'plans' && (
            <button
              onClick={() => setIsCreating(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Create Plan
            </button>
          )}
        </div>
      </div>

      <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-200">
            <p className="font-medium mb-1">VIP Membership Access Rules</p>
            <ul className="space-y-1 mt-2">
              <li><strong>Trial Customers:</strong> Get free 90-day access (admin-initiated only via punchlist invites)</li>
              <li><strong>Pending Payment:</strong> Self-service signups that need payment before activation</li>
              <li><strong>Active Subscriptions:</strong> Paid members with full portal access</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="flex gap-2 border-b border-gray-700 overflow-x-auto">
        <button
          onClick={() => setSelectedTab('abandoned')}
          className={`px-4 py-2 font-medium transition-colors whitespace-nowrap ${
            selectedTab === 'abandoned'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          <AlertCircle className="w-4 h-4 inline mr-2" />
          Abandoned Signups ({abandonedSignups.length})
        </button>
        <button
          onClick={() => setSelectedTab('pending')}
          className={`px-4 py-2 font-medium transition-colors whitespace-nowrap ${
            selectedTab === 'pending'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          <DollarSign className="w-4 h-4 inline mr-2" />
          Pending Payment ({subscriptions.filter(s => s.status === 'pending_payment').length})
        </button>
        <button
          onClick={() => setSelectedTab('trials')}
          className={`px-4 py-2 font-medium transition-colors whitespace-nowrap ${
            selectedTab === 'trials'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          <Calendar className="w-4 h-4 inline mr-2" />
          Free Trials ({subscriptions.filter(s => s.status === 'trial').length})
        </button>
        <button
          onClick={() => setSelectedTab('subscriptions')}
          className={`px-4 py-2 font-medium transition-colors whitespace-nowrap ${
            selectedTab === 'subscriptions'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          <Users className="w-4 h-4 inline mr-2" />
          Active Paid ({subscriptions.filter(s => s.status === 'active').length})
        </button>
        <button
          onClick={() => setSelectedTab('plans')}
          className={`px-4 py-2 font-medium transition-colors whitespace-nowrap ${
            selectedTab === 'plans'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          <Star className="w-4 h-4 inline mr-2" />
          Plans
        </button>
      </div>

      {selectedTab === 'abandoned' && (
        <div className="space-y-4">
          {abandonedSignups.map(signup => {
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
                className={`bg-gray-800 border rounded-lg p-4 ${
                  isRecent ? 'border-orange-600' : 'border-gray-700'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-lg font-semibold text-white">
                        {fullName || 'No name provided'}
                      </h3>
                      {isRecent && (
                        <span className="px-2 py-0.5 bg-orange-900/50 text-orange-300 text-xs rounded">
                          Recent
                        </span>
                      )}
                      <span className={`px-2 py-0.5 text-xs rounded ${
                        signup.status === 'in_progress'
                          ? 'bg-blue-900/50 text-blue-300'
                          : 'bg-gray-700 text-gray-300'
                      }`}>
                        {signup.status === 'in_progress' ? 'In Progress' : 'Abandoned'}
                      </span>
                      <span className="px-2 py-0.5 bg-purple-900/50 text-purple-300 text-xs rounded">
                        {getStepLabel(signup.current_step)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400 mb-2">
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
                        <span className="flex items-center gap-1 text-green-400">
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
                    <div className="text-xs text-orange-400 bg-orange-900/20 border border-orange-700 rounded px-2 py-1 inline-block">
                      {getStepMessage(signup.current_step)}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <button
                      onClick={() => setConfirmDeleteSignupId(signup.id)}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
                    >
                      Delete
                    </button>
                    <a
                      href={`mailto:${signup.email}?subject=Complete Your VIP Membership&body=Hi ${fullName || 'there'},%0D%0A%0D%0AWe noticed you started signing up for our VIP membership but didn't complete the process. We'd love to have you as a member!%0D%0A%0D%0AClick here to finish your signup: [Portal URL]`}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm flex items-center gap-1"
                    >
                      <Mail className="w-3 h-3" />
                      Follow Up
                    </a>
                  </div>
                </div>
              </div>
            );
          })}

          {abandonedSignups.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No abandoned signups</p>
              <p className="text-sm mt-2">All customers who started signup have completed it</p>
            </div>
          )}
        </div>
      )}

      {selectedTab === 'pending' && (
        <div className="space-y-4">
          {subscriptions
            .filter(sub => sub.status === 'pending_payment')
            .map(sub => (
              <div
                key={sub.id}
                className="bg-gray-800 border border-yellow-600 rounded-lg p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-white mb-1">
                      {sub.contact.full_name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400 mb-2">
                      <span>{sub.contact.email}</span>
                      {sub.plan && (
                        <span className="flex items-center gap-1">
                          <Star className="w-4 h-4 text-yellow-400" />
                          {sub.plan.plan_name}
                        </span>
                      )}
                      <span>Requested: {new Date(sub.start_date).toLocaleDateString()}</span>
                    </div>
                    <div className="text-xs text-yellow-400 bg-yellow-900/20 border border-yellow-700 rounded px-2 py-1 inline-block">
                      Self-service signup - payment required before activation
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="px-3 py-1 bg-yellow-900/50 text-yellow-300 rounded text-sm font-medium">
                      Awaiting Payment
                    </span>
                    <button
                      onClick={() => setConfirmActivateSubId(sub.id)}
                      className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      Activate Membership
                    </button>
                  </div>
                </div>
              </div>
            ))}

          {subscriptions.filter(sub => sub.status === 'pending_payment').length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No pending payment requests</p>
              <p className="text-sm mt-2">Self-service signups will appear here</p>
            </div>
          )}
        </div>
      )}

      {selectedTab === 'trials' && (
        <div className="space-y-4">
          {subscriptions
            .filter(sub => sub.status === 'trial')
            .map(sub => {
              const trialEndsIn = sub.trial_end_date
                ? Math.ceil((new Date(sub.trial_end_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                : null;
              const isExpiringSoon = trialEndsIn !== null && trialEndsIn <= 7;

              return (
                <div
                  key={sub.id}
                  className={`bg-gray-800 border rounded-lg p-4 ${
                    isExpiringSoon ? 'border-yellow-600' : 'border-gray-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-white mb-1">
                        {sub.contact.full_name}
                      </h3>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400">
                        <span>{sub.contact.email}</span>
                        {sub.trial_started_date && (
                          <span>Started: {new Date(sub.trial_started_date).toLocaleDateString()}</span>
                        )}
                        {sub.trial_end_date && (
                          <span className={isExpiringSoon ? 'text-yellow-400 font-medium' : ''}>
                            Ends: {new Date(sub.trial_end_date).toLocaleDateString()}
                            {trialEndsIn !== null && trialEndsIn >= 0 && (
                              <span className="ml-1">({trialEndsIn} days left)</span>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 bg-blue-900/50 text-blue-300 rounded text-sm font-medium">
                          Trial Access
                        </span>
                        <CheckCircle2 className="w-5 h-5 text-green-400" title="Punchlist & Messages" />
                      </div>
                      <button
                        onClick={async () => {
                          const daysToAdd = prompt('How many days would you like to extend the trial?', '30');
                          if (!daysToAdd) return;

                          const days = parseInt(daysToAdd);
                          if (isNaN(days) || days <= 0) {
                            alert('Please enter a valid number of days');
                            return;
                          }

                          try {
                            const currentEndDate = new Date(sub.trial_end_date!);
                            const newEndDate = new Date(currentEndDate);
                            newEndDate.setDate(newEndDate.getDate() + days);

                            const { error } = await supabase
                              .from('recurring_subscriptions')
                              .update({
                                trial_end_date: newEndDate.toISOString().split('T')[0]
                              })
                              .eq('id', sub.id);

                            if (error) throw error;

                            alert(`Trial extended by ${days} days! New end date: ${newEndDate.toLocaleDateString()}`);
                            loadSubscriptions();
                          } catch (error: any) {
                            console.error('Error extending trial:', error);
                            alert(`Failed to extend trial: ${error.message}`);
                          }
                        }}
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

          {subscriptions.filter(sub => sub.status === 'trial').length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No customers currently on trial</p>
            </div>
          )}
        </div>
      )}

      {selectedTab === 'subscriptions' && (
        <div className="space-y-4">
          {subscriptions
            .filter(sub => sub.status === 'active')
            .map(sub => (
              <div
                key={sub.id}
                className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex items-center justify-between"
              >
                <div>
                  <h3 className="text-lg font-semibold text-white mb-1">
                    {sub.contact.full_name}
                  </h3>
                  <div className="flex items-center gap-3 text-sm text-gray-400">
                    <span>{sub.contact.email}</span>
                    {sub.plan && (
                      <span className="flex items-center gap-1">
                        <Star className="w-4 h-4 text-yellow-400" />
                        {sub.plan.plan_name}
                      </span>
                    )}
                    {sub.next_billing_date && (
                      <span>Next billing: {new Date(sub.next_billing_date).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-green-900/50 text-green-300 rounded text-sm font-medium">
                    Active
                  </span>
                  {sub.plan?.plan_type === 'vip_plan' && (
                    <CheckCircle2 className="w-5 h-5 text-green-400" title="VIP Portal Access" />
                  )}
                </div>
              </div>
            ))}

          {subscriptions.filter(sub => sub.status === 'active').length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No active VIP subscriptions</p>
            </div>
          )}
        </div>
      )}

      {selectedTab === 'plans' && (
        <>
          {isCreating && (
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">
                  {editingPlan ? 'Edit Plan' : 'Create New Plan'}
                </h3>
                <button
                  onClick={resetForm}
                  className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Plan Name *
                  </label>
                  <input
                    type="text"
                    value={formData.plan_name}
                    onChange={e => setFormData({ ...formData, plan_name: e.target.value })}
                    placeholder="e.g., VIP Gold, VIP Platinum"
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Plan features and benefits"
                    rows={3}
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Billing Frequency *
                    </label>
                    <select
                      value={formData.billing_frequency}
                      onChange={e =>
                        setFormData({ ...formData, billing_frequency: e.target.value })
                      }
                      className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
                    >
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Amount *
                    </label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="number"
                        step="0.01"
                        value={formData.amount}
                        onChange={e =>
                          setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Tax Rate (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.tax_rate * 100}
                    onChange={e =>
                      setFormData({ ...formData, tax_rate: parseFloat(e.target.value) / 100 || 0 })
                    }
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
                  />
                </div>

                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                      className="w-5 h-5 rounded border-gray-600 text-blue-600"
                    />
                    <span className="font-medium text-white">Plan Active</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.show_on_portal}
                      onChange={e => setFormData({ ...formData, show_on_portal: e.target.checked })}
                      className="w-5 h-5 rounded border-gray-600 text-blue-600"
                    />
                    <div>
                      <div className="font-medium text-white">Show on Portal</div>
                      <div className="text-sm text-gray-400">
                        Display this plan on the public membership page
                      </div>
                    </div>
                  </label>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={handleSavePlan}
                    disabled={!formData.plan_name}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    {editingPlan ? 'Update Plan' : 'Create Plan'}
                  </button>
                  <button
                    onClick={resetForm}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-4">
            {plans.map(plan => (
              <div
                key={plan.id}
                className="bg-gray-800 border border-gray-700 rounded-lg p-6 hover:border-gray-600 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-bold text-white">{plan.plan_name}</h3>
                      {plan.plan_type === 'vip_plan' && (
                        <span className="px-2 py-1 bg-yellow-900/50 text-yellow-300 text-xs rounded flex items-center gap-1">
                          <Star className="w-3 h-3" />
                          VIP Portal Access
                        </span>
                      )}
                      {plan.show_on_portal && (
                        <span className="px-2 py-1 bg-blue-900/50 text-blue-300 text-xs rounded">
                          Visible on Portal
                        </span>
                      )}
                      {!plan.is_active && (
                        <span className="px-2 py-1 bg-red-900/50 text-red-300 text-xs rounded">
                          Inactive
                        </span>
                      )}
                    </div>
                    {plan.description && (
                      <p className="text-gray-300 mb-3">{plan.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-sm text-gray-400">
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
                    className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg flex items-center gap-2"
                  >
                    <Edit2 className="w-4 h-4" />
                    Edit
                  </button>
                </div>
              </div>
            ))}

            {plans.length === 0 && !isCreating && (
              <div className="text-center py-12 text-gray-400">
                <Star className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="mb-4">No VIP plans created yet</p>
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

      {showVIPInviteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-yellow-600/20 border border-yellow-600/40 flex items-center justify-center">
                  <Star className="w-5 h-5 text-yellow-400" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Send VIP Invite</h3>
                  <p className="text-sm text-gray-400">Invite a customer to sign up for VIP portal access</p>
                </div>
              </div>
              <button
                onClick={resetVIPInviteModal}
                className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {vipInviteSuccess ? (
              <div className="p-8 text-center">
                <div className="w-16 h-16 rounded-full bg-green-900/30 border border-green-600 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8 text-green-400" />
                </div>
                <h4 className="text-lg font-bold text-white mb-1">Invite Sent!</h4>
                <p className="text-gray-400 text-sm">
                  VIP signup invitation sent to <span className="text-white font-medium">{vipInviteContact?.full_name}</span>
                </p>
              </div>
            ) : (
              <div className="p-5 space-y-4">
                {!vipInviteContact ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Search for a contact
                    </label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={vipInviteSearch}
                        onChange={e => {
                          setVipInviteSearch(e.target.value);
                          searchContactsForVIPInvite(e.target.value);
                        }}
                        placeholder="Search by name or email..."
                        className="w-full pl-9 pr-4 py-2.5 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
                        autoFocus
                      />
                    </div>
                    {vipInviteSearchResults.length > 0 && (
                      <div className="mt-2 bg-gray-800 border border-gray-600 rounded-lg overflow-hidden">
                        {vipInviteSearchResults.map(contact => (
                          <button
                            key={contact.id}
                            onClick={() => {
                              setVipInviteContact(contact);
                              setVipInviteEmail(contact.email || '');
                              setVipInviteSearchResults([]);
                            }}
                            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-700 transition-colors text-left border-b border-gray-700 last:border-0"
                          >
                            <div className="w-8 h-8 rounded-full bg-yellow-900/40 border border-yellow-700/50 flex items-center justify-center flex-shrink-0">
                              <span className="text-yellow-400 text-sm font-bold">
                                {contact.full_name?.charAt(0)?.toUpperCase() || '?'}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-white truncate">{contact.full_name}</div>
                              {contact.email && (
                                <div className="text-xs text-gray-400 truncate">{contact.email}</div>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {vipInviteSearch.length >= 2 && vipInviteSearchResults.length === 0 && (
                      <p className="text-sm text-gray-500 mt-2 text-center py-2">No contacts found</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg border border-gray-700">
                      <div className="w-10 h-10 rounded-full bg-yellow-900/40 border border-yellow-700/50 flex items-center justify-center flex-shrink-0">
                        <span className="text-yellow-400 font-bold">
                          {vipInviteContact.full_name?.charAt(0)?.toUpperCase() || '?'}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-white">{vipInviteContact.full_name}</div>
                        {vipInviteContact.phone && (
                          <div className="text-xs text-gray-400">{vipInviteContact.phone}</div>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          setVipInviteContact(null);
                          setVipInviteEmail('');
                          setVipInviteSearch('');
                        }}
                        className="p-1.5 text-gray-400 hover:text-white rounded hover:bg-gray-700"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Send invite to email
                      </label>
                      <input
                        type="email"
                        value={vipInviteEmail}
                        onChange={e => setVipInviteEmail(e.target.value)}
                        placeholder="customer@example.com"
                        className="w-full px-4 py-2.5 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500"
                      />
                    </div>

                    <div className="bg-yellow-900/10 border border-yellow-700/40 rounded-lg p-3">
                      <div className="flex items-start gap-2">
                        <Star className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-yellow-300/80">
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
                        onClick={resetVIPInviteModal}
                        className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
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
        message="Has payment been received? This will activate their VIP membership and grant portal access."
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
