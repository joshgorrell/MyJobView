import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Trash2, Save, Grid, Tag, FileText } from 'lucide-react';
import ProposalTemplateManager from '../Proposals/ProposalTemplateManager';
import ConfirmModal from '../ui/ConfirmModal';

interface AreaTemplate {
  id: string;
  name: string;
  sort_order: number;
}

interface ClassTemplate {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
}

export function ProposalTemplateSettings() {
  const [areas, setAreas] = useState<AreaTemplate[]>([]);
  const [classes, setClasses] = useState<ClassTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'pdftemplates' | 'areas' | 'classes'>('pdftemplates');
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; action: 'area' | 'class' } | null>(null);

  const [newAreaName, setNewAreaName] = useState('');
  const [newClassName, setNewClassName] = useState('');
  const [newClassDescription, setNewClassDescription] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [areasRes, classesRes] = await Promise.all([
        supabase
          .from('proposal_area_templates')
          .select('*')
          .order('sort_order'),
        supabase
          .from('proposal_class_templates')
          .select('*')
          .order('sort_order')
      ]);

      if (areasRes.data) setAreas(areasRes.data);
      if (classesRes.data) setClasses(classesRes.data);
    } catch (error) {
      console.error('Error loading templates:', error);
    } finally {
      setLoading(false);
    }
  }

  async function addArea() {
    if (!newAreaName.trim()) return;

    try {
      const maxOrder = Math.max(...areas.map(a => a.sort_order), 0);
      const { data, error } = await supabase
        .from('proposal_area_templates')
        .insert({
          name: newAreaName.trim(),
          sort_order: maxOrder + 1,
          company_id: null
        })
        .select()
        .single();

      if (error) throw error;
      if (data) {
        setAreas([...areas, data]);
        setNewAreaName('');
      }
    } catch (error) {
      console.error('Error adding area:', error);
      alert('Failed to add area');
    }
  }

  async function deleteArea(id: string) {
    try {
      const { error } = await supabase
        .from('proposal_area_templates')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setAreas(areas.filter(a => a.id !== id));
    } catch (error) {
      console.error('Error deleting area:', error);
      alert('Failed to delete area');
    }
  }

  async function addClass() {
    if (!newClassName.trim()) return;

    try {
      const maxOrder = Math.max(...classes.map(c => c.sort_order), 0);
      const { data, error } = await supabase
        .from('proposal_class_templates')
        .insert({
          name: newClassName.trim(),
          description: newClassDescription.trim() || null,
          sort_order: maxOrder + 1,
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;
      if (data) {
        setClasses([...classes, data]);
        setNewClassName('');
        setNewClassDescription('');
      }
    } catch (error) {
      console.error('Error adding class:', error);
      alert('Failed to add class');
    }
  }

  async function deleteClass(id: string) {
    try {
      const { error } = await supabase
        .from('proposal_class_templates')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setClasses(classes.filter(c => c.id !== id));
    } catch (error) {
      console.error('Error deleting class:', error);
      alert('Failed to delete class');
    }
  }

  async function updateAreaOrder(id: string, newOrder: number) {
    try {
      const { error } = await supabase
        .from('proposal_area_templates')
        .update({ sort_order: newOrder })
        .eq('id', id);

      if (error) throw error;

      const updated = areas.map(a => a.id === id ? { ...a, sort_order: newOrder } : a);
      setAreas(updated.sort((a, b) => a.sort_order - b.sort_order));
    } catch (error) {
      console.error('Error updating order:', error);
    }
  }

  async function updateClassOrder(id: string, newOrder: number) {
    try {
      const { error } = await supabase
        .from('proposal_class_templates')
        .update({ sort_order: newOrder })
        .eq('id', id);

      if (error) throw error;

      const updated = classes.map(c => c.id === id ? { ...c, sort_order: newOrder } : c);
      setClasses(updated.sort((a, b) => a.sort_order - b.sort_order));
    } catch (error) {
      console.error('Error updating order:', error);
    }
  }

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-1">Proposal Templates</h3>
        <p className="text-sm text-gray-600">Manage areas and classes for proposals</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-4">
          <button
            onClick={() => setActiveTab('pdftemplates')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'pdftemplates'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              PDF Templates
            </div>
          </button>
          <button
            onClick={() => setActiveTab('areas')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'areas'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <Grid className="w-4 h-4" />
              Areas/Rooms
            </div>
          </button>
          <button
            onClick={() => setActiveTab('classes')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'classes'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4" />
              Product Classes
            </div>
          </button>
        </nav>
      </div>

      {/* PDF Templates Tab */}
      {activeTab === 'pdftemplates' && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <ProposalTemplateManager />
        </div>
      )}

      {/* Areas Tab */}
      {activeTab === 'areas' && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
          <div>
            <h4 className="text-base font-semibold mb-2">Proposal Areas</h4>
            <p className="text-sm text-gray-600 mb-4">
              Define rooms or areas that can be added to proposals (Living Room, Kitchen, etc.)
            </p>
          </div>

          {/* Add New Area */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newAreaName}
              onChange={(e) => setNewAreaName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addArea()}
              placeholder="Enter area name (e.g., Living Room)"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              onClick={addArea}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Area
            </button>
          </div>

          {/* Areas List */}
          <div className="space-y-2">
            {areas.map((area, index) => (
              <div
                key={area.id}
                className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <input
                  type="number"
                  value={area.sort_order}
                  onChange={(e) => updateAreaOrder(area.id, parseInt(e.target.value) || 0)}
                  className="w-16 px-2 py-1 border border-gray-300 rounded text-sm text-center"
                />
                <span className="flex-1 font-medium">{area.name}</span>
                <button
                  onClick={() => setConfirmDelete({ id: area.id, action: 'area' })}
                  className="p-2 text-red-600 hover:bg-red-50 rounded"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {areas.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-8">
                No areas defined yet. Add your first area above.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Classes Tab */}
      {activeTab === 'classes' && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
          <div>
            <h4 className="text-base font-semibold mb-2">Product Classes</h4>
            <p className="text-sm text-gray-600 mb-4">
              Define product quality levels for proposals (Basic, Standard, Premium, etc.)
            </p>
          </div>

          {/* Add New Class */}
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && addClass()}
                placeholder="Class name (e.g., Premium)"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={addClass}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Class
              </button>
            </div>
            <input
              type="text"
              value={newClassDescription}
              onChange={(e) => setNewClassDescription(e.target.value)}
              placeholder="Description (optional)"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>

          {/* Classes List */}
          <div className="space-y-2">
            {classes.map((cls) => (
              <div
                key={cls.id}
                className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
              >
                <input
                  type="number"
                  value={cls.sort_order}
                  onChange={(e) => updateClassOrder(cls.id, parseInt(e.target.value) || 0)}
                  className="w-16 px-2 py-1 border border-gray-300 rounded text-sm text-center"
                />
                <div className="flex-1">
                  <div className="font-medium">{cls.name}</div>
                  {cls.description && (
                    <div className="text-sm text-gray-600 mt-1">{cls.description}</div>
                  )}
                </div>
                <button
                  onClick={() => setConfirmDelete({ id: cls.id, action: 'class' })}
                  className="p-2 text-red-600 hover:bg-red-50 rounded"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {classes.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-8">
                No classes defined yet. Add your first class above.
              </p>
            )}
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmDelete !== null}
        title={confirmDelete?.action === 'area' ? 'Delete Area' : 'Delete Class'}
        message={confirmDelete?.action === 'area' ? 'Are you sure you want to delete this area?' : 'Are you sure you want to delete this class?'}
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => {
          if (confirmDelete) {
            if (confirmDelete.action === 'area') deleteArea(confirmDelete.id);
            else deleteClass(confirmDelete.id);
          }
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
