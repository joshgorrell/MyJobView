import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { FileText, Plus, Edit2, Trash2, Eye, ToggleLeft, ToggleRight } from 'lucide-react';
import TemplateBuilder from './TemplateBuilder';
import ConfirmModal from '../ui/ConfirmModal';

interface Template {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
  requires_approval: boolean;
  auto_create_subscription: boolean;
  contract_terms: string;
  created_at: string;
}

export default function TemplateManagement() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [confirmDeleteTemplate, setConfirmDeleteTemplate] = useState<Template | null>(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    try {
      const { data, error } = await supabase
        .from('security_contract_templates')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Error loading templates:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleActive(template: Template) {
    try {
      const { error } = await supabase
        .from('security_contract_templates')
        .update({ is_active: !template.is_active })
        .eq('id', template.id);

      if (error) throw error;
      loadTemplates();
    } catch (error) {
      console.error('Error toggling template:', error);
      alert('Failed to update template');
    }
  }

  async function handleDelete(template: Template) {
    try {
      const { error } = await supabase
        .from('security_contract_templates')
        .delete()
        .eq('id', template.id);

      if (error) throw error;
      loadTemplates();
    } catch (error) {
      console.error('Error deleting template:', error);
      alert('Failed to delete template');
    }
  }

  function handleEdit(template: Template) {
    setEditingTemplate(template);
    setShowBuilder(true);
  }

  function handleAdd() {
    setEditingTemplate(null);
    setShowBuilder(true);
  }

  if (showBuilder) {
    return (
      <TemplateBuilder
        template={editingTemplate}
        onClose={() => {
          setShowBuilder(false);
          setEditingTemplate(null);
        }}
        onSave={() => {
          setShowBuilder(false);
          setEditingTemplate(null);
          loadTemplates();
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading templates...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contract Templates</h1>
          <p className="text-gray-600 mt-1">Manage security contract templates and terms</p>
        </div>
        <button
          onClick={handleAdd}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Template
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600 mb-4">No templates created yet</p>
          <button
            onClick={handleAdd}
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            Create your first template
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Template Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Settings
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {templates.map((template) => (
                <tr key={template.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <FileText className="w-5 h-5 text-gray-400" />
                      <span className="font-medium text-gray-900">{template.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {template.description || 'No description'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-1 text-xs text-gray-600">
                      {template.requires_approval && (
                        <div className="flex items-center gap-1">
                          <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                          Requires Approval
                        </div>
                      )}
                      {template.auto_create_subscription && (
                        <div className="flex items-center gap-1">
                          <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                          Auto Subscription
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleToggleActive(template)}
                      className="flex items-center gap-2"
                    >
                      {template.is_active ? (
                        <>
                          <ToggleRight className="w-6 h-6 text-green-600" />
                          <span className="text-sm text-green-600 font-medium">Active</span>
                        </>
                      ) : (
                        <>
                          <ToggleLeft className="w-6 h-6 text-gray-400" />
                          <span className="text-sm text-gray-500">Inactive</span>
                        </>
                      )}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleEdit(template)}
                        className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteTemplate(template)}
                        className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmModal
        isOpen={confirmDeleteTemplate !== null}
        title="Delete Template"
        message={confirmDeleteTemplate ? `Are you sure you want to delete "${confirmDeleteTemplate.name}"?` : ''}
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => {
          if (confirmDeleteTemplate) {
            handleDelete(confirmDeleteTemplate);
          }
          setConfirmDeleteTemplate(null);
        }}
        onCancel={() => setConfirmDeleteTemplate(null)}
      />
    </div>
  );
}
