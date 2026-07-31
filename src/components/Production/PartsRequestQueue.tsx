import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import { Package, Check, X, Clock, AlertCircle, DollarSign, User, Calendar, Truck, CheckCircle, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmModal from '../ui/ConfirmModal';

interface PartsRequest {
  id: string;
  part_name: string;
  part_number: string | null;
  quantity: number;
  urgency: string;
  reason: string;
  photo_url: string | null;
  estimated_cost: number | null;
  actual_cost: number | null;
  status: string;
  requested_at: string;
  approved_at: string | null;
  approval_notes: string | null;
  ordered_at: string | null;
  order_number: string | null;
  delivered_at: string | null;
  vendor: string | null;
  technician: {
    full_name: string;
  };
  work_order: {
    title: string;
    work_order_number: string;
  };
}

export function PartsRequestQueue() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<PartsRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('requested');
  const [selectedRequest, setSelectedRequest] = useState<string | null>(null);
  const [confirmInstallId, setConfirmInstallId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadRequests();

    const channel = supabase
      .channel('parts-requests-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'parts_requests'
      }, () => {
        loadRequests();
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, []);

  async function loadRequests() {
    try {
      const { data, error } = await supabase
        .from('parts_requests')
        .select(`
          *,
          technician:profiles!technician_id(full_name),
          work_order:work_orders(title, work_order_number)
        `)
        .order('requested_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (error) {
      console.error('Error loading parts requests:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(requestId: string) {
    if (!profile) return;

    try {
      const { error } = await supabase
        .from('parts_requests')
        .update({
          status: 'approved',
          approved_by: profile.id,
          approved_at: new Date().toISOString()
        })
        .eq('id', requestId);

      if (error) throw error;
      loadRequests();
    } catch (error) {
      console.error('Error approving request:', error);
      alert('Failed to approve request');
    }
  }

  async function handleDeny(requestId: string) {
    const notes = prompt('Reason for denial:');
    if (!notes) return;

    if (!profile) return;

    try {
      const { error } = await supabase
        .from('parts_requests')
        .update({
          status: 'denied',
          approved_by: profile.id,
          approved_at: new Date().toISOString(),
          approval_notes: notes
        })
        .eq('id', requestId);

      if (error) throw error;
      loadRequests();
    } catch (error) {
      console.error('Error denying request:', error);
      alert('Failed to deny request');
    }
  }

  async function handleMarkOrdered(requestId: string) {
    const orderNumber = prompt('Enter order/PO number:');
    const vendor = prompt('Vendor name:');

    if (!orderNumber) return;

    try {
      const { error } = await supabase
        .from('parts_requests')
        .update({
          status: 'ordered',
          ordered_at: new Date().toISOString(),
          order_number: orderNumber,
          vendor: vendor || null
        })
        .eq('id', requestId);

      if (error) throw error;
      loadRequests();
    } catch (error) {
      console.error('Error marking as ordered:', error);
      alert('Failed to update status');
    }
  }

  async function handleMarkDelivered(requestId: string) {
    const actualCostStr = prompt('Actual cost (optional):');
    const actualCost = actualCostStr ? parseFloat(actualCostStr) : null;

    try {
      const { error } = await supabase
        .from('parts_requests')
        .update({
          status: 'delivered',
          delivered_at: new Date().toISOString(),
          actual_cost: actualCost
        })
        .eq('id', requestId);

      if (error) throw error;
      loadRequests();
    } catch (error) {
      console.error('Error marking as delivered:', error);
      alert('Failed to update status');
    }
  }

  async function deleteRequest(requestId: string) {
    try {
      const { error } = await supabase
        .from('parts_requests')
        .delete()
        .eq('id', requestId);
      if (error) throw error;
      loadRequests();
    } catch (error: any) {
      alert(`Failed to delete request: ${error.message || 'Unknown error'}`);
    }
  }

  async function handleMarkInstalled(requestId: string) {
    try {
      const { error } = await supabase
        .from('parts_requests')
        .update({
          status: 'installed',
          installed_at: new Date().toISOString()
        })
        .eq('id', requestId);

      if (error) throw error;
      loadRequests();
    } catch (error) {
      console.error('Error marking as installed:', error);
      alert('Failed to update status');
    }
  }

  function getUrgencyColor(urgency: string) {
    switch (urgency) {
      case 'immediate':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'today':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'this_week':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'requested':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'approved':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'denied':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'ordered':
        return 'bg-purple-100 text-purple-800 border-purple-300';
      case 'delivered':
        return 'bg-teal-100 text-teal-800 border-teal-300';
      case 'installed':
        return 'bg-green-100 text-green-800 border-green-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  }

  const filteredRequests = requests.filter(req => {
    if (statusFilter === 'all') return true;
    return req.status === statusFilter;
  });

  const statusCounts = {
    all: requests.length,
    requested: requests.filter(r => r.status === 'requested').length,
    approved: requests.filter(r => r.status === 'approved').length,
    ordered: requests.filter(r => r.status === 'ordered').length,
    delivered: requests.filter(r => r.status === 'delivered').length,
    installed: requests.filter(r => r.status === 'installed').length,
    denied: requests.filter(r => r.status === 'denied').length
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading parts requests...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-white">Parts Request Queue</h2>
        <p className="text-gray-300">Manage parts requests from technicians</p>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex gap-2 border-b border-gray-200 overflow-x-auto">
        {[
          { value: 'requested', label: 'Requested' },
          { value: 'approved', label: 'Approved' },
          { value: 'ordered', label: 'Ordered' },
          { value: 'delivered', label: 'Delivered' },
          { value: 'installed', label: 'Installed' },
          { value: 'denied', label: 'Denied' },
          { value: 'all', label: 'All' }
        ].map(filter => (
          <button
            key={filter.value}
            onClick={() => setStatusFilter(filter.value)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              statusFilter === filter.value
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            {filter.label} ({statusCounts[filter.value as keyof typeof statusCounts]})
          </button>
        ))}
      </div>

      {/* Requests Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredRequests.length === 0 ? (
          <div className="col-span-full bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No parts requests found</p>
          </div>
        ) : (
          filteredRequests.map(request => (
            <div
              key={request.id}
              className={`bg-white rounded-xl shadow-sm border-2 p-4 transition-all ${
                selectedRequest === request.id ? 'border-blue-500' : 'border-gray-200'
              }`}
              onClick={() => setSelectedRequest(selectedRequest === request.id ? null : request.id)}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">{request.part_name}</h3>
                  {request.part_number && (
                    <p className="text-xs text-gray-500 mt-1">PN: {request.part_number}</p>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${
                    getUrgencyColor(request.urgency)
                  }`}>
                    <AlertCircle className="w-3 h-3 mr-1" />
                    {request.urgency.replace('_', ' ')}
                  </span>
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${
                    getStatusColor(request.status)
                  }`}>
                    {request.status}
                  </span>
                </div>
              </div>

              {/* Photo */}
              {request.photo_url && (
                <img
                  src={request.photo_url}
                  alt="Part"
                  className="w-full h-32 object-cover rounded-lg mb-3 cursor-pointer hover:opacity-90"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(request.photo_url!, '_blank');
                  }}
                />
              )}

              {/* Details */}
              <div className="space-y-2 text-sm mb-3">
                <div className="flex items-center gap-2 text-gray-600">
                  <User className="w-4 h-4" />
                  <span>{request.technician?.full_name}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <Package className="w-4 h-4" />
                  <span>{request.work_order?.work_order_number}: {request.work_order?.title}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <Clock className="w-4 h-4" />
                  <span>Qty: {request.quantity}</span>
                </div>
                {(request.estimated_cost || request.actual_cost) && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <DollarSign className="w-4 h-4" />
                    <span>
                      {request.actual_cost
                        ? formatCurrency(request.actual_cost)
                        : `~${formatCurrency(request.estimated_cost ?? 0)}`
                      }
                    </span>
                  </div>
                )}
              </div>

              {/* Reason */}
              <div className="p-2 bg-gray-50 rounded-lg text-sm text-gray-700 mb-3">
                <strong>Reason:</strong> {request.reason}
              </div>

              {/* Additional Info */}
              {request.order_number && (
                <div className="text-xs text-gray-600 mb-2">
                  <Truck className="w-3 h-3 inline mr-1" />
                  Order #{request.order_number}
                  {request.vendor && ` from ${request.vendor}`}
                </div>
              )}

              {request.approval_notes && (
                <div className="p-2 bg-yellow-50 rounded-lg text-xs text-gray-700 mb-3">
                  <strong>Note:</strong> {request.approval_notes}
                </div>
              )}

              {/* Actions */}
              {request.status === 'requested' && (
                <div className="flex gap-2 pt-3 border-t border-gray-200">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleApprove(request.id);
                    }}
                    className="flex-1 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 flex items-center justify-center gap-1"
                  >
                    <Check className="w-4 h-4" />
                    Approve
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeny(request.id);
                    }}
                    className="flex-1 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 flex items-center justify-center gap-1"
                  >
                    <X className="w-4 h-4" />
                    Deny
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteId(request.id);
                    }}
                    className="px-3 py-2 bg-gray-100 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 hover:text-red-700 flex items-center justify-center gap-1"
                    title="Delete this request"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )

              {request.status === 'approved' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMarkOrdered(request.id);
                  }}
                  className="w-full py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 flex items-center justify-center gap-1"
                >
                  <Truck className="w-4 h-4" />
                  Mark as Ordered
                </button>
              )}

              {request.status === 'ordered' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMarkDelivered(request.id);
                  }}
                  className="w-full py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 flex items-center justify-center gap-1"
                >
                  <Package className="w-4 h-4" />
                  Mark as Delivered
                </button>
              )}

              {request.status === 'delivered' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmInstallId(request.id);
                  }}
                  className="w-full py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 flex items-center justify-center gap-1"
                >
                  <CheckCircle className="w-4 h-4" />
                  Mark as Installed
                </button>
              )}

              <div className="text-xs text-gray-500 mt-2 text-center">
                Requested {new Date(request.requested_at).toLocaleDateString()}
              </div>
            </div>
          ))
        )}
      </div>
      <ConfirmModal
        isOpen={!!confirmDeleteId}
        title="Delete Request"
        message="Delete this parts request? This cannot be undone."
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => {
          if (confirmDeleteId) {
            const id = confirmDeleteId;
            setConfirmDeleteId(null);
            deleteRequest(id);
          }
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />
      <ConfirmModal
        isOpen={!!confirmInstallId}
        title="Mark as Installed"
        message="Mark this part as installed on the job?"
        variant="neutral"
        confirmLabel="Mark Installed"
        onConfirm={() => {
          if (confirmInstallId) {
            const id = confirmInstallId;
            setConfirmInstallId(null);
            handleMarkInstalled(id);
          }
        }}
        onCancel={() => setConfirmInstallId(null)}
      />
    </div>
  );
}
