import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Save, X, Plus, Trash2, User, MapPin, Phone, Shield, CreditCard, FileSignature, Printer } from 'lucide-react';

interface ManualContractEntryProps {
  contract: any;
  onClose: () => void;
  onComplete: () => void;
}

export default function ManualContractEntry({ contract, onClose, onComplete }: ManualContractEntryProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [contractData, setContractData] = useState<any>(null);
  const [formData, setFormData] = useState({
    propertyAddress: '',
    propertyCity: '',
    propertyState: '',
    propertyZip: '',
    emergencyContacts: [{ name: '', phone: '', password: '', canAuthorize: false }],
    paymentMethod: 'credit_card' as 'credit_card' | 'ach',
    paymentDetails: {
      lastFour: '',
      token: 'manual_entry'
    }
  });

  useEffect(() => {
    loadContractData();
  }, [contract.id]);

  async function loadContractData() {
    try {
      const { data, error } = await supabase
        .from('security_contracts')
        .select(`
          *,
          contact:contacts(*),
          template:security_contract_templates(*),
          emergency_contacts:security_contract_emergency_contacts(*)
        `)
        .eq('id', contract.id)
        .single();

      if (error) throw error;
      setContractData(data);

      if (data.property_address) {
        setFormData(prev => ({
          ...prev,
          propertyAddress: data.property_address || '',
          propertyCity: data.property_city || '',
          propertyState: data.property_state || '',
          propertyZip: data.property_zip || ''
        }));
      }

      if (data.emergency_contacts && data.emergency_contacts.length > 0) {
        setFormData(prev => ({
          ...prev,
          emergencyContacts: data.emergency_contacts.map((c: any) => ({
            name: c.contact_name,
            phone: c.phone_number,
            password: c.password_codeword,
            canAuthorize: c.can_authorize_entry
          }))
        }));
      }

      if (data.payment_method) {
        setFormData(prev => ({
          ...prev,
          paymentMethod: data.payment_method,
          paymentDetails: {
            lastFour: data.last_four || '',
            token: data.payment_token || 'manual_entry'
          }
        }));
      }
    } catch (error) {
      console.error('Error loading contract:', error);
      alert('Failed to load contract data');
    } finally {
      setLoading(false);
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

  async function handleSave() {
    if (formData.emergencyContacts.length < 2) {
      alert('Please add at least 2 emergency contacts');
      return;
    }

    const missingFields = formData.emergencyContacts.some(c => !c.name || !c.phone || !c.password);
    if (missingFields) {
      alert('Please fill in all emergency contact fields (name, phone, password)');
      return;
    }

    if (!formData.propertyAddress || !formData.propertyCity || !formData.propertyState || !formData.propertyZip) {
      alert('Please fill in all property address fields');
      return;
    }

    setSaving(true);
    try {
      const { error: contractError } = await supabase
        .from('security_contracts')
        .update({
          property_address: formData.propertyAddress,
          property_city: formData.propertyCity,
          property_state: formData.propertyState,
          property_zip: formData.propertyZip,
          payment_method: formData.paymentMethod,
          payment_token: formData.paymentDetails.token,
          last_four: formData.paymentDetails.lastFour,
          status: 'completed',
          customer_completed_at: new Date().toISOString(),
          completed_by_staff: true
        })
        .eq('id', contract.id);

      if (contractError) throw contractError;

      const { error: deleteError } = await supabase
        .from('security_contract_emergency_contacts')
        .delete()
        .eq('contract_id', contract.id);

      if (deleteError) throw deleteError;

      const contactsData = formData.emergencyContacts.map((ec, index) => ({
        contract_id: contract.id,
        contact_name: ec.name,
        phone_number: ec.phone,
        password_codeword: ec.password,
        can_authorize_entry: ec.canAuthorize || false,
        priority_order: index + 1
      }));

      const { error: contactError } = await supabase
        .from('security_contract_emergency_contacts')
        .insert(contactsData);

      if (contactError) throw contactError;

      alert('Contract information saved successfully!');
      onComplete();
    } catch (error) {
      console.error('Error saving contract:', error);
      alert('Failed to save contract information');
    } finally {
      setSaving(false);
    }
  }

  function handlePrintBlankForm() {
    window.open(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-blank-contract-form?contractId=${contract.id}`, '_blank');
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <div className="text-center">Loading contract data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 overflow-y-auto z-50">
      <div className="min-h-screen px-4 py-8">
        <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-xl">
          <div className="border-b border-gray-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Manual Contract Entry</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Fill out contract information on behalf of customer
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="p-6 space-y-6">
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
                      {formData.emergencyContacts.length > 1 && (
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
              <div className="flex items-center gap-2 mb-4">
                <CreditCard className="w-5 h-5 text-gray-600" />
                <h3 className="font-semibold text-gray-900">Payment Method</h3>
              </div>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      value="credit_card"
                      checked={formData.paymentMethod === 'credit_card'}
                      onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value as any })}
                      className="w-4 h-4"
                    />
                    <span>Credit Card</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      value="ach"
                      checked={formData.paymentMethod === 'ach'}
                      onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value as any })}
                      className="w-4 h-4"
                    />
                    <span>ACH / Bank Account</span>
                  </label>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Last 4 Digits {formData.paymentMethod === 'credit_card' ? 'of Card' : 'of Account'}
                  </label>
                  <input
                    type="text"
                    value={formData.paymentDetails.lastFour}
                    onChange={(e) => setFormData({ ...formData, paymentDetails: { ...formData.paymentDetails, lastFour: e.target.value }})}
                    placeholder="1234"
                    maxLength={4}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                  <p className="text-xs text-gray-500 mt-1">For record keeping only</p>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex justify-end gap-3">
            <button
              onClick={onClose}
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
  );
}
