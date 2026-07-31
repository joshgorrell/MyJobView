import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Package, Clock, CheckCircle, XCircle, FileText, User, Search, Bell, X, RefreshCw, ShoppingCart, Wrench, ClipboardList, Briefcase, Building2, ExternalLink, Filter, Calendar } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency } from '../../lib/utils';
import { PartsRequestForm } from './PartsRequestForm';
import { ChangeVendorModal } from './ChangeVendorModal';
import ConfirmModal from '../ui/ConfirmModal';

interface ProductRequest {
  id: string;
  requested_by: string;
  request_type: string;
  work_order_id: string | null;
  project_id: string | null;
  sales_order_id: string | null;
  service_request_id: string | null;
  office_id: string | null;
  assigned_to: string | null;
  priority: string;
  status: string;
  notes: string;
  created_at: string;
  date_needed: string | null;
  requester: {
    first_name: string;
    last_name: string;
  } | null;
  work_order?: {
    wo_number: string;
  } | null;
  project?: {
    project_name: string;
  } | null;
  sales_order?: {
    order_number: string;
    contact: { first_name: string; last_name: string; company_name: string } | null;
  } | null;
  service_request?: {
    customer_name: string;
    job_description: string;
  } | null;
  office?: {
    office_name: string;
  } | null;
  items: Array<{
    id: string;
    product_name: string;
    model_number: string;
    vendor: string;
    quantity_requested: number;
    quantity_approved: number | null;
    estimated_cost: number | null;
    purchase_order_id: string | null;
    ordered_status: string | null;
    ordered_quantity: number | null;
  }> | null;
}

type MainTab = 'open' | 'fulfilled';
type ViewMode = 'requests' | 'vendors' | 'job';

const OPEN_STATUSES = ['pending', 'approved'];
const FULFILLED_STATUSES = ['po_created', 'ordered', 'received', 'rejected'];

export function PartsRequestManagement() {
  const { user, profile } = useAuth();
  const [requests, setRequests] = useState<ProductRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showChangeVendor, setShowChangeVendor] = useState(false);
  const [mainTab, setMainTab] = useState<MainTab>('open');
  const [viewMode, setViewMode] = useState<ViewMode>('requests');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterOffice, setFilterOffice] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<ProductRequest | null>(null);
  const [notificationSettings, setNotificationSettings] = useState<any[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [offices, setOffices] = useState<any[]>([]);

  const canManage = profile?.role === 'admin' ||
                    ['office_manager', 'purchasing', 'service_manager', 'production_manager'].includes(profile?.role || '');

  useEffect(() => {
    loadRequests();
    loadOffices();
    if (canManage) loadNotificationSettings();
  }, []);

  const loadRequests = async () => {
    try {
      let query = supabase
        .from('product_requests')
        .select(`
          *,
          requester:profiles!product_requests_requested_by_fkey(first_name, last_name),
          work_order:work_orders(wo_number),
          project:projects(project_name),
          sales_order:sales_orders(order_number, contact:contacts(first_name, last_name, company_name)),
          service_request:service_requests(customer_name, job_description),
          office:company_offices(office_name),
          items:product_request_items(*)
        `)
        .order('created_at', { ascending: false });

      if (!canManage) {
        query = query.eq('requested_by', user?.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setRequests((data || []) as ProductRequest[]);
    } catch (error) {
      console.error('Error loading requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadOffices = async () => {
    const { data } = await supabase
      .from('company_offices')
      .select('id, office_name')
      .order('display_order');
    if (data) setOffices(data);
  };

  const loadNotificationSettings = async () => {
    const { data } = await supabase
      .from('product_request_settings')
      .select(`
        *,
        user:profiles!product_request_settings_notification_user_id_fkey(first_name, last_name, email)
      `)
      .order('created_at');
    if (data) setNotificationSettings(data || []);
  };

  const updateRequestStatus = async (requestId: string, status: string) => {
    try {
      const { error } = await supabase
        .from('product_requests')
        .update({ status })
        .eq('id', requestId);
      if (error) throw error;
      await loadRequests();
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const getSourceIcon = (req: ProductRequest) => {
    if (req.sales_order_id) return <ShoppingCart className="w-4 h-4 text-blue-600" />;
    if (req.work_order_id) return <Wrench className="w-4 h-4 text-amber-600" />;
    if (req.service_request_id) return <ClipboardList className="w-4 h-4 text-green-600" />;
    return <Package className="w-4 h-4 text-gray-500" />;
  };

  const getSourceLabel = (req: ProductRequest): string => {
    if (req.sales_order_id) return 'Sales Order';
    if (req.work_order_id) return 'Work Order';
    if (req.service_request_id) return 'Service Request';
    return 'General / Stock';
  };

  const getCustomerName = (req: ProductRequest): string => {
    if (req.sales_order?.contact) {
      const c = req.sales_order.contact;
      return `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.company_name || '';
    }
    if (req.service_request?.customer_name) return req.service_request.customer_name;
    if (req.project?.project_name) return req.project.project_name;
    return '';
  };

  const getSourceRef = (req: ProductRequest): string => {
    if (req.sales_order?.order_number) return req.sales_order.order_number;
    if (req.work_order?.wo_number) return req.work_order.wo_number;
    if (req.service_request_id) return req.service_request_id.slice(0, 8);
    return '';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'approved': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'rejected': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'po_created': return <FileText className="w-4 h-4 text-blue-500" />;
      case 'ordered': return <Package className="w-4 h-4 text-blue-600" />;
      case 'received': return <CheckCircle className="w-4 h-4 text-green-600" />;
      default: return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const openRequests = useMemo(
    () => requests.filter(r => OPEN_STATUSES.includes(r.status)),
    [requests]
  );
  const fulfilledRequests = useMemo(
    () => requests.filter(r => FULFILLED_STATUSES.includes(r.status)),
    [requests]
  );

  const filteredOpen = useMemo(() => {
    return openRequests.filter(req => {
      const matchesType = filterType === 'all' ||
        (filterType === 'sales_order' && req.sales_order_id) ||
        (filterType === 'work_order' && req.work_order_id) ||
        (filterType === 'service_request' && req.service_request_id) ||
        (filterType === 'general' && !req.sales_order_id && !req.work_order_id && !req.service_request_id);
      const matchesOffice = filterOffice === 'all' || req.office_id === filterOffice;
      const search = searchTerm.toLowerCase();
      const matchesSearch = !search ||
        (req.requester?.first_name || '').toLowerCase().includes(search) ||
        (req.requester?.last_name || '').toLowerCase().includes(search) ||
        getCustomerName(req).toLowerCase().includes(search) ||
        (req.work_order?.wo_number || '').toLowerCase().includes(search) ||
        (req.sales_order?.order_number || '').toLowerCase().includes(search) ||
        (req.items || []).some(item =>
          (item.product_name || '').toLowerCase().includes(search) ||
          (item.model_number || '').toLowerCase().includes(search)
        );
      return matchesType && matchesOffice && matchesSearch;
    });
  }, [openRequests, filterType, filterOffice, searchTerm]);

  const filteredFulfilled = useMemo(() => {
    return fulfilledRequests.filter(req => {
      const matchesType = filterType === 'all' ||
        (filterType === 'sales_order' && req.sales_order_id) ||
        (filterType === 'work_order' && req.work_order_id) ||
        (filterType === 'service_request' && req.service_request_id) ||
        (filterType === 'general' && !req.sales_order_id && !req.work_order_id && !req.service_request_id);
      const matchesOffice = filterOffice === 'all' || req.office_id === filterOffice;
      const search = searchTerm.toLowerCase();
      const matchesSearch = !search ||
        (req.requester?.first_name || '').toLowerCase().includes(search) ||
        (req.requester?.last_name || '').toLowerCase().includes(search) ||
        getCustomerName(req).toLowerCase().includes(search) ||
        (req.items || []).some(item =>
          (item.product_name || '').toLowerCase().includes(search) ||
          (item.model_number || '').toLowerCase().includes(search)
        );
      return matchesType && matchesOffice && matchesSearch;
    });
  }, [fulfilledRequests, filterType, filterOffice, searchTerm]);

  // Vendor grouping for open requests only
  const itemsByVendor = useMemo(() => {
    const grouped: Record<string, Array<{
      itemId: string;
      requestId: string;
      requestNumber: string;
      productName: string;
      modelNumber: string;
      vendor: string;
      quantityRequested: number;
      estimatedCost: number | null;
      requester: string;
      createdAt: string;
      priority: string;
      customerName: string;
      sourceLabel: string;
    }>> = {};

    filteredOpen.forEach(request => {
      (request.items || []).forEach(item => {
        const vendor = item.vendor || 'Unknown Vendor';
        if (!grouped[vendor]) grouped[vendor] = [];
        grouped[vendor].push({
          itemId: item.id,
          requestId: request.id,
          requestNumber: request.id.slice(0, 8),
          productName: item.product_name,
          modelNumber: item.model_number,
          vendor: item.vendor || '',
          quantityRequested: item.quantity_requested,
          estimatedCost: item.estimated_cost,
          requester: `${request.requester?.first_name || ''} ${request.requester?.last_name || ''}`.trim(),
          createdAt: request.created_at,
          priority: request.priority,
          customerName: getCustomerName(request),
          sourceLabel: getSourceLabel(request),
        });
      });
    });

    return grouped;
  }, [filteredOpen]);

  // Job grouping for open requests only
  const itemsByJob = useMemo(() => {
    const grouped: Record<string, Array<{
      itemId: string;
      requestId: string;
      requestNumber: string;
      productName: string;
      modelNumber: string;
      vendor: string;
      quantityRequested: number;
      estimatedCost: number | null;
      requester: string;
      createdAt: string;
      priority: string;
      customerName: string;
      sourceLabel: string;
      dateNeeded: string | null;
    }>> = {};

    filteredOpen.forEach(request => {
      const jobKey = getJobKey(request);
      if (!grouped[jobKey]) grouped[jobKey] = [];
      (request.items || []).forEach(item => {
        grouped[jobKey].push({
          itemId: item.id,
          requestId: request.id,
          requestNumber: request.id.slice(0, 8),
          productName: item.product_name,
          modelNumber: item.model_number,
          vendor: item.vendor || '',
          quantityRequested: item.quantity_requested,
          estimatedCost: item.estimated_cost,
          requester: `${request.requester?.first_name || ''} ${request.requester?.last_name || ''}`.trim(),
          createdAt: request.created_at,
          priority: request.priority,
          customerName: getCustomerName(request),
          sourceLabel: getSourceLabel(request),
          dateNeeded: request.date_needed,
        });
      });
    });

    return grouped;
  }, [filteredOpen]);

  const getJobKey = (req: ProductRequest): string => {
    if (req.sales_order?.order_number) return `SO-${req.sales_order.order_number}`;
    if (req.work_order?.wo_number) return `WO-${req.work_order.wo_number}`;
    if (req.project?.project_number) return `PROJ-${req.project.project_number}`;
    if (req.service_request_id) return `SR-${req.service_request_id.slice(0, 8)}`;
    return 'General / Stock';
  };

  // Deep-link auto-open: if requestId is in the URL, auto-expand that request
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestId = params.get('requestId');
    if (requestId && filteredOpen.length > 0) {
      const found = filteredOpen.find(r => r.id === requestId);
      if (found) {
        setSelectedRequest(found);
      }
    }
  }, [filteredOpen]);

  const toggleItemSelection = (itemId: string) => {
    const next = new Set(selectedItems);
    if (next.has(itemId)) next.delete(itemId);
    else next.add(itemId);
    setSelectedItems(next);
  };

  const selectAllVendorItems = (vendor: string) => {
    const vendorItems = itemsByVendor[vendor] || [];
    const next = new Set(selectedItems);
    const allSelected = vendorItems.every(item => next.has(item.itemId));
    if (allSelected) {
      vendorItems.forEach(item => next.delete(item.itemId));
    } else {
      vendorItems.forEach(item => next.add(item.itemId));
    }
    setSelectedItems(next);
  };

  const selectAllJobItems = (jobKey: string) => {
    const jobItems = itemsByJob[jobKey] || [];
    const next = new Set(selectedItems);
    const allSelected = jobItems.every(item => next.has(item.itemId));
    if (allSelected) {
      jobItems.forEach(item => next.delete(item.itemId));
    } else {
      jobItems.forEach(item => next.add(item.itemId));
    }
    setSelectedItems(next);
  };

  const resolveVendorId = async (vendorName: string): Promise<string | null> => {
    if (!vendorName) return null;
    const { data } = await supabase
      .from('vendors')
      .select('id')
      .ilike('vendor_name', vendorName)
      .limit(1)
      .maybeSingle();
    return data?.id || null;
  };

  const createPurchaseOrder = async (request: ProductRequest) => {
    try {
      const reqItems = request.items || [];
      const vendors = [...new Set(reqItems.map(i => i.vendor).filter(Boolean))];
      if (vendors.length > 1) {
        alert(`This request has items from ${vendors.length} different vendors. A purchase order can only be for one vendor. Please use the By Vendor view to create separate POs per vendor.`);
        return;
      }

      const vendorName = vendors[0] || '';
      const vendorId = await resolveVendorId(vendorName);
      if (!vendorId) {
        alert(`Could not find vendor "${vendorName}" in the vendor database. Please add the vendor first or use the By Vendor view.`);
        return;
      }

      const { data: warehouse } = await supabase
        .from('warehouses')
        .select('id')
        .limit(1)
        .maybeSingle();
      if (!warehouse) {
        alert('No warehouse found. Please create a warehouse first.');
        return;
      }

      const totalCost = reqItems.reduce((sum, item) => sum + (item.estimated_cost || 0), 0);
      const customerName = getCustomerName(request);
      const officeName = request.office?.office_name || 'N/A';

      const { data: po, error: poError } = await supabase
        .from('purchase_orders')
        .insert({
          vendor_id: vendorId,
          warehouse_id: warehouse.id,
          total: totalCost,
          status: 'draft',
          notes: `Generated from Parts Request #${request.id.slice(0, 8)}\nSource: ${getSourceLabel(request)}${getSourceRef(request) ? ` (${getSourceRef(request)})` : ''}\nCustomer: ${customerName || 'N/A'}\nOffice: ${officeName}\n\n${request.notes || ''}`,
          created_by: user?.id
        })
        .select()
        .single();

      if (poError) throw poError;

      const poItems = reqItems.map(item => ({
        po_id: po.id,
        product_id: item.product_id || null,
        product_name: item.product_name,
        model_number: item.model_number,
        vendor: item.vendor,
        quantity: item.quantity_approved || item.quantity_requested,
        unit_price: item.estimated_cost && item.quantity_requested ? item.estimated_cost / item.quantity_requested : 0,
        total_price: item.estimated_cost || 0,
        product_request_item_id: item.id
      }));

      const { error: itemsError } = await supabase
        .from('po_items')
        .insert(poItems);
      if (itemsError) throw itemsError;

      // Update each request item individually with its own quantity
      for (const item of reqItems) {
        await supabase
          .from('product_request_items')
          .update({
            purchase_order_id: po.id,
            ordered_status: 'ordered',
            ordered_quantity: item.quantity_approved || item.quantity_requested
          })
          .eq('id', item.id);
      }

      await updateRequestStatus(request.id, 'po_created');
      alert(`Purchase Order ${po.po_number} created successfully!`);
    } catch (error: any) {
      console.error('Error creating PO:', error);
      alert(`Error creating purchase order: ${error.message || 'Unknown error'}`);
    }
  };

  const createPOFromSelected = async (itemsToUse?: any[]) => {
    const itemsData = itemsToUse || [];

    if (itemsData.length === 0) {
      if (selectedItems.size === 0) {
        alert('Please select at least one item');
        return;
      }
      Object.values(itemsByVendor).forEach(items => {
        items.forEach(item => {
          if (selectedItems.has(item.itemId)) itemsData.push(item);
        });
      });
    }

    if (itemsData.length === 0) {
      alert('No items to create PO');
      return;
    }

    const vendors = [...new Set(itemsData.map((item: any) => item.vendor).filter(Boolean))];
    if (vendors.length > 1) {
      alert(`Selected items span ${vendors.length} vendors. A purchase order can only be for one vendor. Please select items from a single vendor.`);
      return;
    }

    try {
      const vendorName = vendors[0] || '';
      const vendorId = await resolveVendorId(vendorName);
      if (!vendorId) {
        alert(`Could not find vendor "${vendorName}" in the vendor database. Please add the vendor first.`);
        return;
      }

      const { data: warehouse } = await supabase
        .from('warehouses')
        .select('id')
        .limit(1)
        .maybeSingle();
      if (!warehouse) {
        alert('No warehouse found. Please create a warehouse first.');
        return;
      }

      const totalCost = itemsData.reduce((sum, item) => sum + (item.estimatedCost || 0), 0);

      const { data: po, error: poError } = await supabase
        .from('purchase_orders')
        .insert({
          vendor_id: vendorId,
          warehouse_id: warehouse.id,
          total: totalCost,
          status: 'draft',
          notes: `Combined PO from ${itemsData.length} product request items across ${new Set(itemsData.map((i: any) => i.requestId)).size} request(s)`,
          created_by: user?.id
        })
        .select()
        .single();

      if (poError) throw poError;

      const poItems = itemsData.map((item: any) => ({
        po_id: po.id,
        product_id: item.productId || null,
        product_name: item.productName,
        model_number: item.modelNumber || null,
        vendor: item.vendor || null,
        quantity: item.quantityRequested,
        unit_price: item.estimatedCost && item.quantityRequested ? item.estimatedCost / item.quantityRequested : 0,
        total_price: item.estimatedCost || 0,
        product_request_item_id: item.itemId
      }));

      const { error: itemsError } = await supabase
        .from('po_items')
        .insert(poItems);
      if (itemsError) throw itemsError;

      // Update each item individually with its own quantity
      for (const item of itemsData) {
        await supabase
          .from('product_request_items')
          .update({
            purchase_order_id: po.id,
            ordered_status: 'ordered',
            ordered_quantity: item.quantityRequested
          })
          .eq('id', item.itemId);
      }

      // Update each affected request: if all items are now ordered, set status to po_created
      const requestIds = [...new Set(itemsData.map((item: any) => item.requestId))];
      for (const reqId of requestIds) {
        const { data: reqItems } = await supabase
          .from('product_request_items')
          .select('id, ordered_status')
          .eq('request_id', reqId);
        const allOrdered = (reqItems || []).every(i => i.ordered_status === 'ordered');
        if (allOrdered) {
          await supabase.from('product_requests').update({ status: 'po_created' }).eq('id', reqId);
        }
      }

      alert(`Purchase Order ${po.po_number} created with ${itemsData.length} items!`);
      setSelectedItems(new Set());
      await loadRequests();
    } catch (error: any) {
      console.error('Error creating PO:', error);
      alert(`Error creating purchase order: ${error.message}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading requests...</div>
      </div>
    );
  }

  const activeList = mainTab === 'open' ? filteredOpen : filteredFulfilled;

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Product Requests</h2>
            <p className="text-sm sm:text-base text-gray-600 mt-1">
              {canManage ? 'Manage and fulfill product requests' : 'Request products for jobs, stock, or vans'}
            </p>
          </div>
          <div className="flex gap-2">
            {canManage && (
              <button
                onClick={() => setShowSettings(true)}
                className="inline-flex items-center justify-center gap-2 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
              >
                <Bell className="w-4 h-4" />
                <span className="hidden sm:inline">Notifications</span>
              </button>
            )}
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              New Request
            </button>
          </div>
        </div>

        {/* Main Tabs */}
        <div className="flex gap-2 mb-6 border-b border-gray-200">
          <button
            onClick={() => { setMainTab('open'); setViewMode('requests'); setSelectedItems(new Set()); }}
            className={`px-4 py-2 font-medium text-sm sm:text-base border-b-2 transition-colors ${
              mainTab === 'open'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Open Requests ({openRequests.length})
          </button>
          <button
            onClick={() => { setMainTab('fulfilled'); setViewMode('requests'); setSelectedItems(new Set()); }}
            className={`px-4 py-2 font-medium text-sm sm:text-base border-b-2 transition-colors ${
              mainTab === 'fulfilled'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Fulfilled / Ordered ({fulfilledRequests.length})
          </button>
        </div>

        {/* View Mode Toggle (open tab only, managers only) */}
        {mainTab === 'open' && canManage && (
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => { setViewMode('requests'); setSelectedItems(new Set()); }}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors text-sm ${
                viewMode === 'requests' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              By Request
            </button>
            <button
              onClick={() => { setViewMode('vendors'); setSelectedItems(new Set()); }}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors text-sm ${
                viewMode === 'vendors' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              By Vendor
            </button>
            <button
              onClick={() => { setViewMode('job'); setSelectedItems(new Set()); }}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors text-sm ${
                viewMode === 'job' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              By Job
            </button>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="flex-1 min-w-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by customer, product, requester..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="all">All Sources</option>
            <option value="sales_order">Sales Order</option>
            <option value="work_order">Work Order</option>
            <option value="service_request">Service Request</option>
            <option value="general">General / Stock</option>
          </select>
          <select
            value={filterOffice}
            onChange={(e) => setFilterOffice(e.target.value)}
            className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="all">All Offices</option>
            {offices.map((o) => (
              <option key={o.id} value={o.id}>{o.office_name}</option>
            ))}
          </select>
        </div>

        {/* Selected items action bar (vendor and job view) */}
        {mainTab === 'open' && (viewMode === 'vendors' || viewMode === 'job') && canManage && selectedItems.size > 0 && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="text-sm text-blue-900">
              <strong>{selectedItems.size}</strong> item(s) selected
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowChangeVendor(true)}
                className="flex items-center gap-2 bg-white border border-blue-600 text-blue-600 px-4 py-2 rounded-lg hover:bg-blue-50 transition-colors font-medium text-sm"
              >
                <RefreshCw className="w-4 h-4" />
                Change Vendor
              </button>
              <button
                onClick={() => createPOFromSelected()}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
              >
                Create PO for Selected
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        {mainTab === 'open' && viewMode === 'vendors' && canManage ? (
          // Vendor view
          Object.keys(itemsByVendor).length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No open items</h3>
              <p className="text-gray-600">All product requests have been processed</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(itemsByVendor)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([vendor, items]) => {
                  const totalCost = items.reduce((sum, item) => sum + (item.estimatedCost || 0), 0);
                  const allSelected = items.every(item => selectedItems.has(item.itemId));
                  const someSelected = items.some(item => selectedItems.has(item.itemId));
                  return (
                    <div key={vendor} className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
                            onChange={() => selectAllVendorItems(vendor)}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <div>
                            <h3 className="font-semibold text-gray-900">{vendor}</h3>
                            <p className="text-sm text-gray-600">
                              {items.length} item(s) - Est. Total: {formatCurrency(totalCost)}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => createPOFromSelected(items)}
                          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors font-medium"
                        >
                          Create PO
                        </button>
                      </div>
                      <div className="divide-y divide-gray-200">
                        {items.map(item => (
                          <div key={item.itemId} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={selectedItems.has(item.itemId)}
                                onChange={() => toggleItemSelection(item.itemId)}
                                className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-gray-900 text-sm">{item.productName}</div>
                                <div className="text-sm text-gray-600 mt-0.5">Model: {item.modelNumber || 'N/A'}</div>
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
                                  <span>Request #{item.requestNumber}</span>
                                  <span>Qty: {item.quantityRequested}</span>
                                  {item.estimatedCost ? <span>Cost: {formatCurrency(item.estimatedCost)}</span> : null}
                                  <span>By: {item.requester}</span>
                                  {item.customerName && <span>Customer: {item.customerName}</span>}
                                  <span className="text-blue-600">{item.sourceLabel}</span>
                                  {item.priority === 'urgent' && (
                                    <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">URGENT</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
            </div>
          )
        ) : mainTab === 'open' && viewMode === 'job' && canManage ? (
          // Job view
          Object.keys(itemsByJob).length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No open items</h3>
              <p className="text-gray-600">All product requests have been processed</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(itemsByJob)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([jobKey, items]) => {
                  const totalCost = items.reduce((sum, item) => sum + (item.estimatedCost || 0), 0);
                  const allSelected = items.every(item => selectedItems.has(item.itemId));
                  const someSelected = items.some(item => selectedItems.has(item.itemId));
                  const earliestDate = items.map(i => i.dateNeeded).filter(Boolean).sort()[0];
                  return (
                    <div key={jobKey} className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
                            onChange={() => selectAllJobItems(jobKey)}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <div>
                            <h3 className="font-semibold text-gray-900">{jobKey}</h3>
                            <p className="text-sm text-gray-600">
                              {items.length} item(s) - Est. Total: {formatCurrency(totalCost)}
                              {items[0]?.customerName && ` - ${items[0].customerName}`}
                              {earliestDate && <span className="ml-2 text-amber-600 font-medium">Needed by {new Date(earliestDate).toLocaleDateString()}</span>}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="divide-y divide-gray-200">
                        {items.map(item => (
                          <div key={item.itemId} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={selectedItems.has(item.itemId)}
                                onChange={() => toggleItemSelection(item.itemId)}
                                className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-gray-900 text-sm">{item.productName}</div>
                                <div className="text-sm text-gray-600 mt-0.5">
                                  Model: {item.modelNumber || 'N/A'} - Vendor: {item.vendor || 'N/A'}
                                </div>
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-gray-500">
                                  <span>Request #{item.requestNumber}</span>
                                  <span>Qty: {item.quantityRequested}</span>
                                  {item.estimatedCost ? <span>Cost: {formatCurrency(item.estimatedCost)}</span> : null}
                                  <span>By: {item.requester}</span>
                                  <span className="text-blue-600">{item.sourceLabel}</span>
                                  {item.priority === 'urgent' && (
                                    <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">URGENT</span>
                                  )}
                                  {item.dateNeeded && (
                                    <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
                                      <Calendar className="w-3 h-3" />
                                      {new Date(item.dateNeeded).toLocaleDateString()}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
            </div>
          )
        ) : activeList.length === 0 ? (
          // Empty state
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {mainTab === 'open' ? 'No open requests' : 'No fulfilled requests yet'}
            </h3>
            <p className="text-gray-600 mb-4">
              {mainTab === 'open' ? 'Create a product request to get started' : 'Ordered and received requests will appear here'}
            </p>
            {mainTab === 'open' && (
              <button
                onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-5 h-5" />
                Create Request
              </button>
            )}
          </div>
        ) : (
          // Request list
          <div className="space-y-3">
            {activeList.map((request) => {
              const customer = getCustomerName(request);
              const sourceRef = getSourceRef(request);
              return (
                <div
                  key={request.id}
                  className="border border-gray-200 rounded-lg p-3 sm:p-4 hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer"
                  onClick={() => setSelectedRequest(request)}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
                    <div className="flex items-start gap-2 sm:gap-3 min-w-0">
                      {getStatusIcon(request.status)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900 text-sm sm:text-base">
                            Request #{request.id.slice(0, 8)}
                          </span>
                          {request.priority === 'urgent' && (
                            <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-medium">URGENT</span>
                          )}
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                            {getSourceIcon(request)}
                            {getSourceLabel(request)}
                            {sourceRef && <span className="font-medium">- {sourceRef}</span>}
                          </span>
                        </div>
                        <div className="text-xs sm:text-sm text-gray-600 mt-1">
                          {(request.items || []).length} item(s)
                          {customer && <> - {customer}</>}
                          {request.date_needed && (
                            <span className="ml-2 inline-flex items-center gap-1 text-amber-600 font-medium">
                              <Calendar className="w-3 h-3" />
                              Needed by {new Date(request.date_needed).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-left sm:text-right flex-shrink-0">
                      <div className="text-xs sm:text-sm font-medium text-gray-900 capitalize">
                        {request.status.replace('_', ' ')}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {new Date(request.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm text-gray-600">
                    <div className="flex items-center gap-1">
                      <User className="w-3 h-3 sm:w-4 sm:h-4" />
                      <span className="truncate">{request.requester?.first_name || 'Unknown'} {request.requester?.last_name || ''}</span>
                    </div>
                    {request.office?.office_name && (
                      <div className="flex items-center gap-1">
                        <Building2 className="w-3 h-3 sm:w-4 sm:h-4" />
                        <span>{request.office.office_name}</span>
                      </div>
                    )}
                  </div>

                  {(request.items || []).slice(0, 2).map((item) => (
                    <div key={item.id} className="mt-2 text-xs sm:text-sm text-gray-600 bg-gray-50 rounded px-3 py-2 break-words">
                      {item.product_name} ({item.model_number || 'N/A'}) x {item.quantity_requested}
                      {item.estimated_cost ? ` - ${formatCurrency(item.estimated_cost)}` : ''}
                      {item.ordered_status === 'ordered' && (
                        <span className="ml-2 text-blue-600 font-medium">Ordered</span>
                      )}
                    </div>
                  ))}
                  {(request.items || []).length > 2 && (
                    <div className="mt-2 text-xs sm:text-sm text-gray-500">
                      + {(request.items || []).length - 2} more item(s)
                    </div>
                  )}

                  {/* Admin actions for open requests */}
                  {canManage && mainTab === 'open' && request.status === 'pending' && (
                    <div className="mt-3 pt-3 border-t border-gray-200 flex flex-col sm:flex-row gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); updateRequestStatus(request.id, 'approved'); }}
                        className="flex-1 px-3 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 font-medium"
                      >
                        Approve
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); createPurchaseOrder(request); }}
                        className="flex-1 px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 font-medium"
                      >
                        Create PO
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); updateRequestStatus(request.id, 'rejected'); }}
                        className="flex-1 px-3 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700 font-medium"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                  {canManage && mainTab === 'open' && request.status === 'approved' && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <button
                        onClick={(e) => { e.stopPropagation(); createPurchaseOrder(request); }}
                        className="w-full px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 font-medium"
                      >
                        Create Purchase Order
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      {showForm && (
        <PartsRequestForm
          onClose={() => setShowForm(false)}
          onSuccess={() => { setShowForm(false); loadRequests(); }}
        />
      )}

      {showSettings && canManage && (
        <ProductRequestSettingsModal
          onClose={() => setShowSettings(false)}
          onSuccess={() => { setShowSettings(false); loadNotificationSettings(); }}
          settings={notificationSettings}
        />
      )}

      {selectedRequest && (
        <RequestDetailModal
          request={selectedRequest}
          onClose={() => setSelectedRequest(null)}
          canManage={canManage}
          onApprove={() => { updateRequestStatus(selectedRequest.id, 'approved'); setSelectedRequest(null); }}
          onReject={() => { updateRequestStatus(selectedRequest.id, 'rejected'); setSelectedRequest(null); }}
          onCreatePO={() => { createPurchaseOrder(selectedRequest); setSelectedRequest(null); }}
        />
      )}

      {showChangeVendor && (
        <ChangeVendorModal
          selectedItemIds={Array.from(selectedItems)}
          onClose={() => setShowChangeVendor(false)}
          onSuccess={async () => { await loadRequests(); setSelectedItems(new Set()); }}
        />
      )}
    </div>
  );
}

// --- Request Detail Modal ---

function RequestDetailModal({ request, onClose, canManage, onApprove, onReject, onCreatePO }: {
  request: ProductRequest;
  onClose: () => void;
  canManage: boolean;
  onApprove: () => void;
  onReject: () => void;
  onCreatePO: () => void;
}) {
  const customer = (() => {
    if (request.sales_order?.contact) {
      const c = request.sales_order.contact;
      return `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.company_name || '';
    }
    if (request.service_request?.customer_name) return request.service_request.customer_name;
    if (request.project?.project_name) return request.project.project_name;
    return '';
  })();

  const sourceRef = request.sales_order?.order_number || request.work_order?.wo_number || (request.service_request_id ? request.service_request_id.slice(0, 8) : '');
  const isOpen = OPEN_STATUSES.includes(request.status);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white p-6 border-b border-gray-200 z-10">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Request #{request.id.slice(0, 8)}
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Created {new Date(request.created_at).toLocaleString()}
              </p>
            </div>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Source & Customer */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Source:</span>
              <span className="ml-2 font-medium">{getSourceLabel(request)}{sourceRef && ` (${sourceRef})`}</span>
            </div>
            <div>
              <span className="text-gray-500">Status:</span>
              <span className="ml-2 font-medium capitalize">{request.status.replace('_', ' ')}</span>
            </div>
            <div>
              <span className="text-gray-500">Requested By:</span>
              <span className="ml-2 font-medium">
                {request.requester?.first_name || 'Unknown'} {request.requester?.last_name || ''}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Priority:</span>
              <span className="ml-2 font-medium capitalize">{request.priority}</span>
            </div>
            {customer && (
              <div>
                <span className="text-gray-500">Customer:</span>
                <span className="ml-2 font-medium">{customer}</span>
              </div>
            )}
            {request.office?.office_name && (
              <div>
                <span className="text-gray-500">Office:</span>
                <span className="ml-2 font-medium">{request.office.office_name}</span>
              </div>
            )}
          </div>

          {/* Notes */}
          {request.notes && (
            <div>
              <div className="text-sm font-medium text-gray-700 mb-2">Notes</div>
              <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">{request.notes}</div>
            </div>
          )}

          {/* Items */}
          <div>
            <div className="text-sm font-medium text-gray-700 mb-3">
              Items ({(request.items || []).length})
            </div>
            <div className="space-y-2">
              {(request.items || []).map((item) => (
                <div key={item.id} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900">{item.product_name}</div>
                      <div className="text-sm text-gray-600 mt-1">
                        Model: {item.model_number || 'N/A'} - Vendor: {item.vendor || 'N/A'}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        Quantity: {item.quantity_requested}
                        {item.estimated_cost ? ` - Est. Cost: ${formatCurrency(item.estimated_cost)}` : ''}
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      {item.ordered_status === 'ordered' && (
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">Ordered</span>
                      )}
                      {item.ordered_status === 'received' && (
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium">Received</span>
                      )}
                    </div>
                  </div>
                  {item.purchase_order_id && (
                    <div className="mt-2 text-xs text-blue-600 flex items-center gap-1">
                      <ExternalLink className="w-3 h-3" />
                      PO #{item.purchase_order_id.slice(0, 8)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        {canManage && isOpen && (
          <div className="sticky bottom-0 bg-white p-6 border-t border-gray-200 flex flex-col sm:flex-row gap-2">
            {request.status === 'pending' && (
              <>
                <button
                  onClick={onApprove}
                  className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm"
                >
                  Approve
                </button>
                <button
                  onClick={onCreatePO}
                  className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
                >
                  Create PO
                </button>
                <button
                  onClick={onReject}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium text-sm"
                >
                  Reject
                </button>
              </>
            )}
            {request.status === 'approved' && (
              <button
                onClick={onCreatePO}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
              >
                Create Purchase Order
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Settings Modal (unchanged) ---

function ProductRequestSettingsModal({ onClose, onSuccess, settings }: {
  onClose: () => void;
  onSuccess: () => void;
  settings: any[];
}) {
  const [notificationRole, setNotificationRole] = useState('');
  const [notificationUserId, setNotificationUserId] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteSettingId, setConfirmDeleteSettingId] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email, role')
      .order('first_name');
    if (data) setUsers(data);
  };

  const handleAddSetting = async () => {
    if (!notificationRole && !notificationUserId) {
      alert('Please select either a role or a specific user');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('product_request_settings')
        .insert({
          notification_role: notificationRole || null,
          notification_user_id: notificationUserId || null,
          is_active: true
        });
      if (error) throw error;
      setNotificationRole('');
      setNotificationUserId('');
      onSuccess();
    } catch (error: any) {
      alert(`Error adding notification: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSetting = async (id: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('product_request_settings')
        .update({ is_active: !isActive })
        .eq('id', id);
      if (error) throw error;
      onSuccess();
    } catch (error) {
      console.error('Error toggling setting:', error);
    }
  };

  const handleDeleteSetting = async (id: string) => {
    try {
      const { error } = await supabase
        .from('product_request_settings')
        .delete()
        .eq('id', id);
      if (error) throw error;
      onSuccess();
    } catch (error) {
      console.error('Error deleting setting:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Product Request Notifications</h3>
              <p className="text-sm text-gray-600 mt-1">Configure who receives alerts when new requests are submitted</p>
            </div>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 mb-2">Add Notification Recipient</h4>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notify by Role</label>
                <select
                  value={notificationRole}
                  onChange={(e) => { setNotificationRole(e.target.value); setNotificationUserId(''); }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a role...</option>
                  <option value="admin">Admin</option>
                  <option value="office_manager">Office Manager</option>
                  <option value="purchasing">Purchasing</option>
                  <option value="service_manager">Service Manager</option>
                  <option value="production_manager">Production Manager</option>
                </select>
              </div>
              <div className="text-center text-gray-500 text-sm">OR</div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notify Specific User</label>
                <select
                  value={notificationUserId}
                  onChange={(e) => { setNotificationUserId(e.target.value); setNotificationRole(''); }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a user...</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.first_name} {u.last_name} - {u.role}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleAddSetting}
                disabled={saving || (!notificationRole && !notificationUserId)}
                className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
              >
                {saving ? 'Adding...' : 'Add Recipient'}
              </button>
            </div>
          </div>

          <div>
            <h4 className="font-medium text-gray-900 mb-3">Current Recipients ({settings.length})</h4>
            {settings.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No notification recipients configured</div>
            ) : (
              <div className="space-y-2">
                {settings.map(setting => (
                  <div key={setting.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Bell className={`w-5 h-5 ${setting.is_active ? 'text-blue-600' : 'text-gray-400'}`} />
                      <div>
                        <div className="font-medium text-gray-900">
                          {setting.notification_role
                            ? <span className="capitalize">{setting.notification_role.replace('_', ' ')}</span>
                            : <span>{setting.user?.first_name} {setting.user?.last_name}</span>}
                        </div>
                        <div className="text-sm text-gray-600">
                          {setting.notification_role ? 'All users with this role' : setting.user?.email}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleSetting(setting.id, setting.is_active)}
                        className={`px-3 py-1 rounded text-sm font-medium ${
                          setting.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {setting.is_active ? 'Active' : 'Inactive'}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteSettingId(setting.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded"
                      >
                        <XCircle className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-gray-200">
          <button onClick={onClose} className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium">
            Close
          </button>
        </div>

        <ConfirmModal
          isOpen={!!confirmDeleteSettingId}
          title="Remove Recipient"
          message="Remove this notification recipient?"
          variant="danger"
          confirmLabel="Remove"
          onConfirm={() => {
            if (confirmDeleteSettingId) {
              const id = confirmDeleteSettingId;
              setConfirmDeleteSettingId(null);
              handleDeleteSetting(id);
            }
          }}
          onCancel={() => setConfirmDeleteSettingId(null)}
        />
      </div>
    </div>
  );
}
