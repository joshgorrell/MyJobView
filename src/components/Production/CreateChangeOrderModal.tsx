import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { X, Plus, Trash2, Save, Send, Package, AlertCircle, Info, Link2, ChevronDown, ChevronUp, Globe, Lock } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { RemoveLineItemDialog } from './RemoveLineItemDialog';
import { computeTaxTotals, type TaxEnvironment, type TaxProjectType } from '../../lib/taxCalculations';
import { TaxRulesBadge } from '../Shared/TaxRulesBadge';

interface LineItem {
  id?: string;
  action_type: 'add' | 'remove' | 'modify_quantity' | 'modify_price';
  product_id?: string;
  product_name: string;
  product_description?: string;
  item_type: 'material' | 'labor' | 'both';
  original_quantity?: number;
  original_unit_price?: number;
  original_total?: number;
  original_labor_total?: number;
  new_quantity: number;
  new_unit_price: number;
  new_total: number;
  labor_hours?: number;
  labor_rate?: number;
  labor_total?: number;
  is_taxable: boolean;
  change_amount: number;
  labor_phase_id?: string;
  labor_phase_name?: string;
  install_location?: string;
  tech_notes?: string;
  sort_order: number;
  parent_index?: number | null;
}

interface SalesOrder {
  id: string;
  order_number: string;
  contract_total: number;
  contact?: {
    full_name: string;
    tax_rate?: number;
    is_tax_exempt?: boolean;
  } | null;
  proposal?: {
    tax_environment?: string;
    tax_project_type?: string;
    tax_rate?: number;
  };
}

interface Product {
  id: string;
  name: string;
  description: string;
  retail_price: number;
  item_type?: string;
}

interface ProposalSettings {
  discount_percent?: number;
  project_management_percent?: number;
  project_design_percent?: number;
  system_design_percent?: number;
  credit_card_fee_percent?: number;
  misc_parts_percent?: number;
  custom_modifier_1_percent?: number;
  custom_modifier_2_percent?: number;
  custom_modifier_1_label?: string;
  custom_modifier_2_label?: string;
}

interface CreateChangeOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  salesOrderId?: string;
  onSuccess: (newId?: string) => void;
}

export function CreateChangeOrderModal({ isOpen, onClose, salesOrderId: initialSalesOrderId, onSuccess }: CreateChangeOrderModalProps) {
  const { profile } = useAuth();
  const hasPreselectedOrder = !!initialSalesOrderId;

  // When launched from a sales order, we show a single-step "Create Draft" form
  // When launched standalone, we use 5 steps: Select Order (1) → Items (2) → Modifiers (3) → Details (4) → Review (5)
  const totalSteps = hasPreselectedOrder ? 1 : 5;

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedSalesOrder, setSelectedSalesOrder] = useState<string>(initialSalesOrderId || '');
  const [proposalSettings, setProposalSettings] = useState<ProposalSettings>({});
  const [showModifiers, setShowModifiers] = useState(false);

  // Change order fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [notes, setNotes] = useState('');
  const [notesPublic, setNotesPublic] = useState(false);
  const [reason, setReason] = useState('customer_request');
  const [type, setType] = useState<'addition' | 'deletion' | 'modification' | 'credit'>('addition');
  const [lineItems, setLineItems] = useState<LineItem[]>([]);

  // Remove dialog state
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [removeDialogIndex, setRemoveDialogIndex] = useState<number | null>(null);
  const [laborPhases, setLaborPhases] = useState<{ id: string; name: string }[]>([]);

  // Tax configuration
  const [taxEnvironment, setTaxEnvironment] = useState('residential');
  const [taxProjectType, setTaxProjectType] = useState('general_installation_repair');
  const [taxRate, setTaxRate] = useState(0.0935);
  const [isTaxExempt, setIsTaxExempt] = useState(false);

  // Modifiers
  const [applyDiscount, setApplyDiscount] = useState(false);
  const [applyProjectManagement, setApplyProjectManagement] = useState(false);
  const [applyProjectDesign, setApplyProjectDesign] = useState(false);
  const [applySystemDesign, setApplySystemDesign] = useState(false);
  const [applyCreditCardFee, setApplyCreditCardFee] = useState(false);
  const [applyMiscParts, setApplyMiscParts] = useState(false);
  const [applyCustomMod1, setApplyCustomMod1] = useState(false);
  const [applyCustomMod2, setApplyCustomMod2] = useState(false);

  const [discountPercent, setDiscountPercent] = useState(0);
  const [projectManagementPercent, setProjectManagementPercent] = useState(0);
  const [projectDesignPercent, setProjectDesignPercent] = useState(0);
  const [systemDesignPercent, setSystemDesignPercent] = useState(0);
  const [creditCardFeePercent, setCreditCardFeePercent] = useState(0);
  const [miscPartsPercent, setMiscPartsPercent] = useState(0);
  const [customMod1Percent, setCustomMod1Percent] = useState(0);
  const [customMod2Percent, setCustomMod2Percent] = useState(0);

  // Calculated totals
  const [originalContractAmount, setOriginalContractAmount] = useState(0);
  const [partsSubtotal, setPartsSubtotal] = useState(0);
  const [laborSubtotal, setLaborSubtotal] = useState(0);
  const [subtotalAfterModifiers, setSubtotalAfterModifiers] = useState(0);
  const [partsTax, setPartsTax] = useState(0);
  const [laborTax, setLaborTax] = useState(0);
  const [taxAmount, setTaxAmount] = useState(0);
  const [totalChange, setTotalChange] = useState(0);
  const [newContractTotal, setNewContractTotal] = useState(0);

  useEffect(() => {
    if (isOpen) {
      if (!hasPreselectedOrder) {
        loadSalesOrders();
      }
      loadProducts();
      loadLaborPhases();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && initialSalesOrderId) {
      setSelectedSalesOrder(initialSalesOrderId);
    }
  }, [isOpen, initialSalesOrderId]);

  useEffect(() => {
    if (selectedSalesOrder) {
      loadSalesOrderDetails();
    }
  }, [selectedSalesOrder]);

  useEffect(() => {
    calculateTotals();
  }, [lineItems, originalContractAmount, applyDiscount, applyProjectManagement, applyProjectDesign,
      applySystemDesign, applyCreditCardFee, applyMiscParts, applyCustomMod1, applyCustomMod2,
      discountPercent, projectManagementPercent, projectDesignPercent, systemDesignPercent,
      creditCardFeePercent, miscPartsPercent, customMod1Percent, customMod2Percent,
      taxRate, taxEnvironment, taxProjectType, isTaxExempt]);

  async function loadSalesOrders() {
    try {
      const { data, error } = await supabase
        .from('sales_orders')
        .select(`
          id,
          order_number,
          contract_total,
          contact:contacts(
            full_name,
            tax_rate,
            is_tax_exempt
          ),
          proposal:proposals!sales_orders_proposal_id_fkey(
            tax_environment,
            tax_project_type,
            tax_rate
          )
        `)
        .in('status', ['planning', 'active'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSalesOrders(data || []);
    } catch (error) {
      console.error('Error loading sales orders:', error);
    }
  }

  async function loadProducts() {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, description, retail_price, item_type')
        .order('name');

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error loading products:', error);
    }
  }

  async function loadLaborPhases() {
    try {
      const { data, error } = await supabase
        .from('labor_phases')
        .select('id, name')
        .eq('is_active', true)
        .order('sort_order');

      if (error) throw error;
      setLaborPhases(data || []);
    } catch (error) {
      console.error('Error loading labor phases:', error);
    }
  }

  async function loadSalesOrderDetails() {
    try {
      const { data, error } = await supabase
        .from('sales_orders')
        .select(`
          contract_total,
          proposal:proposals!sales_orders_proposal_id_fkey(
            id,
            tax_environment,
            tax_project_type,
            tax_rate,
            contact:contacts(
              tax_rate,
              is_tax_exempt
            ),
            proposal_settings(
              discount_percent,
              project_management_percent,
              project_design_percent,
              system_design_percent,
              credit_card_fee_percent,
              misc_parts_percent,
              custom_modifier_1_percent,
              custom_modifier_2_percent,
              custom_modifier_1_label,
              custom_modifier_2_label
            )
          )
        `)
        .eq('id', selectedSalesOrder)
        .single();

      if (error) throw error;

      setOriginalContractAmount(data.contract_total);

      if (data.proposal) {
        setTaxEnvironment(data.proposal.tax_environment || 'residential');
        setTaxProjectType(data.proposal.tax_project_type || 'general_installation_repair');
        setTaxRate(Number(data.proposal.tax_rate) || Number(data.proposal.contact?.tax_rate) || 0.0935);
        setIsTaxExempt(data.proposal.contact?.is_tax_exempt || false);

        const settings = data.proposal.proposal_settings?.[0] || {};
        setProposalSettings(settings);
        setDiscountPercent(settings.discount_percent || 0);
        setProjectManagementPercent(settings.project_management_percent || 0);
        setProjectDesignPercent(settings.project_design_percent || 0);
        setSystemDesignPercent(settings.system_design_percent || 0);
        setCreditCardFeePercent(settings.credit_card_fee_percent || 0);
        setMiscPartsPercent(settings.misc_parts_percent || 0);
        setCustomMod1Percent(settings.custom_modifier_1_percent || 0);
        setCustomMod2Percent(settings.custom_modifier_2_percent || 0);
      }
    } catch (error) {
      console.error('Error loading sales order details:', error);
    }
  }

  function calculateTotals() {
    let parts = 0;
    let labor = 0;

    lineItems.forEach(item => {
      const isAdd = item.action_type === 'add';
      const isRemove = item.action_type === 'remove';
      const isModify = item.action_type === 'modify_quantity' || item.action_type === 'modify_price';

      if (item.item_type === 'material' || item.item_type === 'both') {
        if (isAdd) {
          parts += item.new_total || 0;
        } else if (isRemove) {
          parts -= item.original_total ?? item.new_total ?? 0;
        } else if (isModify) {
          const oldTotal = (item.original_quantity ?? 0) * (item.original_unit_price ?? 0);
          parts += (item.new_total || 0) - oldTotal;
        }
      }
      if (item.item_type === 'labor' || item.item_type === 'both') {
        const newLabor = item.labor_total || 0;
        if (isAdd) {
          labor += newLabor;
        } else if (isRemove) {
          labor -= item.original_labor_total ?? newLabor;
        } else if (isModify) {
          labor += newLabor - (item.original_labor_total ?? 0);
        }
      }
    });

    setPartsSubtotal(parts);
    setLaborSubtotal(labor);

    const baseSubtotal = parts + labor;
    let runningTotal = baseSubtotal;

    runningTotal -= applyDiscount ? baseSubtotal * (discountPercent / 100) : 0;
    runningTotal += applyProjectManagement ? baseSubtotal * (projectManagementPercent / 100) : 0;
    runningTotal += applyProjectDesign ? baseSubtotal * (projectDesignPercent / 100) : 0;
    runningTotal += applySystemDesign ? baseSubtotal * (systemDesignPercent / 100) : 0;
    runningTotal += applyCreditCardFee ? baseSubtotal * (creditCardFeePercent / 100) : 0;
    runningTotal += applyMiscParts ? baseSubtotal * (miscPartsPercent / 100) : 0;
    runningTotal += applyCustomMod1 ? baseSubtotal * (customMod1Percent / 100) : 0;
    runningTotal += applyCustomMod2 ? baseSubtotal * (customMod2Percent / 100) : 0;

    setSubtotalAfterModifiers(runningTotal);

    const taxResult = computeTaxTotals({
      lineItems: [{ partsAmount: parts, laborAmount: labor }],
      environment: taxEnvironment as TaxEnvironment,
      projectType: taxProjectType as TaxProjectType,
      taxRate,
      isTaxExempt,
      netModifierPct: baseSubtotal > 0
        ? ((runningTotal - baseSubtotal) / baseSubtotal) * 100
        : 0,
    });

    setPartsTax(taxResult.partsTax);
    setLaborTax(taxResult.laborTax);
    setTaxAmount(taxResult.taxAmount);

    const change = runningTotal + taxResult.taxAmount;
    setTotalChange(change);
    setNewContractTotal(originalContractAmount + change);
  }

  function addLineItem() {
    const newItem: LineItem = {
      action_type: 'add',
      product_name: '',
      item_type: 'material',
      new_quantity: 1,
      new_unit_price: 0,
      new_total: 0,
      labor_hours: 0,
      labor_rate: 0,
      labor_total: 0,
      is_taxable: true,
      change_amount: 0,
      sort_order: lineItems.length,
      parent_index: null,
    };
    setLineItems([...lineItems, newItem]);
  }

  function getAccessoriesForIndex(parentIdx: number): { item: LineItem; index: number }[] {
    return lineItems
      .map((item, idx) => ({ item, index: idx }))
      .filter(({ item }) => item.parent_index === parentIdx);
  }

  function updateLineItem(index: number, field: keyof LineItem, value: any) {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };

    const item = updated[index];

    if (field === 'new_quantity' || field === 'new_unit_price') {
      item.new_total = item.new_quantity * item.new_unit_price;
    }

    if (field === 'labor_hours' || field === 'labor_rate') {
      item.labor_total = (item.labor_hours || 0) * (item.labor_rate || 0);
    }

    const laborTotal = item.labor_total || 0;

    if (item.action_type === 'add') {
      item.change_amount = (item.new_total || 0) + laborTotal;
    } else if (item.action_type === 'remove') {
      const originalParts = item.original_total || item.new_total || 0;
      const originalLabor = item.original_labor_total != null ? item.original_labor_total : laborTotal;
      item.change_amount = -(originalParts + originalLabor);
    } else if (item.action_type === 'modify_quantity' || item.action_type === 'modify_price') {
      const oldTotal = (item.original_quantity || 0) * (item.original_unit_price || 0);
      const oldLaborTotal = item.original_labor_total != null ? item.original_labor_total : 0;
      item.change_amount = ((item.new_total || 0) + laborTotal) - (oldTotal + oldLaborTotal);
    }

    setLineItems(updated);
  }

  async function selectProduct(index: number, productId: string) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const updated = [...lineItems];
    const qty = updated[index].new_quantity || 1;
    const unitPrice = product.retail_price;
    const newTotal = qty * unitPrice;

    updated[index] = {
      ...updated[index],
      product_id: productId,
      product_name: product.name,
      product_description: product.description,
      new_unit_price: unitPrice,
      item_type: (product.item_type as 'material' | 'labor' | 'both') || 'material',
      new_total: newTotal,
      labor_hours: 0,
      labor_rate: 0,
      labor_total: 0,
      labor_phase_id: undefined,
      labor_phase_name: undefined,
    };

    // Try to auto-load labor from the master product's labor phase
    try {
      const { data: productDetail } = await supabase
        .from('products')
        .select('labor_phase_id, default_labor_hours, labor_phase:labor_phases(id, name, default_price)')
        .eq('id', productId)
        .maybeSingle();

      if (productDetail?.labor_phase_id && productDetail.default_labor_hours) {
        const phase = productDetail.labor_phase as any;
        const laborHours = Number(productDetail.default_labor_hours) || 0;
        const laborRate = phase?.default_price ? Number(phase.default_price) : 0;
        const laborTotal = laborHours * laborRate;
        updated[index].labor_hours = laborHours;
        updated[index].labor_rate = laborRate;
        updated[index].labor_total = laborTotal;
        updated[index].labor_phase_id = productDetail.labor_phase_id;
        updated[index].labor_phase_name = phase?.name || undefined;
        if (updated[index].item_type === 'material' && laborTotal > 0) {
          updated[index].item_type = 'both';
        }
      }
    } catch (err) {
      console.error('Error loading product labor phase:', err);
    }

    const laborTotal = updated[index].labor_total || 0;
    if (updated[index].action_type === 'add') {
      updated[index].change_amount = newTotal + laborTotal;
    } else {
      updated[index].change_amount = -(newTotal + laborTotal);
    }

    try {
      const { data: accessories } = await supabase
        .from('product_accessories')
        .select(`
          accessory_product_id,
          is_default_selected,
          sort_order,
          accessory:products!product_accessories_accessory_product_id_fkey(
            id, name, description, retail_price, item_type
          )
        `)
        .eq('parent_product_id', productId)
        .order('sort_order');

      const defaultAccessories = (accessories || []).filter(a => a.is_default_selected && a.accessory);

      if (defaultAccessories.length > 0) {
        const parentIdx = index;
        const accessoryItems: LineItem[] = defaultAccessories.map((acc, i) => {
          const accProduct = acc.accessory as any;
          const accUnitPrice = accProduct.retail_price || 0;
          const accQty = 1;
          const accTotal = accQty * accUnitPrice;
          return {
            action_type: updated[parentIdx].action_type,
            product_id: accProduct.id,
            product_name: accProduct.name,
            product_description: accProduct.description,
            item_type: (accProduct.item_type as 'material' | 'labor' | 'both') || 'material',
            new_quantity: accQty,
            new_unit_price: accUnitPrice,
            new_total: accTotal,
            labor_hours: 0,
            labor_rate: 0,
            labor_total: 0,
            is_taxable: true,
            change_amount: updated[parentIdx].action_type === 'add' ? accTotal : -accTotal,
            sort_order: updated.length + i,
            parent_index: parentIdx,
          };
        });
        setLineItems([...updated, ...accessoryItems]);
        return;
      }
    } catch (err) {
      console.error('Error loading product accessories:', err);
    }

    setLineItems(updated);
  }

  function handleRemoveLineItem(index: number) {
    const accessories = getAccessoriesForIndex(index);
    if (accessories.length > 0) {
      setRemoveDialogIndex(index);
      setRemoveDialogOpen(true);
    } else {
      removeItemAndReindex(index, 'all');
    }
  }

  function removeItemAndReindex(index: number, mode: 'all' | 'primary_only') {
    const accessoryIndices = new Set(
      getAccessoriesForIndex(index).map(a => a.index)
    );

    let result: LineItem[];

    if (mode === 'all') {
      result = lineItems.filter((_, i) => i !== index && !accessoryIndices.has(i));
    } else {
      result = lineItems
        .filter((_, i) => i !== index)
        .map(item => {
          if (item.parent_index === index) {
            return { ...item, parent_index: null };
          }
          return item;
        });
    }

    result = result.map((item) => {
      let newParent = item.parent_index;
      if (newParent !== null && newParent !== undefined) {
        const parentItem = lineItems[newParent];
        const parentNewIdx = result.indexOf(parentItem);
        newParent = parentNewIdx >= 0 ? parentNewIdx : null;
      }
      return { ...item, sort_order: result.indexOf(item), parent_index: newParent };
    });

    setLineItems(result);
  }

  function applyOriginalModifiers() {
    setApplyDiscount(false);
    setApplyProjectManagement(!!proposalSettings.project_management_percent);
    setApplyProjectDesign(!!proposalSettings.project_design_percent);
    setApplySystemDesign(!!proposalSettings.system_design_percent);
    setApplyCreditCardFee(!!proposalSettings.credit_card_fee_percent);
    setApplyMiscParts(!!proposalSettings.misc_parts_percent);
    setApplyCustomMod1(!!proposalSettings.custom_modifier_1_percent);
    setApplyCustomMod2(!!proposalSettings.custom_modifier_2_percent);
  }

  const hasAnyModifiers = discountPercent > 0 || projectManagementPercent > 0 || projectDesignPercent > 0 ||
    systemDesignPercent > 0 || creditCardFeePercent > 0 || miscPartsPercent > 0 ||
    customMod1Percent > 0 || customMod2Percent > 0;

  async function handleSave(submit: boolean) {
    if (!selectedSalesOrder || !title || lineItems.length === 0) {
      alert('Please fill in all required fields and add at least one line item');
      return;
    }

    setLoading(true);
    try {
      const { data: soData, error: soError } = await supabase
        .from('sales_orders')
        .select('company_id, organization_id, project_id')
        .eq('id', selectedSalesOrder)
        .single();

      if (soError) throw soError;

      const projectId = soData.project_id || null;

      // Recalculate totals inline to avoid stale state
      const effectiveTaxRate = Number(taxRate) || 0.0935;
      let calcParts = 0;
      let calcLabor = 0;
      lineItems.forEach(item => {
        const isAdd = item.action_type === 'add';
        const isRemove = item.action_type === 'remove';
        const isModify = item.action_type === 'modify_quantity' || item.action_type === 'modify_price';

        if (item.item_type === 'material' || item.item_type === 'both') {
          if (isAdd) {
            calcParts += item.new_total || 0;
          } else if (isRemove) {
            calcParts -= item.original_total ?? item.new_total ?? 0;
          } else if (isModify) {
            const oldTotal = (item.original_quantity ?? 0) * (item.original_unit_price ?? 0);
            calcParts += (item.new_total || 0) - oldTotal;
          }
        }
        if (item.item_type === 'labor' || item.item_type === 'both') {
          const newLabor = item.labor_total || 0;
          if (isAdd) {
            calcLabor += newLabor;
          } else if (isRemove) {
            calcLabor -= item.original_labor_total ?? newLabor;
          } else if (isModify) {
            calcLabor += newLabor - (item.original_labor_total ?? 0);
          }
        }
      });
      const calcBase = calcParts + calcLabor;
      let calcRunning = calcBase;
      calcRunning -= applyDiscount ? calcBase * (discountPercent / 100) : 0;
      calcRunning += applyProjectManagement ? calcBase * (projectManagementPercent / 100) : 0;
      calcRunning += applyProjectDesign ? calcBase * (projectDesignPercent / 100) : 0;
      calcRunning += applySystemDesign ? calcBase * (systemDesignPercent / 100) : 0;
      calcRunning += applyCreditCardFee ? calcBase * (creditCardFeePercent / 100) : 0;
      calcRunning += applyMiscParts ? calcBase * (miscPartsPercent / 100) : 0;
      calcRunning += applyCustomMod1 ? calcBase * (customMod1Percent / 100) : 0;
      calcRunning += applyCustomMod2 ? calcBase * (customMod2Percent / 100) : 0;
      let calcLaborTaxable = false;
      if (taxEnvironment === 'residential' && taxProjectType === 'general_installation_repair') calcLaborTaxable = true;
      if (taxEnvironment === 'commercial' && (taxProjectType === 'remodel' || taxProjectType === 'general_installation_repair')) calcLaborTaxable = true;
      let calcPartsTax = 0;
      let calcLaborTax = 0;
      if (!isTaxExempt && calcBase > 0) {
        const partsAdj = calcRunning * (calcParts / calcBase);
        const laborAdj = calcRunning * (calcLabor / calcBase);
        calcPartsTax = partsAdj * effectiveTaxRate;
        if (calcLaborTaxable) calcLaborTax = laborAdj * effectiveTaxRate;
      }
      const calcTaxAmount = calcPartsTax + calcLaborTax;
      const calcTotalChange = calcRunning + calcTaxAmount;
      const calcNewContractTotal = originalContractAmount + calcTotalChange;

      const { data: changeOrder, error: coError } = await supabase
        .from('change_orders')
        .insert({
          company_id: soData.company_id,
          organization_id: soData.organization_id,
          sales_order_id: selectedSalesOrder,
          project_id: projectId,
          title,
          description,
          internal_notes: internalNotes,
          reason,
          type,
          status: submit ? 'pending_approval' : 'draft',
          original_contract_amount: originalContractAmount,
          parts_subtotal: calcParts,
          labor_subtotal: calcLabor,
          tax_environment: taxEnvironment,
          tax_project_type: taxProjectType,
          tax_rate: effectiveTaxRate,
          apply_discount: applyDiscount,
          apply_project_management: applyProjectManagement,
          apply_project_design: applyProjectDesign,
          apply_system_design: applySystemDesign,
          apply_credit_card_fee: applyCreditCardFee,
          apply_misc_parts: applyMiscParts,
          apply_custom_modifier_1: applyCustomMod1,
          apply_custom_modifier_2: applyCustomMod2,
          discount_percent: discountPercent,
          project_management_percent: projectManagementPercent,
          project_design_percent: projectDesignPercent,
          system_design_percent: systemDesignPercent,
          credit_card_fee_percent: creditCardFeePercent,
          misc_parts_percent: miscPartsPercent,
          custom_modifier_1_percent: customMod1Percent,
          custom_modifier_2_percent: customMod2Percent,
          subtotal_after_modifiers: calcRunning,
          parts_tax: calcPartsTax,
          labor_tax: calcLaborTax,
          tax_amount: calcTaxAmount,
          change_amount: calcTotalChange,
          new_contract_total: calcNewContractTotal,
          notes: notes || null,
          notes_public: notesPublic,
          requested_by: profile?.id,
          requested_date: new Date().toISOString()
        })
        .select()
        .single();

      if (coError) throw coError;

      const parentItems = lineItems.filter(item => item.parent_index === null || item.parent_index === undefined);
      const childItems = lineItems.filter(item => item.parent_index !== null && item.parent_index !== undefined);

      const parentInsertData = parentItems.map((item, idx) => {
        const { parent_index, ...rest } = item;
        return { change_order_id: changeOrder.id, ...rest, sort_order: idx };
      });

      const { data: insertedParents, error: parentError } = await supabase
        .from('change_order_line_items')
        .insert(parentInsertData)
        .select('id');

      if (parentError) throw parentError;

      if (childItems.length > 0 && insertedParents) {
        const parentIndexToDbId = new Map<number, string>();
        parentItems.forEach((item, idx) => {
          const originalIndex = lineItems.indexOf(item);
          parentIndexToDbId.set(originalIndex, insertedParents[idx].id);
        });

        const childInsertData = childItems.map((item, idx) => {
          const { parent_index, ...rest } = item;
          return {
            change_order_id: changeOrder.id,
            ...rest,
            sort_order: parentItems.length + idx,
            parent_line_item_id: parent_index !== null && parent_index !== undefined
              ? parentIndexToDbId.get(parent_index) || null
              : null,
          };
        });

        const { error: childError } = await supabase
          .from('change_order_line_items')
          .insert(childInsertData);

        if (childError) throw childError;
      }

      const { error: calcError } = await supabase.rpc('calculate_change_order_totals', {
        p_change_order_id: changeOrder.id
      });

      if (calcError) console.error('Error calculating totals:', calcError);

      if (submit) {
        const approvals = [];

        approvals.push({
          change_order_id: changeOrder.id,
          approval_level: 1,
          approver_role: 'project_manager',
          status: 'pending',
          required: true
        });

        if (Math.abs(totalChange) >= 500) {
          approvals.push({
            change_order_id: changeOrder.id,
            approval_level: 2,
            approver_role: 'office_manager',
            status: 'pending',
            required: true
          });
        }

        if (Math.abs(totalChange) >= 5000) {
          approvals.push({
            change_order_id: changeOrder.id,
            approval_level: 3,
            approver_role: 'customer',
            status: 'pending',
            required: true
          });

          await supabase
            .from('change_orders')
            .update({ requires_customer_approval: true })
            .eq('id', changeOrder.id);
        }

        if (approvals.length > 0) {
          const { error: appError } = await supabase
            .from('change_order_approvals')
            .insert(approvals);

          if (appError) throw appError;
        }
      }

      onSuccess();
      handleClose();
    } catch (error: any) {
      console.error('Error creating change order:', error);
      alert('Failed to create change order: ' + (error?.message || String(error)));
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setStep(1);
    setSelectedSalesOrder(initialSalesOrderId || '');
    setTitle('');
    setDescription('');
    setInternalNotes('');
    setReason('customer_request');
    setType('addition');
    setLineItems([]);
    setRemoveDialogOpen(false);
    setRemoveDialogIndex(null);
    setShowModifiers(false);
    setApplyDiscount(false);
    setApplyProjectManagement(false);
    setApplyProjectDesign(false);
    setApplySystemDesign(false);
    setApplyCreditCardFee(false);
    setApplyMiscParts(false);
    setApplyCustomMod1(false);
    setApplyCustomMod2(false);
    onClose();
  }

  async function handleCreateDraft() {
    if (!selectedSalesOrder || !title) {
      alert('Please enter a title for the change order');
      return;
    }

    setLoading(true);
    try {
      const { data: soData, error: soError } = await supabase
        .from('sales_orders')
        .select('company_id, organization_id, contract_total, project_id')
        .eq('id', selectedSalesOrder)
        .single();

      if (soError) throw soError;

      const projectId = soData.project_id || null;

      const { data: coData, error: coError } = await supabase
        .from('change_orders')
        .insert({
          company_id: soData.company_id,
          organization_id: soData.organization_id,
          sales_order_id: selectedSalesOrder,
          project_id: projectId,
          title,
          description,
          internal_notes: internalNotes,
          reason: 'other',
          type: 'addition',
          status: 'draft',
          original_contract_amount: soData.contract_total,
          change_amount: 0,
          new_contract_total: soData.contract_total,
          requested_by: profile?.id,
          requested_date: new Date().toISOString()
        })
        .select('id')
        .single();

      if (coError) throw coError;

      // Capture the proposal snapshot so we can revert if the CO is deleted
      try {
        const { data: soWithProposal } = await supabase
          .from('sales_orders')
          .select('proposal:proposals!sales_orders_proposal_id_fkey(id)')
          .eq('id', selectedSalesOrder)
          .maybeSingle();

        const proposalId = (soWithProposal?.proposal as any)?.id;
        if (proposalId) {
          const { data: snapshot } = await supabase.rpc('capture_proposal_snapshot', {
            p_proposal_id: proposalId
          });

          if (snapshot) {
            await supabase
              .from('change_orders')
              .update({ proposal_snapshot: snapshot })
              .eq('id', coData.id);
          }
        }
      } catch (snapErr) {
        console.warn('Failed to capture proposal snapshot:', snapErr);
      }

      onSuccess(coData?.id);
      handleClose();
    } catch (error: any) {
      console.error('Error creating change order:', error);
      alert('Failed to create change order: ' + (error?.message || String(error)));
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  const selectedSO = salesOrders.find(so => so.id === selectedSalesOrder);

  const getTaxEnvironmentLabel = () => taxEnvironment === 'residential' ? 'Residential' : 'Commercial';
  const getTaxProjectTypeLabel = () => {
    if (taxProjectType === 'original_construction') return 'Original Construction';
    if (taxProjectType === 'remodel') return 'Remodel';
    return 'General Installation/Repair or Retail';
  };

  // Determine which logical step we're on for the simplified 3-step flow
  // Step labels for the simplified flow: 1=Items, 2=Details, 3=Review
  // Step labels for the full flow: 1=Sales Order, 2=Items, 3=Modifiers, 4=Details, 5=Review
  const getStepLabel = (s: number) => {
    if (hasPreselectedOrder) {
      return ['Items', 'Details', 'Review'][s - 1];
    }
    return ['Sales Order', 'Items', 'Modifiers', 'Details', 'Review'][s - 1];
  };

  // Map simplified step to full step number for rendering content
  // simplified 1 → full 2, simplified 2 → full 4, simplified 3 → full 5
  const contentStep = hasPreselectedOrder
    ? [2, 4, 5][step - 1]
    : step;

  const isNextDisabled = () => {
    if (hasPreselectedOrder) {
      if (step === 1) return lineItems.length === 0;
      if (step === 2) return !title;
      return false;
    } else {
      if (step === 1) return !selectedSalesOrder;
      if (step === 2) return lineItems.length === 0;
      if (step === 4) return !title;
      return false;
    }
  };

  if (hasPreselectedOrder) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden flex flex-col">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">New Change Order</h2>
            <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Give this change order a name"
                maxLength={60}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter' && title && !loading) handleCreateDraft(); }}
              />
              <div className="mt-1 text-xs text-gray-500 text-right">{title.length} / 60</div>
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
            <button onClick={handleClose} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg min-h-[44px] sm:min-h-0">
              Cancel
            </button>
            <button
              onClick={handleCreateDraft}
              disabled={loading || !title}
              className="flex items-center justify-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] sm:min-h-0"
            >
              <Plus className="w-4 h-4" />
              {loading ? 'Creating...' : 'Create & Edit'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200">
          <h2 className="text-lg sm:text-2xl font-bold text-gray-900">Create Change Order</h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center justify-center p-4 border-b border-gray-200 bg-gray-50">
          {Array.from({ length: totalSteps }, (_, i) => i + 1).map((s) => (
            <React.Fragment key={s}>
              <div className="flex flex-col items-center gap-1">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold ${
                  step >= s ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
                }`}>
                  {s}
                </div>
                <span className={`text-xs hidden sm:block ${step >= s ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>
                  {getStepLabel(s)}
                </span>
              </div>
              {s < totalSteps && (
                <div className={`w-8 sm:w-16 h-1 mb-4 mx-1 ${step > s ? 'bg-blue-600' : 'bg-gray-200'}`} />
              )}
            </React.Fragment>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* Step: Select Sales Order (standalone mode only) */}
          {contentStep === 1 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Select Sales Order</h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sales Order <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedSalesOrder}
                  onChange={(e) => setSelectedSalesOrder(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select a sales order...</option>
                  {salesOrders.map(so => (
                    <option key={so.id} value={so.id}>
                      {so.order_number} - {so.contact?.full_name || 'Unknown'} - ${(so.contract_total ?? 0).toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>

              {selectedSO && (
                <div className="space-y-4">
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{selectedSO.order_number}</p>
                        <p className="text-sm text-gray-600">{selectedSO.contact?.full_name || 'Unknown'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-600">Current Contract Total</p>
                        <p className="text-xl font-bold text-gray-900">${(selectedSO.contract_total ?? 0).toFixed(2)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                    <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                      <Info className="w-4 h-4" />
                      Tax Configuration
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm mb-3">
                      <div>
                        <span className="text-gray-600">Environment:</span>
                        <span className="ml-2 font-medium">{getTaxEnvironmentLabel()}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Project Type:</span>
                        <span className="ml-2 font-medium">{getTaxProjectTypeLabel()}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Tax Rate:</span>
                        <span className="ml-2 font-medium">{(taxRate * 100).toFixed(2)}%</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Tax Exempt:</span>
                        <span className={`ml-2 font-medium ${isTaxExempt ? 'text-green-600' : 'text-gray-900'}`}>
                          {isTaxExempt ? 'Yes' : 'No'}
                        </span>
                      </div>
                    </div>
                    <TaxRulesBadge
                      taxEnvironment={taxEnvironment}
                      taxProjectType={taxProjectType}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step: Line Items */}
          {contentStep === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Line Items</h3>
                <button
                  onClick={addLineItem}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4" />
                  Add Item
                </button>
              </div>

              {lineItems.length === 0 ? (
                <div className="text-center py-16 text-gray-500">
                  <Package className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <p className="text-base font-medium text-gray-600">No items added yet</p>
                  <p className="text-sm mt-1">Click "Add Item" to add parts to this change order</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {lineItems.map((item, index) => {
                    const isAccessory = item.parent_index !== null && item.parent_index !== undefined;
                    const accessories = getAccessoriesForIndex(index);
                    const hasAccessories = accessories.length > 0;

                    return (
                      <div
                        key={index}
                        className={`p-4 border rounded-lg space-y-3 ${
                          isAccessory
                            ? 'ml-4 sm:ml-8 border-blue-200 bg-blue-50/30 border-l-4 border-l-blue-400'
                            : item.action_type === 'remove' || item.action_type === 'remove_scope'
                              ? 'border-red-200 bg-red-50/40 border-l-4 border-l-red-400'
                              : item.action_type === 'add'
                                ? 'border-blue-200 bg-blue-50/40 border-l-4 border-l-blue-400'
                                : 'border-gray-200'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            {isAccessory && (
                              <div className="flex items-center gap-1.5 mb-2">
                                <Link2 className="w-3.5 h-3.5 text-blue-500" />
                                <span className="text-xs font-medium text-blue-600 uppercase tracking-wider">
                                  Accessory of {lineItems[item.parent_index!]?.product_name || 'parent item'}
                                </span>
                              </div>
                            )}
                            {hasAccessories && (
                              <div className="flex items-center gap-1.5 mb-2">
                                <Package className="w-3.5 h-3.5 text-gray-500" />
                                <span className="text-xs font-medium text-gray-600">
                                  {accessories.length} accessor{accessories.length === 1 ? 'y' : 'ies'} attached
                                </span>
                              </div>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">
                                  Action
                                </label>
                                <select
                                  value={item.action_type}
                                  onChange={(e) => updateLineItem(index, 'action_type', e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                >
                                  <option value="add">Add</option>
                                  <option value="remove">Remove</option>
                                  <option value="modify_quantity">Change Qty</option>
                                  <option value="modify_price">Change Price</option>
                                </select>
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">
                                  Type
                                </label>
                                <select
                                  value={item.item_type}
                                  onChange={(e) => updateLineItem(index, 'item_type', e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                >
                                  <option value="material">Material</option>
                                  <option value="labor">Labor</option>
                                  <option value="both">Both</option>
                                </select>
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">
                                  Product
                                </label>
                                <select
                                  value={item.product_id || ''}
                                  onChange={(e) => selectProduct(index, e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                >
                                  <option value="">Select product...</option>
                                  {products.map(p => (
                                    <option key={p.id} value={p.id}>
                                      {p.name} - ${p.retail_price.toFixed(2)}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => handleRemoveLineItem(index)}
                            className="ml-2 p-2 text-red-500 hover:bg-red-50 rounded-lg flex-shrink-0"
                            title={hasAccessories ? 'Remove item (has accessories)' : 'Remove item'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        {(item.item_type === 'material' || item.item_type === 'both') && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">Qty</label>
                              <input
                                type="number"
                                value={item.new_quantity}
                                onChange={(e) => updateLineItem(index, 'new_quantity', parseFloat(e.target.value) || 0)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                step="0.01"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">Unit Price</label>
                              <input
                                type="number"
                                value={item.new_unit_price}
                                onChange={(e) => updateLineItem(index, 'new_unit_price', parseFloat(e.target.value) || 0)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                step="0.01"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">Total</label>
                              <div className="px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium bg-gray-50 text-gray-700">
                                ${(item.new_total || 0).toFixed(2)}
                              </div>
                            </div>
                          </div>
                        )}

                        {(item.item_type === 'labor' || item.item_type === 'both') && (
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Labor Hours</label>
                                <input
                                  type="number"
                                  value={item.labor_hours || 0}
                                  onChange={(e) => updateLineItem(index, 'labor_hours', parseFloat(e.target.value) || 0)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                  step="0.25"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Rate</label>
                                <input
                                  type="number"
                                  value={item.labor_rate || 0}
                                  onChange={(e) => updateLineItem(index, 'labor_rate', parseFloat(e.target.value) || 0)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                  step="0.01"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Labor Total</label>
                                <div className="px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium bg-gray-50 text-gray-700">
                                  ${(item.labor_total || 0).toFixed(2)}
                                </div>
                              </div>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">Labor Phase</label>
                              <select
                                value={item.labor_phase_id || ''}
                                onChange={(e) => updateLineItem(index, 'labor_phase_id', e.target.value || undefined)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              >
                                <option value="">No Phase</option>
                                {laborPhases.map(phase => (
                                  <option key={phase.id} value={phase.id}>
                                    {phase.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-3 pt-1 border-t border-gray-100">
                          <input
                            type="text"
                            value={item.install_location || ''}
                            onChange={(e) => updateLineItem(index, 'install_location', e.target.value)}
                            placeholder="Install location / notes"
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                          <div className={`px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap ${
                            item.action_type === 'add' ? 'bg-blue-50 text-blue-700' :
                            item.change_amount >= 0 ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'
                          }`}>
                            {item.change_amount > 0 ? '+' : item.change_amount < 0 ? '-' : ''}${Math.abs(item.change_amount).toFixed(2)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {lineItems.length > 0 && (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg flex justify-between text-sm">
                  <span className="text-gray-600">Materials: <span className="font-medium text-gray-900">${partsSubtotal.toFixed(2)}</span></span>
                  <span className="text-gray-600">Labor: <span className="font-medium text-gray-900">${laborSubtotal.toFixed(2)}</span></span>
                  <span className="text-gray-600">Subtotal: <span className="font-semibold text-gray-900">${(partsSubtotal + laborSubtotal).toFixed(2)}</span></span>
                </div>
              )}
            </div>
          )}

          {/* Step: Modifiers (standalone mode only, step 3) */}
          {contentStep === 3 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Pricing Modifiers</h3>
                  <p className="text-sm text-gray-600 mt-1">Select which modifiers apply to this change order</p>
                </div>
                <button
                  onClick={applyOriginalModifiers}
                  className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                >
                  Use Original Modifiers
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {discountPercent > 0 && (
                  <label className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <div className="flex items-center gap-3">
                      <input type="checkbox" checked={applyDiscount} onChange={(e) => setApplyDiscount(e.target.checked)} className="w-4 h-4" />
                      <div>
                        <p className="font-medium text-gray-900">Discount</p>
                        <p className="text-sm text-gray-500">{discountPercent}%</p>
                      </div>
                    </div>
                    {applyDiscount && <span className="text-red-600 font-medium text-sm">-${((partsSubtotal + laborSubtotal) * (discountPercent / 100)).toFixed(2)}</span>}
                  </label>
                )}
                {projectManagementPercent > 0 && (
                  <label className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <div className="flex items-center gap-3">
                      <input type="checkbox" checked={applyProjectManagement} onChange={(e) => setApplyProjectManagement(e.target.checked)} className="w-4 h-4" />
                      <div>
                        <p className="font-medium text-gray-900">Project Management</p>
                        <p className="text-sm text-gray-500">{projectManagementPercent}%</p>
                      </div>
                    </div>
                    {applyProjectManagement && <span className="text-green-600 font-medium text-sm">+${((partsSubtotal + laborSubtotal) * (projectManagementPercent / 100)).toFixed(2)}</span>}
                  </label>
                )}
                {projectDesignPercent > 0 && (
                  <label className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <div className="flex items-center gap-3">
                      <input type="checkbox" checked={applyProjectDesign} onChange={(e) => setApplyProjectDesign(e.target.checked)} className="w-4 h-4" />
                      <div>
                        <p className="font-medium text-gray-900">Project Design</p>
                        <p className="text-sm text-gray-500">{projectDesignPercent}%</p>
                      </div>
                    </div>
                    {applyProjectDesign && <span className="text-green-600 font-medium text-sm">+${((partsSubtotal + laborSubtotal) * (projectDesignPercent / 100)).toFixed(2)}</span>}
                  </label>
                )}
                {systemDesignPercent > 0 && (
                  <label className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <div className="flex items-center gap-3">
                      <input type="checkbox" checked={applySystemDesign} onChange={(e) => setApplySystemDesign(e.target.checked)} className="w-4 h-4" />
                      <div>
                        <p className="font-medium text-gray-900">System Design</p>
                        <p className="text-sm text-gray-500">{systemDesignPercent}%</p>
                      </div>
                    </div>
                    {applySystemDesign && <span className="text-green-600 font-medium text-sm">+${((partsSubtotal + laborSubtotal) * (systemDesignPercent / 100)).toFixed(2)}</span>}
                  </label>
                )}
                {creditCardFeePercent > 0 && (
                  <label className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <div className="flex items-center gap-3">
                      <input type="checkbox" checked={applyCreditCardFee} onChange={(e) => setApplyCreditCardFee(e.target.checked)} className="w-4 h-4" />
                      <div>
                        <p className="font-medium text-gray-900">Credit Card Fee</p>
                        <p className="text-sm text-gray-500">{creditCardFeePercent}%</p>
                      </div>
                    </div>
                    {applyCreditCardFee && <span className="text-green-600 font-medium text-sm">+${((partsSubtotal + laborSubtotal) * (creditCardFeePercent / 100)).toFixed(2)}</span>}
                  </label>
                )}
                {miscPartsPercent > 0 && (
                  <label className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <div className="flex items-center gap-3">
                      <input type="checkbox" checked={applyMiscParts} onChange={(e) => setApplyMiscParts(e.target.checked)} className="w-4 h-4" />
                      <div>
                        <p className="font-medium text-gray-900">Misc Parts</p>
                        <p className="text-sm text-gray-500">{miscPartsPercent}%</p>
                      </div>
                    </div>
                    {applyMiscParts && <span className="text-green-600 font-medium text-sm">+${((partsSubtotal + laborSubtotal) * (miscPartsPercent / 100)).toFixed(2)}</span>}
                  </label>
                )}
                {customMod1Percent > 0 && (
                  <label className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <div className="flex items-center gap-3">
                      <input type="checkbox" checked={applyCustomMod1} onChange={(e) => setApplyCustomMod1(e.target.checked)} className="w-4 h-4" />
                      <div>
                        <p className="font-medium text-gray-900">{proposalSettings.custom_modifier_1_label || 'Custom Modifier 1'}</p>
                        <p className="text-sm text-gray-500">{customMod1Percent}%</p>
                      </div>
                    </div>
                    {applyCustomMod1 && <span className="text-green-600 font-medium text-sm">+${((partsSubtotal + laborSubtotal) * (customMod1Percent / 100)).toFixed(2)}</span>}
                  </label>
                )}
                {customMod2Percent > 0 && (
                  <label className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <div className="flex items-center gap-3">
                      <input type="checkbox" checked={applyCustomMod2} onChange={(e) => setApplyCustomMod2(e.target.checked)} className="w-4 h-4" />
                      <div>
                        <p className="font-medium text-gray-900">{proposalSettings.custom_modifier_2_label || 'Custom Modifier 2'}</p>
                        <p className="text-sm text-gray-500">{customMod2Percent}%</p>
                      </div>
                    </div>
                    {applyCustomMod2 && <span className="text-green-600 font-medium text-sm">+${((partsSubtotal + laborSubtotal) * (customMod2Percent / 100)).toFixed(2)}</span>}
                  </label>
                )}
              </div>

              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex justify-between items-center">
                <span className="font-medium text-gray-900">Subtotal After Modifiers:</span>
                <span className="text-xl font-bold text-blue-600">${subtotalAfterModifiers.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Step: Details */}
          {contentStep === 4 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Change Order Details</h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Brief title for this change order"
                  maxLength={60}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
                <div className="mt-1 text-xs text-gray-500 text-right">{title.length} / 60</div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description (Customer-Facing)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Description shown to the customer"
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Internal Notes
                </label>
                <textarea
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  placeholder="Internal notes (not visible to customer)"
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Notes
                  </label>
                  <button
                    type="button"
                    onClick={() => setNotesPublic(!notesPublic)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      notesPublic
                        ? 'bg-blue-100 text-blue-700 border border-blue-200'
                        : 'bg-gray-100 text-gray-500 border border-gray-200'
                    }`}
                  >
                    {notesPublic ? (
                      <><Globe className="w-3 h-3" /> Public</>
                    ) : (
                      <><Lock className="w-3 h-3" /> Private</>
                    )}
                  </button>
                </div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={notesPublic ? "Notes visible to customer on reports..." : "Internal notes (staff only)..."}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
                {notesPublic && (
                  <p className="mt-1 text-xs text-blue-600 flex items-center gap-1">
                    <Globe className="w-3 h-3" />
                    These notes will appear on the change order report and financial summary.
                  </p>
                )}
              </div>

              {/* Modifiers section (collapsed by default in simplified flow) */}
              {hasPreselectedOrder && hasAnyModifiers && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowModifiers(!showModifiers)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <span className="text-sm font-medium text-gray-700">Pricing Modifiers</span>
                    <div className="flex items-center gap-2">
                      {(applyDiscount || applyProjectManagement || applyProjectDesign || applySystemDesign ||
                        applyCreditCardFee || applyMiscParts || applyCustomMod1 || applyCustomMod2) && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Active</span>
                      )}
                      {showModifiers ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                    </div>
                  </button>

                  {showModifiers && (
                    <div className="p-4 space-y-3">
                      <div className="flex justify-end">
                        <button onClick={applyOriginalModifiers} className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                          Use Original Contract Modifiers
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {discountPercent > 0 && (
                          <label className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                            <input type="checkbox" checked={applyDiscount} onChange={(e) => setApplyDiscount(e.target.checked)} className="w-4 h-4" />
                            <span className="text-sm text-gray-700">Discount ({discountPercent}%)</span>
                            {applyDiscount && <span className="ml-auto text-red-600 text-sm font-medium">-${((partsSubtotal + laborSubtotal) * (discountPercent / 100)).toFixed(2)}</span>}
                          </label>
                        )}
                        {projectManagementPercent > 0 && (
                          <label className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                            <input type="checkbox" checked={applyProjectManagement} onChange={(e) => setApplyProjectManagement(e.target.checked)} className="w-4 h-4" />
                            <span className="text-sm text-gray-700">Proj. Mgmt ({projectManagementPercent}%)</span>
                            {applyProjectManagement && <span className="ml-auto text-green-600 text-sm font-medium">+${((partsSubtotal + laborSubtotal) * (projectManagementPercent / 100)).toFixed(2)}</span>}
                          </label>
                        )}
                        {projectDesignPercent > 0 && (
                          <label className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                            <input type="checkbox" checked={applyProjectDesign} onChange={(e) => setApplyProjectDesign(e.target.checked)} className="w-4 h-4" />
                            <span className="text-sm text-gray-700">Proj. Design ({projectDesignPercent}%)</span>
                            {applyProjectDesign && <span className="ml-auto text-green-600 text-sm font-medium">+${((partsSubtotal + laborSubtotal) * (projectDesignPercent / 100)).toFixed(2)}</span>}
                          </label>
                        )}
                        {systemDesignPercent > 0 && (
                          <label className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                            <input type="checkbox" checked={applySystemDesign} onChange={(e) => setApplySystemDesign(e.target.checked)} className="w-4 h-4" />
                            <span className="text-sm text-gray-700">System Design ({systemDesignPercent}%)</span>
                            {applySystemDesign && <span className="ml-auto text-green-600 text-sm font-medium">+${((partsSubtotal + laborSubtotal) * (systemDesignPercent / 100)).toFixed(2)}</span>}
                          </label>
                        )}
                        {creditCardFeePercent > 0 && (
                          <label className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                            <input type="checkbox" checked={applyCreditCardFee} onChange={(e) => setApplyCreditCardFee(e.target.checked)} className="w-4 h-4" />
                            <span className="text-sm text-gray-700">CC Fee ({creditCardFeePercent}%)</span>
                            {applyCreditCardFee && <span className="ml-auto text-green-600 text-sm font-medium">+${((partsSubtotal + laborSubtotal) * (creditCardFeePercent / 100)).toFixed(2)}</span>}
                          </label>
                        )}
                        {miscPartsPercent > 0 && (
                          <label className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                            <input type="checkbox" checked={applyMiscParts} onChange={(e) => setApplyMiscParts(e.target.checked)} className="w-4 h-4" />
                            <span className="text-sm text-gray-700">Misc Parts ({miscPartsPercent}%)</span>
                            {applyMiscParts && <span className="ml-auto text-green-600 text-sm font-medium">+${((partsSubtotal + laborSubtotal) * (miscPartsPercent / 100)).toFixed(2)}</span>}
                          </label>
                        )}
                        {customMod1Percent > 0 && (
                          <label className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                            <input type="checkbox" checked={applyCustomMod1} onChange={(e) => setApplyCustomMod1(e.target.checked)} className="w-4 h-4" />
                            <span className="text-sm text-gray-700">{proposalSettings.custom_modifier_1_label || 'Custom 1'} ({customMod1Percent}%)</span>
                            {applyCustomMod1 && <span className="ml-auto text-green-600 text-sm font-medium">+${((partsSubtotal + laborSubtotal) * (customMod1Percent / 100)).toFixed(2)}</span>}
                          </label>
                        )}
                        {customMod2Percent > 0 && (
                          <label className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                            <input type="checkbox" checked={applyCustomMod2} onChange={(e) => setApplyCustomMod2(e.target.checked)} className="w-4 h-4" />
                            <span className="text-sm text-gray-700">{proposalSettings.custom_modifier_2_label || 'Custom 2'} ({customMod2Percent}%)</span>
                            {applyCustomMod2 && <span className="ml-auto text-green-600 text-sm font-medium">+${((partsSubtotal + laborSubtotal) * (customMod2Percent / 100)).toFixed(2)}</span>}
                          </label>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step: Review & Submit */}
          {contentStep === 5 && (
            <div className="space-y-5">
              <h3 className="text-lg font-semibold text-gray-900">Review & Submit</h3>

              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="font-semibold text-gray-900 mb-1">{title}</h4>
                {description && <p className="text-sm text-gray-600">{description}</p>}
              </div>

              <div>
                <h4 className="font-medium text-gray-900 mb-2">Items ({lineItems.length})</h4>
                <div className="space-y-1.5">
                  {lineItems.map((item, index) => {
                    const isAccessory = item.parent_index !== null && item.parent_index !== undefined;
                    return (
                      <div
                        key={index}
                        className={`flex justify-between text-sm p-2.5 rounded-lg ${
                          isAccessory ? 'ml-6 bg-blue-50 border border-blue-100' : 'bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          {isAccessory && <Link2 className="w-3 h-3 text-blue-400 flex-shrink-0" />}
                          <span>{item.product_name || 'Unnamed item'}</span>
                          <span className="text-gray-500">({item.action_type} · x{item.new_quantity})</span>
                        </div>
                        <span className={`font-semibold ${item.change_amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {item.change_amount > 0 ? '+' : item.change_amount < 0 ? '-' : ''}${Math.abs(item.change_amount).toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="p-4 bg-gray-900 text-white rounded-xl space-y-2">
                <div className="flex justify-between text-sm text-gray-300">
                  <span>Current Contract Total</span>
                  <span>${originalContractAmount.toFixed(2)}</span>
                </div>
                <div className="border-t border-gray-700 pt-2 flex justify-between text-sm">
                  <span>Materials</span>
                  <span>{partsSubtotal >= 0 ? '+' : '−'}${Math.abs(partsSubtotal).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Labor</span>
                  <span>{laborSubtotal >= 0 ? '+' : '−'}${Math.abs(laborSubtotal).toFixed(2)}</span>
                </div>
                {subtotalAfterModifiers !== (partsSubtotal + laborSubtotal) && (
                  <div className="flex justify-between text-sm text-gray-300">
                    <span>After Modifiers</span>
                    <span>{subtotalAfterModifiers >= 0 ? '+' : '−'}${Math.abs(subtotalAfterModifiers).toFixed(2)}</span>
                  </div>
                )}
                {(partsTax > 0 || laborTax > 0) && (
                  <div className="flex justify-between text-sm text-gray-300">
                    <span>Tax ({(taxRate * 100).toFixed(2)}%)</span>
                    <span>+${taxAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="border-t border-gray-700 pt-2 flex justify-between">
                  <span className="font-semibold">Change Amount</span>
                  <span className={`font-bold text-lg ${totalChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {totalChange >= 0 ? '+' : '−'}${Math.abs(totalChange).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between text-xl font-bold border-t border-gray-700 pt-2">
                  <span>New Contract Total</span>
                  <span>${newContractTotal.toFixed(2)}</span>
                </div>
              </div>

              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-amber-800">
                    <p className="font-semibold mb-1">Approval Required:</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      <li>Level 1: Project Manager</li>
                      {Math.abs(totalChange) >= 500 && <li>Level 2: Office Manager (change &gt; $500)</li>}
                      {Math.abs(totalChange) >= 5000 && <li>Level 3: Customer signature (change &gt; $5,000)</li>}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 p-4 sm:p-6 border-t border-gray-200 bg-gray-50 flex-wrap">
          <button
            onClick={() => step > 1 && setStep(step - 1)}
            disabled={step === 1}
            className="px-4 sm:px-6 py-2 text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] sm:min-h-0"
          >
            Back
          </button>

          <div className="flex gap-2 flex-wrap justify-end">
            {step < totalSteps ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={isNextDisabled()}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] sm:min-h-0"
              >
                Next
              </button>
            ) : (
              <>
                <button
                  onClick={() => handleSave(false)}
                  disabled={loading}
                  className="flex items-center gap-2 px-5 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 min-h-[44px] sm:min-h-0"
                >
                  <Save className="w-4 h-4" />
                  Save Draft
                </button>
                <button
                  onClick={() => handleSave(true)}
                  disabled={loading}
                  className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 min-h-[44px] sm:min-h-0"
                >
                  <Send className="w-4 h-4" />
                  Submit for Approval
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {removeDialogIndex !== null && (
        <RemoveLineItemDialog
          isOpen={removeDialogOpen}
          onClose={() => {
            setRemoveDialogOpen(false);
            setRemoveDialogIndex(null);
          }}
          parentItemName={lineItems[removeDialogIndex]?.product_name || 'This item'}
          accessories={getAccessoriesForIndex(removeDialogIndex).map(a => a.item)}
          onRemoveAll={() => removeItemAndReindex(removeDialogIndex, 'all')}
          onRemovePrimaryOnly={() => removeItemAndReindex(removeDialogIndex, 'primary_only')}
        />
      )}
    </div>
  );
}
