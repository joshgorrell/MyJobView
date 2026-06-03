import React from 'react';
import { Package, Edit2, Trash2 } from 'lucide-react';

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

interface PackagesListViewProps {
  packages: ProductPackage[];
  packageItems: Record<string, PackageItemWithProduct[]>;
  canEdit: boolean;
  onEdit: (packageId: string) => void;
  onDelete: (packageId: string) => void;
  calculateIndividualPrice: (packageId: string) => number;
  calculateSavings: (pkg: ProductPackage) => number;
}

export default function PackagesListView({
  packages,
  packageItems,
  canEdit,
  onEdit,
  onDelete,
  calculateIndividualPrice,
  calculateSavings
}: PackagesListViewProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px]">
        <thead className="text-xs text-gray-400 border-b border-gray-700">
          <tr>
            <th className="text-left py-2 px-2 w-12"></th>
            <th className="text-left py-2 px-2">Package Name</th>
            <th className="text-left py-2 px-2">SKU</th>
            <th className="text-center py-2 px-2">Items</th>
            <th className="text-right py-2 px-2">Individual Price</th>
            <th className="text-right py-2 px-2">Package Price</th>
            <th className="text-right py-2 px-2">Savings</th>
            <th className="text-center py-2 px-2">Status</th>
            <th className="text-right py-2 px-2">Actions</th>
          </tr>
        </thead>
        <tbody className="text-sm">
          {packages.map(pkg => {
            const items = packageItems[pkg.id] || [];
            const itemCount = items.reduce((sum, item) => sum + Number(item.quantity), 0);
            const individualPrice = calculateIndividualPrice(pkg.id);
            const savings = calculateSavings(pkg);
            const savingsPercent = individualPrice > 0 ? (savings / individualPrice) * 100 : 0;

            return (
              <tr
                key={pkg.id}
                onClick={() => canEdit && onEdit(pkg.id)}
                className={`border-b border-gray-700 hover:bg-gray-800 ${canEdit ? 'cursor-pointer' : ''}`}
              >
                <td className="py-2 px-2">
                  {pkg.thumbnail_url ? (
                    <img
                      src={pkg.thumbnail_url}
                      alt={pkg.package_name}
                      className="w-8 h-8 object-cover rounded border border-gray-600"
                    />
                  ) : (
                    <div className="w-8 h-8 bg-gray-700 rounded flex items-center justify-center">
                      <Package size={16} className="text-gray-500" />
                    </div>
                  )}
                </td>
                <td className="py-2 px-2">
                  <div className="font-medium text-white">{pkg.package_name}</div>
                  {pkg.description && (
                    <div className="text-xs text-gray-400 truncate max-w-xs">
                      {pkg.description}
                    </div>
                  )}
                </td>
                <td className="py-2 px-2 text-gray-300">
                  {pkg.package_sku || '-'}
                </td>
                <td className="py-2 px-2 text-center text-gray-300">
                  {itemCount}
                </td>
                <td className="py-2 px-2 text-right text-gray-300">
                  ${individualPrice.toFixed(2)}
                </td>
                <td className="py-2 px-2 text-right text-white font-semibold">
                  ${Number(pkg.package_price).toFixed(2)}
                </td>
                <td className="py-2 px-2 text-right">
                  {savings > 0 ? (
                    <div>
                      <div className="text-green-400 font-medium">
                        ${savings.toFixed(2)}
                      </div>
                      <div className="text-xs text-green-300">
                        ({savingsPercent.toFixed(0)}%)
                      </div>
                    </div>
                  ) : (
                    <span className="text-gray-500">-</span>
                  )}
                </td>
                <td className="py-2 px-2 text-center">
                  <span className={`px-2 py-1 text-xs rounded ${
                    pkg.is_active
                      ? 'bg-green-900 text-green-200'
                      : 'bg-gray-700 text-gray-300'
                  }`}>
                    {pkg.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="py-2 px-2" onClick={(e) => e.stopPropagation()}>
                  {canEdit && (
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onEdit(pkg.id)}
                        className="text-blue-400 hover:text-blue-300 p-1"
                        title="Edit package"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => onDelete(pkg.id)}
                        className="text-red-400 hover:text-red-300 p-1"
                        title="Delete package"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
