import React, { useRef } from 'react';
import {
  Package, DollarSign, Wrench, Upload, Pencil, ExternalLink,
  FileText, Video, Building2, Tag, Hash, Ruler, Palette, Gift
} from 'lucide-react';

export interface ProductDetailPanelData {
  productId: string | null;
  productName: string;
  sku: string | null;
  upc: string | null;
  category: string | null;
  subcategory: string | null;
  inventoryType: string | null;
  itemColor: string | null;
  itemSize: string | null;
  manufacturerName: string | null;
  imageUrl: string | null;
  manufacturerUrl: string | null;
  supplierUrl: string | null;
  productSheetUrl: string | null;
  installVideoUrl: string | null;
  description: string | null;
  specifications: string | null;
  unitPrice: number;
  cost: number;
  msrp: number | null;
  quantity: number;
  unit: string;
  laborHours: number;
  laborRate: number;
  laborPhaseId: string | null;
  laborPhaseName: string | null;
  classId: string | null;
  taskNotes: string | null;
  showTaskNotes: boolean;
  isTaxable: boolean;
  isHidden: boolean;
  isCustomerSupplied: boolean;
  isLaborItem: boolean;
}

export interface LaborPhaseOption {
  id: string;
  name: string;
  default_price?: number;
}

export interface ClassOption {
  id: string;
  name: string;
  color?: string;
}

interface ProductDetailPanelProps {
  mode: 'view' | 'edit';
  data: ProductDetailPanelData;
  laborPhases?: LaborPhaseOption[];
  classes?: ClassOption[];
  previewImageUrl?: string | null;
  imagePasted?: boolean;
  onImageSelect?: (file: File) => void;
  onChange?: (field: keyof ProductDetailPanelData, value: any) => void;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <span className="text-xs text-gray-500 shrink-0">{label}</span>
      <span className="text-xs font-medium text-gray-900 text-right truncate">{value}</span>
    </div>
  );
}

export default function ProductDetailPanel({
  mode,
  data,
  laborPhases = [],
  classes = [],
  previewImageUrl,
  imagePasted,
  onImageSelect,
  onChange,
}: ProductDetailPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const materialTotal = data.isCustomerSupplied ? 0 : data.unitPrice * data.quantity;
  const laborTotal = (data.laborHours || 0) * data.quantity * (data.laborRate || 0);
  const totalRevenue = materialTotal + laborTotal;
  const totalCost = data.isCustomerSupplied ? 0 : data.cost * data.quantity;
  const profit = totalRevenue - totalCost;
  const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

  const displayImage = previewImageUrl || data.imageUrl;
  const isEdit = mode === 'edit';

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && onImageSelect) onImageSelect(file);
  }

  const marginColor = margin >= 30 ? 'text-emerald-700' : margin >= 15 ? 'text-amber-600' : 'text-red-600';
  const marginBg = margin >= 30 ? 'bg-emerald-50 border-emerald-200' : margin >= 15 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200';

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full">
      {isEdit && (
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
      )}

      {/* TOP / LEFT: Image + Product Identity */}
      <div className="w-full lg:w-40 lg:shrink-0 flex flex-row lg:flex-col gap-3">
        {/* Image */}
        <div className="relative group w-28 sm:w-36 lg:w-full shrink-0">
          {displayImage ? (
            <div className="relative">
              <img
                src={displayImage}
                alt={data.productName}
                className={`w-full h-28 sm:h-36 lg:h-36 object-cover rounded-lg border border-gray-200 shadow-sm ${isEdit && data.productId ? 'cursor-pointer' : ''}`}
                onClick={() => isEdit && data.productId && fileInputRef.current?.click()}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23f3f4f6" width="200" height="200"/%3E%3C/svg%3E';
                }}
              />
              {previewImageUrl && (
                <span className="absolute top-1 right-1 text-xs px-1.5 py-0.5 bg-blue-500 text-white rounded font-medium shadow">
                  {imagePasted ? 'Pasted' : 'New'}
                </span>
              )}
              {isEdit && data.productId && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-1 right-1 w-7 h-7 bg-white hover:bg-gray-50 rounded-md flex items-center justify-center shadow border border-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Pencil className="w-3 h-3 text-gray-600" />
                </button>
              )}
            </div>
          ) : (
            <div
              onClick={() => isEdit && data.productId && fileInputRef.current?.click()}
              className={`w-full h-28 sm:h-36 lg:h-36 bg-gray-100 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 ${isEdit && data.productId ? 'cursor-pointer hover:border-gray-400 hover:bg-gray-50' : ''} transition-all`}
            >
              <Upload className="w-6 h-6 mb-1" />
              <span className="text-xs">No image</span>
              {isEdit && <span className="text-xs text-gray-400">Click to upload</span>}
            </div>
          )}
        </div>

        {/* Product identity info + resources (stacked on mobile, beside image on small, below on lg) */}
        <div className="flex-1 lg:flex-none flex flex-col gap-2 min-w-0">
          <div className="bg-gray-50 rounded-lg border border-gray-200 p-2 space-y-1">
            <div className="text-xs font-semibold text-gray-700 flex items-center gap-1 mb-1">
              <Package className="w-3 h-3" /> Product Info
            </div>
            {data.manufacturerName && <InfoRow label="Mfr" value={data.manufacturerName} />}
            {data.sku && <InfoRow label="SKU" value={data.sku} />}
            {data.upc && <InfoRow label="UPC" value={data.upc} />}
            {data.msrp && data.msrp > 0 && <InfoRow label="MSRP" value={formatCurrency(data.msrp)} />}
            {data.itemColor && (
              <div className="flex items-baseline gap-1 py-0.5">
                <Palette className="w-2.5 h-2.5 text-gray-400 shrink-0" />
                <span className="text-xs text-gray-700 truncate">{data.itemColor}</span>
              </div>
            )}
            {data.itemSize && (
              <div className="flex items-baseline gap-1 py-0.5">
                <Ruler className="w-2.5 h-2.5 text-gray-400 shrink-0" />
                <span className="text-xs text-gray-700">{data.itemSize}</span>
              </div>
            )}
            {data.inventoryType && (
              <div className="flex items-baseline gap-1 py-0.5">
                <Tag className="w-2.5 h-2.5 text-gray-400 shrink-0" />
                <span className="text-xs text-gray-700 capitalize">{data.inventoryType}</span>
              </div>
            )}
            {isEdit ? (
              <div className="pt-1">
                <label className="block text-xs text-gray-500 mb-0.5">Description</label>
                <textarea
                  value={data.description || ''}
                  onChange={(e) => onChange?.('description', e.target.value)}
                  rows={2}
                  className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 text-gray-900 bg-white resize-none"
                  placeholder="Product description..."
                />
              </div>
            ) : (
              data.description && (
                <div className="pt-1">
                  <span className="text-xs text-gray-500">Description</span>
                  <p className="text-xs text-gray-700 leading-relaxed line-clamp-3">{data.description}</p>
                </div>
              )
            )}
          </div>

          {(data.manufacturerUrl || data.supplierUrl || data.productSheetUrl || data.installVideoUrl) && (
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-2">
              <div className="text-xs font-semibold text-gray-700 mb-1.5">Resources</div>
              <div className="flex flex-wrap gap-1.5">
                {data.manufacturerUrl && (
                  <a href={data.manufacturerUrl} target="_blank" rel="noopener noreferrer"
                    title="Manufacturer" className="flex items-center gap-1 px-1.5 py-0.5 bg-white border border-gray-200 rounded text-xs text-blue-600 hover:bg-blue-50 transition-colors">
                    <Building2 className="w-3 h-3" /> Mfr
                  </a>
                )}
                {data.supplierUrl && (
                  <a href={data.supplierUrl} target="_blank" rel="noopener noreferrer"
                    title="Supplier" className="flex items-center gap-1 px-1.5 py-0.5 bg-white border border-gray-200 rounded text-xs text-blue-600 hover:bg-blue-50 transition-colors">
                    <ExternalLink className="w-3 h-3" /> Supplier
                  </a>
                )}
                {data.productSheetUrl && (
                  <a href={data.productSheetUrl} target="_blank" rel="noopener noreferrer"
                    title="Product Sheet" className="flex items-center gap-1 px-1.5 py-0.5 bg-white border border-gray-200 rounded text-xs text-blue-600 hover:bg-blue-50 transition-colors">
                    <FileText className="w-3 h-3" /> Sheet
                  </a>
                )}
                {data.installVideoUrl && (
                  <a href={data.installVideoUrl} target="_blank" rel="noopener noreferrer"
                    title="Install Video" className="flex items-center gap-1 px-1.5 py-0.5 bg-white border border-gray-200 rounded text-xs text-blue-600 hover:bg-blue-50 transition-colors">
                    <Video className="w-3 h-3" /> Video
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CENTER: Product name, description, pricing, labor */}
      <div className="flex-1 flex flex-col gap-2 min-w-0">
        {/* Name + category strip */}
        <div>
          <div className="flex items-start gap-2">
            {data.category && (
              <div className="flex items-center gap-1 text-xs text-gray-500 shrink-0 mt-0.5">
                <Hash className="w-3 h-3" />
                <span>{data.category}{data.subcategory ? ` / ${data.subcategory}` : ''}</span>
              </div>
            )}
          </div>
          {isEdit ? (
            <input
              type="text"
              value={data.productName}
              onChange={(e) => onChange?.('productName', e.target.value)}
              className="w-full px-2 py-1.5 text-sm font-semibold border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 text-gray-900 bg-white mt-1"
              placeholder="Item description"
            />
          ) : (
            <h3 className="text-sm font-bold text-gray-900 leading-tight mt-0.5">{data.productName}</h3>
          )}
        </div>

        {/* Qty + Unit (edit only) */}
        {isEdit && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Qty</label>
              <input
                type="number"
                value={data.quantity}
                step="0.01"
                onChange={(e) => onChange?.('quantity', parseFloat(e.target.value) || 0)}
                className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 text-gray-900 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Unit</label>
              <input
                type="text"
                value={data.unit}
                placeholder="ea"
                onChange={(e) => onChange?.('unit', e.target.value)}
                className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 text-gray-900 bg-white"
              />
            </div>
          </div>
        )}

        {/* Material Pricing */}
        <div className={`border rounded-lg p-2 ${data.isCustomerSupplied ? 'bg-gray-100 border-gray-300 opacity-60' : 'bg-blue-50 border-blue-200'}`}>
          <div className="flex items-center gap-1 text-xs font-semibold text-blue-800 mb-1.5">
            <DollarSign className="w-3 h-3" /> Material
            {data.isCustomerSupplied && <span className="text-amber-600 font-normal">(Customer Supplied)</span>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-blue-700 mb-0.5">Cost</label>
              {isEdit ? (
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                  <input
                    type="number"
                    value={data.isCustomerSupplied ? 0 : (data.cost || '')}
                    step="0.01"
                    placeholder="0.00"
                    disabled={data.isCustomerSupplied}
                    onChange={(e) => onChange?.('cost', parseFloat(e.target.value) || 0)}
                    className="w-full pl-5 pr-2 py-1 text-xs border border-blue-300 rounded focus:ring-1 focus:ring-blue-500 text-gray-900 bg-white disabled:bg-gray-100 disabled:text-gray-400"
                  />
                </div>
              ) : (
                <span className="text-sm font-bold text-blue-900">{formatCurrency(data.isCustomerSupplied ? 0 : data.cost)}</span>
              )}
            </div>
            <div>
              <label className="block text-xs text-blue-700 mb-0.5">Unit Price</label>
              {isEdit ? (
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                  <input
                    type="number"
                    value={data.isCustomerSupplied ? 0 : data.unitPrice}
                    step="0.01"
                    disabled={data.isCustomerSupplied}
                    onChange={(e) => onChange?.('unitPrice', parseFloat(e.target.value) || 0)}
                    className="w-full pl-5 pr-2 py-1 text-xs border border-blue-300 rounded focus:ring-1 focus:ring-blue-500 text-gray-900 bg-white disabled:bg-gray-100 disabled:text-gray-400"
                  />
                </div>
              ) : (
                <span className="text-sm font-bold text-blue-900">{formatCurrency(data.isCustomerSupplied ? 0 : data.unitPrice)}</span>
              )}
            </div>
          </div>
          {(isEdit || data.quantity > 1) && (
            <div className="text-right mt-1">
              <span className="text-xs text-blue-700">Total: </span>
              <span className="text-xs font-bold text-blue-900">{formatCurrency(materialTotal)}</span>
            </div>
          )}
        </div>

        {/* Labor */}
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-2">
          <div className="flex items-center gap-1 text-xs font-semibold text-orange-800 mb-1.5">
            <Wrench className="w-3 h-3" /> Labor
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs text-orange-700 mb-0.5">Hours</label>
              {isEdit ? (
                <input
                  type="number"
                  value={data.laborHours || ''}
                  step="0.25"
                  placeholder="0"
                  onChange={(e) => onChange?.('laborHours', parseFloat(e.target.value) || 0)}
                  className="w-full px-2 py-1 text-xs border border-orange-300 rounded focus:ring-1 focus:ring-orange-400 text-gray-900 bg-white"
                />
              ) : (
                <span className="text-sm font-bold text-orange-900">{data.laborHours || 0} hrs</span>
              )}
            </div>
            <div>
              <label className="block text-xs text-orange-700 mb-0.5">Rate/hr</label>
              {isEdit ? (
                <div className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                  <input
                    type="number"
                    value={data.laborRate || ''}
                    step="0.01"
                    placeholder="0"
                    onChange={(e) => onChange?.('laborRate', parseFloat(e.target.value) || 0)}
                    className="w-full pl-5 pr-2 py-1 text-xs border border-orange-300 rounded focus:ring-1 focus:ring-orange-400 text-gray-900 bg-white"
                  />
                </div>
              ) : (
                <span className="text-sm font-bold text-orange-900">{formatCurrency(data.laborRate)}/hr</span>
              )}
            </div>
            <div>
              <label className="block text-xs text-orange-700 mb-0.5">Phase</label>
              {isEdit ? (
                <select
                  value={data.laborPhaseId || ''}
                  onChange={(e) => onChange?.('laborPhaseId', e.target.value || null)}
                  className="w-full px-1.5 py-1 text-xs border border-orange-300 rounded focus:ring-1 focus:ring-orange-400 text-gray-900 bg-white"
                >
                  <option value="">None</option>
                  {laborPhases.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              ) : (
                <span className="text-xs font-medium text-orange-900">{data.laborPhaseName || '—'}</span>
              )}
            </div>
          </div>
          {(isEdit || data.laborHours > 0) && (
            <div className="text-right mt-1">
              <span className="text-xs text-orange-700">Total: </span>
              <span className="text-xs font-bold text-orange-900">{formatCurrency(laborTotal)}</span>
            </div>
          )}
        </div>

        {/* Task Notes (full width) */}
        <div>
          {isEdit ? (
            <>
              <label className="block text-xs text-gray-500 mb-0.5">Task Notes</label>
              <textarea
                value={data.taskNotes || ''}
                onChange={(e) => onChange?.('taskNotes', e.target.value)}
                rows={2}
                className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 text-gray-900 bg-white resize-none"
                placeholder="Install notes for technicians..."
              />
            </>
          ) : (
            data.taskNotes ? (
              <>
                <label className="block text-xs text-gray-500 mb-0.5">Task Notes</label>
                <p className="text-xs text-gray-700 leading-relaxed line-clamp-3">{data.taskNotes}</p>
              </>
            ) : (
              data.specifications ? (
                <>
                  <label className="block text-xs text-gray-500 mb-0.5">Specifications</label>
                  <p className="text-xs text-gray-700 line-clamp-3">{data.specifications}</p>
                </>
              ) : null
            )
          )}
        </div>
      </div>

      {/* RIGHT / BOTTOM: Financials + edit options */}
      <div className="w-full lg:w-36 lg:shrink-0 flex flex-row lg:flex-col gap-2">
        {/* Financial summary */}
        <div className={`rounded-lg border p-2 flex-1 lg:flex-none ${marginBg}`}>
          <div className="text-xs font-semibold text-gray-700 mb-1.5">Financials</div>
          <div className="space-y-1">
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-gray-500">Revenue</span>
              <span className="text-xs font-bold text-gray-900">{formatCurrency(totalRevenue)}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-gray-500">Cost</span>
              <span className="text-xs font-medium text-gray-700">{formatCurrency(totalCost)}</span>
            </div>
            <div className="border-t border-gray-200 pt-1 mt-1">
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-gray-500">Profit</span>
                <span className={`text-xs font-bold ${profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {formatCurrency(profit)}
                </span>
              </div>
              <div className="flex justify-between items-baseline mt-0.5">
                <span className="text-xs text-gray-500">Margin</span>
                <span className={`text-sm font-bold ${marginColor}`}>{margin.toFixed(1)}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Total installed (view mode) */}
        {!isEdit && (data.laborHours > 0) && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-2 flex-1 lg:flex-none">
            <div className="text-xs text-gray-500 mb-0.5">Total Installed</div>
            <div className="text-sm font-bold text-gray-900">{formatCurrency(totalRevenue)}</div>
            <div className="text-xs text-gray-400">material + labor</div>
          </div>
        )}

        {/* Edit-only options */}
        {isEdit && (
          <div className="flex flex-col gap-2 flex-1 lg:flex-none">
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Class</label>
              <select
                value={data.classId || ''}
                onChange={(e) => onChange?.('classId', e.target.value || null)}
                className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 text-gray-900 bg-white"
              >
                <option value="">None</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={data.isHidden}
                  onChange={(e) => onChange?.('isHidden', e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 w-3.5 h-3.5"
                />
                <span className="text-xs text-gray-600">Hidden from customer</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-not-allowed opacity-60 select-none" title="Managed by tax rules">
                <input
                  type="checkbox"
                  checked={data.isTaxable}
                  disabled
                  className="rounded border-gray-300 text-blue-600 w-3.5 h-3.5 cursor-not-allowed"
                />
                <span className="text-xs text-gray-600">Taxable</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={data.isCustomerSupplied}
                  onChange={(e) => onChange?.('isCustomerSupplied', e.target.checked)}
                  className="rounded border-gray-300 text-amber-600 w-3.5 h-3.5"
                />
                <span className="text-xs text-gray-600 flex items-center gap-1">
                  <Gift className="w-3 h-3 text-amber-500" />
                  Customer Supplied
                </span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={data.isLaborItem}
                  onChange={(e) => onChange?.('isLaborItem', e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 w-3.5 h-3.5"
                />
                <span className="text-xs text-gray-600">Labor Item</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={data.showTaskNotes}
                  onChange={(e) => onChange?.('showTaskNotes', e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 w-3.5 h-3.5"
                />
                <span className="text-xs text-gray-600">Show task notes on proposal</span>
              </label>
            </div>
          </div>
        )}

        {/* View mode: additional identifiers */}
        {!isEdit && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-2 space-y-0.5 flex-1 lg:flex-none">
            {data.quantity !== 1 && <InfoRow label="Qty" value={`${data.quantity} ${data.unit}`} />}
            {data.msrp && data.msrp > 0 && <InfoRow label="MSRP" value={formatCurrency(data.msrp)} />}
          </div>
        )}
      </div>
    </div>
  );
}
