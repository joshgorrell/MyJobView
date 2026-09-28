export interface CatalogTaxonomy {
  categoryName: string;
  subcategoryName: string;
  vendorName: string;
}

interface Props {
  theme?: 'dark' | 'light';
  products: CatalogTaxonomy[];
  category: string;
  subcategory: string;
  vendor: string;
  onCategory: (value: string) => void;
  onSubcategory: (value: string) => void;
  onVendor: (value: string) => void;
}

const options = (values: string[]) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));

export function CatalogTaxonomyFilters({ products, category, subcategory, vendor, onCategory, onSubcategory, onVendor, theme = 'dark' }: Props) {
  const categories = options(products.map(p => p.categoryName));
  const subcategories = options(products.filter(p => !category || p.categoryName === category).map(p => p.subcategoryName));
  const vendors = options(products.map(p => p.vendorName));
  const common = `w-full min-w-0 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${theme === 'light' ? 'border-gray-300 bg-white text-gray-900' : 'border-gray-700 bg-gray-900 text-white'}`;
  const label = `min-w-0 text-xs font-medium ${theme === 'light' ? 'text-gray-600' : 'text-gray-300'}`;

  return <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
    <label className={label}>Category
      <select aria-label="Filter by category" className={`${common} mt-1`} value={category} onChange={e => { onCategory(e.target.value); onSubcategory(''); }}>
        <option value="">All categories</option>{categories.map(name => <option key={name} value={name}>{name}</option>)}
      </select>
    </label>
    <label className={label}>Subcategory
      <select aria-label="Filter by subcategory" className={`${common} mt-1`} value={subcategory} onChange={e => onSubcategory(e.target.value)}>
        <option value="">All subcategories</option>{subcategories.map(name => <option key={name} value={name}>{name}</option>)}
      </select>
    </label>
    <label className={label}>Vendor
      <select aria-label="Filter by vendor" className={`${common} mt-1`} value={vendor} onChange={e => onVendor(e.target.value)}>
        <option value="">All vendors</option>{vendors.map(name => <option key={name} value={name}>{name}</option>)}
      </select>
    </label>
  </div>;
}

export function catalogTaxonomy(product: any): CatalogTaxonomy {
  const category = Array.isArray(product.catalog_category) ? product.catalog_category[0] : product.catalog_category;
  const subcategory = Array.isArray(product.catalog_subcategory) ? product.catalog_subcategory[0] : product.catalog_subcategory;
  const vendor = Array.isArray(product.default_vendor) ? product.default_vendor[0] : product.default_vendor;
  return {
    categoryName: category?.name || product.category || '',
    subcategoryName: subcategory?.name || '',
    vendorName: vendor?.vendor_name || product.vendor || '',
  };
}
