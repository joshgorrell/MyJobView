import type { ProductDetailPanelData } from './ProductDetailPanel';
const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
export default function CatalogProductOverview({ data }: { data: ProductDetailPanelData }) {
  const row = (label: string, value: any) => <div key={label} className="flex justify-between gap-3 text-xs py-1"><span className="text-gray-500">{label}</span><span className="font-medium text-right break-words min-w-0">{value || '—'}</span></div>;
  return <div className="grid grid-cols-1 md:grid-cols-[10rem_minmax(0,1fr)] gap-4">
    <div className="flex md:block gap-3">{data.imageUrl ? <img alt={data.productName} src={data.imageUrl} className="w-24 h-24 md:w-full md:h-36 object-contain rounded-lg border bg-white" /> : <div className="w-24 h-24 md:w-full md:h-36 bg-gray-100 rounded-lg flex items-center justify-center text-xs text-gray-500">No photo</div>}<div className="mt-2 min-w-0 flex-1">{row('Manufacturer', data.manufacturerName)}{row('Model', data.modelNumber)}{row('SKU', data.sku)}{row('UPC', data.upc)}{row('Vendor', data.vendorName)}{row('Color', data.itemColor)}{row('Size', data.itemSize)}</div></div>
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <section className="border rounded-lg p-3 bg-white"><h3 className="text-sm font-semibold mb-1">Pricing</h3>{row('Unit price', money(data.unitPrice))}{row('Cost', money(data.cost))}{row('Material margin', data.unitPrice > 0 ? `${((data.unitPrice - data.cost) / data.unitPrice * 100).toFixed(1)}%` : '—')}{row('MSRP', data.msrp != null ? money(data.msrp) : null)}</section>
        <section className="border rounded-lg p-3 bg-white"><h3 className="text-sm font-semibold mb-1">Inventory</h3>{row('Type', data.inventoryType)}{row('Default quantity', data.quantity)}{row('Unit', data.unit)}</section>
        <section className="border rounded-lg p-3 bg-white"><h3 className="text-sm font-semibold mb-1">Labor</h3>{row('Phase', data.laborPhaseName)}{row('Hours / unit', data.laborHours)}{row('Rate / hour', money(data.laborRate))}{row('Labor total', money(data.laborHours * data.laborRate * data.quantity))}</section>
      </div>
      <section className="border rounded-lg p-3 bg-white"><h3 className="text-sm font-semibold mb-1">Sales description</h3><p className="text-sm text-gray-700 line-clamp-3 break-words whitespace-pre-wrap">{data.description || 'No description.'}</p><p className="text-xs text-gray-500 mt-1">Full descriptions and specifications are in Details.</p></section>
      <div className="flex flex-wrap gap-2">{[['Manufacturer', data.manufacturerUrl], ['Supplier', data.supplierUrl], ['Product sheet', data.productSheetUrl], ['Install video', data.installVideoUrl]].filter(([,url]) => !!url).map(([label,url]) => <a key={label} href={url!} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-700 border rounded px-2 py-1 bg-white">{label}</a>)}</div>
    </div>
  </div>;
}
