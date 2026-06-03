import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Search, X, Plus, Building2, User, ChevronDown, Loader2, Check, Mail, Send, Users, ArrowUpRight } from 'lucide-react';

interface ContactOption {
  id: string;
  full_name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

interface BillToSectionProps {
  proposalId: string;
  primaryContactEmail: string | null;
  billToContactId: string | null;
  billToSendTo: 'customer' | 'bill_to' | 'both';
  onBillToChange: (contactId: string | null, sendTo: 'customer' | 'bill_to' | 'both') => void;
}

interface QuickAddFormData {
  contact_type: 'person' | 'business';
  first_name: string;
  last_name: string;
  company_name: string;
  email: string;
  phone: string;
  street_address: string;
  city: string;
  state: string;
  zip_code: string;
}

const EMPTY_FORM: QuickAddFormData = {
  contact_type: 'business',
  first_name: '',
  last_name: '',
  company_name: '',
  email: '',
  phone: '',
  street_address: '',
  city: '',
  state: '',
  zip_code: '',
};

export default function BillToSection({
  proposalId,
  primaryContactEmail,
  billToContactId,
  billToSendTo,
  onBillToChange,
}: BillToSectionProps) {
  const { profile } = useAuth();
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [selectedContact, setSelectedContact] = useState<ContactOption | null>(null);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddForm, setQuickAddForm] = useState<QuickAddFormData>(EMPTY_FORM);
  const [savingQuickAdd, setSavingQuickAdd] = useState(false);
  const [sendTo, setSendTo] = useState<'customer' | 'bill_to' | 'both'>(billToSendTo);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSendTo(billToSendTo);
  }, [billToSendTo]);

  useEffect(() => {
    if (billToContactId) {
      loadSelectedContact(billToContactId);
    } else {
      setSelectedContact(null);
    }
  }, [billToContactId]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function loadSelectedContact(id: string) {
    const { data } = await supabase
      .from('contacts')
      .select('id, full_name, company_name, email, phone, street_address, city, state, zip')
      .eq('id', id)
      .maybeSingle();
    if (data) setSelectedContact(data);
  }

  async function searchContacts(q: string) {
    if (!q.trim()) {
      setContacts([]);
      return;
    }
    setSearching(true);
    try {
      const { data } = await supabase
        .from('contacts')
        .select('id, full_name, company_name, email, phone, street_address, city, state, zip')
        .or(`full_name.ilike.%${q}%,company_name.ilike.%${q}%,email.ilike.%${q}%`)
        .order('full_name')
        .limit(20);
      setContacts(data || []);
    } finally {
      setSearching(false);
    }
  }

  function handleQueryChange(val: string) {
    setQuery(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => searchContacts(val), 300);
  }

  async function handleSelectContact(c: ContactOption) {
    setSelectedContact(c);
    setDropdownOpen(false);
    setQuery('');
    await persistBillTo(c.id, sendTo);
    onBillToChange(c.id, sendTo);
  }

  async function handleClear() {
    setSelectedContact(null);
    await persistBillTo(null, 'customer');
    onBillToChange(null, 'customer');
    setSendTo('customer');
  }

  async function handleSendToChange(val: 'customer' | 'bill_to' | 'both') {
    setSendTo(val);
    if (selectedContact) {
      await persistBillTo(selectedContact.id, val);
      onBillToChange(selectedContact.id, val);
    }
  }

  async function persistBillTo(contactId: string | null, st: 'customer' | 'bill_to' | 'both') {
    setSaving(true);
    try {
      await supabase
        .from('proposals')
        .update({ bill_to_contact_id: contactId, bill_to_send_to: st })
        .eq('id', proposalId);
    } finally {
      setSaving(false);
    }
  }

  async function handleQuickAddSave() {
    if (!profile) return;
    setSavingQuickAdd(true);
    try {
      const { data, error } = await supabase
        .from('contacts')
        .insert({
          company_id: profile.company_id,
          contact_type: quickAddForm.contact_type,
          first_name: quickAddForm.first_name || null,
          last_name: quickAddForm.last_name || null,
          company_name: quickAddForm.company_name || null,
          email: quickAddForm.email || null,
          phone: quickAddForm.phone || null,
          street_address: quickAddForm.street_address || null,
          city: quickAddForm.city || null,
          state: quickAddForm.state || null,
          zip_code: quickAddForm.zip_code || null,
          sales_status: 'customer',
        })
        .select('id, full_name, company_name, email, phone, street_address, city, state, zip')
        .single();

      if (error) throw error;
      if (data) {
        setSelectedContact(data);
        await persistBillTo(data.id, sendTo);
        onBillToChange(data.id, sendTo);
        setShowQuickAdd(false);
        setQuickAddForm(EMPTY_FORM);
      }
    } catch (err) {
      console.error('Error creating contact:', err);
      alert('Failed to create contact. Please try again.');
    } finally {
      setSavingQuickAdd(false);
    }
  }

  const displayName = selectedContact
    ? (selectedContact.company_name || selectedContact.full_name || 'Unknown')
    : null;

  return (
    <div className="border-t border-gray-200 pt-6 mt-6">
      <div className="flex items-center gap-2 mb-1">
        <Building2 className="w-4 h-4 text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-900">Bill-To Party</h3>
        {saving && <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />}
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Set a separate billing party (contractor, property manager, etc.) when someone other than the customer will be invoiced.
      </p>

      {!selectedContact ? (
        <div ref={dropdownRef} className="relative">
          <div
            className="flex items-center w-full px-3 py-2 border border-gray-300 rounded-lg cursor-text focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent bg-white"
            onClick={() => {
              setDropdownOpen(true);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
          >
            <Search className="w-4 h-4 text-gray-400 mr-2 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => handleQueryChange(e.target.value)}
              placeholder="Search contacts by name, company, or email..."
              className="flex-1 bg-transparent outline-none text-sm text-gray-900 placeholder-gray-400"
            />
            {searching && <Loader2 className="w-4 h-4 text-gray-400 animate-spin ml-2" />}
          </div>

          {dropdownOpen && (
            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-64 overflow-y-auto">
              {contacts.length === 0 && !searching && query.trim().length > 0 && (
                <div className="px-3 py-2.5 text-sm text-gray-500 flex items-center gap-2">
                  <User className="w-4 h-4" />
                  No contacts found for "{query}"
                </div>
              )}
              {contacts.length === 0 && !searching && query.trim().length === 0 && (
                <div className="px-3 py-2.5 text-sm text-gray-500">
                  Start typing to search contacts...
                </div>
              )}
              {contacts.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => handleSelectContact(c)}
                  className="w-full text-left px-3 py-2.5 hover:bg-blue-50 transition-colors flex flex-col gap-0.5"
                >
                  <span className="text-sm font-medium text-gray-900">
                    {c.company_name || c.full_name}
                  </span>
                  {c.company_name && c.full_name && (
                    <span className="text-xs text-gray-500">{c.full_name}</span>
                  )}
                  {c.email && (
                    <span className="text-xs text-gray-400">{c.email}</span>
                  )}
                </button>
              ))}
              <div className="border-t border-gray-100">
                <button
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => {
                    setDropdownOpen(false);
                    setQuery('');
                    setShowQuickAdd(true);
                  }}
                  className="w-full text-left px-3 py-2.5 text-sm text-blue-600 hover:bg-blue-50 transition-colors flex items-center gap-2 font-medium"
                >
                  <Plus className="w-4 h-4" />
                  Add New Contact
                </button>
              </div>
            </div>
          )}

          {!dropdownOpen && (
            <button
              type="button"
              onClick={() => {
                setShowQuickAdd(true);
              }}
              className="mt-2 text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              Add New Contact
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 min-w-0">
                <Building2 className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="font-semibold text-gray-900 text-sm">{displayName}</div>
                  {selectedContact.company_name && selectedContact.full_name !== selectedContact.company_name && (
                    <div className="text-xs text-gray-600">{selectedContact.full_name}</div>
                  )}
                  {selectedContact.email && (
                    <div className="text-xs text-gray-500">{selectedContact.email}</div>
                  )}
                  {(selectedContact.street_address || selectedContact.city) && (
                    <div className="text-xs text-gray-500 mt-1">
                      {[selectedContact.street_address, selectedContact.city, selectedContact.state, selectedContact.zip]
                        .filter(Boolean).join(', ')}
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={handleClear}
                className="p-1 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                title="Remove bill-to party"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2 flex items-center gap-1.5">
              <Send className="w-3.5 h-3.5" />
              Send Proposal To
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              {[
                { value: 'customer', label: 'Customer Only', sub: primaryContactEmail || 'Primary customer' },
                { value: 'bill_to', label: 'Bill-To Only', sub: selectedContact.email || 'Bill-to contact' },
                { value: 'both', label: 'Both', sub: 'Customer + Bill-to' },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSendToChange(opt.value as typeof sendTo)}
                  className={`flex-1 px-3 py-2 rounded-lg border text-left transition-all ${
                    sendTo === opt.value
                      ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-400'
                      : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {sendTo === opt.value ? (
                      <Check className="w-3.5 h-3.5 text-blue-600" />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full border border-gray-300" />
                    )}
                    <span className={`text-xs font-semibold ${sendTo === opt.value ? 'text-blue-700' : 'text-gray-700'}`}>
                      {opt.label}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 ml-5 truncate">{opt.sub}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showQuickAdd && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-semibold text-gray-900">Add New Bill-To Contact</h3>
              </div>
              <button
                type="button"
                onClick={() => { setShowQuickAdd(false); setQuickAddForm(EMPTY_FORM); }}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">Contact Type</label>
                <div className="flex gap-2">
                  {(['business', 'person'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setQuickAddForm(f => ({ ...f, contact_type: t }))}
                      className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                        quickAddForm.contact_type === t
                          ? 'bg-blue-50 border-blue-400 text-blue-700'
                          : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      {t === 'business' ? <Building2 className="w-4 h-4" /> : <User className="w-4 h-4" />}
                      {t === 'business' ? 'Business' : 'Individual'}
                    </button>
                  ))}
                </div>
              </div>

              {quickAddForm.contact_type === 'business' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Company Name *</label>
                  <input
                    type="text"
                    value={quickAddForm.company_name}
                    onChange={e => setQuickAddForm(f => ({ ...f, company_name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="ABC Contractors LLC"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">First Name</label>
                  <input
                    type="text"
                    value={quickAddForm.first_name}
                    onChange={e => setQuickAddForm(f => ({ ...f, first_name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="John"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={quickAddForm.last_name}
                    onChange={e => setQuickAddForm(f => ({ ...f, last_name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Smith"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
                    <Mail className="w-3 h-3" />
                    Email
                  </label>
                  <input
                    type="email"
                    value={quickAddForm.email}
                    onChange={e => setQuickAddForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="billing@company.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={quickAddForm.phone}
                    onChange={e => setQuickAddForm(f => ({ ...f, phone: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="(555) 555-5555"
                  />
                </div>
              </div>

              <div className="border-t border-gray-100 pt-3">
                <label className="block text-xs font-medium text-gray-700 mb-2">Billing Address</label>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={quickAddForm.street_address}
                    onChange={e => setQuickAddForm(f => ({ ...f, street_address: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Street Address"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-1">
                      <input
                        type="text"
                        value={quickAddForm.city}
                        onChange={e => setQuickAddForm(f => ({ ...f, city: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="City"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        value={quickAddForm.state}
                        onChange={e => setQuickAddForm(f => ({ ...f, state: e.target.value }))}
                        maxLength={2}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                        placeholder="KS"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        value={quickAddForm.zip_code}
                        onChange={e => setQuickAddForm(f => ({ ...f, zip_code: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="ZIP"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowQuickAdd(false); setQuickAddForm(EMPTY_FORM); }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleQuickAddSave}
                  disabled={savingQuickAdd || (!quickAddForm.company_name && !quickAddForm.first_name && !quickAddForm.last_name)}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {savingQuickAdd ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {savingQuickAdd ? 'Saving...' : 'Save & Select'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
