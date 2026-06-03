import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { X, Search, Package, ChevronDown, ChevronUp } from 'lucide-react';

interface Product {
  id: string;
  sku: string;
  name: string;
  description?: string;
  our_price?: number;
  cost?: number;
  unit: string;
  is_taxable: boolean;
}

interface PackageItem {
  id: string;
  product_id: string;
  quantity: number;
  include_labor: boolean;
  product?: Product;
}

interface ProductPackage {
  id: string;
  package_name: string;
  package_sku?: string;
  description?: string;
  sales_description?: string;
  package_price?: number;
  is_price_override: boolean;
  show_components: boolean;
  is_active: boolean;
  items?: PackageItem[];
}

interface PackageSelectorProps {
  onSelectPackage: (packageData: ProductPackage) => void;
  onClose: () => void;
}

export default function PackageSelector({ onSelectPackage, onClose }: PackageSelectorProps) {
  const { profile } = useAuth();
  const [packages, setPackages] = useState<ProductPackage[]>([]);
  const [filteredPackages, setFilteredPackages] = useState<ProductPackage[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [expandedPackage, setExpandedPackage] = useState<string | null>(null);

  useEffect(() => {
    loadPackages();
  }, [profile?.company_id]);

  useEffect(() => {
    filterPackages();
  }, [searchQuery, packages]);

  async function loadPackages() {
    try {
      setLoading(true);

      const { data: packagesData, error: packagesError } = await supabase
        .from('product_packages')
        .select('*')
        .eq('company_id', profile?.company_id)
        .eq('is_active', true)
        .order('package_name');

      if (packagesError) throw packagesError;

      // Load package items for each package
      const packagesWithItems = await Promise.all(
        (packagesData || []).map(async (pkg) => {
          const { data: items, error: itemsError } = await supabase
            .from('product_package_items')
            .select(`
              id,
              product_id,
              quantity,
              include_labor,
              product:products(id, sku, name, description, our_price, cost, unit, is_taxable)
            `)
            .eq('package_id', pkg.id)
            .order('sort_order');

          if (itemsError) throw itemsError;

          return {
            ...pkg,
            items: items || []
          };
        })
      );

      setPackages(packagesWithItems);
    } catch (error) {
      console.error('Error loading packages:', error);
    } finally {
      setLoading(false);
    }
  }

  function filterPackages() {
    if (!searchQuery) {
      setFilteredPackages(packages);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = packages.filter(pkg =>
      pkg.package_name?.toLowerCase().includes(query) ||
      pkg.package_sku?.toLowerCase().includes(query) ||
      pkg.description?.toLowerCase().includes(query)
    );

    setFilteredPackages(filtered);
  }

  function calculatePackageTotal(pkg: ProductPackage): number {
    if (pkg.is_price_override && pkg.package_price) {
      return pkg.package_price;
    }

    return (pkg.items || []).reduce((total, item) => {
      const product = item.product as unknown as Product;
      const price = product?.our_price || 0;
      return total + (price * item.quantity);
    }, 0);
  }

  function toggleExpanded(packageId: string) {
    setExpandedPackage(expandedPackage === packageId ? null : packageId);
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">Select Package</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 border-b border-gray-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search packages..."
              className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-400">Loading packages...</p>
            </div>
          ) : filteredPackages.length === 0 ? (
            <div className="text-center py-8">
              <Package size={48} className="mx-auto text-gray-600 mb-4" />
              <p className="text-gray-400">
                {searchQuery ? 'No packages found matching your search' : 'No packages available'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPackages.map(pkg => (
                <div
                  key={pkg.id}
                  className="border border-gray-700 rounded-lg bg-gray-750 overflow-hidden"
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div className="flex-1">
                        <h3 className="font-semibold text-white text-lg mb-1">{pkg.package_name}</h3>
                        {pkg.package_sku && (
                          <div className="text-sm text-gray-400 mb-1">SKU: {pkg.package_sku}</div>
                        )}
                        {pkg.description && (
                          <p className="text-sm text-gray-400 mb-2">{pkg.description}</p>
                        )}
                        <div className="flex items-center gap-2 text-sm text-gray-400">
                          <span>{(pkg.items || []).length} component(s)</span>
                          <span>•</span>
                          <button
                            onClick={() => toggleExpanded(pkg.id)}
                            className="flex items-center gap-1 text-blue-400 hover:text-blue-300"
                          >
                            {expandedPackage === pkg.id ? (
                              <>Hide details <ChevronUp size={16} /></>
                            ) : (
                              <>Show details <ChevronDown size={16} /></>
                            )}
                          </button>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-green-400 mb-2">
                          ${calculatePackageTotal(pkg).toFixed(2)}
                        </div>
                        <button
                          onClick={() => onSelectPackage(pkg)}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
                        >
                          Add Package
                        </button>
                      </div>
                    </div>

                    {expandedPackage === pkg.id && (pkg.items || []).length > 0 && (
                      <div className="mt-4 pt-4 border-t border-gray-700">
                        <h4 className="text-sm font-medium text-gray-300 mb-2">Package Components:</h4>
                        <div className="space-y-2">
                          {(pkg.items || []).map(item => {
                            const product = item.product as unknown as Product;
                            return (
                              <div
                                key={item.id}
                                className="flex items-center justify-between text-sm bg-gray-800 p-2 rounded"
                              >
                                <div className="flex-1">
                                  <div className="text-white">
                                    {product?.name || 'Unknown Product'}
                                    {item.include_labor && (
                                      <span className="ml-2 text-xs bg-blue-900 text-blue-300 px-2 py-0.5 rounded">
                                        +Labor
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-gray-400 text-xs">
                                    Qty: {item.quantity} {product?.unit || 'ea'}
                                  </div>
                                </div>
                                <div className="text-gray-300 font-medium">
                                  ${((product?.our_price || 0) * item.quantity).toFixed(2)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {pkg.is_price_override && (
                          <div className="mt-2 text-xs text-yellow-400">
                            Package uses custom pricing instead of component total
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
