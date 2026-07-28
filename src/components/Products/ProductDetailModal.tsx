import { useState, useEffect } from 'react';
import { X, CreditCard as Edit } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ProductUsageHistory } from './ProductUsageHistory';
import { useAuth } from '../../contexts/AuthContext';
import ProductDetailPanel, { type ProductDetailPanelData } from './ProductDetailPanel';

interface ProductDetailModalProps {
  productId: string;
  onClose: () => void;
  onEdit?: () => void;
}

export function ProductDetailModal({ productId, onClose, onEdit }: ProductDetailModalProps) {
  const { profile } = useAuth();
  const canEdit = profile?.can_edit_products ?? false;
  const [panelData, setPanelData] = useState<ProductDetailPanelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'details' | 'history'>('details');
  const [auditInfo, setAuditInfo] = useState<{ createdAt: string; createdBy: string; updatedAt: string; updatedBy: string } | null>(null);

  useEffect(() => {
    loadProduct();
  }, [productId]);

  async function loadProduct() {
    try {
      const { data: p, error } = await supabase
        .from('products')
        .select('*, manufacturers(name), labor_phases(name, default_price)')
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
        manufacturerName: p.manufacturers?.name || null,
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
        isLaborItem: false,
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
      <div className="bg-white rounded-none sm:rounded-xl shadow-2xl w-full max-w-5xl flex flex-col h-screen sm:h-auto sm:max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-gray-200 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-900 truncate">{panelData.productName}</h2>
            {panelData.category && (
              <p className="text-xs text-gray-500 mt-0.5 truncate">
                {panelData.category}{panelData.subcategory ? ` / ${panelData.subcategory}` : ''}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <div className="flex gap-1 border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setActiveTab('details')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${activeTab === 'details' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                Details
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${activeTab === 'history' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                Usage History
              </button>
            </div>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'details' ? (
            <>
              <ProductDetailPanel mode="view" data={panelData} />
              {auditInfo && (
                <div className="mt-3 pt-3 border-t border-gray-100 flex gap-6 text-xs text-gray-400">
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
        <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between shrink-0">
          {canEdit && onEdit ? (
            <button
              onClick={onEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Edit className="w-3.5 h-3.5" />
              Edit Product
            </button>
          ) : <div />}
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
