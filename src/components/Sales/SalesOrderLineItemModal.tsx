import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Lock, Pencil, Package, Save, Loader2, Check, Image as ImageIcon, Tag, Wrench, ChevronRight, ExternalLink, RefreshCw, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface MasterProduct {
  id: string;
  sku: string | null;
  name: string;
  description: string | null;
  unit: string | null;
  unit_price: number;
  cost: number | null;
  our_price: number | null;
  default_labor_hours: number | null;
  image_url: string | null;
  product_link: string | null;
  manufacturer_model_number: string | null;
  item_type: string | null;
  is_taxable: boolean;
  labor_phase_id: string | null;
  manufacturer: { name: string } | null;
  vendor: { vendor_name: string } | null;
  category: { name: string } | null;
  subcategory: { name: string } | null;
  labor_phase: { name: string; default_price: number | null } | null;
}

interface LineItemFull {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  cost: number | null;
  line_total: number;
  item_type: string | null;
  labor_hours: number | null;
  labor_rate: number | null;
  labor_total: number | null;
  task_notes: string | null;
  show_task_notes: boolean;
  is_hidden: boolean;
  is_taxable: boolean;
  labor_phase_id: string | null;
  class_id: string | null;
  product_id: string | null;
  proposal_classes: { id: string; name: string; color: string } | null;
  labor_phases: { id: string; name: string } | null;
}

interface LaborPhase {
  id: string;
  name: string;
}

interface ProposalClass {
  id: string;
  name: string;
  color: string;
}

interface SalesOrderLineItemModalProps {
  lineItemId: string;
  initialMode?: 'view' | 'edit';
  onClose: () => void;
  onSaved: () => void;
}

export function SalesOrderLineItemModal({
  lineItemId,
  initialMode = 'view',
  onClose,
  onSaved,
}: SalesOrderLineItemModalProps) {
  const { profile } = useAuth();
  const canEditProducts = profile?.can_edit_products ?? false;

  const [mode, setMode] = useState<'view' | 'edit'>(initialMode);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [lineItem, setLineItem] = useState<LineItemFull | null>(null);
  const [masterProduct, setMasterProduct] = useState<MasterProduct | null>(null);
  const [laborPhases, setLaborPhases] = useState<LaborPhase[]>([]);
  const [classes, setClasses] = useState<ProposalClass[]>([]);
  const [updateMaster, setUpdateMaster] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);

  const [form, setForm] = useState({
    description: '',
    quantity: 1,
    unit: 'ea',
    cost: 0,
    class_id: '',
    labor_phase_id: '',
    task_notes: '',
    show_task_notes: false,
    is_hidden: false,
    image_url: '',
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadAll();
  }, [lineItemId]);

  async function loadAll() {
    setLoading(true);
    try {
      const [liRes, phasesRes, classesRes] = await Promise.all([
        supabase
          .from('proposal_line_items')
          .select(`
            id, description, quantity, unit, unit_price, cost, line_total,
            item_type, labor_hours, labor_rate, labor_total,
            task_notes, show_task_notes, is_hidden, is_taxable,
            labor_phase_id, class_id, product_id,
            proposal_classes(id, name, color),
            labor_phases(id, name)
          `)
          .eq('id', lineItemId)
          .single(),
        supabase
          .from('labor_phases')
          .select('id, name')
          .eq('is_active', true)
          .order('sort_order'),
        supabase
          .from('proposal_classes')
          .select('id, name, color')
          .eq('is_active', true)
          .order('name'),
      ]);

      if (liRes.error) throw liRes.error;
      const li = liRes.data as LineItemFull;
      setLineItem(li);
      setForm({
        description: li.description,
        quantity: li.quantity,
        unit: li.unit,
        cost: li.cost ?? 0,
        class_id: li.class_id ?? '',
        labor_phase_id: li.labor_phase_id ?? '',
        task_notes: li.task_notes ?? '',
        show_task_notes: li.show_task_notes,
        is_hidden: li.is_hidden,
        image_url: '',
      });

      if (phasesRes.data) setLaborPhases(phasesRes.data);
      if (classesRes.data) setClasses(classesRes.data);

      if (li.product_id) {
        const { data: prod } = await supabase
          .from('products')
          .select(`
            id, sku, name, description, unit, unit_price, cost, our_price,
            default_labor_hours, image_url, product_link, manufacturer_model_number,
            item_type, is_taxable, labor_phase_id,
            manufacturer:manufacturers(name),
            vendor:vendors(vendor_name),
            category:product_categories(name),
            subcategory:product_subcategories(name),
            labor_phase:labor_phases(name, default_price)
          `)
          .eq('id', li.product_id)
          .maybeSingle();
        if (prod) {
          setMasterProduct(prod as MasterProduct);
          setForm(f => ({ ...f, image_url: prod.image_url ?? '' }));
        }
      }
    } catch (err) {
      console.error('Error loading line item:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!lineItem) return;
    setSaving(true);
    try {
      const updates: Record<string, unknown> = {
        description: form.description,
        quantity: form.quantity,
        unit: form.unit,
        cost: form.cost,
        class_id: form.class_id || null,
        labor_phase_id: form.labor_phase_id || null,
        task_notes: form.task_notes || null,
        show_task_notes: form.show_task_notes,
        is_hidden: form.is_hidden,
      };

      const { error: liErr } = await supabase
        .from('proposal_line_items')
        .update(updates)
        .eq('id', lineItemId);

      if (liErr) throw liErr;

      if (updateMaster && lineItem.product_id && masterProduct) {
        const productUpdates: Record<string, unknown> = {
          name: form.description,
          cost: form.cost,
          unit: form.unit,
        };
        if (form.labor_phase_id) productUpdates.labor_phase_id = form.labor_phase_id;
        if (form.image_url && form.image_url !== masterProduct.image_url) {
          productUpdates.image_url = form.image_url;
        }
        await supabase.from('products').update(productUpdates).eq('id', lineItem.product_id);
      }

      setSaved(true);
      setTimeout(() => {
        onSaved();
        onClose();
      }, 700);
    } catch (err) {
      console.error('Error saving line item:', err);
      alert('Failed to save changes.');
    } finally {
      setSaving(false);
    }
  }

  async function handleImageFile(file: File) {
    if (!lineItem?.product_id) return;
    setImageUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `products/${lineItem.product_id}/image_${Date.now()}.${ext}`;
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

  const currentImageUrl = form.image_url || masterProduct?.image_url || null;
  const isLabor = lineItem?.item_type === 'labor';

  const modal = (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center">
              {isLabor
                ? <Wrench className="w-4 h-4 text-blue-400" />
                : <Package className="w-4 h-4 text-gray-400" />}
            </div>
            <div>
              <h2 className="text-base font-semibold text-white leading-tight">
                {mode === 'edit' ? 'Edit Line Item' : 'Line Item Details'}
              </h2>
              {masterProduct?.sku && (
                <p className="text-xs text-cyan-400 font-mono mt-0.5">{masterProduct.sku}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {mode === 'view' && (
              <button
                onClick={() => setMode('edit')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-sm text-gray-200 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit Item
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <Loader2 className="w-7 h-7 text-blue-400 animate-spin" />
          </div>
        ) : lineItem ? (
          <div className="flex-1 overflow-y-auto">
            <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">

              {/* Left — Image + Catalog Info */}
              <div className="md:col-span-1 space-y-4">
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
                  {mode === 'edit' && lineItem.product_id && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center flex-col gap-1 text-white text-xs font-medium"
                    >
                      {imageUploading
                        ? <Loader2 className="w-6 h-6 animate-spin" />
                        : <><ImageIcon className="w-6 h-6" /><span>Change Image</span></>}
                    </button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => { if (e.target.files?.[0]) handleImageFile(e.target.files[0]); }}
                  />
                </div>

                {/* Catalog details */}
                <div className="bg-gray-800/60 rounded-xl border border-gray-700/50 p-4 space-y-2.5">
                  {masterProduct?.manufacturer?.name && (
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-xs text-gray-500 shrink-0">Manufacturer</span>
                      <span className="text-xs text-gray-300 text-right">{masterProduct.manufacturer.name}</span>
                    </div>
                  )}
                  {masterProduct?.manufacturer_model_number && (
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-xs text-gray-500 shrink-0">Model #</span>
                      <span className="text-xs text-gray-300 font-mono text-right">{masterProduct.manufacturer_model_number}</span>
                    </div>
                  )}
                  {masterProduct?.category?.name && (
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-xs text-gray-500 shrink-0">Category</span>
                      <span className="text-xs text-gray-300 text-right flex items-center gap-1">
                        {masterProduct.category.name}
                        {masterProduct.subcategory?.name && (
                          <><ChevronRight className="w-3 h-3 text-gray-600" />{masterProduct.subcategory.name}</>
                        )}
                      </span>
                    </div>
                  )}
                  {masterProduct?.vendor?.vendor_name && (
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-xs text-gray-500 shrink-0">Vendor</span>
                      <span className="text-xs text-gray-300 text-right">{masterProduct.vendor.vendor_name}</span>
                    </div>
                  )}
                  {masterProduct?.product_link && (
                    <a
                      href={masterProduct.product_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors mt-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Product Link
                    </a>
                  )}
                  {!masterProduct && (
                    <p className="text-xs text-gray-600 italic">Custom item — no catalog entry</p>
                  )}
                </div>
              </div>

              {/* Right — Fields */}
              <div className="md:col-span-2 space-y-4">

                {/* Description */}
                <Field label="Description">
                  {mode === 'edit' ? (
                    <input
                      type="text"
                      value={form.description}
                      onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
                    />
                  ) : (
                    <p className="text-sm text-white">{lineItem.description}</p>
                  )}
                </Field>

                {/* Qty + Unit + Cost row */}
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Quantity">
                    {mode === 'edit' ? (
                      <input
                        type="number"
                        value={form.quantity}
                        onChange={e => setForm(f => ({ ...f, quantity: parseFloat(e.target.value) || 0 }))}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
                        min="0" step="0.01"
                      />
                    ) : (
                      <p className="text-sm text-white font-medium">{lineItem.quantity}</p>
                    )}
                  </Field>
                  <Field label="Unit">
                    {mode === 'edit' ? (
                      <input
                        type="text"
                        value={form.unit}
                        onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
                        placeholder="ea"
                      />
                    ) : (
                      <p className="text-sm text-white">{lineItem.unit}</p>
                    )}
                  </Field>
                  <Field label="Cost">
                    {mode === 'edit' ? (
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                        <input
                          type="number"
                          value={form.cost}
                          onChange={e => setForm(f => ({ ...f, cost: parseFloat(e.target.value) || 0 }))}
                          className="w-full pl-7 pr-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
                          min="0" step="0.01"
                        />
                      </div>
                    ) : (
                      <p className="text-sm text-gray-300">${(lineItem.cost ?? 0).toFixed(2)}</p>
                    )}
                  </Field>
                </div>

                {/* Locked price fields */}
                <div className="grid grid-cols-3 gap-3">
                  <LockedField
                    label="Sale Price"
                    value={`$${lineItem.unit_price.toFixed(2)}`}
                    tooltip="Sold price — locked. Create a Change Order to modify pricing."
                  />
                  <LockedField
                    label="Labor Hrs"
                    value={lineItem.labor_hours != null ? String(lineItem.labor_hours) : '—'}
                    tooltip="Labor hours are locked after sale. Use a Change Order to adjust."
                  />
                  <LockedField
                    label="Labor Rate"
                    value={lineItem.labor_rate != null ? `$${lineItem.labor_rate.toFixed(2)}` : '—'}
                    tooltip="Labor rate is locked after sale."
                  />
                </div>

                {/* Labor Phase + Class */}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Labor Phase">
                    {mode === 'edit' ? (
                      <select
                        value={form.labor_phase_id}
                        onChange={e => setForm(f => ({ ...f, labor_phase_id: e.target.value }))}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 appearance-none cursor-pointer"
                      >
                        <option value="">— Unassigned —</option>
                        {laborPhases.map(p => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-sm text-gray-300">
                        {lineItem.labor_phases?.name ?? <span className="text-gray-600 italic">Unassigned</span>}
                      </p>
                    )}
                  </Field>
                  <Field label="Class">
                    {mode === 'edit' ? (
                      <select
                        value={form.class_id}
                        onChange={e => setForm(f => ({ ...f, class_id: e.target.value }))}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500 appearance-none cursor-pointer"
                      >
                        <option value="">— No Class —</option>
                        {classes.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    ) : (
                      lineItem.proposal_classes ? (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
                          style={{ background: lineItem.proposal_classes.color + '25', color: lineItem.proposal_classes.color }}
                        >
                          <Tag className="w-3 h-3" />
                          {lineItem.proposal_classes.name}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-600 italic">None</span>
                      )
                    )}
                  </Field>
                </div>

                {/* Task Notes */}
                <Field label="Install Notes">
                  {mode === 'edit' ? (
                    <div className="space-y-2">
                      <textarea
                        value={form.task_notes}
                        onChange={e => setForm(f => ({ ...f, task_notes: e.target.value }))}
                        rows={3}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm resize-none focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
                        placeholder="Internal install task notes..."
                      />
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={form.show_task_notes}
                          onChange={e => setForm(f => ({ ...f, show_task_notes: e.target.checked }))}
                          className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500/30"
                        />
                        <span className="text-xs text-gray-400">Show notes on portal/report</span>
                      </label>
                    </div>
                  ) : (
                    lineItem.task_notes ? (
                      <div className={`px-3 py-2 rounded-lg text-xs ${lineItem.show_task_notes ? 'bg-green-900/20 border border-green-700/30 text-green-300' : 'bg-orange-900/20 border border-orange-700/30 text-orange-300'}`}>
                        <span className="font-semibold">{lineItem.show_task_notes ? 'Public: ' : 'Internal: '}</span>
                        {lineItem.task_notes}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-600 italic">No notes</span>
                    )
                  )}
                </Field>

                {/* Hidden toggle (edit only) */}
                {mode === 'edit' && (
                  <label className="flex items-center gap-2 cursor-pointer select-none group">
                    <input
                      type="checkbox"
                      checked={form.is_hidden}
                      onChange={e => setForm(f => ({ ...f, is_hidden: e.target.checked }))}
                      className="rounded border-gray-600 bg-gray-700 text-amber-500 focus:ring-amber-500/30"
                    />
                    <span className="text-xs text-gray-400 group-hover:text-gray-300 transition-colors">
                      Hide this item (internal use only, not shown on portal)
                    </span>
                  </label>
                )}

                {/* Update master toggle (edit only, if product exists and user can edit) */}
                {mode === 'edit' && lineItem.product_id && canEditProducts && (
                  <div className="flex items-start gap-3 px-3 py-2.5 bg-blue-900/20 border border-blue-700/30 rounded-xl">
                    <input
                      type="checkbox"
                      id="update-master"
                      checked={updateMaster}
                      onChange={e => setUpdateMaster(e.target.checked)}
                      className="mt-0.5 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500/30 shrink-0"
                    />
                    <label htmlFor="update-master" className="cursor-pointer">
                      <p className="text-xs font-medium text-blue-300">Also update master product catalog</p>
                      <p className="text-xs text-blue-400/70 mt-0.5">Saves description, cost, unit, image and labor phase to the master product record.</p>
                    </label>
                  </div>
                )}

                {/* Locked notice in view mode */}
                {mode === 'view' && (
                  <div className="flex items-start gap-2 px-3 py-2.5 bg-gray-800/60 border border-gray-700/40 rounded-xl">
                    <AlertCircle className="w-3.5 h-3.5 text-gray-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-gray-500">
                      Sale price, labor hours, and labor rate are locked. To change pricing, create a <span className="text-gray-400 font-medium">Change Order</span>.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center py-16 text-gray-500 text-sm">
            Item not found.
          </div>
        )}

        {/* Footer */}
        {!loading && lineItem && (
          <div className="px-6 py-4 border-t border-gray-700/60 flex items-center justify-between shrink-0">
            <div className="text-xs text-gray-500">
              {mode === 'edit' && (
                <span className="flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  Price fields are locked
                </span>
              )}
              {mode === 'view' && masterProduct?.sku && (
                <span className="font-mono text-cyan-600">{masterProduct.sku}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {mode === 'view' ? (
                <>
                  <button
                    onClick={onClose}
                    className="px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => setMode('edit')}
                    className="flex items-center gap-1.5 px-4 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-sm text-gray-200 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Edit Item
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => { setMode('view'); setUpdateMaster(false); }}
                    className="px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || saved}
                    className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                      saved
                        ? 'bg-green-600 text-white'
                        : saving
                          ? 'bg-blue-700 text-white cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-500 text-white'
                    }`}
                  >
                    {saved ? (
                      <><Check className="w-4 h-4" />Saved</>
                    ) : saving ? (
                      <><Loader2 className="w-4 h-4 animate-spin" />Saving...</>
                    ) : (
                      <><Save className="w-4 h-4" />Save Changes{updateMaster ? ' + Master' : ''}</>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

function LockedField({ label, value, tooltip }: { label: string; value: string; tooltip: string }) {
  return (
    <div title={tooltip}>
      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
        <Lock className="w-2.5 h-2.5 text-gray-600" />
        {label}
      </label>
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-800/40 border border-gray-700/30 rounded-lg cursor-not-allowed">
        <span className="text-sm text-gray-600 tabular-nums font-medium">{value}</span>
      </div>
    </div>
  );
}
