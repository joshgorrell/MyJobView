import type { CatalogProduct } from './catalogGrouping';
import ProductStatusNotice from './ProductStatusNotice';
import { formatCurrency } from '../../lib/utils';
import { Package, CreditCard as Edit2, Trash2, Copy, Archive, ArchiveRestore } from 'lucide-react';

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
  onArchive: (productId: string, archive: boolean) => void;
}

export default function ProductsGridView({
  products,
  canEdit,
  hideCost,
  onView,
  onEdit,
  onDuplicate,
  onDelete,
  onArchive,
  showVendor = true,
  showBrand = true
}: ProductsGridViewProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2 sm:gap-4">
      {products.map(product => {
        const cost = Number(product.cost || 0);
        const price = Number(product.our_price ?? product.unit_price ?? 0);

        return (
          <div
            key={product.id}
            role="button" tabIndex={0} aria-label={`Open ${product.sku || product.manufacturer_model_number}`}
            onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onView(product.id); } }}
            onClick={() => onView(product.id)} className="bg-canvas border border-strong rounded-lg overflow-hidden hover:border-strong transition-colors cursor-pointer"
          >
            {/* Product Image */}
            <div
              className="relative w-full h-28 sm:h-48 bg-canvas cursor-pointer group"
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
            <div className="p-2 sm:p-3 space-y-1 sm:space-y-2">
              {/* Vendor + SKU */}
              <div className="min-h-[40px]">
                {showBrand && product.brandName && <div className="text-xs text-muted truncate">{product.brandName}</div>}
                {showVendor && product.vendorName && (
                  <div className="text-[10px] text-muted uppercase tracking-wide font-medium mb-0.5 truncate">
                    {product.vendorName}
                  </div>
                )}
                <h3
                  className="text-sm font-mono font-semibold text-primary line-clamp-2 cursor-pointer hover:text-blue-400"
                >
                  {product.sku || product.manufacturer_model_number}
                </h3>
              </div>

              <ProductStatusNotice product={product} />

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
                  <span className="text-sm sm:text-lg font-bold text-primary">
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
              <div className="flex items-center gap-1 pt-2 border-t border-strong" onClick={event => event.stopPropagation()}>
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
                    <button type="button" onClick={() => onArchive(product.id, product.is_active !== false)} title={product.is_active === false ? 'Restore product' : 'Archive product'} className="px-2 py-1.5 text-muted rounded">{product.is_active === false ? <ArchiveRestore size={14} /> : <Archive size={14} />}</button>
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
