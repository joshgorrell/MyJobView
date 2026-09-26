import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Product } from '../../lib/types';
import { X, Search, Plus, Package } from 'lucide-react';
import SinglePageProductForm from '../Products/SinglePageProductForm';
import { CatalogTaxonomyFilters, catalogTaxonomy, type CatalogTaxonomy } from '../Products/CatalogTaxonomyFilters';

type BrowsableProduct = Product & CatalogTaxonomy;

interface ProductSelectorProps {
  onSelect: (product: Product | null, customData?: Partial<Product>) => void;
  onClose: () => void;
  showCreateActions?: boolean;
  priceField?: 'unit_price' | 'retail_price';
}

export default function ProductSelector({ onSelect, onClose, showCreateActions = true, priceField = 'unit_price' }: ProductSelectorProps) {
  const { profile } = useAuth();
  const [products, setProducts] = useState<BrowsableProduct[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<BrowsableProduct[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedSubcategory, setSelectedSubcategory] = useState('');
  const [selectedVendor, setSelectedVendor] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [showNewProductForm, setShowNewProductForm] = useState(false);
  const [customItem, setCustomItem] = useState({
    description: '',
    quantity: 1,
    unit: 'each',
    unit_price: 0,
    cost: 0
  });

  useEffect(() => {
    loadProducts();
  }, [profile?.company_id]);

  useEffect(() => {
    filterProducts();
  }, [searchQuery, selectedCategory, selectedSubcategory, selectedVendor, products]);

  async function loadProducts() {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('products')
        .select('*, catalog_category:product_categories!products_category_id_fkey(name), catalog_subcategory:product_subcategories!products_subcategory_id_fkey(name), default_vendor:vendors!products_default_vendor_id_fkey(vendor_name)')
        .eq('company_id', profile?.company_id)
        .eq('is_active', true)
        .order('sku');

      if (error) throw error;

      const loaded = (data || []).map(p => ({ ...p, ...catalogTaxonomy(p) })) as BrowsableProduct[];
      setProducts(loaded);
      return loaded;
    } catch (error) {
      console.error('Error loading products:', error);
    } finally {
      setLoading(false);
    }
  }

  function filterProducts() {
    let filtered = products;

    if (selectedCategory) filtered = filtered.filter(p => p.categoryName === selectedCategory);
    if (selectedSubcategory) filtered = filtered.filter(p => p.subcategoryName === selectedSubcategory);
    if (selectedVendor) filtered = filtered.filter(p => p.vendorName === selectedVendor);

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query) ||
        p.sku?.toLowerCase().includes(query) || p.categoryName.toLowerCase().includes(query) ||
        p.subcategoryName.toLowerCase().includes(query) || p.vendorName.toLowerCase().includes(query)
      );
    }

    setFilteredProducts(filtered);
  }

  function handleCustomSubmit() {
    if (!customItem.description) {
      alert('Please enter a description');
      return;
    }

    onSelect(null, customItem);
  }

  async function handleProductCreated(productData: any) {
    setShowNewProductForm(false);
    const loaded = await loadProducts();
    if (productData?.id) {
      const product = loaded?.find(p => p.id === productData.id);
      if (product) {
        onSelect(product);
      }
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-full sm:max-w-4xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">
            {showCustomForm ? 'Add Custom Item' : 'Select Product'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            <X size={24} />
          </button>
        </div>

        {!showCustomForm ? (
          <>
            <div className="p-6 border-b border-gray-700 space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search products..."
                  className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <CatalogTaxonomyFilters products={products} category={selectedCategory} subcategory={selectedSubcategory} vendor={selectedVendor}
                onCategory={setSelectedCategory} onSubcategory={setSelectedSubcategory} onVendor={setSelectedVendor} />

              {showCreateActions && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => setShowNewProductForm(true)}
                  className="py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center justify-center gap-2"
                >
                  <Package size={20} />
                  Create New Product
                </button>
                <button
                  onClick={() => setShowCustomForm(true)}
                  className="py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg flex items-center justify-center gap-2"
                >
                  <Plus size={20} />
                  Add Custom Item
                </button>
              </div>}
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {loading ? (
                <div className="text-center text-gray-400 py-12">Loading products...</div>
              ) : filteredProducts.length === 0 ? (
                <div className="text-center text-gray-400 py-12">
                  {searchQuery ? 'No products found matching your search' : 'No products available'}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredProducts.map(product => (
                    <button
                      key={product.id}
                      onClick={() => onSelect(product)}
                      className="text-left p-4 bg-gray-900 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors"
                    >
                      <div className="font-semibold text-white mb-1">{product.name}</div>
                      {(product.categoryName || product.subcategoryName || product.vendorName) && <div className="text-xs text-blue-200 mb-1">
                        {[product.categoryName, product.subcategoryName, product.vendorName].filter(Boolean).join(' · ')}
                      </div>}
                      {product.description && (
                        <div className="text-sm text-gray-400 mb-2 line-clamp-2">
                          {product.description}
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-gray-400">
                          {product.sku && <span className="mr-2">SKU: {product.sku}</span>}
                          <span>{product.unit}</span>
                        </div>
                        <div className="text-lg font-bold text-white">
                          ${Number(priceField === 'retail_price' ? (product as any).retail_price ?? product.our_price ?? product.unit_price : product.unit_price).toFixed(2)}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-4 max-w-2xl">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Description *
                </label>
                <input
                  type="text"
                  value={customItem.description}
                  onChange={(e) => setCustomItem({ ...customItem, description: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter item description"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Quantity
                  </label>
                  <input
                    type="number"
                    value={customItem.quantity}
                    onChange={(e) => setCustomItem({ ...customItem, quantity: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="0"
                    step="0.01"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Unit
                  </label>
                  <select
                    value={customItem.unit}
                    onChange={(e) => setCustomItem({ ...customItem, unit: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="each">Each</option>
                    <option value="sqft">Sq Ft</option>
                    <option value="lnft">Linear Ft</option>
                    <option value="hour">Hour</option>
                    <option value="day">Day</option>
                    <option value="lot">Lot</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Unit Price
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">$</span>
                    <input
                      type="number"
                      value={customItem.unit_price}
                      onChange={(e) => setCustomItem({ ...customItem, unit_price: parseFloat(e.target.value) || 0 })}
                      className="w-full pl-8 pr-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min="0"
                      step="0.01"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Cost (optional)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">$</span>
                    <input
                      type="number"
                      value={customItem.cost}
                      onChange={(e) => setCustomItem({ ...customItem, cost: parseFloat(e.target.value) || 0 })}
                      className="w-full pl-8 pr-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      min="0"
                      step="0.01"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  onClick={handleCustomSubmit}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
                >
                  Add Item
                </button>
                <button
                  onClick={() => {
                    setShowCustomForm(false);
                    setCustomItem({ description: '', quantity: 1, unit: 'each', unit_price: 0, cost: 0 });
                  }}
                  className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {showNewProductForm && (
        <SinglePageProductForm
          onSave={handleProductCreated}
          onClose={() => setShowNewProductForm(false)}
        />
      )}
    </div>
  );
}
