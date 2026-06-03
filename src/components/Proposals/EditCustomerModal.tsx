import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Contact } from '../../lib/types';
import { X, Save, Search, User, AlertCircle } from 'lucide-react';
import { AddressAutocomplete } from '../Shared/AddressAutocomplete';
import ConfirmModal from '../ui/ConfirmModal';
import { lookupTaxRateByZip } from '../../lib/taxCalculations';

interface EditCustomerModalProps {
  contactId: string;
  proposalId: string;
  onSave: () => void;
  onClose: () => void;
}

export default function EditCustomerModal({ contactId, proposalId, onSave, onClose }: EditCustomerModalProps) {
  const [activeTab, setActiveTab] = useState<'edit' | 'reassign'>('edit');
  const [contact, setContact] = useState<Contact | null>(null);
  const [proposal, setProposal] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Contact[]>([]);
  const [searching, setSearching] = useState(false);
  const [updateType, setUpdateType] = useState<'master' | 'override'>('master');
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    company_name: '',
    email: '',
    phone: '',
    street_address: '',
    city: '',
    state: '',
    zip_code: ''
  });

  useEffect(() => {
    loadContact();
  }, [contactId]);

  useEffect(() => {
    if (activeTab === 'reassign' && searchQuery.length >= 1) {
      searchContacts();
    } else if (activeTab === 'reassign' && searchQuery.length === 0) {
      loadDefaultContacts();
    } else {
      setSearchResults([]);
    }
  }, [searchQuery, activeTab]);

  async function loadContact() {
    try {
      setLoading(true);

      // Load contact
      const { data: contactData, error: contactError } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', contactId)
        .maybeSingle();

      if (contactError) throw contactError;
      if (!contactData) throw new Error('Contact not found');

      setContact(contactData as Contact);

      // Load proposal to check for existing override
      const { data: proposalData, error: proposalError } = await supabase
        .from('proposals')
        .select('*')
        .eq('id', proposalId)
        .maybeSingle();

      if (proposalError) throw proposalError;
      setProposal(proposalData);

      // If proposal has override, use override values and set update type
      if (proposalData?.use_customer_override) {
        setUpdateType('override');
        setFormData({
          first_name: proposalData.customer_override_first_name || '',
          last_name: proposalData.customer_override_last_name || '',
          company_name: proposalData.customer_override_company_name || '',
          email: proposalData.customer_override_email || '',
          phone: proposalData.customer_override_phone || '',
          street_address: proposalData.customer_override_street_address || '',
          city: proposalData.customer_override_city || '',
          state: proposalData.customer_override_state || '',
          zip_code: proposalData.customer_override_zip || ''
        });
      } else {
        // Use master contact values
        setFormData({
          first_name: contactData.first_name || '',
          last_name: contactData.last_name || '',
          company_name: contactData.company_name || '',
          email: contactData.email || '',
          phone: contactData.phone || '',
          street_address: (contactData as any).street_address || '',
          city: (contactData as any).city || '',
          state: (contactData as any).state || '',
          zip_code: (contactData as any).zip_code || ''
        });
      }
    } catch (error) {
      console.error('Error loading contact:', error);
      alert('Failed to load contact information');
    } finally {
      setLoading(false);
    }
  }

  async function loadDefaultContacts() {
    try {
      setSearching(true);
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .neq('id', contactId)
        .order('last_name', { nullsFirst: false })
        .limit(50);

      if (error) throw error;
      setSearchResults(data || []);
    } catch (error) {
      console.error('Error loading contacts:', error);
    } finally {
      setSearching(false);
    }
  }

  async function searchContacts() {
    try {
      setSearching(true);
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .or(`first_name.ilike.%${searchQuery}%,last_name.ilike.%${searchQuery}%,contact_name.ilike.%${searchQuery}%,company_name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`)
        .neq('id', contactId)
        .limit(20);

      if (error) throw error;
      setSearchResults(data || []);
    } catch (error) {
      console.error('Error searching contacts:', error);
    } finally {
      setSearching(false);
    }
  }

  async function handleSaveEdit() {
    if (!formData.first_name || !formData.last_name) {
      alert('First name and last name are required');
      return;
    }

    try {
      setSaving(true);

      if (updateType === 'master') {
        const zipChanged = formData.zip_code && formData.zip_code !== ((contact as any).zip_code || '');
        let resolvedJurisdictionId: string | null = (contact as any).tax_jurisdiction_id || null;

        if (zipChanged && formData.zip_code && !((contact as any).is_tax_exempt)) {
          try {
            const jurisdiction = await lookupTaxRateByZip(formData.zip_code);
            if (jurisdiction) {
              const { data: dbJ } = await supabase
                .from('tax_jurisdictions')
                .select('id')
                .eq('zip_code', formData.zip_code)
                .eq('is_active', true)
                .maybeSingle();
              if (dbJ?.id) {
                resolvedJurisdictionId = dbJ.id;
              } else {
                const { data: defaultJ } = await supabase
                  .from('tax_jurisdictions')
                  .select('id')
                  .eq('is_default', true)
                  .eq('is_active', true)
                  .maybeSingle();
                resolvedJurisdictionId = defaultJ?.id || resolvedJurisdictionId;
              }
            }
          } catch {
          }
        }

        // Update the master contact record
        const updates: any = {
          first_name: formData.first_name,
          last_name: formData.last_name,
          contact_name: `${formData.first_name} ${formData.last_name}`,
          company_name: formData.company_name || null,
          email: formData.email || null,
          phone: formData.phone || null,
          street_address: formData.street_address || null,
          city: formData.city || null,
          state: formData.state || null,
          zip_code: formData.zip_code || null,
          tax_jurisdiction_id: resolvedJurisdictionId,
          updated_at: new Date().toISOString()
        };

        const { error } = await supabase
          .from('contacts')
          .update(updates)
          .eq('id', contactId);

        if (error) {
          console.error('Contact update error:', error);
          throw error;
        }

        // Clear any existing override on this proposal
        const { error: proposalError } = await supabase
          .from('proposals')
          .update({
            use_customer_override: false,
            customer_override_first_name: null,
            customer_override_last_name: null,
            customer_override_company_name: null,
            customer_override_email: null,
            customer_override_phone: null,
            customer_override_street_address: null,
            customer_override_city: null,
            customer_override_state: null,
            customer_override_zip: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', proposalId);

        if (proposalError) {
          console.error('Proposal update error:', proposalError);
          throw proposalError;
        }
      } else {
        // Create/update proposal-specific override
        const overrideUpdates: any = {
          use_customer_override: true,
          customer_override_first_name: formData.first_name,
          customer_override_last_name: formData.last_name,
          customer_override_company_name: formData.company_name || null,
          customer_override_email: formData.email || null,
          customer_override_phone: formData.phone || null,
          customer_override_street_address: formData.street_address || null,
          customer_override_city: formData.city || null,
          customer_override_state: formData.state || null,
          customer_override_zip: formData.zip_code || null,
          updated_at: new Date().toISOString()
        };

        const { error } = await supabase
          .from('proposals')
          .update(overrideUpdates)
          .eq('id', proposalId);

        if (error) {
          console.error('Proposal override update error:', error);
          throw error;
        }
      }

      onSave();
      onClose();
    } catch (error: any) {
      console.error('Error saving customer:', error);
      alert(`Failed to save customer information: ${error?.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleReassign(newContactId: string) {
    setConfirmModal({
      title: 'Reassign Proposal',
      message: 'Are you sure you want to reassign this proposal to a different customer?',
      onConfirm: async () => {
        setConfirmModal(null);
        await doReassign(newContactId);
      }
    });
  }

  async function doReassign(newContactId: string) {
    try {
      setSaving(true);

      const { error } = await supabase
        .from('proposals')
        .update({ contact_id: newContactId, updated_at: new Date().toISOString() })
        .eq('id', proposalId);

      if (error) throw error;

      onSave();
      onClose();
    } catch (error) {
      console.error('Error reassigning proposal:', error);
      alert('Failed to reassign proposal');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="text-white">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white">Edit Customer</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex border-b border-gray-700">
          <button
            onClick={() => setActiveTab('edit')}
            className={`flex-1 px-6 py-3 font-medium ${
              activeTab === 'edit'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <User size={16} className="inline-block mr-2" />
            Edit Details
          </button>
          <button
            onClick={() => setActiveTab('reassign')}
            className={`flex-1 px-6 py-3 font-medium ${
              activeTab === 'reassign'
                ? 'text-blue-400 border-b-2 border-blue-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Search size={16} className="inline-block mr-2" />
            Reassign
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'edit' ? (
            <div className="space-y-4">
              {/* Update Type Selection */}
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="updateType"
                    checked={updateType === 'master'}
                    onChange={() => setUpdateType('master')}
                    className="mt-1"
                  />
                  <div>
                    <div className="text-white font-medium">Update Master Contact</div>
                    <div className="text-sm text-gray-400">
                      Changes will apply to all proposals for this customer
                    </div>
                  </div>
                </label>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="updateType"
                    checked={updateType === 'override'}
                    onChange={() => setUpdateType('override')}
                    className="mt-1"
                  />
                  <div>
                    <div className="text-white font-medium">Override for This Proposal Only</div>
                    <div className="text-sm text-gray-400">
                      Customer information will differ only for this specific proposal
                    </div>
                  </div>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    First Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Last Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Company Name
                </label>
                <input
                  type="text"
                  value={formData.company_name}
                  onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Street Address
                </label>
                <AddressAutocomplete
                  value={formData.street_address}
                  onChange={(value, addressComponents) => {
                    setFormData(prev => ({
                      ...prev,
                      street_address: value,
                      city: addressComponents?.city || prev.city,
                      state: addressComponents?.state || prev.state,
                      zip_code: addressComponents?.zip || prev.zip_code
                    }));
                  }}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white"
                />
              </div>

              <div className="grid grid-cols-6 gap-4">
                <div className="col-span-3">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    City
                  </label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white"
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    State
                  </label>
                  <input
                    type="text"
                    value={formData.state}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    maxLength={2}
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white uppercase"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    ZIP Code
                  </label>
                  <input
                    type="text"
                    value={formData.zip_code}
                    onChange={(e) => setFormData({ ...formData, zip_code: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white"
                  />
                </div>
              </div>

              {updateType === 'master' && !contact?.is_tax_exempt && !(contact as any)?.tax_jurisdiction_id && (
                <div className="flex items-center gap-2 p-3 bg-amber-900/30 border border-amber-700/50 rounded-lg text-amber-300 text-sm">
                  <AlertCircle size={16} className="flex-shrink-0" />
                  <span>This customer has no tax jurisdiction assigned. Saving with a valid ZIP code will auto-assign one.</span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Search for a different customer
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name, company, or email..."
                    className="w-full bg-gray-900 border border-gray-700 rounded pl-10 pr-3 py-2 text-white"
                  />
                </div>
              </div>

              {searching && (
                <div className="text-center text-gray-400 py-4">Searching...</div>
              )}

              {!searching && searchResults.length > 0 && (
                <div className="space-y-2">
                  {searchResults.map((result) => (
                    <button
                      key={result.id}
                      onClick={() => handleReassign(result.id)}
                      className="w-full bg-gray-900 hover:bg-gray-700 border border-gray-700 rounded p-4 text-left transition-colors"
                    >
                      <div className="font-medium text-white">{result.contact_name}</div>
                      {result.company_name && (
                        <div className="text-sm text-gray-400">{result.company_name}</div>
                      )}
                      {result.email && (
                        <div className="text-sm text-gray-400">{result.email}</div>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {!searching && searchResults.length === 0 && (
                <div className="text-center text-gray-400 py-8">
                  {searchQuery.length >= 1 ? `No contacts found matching "${searchQuery}"` : 'No contacts available'}
                </div>
              )}
            </div>
          )}
        </div>

        {activeTab === 'edit' && (
          <div className="p-6 border-t border-gray-700 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-400 hover:text-white"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Save size={16} />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>
      <ConfirmModal
        isOpen={!!confirmModal}
        title={confirmModal?.title || ''}
        message={confirmModal?.message || ''}
        variant="danger"
        onConfirm={() => confirmModal?.onConfirm()}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}
