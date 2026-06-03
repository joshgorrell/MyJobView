import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Trash2, GripVertical, Save } from 'lucide-react';

interface ProposalClass {
  id: string;
  name: string;
  description: string | null;
  color: string;
  sort_order: number;
  is_active: boolean;
}

export default function ClassManager() {
  const [classes, setClasses] = useState<ProposalClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);

  useEffect(() => {
    loadClasses();
  }, []);

  async function loadClasses() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('proposal_classes')
        .select('*')
        .order('name');

      if (error) throw error;
      setClasses(data || []);
    } catch (error) {
      console.error('Error loading classes:', error);
    } finally {
      setLoading(false);
    }
  }

  async function addClass() {
    try {
      const { data, error } = await supabase
        .from('proposal_classes')
        .insert({
          name: 'New Class',
          color: '#3B82F6',
          sort_order: classes.length,
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;
      setClasses([...classes, data]);
      setEditingId(data.id);
      setShowNewForm(false);
    } catch (error) {
      console.error('Error adding class:', error);
    }
  }

  async function updateClass(id: string, updates: Partial<ProposalClass>) {
    try {
      const { error } = await supabase
        .from('proposal_classes')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      setClasses(classes.map(cls =>
        cls.id === id ? { ...cls, ...updates } : cls
      ));
    } catch (error) {
      console.error('Error updating class:', error);
    }
  }

  async function deleteClass(id: string) {
    if (!confirm('Delete this class? Items using this class will have it removed.')) return;

    try {
      const { error } = await supabase
        .from('proposal_classes')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setClasses(classes.filter(cls => cls.id !== id));
    } catch (error) {
      console.error('Error deleting class:', error);
    }
  }

  if (loading) {
    return <div className="text-white">Loading...</div>;
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">Proposal Classes</h2>
        <button
          onClick={addClass}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
        >
          <Plus size={18} />
          Add Class
        </button>
      </div>

      <p className="text-sm text-gray-400 mb-6">
        Classes help organize line items for reporting. Group items like "Wiring", "Equipment", "Labor", etc.
        to easily show customers itemized totals by category.
      </p>

      <div className="space-y-2">
        {classes.map((cls, index) => (
          <div
            key={cls.id}
            className="bg-gray-900 rounded-lg p-4 flex items-center gap-4"
          >
            <div className="text-gray-400 cursor-grab">
              <GripVertical size={20} />
            </div>

            {editingId === cls.id ? (
              <>
                <input
                  type="text"
                  value={cls.name}
                  onChange={(e) => updateClass(cls.id, { name: e.target.value })}
                  className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
                  placeholder="Class name"
                />
                <input
                  type="color"
                  value={cls.color}
                  onChange={(e) => updateClass(cls.id, { color: e.target.value })}
                  className="w-12 h-10 bg-gray-800 border border-gray-700 rounded cursor-pointer"
                />
                <button
                  onClick={() => setEditingId(null)}
                  className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded flex items-center gap-2"
                >
                  <Save size={16} />
                  Done
                </button>
              </>
            ) : (
              <>
                <div
                  className="w-4 h-4 rounded"
                  style={{ backgroundColor: cls.color }}
                />
                <span className="flex-1 text-white font-medium">{cls.name}</span>
                <label className="flex items-center gap-2 text-sm text-gray-400">
                  <input
                    type="checkbox"
                    checked={cls.is_active}
                    onChange={(e) => updateClass(cls.id, { is_active: e.target.checked })}
                    className="rounded border-gray-600 text-blue-600 focus:ring-blue-500"
                  />
                  Active
                </label>
                <button
                  onClick={() => setEditingId(cls.id)}
                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm"
                >
                  Edit
                </button>
                <button
                  onClick={() => deleteClass(cls.id)}
                  className="text-gray-400 hover:text-red-400"
                >
                  <Trash2 size={18} />
                </button>
              </>
            )}
          </div>
        ))}

        {classes.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No classes yet. Add your first class to get started.
          </div>
        )}
      </div>
    </div>
  );
}
