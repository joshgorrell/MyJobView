import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Package, Plus, Check, Loader2, Copy, ArrowLeft, Search } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency } from '../../lib/utils';
import { Product, ProposalRoom } from '../../lib/types';
import SinglePageProductForm from '../Products/SinglePageProductForm';
import ProductSelector from './ProductSelector';
import ProductDetailPanel, { type ProductDetailPanelData } from '../Products/ProductDetailPanel';
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
  upc?: string | null;
  inventory_type?: string | null;
  item_color?: string | null;
  item_size?: string | null;
  manufacturer_url?: string | null;
  supplier_url?: string | null;
  product_sheet_url?: string | null;
  install_video_url?: string | null;
  specifications?: string | null;
  msrp?: number | null;
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
  const [roomLineItems, setRoomLineItems] = useState<Record<string, { product_id: string | null }[]>>({});
  const [showNewProductForm, setShowNewProductForm] = useState(false);
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
    is_labor_item: false,
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
    const [prodsRes, phasesRes, classesRes, itemsRes] = await Promise.all([
      supabase.from('products').select('*').order('sku'),
      supabase.from('labor_phases').select('id, name, default_price').eq('is_active', true).order('sort_order'),
      supabase.from('proposal_classes').select('id, name, color').eq('is_active', true).order('name'),
      supabase.from('proposal_line_items').select('room_id, product_id').eq('proposal_id', proposalId).is('parent_item_id', null),
    ]);
    if (prodsRes.data) setProducts(prodsRes.data);
    if (phasesRes.data) setLaborPhases(phasesRes.data);
    if (classesRes.data) setClasses(classesRes.data);
    if (itemsRes.data) {
      const byRoom: Record<string, { product_id: string | null }[]> = {};
      for (const it of itemsRes.data as any[]) {
        const key = it.room_id || '_no_room';
        if (!byRoom[key]) byRoom[key] = [];
        byRoom[key].push({ product_id: it.product_id });
      }
      setRoomLineItems(byRoom);
    }
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
      is_labor_item: (product as any).item_type === 'labor',
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

  function handlePanelChange(field: keyof ProductDetailPanelData, value: any) {
    const fieldMap: Record<string, string> = {
      quantity: 'quantity',
      unit: 'unit',
      unitPrice: 'unit_price',
      cost: 'cost',
      laborHours: 'labor_hours',
      laborRate: 'labor_rate',
      laborPhaseId: 'labor_phase_id',
      classId: 'class_id',
      taskNotes: 'task_notes',
      showTaskNotes: 'show_task_notes',
      isTaxable: 'is_taxable',
      isHidden: 'is_hidden',
      isCustomerSupplied: 'is_customer_supplied',
      isLaborItem: 'is_labor_item',
      description: 'description',
    };
    const formKey = fieldMap[field];
    if (formKey) {
      setForm(f => ({ ...f, [formKey]: value }));
    }
    if (field === 'laborPhaseId' && value) {
      const ph = laborPhases.find(p => p.id === value);
      if (ph?.default_price) {
        setForm(f => ({ ...f, labor_rate: ph.default_price! }));
      }
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
      const effLaborHrs = form.labor_hours;
      const effLaborRate = form.labor_rate;
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
          item_type: form.is_labor_item ? 'labor' : (form.item_type || 'material'),
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
  const laborTotalCalc = (form.labor_hours || 0) * form.quantity * (form.labor_rate || 0);
  const totalRevenue = lineTotal + laborTotalCalc;
  const accessoriesTotal = pendingAccessories.reduce((s, a) => s + a.quantity * a.unit_price, 0);

  // Build panelData for ProductDetailPanel
  const panelData: ProductDetailPanelData | null = selectedProduct ? {
    productId: selectedProduct.id ?? null,
    productName: selectedProduct.name || '',
    sku: selectedProduct.sku || masterProduct?.sku || null,
    upc: (selectedProduct as any).upc ?? masterProduct?.upc ?? null,
    category: masterProduct?.category?.name || (selectedProduct as any).category || null,
    subcategory: masterProduct?.subcategory?.name || null,
    inventoryType: masterProduct?.inventory_type ?? (selectedProduct as any).inventory_type ?? null,
    itemColor: masterProduct?.item_color ?? (selectedProduct as any).item_color ?? null,
    itemSize: masterProduct?.item_size ?? (selectedProduct as any).item_size ?? null,
    manufacturerName: masterProduct?.manufacturer?.name || null,
    imageUrl: (selectedProduct as any).image_url || masterProduct?.image_url || null,
    manufacturerUrl: masterProduct?.manufacturer_url ?? null,
    supplierUrl: masterProduct?.supplier_url ?? null,
    productSheetUrl: masterProduct?.product_sheet_url ?? null,
    installVideoUrl: masterProduct?.install_video_url ?? null,
    description: form.description || null,
    specifications: masterProduct?.specifications ?? null,
    unitPrice: form.unit_price,
    cost: form.cost,
    msrp: masterProduct?.msrp ? Number(masterProduct.msrp) : null,
    quantity: form.quantity,
    unit: form.unit,
    laborHours: form.labor_hours,
    laborRate: form.labor_rate,
    laborPhaseId: form.labor_phase_id || null,
    laborPhaseName: masterProduct?.labor_phase?.name || null,
    classId: form.class_id || null,
    taskNotes: form.task_notes,
    showTaskNotes: form.show_task_notes,
    isTaxable: form.is_taxable,
    isHidden: form.is_hidden,
    isCustomerSupplied: form.is_customer_supplied,
    isLaborItem: form.is_labor_item,
  } : null;

  const modal = (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl flex flex-col" style={{ maxHeight: '92vh' }}>

        {/* Header */}
        <div className="px-5 py-3.5 border-b border-gray-200 flex items-center justify-between shrink-0">
          <div className="min-w-0 flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
              <Package className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 leading-tight">Add Item to Proposal</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {selectedProduct ? 'Configure item details and pricing' : 'Search for a product or create a new one'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Step 1: Product Selection */}
          {!selectedProduct ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Search Products</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search by name, SKU, or description..."
                    className="w-full pl-10 pr-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    autoFocus
                  />
                </div>
              </div>

              <button
                onClick={() => setShowNewProductForm(true)}
                className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center justify-center gap-2 font-medium text-sm transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />Create New Product
              </button>

              <div className="border border-gray-200 rounded-lg max-h-96 overflow-y-auto bg-white">
                {loading ? (
                  <div className="p-8 text-center text-gray-400 text-sm">Loading products...</div>
                ) : filteredProducts.length === 0 ? (
                  <div className="p-8 text-center text-gray-400 text-sm">
                    {searchQuery ? 'No products match your search' : 'No products available'}
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {filteredProducts.map(product => (
                      <button
                        key={product.id}
                        onClick={() => handleProductSelect(product)}
                        className="w-full p-3 text-left hover:bg-blue-50 transition-colors flex items-start gap-3"
                      >
                        <Package className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900 text-sm">{product.name}</div>
                          {product.sku && <div className="text-xs text-gray-500 mt-0.5 font-mono">SKU: {product.sku}</div>}
                          {product.description && <div className="text-xs text-gray-500 mt-1 line-clamp-2">{product.description}</div>}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-gray-900 font-medium text-sm">
                            ${(product.unit_price || (product as any).our_price || 0).toFixed(2)}
                          </div>
                          <div className="text-xs text-gray-400">per {product.unit || 'ea'}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Back to search */}
              <button
                onClick={() => { setSelectedProduct(null); setMasterProduct(null); setPendingAccessories([]); }}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 font-medium transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />Back to Search
              </button>

              {/* Product Detail Panel — same component as Edit Item Details */}
              {panelData && (
                <ProductDetailPanel
                  mode="edit"
                  data={panelData}
                  laborPhases={laborPhases}
                  classes={classes}
                  onChange={handlePanelChange}
                />
              )}

              {/* Customer Supplied Banner */}
              {form.is_customer_supplied && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <Package className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <p className="text-xs text-amber-700 font-medium">
                    Customer Supplied — material cost is set to $0 and excluded from totals. Labor and accessories are still billed.
                  </p>
                </div>
              )}

              {/* Accessories Section */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Accessories &amp; Add-ons</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Items nested under this product</p>
                  </div>
                  <button
                    onClick={() => setShowAccessorySelector(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs text-white font-medium transition-colors"
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
                                : 'bg-gray-100 text-gray-500 hover:text-gray-700 hover:bg-gray-200 border border-gray-200'
                            }`}>
                            {mode}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-gray-400 mb-3">
                        {form.display_mode === 'itemized' && 'Show all items as separate line items'}
                        {form.display_mode === 'bundle' && 'Show only parent item with total including accessories'}
                        {form.display_mode === 'collapsed' && 'Show parent with text summary of accessories'}
                      </p>
                      <div className="space-y-1.5">
                        {pendingAccessories.map(acc => (
                          <div key={acc.tempId} className="flex items-center gap-3 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                            <Package className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-900 truncate">{acc.description}</p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {acc.quantity} {acc.product.unit || 'ea'} × {formatCurrency(acc.unit_price)} = {formatCurrency(acc.quantity * acc.unit_price)}
                              </p>
                            </div>
                            <button onClick={() => removePendingAccessory(acc.tempId)}
                              className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors shrink-0">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-6 text-gray-400">
                      <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="text-xs">No accessories added yet</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Area Selection */}
              <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                  <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                    <Copy className="w-4 h-4 text-gray-400" />Add to Areas
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
                      className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <button onClick={handleCreateArea} disabled={!newAreaName.trim() || creatingArea}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg text-white transition-colors">
                      {creatingArea ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Area list */}
                  <div className="space-y-1 max-h-36 overflow-y-auto bg-gray-50 border border-gray-200 rounded-lg p-2">
                    {localRooms.map(room => {
                      const isSelected = selectedRooms.has(room.id);
                      const isActive = room.id === activeAreaId;
                      const existingItems = roomLineItems[room.id];
                      const isDuplicate = existingItems && selectedProduct && !String(selectedProduct.id).startsWith('null') &&
                        existingItems.some(it => it.product_id === selectedProduct.id);
                      return (
                        <label key={room.id}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-100'}`}>
                          <input type="checkbox" checked={isSelected}
                            onChange={() => toggleRoom(room.id)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500/30" />
                          <span className="text-xs text-gray-700 flex-1">{room.name}</span>
                          {isDuplicate && (
                            <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-medium">Already in area</span>
                          )}
                          {isActive && (
                            <span className="text-xs px-1.5 py-0.5 bg-blue-600 text-white rounded">Active</span>
                          )}
                        </label>
                      );
                    })}
                    {localRooms.length === 0 && (
                      <div className="text-center py-3 text-gray-400 text-xs">
                        No areas yet. Create one above, or leave unselected to add without an area.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-4">
            {selectedProduct && (
              <div>
                <div className="text-xs text-gray-500 uppercase tracking-wide">Line Total</div>
                <div className="text-xl font-bold text-gray-900">
                  {formatCurrency((form.is_customer_supplied ? laborTotalCalc : totalRevenue) + accessoriesTotal)}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-gray-700 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            {selectedProduct && (
              <button
                onClick={handleSave}
                disabled={saving || saved}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-sm ${
                  saved ? 'bg-green-600 text-white'
                    : saving ? 'bg-blue-400 text-white cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {saved ? <><Check className="w-3.5 h-3.5" />Added</> : saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Adding...</> : <>
                  <Plus className="w-3.5 h-3.5" />
                  {selectedRooms.size === 0 ? 'Add Item' : `Add to ${selectedRooms.size} Area${selectedRooms.size !== 1 ? 's' : ''}`}
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
