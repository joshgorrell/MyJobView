import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Package, Save, Loader2, Check, Image as ImageIcon, Tag, Wrench, ChevronRight, ExternalLink, RefreshCw, Plus, Copy, ChevronDown, ChevronUp, ArrowLeft, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency } from '../../lib/utils';
import { Product, ProposalRoom } from '../../lib/types';
import SinglePageProductForm from '../Products/SinglePageProductForm';
import ProductSelector from './ProductSelector';
import ConfirmModal from '../ui/ConfirmModal';

interface AddItemToAreasModalProps {
  proposalId: string;
  rooms: ProposalRoom[];
  activeAreaId?: string;
  onClose: () => void;
  onItemsAdded: () => void;
  onRoomsUpdate?: (rooms: ProposalRoom[]) => void;
}

interface MasterProductFull extends Product {
  manufacturer?: { name: string } | null;
  vendor?: { vendor_name: string } | null;
  category?: { name: string } | null;
  subcategory?: { name: string } | null;
  labor_phase?: { name: string; default_price: number | null } | null;
  sales_description?: string | null;
}

interface ProposalClass {
  id: string;
  name: string;
  color: string;
}

interface LaborPhaseOpt {
  id: string;
  name: string;
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
  onRoomsUpdate,
}: AddItemToAreasModalProps) {
  const { profile } = useAuth();
  const canEditProducts = profile?.can_edit_products ?? false;

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [masterProduct, setMasterProduct] = useState<MasterProductFull | null>(null);
  const [laborPhases, setLaborPhases] = useState<LaborPhaseOpt[]>([]);
  const [classes, setClasses] = useState<ProposalClass[]>([]);
  const [localRooms, setLocalRooms] = useState<ProposalRoom[]>(initialRooms);
  const [selectedRooms, setSelectedRooms] = useState<Set<string>>(new Set(activeAreaId ? [activeAreaId] : []));
  const [newAreaName, setNewAreaName] = useState('');
  const [creatingArea, setCreatingArea] = useState(false);
  const [showNewProductForm, setShowNewProductForm] = useState(false);
  const [showMasterDetails, setShowMasterDetails] = useState(false);
  const [showNewClassForm, setShowNewClassForm] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassColor, setNewClassColor] = useState('#3B82F6');
  const [pendingAccessories, setPendingAccessories] = useState<PendingAccessory[]>([]);
  const [showAccessorySelector, setShowAccessorySelector] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  const [form, setForm] = useState({
    description: '',
    quantity: 1,
    unit: 'ea',
    unit_price: 0,
    cost: 0,
    class_id: '',
    labor_hours: 0,
    labor_rate: 0,
    labor_phase_id: '',
    item_type: 'material' as 'material' | 'labor' | 'other',
    task_notes: '',
    show_task_notes: false,
    is_taxable: true,
    is_hidden: false,
    is_customer_supplied: false,
    display_mode: 'itemized' as 'itemized' | 'bundle' | 'collapsed',
  });

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (selectedProduct?.id && !String(selectedProduct.id).startsWith('null')) {
      loadMasterProduct(selectedProduct.id);
    } else {
      setMasterProduct(null);
    }
  }, [selectedProduct]);

  async function loadAll() {
    const [prodsRes, phasesRes, classesRes] = await Promise.all([
      supabase.from('products').select('*').order('sku'),
      supabase.from('labor_phases').select('id, name, default_price').eq('is_active', true).order('sort_order'),
      supabase.from('proposal_classes').select('id, name, color').eq('is_active', true).order('name'),
    ]);
    if (prodsRes.data) setProducts(prodsRes.data);
    if (phasesRes.data) setLaborPhases(phasesRes.data);
    if (classesRes.data) setClasses(classesRes.data);
    setLoading(false);
  }

  async function loadMasterProduct(productId: string) {
    const { data } = await supabase
      .from('products')
      .select(`
        id, sku, name, description, unit, unit_price, cost, our_price,
        default_labor_hours, image_url, product_link, manufacturer_model_number,
        item_type, is_taxable, labor_phase_id, class_id, sales_description,
        manufacturer:manufacturers(name),
        vendor:vendors(vendor_name),
        category:product_categories(name),
        subcategory:product_subcategories(name),
        labor_phase:labor_phases(name, default_price)
      `)
      .eq('id', productId)
      .maybeSingle();
    if (data) setMasterProduct(data as MasterProductFull);
  }

  const filteredProducts = products.filter(p => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.sku?.toLowerCase().includes(q) ||
      p.name?.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q) ||
      (p as any).category?.toLowerCase().includes(q)
    );
  });

  function handleProductSelect(product: Product) {
    setSelectedProduct(product);
    const basePrice = product.unit_price || (product as any).our_price || 0;
    const phase = product.labor_phase_id
      ? laborPhases.find(p => p.id === product.labor_phase_id)
      : null;

    setForm({
      description: product.description || product.name,
      quantity: 1,
      unit: product.unit || 'ea',
      unit_price: basePrice,
      cost: product.cost || 0,
      class_id: (product as any).class_id || '',
      labor_hours: product.default_labor_hours || 0,
      labor_rate: phase?.default_price || 0,
      labor_phase_id: product.labor_phase_id || '',
      item_type: ((product as any).item_type || 'material') as 'material' | 'labor' | 'other',
      task_notes: '',
      show_task_notes: false,
      is_taxable: product.is_taxable !== undefined ? product.is_taxable : true,
      is_hidden: false,
      is_customer_supplied: false,
      display_mode: 'itemized',
    });
    setPendingAccessories([]);
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
        oneOffData: productData,
      } as any;
      handleProductSelect(tempProduct);
    } else {
      await loadAll();
      if (productData?.id) {
        const product = products.find(p => p.id === productData.id);
        if (product) handleProductSelect(product);
      }
    }
  }

  function toggleRoom(roomId: string) {
    const next = new Set(selectedRooms);
    if (next.has(roomId)) next.delete(roomId);
    else next.add(roomId);
    setSelectedRooms(next);
  }

  async function handleCreateArea() {
    if (!newAreaName.trim()) return;
    setCreatingArea(true);
    try {
      const { data: prop } = await supabase.from('proposals').select('organization_id').eq('id', proposalId).single();
      const { data, error } = await supabase
        .from('proposal_rooms')
        .insert({ proposal_id: proposalId, organization_id: prop?.organization_id, name: newAreaName.trim(), sort_order: localRooms.length })
        .select()
        .single();
      if (error) throw error;
      const updated = [...localRooms, data as ProposalRoom];
      setLocalRooms(updated);
      if (onRoomsUpdate) onRoomsUpdate(updated);
      setSelectedRooms(prev => new Set([...prev, data.id]));
      setNewAreaName('');
    } catch (err: any) {
      alert('Failed to create area: ' + err.message);
    } finally {
      setCreatingArea(false);
    }
  }

  async function createNewClass() {
    if (!newClassName.trim()) return;
    const { data, error } = await supabase
      .from('proposal_classes')
      .insert({ name: newClassName.trim(), color: newClassColor, sort_order: classes.length, is_active: true })
      .select('id, name, color')
      .single();
    if (!error && data) {
      setClasses(prev => [...prev, data]);
      setForm(f => ({ ...f, class_id: data.id }));
      setShowNewClassForm(false);
      setNewClassName('');
      setNewClassColor('#3B82F6');
    }
  }

  function updateFromMaster() {
    if (!masterProduct) return;
    setForm(f => ({
      ...f,
      description: masterProduct.name || f.description,
      unit: masterProduct.unit || f.unit,
      unit_price: masterProduct.unit_price || f.unit_price,
      cost: masterProduct.cost ?? f.cost,
      class_id: (masterProduct as any).class_id ?? f.class_id,
      labor_hours: masterProduct.default_labor_hours ?? f.labor_hours,
      item_type: (masterProduct as any).item_type || f.item_type,
      labor_phase_id: masterProduct.labor_phase_id ?? f.labor_phase_id,
      is_taxable: masterProduct.is_taxable !== undefined ? masterProduct.is_taxable : f.is_taxable,
    }));
    if (masterProduct.labor_phase_id) {
      const phase = laborPhases.find(p => p.id === masterProduct.labor_phase_id);
      if (phase?.default_price) {
        setForm(f => ({ ...f, labor_rate: phase.default_price! }));
      }
    }
  }

  function addPendingAccessory(product: Product) {
    const acc: PendingAccessory = {
      tempId: `pending-${Date.now()}-${Math.random()}`,
      product,
      quantity: 1,
      unit_price: product.unit_price || (product as any).our_price || 0,
      cost: product.cost || 0,
      description: product.description || product.name,
    };
    setPendingAccessories(prev => [...prev, acc]);
    setShowAccessorySelector(false);
  }

  function removePendingAccessory(tempId: string) {
    setConfirmModal({
      title: 'Remove Accessory',
      message: 'Remove this accessory from the item?',
      onConfirm: () => {
        setPendingAccessories(prev => prev.filter(a => a.tempId !== tempId));
        setConfirmModal(null);
      },
    });
  }

  async function handleSaveToMaster() {
    if (!selectedProduct?.id || !canEditProducts) return;
    const { error } = await supabase
      .from('products')
      .update({
        name: form.description,
        unit: form.unit,
        unit_price: form.unit_price,
        cost: form.cost,
        class_id: form.class_id || null,
        default_labor_hours: form.labor_hours || null,
        labor_phase_id: form.labor_phase_id || null,
        is_taxable: form.is_taxable,
      })
      .eq('id', selectedProduct.id);
    if (error) {
      alert('Failed to save to master: ' + error.message);
    } else {
      alert('Product master catalog updated successfully.');
    }
  }

  async function handleSave() {
    if (!selectedProduct) { alert('Please select a product'); return; }
    if (!form.is_customer_supplied && (!form.cost || form.cost <= 0)) {
      alert('Cost is required. Please enter a unit cost greater than $0 before saving.');
      return;
    }
    setSaving(true);
    try {
      const isOneOff = !selectedProduct.id || String(selectedProduct.id).startsWith('null');
      const effPrice = form.is_customer_supplied ? 0 : form.unit_price;
      const effCost = form.is_customer_supplied ? 0 : form.cost;
      const effLaborHrs = form.is_customer_supplied ? 0 : form.labor_hours;
      const effLaborRate = form.is_customer_supplied ? 0 : form.labor_rate;
      const laborTotalVal = effLaborHrs * form.quantity * effLaborRate;
      const effLineTotal = form.is_customer_supplied ? 0 : form.quantity * form.unit_price;
      const roomIds = selectedRooms.size === 0 ? [null] : Array.from(selectedRooms);

      for (const roomId of roomIds) {
        const mainItem: any = {
          proposal_id: proposalId,
          room_id: roomId,
          description: form.description,
          quantity: form.quantity,
          unit: form.unit,
          unit_price: effPrice,
          cost: effCost,
          line_total: effLineTotal,
          class_id: form.class_id || null,
          labor_phase_id: form.labor_phase_id || null,
          labor_hours: effLaborHrs || null,
          labor_rate: effLaborRate || null,
          labor_total: laborTotalVal || null,
          item_type: form.item_type || null,
          task_notes: form.task_notes || null,
          show_task_notes: form.show_task_notes,
          is_taxable: form.is_taxable,
          is_hidden: form.is_hidden,
          is_customer_supplied: form.is_customer_supplied,
          is_custom: false,
          display_mode: pendingAccessories.length > 0 ? form.display_mode : null,
          sort_order: 9999,
        };
        if (isOneOff) {
          mainItem.product_id = null;
          mainItem.item_name = selectedProduct.name || (selectedProduct as any).manufacturer_model_number;
        } else {
          mainItem.product_id = selectedProduct.id;
        }
        const { data: inserted, error } = await supabase.from('proposal_line_items').insert(mainItem).select().single();
        if (error) throw error;
        if (pendingAccessories.length > 0 && inserted) {
          const accItems = pendingAccessories.map((a, i) => ({
            proposal_id: proposalId,
            room_id: roomId,
            product_id: a.product.id,
            parent_item_id: inserted.id,
            description: a.description,
            quantity: a.quantity,
            unit: a.product.unit || 'each',
            unit_price: a.unit_price,
            cost: a.cost,
            line_total: a.quantity * a.unit_price,
            sort_order: 10000 + i,
            is_custom: false,
          }));
          const { error: accErr } = await supabase.from('proposal_line_items').insert(accItems);
          if (accErr) throw accErr;
        }
      }
      setSaved(true);
      setSaving(false);
      setTimeout(() => { onItemsAdded(); }, 600);
    } catch (err: any) {
      setSaving(false);
      alert('Failed to add items: ' + err.message);
    }
  }

  // Live financials
  const lineTotal = form.is_customer_supplied ? 0 : form.quantity * form.unit_price;
  const laborTotalCalc = form.is_customer_supplied ? 0 : (form.labor_hours || 0) * form.quantity * (form.labor_rate || 0);
  const totalRevenue = lineTotal + laborTotalCalc;
  const totalCost = form.is_customer_supplied ? 0 : form.cost * form.quantity;
  const profit = totalRevenue - totalCost;
  const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
  const accessoriesTotal = pendingAccessories.reduce((s, a) => s + a.quantity * a.unit_price, 0);
  const currentImageUrl = (selectedProduct as any)?.image_url || masterProduct?.image_url || null;

  const modal = (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center shrink-0">
              <Package className="w-4 h-4 text-gray-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white leading-tight">Add Item to Proposal</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {selectedProduct ? 'Configure item details and pricing' : 'Search for a product or create a new one'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-6">
            {/* Step 1: Product Selection */}
            {!selectedProduct ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">Search Products</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search by name, SKU, or description..."
                      className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
                      autoFocus
                    />
                  </div>
                </div>

                <button
                  onClick={() => setShowNewProductForm(true)}
                  className="w-full px-4 py-3 bg-blue-700 hover:bg-blue-600 text-white rounded-lg flex items-center justify-center gap-2 font-medium text-sm transition-colors"
                >
                  <Plus className="w-5 h-5" />Create New Product
                </button>

                <div className="border border-gray-700/50 rounded-xl max-h-96 overflow-y-auto">
                  {loading ? (
                    <div className="p-8 text-center text-gray-500 text-sm">Loading products...</div>
                  ) : filteredProducts.length === 0 ? (
                    <div className="p-8 text-center text-gray-500 text-sm">
                      {searchQuery ? 'No products match your search' : 'No products available'}
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-800">
                      {filteredProducts.map(product => (
                        <button
                          key={product.id}
                          onClick={() => handleProductSelect(product)}
                          className="w-full p-4 text-left hover:bg-gray-800 transition-colors flex items-start gap-3"
                        >
                          <Package className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-white text-sm">{product.name}</div>
                            {product.sku && <div className="text-xs text-gray-500 mt-0.5 font-mono">SKU: {product.sku}</div>}
                            {product.description && <div className="text-xs text-gray-400 mt-1 line-clamp-2">{product.description}</div>}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className="text-white font-medium text-sm">
                              ${(product.unit_price || (product as any).our_price || 0).toFixed(2)}
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
                {/* Two-column main layout */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">

                  {/* Left — Image + Catalog Info */}
                  <div className="space-y-4">
                    {/* Product Image */}
                    <div className="relative group rounded-xl overflow-hidden border border-gray-700 bg-gray-800 aspect-square flex items-center justify-center">
                      {currentImageUrl ? (
                        <img
                          src={currentImageUrl}
                          alt={form.description}
                          className="w-full h-full object-contain p-2"
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-2 text-gray-600">
                          <ImageIcon className="w-10 h-10" />
                          <span className="text-xs">No image</span>
                        </div>
                      )}
                    </div>

                    {/* Catalog meta */}
                    <div className="bg-gray-800/60 rounded-xl border border-gray-700/50 p-3.5 space-y-2">
                      <div className="font-medium text-white text-sm">{selectedProduct.name}</div>
                      {(selectedProduct.sku || masterProduct?.sku) && (
                        <div className="flex justify-between gap-2">
                          <span className="text-xs text-gray-500 shrink-0">SKU</span>
                          <span className="text-xs text-gray-300 font-mono text-right">{selectedProduct.sku || masterProduct?.sku}</span>
                        </div>
                      )}
                      {masterProduct?.manufacturer?.name && (
                        <div className="flex justify-between gap-2">
                          <span className="text-xs text-gray-500 shrink-0">Mfr</span>
                          <span className="text-xs text-gray-300 text-right">{masterProduct.manufacturer.name}</span>
                        </div>
                      )}
                      {(masterProduct?.manufacturer_model_number || (selectedProduct as any)?.manufacturer_model_number) && (
                        <div className="flex justify-between gap-2">
                          <span className="text-xs text-gray-500 shrink-0">Model</span>
                          <span className="text-xs text-gray-300 font-mono text-right">{masterProduct?.manufacturer_model_number || (selectedProduct as any)?.manufacturer_model_number}</span>
                        </div>
                      )}
                      {masterProduct?.category?.name && (
                        <div className="flex justify-between gap-2">
                          <span className="text-xs text-gray-500 shrink-0">Cat</span>
                          <span className="text-xs text-gray-300 text-right flex items-center gap-1">
                            {masterProduct.category.name}
                            {masterProduct.subcategory?.name && (
                              <><ChevronRight className="w-3 h-3 text-gray-600" />{masterProduct.subcategory.name}</>
                            )}
                          </span>
                        </div>
                      )}
                      {masterProduct?.vendor?.vendor_name && (
                        <div className="flex justify-between gap-2">
                          <span className="text-xs text-gray-500 shrink-0">Vendor</span>
                          <span className="text-xs text-gray-300 text-right">{masterProduct.vendor.vendor_name}</span>
                        </div>
                      )}
                      {masterProduct?.sales_description && (
                        <div className="pt-2 border-t border-gray-700/40">
                          <span className="text-xs text-gray-500 block mb-1">Sales Description</span>
                          <span className="text-xs text-gray-400">{masterProduct.sales_description}</span>
                        </div>
                      )}
                      {masterProduct?.product_link && (
                        <a href={masterProduct.product_link} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors mt-1">
                          <ExternalLink className="w-3 h-3" />Product Link
                        </a>
                      )}
                      {!masterProduct && (
                        <p className="text-xs text-gray-600 italic">Custom item</p>
                      )}
                    </div>

                    {/* Back to search */}
                    <button
                      onClick={() => { setSelectedProduct(null); setMasterProduct(null); setPendingAccessories([]); }}
                      className="w-full px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-xs text-gray-400 font-medium flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />Back to Search
                    </button>
                  </div>

                  {/* Right — Form Fields */}
                  <div className="lg:col-span-3 space-y-4">
                    {/* Description */}
                    <Field label="Description">
                      <input
                        type="text"
                        value={form.description}
                        onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
                        placeholder="Product description"
                      />
                    </Field>

                    {/* Customer Supplied Banner */}
                    {form.is_customer_supplied && (
                      <div className="flex items-center gap-2 p-3 bg-amber-900/20 border border-amber-700/50 rounded-lg">
                        <Package className="w-5 h-5 text-amber-400 flex-shrink-0" />
                        <p className="text-sm text-amber-300 font-medium">
                          This item is marked Customer Supplied — pricing is set to $0 and excluded from all totals.
                        </p>
                      </div>
                    )}

                    {/* Qty + Unit + Cost + Price */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <Field label="Quantity">
                        <input type="number" value={form.quantity}
                          onChange={e => setForm(f => ({ ...f, quantity: parseFloat(e.target.value) || 0 }))}
                          className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                          min="0" step="0.01" />
                      </Field>
                      <Field label="Unit">
                        <input type="text" value={form.unit}
                          onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                          className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                          placeholder="ea" />
                      </Field>
                      <Field label={form.is_customer_supplied ? "Cost" : "Cost *"}>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                          <input type="number" value={form.is_customer_supplied ? 0 : (form.cost || '')}
                            disabled={form.is_customer_supplied}
                            onChange={e => setForm(f => ({ ...f, cost: parseFloat(e.target.value) || 0 }))}
                            className={`w-full pl-7 pr-3 py-2 bg-gray-800 border rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 ${form.is_customer_supplied ? 'border-gray-700 bg-gray-900 text-gray-600 cursor-not-allowed' : (!form.cost || form.cost <= 0 ? 'border-red-500' : 'border-gray-600')}`}
                            min="0" step="0.01" placeholder="0.00" />
                          {!form.is_customer_supplied && (!form.cost || form.cost <= 0) && (
                            <p className="text-xs text-red-400 mt-1">Required</p>
                          )}
                        </div>
                      </Field>
                      <Field label="Sale Price">
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                          <input type="number" value={form.is_customer_supplied ? 0 : form.unit_price}
                            disabled={form.is_customer_supplied}
                            onChange={e => setForm(f => ({ ...f, unit_price: parseFloat(e.target.value) || 0 }))}
                            className={`w-full pl-7 pr-3 py-2 bg-gray-800 border rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 ${form.is_customer_supplied ? 'border-gray-700 bg-gray-900 text-gray-600 cursor-not-allowed' : 'border-blue-500/50 focus:ring-1 focus:ring-blue-500/30'}`}
                            min="0" step="0.01" />
                        </div>
                      </Field>
                    </div>

                    {/* Labor row */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <Field label="Labor Hours">
                        <input type="number" value={form.is_customer_supplied ? 0 : form.labor_hours}
                          disabled={form.is_customer_supplied}
                          onChange={e => setForm(f => ({ ...f, labor_hours: parseFloat(e.target.value) || 0 }))}
                          className={`w-full px-3 py-2 bg-gray-800 border rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 ${form.is_customer_supplied ? 'border-gray-700 bg-gray-900 text-gray-600 cursor-not-allowed' : 'border-gray-600'}`}
                          min="0" step="0.25" />
                      </Field>
                      <Field label="Labor Rate">
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                          <input type="number" value={form.is_customer_supplied ? 0 : form.labor_rate}
                            disabled={form.is_customer_supplied}
                            onChange={e => setForm(f => ({ ...f, labor_rate: parseFloat(e.target.value) || 0 }))}
                            className={`w-full pl-7 pr-3 py-2 bg-gray-800 border rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 ${form.is_customer_supplied ? 'border-gray-700 bg-gray-900 text-gray-600 cursor-not-allowed' : 'border-gray-600'}`}
                            min="0" step="0.01" />
                        </div>
                      </Field>
                      <Field label="Labor Phase">
                        <select value={form.labor_phase_id}
                          onChange={e => {
                            const pid = e.target.value || '';
                            setForm(f => ({ ...f, labor_phase_id: pid }));
                            if (pid) {
                              const ph = laborPhases.find(p => p.id === pid);
                              if (ph?.default_price) setForm(f => ({ ...f, labor_phase_id: pid, labor_rate: ph.default_price! }));
                            }
                          }}
                          className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 appearance-none cursor-pointer">
                          <option value="">No Phase</option>
                          {laborPhases.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </Field>
                    </div>

                    {/* Financial Summary Bar */}
                    <div className="grid grid-cols-4 gap-0 bg-gray-800/80 border border-gray-700/50 rounded-xl overflow-hidden">
                      <FinStat label="Material" value={formatCurrency(lineTotal)} />
                      <FinStat label="Labor" value={formatCurrency(laborTotalCalc)} />
                      <FinStat label="Profit" value={formatCurrency(profit)} positive={profit >= 0} />
                      <FinStat label="Margin" value={`${margin.toFixed(1)}%`} positive={margin >= 0} />
                    </div>

                    {/* Item Type + Class row */}
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Item Type">
                        <select value={form.item_type}
                          onChange={e => setForm(f => ({ ...f, item_type: e.target.value as 'material' | 'labor' | 'other' }))}
                          className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 appearance-none cursor-pointer">
                          <option value="material">Material</option>
                          <option value="labor">Labor</option>
                          <option value="other">Other</option>
                        </select>
                      </Field>
                      <Field label="Class">
                        {!showNewClassForm ? (
                          <div className="flex gap-2">
                            <select value={form.class_id}
                              onChange={e => setForm(f => ({ ...f, class_id: e.target.value }))}
                              className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 appearance-none cursor-pointer">
                              <option value="">No Class</option>
                              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <button onClick={() => setShowNewClassForm(true)}
                              className="px-2 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-gray-300 transition-colors" title="Create new class">
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-2 p-2.5 bg-gray-800/80 border border-gray-600 rounded-lg">
                            <input type="text" value={newClassName} onChange={e => setNewClassName(e.target.value)}
                              placeholder="Class name"
                              className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-xs focus:outline-none focus:border-blue-500" autoFocus />
                            <div className="flex items-center gap-2">
                              <input type="color" value={newClassColor} onChange={e => setNewClassColor(e.target.value)}
                                className="w-10 h-7 border border-gray-600 rounded cursor-pointer bg-transparent" />
                              <button onClick={createNewClass} disabled={!newClassName.trim()}
                                className="flex-1 px-2 py-1.5 bg-green-700 hover:bg-green-600 disabled:bg-gray-700 text-white rounded text-xs transition-colors">Create</button>
                              <button onClick={() => { setShowNewClassForm(false); setNewClassName(''); }}
                                className="px-2 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-xs transition-colors">Cancel</button>
                            </div>
                          </div>
                        )}
                      </Field>
                    </div>

                    {/* Task Notes */}
                    <Field label="Install Notes for Technicians">
                      <textarea value={form.task_notes}
                        onChange={e => setForm(f => ({ ...f, task_notes: e.target.value }))}
                        rows={2}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm resize-none focus:outline-none focus:border-blue-500"
                        placeholder="Special installation instructions..." />
                    </Field>

                    {/* Checkboxes row */}
                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input type="checkbox" checked={form.show_task_notes}
                          onChange={e => setForm(f => ({ ...f, show_task_notes: e.target.checked }))}
                          className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500/30" />
                        <span className="text-xs text-gray-400">Show notes on proposal</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input type="checkbox" checked={form.is_hidden}
                          onChange={e => setForm(f => ({ ...f, is_hidden: e.target.checked }))}
                          className="rounded border-gray-600 bg-gray-700 text-amber-500 focus:ring-amber-500/30" />
                        <span className="text-xs text-gray-400">Hide from customer</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer select-none opacity-60" title="Taxable is controlled by sales tax rules">
                        <input type="checkbox" checked={form.is_taxable} disabled
                          className="rounded border-gray-600 bg-gray-700 text-gray-500 cursor-not-allowed" />
                        <span className="text-xs text-gray-500">Taxable (auto)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input type="checkbox" checked={form.is_customer_supplied}
                          onChange={e => setForm(f => ({ ...f, is_customer_supplied: e.target.checked }))}
                          className="rounded border-gray-600 bg-gray-700 text-amber-500 focus:ring-amber-500/30" />
                        <span className="text-xs text-amber-400 font-medium">Customer Supplied</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Accessories Section */}
                <div className="border border-gray-700/50 rounded-xl overflow-hidden mb-4">
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-800/60">
                    <div>
                      <h3 className="text-sm font-semibold text-white">Accessories &amp; Add-ons</h3>
                      <p className="text-xs text-gray-500 mt-0.5">Items nested under this product</p>
                    </div>
                    <button
                      onClick={() => setShowAccessorySelector(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-600 rounded-lg text-xs text-white font-medium transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />Add Accessory
                    </button>
                  </div>

                  <div className="p-4">
                    {pendingAccessories.length > 0 ? (
                      <>
                        <div className="flex gap-1.5 mb-3">
                          {(['itemized', 'bundle', 'collapsed'] as const).map(mode => (
                            <button key={mode}
                              onClick={() => setForm(f => ({ ...f, display_mode: mode }))}
                              className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                                form.display_mode === mode
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 border border-gray-700'
                              }`}>
                              {mode}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-gray-600 mb-3">
                          {form.display_mode === 'itemized' && 'Show all items as separate line items'}
                          {form.display_mode === 'bundle' && 'Show only parent item with total including accessories'}
                          {form.display_mode === 'collapsed' && 'Show parent with text summary of accessories'}
                        </p>
                        <div className="space-y-1.5">
                          {pendingAccessories.map(acc => (
                            <div key={acc.tempId} className="flex items-center gap-3 px-3 py-2.5 bg-gray-800/60 border border-gray-700/40 rounded-lg">
                              <Package className="w-3.5 h-3.5 text-gray-600 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-white truncate">{acc.description}</p>
                                <p className="text-xs text-gray-500 mt-0.5">
                                  {acc.quantity} {acc.product.unit || 'ea'} × {formatCurrency(acc.unit_price)} = {formatCurrency(acc.quantity * acc.unit_price)}
                                </p>
                              </div>
                              <button onClick={() => removePendingAccessory(acc.tempId)}
                                className="p-1 text-gray-600 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors shrink-0">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-6 text-gray-600">
                        <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        <p className="text-xs">No accessories added yet</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Master Catalog Details (collapsible) */}
                {masterProduct && (
                  <div className="border border-gray-700/50 rounded-xl overflow-hidden mb-4">
                    <button
                      onClick={() => setShowMasterDetails(!showMasterDetails)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-gray-800/60 hover:bg-gray-800 transition-colors"
                    >
                      <span className="text-sm font-medium text-gray-300 flex items-center gap-2">
                        <Package className="w-4 h-4 text-gray-500" />Master Catalog Details
                      </span>
                      {showMasterDetails ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                    </button>
                    {showMasterDetails && (
                      <div className="px-4 py-4 space-y-3">
                        <div className="grid grid-cols-4 gap-3">
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Master Price</p>
                            <p className="text-sm font-bold text-white">{formatCurrency(Number((masterProduct as any).our_price || masterProduct.unit_price || 0))}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Master Cost</p>
                            <p className="text-sm font-bold text-white">{formatCurrency(Number(masterProduct.cost || 0))}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Master Margin</p>
                            <p className="text-sm font-bold text-white">
                              {(() => {
                                const c = Number(masterProduct.cost || 0);
                                const p = Number((masterProduct as any).our_price || masterProduct.unit_price || 0);
                                return p > 0 ? (((p - c) / p) * 100).toFixed(1) : '0.0';
                              })()}%
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Default Hrs</p>
                            <p className="text-sm font-bold text-white">{masterProduct.default_labor_hours || 0} hrs</p>
                          </div>
                        </div>
                        {(masterProduct as any).sales_description && (
                          <p className="text-xs text-gray-400">{(masterProduct as any).sales_description}</p>
                        )}
                        {masterProduct.product_link && (
                          <a href={masterProduct.product_link} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors">
                            <ExternalLink className="w-3 h-3" />View Product Page
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Master Product Actions */}
                {selectedProduct?.id && !String(selectedProduct.id).startsWith('null') && (
                  <div className="border border-gray-700/50 rounded-xl p-4 bg-gray-800/30 mb-4">
                    <div className="flex items-start gap-2 mb-3">
                      <Package className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-gray-300">Linked to Master Catalog</p>
                        <p className="text-xs text-gray-500 mt-0.5">This item is synced with the master catalog.</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={updateFromMaster} disabled={!masterProduct}
                        className="flex items-center justify-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 border border-gray-600 rounded-lg text-xs text-gray-300 transition-colors">
                        <RefreshCw className="w-3.5 h-3.5" />Update from Master
                      </button>
                      {canEditProducts && (
                        <button onClick={handleSaveToMaster}
                          className="flex items-center justify-center gap-2 px-3 py-2 bg-green-700 hover:bg-green-600 rounded-lg text-xs text-white font-medium transition-colors">
                          <Save className="w-3.5 h-3.5" />Save to Master
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Area Selection */}
                <div className="border border-gray-700/50 rounded-xl overflow-hidden mb-4 bg-gray-800/30">
                  <div className="flex items-center justify-between px-4 py-3">
                    <h3 className="text-sm font-medium text-gray-300 flex items-center gap-2">
                      <Copy className="w-4 h-4 text-gray-500" />Add to Areas
                    </h3>
                    {selectedRooms.size > 0 && (
                      <span className="bg-blue-600 text-white px-2 py-0.5 rounded-full text-xs font-medium">
                        {selectedRooms.size} selected
                      </span>
                    )}
                  </div>
                  <div className="px-4 pb-4 space-y-3">
                    {/* Create new area */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newAreaName}
                        onChange={e => setNewAreaName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && newAreaName.trim()) handleCreateArea(); }}
                        placeholder="Create new area..."
                        className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                      />
                      <button onClick={handleCreateArea} disabled={!newAreaName.trim() || creatingArea}
                        className="px-3 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-40 rounded-lg text-white transition-colors">
                        {creatingArea ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      </button>
                    </div>

                    {/* Area list */}
                    <div className="space-y-1 max-h-36 overflow-y-auto bg-gray-800/60 border border-gray-700/40 rounded-lg p-2">
                      {localRooms.map(room => {
                        const isSelected = selectedRooms.has(room.id);
                        const isActive = room.id === activeAreaId;
                        return (
                          <label key={room.id}
                            className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${isSelected ? 'bg-blue-900/30' : 'hover:bg-gray-700/40'}`}>
                            <input type="checkbox" checked={isSelected}
                              onChange={() => toggleRoom(room.id)}
                              className="rounded border-gray-600 bg-gray-700 text-blue-500" />
                            <span className="text-xs text-gray-300 flex-1">{room.name}</span>
                            {isActive && (
                              <span className="text-xs px-1.5 py-0.5 bg-blue-600 text-white rounded">Active</span>
                            )}
                          </label>
                        );
                      })}
                      {localRooms.length === 0 && (
                        <div className="text-center py-3 text-gray-600 text-xs">
                          No areas yet. Create one above, or leave unselected to add without an area.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700/60 space-y-2.5 shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={onClose}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors">
              Cancel
            </button>
            {selectedProduct && (
              <div className="text-sm flex-1 text-right">
                <span className="text-gray-500">Line Total: </span>
                <span className="text-lg font-bold text-white">
                  {formatCurrency(form.is_customer_supplied ? 0 : lineTotal + laborTotalCalc + accessoriesTotal)}
                </span>
              </div>
            )}
            {selectedProduct && (
              <button onClick={handleSave} disabled={saving || saved}
                className={`flex items-center justify-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                  saved ? 'bg-green-600 text-white'
                    : saving ? 'bg-blue-700 text-white cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-500 text-white'
                }`}>
                {saved ? <><Check className="w-4 h-4" />Added</> : saving ? <><Loader2 className="w-4 h-4 animate-spin" />Adding...</> : <>
                  <Plus className="w-4 h-4" />
                  {selectedRooms.size === 0 ? 'Add (Unassigned)' : `Add to ${selectedRooms.size} Area${selectedRooms.size !== 1 ? 's' : ''}`}
                </>}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Sub-modals */}
      {showNewProductForm && (
        <SinglePageProductForm allowOneOffItem={true} onSave={handleProductCreated} onClose={() => setShowNewProductForm(false)} />
      )}

      {showAccessorySelector && (
        <ProductSelector onSelect={addPendingAccessory} onClose={() => setShowAccessorySelector(false)} />
      )}

      <ConfirmModal
        isOpen={!!confirmModal}
        title={confirmModal?.title ?? ''}
        message={confirmModal?.message ?? ''}
        variant="danger"
        onConfirm={() => confirmModal?.onConfirm()}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );

  return createPortal(modal, document.body);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function FinStat({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  const isColored = positive !== undefined;
  return (
    <div className="px-4 py-3 border-r border-gray-700/40 last:border-r-0">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-sm font-bold tabular-nums ${isColored ? (positive ? 'text-green-400' : 'text-red-400') : 'text-white'}`}>
        {value}
      </p>
    </div>
  );
}
