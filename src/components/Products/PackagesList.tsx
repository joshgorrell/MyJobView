import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useOfflineStorage } from '../../hooks/useOfflineStorage';
import { Package, Edit2, Trash2, Plus, DollarSign, Box } from 'lucide-react';
import PackagesListView from './PackagesListView';
import ConfirmModal from '../ui/ConfirmModal';

interface ProductPackage {
  id: string;
  package_name: string;
  package_sku: string | null;
  description: string | null;
  package_price: number;
  package_cost: number | null;
  is_active: boolean;
  thumbnail_url: string | null;
  created_at: string;
}

interface PackageItemWithProduct {
  id: string;
  quantity: number;
  product: {
    id: string;
    manufacturer_model_number: string;
    our_price: number;
    cost: number;
  };
}

interface PackagesListProps {
  searchTerm: string;
  sortBy: 'name' | 'price' | 'items' | 'savings' | 'date';
  sortOrder: 'asc' | 'desc';
  filterStatus: 'all' | 'active' | 'inactive';
  canEdit?: boolean;
  viewMode?: 'grid' | 'list';
  onEdit: (packageId: string) => void;
  onRefresh: () => void;
}

export default function PackagesList({
  searchTerm,
  sortBy,
  sortOrder,
  filterStatus,
  canEdit = true,
  viewMode = 'grid',
  onEdit,
  onRefresh
}: PackagesListProps) {
  const [packages, setPackages] = useState<ProductPackage[]>([]);
  const [packageItems, setPackageItems] = useState<Record<string, PackageItemWithProduct[]>>({});
  const [loading, setLoading] = useState(true);
  const { isOnline } = useOfflineStorage();
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  useEffect(() => {
    loadPackages();
  }, []);

  async function loadPackages() {
    try {
      setLoading(true);

      const { data: packagesData, error: packagesError } = await supabase
        .from('product_packages')
        .select('*')
        .order('package_name');

      if (packagesError) throw packagesError;

      setPackages(packagesData || []);

      if (packagesData && packagesData.length > 0) {
        const packageIds = packagesData.map(p => p.id);

        const { data: itemsData, error: itemsError } = await supabase
          .from('product_package_items')
          .select(`
            id,
            quantity,
            package_id,
            product:products (
              id,
              manufacturer_model_number,
              our_price,
              cost
            )
          `)
          .in('package_id', packageIds);

        if (itemsError) throw itemsError;

        const itemsByPackage: Record<string, PackageItemWithProduct[]> = {};
        itemsData?.forEach((item: any) => {
          if (!itemsByPackage[item.package_id]) {
            itemsByPackage[item.package_id] = [];
          }
          itemsByPackage[item.package_id].push({
            id: item.id,
            quantity: item.quantity,
            product: item.product
          });
        });

        setPackageItems(itemsByPackage);
      }
    } catch (error) {
      console.error('Error loading packages:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const { error } = await supabase
        .from('product_packages')
        .delete()
        .eq('id', id);

      if (error) throw error;

      loadPackages();
      onRefresh();
    } catch (error) {
      console.error('Error deleting package:', error);
      alert('Failed to delete package');
    }
  }

  function calculateIndividualPrice(packageId: string): number {
    const items = packageItems[packageId] || [];
    return items.reduce((sum, item) => {
      return sum + (Number(item.product.our_price) * Number(item.quantity));
    }, 0);
  }

  function calculateSavings(pkg: ProductPackage): number {
    const individualPrice = calculateIndividualPrice(pkg.id);
    return individualPrice - Number(pkg.package_price);
  }

  const filteredAndSortedPackages = useMemo(() => {
    let filtered = packages;

    // Apply search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(pkg =>
        pkg.package_name.toLowerCase().includes(search) ||
        pkg.package_sku?.toLowerCase().includes(search) ||
        pkg.description?.toLowerCase().includes(search)
      );
    }

    // Apply status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter(pkg =>
        filterStatus === 'active' ? pkg.is_active : !pkg.is_active
      );
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'name':
          comparison = a.package_name.localeCompare(b.package_name);
          break;
        case 'price':
          comparison = Number(a.package_price) - Number(b.package_price);
          break;
        case 'items': {
          const aItems = (packageItems[a.id] || []).reduce((sum, item) => sum + Number(item.quantity), 0);
          const bItems = (packageItems[b.id] || []).reduce((sum, item) => sum + Number(item.quantity), 0);
          comparison = aItems - bItems;
          break;
        }
        case 'savings':
          comparison = calculateSavings(a) - calculateSavings(b);
          break;
        case 'date':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [packages, packageItems, searchTerm, filterStatus, sortBy, sortOrder]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">Loading packages...</div>
      </div>
    );
  }

  if (packages.length === 0) {
    return (
      <div className="text-center py-12">
        <Package size={48} className="mx-auto text-gray-600 mb-4" />
        <p className="text-gray-400 mb-4">No packages created yet</p>
        <p className="text-sm text-gray-500 mb-6">
          Create product bundles to offer complete packages to customers at special pricing.
        </p>
      </div>
    );
  }

  return (
    <div>
      {filteredAndSortedPackages.length === 0 ? (
        <div className="text-center py-12">
          <Package size={48} className="mx-auto text-gray-600 mb-4" />
          <p className="text-gray-400 mb-2">No packages found</p>
          <p className="text-sm text-gray-500">
            Try adjusting your search or filters
          </p>
        </div>
      ) : viewMode === 'list' ? (
        <PackagesListView
          packages={filteredAndSortedPackages}
          packageItems={packageItems}
          canEdit={canEdit}
          onEdit={onEdit}
          onDelete={handleDelete}
          calculateIndividualPrice={calculateIndividualPrice}
          calculateSavings={calculateSavings}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredAndSortedPackages.map(pkg => {
          const items = packageItems[pkg.id] || [];
          const itemCount = items.reduce((sum, item) => sum + Number(item.quantity), 0);
          const individualPrice = calculateIndividualPrice(pkg.id);
          const savings = calculateSavings(pkg);
          const savingsPercent = individualPrice > 0 ? (savings / individualPrice) * 100 : 0;

          return (
            <div
              key={pkg.id}
              onClick={() => {
                console.log('Package clicked:', pkg.id, 'canEdit:', canEdit, 'isOnline:', isOnline);
                if (canEdit) {
                  onEdit(pkg.id);
                }
              }}
              className={`bg-gray-800 border border-gray-700 rounded-lg overflow-hidden hover:border-gray-600 transition-colors ${
                canEdit ? 'cursor-pointer' : 'cursor-default'
              }`}
            >
              {/* Thumbnail Image */}
              {pkg.thumbnail_url ? (
                <div className="relative w-full h-40 bg-gray-900">
                  <img
                    src={pkg.thumbnail_url}
                    alt={pkg.package_name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      target.parentElement!.innerHTML = '<div class="w-full h-full flex items-center justify-center"><div class="text-gray-600"><svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg></div></div>';
                    }}
                  />
                  {!pkg.is_active && (
                    <span className="absolute top-2 right-2 px-2 py-1 text-xs bg-gray-900 bg-opacity-90 text-gray-300 rounded">
                      Inactive
                    </span>
                  )}
                </div>
              ) : (
                <div className="relative w-full h-40 bg-gray-900 flex items-center justify-center">
                  <Package size={48} className="text-gray-700" />
                  {!pkg.is_active && (
                    <span className="absolute top-2 right-2 px-2 py-1 text-xs bg-gray-900 bg-opacity-90 text-gray-300 rounded">
                      Inactive
                    </span>
                  )}
                </div>
              )}

              {/* Content */}
              <div className="p-3">
                <div className="mb-2">
                  <h3 className="text-sm font-semibold text-white mb-1 truncate">{pkg.package_name}</h3>
                  {pkg.package_sku && (
                    <p className="text-xs text-gray-400 truncate">SKU: {pkg.package_sku}</p>
                  )}
                </div>

                {pkg.description && (
                  <p className="text-xs text-gray-400 mb-2 line-clamp-2">{pkg.description}</p>
                )}

                <div className="flex items-center gap-1 text-xs text-gray-400 mb-2">
                  <Box size={12} className="flex-shrink-0" />
                  <span>{itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
                </div>

                <div className="space-y-1 mb-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-gray-400">Price:</span>
                    <span className="text-base font-bold text-white">
                      ${Number(pkg.package_price).toFixed(2)}
                    </span>
                  </div>
                  {savings > 0 && (
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="text-gray-400">Save:</span>
                      <span className="text-green-400 font-medium">
                        ${savings.toFixed(2)} ({savingsPercent.toFixed(0)}%)
                      </span>
                    </div>
                  )}
                </div>

                {canEdit && (
                  <div className="flex items-center gap-2 pt-2 border-t border-gray-700">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(pkg.id);
                      }}
                      className="flex-1 px-2 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium flex items-center justify-center gap-1"
                    >
                      <Edit2 size={12} />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmModal({ title: 'Delete Package', message: 'Delete this package? This will not delete the products themselves.', onConfirm: () => handleDelete(pkg.id) });
                      }}
                      className="px-2 py-1.5 bg-gray-700 hover:bg-gray-600 text-red-400 hover:text-red-300 rounded"
                      title="Delete package"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      )}

      <ConfirmModal
        isOpen={confirmModal !== null}
        title={confirmModal?.title ?? ''}
        message={confirmModal?.message ?? ''}
        onConfirm={() => { confirmModal?.onConfirm(); setConfirmModal(null); }}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}
