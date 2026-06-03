import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { X, Search, Save, User, Mail, DollarSign, Calendar } from 'lucide-react';

interface Contact {
  id: string;
  full_name: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  email: string;
  phone: string;
}

interface MonitoringService {
  id: string;
  name: string;
  description: string;
  monthly_price: number;
  category: string;
}

interface EditSecurityContractModalProps {
  contract: any;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditSecurityContractModal({ contract, onClose, onSuccess }: EditSecurityContractModalProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [monitoringServices, setMonitoringServices] = useState<MonitoringService[]>([]);
  const [selectedContact, setSelectedContact] = useState(contract.contact_id || '');
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [priceOverride, setPriceOverride] = useState(contract.monthly_price?.toString() || '');
  const [termMonths, setTermMonths] = useState<number>(contract.term_months || 12);
  const [renewalTermMonths, setRenewalTermMonths] = useState<number>(contract.renewal_term_months || 12);
  const [accountType, setAccountType] = useState<'residential' | 'commercial' | ''>(contract.account_type || '');
  const [accountServices, setAccountServices] = useState<string[]>(contract.account_services || []);
  const [accountNumber, setAccountNumber] = useState(contract.account_number || '');
  const [notes, setNotes] = useState(contract.notes || '');
  const [emailOverride, setEmailOverride] = useState(contract.email_override || '');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (searchTerm.trim().length >= 1) {
      const term = searchTerm.trim().toLowerCase();
      setFilteredContacts(
        contacts.filter(c =>
          c.full_name?.toLowerCase().includes(term) ||
          c.first_name?.toLowerCase().includes(term) ||
          c.last_name?.toLowerCase().includes(term) ||
          c.email?.toLowerCase().includes(term) ||
          c.company_name?.toLowerCase().includes(term) ||
          c.phone?.includes(searchTerm.trim())
        )
      );
    } else {
      setFilteredContacts(contacts);
    }
  }, [searchTerm, contacts, selectedContact]);

  async function loadData() {
    try {
      const [contactsRes, servicesRes, contractServicesRes] = await Promise.all([
        supabase
          .from('contacts')
          .select('id, full_name, first_name, last_name, company_name, email, phone')
          .order('last_name', { nullsFirst: false })
          .limit(500),
        supabase
          .from('monitoring_services')
          .select('*')
          .eq('is_active', true)
          .order('category, name'),
        supabase
          .from('security_contract_services')
          .select('service_id')
          .eq('contract_id', contract.id)
      ]);

      if (contactsRes.error) {
        console.error('Contacts error:', contactsRes.error);
        throw contactsRes.error;
      }
      if (servicesRes.error) {
        console.error('Services error:', servicesRes.error);
        throw servicesRes.error;
      }
      if (contractServicesRes.error) {
        console.error('Contract services error:', contractServicesRes.error);
        throw contractServicesRes.error;
      }

      const allContacts = contactsRes.data || [];
      setContacts(allContacts);
      const currentSelected = contract.contact_id
        ? allContacts.filter(c => c.id === contract.contact_id)
        : [];
      setFilteredContacts(currentSelected);
      setMonitoringServices(servicesRes.data || []);
      setSelectedServices((contractServicesRes.data || []).map(s => s.service_id));
    } catch (error: any) {
      console.error('Error loading data:', error);
      alert(`Failed to load data: ${error.message || 'Unknown error'}. Please try again.`);
    } finally {
      setLoading(false);
    }
  }

  function handleServiceToggle(serviceId: string) {
    setSelectedServices(prev =>
      prev.includes(serviceId)
        ? prev.filter(id => id !== serviceId)
        : [...prev, serviceId]
    );
  }

  function calculateMonthlyPrice() {
    if (priceOverride && parseFloat(priceOverride) > 0) {
      return parseFloat(priceOverride);
    }
    return selectedServices.reduce((sum, serviceId) => {
      const service = monitoringServices.find(s => s.id === serviceId);
      return sum + (service?.monthly_price || 0);
    }, 0);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!selectedContact) {
      alert('Please select a customer');
      return;
    }

    if (emailOverride && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailOverride)) {
      alert('Please enter a valid email address');
      return;
    }

    setSaving(true);
    try {
      const monthlyPrice = calculateMonthlyPrice();

      // Update the contract
      const { error: updateError } = await supabase
        .from('security_contracts')
        .update({
          contact_id: selectedContact,
          email_override: emailOverride.trim() || null,
          monthly_price: monthlyPrice,
          term_months: termMonths,
          renewal_term_months: renewalTermMonths,
          account_type: accountType || null,
          account_services: accountServices,
          account_number: accountNumber.trim() || null,
          notes: notes.trim() || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', contract.id);

      if (updateError) throw updateError;

      // Delete existing services
      const { error: deleteError } = await supabase
        .from('security_contract_services')
        .delete()
        .eq('contract_id', contract.id);

      if (deleteError) throw deleteError;

      // Insert new services
      if (selectedServices.length > 0) {
        const serviceInserts = selectedServices.map(serviceId => {
          const service = monitoringServices.find(s => s.id === serviceId);
          return {
            contract_id: contract.id,
            service_id: serviceId,
            monthly_price: service?.monthly_price || 0
          };
        });

        const { error: insertError } = await supabase
          .from('security_contract_services')
          .insert(serviceInserts);

        if (insertError) throw insertError;
      }

      alert('Contract updated successfully!');
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error updating contract:', error);
      alert('Failed to update contract. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const selectedContactData = contacts.find(c => c.id === selectedContact);
  const monthlyPrice = calculateMonthlyPrice();

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg p-6">
          <div className="text-center">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl my-4 sm:my-8 max-h-[calc(100vh-2rem)]">
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base sm:text-xl font-bold text-gray-900">Edit Security Contract</h2>
            <p className="text-xs sm:text-sm text-gray-600 mt-1 truncate">
              Update customer, pricing, and services for {contract.contract_number}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto max-h-[calc(100vh-8rem)]">
          {/* Customer Selection */}
          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
              Customer *
            </label>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <input
                type="text"
                placeholder="Search by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 sm:pl-10 pr-3 sm:pr-4 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="max-h-40 sm:max-h-48 overflow-y-auto border border-gray-300 rounded-lg">
              {filteredContacts.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  {searchTerm.trim().length >= 1 ? `No contacts found matching "${searchTerm}"` : 'No contacts available'}
                </div>
              ) : (
                filteredContacts.map(contact => {
                  const displayName = contact.full_name ||
                    [contact.first_name, contact.last_name].filter(Boolean).join(' ') ||
                    contact.email || 'Unknown';
                  return (
                    <button
                      key={contact.id}
                      type="button"
                      onClick={() => setSelectedContact(contact.id)}
                      className={`w-full text-left p-3 hover:bg-gray-50 border-b border-gray-200 last:border-b-0 transition-colors ${
                        selectedContact === contact.id ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <User className="w-5 h-5 text-gray-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900">
                            {displayName}
                            {contact.company_name && (
                              <span className="text-gray-600 ml-2">({contact.company_name})</span>
                            )}
                          </div>
                          <div className="text-sm text-gray-600 flex items-center gap-3 mt-1">
                            <span className="flex items-center gap-1">
                              <Mail className="w-3 h-3" />
                              {contact.email}
                            </span>
                            {contact.phone && <span>{contact.phone}</span>}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
            {selectedContactData && (
              <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="text-sm font-medium text-blue-900">Selected Customer</div>
                <div className="text-sm text-blue-800 mt-1">
                  {selectedContactData.full_name} - {selectedContactData.email}
                </div>
              </div>
            )}
          </div>

          {/* Email Override */}
          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
              Email Override (Optional)
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <input
                type="email"
                value={emailOverride}
                onChange={(e) => setEmailOverride(e.target.value)}
                placeholder={selectedContactData?.email || 'Use a different email for this contract'}
                className="w-full pl-9 sm:pl-10 pr-3 sm:pr-4 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Leave blank to use contact's email ({selectedContactData?.email || 'none'})
            </p>
          </div>

          {/* Monitoring Services */}
          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
              Monitoring Services
            </label>
            <div className="space-y-2 max-h-40 sm:max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-2 sm:p-3">
              {monitoringServices.length === 0 ? (
                <div className="text-center text-gray-500 py-4">
                  No monitoring services available
                </div>
              ) : (
                monitoringServices.map(service => (
                  <label
                    key={service.id}
                    className="flex items-start gap-3 p-3 hover:bg-gray-50 rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedServices.includes(service.id)}
                      onChange={() => handleServiceToggle(service.id)}
                      className="mt-1 w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{service.name}</div>
                      {service.description && (
                        <div className="text-sm text-gray-600">{service.description}</div>
                      )}
                      <div className="text-sm font-semibold text-blue-600 mt-1">
                        ${service.monthly_price.toFixed(2)}/month
                      </div>
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Pricing Override */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                Monthly Price Override
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={priceOverride}
                  onChange={(e) => setPriceOverride(e.target.value)}
                  placeholder="Leave blank to use service prices"
                  className="w-full pl-9 sm:pl-10 pr-3 sm:pr-4 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">Override calculated service price</p>
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                Contract Term (Months)
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={termMonths}
                  onChange={(e) => setTermMonths(parseInt(e.target.value) || 12)}
                  className="w-full pl-9 sm:pl-10 pr-3 sm:pr-4 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Account Classification */}
          <div className="p-3 sm:p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-3 sm:space-y-4">
            <h3 className="text-xs sm:text-sm font-semibold text-gray-800">Account Classification</h3>

            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Account Type</label>
              <div className="flex gap-3">
                {(['residential', 'commercial'] as const).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setAccountType(type)}
                    className={`flex-1 py-2 rounded-lg border-2 text-xs sm:text-sm font-medium capitalize transition-all ${
                      accountType === type
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">Account Services</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'monitored_alarm', label: 'Monitored Alarm' },
                  { value: 'testing_inspection', label: 'Testing & Inspection' },
                  { value: 'service_agreement', label: 'Service Agreement' },
                  { value: 'video_monitoring', label: 'Video / CCTV' },
                  { value: 'access_control', label: 'Access Control' },
                  { value: 'other', label: 'Other' },
                ].map(svc => (
                  <label key={svc.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={accountServices.includes(svc.value)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setAccountServices(prev => [...prev, svc.value]);
                        } else {
                          setAccountServices(prev => prev.filter(s => s !== svc.value));
                        }
                      }}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="text-xs sm:text-sm text-gray-700">{svc.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Account Number (Optional)</label>
              <input
                type="text"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="e.g. 12345"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Renewal Term */}
          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
              Renewal Term (Months)
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <input
                type="number"
                min="1"
                max="60"
                value={renewalTermMonths}
                onChange={(e) => setRenewalTermMonths(parseInt(e.target.value) || 12)}
                className="w-full pl-9 sm:pl-10 pr-3 sm:pr-4 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
              Internal Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Add any internal notes about this contract..."
              className="w-full px-3 sm:px-4 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Summary */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 sm:p-4">
            <h3 className="text-sm sm:text-base font-semibold text-gray-900 mb-3">Contract Summary</h3>
            <div className="space-y-2 text-xs sm:text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Monthly Price:</span>
                <span className="font-semibold text-gray-900">${monthlyPrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Initial Term:</span>
                <span className="font-semibold text-gray-900">{termMonths} months</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Renewal Term:</span>
                <span className="font-semibold text-gray-900">{renewalTermMonths} months</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-gray-300">
                <span className="text-gray-600">Total Contract Value:</span>
                <span className="font-semibold text-gray-900">
                  ${(monthlyPrice * termMonths).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 sm:py-2 text-sm sm:text-base border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !selectedContact}
              className="flex-1 px-4 py-2.5 sm:py-2 text-sm sm:text-base bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Save className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
