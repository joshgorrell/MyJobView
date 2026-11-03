import type { ProductDetailPanelData } from './ProductDetailPanel';
const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
type EditableOverviewField = 'modelNumber' | 'sku' | 'itemColor' | 'unitPrice' | 'cost' | 'quantity' | 'unit' | 'laborHours' | 'description';
type OverviewProps = {
  data: ProductDetailPanelData;
  editing?: boolean;
  onFieldChange?: (field: EditableOverviewField, value: string) => void;
};
export default function CatalogProductOverview({ data, editing = false, onFieldChange }: OverviewProps) {
  const field = (key: EditableOverviewField, label: string, value: string | number | null | undefined, numeric = false) =>
    editing ? <label className="flex items-center justify-between gap-2 text-xs py-0.5 sm:py-1" key={key}>
      <span className="text-gray-500 shrink-0">{label}</span>
      <input aria-label={label} type={numeric ? 'number' : 'text'} min={numeric ? 0 : undefined} step={numeric ? 'any' : undefined}
        value={value ?? ''} onChange={e => onFieldChange?.(key, e.target.value)}
        className="w-full min-w-0 max-w-36 rounded border border-gray-300 bg-white text-gray-900 px-2 py-1 text-right text-xs" />
    </label> : row(label, value);
  const row = (label: string, value: any) => <div key={label} className="flex justify-between gap-3 text-xs py-0.5 sm:py-1"><span className="text-gray-500">{label}</span><span className="font-medium text-right break-words min-w-0">{value || '—'}</span></div>;
  return <div className="space-y-2 sm:space-y-3">
    <section className="rounded-lg border bg-white p-2.5 sm:p-3">
      <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] sm:grid-cols-[9rem_minmax(0,1fr)] gap-2 sm:gap-4 items-start">
        {data.imageUrl ? <img alt={data.productName} src={data.imageUrl} className="w-full h-24 sm:h-32 object-contain rounded-lg border bg-white" /> : <div className="w-full h-24 sm:h-32 bg-gray-100 rounded-lg flex items-center justify-center text-xs text-gray-500">No photo</div>}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold mb-1 sm:mb-2">Product information</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
            {row('Manufacturer', data.manufacturerName)}
            {field('modelNumber', 'Model', data.modelNumber)}
            {field('sku', 'SKU', data.sku)}
            {row('Vendor', data.vendorName)}
            {field('itemColor', 'Color', data.itemColor)}
          </div>
        </div>
      </div>
    </section>
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
        <section className="border rounded-lg p-2.5 sm:p-3 bg-white"><h3 className="text-sm font-semibold mb-1">Pricing</h3>{field('unitPrice', 'Unit price', editing ? data.unitPrice : money(data.unitPrice), true)}{field('cost', 'Cost', editing ? data.cost : money(data.cost), true)}{row('Material margin', data.unitPrice > 0 ? `${((data.unitPrice - data.cost) / data.unitPrice * 100).toFixed(1)}%` : '—')}{row('MSRP', data.msrp != null ? money(data.msrp) : null)}</section>
        <section className="border rounded-lg p-2.5 sm:p-3 bg-white"><h3 className="text-sm font-semibold mb-1">Inventory</h3>{row('Type', data.inventoryType)}{field('quantity', 'Default quantity', data.quantity, true)}{field('unit', 'Unit', data.unit)}</section>
        <section className="border rounded-lg p-2.5 sm:p-3 bg-white"><h3 className="text-sm font-semibold mb-1">Labor</h3>{row('Phase', data.laborPhaseName)}{field('laborHours', 'Hours / unit', data.laborHours, true)}{row('Rate / hour', money(data.laborRate))}{row('Labor total', money(data.laborHours * data.laborRate * data.quantity))}</section>
      </div>
      <section className="border rounded-lg p-2.5 sm:p-3 bg-white"><h3 className="text-sm font-semibold mb-1">Sales description</h3>{editing ? <textarea aria-label="Sales description" value={data.description || ''} onChange={e => onFieldChange?.('description', e.target.value)} rows={3} className="w-full rounded border border-gray-300 bg-white text-gray-900 p-2 text-sm" /> : <p className="text-sm text-gray-700 break-words whitespace-pre-wrap">{data.description || 'No description.'}</p>}<p className="text-xs text-gray-500 mt-1">Full descriptions and specifications are in Details.</p></section>
      <div className="flex flex-wrap gap-2">{[['Manufacturer', data.manufacturerUrl], ['Supplier', data.supplierUrl], ['Product sheet', data.productSheetUrl], ['Install video', data.installVideoUrl]].filter(([,url]) => !!url).map(([label,url]) => <a key={label} href={url!} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-700 border rounded px-2 py-1 bg-white">{label}</a>)}</div>
    </div>
  </div>;
}
