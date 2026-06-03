import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Edit2, Trash2, Save, X, Radio } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmModal from '../ui/ConfirmModal';

interface MonitoringService {
  id: string;
  name: string;
  description: string;
  monthly_price: number;
  category: string;
  is_active: boolean;
  sort_order: number;
}

export default function MonitoringServicesCatalog() {
  const { profile } = useAuth();
  const [services, setServices] = useState<MonitoringService[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [existingCategories, setExistingCategories] = useState<string[]>([]);
  const [showCustomCategory, setShowCustomCategory] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    monthly_price: '',
    category: '',
    is_active: true,
    sort_order: 0
  });

  const canEdit = profile?.role === 'admin' || profile?.role === 'manager';
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  useEffect(() => {
    loadServices();
  }, []);

  async function loadServices() {
    try {
      const { data, error } = await supabase
        .from('monitoring_services')
        .select('*')
        .order('sort_order');

      if (error) throw error;
      setServices(data || []);

      // Extract unique categories
      const categories = [...new Set(data?.map(s => s.category).filter(Boolean) || [])];
      setExistingCategories(categories.sort());
    } catch (error) {
      console.error('Error loading services:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;

    try {
      if (editingId) {
        const { error } = await supabase
          .from('monitoring_services')
          .update({
            name: formData.name,
            description: formData.description,
            monthly_price: parseFloat(formData.monthly_price),
            category: formData.category,
            is_active: formData.is_active,
            sort_order: formData.sort_order
          })
          .eq('id', editingId);

        if (error) throw error;
      } else {
        const maxSortOrder = services.length > 0
          ? Math.max(...services.map(s => s.sort_order))
          : 0;

        const { error } = await supabase
          .from('monitoring_services')
          .insert({
            name: formData.name,
            description: formData.description,
            monthly_price: parseFloat(formData.monthly_price),
            category: formData.category,
            is_active: formData.is_active,
            sort_order: maxSortOrder + 1
          });

        if (error) throw error;
      }

      resetForm();
      loadServices();
    } catch (error) {
      console.error('Error saving service:', error);
      alert('Failed to save service');
    }
  }

  async function handleDelete(id: string) {
    if (!canEdit) return;

    try {
      const { error } = await supabase
        .from('monitoring_services')
        .delete()
        .eq('id', id);

      if (error) throw error;
      loadServices();
    } catch (error) {
      console.error('Error deleting service:', error);
      alert('Failed to delete service. It may be in use by existing contracts.');
    }
  }

  async function toggleActive(id: string, currentStatus: boolean) {
    if (!canEdit) return;

    try {
      const { error } = await supabase
        .from('monitoring_services')
        .update({ is_active: !currentStatus })
        .eq('id', id);

      if (error) throw error;
      loadServices();
    } catch (error) {
      console.error('Error updating service:', error);
      alert('Failed to update service');
    }
  }

  function startEdit(service: MonitoringService) {
    if (!canEdit) return;

    setEditingId(service.id);
    const serviceCategory = service.category || '';
    // Check if the category is not in the existing list
    const isCustomCategory = serviceCategory && !existingCategories.includes(serviceCategory);
    setShowCustomCategory(isCustomCategory);

    setFormData({
      name: service.name,
      description: service.description || '',
      monthly_price: service.monthly_price.toString(),
      category: serviceCategory,
      is_active: service.is_active,
      sort_order: service.sort_order
    });
    setShowAddForm(true);
  }

  function resetForm() {
    setEditingId(null);
    setShowAddForm(false);
    setShowCustomCategory(false);
    setFormData({
      name: '',
      description: '',
      monthly_price: '',
      category: '',
      is_active: true,
      sort_order: 0
    });
  }

  function handleCategoryChange(value: string) {
    if (value === '__new__') {
      setShowCustomCategory(true);
      setFormData({ ...formData, category: '' });
    } else {
      setShowCustomCategory(false);
      setFormData({ ...formData, category: value });
    }
  }

  const groupedServices = services.reduce((acc, service) => {
    const category = service.category || 'Other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(service);
    return acc;
  }, {} as Record<string, MonitoringService[]>);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading monitoring services...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Monitoring Services Catalog</h3>
          <p className="text-gray-400 mt-1">
            {canEdit
              ? 'View and manage monitoring services for security contracts'
              : 'Browse available monitoring services'
            }
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Add Service
          </button>
        )}
      </div>

      {showAddForm && canEdit && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-semibold text-white">
              {editingId ? 'Edit Service' : 'Add New Service'}
            </h4>
            <button
              onClick={resetForm}
              className="text-gray-400 hover:text-gray-300"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Service Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Category
                </label>
                {!showCustomCategory ? (
                  <select
                    value={formData.category}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select a category...</option>
                    {existingCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                    <option value="__new__" className="font-semibold">
                      + Add New Category
                    </option>
                  </select>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      placeholder="Enter new category name"
                      autoFocus
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setShowCustomCategory(false);
                        setFormData({ ...formData, category: '' });
                      }}
                      className="text-sm text-gray-400 hover:text-gray-300"
                    >
                      Cancel - use existing category
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Monthly Price <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                    $
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={formData.monthly_price}
                    onChange={(e) => setFormData({ ...formData, monthly_price: e.target.value })}
                    className="w-full pl-8 pr-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Status
                </label>
                <label className="flex items-center gap-2 mt-2">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-sm text-gray-300">Active (available for selection)</span>
                </label>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Save className="w-4 h-4" />
                {editingId ? 'Update Service' : 'Add Service'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-gray-800 rounded-lg border border-gray-700">
        {services.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            {canEdit
              ? 'No services configured. Add your first service to get started.'
              : 'No monitoring services available yet.'
            }
          </div>
        ) : (
          Object.entries(groupedServices).map(([category, categoryServices]) => (
            <div key={category}>
              <div className="px-6 py-3 bg-gray-900 border-b border-gray-700 font-semibold text-white">
                {category}
              </div>
              <div className="divide-y divide-gray-700">
                {categoryServices.map((service) => (
                  <div
                    key={service.id}
                    className={`flex items-center gap-4 p-4 hover:bg-gray-750 ${
                      !service.is_active ? 'opacity-50' : ''
                    }`}
                  >
                    <Radio className="w-5 h-5 text-blue-400 flex-shrink-0" />

                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h4 className="font-semibold text-white">{service.name}</h4>
                        {!service.is_active && (
                          <span className="px-2 py-1 text-xs bg-gray-700 text-gray-400 rounded">
                            Inactive
                          </span>
                        )}
                      </div>
                      {service.description && (
                        <p className="text-sm text-gray-400 mt-1">{service.description}</p>
                      )}
                    </div>

                    <div className="text-right">
                      <div className="text-lg font-semibold text-blue-400">
                        ${service.monthly_price.toFixed(2)}
                      </div>
                      <div className="text-xs text-gray-500">per month</div>
                    </div>

                    {canEdit && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleActive(service.id, service.is_active)}
                          className={`px-3 py-1 text-sm rounded ${
                            service.is_active
                              ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                              : 'bg-green-900 text-green-300 hover:bg-green-800'
                          }`}
                        >
                          {service.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          onClick={() => startEdit(service)}
                          className="p-2 text-blue-400 hover:bg-gray-700 rounded"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setConfirmModal({ title: 'Delete Service', message: 'Are you sure you want to delete this service?', onConfirm: () => handleDelete(service.id) })}
                          className="p-2 text-red-400 hover:bg-gray-700 rounded"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {!canEdit && (
        <div className="bg-blue-900/20 border border-blue-800/30 rounded-lg p-4">
          <p className="text-sm text-blue-300">
            You are viewing the monitoring services catalog in read-only mode. Contact an administrator if you need to make changes.
          </p>
        </div>
      )}

      {canEdit && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <h4 className="font-semibold text-white mb-2">About Monitoring Services</h4>
          <ul className="text-sm text-gray-400 space-y-1">
            <li>• Services can be selected when creating new security contracts</li>
            <li>• Monthly prices are automatically calculated based on selected services</li>
            <li>• Inactive services won't appear in the contract creation form</li>
            <li>• Deleting a service that's in use by contracts is not allowed</li>
            <li>• Use categories to organize services (e.g., Monitoring, Video Services, Add-ons)</li>
          </ul>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmModal !== null}
        title={confirmModal?.title ?? ''}
        message={confirmModal?.message ?? ''}
        onConfirm={() => { confirmModal?.onConfirm(); setConfirmModal(null); }}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}
