import { useState, useEffect, useRef } from 'react';
import { Sparkles, Clock, CheckCircle, AlertCircle, User, Calendar, FileText, Layers, Package, ExternalLink, MessageSquare, RefreshCw, Search, Loader, Send, Archive, PenTool, Trash2, CreditCard as Edit2, X, Save, ChevronDown, ChevronUp, Info, Plus, Zap, RotateCcw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { notify, requestConfirmation } from '../../lib/feedback';
import { formatDistanceToNow, format } from 'date-fns';
import { ContactQuickViewModal } from '../Shared/ContactQuickViewModal';

interface CatalogProduct {
  id: string;
  name: string;
  our_price: number | null;
  cost: number | null;
  unit: string | null;
  default_qty: number | null;
  default_labor_hours: number | null;
  category: string | null;
  manufacturer: string | null;
  model_number?: string | null;
  thumbnail_url: string | null;
  item_type: string | null;
}

interface LineItem {
  description: string;
  quantity: number;
  unit: string;
  itemType: 'material' | 'labor';
  laborHours?: number | null;
  matchedProductId?: string | null;
  matchedProductName?: string | null;
  overrideQuantity?: number | null;
  overridePrice?: number | null;
  matchConfidence?: 'ai' | 'designer' | 'none';
}

interface Room {
  name: string;
  description?: string;
  lineItems: LineItem[];
}

interface ProposalPrefill {
  title?: string;
  contactSearchName?: string;
  taxEnvironment?: string;
  taxProjectType?: string;
  rooms?: Room[];
  notes?: string;
}

interface DesignBrief {
  id: string;
  contact_id: string | null;
  lead_id: string | null;
  raw_notes: string;
  ai_summary: ProposalPrefill | null;
  status: 'draft' | 'submitted' | 'building' | 'ready' | 'archived';
  created_by: string;
  submitted_at: string | null;
  linked_proposal_id: string | null;
  designer_notes: string | null;
  created_at: string;
  updated_at: string;
  contact?: {
    contact_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    full_name?: string | null;
    company_name?: string;
    city?: string;
    state?: string;
    tax_rate?: number | null;
    tax_environment?: string | null;
    tax_project_type?: string | null;
  };
  lead?: {
    contact_name?: string | null;
    company_name?: string | null;
  };
  creator?: {
    full_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    email: string;
  };
}

interface DesignQueueProps {
  onNavigateToProposal?: (proposalId: string) => void;
  onNewBrief?: () => void;
}

const STATUS_CONFIG = {
  submitted: { label: 'Awaiting Design', color: 'bg-amber-100 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  building: { label: 'Building', color: 'bg-blue-100 text-blue-700 border-blue-200', dot: 'bg-blue-500 animate-pulse' },
  ready: { label: 'Ready to Send', color: 'bg-green-100 text-green-700 border-green-200', dot: 'bg-green-500' },
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-600 border-gray-200', dot: 'bg-gray-400' },
  archived: { label: 'Archived', color: 'bg-gray-100 text-gray-500 border-gray-200', dot: 'bg-gray-300' },
};

function getContactDisplayName(contact?: DesignBrief['contact'], lead?: DesignBrief['lead']): string {
  if (contact) {
    return contact.full_name || contact.contact_name || [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.company_name || '';
  }
  if (lead) {
    return lead.contact_name || lead.company_name || '';
  }
  return '';
}

function getCreatorDisplayName(creator?: DesignBrief['creator']): string {
  if (!creator) return 'Sales Rep';
  return creator.full_name || [creator.first_name, creator.last_name].filter(Boolean).join(' ') || creator.email || 'Sales Rep';
}

function countMatchedItems(rooms?: Room[]): { matched: number; total: number } {
  if (!rooms) return { matched: 0, total: 0 };
  let matched = 0;
  let total = 0;
  for (const room of rooms) {
    for (const item of room.lineItems) {
      if (item.itemType === 'labor') continue;
      total++;
      if (item.matchedProductId) matched++;
    }
  }
  return { matched, total };
}

interface ProductPickerProps {
  onSelect: (product: CatalogProduct) => void;
  onClose: () => void;
  currentProductId?: string | null;
  suggestedQuery?: string;
  matchingCount?: number;
  onApplyMatching?: (product: CatalogProduct) => void;
}

function ProductPicker({ onSelect, onClose, currentProductId, suggestedQuery = '', matchingCount = 0, onApplyMatching }: ProductPickerProps) {
  const [query, setQuery] = useState(suggestedQuery);
  const [results, setResults] = useState<CatalogProduct[]>([]);
  const [searchError, setSearchError] = useState('');
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    searchProducts(suggestedQuery);
  }, []);

  async function searchProducts(q: string) {
    setLoading(true);
    setSearchError('');
    const query_builder = supabase
      .from('products')
      .select('id, name, our_price, cost, unit, default_qty, default_labor_hours, category, manufacturer, model_number, thumbnail_url, item_type')
      .eq('is_active', true)
      .order('name')
      .limit(250);

    const { data, error } = await query_builder;
    if (error) {
      setResults([]);
      setSearchError('Catalog search failed. Please retry.');
      setLoading(false);
      return;
    }
    const tokens = q.toLowerCase().replace(/[^a-z0-9.]+/g, ' ').split(/\s+/)
      .filter(token => token.length > 1 && !['pair', 'pairs', 'the', 'for', 'with', 'need', 'each', 'inch', 'inches'].includes(token));
    const ranked = (data || []).map(product => {
      const haystack = [product.name, product.manufacturer, product.model_number, product.category]
        .filter(Boolean).join(' ').toLowerCase();
      const score = tokens.reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0);
      return { product, score };
    }).sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name));
    setResults(tokens.length ? ranked.filter(candidate => candidate.score > 0).map(candidate => candidate.product) : ranked.map(candidate => candidate.product));
    setLoading(false);
  }

  function handleQuery(val: string) {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchProducts(val), 200);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden" style={{ maxHeight: '80vh' }}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => handleQuery(e.target.value)}
            placeholder="Search by size, type, brand, or model..."
            className="flex-1 text-sm outline-none text-gray-800 placeholder-gray-400"
          />
          {loading && <Loader className="w-4 h-4 text-gray-400 animate-spin flex-shrink-0" />}
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {searchError && <p role="alert" className="px-4 py-3 text-sm text-red-700">{searchError}</p>}
          {results.length === 0 && !loading && !searchError && (
            <div className="py-8 text-center text-sm text-gray-400">
              {query ? `No products found for "${query}"` : 'No products in catalog'}
            </div>
          )}
          {results.map(product => (
            <div
              key={product.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(product)}
              onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onSelect(product); } }}
              className={`w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors flex items-center gap-3 ${
                currentProductId === product.id ? 'bg-blue-50' : ''
              }`}
            >
              {product.thumbnail_url ? (
                <img src={product.thumbnail_url} alt="" className="w-9 h-9 rounded-lg object-cover flex-shrink-0 border border-gray-100" />
              ) : (
                <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Package className="w-4 h-4 text-gray-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
                <p className="text-xs text-gray-500 truncate">
                  {[product.manufacturer, product.model_number, product.category].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                {product.our_price != null && (
                  <p className="text-sm font-semibold text-gray-900">
                    ${product.our_price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                )}
                {product.unit && <p className="text-xs text-gray-400">{product.unit}</p>}
              </div>
              {product.name.toLowerCase().includes('pair') && (
                <span className="text-[10px] text-amber-700 max-w-24">Sold as pair — verify quantity</span>
              )}
              {matchingCount > 1 && onApplyMatching && (
                <button type="button" onClick={event => { event.stopPropagation(); onApplyMatching(product); }} className="px-2 py-1 text-xs font-medium rounded border border-blue-300 text-blue-700 hover:bg-blue-100 flex-shrink-0">Apply to {matchingCount}</button>
              )}
              {currentProductId === product.id && (
                <CheckCircle className="w-4 h-4 text-blue-500 flex-shrink-0" />
              )}
            </div>
          ))}
        </div>

        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

interface ConvertToProposalModalProps {
  brief: DesignBrief;
  onClose: () => void;
  onCreated: (proposalId: string) => void;
}

interface ConvertContact {
  id: string;
  full_name?: string | null;
  contact_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
  tax_rate?: number | null;
  tax_environment?: string | null;
  tax_project_type?: string | null;
  source?: 'contact' | 'lead';
}

function ConvertToProposalModal({ brief, onClose, onCreated }: ConvertToProposalModalProps) {
  const [contacts, setContacts] = useState<ConvertContact[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [selectedContact, setSelectedContact] = useState<ConvertContact | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [title, setTitle] = useState(brief.ai_summary?.title || '');
  // Design/SOW preview remains available even when catalog equipment is incomplete.
  const unresolvedEquipment = (brief.ai_summary?.rooms || []).flatMap(room =>
    (room.lineItems || []).filter(item =>
      item.itemType !== 'labor' && (!item.matchedProductId || (item.overridePrice ?? null) === 0)
    ).map(item => `${room.name}: ${item.description}`)
  );

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (brief.contact_id) {
      loadContact(brief.contact_id);
    } else if (brief.lead_id) {
      loadLead(brief.lead_id);
    }
  }, []);

  async function loadContact(id: string) {
    const { data } = await supabase
      .from('contacts')
      .select('id, full_name, contact_name, first_name, last_name, company_name, tax_rate, tax_environment, tax_project_type')
      .eq('id', id)
      .maybeSingle();
    if (data) {
      setSelectedContact({ ...data, source: 'contact' });
      const name = data.full_name || data.contact_name || [data.first_name, data.last_name].filter(Boolean).join(' ') || '';
      setContactSearch(name);
    }
  }

  async function loadLead(id: string) {
    const { data } = await supabase
      .from('leads')
      .select('id, contact_name, company_name')
      .eq('id', id)
      .maybeSingle();
    if (data) {
      setSelectedContact({
        id: data.id,
        contact_name: data.contact_name,
        company_name: data.company_name,
        source: 'lead',
      });
      setContactSearch(data.contact_name || data.company_name || '');
    }
  }

  async function searchContacts(q: string) {
    if (!q.trim()) { setContacts([]); setShowDropdown(false); return; }
    setSearchLoading(true);
    const [{ data: contactsData }, { data: leadsData }] = await Promise.all([
      supabase
        .from('contacts')
        .select('id, full_name, contact_name, first_name, last_name, company_name, tax_rate, tax_environment, tax_project_type')
        .or(`full_name.ilike.%${q}%,contact_name.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%,company_name.ilike.%${q}%`)
        .limit(8),
      supabase
        .from('leads')
        .select('id, contact_name, company_name')
        .or(`contact_name.ilike.%${q}%,company_name.ilike.%${q}%`)
        .limit(5),
    ]);
    const fromContacts: ConvertContact[] = (contactsData || []).map(c => ({ ...c, source: 'contact' as const }));
    const fromLeads: ConvertContact[] = (leadsData || []).map(l => ({
      id: l.id,
      contact_name: l.contact_name,
      company_name: l.company_name,
      source: 'lead' as const,
    }));
    const combined = [...fromContacts, ...fromLeads];
    combined.sort((a, b) => getContactName(a).localeCompare(getContactName(b)));
    setContacts(combined);
    setShowDropdown(combined.length > 0);
    setSearchLoading(false);
  }

  function getContactName(c: ConvertContact) {
    return c.full_name || c.contact_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.company_name || '';
  }

  function handleContactSearch(val: string) {
    setContactSearch(val);
    if (selectedContact) setSelectedContact(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchContacts(val), 200);
  }

  async function handleCreate() {
    if (!selectedContact || creating) return;
    setCreateError('');
    setCreating(true);

    try {
      const { data: currentBrief, error: briefCheckError } = await supabase
        .from('design_briefs').select('linked_proposal_id').eq('id', brief.id).single();
      if (briefCheckError) throw briefCheckError;
      if (currentBrief?.linked_proposal_id) {
        onCreated(currentBrief.linked_proposal_id);
        return;
      }

      let contactId = selectedContact.id;
      let taxEnvironment = brief.ai_summary?.taxEnvironment || selectedContact.tax_environment || 'residential';
      let taxProjectType = brief.ai_summary?.taxProjectType || selectedContact.tax_project_type || 'general_installation_repair';
      let taxRate = selectedContact.tax_rate || 0;

      if (selectedContact.source === 'lead') {
        const { data: existingContact } = await supabase
          .from('contacts')
          .select('id, tax_rate, tax_environment, tax_project_type')
          .eq('contact_name', selectedContact.contact_name || '')
          .maybeSingle();

        if (existingContact) {
          contactId = existingContact.id;
          taxEnvironment = brief.ai_summary?.taxEnvironment || existingContact.tax_environment || 'residential';
          taxProjectType = brief.ai_summary?.taxProjectType || existingContact.tax_project_type || 'general_installation_repair';
          taxRate = existingContact.tax_rate || 0;
        } else {
          const { data: newContact, error: contactError } = await supabase
            .from('contacts')
            .insert({
              contact_name: selectedContact.contact_name || selectedContact.company_name || 'Unknown',
              company_name: selectedContact.company_name || null,
              contact_type: 'person',
            })
            .select('id')
            .single();

          if (contactError || !newContact) throw new Error('Failed to promote lead to contact');
          contactId = newContact.id;

          await supabase
            .from('leads')
            .update({ status: 'converted' })
            .eq('id', selectedContact.id);
        }

        await supabase
          .from('design_briefs')
          .update({ contact_id: contactId, lead_id: null })
          .eq('id', brief.id);
      }

      // One database transaction: row lock, idempotency, rooms, items and brief link.
      const { data: proposalId, error: conversionError } = await supabase.rpc(
        'design_brief_create_proposal',
        {
          p_brief: brief.id,
          p_contact: contactId,
          p_title: title || `Design Brief - ${getContactName(selectedContact)}`,
          p_tax_environment: taxEnvironment,
          p_tax_type: taxProjectType,
          p_tax_rate: taxRate,
        }
      );
      if (conversionError || !proposalId) {
        throw conversionError || new Error('Unable to create proposal');
      }
      onCreated(proposalId);
    } catch (err) {
      console.error('Error creating proposal:', err);
      setCreateError(err instanceof Error ? err.message : 'Failed to create proposal. Please try again.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Convert to Proposal</h3>
            <p className="text-xs text-gray-500 mt-0.5">Create a proposal from this design brief</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {createError && <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-lg p-3">{createError}</p>}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Proposal Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter a title..."
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Customer <span className="text-red-500">*</span>
            </label>
            {(brief.contact_id || brief.lead_id) && selectedContact ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3 px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-xl">
                  <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs font-semibold">
                      {getContactName(selectedContact).charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{getContactName(selectedContact)}</p>
                    {selectedContact.company_name && (
                      <p className="text-xs text-gray-500 truncate">{selectedContact.company_name}</p>
                    )}
                  </div>
                  {selectedContact.source === 'lead' && (
                    <span className="text-xs font-medium px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded flex-shrink-0">Lead</span>
                  )}
                  <CheckCircle className="w-4 h-4 text-blue-500 flex-shrink-0" />
                </div>
                {selectedContact.source === 'lead' && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    This lead will be promoted to a customer contact when the proposal is created.
                  </p>
                )}
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={contactSearch}
                  onChange={e => handleContactSearch(e.target.value)}
                  placeholder="Search contacts or leads..."
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {searchLoading && (
                  <Loader className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
                )}
                {showDropdown && !selectedContact && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 max-h-48 overflow-y-auto">
                    {contacts.map(c => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setSelectedContact(c);
                          setContactSearch(getContactName(c));
                          setShowDropdown(false);
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-blue-50 flex items-center gap-3 border-b border-gray-50 last:border-0 transition-colors"
                      >
                        <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-blue-700 text-xs font-semibold">
                            {getContactName(c).charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 truncate">{getContactName(c)}</p>
                          {c.company_name && <p className="text-xs text-gray-500 truncate">{c.company_name}</p>}
                        </div>
                        {c.source === 'lead' && (
                          <span className="text-xs font-medium px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded flex-shrink-0">Lead</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {selectedContact && (
                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                      <CheckCircle className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      <span className="text-sm font-medium text-blue-900 flex-1 truncate">{getContactName(selectedContact)}</span>
                      {selectedContact.source === 'lead' && (
                        <span className="text-xs font-medium px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded flex-shrink-0">Lead</span>
                      )}
                      <button onClick={() => { setSelectedContact(null); setContactSearch(''); }} className="text-blue-400 hover:text-blue-600">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {selectedContact.source === 'lead' && (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        This lead will be promoted to a customer contact when the proposal is created.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {unresolvedEquipment.length > 0 && (
            <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-900">
              <p className="font-semibold">{unresolvedEquipment.length} equipment item(s) still need catalog matching or pricing.</p>
              <p className="mt-1 text-xs">You can keep reviewing the design and scope of work. Assign verified products and prices in Design Queue before creating the proposal.</p>
              <ul className="mt-2 list-disc pl-5 text-xs max-h-24 overflow-y-auto">
                {unresolvedEquipment.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </div>
          )}
          {brief.ai_summary?.rooms && (
            <div className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl">
              <p className="text-xs font-medium text-gray-600 mb-1.5">Will create:</p>
              <div className="space-y-1">
                {brief.ai_summary.rooms.map((room, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
                    <Layers className="w-3 h-3 text-gray-400" />
                    <span>{room.name}</span>
                    <span className="text-gray-400">— {room.lineItems.length} item{room.lineItems.length !== 1 ? 's' : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!selectedContact || creating || unresolvedEquipment.length > 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors"
          >
            {creating ? (
              <><Loader className="w-4 h-4 animate-spin" /> Creating...</>
            ) : (
              <><Zap className="w-4 h-4" /> Create Proposal</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DesignQueue({ onNavigateToProposal, onNewBrief }: DesignQueueProps) {
  const { profile } = useAuth();
  const [briefs, setBriefs] = useState<DesignBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBrief, setSelectedBrief] = useState<DesignBrief | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [designerNotes, setDesignerNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [markingReady, setMarkingReady] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [editNotesDraft, setEditNotesDraft] = useState('');
  const [savingEditNotes, setSavingEditNotes] = useState(false);
  const [showRawNotes, setShowRawNotes] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  const [pickerOpen, setPickerOpen] = useState<{ roomIndex: number; itemIndex: number } | null>(null);
  const [savingMatches, setSavingMatches] = useState(false);
  const matchSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const pendingMatchSaves = useRef(0);
  const [matchSaveError, setMatchSaveError] = useState(false);
  const [localRooms, setLocalRooms] = useState<Room[] | null>(null);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [rerunningAI, setRerunningAI] = useState(false);
  const [rerunError, setRerunError] = useState('');
  const [quickViewContactId, setQuickViewContactId] = useState<string | null>(null);

  const isAdmin = profile?.role === 'admin' || profile?.role === 'manager' || profile?.role === 'service_manager';

  useEffect(() => {
    loadBriefs();
  }, [statusFilter]);

  useEffect(() => {
    if (selectedBrief) {
      setDesignerNotes(selectedBrief.designer_notes || '');
      setLocalRooms(selectedBrief.ai_summary?.rooms ? JSON.parse(JSON.stringify(selectedBrief.ai_summary.rooms)) : null);
    }
  }, [selectedBrief]);

  async function loadBriefs() {
    setLoading(true);
    try {
      let query = supabase
        .from('design_briefs')
        .select(`
          *,
          contact:contact_id (contact_name, first_name, last_name, full_name, company_name, city, state, tax_rate, tax_environment, tax_project_type),
          lead:lead_id (contact_name, company_name),
          creator:created_by (full_name, first_name, last_name, email)
        `)
        .order('submitted_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (statusFilter === 'active') {
        query = query.in('status', ['submitted', 'building']);
      } else if (statusFilter === 'ready') {
        query = query.eq('status', 'ready');
      } else if (statusFilter === 'drafts') {
        query = query.eq('status', 'draft').eq('created_by', profile?.id);
      } else if (statusFilter === 'all') {
        query = query.neq('status', 'archived');
      } else if (statusFilter === 'mine') {
        query = query.eq('created_by', profile?.id).neq('status', 'archived');
      }

      const { data, error } = await query;
      if (error) throw error;
      setBriefs(data || []);
    } catch (err) {
      console.error('Error loading design briefs:', err);
    } finally {
      setLoading(false);
    }
  }

  async function saveDesignerNotes() {
    if (!selectedBrief) return;
    setSavingNotes(true);
    try {
      const { error } = await supabase
        .from('design_briefs')
        .update({ designer_notes: designerNotes })
        .eq('id', selectedBrief.id);
      if (error) throw error;
      setBriefs(prev => prev.map(b =>
        b.id === selectedBrief.id ? { ...b, designer_notes: designerNotes } : b
      ));
      setSelectedBrief(prev => prev ? { ...prev, designer_notes: designerNotes } : null);
    } catch (err) {
      console.error('Error saving notes:', err);
    } finally {
      setSavingNotes(false);
    }
  }

  async function markReady() {
    if (!selectedBrief) return;
    setMarkingReady(true);
    try {
      const { error } = await supabase
        .from('design_briefs')
        .update({ status: 'ready' })
        .eq('id', selectedBrief.id);
      if (error) throw error;

      if (selectedBrief.creator) {
        const { data: creatorProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', selectedBrief.creator.email)
          .maybeSingle();

        if (creatorProfile) {
          const contactName = getContactDisplayName(selectedBrief.contact, selectedBrief.lead) || selectedBrief.ai_summary?.contactSearchName || 'the customer';
          await supabase.from('notifications').insert({
            user_id: creatorProfile.id,
            type: 'task_assigned',
            title: 'Design Brief Ready',
            message: `Your design brief for ${contactName} is ready! The proposal has been prepared and is ready for your review.`,
            related_id: selectedBrief.linked_proposal_id,
            read: false,
          });
        }
      }

      setBriefs(prev => prev.map(b =>
        b.id === selectedBrief.id ? { ...b, status: 'ready' } : b
      ));
      setSelectedBrief(prev => prev ? { ...prev, status: 'ready' } : null);
    } catch (err) {
      console.error('Error marking ready:', err);
    } finally {
      setMarkingReady(false);
    }
  }

  async function archiveBrief(briefId: string) {
    const { error } = await supabase
      .from('design_briefs')
      .update({ status: 'archived' })
      .eq('id', briefId);
    if (!error) {
      setBriefs(prev => prev.filter(b => b.id !== briefId));
      if (selectedBrief?.id === briefId) setSelectedBrief(null);
    }
  }

  async function deleteBrief(briefId: string) {
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('design_briefs')
        .delete()
        .eq('id', briefId);
      if (error) throw error;
      setBriefs(prev => prev.filter(b => b.id !== briefId));
      if (selectedBrief?.id === briefId) setSelectedBrief(null);
      setDeleteConfirmId(null);
    } catch (err) {
      console.error('Error deleting brief:', err);
    } finally {
      setDeleting(false);
    }
  }

  function startEditNotes(brief: DesignBrief) {
    setEditNotesDraft(brief.raw_notes);
    setEditingNotes(true);
  }

  async function saveEditedNotes() {
    if (!selectedBrief) return;
    setSavingEditNotes(true);
    try {
      const { error } = await supabase
        .from('design_briefs')
        .update({ raw_notes: editNotesDraft })
        .eq('id', selectedBrief.id);
      if (error) throw error;
      const updated = { ...selectedBrief, raw_notes: editNotesDraft };
      setBriefs(prev => prev.map(b => b.id === selectedBrief.id ? updated : b));
      setSelectedBrief(updated);
      setEditingNotes(false);
    } catch (err) {
      console.error('Error saving notes:', err);
    } finally {
      setSavingEditNotes(false);
    }
  }

  async function handleRerunAI() {
    if (!selectedBrief || !selectedBrief.raw_notes.trim() || savingMatches) return;
    const reviewedItems = (localRooms || selectedBrief.ai_summary?.rooms || []).flatMap(room => room.lineItems || []).filter(item => item.matchedProductId || item.matchConfidence === 'designer');
    if (reviewedItems.length && !(await requestConfirmation(`Re-generating the design will replace ${reviewedItems.length} reviewed catalog selections. Continue?`))) return;
    setRerunningAI(true);
    setRerunError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-design-brief`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            briefId: selectedBrief.id,
            notes: selectedBrief.raw_notes,
            contactId: selectedBrief.contact_id,
            contactName: getContactDisplayName(selectedBrief.contact, selectedBrief.lead) || selectedBrief.ai_summary?.contactSearchName,
            regenerate: true,
          }),
        }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to re-run AI');

      const { data: refreshed } = await supabase
        .from('design_briefs')
        .select(`*, contact:contact_id (contact_name, first_name, last_name, full_name, company_name, city, state, tax_rate, tax_environment, tax_project_type), creator:created_by (full_name, first_name, last_name, email)`)
        .eq('id', selectedBrief.id)
        .maybeSingle();

      if (refreshed) {
        setBriefs(prev => prev.map(b => b.id === refreshed.id ? refreshed : b));
        setSelectedBrief(refreshed);
        setLocalRooms(refreshed.ai_summary?.rooms ? JSON.parse(JSON.stringify(refreshed.ai_summary.rooms)) : null);
      }
    } catch (err: any) {
      setRerunError(err.message || 'Failed to re-run AI');
    } finally {
      setRerunningAI(false);
    }
  }

  async function confirmCatalogPackage(product: CatalogProduct, items: LineItem[]): Promise<boolean> {
    if (!/\bpair\b/i.test(product.name)) return true;
    const counts = items.map(item => Number(item.quantity));
    const allEven = counts.every(count => Number.isFinite(count) && count > 0 && count % 2 === 0);
    if (!allEven) {
      notify('This catalog product is sold as a pair. At least one room has an odd or invalid speaker count. Verify the packaging and quantities before assigning.', { tone: 'warning' });
      return false;
    }
    return requestConfirmation(
      `"${product.name}" is sold as a pair. Convert each selected room's physical speaker count to half as many catalog pairs? Example: 2 speakers become 1 pair. Cancel to leave the design unchanged.`
    );
  }

  function applyCatalogSelection(item: LineItem, product: CatalogProduct): LineItem {
    const soldAsPair = /\bpair\b/i.test(product.name);
    const physicalCount = Number(item.quantity);
    return {
      ...item,
      matchedProductId: product.id,
      matchedProductName: product.name,
      matchConfidence: 'designer',
      unit: product.unit || 'EA',
      overrideQuantity: soldAsPair ? physicalCount / 2 : physicalCount,
    };
  }

  async function handleProductSelected(product: CatalogProduct) {
    if (!pickerOpen || !localRooms) return;
    const { roomIndex, itemIndex } = pickerOpen;
    const selected = localRooms[roomIndex]?.lineItems[itemIndex];
    if (!selected || !(await confirmCatalogPackage(product, [selected]))) return;

    const updated = localRooms.map((room, ri) => {
      if (ri !== roomIndex) return room;
      return {
        ...room,
        lineItems: room.lineItems.map((item, li) => {
          if (li !== itemIndex) return item;
          return applyCatalogSelection(item, product);
        }),
      };
    });

    setLocalRooms(updated);
    setPickerOpen(null);
    saveMatchesToBrief(updated);
  }

  async function handleApplyToMatching(product: CatalogProduct) {
    if (!pickerOpen || !localRooms) return;
    const target = localRooms[pickerOpen.roomIndex]?.lineItems[pickerOpen.itemIndex];
    if (!target || target.itemType === 'labor') return;
    const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
    const key = normalize(target.description);
    const targets = localRooms.flatMap(room => room.lineItems.filter(item =>
      item.itemType !== 'labor' && normalize(item.description) === key
    ));
    if (!(await confirmCatalogPackage(product, targets))) return;
    const updated = localRooms.map(room => ({
      ...room,
      lineItems: room.lineItems.map(item =>
        item.itemType !== 'labor' && normalize(item.description) === key
          ? applyCatalogSelection(item, product)
          : item
      ),
    }));
    setLocalRooms(updated);
    setPickerOpen(null);
    saveMatchesToBrief(updated);
  }

  function handleRemoveMatch(roomIndex: number, itemIndex: number) {
    if (!localRooms) return;
    const updated = localRooms.map((room, ri) => {
      if (ri !== roomIndex) return room;
      return {
        ...room,
        lineItems: room.lineItems.map((item, li) => {
          if (li !== itemIndex) return item;
          const { matchedProductId, matchedProductName, matchConfidence, ...rest } = item;
          return { ...rest, matchConfidence: 'none' as const };
        }),
      };
    });
    setLocalRooms(updated);
    saveMatchesToBrief(updated);
  }

  function saveMatchesToBrief(rooms: Room[]) {
    if (!selectedBrief) return;
    const briefId = selectedBrief.id;
    pendingMatchSaves.current += 1;
    setSavingMatches(true);
    setMatchSaveError(false);
    matchSaveQueue.current = matchSaveQueue.current.catch(() => {}).then(async () => {
    try {
      const { data: current, error: readError } = await supabase
        .from('design_briefs').select('ai_summary, linked_proposal_id').eq('id', briefId).single();
      if (readError) throw readError;
      if (current.linked_proposal_id) throw new Error('This brief has already been converted.');
      const updatedSummary = { ...current.ai_summary, rooms };
      const { data: saved, error } = await supabase
        .from('design_briefs')
        .update({ ai_summary: updatedSummary, status: 'building' })
        .eq('id', briefId)
        .is('linked_proposal_id', null)
        .select('ai_summary')
        .single();
      if (error) throw error;
      setBriefs(prev => prev.map(b => b.id === briefId ? { ...b, ai_summary: saved.ai_summary as ProposalPrefill, status: 'building' as const } : b));
      setSelectedBrief(prev => prev?.id === briefId ? { ...prev, ai_summary: saved.ai_summary as ProposalPrefill, status: 'building' as const } : prev);
    } catch (err) {
      console.error('Error saving matches:', err);
      setMatchSaveError(true);
      notify('Could not save catalog selections. Please retry before converting this brief.', { tone: 'error' });
    } finally {
      pendingMatchSaves.current -= 1;
      setSavingMatches(pendingMatchSaves.current > 0);
    }
    });
  }

  function handleConvertCreated(proposalId: string) {
    setShowConvertModal(false);
    const updatedBrief = {
      ...selectedBrief!,
      linked_proposal_id: proposalId,
      status: 'building' as const,
    };
    setBriefs(prev => prev.map(b => b.id === selectedBrief!.id ? updatedBrief : b));
    setSelectedBrief(updatedBrief);
    if (onNavigateToProposal) {
      onNavigateToProposal(proposalId);
    }
  }

  const isCreator = (brief: DesignBrief) => brief.created_by === profile?.id;

  const canEdit = (brief: DesignBrief) =>
    (isCreator(brief) && (brief.status === 'draft' || brief.status === 'submitted')) || isAdmin;

  const canDelete = (brief: DesignBrief) =>
    (isCreator(brief) && (brief.status === 'draft' || brief.status === 'submitted')) || isAdmin;

  const filteredBriefs = briefs.filter(b => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const contactName = getContactDisplayName(b.contact, b.lead);
    const creatorName = getCreatorDisplayName(b.creator);
    return (
      contactName.toLowerCase().includes(q) ||
      creatorName.toLowerCase().includes(q) ||
      b.ai_summary?.title?.toLowerCase().includes(q) ||
      b.raw_notes.toLowerCase().includes(q)
    );
  });

  const activeCount = briefs.filter(b => b.status === 'submitted' || b.status === 'building').length;
  const readyCount = briefs.filter(b => b.status === 'ready').length;
  const draftCount = briefs.filter(b => b.status === 'draft' && b.created_by === profile?.id).length;

  const currentRooms = localRooms || selectedBrief?.ai_summary?.rooms || [];
  const { matched, total } = countMatchedItems(currentRooms);
  const allMatched = total > 0 && matched === total;
  const hasProposal = !!selectedBrief?.linked_proposal_id;

  const progressSteps = selectedBrief ? [
    { label: 'Brief received', done: true },
    { label: 'Products matched', done: allMatched || hasProposal },
    { label: 'Proposal created', done: hasProposal },
    { label: 'Marked ready', done: selectedBrief.status === 'ready' },
  ] : [];

  return (
    <div className="flex h-full min-w-0 bg-gray-50">
      {/* Left panel */}
      <div className={`${selectedBrief ? 'hidden md:flex' : 'flex'} w-full md:w-80 lg:w-96 min-w-0 flex-shrink-0 flex-col bg-white border-r border-gray-200`}>
        <div className="p-3 sm:p-4 border-b border-gray-100">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900">Design Brief</h2>
                <p className="text-xs text-gray-500">
                  {activeCount > 0 ? `${activeCount} awaiting review` : draftCount > 0 ? `${draftCount} draft${draftCount !== 1 ? 's' : ''}` : 'All caught up'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {onNewBrief && (
                <button
                  onClick={onNewBrief}
                  className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
                  title="New Design Brief"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Brief
                </button>
              )}
              <button
                onClick={() => setShowHowItWorks(v => !v)}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400"
                title="How it works"
              >
                <Info className="w-4 h-4" />
              </button>
              <button
                onClick={loadBriefs}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400"
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {showHowItWorks && (
            <div className="mb-3 p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700 space-y-1.5">
              <p className="font-semibold text-blue-800">Designer workflow:</p>
              <ol className="space-y-1 list-decimal list-inside">
                <li>Review the AI-structured layout</li>
                <li>Assign or confirm products for each line item</li>
                <li>Click <strong>Convert to Proposal</strong> (or open an existing linked proposal)</li>
                <li>Add <strong>Designer Notes</strong> for the sales rep</li>
                <li>Click <strong>Mark Ready</strong> to notify the sales rep</li>
              </ol>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="bg-amber-50 rounded-lg px-3 py-2 text-center border border-amber-100">
              <p className="text-lg font-bold text-amber-700">{activeCount}</p>
              <p className="text-xs text-amber-700">Awaiting Review</p>
            </div>
            <div className="bg-green-50 rounded-lg px-3 py-2 text-center border border-green-100">
              <p className="text-lg font-bold text-green-700">{readyCount}</p>
              <p className="text-xs text-green-700">Ready to Convert</p>
            </div>
          </div>

          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search design briefs..."
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>

          <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5 overflow-x-auto">
            {[
              { key: 'all', label: 'All' },
              { key: 'active', label: 'Awaiting' },
              { key: 'ready', label: 'Ready' },
              { key: 'drafts', label: 'Drafts', badge: draftCount > 0 ? draftCount : null },
              { key: 'mine', label: 'Mine' },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={`flex-1 min-w-fit px-2 text-xs py-2 rounded-md font-medium transition-colors flex items-center justify-center gap-1 ${
                  statusFilter === f.key
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {f.label}
                {'badge' in f && f.badge !== null && (
                  <span className="w-4 h-4 bg-blue-600 text-white text-[10px] rounded-full flex items-center justify-center leading-none">
                    {f.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader className="w-5 h-5 text-gray-400 animate-spin" />
            </div>
          ) : filteredBriefs.length === 0 ? (
            <div className="text-center py-12 px-4 sm:px-6">
              <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <FileText className="w-7 h-7 text-blue-500" />
              </div>
              <p className="text-base font-semibold text-gray-800 mb-1">
                {briefs.length === 0 ? 'No design briefs yet' : 'No matching design briefs'}
              </p>
              <p className="text-sm text-gray-500 mb-5">
                {briefs.length === 0 ? 'Create your first design brief to get started.' : 'Try a different search or filter.'}
              </p>
              {onNewBrief && briefs.length === 0 && (
                <button type="button" onClick={onNewBrief} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl px-5 py-3">
                  <Plus className="w-4 h-4" /> New Design Brief
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredBriefs.map(brief => {
                const config = STATUS_CONFIG[brief.status] || STATUS_CONFIG.draft;
                const isSelected = selectedBrief?.id === brief.id;
                const roomCount = brief.ai_summary?.rooms?.length || 0;
                const contactName = getContactDisplayName(brief.contact, brief.lead) || brief.ai_summary?.contactSearchName || 'Unknown Customer';
                const creatorFirst = getCreatorDisplayName(brief.creator).split(' ')[0];
                const { matched: bMatched, total: bTotal } = countMatchedItems(brief.ai_summary?.rooms);

                return (
                  <div
                    key={brief.id}
                    className={`relative group ${isSelected ? 'bg-blue-50 border-r-2 border-blue-600' : 'hover:bg-gray-50'}`}
                  >
                    <button
                      onClick={() => setSelectedBrief(brief)}
                      className="w-full text-left px-4 py-3.5 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex-1 min-w-0">
                          {brief.contact_id ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); setQuickViewContactId(brief.contact_id!); }}
                              className="customer-link text-sm font-semibold truncate block text-left max-w-full"
                            >
                              {contactName}
                            </button>
                          ) : (
                            <p className="text-sm font-semibold text-gray-900 truncate">{contactName}</p>
                          )}
                          {brief.contact?.company_name && (
                            <p className="text-xs text-gray-500 truncate">{brief.contact.company_name}</p>
                          )}
                        </div>
                        <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium flex-shrink-0 ${config.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
                          {config.label}
                        </span>
                      </div>

                      {brief.ai_summary?.title && (
                        <p className="text-xs text-gray-600 mb-1.5 line-clamp-1">{brief.ai_summary.title}</p>
                      )}

                      <div className="flex items-center gap-3 text-xs text-gray-400">
                        {roomCount > 0 && (
                          <span className="flex items-center gap-1">
                            <Layers className="w-3 h-3" />
                            {roomCount} room{roomCount !== 1 ? 's' : ''}
                          </span>
                        )}
                        {bTotal > 0 && (
                          <span className={`flex items-center gap-1 ${bMatched === bTotal ? 'text-green-600' : bMatched > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                            <Package className="w-3 h-3" />
                            {bMatched}/{bTotal}
                          </span>
                        )}
                        <span className="flex items-center gap-1 ml-auto">
                          <User className="w-3 h-3" />
                          {creatorFirst}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {brief.submitted_at
                          ? formatDistanceToNow(new Date(brief.submitted_at), { addSuffix: true })
                          : formatDistanceToNow(new Date(brief.created_at), { addSuffix: true })}
                      </p>
                    </button>

                    {canDelete(brief) && deleteConfirmId !== brief.id && (
                      <button
                        onClick={e => { e.stopPropagation(); setDeleteConfirmId(brief.id); }}
                        className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-all"
                        title="Delete brief"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {deleteConfirmId === brief.id && (
                      <div className="px-4 py-2.5 bg-red-50 border-t border-red-100 flex items-center gap-2">
                        <p className="text-xs text-red-700 flex-1">Delete this brief?</p>
                        <button
                          onClick={() => deleteBrief(brief.id)}
                          disabled={deleting}
                          className="text-xs px-2 py-1 bg-red-600 text-white rounded font-medium hover:bg-red-700 disabled:opacity-50"
                        >
                          {deleting ? <Loader className="w-3 h-3 animate-spin" /> : 'Delete'}
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="text-xs px-2 py-1 bg-white border border-gray-200 text-gray-600 rounded hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right panel */}
      <div className={`${selectedBrief ? 'block' : 'hidden md:block'} min-w-0 flex-1 overflow-y-auto`}>
        {selectedBrief && (
          <button type="button" onClick={() => setSelectedBrief(null)} className="md:hidden flex items-center gap-2 px-4 py-3 text-sm font-medium text-blue-700 bg-white border-b border-gray-200 w-full">
            <span aria-hidden="true">←</span> All design briefs
          </button>
        )}
        {!selectedBrief ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-sm px-4">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <PenTool className="w-8 h-8 text-gray-300" />
              </div>
              <p className="text-gray-500 font-medium mb-1">Select a brief to review</p>
              <p className="text-sm text-gray-400">Click any brief from the list to view details and take action</p>
              {isAdmin && (
                <div className="mt-6 p-4 bg-blue-50 border border-blue-100 rounded-xl text-left">
                  <p className="text-xs font-semibold text-blue-800 mb-2">Designer steps:</p>
                  <ol className="space-y-1.5 text-xs text-blue-700 list-decimal list-inside">
                    <li>Open the brief and review the AI-structured layout</li>
                    <li>Confirm or swap products for each line item</li>
                    <li>Click <strong>Convert to Proposal</strong> to create it</li>
                    <li>Add Designer Notes with any feedback for the rep</li>
                    <li>Click <strong>Mark Ready</strong> to notify the sales rep</li>
                  </ol>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="p-6 max-w-3xl mx-auto space-y-6">

            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold text-gray-900 mb-1 truncate">
                  {selectedBrief.ai_summary?.title || `Brief for ${getContactDisplayName(selectedBrief.contact, selectedBrief.lead) || 'Customer'}`}
                </h2>
                <div className="flex items-center gap-3 text-sm text-gray-500 flex-wrap">
                  <span className="flex items-center gap-1">
                    <User className="w-3.5 h-3.5" />
                    From {getCreatorDisplayName(selectedBrief.creator)}
                  </span>
                  {selectedBrief.submitted_at && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {format(new Date(selectedBrief.submitted_at), 'MMM d, yyyy h:mm a')}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                {selectedBrief.linked_proposal_id && onNavigateToProposal && (
                  <button
                    onClick={() => onNavigateToProposal(selectedBrief.linked_proposal_id!)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open Proposal
                  </button>
                )}
                {isAdmin && !selectedBrief.linked_proposal_id && selectedBrief.status !== 'archived' && (
                  <button
                    onClick={() => setShowConvertModal(true)}
                    disabled={savingMatches || rerunningAI || matchSaveError}
                    title={matchSaveError ? 'Resolve the failed catalog save before converting' : savingMatches ? 'Wait for catalog selections to finish saving' : undefined}
                    className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    Convert to Proposal
                  </button>
                )}
                {isAdmin && selectedBrief.status !== 'archived' && selectedBrief.raw_notes && (
                  <button
                    onClick={handleRerunAI}
                    disabled={rerunningAI || savingMatches}
                    className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-200 text-white text-sm font-medium rounded-lg transition-colors"
                    title="Re-process notes with AI"
                  >
                    {rerunningAI ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                    Re-run AI
                  </button>
                )}
                {isAdmin && selectedBrief.status !== 'ready' && selectedBrief.status !== 'archived' && (
                  <button
                    onClick={markReady}
                    disabled={markingReady}
                    className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-200 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {markingReady ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    Mark Ready
                  </button>
                )}
                {selectedBrief.status !== 'archived' && (
                  <button
                    onClick={() => archiveBrief(selectedBrief.id)}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Archive brief"
                  >
                    <Archive className="w-4 h-4" />
                  </button>
                )}
                {canDelete(selectedBrief) && (
                  <button
                    onClick={() => setDeleteConfirmId(deleteConfirmId === selectedBrief.id ? null : selectedBrief.id)}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete brief"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Re-run AI error */}
            {rerunError && (
              <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <p className="text-sm text-red-700 flex-1">{rerunError}</p>
                <button onClick={() => setRerunError('')} className="p-1 hover:bg-red-100 rounded">
                  <X className="w-3.5 h-3.5 text-red-400" />
                </button>
              </div>
            )}

            {/* Delete confirm for selected brief */}
            {deleteConfirmId === selectedBrief.id && (
              <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <p className="text-sm text-red-700 flex-1">Permanently delete this design brief? This cannot be undone.</p>
                <button
                  onClick={() => deleteBrief(selectedBrief.id)}
                  disabled={deleting}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                >
                  {deleting ? <Loader className="w-3.5 h-3.5 animate-spin" /> : 'Delete'}
                </button>
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="px-3 py-1.5 border border-gray-200 bg-white text-sm text-gray-600 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Designer Progress Checklist */}
            {isAdmin && (
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Designer Progress</p>
                <div className="flex items-center gap-1">
                  {progressSteps.map((step, i) => (
                    <div key={i} className="flex items-center flex-1">
                      <div className="flex flex-col items-center gap-1 flex-1">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                          step.done ? 'bg-green-500' : 'bg-gray-100'
                        }`}>
                          {step.done
                            ? <CheckCircle className="w-3.5 h-3.5 text-white" />
                            : <span className="w-2 h-2 rounded-full bg-gray-300" />
                          }
                        </div>
                        <p className={`text-xs text-center leading-tight ${step.done ? 'text-green-700 font-medium' : 'text-gray-400'}`}>
                          {step.label}
                        </p>
                      </div>
                      {i < progressSteps.length - 1 && (
                        <div className={`h-0.5 flex-1 mx-1 mb-5 transition-colors ${step.done ? 'bg-green-300' : 'bg-gray-100'}`} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Status + Customer */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Customer</p>
                <p className="font-semibold text-gray-900">
                  {getContactDisplayName(selectedBrief.contact, selectedBrief.lead) || selectedBrief.ai_summary?.contactSearchName || '—'}
                </p>
                {(selectedBrief.contact?.company_name || selectedBrief.lead?.company_name) && (
                  <p className="text-sm text-gray-500">{selectedBrief.contact?.company_name || selectedBrief.lead?.company_name}</p>
                )}
                {(selectedBrief.contact?.city || selectedBrief.contact?.state) && (
                  <p className="text-sm text-gray-400 mt-0.5">
                    {[selectedBrief.contact.city, selectedBrief.contact.state].filter(Boolean).join(', ')}
                  </p>
                )}
              </div>

              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Project Info</p>
                {selectedBrief.ai_summary?.taxEnvironment && (
                  <p className="text-sm text-gray-700 capitalize mb-1">
                    <span className="font-medium">Type:</span> {selectedBrief.ai_summary.taxEnvironment}
                  </p>
                )}
                {selectedBrief.ai_summary?.taxProjectType && (
                  <p className="text-sm text-gray-700">
                    <span className="font-medium">Category:</span>{' '}
                    {selectedBrief.ai_summary.taxProjectType.replace(/_/g, ' ')}
                  </p>
                )}
                <div className={`mt-2 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_CONFIG[selectedBrief.status]?.color}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[selectedBrief.status]?.dot}`} />
                  {STATUS_CONFIG[selectedBrief.status]?.label}
                </div>
              </div>
            </div>

            {/* Sales rep raw notes */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <button
                onClick={() => setShowRawNotes(v => !v)}
                className="w-full flex items-center gap-2 px-5 py-3.5 hover:bg-gray-50 transition-colors"
              >
                <FileText className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide flex-1 text-left">
                  Sales Rep Notes
                </span>
                {canEdit(selectedBrief) && !editingNotes && (
                  <span
                    onClick={e => { e.stopPropagation(); startEditNotes(selectedBrief); setShowRawNotes(true); }}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 px-2 py-0.5 rounded hover:bg-blue-50 mr-2"
                    role="button"
                  >
                    <Edit2 className="w-3 h-3" />
                    Edit
                  </span>
                )}
                {showRawNotes ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </button>

              {showRawNotes && (
                <div className="px-5 pb-5 pt-1 border-t border-gray-100">
                  {editingNotes ? (
                    <div className="space-y-3">
                      <textarea
                        value={editNotesDraft}
                        onChange={e => setEditNotesDraft(e.target.value)}
                        rows={8}
                        className="w-full px-3 py-2.5 border border-blue-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none leading-relaxed"
                        autoFocus
                      />
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => setEditingNotes(false)}
                          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 bg-white text-sm text-gray-600 rounded-lg hover:bg-gray-50"
                        >
                          <X className="w-3.5 h-3.5" />
                          Cancel
                        </button>
                        <button
                          onClick={saveEditedNotes}
                          disabled={savingEditNotes}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                        >
                          {savingEditNotes ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          Save Changes
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                      {selectedBrief.raw_notes || <span className="text-gray-400 italic">No notes added</span>}
                    </p>
                  )}
                </div>
              )}

              {!showRawNotes && (
                <div className="px-5 pb-4">
                  <p className="text-sm text-gray-500 line-clamp-2 leading-relaxed">
                    {selectedBrief.raw_notes || <span className="italic">No notes</span>}
                  </p>
                </div>
              )}
            </div>

            {/* AI-Structured Proposal Layout with product matching */}
            {currentRooms.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" />
                    AI-Structured Proposal Layout
                  </p>
                  <div className="flex items-center gap-2">
                    {savingMatches && (
                      <span className="flex items-center gap-1 text-xs text-blue-600">
                        <Loader className="w-3 h-3 animate-spin" />
                        Saving...
                      </span>
                    )}
                    {total > 0 && (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        allMatched
                          ? 'bg-green-100 text-green-700'
                          : matched > 0
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {matched}/{total} matched
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  {currentRooms.map((room, ri) => (
                    <div key={ri} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-100">
                        <Layers className="w-4 h-4 text-gray-500" />
                        <span className="text-sm font-semibold text-gray-800">{room.name}</span>
                        <span className="ml-auto text-xs text-gray-400">
                          {room.lineItems.length} item{room.lineItems.length !== 1 ? 's' : ''}
                        </span>
                      </div>

                      {room.description && (
                        <div className="px-4 py-3 border-b border-gray-100 bg-blue-50/40">
                          <p className="text-xs font-semibold text-gray-700 mb-1">Proposed scope of work</p>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{room.description}</p>
                        </div>
                      )}
                      <div className="divide-y divide-gray-50">
                        {room.lineItems.map((item, li) => {
                          const isMatched = !!item.matchedProductId;

                          return (
                            <div key={li} className="px-4 py-3">
                              <div className="flex items-start gap-3">
                                <div className="mt-0.5 flex-shrink-0">
                                  {item.itemType === 'labor' ? (
                                    <Clock className="w-4 h-4 text-amber-500" />
                                  ) : (
                                    <Package className="w-4 h-4 text-blue-500" />
                                  )}
                                </div>

                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <span className="text-sm font-medium text-gray-800">
                                      {item.description}
                                    </span>
                                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                                      item.itemType === 'labor'
                                        ? 'bg-amber-50 text-amber-600'
                                        : 'bg-blue-50 text-blue-600'
                                    }`}>
                                      {item.itemType}
                                    </span>
                                  </div>

                                  {isMatched ? (
                                    <div className="flex items-center gap-2 mt-1.5">
                                      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-green-50 border border-green-200 rounded-lg">
                                        <CheckCircle className="w-3 h-3 text-green-600 flex-shrink-0" />
                                        <span className="text-xs font-medium text-green-800 truncate max-w-[200px]">
                                          {item.matchedProductName}
                                        </span>
                                        {item.matchConfidence === 'ai' && (
                                          <span className="text-xs text-green-600 bg-green-100 px-1 py-0.5 rounded text-[10px]">AI</span>
                                        )}
                                      </div>
                                      {isAdmin && (
                                        <div className="flex items-center gap-1">
                                          <button
                                            onClick={() => setPickerOpen({ roomIndex: ri, itemIndex: li })}
                                            className="text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2 py-1 rounded transition-colors flex items-center gap-1"
                                          >
                                            <Edit2 className="w-3 h-3" />
                                            Swap
                                          </button>
                                          <button
                                            onClick={() => handleRemoveMatch(ri, li)}
                                            className="text-xs text-gray-400 hover:text-red-500 hover:bg-red-50 px-1.5 py-1 rounded transition-colors"
                                            title="Remove match"
                                          >
                                            <X className="w-3 h-3" />
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2 mt-1.5">
                                      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-lg">
                                        <AlertCircle className="w-3 h-3 text-amber-500 flex-shrink-0" />
                                        <span className="text-xs text-amber-700">No catalog match</span>
                                      </div>
                                      {isAdmin && (
                                        <button
                                          onClick={() => setPickerOpen({ roomIndex: ri, itemIndex: li })}
                                          className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2.5 py-1 border border-blue-200 rounded-lg transition-colors"
                                        >
                                          <Plus className="w-3 h-3" />
                                          Assign Product
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>

                                <div className="text-right flex-shrink-0 text-xs text-gray-500 mt-0.5">
                                  <span className="font-medium">
                                    {item.overrideQuantity ?? item.quantity}
                                  </span>{' '}
                                  <span className="text-gray-400">{item.unit}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Convert to Proposal CTA at bottom of layout */}
                {isAdmin && !selectedBrief.linked_proposal_id && selectedBrief.status !== 'archived' && (
                  <div className="mt-4 flex items-center justify-between px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl">
                    <div>
                      <p className="text-sm font-medium text-blue-900">Ready to create the proposal?</p>
                      <p className="text-xs text-blue-600 mt-0.5">
                        {allMatched
                          ? 'All equipment matched. Review pricing before creating the proposal.'
                          : `${total - matched} equipment item${total - matched !== 1 ? 's' : ''} still unmatched — assign catalog products before creating the proposal.`}
                      </p>
                    </div>
                    <button
                      onClick={() => setShowConvertModal(true)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap flex-shrink-0 ml-3"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      Convert
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* AI notes */}
            {selectedBrief.ai_summary?.notes && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                <p className="text-xs font-medium text-amber-800 mb-1.5 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  AI Notes for Designer
                </p>
                <p className="text-sm text-amber-700 leading-relaxed">{selectedBrief.ai_summary.notes}</p>
              </div>
            )}

            {/* Designer notes */}
            {isAdmin && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" />
                  Designer Notes
                  <span className="normal-case font-normal text-gray-400 ml-1">— sent to sales rep when you mark ready</span>
                </p>
                <textarea
                  value={designerNotes}
                  onChange={e => setDesignerNotes(e.target.value)}
                  placeholder="Add feedback or notes for the sales rep. This will be visible to them once you mark the brief as ready."
                  rows={4}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
                <div className="flex justify-end mt-2">
                  <button
                    onClick={saveDesignerNotes}
                    disabled={savingNotes}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-900 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                  >
                    {savingNotes ? <Loader className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                    Save Notes
                  </button>
                </div>
              </div>
            )}

            {/* Sales rep view: designer notes */}
            {selectedBrief.designer_notes && !isAdmin && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <p className="text-xs font-medium text-blue-800 mb-1.5 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" />
                  Notes from Design Team
                </p>
                <p className="text-sm text-blue-700 leading-relaxed">{selectedBrief.designer_notes}</p>
              </div>
            )}

            {/* Ready state: rep sees proposal link */}
            {selectedBrief.status === 'ready' && selectedBrief.linked_proposal_id && onNavigateToProposal && !isAdmin && (
              <div className="flex items-center gap-3 px-4 py-4 bg-green-50 border border-green-200 rounded-xl">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-green-800">Your proposal is ready!</p>
                  <p className="text-xs text-green-700 mt-0.5">The design team has finished and is ready for your review.</p>
                </div>
                <button
                  onClick={() => onNavigateToProposal(selectedBrief.linked_proposal_id!)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg whitespace-nowrap"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open Proposal
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Product Picker modal */}
      {pickerOpen && (
        <ProductPicker
          onSelect={handleProductSelected}
          onApplyMatching={handleApplyToMatching}
          matchingCount={(() => {
            const item = localRooms?.[pickerOpen.roomIndex]?.lineItems?.[pickerOpen.itemIndex];
            if (!item || item.itemType === 'labor') return 0;
            const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
            return localRooms?.reduce((count, room) => count + room.lineItems.filter(candidate => candidate.itemType !== 'labor' && normalize(candidate.description) === normalize(item.description)).length, 0) || 0;
          })()}
          onClose={() => setPickerOpen(null)}
          suggestedQuery={localRooms?.[pickerOpen.roomIndex]?.lineItems?.[pickerOpen.itemIndex]?.description || ''}
          currentProductId={
            localRooms?.[pickerOpen.roomIndex]?.lineItems?.[pickerOpen.itemIndex]?.matchedProductId
          }
        />
      )}

      {/* Convert to Proposal modal */}
      {showConvertModal && selectedBrief && (
        <ConvertToProposalModal
          brief={selectedBrief}
          onClose={() => setShowConvertModal(false)}
          onCreated={handleConvertCreated}
        />
      )}
      {quickViewContactId && (
        <ContactQuickViewModal
          contactId={quickViewContactId}
          onClose={() => setQuickViewContactId(null)}
        />
      )}
    </div>
  );
}
