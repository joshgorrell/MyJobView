import { useState, useEffect } from 'react';
import { X, Save, Plus, Trash2, Package } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import ProductDetailPanel, { type ProductDetailPanelData, type LaborPhaseOption, type ClassOption } from '../Products/ProductDetailPanel';
import { catalogTaxonomy } from '../Products/CatalogTaxonomyFilters';
import { proposalItemChanges, proposalItemUpdate } from './proposalItemChanges';
import type { ProposalLineItem } from '../../lib/types';

interface ProductDetailModalProps {
  lineItemId: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function ProductDetailModal({ lineItemId, onClose, onSaved }: ProductDetailModalProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rooms, setRooms] = useState<{ id: string; name: string }[]>([]);
  const [roomId, setRoomId] = useState('');
  const [roomError, setRoomError] = useState(false);
  const [lineItem, setLineItem] = useState<any>(null);
  const [laborPhases, setLaborPhases] = useState<LaborPhaseOption[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [matchingItems, setMatchingItems] = useState<any[] | null>(null);
  const [initialPanelData, setInitialPanelData] = useState<ProductDetailPanelData | null>(null);
  const [newImage, setNewImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imagePasted, setImagePasted] = useState(false);

  const [panelData, setPanelData] = useState<ProductDetailPanelData | null>(null);
  const [accessories, setAccessories] = useState<ProposalLineItem[]>([]);
  const [showAddAccessory, setShowAddAccessory] = useState(false);
  const [accessorySearch, setAccessorySearch] = useState('');
  const [accessoryProducts, setAccessoryProducts] = useState<any[]>([]);
  const [addingAccessory, setAddingAccessory] = useState(false);

  useEffect(() => {
    loadData();
  }, [lineItemId]);

  // Handle paste anywhere in the modal
  useEffect(() => {
    function handleGlobalPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const blob = items[i].getAsFile();
          if (blob) {
            const file = new File([blob], `pasted-image-${Date.now()}.png`, { type: blob.type });
            setNewImage(file);
            setImagePasted(true);
            const reader = new FileReader();
            reader.onloadend = () => setPreviewUrl(reader.result as string);
            reader.readAsDataURL(file);
            e.preventDefault();
          }
          break;
        }
      }
    }
    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, []);

  async function loadData() {
    try {
      const [itemRes, phasesRes, classesRes] = await Promise.all([
        supabase
          .from('proposal_line_items')
          .select('*, products(*, image_url, thumbnail_url, manufacturers(name), catalog_category:product_categories!products_category_id_fkey(name), catalog_subcategory:product_subcategories!products_subcategory_id_fkey(name), default_vendor:vendors!products_default_vendor_id_fkey(vendor_name))')
          .eq('id', lineItemId)
          .maybeSingle(),
        supabase
          .from('labor_phases')
          .select('id, name, default_price')
          .eq('is_active', true)
          .order('sort_order'),
        supabase
          .from('proposal_classes')
          .select('id, name, color')
          .eq('is_active', true)
          .order('name'),
      ]);

      if (itemRes.data) {
        const item = itemRes.data;
        const product = item.products || null;
        const taxonomy = product ? catalogTaxonomy(product) : null;
        setLineItem(item);
        setRoomId(item.room_id || '');
        const { data: proposalRooms, error: roomsError } = await supabase
          .from('proposal_rooms')
          .select('id, name')
          .eq('proposal_id', item.proposal_id)
          .order('sort_order');
        setRoomError(!!roomsError);
        setRooms(proposalRooms || []);

        const initialData: ProductDetailPanelData = {
          productId: item.product_id || null,
          productName: product?.name || item.description || '',
          modelNumber: product?.manufacturer_model_number || null,
          sku: product?.sku || null,
          upc: product?.upc || null,
          category: taxonomy?.categoryName || null,
          subcategory: taxonomy?.subcategoryName || null,
          inventoryType: product?.inventory_type || null,
          itemColor: product?.item_color || null,
          itemSize: product?.item_size || null,
          manufacturerName: product?.manufacturers?.name || null,
          vendorName: taxonomy?.vendorName || null,
          imageUrl: product?.image_url || product?.thumbnail_url || null,
          manufacturerUrl: product?.manufacturer_url || null,
          supplierUrl: product?.supplier_url || null,
          productSheetUrl: product?.product_sheet_url || null,
          installVideoUrl: product?.install_video_url || null,
          description: (item.description && item.description !== product?.name) ? item.description : null,
          specifications: product?.specifications || null,
          unitPrice: Number(item.unit_price || 0),
          cost: Number(item.cost || 0),
          msrp: product?.msrp ? Number(product.msrp) : null,
          quantity: Number(item.quantity || 1),
          unit: item.unit || 'ea',
          laborHours: Number(item.labor_hours || 0),
          laborRate: Number(item.labor_rate || 0),
          laborPhaseId: item.labor_phase_id || null,
          laborPhaseName: null,
          classId: item.class_id || null,
          taskNotes: item.task_notes || null,
          showTaskNotes: item.show_task_notes ?? false,
          isTaxable: item.is_taxable ?? false,
          isHidden: item.is_hidden ?? false,
          isCustomerSupplied: item.is_customer_supplied ?? false,
        };
        setPanelData(initialData);
        setInitialPanelData(initialData);
      }

      setLaborPhases(phasesRes.data || []);
      setClasses(classesRes.data || []);

      // Load existing accessories (nested child items)
      if (itemRes.data) {
        const { data: childItems } = await supabase
          .from('proposal_line_items')
          .select('*, labor_phases(name)')
          .eq('parent_item_id', lineItemId)
          .order('sort_order');
        setAccessories((childItems || []) as unknown as ProposalLineItem[]);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  function handlePanelChange(field: keyof ProductDetailPanelData, value: any) {
    setPanelData(prev => prev ? { ...prev, [field]: value } : prev);
  }

  function handleImageSelect(file: File) {
    setNewImage(file);
    setImagePasted(false);
    const reader = new FileReader();
    reader.onloadend = () => setPreviewUrl(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function uploadProductImage(productId: string): Promise<string | null> {
    if (!newImage) return null;
    try {
      setUploadingImage(true);
      const fileExt = newImage.name.split('.').pop();
      const fileName = `${productId}-${Date.now()}.${fileExt}`;
      const filePath = `product-images/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(filePath, newImage, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('attachments')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Failed to upload image');
      return null;
    } finally {
      setUploadingImage(false);
    }
  }

  async function searchAccessoryProducts(query: string) {
    if (!query.trim()) { setAccessoryProducts([]); return; }
    const { data } = await supabase
      .from('products')
      .select('id, sku, name, description, unit_price, cost, image_url, thumbnail_url, manufacturers(name)')
      .or(`sku.ilike.%${query}%,name.ilike.%${query}%,description.ilike.%${query}%`)
      .limit(10);
    setAccessoryProducts(data || []);
  }

  async function addAccessory(productId: string) {
    if (!lineItem) return;
    try {
      setAddingAccessory(true);
      const { data: product } = await supabase
        .from('products')
        .select('*, manufacturers(name)')
        .eq('id', productId)
        .maybeSingle();
      if (!product) return;

      const maxSort = accessories.length > 0 ? Math.max(...accessories.map(a => a.sort_order || 0)) : 0;
      const { data, error } = await supabase
        .from('proposal_line_items')
        .insert({
          proposal_id: lineItem.proposal_id,
          room_id: lineItem.room_id,
          product_id: product.id,
          description: product.name || product.description,
          sku: product.sku,
          quantity: 1,
          unit: product.unit || 'ea',
          unit_price: product.unit_price || 0,
          cost: product.cost || 0,
          labor_hours: product.default_labor_hours || 0,
          labor_rate: 0,
          labor_total: 0,
          labor_phase_id: product.labor_phase_id || null,
          parent_item_id: lineItemId,
          sort_order: maxSort + 1,
          is_customer_supplied: false,
          is_hidden: false,
        })
        .select('*, labor_phases(name)')
        .single();
      if (error) throw error;
      setAccessories(prev => [...prev, data as unknown as ProposalLineItem]);
      setShowAddAccessory(false);
      setAccessorySearch('');
      setAccessoryProducts([]);
    } catch (error) {
      console.error('Error adding accessory:', error);
      alert('Failed to add accessory');
    } finally {
      setAddingAccessory(false);
    }
  }

  async function removeAccessory(accessoryId: string) {
    if (!confirm('Remove this accessory from the line item?')) return;
    try {
      const { error } = await supabase.from('proposal_line_items').delete().eq('id', accessoryId);
      if (error) throw error;
      setAccessories(prev => prev.filter(a => a.id !== accessoryId));
    } catch (error) {
      console.error('Error removing accessory:', error);
      alert('Failed to remove accessory');
    }
  }

  function pendingChanges() {
    if (!panelData || !initialPanelData) return {};
    const changes = proposalItemChanges(initialPanelData, panelData);
    if (roomId !== (lineItem.room_id || '')) changes.room_id = roomId;
    return changes;
  }

  async function requestSave() {
    if (!panelData || saving) return;
    const changes = pendingChanges();
    if (!Object.keys(changes).length && !newImage) { onSaved(); return; }
    if ('room_id' in changes && !rooms.some(room => room.id === roomId)) {
      alert('Select a valid proposal room before saving');
      return;
    }
    setSaving(true);
    try {
      if (lineItem.product_id && Object.keys(changes).some(field => field !== 'room_id')) {
        const { data, error } = await supabase
          .from('proposal_line_items')
          .select('*')
          .eq('proposal_id', lineItem.proposal_id)
          .eq('product_id', lineItem.product_id);
        if (error) throw error;
        if ((data || []).some(item => item.id !== lineItemId)) {
          setMatchingItems(data);
          return;
        }
      }
      await handleSave([lineItem]);
    } catch (error) {
      console.error('Error checking matching items:', error);
      alert('Unable to check matching items. Please try saving again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSave(targets: any[]) {
    if (!panelData) return;
    setSaving(true);
    try {
      const changes = pendingChanges();
      if (newImage && lineItem?.product_id) {
        const newImageUrl = await uploadProductImage(lineItem.product_id);
        if (!newImageUrl) return;
        const { error } = await supabase.from('products')
          .update({ thumbnail_url: newImageUrl, image_url: newImageUrl }).eq('id', lineItem.product_id);
        if (error) throw error;
      }
      for (const target of targets) {
        const { error } = await supabase.from('proposal_line_items')
          .update(proposalItemUpdate(target, changes, target.id === lineItemId))
          .eq('proposal_id', lineItem.proposal_id).eq('id', target.id);
        if (error) throw error;
      }
      if ('room_id' in changes) {
        const { error } = await supabase.from('proposal_line_items')
          .update({ room_id: roomId }).eq('proposal_id', lineItem.proposal_id)
          .eq('parent_item_id', lineItemId);
        if (error) throw error;
      }
      setMatchingItems(null);
      onSaved();
    } catch (error) {
      console.error('Error saving line item:', error);
      alert('Failed to save all changes. Please retry.');
    } finally {
      setSaving(false);
    }
  }

  function formatCurrency(value: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl p-8 flex items-center gap-3">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <span className="text-gray-600 text-sm">Loading item...</span>
        </div>
      </div>
    );
  }

  if (!panelData) return null;

  const materialTotal = panelData.isCustomerSupplied ? 0 : panelData.unitPrice * panelData.quantity;
  const laborTotal = (panelData.laborHours || 0) * panelData.quantity * (panelData.laborRate || 0);
  const totalRevenue = materialTotal + laborTotal;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div role="dialog" aria-modal="true" aria-label="Edit Item Details" className="bg-white rounded-xl shadow-2xl w-full max-w-5xl min-w-0 flex flex-col max-h-[calc(100dvh-1rem)] sm:max-h-[92dvh]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-gray-200 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-900">Edit Item Details</h2>
            {panelData.sku && <p className="text-xs text-gray-500 mt-0.5">{panelData.sku}</p>}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4">
          <div className="mb-4">
            <label htmlFor="proposal-item-room" className="block text-sm font-medium text-gray-700 mb-1">Room / Area</label>
            <select id="proposal-item-room" value={roomId} onChange={e => setRoomId(e.target.value)} disabled={roomError || saving}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base text-gray-900 bg-white">
              {!rooms.some(room => room.id === roomId) && <option value={roomId}>{roomId ? 'Current room' : 'Select room'}</option>}
              {rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}
            </select>
            {roomError && <p className="text-xs text-red-600 mt-1">Unable to load rooms. Close and reopen the item to retry.</p>}
            <p className="text-xs text-gray-500 mt-1">Room changes apply to this item and its accessories only.</p>
          </div>
          <ProductDetailPanel
            mode="edit"
            compactDescription
            data={panelData}
            laborPhases={laborPhases}
            classes={classes}
            previewImageUrl={previewUrl}
            imagePasted={imagePasted}
            onImageSelect={handleImageSelect}
            onChange={handlePanelChange}
          />

          {/* Customer Supplied Banner */}
          {panelData.isCustomerSupplied && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <Package className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <p className="text-xs text-amber-700 font-medium">
                Customer Supplied — material cost is set to $0 and excluded from totals. Labor and accessories are still billed.
              </p>
            </div>
          )}

          {/* Accessories Section — collapsed when empty */}
          <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-900">Accessories &amp; Add-ons</h3>
                {accessories.length > 0 && (
                  <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full text-xs font-medium">
                    {accessories.length}
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowAddAccessory(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs text-white font-medium transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />Add Accessory
              </button>
            </div>

            {accessories.length > 0 && (
              <div className="p-4">
                <div className="space-y-1.5">
                  {accessories.map((acc) => (
                    <div key={acc.id} className="flex items-center gap-3 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                      <Package className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-900 truncate">{acc.description}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {acc.quantity} {acc.unit} × {formatCurrency(acc.unit_price)} = {formatCurrency(acc.line_total)}
                        </p>
                      </div>
                      <button
                        onClick={() => removeAccessory(acc.id)}
                        className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors shrink-0"
                        title="Remove accessory"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Add Accessory Search */}
          {showAddAccessory && (
            <div className="mt-2 border border-blue-200 rounded-lg p-3 bg-blue-50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-700">Search Product to Add as Accessory</span>
                <button onClick={() => { setShowAddAccessory(false); setAccessorySearch(''); setAccessoryProducts([]); }} className="text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <input
                type="text"
                value={accessorySearch}
                onChange={(e) => { setAccessorySearch(e.target.value); searchAccessoryProducts(e.target.value); }}
                placeholder="Search by SKU, name, or description..."
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 mb-2"
                autoFocus
              />
              <div className="max-h-48 overflow-y-auto space-y-1">
                {accessoryProducts.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => addAccessory(p.id)}
                    className="flex items-center justify-between p-2 bg-white border border-gray-200 rounded cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {p.sku && <span className="text-xs font-mono text-cyan-600">{p.sku}</span>}
                        {p.manufacturers?.name && <span className="text-xs text-gray-400">| {p.manufacturers.name}</span>}
                      </div>
                      <p className="text-sm font-medium text-gray-900 truncate">{p.name || p.description}</p>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="text-sm font-medium text-green-600">{formatCurrency(p.unit_price || 0)}</p>
                    </div>
                  </div>
                ))}
                {accessorySearch && accessoryProducts.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-2">No products found</p>
                )}
              </div>
              {addingAccessory && <p className="text-xs text-blue-600 mt-1">Adding...</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between gap-3 shrink-0">
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-4 min-w-0">
            {/* Line total */}
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Line Total</div>
              <div className="text-xl font-bold text-gray-900">{formatCurrency(totalRevenue)}</div>
              <div className="text-xs text-gray-500">Material {formatCurrency(materialTotal)} · Labor {formatCurrency(laborTotal)}</div>
            </div>


          </div>

          <div className="flex items-center justify-end gap-2 shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-gray-700 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={requestSave}
              disabled={saving || uploadingImage}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium shadow-sm"
            >
              <Save className="w-3.5 h-3.5" />
              {uploadingImage ? 'Uploading...' : saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
      {matchingItems && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center p-4 z-10">
          <div role="dialog" aria-modal="true" aria-labelledby="item-scope-title" className="w-full max-w-md bg-white rounded-xl shadow-2xl p-5">
            <h3 id="item-scope-title" className="text-base font-bold text-gray-900">Apply changes to which items?</h3>
            <p className="text-sm text-gray-600 mt-2">There are {matchingItems.length - 1} other matching items in this proposal. Apply the item detail changes to just this item or all matching items?</p>
            {'room_id' in pendingChanges() && <p className="text-sm text-gray-600 mt-2">The room change applies only to the item you opened and its accessories. Other matching items stay in their current rooms.</p>}
            <div className="flex flex-col gap-2 mt-4">
              <button autoFocus disabled={saving} onClick={() => handleSave([lineItem])} className="px-4 py-2 border border-blue-600 text-blue-700 rounded-lg disabled:opacity-50">This item only</button>
              <button disabled={saving} onClick={() => handleSave(matchingItems)} className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50">All matching items in this proposal</button>
              <button disabled={saving} onClick={() => setMatchingItems(null)} className="px-4 py-2 text-gray-600 rounded-lg">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
