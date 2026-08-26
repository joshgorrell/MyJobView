import { useState, useEffect, useRef, useCallback } from 'react';
import { Users, Plus, Search, ArrowRight, Lock, Camera, Shield, Target, Sparkles, UserCheck, Flame, Thermometer, HelpCircle, X, Building2, ChevronRight, DollarSign, Columns3, AlertCircle, RotateCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Contact, ContactTag, Profile, CompanyOffice } from '../../lib/types';
import { ContactForm } from './ContactForm';
import { ContactDetail } from './ContactDetail';
import { useAuth } from '../../contexts/AuthContext';

interface ContactsViewProps {
  onNavigateToProposal?: (proposalId: string) => void;
  onNavigateToInvoices?: (contactId: string) => void;
}

interface ContactRow {
  id: string;
  contact_name: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  contact_type: string | null;
  temperature: string | null;
  portal_access_enabled: boolean | null;
  business_card_photo: string | null;
  last_contact_date: string | null;
  next_follow_up: string | null;
  assigned_to: string | null;
  office_id: string | null;
  assigned_rep_name: string;
  office_name: string;
  balance_due: number;
  tags: { id: string; tag: string; color: string }[];
}

type ColumnKey = 'name' | 'phone' | 'email' | 'balance' | 'lastContact' | 'nextFollowUp' | 'assignedRep' | 'office';

const DEFAULT_COLUMNS: Record<ColumnKey, boolean> = {
  name: true,
  phone: true,
  email: true,
  balance: true,
  lastContact: true,
  nextFollowUp: true,
  assignedRep: true,
  office: true,
};

const COLUMN_LABELS: Record<ColumnKey, string> = {
  name: 'Name',
  phone: 'Phone',
  email: 'Email',
  balance: 'Balance Due',
  lastContact: 'Last Contact',
  nextFollowUp: 'Next Follow-up',
  assignedRep: 'Assigned Rep',
  office: 'Office',
};

const LOAD_TIMEOUT_MS = 15000;

export function ContactsView({ onNavigateToProposal, onNavigateToInvoices }: ContactsViewProps) {
  const { profile, loading: authLoading } = useAuth();
  const canEdit = profile?.can_edit_contacts ?? true;
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showContactForm, setShowContactForm] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [viewFilter, setViewFilter] = useState<'my' | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'customer' | 'prospect' | 'lead'>('all');
  const [typeCounts, setTypeCounts] = useState({ all: 0, customer: 0, prospect: 0, lead: 0 });
  const [temperatureFilter, setTemperatureFilter] = useState<'all' | 'on_fire' | 'hot' | 'warm' | 'cold'>('all');
  const [temperatureCounts, setTemperatureCounts] = useState({ on_fire: 0, hot: 0, warm: 0, cold: 0 });
  const [showContactTypesHelp, setShowContactTypesHelp] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [displayLimit, setDisplayLimit] = useState(50);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnKey, boolean>>(() => {
    try {
      const saved = localStorage.getItem('contacts_column_visibility');
      if (saved) return { ...DEFAULT_COLUMNS, ...JSON.parse(saved) };
    } catch { /* ignore */ }
    return DEFAULT_COLUMNS;
  });

  const hasLoadedOnce = useRef(false);
  const currentRequestId = useRef(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const contactId = params.get('contactId');
    const savedTypeFilter = params.get('type') || localStorage.getItem('contactTypeFilter') || 'all';

    if (contactId) {
      loadContactById(contactId);
    }

    if (savedTypeFilter === 'customer' || savedTypeFilter === 'prospect' || savedTypeFilter === 'lead') {
      setTypeFilter(savedTypeFilter);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!profile) {
      if (!authLoading) setLoading(false);
      return;
    }
    setDisplayLimit(50);
    loadContacts(50, searchQuery);
  }, [profile, viewFilter, typeFilter, temperatureFilter]);

  useEffect(() => {
    if (authLoading || !profile) return;
    const timer = setTimeout(() => {
      setDisplayLimit(50);
      loadContacts(50, searchQuery, true);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadContacts = useCallback(async (limit: number = 50, search: string = '', isSearch: boolean = false) => {
    if (!profile) {
      if (!authLoading) setLoading(false);
      return;
    }

    if (isSearch) {
      setSearchLoading(true);
    } else {
      setLoading(true);
    }
    setLoadError(false);

    const requestId = ++currentRequestId.current;

    const timeoutId = setTimeout(() => {
      if (requestId === currentRequestId.current) {
        setLoading(false);
        setSearchLoading(false);
        setLoadError(true);
      }
    }, LOAD_TIMEOUT_MS);

    try {
      const [countsResult, contactsResult] = await Promise.all([
        supabase.rpc('get_contact_counts', {
          p_view_filter: viewFilter,
          p_user_id: viewFilter === 'my' ? profile.id : null,
        }),
        supabase.rpc('get_contacts_with_balance', {
          p_limit: limit,
          p_search: search.trim(),
          p_type_filter: typeFilter,
          p_temperature_filter: temperatureFilter,
          p_view_filter: viewFilter,
          p_user_id: viewFilter === 'my' ? profile.id : null,
        }),
      ]);

      if (requestId !== currentRequestId.current) return;

      if (countsResult.error) throw countsResult.error;
      if (contactsResult.error) throw contactsResult.error;

      const counts = countsResult.data as Record<string, number> | null;
      if (counts) {
        setTypeCounts({
          all: counts.total ?? 0,
          customer: counts.customers ?? 0,
          prospect: counts.prospects ?? 0,
          lead: counts.leads ?? 0,
        });
        setTemperatureCounts({
          on_fire: counts.on_fire ?? 0,
          hot: counts.hot ?? 0,
          warm: counts.warm ?? 0,
          cold: counts.cold ?? 0,
        });
      }

      const data = contactsResult.data as { contacts: ContactRow[]; total: number } | null;
      setContacts(data?.contacts ?? []);
      setTotalCount(data?.total ?? 0);

      localStorage.setItem('contactTypeFilter', typeFilter);
      hasLoadedOnce.current = true;
    } catch (error) {
      if (requestId !== currentRequestId.current) return;
      console.error('Error loading contacts:', error);
      setLoadError(true);
    } finally {
      if (requestId === currentRequestId.current) {
        clearTimeout(timeoutId);
        setLoading(false);
        setSearchLoading(false);
      }
    }
  }, [profile, authLoading, viewFilter, typeFilter, temperatureFilter]);

  async function loadContactById(contactId: string) {
    try {
      const { data: contactData, error } = await supabase
        .from('contacts')
        .select(`
          *,
          tags:contact_tags(*),
          creator:profiles!contacts_created_by_fkey(id, full_name),
          assigned_rep:profiles!contacts_assigned_to_fkey(id, full_name),
          office:company_offices(id, office_name)
        `)
        .eq('id', contactId)
        .single();

      if (error) throw error;
      if (contactData) {
        setSelectedContact(contactData);
      }
    } catch (error) {
      console.error('Error loading contact:', error);
      const url = new URL(window.location.href);
      url.searchParams.delete('contactId');
      window.history.replaceState({}, '', url);
    }
  }

  function selectContact(contact: ContactRow) {
    setSelectedContact(contact as unknown as Contact);
    const url = new URL(window.location.href);
    url.searchParams.set('contactId', contact.id);
    window.history.pushState({}, '', url);
  }

  function clearSelectedContact() {
    setSelectedContact(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('contactId');
    window.history.replaceState({}, '', url);
  }

  const getDisplayName = (contact: ContactRow) => {
    if (contact.contact_type === 'business') {
      return contact.company_name || contact.contact_name;
    } else {
      if (contact.last_name && contact.first_name) {
        return `${contact.last_name}, ${contact.first_name}`;
      } else if (contact.last_name) {
        return contact.last_name;
      } else if (contact.first_name) {
        return contact.first_name;
      } else {
        return contact.contact_name;
      }
    }
  };

  const getContactType = (contact: ContactRow): 'customer' | 'prospect' | 'lead' => {
    if (contact.contact_type === 'lead') return 'lead';
    if (contact.contact_type === 'prospect') return 'prospect';
    return 'customer';
  };

  const getTemperatureConfig = (temperature: string) => {
    switch (temperature) {
      case 'on_fire':
        return { icon: Flame, label: 'On Fire', bgColor: 'bg-orange-100', textColor: 'text-orange-700', borderColor: 'border-orange-300' };
      case 'hot':
        return { icon: Thermometer, label: 'Hot', bgColor: 'bg-red-100', textColor: 'text-red-700', borderColor: 'border-red-300' };
      case 'warm':
        return { icon: Thermometer, label: 'Warm', bgColor: 'bg-yellow-100', textColor: 'text-yellow-700', borderColor: 'border-yellow-300' };
      case 'cold':
        return { icon: Thermometer, label: 'Cold', bgColor: 'bg-blue-100', textColor: 'text-blue-700', borderColor: 'border-blue-300' };
      default:
        return { icon: Thermometer, label: 'Warm', bgColor: 'bg-yellow-100', textColor: 'text-yellow-700', borderColor: 'border-yellow-300' };
    }
  };

  const handleTypeFilterChange = (newFilter: 'all' | 'customer' | 'prospect' | 'lead') => {
    setTypeFilter(newFilter);
    if (newFilter === 'customer' || newFilter === 'all') {
      setTemperatureFilter('all');
    }
    const url = new URL(window.location.href);
    if (newFilter === 'all') {
      url.searchParams.delete('type');
    } else {
      url.searchParams.set('type', newFilter);
    }
    window.history.pushState({}, '', url);
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
  };

  const toggleColumn = (key: ColumnKey) => {
    const updated = { ...visibleColumns, [key]: !visibleColumns[key] };
    setVisibleColumns(updated);
    localStorage.setItem('contacts_column_visibility', JSON.stringify(updated));
  };

  const personContacts = contacts.filter(c => c.contact_type !== 'business');
  const businessContacts = contacts.filter(c => c.contact_type === 'business');

  if (selectedContact) {
    return (
      <ContactDetail
        contact={selectedContact}
        canEdit={canEdit}
        onBack={() => {
          clearSelectedContact();
          loadContacts(displayLimit, searchQuery);
        }}
        onConverted={() => {
          clearSelectedContact();
          loadContacts(displayLimit, searchQuery);
        }}
        onNavigateToProposal={onNavigateToProposal}
      />
    );
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading contacts...</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center max-w-sm">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Taking longer than expected</h3>
          <p className="text-sm text-gray-600 mb-4">The contacts list is taking too long to load. This is usually a temporary issue.</p>
          <button
            onClick={() => loadContacts(displayLimit, searchQuery)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
          >
            <RotateCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-3 space-y-2">
        {/* Row 1: View toggle, Search, Column settings, Action button */}
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-gray-300 bg-white p-0.5 flex-shrink-0">
            <button
              onClick={() => setViewFilter('my')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-all ${
                viewFilter === 'my' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              Mine
            </button>
            <button
              onClick={() => setViewFilter('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-all ${
                viewFilter === 'all' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              All
            </button>
          </div>

          <div className="relative flex-1">
            {searchLoading ? (
              <div className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            ) : (
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            )}
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                typeFilter === 'all' ? 'Search contacts...' :
                typeFilter === 'customer' ? 'Search customers...' :
                typeFilter === 'prospect' ? 'Search prospects...' : 'Search leads...'
              }
              className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
            />
          </div>

          {/* Column show/hide toggle */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setShowColumnSettings(!showColumnSettings)}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-sm rounded-md border transition-colors ${
                showColumnSettings ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
              title="Show or hide columns"
            >
              <Columns3 className="w-4 h-4" />
            </button>
            {showColumnSettings && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowColumnSettings(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 bg-white rounded-lg border border-gray-200 shadow-lg min-w-[180px] py-1">
                  <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">
                    Toggle Columns
                  </div>
                  {(Object.keys(COLUMN_LABELS) as ColumnKey[]).map((key) => (
                    <label
                      key={key}
                      className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={visibleColumns[key]}
                        onChange={() => toggleColumn(key)}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="text-gray-700">{COLUMN_LABELS[key]}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>

          {canEdit ? (
            <button
              onClick={() => setShowContactForm(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 active:bg-blue-800 transition-colors font-medium flex-shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Contact</span>
              <span className="sm:hidden">New</span>
            </button>
          ) : (
            <div className="inline-flex items-center gap-1 px-3 py-1.5 text-gray-500 text-xs bg-gray-100 rounded-md flex-shrink-0">
              <Lock className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">View Only</span>
            </div>
          )}
        </div>

        {/* Row 2: Type filters + Temperature filters */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => handleTypeFilterChange('all')}
            className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md font-medium transition-all ${
              typeFilter === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All
            <span className={`ml-0.5 text-xs ${typeFilter === 'all' ? 'text-gray-300' : 'text-gray-400'}`}>
              {typeCounts.all}
            </span>
          </button>

          <button
            onClick={() => handleTypeFilterChange('customer')}
            className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md font-medium transition-all ${
              typeFilter === 'customer' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <UserCheck className="w-3 h-3" />
            <span className="hidden sm:inline">Customers</span>
            <span className="sm:hidden">Cust</span>
          </button>

          <button
            onClick={() => handleTypeFilterChange('prospect')}
            className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md font-medium transition-all ${
              typeFilter === 'prospect' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Target className="w-3 h-3" />
            <span className="hidden sm:inline">Prospects</span>
            <span className="sm:hidden">Pros</span>
            <span className={`ml-0.5 text-xs ${typeFilter === 'prospect' ? 'text-blue-200' : 'text-gray-400'}`}>
              {typeCounts.prospect}
            </span>
          </button>

          <button
            onClick={() => handleTypeFilterChange('lead')}
            className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md font-medium transition-all ${
              typeFilter === 'lead' ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Sparkles className="w-3 h-3" />
            Leads
            <span className={`ml-0.5 text-xs ${typeFilter === 'lead' ? 'text-amber-200' : 'text-gray-400'}`}>
              {typeCounts.lead}
            </span>
          </button>

          <button
            onClick={() => setShowContactTypesHelp(true)}
            className="p-1 text-gray-400 hover:text-gray-600 rounded transition-all"
            title="Learn about contact types"
            aria-label="Learn about contact types"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>

          {(typeFilter === 'prospect' || typeFilter === 'lead') && (
            <>
              <div className="w-px h-4 bg-gray-300 mx-0.5" />
              <button
                onClick={() => setTemperatureFilter('all')}
                className={`px-2 py-1 text-xs rounded-md font-medium transition-all ${
                  temperatureFilter === 'all' ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                All Temp
              </button>
              <button
                onClick={() => setTemperatureFilter('on_fire')}
                disabled={temperatureCounts.on_fire === 0}
                className={`inline-flex items-center gap-0.5 px-2 py-1 text-xs rounded-md font-medium transition-all ${
                  temperatureFilter === 'on_fire' ? 'bg-orange-600 text-white' :
                  temperatureCounts.on_fire === 0 ? 'bg-gray-50 text-gray-300 cursor-not-allowed' : 'bg-orange-50 text-orange-700 hover:bg-orange-100'
                }`}
              >
                <Flame className="w-3 h-3" />
                {temperatureCounts.on_fire > 0 && <span>{temperatureCounts.on_fire}</span>}
              </button>
              <button
                onClick={() => setTemperatureFilter('hot')}
                disabled={temperatureCounts.hot === 0}
                className={`inline-flex items-center gap-0.5 px-2 py-1 text-xs rounded-md font-medium transition-all ${
                  temperatureFilter === 'hot' ? 'bg-red-600 text-white' :
                  temperatureCounts.hot === 0 ? 'bg-gray-50 text-gray-300 cursor-not-allowed' : 'bg-red-50 text-red-700 hover:bg-red-100'
                }`}
              >
                <Thermometer className="w-3 h-3" />
                <span className="hidden sm:inline">Hot</span>
                {temperatureCounts.hot > 0 && <span>{temperatureCounts.hot}</span>}
              </button>
              <button
                onClick={() => setTemperatureFilter('warm')}
                disabled={temperatureCounts.warm === 0}
                className={`inline-flex items-center gap-0.5 px-2 py-1 text-xs rounded-md font-medium transition-all ${
                  temperatureFilter === 'warm' ? 'bg-yellow-600 text-white' :
                  temperatureCounts.warm === 0 ? 'bg-gray-50 text-gray-300 cursor-not-allowed' : 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
                }`}
              >
                <Thermometer className="w-3 h-3" />
                <span className="hidden sm:inline">Warm</span>
                {temperatureCounts.warm > 0 && <span>{temperatureCounts.warm}</span>}
              </button>
              <button
                onClick={() => setTemperatureFilter('cold')}
                disabled={temperatureCounts.cold === 0}
                className={`inline-flex items-center gap-0.5 px-2 py-1 text-xs rounded-md font-medium transition-all ${
                  temperatureFilter === 'cold' ? 'bg-blue-600 text-white' :
                  temperatureCounts.cold === 0 ? 'bg-gray-50 text-gray-300 cursor-not-allowed' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                }`}
              >
                <Thermometer className="w-3 h-3" />
                <span className="hidden sm:inline">Cold</span>
                {temperatureCounts.cold > 0 && <span>{temperatureCounts.cold}</span>}
              </button>
            </>
          )}
        </div>
      </div>

      {loading && !searchLoading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Loading contacts...</p>
        </div>
      ) : contacts.length === 0 && !searchLoading ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {searchQuery ? 'No contacts found' :
              temperatureFilter !== 'all' ? `No ${temperatureFilter.replace('_', ' ')} ${typeFilter === 'all' ? 'contacts' : typeFilter + 's'}` :
              typeFilter !== 'all' ? `No ${typeFilter}s yet` : 'No contacts yet'}
          </h3>
          <p className="text-gray-600 mb-4">
            {searchQuery ? 'Try adjusting your search terms' :
              temperatureFilter !== 'all' ? `No ${typeFilter === 'all' ? 'prospects or leads' : typeFilter + 's'} match the "${temperatureFilter.replace('_', ' ')}" temperature filter` :
              typeFilter !== 'all' ? `No ${typeFilter}s match your current filters` : 'Create your first contact to get started'}
          </p>
          {(temperatureFilter !== 'all' || typeFilter !== 'all') && (
            <button
              onClick={() => { setTemperatureFilter('all'); setTypeFilter('all'); }}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {visibleColumns.name && (
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                    )}
                    {visibleColumns.phone && (
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Phone</th>
                    )}
                    {visibleColumns.email && (
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Email</th>
                    )}
                    {visibleColumns.balance && (
                      <th className="px-3 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Balance</th>
                    )}
                    {visibleColumns.lastContact && (
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden xl:table-cell">Last Contact</th>
                    )}
                    {visibleColumns.nextFollowUp && (
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden xl:table-cell">Next Follow-up</th>
                    )}
                    {visibleColumns.assignedRep && (
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden xl:table-cell">Rep</th>
                    )}
                    {visibleColumns.office && (
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden xl:table-cell">Office</th>
                    )}
                    <th className="px-3 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {personContacts.length > 0 && (
                    <tr>
                      <td colSpan={9} className="px-3 py-1 bg-gray-50 border-b border-gray-100">
                        <div className="flex items-center gap-1.5">
                          <Users className="w-3 h-3 text-gray-400" />
                          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">People</span>
                          <span className="text-xs text-gray-400">({personContacts.length})</span>
                        </div>
                      </td>
                    </tr>
                  )}
                  {personContacts.map((contact) => (
                    <tr
                      key={contact.id}
                      onClick={() => selectContact(contact)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      {visibleColumns.name && (
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5 flex-1 min-w-0 flex-wrap">
                              <span className="font-medium text-gray-900 text-sm truncate max-w-[160px]" title={getDisplayName(contact)}>
                                {getDisplayName(contact)}
                              </span>
                              {contact.company_name && (
                                <span className="text-xs text-gray-400 truncate hidden xl:inline max-w-[120px]" title={contact.company_name}>{contact.company_name}</span>
                              )}
                              {(() => {
                                const contactType = getContactType(contact);
                                if (contactType === 'lead') {
                                  return (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full whitespace-nowrap">
                                      <Sparkles className="w-2.5 h-2.5" />
                                      Lead
                                    </span>
                                  );
                                } else if (contactType === 'prospect') {
                                  return (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full whitespace-nowrap">
                                      <Target className="w-2.5 h-2.5" />
                                      Prospect
                                    </span>
                                  );
                                } else {
                                  return (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full whitespace-nowrap">
                                      <UserCheck className="w-2.5 h-2.5" />
                                      Customer
                                    </span>
                                  );
                                }
                              })()}
                              {(() => {
                                const contactType = getContactType(contact);
                                const temperature = contact.temperature;
                                if (contactType === 'lead' && temperature) {
                                  const tempConfig = getTemperatureConfig(temperature);
                                  const TempIcon = tempConfig.icon;
                                  return (
                                    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium ${tempConfig.bgColor} ${tempConfig.textColor} rounded-full whitespace-nowrap`}>
                                      <TempIcon className="w-2.5 h-2.5" />
                                      {tempConfig.label}
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                              {contact.portal_access_enabled && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium bg-teal-100 text-teal-700 rounded-full whitespace-nowrap">
                                  <Shield className="w-2.5 h-2.5" />
                                  Portal
                                </span>
                              )}
                            </div>
                            {contact.business_card_photo && (
                              <Camera className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" title="Business card scanned" />
                            )}
                          </div>
                        </td>
                      )}
                      {visibleColumns.phone && (
                        <td className="px-3 py-1.5 hidden md:table-cell whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          {contact.phone ? (
                            <a href={`tel:${contact.phone}`} className="text-xs text-blue-600 hover:text-blue-800 hover:underline">{contact.phone}</a>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                      )}
                      {visibleColumns.email && (
                        <td className="px-3 py-1.5 hidden md:table-cell" onClick={(e) => e.stopPropagation()}>
                          {contact.email ? (
                            <a href={`mailto:${contact.email}`} title={contact.email} className="text-xs text-blue-600 hover:text-blue-800 hover:underline truncate max-w-[160px] block">{contact.email}</a>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                      )}
                      {visibleColumns.balance && (
                        <td className="px-3 py-1.5 hidden sm:table-cell text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          {contact.balance_due > 0 ? (
                            onNavigateToInvoices ? (
                              <button
                                onClick={() => onNavigateToInvoices(contact.id)}
                                className="text-xs font-medium text-amber-600 hover:text-amber-700 hover:underline"
                              >
                                {formatCurrency(contact.balance_due)}
                              </button>
                            ) : (
                              <span className="text-xs font-medium text-amber-600">{formatCurrency(contact.balance_due)}</span>
                            )
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                      )}
                      {visibleColumns.lastContact && (
                        <td className="px-3 py-1.5 hidden xl:table-cell whitespace-nowrap">
                          <span className="text-xs text-gray-600">
                            {contact.last_contact_date ? new Date(contact.last_contact_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: new Date(contact.last_contact_date).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined }) : <span className="text-gray-300">—</span>}
                          </span>
                        </td>
                      )}
                      {visibleColumns.nextFollowUp && (
                        <td className="px-3 py-1.5 hidden xl:table-cell whitespace-nowrap">
                          <span className="text-xs text-gray-600">
                            {contact.next_follow_up ? new Date(contact.next_follow_up).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: new Date(contact.next_follow_up).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined }) : <span className="text-gray-300">—</span>}
                          </span>
                        </td>
                      )}
                      {visibleColumns.assignedRep && (
                        <td className="px-3 py-1.5 hidden xl:table-cell whitespace-nowrap">
                          <span className="text-xs text-gray-600 truncate max-w-[100px] block" title={contact.assigned_rep_name || ''}>{contact.assigned_rep_name || <span className="text-gray-300">—</span>}</span>
                        </td>
                      )}
                      {visibleColumns.office && (
                        <td className="px-3 py-1.5 hidden xl:table-cell whitespace-nowrap">
                          <span className="text-xs text-gray-600 truncate max-w-[100px] block" title={contact.office_name || ''}>{contact.office_name || <span className="text-gray-300">—</span>}</span>
                        </td>
                      )}
                      <td className="px-3 py-1.5 text-right w-8">
                        <ChevronRight className="w-3.5 h-3.5 text-gray-400 inline-block" />
                      </td>
                    </tr>
                  ))}
                  {businessContacts.length > 0 && (
                    <tr>
                      <td colSpan={9} className="px-3 py-1 bg-gray-50 border-b border-gray-100">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3 h-3 text-gray-400" />
                          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Businesses</span>
                          <span className="text-xs text-gray-400">({businessContacts.length})</span>
                        </div>
                      </td>
                    </tr>
                  )}
                  {businessContacts.map((contact) => (
                    <tr
                      key={contact.id}
                      onClick={() => selectContact(contact)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      {visibleColumns.name && (
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5 flex-1 min-w-0 flex-wrap">
                              <span className="font-medium text-gray-900 text-sm truncate max-w-[160px]" title={getDisplayName(contact)}>
                                {getDisplayName(contact)}
                              </span>
                              {(() => {
                                const contactType = getContactType(contact);
                                if (contactType === 'lead') {
                                  return (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full whitespace-nowrap">
                                      <Sparkles className="w-2.5 h-2.5" />
                                      Lead
                                    </span>
                                  );
                                } else if (contactType === 'prospect') {
                                  return (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full whitespace-nowrap">
                                      <Target className="w-2.5 h-2.5" />
                                      Prospect
                                    </span>
                                  );
                                } else {
                                  return (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full whitespace-nowrap">
                                      <UserCheck className="w-2.5 h-2.5" />
                                      Customer
                                    </span>
                                  );
                                }
                              })()}
                              {contact.portal_access_enabled && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium bg-teal-100 text-teal-700 rounded-full whitespace-nowrap">
                                  <Shield className="w-2.5 h-2.5" />
                                  Portal
                                </span>
                              )}
                            </div>
                            {contact.business_card_photo && (
                              <Camera className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" title="Business card scanned" />
                            )}
                          </div>
                        </td>
                      )}
                      {visibleColumns.phone && (
                        <td className="px-3 py-1.5 hidden md:table-cell whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          {contact.phone ? (
                            <a href={`tel:${contact.phone}`} className="text-xs text-blue-600 hover:text-blue-800 hover:underline">{contact.phone}</a>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                      )}
                      {visibleColumns.email && (
                        <td className="px-3 py-1.5 hidden md:table-cell" onClick={(e) => e.stopPropagation()}>
                          {contact.email ? (
                            <a href={`mailto:${contact.email}`} title={contact.email} className="text-xs text-blue-600 hover:text-blue-800 hover:underline truncate max-w-[160px] block">{contact.email}</a>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                      )}
                      {visibleColumns.balance && (
                        <td className="px-3 py-1.5 hidden sm:table-cell text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          {contact.balance_due > 0 ? (
                            onNavigateToInvoices ? (
                              <button
                                onClick={() => onNavigateToInvoices(contact.id)}
                                className="text-xs font-medium text-amber-600 hover:text-amber-700 hover:underline"
                              >
                                {formatCurrency(contact.balance_due)}
                              </button>
                            ) : (
                              <span className="text-xs font-medium text-amber-600">{formatCurrency(contact.balance_due)}</span>
                            )
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                      )}
                      {visibleColumns.lastContact && (
                        <td className="px-3 py-1.5 hidden xl:table-cell whitespace-nowrap">
                          <span className="text-xs text-gray-600">
                            {contact.last_contact_date ? new Date(contact.last_contact_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: new Date(contact.last_contact_date).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined }) : <span className="text-gray-300">—</span>}
                          </span>
                        </td>
                      )}
                      {visibleColumns.nextFollowUp && (
                        <td className="px-3 py-1.5 hidden xl:table-cell whitespace-nowrap">
                          <span className="text-xs text-gray-600">
                            {contact.next_follow_up ? new Date(contact.next_follow_up).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: new Date(contact.next_follow_up).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined }) : <span className="text-gray-300">—</span>}
                          </span>
                        </td>
                      )}
                      {visibleColumns.assignedRep && (
                        <td className="px-3 py-1.5 hidden xl:table-cell whitespace-nowrap">
                          <span className="text-xs text-gray-600 truncate max-w-[100px] block" title={contact.assigned_rep_name || ''}>{contact.assigned_rep_name || <span className="text-gray-300">—</span>}</span>
                        </td>
                      )}
                      {visibleColumns.office && (
                        <td className="px-3 py-1.5 hidden xl:table-cell whitespace-nowrap">
                          <span className="text-xs text-gray-600 truncate max-w-[100px] block" title={contact.office_name || ''}>{contact.office_name || <span className="text-gray-300">—</span>}</span>
                        </td>
                      )}
                      <td className="px-3 py-1.5 text-right w-8">
                        <ChevronRight className="w-3.5 h-3.5 text-gray-400 inline-block" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {contacts.length >= displayLimit && (
            <div className="mt-4 text-center">
              <p className="text-xs text-gray-500 mb-2">
                Showing first {contacts.length} contacts
                {searchQuery ? ` matching "${searchQuery}"` : ''}
              </p>
              <button
                onClick={() => {
                  const newLimit = displayLimit + 100;
                  setDisplayLimit(newLimit);
                  loadContacts(newLimit, searchQuery);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors font-medium"
              >
                Load More
              </button>
            </div>
          )}
        </>
      )}

      {showContactForm && (
        <ContactForm
          onClose={() => setShowContactForm(false)}
          onSuccess={() => {
            setShowContactForm(false);
            loadContacts(displayLimit, searchQuery);
          }}
        />
      )}

      {showContactTypesHelp && (
        <ContactTypesHelpModal onClose={() => setShowContactTypesHelp(false)} />
      )}
    </div>
  );
}

function ContactTypesHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg w-full max-w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex justify-between items-start">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Understanding Contact Types</h3>
            <p className="text-sm text-gray-600 mt-1">
              Learn the differences between Prospects, Leads, and Customers
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="bg-blue-100 rounded-lg p-2">
                  <Target className="w-5 h-5 text-blue-600" />
                </div>
                <span className="font-bold text-blue-900 text-base">Prospect</span>
              </div>
              <p className="text-sm text-blue-800 leading-relaxed">
                You are pursuing them. They have not expressed interest yet. Cold outreach, referrals, and outbound targets.
              </p>
              <div className="mt-3 pt-3 border-t border-blue-200">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">You initiate contact</p>
              </div>
            </div>

            <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="bg-amber-100 rounded-lg p-2">
                  <Sparkles className="w-5 h-5 text-amber-600" />
                </div>
                <span className="font-bold text-amber-900 text-base">Lead</span>
              </div>
              <p className="text-sm text-amber-800 leading-relaxed">
                They showed interest. Inbound inquiries, requests for quotes, or anyone who responded and wants something from you.
              </p>
              <div className="mt-3 pt-3 border-t border-amber-200">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">They expressed interest</p>
              </div>
            </div>

            <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="bg-green-100 rounded-lg p-2">
                  <UserCheck className="w-5 h-5 text-green-600" />
                </div>
                <span className="font-bold text-green-900 text-base">Customer</span>
              </div>
              <p className="text-sm text-green-800 leading-relaxed">
                They purchased or have an active project. Proposal accepted, deal closed, or ongoing relationship established.
              </p>
              <div className="mt-3 pt-3 border-t border-green-200">
                <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1">Closed business</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-gray-800 mb-1">One status only — never both</p>
            <p className="text-sm text-gray-600">
              A contact is either a Prospect, a Lead, or a Customer. These are mutually exclusive stages. A contact cannot be a lead and a prospect at the same time.
            </p>
          </div>

          <div className="border-t border-gray-200 pt-6">
            <h4 className="font-semibold text-gray-900 mb-4">Typical Progression</h4>
            <div className="flex items-center gap-2 justify-center flex-wrap">
              <div className="flex flex-col items-center">
                <div className="bg-blue-100 text-blue-700 px-4 py-2 rounded-lg font-semibold text-sm border border-blue-200">
                  Prospect
                </div>
                <p className="text-xs text-gray-500 mt-1">You reach out</p>
              </div>
              <ArrowRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <div className="flex flex-col items-center">
                <div className="bg-amber-100 text-amber-700 px-4 py-2 rounded-lg font-semibold text-sm border border-amber-200">
                  Lead
                </div>
                <p className="text-xs text-gray-500 mt-1">They respond</p>
              </div>
              <ArrowRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
              <div className="flex flex-col items-center">
                <div className="bg-green-100 text-green-700 px-4 py-2 rounded-lg font-semibold text-sm border border-green-200">
                  Customer
                </div>
                <p className="text-xs text-gray-500 mt-1">Deal closes</p>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-6">
            <h4 className="font-semibold text-gray-900 mb-3">Quick Reference</h4>
            <div className="space-y-3">
              <div className="flex gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-200 text-blue-700 flex items-center justify-center text-xs font-bold">P</div>
                <div>
                  <p className="font-medium text-gray-900 text-sm">Prospect</p>
                  <p className="text-xs text-gray-600 mt-0.5">Cold call list, trade show card, referral not yet contacted, outbound campaign target</p>
                </div>
              </div>

              <div className="flex gap-3 p-3 bg-amber-50 rounded-lg border border-amber-100">
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-amber-200 text-amber-700 flex items-center justify-center text-xs font-bold">L</div>
                <div>
                  <p className="font-medium text-gray-900 text-sm">Lead</p>
                  <p className="text-xs text-gray-600 mt-0.5">Called in, filled out web form, responded to outreach, asked for a quote, referred by an existing customer</p>
                </div>
              </div>

              <div className="flex gap-3 p-3 bg-green-50 rounded-lg border border-green-100">
                <div className="flex-shrink-0 w-7 h-7 rounded-full bg-green-200 text-green-700 flex items-center justify-center text-xs font-bold">C</div>
                <div>
                  <p className="font-medium text-gray-900 text-sm">Customer</p>
                  <p className="text-xs text-gray-600 mt-0.5">Signed proposal, paid deposit, active project, completed job, or repeat business</p>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-4">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-700">
                <span className="font-semibold">Temperature tracking</span> (On Fire, Hot, Warm, Cold) is available for both Prospects and Leads to help prioritize follow-ups. Customers do not use temperature.
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
