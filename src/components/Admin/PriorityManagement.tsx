import { useState, useEffect } from 'react';
import { Flag, Plus, Edit2, Trash2, Save, X, MoveUp, MoveDown } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmModal from '../ui/ConfirmModal';

interface PriorityLevel {
  id: string;
  name: string;
  slug: string;
  color: string;
  sort_order: number;
  is_active: boolean;
}

export function PriorityManagement() {
  const { profile } = useAuth();
  const [priorities, setPriorities] = useState<PriorityLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPriority, setEditingPriority] = useState<PriorityLevel | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    color: '#6B7280',
    is_active: true,
  });

  useEffect(() => {
    loadPriorities();
  }, []);

  async function loadPriorities() {
    try {
      const { data, error } = await supabase
        .from('priority_levels')
        .select('*')
        .order('sort_order');

      if (error) throw error;
      setPriorities(data || []);
    } catch (error) {
      console.error('Error loading priorities:', error);
    } finally {
      setLoading(false);
    }
  }

  function generateSlug(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  }

  function startEdit(priority: PriorityLevel) {
    setEditingPriority(priority);
    setFormData({
      name: priority.name,
      slug: priority.slug,
      color: priority.color,
      is_active: priority.is_active,
    });
    setShowForm(true);
  }

  function resetForm() {
    setEditingPriority(null);
    setShowForm(false);
    setFormData({
      name: '',
      slug: '',
      color: '#6B7280',
      is_active: true,
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.name.trim()) {
      alert('Priority name is required');
      return;
    }

    try {
      const slug = formData.slug || generateSlug(formData.name);

      if (editingPriority) {
        const { error } = await supabase
          .from('priority_levels')
          .update({
            name: formData.name,
            slug,
            color: formData.color,
            is_active: formData.is_active,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingPriority.id);

        if (error) throw error;
      } else {
        const maxSortOrder = priorities.length > 0
          ? Math.max(...priorities.map(p => p.sort_order))
          : 0;

        const { error } = await supabase
          .from('priority_levels')
          .insert([{
            company_id: profile?.id,
            name: formData.name,
            slug,
            color: formData.color,
            is_active: formData.is_active,
            sort_order: maxSortOrder + 1,
          }]);

        if (error) throw error;
      }

      resetForm();
      loadPriorities();
    } catch (error: any) {
      console.error('Error saving priority:', error);
      alert('Failed to save priority: ' + error.message);
    }
  }

  async function deletePriority(id: string) {
    try {
      const { error } = await supabase
        .from('priority_levels')
        .delete()
        .eq('id', id);

      if (error) throw error;
      loadPriorities();
    } catch (error: any) {
      console.error('Error deleting priority:', error);
      alert('Failed to delete priority: ' + error.message);
    }
  }

  async function movePriority(id: string, direction: 'up' | 'down') {
    const index = priorities.findIndex(p => p.id === id);
    if (index === -1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= priorities.length) return;

    const current = priorities[index];
    const target = priorities[targetIndex];

    try {
      await Promise.all([
        supabase
          .from('priority_levels')
          .update({ sort_order: target.sort_order })
          .eq('id', current.id),
        supabase
          .from('priority_levels')
          .update({ sort_order: current.sort_order })
          .eq('id', target.id),
      ]);

      loadPriorities();
    } catch (error: any) {
      console.error('Error moving priority:', error);
      alert('Failed to reorder priority: ' + error.message);
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    try {
      const { error } = await supabase
        .from('priority_levels')
        .update({ is_active: !isActive })
        .eq('id', id);

      if (error) throw error;
      loadPriorities();
    } catch (error: any) {
      console.error('Error toggling priority:', error);
      alert('Failed to update priority: ' + error.message);
    }
  }

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold text-gray-900">Priority Levels</h3>
          <p className="text-gray-600 text-sm mt-1">Manage task priority levels and their display order</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Priority
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold text-gray-900">
              {editingPriority ? 'Edit Priority' : 'New Priority'}
            </h4>
            <button
              onClick={resetForm}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Priority Name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., High, Medium, Low"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Slug (auto-generated if empty)
              </label>
              <input
                type="text"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., high, medium, low"
              />
              <p className="text-xs text-gray-500 mt-1">
                Used internally. Leave empty to auto-generate from name.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Color
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="h-10 w-20 border border-gray-300 rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="#6B7280"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="w-4 h-4 text-blue-600"
              />
              <label htmlFor="is_active" className="text-sm text-gray-700">
                Active (available for use)
              </label>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={resetForm}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                {editingPriority ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-2">
        {priorities.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No priority levels configured. Add your first priority to get started.
          </div>
        ) : (
          priorities.map((priority, index) => (
            <div
              key={priority.id}
              className={`flex items-center justify-between p-4 border rounded-lg ${
                priority.is_active ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-300 opacity-60'
              }`}
            >
              <div className="flex items-center gap-4 flex-1">
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => movePriority(priority.id, 'up')}
                    disabled={index === 0}
                    className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <MoveUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => movePriority(priority.id, 'down')}
                    disabled={index === priorities.length - 1}
                    className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <MoveDown className="w-4 h-4" />
                  </button>
                </div>

                <div
                  className="w-8 h-8 rounded flex items-center justify-center"
                  style={{ backgroundColor: priority.color }}
                >
                  <Flag className="w-4 h-4 text-white" />
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-gray-900">{priority.name}</h4>
                    {!priority.is_active && (
                      <span className="px-2 py-0.5 bg-gray-200 text-gray-600 text-xs rounded">
                        Inactive
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">slug: {priority.slug}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleActive(priority.id, priority.is_active)}
                  className={`px-3 py-1 text-sm rounded ${
                    priority.is_active
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      : 'bg-green-100 text-green-700 hover:bg-green-200'
                  }`}
                >
                  {priority.is_active ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  onClick={() => startEdit(priority)}
                  className="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setConfirmDeleteId(priority.id)}
                  className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <ConfirmModal
        isOpen={confirmDeleteId !== null}
        title="Delete Priority Level"
        message="Are you sure you want to delete this priority level?"
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => {
          if (confirmDeleteId) deletePriority(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
