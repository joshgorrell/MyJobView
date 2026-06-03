import React, { useState, useEffect } from 'react';
import { X, Plus, Search, Trash2, Package, User, Briefcase, Truck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Product {
  id: string;
  name: string;
  sku: string;
  vendor: string;
  current_stock: number;
  unit_price: number;
  default_vendor_id?: string;
  vendor_id?: string;
  default_vendor?: {
    vendor_name: string;
  };
  vendors?: {
    vendor_name: string;
  };
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

export function PartsRequestForm({ onClose, onSuccess }: PartsRequestFormProps) {
  const { user, profile } = useAuth();
  const [requestType, setRequestType] = useState<'job' | 'stock' | 'van'>('job');
  const [workOrderId, setWorkOrderId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [assignedTo, setAssignedTo] = useState(user?.id || '');
  const [priority, setPriority] = useState<'normal' | 'urgent'>('normal');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<RequestItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [notificationRecipients, setNotificationRecipients] = useState<any[]>([]);

  useEffect(() => {
    loadUsers();
    loadWorkOrders();
    loadProjects();
    loadNotificationRecipients();
  }, []);

  const loadNotificationRecipients = async () => {
    const { data } = await supabase
      .from('product_request_settings')
      .select(`
        notification_role,
        notification_user_id,
        user:profiles!product_request_settings_notification_user_id_fkey(first_name, last_name)
      `)
      .eq('is_active', true);
    if (data) setNotificationRecipients(data);
  };

  useEffect(() => {
    if (searchTerm.length >= 2) {
      searchProducts();
    } else {
      setSearchResults([]);
    }
  }, [searchTerm]);

  const loadUsers = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .order('first_name');
    if (data) setUsers(data);
  };

  const loadWorkOrders = async () => {
    const { data } = await supabase
      .from('work_orders')
      .select('id, wo_number, project:projects(project_name)')
      .in('status', ['assigned', 'in_progress'])
      .order('wo_number', { ascending: false })
      .limit(50);
    if (data) setWorkOrders(data);
  };

  const loadProjects = async () => {
    const { data } = await supabase
      .from('projects')
      .select('id, project_name, project_number')
      .in('status', ['active', 'pending'])
      .order('project_number', { ascending: false })
      .limit(50);
    if (data) setProjects(data);
  };

  const searchProducts = async () => {
    const { data } = await supabase
      .from('products')
      .select(`
        *,
        default_vendor:vendors!products_default_vendor_id_fkey(vendor_name),
        vendors:vendors!products_vendor_id_fkey(vendor_name)
      `)
      .or(`name.ilike.%${searchTerm}%,sku.ilike.%${searchTerm}%,vendor.ilike.%${searchTerm}%,model_number.ilike.%${searchTerm}%`)
      .limit(10);
    if (data) setSearchResults(data);
  };

  const addItemFromProduct = (product: Product) => {
    // Get vendor name from relationships or fallback to text field
    const vendorName = product.default_vendor?.vendor_name ||
                       product.vendors?.vendor_name ||
                       product.vendor ||
                       '';

    setItems([...items, {
      product_id: product.id,
      product_name: product.name,
      model_number: product.sku || product.model_number || '',
      vendor: vendorName,
      quantity: 1,
      assigned_to: requestType === 'van' ? assignedTo : undefined,
      unit_price: product.unit_price
    }]);
    setSearchTerm('');
    setSearchResults([]);
  };

  const addCustomItem = () => {
    setItems([...items, {
      product_name: '',
      model_number: '',
      vendor: '',
      quantity: 1,
      assigned_to: requestType === 'van' ? assignedTo : undefined
    }]);
  };

  const updateItem = (index: number, field: keyof RequestItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) {
      alert('Add at least one item');
      return;
    }

    // Validate that job requests have either a project or work order
    if (requestType === 'job' && !workOrderId && !projectId) {
      alert('For Job requests, you must select either a Project or Work Order');
      return;
    }

    setSubmitting(true);
    try {
      const { data: request, error: requestError } = await supabase
        .from('product_requests')
        .insert({
          requested_by: user?.id,
          request_type: requestType,
          work_order_id: workOrderId || null,
          project_id: projectId || null,
          assigned_to: requestType === 'van' ? assignedTo : null,
          priority,
          status: 'pending',
          notes
        })
        .select()
        .single();

      if (requestError) throw requestError;

      const itemsToInsert = items.map(item => ({
        request_id: request.id,
        product_id: item.product_id || null,
        product_name: item.product_name,
        model_number: item.model_number,
        vendor: item.vendor,
        quantity_requested: item.quantity,
        assigned_to: item.assigned_to || null,
        notes: item.notes || null,
        estimated_cost: item.unit_price ? item.unit_price * item.quantity : null
      }));

      const { error: itemsError } = await supabase
        .from('product_request_items')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      // Create tasks/notifications for configured recipients
      const recipientUserIds: string[] = [];

      for (const recipient of notificationRecipients) {
        if (recipient.notification_user_id) {
          recipientUserIds.push(recipient.notification_user_id);
        } else if (recipient.notification_role) {
          const { data: roleUsers } = await supabase
            .from('profiles')
            .select('id')
            .eq('role', recipient.notification_role);
          if (roleUsers) {
            recipientUserIds.push(...roleUsers.map(u => u.id));
          }
        }
      }

      // Create task for first recipient and notifications for all
      if (recipientUserIds.length > 0) {
        const taskData = {
          title: `Product Request #${request.id.slice(0, 8)} - ${requestType}`,
          description: `${items.length} item(s) requested by ${profile?.first_name} ${profile?.last_name}\n\n${notes}`,
          assigned_to: recipientUserIds[0],
          priority: priority === 'urgent' ? 'high' : 'medium',
          status: 'pending',
          due_date: priority === 'urgent' ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null,
          created_by: user?.id,
          related_entity_type: 'product_request',
          related_entity_id: request.id
        };

        await supabase.from('tasks').insert(taskData);

        // Create notifications for all recipients
        const notifications = recipientUserIds.map(userId => ({
          user_id: userId,
          type: 'product_request',
          title: `New Product Request`,
          message: `${profile?.first_name} ${profile?.last_name} submitted a ${requestType} request with ${items.length} item(s)`,
          related_id: request.id
        }));

        await supabase.from('notifications').insert(notifications);
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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full my-4 sm:my-8 max-h-[96vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <div className="sticky top-0 bg-white flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 z-10">
            <div className="flex-1 min-w-0 pr-2">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 truncate">New Product Request</h2>
              <p className="text-xs sm:text-sm text-gray-600 mt-1">Request products for jobs, stock, or technician vans</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex-shrink-0 p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Request Type *
                </label>
                <select
                  value={requestType}
                  onChange={(e) => setRequestType(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-base"
                  required
                >
                  <option value="job">For Job</option>
                  <option value="stock">For Stock</option>
                  <option value="van">For Van</option>
                </select>
              </div>

              {requestType === 'job' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Project
                    </label>
                    <select
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-base ${
                        !projectId && !workOrderId ? 'border-red-300' : 'border-gray-300'
                      }`}
                    >
                      <option value="">Select Project</option>
                      {projects.map((proj) => (
                        <option key={proj.id} value={proj.id}>
                          {proj.project_number} - {proj.project_name}
                        </option>
                      ))}
                    </select>
                    {!projectId && !workOrderId && (
                      <p className="text-xs text-red-600 mt-1">Required: Select Project or WO</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Work Order
                    </label>
                    <select
                      value={workOrderId}
                      onChange={(e) => setWorkOrderId(e.target.value)}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-base ${
                        !projectId && !workOrderId ? 'border-red-300' : 'border-gray-300'
                      }`}
                    >
                      <option value="">Select Work Order</option>
                      {workOrders.map((wo) => (
                        <option key={wo.id} value={wo.id}>
                          {wo.wo_number} - {wo.project?.project_name}
                        </option>
                      ))}
                    </select>
                    {!projectId && !workOrderId && (
                      <p className="text-xs text-red-600 mt-1">Required: Select Project or WO</p>
                    )}
                  </div>
                </>
              )}

              {requestType === 'van' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Assign To *
                  </label>
                  <select
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-base"
                    required
                  >
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.first_name} {u.last_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-base"
                >
                  <option value="normal">Normal</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search Products
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by name, model number, or vendor..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-base"
                />
              </div>
              {searchResults.length > 0 && (
                <div className="mt-2 border border-gray-200 rounded-lg divide-y max-h-48 overflow-y-auto">
                  {searchResults.map((product) => {
                    const vendorName = product.default_vendor?.vendor_name ||
                                      product.vendors?.vendor_name ||
                                      product.vendor ||
                                      'No vendor';
                    const modelNumber = product.sku || product.model_number || 'N/A';

                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => addItemFromProduct(product)}
                        className="w-full px-3 sm:px-4 py-2 text-left hover:bg-gray-50 transition-colors"
                      >
                        <div className="font-medium text-gray-900 text-sm sm:text-base break-words">{product.name}</div>
                        <div className="text-xs sm:text-sm text-gray-600 break-words">
                          {modelNumber} • {vendorName} • Stock: {product.current_stock || 0}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-gray-700">
                  Items ({items.length})
                </label>
                <button
                  type="button"
                  onClick={addCustomItem}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  + Add Custom Item
                </button>
              </div>

              {items.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
                  <Package className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-600 text-sm">No items added yet</p>
                  <p className="text-gray-500 text-xs mt-1">Search for products or add custom items</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {items.map((item, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-3 sm:p-4">
                      <div className="flex items-start gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <input
                            type="text"
                            value={item.product_name}
                            onChange={(e) => updateItem(index, 'product_name', e.target.value)}
                            placeholder="Product name *"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                            required
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeItem(index)}
                          className="flex-shrink-0 p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        <div className="col-span-2 sm:col-span-1">
                          <input
                            type="text"
                            value={item.model_number}
                            onChange={(e) => updateItem(index, 'model_number', e.target.value)}
                            placeholder="Model # *"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                            required
                          />
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                          <input
                            type="text"
                            value={item.vendor}
                            onChange={(e) => updateItem(index, 'vendor', e.target.value)}
                            placeholder="Vendor *"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                            required
                          />
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value))}
                            placeholder="Qty *"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                            required
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Additional details, delivery instructions, etc..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-base"
              />
            </div>
          </div>

          <div className="sticky bottom-0 bg-white flex gap-2 sm:gap-3 p-4 sm:p-6 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm sm:text-base font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || items.length === 0}
              className="flex-1 bg-blue-600 text-white px-4 py-2.5 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm sm:text-base font-medium"
            >
              {submitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
