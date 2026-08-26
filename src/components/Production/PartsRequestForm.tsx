import { useState, useEffect, useCallback } from 'react';
import { X, Search, Trash2, Package, ShoppingCart, Wrench, ClipboardList, Calendar, Target, Layers, User } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { SearchableCombobox, ComboboxOption } from '../Shared/SearchableCombobox';

interface Product {
  id: string;
  name: string;
  sku: string;
  model_number?: string;
  vendor: string;
  current_stock: number;
  unit_price: number;
  default_vendor_id?: string;
  vendor_id?: string;
  default_vendor?: { vendor_name: string };
  vendors?: { vendor_name: string };
}

interface RequestItem {
  product_id?: string;
  product_name: string;
  model_number: string;
  vendor: string;
  quantity: number;
  assigned_to?: string;
  notes?: string;
  unit_price?: number;
}

interface PartsRequestFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

type SourceType = 'sales_order' | 'work_order' | 'service_request' | 'general';
type TargetMode = 'single' | 'multi';

export function PartsRequestForm({ onClose, onSuccess }: PartsRequestFormProps) {
  const { user, profile } = useAuth();
  const [targetMode, setTargetMode] = useState<TargetMode>('single');
  const [sourceType, setSourceType] = useState<SourceType>('general');
  const [customerContactId, setCustomerContactId] = useState('');
  const [workOrderId, setWorkOrderId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [salesOrderId, setSalesOrderId] = useState('');
  const [serviceRequestId, setServiceRequestId] = useState('');
  const [officeId, setOfficeId] = useState('');
  const [assignedTo, setAssignedTo] = useState(user?.id || '');
  const [priority, setPriority] = useState<'normal' | 'urgent'>('normal');
  const [dateNeeded, setDateNeeded] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<RequestItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [customerOptions, setCustomerOptions] = useState<ComboboxOption[]>([]);
  const [customerRecords, setCustomerRecords] = useState<{
    salesOrders: ComboboxOption[];
    workOrders: ComboboxOption[];
    projects: ComboboxOption[];
    serviceRequests: ComboboxOption[];
  }>({ salesOrders: [], workOrders: [], projects: [], serviceRequests: [] });
  const [salesOrderLineItems, setSalesOrderLineItems] = useState<any[]>([]);
  const [selectedLineItems, setSelectedLineItems] = useState<Set<string>>(new Set());
  const [offices, setOffices] = useState<ComboboxOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [notificationRecipients, setNotificationRecipients] = useState<any[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  useEffect(() => {
    loadUsers();
    loadOffices();
    loadNotificationRecipients();
  }, []);

  useEffect(() => {
    if (searchTerm.length >= 2) {
      searchProducts();
    } else {
      setSearchResults([]);
    }
  }, [searchTerm]);

  useEffect(() => {
    if (sourceType !== 'general' && targetMode === 'single') {
      loadCustomersForType(sourceType);
    }
  }, [sourceType, targetMode]);

  useEffect(() => {
    if (customerContactId && targetMode === 'single') {
      loadCustomerRecords(customerContactId, sourceType);
    } else {
      setCustomerRecords({ salesOrders: [], workOrders: [], projects: [], serviceRequests: [] });
    }
  }, [customerContactId, sourceType, targetMode]);

  useEffect(() => {
    if (salesOrderId) {
      loadSalesOrderLineItems(salesOrderId);
    } else {
      setSalesOrderLineItems([]);
      setSelectedLineItems(new Set());
    }
  }, [salesOrderId]);

  const loadNotificationRecipients = async () => {
    const { data } = await supabase
      .from('product_request_settings')
      .select('notification_role, notification_user_id, user:profiles!product_request_settings_notification_user_id_fkey(first_name, last_name)')
      .eq('is_active', true);
    if (data) setNotificationRecipients(data);
  };

  const loadUsers = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .order('first_name');
    if (data) setUsers(data);
  };

  const loadOffices = async () => {
    const { data } = await supabase
      .from('company_offices')
      .select('id, office_name')
      .order('display_order');
    if (data) setOffices(data.map((o: any) => ({ id: o.id, label: o.office_name })));
  };

  const loadCustomersForType = useCallback(async (type: SourceType) => {
    setLoadingCustomers(true);
    try {
      let query;
      if (type === 'sales_order') {
        query = supabase
          .from('sales_orders')
          .select('id, order_number, contact:contacts!sales_orders_contact_id_fkey(id, first_name, last_name, company_name)')
          .in('status', ['pending', 'approved', 'active'])
          .not('contact_id', 'is', null)
          .order('order_number', { ascending: false });
      } else if (type === 'work_order') {
        query = supabase
          .from('work_orders')
          .select('id, wo_number, contact_id, contact:contacts!work_orders_contact_id_fkey(id, first_name, last_name, company_name), project:projects(id, project_name)')
          .in('status', ['assigned', 'in_progress'])
          .order('wo_number', { ascending: false });
      } else if (type === 'service_request') {
        query = supabase
          .from('service_requests')
          .select('id, customer_name, contact_id, contact:contacts!service_requests_contact_id_fkey(id, first_name, last_name, company_name)')
          .order('created_at', { ascending: false });
      } else {
        query = supabase
          .from('contacts')
          .select('id, first_name, last_name, company_name')
          .in('contact_type', ['customer', 'person', 'lead'])
          .order('first_name');
      }

      const { data, error } = await query;
      if (error) throw error;

      const seen = new Set<string>();
      const opts: ComboboxOption[] = [];

      if (type === 'work_order' && data) {
        for (const row of data as any[]) {
          const c = row.contact;
          if (c && c.id && !seen.has(c.id)) {
            seen.add(c.id);
            const name = `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.company_name || 'Unknown';
            opts.push({ id: c.id, label: name, sublabel: c.company_name });
          }
          const p = row.project;
          if (p && p.id && !seen.has(p.id)) {
            // Projects don't have contact_id directly accessible here, skip
          }
        }
      } else if (type === 'service_request' && data) {
        for (const row of data as any[]) {
          const c = row.contact;
          if (c && c.id && !seen.has(c.id)) {
            seen.add(c.id);
            const name = `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.company_name || row.customer_name || 'Unknown';
            opts.push({ id: c.id, label: name, sublabel: c.company_name || row.customer_name });
          }
          if (!c && row.customer_name && !seen.has(`name:${row.customer_name}`)) {
            seen.add(`name:${row.customer_name}`);
            opts.push({ id: `name:${row.customer_name}`, label: row.customer_name, sublabel: 'No linked contact' });
          }
        }
      } else if (data) {
        for (const row of data as any[]) {
          const id = row.id || row.contact?.id;
          if (id && !seen.has(id)) {
            seen.add(id);
            const name = `${row.first_name || row.contact?.first_name || ''} ${row.last_name || row.contact?.last_name || ''}`.trim() || row.company_name || row.contact?.company_name || 'Unknown';
            opts.push({ id, label: name, sublabel: row.company_name || row.contact?.company_name || (type === 'sales_order' ? `SO: ${row.order_number}` : undefined) });
          }
        }
      }

      setCustomerOptions(opts);
    } catch (error) {
      console.error('Error loading customers:', error);
      setCustomerOptions([]);
    } finally {
      setLoadingCustomers(false);
    }
  }, []);

  const loadCustomerRecords = useCallback(async (contactId: string, type: SourceType) => {
    try {
      if (type === 'sales_order') {
        const { data } = await supabase
          .from('sales_orders')
          .select('id, order_number, status, contact:contacts!sales_orders_contact_id_fkey(first_name, last_name, company_name)')
          .in('status', ['pending', 'approved', 'active'])
          .eq('contact_id', contactId)
          .order('order_number', { ascending: false });
        setCustomerRecords({
          salesOrders: (data || []).map((so: any) => ({
            id: so.id,
            label: so.order_number,
            sublabel: `${so.contact?.first_name || ''} ${so.contact?.last_name || ''}`.trim() || so.contact?.company_name || '',
          })),
          workOrders: [], projects: [], serviceRequests: [],
        });
      } else if (type === 'work_order') {
        const [woRes, projRes] = await Promise.all([
          supabase
            .from('work_orders')
            .select('id, wo_number, project:projects(project_name, project_number)')
            .in('status', ['assigned', 'in_progress'])
            .eq('contact_id', contactId)
            .order('wo_number', { ascending: false }),
          supabase
            .from('projects')
            .select('id, project_name, project_number')
            .in('status', ['active', 'pending'])
            .eq('contact_id', contactId)
            .order('project_number', { ascending: false }),
        ]);
        setCustomerRecords({
          salesOrders: [],
          workOrders: (woRes.data || []).map((wo: any) => ({
            id: wo.id,
            label: wo.wo_number,
            sublabel: wo.project?.project_name,
          })),
          projects: (projRes.data || []).map((p: any) => ({
            id: p.id,
            label: `${p.project_number} - ${p.project_name}`,
          })),
          serviceRequests: [],
        });
      } else if (type === 'service_request') {
        const { data } = await supabase
          .from('service_requests')
          .select('id, customer_name, job_description')
          .eq('contact_id', contactId)
          .order('created_at', { ascending: false });
        setCustomerRecords({
          salesOrders: [], workOrders: [], projects: [],
          serviceRequests: (data || []).map((sr: any) => ({
            id: sr.id,
            label: sr.customer_name,
            sublabel: sr.job_description?.slice(0, 50),
          })),
        });
      }
    } catch (error) {
      console.error('Error loading customer records:', error);
    }
  }, []);

  const loadSalesOrderLineItems = async (soId: string) => {
    const { data: so } = await supabase
      .from('sales_orders')
      .select('proposal_id')
      .eq('id', soId)
      .maybeSingle();
    if (!so?.proposal_id) { setSalesOrderLineItems([]); return; }
    const { data } = await supabase
      .from('proposal_line_items')
      .select('id, product_id, description, quantity, unit_price, line_total, product:products(name, sku, vendor, default_vendor_id, vendor_id, default_vendor:vendors!products_default_vendor_id_fkey(vendor_name), vendors:vendors!products_vendor_id_fkey(vendor_name))')
      .eq('proposal_id', so.proposal_id)
      .order('sort_order');
    if (data) setSalesOrderLineItems(data);
  };

  const searchProducts = async () => {
    const { data } = await supabase
      .from('products')
      .select('*, default_vendor:vendors!products_default_vendor_id_fkey(vendor_name), vendors:vendors!products_vendor_id_fkey(vendor_name)')
      .or(`name.ilike.%${searchTerm}%,sku.ilike.%${searchTerm}%,vendor.ilike.%${searchTerm}%,model_number.ilike.%${searchTerm}%`)
      .limit(10);
    if (data) setSearchResults(data);
  };

  const addItemFromProduct = (product: Product) => {
    const vendorName = product.default_vendor?.vendor_name || product.vendors?.vendor_name || product.vendor || '';
    setItems([...items, {
      product_id: product.id, product_name: product.name,
      model_number: product.sku || product.model_number || '', vendor: vendorName,
      quantity: 1, unit_price: product.unit_price,
    }]);
    setSearchTerm(''); setSearchResults([]);
  };

  const addItemsFromSalesOrder = () => {
    const newItems: RequestItem[] = [];
    salesOrderLineItems.forEach((li) => {
      if (selectedLineItems.has(li.id)) {
        const product = li.product as any;
        const vendorName = product?.default_vendor?.vendor_name || product?.vendors?.vendor_name || product?.vendor || '';
        newItems.push({
          product_id: li.product_id || undefined,
          product_name: li.description || product?.name || '',
          model_number: product?.sku || product?.model_number || '',
          vendor: vendorName, quantity: parseInt(String(li.quantity)) || 1,
          unit_price: parseFloat(String(li.unit_price)) || 0,
        });
      }
    });
    setItems([...items, ...newItems]);
    setSelectedLineItems(new Set());
  };

  const addCustomItem = () => {
    setItems([...items, { product_name: '', model_number: '', vendor: '', quantity: 1 }]);
  };

  const updateItem = (index: number, field: keyof RequestItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const toggleLineItem = (id: string) => {
    const next = new Set(selectedLineItems);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedLineItems(next);
  };

  const selectAllLineItems = () => {
    if (selectedLineItems.size === salesOrderLineItems.length) setSelectedLineItems(new Set());
    else setSelectedLineItems(new Set(salesOrderLineItems.map((li: any) => li.id)));
  };

  const switchTargetMode = (mode: TargetMode) => {
    if (mode === targetMode) return;
    setTargetMode(mode);
    setItems([]);
    setSelectedLineItems(new Set());
    setCustomerContactId('');
    setSalesOrderId(''); setWorkOrderId(''); setProjectId(''); setServiceRequestId('');
    setCustomerRecords({ salesOrders: [], workOrders: [], projects: [], serviceRequests: [] });
  };

  const handleSourceTypeChange = (type: SourceType) => {
    setSourceType(type);
    setItems([]);
    setSelectedLineItems(new Set());
    setCustomerContactId('');
    setSalesOrderId(''); setWorkOrderId(''); setProjectId(''); setServiceRequestId('');
    setCustomerRecords({ salesOrders: [], workOrders: [], projects: [], serviceRequests: [] });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) { alert('Add at least one item'); return; }

    if (targetMode === 'single' && sourceType !== 'general') {
      if (!customerContactId) { alert('Please select a customer'); return; }
      if (sourceType === 'sales_order' && !salesOrderId) { alert('Please select a Sales Order'); return; }
      if (sourceType === 'work_order' && !workOrderId && !projectId) { alert('Please select a Project or Work Order'); return; }
      if (sourceType === 'service_request' && !serviceRequestId) { alert('Please select a Service Request'); return; }
    }

    setSubmitting(true);
    try {
      const insertData: any = {
        requested_by: user?.id,
        request_type: sourceType === 'general' ? 'stock' : 'job',
        work_order_id: sourceType === 'work_order' ? (workOrderId || null) : null,
        project_id: sourceType === 'work_order' ? (projectId || null) : null,
        sales_order_id: sourceType === 'sales_order' ? salesOrderId : null,
        service_request_id: sourceType === 'service_request' ? serviceRequestId : null,
        customer_contact_id: customerContactId || null,
        office_id: officeId || null,
        assigned_to: sourceType === 'general' ? (assignedTo || null) : null,
        priority, status: 'pending',
        date_needed: dateNeeded || null, notes,
      };

      const { data: request, error: requestError } = await supabase
        .from('product_requests').insert(insertData).select().single();
      if (requestError) throw requestError;

      const itemsToInsert = items.map(item => ({
        request_id: request.id,
        product_id: item.product_id || null,
        product_name: item.product_name, model_number: item.model_number,
        vendor: item.vendor, quantity_requested: item.quantity,
        assigned_to: item.assigned_to || null, notes: item.notes || null,
        estimated_cost: item.unit_price ? item.unit_price * item.quantity : null,
      }));

      const { error: itemsError } = await supabase
        .from('product_request_items').insert(itemsToInsert);
      if (itemsError) throw itemsError;

      const recipientUserIds: string[] = [];
      for (const recipient of notificationRecipients) {
        if (recipient.notification_user_id) recipientUserIds.push(recipient.notification_user_id);
        else if (recipient.notification_role) {
          const { data: roleUsers } = await supabase.from('profiles').select('id').eq('role', recipient.notification_role);
          if (roleUsers) recipientUserIds.push(...roleUsers.map((u: any) => u.id));
        }
      }

      if (recipientUserIds.length > 0) {
        const sourceLabel = sourceType === 'sales_order' ? 'Sales Order' : sourceType === 'work_order' ? 'Work Order' : sourceType === 'service_request' ? 'Service Request' : 'General';
        await supabase.from('tasks').insert({
          title: `Product Request #${request.id.slice(0, 8)} - ${sourceLabel}`,
          description: `${items.length} item(s) requested by ${profile?.first_name} ${profile?.last_name}\n\n${notes}`,
          assigned_to: recipientUserIds[0], priority: priority === 'urgent' ? 'high' : 'medium',
          status: 'pending', created_by: user?.id,
          related_entity_type: 'product_request', related_entity_id: request.id,
        });
        await supabase.from('notifications').insert(recipientUserIds.map(userId => ({
          user_id: userId, type: 'product_request', title: 'New Product Request',
          message: `${profile?.first_name} ${profile?.last_name} submitted a ${sourceLabel} request with ${items.length} item(s)`,
          related_id: request.id,
        })));
      }

      alert('Product request submitted successfully!');
      onSuccess();
    } catch (error: any) {
      console.error('Error submitting product request:', error);
      alert(`Error submitting request: ${error.message || 'Unknown error'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const sourceOptions: { value: SourceType; label: string; icon: any }[] = [
    { value: 'sales_order', label: 'Sales Order', icon: ShoppingCart },
    { value: 'work_order', label: 'Work Order', icon: Wrench },
    { value: 'service_request', label: 'Service Request', icon: ClipboardList },
    { value: 'general', label: 'General / Stock', icon: Package },
  ];

  const userOptions: ComboboxOption[] = users.map(u => ({
    id: u.id, label: `${u.first_name} ${u.last_name}`,
  }));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full my-4 sm:my-8 max-h-[96vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <div className="sticky top-0 bg-white flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 z-10">
            <div className="flex-1 min-w-0 pr-2">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 truncate">New Product Request</h2>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">Request products for one or multiple targets</p>
            </div>
            <button type="button" onClick={onClose} className="flex-shrink-0 p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
            {/* Target Mode Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Where is this going? *</label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => switchTargetMode('single')}
                  className={`flex items-center gap-2 p-3 rounded-lg border-2 transition-all text-left ${targetMode === 'single' ? 'border-blue-600 bg-blue-50 text-blue-900' : 'border-gray-200 hover:border-gray-300 text-gray-700'}`}>
                  <Target className={`w-5 h-5 ${targetMode === 'single' ? 'text-blue-600' : 'text-gray-400'}`} />
                  <div><div className="text-sm font-medium">Single Target</div><div className="text-xs text-gray-500">All items for one source</div></div>
                </button>
                <button type="button" onClick={() => switchTargetMode('multi')}
                  className={`flex items-center gap-2 p-3 rounded-lg border-2 transition-all text-left ${targetMode === 'multi' ? 'border-blue-600 bg-blue-50 text-blue-900' : 'border-gray-200 hover:border-gray-300 text-gray-700'}`}>
                  <Layers className={`w-5 h-5 ${targetMode === 'multi' ? 'text-blue-600' : 'text-gray-400'}`} />
                  <div><div className="text-sm font-medium">Multi-Target</div><div className="text-xs text-gray-500">Each item tagged separately</div></div>
                </button>
              </div>
            </div>

            {/* SINGLE TARGET: Source Type + Customer + Record */}
            {targetMode === 'single' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Request Source *</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {sourceOptions.map((opt) => {
                      const Icon = opt.icon;
                      const active = sourceType === opt.value;
                      return (
                        <button key={opt.value} type="button" onClick={() => handleSourceTypeChange(opt.value)}
                          className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all text-center ${active ? 'border-blue-600 bg-blue-50 text-blue-900' : 'border-gray-200 hover:border-gray-300 text-gray-700'}`}>
                          <Icon className={`w-5 h-5 ${active ? 'text-blue-600' : 'text-gray-400'}`} />
                          <span className="text-xs sm:text-sm font-medium">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Customer Picker (filtered by source type) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {sourceType === 'general' ? 'Customer (optional - for billing later)' : 'Customer *'}
                  </label>
                  {loadingCustomers ? (
                    <div className="px-3 py-2 text-sm text-gray-500">Loading customers...</div>
                  ) : (
                    <SearchableCombobox
                      options={customerOptions}
                      value={customerContactId}
                      onChange={setCustomerContactId}
                      placeholder={sourceType === 'general' ? 'Type to search customers...' : 'Type to search customers with open records...'}
                      emptyMessage={sourceType === 'general' ? 'No customers found' : 'No customers with open records of this type'}
                      required={sourceType !== 'general'}
                    />
                  )}
                  {sourceType !== 'general' && customerOptions.length === 0 && !loadingCustomers && (
                    <p className="text-xs text-amber-600 mt-1">No customers with open {sourceType === 'sales_order' ? 'sales orders' : sourceType === 'work_order' ? 'work orders' : 'service requests'} found.</p>
                  )}
                </div>

                {/* Specific Record Pickers (appear after customer is selected) */}
                {customerContactId && sourceType === 'sales_order' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Sales Order *</label>
                    <SearchableCombobox options={customerRecords.salesOrders} value={salesOrderId} onChange={setSalesOrderId} placeholder="Select sales order..." required />
                    {salesOrderId && salesOrderLineItems.length > 0 && (
                      <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden">
                        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700">Line Items ({salesOrderLineItems.length})</span>
                          <button type="button" onClick={selectAllLineItems} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                            {selectedLineItems.size === salesOrderLineItems.length ? 'Deselect All' : 'Select All'}
                          </button>
                        </div>
                        <div className="divide-y divide-gray-200 max-h-48 overflow-y-auto">
                          {salesOrderLineItems.map((li: any) => {
                            const product = li.product as any;
                            const vendorName = product?.default_vendor?.vendor_name || product?.vendors?.vendor_name || product?.vendor || 'N/A';
                            return (
                              <label key={li.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer">
                                <input type="checkbox" checked={selectedLineItems.has(li.id)} onChange={() => toggleLineItem(li.id)} className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-gray-900">{li.description || product?.name || 'N/A'}</div>
                                  <div className="text-xs text-gray-500 mt-0.5">{product?.sku || 'N/A'} - {vendorName} - Qty: {li.quantity}</div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                        {selectedLineItems.size > 0 && (
                          <div className="px-4 py-2 bg-blue-50 border-t border-gray-200">
                            <button type="button" onClick={addItemsFromSalesOrder} className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                              + Add {selectedLineItems.size} selected item(s) to request
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {customerContactId && sourceType === 'work_order' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Project</label>
                      <SearchableCombobox options={customerRecords.projects} value={projectId} onChange={setProjectId} placeholder="Select project..." />
                      {customerRecords.projects.length === 0 && <p className="text-xs text-amber-600 mt-1">No open projects for this customer.</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Work Order</label>
                      <SearchableCombobox options={customerRecords.workOrders} value={workOrderId} onChange={setWorkOrderId} placeholder="Select work order..." />
                      {customerRecords.workOrders.length === 0 && <p className="text-xs text-amber-600 mt-1">No open work orders for this customer.</p>}
                    </div>
                    {!projectId && !workOrderId && <p className="text-xs text-red-600 md:col-span-2">Required: select a Project or Work Order</p>}
                  </div>
                )}

                {customerContactId && sourceType === 'service_request' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Service Request *</label>
                    <SearchableCombobox options={customerRecords.serviceRequests} value={serviceRequestId} onChange={setServiceRequestId} placeholder="Select service request..." required />
                    {customerRecords.serviceRequests.length === 0 && <p className="text-xs text-amber-600 mt-1">No service requests for this customer.</p>}
                  </div>
                )}

                {sourceType === 'general' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Assign To</label>
                    <SearchableCombobox options={userOptions} value={assignedTo} onChange={setAssignedTo} placeholder="Select team member..." />
                  </div>
                )}
              </>
            )}

            {/* MULTI TARGET: Info banner */}
            {targetMode === 'multi' && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-3">
                <Layers className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-amber-900">Multi-Target Mode</div>
                  <div className="text-xs text-amber-700 mt-0.5">Each item below has its own source selector. Tag every item with where it's going before submitting.</div>
                </div>
              </div>
            )}

            {/* Office Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Office</label>
              <SearchableCombobox options={offices} value={officeId} onChange={setOfficeId} placeholder="No specific office" />
            </div>

            {/* Priority and Date Needed */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Priority</label>
                <select value={priority} onChange={e => setPriority(e.target.value as any)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm">
                  <option value="normal">Normal</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date Needed</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input type="date" value={dateNeeded} onChange={e => setDateNeeded(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm" />
                </div>
              </div>
            </div>

            {/* Product Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Search Products</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search by name, model number, or vendor..." className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm" />
              </div>
              {searchResults.length > 0 && (
                <div className="mt-2 border border-gray-200 rounded-lg divide-y max-h-48 overflow-y-auto">
                  {searchResults.map(product => {
                    const vendorName = product.default_vendor?.vendor_name || product.vendors?.vendor_name || product.vendor || 'No vendor';
                    const modelNumber = product.sku || product.model_number || 'N/A';
                    return (
                      <button key={product.id} type="button" onClick={() => addItemFromProduct(product)} className="w-full px-3 sm:px-4 py-2 text-left hover:bg-gray-50 transition-colors">
                        <div className="font-medium text-gray-900 text-sm break-words">{product.name}</div>
                        <div className="text-xs text-gray-600 break-words">{modelNumber} - {vendorName} - Stock: {product.current_stock || 0}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Items List */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-gray-700">Items ({items.length})</label>
                <button type="button" onClick={addCustomItem} className="text-sm text-blue-600 hover:text-blue-700 font-medium">+ Add Custom Item</button>
              </div>
              {items.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
                  <Package className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-600 text-sm">No items added yet</p>
                  <p className="text-gray-500 text-xs mt-1">{targetMode === 'single' && sourceType === 'sales_order' ? 'Select line items from the sales order above, or search for products' : 'Search for products or add custom items'}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {items.map((item, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-3 sm:p-4">
                      <div className="flex items-start gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <input type="text" value={item.product_name} onChange={e => updateItem(index, 'product_name', e.target.value)} placeholder="Product name *" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm" required />
                        </div>
                        <button type="button" onClick={() => removeItem(index)} className="flex-shrink-0 p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        <input type="text" value={item.model_number} onChange={e => updateItem(index, 'model_number', e.target.value)} placeholder="Model #" className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm" />
                        <input type="text" value={item.vendor} onChange={e => updateItem(index, 'vendor', e.target.value)} placeholder="Vendor" className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm" />
                        <input type="number" min="1" value={item.quantity} onChange={e => updateItem(index, 'quantity', parseInt(e.target.value) || 1)} placeholder="Qty *" className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm" required />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Additional details, delivery instructions, etc..." className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm" />
            </div>
          </div>

          <div className="sticky bottom-0 bg-white flex gap-2 sm:gap-3 p-4 sm:p-6 border-t border-gray-200">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium">Cancel</button>
            <button type="submit" disabled={submitting || items.length === 0} className="flex-1 bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm font-medium">
              {submitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
