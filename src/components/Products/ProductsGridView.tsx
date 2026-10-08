import type { CatalogProduct } from './catalogGrouping';
import { formatCurrency } from '../../lib/utils';
import { Package, CreditCard as Edit2, Trash2, Copy, Eye } from 'lucide-react';

interface ProductsGridViewProps {
  products: CatalogProduct[];
  showVendor?: boolean;
  showBrand?: boolean;
  canEdit: boolean;
  hideCost: boolean;
  onView: (productId: string) => void;
  onEdit: (productId: string) => void;
  onDuplicate: (productId: string) => void;
  onDelete: (productId: string) => void;
}

export default function ProductsGridView({
  products,
  canEdit,
  hideCost,
  onView,
  onEdit,
  onDuplicate,
  onDelete,
  showVendor = true,
  showBrand = true
}: ProductsGridViewProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
      {products.map(product => {
        const cost = Number(product.cost || 0);
        const price = Number(product.our_price ?? product.unit_price ?? 0);

        return (
          <div
            key={product.id}
            className="bg-canvas border border-strong rounded-lg overflow-hidden hover:border-strong transition-colors"
          >
            {/* Product Image */}
            <div
              onClick={() => onView(product.id)}
              className="relative w-full h-48 bg-canvas cursor-pointer group"
            >
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.manufacturer_model_number || ''}
                  className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Package size={64} className="text-secondary" />
                </div>
              )}
            </div>

            {/* Content */}
            <div className="p-3 space-y-2">
              {/* Vendor + SKU */}
              <div className="min-h-[40px]">
                {showBrand && product.brandName && <div className="text-xs text-muted truncate">{product.brandName}</div>}
                {showVendor && product.vendorName && (
                  <div className="text-[10px] text-muted uppercase tracking-wide font-medium mb-0.5 truncate">
                    {product.vendorName}
                  </div>
                )}
                <h3
                  onClick={() => onView(product.id)}
                  className="text-sm font-mono font-semibold text-primary line-clamp-2 cursor-pointer hover:text-blue-400"
                >
                  {product.sku || product.manufacturer_model_number}
                </h3>
              </div>

              {/* Description */}
              {product.description && (
                <div
                  className="text-xs text-muted min-h-[32px]"
                  title={product.description}
                >
                  <div className="line-clamp-2">
                    {product.description}
                  </div>
                </div>
              )}

              {/* Pricing */}
              <div className="pt-2 border-t border-strong space-y-1">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-muted">Price:</span>
                  <span className="text-lg font-bold text-primary">
                    ${price.toFixed(2)}
                  </span>
                </div>
                {!hideCost && (
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-muted">Cost:</span>
                    <span className="text-muted">{formatCurrency(cost)}</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 pt-2 border-t border-strong">
                <button
                  onClick={() => onView(product.id)}
                  className="flex-1 px-2 py-1.5 bg-green-600 hover:bg-green-700 text-primary rounded text-xs font-medium flex items-center justify-center gap-1"
                  title="View details"
                >
                  <Eye size={12} />
                  <span>View</span>
                </button>
                {canEdit && (
                  <>
                    <button
                      onClick={() => onEdit(product.id)}
                      className="flex-1 px-2 py-1.5 bg-blue-600 hover:bg-blue-700 text-primary rounded text-xs font-medium flex items-center justify-center gap-1"
                      title="Edit product"
                    >
                      <Edit2 size={12} />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={() => onDuplicate(product.id)}
                      className="px-2 py-1.5 bg-purple-600 hover:bg-purple-700 text-primary rounded"
                      title="Duplicate"
                    >
                      <Copy size={12} />
                    </button>
                    <button
                      onClick={() => onDelete(product.id)}
                      className="px-2 py-1.5 bg-elevated hover:bg-elevated text-red-400 hover:text-red-300 rounded"
                      title="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
