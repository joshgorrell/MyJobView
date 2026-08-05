import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { PaymentMethodForm, PaymentFormData } from './PaymentMethodForm';
import { PaymentMethodManager } from './PaymentMethodManager';
import { VIPMembershipFAQ } from './VIPMembershipFAQ';
import { TrialStatusBanner } from './TrialStatusBanner';
import {
  Star,
  Check,
  Calendar,
  Shield,
  X,
  AlertCircle,
  CreditCard,
  ArrowLeft,
  Package,
  Clock,
  Settings,
  Building2,
  Mail,
  Sparkles,
  TrendingUp,
  ClipboardList,
  Zap,
  Headphones,
  Award,
  ChevronRight
} from 'lucide-react';

const BENEFITS = [
  {
    icon: ClipboardList,
    title: 'Unlimited Punchlist Access',
    description: 'Create, manage, and track all your service items in one place. Add photos, write details, and follow progress from request to completion.',
    color: 'blue',
  },
  {
    icon: Zap,
    title: 'Priority Service Scheduling',
    description: 'VIP members move to the front of the line. When you submit a service request, our team prioritizes your appointment above standard calls.',
    color: 'amber',
  },
  {
    icon: Calendar,
    title: 'Regular Maintenance Visits',
    description: 'Stay ahead of issues with proactive maintenance. Your system gets inspected and tuned on a regular schedule, so problems are caught early.',
    color: 'green',
  },
  {
    icon: Headphones,
    title: 'Dedicated VIP Support',
    description: 'Skip the general queue. VIP members reach a dedicated support line staffed by senior technicians who know your system.',
    color: 'teal',
  },
  {
    icon: Shield,
    title: 'System Performance Monitoring',
    description: "We keep a close eye on your system health between visits, flagging anomalies before they become expensive repairs.",
    color: 'navy',
  },
  {
    icon: Award,
    title: '90-Day Test & Tune Trial',
    description: 'New project customers get a complimentary 90-day trial so you can experience VIP benefits before committing to a plan.',
    color: 'orange',
  },
];

const HOW_IT_WORKS = [
  { step: 1, title: 'Choose a Plan', description: 'Select the VIP membership level that fits your needs and budget.' },
  { step: 2, title: 'Get Instant Access', description: 'Your punchlist unlocks immediately and your priority status is activated.' },
  { step: 3, title: 'Enjoy Year-Round Service', description: 'Submit items, schedule visits, and relax knowing your system is in expert hands.' },
];

function benefitColorClasses(color: string) {
  const map: Record<string, { bg: string; icon: string; border: string }> = {
    blue:   { bg: 'bg-blue-50',   icon: 'text-blue-600',   border: 'border-blue-200' },
    amber:  { bg: 'bg-amber-50',  icon: 'text-amber-600',  border: 'border-amber-200' },
    green:  { bg: 'bg-green-50',  icon: 'text-green-600',  border: 'border-green-200' },
    teal:   { bg: 'bg-teal-50',   icon: 'text-teal-600',   border: 'border-teal-200' },
    navy:   { bg: 'bg-slate-50',  icon: 'text-slate-700',  border: 'border-slate-200' },
    orange: { bg: 'bg-orange-50', icon: 'text-orange-600', border: 'border-orange-200' },
  };
  return map[color] || map.blue;
}

interface VIPPlan {
  id: string;
  plan_name: string;
  description: string | null;
  billing_frequency: string;
  amount: number;
  is_active: boolean;
  plan_type: string;
}

interface CurrentSubscription {
  id: string;
  status: string;
  start_date: string;
  next_billing_date: string;
  trial_end_date: string | null;
  trial_started_date: string | null;
  plan: {
    plan_name: string;
    description: string | null;
    amount: number;
    billing_frequency: string;
  };
}

interface PortalVIPMembershipProps {
  contactId?: string;
}

export function PortalVIPMembership({ contactId: propContactId }: PortalVIPMembershipProps = {}) {
  const [availablePlans, setAvailablePlans] = useState<VIPPlan[]>([]);
  const [currentSubscription, setCurrentSubscription] = useState<CurrentSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<VIPPlan | null>(null);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showPaymentSettings, setShowPaymentSettings] = useState(false);
  const [contactInfo, setContactInfo] = useState<any>(null);
  const [companyEmail, setCompanyEmail] = useState('info@example.com');
  const [addressData, setAddressData] = useState({
    street_address: '',
    city: '',
    state: '',
    zip_code: '',
  });

  const getContactId = async () => {
    if (propContactId) return propContactId;

    const impersonatingContactId = localStorage.getItem('admin_impersonating_contact');
    if (impersonatingContactId) return impersonatingContactId;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
      .from('profiles')
      .select('contact_id')
      .eq('id', user.id)
      .maybeSingle();

    return profile?.contact_id || null;
  };

  useEffect(() => {
    loadData();
  }, [propContactId]);

  async function loadData() {
    try {
      const contactId = await getContactId();
      if (!contactId) {
        setLoading(false);
        return;
      }

      // Load contact info including address
      const { data: contact } = await supabase
        .from('contacts')
        .select('id, full_name, email, phone, street_address, city, state, zip_code')
        .eq('id', contactId)
        .maybeSingle();

      setContactInfo(contact);

      // Pre-populate address if exists
      if (contact) {
        setAddressData({
          street_address: contact.street_address || '',
          city: contact.city || '',
          state: contact.state || '',
          zip_code: contact.zip_code || '',
        });
      }

      // Load company settings for email
      const { data: settings } = await supabase
        .from('company_settings')
        .select('company_email')
        .maybeSingle();

      if (settings?.company_email) {
        setCompanyEmail(settings.company_email);
      }

      // Load available VIP plans
      const { data: plans, error: plansError } = await supabase
        .from('recurring_plans')
        .select('*')
        .eq('is_active', true)
        .eq('plan_type', 'vip_plan')
        .order('amount');

      if (plansError) throw plansError;
      setAvailablePlans(plans || []);

      // Load current subscription (active or trial only - pending_payment doesn't grant access)
      const { data: subscription, error: subError } = await supabase
        .from('recurring_subscriptions')
        .select(`
          id,
          status,
          start_date,
          next_billing_date,
          trial_end_date,
          trial_started_date,
          plan:recurring_plans(
            plan_name,
            description,
            amount,
            billing_frequency
          )
        `)
        .eq('contact_id', contactId)
        .in('status', ['active', 'trial'])
        .maybeSingle();

      if (subError && subError.code !== 'PGRST116') throw subError;
      setCurrentSubscription(subscription);

    } catch (error) {
      console.error('Error loading VIP membership data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleProceedToAddress() {
    setShowPurchaseModal(false);

    // Check if address is already complete
    const hasCompleteAddress = addressData.street_address && addressData.city && addressData.state && addressData.zip_code;

    if (hasCompleteAddress) {
      // Skip address modal and go straight to payment
      setShowPaymentModal(true);
    } else {
      // Show address collection modal
      setShowAddressModal(true);
    }
  }

  async function handleAddressSubmit() {
    // Validate address
    if (!addressData.street_address || !addressData.city || !addressData.state || !addressData.zip_code) {
      alert('Please fill in all address fields');
      return;
    }

    const contactId = await getContactId();
    if (!contactId) {
      alert('Contact information not found');
      return;
    }

    try {
      // Update contact with address
      const { error } = await supabase
        .from('contacts')
        .update({
          street_address: addressData.street_address,
          city: addressData.city,
          state: addressData.state,
          zip_code: addressData.zip_code,
        })
        .eq('id', contactId);

      if (error) throw error;

      setShowAddressModal(false);
      setShowPaymentModal(true);
    } catch (error) {
      console.error('Error saving address:', error);
      alert('Failed to save address. Please try again.');
    }
  }

  async function handlePayment(paymentData: PaymentFormData) {
    if (!selectedPlan) return;

    const contactId = await getContactId();
    if (!contactId) {
      throw new Error('Contact information not found');
    }

    try {
      // In production, this would process payment through Stripe
      // For now, we simulate successful payment and activate immediately

      const startDate = new Date();
      const nextBillingDate = new Date();

      // Calculate next billing date based on frequency
      switch (selectedPlan.billing_frequency) {
        case 'monthly':
          nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
          break;
        case 'quarterly':
          nextBillingDate.setMonth(nextBillingDate.getMonth() + 3);
          break;
        case 'yearly':
          nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
          break;
      }

      // Calculate payment amounts
      const amount = selectedPlan.amount;
      const convenienceFee = paymentData.paymentType === 'card' ? amount * 0.03 : 0;
      const totalAmount = amount + convenienceFee;

      // In production, payment method and transaction details would be stored
      // For now, we just activate the subscription

      let subscription;

      // Check if user is converting from trial
      if (currentSubscription?.status === 'trial') {
        // Update existing trial subscription to active
        const { data: updatedSub, error: updateError } = await supabase
          .from('recurring_subscriptions')
          .update({
            plan_id: selectedPlan.id,
            status: 'active',
            trial_end_date: null,
            trial_started_date: null,
            next_billing_date: nextBillingDate.toISOString().split('T')[0],
            notes: `Converted from trial to paid subscription via customer portal. Amount: $${totalAmount} (${paymentData.paymentType})`
          })
          .eq('id', currentSubscription.id)
          .select()
          .single();

        if (updateError) throw updateError;
        subscription = updatedSub;
      } else {
        // Create new active subscription
        const { data: newSub, error: subError } = await supabase
          .from('recurring_subscriptions')
          .insert({
            contact_id: contactId,
            plan_id: selectedPlan.id,
            start_date: startDate.toISOString().split('T')[0],
            next_billing_date: nextBillingDate.toISOString().split('T')[0],
            status: 'active',
            auto_invoice: true,
            auto_send: false,
            notes: `Self-service signup via customer portal. Amount: $${totalAmount} (${paymentData.paymentType})`
          })
          .select()
          .single();

        if (subError) throw subError;
        subscription = newSub;
      }

      alert(
        currentSubscription?.status === 'trial'
          ? 'Payment successful! Your trial has been converted to a paid membership.'
          : 'Payment successful! Your VIP membership is now active. Welcome to the VIP program!'
      );
      setShowPaymentModal(false);
      setSelectedPlan(null);
      loadData();
    } catch (error: any) {
      console.error('Error processing payment:', error);
      throw new Error(error.message || 'Payment processing failed');
    }
  }

  async function handleCancelSubscription() {
    if (!currentSubscription) return;

    const contactId = await getContactId();
    if (!contactId) return;

    try {
      const { error } = await supabase
        .from('recurring_subscriptions')
        .update({
          status: 'cancelled',
          notes: `Cancelled via customer portal on ${new Date().toISOString()}`
        })
        .eq('id', currentSubscription.id);

      if (error) throw error;

      alert('Your VIP membership has been cancelled. You will have access until your next billing date.');
      setShowCancelModal(false);
      loadData();
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      alert('Failed to cancel subscription. Please contact support.');
    }
  }

  function getBillingFrequencyLabel(frequency: string) {
    const labels: Record<string, string> = {
      monthly: 'per month',
      quarterly: 'per quarter',
      yearly: 'per year',
      weekly: 'per week',
    };
    return labels[frequency] || frequency;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">Loading VIP membership options...</p>
        </div>
      </div>
    );
  }

  const impersonatingName = localStorage.getItem('admin_impersonating_name');

  return (
    <div className="min-h-screen bg-gray-50">
      {impersonatingName && (
        <div className="bg-amber-500 text-white px-4 py-2 text-center text-sm font-medium">
          Admin Preview: Viewing portal as {impersonatingName}
        </div>
      )}
      <header className="bg-[#0f2347] text-white shadow-lg sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16 sm:h-20 gap-3">
            <a
              href="/portal"
              className="flex items-center gap-1.5 px-3 py-2 text-blue-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors min-h-[44px]"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline text-sm font-medium">Dashboard</span>
            </a>
            <img
              src="/el_logo_color_(2).png"
              alt="Electronic Life"
              className="h-8 sm:h-10 object-contain flex-shrink-0"
            />
            <div className="hidden sm:block border-l border-white/20 pl-4">
              <p className="text-white font-semibold text-sm leading-tight">VIP Membership</p>
              <p className="text-blue-300 text-xs">Premium service & priority support</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">

      <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-3">
          <Star className="w-8 h-8 text-yellow-500" />
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">VIP Membership</h2>
            <p className="text-gray-600">Premium support and priority service</p>
          </div>
        </div>
      </div>

      {/* Benefits & How It Works — shown to non-members only */}
      {!currentSubscription && (
        <>
          {/* Hero */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0f2347] to-[#1e4080] text-white p-8 sm:p-10 shadow-xl">
            <div className="absolute top-0 right-0 w-56 h-56 bg-yellow-400/10 rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-40 h-40 bg-blue-400/10 rounded-full translate-y-1/2 -translate-x-1/2 pointer-events-none" />
            <div className="relative">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 bg-yellow-400/20 rounded-xl flex items-center justify-center">
                  <Star className="w-6 h-6 text-yellow-400 fill-yellow-400" />
                </div>
                <span className="text-sm font-semibold text-yellow-300 tracking-wide uppercase">VIP Membership</span>
              </div>
              <h3 className="text-2xl sm:text-3xl font-bold text-white mb-3 leading-tight">
                Priority Service. Total Peace of Mind.
              </h3>
              <p className="text-blue-200 text-base mb-6 max-w-xl leading-relaxed">
                VIP members get unlimited punchlist access, jump-the-queue scheduling, regular maintenance, and a dedicated support team — all for one predictable rate.
              </p>
              <a
                href="/portal/contact"
                className="inline-flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl border border-white/20 transition-colors text-sm"
              >
                Ask About Free Trial
                <ChevronRight className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Benefits grid */}
          <div>
            <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-5">Everything VIP Includes</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {BENEFITS.map((benefit) => {
                const Icon = benefit.icon;
                const cls = benefitColorClasses(benefit.color);
                return (
                  <div key={benefit.title} className={`bg-white border ${cls.border} rounded-xl p-5 shadow-sm`}>
                    <div className={`w-10 h-10 ${cls.bg} rounded-lg flex items-center justify-center mb-3`}>
                      <Icon className={`w-5 h-5 ${cls.icon}`} />
                    </div>
                    <h4 className="font-semibold text-gray-900 mb-1.5">{benefit.title}</h4>
                    <p className="text-gray-500 text-sm leading-relaxed">{benefit.description}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* How It Works */}
          <div className="bg-white rounded-lg border border-gray-200 p-7 shadow-sm">
            <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-7 text-center">How It Works</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-7">
              {HOW_IT_WORKS.map((step) => (
                <div key={step.step} className="flex flex-col items-center text-center">
                  <div className="w-11 h-11 bg-[#0f2347] text-white rounded-full flex items-center justify-center text-base font-bold mb-3 shadow">
                    {step.step}
                  </div>
                  <h4 className="font-semibold text-gray-900 mb-1.5">{step.title}</h4>
                  <p className="text-gray-500 text-sm leading-relaxed">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {currentSubscription && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
          {/* Status Badge */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2 flex items-center gap-2">
                <Shield className="w-5 h-5 text-green-500" />
                Current Membership
              </h3>
              <p className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
                {currentSubscription.plan.plan_name}
              </p>
              {currentSubscription.plan.description && (
                <p className="text-gray-600 mb-4">{currentSubscription.plan.description}</p>
              )}
            </div>
            <div className={`${
              currentSubscription.status === 'trial'
                ? 'bg-blue-50 border-blue-200'
                : 'bg-green-50 border-green-200'
            } border px-3 py-1 rounded-full`}>
              <span className={`${
                currentSubscription.status === 'trial'
                  ? 'text-blue-700'
                  : 'text-green-700'
              } text-sm font-medium`}>
                {currentSubscription.status === 'trial' ? 'Free Trial' : 'Active'}
              </span>
            </div>
          </div>

          {/* Trial Warning Banner */}
          {currentSubscription.status === 'trial' && currentSubscription.trial_end_date && (() => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const trialEnd = new Date(currentSubscription.trial_end_date);
            trialEnd.setHours(0, 0, 0, 0);
            const daysRemaining = Math.ceil((trialEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

            return (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-amber-900 mb-1">
                      Free Trial - {daysRemaining} {daysRemaining === 1 ? 'Day' : 'Days'} Remaining
                    </h4>
                    <p className="text-amber-700 text-sm mb-3">
                      Your 90-day test and tune trial expires on {trialEnd.toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric'
                      })}. Subscribe now to keep your VIP benefits active.
                    </p>
                    <button
                      onClick={() => {
                        const plansSection = document.querySelector('#available-plans');
                        if (plansSection) {
                          plansSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                      }}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium text-sm flex items-center gap-2"
                    >
                      <Star className="w-4 h-4" />
                      Subscribe to Keep Access
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            {currentSubscription.status === 'trial' ? (
              <>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-500 mb-1">Trial Started</div>
                  <div className="text-xl font-bold text-gray-900">
                    {currentSubscription.trial_started_date
                      ? new Date(currentSubscription.trial_started_date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })
                      : new Date(currentSubscription.start_date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })
                    }
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-500 mb-1">Trial Expires</div>
                  <div className="text-xl font-bold text-gray-900">
                    {currentSubscription.trial_end_date
                      ? new Date(currentSubscription.trial_end_date).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })
                      : 'N/A'
                    }
                  </div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="text-sm text-blue-600 mb-1">Days Remaining</div>
                  <div className="text-2xl sm:text-3xl font-bold text-blue-700">
                    {currentSubscription.trial_end_date && (() => {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      const trialEnd = new Date(currentSubscription.trial_end_date);
                      trialEnd.setHours(0, 0, 0, 0);
                      return Math.ceil((trialEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    })()}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-500 mb-1">Monthly Cost</div>
                  <div className="text-xl font-bold text-gray-900">
                    ${currentSubscription.plan.amount}
                    <span className="text-sm text-gray-500 font-normal ml-1">
                      /{getBillingFrequencyLabel(currentSubscription.plan.billing_frequency).replace('per ', '')}
                    </span>
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-500 mb-1">Member Since</div>
                  <div className="text-xl font-bold text-gray-900">
                    {new Date(currentSubscription.start_date).toLocaleDateString('en-US', {
                      month: 'short',
                      year: 'numeric'
                    })}
                  </div>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="text-sm text-green-600 mb-1">Renews On</div>
                  <div className="text-xl font-bold text-green-700">
                    {new Date(currentSubscription.next_billing_date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Benefits Section */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <Check className="w-5 h-5 text-blue-500" />
              Your Benefits
            </h4>
            <ul className="space-y-2 text-gray-700">
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                <span>Unlimited punchlist access</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                <span>Priority scheduling for service requests</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                <span>Regular maintenance visits</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                <span>Exclusive member support</span>
              </li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
            {currentSubscription.status !== 'trial' && (
              <button
                onClick={() => setShowPaymentSettings(true)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm flex items-center gap-2"
              >
                <Settings className="w-4 h-4" />
                Payment Settings
              </button>
            )}
            <button
              onClick={() => setShowCancelModal(true)}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm"
            >
              {currentSubscription.status === 'trial' ? 'Cancel Trial' : 'Cancel Membership'}
            </button>
          </div>
        </div>
      )}

      {((!currentSubscription || currentSubscription.status === 'trial') && availablePlans.length > 0) && (
        <>
          {currentSubscription?.status === 'trial' && currentSubscription.trial_end_date && (
            <div className="mb-6">
              <TrialStatusBanner
                daysRemaining={(() => {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const trialEnd = new Date(currentSubscription.trial_end_date);
                  trialEnd.setHours(0, 0, 0, 0);
                  return Math.ceil((trialEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                })()}
                expirationDate={currentSubscription.trial_end_date}
                subscriptionPlanName={null}
                showDetails={true}
                compact={false}
              />
            </div>
          )}

          {currentSubscription?.status === 'trial' && (
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-300 rounded-lg p-6 mb-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-6 h-6 text-amber-500" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">What Happens After Your Trial?</h3>
                  <div className="space-y-3 text-gray-700 text-sm mb-4">
                    <p>
                      Your <strong>90-Day Test & Tune trial</strong> will automatically end on{' '}
                      {new Date(currentSubscription.trial_end_date!).toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric'
                      })}. Here's what you need to know:
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                        <span><strong>Punchlist access will end</strong> - You won't be able to create new service items</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span><strong>Your data is saved</strong> - All your punchlist history remains accessible</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span><strong>No automatic billing</strong> - We won't charge you unless you subscribe</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <TrendingUp className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                        <span><strong>Easy to continue</strong> - Subscribe anytime to restore full access</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-gray-600 text-sm">
                    Ready to keep your VIP benefits? Choose a plan below to continue enjoying priority service,
                    punchlist access, and regular maintenance after your trial ends.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div id="available-plans">
            <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">
              {currentSubscription?.status === 'trial' ? 'Keep Your VIP Access' : 'Available Plans'}
            </h3>
            <p className="text-gray-600 mb-6">
              {currentSubscription?.status === 'trial'
                ? 'Choose a plan to continue enjoying uninterrupted VIP benefits after your trial expires.'
                : 'Choose the VIP plan that best fits your needs. All plans include punchlist access, priority service, and regular maintenance.'
              }
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {availablePlans.map((plan) => (
              <div
                key={plan.id}
                className="bg-white border border-gray-200 rounded-lg p-6 hover:border-blue-500 hover:shadow-md transition-colors"
              >
                <div className="flex items-center gap-2 mb-4">
                  <Package className="w-6 h-6 text-blue-500" />
                  <h4 className="text-lg sm:text-xl font-bold text-gray-900">{plan.plan_name}</h4>
                </div>

                {plan.description && (
                  <p className="text-gray-600 mb-4 min-h-[60px]">{plan.description}</p>
                )}

                <div className="mb-6">
                  <div className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">
                    ${plan.amount}
                  </div>
                  <div className="text-gray-500">
                    {getBillingFrequencyLabel(plan.billing_frequency)}
                  </div>
                </div>

                <ul className="space-y-3 mb-6">
                  <li className="flex items-start gap-2 text-gray-700">
                    <Check className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>Unlimited punchlist access</span>
                  </li>
                  <li className="flex items-start gap-2 text-gray-700">
                    <Check className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>Priority service scheduling</span>
                  </li>
                  <li className="flex items-start gap-2 text-gray-700">
                    <Check className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>Regular maintenance visits</span>
                  </li>
                  <li className="flex items-start gap-2 text-gray-700">
                    <Check className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>Dedicated support</span>
                  </li>
                </ul>

                <button
                  onClick={() => {
                    setSelectedPlan(plan);
                    setShowPurchaseModal(true);
                  }}
                  className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center justify-center gap-2"
                >
                  <CreditCard className="w-4 h-4" />
                  {currentSubscription?.status === 'trial' ? 'Upgrade to Paid Plan' : 'Subscribe Now'}
                </button>
              </div>
            ))}
          </div>

          {/* Business VIP Inquiry Section */}
          <div className="mt-8 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6 sm:p-8">
            <div className="flex flex-col md:flex-row items-center gap-6">
              <div className="flex-shrink-0">
                <div className="w-16 h-16 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Building2 className="w-8 h-8 text-blue-500" />
                </div>
              </div>
              <div className="flex-1 text-center md:text-left">
                <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
                  Business VIP Plans Available
                </h3>
                <p className="text-gray-600 mb-3">
                  Need a VIP plan for your business? We offer customized service programs with multi-location support, dedicated account management, and flexible billing.
                </p>
                <p className="text-gray-500 text-sm">
                  Contact us to discuss a tailored solution for your business needs.
                </p>
              </div>
              <div className="flex-shrink-0">
                <a
                  href={`mailto:${companyEmail}?subject=Business VIP Plan Inquiry&body=Hi,%0D%0A%0D%0AI'm interested in learning more about VIP membership options for my business.%0D%0A%0D%0ABusiness Name:%0D%0ANumber of Locations:%0D%0AContact Name:%0D%0APhone:%0D%0A%0D%0APlease contact me to discuss custom VIP solutions.`}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-all flex items-center gap-2 sm:whitespace-nowrap"
                >
                  <Mail className="w-5 h-5" />
                  Contact About Business Plans
                </a>
              </div>
            </div>
          </div>
        </>
      )}

      {!currentSubscription && availablePlans.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No VIP Plans Available</h3>
          <p className="text-gray-500">
            VIP membership plans are not currently available. Please contact us for more information.
          </p>
        </div>
      )}

      {/* FAQ Section */}
      {availablePlans.length > 0 && (
        <div className="mt-8">
          <VIPMembershipFAQ />
        </div>
      )}

      {/* Purchase Modal */}
      {showPurchaseModal && selectedPlan && (
        <div className="fixed inset-0 bg-black/75 flex items-end sm:items-center justify-center sm:p-4 z-50">
          <div className="bg-white rounded-t-2xl sm:rounded-lg shadow-xl max-w-md w-full p-5 sm:p-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">
                {currentSubscription?.status === 'trial' ? 'Upgrade to Paid Membership' : 'Subscribe to VIP Plan'}
              </h3>
              <button
                onClick={() => {
                  setShowPurchaseModal(false);
                  setSelectedPlan(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <div className="text-lg font-bold text-gray-900 mb-2">{selectedPlan.plan_name}</div>
              {selectedPlan.description && (
                <p className="text-gray-600 text-sm mb-3">{selectedPlan.description}</p>
              )}
              <div className="text-2xl sm:text-3xl font-bold text-gray-900">
                ${selectedPlan.amount}
                <span className="text-sm text-gray-500 font-normal ml-2">
                  {getBillingFrequencyLabel(selectedPlan.billing_frequency)}
                </span>
              </div>
            </div>

            {contactInfo && (
              <div className="mb-6">
                <div className="text-sm font-medium text-gray-700 mb-2">Billing Contact</div>
                <div className="bg-gray-50 rounded-lg p-3 text-sm">
                  <div className="text-gray-900 font-medium">{contactInfo.full_name}</div>
                  <div className="text-gray-500">{contactInfo.email}</div>
                  {contactInfo.phone && <div className="text-gray-500">{contactInfo.phone}</div>}
                </div>
              </div>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-2">
                <CreditCard className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">
                    {currentSubscription?.status === 'trial'
                      ? 'Convert Your Trial to Paid Membership'
                      : 'Ready to Subscribe'
                    }
                  </p>
                  <p>
                    {currentSubscription?.status === 'trial'
                      ? 'Your trial will be converted to a paid membership and you\'ll continue to enjoy all VIP benefits without interruption.'
                      : 'Your VIP membership will activate immediately after payment is confirmed. All billing information and payment will be handled securely on the next screens.'
                    }
                  </p>
                  {!currentSubscription && (
                    <p className="mt-2 text-xs text-blue-600">
                      Note: Free 90-day trials are only available through direct invitation from our company.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowPurchaseModal(false);
                  setSelectedPlan(null);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleProceedToAddress}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center justify-center gap-2"
              >
                <CreditCard className="w-4 h-4" />
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Address Modal */}
      {showAddressModal && selectedPlan && (
        <div className="fixed inset-0 bg-black/75 flex items-end sm:items-center justify-center sm:p-4 z-50">
          <div className="bg-white rounded-t-2xl sm:rounded-lg shadow-xl max-w-2xl w-full p-5 sm:p-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">Service Address</h3>
              <button
                onClick={() => {
                  setShowAddressModal(false);
                  setSelectedPlan(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4">
              <p className="text-gray-600 text-sm">
                Please provide your service address for VIP membership activation.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="street_address" className="block text-sm font-medium text-gray-700 mb-2">
                  Street Address *
                </label>
                <input
                  id="street_address"
                  type="text"
                  value={addressData.street_address}
                  onChange={(e) => setAddressData({ ...addressData, street_address: e.target.value })}
                  required
                  className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="123 Main St"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-2">
                    City *
                  </label>
                  <input
                    id="city"
                    type="text"
                    value={addressData.city}
                    onChange={(e) => setAddressData({ ...addressData, city: e.target.value })}
                    required
                    className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="City"
                  />
                </div>

                <div>
                  <label htmlFor="state" className="block text-sm font-medium text-gray-700 mb-2">
                    State *
                  </label>
                  <input
                    id="state"
                    type="text"
                    value={addressData.state}
                    onChange={(e) => setAddressData({ ...addressData, state: e.target.value.toUpperCase() })}
                    required
                    maxLength={2}
                    className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="KS"
                  />
                </div>

                <div>
                  <label htmlFor="zip_code" className="block text-sm font-medium text-gray-700 mb-2">
                    ZIP Code *
                  </label>
                  <input
                    id="zip_code"
                    type="text"
                    value={addressData.zip_code}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 5);
                      setAddressData({ ...addressData, zip_code: value });
                    }}
                    required
                    className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="12345"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowAddressModal(false);
                  setShowPurchaseModal(true);
                }}
                className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg font-medium"
              >
                Back
              </button>
              <button
                onClick={handleAddressSubmit}
                className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center justify-center gap-2"
              >
                Continue to Payment
                <ArrowLeft className="w-4 h-4 rotate-180" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && selectedPlan && (
        <div className="fixed inset-0 bg-black/75 flex items-end sm:items-center justify-center sm:p-4 z-50">
          <div className="bg-white rounded-t-2xl sm:rounded-lg shadow-xl max-w-2xl w-full p-5 sm:p-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">Complete Payment</h3>
              <button
                onClick={() => {
                  setShowPaymentModal(false);
                  setSelectedPlan(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <div className="text-lg font-bold text-gray-900 mb-1">{selectedPlan.plan_name}</div>
              {selectedPlan.description && (
                <p className="text-gray-600 text-sm mb-3">{selectedPlan.description}</p>
              )}
              <div className="text-2xl font-bold text-gray-900">
                ${selectedPlan.amount}
                <span className="text-sm text-gray-500 font-normal ml-2">
                  {getBillingFrequencyLabel(selectedPlan.billing_frequency)}
                </span>
              </div>
            </div>

            <PaymentMethodForm
              amount={selectedPlan.amount}
              onSubmit={handlePayment}
              onCancel={() => {
                setShowPaymentModal(false);
                setShowAddressModal(true);
              }}
            />
          </div>
        </div>
      )}

      {/* Payment Settings Modal */}
      {showPaymentSettings && (
        <div className="fixed inset-0 bg-black/75 flex items-end sm:items-center justify-center sm:p-4 z-50">
          <div className="bg-white rounded-t-2xl sm:rounded-lg shadow-xl max-w-2xl w-full p-5 sm:p-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">Payment Settings</h3>
              <button
                onClick={() => setShowPaymentSettings(false)}
                className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <PaymentMethodManager
              contactId={contactInfo?.id || ''}
              onPaymentMethodAdded={() => {
                loadData();
              }}
            />

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowPaymentSettings(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {showCancelModal && currentSubscription && (
        <div className="fixed inset-0 bg-black/75 flex items-end sm:items-center justify-center sm:p-4 z-50">
          <div className="bg-white rounded-t-2xl sm:rounded-lg shadow-xl max-w-md w-full p-5 sm:p-6 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">Cancel VIP Membership?</h3>
              <button
                onClick={() => setShowCancelModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-6">
              <p className="text-gray-600 mb-4">
                Are you sure you want to cancel your VIP membership? You will lose access to:
              </p>
              <ul className="space-y-2 mb-4">
                <li className="flex items-start gap-2 text-gray-700">
                  <X className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <span>Punchlist portal access</span>
                </li>
                <li className="flex items-start gap-2 text-gray-700">
                  <X className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <span>Priority service scheduling</span>
                </li>
                <li className="flex items-start gap-2 text-gray-700">
                  <X className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <span>Regular maintenance visits</span>
                </li>
              </ul>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <Clock className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-amber-800">
                    You will have access until your next billing date on{' '}
                    {new Date(currentSubscription.next_billing_date).toLocaleDateString()}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg"
              >
                Keep Membership
              </button>
              <button
                onClick={handleCancelSubscription}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
              >
                Cancel Membership
              </button>
            </div>
          </div>
        </div>
      )}
      </main>

      <footer className="border-t border-gray-200 mt-8 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-center gap-3 text-xs text-gray-400">
          <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="hover:text-gray-600 underline">Privacy Policy</a>
          <span>·</span>
          <a href="/eula" target="_blank" rel="noopener noreferrer" className="hover:text-gray-600 underline">Terms of Service</a>
        </div>
      </footer>
    </div>
  );
}
