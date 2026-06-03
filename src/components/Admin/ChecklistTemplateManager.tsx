import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Edit2, Trash2, CheckCircle, Save, X } from 'lucide-react';
import ConfirmModal from '../ui/ConfirmModal';

interface ChecklistItem {
  id: number;
  item: string;
  required: boolean;
}

interface Template {
  id: string;
  job_type: string;
  template_name: string;
  checklist_items: ChecklistItem[];
  required_photos: string[];
  requires_signature: boolean;
  is_active: boolean;
}

export function ChecklistTemplateManager() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const photoCategories = ['before', 'during', 'after', 'issue', 'solution', 'parts'];

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    try {
      const { data, error } = await supabase
        .from('job_completion_templates')
        .select('*')
        .order('job_type');

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Error loading templates:', error);
    } finally {
      setLoading(false);
    }
  }

  function startCreating() {
    setEditingTemplate({
      id: '',
      job_type: '',
      template_name: '',
      checklist_items: [{ id: 1, item: '', required: true }],
      required_photos: ['before', 'after'],
      requires_signature: true,
      is_active: true
    });
    setIsCreating(true);
  }

  function startEditing(template: Template) {
    setEditingTemplate({ ...template });
    setIsCreating(false);
  }

  function cancelEditing() {
    setEditingTemplate(null);
    setIsCreating(false);
  }

  function addChecklistItem() {
    if (!editingTemplate) return;
    const maxId = Math.max(0, ...editingTemplate.checklist_items.map(i => i.id));
    setEditingTemplate({
      ...editingTemplate,
      checklist_items: [
        ...editingTemplate.checklist_items,
        { id: maxId + 1, item: '', required: false }
      ]
    });
  }

  function updateChecklistItem(id: number, updates: Partial<ChecklistItem>) {
    if (!editingTemplate) return;
    setEditingTemplate({
      ...editingTemplate,
      checklist_items: editingTemplate.checklist_items.map(item =>
        item.id === id ? { ...item, ...updates } : item
      )
    });
  }

  function removeChecklistItem(id: number) {
    if (!editingTemplate) return;
    setEditingTemplate({
      ...editingTemplate,
      checklist_items: editingTemplate.checklist_items.filter(item => item.id !== id)
    });
  }

  function toggleRequiredPhoto(category: string) {
    if (!editingTemplate) return;
    const photos = editingTemplate.required_photos.includes(category)
      ? editingTemplate.required_photos.filter(p => p !== category)
      : [...editingTemplate.required_photos, category];
    setEditingTemplate({ ...editingTemplate, required_photos: photos });
  }

  async function saveTemplate() {
    if (!editingTemplate) return;

    if (!editingTemplate.job_type.trim() || !editingTemplate.template_name.trim()) {
      alert('Please fill in job type and template name');
      return;
    }

    if (editingTemplate.checklist_items.length === 0) {
      alert('Please add at least one checklist item');
      return;
    }

    if (editingTemplate.checklist_items.some(item => !item.item.trim())) {
      alert('Please fill in all checklist items');
      return;
    }

    try {
      const templateData = {
        job_type: editingTemplate.job_type.trim(),
        template_name: editingTemplate.template_name.trim(),
        checklist_items: editingTemplate.checklist_items,
        required_photos: editingTemplate.required_photos,
        requires_signature: editingTemplate.requires_signature,
        is_active: editingTemplate.is_active
      };

      if (isCreating) {
        const { error } = await supabase
          .from('job_completion_templates')
          .insert(templateData);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('job_completion_templates')
          .update(templateData)
          .eq('id', editingTemplate.id);

        if (error) throw error;
      }

      loadTemplates();
      cancelEditing();
    } catch (error) {
      console.error('Error saving template:', error);
      alert('Failed to save template');
    }
  }

  async function deleteTemplate(id: string) {
    try {
      const { error } = await supabase
        .from('job_completion_templates')
        .delete()
        .eq('id', id);

      if (error) throw error;
      loadTemplates();
    } catch (error) {
      console.error('Error deleting template:', error);
      alert('Failed to delete template');
    }
  }

  async function toggleActive(id: string, currentActive: boolean) {
    try {
      const { error } = await supabase
        .from('job_completion_templates')
        .update({ is_active: !currentActive })
        .eq('id', id);

      if (error) throw error;
      loadTemplates();
    } catch (error) {
      console.error('Error updating template:', error);
      alert('Failed to update template');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading templates...</div>
      </div>
    );
  }

  if (editingTemplate) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl sm:text-2xl font-bold text-white">
            {isCreating ? 'Create Template' : 'Edit Template'}
          </h2>
          <button
            onClick={cancelEditing}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            Cancel
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Job Type <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={editingTemplate.job_type}
                onChange={(e) => setEditingTemplate({ ...editingTemplate, job_type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., HVAC, Electrical, Plumbing"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Template Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={editingTemplate.template_name}
                onChange={(e) => setEditingTemplate({ ...editingTemplate, template_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., HVAC Installation Checklist"
              />
            </div>
          </div>

          {/* Checklist Items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-gray-700">
                Checklist Items
              </label>
              <button
                onClick={addChecklistItem}
                className="flex items-center gap-2 px-3 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
              >
                <Plus className="w-4 h-4" />
                Add Item
              </button>
            </div>
            <div className="space-y-2">
              {editingTemplate.checklist_items.map((item) => (
                <div key={item.id} className="flex items-start gap-2">
                  <input
                    type="text"
                    value={item.item}
                    onChange={(e) => updateChecklistItem(item.id, { item: e.target.value })}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter checklist item..."
                  />
                  <label className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={item.required}
                      onChange={(e) => updateChecklistItem(item.id, { required: e.target.checked })}
                    />
                    <span className="text-sm text-gray-700">Required</span>
                  </label>
                  <button
                    onClick={() => removeChecklistItem(item.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Required Photos */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Required Photos
            </label>
            <div className="grid grid-cols-3 gap-2">
              {photoCategories.map(category => (
                <label
                  key={category}
                  className={`flex items-center gap-2 px-3 py-2 border-2 rounded-lg cursor-pointer transition-colors ${
                    editingTemplate.required_photos.includes(category)
                      ? 'bg-blue-50 border-blue-500 text-blue-900'
                      : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={editingTemplate.required_photos.includes(category)}
                    onChange={() => toggleRequiredPhoto(category)}
                    className="rounded"
                  />
                  <span className="text-sm capitalize">{category}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Settings */}
          <div className="space-y-3 pt-4 border-t border-gray-200">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={editingTemplate.requires_signature}
                onChange={(e) => setEditingTemplate({ ...editingTemplate, requires_signature: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm text-gray-700">Require customer signature</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={editingTemplate.is_active}
                onChange={(e) => setEditingTemplate({ ...editingTemplate, is_active: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm text-gray-700">Active (available for use)</span>
            </label>
          </div>

          {/* Save Button */}
          <div className="flex gap-3 pt-4">
            <button
              onClick={saveTemplate}
              className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700"
            >
              <Save className="w-4 h-4" />
              Save Template
            </button>
            <button
              onClick={cancelEditing}
              className="px-6 py-3 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white">Checklist Templates</h2>
          <p className="text-gray-300">Manage job completion checklist templates</p>
        </div>
        <button
          onClick={startCreating}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          Create Template
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map(template => (
          <div
            key={template.id}
            className={`bg-white rounded-xl shadow-sm border-2 p-4 ${
              template.is_active ? 'border-gray-200' : 'border-gray-300 opacity-60'
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">{template.template_name}</h3>
                <p className="text-gray-300">{template.job_type}</p>
              </div>
              <div className="flex items-center gap-1">
                {template.is_active ? (
                  <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                    Active
                  </span>
                ) : (
                  <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded-full">
                    Inactive
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-2 text-sm mb-4">
              <div className="flex items-center gap-2 text-gray-600">
                <CheckCircle className="w-4 h-4" />
                <span>
                  {template.checklist_items.length} items
                  ({template.checklist_items.filter(i => i.required).length} required)
                </span>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <span>📸</span>
                <span>{template.required_photos.length} required photos</span>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <span>✍️</span>
                <span>{template.requires_signature ? 'Signature required' : 'No signature'}</span>
              </div>
            </div>

            <div className="flex gap-2 pt-3 border-t border-gray-200">
              <button
                onClick={() => startEditing(template)}
                className="flex-1 flex items-center justify-center gap-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
              >
                <Edit2 className="w-4 h-4" />
                Edit
              </button>
              <button
                onClick={() => toggleActive(template.id, template.is_active)}
                className="px-3 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300"
              >
                {template.is_active ? 'Deactivate' : 'Activate'}
              </button>
              <button
                onClick={() => setConfirmDeleteId(template.id)}
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {templates.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <CheckCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 mb-4">No templates created yet</p>
          <button
            onClick={startCreating}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 mx-auto"
          >
            <Plus className="w-4 h-4" />
            Create First Template
          </button>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmDeleteId !== null}
        title="Delete Template"
        message="Delete this template? This cannot be undone."
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => {
          if (confirmDeleteId) deleteTemplate(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
