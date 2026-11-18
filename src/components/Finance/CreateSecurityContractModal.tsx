import { notify } from '../../lib/feedback';
import { SecurityFieldVisibility, SecurityVisibilityGuide } from './SecurityFieldVisibility';
import React, { useState, useEffect, useId, useRef } from 'react';
import { SECURITY_INITIAL_TERMS, staffSecurityOnboarding } from '../../lib/securityOnboarding';
import { supabase } from '../../lib/supabase';
import { X, Search, Plus, Wrench } from 'lucide-react';
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
  onSuccess: (contract: { id: string }) => void;
  onPaperCreated?: (contract: { id: string }) => void;
  prefill?: AIPrefill;
}

export default function CreateSecurityContractModal({ onClose, onSuccess, onPaperCreated, prefill }: CreateSecurityContractModalProps) {
  const titleId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const formScrollRef = useRef<HTMLDivElement>(null);
  const creationRequest = useRef(crypto.randomUUID());
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
  const [termMonths, setTermMonths] = useState<number>(36);
  const [accountType, setAccountType] = useState<'residential' | 'commercial' | ''>('');
  const [accountServices, setAccountServices] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [notes, setNotes] = useState('');
  const [emailOverride, setEmailOverride] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [contactSearchLoading, setContactSearchLoading] = useState(false);
  const [showNewContactForm, setShowNewContactForm] = useState(false);
  const [showContactEdit, setShowContactEdit] = useState(false);
  const [installationDate, setInstallationDate] = useState('');
  const [serviceAccountNumbers, setServiceAccountNumbers] = useState<Record<string, string>>({});
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [monitoringAccountNumber, setMonitoringAccountNumber] = useState('');

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

  useEffect(() => {
    const viewport = window.visualViewport;
    const overlay = overlayRef.current;
    if (!viewport || !overlay || !window.matchMedia('(pointer: coarse)').matches) return;

    let frame = 0;
    const updateViewport = () => {
      // iOS can shrink or pan the visual viewport while leaving the layout viewport in place.
      if (viewport.scale !== 1) return;
      overlay.style.top = `${viewport.offsetTop}px`;
      overlay.style.height = `${viewport.height}px`;
      overlay.style.bottom = 'auto';

      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const scroller = formScrollRef.current;
        const field = document.activeElement;
        if (!scroller || !(field instanceof HTMLElement) || !scroller.contains(field) ||
            !field.matches('input:not([type=checkbox]), select, textarea')) return;

        const bounds = scroller.getBoundingClientRect();
        const fieldBounds = field.getBoundingClientRect();
        if (fieldBounds.bottom > bounds.bottom - 8) {
          scroller.scrollTop += fieldBounds.bottom - bounds.bottom + 8;
        } else if (fieldBounds.top < bounds.top + 8) {
          scroller.scrollTop += fieldBounds.top - bounds.top - 8;
        }
      });
    };

    updateViewport();
    viewport.addEventListener('resize', updateViewport);
    viewport.addEventListener('scroll', updateViewport);
    return () => {
      viewport.removeEventListener('resize', updateViewport);
      viewport.removeEventListener('scroll', updateViewport);
      cancelAnimationFrame(frame);
    };
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
    if (selectedContact) {
      loadSelectedContact(selectedContact);
    } else {
      setSelectedContactData(null);
      setShowContactEdit(false);
    }
  }, [selectedContact]);

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
        if (prefill.termMonths && SECURITY_INITIAL_TERMS.includes(prefill.termMonths)) {
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
      notify('Failed to load data', { theme: 'emerald', tone: 'error' });
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
      const hasContactChanges = selectedContactData && Object.entries(contactEdits).some(([key, value]) => value !== ((selectedContactData as unknown as Record<string, unknown>)[key] || ''));
      const contractData = await staffSecurityOnboarding<{ id: string }>('create', undefined, {
        request_id: creationRequest.current,
        template_id: selectedTemplate, contact_id: selectedContact || null,
        new_contact: showNewContactForm && !selectedContact ? newContact : null,
        contact_edits: hasContactChanges ? contactEdits : null,
        sales_order_id: selectedSalesOrder || null, service_ids: selectedServices,
        price_override: priceOverride || null, term_months: termMonths,
        account_type: accountType || null, account_services: accountServices,
        is_monitoring: isMonitoring, account_number: isMonitoring ? monitoringAccountNumber.trim() || null : null,
        installation_date: installationDate || null, service_account_numbers: serviceAccountNumbers,
        notes, email_override: emailOverride.trim() || null,
      });

      creationRequest.current = crypto.randomUUID();
      if (onPaperCreated) onPaperCreated(contractData);
      else notify('Security contract created!', { theme: 'emerald', tone: 'success' });
      onSuccess(contractData);
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

      notify(displayMessage, { theme: 'emerald', tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div ref={overlayRef} className="security-onboarding-controls fixed inset-0 z-50 flex h-dvh items-center justify-center bg-black/50 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)] sm:pl-[max(1rem,env(safe-area-inset-left))] sm:pr-[max(1rem,env(safe-area-inset-right))] sm:pt-[max(1rem,env(safe-area-inset-top))] sm:pb-4 [.theme-workspace_&]:[color-scheme:inherit]">
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex h-full max-h-full min-h-0 w-full max-w-[82rem] flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:rounded-lg [@media(pointer:coarse)]:[&_:is(input:not([type=checkbox]),select,textarea)]:min-h-11 [@media(pointer:coarse)]:[&_:is(input:not([type=checkbox]),select,textarea)]:text-base">
        <div className="shrink-0 px-4 sm:px-5 py-2 border-b border-gray-200 flex items-center justify-between">
          <h2 id={titleId} className="text-lg sm:text-xl font-bold text-gray-900">{onPaperCreated ? 'Enter Completed Paper Form' : 'Create Security Agreement'}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="p-2 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading...</p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div ref={formScrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 sm:px-5 sm:py-3">
              <SecurityVisibilityGuide />
              {prefill && (
                <div className="flex items-start gap-3 px-4 py-3 bg-infoSoft border border-subtle rounded-lg">
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

              <div className="grid items-start gap-4 md:grid-cols-2 min-[1100px]:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)_minmax(0,1.2fr)]">
                <div className="min-w-0 space-y-3 min-[1100px]:contents min-[1100px]:space-y-0">
                  <div className="min-w-0 space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Agreement Template <span className="text-red-500">*</span> <SecurityFieldVisibility /></label>
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
                        Customer <span className="text-red-500">*</span> <SecurityFieldVisibility /></label>

                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                          type="text"
                          value={searchTerm}
                          onChange={(e) => {
                            setSearchTerm(e.target.value);
                            if (selectedContact) {
                              setSelectedContact('');
                            }
                            if (showNewContactForm) {
                              setShowNewContactForm(false);
                            }
                          }}
                          placeholder="Type a name or email to search..."
                          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      {(searchTerm.trim() || contactSearchLoading) && !selectedContact && (
                      <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-subtle sm:max-h-64">
                        {contactSearchLoading ? (
                          <div className="p-4 text-center text-gray-500">Searching...</div>
                        ) : filteredContacts.length === 0 ? (
                          <div className="p-4 text-center text-gray-500">
                            {searchTerm.trim() ? (
                              <div>
                                <p>No contacts found matching "{searchTerm}"</p>
                                <button
                                  type="button"
                                  onClick={() => setShowNewContactForm(true)}
                                  className="mt-2 inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
                                >
                                  <Plus className="w-4 h-4" />
                                  Add "{searchTerm}" as a new customer
                                </button>
                              </div>
                            ) : (
                              'Start typing to search all contacts'
                            )}
                          </div>
                        ) : (
                          filteredContacts.map((contact) => {
                            const displayName = contact.full_name ||
                              [contact.first_name, contact.last_name].filter(Boolean).join(' ') ||
                              contact.email ||
                              'Unknown';
                            return (
                              <button
                                type="button"
                                key={contact.id}
                                onClick={() => {
                                  setSelectedContact(contact.id);
                                  setShowNewContactForm(false);
                                }}
                                className={`w-full text-left flex items-start gap-3 p-3 hover:bg-infoSoft cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors ${
                                  selectedContact === contact.id ? 'bg-infoSoft border-strong' : 'bg-white'
                                }`}
                              >
                                <div className={`mt-1 w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                                  selectedContact === contact.id ? 'border-blue-600 bg-blue-600' : 'border-gray-300'
                                }`} />
                                <div className="min-w-0 flex-1 break-words">
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
                              </button>
                            );
                          })
                        )}
                      </div>

                      )}

                      {showNewContactForm && (
                        <div className="mt-3 space-y-3 rounded-lg border border-subtle bg-surface p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="font-semibold text-gray-900 text-sm sm:text-base">New Customer</h3>
                            <button
                              type="button"
                              onClick={() => setShowNewContactForm(false)}
                              className="text-sm text-gray-500 hover:text-gray-700"
                            >
                              Cancel
                            </button>
                          </div>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                First Name <span className="text-red-500">*</span> <SecurityFieldVisibility /></label>
                              <input
                                type="text"
                                value={newContact.first_name}
                                onChange={(e) => setNewContact({ ...newContact, first_name: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base sm:text-sm"
                                required={showNewContactForm && !selectedContact}
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Last Name <span className="text-red-500">*</span> <SecurityFieldVisibility /></label>
                              <input
                                type="text"
                                value={newContact.last_name}
                                onChange={(e) => setNewContact({ ...newContact, last_name: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base sm:text-sm"
                                required={showNewContactForm && !selectedContact}
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Company Name (Optional) <SecurityFieldVisibility internal /></label>
                            <input
                              type="text"
                              value={newContact.company_name}
                              onChange={(e) => setNewContact({ ...newContact, company_name: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base sm:text-sm"
                            />
                          </div>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Email <span className="text-red-500">*</span> <SecurityFieldVisibility /></label>
                              <input
                                type="email"
                                value={newContact.email}
                                onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base sm:text-sm"
                                required={showNewContactForm && !selectedContact}
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                Phone <span className="text-red-500">*</span> <SecurityFieldVisibility /></label>
                              <input
                                type="tel"
                                value={newContact.phone}
                                onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base sm:text-sm"
                                required={showNewContactForm && !selectedContact}
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Street Address <span className="text-red-500">*</span> <SecurityFieldVisibility /></label>
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
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base sm:text-sm"
                              required={showNewContactForm && !selectedContact}
                            />
                          </div>
                          <div className="grid grid-cols-[minmax(0,2fr)_minmax(4.25rem,1fr)_minmax(4.25rem,1.2fr)] gap-2 sm:gap-3">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                City <span className="text-red-500">*</span> <SecurityFieldVisibility /></label>
                              <input
                                type="text"
                                value={newContact.city}
                                onChange={(e) => setNewContact({ ...newContact, city: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base sm:text-sm"
                                required={showNewContactForm && !selectedContact}
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                State <span className="text-red-500">*</span> <SecurityFieldVisibility /></label>
                              <input
                                type="text"
                                value={newContact.state}
                                onChange={(e) => setNewContact({ ...newContact, state: e.target.value })}
                                maxLength={2}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base sm:text-sm"
                                required={showNewContactForm && !selectedContact}
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">ZIP <span className="text-red-500">*</span> <SecurityFieldVisibility /></label>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={newContact.zip_code}
                                onChange={(e) => setNewContact({ ...newContact, zip_code: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base sm:text-sm"
                                required={showNewContactForm && !selectedContact}
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {showContactEdit && selectedContactData && (
                        <div className="mt-3 space-y-3 rounded-lg border border-subtle bg-surface p-3">
                          <h3 className="font-semibold text-gray-900 text-sm sm:text-base">Customer Details</h3>

                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">First Name <SecurityFieldVisibility /></label>
                              <input
                                type="text"
                                value={contactEdits.first_name}
                                onChange={(e) => setContactEdits({ ...contactEdits, first_name: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base sm:text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name <SecurityFieldVisibility /></label>
                              <input
                                type="text"
                                value={contactEdits.last_name}
                                onChange={(e) => setContactEdits({ ...contactEdits, last_name: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base sm:text-sm"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Company Name <SecurityFieldVisibility internal /></label>
                            <input
                              type="text"
                              value={contactEdits.company_name}
                              onChange={(e) => setContactEdits({ ...contactEdits, company_name: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base sm:text-sm"
                            />
                          </div>

                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Email <SecurityFieldVisibility /></label>
                              <input
                                type="email"
                                value={contactEdits.email}
                                onChange={(e) => setContactEdits({ ...contactEdits, email: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base sm:text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Phone <SecurityFieldVisibility /></label>
                              <input
                                type="tel"
                                value={contactEdits.phone}
                                onChange={(e) => setContactEdits({ ...contactEdits, phone: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base sm:text-sm"
                              />
                            </div>
                          </div>

                          <div className="[&>div]:border-none [&>div]:p-0">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Street Address <SecurityFieldVisibility /></label>
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
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base sm:text-sm"
                            />
                          </div>

                          <div className="grid grid-cols-[minmax(0,2fr)_minmax(4.25rem,1fr)_minmax(4.25rem,1.2fr)] gap-2 sm:gap-3">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">City <SecurityFieldVisibility /></label>
                              <input
                                type="text"
                                value={contactEdits.city}
                                onChange={(e) => setContactEdits({ ...contactEdits, city: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base sm:text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">State <SecurityFieldVisibility /></label>
                              <input
                                type="text"
                                value={contactEdits.state}
                                onChange={(e) => setContactEdits({ ...contactEdits, state: e.target.value })}
                                maxLength={2}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base sm:text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">ZIP <SecurityFieldVisibility /></label>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={contactEdits.zip_code}
                                onChange={(e) => setContactEdits({ ...contactEdits, zip_code: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base sm:text-sm"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Sales Order (Optional) <SecurityFieldVisibility internal /></label>
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

                  </div>
                  <div className="min-w-0 space-y-3">
                    {/* Account Classification */}
                    <div className="space-y-3 rounded-lg border border-subtle bg-surface p-3">
                      <h3 className="text-sm font-semibold text-gray-800">Account Classification</h3>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Account Type <SecurityFieldVisibility internal /></label>
                        <div className="flex gap-3">
                          {(['residential', 'commercial'] as const).map(type => (
                            <button
                              key={type}
                              type="button"
                              onClick={() => setAccountType(type)}
                              aria-pressed={accountType === type}
                              className={`flex-1 [@media(pointer:coarse)]:min-h-11 py-1.5 rounded-lg border text-sm font-medium capitalize transition-all ${
                                accountType === type
                                  ? 'border-brand bg-infoSoft text-brand'
                                  : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                              }`}
                            >
                              {type}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Monitoring <SecurityFieldVisibility internal /></label>
                        <label className="flex cursor-pointer items-center gap-2 [@media(pointer:coarse)]:min-h-11">
                          <input
                            type="checkbox"
                            checked={isMonitoring}
                            onChange={(e) => setIsMonitoring(e.target.checked)}
                            className="h-4 w-4 shrink-0 rounded text-blue-600"
                          />
                          <span className="text-sm text-gray-700">Send alarms to a monitoring center</span>
                        </label>
                        {isMonitoring && (
                          <div className="mt-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Monitoring Account Number <span className="text-gray-400 font-normal">(Optional)</span> <SecurityFieldVisibility internal /></label>
                            <input
                              type="text"
                              value={monitoringAccountNumber}
                              onChange={(e) => setMonitoringAccountNumber(e.target.value)}
                              placeholder="e.g. 12345"
                              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Account Services <SecurityFieldVisibility internal /></label>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { value: 'dial_up', label: 'Dial-Up' },
                            { value: 'telguard', label: 'Telguard' },
                            { value: 'alarmnet', label: 'Alarmnet' },
                            { value: 'alarm_com', label: 'Alarm.com' },
                            { value: 'video_monitoring', label: 'Video / CCTV' },
                            { value: 'access_control', label: 'Access Control' },
                          ].map(svc => (
                            <label key={svc.value} className="flex cursor-pointer items-center gap-2 [@media(pointer:coarse)]:min-h-11">
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
                                className="h-4 w-4 shrink-0 rounded text-blue-600"
                              />
                              <span className="text-sm text-gray-700">{svc.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                    </div>

                    {/* Installation Details */}
                    <div className="space-y-3 rounded-lg border border-subtle bg-surface p-3">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Wrench className="w-4 h-4 text-amber-600" />
                        <h3 className="text-xs sm:text-sm font-semibold text-gray-800">Installation Details</h3>
                        <span className="text-xs text-amber-600">Optional</span>
                      </div>

                      <div>
                        <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Installation Date <SecurityFieldVisibility internal /></label>
                        <input
                          type="date"
                          value={installationDate}
                          onChange={(e) => setInstallationDate(e.target.value)}
                          className="w-full min-w-0 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      {accountServices.filter(s => ['dial_up', 'telguard', 'alarmnet', 'alarm_com'].includes(s)).length > 0 && (
                        <div className="space-y-2">
                          <label className="block text-xs sm:text-sm font-medium text-gray-700">Service Account Numbers <SecurityFieldVisibility internal /></label>
                          {accountServices.includes('dial_up') && (
                            <div>
                              <label className="block text-xs text-gray-500 mb-0.5">Monitoring Account Number</label>
                              <input
                                type="text"
                                value={serviceAccountNumbers.dial_up || ''}
                                onChange={(e) => setServiceAccountNumbers(prev => ({ ...prev, dial_up: e.target.value }))}
                                placeholder="e.g. 12345"
                                className="w-full min-w-0 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                          )}
                          {accountServices.includes('telguard') && (
                            <div>
                              <label className="block text-xs text-gray-500 mb-0.5">Telguard Account Number</label>
                              <input
                                type="text"
                                value={serviceAccountNumbers.telguard || ''}
                                onChange={(e) => setServiceAccountNumbers(prev => ({ ...prev, telguard: e.target.value }))}
                                placeholder="e.g. TG67890"
                                className="w-full min-w-0 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                          )}
                          {accountServices.includes('alarmnet') && (
                            <div>
                              <label className="block text-xs text-gray-500 mb-0.5">Alarmnet Account Number</label>
                              <input
                                type="text"
                                value={serviceAccountNumbers.alarmnet || ''}
                                onChange={(e) => setServiceAccountNumbers(prev => ({ ...prev, alarmnet: e.target.value }))}
                                placeholder="e.g. AN111"
                                className="w-full min-w-0 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                          )}
                          {accountServices.includes('alarm_com') && (
                            <div>
                              <label className="block text-xs text-gray-500 mb-0.5">Alarm.com Account Number</label>
                              <input
                                type="text"
                                value={serviceAccountNumbers.alarm_com || ''}
                                onChange={(e) => setServiceAccountNumbers(prev => ({ ...prev, alarm_com: e.target.value }))}
                                placeholder="e.g. AC222"
                                className="w-full min-w-0 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Notes (Optional) <SecurityFieldVisibility internal /></label>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Add any notes about this agreement..."
                        rows={2}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Email Override (Optional) <SecurityFieldVisibility internal /></label>
                      <input
                        type="email"
                        value={emailOverride}
                        onChange={(e) => setEmailOverride(e.target.value)}
                        placeholder="Send invitation to a different email address..."
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <p className="mt-1 text-xs text-gray-500">Delivery address only; this override is not displayed on the customer form. Leave blank to use the customer's email on file.</p>
                    </div>
                  </div>
                </div>
                <div className="min-w-0 space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Agreement Term <span className="text-red-500">*</span> <SecurityFieldVisibility /></label>
                    <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                      {SECURITY_INITIAL_TERMS.map((months) => (
                        <button
                          key={months}
                          type="button"
                          onClick={() => setTermMonths(months)}
                          aria-pressed={termMonths === months}
                          className={`min-h-10 [@media(pointer:coarse)]:min-h-11 whitespace-nowrap rounded-lg border px-1 py-1.5 text-center text-sm transition-colors ${
                            termMonths === months
                              ? 'border-brand bg-infoSoft text-brand font-semibold'
                              : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                          }`}
                        >
                          {months}<span className="sr-only"> months</span>
                          <span aria-hidden="true" className="ml-0.5 text-xs">mo</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Renewal Term <SecurityFieldVisibility /></label>
                    <p className="text-sm text-gray-700">Automatically renews month-to-month after the initial term. Cancellation after the initial term requires 30 days' notice.</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Monitoring Services
                    </label>
                    <p className="text-xs text-gray-600 mb-2">Service names: Customer-visible. Individual prices and catalog descriptions: Internal only.</p>
                    <div className="overflow-hidden rounded-lg border border-subtle">
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
                            <div className="border-b border-subtle bg-surface px-3 py-1.5 text-xs font-semibold text-secondary">
                              {category}
                            </div>
                            {services.map((service) => (
                              <label
                                key={service.id}
                                className={`flex cursor-pointer items-start gap-2 [@media(pointer:coarse)]:min-h-11 border-b border-subtle px-3 py-2 last:border-b-0 hover:bg-gray-50 ${
                                  selectedServices.includes(service.id) ? 'bg-infoSoft' : ''
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
                                <div className="min-w-0 flex-1 break-words">
                                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                                    <div className="text-sm font-medium text-gray-900">{service.name}</div>
                                    <div className="shrink-0 text-xs font-semibold text-blue-600">
                                      ${service.monthly_price.toFixed(2)}/mo <SecurityFieldVisibility internal />
                                    </div>
                                  </div>
                                  {service.description && (
                                    <div className="mt-0.5 text-xs text-gray-600">{service.description}</div>
                                  )}
                                </div>
                              </label>
                            ))}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Price Override (Optional) <SecurityFieldVisibility /></label>
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
                      <p className="mt-1 text-xs text-gray-600">
                        Selected services total ${calculatedMonthlyPrice.toFixed(2)}/mo before the override.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-subtle bg-white px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-5">
              <div className="flex items-baseline gap-x-2 text-sm">
                <span className="font-medium text-secondary">Monthly Total <SecurityFieldVisibility /></span>
                <output aria-label="Monthly Total" className="whitespace-nowrap font-semibold text-primary">
                  ${finalMonthlyPrice.toFixed(2)}/mo
                </output>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="shrink-0 px-3 py-2 text-sm sm:px-4 [@media(pointer:coarse)]:min-h-11 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-w-0 px-3 py-2 text-sm sm:px-4 [@media(pointer:coarse)]:min-h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Creating...' : onPaperCreated ? 'Continue to Onboarding Form' : 'Create Agreement'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
