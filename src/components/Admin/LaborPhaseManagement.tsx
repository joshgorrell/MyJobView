import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, CreditCard as Edit2, Trash2, Save, X, DollarSign, Wrench, AlertCircle } from 'lucide-react';
import { formatCurrency } from '../../lib/utils';
import ConfirmModal from '../ui/ConfirmModal';

interface LaborPhase {
  id: string;
  name: string;
  description: string | null;
  default_cost: number;
  default_price: number;
  sort_order: number;
  is_active: boolean;
}

export function LaborPhaseManagement() {
  const [phases, setPhases] = useState<LaborPhase[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    default_cost: 0,
    default_price: 100
  });

  useEffect(() => {
    loadPhases();
  }, []);

  async function loadPhases() {
    try {
      const { data, error } = await supabase
        .from('labor_phases')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setPhases(data || []);
    } catch (error) {
      console.error('Error loading labor phases:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!formData.name.trim()) {
      alert('Please enter a phase name');
      return;
    }

    if (formData.default_cost > formData.default_price) {
      alert('Cost cannot be greater than price');
      return;
    }

    try {
      if (editingId) {
        // Update existing phase
        const { error } = await supabase
          .from('labor_phases')
          .update({
            name: formData.name.trim(),
            description: formData.description.trim() || null,
            default_cost: formData.default_cost,
            default_price: formData.default_price,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingId);

        if (error) throw error;
      } else {
        // Create new phase
        const maxSortOrder = Math.max(...phases.map(p => p.sort_order), 0);
        const { error } = await supabase
          .from('labor_phases')
          .insert({
            name: formData.name.trim(),
            description: formData.description.trim() || null,
            default_cost: formData.default_cost,
            default_price: formData.default_price,
            sort_order: maxSortOrder + 1,
            is_active: true
          });

        if (error) throw error;
      }

      setFormData({ name: '', description: '', default_cost: 0, default_price: 100 });
      setEditingId(null);
      setShowAddForm(false);
      loadPhases();
    } catch (error: any) {
      console.error('Error saving labor phase:', error);
      if (error.code === '23505') {
        alert('A labor phase with this name already exists');
      } else {
        alert('Failed to save labor phase');
      }
    }
  }

  function handleEdit(phase: LaborPhase) {
    setFormData({
      name: phase.name,
      description: phase.description || '',
      default_cost: phase.default_cost,
      default_price: phase.default_price
    });
    setEditingId(phase.id);
    setShowAddForm(true);
  }

  function handleCancel() {
    setFormData({ name: '', description: '', default_cost: 0, default_price: 100 });
    setEditingId(null);
    setShowAddForm(false);
  }

  async function handleToggleActive(id: string, currentStatus: boolean) {
    try {
      const { error } = await supabase
        .from('labor_phases')
        .update({ is_active: !currentStatus, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      loadPhases();
    } catch (error) {
      console.error('Error toggling phase status:', error);
      alert('Failed to update phase status');
    }
  }

  async function handleDelete(id: string) {
    try {
      const { error } = await supabase
        .from('labor_phases')
        .delete()
        .eq('id', id);

      if (error) throw error;
      loadPhases();
    } catch (error) {
      console.error('Error deleting labor phase:', error);
      alert('Failed to delete labor phase. It may be in use by products.');
    }
  }

  if (loading) {
    return <div className="text-center py-8">Loading labor phases...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Wrench className="w-5 h-5" />
            Labor Phases & Hourly Rates
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Configure labor phases and default hourly rates for product pricing
          </p>
        </div>
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Phase
          </button>
        )}
      </div>

      {showAddForm && (
        <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6">
          <h4 className="font-semibold text-gray-900 mb-4">
            {editingId ? 'Edit Labor Phase' : 'Add New Labor Phase'}
          </h4>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phase Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Installation, Service Call, Troubleshooting"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description (Optional)
              </label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of this labor phase"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Company Cost (per hour) *
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.default_cost || ''}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      default_cost: e.target.value === '' ? 0 : parseFloat(e.target.value)
                    }))}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  What you pay employees/contractors
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Customer Price (per hour) *
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.default_price || ''}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      default_price: e.target.value === '' ? 0 : parseFloat(e.target.value)
                    }))}
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  What you charge customers
                </p>
              </div>
            </div>

            {formData.default_price > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="text-sm">
                  <span className="font-medium text-gray-700">Profit Margin: </span>
                  <span className="text-green-700 font-semibold">
                    {((formData.default_price - formData.default_cost) / formData.default_price * 100).toFixed(1)}%
                  </span>
                  <span className="text-gray-600 ml-2">
                    ({formatCurrency(formData.default_price - formData.default_cost)} profit per hour)
                  </span>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                {editingId ? 'Update' : 'Save'}
              </button>
              <button
                onClick={handleCancel}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 flex items-center gap-2"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {phases.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <Wrench className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">No labor phases configured</p>
          <p className="text-sm text-gray-500 mt-1">
            Add your first labor phase to start tracking labor costs
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Phase Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Company Cost
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Customer Price
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Profit Margin
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {phases.map((phase) => {
                const profitMargin = phase.default_price > 0
                  ? ((phase.default_price - phase.default_cost) / phase.default_price * 100)
                  : 0;
                const profitPerHour = phase.default_price - phase.default_cost;

                return (
                  <tr key={phase.id} className={!phase.is_active ? 'bg-gray-50 opacity-60' : ''}>
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{phase.name}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-600">
                        {phase.description || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {formatCurrency(phase.default_cost)}/hr
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-gray-900">
                        {formatCurrency(phase.default_price)}/hr
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <div className={`font-semibold ${
                          profitMargin >= 50 ? 'text-green-600' :
                          profitMargin >= 30 ? 'text-yellow-600' :
                          'text-red-600'
                        }`}>
                          {profitMargin.toFixed(1)}%
                        </div>
                        <div className="text-xs text-gray-500">
                          {formatCurrency(profitPerHour)}/hr
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleToggleActive(phase.id, phase.is_active)}
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          phase.is_active
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {phase.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEdit(phase)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                          title="Edit phase"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(phase.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                          title="Delete phase"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3">
        <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800">
          <p className="font-medium mb-1">Important Notes:</p>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Company Cost:</strong> What you pay employees/contractors per hour (internal cost)</li>
            <li><strong>Customer Price:</strong> What you charge customers per hour (revenue)</li>
            <li><strong>Profit Margin:</strong> Automatically calculated as (Price - Cost) / Price × 100</li>
            <li>These values are used in products, proposals, and profit margin reports</li>
            <li>Products can override these defaults with custom labor hours and rates</li>
            <li>Inactive phases won't appear in product forms but existing assignments remain</li>
            <li>Deleting a phase in use by products may fail - deactivate it instead</li>
          </ul>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmDeleteId !== null}
        title="Delete Labor Phase"
        message="Are you sure you want to delete this labor phase? This action cannot be undone."
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
