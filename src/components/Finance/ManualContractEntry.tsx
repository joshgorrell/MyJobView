import { useState, useEffect, useRef } from 'react';
import { staffSecurityOnboarding, securityPaymentRequest } from '../../lib/securityOnboarding';
import SecurityPaymentEnrollment from '../Portal/SecurityPaymentEnrollment';
import { supabase } from '../../lib/supabase';
import { Save, X, Plus, Trash2, User, MapPin, Phone, Shield, Printer, Home, Building2 } from 'lucide-react';

interface ManualContractEntryProps {
  contract: any;
  onClose: () => void;
  onComplete: () => void;
}

export default function ManualContractEntry({ contract, onClose, onComplete }: ManualContractEntryProps) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const baseline = useRef('');
  const [saving, setSaving] = useState(false);
  const [paperSigned, setPaperSigned] = useState(false);
  const [autopayAccepted, setAutopayAccepted] = useState(false);
  const [documentVersion, setDocumentVersion] = useState('');
  const [annualAvailable,setAnnualAvailable] = useState(false);
  const [billingMode, setBillingMode] = useState('autopay');
  const [contractData, setContractData] = useState<any>(null);
  const [formData, setFormData] = useState({
    personalInfo: { full_name: '', email: '', phone: '' },
    propertyAddress: '',
    propertyCity: '',
    propertyState: '',
    propertyZip: '',
    emergencyContacts: Array.from({ length: 2 }, () => ({ name: '', phone: '', password: '', canAuthorize: false })),
    paymentMethod: 'credit_card' as 'credit_card' | 'ach',
    paymentMethodId: '',
    billingPreference: 'monthly',
    accountType: '' as 'residential' | 'commercial' | '',
    accountServices: [] as string[]
  });

  useEffect(() => {
    loadContractData();
  }, [contract.id]);

  async function loadContractData() {
    setLoading(true);
    setLoadError('');
    try {
      const { data, error } = await supabase.from('security_contracts')
        .select('*, contact:contacts(*), template:security_contract_templates(*), emergency_contacts:security_contract_emergency_contacts(*)')
        .eq('id', contract.id).single();
      if (error) throw error;
      const agreement = await staffSecurityOnboarding<any>('get', contract.id);
      if (agreement.customer_completed_at || !['draft', 'pending_customer', 'rejected'].includes(agreement.status)) {
        throw new Error('This agreement has already been submitted. Open its review screen to make corrections.');
      }
      const annual = agreement.document.dealer?.annual_billing_enabled === true;
      const next = {
        personalInfo: { full_name: data.contact.full_name || `${data.contact.first_name || ''} ${data.contact.last_name || ''}`.trim(), email: data.contact.email || '', phone: data.contact.phone || '' },
        propertyAddress: data.property_address || data.contact.street_address || '',
        propertyCity: data.property_city || data.contact.city || '',
        propertyState: data.property_state || data.contact.state || '',
        propertyZip: data.property_zip || data.contact.zip_code || '',
        emergencyContacts: data.emergency_contacts?.length ? [...data.emergency_contacts].sort((a, b) => a.priority_order - b.priority_order).map(c => ({ name: c.contact_name, phone: c.phone_number, password: c.password_codeword, canAuthorize: c.can_authorize_entry })) : Array.from({ length: 2 }, () => ({ name: '', phone: '', password: '', canAuthorize: false })),
        paymentMethod: 'credit_card' as 'credit_card' | 'ach', paymentMethodId: '',
        billingPreference: annual && agreement.document.billingPreference === 'annual' ? 'annual' : 'monthly',
        accountType: (data.account_type || '') as 'residential' | 'commercial' | '', accountServices: data.account_services || [],
      };
      setContractData(data);
      setDocumentVersion(agreement.document_version);
      setBillingMode(agreement.document.billing_mode);
      setAnnualAvailable(annual);
      setFormData(next);
      setPaperSigned(false); setAutopayAccepted(false);
      baseline.current = JSON.stringify(next);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to load contract data');
    } finally { setLoading(false); }
  }

  useEffect(() => {
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (JSON.stringify(formData) !== baseline.current || paperSigned || autopayAccepted) {
        event.preventDefault(); event.returnValue = '';
      }
    };
    if (!loading && !loadError) window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [formData, paperSigned, autopayAccepted, loading, loadError]);

  function closeEntry() {
    if (saving) return;
    if ((JSON.stringify(formData) !== baseline.current || paperSigned || autopayAccepted) &&
        !window.confirm('Discard this unsaved manual entry? This information has not been submitted.')) return;
    onClose();
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

  async function handleSave() {
    if (saving || loading || loadError || !documentVersion) return;
    if (!paperSigned) {
      alert('Confirm that the customer signed the paper agreement before completing onboarding.');
      return;
    }
    if (formData.emergencyContacts.length < 2) {
      alert('Please add at least 2 emergency contacts');
      return;
    }

    const missingFields = formData.emergencyContacts.some(c => !c.name || !c.phone || !c.password);
    if (missingFields) {
      alert('Please fill in all emergency contact fields (name, phone, password)');
      return;
    }

    if (!formData.accountType) {
      alert('Please select an Account Type (Residential or Commercial)');
      return;
    }

    if (!formData.propertyAddress || !formData.propertyCity || !formData.propertyState || !formData.propertyZip) {
      alert('Please fill in all property address fields');
      return;
    }

    setSaving(true);
    try {
      if (billingMode !== 'mail') {
        if (!formData.paymentMethodId || !autopayAccepted) throw new Error('Select a saved payment method and confirm the signed AutoPay authorization.');
        await securityPaymentRequest('verify', contract.id, '', { methodId: formData.paymentMethodId });
      }
      await staffSecurityOnboarding('paper', contract.id, {
        paper_signed: paperSigned, autopay_accepted: autopayAccepted, document_version: documentVersion,
        account_type: formData.accountType, account_services: formData.accountServices,
        form_data: {
          personalInfo: formData.personalInfo,
          propertyInfo: { address_line1: formData.propertyAddress, city: formData.propertyCity, state: formData.propertyState, zip_code: formData.propertyZip },
          emergencyContacts: formData.emergencyContacts, paymentMethodId: formData.paymentMethodId,
          paymentMethod: formData.paymentMethod, billingPreference: formData.billingPreference,
        },
      });

      alert('Contract information saved successfully!');
      onComplete();
    } catch (error) {
      console.error('Error saving contract:', error);
      alert(error instanceof Error ? error.message : 'Failed to save contract information');
    } finally {
      setSaving(false);
    }
  }

  async function handlePrintBlankForm() {
    const printTab = window.open('', '_blank');
    if (!printTab) {
      alert('Please allow popups to print this form.');
      return;
    }
    printTab.document.write('<p>Preparing printable onboarding form...</p>');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Please sign in to print this form.');
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-blank-contract-form?contractId=${encodeURIComponent(contract.id)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) throw new Error('The printable form could not be loaded.');
      printTab.document.open();
      printTab.document.write(await response.text());
      printTab.document.close();
    } catch (error) {
      printTab.close();
      alert(error instanceof Error ? error.message : 'Could not print the form.');
    }
  }

  if (loading) {
    return (
      <div className="security-onboarding-controls fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <div className="text-center">Loading contract data...</div>
        </div>
      </div>
    );
  }

  if (loadError) return <div className="security-onboarding-controls fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div role="alert" className="bg-white text-gray-900 rounded-lg p-8 space-y-4">
      <h2 className="font-semibold">Unable to open manual entry</h2><p>{loadError}</p>
      <button onClick={() => void loadContractData()} className="border rounded px-4 py-2">Retry</button>
      <button onClick={onClose} className="border rounded px-4 py-2 ml-3">Close</button>
    </div>
  </div>;

  return (
    <div className="security-onboarding-controls responsive-modal-overlay fixed inset-0 bg-black bg-opacity-50 overflow-y-auto z-50">
      <div className="responsive-modal-layout min-h-screen px-4 py-8">
        <div className="responsive-modal-panel max-w-4xl mx-auto bg-white rounded-lg shadow-xl">
          <div className="border-b border-gray-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Manual Contract Entry</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Fill out contract information on behalf of customer
                </p>
              </div>
              <button
                onClick={closeEntry} disabled={saving}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <fieldset disabled={saving} className="p-6 space-y-6">
            <p className="text-sm text-gray-700">Enter the completed paper form here and keep the signed original with the customer record.</p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Printer className="w-5 h-5 text-blue-600 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-blue-900 mb-2">
                    <strong>Need a printable form?</strong> You can print a blank contract form for the customer to fill out by hand, then enter their information here.
                  </p>
                  <button
                    onClick={handlePrintBlankForm}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                  >
                    <Printer className="w-4 h-4 inline mr-2" />
                    Print Blank Contract Form
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Customer Information</h3>
              {(['full_name','email','phone'] as const).map(field => <label key={field} className="block text-sm font-medium text-gray-700 mb-3">
                {field==='full_name'?'Full name':field==='email'?'Email':'Phone'}
                <input type={field==='email'?'email':field==='phone'?'tel':'text'} value={formData.personalInfo[field]} onChange={e=>setFormData(prev=>({...prev,personalInfo:{...prev.personalInfo,[field]:e.target.value}}))} className="block w-full border border-gray-300 rounded-lg px-4 py-2 mt-1" />
              </label>)}
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-4">
                <User className="w-5 h-5 text-gray-600" />
                <h3 className="font-semibold text-gray-900">Customer Information</h3>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Name:</span>
                  <span className="ml-2 font-medium">{contractData?.contact?.full_name}</span>
                </div>
                <div>
                  <span className="text-gray-600">Email:</span>
                  <span className="ml-2 font-medium">{contractData?.contact?.email}</span>
                </div>
                <div>
                  <span className="text-gray-600">Phone:</span>
                  <span className="ml-2 font-medium">{contractData?.contact?.phone}</span>
                </div>
                <div>
                  <span className="text-gray-600">Contract #:</span>
                  <span className="ml-2 font-medium">{contractData?.contract_number}</span>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-4">
                <Shield className="w-5 h-5 text-gray-600" />
                <h3 className="font-semibold text-gray-900">Account Classification</h3>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Account Type <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-3">
                    {(['residential', 'commercial'] as const).map(type => {
                      const isActive = formData.accountType === type;
                      const activeClass = type === 'residential'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : 'border-blue-500 bg-blue-50 text-blue-700';
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setFormData({ ...formData, accountType: type })}
                          className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-colors ${
                            isActive ? activeClass : 'border-gray-200 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          {type === 'residential' ? <Home className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
                          <span className="capitalize">{type}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Service Type</label>
                  <p className="text-xs text-gray-500 mb-3">Select all that apply</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { key: 'dial_up', label: 'Dial-Up' },
                      { key: 'telguard', label: 'Telguard' },
                      { key: 'alarmnet', label: 'Alarmnet' },
                      { key: 'alarm_com', label: 'Alarm.com' },
                      { key: 'video_monitoring', label: 'Video / CCTV' },
                      { key: 'access_control', label: 'Access Control' },
                    ].map(svc => {
                      const checked = formData.accountServices.includes(svc.key);
                      return (
                        <label
                          key={svc.key}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                            checked
                              ? 'border-blue-400 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData({ ...formData, accountServices: [...formData.accountServices, svc.key] });
                              } else {
                                setFormData({ ...formData, accountServices: formData.accountServices.filter(s => s !== svc.key) });
                              }
                            }}
                            className="w-4 h-4 rounded border-gray-300"
                          />
                          <span className="text-sm text-gray-700">{svc.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="w-5 h-5 text-gray-600" />
                <h3 className="font-semibold text-gray-900">Property Address</h3>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Street Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.propertyAddress}
                    onChange={(e) => setFormData({ ...formData, propertyAddress: e.target.value })}
                    placeholder="123 Main St"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      City <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.propertyCity}
                      onChange={(e) => setFormData({ ...formData, propertyCity: e.target.value })}
                      placeholder="City"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      State <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.propertyState}
                      onChange={(e) => setFormData({ ...formData, propertyState: e.target.value })}
                      placeholder="State"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      ZIP Code <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.propertyZip}
                      onChange={(e) => setFormData({ ...formData, propertyZip: e.target.value })}
                      placeholder="ZIP"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Phone className="w-5 h-5 text-gray-600" />
                  <h3 className="font-semibold text-gray-900">Emergency Call List (Minimum 2)</h3>
                </div>
                <button
                  onClick={addEmergencyContact}
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Add Contact
                </button>
              </div>
              <div className="space-y-4">
                {formData.emergencyContacts.map((contact, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                          {index + 1}
                        </div>
                        <span className="text-sm font-medium text-gray-700">Contact {index + 1}</span>
                      </div>
                      {formData.emergencyContacts.length > 2 && (
                        <button
                          onClick={() => removeEmergencyContact(index)}
                          className="p-1 hover:bg-red-50 rounded text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-4 mb-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Full Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={contact.name}
                          onChange={(e) => updateEmergencyContact(index, 'name', e.target.value)}
                          placeholder="Full name"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Phone Number <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="tel"
                          value={contact.phone}
                          onChange={(e) => updateEmergencyContact(index, 'phone', e.target.value)}
                          placeholder="Phone number"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Password (Codeword) <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={contact.password}
                          onChange={(e) => updateEmergencyContact(index, 'password', e.target.value)}
                          placeholder="Unique password"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={contact.canAuthorize}
                        onChange={(e) => updateEmergencyContact(index, 'canAuthorize', e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                      <span className="text-gray-700">Can authorize entry to property</span>
                    </label>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-3">
                Monitoring station will call these contacts in order during alarm events
              </p>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-4">Payment Method</h3>
              <label className="block text-sm font-medium mb-4">Billing preference<select value={formData.billingPreference} onChange={e=>setFormData(prev=>({...prev,billingPreference:e.target.value}))} className="block w-full border rounded-lg px-4 py-2 mt-1"><option value="monthly">Monthly</option>{annualAvailable && <option value="annual">Annual</option>}</select></label>
              {billingMode === 'mail' ? <p>Admin-approved mailed invoices apply, including the monthly mailing fee.</p> : <>
                <SecurityPaymentEnrollment contractId={contract.id} token="" selectedId={formData.paymentMethodId}
                  onSelect={method => { setAutopayAccepted(false); setFormData(prev => ({ ...prev, paymentMethodId: method.id, paymentMethod: method.payment_type === 'card' ? 'credit_card' : 'ach' })); }} />
                <label className="flex items-start gap-2 mt-4 text-sm text-gray-800">
                  <input type="checkbox" checked={autopayAccepted} onChange={e => setAutopayAccepted(e.target.checked)} />
                  The customer signed the recurring AutoPay authorization for this payment method.
                </label>
              </>}
            </div>
          </fieldset>

          <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 space-y-3">
            <label className="flex items-start gap-2 text-sm text-gray-800">
              <input type="checkbox" checked={paperSigned} onChange={e => setPaperSigned(e.target.checked)} className="mt-1" />
              I have the customer's signed paper agreement and will retain it with their records.
            </label>
            <div className="flex justify-end gap-3">
            <button
              onClick={closeEntry} disabled={saving}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Contract Information'}
            </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
