import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { X, Package, Loader2 } from 'lucide-react';
import ProductDetailPanel, { type ProductDetailPanelData } from '../Products/ProductDetailPanel';

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unit: string | null;
  unit_price: number;
  line_total: number;
  product_id: string | null;
  products?: {
    name: string;
    sku: string | null;
  } | null;
}

interface SalesOrderProductDetailModalProps {
  lineItem: LineItem;
  onClose: () => void;
  onSaved?: () => void;
}

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function SalesOrderProductDetailModal({ lineItem, onClose }: SalesOrderProductDetailModalProps) {
  const [panelData, setPanelData] = useState<ProductDetailPanelData | null>(null);
  const [loading, setLoading] = useState(!!lineItem.product_id);
  const [productName, setProductName] = useState(lineItem.products?.name || lineItem.description);
  const [category, setCategory] = useState<string | null>(null);
  const [subcategory, setSubcategory] = useState<string | null>(null);

  useEffect(() => {
    if (lineItem.product_id) {
      loadProduct();
    } else {
      setPanelData(null);
      setLoading(false);
    }
  }, [lineItem.id]);

  async function loadProduct() {
    try {
      const { data: p, error } = await supabase
        .from('products')
        .select(`
          id, manufacturer_model_number, name, category, subcategory, sku, upc,
          inventory_type, item_color, item_size, cost, our_price, unit_price, msrp,
          image_url, thumbnail_url, manufacturer_url, supplier_url,
          product_sheet_url, install_video_url, description, specifications,
          default_labor_hours, labor_phase_id,
          manufacturers(name), labor_phases(name, default_price)
        `)
        .eq('id', lineItem.product_id!)
        .maybeSingle();

      if (error) throw error;
      if (!p) return;

      const mfr = Array.isArray(p.manufacturers) ? p.manufacturers[0] ?? null : p.manufacturers;
      const lp = Array.isArray(p.labor_phases) ? p.labor_phases[0] ?? null : p.labor_phases;

      setProductName(p.manufacturer_model_number || p.name || lineItem.description);
      setCategory(p.category || null);
      setSubcategory(p.subcategory || null);

      setPanelData({
        productId: p.id,
        productName: p.manufacturer_model_number || p.name || '',
        sku: p.sku || null,
        upc: p.upc || null,
        category: p.category || null,
        subcategory: p.subcategory || null,
        inventoryType: p.inventory_type || null,
        itemColor: p.item_color || null,
        itemSize: p.item_size || null,
        manufacturerName: mfr?.name || null,
        imageUrl: p.image_url || p.thumbnail_url || null,
        manufacturerUrl: p.manufacturer_url || null,
        supplierUrl: p.supplier_url || null,
        productSheetUrl: p.product_sheet_url || null,
        installVideoUrl: p.install_video_url || null,
        description: p.description || null,
        specifications: p.specifications || null,
        unitPrice: Number(p.our_price || p.unit_price || 0),
        cost: Number(p.cost || 0),
        msrp: p.msrp ? Number(p.msrp) : null,
        quantity: lineItem.quantity,
        unit: lineItem.unit || 'ea',
        laborHours: Number(p.default_labor_hours || 0),
        laborRate: Number(lp?.default_price || 0),
        laborPhaseId: p.labor_phase_id || null,
        laborPhaseName: lp?.name || null,
        classId: null,
        taskNotes: null,
        showTaskNotes: false,
        isTaxable: false,
        isHidden: false,
      });
    } catch (err) {
      console.error('Error loading product:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-none sm:rounded-xl shadow-2xl w-full max-w-5xl flex flex-col h-screen sm:h-auto sm:max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-gray-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-8 h-8 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-center shrink-0">
              <Package className="w-4 h-4 text-blue-500" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-gray-900 truncate">{productName}</h2>
              {category && (
                <p className="text-xs text-gray-500 mt-0.5 truncate">
                  {category}{subcategory ? ` / ${subcategory}` : ''}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors shrink-0 ml-3"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Line item summary bar */}
        <div className="px-5 py-2.5 bg-blue-50 border-b border-blue-100 shrink-0 flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5 text-gray-600">
            <span className="font-medium text-gray-900">{lineItem.quantity}</span>
            <span className="text-gray-500">{lineItem.unit || 'ea'}</span>
            <span className="text-gray-400 mx-1">×</span>
            <span className="font-medium text-gray-900">${fmt(lineItem.unit_price)}</span>
          </div>
          <div className="h-4 w-px bg-blue-200" />
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500">Line Total:</span>
            <span className="font-semibold text-gray-900">${fmt(lineItem.line_total)}</span>
          </div>
          <div className="flex-1" />
          <span className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full font-medium">View Only</span>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-3">
              <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
              <span className="text-sm text-gray-500">Loading product details...</span>
            </div>
          ) : panelData ? (
            <ProductDetailPanel mode="view" data={panelData} />
          ) : (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center">
                <Package className="w-6 h-6 text-gray-400" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-700">{lineItem.description}</p>
                <p className="text-xs text-gray-400 mt-1">No catalog product linked to this line item</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
