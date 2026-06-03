import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Product } from '../../lib/types';
import { Search, Package, X, Plus } from 'lucide-react';
import PreAddProductModal from './PreAddProductModal';

interface QuickAddProductModalProps {
  proposalId: string;
  targetRoomIds: string[];
  onClose: () => void;
  onItemAdded: () => void;
}

export default function QuickAddProductModal({
  proposalId,
  targetRoomIds,
  onClose,
  onItemAdded
}: QuickAddProductModalProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('sku');

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error loading products:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredProducts = products.filter(product => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      product.sku?.toLowerCase().includes(query) ||
      product.name?.toLowerCase().includes(query) ||
      product.description?.toLowerCase().includes(query) ||
      product.category?.toLowerCase().includes(query)
    );
  });

  function handleSelectProduct(product: Product) {
    setSelectedProduct(product);
  }

  async function handleConfirmAdd(itemData: any) {
    if (targetRoomIds.length === 0) return;

    try {
      setAdding(true);

      const lineItems = targetRoomIds.map((roomId, index) => ({
        proposal_id: proposalId,
        room_id: roomId,
        product_id: selectedProduct!.id,
        description: itemData.description,
        quantity: itemData.quantity,
        unit: itemData.unit,
        price: itemData.price,
        cost: itemData.cost,
        labor_hours: itemData.labor_hours || null,
        labor_rate: itemData.labor_rate || null,
        labor_phase_id: itemData.labor_phase_id || null,
        sort_order: 9999 + index,
        is_custom: false,
        item_type: itemData.item_type
      }));

      const { error } = await supabase
        .from('proposal_line_items')
        .insert(lineItems);

      if (error) throw error;

      setSelectedProduct(null);
      onItemAdded();
      setSearchQuery('');
    } catch (error) {
      console.error('Error adding product:', error);
      alert('Failed to add product');
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Quick Add Products</h2>
            <p className="text-sm text-gray-500 mt-1">
              Adding to <strong>{targetRoomIds.length}</strong> selected area{targetRoomIds.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by SKU, name, category..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>
        </div>

        {/* Products List */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading products...</div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-8">
              <Package size={48} className="mx-auto text-gray-400 mb-3" />
              <p className="text-gray-500">
                {searchQuery ? 'No products match your search' : 'No products available'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredProducts.map((product) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-all group"
                >
                  <div className="flex-1 min-w-0 mr-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                        {product.sku}
                      </span>
                      {product.category && (
                        <span className="text-xs text-gray-500">
                          {product.category}
                        </span>
                      )}
                    </div>
                    <h3 className="font-medium text-gray-900 mb-1">{product.name}</h3>
                    {product.description && (
                      <p className="text-sm text-gray-600 line-clamp-1">
                        {product.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-lg font-bold text-blue-600">
                        ${product.unit_price?.toFixed(2) || '0.00'}
                      </div>
                      <div className="text-xs text-gray-500">per {product.unit || 'ea'}</div>
                    </div>
                    <button
                      onClick={() => handleSelectProduct(product)}
                      disabled={adding}
                      className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Plus size={16} />
                      <span className="text-sm font-medium">Add</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <p className="text-sm text-gray-600 text-center">
            Click "Add" to configure and add items to all selected areas
          </p>
        </div>
      </div>

      {/* Pre-Add Product Configuration Modal */}
      {selectedProduct && (
        <PreAddProductModal
          product={selectedProduct}
          targetRoomCount={targetRoomIds.length}
          onClose={() => setSelectedProduct(null)}
          onConfirm={handleConfirmAdd}
        />
      )}
    </div>
  );
}
