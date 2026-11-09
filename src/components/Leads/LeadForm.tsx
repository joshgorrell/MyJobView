import { notify } from '../../lib/feedback';
import { useState, useEffect, useRef } from 'react';
import { Users, Search, UserCheck, Plus } from 'lucide-react';
import { AIFormFill } from '../Shared/AIFormFill';
import { QuickActionModal } from '../Shared/QuickActionModal';
import { supabase } from '../../lib/supabase';
import { Profile, CompanyOffice } from '../../lib/types';
import { useAuth } from '../../contexts/AuthContext';
import { useAutoSave } from '../../hooks/useAutoSave';
import { missingContactFields } from '../../lib/contactCompleteness';
import { generateUniqueUsername } from '../../lib/username';
import { offlineSupabaseInsert } from '../../lib/offlineSupport';

interface LeadFormProps {
  aiPrefill?: { contactName?: string; company?: string; email?: string; phone?: string; description?: string; priority?: string } | null;
  onClose: () => void;
  onSuccess: () => void;
}

interface ContactSearchResult {
  id: string;
  contact_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  contact_type?: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  assigned_to: string | null;
}

export function LeadForm({ onClose, onSuccess, aiPrefill }: LeadFormProps) {
  const { profile } = useAuth();
  const [salesReps, setSalesReps] = useState<Profile[]>([]);
  const [repsLoaded, setRepsLoaded] = useState(false);
  const [offices, setOffices] = useState<CompanyOffice[]>([]);
  const [formData, setFormData] = useState({
    company_name: '',
    contact_name: '',
    is_business: false,
    email: '',
    phone: '',
    opportunity_description: '',
    tags: '',
    priority: 'medium',
    office_id: '',
    assignment: 'fishbowl' as 'fishbowl' | string,
  });
  const [customerExpanded, setCustomerExpanded] = useState(false);
  const searchVersion = useRef(0);
  const [searchError, setSearchError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const [contactMode, setContactMode] = useState<'new' | 'existing'>('existing');
  const [contactSearch, setContactSearch] = useState('');
  const [contactResults, setContactResults] = useState<ContactSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedContact, setSelectedContact] = useState<ContactSearchResult | null>(null);
  const [showResults, setShowResults] = useState(false);
  const hideOffice = contactMode === 'existing' && selectedContact !== null;
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  // Auto-save hook
  const { restoreSavedData, clearSavedData } = useAutoSave({
    key: 'lead_new',
    data: formData,
    enabled: true
  });

  useEffect(() => {
    loadSalesReps();
    loadOffices();

    // Auto-restore saved data on mount
    const savedData = restoreSavedData();
    if (savedData) {
      setFormData(previous => ({ ...previous, ...savedData, is_business: Boolean(savedData.company_name) }));
    }
  }, []);

  useEffect(() => {
    if (!aiPrefill) return;
    setFormData(previous => ({
      ...previous,
      contact_name: aiPrefill.contactName ?? previous.contact_name,
      company_name: aiPrefill.company ?? previous.company_name,
      is_business: aiPrefill.company ? true : previous.is_business,
      email: aiPrefill.email ?? previous.email,
      phone: aiPrefill.phone ?? previous.phone,
      opportunity_description: aiPrefill.description ?? previous.opportunity_description,
      priority: ['low', 'medium', 'high', 'urgent'].includes(aiPrefill.priority ?? '') ? aiPrefill.priority! : previous.priority,
    }));
  }, [aiPrefill]);

  useEffect(() => {
    ++searchVersion.current;
    if (contactMode !== 'existing') return;
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (contactSearch.trim().length < 2) {
      setContactResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimeoutRef.current = setTimeout(() => searchContacts(contactSearch.trim()), 300);
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  }, [contactSearch, contactMode]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (resultsRef.current && !resultsRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function searchContacts(query: string) {
    const version = searchVersion.current;
    setSearchError('');
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, contact_name, company_name, email, phone, street_address, city, state, zip_code, assigned_to')
        .or(`contact_name.ilike.%${query}%,company_name.ilike.%${query}%,email.ilike.%${query}%,phone.ilike.%${query}%`)
        .order('contact_name')
        .limit(10);

      if (error) throw error;
      if (version === searchVersion.current) setContactResults(data || []);
    } catch {
      if (version === searchVersion.current) { setContactResults([]); setSearchError("Could not load customers. Please try again."); }
    } finally {
      if (version === searchVersion.current) setSearching(false);
    }
  }

  function selectContact(contact: ContactSearchResult) {
    ++searchVersion.current;
    setCustomerExpanded(false);
    setSelectedContact(contact);

    const repId = contact.assigned_to;
    const repIsAssignable = repId
      ? salesReps.some((rep) => rep.id === repId)
      : false;

    setFormData({
      ...formData,
      contact_name: contact.contact_name || contact.company_name || '',
      company_name: contact.company_name || '',
      email: contact.email || '',
      phone: contact.phone || '',
      is_business: Boolean(contact.company_name),
      office_id: '',
      assignment: repIsAssignable ? repId! : 'fishbowl',
    });
    setShowResults(false);
    setContactSearch('');
  }

  function clearSelectedContact() {
    ++searchVersion.current;
    setCustomerExpanded(false);
    setSelectedContact(null);
    setContactMode('existing');
    setFormData({
      ...formData,
      contact_name: '',
      company_name: '',
      email: '',
      phone: '',
      is_business: false,
      assignment: 'fishbowl',
    });
  }

  async function loadSalesReps() {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('is_sales_rep', true)
      .eq('is_active', true)
      .order('full_name');

    if (data) { setSalesReps(data); setRepsLoaded(true); }
  }

  async function loadOffices() {
    const { data } = await supabase
      .from('company_offices')
      .select('*')
      .order('display_order');

    if (data) setOffices(data);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const isFishbowl = formData.assignment === 'fishbowl';
      const assignedTo = isFishbowl ? null : formData.assignment;

      if (contactMode === 'existing' && !selectedContact) throw new Error('Select a customer first.');
      const username = await generateUniqueUsername(formData.contact_name, supabase);
      let contactId = selectedContact?.id || null;
      if (!contactId) {
        if (!formData.contact_name.trim()) throw new Error('Contact name is required.');
        const { data: createdContact, error: contactError } = await supabase.from('contacts').insert({
          contact_name: formData.contact_name.trim(),
          username,
          company_name: formData.is_business ? formData.company_name.trim() || null : null,
          phone: formData.phone.trim() || null,
          email: formData.email.trim() || null,
          created_by: profile?.id,
        }).select('id').single();
        if (contactError || !createdContact?.id) throw contactError || new Error('Unable to create contact');
        contactId = createdContact.id;
      }
      const leadData = {
        company_name: (formData.is_business ? formData.company_name : null) || null,
        contact_name: formData.contact_name,
        username: username,
        email: formData.email || null,
        phone: formData.phone || null,
        opportunity_description: formData.opportunity_description || null,
        priority: formData.priority,
        office_id: formData.office_id || null,
        status: isFishbowl ? 'unclaimed' : 'claimed',
        assigned_to: assignedTo,
        created_by: profile?.id,
        is_fishbowl: isFishbowl,
        claimed_at: isFishbowl ? null : new Date().toISOString(),
        converted_from_contact_id: contactId,
      };

      const leadResult = await offlineSupabaseInsert('leads', leadData);
      if (leadResult.error) throw leadResult.error;
      const lead = Array.isArray(leadResult.data) ? leadResult.data[0] : leadResult.data;

      if (formData.tags && lead) {
        const tags = formData.tags
          .split(/[\s,]+/)
          .filter((tag) => tag.startsWith('#'))
          .map((tag) => tag.substring(1).toLowerCase());

        if (tags.length > 0) {
          const tagInserts = tags.map((tag) => ({
            lead_id: lead.id,
            tag,
          }));

          await offlineSupabaseInsert('lead_tags', tagInserts);
        }
      }

      if (lead) {
        await offlineSupabaseInsert('feed_events', {
          event_type: 'lead_created',
          lead_id: lead.id,
          user_id: profile?.id,
          metadata: {
            company_name: formData.company_name,
            contact_name: formData.contact_name,
            is_fishbowl: isFishbowl,
            linked_contact_id: contactId,
          },
        });
      }

      if (isFishbowl) {
        let allSalesReps: any[] = [];

        if (formData.office_id) {
          const { data: officeUsers } = await supabase
            .from('user_offices')
            .select('user_id')
            .eq('office_id', formData.office_id);

          if (officeUsers && officeUsers.length > 0) {
            const userIds = officeUsers.map(ou => ou.user_id);
            const { data } = await supabase
              .from('profiles')
              .select('id, email, email_leads, notify_on_fishbowl')
              .in('id', userIds)
              .eq('is_sales_rep', true)
              .eq('is_active', true);
            allSalesReps = data || [];
          }

          const { data: unassignedReps } = await supabase
            .from('profiles')
            .select('id, email, email_leads, notify_on_fishbowl')
            .eq('is_sales_rep', true)
            .eq('is_active', true)
            .not('id', 'in', `(SELECT user_id FROM user_offices)`);

          if (unassignedReps) {
            allSalesReps = [...allSalesReps, ...unassignedReps];
          }
        } else {
          const { data } = await supabase
            .from('profiles')
            .select('id, email, email_leads, notify_on_fishbowl')
            .eq('is_sales_rep', true)
            .eq('is_active', true);
          allSalesReps = data || [];
        }

        if (allSalesReps && allSalesReps.length > 0) {
          const repsToNotify = allSalesReps.filter(rep => rep.notify_on_fishbowl !== false);

          if (repsToNotify.length > 0) {
            const notifications = repsToNotify.map((rep) => ({
              user_id: rep.id,
              type: 'fishbowl_lead',
              lead_id: lead.id,
              title: 'New Lead in Fishbowl',
              body: `${formData.contact_name}${formData.company_name ? ` from ${formData.company_name}` : ''} is available to claim`,
            }));

            await offlineSupabaseInsert('notifications', notifications);
          }

          const emailReps = allSalesReps.filter(rep => rep.email_leads && rep.email);
          if (emailReps.length > 0) {
            const emails = emailReps.map(rep => rep.email);
            try {
              const { data: { session } } = await supabase.auth.getSession();
              await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-lead-notification`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${session?.access_token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  to: emails,
                  leadId: lead.id,
                  leadName: formData.contact_name,
                  companyName: formData.company_name || undefined,
                  isFishbowl: true,
                }),
              });
            } catch (emailError) {
              console.error('Error sending email notifications:', emailError);
            }
          }
        }
      } else if (assignedTo) {
        const { data: assignedUser } = await supabase
          .from('profiles')
          .select('notify_on_lead_assigned')
          .eq('id', assignedTo)
          .single();

        if (assignedUser?.notify_on_lead_assigned !== false) {
          await offlineSupabaseInsert('notifications', {
            user_id: assignedTo,
            type: 'lead_assigned',
            lead_id: lead.id,
            title: 'New Lead Assigned',
            body: `You've been assigned ${formData.contact_name}${formData.company_name ? ` from ${formData.company_name}` : ''}`,
          });
        }

        const { data: assignedRep } = await supabase
          .from('profiles')
          .select('email, email_leads')
          .eq('id', assignedTo)
          .single();

        if (assignedRep?.email && assignedRep.email_leads) {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-lead-notification`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${session?.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                to: [assignedRep.email],
                leadId: lead.id,
                leadName: formData.contact_name,
                companyName: formData.company_name || undefined,
                isFishbowl: false,
              }),
            });
          } catch (emailError) {
            console.error('Error sending email notification:', emailError);
          }
        }
      }

      clearSavedData();
      setShowSuccess(true);
      await new Promise(resolve => setTimeout(resolve, 900));
      onSuccess();
      onClose();

      // Navigate to the lead detail page
      if (lead?.id) {
        window.location.hash = `#lead/${lead.id}`;
      }
    } catch (error) {
      console.error('Error creating lead:', error);
      notify('Failed to create lead. Please try again.', { theme: 'blue', tone: 'error' });
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    // Clear saved data when user explicitly closes the form
    clearSavedData();
    onClose();
  }

  const inputClass = "w-full px-3 py-2 bg-surface border border-subtle text-primary text-sm rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent";

  return (
    <QuickActionModal
      title="New Lead"
      subtitle="Add a new sales opportunity"
      icon={<Users className="w-5 h-5 text-primary" />}
      accentColor="from-emerald-600 to-teal-700"
      onClose={handleClose}
      showSuccess={showSuccess}
      successMessage="Lead Created!"
    >
        <form onSubmit={handleSubmit} className="px-4 sm:px-6 py-4 space-y-3 min-w-0">
          {contactMode === 'new' && <AIFormFill kind="lead" onFill={prefill => setFormData(previous => ({ ...previous, contact_name: prefill.contactName ?? previous.contact_name, company_name: prefill.company ?? previous.company_name, is_business: prefill.company ? true : previous.is_business, email: prefill.email ?? previous.email, phone: prefill.phone ?? previous.phone, opportunity_description: prefill.description ?? previous.opportunity_description, priority: ['low', 'medium', 'high', 'urgent'].includes(prefill.priority ?? '') ? prefill.priority! : previous.priority }))} />}
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm font-medium text-secondary">Customer <span className="text-red-400">*</span></label>
            {contactMode === 'existing' && !selectedContact && <button type="button" onClick={() => { setContactMode('new'); setShowResults(false); setContactSearch(''); }} className="inline-flex items-center gap-1 text-sm text-emerald-400 hover:underline"><Plus className="w-4 h-4" /> Add Contact</button>}
            {contactMode === 'new' && <button type="button" onClick={() => { setContactMode('existing'); setShowResults(false); }} className="text-sm text-emerald-400 hover:underline">Search existing customers</button>}
          </div>
          {/* Existing Customer Search */}
          {contactMode === 'existing' && !selectedContact && (
            <div className="relative" ref={resultsRef}>
              <label className="block text-sm font-medium text-secondary mb-1.5">
                Search for a customer
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <Search className="w-4 h-4 text-muted" />
                </div>
                <input
                  type="text"
                  value={contactSearch}
                  onChange={(e) => { setContactSearch(e.target.value); setShowResults(true); }}
                  onFocus={() => setShowResults(true)}
                  className={`${inputClass} pl-10`}
                  placeholder="Search by name, company, email, or phone..."
                  autoFocus
                />
                {searching && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">...</div>
                )}
              </div>

              {showResults && contactSearch.trim().length >= 2 && (
                <div className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-subtle bg-surface shadow-lg">
                  {searchError ? <p role="alert" className="p-3 text-sm text-red-500">{searchError}</p> : contactResults.length === 0 && !searching ? (
                    <div className="px-4 py-3 text-sm text-muted">No customers found. Use + Add Contact to create one.</div>
                  ) : (
                    contactResults.map((contact) => (
                      <button
                        type="button"
                        key={contact.id}
                        disabled={!repsLoaded}
                        onClick={() => selectContact(contact)}
                        className="w-full text-left px-4 py-2.5 hover:bg-emerald-600/10 border-b border-subtle/50 last:border-0 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <UserCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-primary truncate">{contact.contact_name || 'Unnamed'}</p>
                            <p className="text-xs text-muted break-words">
                              {Boolean(contact.company_name) && contact.company_name ? `${contact.company_name} · ` : ''}
                              {[contact.email, contact.phone, contact.street_address, contact.city, contact.state, contact.zip_code].filter(Boolean).join(' · ') || 'No contact info'}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
              <p className="text-xs text-muted mt-1">Search your existing customer database by name, company, email, or phone number.</p>
            </div>
          )}

          {/* Selected Contact Banner */}
          {contactMode === 'existing' && selectedContact && (
            <div className="rounded-lg border border-emerald-600/40 bg-emerald-600/10 p-3">
              <div className="flex items-center justify-between gap-2">
                <button type="button" aria-expanded={customerExpanded} aria-controls="lead-customer-details" onClick={() => setCustomerExpanded(value => !value)} className="flex items-center gap-2 min-w-0 text-left flex-1">
                  <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-primary truncate">{selectedContact.contact_name || 'Unnamed'}</p>
                    <p className="text-xs text-muted break-words">
                      {Boolean(selectedContact.company_name) && selectedContact.company_name ? `${selectedContact.company_name} · ` : ''}
                      {customerExpanded ? 'Hide details ▴' : 'Show contact details ▾'}
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={clearSelectedContact}
                  className="text-xs text-muted hover:text-primary shrink-0 px-2 py-1 rounded hover:bg-surface transition-colors"
                >
                  Change
                </button>
              </div>
              {missingContactFields({ ...selectedContact, full_name: selectedContact.contact_name }).length > 0 && <p className="mt-2 text-xs text-amber-400">Incomplete contact — missing: {missingContactFields(selectedContact).join(', ')}</p>}
              {customerExpanded && <dl id="lead-customer-details" className="mt-3 grid gap-1 text-sm break-words">
                <div><dt className="inline text-muted">Phone: </dt><dd className="inline">{selectedContact.phone || 'Not provided'}</dd></div>
                <div><dt className="inline text-muted">Email: </dt><dd className="inline">{selectedContact.email || 'Not provided'}</dd></div>
                <div><dt className="inline text-muted">Current rep: </dt><dd className="inline">{salesReps.find(rep => rep.id === selectedContact.assigned_to)?.full_name || 'No active sales rep'}</dd></div>
                <div><dt className="inline text-muted">Address: </dt><dd className="inline">{[selectedContact.street_address, selectedContact.city, selectedContact.state, selectedContact.zip_code].filter(Boolean).join(', ') || 'Not provided'}</dd></div>
              </dl>}
            </div>
          )}

          {contactMode === 'new' && <>
          <p className="text-xs text-amber-400">{missingContactFields({ full_name: formData.contact_name, phone: formData.phone, email: formData.email }).length > 0 ? 'Incomplete contact — missing: ' + missingContactFields({ full_name: formData.contact_name, phone: formData.phone, email: formData.email }).join(', ') : 'Additional address details can be completed later in the customer record.'}</p>
          <label className="flex items-center gap-2 text-sm text-secondary"><input type="checkbox" checked={formData.is_business} onChange={e => setFormData({ ...formData, is_business: e.target.checked, company_name: '' })} />Business customer</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-secondary mb-1.5">
                Contact Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.contact_name}
                onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                className={inputClass}
                placeholder="John Doe"
              />
            </div>
            {formData.is_business && <div>
              <label className="block text-sm font-medium text-secondary mb-1.5">
                Company Name
              </label>
              <input
                type="text"
                value={formData.company_name}
                onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                className={inputClass}
                placeholder="Acme Corp"
              />
            </div>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-secondary mb-1.5">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className={inputClass}
                placeholder="john@acme.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-secondary mb-1.5">Phone</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className={inputClass}
                placeholder="+1 (555) 123-4567"
              />
            </div>
          </div>

          </>}

          <div>
            <label className="block text-sm font-medium text-secondary mb-1.5">Opportunity / Description</label>
            <textarea
              value={formData.opportunity_description}
              onChange={(e) => setFormData({ ...formData, opportunity_description: e.target.value })}
              rows={2}
              className={`${inputClass} resize-none`}
              placeholder="Interested in our enterprise plan..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-secondary mb-1.5">Assignment</label>
            <select
              value={formData.assignment}
              onChange={(e) => setFormData({ ...formData, assignment: e.target.value })}
              className={inputClass}
            >
              <option value="fishbowl">Sales Department (shared queue)</option>
              {salesReps.map((rep) => (
                <option key={rep.id} value={rep.id}>Assign to {rep.full_name}</option>
              ))}
            </select>
          </div>

          <details className="text-sm"><summary className="cursor-pointer text-secondary">Additional details (optional)</summary><div className="mt-3 space-y-3">
          <div>
            <label className="block text-sm font-medium text-secondary mb-1.5">Tags</label>
            <input
              type="text"
              value={formData.tags}
              onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              className={inputClass}
              placeholder="#enterprise #referral"
            />
            <p className="text-xs text-muted mt-1">Separate tags with spaces. Use # prefix.</p>
          </div>

          <div className={`grid gap-3 ${hideOffice ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
            <div>
              <label className="block text-sm font-medium text-secondary mb-1.5">Follow-up Priority</label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                className={inputClass}
              >
                <option value="urgent">Urgent — within hours</option>
                <option value="high">High — within 1 day</option>
                <option value="medium">Medium — within 3 days</option>
                <option value="low">Low — within 1 week</option>
              </select>
            </div>

            {offices.length > 0 && !hideOffice && (
              <div>
                <label className="block text-sm font-medium text-secondary mb-1.5">Sales Office</label>
                <select
                  value={formData.office_id}
                  onChange={(e) => setFormData({ ...formData, office_id: e.target.value })}
                  className={inputClass}
                >
                  <option value="">No specific office</option>
                  {offices.map((office) => (
                    <option key={office.id} value={office.id}>{office.office_name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          </div></details>
          <div className="flex gap-3 pt-2 pb-2 border-t border-subtle/60">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-3 border border-subtle text-secondary rounded-xl hover:bg-surface transition-colors font-medium text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || (contactMode === 'existing' && !selectedContact)}
              className="flex-1 min-h-11 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Lead'}
            </button>
          </div>
        </form>
    </QuickActionModal>
  );
}
