import { useState, useEffect, useRef } from 'react';
import { X, Pencil as Edit, Search, Upload, ChevronLeft, ChevronRight, Copy, Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ProductUsageHistory } from './ProductUsageHistory';
import { useAuth } from '../../contexts/AuthContext';
import ProductDetailPanel, { type ProductDetailPanelData } from './ProductDetailPanel';
import ProductStatusNotice from './ProductStatusNotice';
import { catalogTaxonomy } from './CatalogTaxonomyFilters';

interface ProductDetailModalProps {
  productId: string;
  onClose: () => void;
  onEdit?: () => void;
  onSaved?: () => void;
  onDuplicate?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
}

export function ProductDetailModal({ productId, onClose, onEdit, onSaved, onDuplicate, onArchive, onDelete }: ProductDetailModalProps) {
  const { profile } = useAuth();
  const canEdit = profile?.can_edit_products ?? false;
  const [panelData, setPanelData] = useState<ProductDetailPanelData | null>(null);
  const [productStatus, setProductStatus] = useState<{is_active?: boolean; is_discontinued?: boolean}>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'details' | 'history'>('details');
  const [auditInfo, setAuditInfo] = useState<{ createdAt: string; createdBy: string; updatedAt: string; updatedBy: string } | null>(null);
  const [manufacturerId, setManufacturerId] = useState<string | null>(null);
  const [model, setModel] = useState('');
  const [photoOpen, setPhotoOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [checking, setChecking] = useState(false);
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [savingPhoto, setSavingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!photoFile) { setPreviewUrl(''); return; }
    const url = URL.createObjectURL(photoFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  useEffect(() => {
    if (!photoOpen) return;
    setPhotoError('');
    setPhotoUrl('');
    setPhotoFile(null);
    setSuggestions([]);
    setSuggestionIndex(0);
    if (!profile?.organization_id || !manufacturerId || model.trim().length < 3) return;
    let cancelled = false;
    setChecking(true);
    supabase.from('products')
      .select('id, manufacturer_model_number, image_url')
      .eq('organization_id', profile.organization_id)
      .eq('manufacturer_id', manufacturerId)
      .ilike('manufacturer_model_number', model.trim())
      .not('image_url', 'is', null)
      .limit(20)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setPhotoError('Could not check your catalog for matching photos.');
        else setSuggestions([...new Set((data || [])
          .filter(p => p.id !== productId && p.manufacturer_model_number?.trim().toLowerCase() === model.trim().toLowerCase() && p.image_url?.trim())
          .map(p => p.image_url!.trim()))]);
        setChecking(false);
      });
    return () => { cancelled = true; };
  }, [photoOpen, profile?.organization_id, manufacturerId, model, productId]);

  function selectFile(file: File) {
    if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) {
      setPhotoError('Choose an image file under 10 MB.');
      return;
    }
    setPhotoError('');
    setPhotoFile(file);
    setPhotoUrl('');
  }

  async function savePhoto() {
    if (!canEdit || !profile?.organization_id || savingPhoto) return;
    setPhotoError('');
    setSavingPhoto(true);
    try {
      let url = photoUrl.trim();
      if (photoFile) {
        const ext = photoFile.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
        const path = `products/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from('product-images').upload(path, photoFile, { contentType: photoFile.type });
        if (error) throw error;
        url = supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl;
      } else {
        const parsed = new URL(url);
        if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Enter a valid image URL.');
      }
      const { data, error } = await supabase.from('products')
        .update({ image_url: url })
        .eq('id', productId)
        .eq('organization_id', profile.organization_id)
        .select('id')
        .single();
      if (error || !data) throw error || new Error('Could not save this product photo.');
      setPanelData(current => current && ({ ...current, imageUrl: url }));
      setPhotoOpen(false);
      onSaved?.();
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : 'Could not save this product photo.');
    } finally {
      setSavingPhoto(false);
    }
  }

  useEffect(() => {
    loadProduct();
  }, [productId]);

  async function loadProduct() {
    try {
      const { data: p, error } = await supabase
        .from('products')
        .select('*, manufacturers(name), labor_phases(name, default_price), catalog_category:product_categories!products_category_id_fkey(name), catalog_subcategory:product_subcategories!products_subcategory_id_fkey(name), default_vendor:vendors!products_default_vendor_id_fkey(vendor_name)')
        .eq('id', productId)
        .single();

      if (error) throw error;

      const userIds = [p.created_by, p.updated_by].filter(Boolean);
      let createdByName = 'Unknown';
      let updatedByName = 'Unknown';

      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds);

        if (profiles) {
          createdByName = profiles.find((x: any) => x.id === p.created_by)?.full_name || 'Unknown';
          updatedByName = profiles.find((x: any) => x.id === p.updated_by)?.full_name || 'Unknown';
        }
      }

      setAuditInfo({
        createdAt: p.created_at,
        createdBy: createdByName,
        updatedAt: p.updated_at,
        updatedBy: updatedByName,
      });

      const taxonomy = catalogTaxonomy(p);
      setProductStatus({ is_active: p.is_active, is_discontinued: p.is_discontinued });
      setManufacturerId(p.manufacturer_id || null);
      setModel(p.manufacturer_model_number || '');
      setPanelData({
        productId: p.id,
        productName: p.name || p.manufacturer_model_number || '',
        modelNumber: p.manufacturer_model_number || null,
        sku: p.sku || null,
        upc: p.upc || null,
        category: taxonomy.categoryName || null,
        subcategory: taxonomy.subcategoryName || null,
        inventoryType: p.inventory_type || null,
        itemColor: p.item_color || null,
        itemSize: p.item_size || null,
        manufacturerName: p.manufacturers?.name || null,
        vendorName: taxonomy.vendorName || null,
        imageUrl: p.image_url || p.thumbnail_url || null,
        manufacturerUrl: p.manufacturer_url || null,
        supplierUrl: p.supplier_url || null,
        productSheetUrl: p.product_sheet_url || null,
        installVideoUrl: p.install_video_url || null,
        description: p.description || null,
        specifications: p.specifications || null,
        unitPrice: Number(p.our_price ?? p.unit_price ?? 0),
        cost: Number(p.cost || 0),
        msrp: p.msrp ? Number(p.msrp) : null,
        quantity: 1,
        unit: 'ea',
        laborHours: Number(p.default_labor_hours || 0),
        laborRate: Number(p.labor_phases?.default_price || 0),
        laborPhaseId: p.labor_phase_id || null,
        laborPhaseName: p.labor_phases?.name || null,
        classId: p.class_id || null,
        taskNotes: null,
        showTaskNotes: false,
        isTaxable: p.taxable ?? false,
        isHidden: false,
        isCustomerSupplied: false,
      });
    } catch (error) {
      console.error('Error loading product:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl p-8 flex items-center gap-3">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
          <span className="text-gray-600 text-sm">Loading product...</span>
        </div>
      </div>
    );
  }

  if (!panelData) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white text-gray-900 rounded-none sm:rounded-xl shadow-2xl w-full max-w-5xl flex flex-col h-[100dvh] sm:h-auto sm:max-h-[92dvh] min-h-0">
        {/* Header */}
        <div className="px-4 sm:px-6 pt-4 pb-3 border-b border-gray-200 flex flex-wrap items-start justify-between gap-3 shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-gray-900 break-words">{panelData.productName}</h2>
            <ProductStatusNotice product={productStatus} />
            {panelData.category && (
              <p className="text-xs text-gray-500 mt-0.5 truncate">
                {panelData.category}{panelData.subcategory ? ` / ${panelData.subcategory}` : ''}
              </p>
            )}
          </div>
          <div className="contents">
            <div className="order-3 w-full sm:w-auto sm:order-none flex bg-gray-100 p-1 rounded-xl">
              <button
                onClick={() => setActiveTab('details')}
                className={`flex-1 sm:flex-none px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeTab === 'details' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                Details
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`flex-1 sm:flex-none px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeTab === 'history' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                History
              </button>
            </div>
            <button onClick={onClose} aria-label="Close product details" className="p-3 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {canEdit && <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-2 sm:px-6">
          {onDuplicate && <button type="button" onClick={onDuplicate} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"><Copy size={15} /> Duplicate</button>}
          {onArchive && <button type="button" onClick={onArchive} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">{productStatus.is_active === false ? <ArchiveRestore size={15} /> : <Archive size={15} />}{productStatus.is_active === false ? 'Restore' : 'Archive'}</button>}
          {onDelete && <button type="button" onClick={onDelete} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"><Trash2 size={15} /> Delete</button>}
        </div>}
        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6 bg-gray-50/50">
          {activeTab === 'details' ? (
            <>
              <ProductDetailPanel mode="view" data={panelData} showIdentity={false}
                onRequestImage={canEdit ? () => setPhotoOpen(true) : undefined} />
              {photoOpen && canEdit && (
                <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/60 p-4 space-y-3" onPaste={e => {
                  const file = Array.from(e.clipboardData.files).find(item => item.type.startsWith('image/'));
                  if (file) { e.preventDefault(); selectFile(file); }
                }}>
                  <div className="flex items-center justify-between gap-3">
                    <div><h3 className="text-sm font-semibold text-gray-900">Product photo</h3>
                      <p className="text-xs text-gray-600">Choose a match, search for one, paste an image or URL, or upload a file.</p></div>
                    <button type="button" onClick={() => setPhotoOpen(false)} aria-label="Close photo editor" className="p-1 rounded hover:bg-blue-100"><X size={16} /></button>
                  </div>
                  {checking && <p className="text-xs text-gray-600">Checking your catalog for this exact model…</p>}
                  {!checking && suggestions.length > 0 && <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-white p-2">
                    <img src={suggestions[suggestionIndex]} alt="Suggested product" className="h-16 w-16 object-contain rounded bg-gray-50"
                      onError={() => { setSuggestions(current => current.filter(url => url !== suggestions[suggestionIndex])); setSuggestionIndex(0); }} />
                    <div className="flex-1 text-xs text-gray-700">Photo from the same make and model in your catalog.
                      {suggestions.length > 1 && <div className="flex items-center gap-1 mt-1">
                        <button type="button" aria-label="Previous photo" onClick={() => setSuggestionIndex(i => (i - 1 + suggestions.length) % suggestions.length)}><ChevronLeft size={17} /></button>
                        <span>{suggestionIndex + 1} of {suggestions.length}</span>
                        <button type="button" aria-label="Next photo" onClick={() => setSuggestionIndex(i => (i + 1) % suggestions.length)}><ChevronRight size={17} /></button>
                      </div>}
                    </div>
                    <button type="button" onClick={() => { setPhotoFile(null); setPhotoUrl(suggestions[suggestionIndex]); }} className="text-xs font-medium text-blue-700 hover:underline">Use this</button>
                  </div>}
                  {!checking && !suggestions.length && manufacturerId && model && <p className="text-xs text-gray-600">No matching photo in your catalog yet. Search the web or add your own.</p>}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={!panelData.manufacturerName || !model} onClick={() => window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${panelData.manufacturerName} ${model}`)}`, '_blank', 'noopener,noreferrer')}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"><Search size={14} /> Search images</button>
                    <button type="button" onClick={() => photoInputRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"><Upload size={14} /> Upload</button>
                    <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) selectFile(file); e.target.value = ''; }} />
                  </div>
                  <input type="url" aria-label="Image URL" value={photoUrl} onChange={e => { setPhotoUrl(e.target.value); setPhotoFile(null); }} placeholder="Paste image address here" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
                  <p className="text-xs text-gray-500">Image search opens a new tab. Copy the image address and paste it here, or paste an image directly into this box.</p>
                  {(previewUrl || photoUrl) && <img src={previewUrl || photoUrl} alt="Selected photo preview" className="h-28 max-w-full rounded-lg border border-gray-200 bg-white object-contain" onError={() => setPhotoError('This image could not be previewed. Check the address or choose another image.')} />}
                  {photoError && <p role="alert" className="text-xs text-red-700">{photoError}</p>}
                  <div className="flex justify-end gap-2"><button type="button" onClick={() => setPhotoOpen(false)} className="px-3 py-2 text-xs text-gray-600">Cancel</button>
                    <button type="button" disabled={(!photoFile && !photoUrl.trim()) || savingPhoto} onClick={savePhoto} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white disabled:opacity-50 hover:bg-blue-700">{savingPhoto ? 'Saving…' : 'Save photo'}</button></div>
                </div>
              )}
              {auditInfo && (
                <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500">
                  <span>Created {new Date(auditInfo.createdAt).toLocaleDateString()} by {auditInfo.createdBy}</span>
                  <span>Updated {new Date(auditInfo.updatedAt).toLocaleDateString()} by {auditInfo.updatedBy}</span>
                </div>
              )}
            </>
          ) : (
            <ProductUsageHistory productId={productId} />
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-gray-200 bg-gray-50 flex items-center justify-between shrink-0">
          {canEdit && onEdit ? (
            <button
              onClick={onEdit}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Edit className="w-3.5 h-3.5" />
              Edit Product
            </button>
          ) : <div />}
          <button
            onClick={onClose}
            className="px-4 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
