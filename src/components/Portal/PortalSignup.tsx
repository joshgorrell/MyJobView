import { useState, useEffect } from 'react';
import { ArrowLeft, CheckCircle, AlertCircle, Star, Package, Check, ArrowRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { AddressAutocomplete } from '../Shared/AddressAutocomplete';
import { generateUniqueUsername } from '../../lib/username';

interface VIPPlan {
  id: string;
  plan_name: string;
  description: string | null;
  billing_frequency: string;
  amount: number;
  is_active: boolean;
  plan_type: string;
}

export function PortalSignup() {
  const [step, setStep] = useState<'info' | 'plan' | 'success'>('info');
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zip: '',
  });
  const [availablePlans, setAvailablePlans] = useState<VIPPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<VIPPlan | null>(null);
  const [contactId, setContactId] = useState<string | null>(null);
  const [signupAttemptId, setSignupAttemptId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [skipPlanSelection, setSkipPlanSelection] = useState(false);

  useEffect(() => {
    loadPlansAndCheckPreselection();
  }, []);

  async function loadPlansAndCheckPreselection() {
    // Load plans first
    const plans = await loadPlans();

    // Check if a plan was pre-selected via URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const planId = urlParams.get('plan');

    if (planId) {
      const plan = await loadPreselectedPlan(planId);
      if (plan) {
        setSkipPlanSelection(true); // Skip plan selection if pre-selected
      }
    } else if (plans.length === 1) {
      // Auto-select if only one plan available
      setSelectedPlan(plans[0]);
      setSkipPlanSelection(true);
    }
  }

  async function loadPlans(): Promise<VIPPlan[]> {
    try {
      const { data: plans, error } = await supabase
        .from('recurring_plans')
        .select('*')
        .eq('is_active', true)
        .eq('plan_type', 'vip')
        .eq('show_on_portal', true)
        .order('amount');

      if (error) throw error;
      const planList = plans || [];
      setAvailablePlans(planList);
      return planList;
    } catch (error) {
      console.error('Error loading VIP plans:', error);
      return [];
    }
  }

  async function loadPreselectedPlan(planId: string): Promise<VIPPlan | null> {
    try {
      const { data: plan, error } = await supabase
        .from('recurring_plans')
        .select('*')
        .eq('id', planId)
        .eq('is_active', true)
        .eq('plan_type', 'vip')
        .eq('show_on_portal', true)
        .maybeSingle();

      if (error) throw error;
      if (plan) {
        setSelectedPlan(plan);
        return plan;
      }
      return null;
    } catch (error) {
      console.error('Error loading preselected plan:', error);
      return null;
    }
  }

  async function handleInfoSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Just check if email already has an active subscription
      const { data: existingContact } = await supabase
        .from('contacts')
        .select('id')
        .eq('email', formData.email.toLowerCase())
        .maybeSingle();

      if (existingContact) {
        // Check if they have an active VIP subscription
        const { data: activeSubscription } = await supabase
          .from('recurring_subscriptions')
          .select('id, status')
          .eq('contact_id', existingContact.id)
          .in('status', ['active', 'trial'])
          .maybeSingle();

        if (activeSubscription) {
          setError('An account with this email already exists and has an active VIP membership. Please use the login page instead.');
          setLoading(false);
          return;
        }

        // Store existing contact ID to update later if they complete signup
        setContactId(existingContact.id);
      }

      // Create or update signup attempt record
      // First check if there's an existing in_progress signup for this email
      const { data: existingAttempt } = await supabase
        .from('signup_attempts')
        .select('id')
        .eq('email', formData.email.toLowerCase())
        .eq('status', 'in_progress')
        .maybeSingle();

      let signupAttempt;
      if (existingAttempt) {
        // Update existing in_progress signup
        const { data, error } = await supabase
          .from('signup_attempts')
          .update({
            first_name: formData.firstName,
            last_name: formData.lastName,
            phone: formData.phone,
            street_address: formData.address,
            city: formData.city,
            state: formData.state,
            zip_code: formData.zip,
            current_step: 'plan',
            last_activity_at: new Date().toISOString(),
          })
          .eq('id', existingAttempt.id)
          .select()
          .single();

        if (!error) signupAttempt = data;
      } else {
        // Create new signup attempt
        const { data, error } = await supabase
          .from('signup_attempts')
          .insert({
            email: formData.email.toLowerCase(),
            first_name: formData.firstName,
            last_name: formData.lastName,
            phone: formData.phone,
            street_address: formData.address,
            city: formData.city,
            state: formData.state,
            zip_code: formData.zip,
            current_step: 'plan',
            status: 'in_progress',
            last_activity_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (!error) signupAttempt = data;
      }

      if (signupAttempt) {
        setSignupAttemptId(signupAttempt.id);
      }

      // Skip plan selection if plan was pre-selected or only one available
      if (skipPlanSelection && selectedPlan) {
        await handlePayment();
      } else {
        setStep('plan');
      }
    } catch (err: any) {
      console.error('Error validating account:', err);
      setError(err.message || 'Failed to validate account. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handlePlanSelect(plan: VIPPlan) {
    setSelectedPlan(plan);

    // Update signup attempt with selected plan
    if (signupAttemptId) {
      await supabase
        .from('signup_attempts')
        .update({
          selected_plan_id: plan.id,
          current_step: 'payment',
          last_activity_at: new Date().toISOString(),
        })
        .eq('id', signupAttemptId);
    }

    // Proceed directly to payment processing (QuickBooks redirect)
    await handlePayment();
  }

  async function handlePayment() {
    if (!selectedPlan) return;

    try {
      // NOW create or update the contact since they're completing the signup
      let finalContactId = contactId;

      if (contactId) {
        // Update existing contact
        await supabase
          .from('contacts')
          .update({
            first_name: formData.firstName,
            last_name: formData.lastName,
            contact_name: `${formData.firstName} ${formData.lastName}`,
            phone: formData.phone,
            street_address: formData.address,
            city: formData.city,
            state: formData.state,
            zip_code: formData.zip,
            portal_access_enabled: true,
          })
          .eq('id', contactId);
      } else {
        // Generate unique username
        const username = await generateUniqueUsername(
          `${formData.firstName} ${formData.lastName}`,
          supabase
        );

        // Create new contact
        const { data: newContact, error: contactError } = await supabase
          .from('contacts')
          .insert({
            first_name: formData.firstName,
            last_name: formData.lastName,
            contact_name: `${formData.firstName} ${formData.lastName}`,
            username: username,
            email: formData.email.toLowerCase(),
            phone: formData.phone,
            street_address: formData.address,
            city: formData.city,
            state: formData.state,
            zip_code: formData.zip,
            contact_type: 'person',
            portal_access_enabled: true,
          })
          .select()
          .single();

        if (contactError) throw contactError;
        finalContactId = newContact.id;
        setContactId(newContact.id);
      }

      if (!finalContactId) {
        throw new Error('Failed to create or update contact');
      }
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

      // Create subscription with pending_payment status
      const { data: subscription, error: subError } = await supabase
        .from('recurring_subscriptions')
        .insert({
          contact_id: finalContactId,
          plan_id: selectedPlan.id,
          start_date: startDate.toISOString().split('T')[0],
          next_billing_date: nextBillingDate.toISOString().split('T')[0],
          status: 'pending_payment',
          auto_renew: true,
          auto_invoice: true,
          auto_send: false,
          notes: 'Self-service signup via public portal'
        })
        .select()
        .single();

      if (subError) throw subError;

      // Initiate QuickBooks hosted payment
      const amount = selectedPlan.amount;
      const paymentResponse = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/initiate-quickbooks-payment`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            paymentType: 'vip_subscription',
            relatedId: subscription.id,
            contactId: finalContactId,
            amount: amount,
            description: `VIP Membership: ${selectedPlan.plan_name} - Initial Payment`,
            dueDate: new Date().toISOString().split('T')[0],
          }),
        }
      );

      if (!paymentResponse.ok) {
        const error = await paymentResponse.json();
        throw new Error(error.error || 'Failed to initiate payment');
      }

      const { paymentUrl } = await paymentResponse.json();

      // Mark signup attempt as pending payment
      if (signupAttemptId) {
        await supabase
          .from('signup_attempts')
          .update({
            status: 'pending_payment',
            contact_id: finalContactId,
            last_activity_at: new Date().toISOString(),
          })
          .eq('id', signupAttemptId);
      }

      // Redirect to QuickBooks hosted payment page
      window.location.href = paymentUrl;
    } catch (err: any) {
      console.error('Error processing payment:', err);
      throw new Error(err.message || 'Payment processing failed');
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

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-lg p-6 sm:p-8 max-w-md w-full">
          <div className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome to VIP!</h2>
            <p className="text-gray-600 mb-4">
              Your VIP membership is now active. You can log in to access your portal.
            </p>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 text-left">
              <p className="text-sm text-green-800 mb-2">
                <strong>Your VIP Benefits Include:</strong>
              </p>
              <ul className="text-sm text-green-700 space-y-1 list-disc list-inside">
                <li>Punchlist portal access</li>
                <li>Priority service scheduling</li>
                <li>Regular maintenance visits</li>
                <li>Dedicated support team</li>
              </ul>
            </div>
            <a
              href="/portal"
              className="inline-block w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold transition-all shadow-sm"
            >
              Go to Login
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-lg p-4 sm:p-6 lg:p-8 max-w-2xl w-full">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <a
            href="/portal/membership"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </a>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Join VIP Program</h1>
            <p className="text-sm sm:text-base text-gray-600">
              {step === 'info' && 'Create your account to get started'}
              {step === 'plan' && 'Choose your VIP plan'}
            </p>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 sm:gap-2">
              <div className={`w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center ${
                step === 'info' ? 'bg-blue-600 text-white' : 'bg-green-600 text-white'
              }`}>
                {step === 'info' ? '1' : <Check className="w-5 h-5" />}
              </div>
              <span className={`text-xs sm:text-sm font-medium ${step === 'info' ? 'text-gray-900' : 'text-gray-600'}`}>
                Your Info
              </span>
            </div>
            {!skipPlanSelection && (
              <>
                <div className="flex-1 h-px bg-gray-300 mx-2 sm:mx-3" />
                <div className="flex items-center gap-1 sm:gap-2">
                  <div className={`w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center ${
                    step === 'plan' ? 'bg-blue-600 text-white' : step === 'success' ? 'bg-green-600 text-white' : 'bg-gray-300 text-gray-600'
                  }`}>
                    {step === 'success' ? <Check className="w-5 h-5" /> : '2'}
                  </div>
                  <span className={`text-xs sm:text-sm font-medium hidden sm:inline ${step === 'plan' ? 'text-gray-900' : 'text-gray-600'}`}>
                    Choose Plan
                  </span>
                  <span className={`text-xs sm:text-sm font-medium sm:hidden ${step === 'plan' ? 'text-gray-900' : 'text-gray-600'}`}>
                    Plan
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Pre-selected Plan Banner */}
        {skipPlanSelection && selectedPlan && step === 'info' && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-3">
              <Star className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5 fill-blue-600" />
              <div>
                <p className="text-sm font-semibold text-blue-900 mb-1">
                  You've Selected: {selectedPlan.plan_name}
                </p>
                <p className="text-sm text-blue-700">
                  ${selectedPlan.amount} {getBillingFrequencyLabel(selectedPlan.billing_frequency)}
                </p>
                {selectedPlan.description && (
                  <p className="text-xs text-blue-600 mt-1">{selectedPlan.description}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Step 1: Basic Info */}
        {step === 'info' && (
          <form onSubmit={handleInfoSubmit} className="space-y-6">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-700">
                <span className="font-semibold">Quick Signup:</span> Just provide your basic contact information.
                {skipPlanSelection && ' Your plan is already selected - one less step!'}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-2">
                  First Name *
                </label>
                <input
                  id="firstName"
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-2">
                  Last Name *
                </label>
                <input
                  id="lastName"
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address *
              </label>
              <input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                Phone Number *
              </label>
              <input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-2">
                Service Address (Optional)
              </label>
              <AddressAutocomplete
                value={formData.address}
                onChange={(value, components) => {
                  setFormData(prev => ({
                    ...prev,
                    address: value,
                    city: components?.city || prev.city,
                    state: components?.state || prev.state,
                    zip: components?.zip || prev.zip,
                  }));
                }}
                placeholder="123 Main St (can be added later)"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">You can provide this during payment or skip for now</p>
            </div>

            {formData.address && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-2">
                    City
                  </label>
                  <input
                    id="city"
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="City"
                  />
                </div>

                <div>
                  <label htmlFor="state" className="block text-sm font-medium text-gray-700 mb-2">
                    State
                  </label>
                  <input
                    id="state"
                    type="text"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
                    maxLength={2}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="KS"
                  />
                </div>

                <div>
                  <label htmlFor="zip" className="block text-sm font-medium text-gray-700 mb-2">
                    ZIP Code
                  </label>
                  <input
                    id="zip"
                    type="text"
                    value={formData.zip}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 5);
                      setFormData({ ...formData, zip: value });
                    }}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="12345"
                  />
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <a
                href="/portal"
                className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-semibold text-center transition-all"
              >
                Cancel
              </a>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-all shadow-sm"
              >
                {loading ? 'Processing...' : skipPlanSelection ? 'Continue to Payment' : 'Continue to Plans'}
              </button>
            </div>
          </form>
        )}

        {/* Step 2: Plan Selection */}
        {step === 'plan' && (
          <div className="space-y-6">
            {selectedPlan && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <Star className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5 fill-blue-600" />
                  <div className="text-sm text-blue-900">
                    <p className="font-bold mb-1">You Selected: {selectedPlan.plan_name}</p>
                    <p className="text-blue-700">
                      This plan is highlighted below. You can continue with this plan or choose a different one.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex items-start gap-3">
              <Package className="w-5 h-5 text-gray-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-gray-700">
                <p className="font-medium mb-1">Choose Your VIP Plan</p>
                <p>
                  All plans include punchlist portal access, priority service scheduling, and regular maintenance visits.
                </p>
              </div>
            </div>

            {availablePlans.length > 0 ? (
              <div className="grid grid-cols-1 gap-4">
                {availablePlans.map((plan) => {
                  const isSelected = selectedPlan?.id === plan.id;
                  return (
                    <button
                      key={plan.id}
                      onClick={() => handlePlanSelect(plan)}
                      className={`relative rounded-lg p-6 text-left transition-all group ${
                        isSelected
                          ? 'bg-blue-50 border-2 border-blue-500 shadow-md'
                          : 'bg-white border-2 border-gray-200 hover:border-blue-400'
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute top-4 right-4">
                          <div className="bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                            <Star className="w-3 h-3 fill-current" />
                            Your Choice
                          </div>
                        </div>
                      )}

                      <div className="flex items-start justify-between mb-3 pr-24">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Package className={`w-5 h-5 ${isSelected ? 'text-blue-600' : 'text-gray-600'}`} />
                            <h3 className={`text-lg font-bold ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>
                              {plan.plan_name}
                            </h3>
                          </div>
                          {plan.description && (
                            <p className={`text-sm ${isSelected ? 'text-blue-700' : 'text-gray-600'}`}>
                              {plan.description}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <div className={`text-2xl font-bold ${isSelected ? 'text-blue-600' : 'text-gray-900'}`}>
                            ${plan.amount}
                          </div>
                          <div className={`text-sm ${isSelected ? 'text-blue-700' : 'text-gray-600'}`}>
                            {getBillingFrequencyLabel(plan.billing_frequency)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-sm mb-4">
                        <Check className={`w-4 h-4 ${isSelected ? 'text-blue-600' : 'text-green-600'}`} />
                        <span className={isSelected ? 'text-blue-900 font-medium' : 'text-gray-700'}>
                          Includes punchlist access & all VIP benefits
                        </span>
                      </div>

                      <div className={`flex items-center justify-end gap-2 text-sm font-medium ${
                        isSelected ? 'text-blue-600' : 'text-gray-500 opacity-0 group-hover:opacity-100'
                      }`}>
                        {isSelected ? 'Continue with this plan' : 'Select this plan'}
                        <ArrowRight className="w-4 h-4" />
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No VIP plans are currently available. Please contact us for more information.</p>
              </div>
            )}

            <div className="flex justify-start">
              <button
                onClick={() => setStep('info')}
                className="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium transition-colors"
              >
                Back
              </button>
            </div>
          </div>
        )}


        <div className="mt-6 pt-6 border-t border-gray-200 text-center space-y-4">
          <p className="text-sm text-gray-600">
            Already have an account?{' '}
            <a href="/portal" className="text-blue-600 hover:text-blue-700 font-medium">
              Log in here
            </a>
          </p>
          <div className="flex items-center justify-center gap-3 text-xs text-gray-500">
            <a
              href="/privacy-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-700 underline"
            >
              Privacy Policy
            </a>
            <span>•</span>
            <a
              href="/eula"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-700 underline"
            >
              Terms of Service
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
