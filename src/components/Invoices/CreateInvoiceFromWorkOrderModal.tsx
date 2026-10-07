import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { X, Plus, Trash2, Save, Clock, Wrench, Package, AlertCircle, Search, CheckCircle, DollarSign, FileText, ChevronUp, ChevronDown, StickyNote, Eye, EyeOff, MapPin } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import { computeInvoiceTax, type TaxEnvironment, type TaxProjectType, type ItemType } from '../../lib/taxCalculations';
import { AddPartsModal } from '../Production/AddPartsModal';
import { TaxRulesBadge } from '../Shared/TaxRulesBadge';

type BillingQueueStatus =
  | 'ready_for_billing'
  | 'assigned'
  | 'in_progress'
  | 'invoice_created'
  | 'invoice_sent'
  | 'payment_pending'
  | 'paid'
  | 'overdue'
  | 'closed';

interface WorkOrder {
  id: string;
  work_order_number: string;
  title: string;
  type: string;
  contact_id: string;
  project_id: string | null;
  is_billable: boolean;
  billable_type: string | null;
  actual_completion_date: string | null;
  billing_queue_status: BillingQueueStatus | null;
  contacts: {
    first_name: string;
    last_name: string;
    contact_name: string;
    email: string;
    tax_rate?: number;
    is_tax_exempt?: boolean;
    default_payment_terms?: string;
    street_address?: string | null;
    city?: string | null;
    state?: string | null;
    zip_code?: string | null;
  };
}

const PAYMENT_TERMS_DAYS: Record<string, number> = {
  net_10: 10, net_15: 15, net_30: 30, net_45: 45, net_60: 60, due_on_receipt: 0,
};

function normalizePaymentTerms(terms: string | undefined | null): string {
  if (!terms) return '';
  const map: Record<string, string> = {
    'net 10': 'net_10', 'net 15': 'net_15', 'net 30': 'net_30',
    'net 45': 'net_45', 'net 60': 'net_60', 'due on receipt': 'due_on_receipt',
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
    net_10: 'Net 10', net_15: 'Net 15', net_30: 'Net 30',
    net_45: 'Net 45', net_60: 'Net 60', due_on_receipt: 'Due on Receipt',
  };
  return map[normalized] || rawTerms;
}

interface LaborEntry {
  id: string;
  tech_user_id: string;
  calculated_hours: number;
  labor_rate: number;
  labor_total: number;
  notes: string | null;
  is_billable: boolean;
  profiles: {
    first_name: string;
    last_name: string;
  };
}

interface PartsUsed {
  id: string;
  part_name: string;
  quantity: number;
  unit_cost: number;
  unit_price: number;
  total_price: number;
  product_id: string | null;
  part_sku: string | null;
  is_warranty?: boolean;
  warranty_item?: boolean;
  notes: string | null;
}

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  item_type?: ItemType;
  source?: 'labor' | 'parts' | 'manual';
  notes?: string;
  notes_visible_on_invoice?: boolean;
  showNotes?: boolean;
  product_id?: string | null;
  sku?: string | null;
  cost?: number;
  source_part_id?: string | null;
}

interface BillingAddress {
  billing_name: string;
  billing_address_line1: string;
  billing_address_line2: string;
  billing_city: string;
  billing_state: string;
  billing_zip: string;
}

const EMPTY_BILLING: BillingAddress = {
  billing_name: '',
  billing_address_line1: '',
  billing_address_line2: '',
  billing_city: '',
  billing_state: '',
  billing_zip: '',
};

interface CreateInvoiceFromWorkOrderModalProps {
  onClose: () => void;
  onSuccess: (invoiceId: string) => void;
  preSelectedContactId?: string;
  preSelectedWorkOrderId?: string;
}

type FilterTab = 'all' | 'ready' | 'draft' | 'billed';

function getBillingBadge(status: BillingQueueStatus | null, isBillable: boolean) {
  if (!isBillable) {
    return { label: 'Not Billable', className: 'bg-gray-100 text-gray-600' };
  }
  if (!status) {
    return { label: 'Completed', className: 'bg-amber-100 text-amber-700' };
  }
  switch (status) {
    case 'ready_for_billing':
      return { label: 'Ready to Bill', className: 'bg-emerald-100 text-emerald-700' };
    case 'assigned':
      return { label: 'Billing Assigned', className: 'bg-blue-100 text-blue-700' };
    case 'in_progress':
      return { label: 'Billing In Progress', className: 'bg-blue-100 text-blue-700' };
    case 'invoice_created':
    case 'invoice_sent':
      return { label: 'Invoice Created', className: 'bg-gray-100 text-gray-500' };
    case 'payment_pending':
      return { label: 'Awaiting Payment', className: 'bg-amber-100 text-amber-700' };
    case 'paid':
      return { label: 'Paid', className: 'bg-gray-100 text-gray-500' };
    case 'overdue':
      return { label: 'Overdue', className: 'bg-red-100 text-red-700' };
    case 'closed':
      return { label: 'Closed', className: 'bg-gray-100 text-gray-500' };
    default:
      return { label: 'Completed', className: 'bg-amber-100 text-amber-700' };
  }
}

export function CreateInvoiceFromWorkOrderModal({ onClose, onSuccess, preSelectedWorkOrderId }: CreateInvoiceFromWorkOrderModalProps) {
  const retryKey = useRef(crypto.randomUUID());
  const autoOpened = useRef(false);
  const [draftInvoiceId, setDraftInvoiceId] = useState<string | null>(null);
  const [portalVisible, setPortalVisible] = useState(true);
  const [addPartsTo, setAddPartsTo] = useState<string | null>(null);
  const [closeoutNotes, setCloseoutNotes] = useState<{work_order_id: string; tech_notes: string}[]>([]);
  const [openClocks, setOpenClocks] = useState(false);
  const [reviewOrders, setReviewOrders] = useState<{id: string; work_order_number: string; status: string; contact_id: string}[]>([]);
  const [laborRate, setLaborRate] = useState(0);
  const [step, setStep] = useState<'select' | 'review'>('select');
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [selectedWorkOrderIds, setSelectedWorkOrderIds] = useState<string[]>(preSelectedWorkOrderId ? [preSelectedWorkOrderId] : []);
  const [laborEntries, setLaborEntries] = useState<LaborEntry[]>([]);
  const [partsUsed, setPartsUsed] = useState<PartsUsed[]>([]);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [taxEnvironment, setTaxEnvironment] = useState<'residential' | 'commercial'>('residential');
  const [taxProjectType, setTaxProjectType] = useState('general_installation_repair');
  const [taxRate, setTaxRate] = useState(0.0935);
  const [isTaxExempt, setIsTaxExempt] = useState(false);
  const [dueDateAutoSet, setDueDateAutoSet] = useState(false);
  const [billing, setBilling] = useState<BillingAddress>(EMPTY_BILLING);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterTab>('ready');

  useEffect(() => {
    loadWorkOrders();
  }, []);

  useEffect(() => {
    if (dueDateAutoSet) {
      const firstWO = workOrders.find(wo => selectedWorkOrderIds.includes(wo.id));
      const terms = firstWO?.contacts?.default_payment_terms;
      const computed = computeDueDate(invoiceDate, terms);
      if (computed) setDueDate(computed);
    }
  }, [invoiceDate]);

  const applyContactToBilling = useCallback((contact: WorkOrder['contacts']) => {
    const name = `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || contact.contact_name || '';
    setBilling({
      billing_name: name,
      billing_address_line1: contact.street_address || '',
      billing_address_line2: '',
      billing_city: contact.city || '',
      billing_state: contact.state || '',
      billing_zip: contact.zip_code || '',
    });
  }, []);

  async function loadWorkOrders() {
    setLoading(true);
    try {
      const workOrderQuery = supabase
        .from('work_orders')
        .select(`
          id,
          work_order_number,
          title,
          type,
          contact_id,
          project_id,
          is_billable,
          billable_type,
          actual_completion_date,
          contacts:contact_id (
            first_name,
            last_name,
            contact_name,
            email,
            tax_rate,
            is_tax_exempt,
            default_payment_terms,
            street_address,
            city,
            state,
            zip_code
          )
        `)
        .neq('status', 'cancelled')
        .in('type', ['service'])
        .order('actual_completion_date', { ascending: false });
      const {data:woData,error:woError}=await (preSelectedWorkOrderId ? workOrderQuery.eq('id',preSelectedWorkOrderId) : workOrderQuery.limit(200));

      if (woError) throw woError;

      const woIds = (woData || []).map(wo => wo.id);

      let billingQueueMap: Record<string, BillingQueueStatus> = {};
      if (woIds.length > 0) {
        const { data: queueData } = await supabase
          .from('service_billing_queue')
          .select('work_order_id, status')
          .in('work_order_id', woIds);

        if (queueData) {
          for (const entry of queueData) {
            billingQueueMap[entry.work_order_id] = entry.status as BillingQueueStatus;
          }
        }
      }

      const enriched: WorkOrder[] = (woData || []).map(wo => ({
        ...wo,
        contacts:Array.isArray(wo.contacts)?wo.contacts[0]:wo.contacts,
        billing_queue_status: billingQueueMap[wo.id] ?? null,
      }));

      const sorted = enriched.sort((a, b) => {
        const priority = (wo: WorkOrder) => {
          if (wo.billing_queue_status === 'ready_for_billing') return 0;
          if (!wo.billing_queue_status) return 1;
          if (['assigned', 'in_progress'].includes(wo.billing_queue_status)) return 2;
          return 3;
        };
        return priority(a) - priority(b);
      });

      setWorkOrders(sorted);
    } catch (error) {
      console.error('Error loading work orders:', error);
      alert('Failed to load work orders');
    } finally {
      setLoading(false);
    }
  }

  const readyCount = useMemo(
    () => workOrders.filter(wo => wo.billing_queue_status === 'ready_for_billing').length,
    [workOrders]
  );

  const filteredWorkOrders = useMemo(() => {
    let list = workOrders;

    if (activeFilter === 'ready') {
      list = list.filter(wo => wo.billing_queue_status === 'ready_for_billing');
    } else if (activeFilter === 'draft') {
      list = list.filter(wo => wo.billing_queue_status === 'invoice_created');
    } else if (activeFilter === 'billed') {
      list = list.filter(wo =>
        wo.billing_queue_status !== null &&
        ['invoice_sent', 'payment_pending', 'paid', 'overdue', 'closed'].includes(wo.billing_queue_status)
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(wo => {
        const customerName = wo.contacts?.contact_name ||
          `${wo.contacts?.first_name || ''} ${wo.contacts?.last_name || ''}`.trim();
        return (
          wo.work_order_number.toLowerCase().includes(q) ||
          wo.title.toLowerCase().includes(q) ||
          customerName.toLowerCase().includes(q)
        );
      });
    }

    return list;
  }, [workOrders, activeFilter, searchQuery]);

  async function loadWorkOrderData() {
    if (selectedWorkOrderIds.length === 0) {
      alert('Please select at least one work order');
      return;
    }

    setLoading(true);
    try {
      const { data: selectedWOs, error: woError } = await supabase
        .from('work_orders')
        .select('id, work_order_group_id')
        .in('id', selectedWorkOrderIds);

      if (woError) throw woError;

      const allWorkOrderIds: Set<string> = new Set(selectedWorkOrderIds);

      for (const wo of selectedWOs || []) {
        if (wo.work_order_group_id) {
          const { data: groupedWOs, error: groupError } = await supabase
            .from('work_orders')
            .select('id')
            .eq('work_order_group_id', wo.work_order_group_id);

          if (!groupError && groupedWOs) {
            groupedWOs.forEach(gwo => allWorkOrderIds.add(gwo.id));
          }
        }
      }

      const finalWorkOrderIds = Array.from(allWorkOrderIds);

      const [timeRes, partsRes, notesRes, settingsRes, ordersRes, linksRes] = await Promise.all([
        supabase.from('time_entries').select('id, technician_id, work_order_id, total_hours, clock_out, status, notes, profiles:technician_id(first_name,last_name)').in('work_order_id', finalWorkOrderIds),
        supabase.from('service_parts_used').select('*').in('work_order_id', finalWorkOrderIds),
        supabase.from('job_completions').select('work_order_id,tech_notes').in('work_order_id', finalWorkOrderIds),
        supabase.from('company_settings').select('default_labor_rate,portal_invoices_enabled').maybeSingle(),
        supabase.from('work_orders').select('id,work_order_number,status,contact_id,is_billable').in('id', finalWorkOrderIds),
        supabase.from('work_order_invoice_links').select('invoice_id,work_order_id').in('work_order_id', finalWorkOrderIds),
      ]);
      for (const result of [timeRes,partsRes,notesRes,settingsRes,ordersRes,linksRes]) if (result.error) throw result.error;
      const orders = ordersRes.data || [];
      if (new Set(orders.map(w => w.contact_id)).size !== 1) throw new Error('Select work orders for one customer.');
      if (orders.some(w => w.is_billable === false)) throw new Error('A linked work order is marked nonbillable. Review its billing type.');
      setReviewOrders(orders);
      setCloseoutNotes(notesRes.data || []);
      const time = (timeRes.data || []).filter(t => !['rejected','cancelled'].includes(t.status));
      setOpenClocks(time.some(t => !t.clock_out));
      const rate = Number(settingsRes.data?.default_labor_rate || 0);
      setLaborRate(rate);
      const labor: LaborEntry[] = time.filter(t => t.clock_out).map(t => ({id:t.id,tech_user_id:t.technician_id,calculated_hours:Number(t.total_hours || 0),labor_rate:rate,labor_total:Number(t.total_hours || 0)*rate,notes:t.notes,is_billable:true,profiles:t.profiles as unknown as LaborEntry['profiles']}));
      const parts = (partsRes.data || []) as PartsUsed[];
      setLaborEntries(labor);setPartsUsed(parts);
      const actualHours = labor.reduce((sum,t) => sum + t.calculated_hours,0);
      const items: LineItem[] = [];
      if (actualHours > 0) items.push({id:crypto.randomUUID(),description:'Service labor',quantity:Math.ceil((actualHours - 1e-9)*4)/4,unit_price:rate,amount:Math.round(Math.ceil((actualHours - 1e-9)*4)/4*rate*100)/100,item_type:'labor',source:'labor'});
      parts.filter(p => !p.is_warranty && !p.warranty_item).forEach(part => items.push({id:part.id,description:part.part_name,quantity:Number(part.quantity),unit_price:Number(part.unit_price),amount:Math.round(Number(part.quantity)*Number(part.unit_price)*100)/100,item_type:'material',source:'parts',source_part_id:part.id,product_id:part.product_id,sku:part.part_sku,cost:Number(part.unit_cost),notes:part.notes || '',notes_visible_on_invoice:false}));
      const linkedInvoiceIds = [...new Set((linksRes.data || []).map(l => l.invoice_id))];
      if (linkedInvoiceIds.length > 1) throw new Error('This job is linked to multiple invoices; review its billing history.');
      if (linkedInvoiceIds.length === 1) {
        const {data: draft,error} = await supabase.from('invoices').select('*,invoice_line_items(*)').eq('id',linkedInvoiceIds[0]).single();
        if(error) throw error;
        if(draft.status !== 'draft') throw new Error('This job is already invoiced. Open its existing invoice.');
        setDraftInvoiceId(draft.id);
        setPortalVisible(draft.customer_visible_on_submit ?? true);
        setTaxRate(Number(draft.tax_rate || 0));setTaxEnvironment(draft.tax_environment);setTaxProjectType(draft.tax_project_type);
        setInvoiceDate(draft.invoice_date);setDueDate(draft.due_date || '');setNotes(draft.notes || '');
        setBilling({billing_name:draft.billing_name || '',billing_address_line1:draft.billing_address_line1 || '',billing_address_line2:draft.billing_address_line2 || '',billing_city:draft.billing_city || '',billing_state:draft.billing_state || '',billing_zip:draft.billing_zip || ''});
        const importedParts=[...items.filter(li=>li.source_part_id)];
        items.splice(0,items.length,...draft.invoice_line_items.sort((a:{sort_order:number},b:{sort_order:number})=>a.sort_order-b.sort_order).map((li:LineItem)=>({...li,quantity:Number(li.quantity),unit_price:Number(li.unit_price),amount:Number(li.amount)})));
        items.push(...importedParts.filter(part=>!items.some(li=>li.source_part_id===part.source_part_id)));
      } else setDraftInvoiceId(null);
      const firstWO = workOrders.find(wo => selectedWorkOrderIds.includes(wo.id));
      setIsTaxExempt(firstWO?.contacts?.is_tax_exempt || false);
      if (firstWO?.contacts && !linkedInvoiceIds.length) {
        setTaxRate(firstWO.contacts.tax_rate ?? 0.0935);
        setIsTaxExempt(firstWO.contacts.is_tax_exempt || false);
        const computed = computeDueDate(invoiceDate, firstWO.contacts.default_payment_terms);
        if (computed) {
          setDueDate(computed);
          setDueDateAutoSet(true);
        }
        applyContactToBilling(firstWO.contacts);
      }

      if (items.length === 0) {
        items.push({
          id: crypto.randomUUID(),
          description: 'Service Work',
          quantity: 1,
          unit_price: 0,
          amount: 0,
          source: 'manual'
        });
      }

      setLineItems(items);
      setSelectedWorkOrderIds(finalWorkOrderIds);
      setStep('review');
    } catch (error) {
      console.error('Error loading work order data:', error);
      alert(error instanceof Error ? error.message : 'Failed to load work order details');
    } finally {
      setLoading(false);
    }
  }

  function toggleWorkOrder(workOrderId: string) {
    setSelectedWorkOrderIds(prev =>
      prev.includes(workOrderId)
        ? prev.filter(id => id !== workOrderId)
        : [...prev, workOrderId]
    );
  }

  function addLineItem() {
    setLineItems([
      ...lineItems,
      { id: crypto.randomUUID(), description: '', quantity: 1, unit_price: 0, amount: 0, source: 'manual' }
    ]);
  }

  function insertLineItemAfter(afterId: string) {
    const idx = lineItems.findIndex(item => item.id === afterId);
    const newItem: LineItem = {
      id: crypto.randomUUID(),
      description: '',
      quantity: 1,
      unit_price: 0,
      amount: 0,
      source: 'manual'
    };
    const updated = [...lineItems];
    updated.splice(idx + 1, 0, newItem);
    setLineItems(updated);
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

  async function refreshCatalogParts(replace=false) {
    const {data,error} = await supabase.from('service_parts_used').select('*').in('work_order_id',selectedWorkOrderIds);
    if(error) {alert(error.message);return;}
    setPartsUsed(data || []);
    setLineItems(previous => {const prev=replace?previous.filter(li=>!li.source_part_id && li.source!=='parts'):previous;return [...prev,...(data || []).filter(p => !p.is_warranty && !p.warranty_item && !prev.some(li => li.source_part_id===p.id || li.id===p.id)).map(p=>({id:p.id,description:p.part_name,quantity:Number(p.quantity),unit_price:Number(p.unit_price),amount:Math.round(Number(p.quantity)*Number(p.unit_price)*100)/100,item_type:'material' as const,source:'parts' as const,source_part_id:p.id,product_id:p.product_id,sku:p.part_sku,cost:Number(p.unit_cost),notes:p.notes || '',notes_visible_on_invoice:false}))];});
  }

  function useLaborHours(roundUp: boolean) {
    const actual = laborEntries.reduce((sum,l)=>sum+l.calculated_hours,0);
    const quantity = roundUp ? Math.ceil((actual - 1e-9)*4)/4 : actual;
    setLineItems(prev => {const rate=prev.find(li=>li.item_type==='labor')?.unit_price ?? laborRate;return [...prev.filter(li=>li.item_type!=='labor'),{id:crypto.randomUUID(),description:'Service labor',quantity,unit_price:rate,amount:Math.round(quantity*rate*100)/100,item_type:'labor',source:'labor'}];});
  }

  function updateLineItem(id: string, field: keyof LineItem, value: any) {
    setLineItems(lineItems.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, [field]: value };
      if (field === 'quantity' || field === 'unit_price') {
        updated.amount = Math.round(Number(updated.quantity) * Number(updated.unit_price) * 100)/100;
      }
      return updated;
    }));
  }

  function toggleNotes(id: string) {
    setLineItems(lineItems.map(item =>
      item.id === id ? { ...item, showNotes: !item.showNotes } : item
    ));
  }

  useEffect(() => {
    if (preSelectedWorkOrderId && workOrders.length && !autoOpened.current) {
      autoOpened.current = true;
      loadWorkOrderData();
    }
  }, [workOrders, preSelectedWorkOrderId]);

  function toggleNoteVisibility(id: string) {
    setLineItems(lineItems.map(item =>
      item.id === id ? { ...item, notes_visible_on_invoice: !item.notes_visible_on_invoice } : item
    ));
  }

  async function handleSubmit(e: React.FormEvent, publish = true) {
    e.preventDefault();

    if (selectedWorkOrderIds.length === 0) {
      alert('Please select at least one work order');
      return;
    }

    if (lineItems.some(item => !item.description.trim())) {
      alert('Please fill in all line item descriptions');
      return;
    }

    const selectedWorkOrder = workOrders.find(wo => wo.id === selectedWorkOrderIds[0]);
    if (!selectedWorkOrder) {
      alert('Selected work order not found');
      return;
    }

    if (publish && (openClocks || reviewOrders.some(w=>w.status!=='completed'))) { alert('Clock out all technicians before billing.'); return; }
    setSubmitting(true);
    try {
      const taxResult = computeInvoiceTax({
        lineItems: lineItems.map(item => ({
          amount: item.amount,
          itemType: item.item_type ?? 'material',
          isTaxable: true,
        })),
        environment: taxEnvironment as TaxEnvironment,
        projectType: taxProjectType as TaxProjectType,
        taxRate,
        isTaxExempt,
      });

      const tax = taxResult.taxAmount;

      const selectedWO = workOrders.find(wo => selectedWorkOrderIds.includes(wo.id));
      const {data: invoiceId, error} = await supabase.rpc('save_work_order_invoice', {
        p_request_id:retryKey.current,p_work_order_ids:selectedWorkOrderIds,p_invoice_id:draftInvoiceId,p_publish:publish,p_portal:portalVisible,
        p_header:{invoice_date:invoiceDate,due_date:dueDate || invoiceDate,notes:notes || null,tax_environment:taxEnvironment,tax_project_type:taxProjectType,tax_rate:taxRate,tax_amount:tax,payment_terms:normalizePaymentTerms(selectedWO?.contacts?.default_payment_terms) || 'due_on_receipt',...billing},
        p_lines:lineItems.map(item => ({description:item.description,quantity:item.quantity,unit_price:item.unit_price,item_type:item.item_type || 'material',is_taxable:true,source_part_id:item.source_part_id || null,product_id:item.product_id || null,sku:item.sku || null,cost:item.cost ?? null,notes:item.notes || null,notes_visible_on_invoice:item.notes_visible_on_invoice || false})),
      });
      if(error) throw error;
      onSuccess(invoiceId);
      onClose();
    } catch (error) {
      console.error('Error creating invoice:', error);
      alert(error instanceof Error ? error.message : 'Failed to create invoice. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading && step === 'select') {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg p-8 max-w-md w-full">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">Loading work orders...</p>
          </div>
        </div>
      </div>
    );
  }

  const filterTabs: { key: FilterTab; label: string; count?: number }[] = [
    { key: 'ready', label: 'Ready to Bill', count: readyCount },
    { key: 'all', label: 'All', count: workOrders.length },
    { key: 'draft', label: 'Open Drafts' },
    { key: 'billed', label: 'Already Billed' },
  ];

  return (
    <div className="responsive-modal-overlay fixed inset-0 bg-black bg-opacity-50 z-50 overflow-y-auto">
      <div className="responsive-modal-layout flex min-h-full items-start justify-center p-4 sm:p-6">
      <div className="responsive-modal-panel bg-white rounded-lg shadow-xl max-w-5xl w-full my-4 sm:my-8">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Review & Invoice</h2>
            <p className="text-sm text-gray-600 mt-1">
              {step === 'select' ? 'Select service work orders to review' : 'Review and adjust invoice details'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {step === 'select' && (
          <div className="p-6">
            {workOrders.length === 0 ? (
              <div className="text-center py-12">
                <Wrench className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Service Work Orders</h3>
                <p className="text-gray-600">
                  There are no service work orders available to review.
                </p>
              </div>
            ) : (
              <>
                <div className="mb-5 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-blue-900">
                    <p className="font-medium mb-1">Select one or more work orders to include in this invoice</p>
                    <p className="text-blue-700">Labor hours and parts will be automatically pulled from the selected work orders.</p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by work order #, title, or customer..."
                      className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex gap-1 mb-4 p-1 bg-gray-100 rounded-lg w-fit">
                  {filterTabs.map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveFilter(tab.key)}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                        activeFilter === tab.key
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      {tab.key === 'ready' && <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />}
                      {tab.key === 'billed' && <FileText className="w-3.5 h-3.5 text-gray-500" />}
                      {tab.label}
                      {tab.count !== undefined && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                          activeFilter === tab.key ? 'bg-gray-100 text-gray-700' : 'bg-gray-200 text-gray-600'
                        }`}>
                          {tab.count}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {filteredWorkOrders.length === 0 ? (
                  <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-lg">
                    <Search className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-medium">
                      {searchQuery ? `No results for "${searchQuery}"` : 'No work orders in this category'}
                    </p>
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="mt-2 text-sm text-blue-600 hover:underline"
                      >
                        Clear search
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                    {filteredWorkOrders.map((wo) => {
                      const badge = getBillingBadge(wo.billing_queue_status, wo.is_billable !== false);
                      const isSelected = selectedWorkOrderIds.includes(wo.id);
                      const isAlreadyBilled = wo.billing_queue_status !== null &&
                        ['invoice_sent', 'payment_pending', 'paid', 'overdue', 'closed'].includes(wo.billing_queue_status);
                      const isReadyToBill = wo.billing_queue_status === 'ready_for_billing';
                      const customerName = wo.contacts?.contact_name ||
                        `${wo.contacts?.first_name || ''} ${wo.contacts?.last_name || ''}`.trim();

                      return (
                        <label
                          key={wo.id}
                          className={`flex items-start gap-4 p-4 border-2 rounded-lg cursor-pointer transition-all ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50'
                              : isReadyToBill
                              ? 'border-emerald-200 bg-emerald-50/40 hover:border-emerald-300'
                              : isAlreadyBilled
                              ? 'border-gray-100 bg-gray-50 opacity-70'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleWorkOrder(wo.id)}
                            className="mt-1 w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1.5">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="font-semibold text-gray-900">{wo.work_order_number}</p>
                                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${badge.className}`}>
                                    {isReadyToBill && <DollarSign className="w-3 h-3" />}
                                    {badge.label}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-600 truncate">{wo.title}</p>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {wo.billable_type && wo.billable_type !== 'billable' && (
                                  <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full capitalize">
                                    {wo.billable_type}
                                  </span>
                                )}
                                <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full capitalize">
                                  {wo.type}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-4 text-sm text-gray-500">
                              <span>
                                <span className="font-medium text-gray-700">{customerName}</span>
                              </span>
                              {wo.actual_completion_date && (
                                <span className="text-xs">
                                  Completed {new Date(wo.actual_completion_date).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}

                <div className="flex items-center justify-between pt-5 mt-5 border-t border-gray-200">
                  <p className="text-sm text-gray-500">
                    {filteredWorkOrders.length} work order{filteredWorkOrders.length !== 1 ? 's' : ''} shown
                    {selectedWorkOrderIds.length > 0 && (
                      <span className="ml-2 font-medium text-blue-600">
                        · {selectedWorkOrderIds.length} selected
                      </span>
                    )}
                  </p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={loadWorkOrderData}
                      disabled={selectedWorkOrderIds.length === 0}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                    >
                      Continue ({selectedWorkOrderIds.length} selected)
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {step === 'review' && (
          <form onSubmit={e => handleSubmit(e,false)} className="p-6 space-y-6">
            <section className="rounded-lg border border-gray-200 p-4 space-y-3">
              <h3 className="font-semibold text-gray-900">Job closeout · {reviewOrders.length} work order(s)</h3>
              <p className="text-sm text-gray-600">{reviewOrders.map(w=>w.work_order_number).join(', ')}</p>
              {closeoutNotes.map((n,i)=><p key={i} className="text-sm text-gray-700 whitespace-pre-wrap">{reviewOrders.find(w=>w.id===n.work_order_id)?.work_order_number}: {n.tech_notes}</p>)}
              <div className="flex flex-wrap gap-3 text-sm"><strong>Actual labor: {laborEntries.reduce((sum,l)=>sum+l.calculated_hours,0).toFixed(2)} hours</strong><strong>Billable labor: {lineItems.filter(li=>li.item_type==='labor').reduce((sum,li)=>sum+Number(li.quantity),0).toFixed(2)} hours</strong></div>
              <details><summary className="min-h-11 cursor-pointer text-sm">Time by technician</summary>{laborEntries.map(l=><p key={l.id} className="text-sm">{[l.profiles?.first_name,l.profiles?.last_name].filter(Boolean).join(' ') || 'Technician'}: {l.calculated_hours.toFixed(2)} hours</p>)}</details>
              {reviewOrders.some(w=>w.status!=='completed') && <p className="text-amber-800">Work is still in progress. Save an open draft and submit once all linked work orders are complete.</p>}
              <details><summary className="cursor-pointer text-sm text-gray-600">Update imported parts</summary><p className="text-xs text-gray-500 py-2">Parts load automatically. Use this only to replace imported part lines with the latest work-order quantities and prices; invoice edits to those lines will be replaced.</p><button type="button" className="text-sm text-blue-700 underline" onClick={()=>refreshCatalogParts(true)}>Refresh Parts from Work Orders</button></details>
              {openClocks && <p role="alert" className="text-red-700">A technician is still clocked in. You can save an open draft; clock out before submitting.</p>}
              <div className="flex flex-wrap gap-2"><button type="button" onClick={()=>useLaborHours(false)} className="min-h-11 px-3 border rounded-lg text-sm">Use Actual</button><button type="button" onClick={()=>useLaborHours(true)} className="min-h-11 px-3 border rounded-lg text-sm">Round Up to ¼ Hour</button><button type="button" onClick={()=>setAddPartsTo(selectedWorkOrderIds[0])} className="min-h-11 px-3 border rounded-lg text-sm">+ Catalog Parts</button></div>
              <p className="text-xs text-gray-500">Actual time stays unchanged. Edit billable hours and invoice lines below. Technician notes stay internal unless you include them.</p>
            </section>


            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Environment *
                </label>
                <select
                  value={taxEnvironment}
                  onChange={(e) => setTaxEnvironment(e.target.value as 'residential' | 'commercial')}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="residential">Residential</option>
                  <option value="commercial">Commercial</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Project Type *
                </label>
                <select
                  value={taxProjectType}
                  onChange={(e) => setTaxProjectType(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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

              <div className="col-span-2">
                <TaxRulesBadge
                  taxEnvironment={taxEnvironment}
                  taxProjectType={taxProjectType}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Invoice Date *
                </label>
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Due Date
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => { setDueDate(e.target.value); setDueDateAutoSet(false); }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {dueDateAutoSet && (() => {
                  const firstWO = workOrders.find(wo => selectedWorkOrderIds.includes(wo.id));
                  const termsLabel = formatTermsLabel(firstWO?.contacts?.default_payment_terms);
                  return termsLabel ? (
                    <p className="mt-1 text-xs text-blue-500">Auto-calculated based on {termsLabel}</p>
                  ) : null;
                })()}
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Bill To</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                  <input
                    type="text"
                    value={billing.billing_name}
                    onChange={(e) => setBilling(b => ({ ...b, billing_name: e.target.value }))}
                    placeholder="Recipient name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Address Line 1</label>
                  <input
                    type="text"
                    value={billing.billing_address_line1}
                    onChange={(e) => setBilling(b => ({ ...b, billing_address_line1: e.target.value }))}
                    placeholder="Street address"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Address Line 2</label>
                  <input
                    type="text"
                    value={billing.billing_address_line2}
                    onChange={(e) => setBilling(b => ({ ...b, billing_address_line2: e.target.value }))}
                    placeholder="Suite, unit, etc. (optional)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">City</label>
                  <input
                    type="text"
                    value={billing.billing_city}
                    onChange={(e) => setBilling(b => ({ ...b, billing_city: e.target.value }))}
                    placeholder="City"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">State</label>
                    <input
                      type="text"
                      value={billing.billing_state}
                      onChange={(e) => setBilling(b => ({ ...b, billing_state: e.target.value }))}
                      placeholder="State"
                      maxLength={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">ZIP</label>
                    <input
                      type="text"
                      value={billing.billing_zip}
                      onChange={(e) => setBilling(b => ({ ...b, billing_zip: e.target.value }))}
                      placeholder="ZIP"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-gray-900">Line Items</h3>
                <button
                  type="button"
                  onClick={addLineItem}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4" />
                  Add Item
                </button>
              </div>

              <div className="space-y-2">
                {lineItems.map((item, index) => (
                  <div key={item.id} className="border border-gray-200 rounded-lg">
                    <div className="flex gap-2 items-center p-3">
                      <div className="flex flex-col gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => moveLineItemUp(item.id)}
                          disabled={index === 0}
                          className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-20 disabled:cursor-not-allowed"
                          title="Move up"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveLineItemDown(item.id)}
                          disabled={index === lineItems.length - 1}
                          className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-20 disabled:cursor-not-allowed"
                          title="Move down"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <span className="text-xs text-gray-400 w-4 text-center shrink-0 select-none">{index + 1}</span>
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-12 gap-2">
                        <div className="sm:col-span-5">
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                            placeholder="Description"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                          />
                          {item.source && item.source !== 'manual' && (
                            <p className="text-xs text-gray-500 mt-0.5">
                              {item.source === 'labor' && <><Clock className="w-3 h-3 inline mr-1" />From labor</>}
                              {item.source === 'parts' && <><Package className="w-3 h-3 inline mr-1" />From parts</>}
                            </p>
                          )}
                        </div>
                        <div className="grid grid-cols-3 gap-2 sm:contents">
                          <div className="sm:col-span-2">
                            <label className="block sm:hidden text-xs text-gray-500 mb-1">Qty</label>
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => updateLineItem(item.id, 'quantity', Number(e.target.value))}
                              placeholder="Qty"
                              min="0"
                              step="0.01"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block sm:hidden text-xs text-gray-500 mb-1">Unit Price</label>
                            <input
                              type="number"
                              value={item.unit_price}
                              onChange={(e) => updateLineItem(item.id, 'unit_price', Number(e.target.value))}
                              placeholder="Price"
                              min="0"
                              step="0.01"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                            />
                          </div>
                          <div className="sm:col-span-3">
                            <label className="block sm:hidden text-xs text-gray-500 mb-1">Amount</label>
                            <input
                              type="text"
                              value={formatCurrency(item.amount)}
                              readOnly
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700 font-medium text-sm"
                            />
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleNotes(item.id)}
                        className={`p-1.5 rounded transition-colors shrink-0 ${item.showNotes ? 'text-blue-600 bg-blue-50' : 'text-gray-400 hover:text-blue-500 hover:bg-gray-100'}`}
                        title="Toggle notes"
                      >
                        <StickyNote className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => insertLineItemAfter(item.id)}
                        className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-gray-100 rounded transition-colors shrink-0"
                        title="Insert row below"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeLineItem(item.id)}
                        disabled={lineItems.length === 1}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    {item.showNotes && (
                      <div className="px-3 pb-3 space-y-2 border-t border-gray-100 pt-2">
                        <textarea
                          value={item.notes || ''}
                          onChange={(e) => updateLineItem(item.id, 'notes', e.target.value)}
                          placeholder="Line item notes..."
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => toggleNoteVisibility(item.id)}
                          className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${
                            item.notes_visible_on_invoice
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-gray-100 text-gray-500 border border-gray-200 hover:text-gray-700'
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

              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex justify-end">
                  <div className="w-64 space-y-2">
                    {(() => {
                      const taxResult = computeInvoiceTax({
                        lineItems: lineItems.map(item => ({
                          amount: item.amount,
                          itemType: item.item_type ?? 'material',
                          isTaxable: true,
                        })),
                        environment: taxEnvironment as TaxEnvironment,
                        projectType: taxProjectType as TaxProjectType,
                        taxRate,
                        isTaxExempt,
                      });
                      return (
                        <>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Subtotal:</span>
                            <span className="font-medium text-gray-900">{formatCurrency(taxResult.subtotal)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Tax ({(taxRate * 100).toFixed(2)}%):</span>
                            <span className="font-medium text-gray-900">{formatCurrency(taxResult.taxAmount)}</span>
                          </div>
                          <div className="flex justify-between pt-2 border-t border-gray-200">
                            <span className="font-semibold text-gray-900">Total:</span>
                            <span className="text-xl font-bold text-gray-900">{formatCurrency(taxResult.total)}</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Add any additional notes for the customer..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={portalVisible} onChange={e=>setPortalVisible(e.target.checked)} />Customer-visible invoice (portal and notification on submission)</label>
            <p className="text-xs text-gray-500">Unchecked means internal only: submitted and locked, with no portal access or customer notification. Drafts are always private. Customer-visible submission queues the customer notification automatically; email delivery and online-payment readiness appear on the invoice.</p>
            <div className="flex flex-wrap gap-3 justify-end pt-4 border-t border-gray-200">
              <button type="button" disabled={submitting} onClick={e=>handleSubmit(e,false)} className="min-h-11 px-4 py-2 border rounded-lg">Save Open Draft</button>
              {!preSelectedWorkOrderId && <button
                type="button"
                onClick={() => setStep('select')}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Change Work Orders
              </button>}
              <button
                type="button"
                onClick={e => handleSubmit(e,true)}
                disabled={submitting || openClocks || reviewOrders.some(w=>w.status!=='completed')}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                {submitting ? 'Saving...' : 'Submit Invoice'}
              </button>
            </div>
          </form>
        )}
      </div>
      </div>
    {addPartsTo && <AddPartsModal workOrderId={addPartsTo} onClose={()=>setAddPartsTo(null)} onSuccess={()=>{setAddPartsTo(null);refreshCatalogParts();}} />}
    </div>
  );
}
