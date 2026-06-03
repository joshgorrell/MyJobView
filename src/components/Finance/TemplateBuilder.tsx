import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { ArrowLeft, Save } from 'lucide-react';

interface TemplateBuilderProps {
  template: any;
  onClose: () => void;
  onSave: () => void;
}

export default function TemplateBuilder({ template, onClose, onSave }: TemplateBuilderProps) {
  const [formData, setFormData] = useState({
    name: template?.name || '',
    description: template?.description || '',
    requires_approval: template?.requires_approval || false,
    approval_role: template?.approval_role || 'admin',
    auto_create_subscription: template?.auto_create_subscription || true,
    contract_terms: template?.contract_terms || ''
  });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      if (template) {
        const { error } = await supabase
          .from('security_contract_templates')
          .update({
            ...formData,
            updated_at: new Date().toISOString()
          })
          .eq('id', template.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('security_contract_templates')
          .insert({
            ...formData,
            is_active: true
          });

        if (error) throw error;
      }

      onSave();
    } catch (error) {
      console.error('Error saving template:', error);
      alert('Failed to save template');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <button
          onClick={onClose}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to templates
        </button>
        <h1 className="text-2xl font-bold text-gray-900">
          {template ? 'Edit Template' : 'Create Template'}
        </h1>
        <p className="text-gray-600 mt-1">
          {template ? 'Update template settings and content' : 'Create a new contract template'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Template Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Standard Residential Monitoring"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of this template..."
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Settings</h3>

            <div className="space-y-4">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={formData.requires_approval}
                  onChange={(e) => setFormData({ ...formData, requires_approval: e.target.checked })}
                  className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded"
                />
                <div>
                  <div className="font-medium text-gray-900">Requires Approval</div>
                  <div className="text-sm text-gray-600">
                    Customer-completed contracts must be approved before activation
                  </div>
                </div>
              </label>

              {formData.requires_approval && (
                <div className="ml-7">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Approval Role
                  </label>
                  <select
                    value={formData.approval_role}
                    onChange={(e) => setFormData({ ...formData, approval_role: e.target.value })}
                    className="w-full max-w-xs px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="admin">Admin</option>
                    <option value="finance">Finance</option>
                    <option value="sales_manager">Sales Manager</option>
                  </select>
                </div>
              )}

              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={formData.auto_create_subscription}
                  onChange={(e) => setFormData({ ...formData, auto_create_subscription: e.target.checked })}
                  className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded"
                />
                <div>
                  <div className="font-medium text-gray-900">Auto-Create Subscription</div>
                  <div className="text-sm text-gray-600">
                    Automatically create a recurring subscription when contract is activated
                  </div>
                </div>
              </label>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Contract Terms & Conditions <span className="text-red-500">*</span>
            </label>
            <textarea
              value={formData.contract_terms}
              onChange={(e) => setFormData({ ...formData, contract_terms: e.target.value })}
              placeholder="Enter the complete contract terms and conditions here. You can use HTML for formatting."
              rows={20}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              required
            />
            <p className="mt-2 text-sm text-gray-600">
              You can use HTML formatting. This will be displayed to customers during the signing process.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Preview</h3>
          <div className="border border-gray-200 rounded-lg p-6 bg-gray-50 max-h-96 overflow-y-auto">
            <div className="prose prose-sm max-w-none">
              <h3 className="font-semibold mb-2">{formData.name || 'Template Name'}</h3>
              {formData.description && (
                <p className="text-gray-600 mb-4">{formData.description}</p>
              )}
              <div className="border-t border-gray-300 pt-4 mt-4">
                {formData.contract_terms ? (
                  <div dangerouslySetInnerHTML={{ __html: formData.contract_terms }} />
                ) : (
                  <p className="text-gray-400 italic">Contract terms will appear here...</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : template ? 'Update Template' : 'Create Template'}
          </button>
        </div>
      </form>
    </div>
  );
}
