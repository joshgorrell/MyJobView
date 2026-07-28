import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import { Product, ProposalRoom } from '../../lib/types';
import { Search, Package, X, Plus, RefreshCw, Save, ChevronDown, ChevronUp, ExternalLink, ArrowLeft } from 'lucide-react';
import SinglePageProductForm from '../Products/SinglePageProductForm';
import ProductSelector from './ProductSelector';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmModal from '../ui/ConfirmModal';

interface AddItemToAreasModalProps {
  proposalId: string;
  rooms: ProposalRoom[];
  activeAreaId?: string;
  onClose: () => void;
  onItemsAdded: () => void;
  onRoomsUpdate?: (rooms: ProposalRoom[]) => void;
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
  default_price: number | null;
}

interface PendingAccessory {
  tempId: string;
  product: Product;
  quantity: number;
  unit_price: number;
  cost: number;
  description: string;
}

export default function AddItemToAreasModal({
  proposalId,
  rooms: initialRooms,
  activeAreaId,
  onClose,
  onItemsAdded,
  onRoomsUpdate
}: AddItemToAreasModalProps) {
  const { profile } = useAuth();
  const canEditProducts = profile?.can_edit_products ?? false;

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const [formData, setFormData] = useState({
    description: '',
    quantity: 1,
    unit: 'ea',
    unit_price: 0,
    cost: 0,
    class_id: '',
    labor_hours: 0,
    labor_rate: 0,
    labor_phase_id: '',
    task_notes: '',
    show_task_notes: false,
    is_taxable: true,
    is_hidden: false,
    is_customer_supplied: false,
  });

  const [classes, setClasses] = useState<ProposalClass[]>([]);
  const [laborPhases, setLaborPhases] = useState<LaborPhase[]>([]);
  const [saving, setSaving] = useState(false);
  const [showNewClassForm, setShowNewClassForm] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassColor, setNewClassColor] = useState('#3B82F6');
  const [selectedRooms, setSelectedRooms] = useState<Set<string>>(new Set(activeAreaId ? [activeAreaId] : []));
  const [newAreaName, setNewAreaName] = useState('');
  const [creatingArea, setCreatingArea] = useState(false);
  const [localRooms, setLocalRooms] = useState<ProposalRoom[]>(initialRooms);
  const [showNewProductForm, setShowNewProductForm] = useState(false);

  const [masterProduct, setMasterProduct] = useState<any>(null);
  const [loadingMaster, setLoadingMaster] = useState(false);
  const [showMasterDetails, setShowMasterDetails] = useState(false);

  const [pendingAccessories, setPendingAccessories] = useState<PendingAccessory[]>([]);
  const [showAccessorySelector, setShowAccessorySelector] = useState(false);
  const [displayMode, setDisplayMode] = useState<'itemized' | 'bundle' | 'collapsed'>('itemized');
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  useEffect(() => {
    loadProducts();
    loadLaborPhases();
    loadClasses();
  }, []);

  useEffect(() => {
    if (selectedProduct?.id && !selectedProduct.id.toString().startsWith('null')) {
      loadMasterProduct(selectedProduct.id);
    } else {
      setMasterProduct(null);
    }
  }, [selectedProduct]);

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
        .select('id, name, description, default_price')
        .eq('is_active', true)
        .order('sort_order');

      if (error) throw error;
      setLaborPhases(data || []);
    } catch (error) {
      console.error('Error loading labor phases:', error);
    }
  }

  async function loadProducts() {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('sku');

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error loading products:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadMasterProduct(productId: string) {
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
        .eq('id', productId)
        .single();

      if (error) throw error;
      setMasterProduct(data);
    } catch (error) {
      console.error('Error loading master product:', error);
      setMasterProduct(null);
    } finally {
      setLoadingMaster(false);
    }
  }

  const filteredProducts = products.filter(product => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      product.sku?.toLowerCase().includes(query) ||
      product.name?.toLowerCase().includes(query) ||
      product.description?.toLowerCase().includes(query) ||
      product.category?.toLowerCase().includes(query)
    );
  });

  function handleProductSelect(product: Product) {
    setSelectedProduct(product);
    const basePrice = product.unit_price || product.our_price || 0;
    const phase = product.labor_phase_id
      ? laborPhases.find(p => p.id === product.labor_phase_id)
      : null;

    setFormData({
      description: product.description || product.name,
      quantity: 1,
      unit: product.unit || 'ea',
      unit_price: basePrice,
      cost: product.cost || 0,
      class_id: (product as any).class_id || '',
      labor_hours: product.default_labor_hours || 0,
      labor_rate: phase?.default_price || 0,
      labor_phase_id: product.labor_phase_id || '',
      task_notes: '',
      show_task_notes: false,
      is_taxable: product.is_taxable !== undefined ? product.is_taxable : true,
      is_hidden: false,
      is_customer_supplied: false,
    });
    setPendingAccessories([]);
    setDisplayMode('itemized');
  }

  async function handleProductCreated(productData: any) {
    setShowNewProductForm(false);

    if (productData?.isOneOff) {
      const tempProduct: Product = {
        id: null as any,
        name: productData.manufacturer_model_number || productData.name,
        description: productData.sales_description || productData.description,
        unit_price: productData.our_price || productData.unit_price,
        our_price: productData.our_price,
        cost: productData.cost,
        unit: productData.unit,
        sku: productData.sku,
        manufacturer_model_number: productData.manufacturer_model_number,
        category: productData.category,
        item_type: productData.item_type,
        is_taxable: productData.is_taxable,
        labor_phase_id: productData.labor_phase_id,
        default_labor_hours: productData.default_labor_hours,
        oneOffData: productData
      } as any;
      handleProductSelect(tempProduct);
    } else {
      await loadProducts();
      if (productData?.id) {
        const product = products.find(p => p.id === productData.id);
        if (product) {
          handleProductSelect(product);
        }
      }
    }
  }

  function toggleRoom(roomId: string) {
    const newSelected = new Set(selectedRooms);
    if (newSelected.has(roomId)) {
      newSelected.delete(roomId);
    } else {
      newSelected.add(roomId);
    }
    setSelectedRooms(newSelected);
  }

  async function handleCreateArea() {
    if (!newAreaName.trim()) return;

    try {
      setCreatingArea(true);

      const { data: proposalData, error: proposalError } = await supabase
        .from('proposals')
        .select('organization_id')
        .eq('id', proposalId)
        .single();

      if (proposalError) throw proposalError;

      const { data, error } = await supabase
        .from('proposal_rooms')
        .insert({
          proposal_id: proposalId,
          organization_id: proposalData.organization_id,
          name: newAreaName.trim(),
          sort_order: localRooms.length
        })
        .select()
        .single();

      if (error) throw error;

      const newRoom: ProposalRoom = data;
      const updatedRooms = [...localRooms, newRoom];
      setLocalRooms(updatedRooms);

      if (onRoomsUpdate) {
        onRoomsUpdate(updatedRooms);
      }

      setSelectedRooms(prev => new Set([...prev, data.id]));
      setNewAreaName('');
    } catch (error: any) {
      console.error('Error creating area:', error);
      alert('Failed to create area: ' + error.message);
    } finally {
      setCreatingArea(false);
    }
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
      labor_phase_id: masterProduct.labor_phase_id || formData.labor_phase_id,
      is_taxable: masterProduct.is_taxable !== undefined ? masterProduct.is_taxable : formData.is_taxable,
    });

    if (masterProduct.labor_phase_id) {
      const phase = laborPhases.find(p => p.id === masterProduct.labor_phase_id);
      if (phase?.default_price) {
        setFormData(prev => ({ ...prev, labor_rate: phase.default_price! }));
      }
    }
  }

  function addPendingAccessory(product: Product) {
    const newAccessory: PendingAccessory = {
      tempId: `pending-${Date.now()}-${Math.random()}`,
      product,
      quantity: 1,
      unit_price: product.unit_price || product.our_price || 0,
      cost: product.cost || 0,
      description: product.description || product.name,
    };
    setPendingAccessories([...pendingAccessories, newAccessory]);
    setShowAccessorySelector(false);
  }

  function removePendingAccessory(tempId: string) {
    setConfirmModal({
      title: 'Remove Accessory',
      message: 'Remove this accessory from the item?',
      onConfirm: () => {
        setPendingAccessories(pendingAccessories.filter(a => a.tempId !== tempId));
        setConfirmModal(null);
      }
    });
  }

  async function handleSaveToMaster() {
    if (!selectedProduct?.id || !canEditProducts) return;

    try {
      const { error } = await supabase
        .from('products')
        .update({
          name: formData.description,
          unit: formData.unit,
          unit_price: formData.unit_price,
          cost: formData.cost,
          class_id: formData.class_id || null,
          default_labor_hours: formData.labor_hours || null,
          labor_phase_id: formData.labor_phase_id || null,
          is_taxable: formData.is_taxable,
        })
        .eq('id', selectedProduct.id);

      if (error) throw error;
      alert('Product master catalog updated successfully.');
    } catch (error: any) {
      console.error('Error saving to master:', error);
      alert('Failed to save to master: ' + error.message);
    }
  }

  async function handleSave() {
    if (!selectedProduct) {
      alert('Please select a product');
      return;
    }

    if (!formData.is_customer_supplied && (!formData.cost || formData.cost <= 0)) {
      alert('Cost is required. Please enter a unit cost greater than $0 before saving.');
      return;
    }

    try {
      setSaving(true);

      const isOneOff = !selectedProduct.id || (selectedProduct as any).oneOffData;

      const effectiveUnitPrice = formData.is_customer_supplied ? 0 : formData.unit_price;
      const effectiveCost = formData.is_customer_supplied ? 0 : formData.cost;
      const effectiveLaborHours = formData.is_customer_supplied ? 0 : formData.labor_hours;
      const effectiveLaborRate = formData.is_customer_supplied ? 0 : formData.labor_rate;
      const laborTotal = effectiveLaborHours * formData.quantity * effectiveLaborRate;
      const effectiveLineTotal = formData.is_customer_supplied ? 0 : formData.quantity * formData.unit_price;

      const roomIds = selectedRooms.size === 0 ? [null] : Array.from(selectedRooms);

      for (const roomId of roomIds) {
        const mainItem: any = {
          proposal_id: proposalId,
          room_id: roomId,
          description: formData.description,
          quantity: formData.quantity,
          unit: formData.unit,
          unit_price: effectiveUnitPrice,
          cost: effectiveCost,
          line_total: effectiveLineTotal,
          class_id: formData.class_id || null,
          labor_phase_id: formData.labor_phase_id || null,
          labor_hours: effectiveLaborHours || null,
          labor_rate: effectiveLaborRate || null,
          labor_total: laborTotal || null,
          task_notes: formData.task_notes || null,
          show_task_notes: formData.show_task_notes,
          is_taxable: formData.is_taxable,
          is_hidden: formData.is_hidden,
          is_customer_supplied: formData.is_customer_supplied,
          is_custom: false,
          display_mode: pendingAccessories.length > 0 ? displayMode : null,
          sort_order: 9999
        };

        if (isOneOff) {
          mainItem.product_id = null;
          mainItem.item_name = selectedProduct.name || (selectedProduct as any).manufacturer_model_number;
        } else {
          mainItem.product_id = selectedProduct.id;
        }

        const { data: insertedMain, error: mainError } = await supabase
          .from('proposal_line_items')
          .insert(mainItem)
          .select()
          .single();

        if (mainError) throw mainError;

        if (pendingAccessories.length > 0 && insertedMain) {
          const accessoryItems = pendingAccessories.map((acc, idx) => ({
            proposal_id: proposalId,
            room_id: roomId,
            product_id: acc.product.id,
            parent_item_id: insertedMain.id,
            description: acc.description,
            quantity: acc.quantity,
            unit: acc.product.unit || 'each',
            unit_price: acc.unit_price,
            cost: acc.cost,
            line_total: acc.quantity * acc.unit_price,
            sort_order: 10000 + idx,
            is_custom: false,
          }));

          const { error: accError } = await supabase
            .from('proposal_line_items')
            .insert(accessoryItems);

          if (accError) throw accError;
        }
      }

      onItemsAdded();
    } catch (error: any) {
      console.error('Error adding items:', error);
      alert('Failed to add items: ' + error.message);
    } finally {
      setSaving(false);
    }
  }

  const lineTotal = formData.is_customer_supplied ? 0 : formData.quantity * formData.unit_price;
  const laborTotal = formData.is_customer_supplied ? 0 : (formData.labor_hours || 0) * formData.quantity * (formData.labor_rate || 0);
  const totalRevenue = lineTotal + laborTotal;
  const totalCost = formData.is_customer_supplied ? 0 : (formData.cost * formData.quantity);
  const profit = totalRevenue - totalCost;
  const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

  const accessoriesTotal = pendingAccessories.reduce((sum, a) => sum + a.quantity * a.unit_price, 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-none sm:rounded-2xl shadow-2xl max-w-7xl w-full h-screen sm:h-auto sm:max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-8 py-4 sm:py-6 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="text-lg sm:text-2xl font-bold text-gray-900">Add Item to Proposal</h2>
            <p className="text-gray-500 text-xs sm:text-sm mt-0.5 sm:mt-1">
              {selectedProduct ? 'Configure item details and pricing' : 'Search for a product or create a new one'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors rounded-lg p-2 hover:bg-gray-100"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 sm:px-8 py-5 sm:py-6 space-y-6">
          {/* Step 1: Product Selection */}
          {!selectedProduct ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Search Products
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name, SKU, or description..."
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    autoFocus
                  />
                </div>
              </div>

              <button
                onClick={() => setShowNewProductForm(true)}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 font-medium"
              >
                <Plus className="w-5 h-5" />
                Create New Product
              </button>

              <div className="border border-gray-200 rounded-lg max-h-96 overflow-y-auto">
                {loading ? (
                  <div className="p-8 text-center text-gray-400">Loading products...</div>
                ) : filteredProducts.length === 0 ? (
                  <div className="p-8 text-center text-gray-400">
                    {searchQuery ? 'No products match your search' : 'No products available'}
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {filteredProducts.map(product => (
                      <button
                        key={product.id}
                        onClick={() => handleProductSelect(product)}
                        className="w-full p-4 text-left hover:bg-gray-50 transition-colors flex items-start gap-3"
                      >
                        <Package className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900">{product.name}</div>
                          {product.sku && (
                            <div className="text-xs text-gray-500 mt-0.5">SKU: {product.sku}</div>
                          )}
                          {product.description && (
                            <div className="text-sm text-gray-500 mt-1 line-clamp-2">
                              {product.description}
                            </div>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-gray-900 font-medium">
                            ${(product.unit_price || product.our_price || 0).toFixed(2)}
                          </div>
                          <div className="text-xs text-gray-500">per {product.unit || 'ea'}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Main Content - Two Column Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left Column - Product Info (inline details, no buttons) */}
                <div className="lg:col-span-3">
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                    {(selectedProduct as any).image_url || masterProduct?.image_url ? (
                      <img
                        src={(selectedProduct as any).image_url || masterProduct?.image_url}
                        alt={selectedProduct.name}
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
                      <div className="font-medium text-gray-900 text-sm">{selectedProduct.name}</div>

                      {(selectedProduct.sku || masterProduct?.sku) && (
                        <div className="text-xs">
                          <span className="text-gray-500">SKU:</span>{' '}
                          <span className="text-gray-900 font-medium">{selectedProduct.sku || masterProduct?.sku}</span>
                        </div>
                      )}

                      {(selectedProduct as any).manufacturer_model_number || masterProduct?.manufacturer_model_number ? (
                        <div className="text-xs">
                          <span className="text-gray-500">Model:</span>{' '}
                          <span className="text-gray-900 font-medium">
                            {(selectedProduct as any).manufacturer_model_number || masterProduct?.manufacturer_model_number}
                          </span>
                        </div>
                      ) : null}

                      {masterProduct?.category?.name && (
                        <div className="text-xs">
                          <span className="text-gray-500">Category:</span>{' '}
                          <span className="text-gray-900 font-medium">
                            {masterProduct.category.name}
                            {masterProduct.subcategory?.name && ` > ${masterProduct.subcategory.name}`}
                          </span>
                        </div>
                      )}

                      {masterProduct?.manufacturer?.name && (
                        <div className="text-xs">
                          <span className="text-gray-500">Manufacturer:</span>{' '}
                          <span className="text-gray-900 font-medium">{masterProduct.manufacturer.name}</span>
                        </div>
                      )}

                      {masterProduct?.vendor?.vendor_name && (
                        <div className="text-xs">
                          <span className="text-gray-500">Vendor:</span>{' '}
                          <span className="text-gray-900 font-medium">{masterProduct.vendor.vendor_name}</span>
                        </div>
                      )}

                      {masterProduct?.sales_description && (
                        <div className="text-xs pt-1 border-t border-gray-200">
                          <span className="text-gray-500 block mb-1">Sales Description:</span>
                          <span className="text-gray-700">{masterProduct.sales_description}</span>
                        </div>
                      )}

                      {masterProduct?.product_link && (
                        <a
                          href={masterProduct.product_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 text-xs pt-1"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          View Product Page
                        </a>
                      )}

                      {/* Subtle back-to-search link */}
                      <button
                        onClick={() => {
                          setSelectedProduct(null);
                          setMasterProduct(null);
                          setPendingAccessories([]);
                        }}
                        className="w-full mt-3 pt-2 border-t border-gray-200 text-gray-500 hover:text-gray-700 text-xs flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        Back to search
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right Column - Form Fields */}
                <div className="lg:col-span-9">
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

                    {/* Customer Supplied Toggle */}
                    <div className="border-2 rounded-lg p-3 border-amber-300 bg-amber-50">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.is_customer_supplied}
                          onChange={(e) => setFormData({ ...formData, is_customer_supplied: e.target.checked })}
                          className="w-5 h-5 rounded border-gray-300 text-amber-600 focus:ring-2 focus:ring-amber-500 mt-0.5"
                        />
                        <div className="flex-1">
                          <span className="text-sm font-semibold text-amber-800">
                            Customer Supplied Item
                          </span>
                          <div className="text-xs text-amber-700 mt-1">
                            The customer is providing this item. Price, cost, and labor are set to $0 and excluded from all proposal totals, tax, and deposit calculations. The item still appears in the scope of work.
                          </div>
                        </div>
                      </label>
                    </div>

                    {/* Pricing Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">Quantity</label>
                        <input
                          type="text"
                          value={formData.quantity || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '' || val === '-') {
                              setFormData({ ...formData, quantity: 0 });
                            } else {
                              const parsed = parseFloat(val);
                              if (!isNaN(parsed)) {
                                setFormData({ ...formData, quantity: parsed });
                              }
                            }
                          }}
                          onBlur={(e) => {
                            const parsed = parseFloat(e.target.value);
                            setFormData({ ...formData, quantity: isNaN(parsed) ? 0 : parsed });
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="0"
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
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">Cost <span className="text-red-500">*</span></label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                          <input
                            type="text"
                            value={formData.cost || ''}
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
                            className={`w-full pl-8 pr-3 py-2 border rounded-lg text-gray-900 font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${!formData.cost || formData.cost <= 0 ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                            placeholder="0.00"
                          />
                          {(!formData.cost || formData.cost <= 0) && (
                            <p className="text-xs text-red-500 mt-1">Required</p>
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">Unit Price</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                          <input
                            type="text"
                            value={formData.unit_price || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '' || val === '-') {
                                setFormData({ ...formData, unit_price: 0 });
                              } else {
                                const parsed = parseFloat(val);
                                if (!isNaN(parsed)) {
                                  setFormData({ ...formData, unit_price: parsed });
                                }
                              }
                            }}
                            onBlur={(e) => {
                              const parsed = parseFloat(e.target.value);
                              setFormData({ ...formData, unit_price: isNaN(parsed) ? 0 : parsed });
                            }}
                            className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-gray-900 font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Labor Fields */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">Labor Hours</label>
                        <input
                          type="text"
                          value={formData.labor_hours || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '' || val === '-') {
                              setFormData({ ...formData, labor_hours: 0 });
                            } else {
                              const parsed = parseFloat(val);
                              if (!isNaN(parsed)) {
                                setFormData({ ...formData, labor_hours: parsed });
                              }
                            }
                          }}
                          onBlur={(e) => {
                            const parsed = parseFloat(e.target.value);
                            setFormData({ ...formData, labor_hours: isNaN(parsed) ? 0 : parsed });
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="0.00"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">Labor Rate</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                          <input
                            type="text"
                            value={formData.labor_rate || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '' || val === '-') {
                                setFormData({ ...formData, labor_rate: 0 });
                              } else {
                                const parsed = parseFloat(val);
                                if (!isNaN(parsed)) {
                                  setFormData({ ...formData, labor_rate: parsed });
                                }
                              }
                            }}
                            onBlur={(e) => {
                              const parsed = parseFloat(e.target.value);
                              setFormData({ ...formData, labor_rate: isNaN(parsed) ? 0 : parsed });
                            }}
                            className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-gray-900 font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            placeholder="0.00"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">Labor Phase</label>
                        <select
                          value={formData.labor_phase_id}
                          onChange={(e) => {
                            const phaseId = e.target.value || '';
                            setFormData({ ...formData, labor_phase_id: phaseId });
                            if (phaseId) {
                              const phase = laborPhases.find(p => p.id === phaseId);
                              if (phase?.default_price) {
                                setFormData(prev => ({ ...prev, labor_phase_id: phaseId, labor_rate: phase.default_price! }));
                              }
                            }
                          }}
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

                {pendingAccessories.length > 0 && (
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
                      {pendingAccessories.map((accessory) => (
                        <div
                          key={accessory.tempId}
                          className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200"
                        >
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">{accessory.description}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              {accessory.quantity} {accessory.product.unit || 'ea'} x ${accessory.unit_price.toFixed(2)} = ${(accessory.quantity * accessory.unit_price).toFixed(2)}
                            </p>
                          </div>
                          <button
                            onClick={() => removePendingAccessory(accessory.tempId)}
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

                {pendingAccessories.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <Package className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">No accessories added yet</p>
                  </div>
                )}
              </div>

              {/* Master Catalog Details - Collapsible */}
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
                    </div>
                  )}
                </div>
              )}

              {/* Master Product Actions */}
              {selectedProduct?.id && !selectedProduct.id.toString().startsWith('null') && (
                <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <div className="flex items-start gap-2 mb-3">
                    <Package className="w-4 h-4 text-gray-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Linked to Master Catalog</p>
                      <p className="text-xs text-gray-600 mt-0.5">
                        This item is synced with the master catalog.
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
                    {canEditProducts && (
                      <button
                        type="button"
                        onClick={handleSaveToMaster}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
                      >
                        <Save size={16} />
                        Save to Master
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Area Selection */}
              <div className="border border-gray-200 rounded-lg p-5">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Add to Area (optional — leave unselected to add without an area)
                </label>

                {/* Create New Area */}
                <div className="mb-3 flex gap-2">
                  <input
                    type="text"
                    value={newAreaName}
                    onChange={(e) => setNewAreaName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newAreaName.trim()) {
                        handleCreateArea();
                      }
                    }}
                    placeholder="Create new area..."
                    className="flex-1 px-3 py-2 bg-white border border-gray-300 text-gray-900 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    onClick={handleCreateArea}
                    disabled={!newAreaName.trim() || creatingArea}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                  >
                    {creatingArea ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                  </button>
                </div>

                <div className="space-y-2 border border-gray-200 rounded-lg p-3 bg-gray-50">
                  {localRooms.map(room => {
                    const isSelected = selectedRooms.has(room.id);
                    const isActive = room.id === activeAreaId;

                    return (
                      <label
                        key={room.id}
                        className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-blue-50 border border-blue-300'
                            : 'hover:bg-white border border-transparent'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRoom(room.id)}
                          className="w-4 h-4 text-blue-600 rounded"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`font-medium ${isSelected ? 'text-blue-700' : 'text-gray-900'}`}>
                              {room.name}
                            </span>
                            {isActive && (
                              <span className="text-xs px-2 py-0.5 bg-blue-600 text-white rounded">
                                Active
                              </span>
                            )}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                  {localRooms.length === 0 && (
                    <div className="text-center py-4 text-gray-400 text-sm">
                      No areas yet. Create one above, or leave unselected to add the item without an area.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-5 sm:px-8 py-4 sm:py-5 bg-gray-50 rounded-b-none sm:rounded-b-2xl shrink-0">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div>
              {selectedProduct && (
                <div className="text-sm">
                  <span className="text-gray-500">Line Total: </span>
                  <span className="text-lg font-bold text-gray-900">
                    {formatCurrency(formData.is_customer_supplied ? 0 : lineTotal + laborTotal + accessoriesTotal)}
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-5 py-2.5 bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>

              {selectedProduct && (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Adding...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>
                        {selectedRooms.size === 0
                          ? 'Add (Unassigned)'
                          : `Add to ${selectedRooms.size} Area${selectedRooms.size !== 1 ? 's' : ''}`}
                      </span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {showNewProductForm && (
        <SinglePageProductForm
          allowOneOffItem={true}
          onSave={handleProductCreated}
          onClose={() => setShowNewProductForm(false)}
        />
      )}

      {showAccessorySelector && (
        <ProductSelector
          onSelect={addPendingAccessory}
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
