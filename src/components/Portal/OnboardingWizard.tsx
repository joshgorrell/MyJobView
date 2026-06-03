import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  ArrowRight, ArrowLeft, Check, User, Shield, Phone, CreditCard,
  Ligature as FileSignature, HelpCircle, Mail, Plus, Trash2, Lock,
  Building2, Loader2, AlertCircle
} from 'lucide-react';
import { SignaturePad } from '../Production/SignaturePad';

interface OnboardingWizardProps {
  contract: any;
  token: string;
  onComplete: () => void;
}

const inputClass = 'w-full px-4 py-3.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-gray-900 placeholder-gray-400 text-sm';
const labelClass = 'block text-sm font-semibold text-gray-700 mb-1.5';

export default function OnboardingWizard({ contract, token, onComplete }: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [formData, setFormData] = useState({
    personalInfo: {
      full_name: contract.contact?.full_name || '',
      email: contract.contact?.email || '',
      phone: contract.contact?.phone || ''
    },
    propertyInfo: {
      address_line1: contract.contact?.address_line1 || '',
      city: contract.contact?.city || '',
      state: contract.contact?.state || '',
      zip_code: contract.contact?.zip_code || ''
    },
    emergencyContacts: [] as any[],
    paymentMethod: '',
    paymentDetails: {} as any,
    signature: ''
  });

  const steps = [
    { id: 1, name: 'Personal Info', icon: User },
    { id: 2, name: 'Property', icon: Shield },
    { id: 3, name: 'Contacts', icon: Phone },
    { id: 4, name: 'Payment', icon: CreditCard },
    { id: 5, name: 'Sign', icon: FileSignature }
  ];

  async function saveProgress() {
    try {
      const { error } = await supabase
        .from('onboarding_progress')
        .upsert({
          contract_id: contract.id,
          current_step: currentStep,
          form_data: formData,
          last_activity_at: new Date().toISOString()
        });
      if (error) throw error;
    } catch (error) {
      console.error('Error saving progress:', error);
    }
  }

  function isStepComplete(): boolean {
    switch (currentStep) {
      case 1:
        return !!(
          formData.personalInfo.full_name?.trim() &&
          formData.personalInfo.email?.trim() &&
          formData.personalInfo.phone?.trim()
        );
      case 2:
        return !!(
          formData.propertyInfo.address_line1?.trim() &&
          formData.propertyInfo.city?.trim() &&
          formData.propertyInfo.state?.trim() &&
          formData.propertyInfo.zip_code?.trim()
        );
      case 3:
        if (formData.emergencyContacts.length < 2) return false;
        return formData.emergencyContacts.every(
          c => c.name?.trim() && c.phone?.trim() && c.password?.trim()
        );
      case 4:
        if (!formData.paymentMethod) return false;
        if (formData.paymentMethod === 'credit_card') {
          return !!(
            formData.paymentDetails?.cardNumber?.length >= 15 &&
            formData.paymentDetails?.expiry?.match(/^\d{2}\/\d{2}$/) &&
            formData.paymentDetails?.cvv?.length >= 3 &&
            formData.paymentDetails?.lastFour
          );
        } else if (formData.paymentMethod === 'ach') {
          return !!(
            formData.paymentDetails?.routingNumber?.length === 9 &&
            formData.paymentDetails?.accountNumber?.length >= 4 &&
            formData.paymentDetails?.accountType &&
            formData.paymentDetails?.lastFour
          );
        }
        return false;
      case 5:
        return !!formData.signature;
      default:
        return false;
    }
  }

  async function handleNext() {
    if (!isStepComplete()) {
      const messages: Record<number, string> = {
        1: 'Please complete all required fields: Full Name, Email, and Phone Number.',
        2: 'Please complete all required fields: Service Address, City, State, and ZIP Code.',
        3: formData.emergencyContacts.length < 2
          ? 'Please add at least 2 emergency contacts.'
          : 'Please complete all fields for each emergency contact.',
        4: !formData.paymentMethod
          ? 'Please select a payment method.'
          : formData.paymentMethod === 'credit_card'
            ? 'Please complete all card fields: Card Number, Expiration Date, and CVV.'
            : 'Please complete all bank fields: Routing Number, Account Number, and Account Type.',
        5: 'Please provide your signature.'
      };
      alert(messages[currentStep] || 'Please complete all required fields.');
      return;
    }
    await saveProgress();
    if (currentStep < steps.length) setCurrentStep(currentStep + 1);
  }

  function handleBack() {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      let customerIp = '';
      try {
        const ipResponse = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipResponse.json();
        customerIp = ipData.ip || '';
      } catch {
        // IP fetch is best-effort
      }

      const emergencyContactsPayload = formData.emergencyContacts.map((ec, index) => ({
        name: ec.name,
        phone: ec.phone,
        password: ec.password,
        canAuthorize: ec.canAuthorize || false,
        priority_order: index + 1
      }));

      const { data, error } = await supabase.rpc('submit_security_onboarding', {
        p_token: token,
        p_full_name: formData.personalInfo.full_name,
        p_email: formData.personalInfo.email,
        p_phone: formData.personalInfo.phone,
        p_address_line1: formData.propertyInfo.address_line1,
        p_city: formData.propertyInfo.city,
        p_state: formData.propertyInfo.state,
        p_zip_code: formData.propertyInfo.zip_code,
        p_signature: formData.signature,
        p_customer_ip: customerIp,
        p_payment_method: formData.paymentMethod,
        p_payment_token: formData.paymentDetails?.token || null,
        p_last_four: formData.paymentDetails?.lastFour || null,
        p_emergency_contacts: emergencyContactsPayload
      });

      if (error) {
        console.error('RPC error:', error);
        throw error;
      }

      if (!data?.success) {
        console.error('Submission failed:', data?.error);
        throw new Error(data?.error || 'Submission failed');
      }

      onComplete();
    } catch (error: any) {
      console.error('Error submitting agreement:', error);
      const msg = error?.message || error?.details || 'Please try again.';
      alert(`Failed to submit agreement: ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  function addEmergencyContact() {
    setFormData({
      ...formData,
      emergencyContacts: [...formData.emergencyContacts, { name: '', phone: '', password: '', canAuthorize: false }]
    });
  }

  function removeEmergencyContact(index: number) {
    setFormData({
      ...formData,
      emergencyContacts: formData.emergencyContacts.filter((_, i) => i !== index)
    });
  }

  function updateEmergencyContact(index: number, field: string, value: any) {
    const updated = [...formData.emergencyContacts];
    updated[index] = { ...updated[index], [field]: value };
    setFormData({ ...formData, emergencyContacts: updated });
  }

  return (
    <div className="relative">
      {/* Step Progress Header */}
      <div className="px-4 sm:px-8 pt-6 pb-4 border-b border-gray-100 bg-white">
        {/* Mobile step indicator */}
        <div className="flex items-center justify-between mb-4 sm:hidden">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Step {currentStep} of {steps.length}
          </span>
          <span className="text-sm font-semibold text-[#0f2347]">
            {steps[currentStep - 1].name}
          </span>
        </div>

        {/* Progress bar + step dots */}
        <div className="flex items-center">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isCompleted = currentStep > step.id;
            const isActive = currentStep === step.id;
            return (
              <React.Fragment key={step.id}>
                <div className="flex flex-col items-center">
                  <div
                    className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all duration-200 border-2 ${
                      isCompleted
                        ? 'bg-green-500 border-green-500 text-white shadow-sm'
                        : isActive
                        ? 'bg-[#0f2347] border-[#0f2347] text-white shadow-md'
                        : 'bg-white border-gray-200 text-gray-400'
                    }`}
                  >
                    {isCompleted
                      ? <Check className="w-4 h-4 sm:w-5 sm:h-5" />
                      : <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                    }
                  </div>
                  <span className={`text-xs mt-1.5 font-medium hidden sm:block text-center whitespace-nowrap ${
                    isActive ? 'text-[#0f2347]' : isCompleted ? 'text-green-600' : 'text-gray-400'
                  }`}>
                    {step.name}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1 sm:mx-2 transition-all duration-300 rounded-full ${
                    currentStep > step.id ? 'bg-green-400' : 'bg-gray-200'
                  }`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Step Content */}
      <div className="px-4 sm:px-8 py-6 sm:py-8 min-h-[360px]">

        {/* Step 1: Personal Info */}
        {currentStep === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Personal Information</h2>
              <p className="text-gray-500 text-sm mt-1">Please verify and complete your contact details.</p>
            </div>

            {!contract.contact?.phone && (
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-300 rounded-xl p-4">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-900 leading-relaxed">
                  <strong>Phone number is required.</strong> We don't have a phone number on file for you — please enter it below before continuing.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className={labelClass}>
                  Full Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.personalInfo.full_name}
                  onChange={(e) => setFormData({ ...formData, personalInfo: { ...formData.personalInfo, full_name: e.target.value } })}
                  placeholder="Enter your full legal name"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>
                  Email Address <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  value={formData.personalInfo.email}
                  onChange={(e) => setFormData({ ...formData, personalInfo: { ...formData.personalInfo, email: e.target.value } })}
                  placeholder="your@email.com"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>
                  Phone Number <span className="text-red-400">*</span>
                  {!contract.contact?.phone && (
                    <span className="ml-2 text-xs font-normal text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">Required — not on file</span>
                  )}
                </label>
                <input
                  type="tel"
                  value={formData.personalInfo.phone}
                  onChange={(e) => setFormData({ ...formData, personalInfo: { ...formData.personalInfo, phone: e.target.value } })}
                  placeholder="(123) 456-7890"
                  className={`${inputClass} ${!contract.contact?.phone ? 'border-amber-300 bg-amber-50 focus:border-amber-400' : ''}`}
                  autoFocus={!contract.contact?.phone}
                />
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <p className="text-sm text-blue-800 leading-relaxed">
                All fields are required. This information will be used to set up your security monitoring account.
              </p>
            </div>
          </div>
        )}

        {/* Step 2: Property Details */}
        {currentStep === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Property Details</h2>
              <p className="text-gray-500 text-sm mt-1">Address where your security system will be monitored.</p>
            </div>

            {!contract.contact?.address_line1 && (
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-300 rounded-xl p-4">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-900 leading-relaxed">
                  <strong>Service address is required.</strong> We don't have an address on file for your property — please enter it below before continuing.
                </p>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className={labelClass}>
                  Service Address <span className="text-red-400">*</span>
                  {!contract.contact?.address_line1 && (
                    <span className="ml-2 text-xs font-normal text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">Required — not on file</span>
                  )}
                </label>
                <input
                  type="text"
                  value={formData.propertyInfo.address_line1}
                  onChange={(e) => setFormData({ ...formData, propertyInfo: { ...formData.propertyInfo, address_line1: e.target.value } })}
                  placeholder="Street address"
                  className={`${inputClass} ${!contract.contact?.address_line1 ? 'border-amber-300 bg-amber-50 focus:border-amber-400' : ''}`}
                  autoFocus={!contract.contact?.address_line1}
                />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="col-span-2 md:col-span-2">
                  <label className={labelClass}>
                    City <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.propertyInfo.city}
                    onChange={(e) => setFormData({ ...formData, propertyInfo: { ...formData.propertyInfo, city: e.target.value } })}
                    placeholder="City"
                    className={inputClass}
                  />
                </div>
                <div className="col-span-1 md:col-span-2">
                  <label className={labelClass}>
                    State <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.propertyInfo.state}
                    onChange={(e) => setFormData({ ...formData, propertyInfo: { ...formData.propertyInfo, state: e.target.value } })}
                    placeholder="State"
                    className={inputClass}
                  />
                </div>
                <div className="col-span-1 md:col-span-1">
                  <label className={labelClass}>
                    ZIP <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.propertyInfo.zip_code}
                    onChange={(e) => setFormData({ ...formData, propertyInfo: { ...formData.propertyInfo, zip_code: e.target.value } })}
                    placeholder="ZIP"
                    maxLength={10}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <p className="text-sm text-blue-800 leading-relaxed">
                Please verify the address where your security system is installed. This is where our monitoring station will dispatch emergency services.
              </p>
            </div>
          </div>
        )}

        {/* Step 3: Emergency Contacts */}
        {currentStep === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Emergency Contacts</h2>
              <p className="text-gray-500 text-sm mt-1">Add at least 2 contacts for our monitoring station call list.</p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm text-amber-900 leading-relaxed">
                <strong>Required: Minimum 2 contacts.</strong> They will be called in order when an alarm is triggered. Each contact needs a unique codeword to verify their identity with our monitoring team.
              </p>
            </div>

            {formData.emergencyContacts.length > 0 && (
              <div className="space-y-3">
                {formData.emergencyContacts.map((contact, index) => (
                  <div key={index} className="border border-gray-200 rounded-2xl p-4 sm:p-5 bg-white shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-[#0f2347] text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                          {index + 1}
                        </div>
                        <span className="font-semibold text-gray-900">Contact {index + 1}</span>
                      </div>
                      <button
                        onClick={() => removeEmergencyContact(index)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-3">
                      <div>
                        <label className={labelClass}>
                          Full Name <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="text"
                          value={contact.name}
                          onChange={(e) => updateEmergencyContact(index, 'name', e.target.value)}
                          placeholder="Full name"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>
                          Phone <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="tel"
                          value={contact.phone}
                          onChange={(e) => updateEmergencyContact(index, 'phone', e.target.value)}
                          placeholder="(123) 456-7890"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>
                          Codeword <span className="text-red-400">*</span>
                        </label>
                        <div className="relative">
                          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                          <input
                            type="text"
                            value={contact.password}
                            onChange={(e) => updateEmergencyContact(index, 'password', e.target.value)}
                            placeholder="Unique codeword"
                            className={`${inputClass} pl-10`}
                          />
                        </div>
                        <p className="text-xs text-gray-400 mt-1">Used to verify identity</p>
                      </div>
                    </div>
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={contact.canAuthorize}
                        onChange={(e) => updateEmergencyContact(index, 'canAuthorize', e.target.checked)}
                        className="w-4 h-4 text-[#0f2347] rounded focus:ring-2 focus:ring-blue-500 border-gray-300"
                      />
                      <span className="text-sm text-gray-700">Can authorize entry to the property</span>
                    </label>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={addEmergencyContact}
              className="w-full flex items-center justify-center gap-2.5 py-3.5 border-2 border-dashed border-gray-300 hover:border-[#0f2347] text-gray-500 hover:text-[#0f2347] rounded-2xl font-medium transition-colors text-sm"
            >
              <Plus className="w-4 h-4" />
              Add Emergency Contact
            </button>

            {formData.emergencyContacts.length < 2 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                <p className="text-sm text-red-700 font-medium">
                  {2 - formData.emergencyContacts.length} more contact{2 - formData.emergencyContacts.length > 1 ? 's' : ''} required to proceed
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Payment Method */}
        {currentStep === 4 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Payment Method</h2>
              <p className="text-gray-500 text-sm mt-1">Set up automatic monthly billing for your monitoring service.</p>
            </div>

            {/* Billing summary */}
            <div className="bg-[#0f2347] rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <p className="text-blue-200 text-sm font-medium">Monthly monitoring fee</p>
                <p className="text-white text-xs mt-0.5 opacity-70">Drafted on the 1st of each month</p>
              </div>
              <div className="text-3xl sm:text-4xl font-bold text-white">
                ${contract.monthly_price ? parseFloat(contract.monthly_price).toFixed(2) : '—'}
              </div>
            </div>

            <div>
              <label className={labelClass}>
                Select Payment Method <span className="text-red-400">*</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setFormData({ ...formData, paymentMethod: 'credit_card', paymentDetails: {} })}
                  className={`p-4 sm:p-5 border-2 rounded-2xl transition-all text-left ${
                    formData.paymentMethod === 'credit_card'
                      ? 'border-[#0f2347] bg-[#0f2347]/5'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <CreditCard className={`w-7 h-7 mb-2.5 ${formData.paymentMethod === 'credit_card' ? 'text-[#0f2347]' : 'text-gray-400'}`} />
                  <div className={`font-semibold text-sm sm:text-base ${formData.paymentMethod === 'credit_card' ? 'text-[#0f2347]' : 'text-gray-700'}`}>
                    Credit Card
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">Visa, Mastercard, Amex</div>
                </button>

                <button
                  onClick={() => setFormData({ ...formData, paymentMethod: 'ach', paymentDetails: {} })}
                  className={`p-4 sm:p-5 border-2 rounded-2xl transition-all text-left ${
                    formData.paymentMethod === 'ach'
                      ? 'border-[#0f2347] bg-[#0f2347]/5'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <Building2 className={`w-7 h-7 mb-2.5 ${formData.paymentMethod === 'ach' ? 'text-[#0f2347]' : 'text-gray-400'}`} />
                  <div className={`font-semibold text-sm sm:text-base ${formData.paymentMethod === 'ach' ? 'text-[#0f2347]' : 'text-gray-700'}`}>
                    Bank Account
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">ACH direct debit</div>
                </button>
              </div>
            </div>

            {formData.paymentMethod === 'credit_card' && (
              <div className="border border-gray-200 rounded-2xl p-5 bg-gray-50 space-y-4">
                <h3 className="font-semibold text-gray-900 text-sm">Card Details</h3>
                <div>
                  <label className={labelClass}>
                    Card Number <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="1234 5678 9012 3456"
                    maxLength={19}
                    value={formData.paymentDetails?.cardNumber || ''}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '');
                      const formatted = value.replace(/(\d{4})/g, '$1 ').trim();
                      setFormData({
                        ...formData,
                        paymentDetails: {
                          ...formData.paymentDetails,
                          cardNumber: formatted,
                          lastFour: value.slice(-4),
                          token: 'mock_token_' + Date.now()
                        }
                      });
                    }}
                    className={inputClass}
                  />
                  <p className="text-xs text-gray-400 mt-1">15–16 digit card number</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>
                      Expiry <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="MM/YY"
                      maxLength={5}
                      value={formData.paymentDetails?.expiry || ''}
                      onChange={(e) => {
                        let value = e.target.value.replace(/\D/g, '');
                        if (value.length >= 2) value = value.slice(0, 2) + '/' + value.slice(2, 4);
                        setFormData({ ...formData, paymentDetails: { ...formData.paymentDetails, expiry: value } });
                      }}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>
                      CVV <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="123"
                      maxLength={4}
                      value={formData.paymentDetails?.cvv || ''}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, '');
                        setFormData({ ...formData, paymentDetails: { ...formData.paymentDetails, cvv: value } });
                      }}
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
            )}

            {formData.paymentMethod === 'ach' && (
              <div className="border border-gray-200 rounded-2xl p-5 bg-gray-50 space-y-4">
                <h3 className="font-semibold text-gray-900 text-sm">Bank Account Details</h3>
                <div>
                  <label className={labelClass}>
                    Routing Number <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="123456789"
                    maxLength={9}
                    value={formData.paymentDetails?.routingNumber || ''}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '');
                      setFormData({ ...formData, paymentDetails: { ...formData.paymentDetails, routingNumber: value } });
                    }}
                    className={inputClass}
                  />
                  <p className="text-xs text-gray-400 mt-1">9-digit routing number</p>
                </div>
                <div>
                  <label className={labelClass}>
                    Account Number <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Your account number"
                    value={formData.paymentDetails?.accountNumber || ''}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '');
                      setFormData({
                        ...formData,
                        paymentDetails: {
                          ...formData.paymentDetails,
                          accountNumber: value,
                          lastFour: value.slice(-4),
                          token: 'mock_token_' + Date.now()
                        }
                      });
                    }}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>
                    Account Type <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={formData.paymentDetails?.accountType || ''}
                    onChange={(e) => setFormData({ ...formData, paymentDetails: { ...formData.paymentDetails, accountType: e.target.value } })}
                    className={inputClass}
                  >
                    <option value="">Select account type</option>
                    <option value="checking">Checking</option>
                    <option value="savings">Savings</option>
                  </select>
                </div>
              </div>
            )}

            {formData.paymentMethod && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-xs text-amber-900 leading-relaxed">
                  Your payment information is securely processed through QuickBooks Online. You will receive an invoice each month before any charge is processed.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 5: Sign Agreement */}
        {currentStep === 5 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Sign Agreement</h2>
              <p className="text-gray-500 text-sm mt-1">Review and sign your security monitoring agreement.</p>
            </div>

            <div className="border border-gray-200 rounded-2xl overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 text-sm">Security Monitoring Agreement</h3>
                <span className="text-xs text-gray-500 bg-white border border-gray-200 rounded-full px-2.5 py-1">
                  Scroll to read
                </span>
              </div>
              <div className="p-4 sm:p-6 max-h-56 sm:max-h-80 overflow-y-auto bg-white">
                <div className="prose prose-sm max-w-none text-gray-700">
                  <div
                    className="text-xs sm:text-sm leading-relaxed"
                    dangerouslySetInnerHTML={{
                      __html: (contract.template?.contract_terms || '<p>Terms and conditions...</p>')
                        .replace(/\[term\]/g, `${contract.term_months || '__'} months`)
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="border-2 border-dashed border-gray-200 rounded-2xl p-5 bg-gray-50">
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                Your Signature <span className="text-red-400">*</span>
              </label>

              {formData.signature ? (
                <div className="space-y-3">
                  <div className="border border-gray-200 rounded-xl p-4 bg-white">
                    <img src={formData.signature} alt="Your signature" className="max-h-20 sm:max-h-28 mx-auto" />
                  </div>
                  <button
                    onClick={() => setShowSignaturePad(true)}
                    className="w-full py-2.5 border border-gray-300 text-gray-600 hover:bg-gray-50 rounded-xl font-medium text-sm transition-colors"
                  >
                    Re-sign
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowSignaturePad(true)}
                  className="w-full py-4 bg-[#0f2347] hover:bg-[#1a3a6e] text-white rounded-xl font-semibold flex items-center justify-center gap-2.5 transition-colors"
                >
                  <FileSignature className="w-5 h-5" />
                  Tap to Sign
                </button>
              )}
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <p className="text-sm text-blue-800 leading-relaxed">
                By signing, you acknowledge that you have read and agree to all terms and conditions of this security monitoring agreement.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Footer */}
      <div className="px-4 sm:px-8 py-4 sm:py-5 border-t border-gray-100 bg-gray-50 flex flex-col-reverse sm:flex-row justify-between gap-3">
        <button
          onClick={handleBack}
          disabled={currentStep === 1}
          className="flex items-center justify-center gap-2 px-5 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-white font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        {currentStep < steps.length ? (
          <button
            onClick={handleNext}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-[#0f2347] hover:bg-[#1a3a6e] text-white rounded-xl font-semibold transition-all text-sm min-h-[44px] shadow-sm"
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={saving || !formData.signature || !formData.paymentMethod || formData.emergencyContacts.length < 2}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm min-h-[44px] shadow-sm"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Submit Agreement
              </>
            )}
          </button>
        )}
      </div>

      {/* Floating Help Button */}
      <button
        onClick={() => setShowSupportModal(true)}
        className="fixed bottom-5 right-5 sm:bottom-7 sm:right-7 bg-[#0f2347] text-white w-12 h-12 rounded-full shadow-lg hover:bg-[#1a3a6e] transition-all hover:scale-105 z-40 flex items-center justify-center"
        aria-label="Need Help?"
      >
        <HelpCircle className="w-5 h-5" />
      </button>

      {/* Support Modal */}
      {showSupportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 bg-[#0f2347]/10 rounded-xl flex items-center justify-center">
                <HelpCircle className="w-6 h-6 text-[#0f2347]" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Need Help?</h3>
                <p className="text-sm text-gray-500">Our team is here to assist you</p>
              </div>
            </div>

            <a
              href={`mailto:support@electroniclife.com?subject=Security Agreement Onboarding Question&body=Agreement Number: ${contract.contract_number}%0D%0A%0D%0AYour question here...`}
              className="flex items-center gap-3 p-4 border-2 border-gray-200 hover:border-[#0f2347] hover:bg-[#0f2347]/5 rounded-xl transition-all mb-4"
            >
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Mail className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <div className="font-semibold text-gray-900 text-sm">Email Support</div>
                <div className="text-xs text-gray-500 mt-0.5">support@electroniclife.com</div>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400 ml-auto" />
            </a>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-5">
              <p className="text-xs text-gray-600">
                <span className="font-semibold">Agreement #:</span> {contract.contract_number}
              </p>
              <p className="text-xs text-gray-400 mt-1">Include this number when contacting support.</p>
            </div>

            <button
              onClick={() => setShowSupportModal(false)}
              className="w-full py-3 border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-xl font-medium text-sm transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Signature Pad Modal */}
      {showSignaturePad && (
        <SignaturePad
          onSave={(signature) => {
            setFormData({ ...formData, signature });
            setShowSignaturePad(false);
          }}
          onCancel={() => setShowSignaturePad(false)}
        />
      )}
    </div>
  );
}
