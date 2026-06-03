import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { AddressAutocomplete } from '../Shared/AddressAutocomplete';
import { QuickActionModal } from '../Shared/QuickActionModal';
import {
  X,
  Search,
  MapPin,
  FileText,
  DollarSign,
  AlertCircle,
  Clock,
  User,
  Calendar,
  Paperclip,
  Mic,
  Plus,
  RotateCcw,
  AlertTriangle,
  Save,
  CheckCircle2
} from 'lucide-react';

interface EditingRequest {
  id: string;
  contact_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  job_location_address: string;
  job_location_city: string | null;
  job_location_state: string | null;
  job_location_zip: string | null;
  job_description: string;
  billable_type: string;
  billable_by: string;
  billable_by_user_id?: string | null;
  priority: string;
  estimated_duration: string | null;
  requested_date: string | null;
  requested_time: string | null;
  notes: string | null;
  kickback_reason: string | null;
}

interface AIPrefill {
  contactId?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  jobAddress?: string;
  jobCity?: string;
  jobState?: string;
  jobZip?: string;
  jobDescription?: string;
  billableType?: 'billable' | 'warranty';
  priority?: 'normal' | 'urgent';
  estimatedDuration?: string;
  requestedDate?: string;
  requestedTime?: string;
  notes?: string;
}

interface ServiceRequestFormProps {
  onClose: () => void;
  onSuccess?: () => void;
  prefilledContactId?: string;
  editingRequest?: EditingRequest;
  aiPrefill?: AIPrefill | null;
}

export function ServiceRequestForm({ onClose, onSuccess, prefilledContactId, editingRequest, aiPrefill }: ServiceRequestFormProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [searching, setSearching] = useState(false);
  const [salesReps, setSalesReps] = useState<any[]>([]);
  const aiPrefillApplied = useRef(false);

  const isEditMode = !!editingRequest;
  const [showSuccess, setShowSuccess] = useState(false);

  const [originalContact, setOriginalContact] = useState<{
    phone: string;
    email: string;
    street_address: string;
    city: string;
    state: string;
    zip_code: string;
  } | null>(null);
  const [showSaveToContactPrompt, setShowSaveToContactPrompt] = useState(false);
  const [pendingContactUpdates, setPendingContactUpdates] = useState<Record<string, string>>({});
  const [savingToContact, setSavingToContact] = useState(false);

  const [formData, setFormData] = useState({
    contact_id: editingRequest?.contact_id || prefilledContactId || null,
    customer_name: editingRequest?.customer_name || '',
    customer_phone: editingRequest?.customer_phone || '',
    customer_email: editingRequest?.customer_email || '',
    job_location_address: editingRequest?.job_location_address || '',
    job_location_city: editingRequest?.job_location_city || '',
    job_location_state: editingRequest?.job_location_state || '',
    job_location_zip: editingRequest?.job_location_zip || '',
    job_description: editingRequest?.job_description || '',
    billable_type: (editingRequest?.billable_type || 'billable') as 'billable' | 'warranty',
    billable_by: (editingRequest?.billable_by || 'assigned_sales_rep') as 'admin' | 'dispatch' | 'assigned_sales_rep' | 'other_sales_rep',
    billable_by_user_id: editingRequest?.billable_by_user_id || null as string | null,
    priority: (editingRequest?.priority || 'normal') as 'normal' | 'urgent',
    estimated_duration: editingRequest?.estimated_duration || '',
    requested_date: editingRequest?.requested_date ? editingRequest.requested_date.split('T')[0] : '',
    requested_time: editingRequest?.requested_time || '',
    notes: editingRequest?.notes || ''
  });

  useEffect(() => {
    loadSalesReps();
    if (!isEditMode && prefilledContactId) {
      loadContact(prefilledContactId);
    }
    if (isEditMode && editingRequest?.contact_id) {
      setShowNewCustomer(false);
    }
  }, [prefilledContactId, isEditMode]);

  useEffect(() => {
    if (!aiPrefill || aiPrefillApplied.current || isEditMode) return;
    aiPrefillApplied.current = true;

    setFormData(prev => ({
      ...prev,
      customer_name: aiPrefill.customerName || prev.customer_name,
      customer_phone: aiPrefill.customerPhone || prev.customer_phone,
      customer_email: aiPrefill.customerEmail || prev.customer_email,
      job_location_address: aiPrefill.jobAddress || prev.job_location_address,
      job_location_city: aiPrefill.jobCity || prev.job_location_city,
      job_location_state: aiPrefill.jobState || prev.job_location_state,
      job_location_zip: aiPrefill.jobZip || prev.job_location_zip,
      job_description: aiPrefill.jobDescription || prev.job_description,
      billable_type: aiPrefill.billableType || prev.billable_type,
      priority: aiPrefill.priority || prev.priority,
      estimated_duration: aiPrefill.estimatedDuration || prev.estimated_duration,
      requested_date: aiPrefill.requestedDate || prev.requested_date,
      requested_time: aiPrefill.requestedTime || prev.requested_time,
      notes: aiPrefill.notes || prev.notes,
    }));

    if (aiPrefill.contactId) {
      loadContact(aiPrefill.contactId);
      setShowNewCustomer(false);
    } else if (aiPrefill.customerName) {
      setShowNewCustomer(true);
      if (aiPrefill.customerName.length >= 2) {
        setSearchQuery(aiPrefill.customerName);
      }
    }
  }, [aiPrefill, isEditMode]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchQuery.length >= 1) {
        searchContacts();
      } else if (searchQuery.length === 0) {
        loadDefaultContacts();
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  async function loadSalesReps() {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name')
        .or('role.eq.sales,role.eq.admin,role.eq.manager')
        .order('full_name');

      setSalesReps(data || []);
    } catch (error) {
      console.error('Error loading sales reps:', error);
    }
  }

  async function loadContact(contactId: string) {
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', contactId)
        .single();

      if (error) throw error;

      if (data) {
        setOriginalContact({
          phone: data.phone || '',
          email: data.email || '',
          street_address: data.street_address || '',
          city: data.city || '',
          state: data.state || '',
          zip_code: data.zip_code || '',
        });
        setFormData(prev => ({
          ...prev,
          contact_id: data.id,
          customer_name: data.full_name || data.company_name || '',
          customer_phone: data.phone || '',
          customer_email: data.email || '',
          job_location_address: data.street_address || '',
          job_location_city: data.city || '',
          job_location_state: data.state || '',
          job_location_zip: data.zip_code || ''
        }));
      }
    } catch (error) {
      console.error('Error loading contact:', error);
    }
  }

  async function loadDefaultContacts() {
    setSearching(true);
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, full_name, first_name, last_name, company_name, phone, email, street_address, city, state, zip_code')
        .order('last_name', { nullsFirst: false })
        .limit(50);

      if (error) throw error;
      setSearchResults(data || []);
    } catch (error) {
      console.error('Error loading contacts:', error);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function searchContacts() {
    setSearching(true);
    try {
      const searchTerm = searchQuery.trim();

      if (!searchTerm) {
        await loadDefaultContacts();
        return;
      }

      const { data, error } = await supabase
        .from('contacts')
        .select('id, full_name, first_name, last_name, company_name, phone, email, street_address, city, state, zip_code')
        .or(`first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%,full_name.ilike.%${searchTerm}%,company_name.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`)
        .limit(20);

      if (error) {
        console.error('Error searching contacts:', error);
        setSearchResults([]);
      } else {
        setSearchResults(data || []);
      }
    } catch (error: any) {
      console.error('Error searching contacts:', error);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  function selectContact(contact: any) {
    setOriginalContact({
      phone: contact.phone || '',
      email: contact.email || '',
      street_address: contact.street_address || '',
      city: contact.city || '',
      state: contact.state || '',
      zip_code: contact.zip_code || '',
    });
    setFormData(prev => ({
      ...prev,
      contact_id: contact.id,
      customer_name: contact.full_name || contact.company_name || '',
      customer_phone: contact.phone || '',
      customer_email: contact.email || '',
      job_location_address: contact.street_address || '',
      job_location_city: contact.city || '',
      job_location_state: contact.state || '',
      job_location_zip: contact.zip_code || ''
    }));
    setSearchQuery('');
    setSearchResults([]);
  }

  function getContactUpdates(): Record<string, string> {
    if (!originalContact || !formData.contact_id) return {};
    const updates: Record<string, string> = {};

    if (!originalContact.phone && formData.customer_phone?.trim())
      updates.phone = formData.customer_phone.trim();
    if (!originalContact.email && formData.customer_email?.trim())
      updates.email = formData.customer_email.trim();
    if (!originalContact.street_address && formData.job_location_address?.trim())
      updates.street_address = formData.job_location_address.trim();
    if (!originalContact.city && formData.job_location_city?.trim())
      updates.city = formData.job_location_city.trim();
    if (!originalContact.state && formData.job_location_state?.trim())
      updates.state = formData.job_location_state.trim();
    if (!originalContact.zip_code && formData.job_location_zip?.trim())
      updates.zip_code = formData.job_location_zip.trim();

    return updates;
  }

  async function saveUpdatesToContact() {
    if (!formData.contact_id || Object.keys(pendingContactUpdates).length === 0) return;
    setSavingToContact(true);
    try {
      const { error } = await supabase
        .from('contacts')
        .update(pendingContactUpdates)
        .eq('id', formData.contact_id);
      if (error) throw error;
    } catch (err) {
      console.error('Error updating contact:', err);
    } finally {
      setSavingToContact(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.customer_name.trim()) {
      alert('Please enter customer name');
      return;
    }

    if (!formData.job_location_address.trim()) {
      alert('Please enter job location');
      return;
    }

    if (!formData.job_description.trim()) {
      alert('Please enter job description');
      return;
    }

    // Check if the user added info that was missing from the contact record
    if (!isEditMode && formData.contact_id && originalContact) {
      const updates = getContactUpdates();
      if (Object.keys(updates).length > 0) {
        setPendingContactUpdates(updates);
        setShowSaveToContactPrompt(true);
        return;
      }
    }

    await submitForm();
  }

  async function submitForm() {
    setLoading(true);

    try {
      if (!profile?.id) {
        alert('You must be logged in to submit a service request.');
        setLoading(false);
        return;
      }

      let billableByUserId = formData.billable_by_user_id || null;
      if (formData.billable_by === 'assigned_sales_rep' && !billableByUserId) {
        billableByUserId = profile?.id || null;
      }

      if (isEditMode && editingRequest) {
        const { error } = await supabase
          .from('service_requests')
          .update({
            customer_name: formData.customer_name,
            customer_phone: formData.customer_phone || null,
            customer_email: formData.customer_email || null,
            job_location_address: formData.job_location_address,
            job_location_city: formData.job_location_city || null,
            job_location_state: formData.job_location_state || null,
            job_location_zip: formData.job_location_zip || null,
            job_description: formData.job_description,
            billable_type: formData.billable_type,
            billable_by: formData.billable_by,
            billable_by_user_id: billableByUserId,
            priority: formData.priority,
            estimated_duration: formData.estimated_duration || null,
            requested_date: formData.requested_date || null,
            requested_time: formData.requested_time || null,
            notes: formData.notes || null,
            status: 'open',
            kickback_reason: null,
            kicked_back_by: null,
            kicked_back_at: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingRequest.id);

        if (error) throw error;

        if (onSuccess) onSuccess();
        onClose();
        return;
      }

      let finalContactId = formData.contact_id;

      if (!finalContactId && showNewCustomer) {
        const { data: newContact, error: contactError } = await supabase
          .from('contacts')
          .insert({
            full_name: formData.customer_name,
            phone: formData.customer_phone || null,
            email: formData.customer_email || null,
            street_address: formData.job_location_address,
            city: formData.job_location_city || null,
            state: formData.job_location_state || null,
            zip_code: formData.job_location_zip || null,
            created_by: profile.id
          })
          .select()
          .single();

        if (contactError) {
          console.error('Error creating contact:', contactError);
          throw new Error(`Failed to create contact: ${contactError.message}`);
        }
        finalContactId = newContact.id;
      }

      if (!finalContactId) {
        alert('Please select an existing customer or use "Create New Customer" option.');
        setLoading(false);
        return;
      }

      const { data: serviceRequest, error: requestError } = await supabase
        .from('service_requests')
        .insert({
          created_by: profile.id,
          contact_id: finalContactId || null,
          customer_name: formData.customer_name,
          customer_phone: formData.customer_phone || null,
          customer_email: formData.customer_email || null,
          job_location_address: formData.job_location_address,
          job_location_city: formData.job_location_city || null,
          job_location_state: formData.job_location_state || null,
          job_location_zip: formData.job_location_zip || null,
          job_description: formData.job_description,
          billable_type: formData.billable_type,
          billable_by: formData.billable_by,
          billable_by_user_id: billableByUserId,
          priority: formData.priority,
          estimated_duration: formData.estimated_duration || null,
          requested_date: formData.requested_date || null,
          requested_time: formData.requested_time || null,
          notes: formData.notes || null,
          offline_created: !navigator.onLine,
          synced_at: navigator.onLine ? new Date().toISOString() : null,
          source_type: 'staff_form'
        })
        .select()
        .single();

      if (requestError) {
        console.error('Error creating service request:', requestError);
        throw new Error(`Failed to create service request: ${requestError.message}`);
      }

      setShowSuccess(true);
      setTimeout(() => {
        if (onSuccess) onSuccess();
        onClose();
        if (serviceRequest?.id) {
          window.location.hash = `#dispatch`;
        }
      }, 900);
    } catch (error: any) {
      console.error('Error submitting service request:', error);
      const errorMessage = error?.message || 'Unknown error occurred';
      alert(`Failed to submit service request: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }

  const isValid = formData.customer_name && formData.job_location_address && formData.job_description;

  return (
    <>
    <QuickActionModal
      title={isEditMode ? 'Update & Resubmit' : 'New Service Request'}
      subtitle={isEditMode ? 'Address feedback, then resubmit for review' : 'Create and dispatch a new service job'}
      icon={isEditMode ? <RotateCcw className="w-5 h-5 text-white" /> : <FileText className="w-5 h-5 text-white" />}
      accentColor={isEditMode ? 'from-amber-600 to-orange-700' : 'from-blue-600 to-cyan-700'}
      onClose={onClose}
      showSuccess={showSuccess}
      successMessage="Service Request Created!"
    >
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-6 overflow-y-auto flex-1">

          {/* Kickback reason banner (edit mode only) */}
          {isEditMode && editingRequest?.kickback_reason && (
            <div className="flex items-start gap-3 bg-amber-950/40 border border-amber-700/50 rounded-lg p-4">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-semibold text-amber-300 mb-1">Manager Feedback — Please Address Before Resubmitting</div>
                <p className="text-sm text-amber-400 leading-relaxed">{editingRequest.kickback_reason}</p>
              </div>
            </div>
          )}

          {/* Customer Section */}
          <div className="space-y-4">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <User className="w-5 h-5" />
              Customer
            </h3>

            {!isEditMode && !formData.contact_id && !showNewCustomer && (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Type customer name, company, or phone..."
                    className="w-full pl-10 pr-4 py-3 bg-gray-800 border-2 border-blue-500/60 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-lg text-white placeholder-gray-500"
                    autoFocus
                  />
                </div>

                {searching && (
                  <div className="text-center py-4 text-gray-400">
                    <div className="animate-spin inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                    <p className="mt-2">Searching...</p>
                  </div>
                )}

                {!searching && searchResults.length > 0 && (
                  <div className="border border-blue-500/40 rounded-lg max-h-48 overflow-y-auto bg-gray-800">
                    <div className="bg-blue-900/40 px-3 py-2 border-b border-blue-500/40">
                      <p className="text-sm text-blue-300 font-medium">Found {searchResults.length} customer{searchResults.length !== 1 ? 's' : ''}</p>
                    </div>
                    {searchResults.map(contact => (
                      <button
                        key={contact.id}
                        type="button"
                        onClick={() => selectContact(contact)}
                        className="w-full text-left p-3 hover:bg-gray-700 border-b border-gray-700 last:border-b-0 transition-colors"
                      >
                        <p className="font-medium text-white">
                          {contact.full_name || contact.company_name || 'Unnamed Contact'}
                        </p>
                        {contact.company_name && contact.full_name && (
                          <p className="text-sm text-gray-400">{contact.company_name}</p>
                        )}
                        <p className="text-sm text-gray-400">{contact.phone || 'No phone'}</p>
                      </button>
                    ))}
                  </div>
                )}

                {!searching && searchQuery.length >= 1 && searchResults.length === 0 && (
                  <div className="text-center py-4 text-gray-400 border border-dashed border-gray-600 rounded-lg">
                    <p>No customers found matching "{searchQuery}"</p>
                    <p className="text-sm mt-1">Try a different search or create a new customer below</p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setShowNewCustomer(true)}
                  className="w-full py-3 border border-dashed border-gray-600 rounded-lg text-gray-400 hover:border-blue-500 hover:text-blue-400 transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  Create New Customer
                </button>
              </>
            )}

            {(formData.contact_id || showNewCustomer || isEditMode) && (
              <>
                {formData.contact_id && !isEditMode && (
                  <div className="bg-emerald-950/40 border border-emerald-700/50 rounded-lg p-3 flex items-center justify-between">
                    <span className="text-emerald-400 font-medium">
                      Existing Customer Selected
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setFormData(prev => ({
                          ...prev,
                          contact_id: '',
                          customer_name: '',
                          customer_phone: '',
                          customer_email: '',
                          job_location_address: '',
                          job_location_city: '',
                          job_location_state: '',
                          job_location_zip: ''
                        }));
                      }}
                      className="text-sm text-emerald-400 hover:text-emerald-300 underline"
                    >
                      Change Customer
                    </button>
                  </div>
                )}

                {formData.contact_id && isEditMode && (
                  <div className="bg-emerald-950/40 border border-emerald-700/50 rounded-lg p-3">
                    <span className="text-emerald-400 font-medium text-sm">Linked to existing customer record</span>
                  </div>
                )}

                {showNewCustomer && !formData.contact_id && (
                  <div className="bg-blue-950/40 border border-blue-700/50 rounded-lg p-3 flex items-center justify-between">
                    <span className="text-blue-400 font-medium">
                      Creating New Customer
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewCustomer(false);
                        setFormData(prev => ({
                          ...prev,
                          customer_name: '',
                          customer_phone: '',
                          customer_email: '',
                          job_location_address: '',
                          job_location_city: '',
                          job_location_state: '',
                          job_location_zip: ''
                        }));
                      }}
                      className="text-sm text-blue-400 hover:text-blue-300 underline"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                <input
                  type="text"
                  value={formData.customer_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, customer_name: e.target.value }))}
                  placeholder="Customer Name *"
                  required
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg text-white placeholder-gray-500"
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="relative">
                    <input
                      type="tel"
                      value={formData.customer_phone}
                      onChange={(e) => setFormData(prev => ({ ...prev, customer_phone: e.target.value }))}
                      placeholder="Phone"
                      className={`w-full px-4 py-3 bg-gray-800 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg text-white placeholder-gray-500 ${
                        originalContact && !originalContact.phone && formData.customer_phone?.trim()
                          ? 'border-emerald-500'
                          : 'border-gray-600'
                      }`}
                    />
                    {originalContact && !originalContact.phone && formData.customer_phone?.trim() && (
                      <span className="absolute -top-2 right-2 text-xs bg-emerald-900 text-emerald-300 font-medium px-1.5 py-0.5 rounded-full border border-emerald-600">new</span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type="email"
                      value={formData.customer_email}
                      onChange={(e) => setFormData(prev => ({ ...prev, customer_email: e.target.value }))}
                      placeholder="Email"
                      className={`w-full px-4 py-3 bg-gray-800 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg text-white placeholder-gray-500 ${
                        originalContact && !originalContact.email && formData.customer_email?.trim()
                          ? 'border-emerald-500'
                          : 'border-gray-600'
                      }`}
                    />
                    {originalContact && !originalContact.email && formData.customer_email?.trim() && (
                      <span className="absolute -top-2 right-2 text-xs bg-emerald-900 text-emerald-300 font-medium px-1.5 py-0.5 rounded-full border border-emerald-600">new</span>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Location Section */}
          <div className="space-y-4 border-t border-gray-700 pt-4">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              Job Location
            </h3>
            <div className="relative">
              <AddressAutocomplete
                value={formData.job_location_address}
                onChange={(address, components) => {
                  setFormData(prev => ({
                    ...prev,
                    job_location_address: address,
                    job_location_city: components?.city || prev.job_location_city,
                    job_location_state: components?.state || prev.job_location_state,
                    job_location_zip: components?.zip || prev.job_location_zip
                  }));
                }}
                placeholder="Street Address *"
                required
                className={`w-full px-4 py-3 bg-gray-800 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg text-white placeholder-gray-500 ${
                  originalContact && !originalContact.street_address && formData.job_location_address?.trim()
                    ? 'border-emerald-500'
                    : 'border-gray-600'
                }`}
              />
              {originalContact && !originalContact.street_address && formData.job_location_address?.trim() && (
                <span className="absolute -top-2 right-2 text-xs bg-emerald-900 text-emerald-300 font-medium px-1.5 py-0.5 rounded-full border border-emerald-600">new</span>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <input
                type="text"
                value={formData.job_location_city}
                onChange={(e) => setFormData(prev => ({ ...prev, job_location_city: e.target.value }))}
                placeholder="City"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg text-white placeholder-gray-500"
              />
              <input
                type="text"
                value={formData.job_location_state}
                onChange={(e) => setFormData(prev => ({ ...prev, job_location_state: e.target.value }))}
                placeholder="State"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg text-white placeholder-gray-500"
              />
              <input
                type="text"
                value={formData.job_location_zip}
                onChange={(e) => setFormData(prev => ({ ...prev, job_location_zip: e.target.value }))}
                placeholder="ZIP"
                className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg text-white placeholder-gray-500"
              />
            </div>
          </div>

          {/* Job Description */}
          <div className="space-y-4 border-t border-gray-700 pt-4">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Job Description
            </h3>
            <textarea
              value={formData.job_description}
              onChange={(e) => setFormData(prev => ({ ...prev, job_description: e.target.value }))}
              placeholder="What needs to be done? *"
              required
              rows={4}
              className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg text-white placeholder-gray-500 resize-none"
            />
          </div>

          {/* Billable Type */}
          <div className="space-y-4 border-t border-gray-700 pt-4">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Billable Type
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, billable_type: 'billable' }))}
                className={`py-3 rounded-lg border font-semibold transition-all ${
                  formData.billable_type === 'billable'
                    ? 'bg-green-600 text-white border-green-600'
                    : 'bg-gray-800 text-gray-300 border-gray-600 hover:border-green-500'
                }`}
              >
                Billable
              </button>
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, billable_type: 'warranty' }))}
                className={`py-3 rounded-lg border font-semibold transition-all ${
                  formData.billable_type === 'warranty'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-gray-800 text-gray-300 border-gray-600 hover:border-blue-500'
                }`}
              >
                Warranty
              </button>
            </div>
          </div>

          {/* Billable By */}
          <div className="space-y-3 border-t border-gray-700 pt-4">
            <h3 className="font-semibold text-white">Billable By</h3>
            <select
              value={formData.billable_by}
              onChange={(e) => setFormData(prev => ({ ...prev, billable_by: e.target.value as any }))}
              className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
            >
              <option value="admin">Admin</option>
              <option value="dispatch">Dispatch</option>
              <option value="assigned_sales_rep">Assigned Sales Rep (Me)</option>
              <option value="other_sales_rep">Other Sales Rep</option>
            </select>

            {formData.billable_by === 'other_sales_rep' && (
              <select
                value={formData.billable_by_user_id || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, billable_by_user_id: e.target.value || null }))}
                className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
              >
                <option value="">Select Sales Rep</option>
                {salesReps.map(rep => (
                  <option key={rep.id} value={rep.id}>{rep.full_name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Priority */}
          <div className="space-y-3 border-t border-gray-700 pt-4">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Priority
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, priority: 'normal' }))}
                className={`py-3 rounded-lg border font-semibold transition-all ${
                  formData.priority === 'normal'
                    ? 'bg-gray-600 text-white border-gray-500'
                    : 'bg-gray-800 text-gray-300 border-gray-600 hover:border-gray-500'
                }`}
              >
                Normal
              </button>
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, priority: 'urgent' }))}
                className={`py-3 rounded-lg border font-semibold transition-all ${
                  formData.priority === 'urgent'
                    ? 'bg-orange-600 text-white border-orange-600'
                    : 'bg-gray-800 text-gray-300 border-gray-600 hover:border-orange-500'
                }`}
              >
                Urgent
              </button>
            </div>
            <p className="text-xs text-gray-500 italic">
              * Dispatch cannot guarantee urgent requests or need by date requests.
            </p>
          </div>

          {/* Optional Fields */}
          <div className="space-y-4 border-t border-gray-700 pt-4">
            <h3 className="font-semibold text-white">Optional Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  <Clock className="w-4 h-4 inline mr-1" />
                  Estimated Duration
                </label>
                <select
                  value={formData.estimated_duration}
                  onChange={(e) => setFormData(prev => ({ ...prev, estimated_duration: e.target.value }))}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
                >
                  <option value="">Not Sure</option>
                  <option value="30min">30 minutes</option>
                  <option value="1hr">1 hour</option>
                  <option value="2hrs">2 hours</option>
                  <option value="half_day">Half day</option>
                  <option value="full_day">Full day</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  Need By (ASAP if blank)
                </label>
                <input
                  type="date"
                  value={formData.requested_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, requested_date: e.target.value }))}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Additional Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Any additional context for the service team..."
                rows={3}
                className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white placeholder-gray-500 resize-none"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-700 rounded-lg text-gray-300 font-medium hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid || loading}
              className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 ${
                isEditMode
                  ? 'bg-gradient-to-r from-amber-600 to-orange-700 text-white hover:opacity-90'
                  : 'bg-gradient-to-r from-blue-600 to-cyan-700 text-white hover:opacity-90'
              }`}
            >
              {loading ? (
                isEditMode ? 'Resubmitting...' : 'Creating...'
              ) : isEditMode ? (
                <>
                  <RotateCcw className="w-4 h-4" />
                  Resubmit for Review
                </>
              ) : (
                'Create Service Request'
              )}
            </button>
          </div>
        </form>
    </QuickActionModal>

      {/* Save to Contact prompt modal */}
      {showSaveToContactPrompt && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70] p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md">
            <div className="p-6">
              <div className="flex items-start gap-4 mb-5">
                <div className="w-12 h-12 rounded-full bg-blue-900/50 flex items-center justify-center flex-shrink-0">
                  <Save className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Save to Contact Record?</h3>
                  <p className="text-sm text-gray-400 mt-1">
                    You added information that was missing from this customer's contact record. Would you like to save it?
                  </p>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-4 mb-5 space-y-2">
                {pendingContactUpdates.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span className="text-gray-300"><span className="font-medium text-white">Phone:</span> {pendingContactUpdates.phone}</span>
                  </div>
                )}
                {pendingContactUpdates.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span className="text-gray-300"><span className="font-medium text-white">Email:</span> {pendingContactUpdates.email}</span>
                  </div>
                )}
                {pendingContactUpdates.street_address && (
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span className="text-gray-300"><span className="font-medium text-white">Address:</span> {[pendingContactUpdates.street_address, pendingContactUpdates.city, pendingContactUpdates.state, pendingContactUpdates.zip_code].filter(Boolean).join(', ')}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={async () => {
                    setShowSaveToContactPrompt(false);
                    await submitForm();
                  }}
                  className="flex-1 px-4 py-2.5 border border-gray-700 rounded-lg text-gray-300 font-medium hover:bg-gray-800 transition-colors"
                >
                  Skip, don't save
                </button>
                <button
                  type="button"
                  disabled={savingToContact}
                  onClick={async () => {
                    await saveUpdatesToContact();
                    setShowSaveToContactPrompt(false);
                    await submitForm();
                  }}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {savingToContact ? 'Saving...' : 'Yes, save to contact'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
