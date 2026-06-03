import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { X, Search, Package, Clock } from 'lucide-react';

interface Product {
  id: string;
  sku: string;
  name: string;
  description?: string;
  our_price?: number;
  cost?: number;
  unit: string;
  is_taxable: boolean;
  category?: string;
  manufacturer_model_number?: string;
}

interface InvoiceCatalogBrowserProps {
  onSelect: (product: Product) => void;
  onSelectMultiple?: (products: Product[]) => void;
  onClose: () => void;
  multiSelect?: boolean;
}

export default function InvoiceCatalogBrowser({
  onSelect,
  onSelectMultiple,
  onClose,
  multiSelect = false
}: InvoiceCatalogBrowserProps) {
  const { profile } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [recentProducts, setRecentProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'name' | 'price' | 'recent' | 'margin'>('name');

  useEffect(() => {
    loadProducts();
    loadRecentProducts();
  }, [profile?.company_id]);

  useEffect(() => {
    filterAndSortProducts();
  }, [searchQuery, selectedCategory, products, sortBy]);

  async function loadProducts() {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('products')
        .select('id, sku, name, description, our_price, cost, unit, is_taxable, category, manufacturer_model_number')
        .eq('company_id', profile?.company_id)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;

      setProducts(data || []);

      const uniqueCategories = Array.from(
        new Set((data || []).map(p => p.category).filter(Boolean))
      ) as string[];
      setCategories(uniqueCategories);
    } catch (error) {
      console.error('Error loading products:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadRecentProducts() {
    try {
      const { data, error } = await supabase
        .rpc('get_recently_used_products', {
          p_company_id: profile?.company_id,
          p_limit: 5
        });

      if (error) throw error;

      if (data && data.length > 0) {
        const productIds = data.map((d: any) => d.product_id);

        const { data: productData, error: productError } = await supabase
          .from('products')
          .select('id, sku, name, description, our_price, cost, unit, is_taxable, category, manufacturer_model_number')
          .in('id', productIds);

        if (productError) throw productError;
        setRecentProducts(productData || []);
      }
    } catch (error) {
      console.error('Error loading recent products:', error);
    }
  }

  function filterAndSortProducts() {
    let filtered = products;

    if (selectedCategory !== 'all') {
      filtered = filtered.filter(p => p.category === selectedCategory);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.name?.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query) ||
        p.sku?.toLowerCase().includes(query) ||
        p.manufacturer_model_number?.toLowerCase().includes(query)
      );
    }

    // Sort products
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'price':
          return (b.our_price || 0) - (a.our_price || 0);
        case 'margin':
          const marginA = a.our_price && a.cost ? ((a.our_price - a.cost) / a.our_price) * 100 : 0;
          const marginB = b.our_price && b.cost ? ((b.our_price - b.cost) / b.our_price) * 100 : 0;
          return marginB - marginA;
        case 'name':
        default:
          return (a.name || '').localeCompare(b.name || '');
      }
    });

    setFilteredProducts(sorted);
  }

  function calculateMargin(product: Product): number {
    if (!product.our_price || !product.cost) return 0;
    return ((product.our_price - product.cost) / product.our_price) * 100;
  }

  function toggleProductSelection(productId: string) {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(productId)) {
      newSelected.delete(productId);
    } else {
      newSelected.add(productId);
    }
    setSelectedProducts(newSelected);
  }

  function handleAddSelected() {
    const productsToAdd = products.filter(p => selectedProducts.has(p.id));
    if (onSelectMultiple && productsToAdd.length > 0) {
      onSelectMultiple(productsToAdd);
    }
  }

  function handleProductClick(product: Product) {
    if (multiSelect) {
      toggleProductSelection(product.id);
    } else {
      onSelect(product);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">Browse Product Catalog</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 border-b border-gray-700 space-y-4">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, SKU, or model number..."
                className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="name">Sort by Name</option>
              <option value="price">Sort by Price</option>
              <option value="margin">Sort by Margin</option>
            </select>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
                selectedCategory === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              All
            </button>
            {categories.map(category => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
                  selectedCategory === category
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {category}
              </button>
            ))}
          </div>

          {multiSelect && selectedProducts.size > 0 && (
            <div className="flex justify-between items-center bg-blue-900 bg-opacity-30 border border-blue-700 rounded-lg px-4 py-2">
              <span className="text-white">{selectedProducts.size} product(s) selected</span>
              <button
                onClick={handleAddSelected}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
              >
                Add Selected
              </button>
            </div>
          )}
        </div>

        {recentProducts.length > 0 && !searchQuery && selectedCategory === 'all' && (
          <div className="px-6 py-4 border-b border-gray-700">
            <div className="flex items-center gap-2 mb-3">
              <Clock size={18} className="text-blue-400" />
              <h3 className="text-sm font-semibold text-white">Recently Used in Invoices</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {recentProducts.map(product => (
                <button
                  key={product.id}
                  onClick={() => handleProductClick(product)}
                  className={`p-3 rounded-lg border text-left hover:bg-gray-700 transition-colors ${
                    multiSelect && selectedProducts.has(product.id)
                      ? 'border-blue-500 bg-blue-900 bg-opacity-30'
                      : 'border-gray-600 bg-gray-750'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-sm font-medium text-white truncate">{product.name}</span>
                    <span className="text-sm font-bold text-green-400 ml-2">${product.our_price?.toFixed(2) || '0.00'}</span>
                  </div>
                  {product.cost && (
                    <div className="text-xs text-gray-400">
                      Cost: ${product.cost.toFixed(2)} ({calculateMargin(product).toFixed(0)}% margin)
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-400">Loading products...</p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-8">
              <Package size={48} className="mx-auto text-gray-600 mb-4" />
              <p className="text-gray-400">No products found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredProducts.map(product => (
                <button
                  key={product.id}
                  onClick={() => handleProductClick(product)}
                  className={`w-full p-4 rounded-lg border text-left hover:bg-gray-700 transition-colors ${
                    multiSelect && selectedProducts.has(product.id)
                      ? 'border-blue-500 bg-blue-900 bg-opacity-30'
                      : 'border-gray-700 bg-gray-750'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {multiSelect && (
                          <input
                            type="checkbox"
                            checked={selectedProducts.has(product.id)}
                            onChange={() => toggleProductSelection(product.id)}
                            className="w-4 h-4 text-blue-600 rounded"
                            onClick={(e) => e.stopPropagation()}
                          />
                        )}
                        <span className="font-medium text-white">{product.name}</span>
                      </div>
                      <div className="text-sm text-gray-400 mb-1">
                        SKU: {product.sku || 'N/A'}
                        {product.manufacturer_model_number && ` | Model: ${product.manufacturer_model_number}`}
                      </div>
                      {product.description && (
                        <div className="text-sm text-gray-500 line-clamp-2">{product.description}</div>
                      )}
                      {product.category && (
                        <span className="inline-block mt-2 px-2 py-1 text-xs bg-gray-600 text-gray-300 rounded">
                          {product.category}
                        </span>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-lg font-bold text-green-400 mb-1">
                        ${product.our_price?.toFixed(2) || '0.00'}
                      </div>
                      {product.cost && (
                        <>
                          <div className="text-sm text-gray-400">
                            Cost: ${product.cost.toFixed(2)}
                          </div>
                          <div className="text-sm text-blue-400">
                            {calculateMargin(product).toFixed(1)}% margin
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
