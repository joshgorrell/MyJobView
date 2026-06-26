import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Plus, Trash2, Save, Search, StickyNote, ChevronUp, ChevronDown, Eye, EyeOff, MapPin, ArrowLeftRight, Receipt, Pencil, Check } from 'lucide-react';
import { ContactSearchSelect } from '../Shared/ContactSearchSelect';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';
import InlineProductSearch from '../Proposals/InlineProductSearch';
import InvoiceCatalogBrowser from './InvoiceCatalogBrowser';
import { computeInvoiceTax, type TaxEnvironment, type TaxProjectType, type ItemType } from '../../lib/taxCalculations';
import { TaxRulesBadge } from '../Shared/TaxRulesBadge';

interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  full_name?: string;
  company_name?: string;
  email: string;
  tax_rate?: number;
  is_tax_exempt?: boolean;
  default_payment_terms?: string;
  street_address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
}

interface Project {
  id: string;
  project_number: string;
  project_name: string;
}

interface LineItem {
  id: string;
  product_id?: string | null;
  sku?: string;
  description: string;
  quantity: number;
  unit_price: number;
  cost?: number;
  amount: number;
  is_taxable: boolean;
  item_type?: ItemType;
  source_type: 'catalog' | 'package' | 'work_order' | 'manual';
  notes?: string;
  notes_visible_on_invoice?: boolean;
  showNotes?: boolean;
}

interface BillingAddress {
  billing_name: string;
  billing_address_line1: string;
  billing_address_line2: string;
  billing_city: string;
  billing_state: string;
  billing_zip: string;
}

interface CreateInvoiceModalProps {
  projectId?: string;
  contactId?: string;
  salesOrderId?: string;
  proposalId?: string;
  onClose: () => void;
  onSuccess: (invoiceId: string) => void;
}

const PAYMENT_TERMS_DAYS: Record<string, number> = {
  net_10: 10,
  net_15: 15,
  net_30: 30,
  net_45: 45,
  net_60: 60,
  due_on_receipt: 0,
  net10: 10,
  net15: 15,
  net30: 30,
  net45: 45,
  net60: 60,
};

function normalizePaymentTerms(terms: string | undefined | null): string {
  if (!terms) return '';
  const map: Record<string, string> = {
    'net 10': 'net_10',
    'net 15': 'net_15',
    'net 30': 'net_30',
    'net 45': 'net_45',
    'net 60': 'net_60',
    'due on receipt': 'due_on_receipt',
    'cod': 'due_on_receipt',
    'cash on delivery': 'due_on_receipt',
  };
  return map[terms.toLowerCase().trim()] || terms;
}

function computeDueDate(invoiceDate: string, rawTerms: string | undefined | null): string {
  if (!invoiceDate || !rawTerms) return '';
  const normalized = normalizePaymentTerms(rawTerms);
  const key = normalized.toLowerCase().replace(/-/g, '_');
  const days = PAYMENT_TERMS_DAYS[key];
  if (days === undefined) return '';
  const d = new Date(invoiceDate + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function formatTermsLabel(rawTerms: string | undefined | null): string {
  if (!rawTerms) return '';
  const normalized = normalizePaymentTerms(rawTerms);
  const map: Record<string, string> = {
    net_10: 'Net 10',
    net_15: 'Net 15',
    net_30: 'Net 30',
    net_45: 'Net 45',
    net_60: 'Net 60',
    due_on_receipt: 'Due on Receipt',
  };
  return map[normalized] || rawTerms;
}

const EMPTY_BILLING: BillingAddress = {
  billing_name: '',
  billing_address_line1: '',
  billing_address_line2: '',
  billing_city: '',
  billing_state: '',
  billing_zip: '',
};

function formatBillingOneLine(b: BillingAddress): string {
  const parts: string[] = [];
  if (b.billing_address_line1) parts.push(b.billing_address_line1);
  if (b.billing_address_line2) parts.push(b.billing_address_line2);
  const cityStateZip = [b.billing_city, b.billing_state, b.billing_zip].filter(Boolean).join(', ');
  if (cityStateZip) parts.push(cityStateZip);
  return parts.join(' · ');
}

export function CreateInvoiceModal({ projectId, contactId, salesOrderId, proposalId, onClose, onSuccess }: CreateInvoiceModalProps) {
  const { profile } = useAuth();
  const [selectedContactId, setSelectedContactId] = useState(contactId || '');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState(projectId || '');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [dueDateAutoSet, setDueDateAutoSet] = useState(false);
  const [invoiceNotes, setInvoiceNotes] = useState('');
  const [taxEnvironment, setTaxEnvironment] = useState<'residential' | 'commercial'>('residential');
  const [taxProjectType, setTaxProjectType] = useState('general_installation_repair');
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: crypto.randomUUID(), description: '', quantity: 1, unit_price: 0, amount: 0, is_taxable: true, source_type: 'manual' }
  ]);
  const [billing, setBilling] = useState<BillingAddress>(EMPTY_BILLING);
  const [billToContact, setBillToContact] = useState<Contact | null>(null);
  const [billingSource, setBillingSource] = useState<'customer' | 'bill_to'>('customer');
  const [editingBilling, setEditingBilling] = useState(false);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [contactSearching, setContactSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showCatalogBrowser, setShowCatalogBrowser] = useState(false);
  const [newRowId, setNewRowId] = useState<string | null>(null);

  const descriptionRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const getContactDisplayName = useCallback((contact: Contact) => {
    return contact.company_name || contact.full_name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
  }, []);

  const applyContactToBilling = useCallback((contact: Contact) => {
    setBilling({
      billing_name: getContactDisplayName(contact),
      billing_address_line1: contact.street_address || '',
      billing_address_line2: '',
      billing_city: contact.city || '',
      billing_state: contact.state || '',
      billing_zip: contact.zip_code || '',
    });
  }, [getContactDisplayName]);

  const applyPaymentTerms = useCallback((contact: Contact, currentInvoiceDate: string) => {
    if (contact.default_payment_terms) {
      const computed = computeDueDate(currentInvoiceDate, contact.default_payment_terms);
      if (computed) {
        setDueDate(computed);
        setDueDateAutoSet(true);
        return;
      }
    }
    setDueDateAutoSet(false);
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedContactId) {
      loadContactDetails(selectedContactId);
      loadProjectsForContact(selectedContactId);
    } else {
      setProjects([]);
      setSelectedProjectId('');
      setSelectedContact(null);
      if (billingSource === 'customer') {
        setBilling(EMPTY_BILLING);
      }
      setDueDateAutoSet(false);
    }
  }, [selectedContactId]);

  useEffect(() => {
    if (selectedContact && dueDateAutoSet) {
      const computed = computeDueDate(invoiceDate, selectedContact.default_payment_terms);
      if (computed) setDueDate(computed);
    }
  }, [invoiceDate]);

  async function loadData() {
    setLoading(true);
    try {
      if (contactId) {
        await loadContactDetails(contactId);
        await loadProjectsForContact(contactId);
      }
      if (proposalId) {
        const { data: proposal } = await supabase
          .from('proposals')
          .select('bill_to_contact_id')
          .eq('id', proposalId)
          .maybeSingle();
        if (proposal?.bill_to_contact_id) {
          const { data: btc } = await supabase
            .from('contacts')
            .select('id, first_name, last_name, full_name, company_name, email, street_address, city, state, zip_code')
            .eq('id', proposal.bill_to_contact_id)
            .maybeSingle();
          if (btc) {
            setBillToContact(btc as Contact);
            setBillingSource('bill_to');
            setBilling({
              billing_name: (btc as Contact).company_name || (btc as Contact).full_name || `${(btc as Contact).first_name || ''} ${(btc as Contact).last_name || ''}`.trim(),
              billing_address_line1: (btc as Contact).street_address || '',
              billing_address_line2: '',
              billing_city: (btc as Contact).city || '',
              billing_state: (btc as Contact).state || '',
              billing_zip: (btc as Contact).zip_code || '',
            });
          }
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
      alert('Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  async function searchContacts(query: string) {
    if (!query.trim()) {
      setContacts([]);
      return;
    }
    setContactSearching(true);
    try {
      const terms = query.trim().split(/\s+/);
      let q = supabase
        .from('contacts')
        .select('id, first_name, last_name, email, tax_rate, is_tax_exempt, default_payment_terms, street_address, city, state, zip_code')
        .order('first_name')
        .limit(50);

      if (terms.length >= 2) {
        q = q.or(
          `first_name.ilike.%${terms[0]}%,last_name.ilike.%${terms[1]}%,` +
          `first_name.ilike.%${query.trim()}%,last_name.ilike.%${query.trim()}%`
        );
      } else {
        q = q.or(`first_name.ilike.%${query.trim()}%,last_name.ilike.%${query.trim()}%,email.ilike.%${query.trim()}%`);
      }

      const { data, error } = await q;
      if (error) throw error;
      setContacts(data || []);
    } catch (error) {
      console.error('Error searching contacts:', error);
    } finally {
      setContactSearching(false);
    }
  }

  async function loadContactDetails(cid: string) {
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, full_name, company_name, email, tax_rate, is_tax_exempt, default_payment_terms, street_address, city, state, zip_code')
        .eq('id', cid)
        .single();

      if (error) throw error;
      setSelectedContact(data);
      if (billingSource === 'customer') {
        applyContactToBilling(data);
      }
      applyPaymentTerms(data, invoiceDate);
    } catch (error) {
      console.error('Error loading contact details:', error);
    }
  }

  async function loadProjectsForContact(cid: string) {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('id, project_number, project_name')
        .eq('customer_id', cid)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProjects(data || []);
    } catch (error) {
      console.error('Error loading projects:', error);
    }
  }

  function addLineItem() {
    const id = crypto.randomUUID();
    setLineItems(prev => [
      ...prev,
      { id, description: '', quantity: 1, unit_price: 0, amount: 0, is_taxable: true, source_type: 'manual' }
    ]);
    setNewRowId(id);
  }

  function insertLineItemAfter(afterId: string) {
    const idx = lineItems.findIndex(item => item.id === afterId);
    const id = crypto.randomUUID();
    const newItem: LineItem = {
      id,
      description: '',
      quantity: 1,
      unit_price: 0,
      amount: 0,
      is_taxable: true,
      source_type: 'manual'
    };
    const updated = [...lineItems];
    updated.splice(idx + 1, 0, newItem);
    setLineItems(updated);
    setNewRowId(id);
  }

  function moveLineItemUp(id: string) {
    const idx = lineItems.findIndex(item => item.id === id);
    if (idx <= 0) return;
    const updated = [...lineItems];
    [updated[idx - 1], updated[idx]] = [updated[idx], updated[idx - 1]];
    setLineItems(updated);
  }

  function moveLineItemDown(id: string) {
    const idx = lineItems.findIndex(item => item.id === id);
    if (idx >= lineItems.length - 1) return;
    const updated = [...lineItems];
    [updated[idx], updated[idx + 1]] = [updated[idx + 1], updated[idx]];
    setLineItems(updated);
  }

  function removeLineItem(id: string) {
    if (lineItems.length === 1) return;
    setLineItems(lineItems.filter(item => item.id !== id));
  }

  function updateLineItem(id: string, field: keyof LineItem, value: any) {
    setLineItems(lineItems.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, [field]: value };
      if (field === 'quantity' || field === 'unit_price') {
        updated.amount = Number(updated.quantity) * Number(updated.unit_price);
      }
      return updated;
    }));
  }

  function handleProductSelect(product: any, rowId?: string) {
    if (rowId) {
      setLineItems(prev => prev.map(item => {
        if (item.id !== rowId) return item;
        const qty = item.quantity || 1;
        const price = product.our_price || 0;
        return {
          ...item,
          product_id: product.id,
          sku: product.sku,
          description: product.name,
          unit_price: price,
          cost: product.cost,
          amount: qty * price,
          is_taxable: product.is_taxable !== false,
          source_type: 'catalog' as const,
        };
      }));
      // Focus description after selection if empty
      setTimeout(() => {
        const descInput = descriptionRefs.current[rowId];
        if (descInput && !descInput.value) {
          descInput.focus();
        }
      }, 30);
    } else {
      const newItem: LineItem = {
        id: crypto.randomUUID(),
        product_id: product.id,
        sku: product.sku,
        description: product.name,
        quantity: 1,
        unit_price: product.our_price || 0,
        cost: product.cost,
        amount: product.our_price || 0,
        is_taxable: product.is_taxable !== false,
        source_type: 'catalog'
      };
      setLineItems([...lineItems, newItem]);
    }
  }

  function handlePackageSelect(packageData: any) {
    const newItems: LineItem[] = (packageData.items || []).map((item: any) => ({
      id: crypto.randomUUID(),
      product_id: item.product?.id,
      sku: item.product?.sku,
      description: item.product?.name || 'Unknown Product',
      quantity: item.quantity,
      unit_price: item.product?.our_price || 0,
      cost: item.product?.cost,
      amount: (item.product?.our_price || 0) * item.quantity,
      is_taxable: item.product?.is_taxable !== false,
      source_type: 'package' as const
    }));
    setLineItems([...lineItems, ...newItems]);
  }

  function toggleNotes(id: string) {
    setLineItems(lineItems.map(item =>
      item.id === id ? { ...item, showNotes: !item.showNotes } : item
    ));
  }

  function toggleNoteVisibility(id: string) {
    setLineItems(lineItems.map(item =>
      item.id === id ? { ...item, notes_visible_on_invoice: !item.notes_visible_on_invoice } : item
    ));
  }

  function calculateSubtotal() {
    return lineItems.reduce((sum, item) => sum + item.amount, 0);
  }

  function getEffectiveTaxRate() {
    return selectedContact?.tax_rate || 0.0935;
  }

  function calculateTax() {
    const result = computeInvoiceTax({
      lineItems: lineItems.map(item => ({
        amount: item.amount,
        itemType: item.item_type ?? 'material',
        isTaxable: item.is_taxable,
      })),
      environment: taxEnvironment as TaxEnvironment,
      projectType: taxProjectType as TaxProjectType,
      taxRate: getEffectiveTaxRate(),
      isTaxExempt: selectedContact?.is_tax_exempt ?? false,
    });
    return result.taxAmount;
  }

  function calculateTotal() {
    return calculateSubtotal() + calculateTax();
  }

  function swapBillingSource() {
    if (!billToContact) return;
    if (billingSource === 'customer') {
      setBillingSource('bill_to');
      applyContactToBilling(billToContact);
    } else {
      setBillingSource('customer');
      if (selectedContact) {
        applyContactToBilling(selectedContact);
      } else {
        setBilling(EMPTY_BILLING);
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!selectedContactId) {
      alert('Please select a customer');
      return;
    }

    if (lineItems.some(item => !item.description.trim())) {
      alert('Please fill in all line item descriptions');
      return;
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const subtotal = calculateSubtotal();
      const tax = calculateTax();
      const total = calculateTotal();

      const { data: invoiceData, error: invoiceError } = await supabase
        .from('invoices')
        .insert({
          company_id: profile?.company_id,
          contact_id: selectedContactId,
          project_id: selectedProjectId || null,
          sales_order_id: salesOrderId || null,
          invoice_date: invoiceDate,
          due_date: dueDate || null,
          status: 'draft',
          subtotal,
          tax_amount: tax,
          total,
          amount_paid: 0,
          amount_due: total,
          notes: invoiceNotes || null,
          tax_environment: taxEnvironment,
          tax_project_type: taxProjectType,
          tax_rate: getEffectiveTaxRate(),
          payment_terms: normalizePaymentTerms(selectedContact?.default_payment_terms) || null,
          billing_name: billing.billing_name || null,
          billing_address_line1: billing.billing_address_line1 || null,
          billing_address_line2: billing.billing_address_line2 || null,
          billing_city: billing.billing_city || null,
          billing_state: billing.billing_state || null,
          billing_zip: billing.billing_zip || null,
          bill_to_contact_id: billToContact?.id || null,
          created_by: user.id
        })
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      const lineItemsData = lineItems.map((item, index) => ({
        invoice_id: invoiceData.id,
        product_id: item.product_id || null,
        sku: item.sku || null,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        cost: item.cost || null,
        amount: item.amount,
        is_taxable: item.is_taxable,
        item_type: item.item_type || 'material',
        source_type: item.source_type,
        notes: item.notes || null,
        notes_visible_on_invoice: item.notes_visible_on_invoice ?? false,
        sort_order: index
      }));

      const { error: itemsError } = await supabase
        .from('invoice_line_items')
        .insert(lineItemsData);

      if (itemsError) throw itemsError;

      onSuccess(invoiceData.id);
      onClose();
    } catch (error) {
      console.error('Error creating invoice:', error);
      alert('Failed to create invoice. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-gray-800 rounded-lg p-8 max-w-4xl w-full">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-300">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  const termsLabel = formatTermsLabel(selectedContact?.default_payment_terms);
  const hasBillingData = billing.billing_name || billing.billing_address_line1;
  const billingOneLine = formatBillingOneLine(billing);

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-60 flex items-start justify-center z-50 p-3 sm:p-4 overflow-y-auto">
        <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-5xl my-4 sm:my-8 border border-gray-700">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
            <h2 className="text-lg sm:text-xl font-bold text-white">New Invoice</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors text-gray-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">

            {/* All header fields on one desktop row, 2-col grid on mobile */}
            <div className="grid grid-cols-2 lg:flex lg:flex-wrap lg:items-end gap-3">
              {/* Customer — takes available space */}
              <div className="col-span-2 lg:flex-[2] lg:min-w-[200px]">
                <label className="block text-xs font-medium text-gray-400 mb-1">Customer *</label>
                <ContactSearchSelect
                  contacts={(() => {
                    const list = contacts.map(c => ({
                      id: c.id,
                      label: `${c.first_name} ${c.last_name}`.trim(),
                      sublabel: c.email || undefined,
                    }));
                    if (selectedContact && !list.find(c => c.id === selectedContact.id)) {
                      list.unshift({
                        id: selectedContact.id,
                        label: `${selectedContact.first_name} ${selectedContact.last_name}`.trim(),
                        sublabel: selectedContact.email || undefined,
                      });
                    }
                    return list;
                  })()}
                  value={selectedContactId}
                  onChange={setSelectedContactId}
                  placeholder="Search customers..."
                  required
                  disabled={!!contactId}
                  darkMode={true}
                  onSearch={searchContacts}
                  searching={contactSearching}
                />
              </div>

              {/* Invoice Date */}
              <div className="lg:w-[130px] lg:flex-shrink-0">
                <label className="block text-xs font-medium text-gray-400 mb-1">Invoice Date *</label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Due Date */}
              <div className="lg:w-[150px] lg:flex-shrink-0">
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  Due Date
                  {dueDateAutoSet && termsLabel && (
                    <span className="ml-1.5 text-blue-400 font-normal normal-case">({termsLabel})</span>
                  )}
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => {
                    setDueDate(e.target.value);
                    setDueDateAutoSet(false);
                  }}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Environment */}
              <div className="lg:w-[130px] lg:flex-shrink-0">
                <label className="block text-xs font-medium text-gray-400 mb-1">Environment *</label>
                <select
                  value={taxEnvironment}
                  onChange={(e) => setTaxEnvironment(e.target.value as 'residential' | 'commercial')}
                  required
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="residential">Residential</option>
                  <option value="commercial">Commercial</option>
                </select>
              </div>

              {/* Project Type */}
              <div className="col-span-2 lg:flex-1 lg:min-w-[180px]">
                <label className="block text-xs font-medium text-gray-400 mb-1">Project Type *</label>
                <select
                  value={taxProjectType}
                  onChange={(e) => setTaxProjectType(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="original_construction">Original Construction</option>
                  <option value="remodel">Remodel</option>
                  <option value="general_installation_repair">General Installation/Repair or Retail</option>
                  <option value="exempt_project">Exempt Project</option>
                  <option value="design_services">Design Services</option>
                  <option value="maintenance_agreement">Maintenance Agreement</option>
                  <option value="membership">Membership</option>
                  <option value="security_monitoring">Security Monitoring</option>
                </select>
              </div>

              {projectId && (
                <div className="col-span-2 lg:flex-1 lg:min-w-[160px]">
                  <label className="block text-xs font-medium text-gray-400 mb-1">Project</label>
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    disabled={true}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                  >
                    <option value="">No project</option>
                    {projects.map(project => (
                      <option key={project.id} value={project.id}>
                        {project.project_number} - {project.project_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Tax rules badge */}
              <div className="col-span-2 lg:flex-shrink-0 lg:self-end">
                <TaxRulesBadge
                  taxEnvironment={taxEnvironment}
                  taxProjectType={taxProjectType}
                  darkMode={true}
                />
              </div>
            </div>

            {/* Bill To - Collapsed Card */}
            {selectedContactId && (
              <div className="border border-gray-700 rounded-lg overflow-hidden">
                {/* Card Header */}
                <div className="flex items-center justify-between px-3 py-2.5 bg-gray-750">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex-shrink-0">Bill To</span>
                    {billToContact && (
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${billingSource === 'bill_to' ? 'bg-amber-900/50 text-amber-300' : 'bg-gray-700 text-gray-400'}`}>
                        {billingSource === 'bill_to' ? (
                          <span className="flex items-center gap-1"><Receipt size={9} /> Bill-To</span>
                        ) : 'Customer'}
                      </span>
                    )}
                    {hasBillingData && !editingBilling && (
                      <div className="min-w-0 flex-1 ml-1">
                        <span className="text-sm font-medium text-white truncate block">{billing.billing_name}</span>
                        {billingOneLine && (
                          <span className="text-xs text-gray-400 truncate block">{billingOneLine}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {billToContact && !editingBilling && (
                      <button
                        type="button"
                        onClick={swapBillingSource}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded transition-colors border border-gray-600"
                        title="Swap billing party"
                      >
                        <ArrowLeftRight size={11} />
                        Swap
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setEditingBilling(!editingBilling)}
                      className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors border ${
                        editingBilling
                          ? 'bg-blue-600 border-blue-500 text-white hover:bg-blue-700'
                          : 'bg-gray-700 border-gray-600 text-gray-300 hover:text-white hover:bg-gray-600'
                      }`}
                      title={editingBilling ? 'Done editing' : 'Edit billing address'}
                    >
                      {editingBilling ? <><Check size={11} /> Done</> : <><Pencil size={11} /> Edit</>}
                    </button>
                  </div>
                </div>

                {/* Editable Fields - shown only when editing */}
                {editingBilling && (
                  <div className="p-3 border-t border-gray-700 bg-gray-800/50">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] text-gray-400 mb-1">Name / Company</label>
                        <input
                          type="text"
                          value={billing.billing_name}
                          onChange={e => setBilling(b => ({ ...b, billing_name: e.target.value }))}
                          placeholder="Billing name..."
                          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] text-gray-400 mb-1">Address Line 1</label>
                        <input
                          type="text"
                          value={billing.billing_address_line1}
                          onChange={e => setBilling(b => ({ ...b, billing_address_line1: e.target.value }))}
                          placeholder="Street address..."
                          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] text-gray-400 mb-1">Address Line 2</label>
                        <input
                          type="text"
                          value={billing.billing_address_line2}
                          onChange={e => setBilling(b => ({ ...b, billing_address_line2: e.target.value }))}
                          placeholder="Suite, unit, PO Box..."
                          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-gray-400 mb-1">City</label>
                        <input
                          type="text"
                          value={billing.billing_city}
                          onChange={e => setBilling(b => ({ ...b, billing_city: e.target.value }))}
                          placeholder="City..."
                          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] text-gray-400 mb-1">State</label>
                          <input
                            type="text"
                            value={billing.billing_state}
                            onChange={e => setBilling(b => ({ ...b, billing_state: e.target.value }))}
                            placeholder="KS"
                            maxLength={2}
                            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-gray-400 mb-1">ZIP</label>
                          <input
                            type="text"
                            value={billing.billing_zip}
                            onChange={e => setBilling(b => ({ ...b, billing_zip: e.target.value }))}
                            placeholder="66101"
                            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Line Items Section */}
            <div>
              <div className="flex items-center justify-between mb-2 gap-2">
                <h3 className="text-sm font-semibold text-white">Line Items</h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCatalogBrowser(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-700 text-gray-200 rounded-lg hover:bg-gray-600 border border-gray-600 transition-colors"
                  >
                    <Search className="w-3.5 h-3.5" />
                    Browse
                  </button>
                  <button
                    type="button"
                    onClick={addLineItem}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Item
                  </button>
                </div>
              </div>

              {/* Column Headers - Desktop only */}
              <div className="hidden lg:grid grid-cols-[1fr_2fr_80px_100px_48px_96px_auto] gap-2 px-2 mb-1">
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">SKU</span>
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">Description</span>
                <span className="text-[10px] text-gray-500 uppercase tracking-wider text-center">Qty</span>
                <span className="text-[10px] text-gray-500 uppercase tracking-wider text-right">Unit Price</span>
                <span className="text-[10px] text-gray-500 uppercase tracking-wider text-center">Tax</span>
                <span className="text-[10px] text-gray-500 uppercase tracking-wider text-right">Amount</span>
                <span className="text-[10px] text-gray-500 w-20"></span>
              </div>

              <div className="space-y-2">
                {lineItems.map((item, index) => (
                  <div key={item.id} className="bg-gray-750 rounded-lg border border-gray-700/80">

                    {/* Desktop Row */}
                    <div className="hidden lg:flex gap-2 items-center px-2 py-2">
                      {/* Reorder */}
                      <div className="flex flex-col gap-0 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => moveLineItemUp(item.id)}
                          disabled={index === 0}
                          className="p-0.5 text-gray-600 hover:text-gray-300 disabled:opacity-20 disabled:cursor-not-allowed"
                        >
                          <ChevronUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveLineItemDown(item.id)}
                          disabled={index === lineItems.length - 1}
                          className="p-0.5 text-gray-600 hover:text-gray-300 disabled:opacity-20 disabled:cursor-not-allowed"
                        >
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      </div>
                      <span className="text-[10px] text-gray-600 w-4 text-center flex-shrink-0">{index + 1}</span>

                      {/* SKU */}
                      <div className="flex-1 min-w-0">
                        <InlineProductSearch
                          value={item.sku || ''}
                          onChange={(value) => updateLineItem(item.id, 'sku', value)}
                          onProductSelect={(product) => handleProductSelect(product, item.id)}
                          onPackageSelect={handlePackageSelect}
                          onTabAfterSelect={() => {
                            const descInput = descriptionRefs.current[item.id];
                            if (descInput) descInput.focus();
                          }}
                          autoFocus={newRowId === item.id}
                          className="w-full px-2 py-1.5 text-sm bg-gray-900 border border-gray-700 rounded text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="SKU / search..."
                        />
                      </div>

                      {/* Description */}
                      <div className="flex-[2] min-w-0">
                        <input
                          ref={el => { descriptionRefs.current[item.id] = el; }}
                          type="text"
                          value={item.description}
                          onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                          placeholder="Description *"
                          className="w-full px-2 py-1.5 text-sm bg-gray-900 border border-gray-700 rounded text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>

                      {/* Qty */}
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateLineItem(item.id, 'quantity', Number(e.target.value))}
                        placeholder="Qty"
                        min="0"
                        step="0.01"
                        className="w-[80px] flex-shrink-0 px-2 py-1.5 text-sm bg-gray-900 border border-gray-700 rounded text-white text-center focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />

                      {/* Unit Price */}
                      <input
                        type="number"
                        value={item.unit_price}
                        onChange={(e) => updateLineItem(item.id, 'unit_price', Number(e.target.value))}
                        placeholder="Price"
                        min="0"
                        step="0.01"
                        className="w-[100px] flex-shrink-0 px-2 py-1.5 text-sm bg-gray-900 border border-gray-700 rounded text-white text-right focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />

                      {/* Tax */}
                      <div className="w-[48px] flex-shrink-0 flex justify-center">
                        <input
                          type="checkbox"
                          checked={item.is_taxable}
                          onChange={(e) => updateLineItem(item.id, 'is_taxable', e.target.checked)}
                          className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                          title="Taxable"
                        />
                      </div>

                      {/* Amount */}
                      <div className="w-[96px] flex-shrink-0 text-right px-2 py-1.5 text-sm text-green-400 font-semibold">
                        ${item.amount.toFixed(2)}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => toggleNotes(item.id)}
                          className={`p-1.5 rounded transition-colors ${item.showNotes ? 'text-blue-400 bg-blue-900/30' : 'text-gray-500 hover:text-blue-400 hover:bg-gray-700'}`}
                          title="Toggle notes"
                        >
                          <StickyNote className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => insertLineItemAfter(item.id)}
                          className="p-1.5 text-gray-500 hover:text-green-400 hover:bg-gray-700 rounded transition-colors"
                          title="Insert row below"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeLineItem(item.id)}
                          disabled={lineItems.length === 1}
                          className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Mobile/Tablet Card Layout */}
                    <div className="lg:hidden p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] text-gray-500 font-medium">#{index + 1}</span>
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => moveLineItemUp(item.id)} disabled={index === 0}
                            className="p-1 text-gray-500 hover:text-gray-300 disabled:opacity-20 min-w-[32px] min-h-[32px] flex items-center justify-center">
                            <ChevronUp className="w-4 h-4" />
                          </button>
                          <button type="button" onClick={() => moveLineItemDown(item.id)} disabled={index === lineItems.length - 1}
                            className="p-1 text-gray-500 hover:text-gray-300 disabled:opacity-20 min-w-[32px] min-h-[32px] flex items-center justify-center">
                            <ChevronDown className="w-4 h-4" />
                          </button>
                          <button type="button" onClick={() => toggleNotes(item.id)}
                            className={`p-1 rounded min-w-[32px] min-h-[32px] flex items-center justify-center ${item.showNotes ? 'text-blue-400' : 'text-gray-500 hover:text-blue-400'}`}>
                            <StickyNote className="w-4 h-4" />
                          </button>
                          <button type="button" onClick={() => removeLineItem(item.id)} disabled={lineItems.length === 1}
                            className="p-1 text-gray-500 hover:text-red-400 rounded disabled:opacity-20 min-w-[32px] min-h-[32px] flex items-center justify-center">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* SKU Search */}
                      <div>
                        <label className="block text-[11px] text-gray-400 mb-1">SKU / Search</label>
                        <InlineProductSearch
                          value={item.sku || ''}
                          onChange={(value) => updateLineItem(item.id, 'sku', value)}
                          onProductSelect={(product) => handleProductSelect(product, item.id)}
                          onPackageSelect={handlePackageSelect}
                          onTabAfterSelect={() => {
                            const descInput = descriptionRefs.current[item.id];
                            if (descInput) descInput.focus();
                          }}
                          autoFocus={newRowId === item.id}
                          className="w-full px-3 py-2.5 text-sm bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="Type SKU or product name..."
                        />
                      </div>

                      {/* Description */}
                      <div>
                        <label className="block text-[11px] text-gray-400 mb-1">Description *</label>
                        <input
                          ref={el => { descriptionRefs.current[item.id] = el; }}
                          type="text"
                          value={item.description}
                          onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                          placeholder="Description..."
                          className="w-full px-3 py-2.5 text-sm bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>

                      {/* Qty / Price / Tax / Amount */}
                      <div className="grid grid-cols-4 gap-2 items-end">
                        <div>
                          <label className="block text-[11px] text-gray-400 mb-1">Qty</label>
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateLineItem(item.id, 'quantity', Number(e.target.value))}
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            className="w-full px-2 py-2.5 text-sm bg-gray-900 border border-gray-700 rounded-lg text-white text-center focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-gray-400 mb-1">Price</label>
                          <input
                            type="number"
                            value={item.unit_price}
                            onChange={(e) => updateLineItem(item.id, 'unit_price', Number(e.target.value))}
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            className="w-full px-2 py-2.5 text-sm bg-gray-900 border border-gray-700 rounded-lg text-white text-right focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                        <div className="flex flex-col items-center">
                          <label className="block text-[11px] text-gray-400 mb-1">Tax</label>
                          <input
                            type="checkbox"
                            checked={item.is_taxable}
                            onChange={(e) => updateLineItem(item.id, 'is_taxable', e.target.checked)}
                            className="w-5 h-5 text-blue-600 rounded cursor-pointer mt-1.5"
                          />
                        </div>
                        <div className="text-right">
                          <label className="block text-[11px] text-gray-400 mb-1">Total</label>
                          <div className="py-2.5 text-sm text-green-400 font-semibold">{formatCurrency(item.amount)}</div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => insertLineItemAfter(item.id)}
                        className="w-full py-2 text-xs text-gray-500 hover:text-green-400 border border-dashed border-gray-700 hover:border-green-700 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Insert row below
                      </button>
                    </div>

                    {/* Notes */}
                    {item.showNotes && (
                      <div className="px-3 pb-3 space-y-2 border-t border-gray-700/60 pt-2">
                        <textarea
                          value={item.notes || ''}
                          onChange={(e) => updateLineItem(item.id, 'notes', e.target.value)}
                          placeholder="Line item notes..."
                          rows={2}
                          className="w-full px-2 py-1.5 text-sm bg-gray-900 border border-gray-700 rounded text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <button
                          type="button"
                          onClick={() => toggleNoteVisibility(item.id)}
                          className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${
                            item.notes_visible_on_invoice
                              ? 'bg-blue-900/40 text-blue-300 border border-blue-700'
                              : 'bg-gray-700 text-gray-400 border border-gray-600 hover:text-gray-300'
                          }`}
                        >
                          {item.notes_visible_on_invoice ? (
                            <><Eye className="w-3 h-3" /> Visible on invoice</>
                          ) : (
                            <><EyeOff className="w-3 h-3" /> Internal only</>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="mt-4 pt-4 border-t border-gray-700 flex justify-end">
                <div className="w-full sm:w-72 space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Subtotal</span>
                    <span className="font-medium text-white">{formatCurrency(calculateSubtotal())}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Tax ({(getEffectiveTaxRate() * 100).toFixed(2)}%)</span>
                    <span className="font-medium text-white">{formatCurrency(calculateTax())}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-gray-700">
                    <span className="font-semibold text-white">Total</span>
                    <span className="text-xl font-bold text-green-400">{formatCurrency(calculateTotal())}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Invoice Notes</label>
              <textarea
                value={invoiceNotes}
                onChange={(e) => setInvoiceNotes(e.target.value)}
                rows={2}
                placeholder="Add any additional notes for the customer..."
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Footer Actions */}
            <div className="flex gap-3 justify-end pt-3 border-t border-gray-700">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 text-sm font-medium transition-colors"
              >
                <Save className="w-4 h-4" />
                {submitting ? 'Creating...' : 'Create Invoice'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {showCatalogBrowser && (
        <InvoiceCatalogBrowser
          onSelect={(product) => {
            handleProductSelect(product);
            setShowCatalogBrowser(false);
          }}
          onClose={() => setShowCatalogBrowser(false)}
          multiSelect={false}
        />
      )}
    </>
  );
}
