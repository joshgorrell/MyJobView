import React, { useState, useEffect } from 'react';
import { Plus, Package, Clock, CheckCircle, XCircle, FileText, User, Calendar, DollarSign, Search, Filter, Settings, Bell, X, RefreshCw } from 'lucide-react';
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
  assigned_to: string | null;
  priority: string;
  status: string;
  notes: string;
  created_at: string;
  requester: {
    first_name: string;
    last_name: string;
  };
  work_order?: {
    wo_number: string;
  };
  project?: {
    project_name: string;
  };
  items: Array<{
    id: string;
    product_name: string;
    model_number: string;
    vendor: string;
    quantity_requested: number;
    quantity_approved: number | null;
    estimated_cost: number | null;
  }>;
}

export function PartsRequestManagement() {
  const { user, profile } = useAuth();
  const [requests, setRequests] = useState<ProductRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showChangeVendor, setShowChangeVendor] = useState(false);
  const [viewMode, setViewMode] = useState<'requests' | 'vendors'>('requests');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<ProductRequest | null>(null);
  const [notificationSettings, setNotificationSettings] = useState<any[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadRequests();
    if (canManage) {
      loadNotificationSettings();
    }
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
          items:product_request_items(*)
        `)
        .order('created_at', { ascending: false });

      const canManageRequests = profile?.role === 'admin' ||
                                ['office_manager', 'purchasing', 'service_manager', 'production_manager'].includes(profile?.role || '');

      if (!canManageRequests) {
        query = query.eq('requested_by', user?.id);
      }

      const { data, error } = await query;

      if (error) throw error;
      setRequests(data || []);
    } catch (error) {
      console.error('Error loading requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadNotificationSettings = async () => {
    try {
      const { data } = await supabase
        .from('product_request_settings')
        .select(`
          *,
          user:profiles!product_request_settings_notification_user_id_fkey(first_name, last_name, email)
        `)
        .order('created_at');

      setNotificationSettings(data || []);
    } catch (error) {
      console.error('Error loading notification settings:', error);
    }
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

  const createPurchaseOrder = async (request: ProductRequest) => {
    try {
      const totalCost = (request.items || []).reduce((sum, item) =>
        sum + (item.estimated_cost || 0), 0
      );

      const { data: po, error: poError } = await supabase
        .from('purchase_orders')
        .insert({
          vendor: request.items?.[0]?.vendor || 'Multiple Vendors',
          total: totalCost,
          status: 'draft',
          requested_by: request.requested_by,
          notes: `Generated from Parts Request #${request.id.slice(0, 8)}\n\n${request.notes}`
        })
        .select()
        .single();

      if (poError) throw poError;

      const poItems = (request.items || []).map(item => ({
        po_id: po.id,
        product_id: null,
        product_name: item.product_name,
        quantity: item.quantity_approved || item.quantity_requested,
        unit_price: item.estimated_cost ? item.estimated_cost / item.quantity_requested : 0,
        total_price: item.estimated_cost || 0
      }));

      const { error: itemsError } = await supabase
        .from('po_items')
        .insert(poItems);

      if (itemsError) throw itemsError;

      await updateRequestStatus(request.id, 'po_created');

      alert(`Purchase Order #${po.id.slice(0, 8)} created successfully!`);
      await loadRequests();
    } catch (error) {
      console.error('Error creating PO:', error);
      alert('Error creating purchase order');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'approved': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'rejected': return <XCircle className="w-4 h-4 text-red-500" />;
      case 'po_created': return <FileText className="w-4 h-4 text-blue-500" />;
      case 'ordered': return <Package className="w-4 h-4 text-purple-500" />;
      case 'received': return <CheckCircle className="w-4 h-4 text-green-600" />;
      default: return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const filteredRequests = requests.filter(req => {
    const matchesStatus = filterStatus === 'all' || req.status === filterStatus;
    const matchesType = filterType === 'all' || req.request_type === filterType;
    const requester = req.requester;
    const requesterFirst = requester?.first_name?.toLowerCase() || '';
    const requesterLast = requester?.last_name?.toLowerCase() || '';
    const matchesSearch =
      requesterFirst.includes(searchTerm.toLowerCase()) ||
      requesterLast.includes(searchTerm.toLowerCase()) ||
      req.work_order?.wo_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (req.items || []).some(item =>
        (item.product_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.model_number || '').toLowerCase().includes(searchTerm.toLowerCase())
      );

    return matchesStatus && matchesType && matchesSearch;
  });

  const canManage = profile?.role === 'admin' ||
                    ['office_manager', 'purchasing', 'service_manager', 'production_manager'].includes(profile?.role || '');

  // Group items by vendor for vendor view
  const itemsByVendor = React.useMemo(() => {
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
    }>> = {};

    // Only include pending and approved requests for vendor view
    const activeRequests = requests.filter(r => ['pending', 'approved'].includes(r.status));

    activeRequests.forEach(request => {
      (request.items || []).forEach(item => {
        const vendor = item.vendor || 'Unknown Vendor';
        if (!grouped[vendor]) {
          grouped[vendor] = [];
        }
        grouped[vendor].push({
          itemId: item.id,
          requestId: request.id,
          requestNumber: request.id.slice(0, 8),
          productName: item.product_name,
          modelNumber: item.model_number,
          vendor: item.vendor,
          quantityRequested: item.quantity_requested,
          estimatedCost: item.estimated_cost,
          requester: `${request.requester?.first_name || ''} ${request.requester?.last_name || ''}`.trim(),
          createdAt: request.created_at,
          priority: request.priority
        });
      });
    });

    return grouped;
  }, [requests]);

  const toggleItemSelection = (itemId: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  const selectAllVendorItems = (vendor: string) => {
    const vendorItems = itemsByVendor[vendor];
    const newSelected = new Set(selectedItems);
    const allSelected = vendorItems.every(item => newSelected.has(item.itemId));

    if (allSelected) {
      // Deselect all
      vendorItems.forEach(item => newSelected.delete(item.itemId));
    } else {
      // Select all
      vendorItems.forEach(item => newSelected.add(item.itemId));
    }
    setSelectedItems(newSelected);
  };

  const createPOFromSelected = async (itemsToUse?: any[]) => {
    const itemsData = itemsToUse || [];

    // If no items provided, gather from selected
    if (itemsData.length === 0) {
      if (selectedItems.size === 0) {
        alert('Please select at least one item');
        return;
      }

      Object.values(itemsByVendor).forEach(items => {
        items.forEach(item => {
          if (selectedItems.has(item.itemId)) {
            itemsData.push(item);
          }
        });
      });
    }

    if (itemsData.length === 0) {
      alert('No items to create PO');
      return;
    }

    try {
      // Calculate total
      const totalCost = itemsData.reduce((sum: number, item: any) => sum + (item.estimatedCost || 0), 0);

      // Get unique vendors
      const vendors = [...new Set(itemsData.map((item: any) => item.vendor))];
      const vendorName = vendors.length === 1 ? vendors[0] : 'Multiple Vendors';

      // Create PO
      const { data: po, error: poError } = await supabase
        .from('purchase_orders')
        .insert({
          vendor: vendorName,
          total: totalCost,
          status: 'draft',
          requested_by: user?.id,
          notes: `Combined PO from ${itemsData.length} product request items`
        })
        .select()
        .single();

      if (poError) throw poError;

      // Create PO items
      const poItems = itemsData.map((item: any) => ({
        po_id: po.id,
        product_id: null,
        product_name: item.productName,
        quantity: item.quantityRequested,
        unit_price: item.estimatedCost ? item.estimatedCost / item.quantityRequested : 0,
        total_price: item.estimatedCost || 0
      }));

      const { error: itemsError } = await supabase
        .from('po_items')
        .insert(poItems);

      if (itemsError) throw itemsError;

      // Update all affected requests to 'po_created' status
      const requestIds = [...new Set(itemsData.map((item: any) => item.requestId))];
      for (const requestId of requestIds) {
        await supabase
          .from('product_requests')
          .update({ status: 'po_created' })
          .eq('id', requestId);
      }

      alert(`Purchase Order #${po.id.slice(0, 8)} created successfully with ${itemsData.length} items!`);
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

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
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
                Notifications
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

        {canManage && (
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => {
                setViewMode('requests');
                setSelectedItems(new Set());
              }}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                viewMode === 'requests'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              By Request
            </button>
            <button
              onClick={() => {
                setViewMode('vendors');
                setSelectedItems(new Set());
              }}
              className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                viewMode === 'vendors'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              By Vendor
            </button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="flex-1 min-w-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search requests..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-base"
              />
            </div>
          </div>

          {viewMode === 'requests' && (
            <>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-base"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="po_created">PO Created</option>
                <option value="ordered">Ordered</option>
                <option value="received">Received</option>
                <option value="rejected">Rejected</option>
              </select>

              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-base"
              >
                <option value="all">All Types</option>
                <option value="job">For Job</option>
                <option value="stock">For Stock</option>
                <option value="van">For Van</option>
              </select>
            </>
          )}
        </div>

        {viewMode === 'vendors' && canManage && selectedItems.size > 0 && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
            <div className="text-sm text-blue-900">
              <strong>{selectedItems.size}</strong> item(s) selected
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowChangeVendor(true)}
                className="flex items-center gap-2 bg-white border border-blue-600 text-blue-600 px-4 py-2 rounded-lg hover:bg-blue-50 transition-colors font-medium"
              >
                <RefreshCw className="w-4 h-4" />
                Change Vendor
              </button>
              <button
                onClick={createPOFromSelected}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Create PO for Selected
              </button>
            </div>
          </div>
        )}

        {viewMode === 'vendors' && canManage ? (
          Object.keys(itemsByVendor).length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No pending items</h3>
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
                      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            ref={el => {
                              if (el) el.indeterminate = someSelected && !allSelected;
                            }}
                            onChange={() => selectAllVendorItems(vendor)}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <div>
                            <h3 className="font-semibold text-gray-900">{vendor}</h3>
                            <p className="text-sm text-gray-600">
                              {items.length} item(s) • Est. Total: {formatCurrency(totalCost)}
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
                          <div
                            key={item.itemId}
                            className="px-4 py-3 hover:bg-gray-50 transition-colors"
                          >
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={selectedItems.has(item.itemId)}
                                onChange={() => toggleItemSelection(item.itemId)}
                                className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1">
                                    <div className="font-medium text-gray-900">{item.productName}</div>
                                    <div className="text-sm text-gray-600 mt-1">
                                      Model: {item.modelNumber}
                                    </div>
                                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                                      <span>Request #{item.requestNumber}</span>
                                      <span>Qty: {item.quantityRequested}</span>
                                      {item.estimatedCost && (
                                        <span>Cost: {formatCurrency(item.estimatedCost)}</span>
                                      )}
                                      <span>By: {item.requester}</span>
                                      {item.priority === 'urgent' && (
                                        <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">
                                          URGENT
                                        </span>
                                      )}
                                    </div>
                                  </div>
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
        ) : filteredRequests.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No requests found</h3>
            <p className="text-gray-600 mb-4">
              {canManage ? 'No product requests to review' : 'Start by creating your first product request'}
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Create Request
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredRequests.map((request) => (
              <div
                key={request.id}
                className="border border-gray-200 rounded-lg p-3 sm:p-4 hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer"
                onClick={() => setSelectedRequest(request)}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
                  <div className="flex items-start gap-2 sm:gap-3 min-w-0">
                    {getStatusIcon(request.status)}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 text-sm sm:text-base break-words">
                        Request #{request.id.slice(0, 8)}
                        {request.priority === 'urgent' && (
                          <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-medium">
                            URGENT
                          </span>
                        )}
                      </div>
                      <div className="text-xs sm:text-sm text-gray-600 mt-1 break-words">
                        {request.request_type === 'job' && request.work_order && (
                          <span>WO: {request.work_order?.wo_number} • </span>
                        )}
                        <span className="capitalize">{request.request_type}</span> • {(request.items || []).length} item(s)
                      </div>
                    </div>
                  </div>
                  <div className="text-left sm:text-right flex-shrink-0">
                    <div className="text-xs sm:text-sm font-medium text-gray-900 capitalize">
                      {request.status.replace('_', ' ')}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {new Date(request.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs sm:text-sm text-gray-600">
                  <div className="flex items-center gap-1">
                    <User className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span className="truncate">{request.requester?.first_name || 'Unknown'} {request.requester?.last_name || ''}</span>
                  </div>
                </div>

                {(request.items || []).slice(0, 2).map((item) => (
                  <div key={item.id} className="mt-2 text-xs sm:text-sm text-gray-600 bg-gray-50 rounded px-3 py-2 break-words">
                    {item.product_name} ({item.model_number}) × {item.quantity_requested}
                  </div>
                ))}
                {(request.items || []).length > 2 && (
                  <div className="mt-2 text-xs sm:text-sm text-gray-500">
                    + {(request.items || []).length - 2} more item(s)
                  </div>
                )}

                {canManage && request.status === 'pending' && (
                  <div className="mt-3 pt-3 border-t border-gray-200 flex flex-col sm:flex-row gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateRequestStatus(request.id, 'approved');
                      }}
                      className="flex-1 px-3 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 font-medium"
                    >
                      Approve
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        createPurchaseOrder(request);
                      }}
                      className="flex-1 px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 font-medium"
                    >
                      Create PO
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateRequestStatus(request.id, 'rejected');
                      }}
                      className="flex-1 px-3 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700 font-medium"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <PartsRequestForm
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            setShowForm(false);
            loadRequests();
          }}
        />
      )}

      {showSettings && canManage && (
        <ProductRequestSettingsModal
          onClose={() => setShowSettings(false)}
          onSuccess={() => {
            setShowSettings(false);
            loadNotificationSettings();
          }}
          settings={notificationSettings}
        />
      )}

      {selectedRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Request #{selectedRequest.id.slice(0, 8)}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Created {new Date(selectedRequest.created_at).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedRequest(null)}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Type:</span>
                  <span className="ml-2 font-medium capitalize">{selectedRequest.request_type}</span>
                </div>
                <div>
                  <span className="text-gray-500">Status:</span>
                  <span className="ml-2 font-medium capitalize">{selectedRequest.status.replace('_', ' ')}</span>
                </div>
                <div>
                  <span className="text-gray-500">Requested By:</span>
                  <span className="ml-2 font-medium">
                    {selectedRequest.requester?.first_name || 'Unknown'} {selectedRequest.requester?.last_name || ''}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Priority:</span>
                  <span className="ml-2 font-medium capitalize">{selectedRequest.priority}</span>
                </div>
              </div>

              {selectedRequest.notes && (
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-2">Notes</div>
                  <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
                    {selectedRequest.notes}
                  </div>
                </div>
              )}

              <div>
                <div className="text-sm font-medium text-gray-700 mb-3">Items ({(selectedRequest.items || []).length})</div>
                <div className="space-y-2">
                  {(selectedRequest.items || []).map((item) => (
                    <div key={item.id} className="border border-gray-200 rounded-lg p-3">
                      <div className="font-medium text-gray-900">{item.product_name}</div>
                      <div className="text-sm text-gray-600 mt-1">
                        Model: {item.model_number} • Vendor: {item.vendor}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        Quantity: {item.quantity_requested}
                        {item.estimated_cost && ` • Est. Cost: ${formatCurrency(item.estimated_cost)}`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showChangeVendor && (
        <ChangeVendorModal
          selectedItemIds={Array.from(selectedItems)}
          onClose={() => setShowChangeVendor(false)}
          onSuccess={async () => {
            await loadRequests();
            setSelectedItems(new Set());
          }}
        />
      )}
    </div>
  );
}

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
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 mb-2">Add Notification Recipient</h4>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notify by Role
                </label>
                <select
                  value={notificationRole}
                  onChange={(e) => {
                    setNotificationRole(e.target.value);
                    setNotificationUserId('');
                  }}
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notify Specific User
                </label>
                <select
                  value={notificationUserId}
                  onChange={(e) => {
                    setNotificationUserId(e.target.value);
                    setNotificationRole('');
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a user...</option>
                  {users.map(user => (
                    <option key={user.id} value={user.id}>
                      {user.first_name} {user.last_name} - {user.role}
                    </option>
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
              <div className="text-center py-8 text-gray-500">
                No notification recipients configured
              </div>
            ) : (
              <div className="space-y-2">
                {settings.map(setting => (
                  <div
                    key={setting.id}
                    className="flex items-center justify-between p-3 border border-gray-200 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <Bell className={`w-5 h-5 ${setting.is_active ? 'text-blue-600' : 'text-gray-400'}`} />
                      <div>
                        <div className="font-medium text-gray-900">
                          {setting.notification_role ? (
                            <span className="capitalize">{setting.notification_role.replace('_', ' ')}</span>
                          ) : (
                            <span>{setting.user?.first_name} {setting.user?.last_name}</span>
                          )}
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
                          setting.is_active
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-700'
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
          <button
            onClick={onClose}
            className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
          >
            Close
          </button>
        </div>
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
  );
}
