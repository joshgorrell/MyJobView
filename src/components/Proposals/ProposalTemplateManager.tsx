import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Save, Plus, Copy, Trash2, Star, X, Eye, EyeOff, FileText, Settings } from 'lucide-react';
import ConfirmModal from '../ui/ConfirmModal';

interface ReportTemplate {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  is_personal: boolean;
  created_by: string | null;

  // Header & Basic Info
  show_company_logo: boolean;
  show_company_info: boolean;
  show_proposal_number: boolean;
  show_proposal_date: boolean;
  show_valid_until_date: boolean;
  show_proposal_title: boolean;
  show_customer_name: boolean;
  show_customer_address: boolean;
  show_customer_contact_info: boolean;
  show_jobsite_location: boolean;

  // Line Item Details
  show_line_item_description: boolean;
  show_manufacturer: boolean;
  show_sku: boolean;
  show_model_number: boolean;
  show_quantity: boolean;
  show_unit_price: boolean;
  show_line_item_total: boolean;
  show_item_cost: boolean;
  show_markup_percentage: boolean;

  // Area/Room Organization
  show_area_names: boolean;
  show_area_descriptions: boolean;
  show_area_subtotals: boolean;
  group_by_area: boolean;

  // Labor Details
  show_labor_phase: boolean;
  show_labor_hours: boolean;
  show_labor_rate: boolean;
  show_labor_total: boolean;
  show_labor_separate_from_parts: boolean;

  // Tax Information
  show_tax_breakdown: boolean;
  show_parts_tax_separate: boolean;
  show_labor_tax_separate: boolean;
  show_tax_rate: boolean;
  show_tax_exempt_notice: boolean;

  // Pricing & Modifiers
  show_subtotal: boolean;
  show_discount: boolean;
  show_project_management_fee: boolean;
  show_design_fee: boolean;
  show_credit_card_fee: boolean;
  show_custom_modifiers: boolean;

  // Deposit & Payment
  show_deposit_amount: boolean;
  show_deposit_percentage: boolean;
  show_payment_schedule: boolean;
  show_accepted_payment_methods: boolean;
  show_payment_instructions: boolean;

  // Additional Content
  show_scope_of_work: boolean;
  show_contract_terms: boolean;
  show_notes: boolean;
  show_internal_notes: boolean;
  show_signature_section: boolean;
  show_acceptance_section: boolean;

  // Styling & Layout Options
  page_size: string;
  color_scheme: string;
  font_family: string;
  show_page_numbers: boolean;
  show_watermark: boolean;
  watermark_text: string | null;

  // Image & Media
  max_product_images: number;
  show_before_after_photos: boolean;
  show_product_images: boolean;

  // Optional Features
  include_cover_page: boolean;
  include_table_of_contents: boolean;
  include_appendix: boolean;
}

interface TemplateSection {
  title: string;
  description: string;
  fields: {
    key: keyof ReportTemplate;
    label: string;
    description?: string;
  }[];
}

const templateSections: TemplateSection[] = [
  {
    title: 'Header & Basic Information',
    description: 'What appears at the top of the proposal',
    fields: [
      { key: 'show_company_logo', label: 'Company Logo' },
      { key: 'show_company_info', label: 'Company Information', description: 'Address, phone, email' },
      { key: 'show_proposal_number', label: 'Proposal Number' },
      { key: 'show_proposal_date', label: 'Proposal Date' },
      { key: 'show_valid_until_date', label: 'Valid Until Date' },
      { key: 'show_proposal_title', label: 'Proposal Title' },
      { key: 'show_customer_name', label: 'Customer Name' },
      { key: 'show_customer_address', label: 'Customer Billing Address' },
      { key: 'show_customer_contact_info', label: 'Customer Contact Info', description: 'Email and phone' },
      { key: 'show_jobsite_location', label: 'Jobsite Location', description: 'If different from billing address' },
    ]
  },
  {
    title: 'Line Item Details',
    description: 'What information to show for each product/item',
    fields: [
      { key: 'show_line_item_description', label: 'Description' },
      { key: 'show_manufacturer', label: 'Manufacturer' },
      { key: 'show_sku', label: 'SKU/Part Number' },
      { key: 'show_model_number', label: 'Model Number' },
      { key: 'show_quantity', label: 'Quantity' },
      { key: 'show_unit_price', label: 'Unit Price' },
      { key: 'show_line_item_total', label: 'Line Total' },
      { key: 'show_item_cost', label: 'Item Cost', description: '⚠️ Internal only - shows your cost' },
      { key: 'show_markup_percentage', label: 'Markup %', description: '⚠️ Internal only - shows your margin' },
    ]
  },
  {
    title: 'Area/Room Organization',
    description: 'How to group and display work areas',
    fields: [
      { key: 'group_by_area', label: 'Group Items by Area/Room' },
      { key: 'show_area_names', label: 'Show Area Names' },
      { key: 'show_area_descriptions', label: 'Show Area Descriptions' },
      { key: 'show_area_subtotals', label: 'Show Subtotal for Each Area' },
    ]
  },
  {
    title: 'Labor Information',
    description: 'Labor details to include',
    fields: [
      { key: 'show_labor_total', label: 'Show Labor Total' },
      { key: 'show_labor_phase', label: 'Show Labor Phase/Type' },
      { key: 'show_labor_hours', label: 'Show Labor Hours' },
      { key: 'show_labor_rate', label: 'Show Labor Rate' },
      { key: 'show_labor_separate_from_parts', label: 'Show Labor Separate from Parts' },
    ]
  },
  {
    title: 'Tax Information',
    description: 'Sales tax display options',
    fields: [
      { key: 'show_tax_breakdown', label: 'Show Tax Breakdown' },
      { key: 'show_tax_rate', label: 'Show Tax Rate %' },
      { key: 'show_parts_tax_separate', label: 'Show Parts Tax Separately' },
      { key: 'show_labor_tax_separate', label: 'Show Labor Tax Separately' },
      { key: 'show_tax_exempt_notice', label: 'Show Tax Exempt Notice', description: 'If customer is tax exempt' },
    ]
  },
  {
    title: 'Pricing & Modifiers',
    description: 'Pricing calculations and fees',
    fields: [
      { key: 'show_subtotal', label: 'Show Subtotal' },
      { key: 'show_discount', label: 'Show Discount' },
      { key: 'show_project_management_fee', label: 'Show Project Management Fee' },
      { key: 'show_design_fee', label: 'Show Design Fee' },
      { key: 'show_credit_card_fee', label: 'Show Credit Card Fee' },
      { key: 'show_custom_modifiers', label: 'Show Custom Modifiers' },
    ]
  },
  {
    title: 'Deposit & Payment',
    description: 'Payment terms and deposit information',
    fields: [
      { key: 'show_deposit_amount', label: 'Show Deposit Amount' },
      { key: 'show_deposit_percentage', label: 'Show Deposit Percentage' },
      { key: 'show_payment_schedule', label: 'Show Payment Schedule' },
      { key: 'show_accepted_payment_methods', label: 'Show Accepted Payment Methods' },
      { key: 'show_payment_instructions', label: 'Show Payment Instructions' },
    ]
  },
  {
    title: 'Images & Media',
    description: 'Product photos and visual content displayed in proposals',
    fields: [
      { key: 'show_product_images', label: 'Product Thumbnails', description: 'Show product photo thumbnails alongside each line item' },
      { key: 'show_before_after_photos', label: 'Before & After Photos', description: 'Show job site before and after photos' },
    ]
  },
  {
    title: 'Additional Content',
    description: 'Supporting documents and sections',
    fields: [
      { key: 'show_scope_of_work', label: 'Show Scope of Work' },
      { key: 'show_contract_terms', label: 'Show Contract Terms' },
      { key: 'show_notes', label: 'Show Proposal Notes' },
      { key: 'show_internal_notes', label: 'Show Internal Notes', description: '⚠️ Internal only' },
      { key: 'show_signature_section', label: 'Show Signature Section' },
      { key: 'show_acceptance_section', label: 'Show Acceptance Section' },
    ]
  }
];

export default function ProposalTemplateManager() {
  const { profile } = useAuth();
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<ReportTemplate | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  const canManage = profile?.role === 'admin' || profile?.role === 'sales_manager';
  const canEditSelected = selectedTemplate && (
    !selectedTemplate.is_personal || selectedTemplate.created_by === profile?.id
  ) && (selectedTemplate.is_personal || canManage);
  const canDeleteSelected = selectedTemplate && (
    (selectedTemplate.is_personal && selectedTemplate.created_by === profile?.id) ||
    (!selectedTemplate.is_personal && profile?.role === 'admin')
  );

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    try {
      const { data, error } = await supabase
        .from('proposal_report_templates')
        .select('*')
        .order('is_default', { ascending: false })
        .order('name');

      if (error) throw error;
      setTemplates(data || []);
      if (data && data.length > 0 && !selectedTemplate) {
        setSelectedTemplate(data[0]);
      }
    } catch (error) {
      console.error('Error loading templates:', error);
      alert('Failed to load templates');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!selectedTemplate || !canEditSelected) return;

    setSaving(true);
    try {
      // Only update editable fields, exclude id, created_at, updated_at, company_id, created_by
      const { id, created_at, updated_at, company_id, created_by, ...updateData } = selectedTemplate;

      const { error } = await supabase
        .from('proposal_report_templates')
        .update({
          ...updateData,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedTemplate.id);

      if (error) throw error;

      await loadTemplates();
      setIsEditing(false);
      alert('Template saved successfully!');
    } catch (error) {
      console.error('Error saving template:', error);
      alert('Failed to save template');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreate(newTemplate: Partial<ReportTemplate>) {
    if (!profile) return;

    // Validate: only admins/sales managers can create company-wide templates
    if (!newTemplate.is_personal && !canManage) {
      alert('Only admins and sales managers can create company-wide templates');
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('proposal_report_templates')
        .insert({
          company_id: profile.company_id,
          created_by: profile.id,
          ...newTemplate
        })
        .select()
        .single();

      if (error) throw error;

      await loadTemplates();
      setSelectedTemplate(data);
      setIsCreating(false);
      alert('Template created successfully!');
    } catch (error) {
      console.error('Error creating template:', error);
      alert('Failed to create template');
    } finally {
      setSaving(false);
    }
  }

  async function handleDuplicate() {
    if (!selectedTemplate) return;

    const { id, name, created_at, updated_at, created_by, ...templateData } = selectedTemplate;
    await handleCreate({
      ...templateData,
      name: `${name} (Copy)`,
      is_default: false,
      is_personal: true // Duplicates are always personal
    });
  }

  async function handleDelete() {
    if (!selectedTemplate || !canDeleteSelected) return;
    const templateToDelete = selectedTemplate;
    setConfirmModal({
      title: 'Delete Template',
      message: `Are you sure you want to delete "${templateToDelete.name}"?`,
      onConfirm: async () => {
        setConfirmModal(null);
        await doDeleteTemplate(templateToDelete);
      }
    });
  }

  async function doDeleteTemplate(templateToDelete: ReportTemplate) {
    try {
      const { error } = await supabase
        .from('proposal_report_templates')
        .delete()
        .eq('id', templateToDelete.id);

      if (error) throw error;

      setSelectedTemplate(null);
      await loadTemplates();
      alert('Template deleted successfully!');
    } catch (error) {
      console.error('Error deleting template:', error);
      alert('Failed to delete template');
    }
  }

  async function handleSetDefault() {
    if (!selectedTemplate || !canManage || !profile) return;

    try {
      // Unset all defaults for this company
      await supabase
        .from('proposal_report_templates')
        .update({ is_default: false })
        .eq('company_id', profile.company_id);

      // Set this one as default
      const { error } = await supabase
        .from('proposal_report_templates')
        .update({ is_default: true })
        .eq('id', selectedTemplate.id);

      if (error) throw error;

      await loadTemplates();
      alert('Default template updated!');
    } catch (error) {
      console.error('Error setting default:', error);
      alert('Failed to set default template');
    }
  }

  function toggleField(field: keyof ReportTemplate) {
    if (!selectedTemplate) return;
    setSelectedTemplate({
      ...selectedTemplate,
      [field]: !selectedTemplate[field]
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Proposal PDF Templates</h2>
        <p className="text-sm text-gray-600">
          Create and manage templates that control what appears in customer-facing proposal PDFs.
          You can have different templates for different types of proposals (residential, commercial, service agreements, etc.)
        </p>
      </div>

      {/* Template List */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-3">
          <button
            onClick={() => setIsCreating(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            <Plus className="w-4 h-4" />
            New Template
          </button>

          <div className="space-y-2">
            {templates.map((template) => (
              <button
                key={template.id}
                onClick={() => {
                  setSelectedTemplate(template);
                  setIsEditing(false);
                }}
                className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                  selectedTemplate?.id === template.id
                    ? 'bg-blue-50 border-2 border-blue-500'
                    : 'bg-white border-2 border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="font-medium text-gray-900 truncate">{template.name}</span>
                      {template.is_personal && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                          Personal
                        </span>
                      )}
                    </div>
                    {template.description && (
                      <p className="text-xs text-gray-600 mt-1 line-clamp-2">{template.description}</p>
                    )}
                  </div>
                  {template.is_default && (
                    <Star className="w-4 h-4 text-yellow-500 fill-current flex-shrink-0" />
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3">
          {selectedTemplate ? (
            <div className={`rounded-lg border-2 p-6 transition-colors ${
              isEditing
                ? 'bg-blue-50 border-blue-300'
                : 'bg-white border-gray-200'
            }`}>
              {/* Edit Mode Banner */}
              {isEditing && (
                <div className="mb-6 p-4 bg-blue-600 text-white rounded-lg">
                  <div className="flex items-center gap-2">
                    <Settings className="w-5 h-5" />
                    <div>
                      <div className="font-semibold">Editing Template</div>
                      <div className="text-sm text-blue-100">Toggle the checkboxes below to customize what appears in your proposal PDFs. Click Save when finished.</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Template Header */}
              <div className="flex items-start justify-between mb-6 pb-6 border-b border-gray-200">
                <div className="flex-1">
                  {isEditing ? (
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={selectedTemplate.name}
                        onChange={(e) => setSelectedTemplate({ ...selectedTemplate, name: e.target.value })}
                        className="text-xl font-bold text-gray-900 w-full px-3 py-2 border border-gray-300 rounded-lg"
                        placeholder="Template Name"
                      />
                      <textarea
                        value={selectedTemplate.description || ''}
                        onChange={(e) => setSelectedTemplate({ ...selectedTemplate, description: e.target.value })}
                        className="text-sm text-gray-600 w-full px-3 py-2 border border-gray-300 rounded-lg resize-none"
                        placeholder="Template description (optional)"
                        rows={2}
                      />
                    </div>
                  ) : (
                    <>
                      <h3 className="text-xl font-bold text-gray-900 mb-1">{selectedTemplate.name}</h3>
                      {selectedTemplate.description && (
                        <p className="text-sm text-gray-600">{selectedTemplate.description}</p>
                      )}
                    </>
                  )}
                </div>

                {(canEditSelected || canDeleteSelected) && (
                  <div className="flex items-center gap-2 ml-4">
                    {isEditing ? (
                      <>
                        <button
                          onClick={() => {
                            setIsEditing(false);
                            loadTemplates();
                          }}
                          className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          <X className="w-5 h-5" />
                        </button>
                        <button
                          onClick={handleSave}
                          disabled={saving}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                          <Save className="w-4 h-4" />
                          {saving ? 'Saving...' : 'Save'}
                        </button>
                      </>
                    ) : (
                      <>
                        {!selectedTemplate.is_default && !selectedTemplate.is_personal && canManage && (
                          <button
                            onClick={handleSetDefault}
                            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Set as default"
                          >
                            <Star className="w-5 h-5" />
                          </button>
                        )}
                        <button
                          onClick={handleDuplicate}
                          className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Duplicate"
                        >
                          <Copy className="w-5 h-5" />
                        </button>
                        {canEditSelected && (
                          <button
                            onClick={() => setIsEditing(true)}
                            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Settings className="w-5 h-5" />
                          </button>
                        )}
                        {canDeleteSelected && !selectedTemplate.is_default && (
                          <button
                            onClick={handleDelete}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Template Options */}
              {isEditing ? (
                <div className="space-y-8">
                  {templateSections.map((section) => (
                    <div key={section.title}>
                      <div className="mb-4">
                        <h4 className="text-lg font-semibold text-gray-900">{section.title}</h4>
                        <p className="text-sm text-gray-600">{section.description}</p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {section.fields.map((field) => (
                          <label
                            key={field.key}
                            className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={selectedTemplate[field.key] as boolean}
                              onChange={() => toggleField(field.key)}
                              className="mt-0.5 w-4 h-4 text-blue-600 rounded"
                            />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium text-gray-900 block">{field.label}</span>
                              {field.description && (
                                <span className="text-xs text-gray-600 block mt-0.5">{field.description}</span>
                              )}
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-6">
                  {templateSections.map((section) => {
                    const visibleFields = section.fields.filter(f => selectedTemplate[f.key]);
                    const hiddenFields = section.fields.filter(f => !selectedTemplate[f.key]);

                    return (
                      <div key={section.title}>
                        <h4 className="text-sm font-semibold text-gray-900 mb-3">{section.title}</h4>
                        <div className="space-y-2">
                          {visibleFields.length > 0 && (
                            <div className="space-y-1">
                              {visibleFields.map((field) => (
                                <div key={field.key} className="flex items-center gap-2 text-sm text-gray-700">
                                  <Eye className="w-4 h-4 text-green-600" />
                                  <span>{field.label}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {hiddenFields.length > 0 && (
                            <div className="space-y-1 opacity-50">
                              {hiddenFields.map((field) => (
                                <div key={field.key} className="flex items-center gap-2 text-sm text-gray-500">
                                  <EyeOff className="w-4 h-4" />
                                  <span>{field.label}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
              <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600">Select a template to view or edit</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
      {isCreating && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Create New Template</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                handleCreate({
                  name: formData.get('name') as string,
                  description: formData.get('description') as string || null,
                  is_default: false,
                  is_personal: formData.get('is_personal') === 'true'
                });
              }}
            >
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Template Name *
                  </label>
                  <input
                    type="text"
                    name="name"
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., Residential Standard, Commercial Detailed"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    name="description"
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Optional description..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Template Type *
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-start gap-3 p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                      <input
                        type="radio"
                        name="is_personal"
                        value="true"
                        defaultChecked
                        className="mt-1"
                      />
                      <div>
                        <div className="font-medium text-gray-900">Personal Template</div>
                        <div className="text-sm text-gray-600">Only you can see and use this template</div>
                      </div>
                    </label>
                    <label className={`flex items-start gap-3 p-3 border rounded-lg ${canManage ? 'border-gray-300 cursor-pointer hover:bg-gray-50' : 'border-gray-200 bg-gray-50 cursor-not-allowed'} transition-colors`}>
                      <input
                        type="radio"
                        name="is_personal"
                        value="false"
                        disabled={!canManage}
                        className="mt-1"
                      />
                      <div>
                        <div className={`font-medium ${canManage ? 'text-gray-900' : 'text-gray-500'}`}>Company-Wide Template</div>
                        <div className={`text-sm ${canManage ? 'text-gray-600' : 'text-gray-400'}`}>
                          {canManage ? 'Everyone in your company can use this template' : 'Only admins and sales managers can create company-wide templates'}
                        </div>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!confirmModal}
        title={confirmModal?.title || ''}
        message={confirmModal?.message || ''}
        variant="danger"
        onConfirm={() => confirmModal?.onConfirm()}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}
