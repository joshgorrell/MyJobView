import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Edit2, Trash2, Save, X, Check, AlertCircle, Package } from 'lucide-react';
import ConfirmModal from '../ui/ConfirmModal';

type CatalogType = 'categories' | 'subcategories' | 'vendors' | 'manufacturers' | 'colors';

interface Category {
  id: string;
  name: string;
  sort_order: number;
}

interface Subcategory {
  id: string;
  category_id: string;
  name: string;
  sort_order: number;
  category?: { name: string };
}

interface Vendor {
  id: string;
  vendor_name: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
}

interface Manufacturer {
  id: string;
  name: string;
  website?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
}

interface Color {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export default function CatalogManagement() {
  const [activeTab, setActiveTab] = useState<CatalogType>('categories');
  const [items, setItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'subcategories') {
      loadCategories();
    }
  }, [activeTab]);

  async function loadCategories() {
    try {
      const { data, error } = await supabase
        .from('product_categories')
        .select('*')
        .order('sort_order');

      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  }

  async function loadData() {
    try {
      setLoading(true);
      setError(null);

      let query;
      switch (activeTab) {
        case 'categories':
          query = supabase.from('product_categories').select('*').order('name');
          break;
        case 'subcategories':
          query = supabase
            .from('product_subcategories')
            .select('*, category:product_categories(name)')
            .order('name');
          break;
        case 'vendors':
          query = supabase.from('vendors').select('*').order('vendor_name');
          break;
        case 'manufacturers':
          query = supabase.from('manufacturers').select('*').order('name');
          break;
        case 'colors':
          query = supabase.from('product_colors').select('*').order('name');
          break;
      }

      const { data, error } = await query;
      if (error) throw error;
      setItems(data || []);
    } catch (error: any) {
      console.error('Error loading data:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }

  function handleAdd() {
    setShowAddForm(true);
    setEditingId(null);
    setFormData(activeTab === 'subcategories' ? { category_id: '' } : {});
    setError(null);
  }

  function handleEdit(item: any) {
    setEditingId(item.id);
    setFormData({ ...item });
    setShowAddForm(false);
    setError(null);
  }

  function handleCancel() {
    setEditingId(null);
    setShowAddForm(false);
    setFormData({});
    setError(null);
  }

  async function handleSave() {
    try {
      setError(null);

      let query;
      let tableName: string;

      switch (activeTab) {
        case 'categories':
          if (!formData.name?.trim()) {
            setError('Category name is required');
            return;
          }
          tableName = 'product_categories';
          break;
        case 'subcategories':
          if (!formData.name?.trim()) {
            setError('Subcategory name is required');
            return;
          }
          if (!formData.category_id) {
            setError('Category is required');
            return;
          }
          tableName = 'product_subcategories';
          break;
        case 'vendors':
          if (!formData.vendor_name?.trim()) {
            setError('Vendor name is required');
            return;
          }
          tableName = 'vendors';
          break;
        case 'manufacturers':
          if (!formData.name?.trim()) {
            setError('Manufacturer name is required');
            return;
          }
          tableName = 'manufacturers';
          break;
        case 'colors':
          if (!formData.name?.trim()) {
            setError('Color name is required');
            return;
          }
          tableName = 'product_colors';
          break;
        default:
          return;
      }

      if (editingId) {
        // Update existing - remove nested relationship data
        const updateData = { ...formData };
        delete updateData.category; // Remove joined data

        const { error } = await supabase
          .from(tableName)
          .update(updateData)
          .eq('id', editingId);

        if (error) throw error;
        setSuccessMessage('Updated successfully');
      } else {
        // Insert new
        const { error } = await supabase
          .from(tableName)
          .insert(formData);

        if (error) throw error;
        setSuccessMessage('Added successfully');
      }

      handleCancel();
      loadData();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error: any) {
      console.error('Error saving:', error);
      setError(error.message || 'Failed to save');
    }
  }

  async function handleDelete(id: string) {
    try {
      setError(null);
      let tableName: string;

      switch (activeTab) {
        case 'categories':
          tableName = 'product_categories';
          break;
        case 'subcategories':
          tableName = 'product_subcategories';
          break;
        case 'vendors':
          tableName = 'vendors';
          break;
        case 'manufacturers':
          tableName = 'manufacturers';
          break;
        case 'colors':
          tableName = 'product_colors';
          break;
        default:
          return;
      }

      const { error } = await supabase.from(tableName).delete().eq('id', id);

      if (error) throw error;
      setSuccessMessage('Deleted successfully');
      loadData();
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error: any) {
      console.error('Error deleting:', error);
      setError(error.message || 'Failed to delete. This item may be in use.');
    }
  }

  function renderForm() {
    if (!showAddForm && !editingId) return null;

    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            {editingId ? 'Edit' : 'Add New'} {activeTab.slice(0, -1)}
          </h3>
          <button onClick={handleCancel} className="text-gray-500 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3">
          {activeTab === 'categories' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Cameras, Sensors"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sort Order
                </label>
                <input
                  type="number"
                  value={formData.sort_order || 0}
                  onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </>
          )}

          {activeTab === 'subcategories' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.category_id || ''}
                  onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select Category</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Subcategory Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Indoor Cameras, Motion Sensors"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sort Order
                </label>
                <input
                  type="number"
                  value={formData.sort_order || 0}
                  onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </>
          )}

          {activeTab === 'vendors' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Vendor Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.vendor_name || ''}
                  onChange={(e) => setFormData({ ...formData, vendor_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., ADI, Snap AV"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact Name
                </label>
                <input
                  type="text"
                  value={formData.contact_name || ''}
                  onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact Email
                </label>
                <input
                  type="email"
                  value={formData.contact_email || ''}
                  onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact Phone
                </label>
                <input
                  type="tel"
                  value={formData.contact_phone || ''}
                  onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </>
          )}

          {activeTab === 'manufacturers' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Manufacturer Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Honeywell, 2GIG"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Website
                </label>
                <input
                  type="url"
                  value={formData.website || ''}
                  onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="https://"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact Name
                </label>
                <input
                  type="text"
                  value={formData.contact_name || ''}
                  onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact Email
                </label>
                <input
                  type="email"
                  value={formData.contact_email || ''}
                  onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact Phone
                </label>
                <input
                  type="tel"
                  value={formData.contact_phone || ''}
                  onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </>
          )}

          {activeTab === 'colors' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Color/Finish Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., White, Black, Brushed Nickel"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sort Order
                </label>
                <input
                  type="number"
                  value={formData.sort_order || 0}
                  onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active !== false}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="is_active" className="text-sm font-medium text-gray-700">
                  Active
                </label>
              </div>
            </>
          )}

          {error && (
            <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <button
              onClick={handleCancel}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              Save
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderTable() {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      );
    }

    if (items.length === 0) {
      return (
        <div className="text-center py-12">
          <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">No items found. Click "Add New" to create one.</p>
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {activeTab === 'categories' && (
                <>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Name</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Sort Order</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Actions</th>
                </>
              )}

              {activeTab === 'subcategories' && (
                <>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Category</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Subcategory</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Sort Order</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Actions</th>
                </>
              )}

              {activeTab === 'vendors' && (
                <>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Vendor Name</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Contact</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Actions</th>
                </>
              )}

              {activeTab === 'manufacturers' && (
                <>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Manufacturer Name</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Website</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Contact</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Actions</th>
                </>
              )}

              {activeTab === 'colors' && (
                <>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Color/Finish</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Sort Order</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">Actions</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50">
                {activeTab === 'categories' && (
                  <>
                    <td className="px-4 py-3 text-sm text-gray-900">{item.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{item.sort_order}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEdit(item)}
                          className="p-1 text-blue-600 hover:text-blue-700"
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(item.id)}
                          className="p-1 text-red-600 hover:text-red-700"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </>
                )}

                {activeTab === 'subcategories' && (
                  <>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {(item as Subcategory).category?.name || 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">{item.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{item.sort_order}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEdit(item)}
                          className="p-1 text-blue-600 hover:text-blue-700"
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(item.id)}
                          className="p-1 text-red-600 hover:text-red-700"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </>
                )}

                {activeTab === 'vendors' && (
                  <>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {(item as Vendor).vendor_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {(item as Vendor).contact_name && (
                        <div>
                          <div>{(item as Vendor).contact_name}</div>
                          {(item as Vendor).contact_email && (
                            <div className="text-xs text-blue-600">{(item as Vendor).contact_email}</div>
                          )}
                          {(item as Vendor).contact_phone && (
                            <div className="text-xs text-gray-500">{(item as Vendor).contact_phone}</div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEdit(item)}
                          className="p-1 text-blue-600 hover:text-blue-700"
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(item.id)}
                          className="p-1 text-red-600 hover:text-red-700"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </>
                )}

                {activeTab === 'manufacturers' && (
                  <>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {(item as Manufacturer).name}
                    </td>
                    <td className="px-4 py-3 text-sm text-blue-600">
                      {(item as Manufacturer).website && (
                        <a
                          href={(item as Manufacturer).website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                        >
                          {(item as Manufacturer).website}
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {(item as Manufacturer).contact_name && (
                        <div>
                          <div>{(item as Manufacturer).contact_name}</div>
                          {(item as Manufacturer).contact_email && (
                            <div className="text-xs text-blue-600">{(item as Manufacturer).contact_email}</div>
                          )}
                          {(item as Manufacturer).contact_phone && (
                            <div className="text-xs text-gray-500">{(item as Manufacturer).contact_phone}</div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEdit(item)}
                          className="p-1 text-blue-600 hover:text-blue-700"
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(item.id)}
                          className="p-1 text-red-600 hover:text-red-700"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </>
                )}

                {activeTab === 'colors' && (
                  <>
                    <td className="px-4 py-3 text-sm text-gray-900">{item.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{item.sort_order}</td>
                    <td className="px-4 py-3 text-sm">
                      {(item as Color).is_active ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                          <Check className="h-3 w-3" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEdit(item)}
                          className="p-1 text-blue-600 hover:text-blue-700"
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(item.id)}
                          className="p-1 text-red-600 hover:text-red-700"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Product Catalog Management</h2>
          <p className="text-sm text-gray-600 mt-1">
            Manage categories, vendors, manufacturers, and color options
          </p>
        </div>
        <button
          onClick={handleAdd}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Add New
        </button>
      </div>

      {successMessage && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <Check className="h-5 w-5" />
          {successMessage}
        </div>
      )}

      {error && !editingId && !showAddForm && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          {error}
        </div>
      )}

      <div className="flex gap-2 border-b border-gray-200 overflow-x-auto">
        <button
          onClick={() => setActiveTab('categories')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'categories'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Categories
        </button>
        <button
          onClick={() => setActiveTab('subcategories')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'subcategories'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Subcategories
        </button>
        <button
          onClick={() => setActiveTab('vendors')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'vendors'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Vendors
        </button>
        <button
          onClick={() => setActiveTab('manufacturers')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'manufacturers'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Manufacturers
        </button>
        <button
          onClick={() => setActiveTab('colors')}
          className={`px-4 py-2 font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'colors'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Colors/Finishes
        </button>
      </div>

      {renderForm()}

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {renderTable()}
      </div>

      <ConfirmModal
        isOpen={confirmDeleteId !== null}
        title="Delete Item"
        message="Are you sure you want to delete this item? This cannot be undone."
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => {
          if (confirmDeleteId) handleDelete(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
