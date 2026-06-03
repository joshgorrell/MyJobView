import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmModal from '../ui/ConfirmModal';
import { ArrowLeft, Save, Plus, X, FileText, File as FileEdit, Info, Sparkles, Eye, Check, DollarSign, CheckCircle, XCircle, GripVertical, User, MapPin, CreditCard as Edit, Layers, Loader2, Clock, AlertTriangle, AlertCircle, Lock, Video, LayoutGrid as Layout, ExternalLink } from 'lucide-react';
import BillToSection from './BillToSection';
import DepositConfiguration, { BillingPhase } from './DepositConfiguration';
import ProgressBillingManager from './ProgressBillingManager';
import CreateProgressInvoiceModal from './CreateProgressInvoiceModal';
import { InvoiceDetailModal } from '../Invoices/InvoiceDetailModal';
import { getTaxApplicability, getApplicableTaxRate, TaxEnvironment, TaxProjectType } from '../../lib/taxCalculations';
import EditCustomerModal from './EditCustomerModal';
import { checkProposalReadiness, markSectionReviewed, type ValidationSection } from '../../lib/proposalValidation';
import ProposalRecordingsPanel from './ProposalRecordingsPanel';

interface ProposalSettingsData {
  id: string;
  proposal_id: string;
  contract_id: string | null;
  payment_terms_type: 'percentage' | 'fixed';
  deposit_percent: number;
  deposit_amount: number;
  payment_schedule: any[];
  discount_percent: number;
  project_management_percent: number;
  project_design_percent: number;
  system_design_percent: number;
  credit_card_fee_percent: number;
  misc_parts_percent: number;
  custom_modifier_1_label: string | null;
  custom_modifier_1_percent: number;
  custom_modifier_2_label: string | null;
  custom_modifier_2_percent: number;
  selected_areas: string[];
  deposit_type: 'percentage' | 'parts_total' | 'custom' | 'none';
  acceptance_methods: string[];
  require_deposit: boolean;
  scope_of_work: string | null;
  scope_of_work_updated_at: string | null;
  proposal_items_hash: string | null;
  show_scope_in_pdf: boolean;
  show_contract_in_pdf: boolean;
  show_deposit_in_pdf: boolean;
  show_classes_in_builder: boolean;
  show_classes_in_pdf: boolean;
  class_display_mode: 'none' | 'inline' | 'summary' | 'both';
  show_class_summary_page: boolean;
  progress_billing_type: 'monthly' | 'completion' | 'none';
  progress_invoice_terms: 'net_10' | 'net_30' | 'net_45' | 'net_60' | 'due_on_receipt';
  balance_payment_terms: string;
  cover_page_image_url: string | null;
}

interface Contract {
  id: string;
  name: string;
  is_default: boolean;
}

interface AreaTemplate {
  id: string;
  name: string;
  sort_order?: number;
}

interface ProposalSettingsProps {
  proposalId: string;
  onBack: () => void;
  initialTab?: ValidationSection['name'] | 'visibility' | 'areas' | 'coverpage';
}

export default function ProposalSettings({ proposalId, onBack, initialTab = 'details' }: ProposalSettingsProps) {
  const { profile } = useAuth();
  const [settings, setSettings] = useState<ProposalSettingsData | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [areaTemplates, setAreaTemplates] = useState<AreaTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newArea, setNewArea] = useState('');
  const [generatingScope, setGeneratingScope] = useState(false);
  const [aiCooldown, setAiCooldown] = useState(0);
  const [taxEnvironment, setTaxEnvironment] = useState<'residential' | 'commercial'>('residential');
  const [taxProjectType, setTaxProjectType] = useState<string>('general_installation_repair');
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set([
    'description', 'manufacturer', 'sku', 'qty', 'cost', 'price',
    'laborPhase', 'laborHrs', 'laborRate', 'laborTotal', 'lineTotal', 'type'
  ]));

  const [activeTab, setActiveTab] = useState<'details' | 'scope' | 'contract' | 'billing' | 'visibility' | 'tax' | 'fees' | 'areas' | 'coverpage' | 'recordings' | 'template'>(initialTab as any);
  const [reportTemplates, setReportTemplates] = useState<any[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);

  // AI cooldown timer
  useEffect(() => {
    if (aiCooldown > 0) {
      const timer = setTimeout(() => setAiCooldown(aiCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [aiCooldown]);

  useEffect(() => {
    if (activeTab === 'template' && reportTemplates.length === 0) {
      loadTemplates();
    }
  }, [activeTab]);
  const [recordingsCount, setRecordingsCount] = useState(0);
  const [showChangeCustomer, setShowChangeCustomer] = useState(false);
  const [showEditCustomer, setShowEditCustomer] = useState(false);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const [proposal, setProposal] = useState<any>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [initialSettings, setInitialSettings] = useState<string>('');
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
  const [editingAreaName, setEditingAreaName] = useState('');
  const [initialItemsHash, setInitialItemsHash] = useState<string | null>(null);
  const [scopeAutoSaving, setScopeAutoSaving] = useState(false);
  const scopeAutoSaveTimer = useRef<NodeJS.Timeout | null>(null);
  const [billingAutoSaving, setBillingAutoSaving] = useState(false);
  const billingAutoSaveTimer = useRef<NodeJS.Timeout | null>(null);
  const isAutoSavingRef = useRef(false);
  const [salesOrder, setSalesOrder] = useState<any>(null);
  const [taxSettingsLocked, setTaxSettingsLocked] = useState(false);
  const [showCreateInvoiceModal, setShowCreateInvoiceModal] = useState(false);
  const [viewingInvoiceId, setViewingInvoiceId] = useState<string | null>(null);
  const [validationData, setValidationData] = useState<any>(null);
  const [loadingValidation, setLoadingValidation] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [billingPhases, setBillingPhases] = useState<BillingPhase[]>([]);
  const billingPhasesTimer = useRef<NodeJS.Timeout | null>(null);

  const availableColumns = [
    { id: 'description', label: 'Description', alwaysVisible: true },
    { id: 'manufacturer', label: 'Manufacturer' },
    { id: 'sku', label: 'SKU' },
    { id: 'qty', label: 'Qty', alwaysVisible: true },
    { id: 'cost', label: 'Cost' },
    { id: 'price', label: 'Price', alwaysVisible: true },
    { id: 'laborPhase', label: 'Labor Phase' },
    { id: 'laborHrs', label: 'Labor Hrs' },
    { id: 'laborRate', label: 'Labor Rate' },
    { id: 'laborTotal', label: 'Labor Total' },
    { id: 'partsTax', label: 'Parts Tax' },
    { id: 'laborTax', label: 'Labor Tax' },
    { id: 'lineTotal', label: 'Line Total', alwaysVisible: true }
  ];

  useEffect(() => {
    loadData();
    loadColumnPreferences();
    loadValidation();
  }, [proposalId]);

  useEffect(() => {
    // Reload validation when active tab changes to refresh section status
    if (proposalId) {
      loadValidation();
    }
  }, [activeTab]);

  // Reload billing settings when billing tab becomes active
  // This ensures changes from Manual Approval Modal are reflected
  useEffect(() => {
    if (activeTab === 'billing' && settings?.id) {
      const reloadBillingSettings = async () => {
        try {
          const { data, error } = await supabase
            .from('proposal_settings')
            .select('*')
            .eq('id', settings.id)
            .maybeSingle();

          if (error) throw error;
          if (data) {
            setSettings(data);
          }
        } catch (error) {
          console.error('Error reloading billing settings:', error);
        }
      };

      reloadBillingSettings();
    }
  }, [activeTab]);

  // Track changes
  useEffect(() => {
    if (settings && initialSettings) {
      const currentSettings = JSON.stringify(settings);
      setHasUnsavedChanges(currentSettings !== initialSettings);
    }
  }, [settings, initialSettings]);

  // Auto-save billing configuration
  useEffect(() => {
    if (!settings?.id) return;

    // Skip auto-save if we're currently in an auto-save operation
    if (isAutoSavingRef.current) return;

    // Clear previous timer
    if (billingAutoSaveTimer.current) {
      clearTimeout(billingAutoSaveTimer.current);
    }

    // Set new timer to save after 1 second of no changes
    billingAutoSaveTimer.current = setTimeout(async () => {
      try {
        isAutoSavingRef.current = true;
        setBillingAutoSaving(true);

        const { error: settingsError } = await supabase
          .from('proposal_settings')
          .update({
            deposit_type: settings.deposit_type,
            deposit_percent: settings.deposit_percent,
            deposit_amount: settings.deposit_type === 'custom' ? settings.deposit_amount : null,
            require_deposit: settings.require_deposit,
            acceptance_methods: settings.acceptance_methods,
            payment_schedule: settings.payment_schedule,
            progress_billing_type: settings.progress_billing_type,
            progress_invoice_terms: settings.progress_invoice_terms,
            balance_payment_terms: settings.balance_payment_terms,
            project_management_percent: settings.project_management_percent || 0,
            system_design_percent: settings.system_design_percent || 0,
            credit_card_fee_percent: settings.credit_card_fee_percent || 0,
            misc_parts_percent: settings.misc_parts_percent || 0,
            updated_at: new Date().toISOString()
          })
          .eq('id', settings.id);

        if (settingsError) throw settingsError;

        // Recalculate proposal totals to update deposit_amount_due
        await supabase.rpc('calculate_proposal_totals', { p_proposal_id: proposalId });

        // Note: We don't update settings.deposit_amount here to avoid infinite loop
        // The calculated value will be loaded when the user opens approval modals

      } catch (error) {
        console.error('Error auto-saving billing settings:', error);
      } finally {
        setBillingAutoSaving(false);
        isAutoSavingRef.current = false;
      }
    }, 1000);

    return () => {
      if (billingAutoSaveTimer.current) {
        clearTimeout(billingAutoSaveTimer.current);
      }
    };
  }, [
    settings?.id,
    settings?.deposit_type,
    settings?.deposit_percent,
    settings?.deposit_amount,
    settings?.require_deposit,
    settings?.acceptance_methods,
    settings?.payment_schedule,
    settings?.progress_billing_type,
    settings?.progress_invoice_terms,
    settings?.balance_payment_terms,
    settings?.project_management_percent,
    settings?.system_design_percent,
    settings?.credit_card_fee_percent,
    settings?.misc_parts_percent,
    proposalId
  ]);

  // Auto-save billing phases to proposal_billing_phases table
  async function saveBillingPhases(phases: BillingPhase[]) {
    if (!proposalId) return;
    if (billingPhasesTimer.current) clearTimeout(billingPhasesTimer.current);
    billingPhasesTimer.current = setTimeout(async () => {
      try {
        await supabase
          .from('proposal_billing_phases')
          .delete()
          .eq('proposal_id', proposalId);
        if (phases.length > 0) {
          const rows = phases.map((p, i) => ({
            proposal_id: proposalId,
            phase_order: i,
            title: p.title,
            amount_type: p.amount_type,
            amount: p.amount,
            notes: p.notes || null
          }));
          await supabase.from('proposal_billing_phases').insert(rows);
        }
      } catch (err) {
        console.error('Error saving billing phases:', err);
      }
    }, 800);
  }

  // Auto-save scope of work
  useEffect(() => {
    if (!settings?.id || !settings?.scope_of_work) return;

    // Clear previous timer
    if (scopeAutoSaveTimer.current) {
      clearTimeout(scopeAutoSaveTimer.current);
    }

    // Set new timer to save after 2 seconds of no changes
    scopeAutoSaveTimer.current = setTimeout(async () => {
      try {
        setScopeAutoSaving(true);
        const { error } = await supabase
          .from('proposal_settings')
          .update({ scope_of_work: settings.scope_of_work })
          .eq('id', settings.id);

        if (error) throw error;

        // Reload to get the updated timestamp
        const { data: updatedSettings } = await supabase
          .from('proposal_settings')
          .select('scope_of_work_updated_at, proposal_items_hash')
          .eq('id', settings.id)
          .single();

        if (updatedSettings) {
          setSettings({
            ...settings,
            scope_of_work_updated_at: updatedSettings.scope_of_work_updated_at,
            proposal_items_hash: updatedSettings.proposal_items_hash
          });
        }
      } catch (error) {
        console.error('Error auto-saving scope of work:', error);
      } finally {
        setScopeAutoSaving(false);
      }
    }, 2000);

    return () => {
      if (scopeAutoSaveTimer.current) {
        clearTimeout(scopeAutoSaveTimer.current);
      }
    };
  }, [settings?.scope_of_work]);

  async function loadColumnPreferences() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('user_column_preferences')
        .select('column_settings')
        .eq('user_id', user.id)
        .eq('view_name', 'proposal_builder_compact')
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading column preferences:', error);
        return;
      }

      if (data?.column_settings?.visibleColumns) {
        setVisibleColumns(new Set(data.column_settings.visibleColumns));
      }
      if (data?.column_settings?.columnOrder) {
        setColumnOrder(data.column_settings.columnOrder);
      } else {
        setColumnOrder(availableColumns.map(col => col.id));
      }
    } catch (error) {
      console.error('Error loading column preferences:', error);
    }
  }

  async function loadValidation() {
    if (!proposalId) return;

    setLoadingValidation(true);
    try {
      const data = await checkProposalReadiness(proposalId);
      setValidationData(data);
    } catch (error) {
      console.error('Error loading validation:', error);
    } finally {
      setLoadingValidation(false);
    }
  }

  function getSectionValidation(sectionName: ValidationSection['name']): ValidationSection | undefined {
    return validationData?.sections?.find((s: ValidationSection) => s.name === sectionName);
  }

  async function handleMarkSectionReviewed(sectionName: ValidationSection['name']) {
    try {
      await markSectionReviewed(proposalId, sectionName);
      await loadValidation();
    } catch (error) {
      console.error('Error marking section as reviewed:', error);
    }
  }

  async function saveColumnPreferences(columns: Set<string>, order?: string[]) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('user_column_preferences')
        .upsert({
          user_id: user.id,
          view_name: 'proposal_builder_compact',
          column_settings: {
            visibleColumns: Array.from(columns),
            columnOrder: order || columnOrder
          },
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,view_name'
        });

      if (error) {
        console.error('Error saving column preferences:', error);
      }
    } catch (error) {
      console.error('Error saving column preferences:', error);
    }
  }

  function toggleColumn(columnId: string) {
    const newVisible = new Set(visibleColumns);
    if (newVisible.has(columnId)) {
      newVisible.delete(columnId);
    } else {
      newVisible.add(columnId);
    }
    setVisibleColumns(newVisible);
    saveColumnPreferences(newVisible);
  }

  function handleDragStart(columnId: string) {
    setDraggedColumn(columnId);
  }

  function handleDragOver(e: React.DragEvent, targetColumnId: string) {
    e.preventDefault();
    if (!draggedColumn || draggedColumn === targetColumnId) return;

    const newOrder = [...columnOrder];
    const draggedIdx = newOrder.indexOf(draggedColumn);
    const targetIdx = newOrder.indexOf(targetColumnId);

    newOrder.splice(draggedIdx, 1);
    newOrder.splice(targetIdx, 0, draggedColumn);

    setColumnOrder(newOrder);
  }

  function handleDragEnd() {
    if (draggedColumn) {
      saveColumnPreferences(visibleColumns, columnOrder);
    }
    setDraggedColumn(null);
  }

  async function loadData() {
    if (!profile) return;

    try {
      const [settingsRes, contractsRes, areasRes, proposalRes, contactsRes, salesOrderRes] = await Promise.all([
        supabase
          .from('proposal_settings')
          .select('*')
          .eq('proposal_id', proposalId)
          .maybeSingle(),
        supabase
          .from('contracts')
          .select('id, name, is_default')
          .eq('contract_type', 'sales')
          .order('is_default', { ascending: false }),
        supabase
          .from('proposal_area_templates')
          .select('*')
          .order('sort_order'),
        supabase
          .from('proposals')
          .select('*, contacts:contacts!proposals_contact_id_fkey(*), bill_to_contact:contacts!proposals_bill_to_contact_id_fkey(id, full_name, company_name, email, phone, street_address, city, state, zip)')
          .eq('id', proposalId)
          .maybeSingle(),
        supabase
          .from('contacts')
          .select('id, full_name, company_name, email, phone, street_address, city, state, zip')
          .order('full_name'),
        supabase
          .from('sales_orders')
          .select('*')
          .eq('proposal_id', proposalId)
          .maybeSingle()
      ]);

      // Check if any invoices exist for this sales order to determine if tax settings are locked
      if (salesOrderRes.data?.id) {
        const { count } = await supabase
          .from('invoices')
          .select('id', { count: 'exact', head: true })
          .eq('sales_order_id', salesOrderRes.data.id);
        setTaxSettingsLocked((count ?? 0) > 0);
      }

      console.log('Settings:', settingsRes);
      console.log('Contracts:', contractsRes);
      console.log('Areas:', areasRes);
      console.log('Proposal:', proposalRes);

      if (settingsRes.error) {
        console.error('Settings error:', settingsRes.error);
      }

      // Load proposal data and tax settings
      if (proposalRes.data) {
        setProposal(proposalRes.data);
        setTaxEnvironment(proposalRes.data.tax_environment || 'residential');
        setTaxProjectType(proposalRes.data.tax_project_type || 'general_installation_repair');
      }

      // Load contacts list
      if (contactsRes.data) {
        setContacts(contactsRes.data);
      }

      // Load sales order if exists
      if (salesOrderRes.data) {
        setSalesOrder(salesOrderRes.data);
      }

      // Load selected contract content
      if (settingsRes.data?.contract_id) {
        const contract = contractsRes.data?.find(c => c.id === settingsRes.data.contract_id);
        if (contract) {
          const { data: fullContract } = await supabase
            .from('contracts')
            .select('*')
            .eq('id', contract.id)
            .single();
          if (fullContract) {
            setSelectedContract(fullContract);
          }
        }
      }

      if (settingsRes.data) {
        // If contract_id is null, populate it with the default contract
        if (!settingsRes.data.contract_id) {
          const defaultContract = (contractsRes.data || []).find(c => c.is_default);
          if (defaultContract) {
            const { error: updateError } = await supabase
              .from('proposal_settings')
              .update({ contract_id: defaultContract.id })
              .eq('id', settingsRes.data.id);

            if (!updateError) {
              settingsRes.data.contract_id = defaultContract.id;

              // Load the default contract content for preview
              const { data: fullContract } = await supabase
                .from('contracts')
                .select('*')
                .eq('id', defaultContract.id)
                .single();
              if (fullContract) {
                setSelectedContract(fullContract);
              }
            }
          }
        }

        setSettings(settingsRes.data);
        setInitialItemsHash(settingsRes.data.proposal_items_hash);
      } else {
        console.log('No settings found, creating default...');
        const defaultContract = (contractsRes.data || []).find(c => c.is_default);

        const { data: companySettings } = await supabase
          .from('company_settings')
          .select('default_deposit_percent, default_project_mgmt_percent, default_system_design_percent, default_cc_fee_percent, default_misc_parts_percent')
          .eq('id', profile.company_id)
          .single();

        const { data: newSettings, error: insertError } = await supabase
          .from('proposal_settings')
          .insert({
            proposal_id: proposalId,
            contract_id: defaultContract?.id || null,
            deposit_percent: companySettings?.default_deposit_percent || 50,
            project_management_percent: companySettings?.default_project_mgmt_percent || 0,
            system_design_percent: companySettings?.default_system_design_percent || 0,
            credit_card_fee_percent: companySettings?.default_cc_fee_percent || 3,
            misc_parts_percent: companySettings?.default_misc_parts_percent || 0
          })
          .select()
          .single();

        if (insertError) throw insertError;
        setSettings(newSettings);
      }

      setContracts(contractsRes.data || []);
      setAreaTemplates(areasRes.data || []);

      // Store initial state for change detection
      if (settingsRes.data) {
        setInitialSettings(JSON.stringify(settingsRes.data));
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadTemplates() {
    if (!profile?.organization_id) return;
    setLoadingTemplates(true);
    try {
      const { data } = await supabase
        .from('proposal_report_templates')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .order('is_default', { ascending: false })
        .order('name');
      setReportTemplates(data || []);
    } catch (err) {
      console.error('Error loading templates:', err);
    } finally {
      setLoadingTemplates(false);
    }
  }

  async function saveProposalTemplate(templateId: string | null) {
    setSavingTemplate(true);
    try {
      await supabase
        .from('proposals')
        .update({ report_template_id: templateId })
        .eq('id', proposalId);
      setProposal((prev: any) => prev ? { ...prev, report_template_id: templateId } : prev);
    } catch (err) {
      console.error('Error saving template:', err);
    } finally {
      setSavingTemplate(false);
    }
  }

  // Function to recalculate and update tax rate and line item tax settings
  async function updateTaxRate() {
    if (!proposal) return;

    // Don't update if tax has been manually overridden
    if (proposal.tax_override) {
      console.log('Tax rate is overridden, skipping automatic update');
      return;
    }

    try {
      const contactId = proposal.contact_id;
      const zipCode = proposal.jobsite_zip || proposal.contacts?.zip;

      if (!contactId) {
        console.log('No contact ID, skipping tax rate update');
        return;
      }

      // Get the applicable tax rate based on contact and zip code
      const newTaxRate = await getApplicableTaxRate(contactId, zipCode);

      console.log('Updating tax rate to:', newTaxRate);

      // Update the proposal's tax rate
      const { error } = await supabase
        .from('proposals')
        .update({
          tax_rate: newTaxRate,
          updated_at: new Date().toISOString()
        })
        .eq('id', proposalId);

      if (error) {
        console.error('Error updating tax rate:', error);
      } else {
        // Update local state
        setProposal({ ...proposal, tax_rate: newTaxRate });
      }

      // Update line items based on tax applicability
      await updateLineItemTaxSettings(newTaxRate);
    } catch (error) {
      console.error('Error calculating tax rate:', error);
    }
  }

  // Function to update line item tax settings based on environment and project type
  async function updateLineItemTaxSettings(taxRate: number) {
    try {
      // Get tax applicability for current environment and project type
      const taxInfo = getTaxApplicability(taxEnvironment as TaxEnvironment, taxProjectType as TaxProjectType);

      // Fetch all line items for this proposal
      const { data: lineItems, error: fetchError } = await supabase
        .from('proposal_line_items')
        .select('id, item_type, unit_price, quantity, labor_total')
        .eq('proposal_id', proposalId);

      if (fetchError) throw fetchError;
      if (!lineItems || lineItems.length === 0) return;

      // Update each line item's tax settings
      const updates = lineItems.map(item => {
        const itemType = item.item_type?.toLowerCase() === 'labor' ? 'labor' : 'material';
        const isTaxable = itemType === 'labor' ? taxInfo.laborTaxable : taxInfo.partsTaxable;

        // Calculate tax amount
        let taxableAmount = 0;
        if (itemType === 'material') {
          taxableAmount = (item.unit_price || 0) * (item.quantity || 0);
        } else if (itemType === 'labor') {
          taxableAmount = item.labor_total || 0;
        }

        const taxAmount = isTaxable ? taxableAmount * taxRate : 0;

        return {
          id: item.id,
          is_taxable: isTaxable,
          tax_amount: taxAmount
        };
      });

      // Batch update all line items
      for (const update of updates) {
        await supabase
          .from('proposal_line_items')
          .update({
            is_taxable: update.is_taxable,
            tax_amount: update.tax_amount
          })
          .eq('id', update.id);
      }

      console.log(`Updated ${updates.length} line items with new tax settings`);

      // Recalculate proposal totals
      await supabase.rpc('calculate_proposal_totals', { p_proposal_id: proposalId });
    } catch (error) {
      console.error('Error updating line item tax settings:', error);
    }
  }

  // Watch for changes in tax environment, project type, contact, or zip code
  useEffect(() => {
    if (proposal && proposal.id) {
      // Only update if we have a valid proposal loaded
      // Use a small delay to avoid rapid-fire updates
      const timer = setTimeout(() => {
        updateTaxRate();
      }, 300);

      return () => clearTimeout(timer);
    }
  }, [taxEnvironment, taxProjectType, proposal?.contact_id, proposal?.jobsite_zip]);

  async function handleSave(e?: React.MouseEvent) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (!settings) return;

    setSaving(true);
    try {
      // Save proposal settings
      const { error: settingsError } = await supabase
        .from('proposal_settings')
        .update({
          contract_id: settings.contract_id,
          payment_terms_type: settings.payment_terms_type,
          deposit_percent: settings.deposit_percent,
          deposit_amount: settings.deposit_amount,
          payment_schedule: settings.payment_schedule,
          discount_percent: settings.discount_percent || 0,
          project_management_percent: settings.project_management_percent,
          project_design_percent: settings.project_design_percent || 0,
          system_design_percent: settings.system_design_percent,
          credit_card_fee_percent: settings.credit_card_fee_percent,
          misc_parts_percent: settings.misc_parts_percent,
          custom_modifier_1_label: settings.custom_modifier_1_label,
          custom_modifier_1_percent: settings.custom_modifier_1_percent || 0,
          custom_modifier_2_label: settings.custom_modifier_2_label,
          custom_modifier_2_percent: settings.custom_modifier_2_percent || 0,
          selected_areas: settings.selected_areas,
          deposit_type: settings.deposit_type,
          acceptance_methods: settings.acceptance_methods,
          require_deposit: settings.require_deposit,
          progress_billing_type: settings.progress_billing_type,
          progress_invoice_terms: settings.progress_invoice_terms,
          balance_payment_terms: settings.balance_payment_terms,
          show_scope_in_pdf: settings.show_scope_in_pdf,
          show_contract_in_pdf: settings.show_contract_in_pdf,
          show_deposit_in_pdf: settings.show_deposit_in_pdf,
          show_classes_in_builder: settings.show_classes_in_builder || false,
          show_classes_in_pdf: settings.show_classes_in_pdf || false,
          class_display_mode: settings.class_display_mode || 'none',
          show_class_summary_page: settings.show_class_summary_page || false,
          cover_page_image_url: settings.cover_page_image_url,
          updated_at: new Date().toISOString()
        })
        .eq('id', settings.id);

      if (settingsError) throw settingsError;

      // Save proposal details and tax configuration
      const proposalUpdates: any = {
        tax_environment: taxEnvironment,
        tax_project_type: taxProjectType,
        // Save proposal-level acceptance settings (overrides template)
        acceptance_methods: settings.acceptance_methods,
        require_deposit: settings.require_deposit
      };

      // Add proposal details if we have them
      if (proposal) {
        proposalUpdates.title = proposal.title ?? null;
        proposalUpdates.contact_id = proposal.contact_id ?? null;
        proposalUpdates.jobsite_address = proposal.jobsite_address ?? null;
        proposalUpdates.jobsite_city = proposal.jobsite_city ?? null;
        proposalUpdates.jobsite_state = proposal.jobsite_state ?? null;
        proposalUpdates.jobsite_zip = proposal.jobsite_zip ?? null;
        proposalUpdates.jobsite_notes = proposal.jobsite_notes ?? null;
        // Include tax_rate if it was calculated (don't override if manually set)
        if (proposal.tax_rate !== undefined && !proposal.tax_override) {
          proposalUpdates.tax_rate = proposal.tax_rate;
        }
      }

      const { error: proposalError } = await supabase
        .from('proposals')
        .update(proposalUpdates)
        .eq('id', proposalId);

      if (proposalError) throw proposalError;

      // Recalculate proposal totals after saving
      await supabase.rpc('calculate_proposal_totals', { p_proposal_id: proposalId });

      // Mark current section as reviewed when saved
      const sectionMap: Record<string, ValidationSection['name']> = {
        'details': 'details',
        'scope': 'scope',
        'contract': 'contract',
        'billing': 'billing',
        'tax': 'tax',
        'fees': 'fees'
      };

      if (sectionMap[activeTab]) {
        await handleMarkSectionReviewed(sectionMap[activeTab]);
      }

      // Update initial state and clear unsaved changes flag
      setInitialSettings(JSON.stringify(settings));
      setHasUnsavedChanges(false);

      // Reload validation after save
      await loadValidation();

      alert('Settings saved successfully!');
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  function handleBack(e?: React.MouseEvent) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (hasUnsavedChanges) {
      setConfirmModal({
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. Are you sure you want to leave without saving?',
        onConfirm: () => {
          setConfirmModal(null);
          onBack();
        }
      });
    } else {
      onBack();
    }
  }

  async function handleGenerateScopeWithAI() {
    if (aiCooldown > 0) {
      alert(`Please wait ${aiCooldown} seconds before generating again to avoid rate limits.`);
      return;
    }

    setGeneratingScope(true);
    setAiCooldown(10);
    try {
      // Fetch proposal data with rooms and line items
      const { data: proposal, error: propError } = await supabase
        .from('proposals')
        .select(`
          title,
          contacts:contacts!proposals_contact_id_fkey (
            full_name,
            contact_name,
            company_name
          )
        `)
        .eq('id', proposalId)
        .maybeSingle();

      if (propError) throw propError;

      const { data: rooms, error: roomsError } = await supabase
        .from('proposal_rooms')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('sort_order');

      if (roomsError) throw roomsError;

      const { data: lineItems, error: itemsError } = await supabase
        .from('proposal_line_items')
        .select('room_id, description, quantity, item_type, products(name)')
        .eq('proposal_id', proposalId);

      if (itemsError) throw itemsError;

      // Build the proposal data structure
      const proposalData = {
        proposal_title: proposal?.title || 'Untitled Proposal',
        contact_name: proposal?.contacts?.contact_type === 'person'
          ? (proposal?.contacts?.full_name || proposal?.contacts?.contact_name || proposal?.contacts?.company_name || 'Customer')
          : (proposal?.contacts?.company_name || proposal?.contacts?.full_name || proposal?.contacts?.contact_name || 'Customer'),
        rooms: (rooms || []).map(room => ({
          name: room.name,
          scope_of_work: room.scope_of_work,
          items: (lineItems || [])
            .filter(item => item.room_id === room.id)
            .map(item => ({
              product_name: item.products?.name || item.description || 'Item',
              description: item.description,
              quantity: item.quantity,
              item_type: item.item_type || 'part'
            }))
        }))
      };

      // Call edge function
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-scope-of-work`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ proposalData })
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate scope');
      }

      const { scope_of_work } = await response.json();

      // Update the settings with generated scope
      setSettings({ ...settings!, scope_of_work });
      setHasUnsavedChanges(true);
    } catch (error: any) {
      console.error('Error generating scope:', error);

      // Handle rate limit errors specifically
      if (error.message?.includes('rate limit') || error.message?.includes('10 seconds')) {
        alert(error.message);
      } else {
        alert(error.message || 'Failed to generate scope of work. Please try again.');
      }
    } finally {
      setGeneratingScope(false);
    }
  }

  async function handleAddAreaTemplate() {
    if (!newArea.trim()) return;

    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', (await supabase.auth.getUser()).data.user?.id)
        .single();

      if (!profile) return;

      const nextSort = areaTemplates.length > 0
        ? Math.max(...areaTemplates.map(a => a.sort_order || 0)) + 1
        : 1;

      const { data, error } = await supabase
        .from('proposal_area_templates')
        .insert({
          company_id: profile.company_id,
          name: newArea.trim(),
          sort_order: nextSort
        })
        .select()
        .single();

      if (error) throw error;
      setAreaTemplates([...areaTemplates, data]);
      setNewArea('');
    } catch (error) {
      console.error('Error adding area:', error);
      alert('Failed to add area template');
    }
  }

  async function handleDeleteAreaTemplate(id: string) {
    setConfirmModal({
      title: 'Delete Area Template',
      message: 'Delete this area template?',
      onConfirm: async () => {
        setConfirmModal(null);
        await doDeleteAreaTemplate(id);
      }
    });
  }

  async function doDeleteAreaTemplate(id: string) {
    try {
      const { error } = await supabase
        .from('proposal_area_templates')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setAreaTemplates(areaTemplates.filter(a => a.id !== id));
    } catch (error) {
      console.error('Error deleting area:', error);
      alert('Failed to delete area template');
    }
  }

  async function handleUpdateAreaTemplate(id: string, newName: string) {
    if (!newName.trim()) return;

    try {
      const { error } = await supabase
        .from('proposal_area_templates')
        .update({ name: newName.trim() })
        .eq('id', id);

      if (error) throw error;

      setAreaTemplates(areaTemplates.map(a =>
        a.id === id ? { ...a, name: newName.trim() } : a
      ));
      setEditingAreaId(null);
      setEditingAreaName('');
    } catch (error) {
      console.error('Error updating area:', error);
      alert('Failed to update area template');
    }
  }

  async function handleReorderAreas(draggedId: string, targetId: string) {
    const draggedIndex = areaTemplates.findIndex(a => a.id === draggedId);
    const targetIndex = areaTemplates.findIndex(a => a.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    // Reorder the array
    const reordered = [...areaTemplates];
    const [removed] = reordered.splice(draggedIndex, 1);
    reordered.splice(targetIndex, 0, removed);

    // Update local state immediately
    setAreaTemplates(reordered);

    // Update sort_order in database
    try {
      const updates = reordered.map((area, index) =>
        supabase
          .from('proposal_area_templates')
          .update({ sort_order: index + 1 })
          .eq('id', area.id)
      );

      await Promise.all(updates);
    } catch (error) {
      console.error('Error updating area order:', error);
      // Reload to get correct order if update fails
      loadData();
    }
  }

  function toggleArea(areaName: string) {
    if (!settings) return;

    const areas = settings.selected_areas || [];
    const newAreas = areas.includes(areaName)
      ? areas.filter(a => a !== areaName)
      : [...areas, areaName];

    setSettings({ ...settings, selected_areas: newAreas });
  }

  async function handleApplyAreasToProposal() {
    if (!settings || settings.selected_areas.length === 0) return;

    try {
      const existingRooms = await supabase
        .from('proposal_rooms')
        .select('name')
        .eq('proposal_id', proposalId);

      const existingNames = new Set(existingRooms.data?.map(r => r.name) || []);
      const areasToAdd = settings.selected_areas.filter(name => !existingNames.has(name));

      if (areasToAdd.length === 0) {
        alert('All selected areas already exist in the proposal');
        return;
      }

      const roomsToInsert = areasToAdd.map((name, index) => ({
        proposal_id: proposalId,
        name,
        sort_order: (existingRooms.data?.length || 0) + index + 1
      }));

      const { error } = await supabase
        .from('proposal_rooms')
        .insert(roomsToInsert);

      if (error) throw error;
      alert(`Added ${areasToAdd.length} area(s) to proposal`);
    } catch (error) {
      console.error('Error applying areas:', error);
      alert('Failed to apply areas to proposal');
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">Failed to load settings</p>
          <button
            onClick={handleBack}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      <div className="bg-white border-b border-gray-200 flex-shrink-0">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
              <button
                type="button"
                onClick={handleBack}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
                title="Back to Proposal"
              >
                <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
              </button>
              <div className="min-w-0">
                <h1 className="text-base sm:text-xl font-bold text-gray-900 truncate">Proposal Settings</h1>
                <p className="text-xs sm:text-sm text-gray-600 hidden sm:block">Configure payment terms, modifiers, and contract</p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              {hasUnsavedChanges && !saving && (
                <span className="text-xs sm:text-sm text-amber-600 font-medium hidden sm:inline">
                  Unsaved changes
                </span>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg transition-colors disabled:opacity-50 text-sm sm:text-base ${
                  hasUnsavedChanges
                    ? 'bg-amber-600 hover:bg-amber-700 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                <Save className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline">{saving ? 'Saving...' : 'Save Settings'}</span>
                <span className="sm:hidden">{saving ? 'Saving...' : 'Save'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-6">
          {/* Readiness Progress Indicator */}
          {validationData && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-semibold text-gray-700">Proposal Readiness</h3>
                  <span className={`text-sm font-bold ${validationData.isReady ? 'text-green-600' : 'text-blue-600'}`}>
                    {validationData.overallProgress}%
                  </span>
                </div>
                {validationData.isReady && (
                  <span className="flex items-center gap-1.5 text-sm font-medium text-green-600">
                    <CheckCircle className="w-4 h-4" />
                    Ready to send
                  </span>
                )}
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    validationData.overallProgress === 100 ? 'bg-green-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${validationData.overallProgress}%` }}
                />
              </div>
              <p className="text-xs text-gray-600 mt-2">
                Review all required sections to ensure your proposal is complete before sending
              </p>
            </div>
          )}

          {/* Tabs */}
          <div className="bg-white rounded-t-lg border-b border-gray-200">
            <div
              className="flex gap-1 px-2 pt-2 overflow-x-auto scrollbar-hide"
              style={{
                WebkitOverflowScrolling: 'touch',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none'
              } as React.CSSProperties}
            >
              <button
                type="button" onClick={(e) => { e.preventDefault(); setActiveTab('details'); }}
                className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-t-lg font-medium transition-colors whitespace-nowrap text-sm sm:text-base flex-shrink-0 flex items-center gap-2 ${
                  activeTab === 'details'
                    ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                Details
                {(() => {
                  const validation = getSectionValidation('details');
                  if (validation?.isValid && validation?.isReviewed) {
                    return <CheckCircle className="w-4 h-4 text-green-600" />;
                  } else if (validation?.isValid) {
                    return <Eye className="w-4 h-4 text-yellow-600" />;
                  } else if (validation && !validation.isValid) {
                    return <AlertCircle className="w-4 h-4 text-red-600" />;
                  }
                  return null;
                })()}
              </button>
              <button
                type="button" onClick={(e) => { e.preventDefault(); setActiveTab('scope'); }}
                className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-t-lg font-medium transition-colors whitespace-nowrap text-sm sm:text-base flex-shrink-0 flex items-center gap-2 ${
                  activeTab === 'scope'
                    ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <span className="hidden sm:inline">Scope of Work</span>
                <span className="sm:hidden">Scope</span>
                {(() => {
                  const validation = getSectionValidation('scope');
                  if (validation?.isValid && validation?.isReviewed) {
                    return <CheckCircle className="w-4 h-4 text-green-600" />;
                  } else if (validation?.isValid) {
                    return <Eye className="w-4 h-4 text-yellow-600" />;
                  } else if (validation && !validation.isValid) {
                    return <AlertCircle className="w-4 h-4 text-red-600" />;
                  }
                  return null;
                })()}
              </button>
              <button
                type="button" onClick={(e) => { e.preventDefault(); setActiveTab('contract'); }}
                className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-t-lg font-medium transition-colors whitespace-nowrap text-sm sm:text-base flex-shrink-0 flex items-center gap-2 ${
                  activeTab === 'contract'
                    ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                Contract
                {(() => {
                  const validation = getSectionValidation('contract');
                  if (validation?.isValid && validation?.isReviewed) {
                    return <CheckCircle className="w-4 h-4 text-green-600" />;
                  } else if (validation?.isValid) {
                    return <Eye className="w-4 h-4 text-yellow-600" />;
                  } else if (validation && !validation.isValid) {
                    return <AlertCircle className="w-4 h-4 text-red-600" />;
                  }
                  return null;
                })()}
              </button>
              <button
                type="button" onClick={(e) => { e.preventDefault(); setActiveTab('billing'); }}
                className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-t-lg font-medium transition-colors whitespace-nowrap text-sm sm:text-base flex-shrink-0 flex items-center gap-2 ${
                  activeTab === 'billing'
                    ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                Billing
                {(() => {
                  const validation = getSectionValidation('billing');
                  if (validation?.isValid && validation?.isReviewed) {
                    return <CheckCircle className="w-4 h-4 text-green-600" />;
                  } else if (validation?.isValid) {
                    return <Eye className="w-4 h-4 text-yellow-600" />;
                  } else if (validation && !validation.isValid) {
                    return <AlertCircle className="w-4 h-4 text-red-600" />;
                  }
                  return null;
                })()}
              </button>
              <button
                type="button" onClick={(e) => { e.preventDefault(); setActiveTab('tax'); }}
                className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-t-lg font-medium transition-colors whitespace-nowrap text-sm sm:text-base flex-shrink-0 flex items-center gap-2 ${
                  activeTab === 'tax'
                    ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                Tax
                {(() => {
                  const validation = getSectionValidation('tax');
                  if (validation?.isValid && validation?.isReviewed) {
                    return <CheckCircle className="w-4 h-4 text-green-600" />;
                  } else if (validation?.isValid) {
                    return <Eye className="w-4 h-4 text-yellow-600" />;
                  } else if (validation && !validation.isValid) {
                    return <AlertCircle className="w-4 h-4 text-red-600" />;
                  }
                  return null;
                })()}
              </button>
              <button
                type="button" onClick={(e) => { e.preventDefault(); setActiveTab('fees'); }}
                className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-t-lg font-medium transition-colors whitespace-nowrap text-sm sm:text-base flex-shrink-0 flex items-center gap-2 ${
                  activeTab === 'fees'
                    ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <span className="hidden sm:inline">Fees & Modifiers</span>
                <span className="sm:hidden">Fees</span>
                {(() => {
                  const validation = getSectionValidation('fees');
                  if (validation?.isValid && validation?.isReviewed) {
                    return <CheckCircle className="w-4 h-4 text-green-600" />;
                  } else if (validation?.isValid) {
                    return <Eye className="w-4 h-4 text-yellow-600" />;
                  } else if (validation && !validation.isValid) {
                    return <AlertCircle className="w-4 h-4 text-red-600" />;
                  }
                  return null;
                })()}
              </button>
              <button
                type="button" onClick={(e) => { e.preventDefault(); setActiveTab('visibility'); }}
                className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-t-lg font-medium transition-colors whitespace-nowrap text-sm sm:text-base flex-shrink-0 ${
                  activeTab === 'visibility'
                    ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                Columns
              </button>
              <button
                type="button" onClick={(e) => { e.preventDefault(); setActiveTab('areas'); }}
                className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-t-lg font-medium transition-colors whitespace-nowrap text-sm sm:text-base flex-shrink-0 ${
                  activeTab === 'areas'
                    ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                Areas
              </button>
              <button
                type="button" onClick={(e) => { e.preventDefault(); setActiveTab('coverpage'); }}
                className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-t-lg font-medium transition-colors whitespace-nowrap text-sm sm:text-base flex-shrink-0 ${
                  activeTab === 'coverpage'
                    ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <span className="hidden sm:inline">Cover Page</span>
                <span className="sm:hidden">Cover</span>
              </button>
              <button
                type="button" onClick={(e) => { e.preventDefault(); setActiveTab('recordings'); }}
                className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-t-lg font-medium transition-colors whitespace-nowrap text-sm sm:text-base flex-shrink-0 flex items-center gap-1.5 ${
                  activeTab === 'recordings'
                    ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <Video className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Videos</span>
                <span className="sm:hidden">Videos</span>
                {recordingsCount > 0 && (
                  <span className="ml-0.5 w-4 h-4 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center font-bold">
                    {recordingsCount}
                  </span>
                )}
              </button>
              <button
                type="button" onClick={(e) => { e.preventDefault(); setActiveTab('template'); }}
                className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-t-lg font-medium transition-colors whitespace-nowrap text-sm sm:text-base flex-shrink-0 flex items-center gap-1.5 ${
                  activeTab === 'template'
                    ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <Layout className="w-3.5 h-3.5" />
                <span>Template</span>
              </button>
            </div>
          </div>

          {/* Tab Content */}
          <div className="bg-white rounded-b-lg shadow-sm border border-gray-200 p-3 sm:p-6 min-h-[400px] sm:min-h-[600px]">

            {/* CONTRACT TAB */}
            {activeTab === 'contract' && (
              <div className="space-y-4 sm:space-y-6">
                <div>
                  <div className="flex items-center gap-2 mb-3 sm:mb-4">
                    <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900">Contract Selection</h2>
                  </div>
                  <select
                    value={settings.contract_id || ''}
                    onChange={async (e) => {
                      const contractId = e.target.value || null;
                      setSettings({ ...settings, contract_id: contractId });
                      setHasUnsavedChanges(true);

                      if (contractId) {
                        const { data } = await supabase
                          .from('contracts')
                          .select('*')
                          .eq('id', contractId)
                          .single();
                        setSelectedContract(data);
                      } else {
                        setSelectedContract(null);
                      }
                    }}
                    className="w-full px-3 sm:px-4 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">No Contract</option>
                    {contracts.map(contract => (
                      <option key={contract.id} value={contract.id}>
                        {contract.name} {contract.is_default && '(Default)'}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedContract && (
                  <div className="border-t border-gray-200 pt-4 sm:pt-6">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Contract Preview</h3>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden max-h-[300px] sm:max-h-[400px] overflow-y-auto">
                      {/* Contract Header with Logo */}
                      <div className="bg-white border-b border-gray-300 p-3 sm:p-4 flex items-center gap-3 sm:gap-4">
                        <img
                          src="/el_logo_color_(2).png"
                          alt="Electronic Life"
                          className="h-12 w-auto object-contain"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-gray-900">{selectedContract.name}</h3>
                          <p className="text-xs text-gray-600">Terms and Conditions</p>
                        </div>
                      </div>

                      {/* Contract Content - Condensed */}
                      <div className="p-4">
                        <div className="prose prose-sm max-w-none">
                          <pre className="whitespace-pre-wrap font-sans text-xs text-gray-700 leading-snug">
                            {selectedContract.content}
                          </pre>
                        </div>
                      </div>
                    </div>
                    {selectedContract.description && (
                      <p className="text-xs text-gray-500 mt-2">
                        {selectedContract.description}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* TAX TAB */}
            {activeTab === 'tax' && (
              <div>
        <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
            <h2 className="text-base sm:text-lg font-semibold text-gray-900">Tax Configuration</h2>
            {taxSettingsLocked && (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-red-100 border border-red-300 rounded-full text-xs font-medium text-red-700">
                <Lock className="w-3 h-3" />
                Locked
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4">
            Sales tax is calculated based on the customer's ZIP code tax jurisdiction.
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4 mb-3 sm:mb-4">
            <p className="text-sm font-medium text-blue-900 mb-3">Tax Calculation Result:</p>
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-blue-800">
                  <span className="font-semibold">Environment:</span> {taxEnvironment === 'residential' ? 'Residential' : 'Commercial'} •
                  <span className="font-semibold">Project Type:</span> {taxProjectType.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                </div>
              </div>
              <div className="bg-white rounded p-3 space-y-2">
                {(() => {
                  const taxInfo = getTaxApplicability(taxEnvironment as TaxEnvironment, taxProjectType as TaxProjectType);
                  return (
                    <>
                      <div className="flex items-center gap-2">
                        {taxInfo.partsTaxable ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-600" />
                        )}
                        <span className="text-sm font-medium text-gray-900">
                          Parts/Materials: {taxInfo.partsTaxable ? 'Taxable' : 'Not Taxable'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {taxInfo.laborTaxable ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-600" />
                        )}
                        <span className="text-sm font-medium text-gray-900">
                          Labor: {taxInfo.laborTaxable ? 'Taxable' : 'Not Taxable'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-700 italic mt-2">
                        {taxInfo.explanation}
                      </p>
                    </>
                  );
                })()}
              </div>
              <p className="text-xs text-blue-700 mt-2">
                Tax rates will be looked up based on customer's ZIP code. Go to Admin → Tax Management to configure jurisdiction rates.
              </p>
            </div>
          </div>

          {/* Current Tax Rate Display */}
          {proposal?.tax_rate !== undefined && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-green-900 mb-1">Current Tax Rate</p>
                  <p className="text-2xl font-bold text-green-700">
                    {(proposal.tax_rate * 100).toFixed(4)}%
                  </p>
                  <p className="text-xs text-green-700 mt-2">
                    {proposal.tax_override ? (
                      <span className="flex items-center gap-1">
                        <Info className="w-3 h-3" />
                        Manually overridden - will not auto-update
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        Auto-calculated based on customer ZIP code
                      </span>
                    )}
                  </p>
                </div>
                {proposal.contacts?.zip || proposal.jobsite_zip ? (
                  <div className="text-right">
                    <p className="text-xs text-green-700 font-medium">ZIP Code</p>
                    <p className="text-sm text-green-900">{proposal.jobsite_zip || proposal.contacts?.zip}</p>
                  </div>
                ) : (
                  <div className="text-xs text-yellow-700 bg-yellow-100 px-2 py-1 rounded">
                    No ZIP code set
                  </div>
                )}
              </div>
            </div>
          )}

          {taxSettingsLocked ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-3">
                <Lock className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-red-800 mb-1">Tax Settings Locked</p>
                  <p className="text-sm text-red-700">
                    These settings are locked because invoices have already been created for this sales order. Tax settings cannot be changed once invoicing has begun. To modify these settings, all invoices for this order would need to be deleted first.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-2">
                <Info className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-amber-800">
                  <p className="font-medium mb-1">Automatic Tax Recalculation</p>
                  <p>
                    When you change the Environment or Project Type, all line items in this proposal will be automatically updated to reflect the correct tax applicability for parts and labor based on the Tax Matrix below.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                Environment *
                {taxSettingsLocked && <Lock className="w-3.5 h-3.5 text-red-500" />}
              </label>
              {taxSettingsLocked ? (
                <div className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 text-sm font-medium">
                  {taxEnvironment === 'residential' ? 'Residential' : 'Commercial'}
                </div>
              ) : (
                <select
                  value={taxEnvironment}
                  onChange={(e) => {
                    setTaxEnvironment(e.target.value as 'residential' | 'commercial');
                    setHasUnsavedChanges(true);
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="residential">Residential</option>
                  <option value="commercial">Commercial</option>
                </select>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                Project Type *
                {taxSettingsLocked && <Lock className="w-3.5 h-3.5 text-red-500" />}
              </label>
              {taxSettingsLocked ? (
                <div className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 text-sm font-medium">
                  {taxProjectType.replace(/_/g, ' ').split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                </div>
              ) : (
                <select
                  value={taxProjectType}
                  onChange={(e) => {
                    setTaxProjectType(e.target.value);
                    setHasUnsavedChanges(true);
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="original_construction">Original Construction</option>
                  <option value="remodel">Remodel</option>
                  <option value="general_installation_repair">General Installation/Repair or Retail</option>
                  <option value="exempt_project">Exempt Project</option>
                  <option value="design_services">Design Services</option>
                  <option value="maintenance_agreement">Maintenance Agreement</option>
                  <option value="membership">Membership</option>
                  <option value="security_monitoring">Security Monitoring</option>
                </select>
              )}
            </div>
          </div>

          {/* Tax Matrix Reference */}
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Tax Matrix Reference</h3>
            <p className="text-xs text-gray-600 mb-4">
              Quick reference guide for what gets taxed based on environment and project type
            </p>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-lg text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Environment</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Project Type</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase">Parts</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase">Labor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  <tr className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900">Residential</td>
                    <td className="px-4 py-3 text-gray-700">Original Construction</td>
                    <td className="px-4 py-3 text-center"><CheckCircle className="w-4 h-4 text-green-600 mx-auto" /></td>
                    <td className="px-4 py-3 text-center"><XCircle className="w-4 h-4 text-red-600 mx-auto" /></td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900">Residential</td>
                    <td className="px-4 py-3 text-gray-700">Remodel</td>
                    <td className="px-4 py-3 text-center"><CheckCircle className="w-4 h-4 text-green-600 mx-auto" /></td>
                    <td className="px-4 py-3 text-center"><XCircle className="w-4 h-4 text-red-600 mx-auto" /></td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900">Residential</td>
                    <td className="px-4 py-3 text-gray-700">General Installation/Repair or Retail</td>
                    <td className="px-4 py-3 text-center"><CheckCircle className="w-4 h-4 text-green-600 mx-auto" /></td>
                    <td className="px-4 py-3 text-center"><CheckCircle className="w-4 h-4 text-green-600 mx-auto" /></td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900">Commercial</td>
                    <td className="px-4 py-3 text-gray-700">Original Construction</td>
                    <td className="px-4 py-3 text-center"><CheckCircle className="w-4 h-4 text-green-600 mx-auto" /></td>
                    <td className="px-4 py-3 text-center"><XCircle className="w-4 h-4 text-red-600 mx-auto" /></td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900">Commercial</td>
                    <td className="px-4 py-3 text-gray-700">Remodel</td>
                    <td className="px-4 py-3 text-center"><CheckCircle className="w-4 h-4 text-green-600 mx-auto" /></td>
                    <td className="px-4 py-3 text-center"><CheckCircle className="w-4 h-4 text-green-600 mx-auto" /></td>
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900">Commercial</td>
                    <td className="px-4 py-3 text-gray-700">General Installation/Repair or Retail</td>
                    <td className="px-4 py-3 text-center"><CheckCircle className="w-4 h-4 text-green-600 mx-auto" /></td>
                    <td className="px-4 py-3 text-center"><CheckCircle className="w-4 h-4 text-green-600 mx-auto" /></td>
                  </tr>
                  <tr className="hover:bg-gray-50 bg-blue-50">
                    <td className="px-4 py-3 text-gray-900 font-medium" rowSpan={2}>Any</td>
                    <td className="px-4 py-3 text-gray-700">Maintenance / Membership</td>
                    <td className="px-4 py-3 text-center"><CheckCircle className="w-4 h-4 text-green-600 mx-auto" /></td>
                    <td className="px-4 py-3 text-center"><CheckCircle className="w-4 h-4 text-green-600 mx-auto" /></td>
                  </tr>
                  <tr className="hover:bg-gray-50 bg-yellow-50">
                    <td className="px-4 py-3 text-gray-700">Exempt / Design / Monitoring</td>
                    <td className="px-4 py-3 text-center"><XCircle className="w-4 h-4 text-red-600 mx-auto" /></td>
                    <td className="px-4 py-3 text-center"><XCircle className="w-4 h-4 text-red-600 mx-auto" /></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
              </div>
            )}

            {/* COLUMNS/VISIBILITY TAB */}
            {activeTab === 'visibility' && (
              <div className="space-y-8">
                {/* Class Visibility Settings */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <Layers className="w-5 h-5 text-gray-600" />
                    <h2 className="text-lg font-semibold text-gray-900">Class Grouping</h2>
                  </div>
                  <p className="text-sm text-gray-600 mb-4">
                    Control how classes are displayed in proposals. When enabled, line items will be grouped by their assigned class within each area.
                  </p>

                  <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                    {/* Proposal Builder Setting */}
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings?.show_classes_in_builder || false}
                        onChange={(e) => {
                          setSettings({
                            ...settings!,
                            show_classes_in_builder: e.target.checked
                          });
                          setHasUnsavedChanges(true);
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <span className="text-sm font-medium text-gray-900">Show classes in proposal builder</span>
                        <p className="text-xs text-gray-500">Groups items by class when viewing proposals on screen</p>
                      </div>
                    </label>

                    {/* PDF Display Mode */}
                    <div className="border-t border-gray-200 pt-4">
                      <label className="block text-sm font-medium text-gray-900 mb-3">PDF Class Display Mode</label>
                      <div className="space-y-2">
                        <label className="flex items-start gap-3 cursor-pointer p-3 rounded border border-gray-200 hover:bg-white transition-colors">
                          <input
                            type="radio"
                            name="classDisplayMode"
                            value="none"
                            checked={settings?.class_display_mode === 'none'}
                            onChange={(e) => {
                              setSettings({
                                ...settings!,
                                class_display_mode: 'none'
                              });
                              setHasUnsavedChanges(true);
                            }}
                            className="mt-0.5"
                          />
                          <div>
                            <span className="text-sm font-medium text-gray-900">Don't show classes</span>
                            <p className="text-xs text-gray-500">Items appear in a flat list without class grouping</p>
                          </div>
                        </label>

                        <label className="flex items-start gap-3 cursor-pointer p-3 rounded border border-gray-200 hover:bg-white transition-colors">
                          <input
                            type="radio"
                            name="classDisplayMode"
                            value="inline"
                            checked={settings?.class_display_mode === 'inline'}
                            onChange={(e) => {
                              setSettings({
                                ...settings!,
                                class_display_mode: 'inline'
                              });
                              setHasUnsavedChanges(true);
                            }}
                            className="mt-0.5"
                          />
                          <div>
                            <span className="text-sm font-medium text-gray-900">Show classes inline</span>
                            <p className="text-xs text-gray-500">Items are grouped by class within each area</p>
                          </div>
                        </label>

                        <label className="flex items-start gap-3 cursor-pointer p-3 rounded border border-gray-200 hover:bg-white transition-colors">
                          <input
                            type="radio"
                            name="classDisplayMode"
                            value="summary"
                            checked={settings?.class_display_mode === 'summary'}
                            onChange={(e) => {
                              setSettings({
                                ...settings!,
                                class_display_mode: 'summary'
                              });
                              setHasUnsavedChanges(true);
                            }}
                            className="mt-0.5"
                          />
                          <div>
                            <span className="text-sm font-medium text-gray-900">Show class summary page</span>
                            <p className="text-xs text-gray-500">Adds a separate page listing classes and their totals</p>
                          </div>
                        </label>

                        <label className="flex items-start gap-3 cursor-pointer p-3 rounded border border-gray-200 hover:bg-white transition-colors">
                          <input
                            type="radio"
                            name="classDisplayMode"
                            value="both"
                            checked={settings?.class_display_mode === 'both'}
                            onChange={(e) => {
                              setSettings({
                                ...settings!,
                                class_display_mode: 'both'
                              });
                              setHasUnsavedChanges(true);
                            }}
                            className="mt-0.5"
                          />
                          <div>
                            <span className="text-sm font-medium text-gray-900">Show inline and summary page</span>
                            <p className="text-xs text-gray-500">Groups items inline and includes a class summary page</p>
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Column Visibility */}
                <div>
          <div className="flex items-center gap-2 mb-6">
            <Eye className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Column Visibility & Order</h2>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Select which columns to display and drag to reorder them. Columns appear in this order in the proposal builder.
          </p>
          <div className="space-y-2">
            {(columnOrder.length > 0 ? columnOrder : availableColumns.map(c => c.id))
              .map(colId => availableColumns.find(c => c.id === colId))
              .filter(Boolean)
              .map(column => (
              <div
                key={column!.id}
                draggable={!column!.alwaysVisible}
                onDragStart={() => handleDragStart(column!.id)}
                onDragOver={(e) => handleDragOver(e, column!.id)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                  column!.alwaysVisible
                    ? 'bg-gray-50 border-gray-200 cursor-not-allowed'
                    : visibleColumns.has(column!.id)
                    ? 'bg-blue-50 border-blue-300 cursor-move hover:bg-blue-100'
                    : 'bg-white border-gray-200 cursor-move hover:bg-gray-50'
                } ${draggedColumn === column!.id ? 'opacity-50' : ''}`}
              >
                {!column!.alwaysVisible && (
                  <GripVertical className="w-4 h-4 text-gray-400 flex-shrink-0" />
                )}
                <label className="flex items-center gap-3 flex-1 cursor-pointer">
                  <div className="relative flex items-center">
                    <input
                      type="checkbox"
                      checked={visibleColumns.has(column!.id)}
                      onChange={() => !column!.alwaysVisible && toggleColumn(column!.id)}
                      disabled={column!.alwaysVisible}
                      className="sr-only"
                    />
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      visibleColumns.has(column!.id)
                        ? 'bg-blue-600 border-blue-600'
                        : 'bg-white border-gray-300'
                    } ${column!.alwaysVisible ? 'opacity-50' : ''}`}>
                      {visibleColumns.has(column!.id) && (
                        <Check className="w-3 h-3 text-white" />
                      )}
                    </div>
                  </div>
                  <div className="flex-1">
                    <span className={`text-sm font-medium ${
                      column!.alwaysVisible ? 'text-gray-500' : 'text-gray-900'
                    }`}>
                      {column!.label}
                    </span>
                    {column!.alwaysVisible && (
                      <span className="block text-xs text-gray-400 mt-0.5">Always visible</span>
                    )}
                  </div>
                </label>
              </div>
            ))}
          </div>
                </div>
              </div>
            )}

            {/* DETAILS TAB */}
            {activeTab === 'details' && !proposal && (
              <div className="flex items-center justify-center py-16">
                <div className="text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-3" />
                  <p className="text-gray-500 text-sm">Loading proposal details...</p>
                </div>
              </div>
            )}
            {activeTab === 'details' && proposal && (
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">Proposal Details</h2>
                <p className="text-xs sm:text-sm text-gray-600 mb-4 sm:mb-6">
                  Edit proposal title, change customer, and specify jobsite location
                </p>

                <div className="space-y-4 sm:space-y-6">
                  {/* Proposal Title */}
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2">
                      Proposal Title
                    </label>
                    <input
                      type="text"
                      value={proposal.title || ''}
                      onChange={(e) => {
                        setProposal({ ...proposal, title: e.target.value });
                        setHasUnsavedChanges(true);
                      }}
                      className="w-full px-3 sm:px-4 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., Complete Security System Installation"
                    />
                    <p className="text-xs text-gray-500 mt-1">Optional - helps identify this proposal</p>
                  </div>

                  {/* Customer Selection */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs sm:text-sm font-medium text-gray-700">
                        Customer
                      </label>
                      {!showChangeCustomer && proposal.contacts && (
                        <button
                          onClick={() => setShowChangeCustomer(true)}
                          className="text-xs sm:text-sm text-blue-600 hover:text-blue-700 font-medium"
                        >
                          Change
                        </button>
                      )}
                    </div>
                    {showChangeCustomer || !proposal.contacts ? (
                      <div className="space-y-2">
                        <select
                          value={proposal.contact_id || ''}
                          onChange={(e) => {
                            setProposal({ ...proposal, contact_id: e.target.value || null });
                            setHasUnsavedChanges(true);
                            setShowChangeCustomer(false);
                          }}
                          className="w-full px-3 sm:px-4 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Select a customer...</option>
                          {contacts.map((contact) => (
                            <option key={contact.id} value={contact.id}>
                              {contact.full_name} {contact.company_name ? `(${contact.company_name})` : ''}
                            </option>
                          ))}
                        </select>
                        {proposal.contacts && (
                          <button
                            onClick={() => setShowChangeCustomer(false)}
                            className="text-sm text-gray-600 hover:text-gray-700"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="text-gray-900 font-medium">
                        {proposal.contacts.full_name}
                        {proposal.contacts.company_name && (
                          <span className="text-gray-600 ml-2">({proposal.contacts.company_name})</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Selected Customer Info */}
                  {proposal.contacts && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4">
                      <div className="flex items-center justify-between mb-3 gap-2">
                        <h3 className="text-xs sm:text-sm font-semibold text-gray-900 flex items-center gap-2">
                          <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          Customer Info
                        </h3>
                        <button
                          onClick={() => setShowEditCustomer(true)}
                          className="text-xs sm:text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 flex-shrink-0"
                        >
                          <Edit className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                          <span className="hidden sm:inline">Edit Customer</span>
                          <span className="sm:hidden">Edit</span>
                        </button>
                      </div>
                      <div className="space-y-2 text-xs sm:text-sm">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
                          <div>
                            <span className="text-gray-600">Name:</span>
                            <span className="text-gray-900 ml-2 font-medium">{proposal.contacts.full_name}</span>
                          </div>
                          {proposal.contacts.company_name && (
                            <div>
                              <span className="text-gray-600">Company:</span>
                              <span className="text-gray-900 ml-2 font-medium">{proposal.contacts.company_name}</span>
                            </div>
                          )}
                          {proposal.contacts.email && (
                            <div>
                              <span className="text-gray-600">Email:</span>
                              <span className="text-gray-900 ml-2">{proposal.contacts.email}</span>
                            </div>
                          )}
                          {proposal.contacts.phone && (
                            <div>
                              <span className="text-gray-600">Phone:</span>
                              <span className="text-gray-900 ml-2">{proposal.contacts.phone}</span>
                            </div>
                          )}
                        </div>
                        {(proposal.contacts.street_address || proposal.contacts.city) && (
                          <div className="pt-2 border-t border-blue-200">
                            <span className="text-gray-600">Billing Address:</span>
                            <div className="text-gray-900 ml-2">
                              {proposal.contacts.street_address && <div>{proposal.contacts.street_address}</div>}
                              {(proposal.contacts.city || proposal.contacts.state || proposal.contacts.zip) && (
                                <div>
                                  {proposal.contacts.city}{proposal.contacts.city && proposal.contacts.state ? ', ' : ''}{proposal.contacts.state} {proposal.contacts.zip}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Bill-To Party */}
                  <BillToSection
                    proposalId={proposalId}
                    primaryContactEmail={proposal.contacts?.email || null}
                    billToContactId={proposal.bill_to_contact_id || null}
                    billToSendTo={proposal.bill_to_send_to || 'customer'}
                    onBillToChange={(contactId, st) => {
                      setProposal({
                        ...proposal,
                        bill_to_contact_id: contactId,
                        bill_to_send_to: st,
                      });
                    }}
                  />

                  {/* Jobsite Location */}
                  <div className="border-t border-gray-200 pt-6">
                    <div className="flex items-center gap-2 mb-4">
                      <MapPin className="w-5 h-5 text-blue-600" />
                      <h3 className="text-sm font-semibold text-gray-900">Jobsite Location</h3>
                    </div>
                    <p className="text-sm text-gray-600 mb-4">
                      Specify a different location if this work is being done at a property other than the customer's billing address (e.g., summer house, rental property, etc.)
                    </p>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Jobsite Notes
                        </label>
                        <input
                          type="text"
                          value={proposal.jobsite_notes || ''}
                          onChange={(e) => {
                            setProposal({ ...proposal, jobsite_notes: e.target.value });
                            setHasUnsavedChanges(true);
                          }}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="e.g., Summer House, Rental Property #2, Main Office"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Street Address
                        </label>
                        <input
                          type="text"
                          value={proposal.jobsite_address || ''}
                          onChange={(e) => {
                            setProposal({ ...proposal, jobsite_address: e.target.value });
                            setHasUnsavedChanges(true);
                          }}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="123 Main Street"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            City
                          </label>
                          <input
                            type="text"
                            value={proposal.jobsite_city || ''}
                            onChange={(e) => {
                              setProposal({ ...proposal, jobsite_city: e.target.value });
                              setHasUnsavedChanges(true);
                            }}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="City"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            State
                          </label>
                          <input
                            type="text"
                            value={proposal.jobsite_state || ''}
                            onChange={(e) => {
                              setProposal({ ...proposal, jobsite_state: e.target.value });
                              setHasUnsavedChanges(true);
                            }}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="ST"
                            maxLength={2}
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            ZIP Code
                          </label>
                          <input
                            type="text"
                            value={proposal.jobsite_zip || ''}
                            onChange={(e) => {
                              setProposal({ ...proposal, jobsite_zip: e.target.value });
                              setHasUnsavedChanges(true);
                            }}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="12345"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SCOPE OF WORK TAB */}
            {activeTab === 'scope' && (
              <div>
          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-4 -m-6 mb-6">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <FileEdit className="w-5 h-5" />
              Scope of Work
            </h2>
            <p className="text-sm text-emerald-100 mt-1">
              Written description of the overall project scope (appears as separate page on proposal)
            </p>
          </div>

          <div>
            <div className="space-y-4">
              {/* Info Box */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">What is this for?</p>
                  <p className="text-blue-700">
                    This is a detailed written description of the project that will appear as a dedicated page in the customer's proposal report.
                    Use this to explain the project overview, objectives, approach, timeline, or any other narrative information.
                  </p>
                </div>
              </div>

              {/* Text Editor */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-900">
                    Project Scope Description
                  </label>
                  <button
                    onClick={handleGenerateScopeWithAI}
                    disabled={generatingScope || saving || aiCooldown > 0}
                    className={`flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm font-medium shadow-sm ${generatingScope ? 'animate-pulse' : ''}`}
                  >
                    {generatingScope ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    {generatingScope ? 'Generating...' : aiCooldown > 0 ? `Wait ${aiCooldown}s` : 'Generate with AI'}
                  </button>
                </div>

                {/* Warning if proposal items changed since scope was last updated */}
                {settings.scope_of_work &&
                 settings.scope_of_work_updated_at &&
                 settings.proposal_items_hash &&
                 initialItemsHash &&
                 settings.proposal_items_hash !== initialItemsHash && (
                  <div className="mb-3 bg-amber-50 border border-amber-300 rounded-lg p-3 flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-amber-900">Proposal Items Have Changed</p>
                      <p className="text-amber-700 mt-0.5">
                        Line items have been added, removed, or modified since the scope of work was last updated.
                        Please review and update the scope for accuracy.
                      </p>
                    </div>
                  </div>
                )}

                <textarea
                  value={settings.scope_of_work || ''}
                  onChange={(e) => setSettings({ ...settings, scope_of_work: e.target.value })}
                  rows={16}
                  placeholder="Enter a detailed description of the project scope, objectives, deliverables, and approach...

Example:
PROJECT OVERVIEW
This comprehensive home automation project will transform your residence into a fully integrated smart home...

SCOPE OF WORK
• Complete lighting control system installation
• Multi-room audio/video distribution
• Climate control integration
• Security system integration

PROJECT APPROACH
Our team will work in phases to minimize disruption...

TIMELINE
Phase 1: Planning and Design (2 weeks)
Phase 2: Installation (4-6 weeks)
Phase 3: Programming and Testing (1 week)"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm resize-y"
                  style={{ minHeight: '400px', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
                />
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-3">
                    <p className="text-xs text-gray-500">
                      {settings.scope_of_work?.length || 0} characters
                    </p>
                    {scopeAutoSaving && (
                      <p className="text-xs text-blue-600 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Saving...
                      </p>
                    )}
                    {settings.scope_of_work_updated_at && !scopeAutoSaving && (
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Last updated: {new Date(settings.scope_of_work_updated_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    This will appear as a separate page in the customer's proposal document
                  </p>
                </div>
              </div>

              {/* Formatting Tips */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-900 mb-2">Formatting Tips:</p>
                <ul className="text-xs text-gray-600 space-y-1">
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-600 mt-0.5">•</span>
                    <span>Use ALL CAPS for section headings</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-600 mt-0.5">•</span>
                    <span>Use bullet points (•) for lists</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-600 mt-0.5">•</span>
                    <span>Add blank lines between sections for better readability</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-600 mt-0.5">•</span>
                    <span>Be specific about deliverables, timeline, and approach</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
              </div>
            )}

            {/* BILLING TAB */}
            {activeTab === 'billing' && (
              <div>
                {!salesOrder ? (
                  /* Show deposit configuration before sales order is created */
                  <div>
                    <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="text-sm text-blue-900 font-medium flex items-center gap-2">
                            Pre-Approval Settings
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
                              Auto-Sync
                            </span>
                          </p>
                          <p className="text-xs text-blue-700 mt-1">
                            Configure deposit and payment terms. Changes made here or in the Manual Approval Modal sync automatically.
                          </p>
                        </div>
                        {billingAutoSaving && (
                          <div className="flex items-center gap-2 text-sm text-blue-600">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Saving...</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <DepositConfiguration
                      proposalId={proposalId}
                      requireDeposit={settings.require_deposit ?? true}
                      depositType={settings.deposit_type ?? 'percentage'}
                      depositPercent={settings.deposit_percent ?? 50}
                      depositAmount={settings.deposit_amount ?? 0}
                      acceptanceMethods={settings.acceptance_methods ?? ['payment']}
                      paymentSchedule={settings.payment_schedule ?? []}
                      progressBillingType={settings.progress_billing_type ?? 'completion'}
                      progressInvoiceTerms={settings.progress_invoice_terms ?? 'net_30'}
                      balancePaymentTerms={settings.balance_payment_terms ?? 'Upon project completion or progress'}
                      billingPhases={billingPhases}
                      onChange={(field, value) => setSettings(prev => ({ ...prev, [field]: value } as ProposalSettingsData))}
                      onBillingPhasesChange={(phases) => {
                        setBillingPhases(phases);
                        saveBillingPhases(phases);
                      }}
                    />
                  </div>
                ) : (
                  /* Show progress billing manager after sales order is created */
                  <div>
                    <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-4">
                      <p className="text-sm text-green-900 font-medium">Sales Order Created - Progress Billing Active</p>
                      <p className="text-xs text-green-700 mt-1">
                        This proposal has been approved. You can now create progress invoices as work is completed.
                      </p>
                    </div>
                    <ProgressBillingManager
                      proposalId={proposalId}
                      salesOrderId={salesOrder.id}
                      onCreateInvoice={() => setShowCreateInvoiceModal(true)}
                    />
                  </div>
                )}
              </div>
            )}

            {/* FEES & MODIFIERS TAB */}
            {activeTab === 'fees' && (
              <div>
          <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">Default Fees & Modifiers</h2>
          <div className="mb-4 sm:mb-6 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs sm:text-sm text-blue-900 font-medium">Billing Settings Sync</p>
                <p className="text-xs sm:text-sm text-blue-700 mt-1">
                  These billing modifiers are synced with the Manual Approval process. Changes made here or during manual approval will be reflected in both places.
                </p>
              </div>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-gray-600 mb-4 sm:mb-6">
            Set default modifiers that will be applied to all new proposals. Sales reps can adjust these on individual proposals as needed.
          </p>

          <div className="space-y-4 sm:space-y-6">
            {/* Standard Modifiers */}
            <div>
              <h3 className="text-xs sm:text-sm font-semibold text-gray-900 mb-3">Standard Modifiers</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                    Discount %
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={settings.discount_percent || 0}
                      onChange={(e) => setSettings({ ...settings, discount_percent: parseFloat(e.target.value) || 0 })}
                      className="w-24 sm:w-32 px-2 sm:px-4 py-2 text-sm sm:text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-gray-600 text-sm">%</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Subtracts from subtotal</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Project Management %
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={settings.project_management_percent}
                      onChange={(e) => setSettings({ ...settings, project_management_percent: parseFloat(e.target.value) || 0 })}
                      className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-gray-600">%</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">PM fee added to total</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Project Design %
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={settings.project_design_percent || 0}
                      onChange={(e) => setSettings({ ...settings, project_design_percent: parseFloat(e.target.value) || 0 })}
                      className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-gray-600">%</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Design fee added to total</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    System Design %
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={settings.system_design_percent}
                      onChange={(e) => setSettings({ ...settings, system_design_percent: parseFloat(e.target.value) || 0 })}
                      className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-gray-600">%</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">System design fee</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Credit Card Fee %
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={settings.credit_card_fee_percent}
                      onChange={(e) => setSettings({ ...settings, credit_card_fee_percent: parseFloat(e.target.value) || 0 })}
                      className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-gray-600">%</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">CC processing fee</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Miscellaneous Parts %
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={settings.misc_parts_percent}
                      onChange={(e) => setSettings({ ...settings, misc_parts_percent: parseFloat(e.target.value) || 0 })}
                      className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-gray-600">%</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Misc parts markup</p>
                </div>
              </div>
            </div>

            {/* Custom Modifiers */}
            <div className="border-t border-gray-200 pt-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Custom Modifiers</h3>
              <p className="text-sm text-gray-600 mb-4">
                Create custom line items like Rush Fees, Volume Discounts, Fuel Surcharges, etc.
              </p>

              <div className="space-y-4">
                {/* Custom Modifier 1 */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="text-sm font-medium text-gray-900 mb-3">Custom Modifier 1</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Label
                      </label>
                      <input
                        type="text"
                        value={settings.custom_modifier_1_label || ''}
                        onChange={(e) => setSettings({ ...settings, custom_modifier_1_label: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g., Rush Fee, Volume Discount"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Percentage
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.1"
                          value={settings.custom_modifier_1_percent || 0}
                          onChange={(e) => setSettings({ ...settings, custom_modifier_1_percent: parseFloat(e.target.value) || 0 })}
                          className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-gray-600">%</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Use positive to add, negative to subtract</p>
                    </div>
                  </div>
                </div>

                {/* Custom Modifier 2 */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="text-sm font-medium text-gray-900 mb-3">Custom Modifier 2</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Label
                      </label>
                      <input
                        type="text"
                        value={settings.custom_modifier_2_label || ''}
                        onChange={(e) => setSettings({ ...settings, custom_modifier_2_label: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="e.g., Referral Credit, Fuel Surcharge"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Percentage
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.1"
                          value={settings.custom_modifier_2_percent || 0}
                          onChange={(e) => setSettings({ ...settings, custom_modifier_2_percent: parseFloat(e.target.value) || 0 })}
                          className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-gray-600">%</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Use positive to add, negative to subtract</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
              </div>
            )}

            {/* AREAS TAB */}
            {activeTab === 'areas' && (
              <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Proposal Areas Setup</h2>
          <p className="text-sm text-gray-600 mb-1">
            Manage area templates. Areas are shown in the same order as they appear here in the proposal builder.
          </p>
          <p className="text-xs text-gray-500 mb-4">
            Press <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs font-mono">Enter</kbd> to quickly add multiple areas
          </p>

          <div className="mb-4 flex gap-2">
            <input
              type="text"
              value={newArea}
              onChange={(e) => setNewArea(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newArea.trim()) {
                  e.preventDefault();
                  handleAddAreaTemplate();
                }
              }}
              placeholder="Living Room, Kitchen, CCTV, etc..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleAddAreaTemplate}
              disabled={!newArea.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add</span>
            </button>
          </div>

          {areaTemplates.length === 0 && (
            <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
              <Layers className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p className="text-sm font-medium">No area templates yet</p>
              <p className="text-xs mt-1">Add your first area template above</p>
            </div>
          )}

          <div className="space-y-2 mb-4">
            {areaTemplates.map(area => (
              <div
                key={area.id}
                draggable={editingAreaId !== area.id}
                onDragStart={(e) => {
                  if (editingAreaId === area.id) {
                    e.preventDefault();
                    return;
                  }
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', area.id);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const draggedId = e.dataTransfer.getData('text/plain');
                  if (draggedId !== area.id) {
                    handleReorderAreas(draggedId, area.id);
                  }
                }}
                className={`flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 hover:border-gray-300 transition-all group ${
                  editingAreaId !== area.id ? 'cursor-move' : ''
                }`}
              >
                <GripVertical className="w-5 h-5 text-gray-400 group-hover:text-gray-600 flex-shrink-0" />
                <input
                  type="checkbox"
                  checked={(settings.selected_areas || []).includes(area.name)}
                  onChange={() => toggleArea(area.name)}
                  className="w-4 h-4 text-blue-600 flex-shrink-0"
                />
                {editingAreaId === area.id ? (
                  <input
                    type="text"
                    value={editingAreaName}
                    onChange={(e) => setEditingAreaName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleUpdateAreaTemplate(area.id, editingAreaName);
                      } else if (e.key === 'Escape') {
                        setEditingAreaId(null);
                        setEditingAreaName('');
                      }
                    }}
                    onBlur={() => {
                      if (editingAreaName.trim() && editingAreaName !== area.name) {
                        handleUpdateAreaTemplate(area.id, editingAreaName);
                      } else {
                        setEditingAreaId(null);
                        setEditingAreaName('');
                      }
                    }}
                    className="flex-1 px-2 py-1 text-sm font-medium text-gray-900 border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                ) : (
                  <span
                    className="flex-1 text-sm font-medium text-gray-900 cursor-text hover:text-blue-600 transition-colors"
                    onClick={() => {
                      setEditingAreaId(area.id);
                      setEditingAreaName(area.name);
                    }}
                  >
                    {area.name}
                  </span>
                )}
                <button
                  onClick={() => {
                    if (editingAreaId === area.id) {
                      setEditingAreaId(null);
                      setEditingAreaName('');
                    } else {
                      setEditingAreaId(area.id);
                      setEditingAreaName(area.name);
                    }
                  }}
                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                  title="Edit area name"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDeleteAreaTemplate(area.id)}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                  title="Delete area"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {settings.selected_areas.length > 0 && (
            <button
              onClick={handleApplyAreasToProposal}
              className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
            >
              Apply Selected Areas to Proposal
            </button>
          )}

          {areaTemplates.length > 0 && (
            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 text-sm text-blue-900">
                  <p className="font-medium mb-2">Quick Tips:</p>
                  <ul className="space-y-1 text-xs">
                    <li>• Click on any area name to edit it inline</li>
                    <li>• Press <kbd className="px-1 py-0.5 bg-white border border-blue-300 rounded text-xs font-mono">Enter</kbd> to save, <kbd className="px-1 py-0.5 bg-white border border-blue-300 rounded text-xs font-mono">Esc</kbd> to cancel</li>
                    <li>• Drag and drop areas to reorder them</li>
                    <li>• Check the boxes to select areas for bulk application to your proposal</li>
                    <li>• Hover over an area to reveal the edit and delete buttons</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
              </div>
            )}

            {/* COVER PAGE TAB */}
            {activeTab === 'coverpage' && (
              <div>
                <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-4 -m-6 mb-6">
                  <h2 className="text-xl font-bold text-white">
                    Cover Page Image
                  </h2>
                  <p className="text-sm text-purple-100 mt-1">
                    Select a professional cover image for your proposal PDF
                  </p>
                </div>

                {/* Current Selection */}
                {settings.cover_page_image_url && (
                  <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-start gap-4">
                      <img
                        src={settings.cover_page_image_url}
                        alt="Current cover page"
                        className="w-32 h-20 object-cover rounded-lg border-2 border-blue-400"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-blue-900 mb-1">Current Cover Page Image</p>
                        <p className="text-xs text-blue-700 mb-2 break-all">{settings.cover_page_image_url}</p>
                        <button
                          onClick={() => setSettings({ ...settings, cover_page_image_url: null })}
                          className="text-sm text-red-600 hover:text-red-700 font-medium"
                        >
                          Remove Image
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Custom Upload Option */}
                <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <h3 className="font-semibold text-emerald-900 mb-2 flex items-center gap-2">
                    <FileEdit className="w-4 h-4" />
                    Custom Image URL
                  </h3>
                  <p className="text-sm text-emerald-700 mb-3">
                    Enter a direct URL to your own custom image
                  </p>
                  <input
                    type="text"
                    placeholder="https://example.com/your-image.jpg"
                    value={settings.cover_page_image_url || ''}
                    onChange={(e) => setSettings({ ...settings, cover_page_image_url: e.target.value || null })}
                    className="w-full px-4 py-2 border border-emerald-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                {/* Stock Image Gallery */}
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3">Professional Stock Images</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Choose from our curated collection of high-quality images
                  </p>

                  {/* Residential Category */}
                  <div className="mb-6">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Residential</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                      {[
                        { url: 'https://images.pexels.com/photos/1396122/pexels-photo-1396122.jpeg?auto=compress&cs=tinysrgb&w=1920', label: 'Modern Home Exterior' },
                        { url: 'https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=1920', label: 'Luxury Living Room' },
                        { url: 'https://images.pexels.com/photos/1643383/pexels-photo-1643383.jpeg?auto=compress&cs=tinysrgb&w=1920', label: 'Contemporary Interior' },
                        { url: 'https://images.pexels.com/photos/2343465/pexels-photo-2343465.jpeg?auto=compress&cs=tinysrgb&w=1920', label: 'Elegant Home' },
                        { url: 'https://images.pexels.com/photos/1571453/pexels-photo-1571453.jpeg?auto=compress&cs=tinysrgb&w=1920', label: 'Modern Kitchen' }
                      ].map((image, idx) => (
                        <button
                          key={idx}
                          onClick={() => setSettings({ ...settings, cover_page_image_url: image.url })}
                          className={`group relative aspect-video rounded-lg overflow-hidden border-2 transition-all ${
                            settings.cover_page_image_url === image.url
                              ? 'border-blue-600 ring-2 ring-blue-500'
                              : 'border-gray-200 hover:border-gray-400'
                          }`}
                        >
                          <img
                            src={image.url}
                            alt={image.label}
                            className="w-full h-full object-cover"
                          />
                          {settings.cover_page_image_url === image.url && (
                            <div className="absolute inset-0 bg-blue-600 bg-opacity-20 flex items-center justify-center">
                              <Check className="w-8 h-8 text-white drop-shadow-lg" />
                            </div>
                          )}
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                            <p className="text-xs text-white font-medium truncate">{image.label}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Commercial Category */}
                  <div className="mb-6">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Commercial</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                      {[
                        { url: 'https://images.pexels.com/photos/325229/pexels-photo-325229.jpeg?auto=compress&cs=tinysrgb&w=1920', label: 'Office Building' },
                        { url: 'https://images.pexels.com/photos/380768/pexels-photo-380768.jpeg?auto=compress&cs=tinysrgb&w=1920', label: 'Corporate Office' },
                        { url: 'https://images.pexels.com/photos/1181406/pexels-photo-1181406.jpeg?auto=compress&cs=tinysrgb&w=1920', label: 'Modern Workspace' },
                        { url: 'https://images.pexels.com/photos/221540/pexels-photo-221540.jpeg?auto=compress&cs=tinysrgb&w=1920', label: 'Business Center' },
                        { url: 'https://images.pexels.com/photos/534220/pexels-photo-534220.jpeg?auto=compress&cs=tinysrgb&w=1920', label: 'Retail Space' }
                      ].map((image, idx) => (
                        <button
                          key={idx}
                          onClick={() => setSettings({ ...settings, cover_page_image_url: image.url })}
                          className={`group relative aspect-video rounded-lg overflow-hidden border-2 transition-all ${
                            settings.cover_page_image_url === image.url
                              ? 'border-blue-600 ring-2 ring-blue-500'
                              : 'border-gray-200 hover:border-gray-400'
                          }`}
                        >
                          <img
                            src={image.url}
                            alt={image.label}
                            className="w-full h-full object-cover"
                          />
                          {settings.cover_page_image_url === image.url && (
                            <div className="absolute inset-0 bg-blue-600 bg-opacity-20 flex items-center justify-center">
                              <Check className="w-8 h-8 text-white drop-shadow-lg" />
                            </div>
                          )}
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                            <p className="text-xs text-white font-medium truncate">{image.label}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Technology Category */}
                  <div className="mb-6">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Technology & Smart Home</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                      {[
                        { url: 'https://images.pexels.com/photos/276724/pexels-photo-276724.jpeg?auto=compress&cs=tinysrgb&w=1920', label: 'Smart Home Control' },
                        { url: 'https://images.pexels.com/photos/6899331/pexels-photo-6899331.jpeg?auto=compress&cs=tinysrgb&w=1920', label: 'Home Theater' },
                        { url: 'https://images.pexels.com/photos/5496463/pexels-photo-5496463.jpeg?auto=compress&cs=tinysrgb&w=1920', label: 'Security System' },
                        { url: 'https://images.pexels.com/photos/2598024/pexels-photo-2598024.jpeg?auto=compress&cs=tinysrgb&w=1920', label: 'Control Room' },
                        { url: 'https://images.pexels.com/photos/7688336/pexels-photo-7688336.jpeg?auto=compress&cs=tinysrgb&w=1920', label: 'Tech Installation' }
                      ].map((image, idx) => (
                        <button
                          key={idx}
                          onClick={() => setSettings({ ...settings, cover_page_image_url: image.url })}
                          className={`group relative aspect-video rounded-lg overflow-hidden border-2 transition-all ${
                            settings.cover_page_image_url === image.url
                              ? 'border-blue-600 ring-2 ring-blue-500'
                              : 'border-gray-200 hover:border-gray-400'
                          }`}
                        >
                          <img
                            src={image.url}
                            alt={image.label}
                            className="w-full h-full object-cover"
                          />
                          {settings.cover_page_image_url === image.url && (
                            <div className="absolute inset-0 bg-blue-600 bg-opacity-20 flex items-center justify-center">
                              <Check className="w-8 h-8 text-white drop-shadow-lg" />
                            </div>
                          )}
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                            <p className="text-xs text-white font-medium truncate">{image.label}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Luxury Category */}
                  <div className="mb-6">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Luxury & High-End</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                      {[
                        { url: 'https://images.pexels.com/photos/323780/pexels-photo-323780.jpeg?auto=compress&cs=tinysrgb&w=1920', label: 'Luxury Estate' },
                        { url: 'https://images.pexels.com/photos/1457842/pexels-photo-1457842.jpeg?auto=compress&cs=tinysrgb&w=1920', label: 'Premium Interior' },
                        { url: 'https://images.pexels.com/photos/1571468/pexels-photo-1571468.jpeg?auto=compress&cs=tinysrgb&w=1920', label: 'Designer Space' },
                        { url: 'https://images.pexels.com/photos/2079249/pexels-photo-2079249.jpeg?auto=compress&cs=tinysrgb&w=1920', label: 'Upscale Living' },
                        { url: 'https://images.pexels.com/photos/2635038/pexels-photo-2635038.jpeg?auto=compress&cs=tinysrgb&w=1920', label: 'Modern Luxury' }
                      ].map((image, idx) => (
                        <button
                          key={idx}
                          onClick={() => setSettings({ ...settings, cover_page_image_url: image.url })}
                          className={`group relative aspect-video rounded-lg overflow-hidden border-2 transition-all ${
                            settings.cover_page_image_url === image.url
                              ? 'border-blue-600 ring-2 ring-blue-500'
                              : 'border-gray-200 hover:border-gray-400'
                          }`}
                        >
                          <img
                            src={image.url}
                            alt={image.label}
                            className="w-full h-full object-cover"
                          />
                          {settings.cover_page_image_url === image.url && (
                            <div className="absolute inset-0 bg-blue-600 bg-opacity-20 flex items-center justify-center">
                              <Check className="w-8 h-8 text-white drop-shadow-lg" />
                            </div>
                          )}
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                            <p className="text-xs text-white font-medium truncate">{image.label}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Outdoor & Exterior Category */}
                  <div className="mb-6">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Outdoor & Exterior</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                      {[
                        { url: 'https://images.pexels.com/photos/1396132/pexels-photo-1396132.jpeg?auto=compress&cs=tinysrgb&w=1920', label: 'Backyard Living' },
                        { url: 'https://images.pexels.com/photos/1350789/pexels-photo-1350789.jpeg?auto=compress&cs=tinysrgb&w=1920', label: 'Pool & Patio' },
                        { url: 'https://images.pexels.com/photos/2157404/pexels-photo-2157404.jpeg?auto=compress&cs=tinysrgb&w=1920', label: 'Outdoor Entertainment' },
                        { url: 'https://images.pexels.com/photos/2253879/pexels-photo-2253879.jpeg?auto=compress&cs=tinysrgb&w=1920', label: 'Garden Landscape' },
                        { url: 'https://images.pexels.com/photos/2635800/pexels-photo-2635800.jpeg?auto=compress&cs=tinysrgb&w=1920', label: 'Exterior Design' }
                      ].map((image, idx) => (
                        <button
                          key={idx}
                          onClick={() => setSettings({ ...settings, cover_page_image_url: image.url })}
                          className={`group relative aspect-video rounded-lg overflow-hidden border-2 transition-all ${
                            settings.cover_page_image_url === image.url
                              ? 'border-blue-600 ring-2 ring-blue-500'
                              : 'border-gray-200 hover:border-gray-400'
                          }`}
                        >
                          <img
                            src={image.url}
                            alt={image.label}
                            className="w-full h-full object-cover"
                          />
                          {settings.cover_page_image_url === image.url && (
                            <div className="absolute inset-0 bg-blue-600 bg-opacity-20 flex items-center justify-center">
                              <Check className="w-8 h-8 text-white drop-shadow-lg" />
                            </div>
                          )}
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                            <p className="text-xs text-white font-medium truncate">{image.label}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Industrial & Construction Category */}
                  <div className="mb-6">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Industrial & Construction</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                      {[
                        { url: 'https://images.pexels.com/photos/256381/pexels-photo-256381.jpeg?auto=compress&cs=tinysrgb&w=1920', label: 'Warehouse Facility' },
                        { url: 'https://images.pexels.com/photos/159358/construction-site-build-construction-work-159358.jpeg?auto=compress&cs=tinysrgb&w=1920', label: 'Construction Site' },
                        { url: 'https://images.pexels.com/photos/2219024/pexels-photo-2219024.jpeg?auto=compress&cs=tinysrgb&w=1920', label: 'Industrial Space' },
                        { url: 'https://images.pexels.com/photos/2219028/pexels-photo-2219028.jpeg?auto=compress&cs=tinysrgb&w=1920', label: 'Infrastructure' },
                        { url: 'https://images.pexels.com/photos/2219064/pexels-photo-2219064.jpeg?auto=compress&cs=tinysrgb&w=1920', label: 'Commercial Build' }
                      ].map((image, idx) => (
                        <button
                          key={idx}
                          onClick={() => setSettings({ ...settings, cover_page_image_url: image.url })}
                          className={`group relative aspect-video rounded-lg overflow-hidden border-2 transition-all ${
                            settings.cover_page_image_url === image.url
                              ? 'border-blue-600 ring-2 ring-blue-500'
                              : 'border-gray-200 hover:border-gray-400'
                          }`}
                        >
                          <img
                            src={image.url}
                            alt={image.label}
                            className="w-full h-full object-cover"
                          />
                          {settings.cover_page_image_url === image.url && (
                            <div className="absolute inset-0 bg-blue-600 bg-opacity-20 flex items-center justify-center">
                              <Check className="w-8 h-8 text-white drop-shadow-lg" />
                            </div>
                          )}
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                            <p className="text-xs text-white font-medium truncate">{image.label}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* RECORDINGS TAB */}
            {activeTab === 'recordings' && (
              <ProposalRecordingsPanel
                proposalId={proposalId}
                rooms={areaTemplates.map(a => ({ id: a.id, name: a.name, sort_order: a.sort_order || 0 }))}
                onRecordingsChange={setRecordingsCount}
              />
            )}

            {/* TEMPLATE TAB */}
            {activeTab === 'template' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900">Proposal Template</h2>
                    <p className="text-xs sm:text-sm text-gray-600 mt-1">
                      Choose the report template used when this proposal is sent to the customer. You can override this when sending.
                    </p>
                  </div>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      window.dispatchEvent(new CustomEvent('navigate', { detail: { module: 'proposal-template-manager' } }));
                    }}
                    className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium whitespace-nowrap"
                  >
                    <ExternalLink className="w-4 h-4" />
                    <span className="hidden sm:inline">Manage Templates</span>
                  </a>
                </div>

                {loadingTemplates ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                  </div>
                ) : reportTemplates.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                    <Layout className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-600 font-medium mb-1">No templates found</p>
                    <p className="text-sm text-gray-500">Create a template in the Template Manager to get started.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* No template option */}
                    <button
                      onClick={() => saveProposalTemplate(null)}
                      className={`w-full flex items-center gap-4 p-4 rounded-lg border-2 text-left transition-all ${
                        !proposal?.report_template_id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        !proposal?.report_template_id ? 'bg-blue-100' : 'bg-gray-100'
                      }`}>
                        <FileText className={`w-5 h-5 ${!proposal?.report_template_id ? 'text-blue-600' : 'text-gray-400'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900 text-sm">Company Default</p>
                          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Auto-selected</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">Uses the default template set in company settings</p>
                      </div>
                      {!proposal?.report_template_id && (
                        <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
                      )}
                    </button>

                    {reportTemplates.map(template => (
                      <button
                        key={template.id}
                        onClick={() => saveProposalTemplate(template.id)}
                        disabled={savingTemplate}
                        className={`w-full flex items-center gap-4 p-4 rounded-lg border-2 text-left transition-all ${
                          proposal?.report_template_id === template.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          proposal?.report_template_id === template.id ? 'bg-blue-100' : 'bg-gray-100'
                        }`}>
                          <Layout className={`w-5 h-5 ${proposal?.report_template_id === template.id ? 'text-blue-600' : 'text-gray-400'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-gray-900 text-sm">{template.name}</p>
                            {template.is_default && (
                              <span className="text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full">Default</span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {template.show_product_images && (
                              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Product Images</span>
                            )}
                            {template.show_unit_prices && (
                              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Unit Prices</span>
                            )}
                            {template.show_total && (
                              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Totals</span>
                            )}
                            {template.show_quantity && (
                              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Quantities</span>
                            )}
                          </div>
                        </div>
                        {proposal?.report_template_id === template.id ? (
                          <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
                        ) : savingTemplate ? (
                          <Loader2 className="w-4 h-4 animate-spin text-gray-400 flex-shrink-0" />
                        ) : null}
                      </button>
                    ))}
                  </div>
                )}

                {proposal?.report_template_id && (
                  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-blue-800">
                        This template will be pre-selected when you send this proposal to the customer. You can still choose a different template at send time.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>

      {showEditCustomer && proposal?.contact_id && (
        <EditCustomerModal
          contactId={proposal.contact_id}
          proposalId={proposalId}
          onSave={() => {
            loadData();
            setShowEditCustomer(false);
          }}
          onClose={() => setShowEditCustomer(false)}
        />
      )}

      {showCreateInvoiceModal && salesOrder && proposal?.contact_id && (
        <CreateProgressInvoiceModal
          proposalId={proposalId}
          salesOrderId={salesOrder.id}
          contactId={proposal.contact_id}
          onClose={() => setShowCreateInvoiceModal(false)}
          onSuccess={(invoiceId: string) => {
            setShowCreateInvoiceModal(false);
            loadData();
            setViewingInvoiceId(invoiceId);
          }}
        />
      )}

      <ConfirmModal
        isOpen={!!confirmModal}
        title={confirmModal?.title || ''}
        message={confirmModal?.message || ''}
        variant="warning"
        onConfirm={() => confirmModal?.onConfirm()}
        onCancel={() => setConfirmModal(null)}
      />

      {viewingInvoiceId && (
        <InvoiceDetailModal
          invoiceId={viewingInvoiceId}
          onClose={() => setViewingInvoiceId(null)}
          onPaymentRecorded={() => { setViewingInvoiceId(null); loadData(); }}
        />
      )}
    </div>
  );
}
