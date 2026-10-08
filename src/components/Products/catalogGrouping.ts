import type { Product } from '../../lib/types';
import type { CatalogTaxonomy } from './CatalogTaxonomyFilters';

export type CatalogGrouping = 'brand' | 'category' | 'vendor' | 'none';
export type CatalogProduct = Product & CatalogTaxonomy & { brandName: string; manufacturer_model_number?: string | null; manufacturer_id?: string | null; inventory_type?: string | null; category_id?: string | null; subcategory_id?: string | null; default_vendor_id?: string | null; image_url?: string | null };

export const normalizeBrandName = (name: string) => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();

// Only manufacturer data identifies a brand. Purchasing vendors never do.
export function catalogBrand(product: { manufacturers?: { name: string } | { name: string }[] | null; manufacturer?: string | null }): string {
  const manufacturer = Array.isArray(product.manufacturers) ? product.manufacturers[0] : product.manufacturers;
  return (manufacturer?.name || product.manufacturer || '').trim();
}

export function groupCatalogProducts(products: CatalogProduct[], groupBy: CatalogGrouping) {
  const groups = new Map<string, { key: string; label: string; products: CatalogProduct[]; unassigned: boolean }>();
  for (const product of products) {
    const name = groupBy === 'brand' ? product.brandName : groupBy === 'category' ? product.categoryName : groupBy === 'vendor' ? product.vendorName : '';
    const normalized = normalizeBrandName(name);
    const key = groupBy === 'none' ? 'all' : `${groupBy}:${normalized ? 'named:' + normalized : 'unassigned'}`;
    const group = groups.get(key) || { key, label: name.trim() || (groupBy === 'none' ? 'All products' : `Unassigned ${groupBy}`), products: [], unassigned: !normalized };
    group.products.push(product);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => Number(a.unassigned) - Number(b.unassigned) || a.label.localeCompare(b.label, undefined, { sensitivity: 'base', numeric: true })).map(group => ({
    ...group, products: [...group.products].sort((a, b) => (a.sku || a.manufacturer_model_number || '').localeCompare(b.sku || b.manufacturer_model_number || '', undefined, { numeric: true, sensitivity: 'base' }))
  }));
}
