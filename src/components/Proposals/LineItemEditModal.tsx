import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import { ProposalLineItem, Product, ProposalRoom } from '../../lib/types';
import { X, Save, Plus, RefreshCw, Replace, Package, DollarSign, Box, TrendingUp, Wrench, Tag, Image as ImageIcon, CreditCard as Edit, Check, Copy, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import ProductSelector from './ProductSelector';
import { useAuth } from '../../contexts/AuthContext';
import { ProductDetailModal } from '../Products/ProductDetailModal';
import ConfirmModal from '../ui/ConfirmModal';

interface LineItemEditModalProps {
  item: ProposalLineItem;
  proposalId: string;
  onSave: (updates: Partial<ProposalLineItem>) => void;
  onSaveToMaster?: (productId: string, updates: Partial<Product>) => void;
  onUpdateAllInstances?: (productId: string, updates: Partial<ProposalLineItem>) => void;
  onSubstituteProduct?: (oldProductId: string | null, newProduct: Product, replaceAll: boolean) => void;
  onClose: () => void;
}

interface ProposalClass {
  id: string;
  name: string;
  color: string;
}

interface LaborPhase {
  id: string;
  name: string;
  description: string | null;
}

export default function LineItemEditModal({ item, proposalId, onSave, onSaveToMaster, onUpdateAllInstances, onSubstituteProduct, onClose }: LineItemEditModalProps) {
  const { profile } = useAuth();
  const canEditProducts = profile?.can_edit_products ?? false;
  const [formData, setFormData] = useState({
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    unit_price: item.unit_price,
    cost: item.cost || 0,
    class_id: item.class_id || '',
    labor_hours: item.labor_hours || 0,
    labor_rate: item.labor_rate || 0,
    item_type: item.item_type || 'material',
    task_notes: item.task_notes || '',
    show_task_notes: item.show_task_notes ?? false,
    labor_phase_id: item.labor_phase_id || '',
    is_taxable: item.is_taxable !== undefined ? item.is_taxable : true,
    is_hidden: item.is_hidden || false,
  });
  const [classes, setClasses] = useState<ProposalClass[]>([]);
  const [laborPhases, setLaborPhases] = useState<LaborPhase[]>([]);
  const [saving, setSaving] = useState(false);
  const [showNewClassForm, setShowNewClassForm] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassColor, setNewClassColor] = useState('#3B82F6');
  const [masterProduct, setMasterProduct] = useState<Product | null>(null);
  const [loadingMaster, setLoadingMaster] = useState(false);
  const [instanceCount, setInstanceCount] = useState(0);
  const [showProductSelector, setShowProductSelector] = useState(false);
  const [selectedReplacementProduct, setSelectedReplacementProduct] = useState<Product | null>(null);
  const [showSubstituteConfirmation, setShowSubstituteConfirmation] = useState(false);
  const [showProductDetailView, setShowProductDetailView] = useState(false);
  const [rooms, setRooms] = useState<ProposalRoom[]>([]);
  const [selectedAreasForCopy, setSelectedAreasForCopy] = useState<Set<string>>(new Set());
  const [copyingToAreas, setCopyingToAreas] = useState(false);
  const [showMasterDetails, setShowMasterDetails] = useState(false);
  const [accessories, setAccessories] = useState<ProposalLineItem[]>([]);
  const [showAccessorySelector, setShowAccessorySelector] = useState(false);
  const [displayMode, setDisplayMode] = useState<'itemized' | 'bundle' | 'collapsed'>(item.display_mode || 'itemized');
  const [isNested, setIsNested] = useState<boolean>(!!item.parent_item_id);
  const [itemAbove, setItemAbove] = useState<ProposalLineItem | null>(null);
  const [canNest, setCanNest] = useState<boolean>(false);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  useEffect(() => {
    loadClasses();
    loadLaborPhases();
    loadRooms();
    loadAccessories();
    findItemAbove();
    if (item.product_id) {
      loadMasterProduct();
      countProductInstances();
    }
  }, [item.product_id, proposalId]);

  async function loadAccessories() {
    try {
      const { data, error } = await supabase
        .from('proposal_line_items')
        .select(`
          *,
          products(*, manufacturers(id, name))
        `)
        .eq('parent_item_id', item.id)
        .order('sort_order');

      if (error) throw error;
      setAccessories(data || []);
    } catch (error) {
      console.error('Error loading accessories:', error);
    }
  }

  async function findItemAbove() {
    try {
      console.log('🔍 Finding item above for:', item.description);

      // Check if current item already has children (accessories)
      const { data: childrenData, error: childrenError } = await supabase
        .from('proposal_line_items')
        .select('id')
        .eq('parent_item_id', item.id)
        .limit(1);

      if (childrenError) throw childrenError;

      // Can't nest items that have children
      if (childrenData && childrenData.length > 0) {
        console.log('  ❌ Cannot nest: Item has children');
        setCanNest(false);
        return;
      }

      // Find all items in the same room, ordered by sort_order
      const { data, error } = await supabase
        .from('proposal_line_items')
        .select('*')
        .eq('proposal_id', proposalId)
        .eq('room_id', item.room_id)
        .order('sort_order');

      if (error) throw error;

      if (!data || data.length === 0) {
        console.log('  ❌ Cannot nest: No items in room');
        setCanNest(false);
        return;
      }

      console.log('  📋 Items in room:', data.length);

      // Find the current item's position
      const currentIndex = data.findIndex(i => i.id === item.id);
      console.log('  📍 Current item position:', currentIndex);

      // If this is the first item, can't nest
      if (currentIndex <= 0) {
        console.log('  ❌ Cannot nest: First item in list');
        setCanNest(false);
        return;
      }

      // Get the item directly above
      const above = data[currentIndex - 1];
      setItemAbove(above);
      console.log('  ✅ Can nest under:', above.description);

      // Can nest if there's an item above
      setCanNest(true);
    } catch (error) {
      console.error('Error finding item above:', error);
      setCanNest(false);
    }
  }

  async function addAccessory(product: Product) {
    try {
      const maxSortOrder = accessories.length > 0
        ? Math.max(...accessories.map(a => a.sort_order))
        : 0;

      const newAccessory = {
        proposal_id: proposalId,
        room_id: item.room_id,
        product_id: product.id,
        parent_item_id: item.id,
        description: product.item_name,
        quantity: 1,
        unit: product.unit || 'each',
        unit_price: product.sell_price || 0,
        cost: product.cost || 0,
        line_total: product.sell_price || 0,
        sort_order: maxSortOrder + 1,
        is_custom: false
      };

      const { data, error } = await supabase
        .from('proposal_line_items')
        .insert(newAccessory)
        .select(`
          *,
          products(*, manufacturers(id, name))
        `)
        .single();

      if (error) throw error;
      setAccessories([...accessories, data]);
      setShowAccessorySelector(false);
    } catch (error) {
      console.error('Error adding accessory:', error);
      alert('Failed to add accessory');
    }
  }

  async function removeAccessory(accessoryId: string) {
    setConfirmModal({
      title: 'Remove Accessory',
      message: 'Remove this accessory?',
      onConfirm: async () => {
        setConfirmModal(null);
        await doRemoveAccessory(accessoryId);
      }
    });
  }

  async function doRemoveAccessory(accessoryId: string) {
    try {
      const { error } = await supabase
        .from('proposal_line_items')
        .delete()
        .eq('id', accessoryId);

      if (error) throw error;
      setAccessories(accessories.filter(a => a.id !== accessoryId));
    } catch (error) {
      console.error('Error removing accessory:', error);
      alert('Failed to remove accessory');
    }
  }

  async function loadClasses() {
    try {
      const { data, error } = await supabase
        .from('proposal_classes')
        .select('id, name, color')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setClasses(data || []);
    } catch (error) {
      console.error('Error loading classes:', error);
    }
  }

  async function loadLaborPhases() {
    try {
      const { data, error } = await supabase
        .from('labor_phases')
        .select('id, name, description')
        .eq('is_active', true)
        .order('sort_order');

      if (error) throw error;
      setLaborPhases(data || []);
    } catch (error) {
      console.error('Error loading labor phases:', error);
    }
  }

  async function loadRooms() {
    try {
      const { data, error } = await supabase
        .from('proposal_rooms')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('sort_order');

      if (error) throw error;
      setRooms(data || []);
    } catch (error) {
      console.error('Error loading rooms:', error);
    }
  }

  async function loadMasterProduct() {
    if (!item.product_id) return;

    setLoadingMaster(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select(`
          id,
          sku,
          name,
          description,
          unit,
          unit_price,
          cost,
          our_price,
          default_labor_hours,
          class_id,
          item_type,
          labor_phase_id,
          is_taxable,
          manufacturer_model_number,
          sales_description,
          product_link,
          image_url,
          manufacturer:manufacturers(name),
          vendor:vendors(vendor_name),
          category:product_categories(name),
          subcategory:product_subcategories(name),
          labor_phase:labor_phases(name, default_price)
        `)
        .eq('id', item.product_id)
        .single();

      if (error) throw error;
      console.log('Master product loaded with image_url:', data?.image_url);
      setMasterProduct(data);
    } catch (error) {
      console.error('Error loading master product:', error);
    } finally {
      setLoadingMaster(false);
    }
  }

  async function countProductInstances() {
    if (!item.product_id) return;

    try {
      const { count, error } = await supabase
        .from('proposal_line_items')
        .select('*', { count: 'exact', head: true })
        .eq('proposal_id', proposalId)
        .eq('product_id', item.product_id);

      if (error) throw error;
      setInstanceCount(count || 0);
    } catch (error) {
      console.error('Error counting product instances:', error);
    }
  }

  function updateFromMaster() {
    if (!masterProduct) return;

    setFormData({
      ...formData,
      description: masterProduct.name || formData.description,
      unit: masterProduct.unit || formData.unit,
      unit_price: masterProduct.unit_price || formData.unit_price,
      cost: masterProduct.cost || formData.cost,
      class_id: masterProduct.class_id || formData.class_id,
      labor_hours: masterProduct.default_labor_hours || formData.labor_hours,
      item_type: masterProduct.item_type || formData.item_type,
      labor_phase_id: masterProduct.labor_phase_id || formData.labor_phase_id,
      is_taxable: masterProduct.is_taxable !== undefined ? masterProduct.is_taxable : formData.is_taxable,
    });
  }

  function handleUpdateAllInstances() {
    if (!item.product_id || !onUpdateAllInstances) return;

    const updates = {
      description: formData.description,
      unit: formData.unit,
      unit_price: formData.unit_price,
      cost: formData.cost,
      class_id: formData.class_id || null,
      labor_hours: formData.labor_hours || null,
      labor_rate: formData.labor_rate || null,
      item_type: formData.item_type || null,
      task_notes: formData.task_notes || null,
      show_task_notes: formData.show_task_notes,
      labor_phase_id: formData.labor_phase_id || null,
      is_taxable: formData.is_taxable,
      is_hidden: formData.is_hidden,
    };

    onUpdateAllInstances(item.product_id, updates);
    onClose();
  }

  function handleProductSelection(product: Product | null, customData?: Partial<Product>) {
    if (!product && !customData) return;

    const replacementProduct = product || {
      id: null,
      name: customData?.name || customData?.description || '',
      description: customData?.description || '',
      unit_price: customData?.unit_price || 0,
      cost: customData?.cost || 0,
      unit: customData?.unit || 'each',
    } as Product;

    setSelectedReplacementProduct(replacementProduct);
    setShowProductSelector(false);
    setShowSubstituteConfirmation(true);
  }

  function handleSubstituteConfirm(replaceAll: boolean) {
    if (!selectedReplacementProduct || !onSubstituteProduct) return;

    onSubstituteProduct(item.product_id, selectedReplacementProduct, replaceAll);
    setShowSubstituteConfirmation(false);
    setSelectedReplacementProduct(null);
    onClose();
  }

  function handleSubstituteCancel() {
    setShowSubstituteConfirmation(false);
    setSelectedReplacementProduct(null);
  }

  async function createNewClass() {
    if (!newClassName.trim()) return;

    try {
      const { data, error } = await supabase
        .from('proposal_classes')
        .insert({
          name: newClassName.trim(),
          color: newClassColor,
          sort_order: classes.length,
          is_active: true
        })
        .select('id, name, color')
        .single();

      if (error) throw error;

      setClasses([...classes, data]);
      setFormData({ ...formData, class_id: data.id });
      setShowNewClassForm(false);
      setNewClassName('');
      setNewClassColor('#3B82F6');
    } catch (error) {
      console.error('Error creating class:', error);
      alert('Failed to create class');
    }
  }

  function handleSubmit(saveToMaster: boolean) {
    setSaving(true);

    const laborTotal = (formData.labor_hours || 0) * formData.quantity * (formData.labor_rate || 0);

    // Determine parent_item_id based on nesting checkbox
    let parentItemId = null;
    if (isNested && itemAbove) {
      // If item above is already nested, use its parent
      // Otherwise, nest under the item above
      parentItemId = itemAbove.parent_item_id || itemAbove.id;
      console.log('🔗 Modal nesting: Setting parent_item_id to', parentItemId, 'Item above:', itemAbove.description);
    } else if (!isNested && item.parent_item_id) {
      console.log('🔓 Modal unnesting: Clearing parent_item_id');
    }

    const updates = {
      description: formData.description,
      quantity: formData.quantity,
      unit: formData.unit,
      unit_price: formData.unit_price,
      cost: formData.cost,
      class_id: formData.class_id || null,
      labor_hours: formData.labor_hours || null,
      labor_rate: formData.labor_rate || null,
      labor_total: laborTotal || null,
      item_type: formData.item_type || null,
      task_notes: formData.task_notes || null,
      show_task_notes: formData.show_task_notes,
      labor_phase_id: formData.labor_phase_id || null,
      is_taxable: formData.is_taxable,
      is_hidden: formData.is_hidden,
      line_total: formData.quantity * formData.unit_price,
      display_mode: displayMode,
      parent_item_id: parentItemId
    };

    onSave(updates);

    if (saveToMaster && item.product_id && onSaveToMaster) {
      const productUpdates = {
        name: formData.description,
        unit: formData.unit,
        unit_price: formData.unit_price,
        cost: formData.cost,
        class_id: formData.class_id || null,
        default_labor_hours: formData.labor_hours || null,
        item_type: formData.item_type as any,
        labor_phase_id: formData.labor_phase_id || null,
        is_taxable: formData.is_taxable
      };
      onSaveToMaster(item.product_id, productUpdates);
    }

    setSaving(false);
    onClose();
  }

  async function copyToSelectedAreas() {
    if (selectedAreasForCopy.size === 0) {
      alert('Please select at least one area');
      return;
    }

    try {
      setCopyingToAreas(true);

      const laborTotal = (formData.labor_hours || 0) * formData.quantity * (formData.labor_rate || 0);
      const lineItems: any[] = [];
      let sortIndex = 0;

      Array.from(selectedAreasForCopy).forEach(roomId => {
        const lineItem: any = {
          proposal_id: proposalId,
          room_id: roomId,
          product_id: item.product_id || null,
          description: formData.description,
          quantity: formData.quantity,
          unit: formData.unit,
          unit_price: formData.unit_price,
          cost: formData.cost,
          line_total: formData.quantity * formData.unit_price,
          class_id: formData.class_id || null,
          labor_phase_id: formData.labor_phase_id || null,
          labor_hours: formData.labor_hours || null,
          labor_rate: formData.labor_rate || null,
          labor_total: laborTotal || null,
          item_type: formData.item_type || null,
          task_notes: formData.task_notes || null,
          show_task_notes: formData.show_task_notes,
          is_taxable: formData.is_taxable,
          is_hidden: formData.is_hidden,
          is_custom: item.is_custom || false,
          sort_order: 9999 + sortIndex++
        };

        lineItems.push(lineItem);
      });

      const { error } = await supabase
        .from('proposal_line_items')
        .insert(lineItems);

      if (error) throw error;

      alert(`Item copied to ${selectedAreasForCopy.size} area(s) successfully`);
      setSelectedAreasForCopy(new Set());
      onClose();
    } catch (error: any) {
      console.error('Error copying to areas:', error);
      alert('Failed to copy item: ' + error.message);
    } finally {
      setCopyingToAreas(false);
    }
  }

  const lineTotal = formData.quantity * formData.unit_price;
  const laborTotal = (formData.labor_hours || 0) * formData.quantity * (formData.labor_rate || 0);
  const totalRevenue = lineTotal + laborTotal;
  const totalCost = (formData.cost * formData.quantity);
  const profit = totalRevenue - totalCost;
  const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-none sm:rounded-2xl shadow-2xl max-w-7xl w-full h-screen sm:h-auto sm:max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-8 py-4 sm:py-6 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="text-lg sm:text-2xl font-bold text-gray-900">Edit Line Item</h2>
            <p className="text-gray-500 text-xs sm:text-sm mt-0.5 sm:mt-1">Make changes to product details and pricing</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors rounded-lg p-2 hover:bg-gray-100"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 sm:px-8 py-5 sm:py-6 space-y-6">
          {/* Main Content - Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column - Product Image */}
            {masterProduct && (
              <div className="lg:col-span-3">
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  {masterProduct?.image_url ? (
                    <img
                      src={masterProduct.image_url}
                      alt={masterProduct.manufacturer_model_number || formData.description}
                      className="w-full h-48 object-contain rounded-lg mb-3"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-full h-48 bg-white rounded-lg flex items-center justify-center mb-3">
                      <Package className="h-16 w-16 text-gray-300" />
                    </div>
                  )}

                  <div className="space-y-2">
                    {masterProduct.sku && (
                      <div className="text-xs">
                        <span className="text-gray-500">SKU:</span>{' '}
                        <span className="text-gray-900 font-medium">{masterProduct.sku}</span>
                      </div>
                    )}
                    {masterProduct.category?.name && (
                      <div className="text-xs">
                        <span className="text-gray-500">Category:</span>{' '}
                        <span className="text-gray-900 font-medium">
                          {masterProduct.category.name}
                          {masterProduct.subcategory?.name && ` > ${masterProduct.subcategory.name}`}
                        </span>
                      </div>
                    )}
                    {canEditProducts && (
                      <button
                        onClick={() => setShowProductDetailView(true)}
                        className="w-full mt-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg font-medium flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Edit className="h-3.5 w-3.5" />
                        View Details
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Right Column - Form Fields */}
            <div className={masterProduct ? "lg:col-span-9" : "lg:col-span-12"}>
              <div className="space-y-5">
                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Product Description
                  </label>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter product description"
                  />
                </div>

                {/* Pricing Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Quantity</label>
                    <input
                      type="number"
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      min="0"
                      step="0.01"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Unit</label>
                    <input
                      type="text"
                      value={formData.unit}
                      onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="ea"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Cost</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                      <input
                        type="text"
                        value={formData.cost}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '' || val === '-') {
                            setFormData({ ...formData, cost: 0 });
                          } else {
                            const parsed = parseFloat(val);
                            if (!isNaN(parsed)) {
                              setFormData({ ...formData, cost: parsed });
                            }
                          }
                        }}
                        onBlur={(e) => {
                          const parsed = parseFloat(e.target.value);
                          setFormData({ ...formData, cost: isNaN(parsed) ? 0 : parsed });
                        }}
                        className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-gray-900 font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Unit Price</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                      <input
                        type="number"
                        value={formData.unit_price}
                        onChange={(e) => setFormData({ ...formData, unit_price: parseFloat(e.target.value) || 0 })}
                        className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-gray-900 font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        min="0"
                        step="0.01"
                      />
                    </div>
                  </div>
                </div>

                {/* Labor Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Labor Hours</label>
                    <input
                      type="number"
                      value={formData.labor_hours}
                      onChange={(e) => setFormData({ ...formData, labor_hours: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      min="0"
                      step="0.25"
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Labor Rate</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                      <input
                        type="number"
                        value={formData.labor_rate}
                        onChange={(e) => setFormData({ ...formData, labor_rate: parseFloat(e.target.value) || 0 })}
                        className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-gray-900 font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Labor Phase</label>
                    <select
                      value={formData.labor_phase_id}
                      onChange={(e) => setFormData({ ...formData, labor_phase_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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

                {/* Financial Summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Material</p>
                    <p className="text-lg font-bold text-gray-900">{formatCurrency(lineTotal)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Labor</p>
                    <p className="text-lg font-bold text-gray-900">{formatCurrency(laborTotal)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Profit</p>
                    <p className={`text-lg font-bold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ${profit.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Margin</p>
                    <p className={`text-lg font-bold ${margin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {margin.toFixed(1)}%
                    </p>
                  </div>
                </div>

                {/* Class */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Class</label>
                  {!showNewClassForm ? (
                    <div className="flex gap-2">
                      <select
                        value={formData.class_id}
                        onChange={(e) => setFormData({ ...formData, class_id: e.target.value })}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">No Class</option>
                        {classes.map(cls => (
                          <option key={cls.id} value={cls.id}>
                            {cls.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setShowNewClassForm(true)}
                        className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <input
                        type="text"
                        value={newClassName}
                        onChange={(e) => setNewClassName(e.target.value)}
                        placeholder="Enter class name"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500"
                        autoFocus
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={newClassColor}
                          onChange={(e) => setNewClassColor(e.target.value)}
                          className="w-16 h-9 border border-gray-300 rounded cursor-pointer"
                        />
                        <button
                          type="button"
                          onClick={createNewClass}
                          disabled={!newClassName.trim()}
                          className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-lg font-medium transition-colors"
                        >
                          Create
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowNewClassForm(false);
                            setNewClassName('');
                          }}
                          className="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Task Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Task Notes for Technicians</label>
                  <textarea
                    value={formData.task_notes}
                    onChange={(e) => setFormData({ ...formData, task_notes: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                    rows={3}
                    placeholder="Special installation instructions or notes..."
                  />
                </div>

                {/* Checkboxes */}
                <div className="space-y-3">
                  {/* Nested Checkbox - Always Visible with Clear Status */}
                  <div className={`border-2 rounded-lg p-3 ${
                    canNest ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50'
                  }`}>
                    <label className={`flex items-start gap-3 ${canNest ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                      <input
                        type="checkbox"
                        checked={isNested}
                        onChange={(e) => {
                          console.log('🔄 Nested checkbox toggled:', e.target.checked);
                          setIsNested(e.target.checked);
                        }}
                        disabled={!canNest}
                        className="w-5 h-5 rounded border-gray-300 text-green-600 focus:ring-2 focus:ring-green-500 disabled:cursor-not-allowed mt-0.5"
                      />
                      <div className="flex-1">
                        <span className={`text-sm font-semibold ${canNest ? 'text-green-800' : 'text-gray-600'}`}>
                          Nested Accessory Item
                        </span>
                        {canNest && itemAbove && (
                          <div className="text-xs text-green-700 mt-1 font-medium">
                            ✓ Will nest under: <span className="font-bold">{itemAbove.description}</span>
                          </div>
                        )}
                        {item.parent_item_id && (
                          <div className="text-xs text-blue-600 mt-1 font-medium">
                            Currently nested - uncheck to make it a top-level item
                          </div>
                        )}
                        {!canNest && accessories.length > 0 && (
                          <div className="text-xs text-amber-700 mt-1 font-medium bg-amber-50 p-2 rounded border border-amber-200 mt-2">
                            ⚠️ Items with nested accessories cannot be nested themselves
                          </div>
                        )}
                        {!canNest && accessories.length === 0 && !itemAbove && (
                          <div className="text-xs text-gray-600 mt-1 bg-white p-2 rounded border border-gray-200 mt-2">
                            ℹ️ This is the first item in the area - nothing above it to nest under
                          </div>
                        )}
                      </div>
                    </label>
                  </div>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.is_taxable}
                      disabled
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 opacity-60 cursor-not-allowed"
                    />
                    <span className="text-sm text-gray-600">
                      Taxable item <span className="text-xs text-gray-500">(follows sales tax rules)</span>
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.show_task_notes}
                      onChange={(e) => setFormData({ ...formData, show_task_notes: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">
                      Show install task notes on customer proposal
                      <span className="ml-1 text-xs text-gray-400">(internal by default)</span>
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.is_hidden}
                      onChange={(e) => setFormData({ ...formData, is_hidden: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Hide from customer proposal (internal item)</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Accessories Section */}
          <div className="border border-gray-200 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Accessories & Add-ons</h3>
                <p className="text-sm text-gray-500 mt-1">Items that are part of this product package</p>
              </div>
              <button
                onClick={() => setShowAccessorySelector(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 transition-colors"
              >
                <Plus size={16} />
                Add Accessory
              </button>
            </div>

            {accessories.length > 0 && (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Display Mode</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDisplayMode('itemized')}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        displayMode === 'itemized'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Itemized
                    </button>
                    <button
                      onClick={() => setDisplayMode('bundle')}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        displayMode === 'bundle'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Bundle
                    </button>
                    <button
                      onClick={() => setDisplayMode('collapsed')}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        displayMode === 'collapsed'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Collapsed
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {displayMode === 'itemized' && 'Show all items as separate line items'}
                    {displayMode === 'bundle' && 'Show only parent item with total including accessories'}
                    {displayMode === 'collapsed' && 'Show parent with text summary of accessories'}
                  </p>
                </div>

                <div className="space-y-2">
                  {accessories.map((accessory) => (
                    <div
                      key={accessory.id}
                      className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{accessory.description}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {accessory.quantity} {accessory.unit} × ${accessory.unit_price.toFixed(2)} = ${accessory.line_total.toFixed(2)}
                        </p>
                      </div>
                      <button
                        onClick={() => removeAccessory(accessory.id)}
                        className="text-red-600 hover:text-red-700 p-2 hover:bg-red-50 rounded transition-colors"
                        title="Remove accessory"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {accessories.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <Package className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">No accessories added yet</p>
              </div>
            )}
          </div>

          {/* Master Product Details - Collapsible */}
          {masterProduct && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setShowMasterDetails(!showMasterDetails)}
                className="w-full bg-gray-50 px-5 py-3 flex items-center justify-between hover:bg-gray-100 transition-colors"
              >
                <span className="font-medium text-gray-900 flex items-center gap-2">
                  <Package className="w-4 h-4 text-gray-600" />
                  Master Catalog Details
                </span>
                {showMasterDetails ? (
                  <ChevronUp className="w-5 h-5 text-gray-500" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-500" />
                )}
              </button>

              {showMasterDetails && (
                <div className="p-5 bg-white space-y-4">
                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Master Price</p>
                      <p className="text-base font-bold text-gray-900">
                        ${Number(masterProduct.our_price || masterProduct.unit_price || 0).toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Master Cost</p>
                      <p className="text-base font-bold text-gray-900">
                        ${Number(masterProduct.cost || 0).toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Master Margin</p>
                      <p className="text-base font-bold text-gray-900">
                        {(() => {
                          const cost = Number(masterProduct.cost || 0);
                          const price = Number(masterProduct.our_price || masterProduct.unit_price || 0);
                          const profit = price - cost;
                          const margin = price > 0 ? (profit / price) * 100 : 0;
                          return margin.toFixed(1);
                        })()}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Default Hours</p>
                      <p className="text-base font-bold text-gray-900">{masterProduct.default_labor_hours || 0} hrs</p>
                    </div>
                  </div>

                  {(masterProduct.sales_description || masterProduct.product_link) && (
                    <div className="space-y-2">
                      {masterProduct.sales_description && (
                        <div className="text-sm text-gray-700">
                          <span className="font-medium">Description:</span> {masterProduct.sales_description}
                        </div>
                      )}
                      {masterProduct.product_link && (
                        <a
                          href={masterProduct.product_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 text-sm"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          View Product Page
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Copy to Areas Section */}
          {rooms.length > 1 && (
            <div className="border border-gray-200 rounded-lg p-4 bg-blue-50">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-900 flex items-center gap-2">
                  <Copy className="h-4 w-4 text-gray-600" />
                  Copy to Other Areas
                </h3>
                {selectedAreasForCopy.size > 0 && (
                  <span className="bg-blue-600 text-white px-2 py-0.5 rounded-full text-xs font-medium">
                    {selectedAreasForCopy.size} selected
                  </span>
                )}
              </div>

              <div className="space-y-1 max-h-40 overflow-y-auto bg-white rounded-lg p-2 border border-gray-200 mb-3">
                {rooms.filter(room => room.id !== item.room_id).map(room => (
                  <label
                    key={room.id}
                    className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                      selectedAreasForCopy.has(room.id) ? 'bg-blue-100' : 'hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedAreasForCopy.has(room.id)}
                      onChange={() => {
                        const newSelected = new Set(selectedAreasForCopy);
                        if (selectedAreasForCopy.has(room.id)) {
                          newSelected.delete(room.id);
                        } else {
                          newSelected.add(room.id);
                        }
                        setSelectedAreasForCopy(newSelected);
                      }}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-900">{room.name}</span>
                  </label>
                ))}
              </div>

              {selectedAreasForCopy.size > 0 && (
                <button
                  onClick={copyToSelectedAreas}
                  disabled={copyingToAreas}
                  className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  {copyingToAreas ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Copying...
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy to {selectedAreasForCopy.size} Area{selectedAreasForCopy.size !== 1 ? 's' : ''}
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Master Product Actions */}
          {item.product_id && (
            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
              <div className="flex items-start gap-2 mb-3">
                <Package className="w-4 h-4 text-gray-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Linked to Master Catalog</p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {instanceCount > 1
                      ? `This product appears ${instanceCount} times on this proposal.`
                      : 'This item is synced with the master catalog.'}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={updateFromMaster}
                  disabled={loadingMaster || !masterProduct}
                  className="px-4 py-2 bg-white hover:bg-gray-50 disabled:bg-gray-100 text-gray-700 border border-gray-300 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  <RefreshCw size={16} className={loadingMaster ? 'animate-spin' : ''} />
                  Update from Master
                </button>
                {onSubstituteProduct && (
                  <button
                    type="button"
                    onClick={() => setShowProductSelector(true)}
                    className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
                  >
                    <Replace size={16} />
                    Substitute
                  </button>
                )}
              </div>
            </div>
          )}

          {!item.product_id && onSubstituteProduct && (
            <button
              type="button"
              onClick={() => setShowProductSelector(true)}
              className="w-full px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <Replace size={18} />
              Link to Product from Catalog
            </button>
          )}
        </div>

        {/* Footer Actions */}
        <div className="border-t border-gray-200 px-5 sm:px-8 py-4 sm:py-5 bg-gray-50 rounded-b-none sm:rounded-b-2xl space-y-3 shrink-0">
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={onClose}
              className="px-5 py-2.5 bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => handleSubmit(false)}
              disabled={saving}
              className="flex-1 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <Save size={18} />
              Save Changes
            </button>
            {item.product_id && onSaveToMaster && canEditProducts && (
              <button
                onClick={() => handleSubmit(true)}
                disabled={saving}
                className="flex-1 px-5 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
              >
                <Save size={18} />
                Save to Master
              </button>
            )}
          </div>
          {item.product_id && instanceCount > 1 && onUpdateAllInstances && (
            <button
              onClick={handleUpdateAllInstances}
              disabled={saving}
              className="w-full px-5 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-300 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <RefreshCw size={18} />
              Update All {instanceCount} Instances
            </button>
          )}
        </div>
      </div>

      {showProductSelector && (
        <ProductSelector
          onSelect={handleProductSelection}
          onClose={() => setShowProductSelector(false)}
        />
      )}

      {showSubstituteConfirmation && selectedReplacementProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Confirm Substitution</h3>

            <div className="space-y-3 mb-6">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <div className="text-xs text-gray-600 mb-1">Current:</div>
                <div className="font-semibold text-gray-900">{item.description}</div>
                <div className="text-sm text-gray-600 mt-1">
                  ${item.unit_price.toFixed(2)} per {item.unit}
                </div>
              </div>

              <div className="flex items-center justify-center">
                <Replace className="text-orange-500" size={24} />
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="text-xs text-gray-600 mb-1">New:</div>
                <div className="font-semibold text-gray-900">{selectedReplacementProduct.name}</div>
                <div className="text-sm text-gray-600 mt-1">
                  ${selectedReplacementProduct.unit_price?.toFixed(2) || '0.00'} per {selectedReplacementProduct.unit || 'each'}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => handleSubstituteConfirm(false)}
                className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
              >
                Replace Only This Item
              </button>

              {instanceCount > 1 && (
                <button
                  onClick={() => handleSubstituteConfirm(true)}
                  className="w-full px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium"
                >
                  Replace All {instanceCount} Instances
                </button>
              )}

              <button
                onClick={handleSubstituteCancel}
                className="w-full px-4 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showProductDetailView && item.product_id && (
        <ProductDetailModal
          productId={item.product_id}
          onClose={() => {
            setShowProductDetailView(false);
            // Reload master product to get any changes
            loadMasterProduct();
          }}
          onEdit={() => {
            setShowProductDetailView(false);
            window.open(`/admin/products?edit=${item.product_id}`, '_blank');
          }}
        />
      )}

      {showAccessorySelector && (
        <ProductSelector
          onSelect={addAccessory}
          onClose={() => setShowAccessorySelector(false)}
        />
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
