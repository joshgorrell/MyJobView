import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Package, Save, Loader2, Check, Image as ImageIcon, Tag, Wrench, ChevronRight, ExternalLink, RefreshCw, Plus, Copy, Replace, ChevronDown, ChevronUp, CreditCard as Edit3 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency } from '../../lib/utils';
import { ProposalLineItem, Product, ProposalRoom } from '../../lib/types';
import ProductSelector from './ProductSelector';
import { ProductDetailModal } from '../Products/ProductDetailModal';
import ConfirmModal from '../ui/ConfirmModal';

interface ProposalLineItemModalProps {
  item: ProposalLineItem;
  proposalId: string;
  onSave: (updates: Partial<ProposalLineItem>) => void;
  onSaveToMaster?: (productId: string, updates: Partial<Product>) => void;
  onUpdateAllInstances?: (productId: string, updates: Partial<ProposalLineItem>) => void;
  onSubstituteProduct?: (oldProductId: string | null, newProduct: Product, replaceAll: boolean) => void;
  onClose: () => void;
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
}

export default function ProposalLineItemModal({
  item,
  proposalId,
  onSave,
  onSaveToMaster,
  onUpdateAllInstances,
  onSubstituteProduct,
  onClose,
}: ProposalLineItemModalProps) {
  const { profile } = useAuth();
  const canEditProducts = profile?.can_edit_products ?? false;

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [masterProduct, setMasterProduct] = useState<MasterProductFull | null>(null);
  const [laborPhases, setLaborPhases] = useState<LaborPhaseOpt[]>([]);
  const [classes, setClasses] = useState<ProposalClass[]>([]);
  const [instanceCount, setInstanceCount] = useState(0);
  const [rooms, setRooms] = useState<ProposalRoom[]>([]);
  const [accessories, setAccessories] = useState<ProposalLineItem[]>([]);
  const [imageUploading, setImageUploading] = useState(false);

  // UI toggles
  const [showProductSelector, setShowProductSelector] = useState(false);
  const [showAccessorySelector, setShowAccessorySelector] = useState(false);
  const [showProductDetailView, setShowProductDetailView] = useState(false);
  const [showSubstituteConfirmation, setShowSubstituteConfirmation] = useState(false);
  const [showMasterDetails, setShowMasterDetails] = useState(false);
  const [selectedReplacementProduct, setSelectedReplacementProduct] = useState<Product | null>(null);
  const [selectedAreasForCopy, setSelectedAreasForCopy] = useState<Set<string>>(new Set());
  const [copyingToAreas, setCopyingToAreas] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [showNewClassForm, setShowNewClassForm] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassColor, setNewClassColor] = useState('#3B82F6');

  // Form state
  const [form, setForm] = useState({
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    unit_price: item.unit_price,
    cost: item.cost ?? 0,
    class_id: item.class_id ?? '',
    labor_hours: item.labor_hours ?? 0,
    labor_rate: item.labor_rate ?? 0,
    item_type: item.item_type ?? 'material',
    task_notes: item.task_notes ?? '',
    show_task_notes: item.show_task_notes ?? false,
    labor_phase_id: item.labor_phase_id ?? '',
    is_taxable: item.is_taxable !== undefined ? item.is_taxable : true,
    is_hidden: item.is_hidden ?? false,
    is_customer_supplied: item.is_customer_supplied ?? false,
    display_mode: (item.display_mode ?? 'itemized') as 'itemized' | 'bundle' | 'collapsed',
    image_url: '',
  });
  const [isNested, setIsNested] = useState(!!item.parent_item_id);
  const [itemAbove, setItemAbove] = useState<ProposalLineItem | null>(null);
  const [canNest, setCanNest] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    const [phasesRes, classesRes, roomsRes] = await Promise.all([
      supabase.from('labor_phases').select('id, name').eq('is_active', true).order('sort_order'),
      supabase.from('proposal_classes').select('id, name, color').eq('is_active', true).order('name'),
      supabase.from('proposal_rooms').select('*').eq('proposal_id', proposalId).order('sort_order'),
    ]);
    if (phasesRes.data) setLaborPhases(phasesRes.data);
    if (classesRes.data) setClasses(classesRes.data);
    if (roomsRes.data) setRooms(roomsRes.data);

    await Promise.all([
      loadAccessories(),
      findItemAbove(),
      item.product_id ? loadMasterProduct() : Promise.resolve(),
      item.product_id ? countProductInstances() : Promise.resolve(),
    ]);
  }

  async function loadMasterProduct() {
    if (!item.product_id) return;
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
      .eq('id', item.product_id)
      .maybeSingle();
    if (data) {
      setMasterProduct(data as MasterProductFull);
      setForm(f => ({ ...f, image_url: (data as MasterProductFull).image_url ?? '' }));
    }
  }

  async function countProductInstances() {
    if (!item.product_id) return;
    const { count } = await supabase
      .from('proposal_line_items')
      .select('*', { count: 'exact', head: true })
      .eq('proposal_id', proposalId)
      .eq('product_id', item.product_id);
    setInstanceCount(count ?? 0);
  }

  async function loadAccessories() {
    const { data } = await supabase
      .from('proposal_line_items')
      .select('*, products(*, manufacturers(id, name))')
      .eq('parent_item_id', item.id)
      .order('sort_order');
    setAccessories(data ?? []);
  }

  async function findItemAbove() {
    const { data: children } = await supabase
      .from('proposal_line_items').select('id').eq('parent_item_id', item.id).limit(1);
    if (children && children.length > 0) { setCanNest(false); return; }

    const { data } = await supabase
      .from('proposal_line_items')
      .select('*').eq('proposal_id', proposalId).eq('room_id', item.room_id).order('sort_order');
    if (!data || data.length === 0) { setCanNest(false); return; }

    const idx = data.findIndex(i => i.id === item.id);
    if (idx <= 0) { setCanNest(false); return; }

    const above = data[idx - 1];
    setItemAbove(above);
    setCanNest(true);
  }

  async function addAccessory(product: Product) {
    const maxSort = accessories.length > 0 ? Math.max(...accessories.map(a => a.sort_order)) : 0;
    const newAcc = {
      proposal_id: proposalId,
      room_id: item.room_id,
      product_id: product.id,
      parent_item_id: item.id,
      description: product.name || (product as any).item_name || '',
      quantity: 1,
      unit: product.unit || 'each',
      unit_price: (product as any).sell_price ?? product.unit_price ?? 0,
      cost: product.cost ?? 0,
      line_total: (product as any).sell_price ?? product.unit_price ?? 0,
      sort_order: maxSort + 1,
      is_custom: false,
    };
    const { data, error } = await supabase
      .from('proposal_line_items')
      .insert(newAcc)
      .select('*, products(*, manufacturers(id, name))')
      .single();
    if (!error && data) {
      setAccessories(prev => [...prev, data]);
    }
    setShowAccessorySelector(false);
  }

  function removeAccessory(accessoryId: string) {
    setConfirmModal({
      title: 'Remove Accessory',
      message: 'Remove this accessory from the line item?',
      onConfirm: async () => {
        setConfirmModal(null);
        await supabase.from('proposal_line_items').delete().eq('id', accessoryId);
        setAccessories(prev => prev.filter(a => a.id !== accessoryId));
      },
    });
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
      class_id: (masterProduct.class_id as string | null) ?? f.class_id,
      labor_hours: masterProduct.default_labor_hours ?? f.labor_hours,
      item_type: masterProduct.item_type || f.item_type,
      labor_phase_id: masterProduct.labor_phase_id ?? f.labor_phase_id,
      is_taxable: masterProduct.is_taxable !== undefined ? masterProduct.is_taxable : f.is_taxable,
    }));
  }

  function handleProductSelection(product: Product | null, customData?: Partial<Product>) {
    if (!product && !customData) return;
    const replacement = product ?? ({
      id: null,
      name: customData?.name || customData?.description || '',
      description: customData?.description || '',
      unit_price: customData?.unit_price ?? 0,
      cost: customData?.cost ?? 0,
      unit: customData?.unit || 'each',
    } as unknown as Product);
    setSelectedReplacementProduct(replacement);
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

  async function copyToSelectedAreas() {
    if (selectedAreasForCopy.size === 0) return;
    if (!form.is_customer_supplied && (!form.cost || form.cost <= 0)) {
      alert('Cost is required. Please enter a unit cost greater than $0 before copying.');
      return;
    }
    setCopyingToAreas(true);
    try {
      const laborTotalVal = (form.labor_hours || 0) * form.quantity * (form.labor_rate || 0);
      const lineItems = Array.from(selectedAreasForCopy).map((roomId, idx) => ({
        proposal_id: proposalId,
        room_id: roomId,
        product_id: item.product_id ?? null,
        description: form.description,
        quantity: form.quantity,
        unit: form.unit,
        unit_price: form.unit_price,
        cost: form.cost,
        line_total: form.quantity * form.unit_price,
        class_id: form.class_id || null,
        labor_phase_id: form.labor_phase_id || null,
        labor_hours: form.labor_hours || null,
        labor_rate: form.labor_rate || null,
        labor_total: laborTotalVal || null,
        item_type: form.item_type || null,
        task_notes: form.task_notes || null,
        show_task_notes: form.show_task_notes,
        is_taxable: form.is_taxable,
        is_hidden: form.is_hidden,
        is_custom: item.is_custom || false,
        sort_order: 9999 + idx,
      }));
      const { error } = await supabase.from('proposal_line_items').insert(lineItems);
      if (error) throw error;
      setSelectedAreasForCopy(new Set());
      onClose();
    } catch (err: any) {
      alert('Failed to copy: ' + err.message);
    } finally {
      setCopyingToAreas(false);
    }
  }

  function handleUpdateAllInstances() {
    if (!item.product_id || !onUpdateAllInstances) return;
    onUpdateAllInstances(item.product_id, {
      description: form.description,
      unit: form.unit,
      unit_price: form.unit_price,
      cost: form.cost,
      class_id: form.class_id || null,
      labor_hours: form.labor_hours || null,
      labor_rate: form.labor_rate || null,
      item_type: form.item_type || null,
      task_notes: form.task_notes || null,
      show_task_notes: form.show_task_notes,
      labor_phase_id: form.labor_phase_id || null,
      is_taxable: form.is_taxable,
      is_hidden: form.is_hidden,
    });
    onClose();
  }

  function handleSubmit(saveToMaster: boolean) {
    if (!form.is_customer_supplied && (!form.cost || form.cost <= 0)) {
      alert('Cost is required. Please enter a unit cost greater than $0 before saving.');
      return;
    }
    setSaving(true);
    const effectiveUnitPrice = form.is_customer_supplied ? 0 : form.unit_price;
    const effectiveCost = form.is_customer_supplied ? 0 : form.cost;
    const effectiveLaborHours = form.is_customer_supplied ? 0 : form.labor_hours;
    const effectiveLaborRate = form.is_customer_supplied ? 0 : form.labor_rate;
    const laborTotalVal = effectiveLaborHours * form.quantity * effectiveLaborRate;
    let parentItemId: string | null = null;
    if (isNested && itemAbove) {
      parentItemId = itemAbove.parent_item_id || itemAbove.id;
    }
    const updates: Partial<ProposalLineItem> = {
      description: form.description,
      quantity: form.quantity,
      unit: form.unit,
      unit_price: effectiveUnitPrice,
      cost: effectiveCost,
      class_id: form.class_id || null,
      labor_hours: effectiveLaborHours || null,
      labor_rate: effectiveLaborRate || null,
      labor_total: laborTotalVal || null,
      item_type: form.item_type || null,
      task_notes: form.task_notes || null,
      show_task_notes: form.show_task_notes,
      labor_phase_id: form.labor_phase_id || null,
      is_taxable: form.is_taxable,
      is_hidden: form.is_hidden,
      is_customer_supplied: form.is_customer_supplied,
      line_total: form.is_customer_supplied ? 0 : form.quantity * form.unit_price,
      display_mode: form.display_mode,
      parent_item_id: parentItemId,
    };
    onSave(updates);
    if (saveToMaster && item.product_id && onSaveToMaster) {
      onSaveToMaster(item.product_id, {
        name: form.description,
        unit: form.unit,
        unit_price: form.unit_price,
        cost: form.cost,
        class_id: form.class_id || null,
        default_labor_hours: form.labor_hours || null,
        item_type: form.item_type as any,
        labor_phase_id: form.labor_phase_id || null,
        is_taxable: form.is_taxable,
      });
    }
    setSaved(true);
    setSaving(false);
    setTimeout(onClose, 600);
  }

  async function handleImageFile(file: File) {
    if (!item.product_id) return;
    setImageUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `products/${item.product_id}/image_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('attachments').upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(path);
      setForm(f => ({ ...f, image_url: urlData.publicUrl }));
    } catch (err) {
      console.error('Image upload error:', err);
    } finally {
      setImageUploading(false);
    }
  }

  // Live financials
  const lineTotal = form.is_customer_supplied ? 0 : form.quantity * form.unit_price;
  const laborTotalCalc = form.is_customer_supplied ? 0 : (form.labor_hours || 0) * form.quantity * (form.labor_rate || 0);
  const totalRevenue = lineTotal + laborTotalCalc;
  const totalCost = form.is_customer_supplied ? 0 : form.cost * form.quantity;
  const profit = totalRevenue - totalCost;
  const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

  const currentImageUrl = form.image_url || masterProduct?.image_url || null;

  const modal = (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center shrink-0">
              {form.item_type === 'labor'
                ? <Wrench className="w-4 h-4 text-blue-400" />
                : <Package className="w-4 h-4 text-gray-400" />}
            </div>
            <div>
              <h2 className="text-base font-semibold text-white leading-tight">Edit Line Item</h2>
              {masterProduct?.sku && (
                <p className="text-xs text-cyan-400 font-mono mt-0.5">{masterProduct.sku}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-6">
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
                  {item.product_id && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center flex-col gap-1 text-white text-xs font-medium"
                    >
                      {imageUploading
                        ? <Loader2 className="w-6 h-6 animate-spin" />
                        : <><ImageIcon className="w-6 h-6" /><span>Change</span></>}
                    </button>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                    onChange={e => { if (e.target.files?.[0]) handleImageFile(e.target.files[0]); }} />
                </div>

                {/* Catalog meta */}
                <div className="bg-gray-800/60 rounded-xl border border-gray-700/50 p-3.5 space-y-2">
                  {masterProduct?.manufacturer?.name && (
                    <div className="flex justify-between gap-2">
                      <span className="text-xs text-gray-500 shrink-0">Mfr</span>
                      <span className="text-xs text-gray-300 text-right">{masterProduct.manufacturer.name}</span>
                    </div>
                  )}
                  {masterProduct?.manufacturer_model_number && (
                    <div className="flex justify-between gap-2">
                      <span className="text-xs text-gray-500 shrink-0">Model</span>
                      <span className="text-xs text-gray-300 font-mono text-right">{masterProduct.manufacturer_model_number}</span>
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

                {/* View Details button */}
                {canEditProducts && item.product_id && (
                  <button
                    onClick={() => setShowProductDetailView(true)}
                    className="w-full px-3 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-xs text-gray-300 font-medium flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Edit3 className="w-3 h-3" />View Master Catalog
                  </button>
                )}
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
                      onChange={e => setForm(f => ({ ...f, labor_phase_id: e.target.value }))}
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
                      onChange={e => setForm(f => ({ ...f, item_type: e.target.value }))}
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

                {/* Nesting */}
                <div className={`rounded-lg px-3 py-2.5 border ${canNest ? 'border-green-700/40 bg-green-900/10' : 'border-gray-700/40 bg-gray-800/30'}`}>
                  <label className={`flex items-start gap-2 ${canNest ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                    <input type="checkbox" checked={isNested} onChange={e => setIsNested(e.target.checked)}
                      disabled={!canNest}
                      className="mt-0.5 rounded border-gray-600 bg-gray-700 text-green-500 focus:ring-green-500/30 disabled:cursor-not-allowed" />
                    <div>
                      <span className={`text-xs font-medium ${canNest ? 'text-green-400' : 'text-gray-500'}`}>Nested Accessory</span>
                      {canNest && itemAbove && (
                        <p className="text-xs text-green-600 mt-0.5">Nests under: <span className="font-semibold">{itemAbove.description}</span></p>
                      )}
                      {item.parent_item_id && !isNested && (
                        <p className="text-xs text-blue-500 mt-0.5">Currently nested — uncheck to promote to top level</p>
                      )}
                      {!canNest && accessories.length > 0 && (
                        <p className="text-xs text-amber-600 mt-0.5">Items with accessories cannot be nested</p>
                      )}
                      {!canNest && accessories.length === 0 && !itemAbove && (
                        <p className="text-xs text-gray-600 mt-0.5">First item in area — nothing above to nest under</p>
                      )}
                    </div>
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
                {accessories.length > 0 ? (
                  <>
                    {/* Display mode */}
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
                      {accessories.map(acc => (
                        <div key={acc.id} className="flex items-center gap-3 px-3 py-2.5 bg-gray-800/60 border border-gray-700/40 rounded-lg">
                          <Package className="w-3.5 h-3.5 text-gray-600 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-white truncate">{acc.description}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {acc.quantity} {acc.unit} × {formatCurrency(acc.unit_price)} = {formatCurrency(acc.line_total)}
                            </p>
                          </div>
                          <button onClick={() => removeAccessory(acc.id)}
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

            {/* Copy to Areas */}
            {rooms.length > 1 && (
              <div className="border border-gray-700/50 rounded-xl overflow-hidden mb-4 bg-gray-800/30">
                <div className="flex items-center justify-between px-4 py-3">
                  <h3 className="text-sm font-medium text-gray-300 flex items-center gap-2">
                    <Copy className="w-4 h-4 text-gray-500" />Copy to Other Areas
                  </h3>
                  {selectedAreasForCopy.size > 0 && (
                    <span className="bg-blue-600 text-white px-2 py-0.5 rounded-full text-xs font-medium">
                      {selectedAreasForCopy.size} selected
                    </span>
                  )}
                </div>
                <div className="px-4 pb-4 space-y-3">
                  <div className="space-y-1 max-h-36 overflow-y-auto bg-gray-800/60 border border-gray-700/40 rounded-lg p-2">
                    {rooms.filter(r => r.id !== item.room_id).map(room => (
                      <label key={room.id}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${selectedAreasForCopy.has(room.id) ? 'bg-blue-900/30' : 'hover:bg-gray-700/40'}`}>
                        <input type="checkbox" checked={selectedAreasForCopy.has(room.id)}
                          onChange={() => {
                            const next = new Set(selectedAreasForCopy);
                            if (next.has(room.id)) next.delete(room.id); else next.add(room.id);
                            setSelectedAreasForCopy(next);
                          }}
                          className="rounded border-gray-600 bg-gray-700 text-blue-500" />
                        <span className="text-xs text-gray-300">{room.name}</span>
                      </label>
                    ))}
                  </div>
                  {selectedAreasForCopy.size > 0 && (
                    <button onClick={copyToSelectedAreas} disabled={copyingToAreas}
                      className="w-full px-4 py-2 bg-blue-700 hover:bg-blue-600 disabled:bg-gray-700 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-colors">
                      {copyingToAreas
                        ? <><Loader2 className="w-4 h-4 animate-spin" />Copying...</>
                        : <><Copy className="w-3.5 h-3.5" />Copy to {selectedAreasForCopy.size} Area{selectedAreasForCopy.size !== 1 ? 's' : ''}</>}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Master Product Actions */}
            {item.product_id && (
              <div className="border border-gray-700/50 rounded-xl p-4 bg-gray-800/30 mb-4">
                <div className="flex items-start gap-2 mb-3">
                  <Package className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-gray-300">Linked to Master Catalog</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {instanceCount > 1
                        ? `This product appears ${instanceCount} times on this proposal.`
                        : 'This item is synced with the master catalog.'}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={updateFromMaster} disabled={!masterProduct}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 border border-gray-600 rounded-lg text-xs text-gray-300 transition-colors">
                    <RefreshCw className="w-3.5 h-3.5" />Update from Master
                  </button>
                  {onSubstituteProduct && (
                    <button onClick={() => setShowProductSelector(true)}
                      className="flex items-center justify-center gap-2 px-3 py-2 bg-orange-700 hover:bg-orange-600 rounded-lg text-xs text-white font-medium transition-colors">
                      <Replace className="w-3.5 h-3.5" />Substitute Product
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Link to catalog for custom items */}
            {!item.product_id && onSubstituteProduct && (
              <button onClick={() => setShowProductSelector(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-700 hover:bg-orange-600 rounded-xl text-sm text-white font-medium transition-colors mb-4">
                <Replace className="w-4 h-4" />Link to Product from Catalog
              </button>
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
            <button onClick={() => handleSubmit(false)} disabled={saving || saved}
              className={`flex-1 flex items-center justify-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                saved ? 'bg-green-600 text-white'
                  : saving ? 'bg-blue-700 text-white cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-500 text-white'
              }`}>
              {saved ? <><Check className="w-4 h-4" />Saved</> : saving ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</> : <><Save className="w-4 h-4" />Save Changes</>}
            </button>
            {item.product_id && onSaveToMaster && canEditProducts && (
              <button onClick={() => handleSubmit(true)} disabled={saving || saved}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-green-700 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
                <Save className="w-4 h-4" />Save to Master
              </button>
            )}
          </div>
          {item.product_id && instanceCount > 1 && onUpdateAllInstances && (
            <button onClick={handleUpdateAllInstances} disabled={saving}
              className="w-full flex items-center justify-center gap-2 px-5 py-2 bg-amber-700 hover:bg-amber-600 disabled:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors">
              <RefreshCw className="w-4 h-4" />Update All {instanceCount} Instances
            </button>
          )}
        </div>
      </div>

      {/* Sub-modals */}
      {showProductSelector && (
        <ProductSelector onSelect={handleProductSelection} onClose={() => setShowProductSelector(false)} />
      )}

      {showAccessorySelector && (
        <ProductSelector onSelect={addAccessory} onClose={() => setShowAccessorySelector(false)} />
      )}

      {showSubstituteConfirmation && selectedReplacementProduct && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[70] p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-white mb-5">Confirm Substitution</h3>
            <div className="space-y-3 mb-6">
              <div className="bg-gray-800 border border-gray-700 rounded-xl p-3.5">
                <p className="text-xs text-gray-500 mb-1">Current Item</p>
                <p className="font-semibold text-white text-sm">{item.description}</p>
                <p className="text-xs text-gray-400 mt-1">${item.unit_price.toFixed(2)} per {item.unit}</p>
              </div>
              <div className="flex items-center justify-center">
                <div className="w-8 h-8 rounded-full bg-orange-700/30 border border-orange-600/40 flex items-center justify-center">
                  <Replace className="w-4 h-4 text-orange-400" />
                </div>
              </div>
              <div className="bg-green-900/20 border border-green-700/40 rounded-xl p-3.5">
                <p className="text-xs text-green-600 mb-1">New Product</p>
                <p className="font-semibold text-white text-sm">{selectedReplacementProduct.name}</p>
                <p className="text-xs text-gray-400 mt-1">
                  ${(selectedReplacementProduct.unit_price ?? 0).toFixed(2)} per {selectedReplacementProduct.unit || 'each'}
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <button onClick={() => handleSubstituteConfirm(false)}
                className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium text-sm transition-colors">
                Replace Only This Item
              </button>
              {instanceCount > 1 && (
                <button onClick={() => handleSubstituteConfirm(true)}
                  className="w-full px-4 py-2.5 bg-orange-700 hover:bg-orange-600 text-white rounded-xl font-medium text-sm transition-colors">
                  Replace All {instanceCount} Instances
                </button>
              )}
              <button onClick={handleSubstituteCancel}
                className="w-full px-4 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 rounded-xl font-medium text-sm transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showProductDetailView && item.product_id && (
        <ProductDetailModal
          productId={item.product_id}
          onClose={() => { setShowProductDetailView(false); loadMasterProduct(); }}
          onEdit={() => { setShowProductDetailView(false); window.open(`/admin/products?edit=${item.product_id}`, '_blank'); }}
        />
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
