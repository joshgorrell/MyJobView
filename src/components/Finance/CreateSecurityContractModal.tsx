import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { X, Search, Plus, User } from 'lucide-react';
import { AddressAutocomplete } from '../Shared/AddressAutocomplete';

interface Template {
  id: string;
  name: string;
  description: string;
}

interface Contact {
  id: string;
  full_name: string;
  first_name?: string;
  last_name?: string;
  company_name?: string;
  email: string;
  phone: string;
  street_address: string;
  city: string;
  state: string;
  zip_code: string;
}

interface MonitoringService {
  id: string;
  name: string;
  description: string;
  monthly_price: number;
  category: string;
}

interface SalesOrder {
  id: string;
  order_number: string;
  contact_id: string;
}

interface AIPrefill {
  contactId?: string;
  contactName?: string;
  templateId?: string;
  templateName?: string;
  serviceIds?: string[];
  termMonths?: number;
  notes?: string;
  emailOverride?: string;
}

interface CreateSecurityContractModalProps {
  onClose: () => void;
  onSuccess: () => void;
  prefill?: AIPrefill;
}

export default function CreateSecurityContractModal({ onClose, onSuccess, prefill }: CreateSecurityContractModalProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [monitoringServices, setMonitoringServices] = useState<MonitoringService[]>([]);
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [selectedContact, setSelectedContact] = useState('');
  const [selectedContactData, setSelectedContactData] = useState<Contact | null>(null);
  const [selectedSalesOrder, setSelectedSalesOrder] = useState('');
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [priceOverride, setPriceOverride] = useState('');
  const [termMonths, setTermMonths] = useState<number>(12);
  const [renewalTermMonths, setRenewalTermMonths] = useState<number>(12);
  const [accountType, setAccountType] = useState<'residential' | 'commercial' | ''>('');
  const [accountServices, setAccountServices] = useState<string[]>([]);
  const [accountNumber, setAccountNumber] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [notes, setNotes] = useState('');
  const [emailOverride, setEmailOverride] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [contactSearchLoading, setContactSearchLoading] = useState(false);
  const [mode, setMode] = useState<'select' | 'create'>('select');
  const [showContactEdit, setShowContactEdit] = useState(false);

  const [contactEdits, setContactEdits] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    street_address: '',
    city: '',
    state: '',
    zip_code: '',
    company_name: ''
  });

  const [newContact, setNewContact] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    street_address: '',
    city: '',
    state: '',
    zip_code: '',
    company_name: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const calculatedMonthlyPrice = selectedServices.reduce((total, serviceId) => {
    const service = monitoringServices.find(s => s.id === serviceId);
    return total + (service?.monthly_price || 0);
  }, 0);

  const finalMonthlyPrice = priceOverride ? parseFloat(priceOverride) : calculatedMonthlyPrice;

  useEffect(() => {
    const term = searchTerm.trim();
    if (term.length === 0) {
      setFilteredContacts([]);
      return;
    }
    const timer = setTimeout(async () => {
      setContactSearchLoading(true);
      try {
        const { data } = await supabase
          .from('contacts')
          .select('id, full_name, first_name, last_name, company_name, email, phone, street_address, city, state, zip_code')
          .or(`full_name.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%,company_name.ilike.%${term}%`)
          .order('last_name', { nullsFirst: false })
          .limit(50);
        setFilteredContacts(data || []);
      } finally {
        setContactSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    if (selectedContact && mode === 'select') {
      loadSelectedContact(selectedContact);
    } else {
      setSelectedContactData(null);
      setShowContactEdit(false);
    }
  }, [selectedContact, mode]);

  const filteredSalesOrders = selectedContact
    ? salesOrders.filter(order => order.contact_id === selectedContact)
    : salesOrders;

  async function loadData() {
    try {
      const [templatesRes, servicesRes, salesOrdersRes] = await Promise.all([
        supabase
          .from('security_contract_templates')
          .select('id, name, description')
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('monitoring_services')
          .select('id, name, description, monthly_price, category')
          .eq('is_active', true)
          .order('sort_order'),
        supabase
          .from('sales_orders')
          .select('id, order_number, contact_id')
          .order('order_number', { ascending: false })
          .limit(100)
      ]);

      if (templatesRes.error) throw templatesRes.error;
      if (servicesRes.error) throw servicesRes.error;
      if (salesOrdersRes.error) throw salesOrdersRes.error;

      const loadedTemplates = templatesRes.data || [];
      const loadedServices = servicesRes.data || [];
      setTemplates(loadedTemplates);
      setMonitoringServices(loadedServices);
      setSalesOrders(salesOrdersRes.data || []);

      if (prefill) {
        if (prefill.contactId) {
          setSelectedContact(prefill.contactId);
        }
        if (prefill.templateId) {
          setSelectedTemplate(prefill.templateId);
        } else if (prefill.templateName && loadedTemplates.length > 0) {
          const matched = loadedTemplates.find(
            t => t.name.toLowerCase().includes(prefill.templateName!.toLowerCase())
          );
          if (matched) setSelectedTemplate(matched.id);
        }
        if (prefill.serviceIds && prefill.serviceIds.length > 0) {
          setSelectedServices(prefill.serviceIds);
        }
        if (prefill.termMonths) {
          setTermMonths(prefill.termMonths);
        }
        if (prefill.notes) {
          setNotes(prefill.notes);
        }
        if (prefill.emailOverride) {
          setEmailOverride(prefill.emailOverride);
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
      alert('Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  async function loadSelectedContact(contactId: string) {
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, full_name, first_name, last_name, company_name, email, phone, street_address, city, state, zip_code')
        .eq('id', contactId)
        .single();

      if (error) throw error;

      setSelectedContactData(data);
      setContactEdits({
        first_name: data.first_name || '',
        last_name: data.last_name || '',
        email: data.email || '',
        phone: data.phone || '',
        street_address: data.street_address || '',
        city: data.city || '',
        state: data.state || '',
        zip_code: data.zip_code || '',
        company_name: data.company_name || ''
      });
      setShowContactEdit(true);
    } catch (error) {
      console.error('Error loading contact:', error);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      console.log('Creating contract with user ID:', user.user.id);

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.user.id)
        .single();

      console.log('User profile role:', profile?.role);

      let contactId = selectedContact;

      if (mode === 'create') {
        const { data: contactData, error: contactError } = await supabase
          .from('contacts')
          .insert({
            first_name: newContact.first_name,
            last_name: newContact.last_name,
            email: newContact.email,
            phone: newContact.phone,
            street_address: newContact.street_address,
            city: newContact.city,
            state: newContact.state,
            zip_code: newContact.zip_code,
            company_name: newContact.company_name
          })
          .select()
          .single();

        if (contactError) throw contactError;
        contactId = contactData.id;
      } else if (mode === 'select' && selectedContactData) {
        const hasChanges =
          contactEdits.first_name !== (selectedContactData.first_name || '') ||
          contactEdits.last_name !== (selectedContactData.last_name || '') ||
          contactEdits.email !== selectedContactData.email ||
          contactEdits.phone !== selectedContactData.phone ||
          contactEdits.street_address !== selectedContactData.street_address ||
          contactEdits.city !== selectedContactData.city ||
          contactEdits.state !== selectedContactData.state ||
          contactEdits.zip_code !== selectedContactData.zip_code ||
          contactEdits.company_name !== (selectedContactData.company_name || '');

        if (hasChanges) {
          const { error: updateError } = await supabase
            .from('contacts')
            .update({
              first_name: contactEdits.first_name,
              last_name: contactEdits.last_name,
              email: contactEdits.email,
              phone: contactEdits.phone,
              street_address: contactEdits.street_address,
              city: contactEdits.city,
              state: contactEdits.state,
              zip_code: contactEdits.zip_code,
              company_name: contactEdits.company_name
            })
            .eq('id', selectedContact);

          if (updateError) throw updateError;
        }
      }

      const { data: contractData, error } = await supabase
        .from('security_contracts')
        .insert({
          template_id: selectedTemplate,
          contact_id: contactId,
          sales_order_id: selectedSalesOrder || null,
          created_by_user_id: user.user.id,
          status: 'draft',
          monthly_price: finalMonthlyPrice,
          price_override: priceOverride ? parseFloat(priceOverride) : null,
          term_months: termMonths,
          renewal_term_months: renewalTermMonths,
          account_type: accountType || null,
          account_services: accountServices,
          account_number: accountNumber.trim() || null,
          notes,
          email_override: emailOverride || null
        })
        .select()
        .single();

      if (error) throw error;

      if (selectedServices.length > 0) {
        const serviceInserts = selectedServices.map(serviceId => {
          const service = monitoringServices.find(s => s.id === serviceId);
          return {
            contract_id: contractData.id,
            service_id: serviceId,
            monthly_price: service?.monthly_price || 0
          };
        });

        const { error: servicesError } = await supabase
          .from('security_contract_services')
          .insert(serviceInserts);

        if (servicesError) throw servicesError;
      }

      onSuccess();
    } catch (error: any) {
      console.error('Error creating contract:', error);
      const errorMessage = error?.message || 'Unknown error occurred';
      const errorDetails = error?.details || '';
      const errorHint = error?.hint || '';

      let displayMessage = 'Failed to create agreement';
      if (errorMessage.includes('permission denied') || errorMessage.includes('policy')) {
        displayMessage = 'Permission denied. You may not have access to create security agreements. Please contact an administrator.';
      } else if (errorMessage) {
        displayMessage = `Failed to create agreement: ${errorMessage}`;
      }

      if (errorDetails) {
        displayMessage += `\n\nDetails: ${errorDetails}`;
      }
      if (errorHint) {
        displayMessage += `\n\nHint: ${errorHint}`;
      }

      alert(displayMessage);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900">Create Security Agreement</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading...</p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 sm:space-y-6">
            {prefill && (
              <div className="flex items-start gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="w-5 h-5 mt-0.5 flex-shrink-0 text-blue-600">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                    <path d="M9.663 17h4.673M12 3v1m6.364 1.636-.707.707M21 12h-1M4 12H3m3.343-5.657-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-blue-800">Pre-filled by AI Assistant</p>
                  <p className="text-xs text-blue-600 mt-0.5">Review all fields before saving. Customer details were matched from your contact directory.</p>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Agreement Template <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select a template...</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
              {selectedTemplate && (
                <p className="mt-2 text-sm text-gray-600">
                  {templates.find(t => t.id === selectedTemplate)?.description}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Sales Order (Optional)
              </label>
              <select
                value={selectedSalesOrder}
                onChange={(e) => setSelectedSalesOrder(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">None - No linked sales order</option>
                {filteredSalesOrders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.order_number}
                  </option>
                ))}
              </select>
              {selectedContact && filteredSalesOrders.length === 0 && (
                <p className="mt-2 text-sm text-gray-500">
                  No sales orders found for this customer
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Agreement Term <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {[12, 24, 36, 48, 60].map((months) => (
                  <button
                    key={months}
                    type="button"
                    onClick={() => setTermMonths(months)}
                    className={`px-2 sm:px-4 py-3 text-center rounded-lg border-2 transition-all ${
                      termMonths === months
                        ? 'border-blue-600 bg-blue-50 text-blue-700 font-semibold'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                    }`}
                  >
                    {months}<br/>
                    <span className="text-xs">months</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Account Classification */}
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-4">
              <h3 className="text-sm font-semibold text-gray-800">Account Classification</h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Account Type</label>
                <div className="flex gap-3">
                  {(['residential', 'commercial'] as const).map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setAccountType(type)}
                      className={`flex-1 py-2.5 rounded-lg border-2 text-sm font-medium capitalize transition-all ${
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
                <label className="block text-sm font-medium text-gray-700 mb-2">Account Services</label>
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
                      <span className="text-sm text-gray-700">{svc.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Account Number (Optional)</label>
                <input
                  type="text"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="e.g. 12345"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Renewal Term <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {[12, 24, 36, 48, 60].map((months) => (
                  <button
                    key={months}
                    type="button"
                    onClick={() => setRenewalTermMonths(months)}
                    className={`px-2 sm:px-4 py-3 text-center rounded-lg border-2 transition-all ${
                      renewalTermMonths === months
                        ? 'border-blue-600 bg-blue-50 text-blue-700 font-semibold'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                    }`}
                  >
                    {months}<br/>
                    <span className="text-xs">months</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Monitoring Services
              </label>
              <div className="border border-gray-300 rounded-lg max-h-64 overflow-y-auto">
                {monitoringServices.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">
                    No monitoring services available
                  </div>
                ) : (
                  Object.entries(
                    monitoringServices.reduce((acc, service) => {
                      const category = service.category || 'Other';
                      if (!acc[category]) acc[category] = [];
                      acc[category].push(service);
                      return acc;
                    }, {} as Record<string, MonitoringService[]>)
                  ).map(([category, services]) => (
                    <div key={category}>
                      <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 font-semibold text-sm text-gray-700">
                        {category}
                      </div>
                      {services.map((service) => (
                        <label
                          key={service.id}
                          className={`flex items-start gap-3 p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0 ${
                            selectedServices.includes(service.id) ? 'bg-blue-50' : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedServices.includes(service.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedServices([...selectedServices, service.id]);
                              } else {
                                setSelectedServices(selectedServices.filter(id => id !== service.id));
                              }
                            }}
                            className="mt-1"
                          />
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <div className="font-medium text-gray-900">{service.name}</div>
                              <div className="text-sm font-semibold text-blue-600">
                                ${service.monthly_price.toFixed(2)}/mo
                              </div>
                            </div>
                            {service.description && (
                              <div className="text-sm text-gray-600 mt-1">{service.description}</div>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  ))
                )}
              </div>
              {selectedServices.length > 0 && (
                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-700">
                      Calculated Monthly Price ({selectedServices.length} service{selectedServices.length !== 1 ? 's' : ''})
                    </span>
                    <span className="text-lg font-bold text-blue-700">
                      ${calculatedMonthlyPrice.toFixed(2)}/mo
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Price Override (Optional)
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={priceOverride}
                  onChange={(e) => setPriceOverride(e.target.value)}
                  placeholder="Leave blank to use calculated price"
                  className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {priceOverride && (
                <p className="mt-2 text-sm text-amber-600">
                  Override active: ${parseFloat(priceOverride).toFixed(2)}/mo will be used instead of calculated price
                </p>
              )}
              <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-900">Final Monthly Price</span>
                  <span className="text-xl font-bold text-green-700">
                    ${finalMonthlyPrice.toFixed(2)}/mo
                  </span>
                </div>
              </div>
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <label className="block text-sm font-medium text-gray-700">
                  Customer <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setMode('select')}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1 ${
                      mode === 'select'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <User className="w-4 h-4 flex-shrink-0" />
                    <span>Select Existing</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('create')}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1 ${
                      mode === 'create'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <Plus className="w-4 h-4 flex-shrink-0" />
                    <span>Add New</span>
                  </button>
                </div>
              </div>

              {mode === 'select' ? (
                <>
                  <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Type a name or email to search..."
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="border border-gray-300 rounded-lg max-h-64 overflow-y-auto">
                    {contactSearchLoading ? (
                      <div className="p-4 text-center text-gray-500">Searching...</div>
                    ) : filteredContacts.length === 0 ? (
                      <div className="p-4 text-center text-gray-500">
                        {searchTerm.trim() ? `No contacts found matching "${searchTerm}"` : 'Start typing to search all contacts'}
                      </div>
                    ) : (
                      filteredContacts.map((contact) => {
                        const displayName = contact.full_name ||
                          [contact.first_name, contact.last_name].filter(Boolean).join(' ') ||
                          contact.email ||
                          'Unknown';
                        return (
                          <label
                            key={contact.id}
                            className={`flex items-start gap-3 p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0 ${
                              selectedContact === contact.id ? 'bg-blue-50' : ''
                            }`}
                          >
                            <input
                              type="radio"
                              name="contact"
                              value={contact.id}
                              checked={selectedContact === contact.id}
                              onChange={(e) => setSelectedContact(e.target.value)}
                              className="mt-1"
                              required={mode === 'select'}
                            />
                            <div className="flex-1">
                              <div className="font-medium text-gray-900">{displayName}</div>
                              {contact.company_name && (
                                <div className="text-xs text-gray-500">{contact.company_name}</div>
                              )}
                              <div className="text-sm text-gray-600">{contact.email}</div>
                              <div className="text-sm text-gray-500">{contact.phone}</div>
                              {contact.street_address && (
                                <div className="text-xs text-gray-500 mt-1">
                                  {contact.street_address}, {contact.city}, {contact.state} {contact.zip_code}
                                </div>
                              )}
                            </div>
                          </label>
                        );
                      })
                    )}
                  </div>

                  {showContactEdit && selectedContactData && (
                    <div className="mt-4 p-3 sm:p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3 sm:space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-1 mb-3">
                        <h3 className="font-semibold text-gray-900 text-sm sm:text-base">Review & Edit Customer Information</h3>
                        <span className="text-xs text-blue-600">Make any necessary changes below</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                          <input
                            type="text"
                            value={contactEdits.first_name}
                            onChange={(e) => setContactEdits({ ...contactEdits, first_name: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                          <input
                            type="text"
                            value={contactEdits.last_name}
                            onChange={(e) => setContactEdits({ ...contactEdits, last_name: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                        <input
                          type="text"
                          value={contactEdits.company_name}
                          onChange={(e) => setContactEdits({ ...contactEdits, company_name: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                          <input
                            type="email"
                            value={contactEdits.email}
                            onChange={(e) => setContactEdits({ ...contactEdits, email: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                          <input
                            type="tel"
                            value={contactEdits.phone}
                            onChange={(e) => setContactEdits({ ...contactEdits, phone: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Street Address</label>
                        <AddressAutocomplete
                          value={contactEdits.street_address}
                          onChange={(address, components) => {
                            try {
                              if (components) {
                                setContactEdits(prev => ({
                                  ...prev,
                                  street_address: address,
                                  city: components.city || prev.city,
                                  state: components.state || prev.state,
                                  zip_code: components.zip || prev.zip_code
                                }));
                              } else {
                                setContactEdits(prev => ({ ...prev, street_address: address }));
                              }
                            } catch (error) {
                              console.error('Error updating contact address:', error);
                            }
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                          <input
                            type="text"
                            value={contactEdits.city}
                            onChange={(e) => setContactEdits({ ...contactEdits, city: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                          <input
                            type="text"
                            value={contactEdits.state}
                            onChange={(e) => setContactEdits({ ...contactEdits, state: e.target.value })}
                            maxLength={2}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">ZIP Code</label>
                        <input
                          type="text"
                          value={contactEdits.zip_code}
                          onChange={(e) => setContactEdits({ ...contactEdits, zip_code: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
                        />
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-3 sm:space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        First Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={newContact.first_name}
                        onChange={(e) => setNewContact({ ...newContact, first_name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
                        required={mode === 'create'}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Last Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={newContact.last_name}
                        onChange={(e) => setNewContact({ ...newContact, last_name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
                        required={mode === 'create'}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Company Name (Optional)
                    </label>
                    <input
                      type="text"
                      value={newContact.company_name}
                      onChange={(e) => setNewContact({ ...newContact, company_name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        value={newContact.email}
                        onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
                        required={mode === 'create'}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Phone <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="tel"
                        value={newContact.phone}
                        onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
                        required={mode === 'create'}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Street Address <span className="text-red-500">*</span>
                    </label>
                    <AddressAutocomplete
                      value={newContact.street_address}
                      onChange={(address, components) => {
                        try {
                          if (components) {
                            setNewContact(prev => ({
                              ...prev,
                              street_address: address,
                              city: components.city || prev.city,
                              state: components.state || prev.state,
                              zip_code: components.zip || prev.zip_code
                            }));
                          } else {
                            setNewContact(prev => ({ ...prev, street_address: address }));
                          }
                        } catch (error) {
                          console.error('Error updating new contact address:', error);
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
                      required={mode === 'create'}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        City <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={newContact.city}
                        onChange={(e) => setNewContact({ ...newContact, city: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
                        required={mode === 'create'}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        State <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={newContact.state}
                        onChange={(e) => setNewContact({ ...newContact, state: e.target.value })}
                        maxLength={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
                        required={mode === 'create'}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      ZIP Code <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newContact.zip_code}
                      onChange={(e) => setNewContact({ ...newContact, zip_code: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
                      required={mode === 'create'}
                    />
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes (Optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any notes about this agreement..."
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Override (Optional)
              </label>
              <input
                type="email"
                value={emailOverride}
                onChange={(e) => setEmailOverride(e.target.value)}
                placeholder="Send invitation to a different email address..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">Leave blank to use the customer's email on file.</p>
            </div>

            <div className="flex gap-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Creating...' : 'Create Agreement'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
