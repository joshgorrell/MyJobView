import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { X, Save, AlertCircle, Package, Database, FileText } from 'lucide-react';
import { Product } from '../../lib/types';

interface ProductDetailEditModalProps {
  productId: string;
  proposalLineItemId?: string;
  onClose: () => void;
  onUpdate?: () => void;
}

export default function ProductDetailEditModal({
  productId,
  proposalLineItemId,
  onClose,
  onUpdate
}: ProductDetailEditModalProps) {
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updateScope, setUpdateScope] = useState<'proposal' | 'master'>('proposal');
  const [editedProduct, setEditedProduct] = useState<Partial<Product>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProduct();
  }, [productId]);

  async function loadProduct() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('products')
        .select('*, image_url, product_link')
        .eq('id', productId)
        .single();

      if (error) throw error;
      setProduct(data);
      setEditedProduct(data);
    } catch (error) {
      console.error('Error loading product:', error);
      setError('Failed to load product details');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!product) return;

    try {
      setSaving(true);
      setError(null);

      if (updateScope === 'master') {
        const { error: updateError } = await supabase
          .from('products')
          .update({
            name: editedProduct.name,
            description: editedProduct.description,
            sku: editedProduct.sku,
            unit_price: editedProduct.unit_price,
            cost: editedProduct.cost,
            unit: editedProduct.unit,
            category: editedProduct.category
          })
          .eq('id', productId);

        if (updateError) throw updateError;
      } else if (proposalLineItemId) {
        const { error: updateError } = await supabase
          .from('proposal_line_items')
          .update({
            description: editedProduct.name,
            unit_price: editedProduct.unit_price,
            unit: editedProduct.unit
          })
          .eq('id', proposalLineItemId);

        if (updateError) throw updateError;
      }

      onUpdate?.();
      onClose();
    } catch (error) {
      console.error('Error saving product:', error);
      setError('Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl p-8 flex items-center gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
          <span className="text-gray-600 text-sm">Loading product...</span>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-xl p-8 text-center">
          <p className="text-gray-700 mb-4">Product not found</p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-none sm:rounded-xl shadow-2xl w-full max-w-2xl flex flex-col h-screen sm:h-auto sm:max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-center shrink-0">
              <Package className="w-4 h-4 text-blue-500" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-gray-900 truncate">Edit Product Details</h2>
              {product.sku && (
                <p className="text-xs text-gray-500 mt-0.5 font-mono truncate">SKU: {product.sku}</p>
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

          {error && (
            <div className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Product image if available */}
          {product.image_url && (
            <div className="flex justify-center p-4 bg-gray-50 border border-gray-200 rounded-xl">
              <img
                src={product.image_url}
                alt={product.name || 'Product image'}
                className="max-h-40 max-w-full object-contain rounded-lg"
                onError={(e) => { (e.currentTarget as HTMLImageElement).parentElement!.style.display = 'none'; }}
              />
            </div>
          )}

          {/* Update scope selector */}
          {proposalLineItemId && (
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Save Changes To</p>
              </div>
              <div className="divide-y divide-gray-100">
                <label className={`flex items-start gap-4 px-4 py-3.5 cursor-pointer transition-colors ${updateScope === 'proposal' ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                  <input
                    type="radio"
                    name="updateScope"
                    value="proposal"
                    checked={updateScope === 'proposal'}
                    onChange={() => setUpdateScope('proposal')}
                    className="mt-1 shrink-0 accent-blue-600"
                  />
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${updateScope === 'proposal' ? 'bg-blue-100' : 'bg-gray-100'}`}>
                      <FileText className={`w-4 h-4 ${updateScope === 'proposal' ? 'text-blue-600' : 'text-gray-400'}`} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">This Proposal Only</p>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">Updates name, unit price, and unit for this proposal. The master product catalog is not affected.</p>
                    </div>
                  </div>
                </label>
                <label className={`flex items-start gap-4 px-4 py-3.5 cursor-pointer transition-colors ${updateScope === 'master' ? 'bg-amber-50' : 'hover:bg-gray-50'}`}>
                  <input
                    type="radio"
                    name="updateScope"
                    value="master"
                    checked={updateScope === 'master'}
                    onChange={() => setUpdateScope('master')}
                    className="mt-1 shrink-0 accent-amber-600"
                  />
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${updateScope === 'master' ? 'bg-amber-100' : 'bg-gray-100'}`}>
                      <Database className={`w-4 h-4 ${updateScope === 'master' ? 'text-amber-600' : 'text-gray-400'}`} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Master Product Catalog</p>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">Updates the catalog product and all fields. Affects all future proposals using this product.</p>
                    </div>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Edit fields */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Product Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={editedProduct.name || ''}
                onChange={(e) => setEditedProduct({ ...editedProduct, name: e.target.value })}
                className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">SKU</label>
                <input
                  type="text"
                  value={editedProduct.sku || ''}
                  onChange={(e) => setEditedProduct({ ...editedProduct, sku: e.target.value })}
                  disabled={updateScope === 'proposal'}
                  className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Category</label>
                <input
                  type="text"
                  value={editedProduct.category || ''}
                  onChange={(e) => setEditedProduct({ ...editedProduct, category: e.target.value })}
                  disabled={updateScope === 'proposal'}
                  className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Unit</label>
                <input
                  type="text"
                  value={editedProduct.unit || ''}
                  onChange={(e) => setEditedProduct({ ...editedProduct, unit: e.target.value })}
                  className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Unit Price</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number"
                    value={editedProduct.unit_price || ''}
                    onChange={(e) => setEditedProduct({ ...editedProduct, unit_price: parseFloat(e.target.value) || 0 })}
                    className="w-full pl-7 pr-3 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    step="0.01"
                    min="0"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Cost
                  {updateScope === 'proposal' && <span className="ml-1.5 text-gray-400 font-normal">(master only)</span>}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number"
                    value={editedProduct.cost || ''}
                    onChange={(e) => setEditedProduct({ ...editedProduct, cost: parseFloat(e.target.value) || 0 })}
                    disabled={updateScope === 'proposal'}
                    className="w-full pl-7 pr-3 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
                    step="0.01"
                    min="0"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Description
                {updateScope === 'proposal' && <span className="ml-1.5 text-gray-400 font-normal">(master only)</span>}
              </label>
              <textarea
                value={editedProduct.description || ''}
                onChange={(e) => setEditedProduct({ ...editedProduct, description: e.target.value })}
                rows={3}
                disabled={updateScope === 'proposal'}
                className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed resize-none"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-200 bg-gray-50 shrink-0">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save Changes</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
