import React, { useState, useEffect, useRef } from 'react';
import { securityOnboardingRequest, securityPaymentRequest, type SecurityDraftForm, type PortalSecurityAgreement, type SecurityAgreementDocument } from '../../lib/securityOnboarding';
import SecurityPaymentEnrollment from './SecurityPaymentEnrollment';
import { safeSecurityDraft, restoredSecurityStep } from '../../lib/securityOnboardingDraft';
import { readableAgreementTerms, securityAgreementHtml, printSecurityAgreement, downloadSecurityAgreement } from '../../lib/securityAgreementDocument';
import { formatCurrency } from '../../lib/utils';
import {
  ArrowRight, ArrowLeft, Check, User, Shield, Phone, CreditCard,
  Ligature as FileSignature, HelpCircle, Mail, Plus, Trash2, Lock,
  Loader2, AlertCircle, Receipt, Printer, Download, Save
} from 'lucide-react';
import { SignaturePad } from '../Production/SignaturePad';
import { calculateAnnualDiscount, type BillingPreference } from '../../lib/types';

interface OnboardingWizardProps {
  contract: PortalSecurityAgreement & SecurityAgreementDocument;
  token: string;
  onComplete: () => void;
}

const inputClass = 'w-full px-4 py-3.5 border border-gray-200 rounded-xl bg-white focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-gray-900 placeholder-gray-400 text-sm';
const labelClass = 'block text-sm font-semibold text-gray-700 mb-1.5';

export default function OnboardingWizard({ contract, token, onComplete }: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState(restoredSecurityStep(contract.draft?.current_step || 1));
  const [saving, setSaving] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const billingConfig = contract.document.dealer;
  const [billingPreference, setBillingPreference] = useState<BillingPreference>(
    contract.draft?.form_data?.billingPreference === 'annual' && billingConfig?.annual_billing_enabled ? 'annual' : 'monthly');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved');
  const [saveError, setSaveError] = useState('');
  const [paused, setPaused] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [autopayAccepted, setAutopayAccepted] = useState(false);
  const revision = useRef(contract.draft?.revision || 0);
  const saveQueue = useRef<Promise<boolean>>(Promise.resolve(true));
  const submitted = useRef(false);
  const [formData, setFormData] = useState<SecurityDraftForm>(() => ({
    personalInfo: {
      full_name: contract.draft?.form_data?.personalInfo?.full_name ?? contract.contact?.full_name ?? '',
      email: contract.draft?.form_data?.personalInfo?.email ?? contract.contact?.email ?? '',
      phone: contract.draft?.form_data?.personalInfo?.phone ?? contract.contact?.phone ?? ''
    },
    propertyInfo: {
      address_line1: contract.draft?.form_data?.propertyInfo?.address_line1 ?? contract.contact?.address_line1 ?? '',
      city: contract.draft?.form_data?.propertyInfo?.city ?? contract.contact?.city ?? '',
      state: contract.draft?.form_data?.propertyInfo?.state ?? contract.contact?.state ?? '',
      zip_code: contract.draft?.form_data?.propertyInfo?.zip_code ?? contract.contact?.zip_code ?? ''
    },
    emergencyContacts: contract.draft?.form_data?.emergencyContacts || [],
    paymentMethod: contract.draft?.form_data?.paymentMethod || '',
    paymentMethodId: contract.draft?.form_data?.paymentMethodId || '',
    signature: ''
  }));

  const steps = [
    { id: 1, name: 'Personal Info', icon: User },
    { id: 2, name: 'Property', icon: Shield },
    { id: 3, name: 'Contacts', icon: Phone },
    { id: 4, name: 'Payment', icon: CreditCard },
    { id: 5, name: 'Billing', icon: Receipt },
    { id: 6, name: 'Sign', icon: FileSignature }
  ];

  const draftJson = JSON.stringify({ form_data: safeSecurityDraft(formData, billingPreference), current_step: currentStep });
  const latestDraft = useRef(draftJson);
  latestDraft.current = draftJson;
  const lastSaved = useRef(contract.draft?.saved_at ? draftJson : '');
  const terms = readableAgreementTerms(contract.template?.contract_terms || '').replace(/\[term\]/g, `${contract.term_months || '__'} months`);

  function saveProgress(step = currentStep): Promise<boolean> {
    const draft = { form_data: safeSecurityDraft(formData, billingPreference), current_step: step };
    const serialized = JSON.stringify(draft);
    saveQueue.current = saveQueue.current.then(async () => {
      if (submitted.current || serialized === lastSaved.current) return true;
      setSaveStatus('saving'); setSaveError('');
      try {
        const result = await securityOnboardingRequest<{ revision: number }>('save', contract.id, token, { ...draft, revision: revision.current });
        revision.current = result.revision;
        lastSaved.current = serialized;
        setSaveStatus(latestDraft.current === serialized ? 'saved' : 'unsaved');
        return true;
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : 'Your progress could not be saved. Please try again.');
        setSaveStatus('error');
        return false;
      }
    });
    return saveQueue.current;
  }
  const persist = useRef(saveProgress);
  persist.current = saveProgress;

  useEffect(() => {
    if (draftJson === lastSaved.current || submitted.current) return;
    setSaveStatus('unsaved'); setPaused(false);
    const timer = window.setTimeout(() => { void persist.current(); }, 700);
    return () => window.clearTimeout(timer);
  }, [draftJson]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!submitted.current && latestDraft.current !== lastSaved.current) {
        event.preventDefault(); event.returnValue = '';
      }
    };
    const saveWhenHidden = () => { if (document.visibilityState === 'hidden') void persist.current(); };
    window.addEventListener('beforeunload', warn);
    document.addEventListener('visibilitychange', saveWhenHidden);
    return () => {
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('visibilitychange', saveWhenHidden);
    };
  }, []);

  function agreementHtml() {
    return securityAgreementHtml(contract.document, terms, formData, null, null, billingPreference);
  }

  function isStepComplete(): boolean {
    switch (currentStep) {
      case 1:
        return !!(
          formData.personalInfo.full_name?.trim() &&
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.personalInfo.email || '') &&
          /^[0-9]{10,15}$/.test((formData.personalInfo.phone || '').replace(/\D/g, ''))
        );
      case 2:
        return !!(
          formData.propertyInfo.address_line1?.trim() &&
          formData.propertyInfo.city?.trim() &&
          /^[A-Za-z]{2}$/.test(formData.propertyInfo.state || '') &&
          /^[0-9]{5}(-[0-9]{4})?$/.test(formData.propertyInfo.zip_code || '')
        );
      case 3:
        if (formData.emergencyContacts.length < 2 || formData.emergencyContacts.length > 10) return false;
        return formData.emergencyContacts.every(
          c => c.name?.trim() && /^[0-9]{10,15}$/.test((c.phone || '').replace(/\D/g, '')) && c.password?.trim()
        );
      case 4:
        return contract.billing_mode === 'mail' || !!formData.paymentMethodId;
      case 5:
        return !!billingPreference;
      case 6:
        return !!formData.signature && accepted && (contract.billing_mode === 'mail' || autopayAccepted) && !!terms.trim();
      default:
        return false;
    }
  }

  async function handleNext() {
    if (!isStepComplete()) {
      const messages: Record<number, string> = {
        1: 'Enter your full name, a valid email, and a phone number with 10–15 digits.',
        2: 'Enter the service address, city, two-letter state, and a valid ZIP code.',
        3: formData.emergencyContacts.length < 2
          ? 'Please add at least 2 emergency contacts.'
          : 'Enter a name, phone with 10–15 digits, and codeword for each of 2–10 emergency contacts.',
        4: 'Please add or select a saved payment method for AutoPay.',
        5: 'Please select a billing preference.',
        6: 'Please review the terms, acknowledge your agreement, and provide your signature.'
      };
      alert(messages[currentStep] || 'Please complete all required fields.');
      return;
    }
    if (await saveProgress(Math.min(steps.length, currentStep + 1))) {
      if (currentStep < steps.length) setCurrentStep(currentStep + 1);
    }
  }

  function handleBack() {
    if (currentStep > 1) {
      setFormData(previous => ({ ...previous, signature: '' })); setAccepted(false); setAutopayAccepted(false);
      setCurrentStep(currentStep - 1);
    }
  }

  async function handleSubmit() {
    if (!isStepComplete()) return;
    setSaving(true);
    try {
      if (!(await saveProgress())) return;
      if (contract.billing_mode !== 'mail') await securityPaymentRequest('verify', contract.id, token, { methodId: formData.paymentMethodId });
      const result = await securityOnboardingRequest<{ success: boolean }>('submit', contract.id, token, {
        revision: revision.current, form_data: safeSecurityDraft(formData, billingPreference),
        signature: formData.signature, accepted, autopay_accepted: autopayAccepted, document_version: contract.document_version,
      });
      if (!result.success) throw new Error('Agreement could not be submitted.');
      submitted.current = true;
      onComplete();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Agreement could not be submitted. Please try again.');
      setSaveStatus('error');
    } finally { setSaving(false); }
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

  function updateEmergencyContact<K extends keyof SecurityDraftForm['emergencyContacts'][number]>(index: number, field: K, value: SecurityDraftForm['emergencyContacts'][number][K]) {
    const updated = [...formData.emergencyContacts];
    updated[index] = { ...updated[index], [field]: value };
    setFormData({ ...formData, emergencyContacts: updated });
  }

  return (
    <div className="security-onboarding-controls relative">
      <div className="px-4 sm:px-8 py-5 bg-blue-50 border-b border-blue-100 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="font-semibold text-gray-900">Agreement {contract.contract_number}</p>
            <p className="text-sm text-gray-700">{formatCurrency(Number(contract.monthly_price) || 0)}/month · {contract.term_months} month initial term</p></div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { try { printSecurityAgreement(agreementHtml()); } catch (e) { setSaveError(e instanceof Error ? e.message : 'Printing failed.'); } }}
              className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium"><Printer className="w-4 h-4" />Print / Save PDF</button>
            <button onClick={() => downloadSecurityAgreement(agreementHtml(), contract.contract_number)}
              className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium"><Download className="w-4 h-4" />Download agreement</button>
          </div>
        </div>
        <details className="bg-white border border-gray-200 rounded-xl p-4">
          <summary className="font-semibold text-blue-900 cursor-pointer">Review terms and conditions</summary>
          <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{terms || 'Terms are unavailable. Contact your provider before signing.'}</div>
        </details>
        <div className="flex flex-wrap justify-between items-center gap-3">
          <p role="status" aria-live="polite" className="text-sm text-gray-700">{saveStatus === 'saved' ? 'All changes saved' : saveStatus === 'saving' ? 'Saving…' : saveStatus === 'error' ? 'Changes could not be saved' : 'Unsaved changes'}</p>
          <button onClick={async () => { if (await saveProgress()) setPaused(true); }} disabled={saving || saveStatus === 'saving'}
            className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-blue-900 border border-blue-200 bg-white rounded-lg disabled:opacity-50"><Save className="w-4 h-4" />Save and finish later</button>
        </div>
        {paused && <p role="status" className="text-sm text-green-800">Your place is saved. You can close this page and return using your invitation link or the Security section of your customer portal. You will review and sign again when you return.</p>}
        {saveError && <div role="alert" className="text-sm text-red-800 bg-red-50 border border-red-200 p-3 rounded-lg">{saveError}<button onClick={() => void saveProgress()} className="ml-3 underline font-semibold">Retry save</button></div>}
      </div>
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

        {/* Step 4: real processor enrollment; sensitive fields never enter the draft. */}
        {currentStep === 4 && (
          <div className="space-y-5">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Payment Method</h2>
            {contract.billing_mode === 'mail' ? <p className="text-gray-700 bg-blue-50 p-4 rounded-xl">Your Admin has authorized mailed invoices for this agreement. Mailed billing is included in the overall account price.</p> :
              <SecurityPaymentEnrollment contractId={contract.id} token={token} selectedId={formData.paymentMethodId}
                onSelect={method => { setFormData(previous => ({...previous,paymentMethodId:method.id,paymentMethod:method.payment_type === 'card' ? 'credit_card' : 'ach',signature:''})); setAccepted(false);setAutopayAccepted(false); }} />}
          </div>
        )}

        {/* Step 5: Billing Preference */}
        {currentStep === 5 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Your Services</h2>
              <p className="text-gray-500 text-sm mt-1">Review your selected services and choose how you'd like to pay.</p>
            </div>

            {/* Services Summary */}
            <div className="space-y-3">
              {/* Security Monitoring */}
              <div className="border border-gray-200 rounded-2xl p-4 bg-white">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900 text-sm">Security Monitoring</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {contract.term_months || 36} Month Agreement
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-gray-900">
                    {formatCurrency(Number(contract.monthly_price) || 0)}/month
                  </span>
                </div>
              </div>
            </div>

            {/* Monthly Total */}
            <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">Monthly Services Total</span>
                <span className="text-lg font-bold text-gray-900">
                  {formatCurrency(Number(contract.monthly_price) || 0)}/month
                </span>
              </div>
            </div>

            {/* Billing Preference Selection */}
            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-3">Choose Your Billing Preference</h3>
              <div className="space-y-3">
                {/* Monthly Option */}
                <button
                  onClick={() => setBillingPreference('monthly')}
                  className={`w-full text-left border-2 rounded-2xl p-4 transition-all ${
                    billingPreference === 'monthly'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-5 h-5 rounded-full border-2 mt-0.5 flex-shrink-0 flex items-center justify-center ${
                      billingPreference === 'monthly' ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                    }`}>
                      {billingPreference === 'monthly' && <div className="w-2 h-2 bg-white rounded-full" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-gray-900">Monthly Billing</span>
                        <span className="text-sm font-semibold text-gray-900">
                          {formatCurrency(Number(contract.monthly_price) || 0)}/month
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Pay {formatCurrency(Number(contract.monthly_price) || 0)} each month.</p>
                    </div>
                  </div>
                </button>

                {/* Annual Option */}
                {billingConfig?.annual_billing_enabled && (
                  <button
                    onClick={() => setBillingPreference('annual')}
                    className={`w-full text-left border-2 rounded-2xl p-4 transition-all ${
                      billingPreference === 'annual'
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-5 h-5 rounded-full border-2 mt-0.5 flex-shrink-0 flex items-center justify-center ${
                        billingPreference === 'annual' ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                      }`}>
                        {billingPreference === 'annual' && <div className="w-2 h-2 bg-white rounded-full" />}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-gray-900">Annual Billing</span>
                          {(() => {
                            const monthlyTotal = Number(contract.monthly_price) || 0;
                            const annualSubtotal = monthlyTotal * 12;
                            const discount = calculateAnnualDiscount(
                              annualSubtotal - (Number(contract.mail_invoice_fee) || 0) * 12,
                              billingConfig.annual_discount_type,
                              billingConfig.annual_discount_percentage,
                              billingConfig.annual_discount_flat_amount
                            );
                            const amountDue = annualSubtotal - discount;
                            return (
                              <span className="text-sm font-semibold text-gray-900">
                                {formatCurrency(amountDue)}/year
                              </span>
                            );
                          })()}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Pay one year in advance and receive a discount.</p>
                        {billingPreference === 'annual' && (() => {
                          const monthlyTotal = Number(contract.monthly_price) || 0;
                          const annualSubtotal = monthlyTotal * 12;
                          const discount = calculateAnnualDiscount(
                            annualSubtotal - (Number(contract.mail_invoice_fee) || 0) * 12,
                            billingConfig.annual_discount_type,
                            billingConfig.annual_discount_percentage,
                            billingConfig.annual_discount_flat_amount
                          );
                          const amountDue = annualSubtotal - discount;
                          return (
                            <div className="mt-3 bg-white border border-gray-200 rounded-xl p-3 space-y-1.5">
                              <div className="flex justify-between text-xs text-gray-600">
                                <span>Annual Subtotal</span>
                                <span>{formatCurrency(annualSubtotal)}</span>
                              </div>
                              {discount > 0 && (
                                <div className="flex justify-between text-xs text-green-600">
                                  <span>Annual Discount
                                    {billingConfig.annual_discount_type === 'percentage'
                                      ? ` (${billingConfig.annual_discount_percentage}%)`
                                      : ''}
                                  </span>
                                  <span>-{formatCurrency(discount)}</span>
                                </div>
                              )}
                              <div className="flex justify-between text-sm font-bold text-gray-900 pt-1.5 border-t border-gray-100">
                                <span>Annual Billing Amount</span>
                                <span>{formatCurrency(amountDue)}</span>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </button>
                )}
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <p className="text-sm text-blue-800 leading-relaxed">
                This is your billing preference for this agreement. Our team will confirm your payment setup and billing start date before activation.
              </p>
            </div>
          </div>
        )}

        {/* Step 6: Sign Agreement */}
        {currentStep === 6 && (
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
                  <div className="text-sm leading-relaxed whitespace-pre-wrap">{terms || 'Terms are unavailable. Please contact your provider before signing.'}</div>
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

            {contract.billing_mode !== 'mail' && <label className="flex items-start gap-3 text-sm text-gray-800 bg-gray-50 border rounded-xl p-4 cursor-pointer">
              <input type="checkbox" checked={autopayAccepted} onChange={e=>setAutopayAccepted(e.target.checked)} className="mt-1" />
              <span>{contract.autopay_authorization}</span>
            </label>}

            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <div className="text-sm text-blue-800 leading-relaxed">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} className="mt-1" />
                  <span>I have reviewed the agreement and agree to its terms and conditions. I intend to sign electronically.</span>
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Footer */}
      <div className="px-4 sm:px-8 py-4 sm:py-5 border-t border-gray-100 bg-gray-50 flex flex-col-reverse sm:flex-row justify-between gap-3">
        <button
          onClick={handleBack}
          disabled={currentStep === 1 || saving || saveStatus === 'saving'}
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
            disabled={saving || !isStepComplete()}
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
