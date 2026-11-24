import { snapshotDocumentLine } from '../../lib/documentPriceSnapshot';
import { requireCustomerZip, validCustomerZip } from '../../lib/customerZip';
import { notify } from '../../lib/feedback';
import ProductStatusNotice from '../Products/ProductStatusNotice';
import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Plus, Trash2, Save, Search, StickyNote, ChevronUp, ChevronDown, Eye, EyeOff, MapPin, ArrowLeftRight, Receipt, Pencil, Check, Send, CheckCircle, Building2, HelpCircle } from 'lucide-react';
import { ContactSearchSelect } from '../Shared/ContactSearchSelect';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';
import InlineProductSearch from '../Proposals/InlineProductSearch';
import InvoiceCatalogBrowser from './InvoiceCatalogBrowser';
import { computeInvoiceTax, lookupTaxRateByZip, verifyAndSubmitInvoice, type TaxEnvironment, type TaxProjectType, type ItemType } from '../../lib/taxCalculations';
import { TaxRulesBadge } from '../Shared/TaxRulesBadge';

interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  full_name?: string;
  company_name?: string;
  email: string;
  tax_rate?: number;
  office_id?: string | null;
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
  is_discontinued?: boolean;
  id: string;
  product_id?: string | null;
  sku?: string;
  model?: string;
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
  tax_classification_code?: string;
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

function blankLineItem(): LineItem {
  return { id: crypto.randomUUID(), description: '', quantity: 1, unit_price: 0, amount: 0, is_taxable: true, source_type: 'manual', tax_classification_code: 'material' };
}

function isBlankLineItem(item: LineItem) {
  return !item.description.trim() && !item.model?.trim() && !item.product_id &&
    !item.notes?.trim() && item.quantity === 1 && item.unit_price === 0;
}

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
  const { profile: _profile, companySettings } = useAuth();
  const [selectedContactId, setSelectedContactId] = useState(contactId || '');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState(projectId || '');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [dueDateAutoSet, setDueDateAutoSet] = useState(false);
  const [invoiceNotes, setInvoiceNotes] = useState('');
  const [customerVisible, setCustomerVisible] = useState(true);
  const taxRulesDialog = useRef<HTMLDialogElement>(null);
  const [showTaxExplanation, setShowTaxExplanation] = useState(false);
  const taxHelpButton = useRef<HTMLButtonElement>(null);

  function closeTaxExplanation() {
    setShowTaxExplanation(false);
    taxHelpButton.current?.focus();
  }
  const [taxEnvironment, setTaxEnvironment] = useState<'residential' | 'commercial'>('residential');
  const [taxProjectType, setTaxProjectType] = useState('general_installation_repair');
  const [lineItems, setLineItems] = useState<LineItem[]>(() => [blankLineItem()]);
  const [billToContact, setBillToContact] = useState<Contact | null>(null);
  const [billing, setBilling] = useState<BillingAddress>({ ...EMPTY_BILLING });
  const [billingSource, setBillingSource] = useState<'customer' | 'bill_to'>('customer');
  const [editingBilling, setEditingBilling] = useState(false);
  const [transactionLocation, setTransactionLocation] = useState<'customer' | 'dealer' | 'custom'>('customer');
  const [offices, setOffices] = useState<Array<{ id: string; office_name: string; address_line1: string; address_line2: string | null; city: string; state: string; zip: string }>>([]);
  const [selectedOfficeId, setSelectedOfficeId] = useState<string>('');
  const [customLocation, setCustomLocation] = useState({ address: '', city: '', state: '', zip: '' });
  const [locationDraft, setLocationDraft] = useState(customLocation);
  const [locationError, setLocationError] = useState('');
  const [locationRate, setLocationRate] = useState<{ key: string; rate: number | null } | null>(null);
  const [savingLocation, setSavingLocation] = useState(false);
  const locationDialog = useRef<HTMLDialogElement>(null);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [contactSearching, setContactSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showCatalogBrowser, setShowCatalogBrowser] = useState(false);
  const [newRowId, setNewRowId] = useState<string | null>(null);
  const [classificationIds, setClassificationIds] = useState<Record<string, string>>({});

  const lineItemsRef = useRef<HTMLDivElement>(null);

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
    loadOffices();
  }, []);

  useEffect(() => {
    setTransactionLocation('customer');
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

  async function loadOffices() {
    try {
      const { data, error } = await supabase
        .from('company_offices')
        .select('id, office_name, address_line1, address_line2, city, state, zip')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      if (error) throw error;
      setOffices(data || []);
      if (data && data.length === 1) {
        setSelectedOfficeId(data[0].id);
      }
    } catch (error) {
      console.error('Error loading offices:', error);
    }
  }

  async function loadData() {
    setLoading(true);
    try {
      const { data: classData } = await supabase.from('tax_classifications').select('id, code');
      if (classData) {
        const map: Record<string, string> = {};
        for (const row of classData) map[row.code] = row.id;
        setClassificationIds(map);
      }
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
      notify('Failed to load data', { theme: 'emerald', tone: 'error' });
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
        .select('id, first_name, last_name, full_name, company_name, email, tax_rate, is_tax_exempt, default_payment_terms, street_address, city, state, zip_code')
        .order('first_name')
        .limit(50);

      if (terms.length >= 2) {
        q = q.or(
          `first_name.ilike.%${terms[0]}%,last_name.ilike.%${terms[1]}%,` +
          `first_name.ilike.%${query.trim()}%,last_name.ilike.%${query.trim()}%,company_name.ilike.%${query.trim()}%`
        );
      } else {
        q = q.or(`first_name.ilike.%${query.trim()}%,last_name.ilike.%${query.trim()}%,company_name.ilike.%${query.trim()}%,email.ilike.%${query.trim()}%`);
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
        .select('id, first_name, last_name, full_name, company_name, email, tax_rate, is_tax_exempt, default_payment_terms, street_address, city, state, zip_code, office_id')
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

  useEffect(() => {
    if (!newRowId) return;
    const row = lineItemsRef.current?.querySelector(`[data-invoice-row="${newRowId}"]`);
    const input = Array.from(row?.querySelectorAll<HTMLInputElement>('input[data-room-id]') ?? [])
      .find(field => field.getClientRects().length > 0);
    input?.focus();
    setNewRowId(null);
  }, [newRowId]);

  function addLineItem() {
    const lastItem = lineItems[lineItems.length - 1];
    if (lastItem && isBlankLineItem(lastItem)) {
      setNewRowId(lastItem.id);
      return;
    }
    const item = blankLineItem();
    setLineItems(prev => [...prev, item]);
    setNewRowId(item.id);
  }

  function insertLineItemAfter(afterId: string) {
    const item = blankLineItem();
    setLineItems(prev => {
      const index = prev.findIndex(row => row.id === afterId);
      return [...prev.slice(0, index + 1), item, ...prev.slice(index + 1)];
    });
    setNewRowId(item.id);
  }

  function advanceToNextRow(event: React.KeyboardEvent, index: number) {
    if (event.key !== 'Tab' || event.shiftKey || isBlankLineItem(lineItems[index])) return;
    event.preventDefault();
    const nextItem = lineItems[index + 1];
    if (nextItem) setNewRowId(nextItem.id);
    else addLineItem();
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
    const target = rowId
      ? lineItems.find(item => item.id === rowId)
      : lineItems.find(isBlankLineItem);
    const row = target || blankLineItem();
    const price = product.our_price || 0;
    const updated: LineItem = snapshotDocumentLine({
      ...row,
      product_id: product.id,
      sku: product.sku,
      model: product.manufacturer_model_number || undefined,
      description: product.name,
      is_discontinued: product.is_discontinued,
      unit_price: price,
      cost: product.cost,
      amount: row.quantity * price,
      is_taxable: product.is_taxable !== false,
      source_type: 'catalog',
    });
    const rows = target
      ? lineItems.map(item => item.id === target.id ? updated : item)
      : [...lineItems, updated];
    keepEntryRow(rows, row.id);
  }

  function keepEntryRow(rows: LineItem[], afterId: string) {
    const lastRow = rows[rows.length - 1];
    const entryRow = isBlankLineItem(lastRow) ? lastRow : blankLineItem();
    setLineItems(entryRow === lastRow ? rows : [...rows, entryRow]);
    const nextRow = rows[rows.findIndex(item => item.id === afterId) + 1];
    setNewRowId(nextRow?.id || entryRow.id);
  }

  function handlePackageSelect(packageData: any, rowId: string) {
    const newItems: LineItem[] = (packageData.items || []).map((item: any) => snapshotDocumentLine({
      id: crypto.randomUUID(),
      product_id: item.product?.id,
      sku: item.product?.sku,
      model: item.product?.manufacturer_model_number || undefined,
      description: item.product?.name || 'Unknown Product',
      quantity: item.quantity,
      unit_price: item.product?.our_price || 0,
      cost: item.product?.cost,
      amount: (item.product?.our_price || 0) * item.quantity,
      is_taxable: item.product?.is_taxable !== false,
      source_type: 'package' as const
    }));
    if (!newItems.length) return;
    const index = lineItems.findIndex(item => item.id === rowId);
    const row = lineItems[index];
    const replaceSearchRow = !row.description.trim() && !row.product_id && !row.notes?.trim() && row.quantity === 1 && row.unit_price === 0;
    const rows = [...lineItems.slice(0, index + (replaceSearchRow ? 0 : 1)), ...newItems, ...lineItems.slice(index + 1)];
    keepEntryRow(rows, newItems[newItems.length - 1].id);
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
    return locationRate?.key === locationKey && locationRate?.rate != null
      ? locationRate.rate
      : 0;
  }

  const isExemptProject = taxProjectType === 'exempt_project';

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

  async function handleSubmit(e: React.FormEvent, action: 'draft' | 'submit' | 'submit_email' = 'draft') {
    e.preventDefault();

    if (!selectedContactId || selectedContact?.id !== selectedContactId) {
      notify('Please select a customer', { theme: 'emerald', tone: 'warning' });
      return;
    }

    if (action !== 'draft' && awaitingLocationRate) {
      notify('Sales tax rate is unavailable for this location. You can save an open draft.', { theme: 'emerald', tone: 'warning' });
      return;
    }

    if (action !== 'draft' && !dueDate) {
      notify('Enter a due date before submitting this invoice.', { theme: 'emerald', tone: 'warning' });
      return;
    }

    const invoiceItems = lineItems.filter(item => !isBlankLineItem(item));
    if (!invoiceItems.length) {
      notify('Add at least one invoice item.', { theme: 'emerald', tone: 'warning' });
      return;
    }
    if (invoiceItems.some(item => !item.description.trim())) {
      notify('Please fill in all line item descriptions', { theme: 'emerald', tone: 'warning' });
      return;
    }

    setSubmitting(true);
    try {
      const customerZip = transactionLocation === 'custom' && validCustomerZip(jobsiteZip)
        ? jobsiteZip : await requireCustomerZip(selectedContactId);
      if (!customerZip) return;
      const subtotal = calculateSubtotal();
      const tax = calculateTax();
      const total = calculateTotal();

      const lineItemsData = invoiceItems.map((item, index) => ({
        product_id: item.product_id || null,
        sku: item.sku || null,
        description: item.model?.trim() && item.model.trim().toLowerCase() !== item.description.trim().toLowerCase()
          ? `${item.model.trim()} — ${item.description.trim()}`
          : item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        cost: item.cost || null,
        amount: item.amount,
        is_taxable: item.is_taxable,
        item_type: item.item_type || 'material',
        source_type: item.source_type,
        notes: item.notes || null,
        notes_visible_on_invoice: item.notes_visible_on_invoice ?? false,
        tax_classification_id: classificationIds[item.tax_classification_code || ''] || null,
        sort_order: index
      }));

      const { data: invoiceId, error: createError } = await supabase.rpc('create_manual_invoice_atomic', {
        p_invoice: {
          company_id: companySettings?.id,
          contact_id: selectedContactId,
          project_id: selectedProjectId || null,
          sales_order_id: salesOrderId || null,
          invoice_date: invoiceDate,
          due_date: dueDate || null,
          customer_visible_on_submit: customerVisible,
          subtotal,
          tax_amount: tax,
          total,
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
          billing_zip: billing.billing_zip || (transactionLocation === 'custom' ? null : customerZip),
          bill_to_contact_id: billToContact?.id || null,
          jobsite_address: jobsiteAddress,
          jobsite_city: jobsiteCity,
          jobsite_state: jobsiteState,
          jobsite_zip: jobsiteZip || customerZip,
        },
        p_line_items: lineItemsData,
        p_submit: false,
      });
      if (createError) {
        console.error('Invoice save failed:', createError);
        throw new Error(
          createError.code === 'PGRST202'
            ? 'Invoice saving is unavailable. Ask your MyJobView administrator to check the invoice database deployment.'
            : createError.message
        );
      }

      if (action !== 'draft') {
        try {
          await verifyAndSubmitInvoice(invoiceId);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Tax verification or submission failed.';
          notify(`Invoice saved as a draft. ${message}`, { theme: 'emerald', tone: 'error' });
          onSuccess(invoiceId);
          onClose();
          return;
        }
      }

      if (action === 'submit_email' && customerVisible) {
        try {
          const { error } = await supabase.functions.invoke('send-invoice-email', { body: { invoiceId } });
          if (error) throw error;
        } catch (sendErr) {
          console.error('Invoice submitted but email send failed:', sendErr);
          notify('Invoice submitted successfully, but the email failed to send. You can resend it from the invoice detail view.', { theme: 'emerald', tone: 'error' });
        }
      }

      notify('Invoice created!', { theme: 'emerald', tone: 'success' });
      onSuccess(invoiceId);
      onClose();
    } catch (error) {
      console.error('Error creating invoice:', error);
      notify(error instanceof Error ? error.message : 'Failed to create invoice. Please try again.', { theme: 'emerald', tone: 'error' });
    } finally {
      setSubmitting(false);
    }
  }

  async function saveLocation(updateCustomer: boolean) {
    const contact = selectedContact;
    if (!contact || contact.id !== selectedContactId || savingLocation) return;
    setLocationError('');
    const address = {
      address: locationDraft.address.trim(),
      city: locationDraft.city.trim(),
      state: locationDraft.state.trim().toUpperCase(),
      zip: locationDraft.zip.trim(),
    };
    if (!address.address || !address.city || !/^[A-Z]{2}$/.test(address.state) || !validCustomerZip(address.zip)) {
      setLocationError('Enter a street address, city, two-letter state, and valid ZIP.');
      return;
    }
    if (!updateCustomer) {
      setCustomLocation(address);
      setTransactionLocation('custom');
      locationDialog.current?.close();
      return;
    }
    setSavingLocation(true);
    try {
      const updates: Partial<Contact> & { tax_jurisdiction_id?: string | null } = {
        street_address: address.address, city: address.city, state: address.state, zip_code: address.zip,
      };
      const previousLocation = {
        street_address: contact.street_address ?? null,
        city: contact.city ?? null,
        state: contact.state ?? null,
        zip_code: contact.zip_code ?? null,
      };
      const locationChanged = Object.entries(updates).some(([field, value]) =>
        previousLocation[field as keyof typeof previousLocation] !== value
      );
      if (locationChanged) {
        const jurisdiction = await lookupTaxRateByZip(address.zip, {
          street: address.address,
          city: address.city,
          state: address.state,
        });
        if (jurisdiction?.combined_rate == null) throw new Error('TaxJar could not verify the new address rate.');
        updates.tax_rate = jurisdiction.combined_rate;
        const { data: matchingJurisdictions, error: jurisdictionError } = await supabase
          .from('tax_jurisdictions')
          .select('id')
          .eq('zip_code', address.zip)
          .eq('state', address.state)
          .eq('combined_rate', jurisdiction.combined_rate)
          .eq('jurisdiction_name', jurisdiction.jurisdiction_name)
          .eq('is_active', true)
          .limit(2);
        if (jurisdictionError) throw jurisdictionError;
        updates.tax_jurisdiction_id = matchingJurisdictions?.length === 1 ? matchingJurisdictions[0].id : null;
      }
      let update = supabase.from('contacts').update(updates).eq('id', contact.id);
      for (const [field, value] of Object.entries({ ...previousLocation, tax_rate: contact.tax_rate ?? null })) {
        update = value === null ? update.is(field, null) : update.eq(field, value);
      }
      const { data, error } = await update.select('street_address, city, state, zip_code, tax_rate').single();
      if (error) throw error;
      const updatedContact = { ...contact, ...data };
      setSelectedContact(updatedContact);
      setTransactionLocation('customer');
      locationDialog.current?.close();
      notify('Customer address updated.', { theme: 'emerald', tone: 'success' });
    } catch (error) {
      console.error('Could not update customer address:', error);
      setLocationError('Customer address and tax rate were not updated. Check the full address or reopen the invoice if the customer was edited.');
    } finally {
      setSavingLocation(false);
    }
  }

  const termsLabel = formatTermsLabel(selectedContact?.default_payment_terms);
  const hasBillingData = billing.billing_name || billing.billing_address_line1;
  const billingOneLine = formatBillingOneLine(billing);

  const selectedOffice = offices.find(o => o.id === selectedOfficeId);
  const jobsiteAddress = transactionLocation === 'customer'
    ? (selectedContact?.street_address || null)
    : transactionLocation === 'dealer'
      ? (selectedOffice ? `${selectedOffice.address_line1}${selectedOffice.address_line2 ? ' ' + selectedOffice.address_line2 : ''}` : null)
      : (customLocation.address || null);
  const jobsiteCity = transactionLocation === 'customer'
    ? (selectedContact?.city || null)
    : transactionLocation === 'dealer'
      ? (selectedOffice?.city || null)
      : (customLocation.city || null);
  const jobsiteState = transactionLocation === 'customer'
    ? (selectedContact?.state || null)
    : transactionLocation === 'dealer'
      ? (selectedOffice?.state || null)
      : (customLocation.state || null);
  const jobsiteZip = transactionLocation === 'customer'
    ? (selectedContact?.zip_code || null)
    : transactionLocation === 'dealer'
      ? (selectedOffice?.zip || null)
      : (customLocation.zip || null);
  const locationKey = JSON.stringify([jobsiteAddress, jobsiteCity, jobsiteState, jobsiteZip]);
  const hasCompleteLocation = !!jobsiteAddress?.trim() && !!jobsiteCity?.trim()
    && /^[A-Za-z]{2}$/.test(jobsiteState?.trim() ?? '') && validCustomerZip(jobsiteZip);
  const hasLocationRate = locationRate?.key === locationKey && locationRate?.rate != null;
  const awaitingLocationRate = !!selectedContact && !isExemptProject && !hasLocationRate;

  useEffect(() => {
    if (!hasCompleteLocation || isExemptProject || !jobsiteAddress || !jobsiteCity || !jobsiteState || !jobsiteZip) return;
    let current = true;
    const timer = window.setTimeout(() => {
      lookupTaxRateByZip(jobsiteZip, {
        street: jobsiteAddress.trim(),
        city: jobsiteCity.trim(),
        state: jobsiteState.trim().toUpperCase(),
      }).then(jurisdiction => {
        if (current) setLocationRate({ key: locationKey, rate: jurisdiction?.combined_rate ?? null });
      }).catch(() => {
        if (current) setLocationRate({ key: locationKey, rate: null });
      });
    }, 300);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [hasCompleteLocation, isExemptProject, jobsiteAddress, jobsiteCity, jobsiteState, jobsiteZip, locationKey]);

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

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-2 sm:p-3">
        <div className="bg-gray-800 rounded-xl shadow-2xl flex max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-1.5rem)] w-full max-w-7xl flex-col border border-gray-700">

          {/* Header */}
          <div className="flex items-center justify-between shrink-0 px-4 py-2 border-b border-gray-700">
            <h2 className="text-lg sm:text-xl font-bold text-white">New Invoice</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors text-gray-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex min-h-0 flex-col">
            <div className="min-h-0 overflow-y-auto p-3 sm:px-4 space-y-2.5 max-lg:[&_input]:text-base max-lg:[&_select]:text-base max-lg:[&_textarea]:text-base">

            {/* All header fields on one desktop row, 2-col grid on mobile */}
            <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4 lg:flex lg:flex-wrap lg:items-end">
              {/* Customer — takes available space */}
              <div className="col-span-2 lg:flex-[2] lg:min-w-[200px]">
                <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <label className="text-xs font-medium text-gray-400">Customer *</label>
                  {selectedContact?.id === selectedContactId && selectedContact?.is_tax_exempt && (
                    <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300">
                      Tax Exempt Customer
                    </span>
                  )}
                </div>
                <ContactSearchSelect
                  contacts={(() => {
                    const list = contacts.map(c => ({
                      id: c.id,
                      label: getContactDisplayName(c),
                      sublabel: c.email || undefined,
                    }));
                    if (selectedContact && !list.find(c => c.id === selectedContact.id)) {
                      list.unshift({
                        id: selectedContact.id,
                        label: getContactDisplayName(selectedContact),
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
              <div className="col-span-2 md:col-span-3 lg:flex-1 lg:min-w-[180px]">
                <label className="block text-xs font-medium text-gray-400 mb-1">Project Type *</label>
                <div className="flex items-center gap-1">
                  <select
                    value={taxProjectType}
                    onChange={(e) => setTaxProjectType(e.target.value)}
                    required
                    className="min-w-0 w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                  <button
                    type="button"
                    aria-label="View tax rules"
                    aria-haspopup="dialog"
                    onClick={() => taxRulesDialog.current?.showModal()}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded text-blue-300 hover:bg-gray-700 focus-visible:outline focus-visible:outline-blue-400"
                  >
                    <HelpCircle size={16} aria-hidden="true" />
                  </button>
                </div>
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

            {selectedContactId && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-gray-700 px-3 py-2">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden="true" />
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Location</span>
                <button
                  type="button"
                  disabled={!selectedContact || selectedContact.id !== selectedContactId}
                  aria-label={transactionLocation === 'dealer' ? 'Use Customer Address' : 'Edit invoice location address'}
                  onClick={() => {
                    if (transactionLocation === 'dealer') {
                      setTransactionLocation('customer');
                      return;
                    }
                    setLocationError('');
                    setLocationDraft(transactionLocation === 'custom' ? customLocation : {
                      address: selectedContact?.street_address || '', city: selectedContact?.city || '',
                      state: selectedContact?.state || '', zip: selectedContact?.zip_code || '',
                    });
                    locationDialog.current?.showModal();
                  }}
                  className="inline-flex min-w-0 items-center gap-1.5 rounded px-2 py-1 text-left text-sm text-gray-200 hover:bg-gray-700 disabled:opacity-50"
                >
                  <Pencil size={12} className="shrink-0" aria-hidden="true" />
                  {transactionLocation === 'dealer' ? 'Use Customer Address' :
                    [jobsiteAddress, jobsiteCity, jobsiteState, jobsiteZip].filter(Boolean).join(', ') || 'Add customer address'}
                  {transactionLocation === 'custom' && <span className="text-xs text-gray-400">(invoice only)</span>}
                </button>
                <button
                  type="button"
                  aria-pressed={transactionLocation === 'dealer'}
                  disabled={offices.length === 0}
                  onClick={() => {
                    if (transactionLocation === 'dealer') {
                      setTransactionLocation('customer');
                    } else {
                      if (!selectedOfficeId) {
                        const customerOffice = offices.find(office => office.id === selectedContact?.office_id);
                        setSelectedOfficeId(customerOffice?.id || offices[0].id);
                      }
                      setTransactionLocation('dealer');
                    }
                  }}
                  className="ml-auto inline-flex items-center gap-1.5 rounded border border-gray-600 px-2 py-1 text-xs text-gray-200 hover:bg-gray-700 aria-pressed:border-blue-500 aria-pressed:bg-blue-600 disabled:opacity-40"
                >
                  <Building2 size={14} aria-hidden="true" />
                  Store Pickup
                </button>
                {transactionLocation === 'dealer' && (
                  <div className="flex w-full flex-wrap items-center gap-2 text-xs text-gray-400">
                    {offices.length > 1 && (
                      <select
                        aria-label="Pickup store"
                        value={selectedOfficeId}
                        onChange={event => setSelectedOfficeId(event.target.value)}
                        className="rounded border border-gray-700 bg-gray-900 px-2 py-1 text-gray-200"
                      >
                        {offices.map(office => <option key={office.id} value={office.id}>{office.office_name}</option>)}
                      </select>
                    )}
                    <span>{[jobsiteAddress, jobsiteCity, jobsiteState, jobsiteZip].filter(Boolean).join(', ')}</span>
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
              <div className="hidden lg:grid grid-cols-[16px_16px_minmax(0,1fr)_minmax(0,2fr)_80px_100px_48px_120px_96px_70px] gap-2 px-[9px] mb-1">
                <span />
                <span />
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">Model</span>
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">Description</span>
                <span className="text-[10px] text-gray-500 uppercase tracking-wider text-center">Qty</span>
                <span className="text-[10px] text-gray-500 uppercase tracking-wider text-right">Unit Price</span>
                <span className="text-[10px] text-gray-500 uppercase tracking-wider text-center">Tax</span>
                <span className="text-[10px] text-gray-500 uppercase tracking-wider">Tax Class</span>
                <span className="text-[10px] text-gray-500 uppercase tracking-wider text-right">Amount</span>
                <span />
              </div>

              <div ref={lineItemsRef} className="space-y-2">
                {lineItems.map((item, index) => (
                  <div key={item.id} data-invoice-row={item.id} className="bg-gray-750 rounded-lg border border-gray-700/80">

                    {/* Desktop Row */}
                    <div className="hidden lg:grid grid-cols-[16px_16px_minmax(0,1fr)_minmax(0,2fr)_80px_100px_48px_120px_96px_70px] gap-2 items-center px-2 py-1.5">
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

                      {/* Model */}
                      <div className="flex-1 min-w-0">
                        <ProductStatusNotice product={item} />
                        <InlineProductSearch
                          value={item.model || ''}
                          onChange={(value) => updateLineItem(item.id, 'model', value)}
                          onProductSelect={(product) => handleProductSelect(product, item.id)}
                          onPackageSelect={(pkg) => handlePackageSelect(pkg, item.id)}
                          dataRoomId={item.id}
                          searchCatalog
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') event.preventDefault();
                          }}
                          className="w-full px-2 py-1.5 text-sm bg-gray-900 border border-gray-700 rounded text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="Search by model or name"
                        />
                      </div>

                      {/* Description */}
                      <div className="flex-[2] min-w-0">
                        <input
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
                          checked={!isExemptProject && item.is_taxable}
                          disabled={isExemptProject}
                          onChange={(e) => updateLineItem(item.id, 'is_taxable', e.target.checked)}
                          className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                          title="Taxable"
                        />
                      </div>

                      {/* Classification */}
                      <select
                        value={item.tax_classification_code || 'material'}
                        onChange={(e) => updateLineItem(item.id, 'tax_classification_code', e.target.value)}
                        className="w-[120px] flex-shrink-0 px-1.5 py-1.5 text-xs bg-gray-900 border border-gray-700 rounded text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        onKeyDown={event => advanceToNextRow(event, index)}
                        title="Tax classification"
                      >
                        <option value="material">Material</option>
                        <option value="labor">Labor</option>
                        <option value="design_fee">Design Fee</option>
                        <option value="project_management">Project Mgmt</option>
                        <option value="freight_delivery">Freight/Delivery</option>
                        <option value="credit_card_fee">Credit Card Fee</option>
                      </select>

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
                    <div className="grid gap-2 p-3 md:grid-cols-2 lg:hidden">
                      <div className="flex items-center justify-between gap-2 md:col-span-2">
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

                      {/* Model Search */}
                      <div>
                        <label className="block text-[11px] text-gray-400 mb-1">Model</label>
                        <ProductStatusNotice product={item} />
                        <InlineProductSearch
                          value={item.model || ''}
                          onChange={(value) => updateLineItem(item.id, 'model', value)}
                          onProductSelect={(product) => handleProductSelect(product, item.id)}
                          onPackageSelect={(pkg) => handlePackageSelect(pkg, item.id)}
                          dataRoomId={item.id}
                          searchCatalog
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') event.preventDefault();
                          }}
                          className="w-full px-3 py-2.5 text-sm bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          placeholder="Search by model or name"
                        />
                      </div>

                      {/* Description */}
                      <div>
                        <label className="block text-[11px] text-gray-400 mb-1">Description *</label>
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                          placeholder="Description..."
                          className="w-full px-3 py-2.5 text-sm bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>

                      {/* Qty / Price / Tax / Amount */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 items-end gap-2 md:col-span-2">
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
                            onKeyDown={isExemptProject ? event => advanceToNextRow(event, index) : undefined}
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
                            checked={!isExemptProject && item.is_taxable}
                            disabled={isExemptProject}
                            onChange={(e) => updateLineItem(item.id, 'is_taxable', e.target.checked)}
                            onKeyDown={event => advanceToNextRow(event, index)}
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
                        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-700 py-2 text-xs text-gray-500 transition-colors hover:border-green-700 hover:text-green-400 md:col-span-2"
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
              <div className="mt-2 pt-2 border-t border-gray-700 flex justify-end">
                <div
                  className="relative w-full sm:w-72 space-y-1.5"
                  onKeyDown={event => {
                    if (showTaxExplanation && event.key === 'Escape') {
                      event.stopPropagation();
                      closeTaxExplanation();
                    }
                  }}
                >
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Subtotal</span>
                    <span className="font-medium text-white">{formatCurrency(calculateSubtotal())}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <div className="flex items-center gap-2 text-gray-400">
                      <span>{isExemptProject || selectedContact?.is_tax_exempt
                        ? 'Sales tax (exempt)'
                        : awaitingLocationRate ? 'Sales tax' : `Sales tax (${(getEffectiveTaxRate() * 100).toFixed(2)}%)`}</span>
                      <button
                        type="button"
                        ref={taxHelpButton}
                        aria-label="How sales tax is calculated"
                        aria-controls={showTaxExplanation ? 'invoice-tax-explanation' : undefined}
                        aria-expanded={showTaxExplanation}
                        onClick={() => setShowTaxExplanation(open => !open)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded text-blue-300 hover:bg-gray-700 focus-visible:outline focus-visible:outline-blue-400"
                      >
                        <HelpCircle size={16} aria-hidden="true" />
                      </button>
                    </div>
                    <span className="font-medium text-white">
                      {awaitingLocationRate ? (!hasCompleteLocation ? 'Enter full location' : locationRate?.key === locationKey ? 'Rate unavailable' : 'Looking up rate…') : formatCurrency(calculateTax())}
                    </span>
                  </div>
                  {showTaxExplanation && (
                    <div
                      id="invoice-tax-explanation"
                      role="region"
                      aria-label="How sales tax is calculated"
                      className="absolute inset-x-0 bottom-full z-20 mb-2 space-y-3 rounded-xl border border-gray-600 bg-gray-900 p-4 text-sm leading-relaxed text-gray-300 shadow-xl"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold text-white">How sales tax is calculated</h3>
                        <button
                          type="button"
                          aria-label="Close sales tax help"
                          onClick={closeTaxExplanation}
                          className="rounded p-1 text-gray-300 hover:bg-gray-700 hover:text-white focus-visible:outline focus-visible:outline-blue-400"
                        >
                          <X size={16} aria-hidden="true" />
                        </button>
                      </div>
                      <p>
                        {isExemptProject
                          ? 'Exempt Project is selected. To submit with an exemption, the customer needs an active certificate for the state shown under Location.'
                          : selectedContact?.is_tax_exempt
                            ? 'The customer is marked Tax Exempt. At submission, MyJobView checks for an active certificate for the state shown under Location.'
                            : awaitingLocationRate ? 'MyJobView needs a street-address rate for the invoice Location.'
                            : `This preview applies ${(getEffectiveTaxRate() * 100).toFixed(2)}% to taxable line items based on their tax settings, the environment, and project type. MyJobView recalculates tax at submission.`}
                      </p>
                      {selectedContactId ? (
                        <p>
                          To add a customer exemption, open{' '}
                          <a
                            href={`/?tab=contacts&contactId=${encodeURIComponent(selectedContactId)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-blue-300 underline underline-offset-2"
                          >
                            Customer Details
                          </a>
                          {' '}and record the exemption and certificate.
                        </p>
                      ) : (
                        <p>Select a customer to open their record and add an exemption.</p>
                      )}
                    </div>
                  )}
                  <div className="flex justify-between pt-2 border-t border-gray-700">
                    <span className="font-semibold text-white">Estimated total</span>
                    <span className="text-xl font-bold text-green-400">{awaitingLocationRate ? '—' : formatCurrency(calculateTotal())}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Notes */}
            <details>
              <summary className="cursor-pointer text-xs font-medium text-gray-300">Invoice Notes</summary>
              <textarea
                aria-label="Invoice Notes"
                value={invoiceNotes}
                onChange={(e) => setInvoiceNotes(e.target.value)}
                rows={2}
                placeholder="Add any additional notes for the customer..."
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </details>
            </div>

            {/* Footer Actions */}
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-gray-700 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={customerVisible} onChange={e=>setCustomerVisible(e.target.checked)} />Visible to customer</label>
              <button
                type="submit"
                disabled={submitting}
                onClick={(e) => { e.preventDefault(); handleSubmit(e as any, 'draft'); }}
                className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 text-sm font-medium transition-colors"
              >
                <Save className="w-4 h-4" />
                {submitting ? 'Creating...' : 'Save Draft'}
              </button>
              <button
                type="button"
                disabled={submitting || awaitingLocationRate}
                onClick={(e) => { e.preventDefault(); handleSubmit(e as any, 'submit'); }}
                className="px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2 text-sm font-medium transition-colors"
              >
                <CheckCircle className="w-4 h-4" />
                {submitting ? 'Submitting...' : 'Submit'}
              </button>
              <button
                type="button"
                disabled={submitting || awaitingLocationRate || !customerVisible}
                onClick={(e) => { e.preventDefault(); handleSubmit(e as any, 'submit_email'); }}
                className="px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2 text-sm font-medium transition-colors"
              >
                <Send className="w-4 h-4" />
                {submitting ? 'Submitting...' : 'Submit & Email'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <dialog
        ref={locationDialog}
        aria-labelledby="invoice-location-title"
        onCancel={event => { if (savingLocation) event.preventDefault(); }}
        className="m-auto w-11/12 max-w-lg rounded-xl border border-gray-600 bg-gray-900 p-4 text-gray-200 shadow-xl backdrop:bg-black/70"
      >
        <h2 id="invoice-location-title" className="mb-3 font-semibold text-white">Edit Location</h2>
        <div className="grid grid-cols-2 gap-2">
          {(['address', 'city', 'state', 'zip'] as const).map(field => (
            <label key={field} className={field === 'address' || field === 'city' ? 'col-span-2 text-xs' : 'text-xs'}>
              {{ address: 'Street address', city: 'City', state: 'State', zip: 'ZIP' }[field]}
              <input
                value={locationDraft[field]}
                disabled={savingLocation}
                onChange={event => setLocationDraft(prev => ({ ...prev, [field]: event.target.value }))}
                maxLength={field === 'state' ? 2 : undefined}
                className="mt-1 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-base text-white lg:text-sm"
              />
            </label>
          ))}
        </div>
        {locationError && <p role="alert" className="mt-3 text-sm text-red-300">{locationError}</p>}
        <div className="mt-4 flex flex-wrap justify-end gap-2 text-sm">
          <button type="button" disabled={savingLocation} onClick={() => locationDialog.current?.close()} className="rounded border border-gray-600 px-2 py-1.5">Cancel</button>
          <button type="button" disabled={savingLocation} onClick={() => void saveLocation(false)} className="rounded bg-gray-700 px-2 py-1.5">Use for This Invoice</button>
          <button type="button" disabled={savingLocation} onClick={() => void saveLocation(true)} className="rounded bg-blue-600 px-2 py-1.5 text-white">{savingLocation ? 'Updating…' : 'Update Customer Record'}</button>
        </div>
      </dialog>

      <dialog
        ref={taxRulesDialog}
        aria-labelledby="invoice-tax-rules-title"
        className="m-auto w-11/12 max-w-md rounded-xl border border-gray-600 bg-gray-900 p-4 text-gray-300 shadow-xl backdrop:bg-black/70"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="invoice-tax-rules-title" className="font-semibold text-white">Tax Rules</h2>
          <button
            type="button"
            aria-label="Close tax rules"
            onClick={() => taxRulesDialog.current?.close()}
            className="rounded p-2 hover:bg-gray-700 hover:text-white focus-visible:outline focus-visible:outline-blue-400"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <TaxRulesBadge taxEnvironment={taxEnvironment} taxProjectType={taxProjectType} darkMode showTitle={false} />
      </dialog>

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
