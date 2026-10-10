import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Plus, Search, Filter, Lock, X, Grid3x3, List, ArrowUpDown, Package } from 'lucide-react';
import SinglePageProductForm from './SinglePageProductForm';
import PackagesList from './PackagesList';
import PackageForm from './PackageForm';
import MonitoringServicesCatalog from './MonitoringServicesCatalog';
import { ProductDetailModal } from './ProductDetailModal';
import ProductCatalogView from './ProductCatalogView';
import { catalogBrand, type CatalogProduct, type CatalogGrouping } from './catalogGrouping';
import ConfirmModal from '../ui/ConfirmModal';
import { catalogTaxonomy } from './CatalogTaxonomyFilters';

export default function ProductsManagement() {
  const { profile, loading: authLoading } = useAuth();
  const canEdit = profile?.can_edit_products ?? false;

  console.log('ProductsManagement canEdit:', canEdit, 'profile:', profile, 'authLoading:', authLoading);
  const [activeTab, setActiveTab] = useState<'products' | 'packages' | 'monitoring'>('products');
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  // Persist form visibility state so it reopens when returning to this module
  const [showForm, setShowForm] = useState(() => {
    const saved = sessionStorage.getItem('productCatalog_showForm');
    return saved === 'true';
  });
  const [editingProductId, setEditingProductId] = useState<string | null>(() => {
    const saved = sessionStorage.getItem('productCatalog_editingProductId');
    return saved || null;
  });
  const [duplicateProductId, setDuplicateProductId] = useState<string | null>(() => {
    const saved = sessionStorage.getItem('productCatalog_duplicateProductId');
    return saved || null;
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [groupBy, setGroupBy] = useState<CatalogGrouping>(() => {
    const saved = localStorage.getItem('productCatalog_groupBy');
    return saved === 'category' || saved === 'vendor' || saved === 'none' ? saved : 'brand';
  });
  useEffect(() => { localStorage.setItem('productCatalog_groupBy', groupBy); }, [groupBy]);
  const [showMissingPhotos, setShowMissingPhotos] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'current' | 'archived' | 'discontinued' | 'all'>('current');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterSubcategory, setFilterSubcategory] = useState<string>('all');
  const [filterManufacturer, setFilterManufacturer] = useState<string>('all');
  const [filterVendor, setFilterVendor] = useState<string>('all');
  const [filterPhase, setFilterPhase] = useState<string>('all');
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showPackageForm, setShowPackageForm] = useState(false);
  const [editingPackageId, setEditingPackageId] = useState<string | null>(null);
  const [packagesKey, setPackagesKey] = useState(0);
  const [viewingProductId, setViewingProductId] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [manufacturers, setManufacturers] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [phases, setPhases] = useState<any[]>([]);
  const [hideCost, setHideCost] = useState(() => {
    const saved = localStorage.getItem('productCatalog_hideCost');
    return saved === 'true';
  });

  // Package-specific states
  const [packageSortBy, setPackageSortBy] = useState<'name' | 'price' | 'items' | 'savings' | 'date'>('name');
  const [packageSortOrder, setPackageSortOrder] = useState<'asc' | 'desc'>('asc');
  const [packageFilterStatus, setPackageFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [showPackageFilters, setShowPackageFilters] = useState(false);

  // View mode states (persisted in localStorage)
  const [productsViewMode, setProductsViewMode] = useState<'list' | 'grid'>(() => {
    const saved = localStorage.getItem('productCatalog_productsView');
    return (saved === 'grid' || saved === 'list') ? saved : 'list';
  });
  const [packagesViewMode, setPackagesViewMode] = useState<'list' | 'grid'>(() => {
    const saved = localStorage.getItem('productCatalog_packagesView');
    return (saved === 'grid' || saved === 'list') ? saved : 'grid';
  });

  useEffect(() => {
    console.log('ProductsManagement: useEffect triggered, profile:', profile ? 'exists' : 'null', 'authLoading:', authLoading);
    // Wait for auth to complete before loading products
    if (authLoading) {
      console.log('ProductsManagement: Auth still loading, skipping product load');
      return;
    }
    loadProducts();
    loadFilterOptions();
  }, [profile, authLoading]);

  useEffect(() => {
    localStorage.setItem('productCatalog_hideCost', hideCost.toString());
  }, [hideCost]);

  useEffect(() => {
    localStorage.setItem('productCatalog_productsView', productsViewMode);
  }, [productsViewMode]);

  useEffect(() => {
    localStorage.setItem('productCatalog_packagesView', packagesViewMode);
  }, [packagesViewMode]);

  // Persist form state so it can be restored when returning to this module
  useEffect(() => {
    sessionStorage.setItem('productCatalog_showForm', showForm.toString());
    if (editingProductId) {
      sessionStorage.setItem('productCatalog_editingProductId', editingProductId);
    } else {
      sessionStorage.removeItem('productCatalog_editingProductId');
    }
    if (duplicateProductId) {
      sessionStorage.setItem('productCatalog_duplicateProductId', duplicateProductId);
    } else {
      sessionStorage.removeItem('productCatalog_duplicateProductId');
    }
  }, [showForm, editingProductId, duplicateProductId]);

  // Save scroll position when showing form
  useEffect(() => {
    if (showForm) {
      sessionStorage.setItem('productCatalog_scrollPosition', window.scrollY.toString());
    }
  }, [showForm]);

  // Restore scroll position when form closes
  useEffect(() => {
    if (!showForm) {
      const savedScroll = sessionStorage.getItem('productCatalog_scrollPosition');
      if (savedScroll) {
        // Use setTimeout to ensure DOM is ready
        setTimeout(() => {
          window.scrollTo(0, parseInt(savedScroll));
        }, 0);
      }
    }
  }, [showForm]);

  useEffect(() => {
    filterProducts();
  }, [filterStatus, products, searchTerm, showMissingPhotos, filterType, filterCategory, filterSubcategory, filterManufacturer, filterVendor, filterPhase]);

  async function loadProducts() {
    if (!profile) {
      console.log('ProductsManagement: No profile, setting loading to false');
      setLoading(false);
      return;
    }

    try {
      console.log('ProductsManagement: Starting to load products...');
      setLoading(true);

      const { data, error } = await supabase
        .from('products')
        .select('*, manufacturers(name), catalog_category:product_categories!products_category_id_fkey(name), catalog_subcategory:product_subcategories!products_subcategory_id_fkey(name), default_vendor:vendors!products_default_vendor_id_fkey(vendor_name)')
        .order('vendor', { nullsFirst: false })
        .order('sku', { nullsFirst: false });

      console.log('ProductsManagement: Products query result:', { data: data?.length, error });

      if (error) throw error;

      setProducts((data || []).map(p => ({ ...p, ...catalogTaxonomy(p), brandName: catalogBrand(p) })) as CatalogProduct[]);
      console.log('ProductsManagement: Products loaded successfully');
    } catch (error) {
      console.error('Error loading products:', error);
    } finally {
      console.log('ProductsManagement: Setting loading to false');
      setLoading(false);
    }
  }

  async function loadFilterOptions() {
    if (!profile) return;

    try {
      const [mfgData, vendorData, phaseData] = await Promise.all([
        supabase.from('manufacturers').select('id, name').order('name'),
        supabase.from('vendors').select('id, vendor_name').order('vendor_name'),
        supabase.from('labor_phases').select('id, name').order('name')
      ]);

      if (mfgData.data) setManufacturers(mfgData.data);
      if (vendorData.data) setVendors(vendorData.data);
      if (phaseData.data) setPhases(phaseData.data);
    } catch (error) {
      console.error('Error loading filter options:', error);
    }
  }

  function filterProducts() {
    let filtered = products.filter(p => {
      if (filterStatus === 'all') return true;
      if (filterStatus === 'archived') return p.is_active === false;
      if (filterStatus === 'discontinued') return p.is_active !== false && p.is_discontinued === true;
      return p.is_active !== false && p.is_discontinued !== true;
    });

    if (showMissingPhotos) filtered = filtered.filter(p => !p.image_url?.trim());

    if (searchTerm.trim()) {
      const search = searchTerm.trim().toLowerCase();
      filtered = filtered.filter(p =>
        (p.name?.toLowerCase().includes(search)) ||
        (p.description?.toLowerCase().includes(search)) ||
        p.brandName.toLowerCase().includes(search) ||
        (p.manufacturer_model_number?.toLowerCase().includes(search)) ||
        (p.sku?.toLowerCase().includes(search)) ||
        p.categoryName.toLowerCase().includes(search) ||
        p.subcategoryName.toLowerCase().includes(search) ||
        p.vendorName.toLowerCase().includes(search)
      );
    }

    if (filterType !== 'all') {
      filtered = filtered.filter(p => p.inventory_type === filterType);
    }

    if (filterCategory !== 'all') {
      filtered = filtered.filter(p => p.categoryName === filterCategory);
    }
    if (filterSubcategory !== 'all') filtered = filtered.filter(p => p.subcategoryName === filterSubcategory);

    if (filterManufacturer !== 'all') {
      filtered = filtered.filter(p => p.manufacturer_id === filterManufacturer);
    }

    if (filterVendor !== 'all') {
      filtered = filtered.filter(p => p.default_vendor_id === filterVendor);
    }

    if (filterPhase !== 'all') {
      filtered = filtered.filter(p => p.labor_phase_id === filterPhase);
    }

    filtered.sort((a, b) => {
      const va = a.vendorName.toLowerCase();
      const vb = b.vendorName.toLowerCase();
      if (va !== vb) return va < vb ? -1 : 1;
      const sa = (a.sku || '').toLowerCase();
      const sb = (b.sku || '').toLowerCase();
      return sa < sb ? -1 : sa > sb ? 1 : 0;
    });

    setFilteredProducts(filtered);
  }

  async function handleDelete(id: string) {
    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);

      if (error) throw error;

      loadProducts();
    } catch (error: any) {
      console.error('Error deleting product:', error);
      const msg = error?.message || 'Failed to delete product';
      if (error?.code === '23503' || msg.includes('violates')) {
        setConfirmModal({ title: 'Product is in use', message: 'This product cannot be deleted because it is used in existing records or has stock. Archive it to hide it from the current catalog?', onConfirm: () => handleArchive(id, true) });
      } else alert(msg);
    }
  }

  async function handleArchive(id: string, archive: boolean) {
    const { error } = await supabase.from('products').update({ is_active: !archive }).eq('id', id);
    if (error) { alert(error.message); return; }
    await loadProducts();
  }

  function handleEdit(productId: string) {
    setEditingProductId(productId);
    setDuplicateProductId(null);
    setShowForm(true);
  }

  function handleDuplicate(productId: string) {
    setDuplicateProductId(productId);
    setEditingProductId(null);
    setShowForm(true);
  }

  function handleCloseForm() {
    setShowForm(false);
    setEditingProductId(null);
    setDuplicateProductId(null);
    // Clear persisted state when explicitly closing the form
    sessionStorage.removeItem('productCatalog_showForm');
    sessionStorage.removeItem('productCatalog_editingProductId');
    sessionStorage.removeItem('productCatalog_duplicateProductId');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">Loading products...</div>
      </div>
    );
  }

  const categories = Array.from(new Set(products.map(p => p.categoryName).filter(Boolean))).sort();
  const activeFilterCount = [filterType, filterCategory, filterSubcategory, filterManufacturer, filterVendor, filterPhase].filter(value => value !== 'all').length;
  const discontinuedCount = products.filter(p => p.is_active !== false && p.is_discontinued).length;
  const missingPhotoCount = products.filter(p => !p.image_url?.trim()).length;
  const subcategories = Array.from(new Set(products.filter(p => filterCategory === 'all' || p.categoryName === filterCategory)
    .map(p => p.subcategoryName).filter(Boolean))).sort();

  return (
    <div className="min-w-0 space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold text-white">Product Catalog</h2>
          <p className="text-gray-400 mt-1">
            {activeTab === 'products'
              ? `${filteredProducts.length} of ${products.length} products`
              : activeTab === 'packages'
              ? 'Manage product packages'
              : 'Browse monitoring services for security contracts'}
          </p>
        </div>
        {activeTab !== 'monitoring' && (
          canEdit ? (
            <button
              onClick={() => {
                if (activeTab === 'products') {
                  setEditingProductId(null);
                  setShowForm(true);
                } else {
                  setEditingPackageId(null);
                  setShowPackageForm(true);
                }
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center gap-2"
            >
              <Plus size={20} />
              {activeTab === 'products' ? 'Add Product' : 'Add Package'}
            </button>
          ) : (
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <Lock size={18} />
              View Only
            </div>
          )
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-700">
        <button
          onClick={() => setActiveTab('products')}
          className={`px-2 sm:px-4 py-2 text-xs sm:text-base font-medium transition-colors ${
            activeTab === 'products'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Products
        </button>
        <button
          onClick={() => setActiveTab('packages')}
          className={`px-2 sm:px-4 py-2 text-xs sm:text-base font-medium transition-colors ${
            activeTab === 'packages'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Packages
        </button>
        <button
          onClick={() => setActiveTab('monitoring')}
          className={`px-2 sm:px-4 py-2 text-xs sm:text-base font-medium transition-colors ${
            activeTab === 'monitoring'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Monitoring Services
        </button>
      </div>

      {/* Search and Filter Bar - Consistent across all tabs */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search Bar */}
        <div className="relative flex-1 min-w-0 basis-full sm:basis-auto">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={
              activeTab === 'products'
                ? "Search products..."
                : activeTab === 'packages'
                ? "Search packages by name, SKU, or description..."
                : "Search monitoring services..."
            }
            className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        {activeTab === 'products' && <select aria-label="Catalog status" value={filterStatus} onChange={event => setFilterStatus(event.target.value as typeof filterStatus)} className="max-w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm">
          <option value="current">Current products</option><option value="discontinued">Discontinued — to archive ({discontinuedCount})</option><option value="archived">Archived</option><option value="all">All products</option>
        </select>}
        {activeTab === 'products' && missingPhotoCount > 0 && (
          <button type="button" onClick={() => setShowMissingPhotos(value => !value)}
            aria-pressed={showMissingPhotos}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${showMissingPhotos
              ? 'border-amber-400 bg-amber-500 text-gray-950'
              : 'border-amber-600/50 bg-gray-800 text-amber-300 hover:bg-gray-700'}`}>
            Missing photos ({missingPhotoCount})
          </button>
        )}

        {activeTab === 'products' && (
          <select aria-label="Group products by" value={groupBy} onChange={e => setGroupBy(e.target.value as CatalogGrouping)}
            className="max-w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm">
            <option value="brand">Group: Brand</option><option value="category">Group: Category</option>
            <option value="vendor">Group: Vendor</option><option value="none">No grouping</option>
          </select>
        )}
        {/* View Toggle - Always visible */}
        <div className="flex items-center gap-1 bg-gray-800 border border-gray-700 rounded-lg p-1">
          <button
            onClick={() => activeTab === 'products' ? setProductsViewMode('list') : setPackagesViewMode('list')}
            disabled={activeTab === 'monitoring'}
            className={`p-2 rounded transition-colors ${
              activeTab === 'monitoring'
                ? 'text-gray-600 cursor-not-allowed'
                : (activeTab === 'products' ? productsViewMode === 'list' : packagesViewMode === 'list')
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
            title="List view"
          >
            <List size={16} />
          </button>
          <button
            onClick={() => activeTab === 'products' ? setProductsViewMode('grid') : setPackagesViewMode('grid')}
            disabled={activeTab === 'monitoring'}
            className={`p-2 rounded transition-colors ${
              activeTab === 'monitoring'
                ? 'text-gray-600 cursor-not-allowed'
                : (activeTab === 'products' ? productsViewMode === 'grid' : packagesViewMode === 'grid')
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
            title="Grid view"
          >
            <Grid3x3 size={16} />
          </button>
        </div>

        {/* Filters Button - Same style for both Products and Packages */}
        {activeTab === 'products' && (
          <button
            onClick={() => setShowFilterPanel(!showFilterPanel)}
            className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 text-sm transition-colors ${
              filterType !== 'all' || filterCategory !== 'all' || filterSubcategory !== 'all' || filterManufacturer !== 'all' || filterVendor !== 'all' || filterPhase !== 'all'
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-750'
            }`}
          >
            <Filter size={16} />
            Filters
            {(filterType !== 'all' || filterCategory !== 'all' || filterSubcategory !== 'all' || filterManufacturer !== 'all' || filterVendor !== 'all' || filterPhase !== 'all') && (
              <span className="bg-white text-blue-600 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {[filterType, filterCategory, filterSubcategory, filterManufacturer, filterVendor, filterPhase].filter(f => f !== 'all').length}
              </span>
            )}
          </button>
        )}

        {activeTab === 'packages' && (
          <button
            onClick={() => setShowPackageFilters(!showPackageFilters)}
            className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 text-sm transition-colors ${
              packageFilterStatus !== 'all'
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-750'
            }`}
          >
            <Filter size={16} />
            Filters
            {packageFilterStatus !== 'all' && (
              <span className="bg-white text-blue-600 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">1</span>
            )}
          </button>
        )}
      </div>

      {activeTab === 'products' && (activeFilterCount > 0 || showMissingPhotos) && (
        <div className="flex flex-wrap items-center gap-2 text-xs" aria-label="Active product filters">
          {[
            { label: filterCategory, clear: () => { setFilterCategory('all'); setFilterSubcategory('all'); } },
            { label: filterSubcategory, clear: () => setFilterSubcategory('all') },
            { label: manufacturers.find(m => m.id === filterManufacturer)?.name || '', clear: () => setFilterManufacturer('all') },
            { label: vendors.find(v => v.id === filterVendor)?.vendor_name || '', clear: () => setFilterVendor('all') },
            { label: filterType === 'all' ? '' : filterType, clear: () => setFilterType('all') },
            { label: phases.find(p => p.id === filterPhase)?.name || '', clear: () => setFilterPhase('all') },
            { label: showMissingPhotos ? 'Missing photos' : '', clear: () => setShowMissingPhotos(false) },
          ].filter(item => item.label && item.label !== 'all').map((item, index) => (
            <button key={index} type="button" onClick={item.clear} className="inline-flex items-center gap-1 rounded-full border border-blue-500/50 bg-blue-900/30 px-2.5 py-1 text-blue-100">
              {item.label} <X size={12} aria-hidden="true" />
            </button>
          ))}
          <button type="button" onClick={() => { setFilterType('all'); setFilterCategory('all'); setFilterSubcategory('all'); setFilterManufacturer('all'); setFilterVendor('all'); setFilterPhase('all'); setShowMissingPhotos(false); }} className="px-2 py-1 text-blue-300 underline">Clear filters</button>
          <span className="text-gray-400">{filteredProducts.length} results</span>
        </div>
      )}

      {/* Products Filter Panel */}
      {activeTab === 'products' && showFilterPanel && (
        <>
          {/* Backdrop to close filter when clicking outside */}
          <div
            className="fixed inset-0 z-[9998]"
            onClick={() => setShowFilterPanel(false)}
          />
          <div className="fixed inset-x-0 bottom-0 sm:inset-x-auto sm:right-4 sm:top-24 sm:bottom-auto w-full sm:w-80 bg-gray-800 border border-gray-700 rounded-t-xl sm:rounded-lg shadow-xl z-[9999] p-4 space-y-3 max-h-[85dvh] sm:max-h-[calc(100dvh-120px)] overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-semibold">Filter Products</h3>
            <button
              onClick={() => setShowFilterPanel(false)}
              className="text-gray-400 hover:text-white"
            >
              <X size={18} />
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Type</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="all">All Types</option>
              <option value="inventory">Inventory</option>
              <option value="labor">Labor</option>
              <option value="non-inventory">Non-Inventory</option>
            </select>
          </div>

          {categories.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Category</label>
              <select
                value={filterCategory}
                onChange={(e) => { setFilterCategory(e.target.value); setFilterSubcategory('all'); }}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="all">All Categories</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          )}

          {subcategories.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Subcategory</label>
              <select value={filterSubcategory} onChange={e => setFilterSubcategory(e.target.value)}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600">
                <option value="all">All Subcategories</option>
                {subcategories.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
          )}

          {manufacturers.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Brand</label>
              <select
                value={filterManufacturer}
                onChange={(e) => setFilterManufacturer(e.target.value)}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="all">All Brands</option>
                {manufacturers.map(mfg => (
                  <option key={mfg.id} value={mfg.id}>{mfg.name}</option>
                ))}
              </select>
            </div>
          )}

          {vendors.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Vendor</label>
              <select
                value={filterVendor}
                onChange={(e) => setFilterVendor(e.target.value)}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="all">All Vendors</option>
                {vendors.map(vendor => (
                  <option key={vendor.id} value={vendor.id}>{vendor.vendor_name}</option>
                ))}
              </select>
            </div>
          )}

          {phases.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Labor Phase</label>
              <select
                value={filterPhase}
                onChange={(e) => setFilterPhase(e.target.value)}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="all">All Phases</option>
                {phases.map(phase => (
                  <option key={phase.id} value={phase.id}>{phase.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="pt-3 border-t border-gray-700">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hideCost}
                onChange={(e) => setHideCost(e.target.checked)}
                className="w-4 h-4 rounded border-gray-600 bg-gray-900 text-blue-600 focus:ring-2 focus:ring-blue-600 focus:ring-offset-0"
              />
              <span className="text-sm text-gray-300">Hide cost column</span>
            </label>
          </div>

          <div className="flex gap-2 pt-3 border-t border-gray-700">
            <button
              onClick={() => {
                setShowMissingPhotos(false);
                setFilterType('all');
                setFilterCategory('all');
                setFilterSubcategory('all');
                setFilterManufacturer('all');
                setFilterVendor('all');
                setFilterPhase('all');
              }}
              className="flex-1 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
            >
              Clear All
            </button>
            <button
              onClick={() => setShowFilterPanel(false)}
              className="flex-1 px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
        </>
      )}

      {/* Package Filter Panel */}
      {activeTab === 'packages' && showPackageFilters && (
        <div className="p-4 bg-gray-800 border border-gray-700 rounded-lg space-y-4 mt-3">
          {/* Sort Controls */}
          <div>
            <label className="text-sm font-medium text-gray-300 mb-2 block">Sort By</label>
            <div className="flex gap-2">
              <select
                value={packageSortBy}
                onChange={(e) => setPackageSortBy(e.target.value as any)}
                className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="name">Name</option>
                <option value="price">Price</option>
                <option value="items">Item Count</option>
                <option value="savings">Savings</option>
                <option value="date">Date Created</option>
              </select>
              <button
                onClick={() => setPackageSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white hover:bg-gray-700 transition-colors flex items-center gap-2"
                title={packageSortOrder === 'asc' ? 'Ascending' : 'Descending'}
              >
                <ArrowUpDown size={16} />
                <span className="text-sm">{packageSortOrder === 'asc' ? 'A-Z' : 'Z-A'}</span>
              </button>
            </div>
          </div>

          {/* Status Filter */}
          <div>
            <label className="text-sm font-medium text-gray-300 mb-2 block">Status</label>
            <div className="flex flex-wrap gap-2">
              {(['all', 'active', 'inactive'] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setPackageFilterStatus(status)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    packageFilterStatus === status
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Clear Filters */}
          {packageFilterStatus !== 'all' && (
            <button
              onClick={() => setPackageFilterStatus('all')}
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}

      {showForm && (
        <SinglePageProductForm
          productId={editingProductId || undefined}
          duplicateFromId={duplicateProductId || undefined}
          readOnly={!canEdit}
          onClose={handleCloseForm}
          onSave={(savedProduct) => {
            loadProducts();
            // If a new product was created, switch to view mode to show it
            if (savedProduct && savedProduct.id && !editingProductId) {
              setEditingProductId(savedProduct.id);
              setDuplicateProductId(null);
              // Switch to read-only view mode after saving
              setShowForm(false);
              setViewingProductId(savedProduct.id);
            }
            // Keep the form open - don't call handleCloseForm()
          }}
        />
      )}

      {activeTab === 'products' && products.length === 0 ? (
        <div className="text-center py-12">
          <Package size={48} className="mx-auto text-gray-600 mb-4" />
          <p className="text-gray-400 mb-4">No products in your catalog yet</p>
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium inline-flex items-center gap-2"
          >
            <Plus size={20} />
            Add Your First Product
          </button>
        </div>
      ) : activeTab === 'products' && filteredProducts.length === 0 ? (
        <div className="text-center py-12">
          <Filter size={48} className="mx-auto text-gray-600 mb-4" />
          <p className="text-gray-400 mb-2">No products match your filters</p>
          <button
            onClick={() => {
              setSearchTerm('');
              setFilterStatus('current');
              setShowMissingPhotos(false);
              setFilterSubcategory('all');
              setFilterType('all');
              setFilterCategory('all');
              setFilterManufacturer('all');
              setFilterVendor('all');
              setFilterPhase('all');
            }}
            className="text-blue-400 hover:text-blue-300 text-sm"
          >
            Clear filters
          </button>
        </div>
      ) : activeTab === 'products' ? (
        <ProductCatalogView
          products={filteredProducts}
          groupBy={groupBy}
          viewMode={productsViewMode}
          revealMatches={filterStatus === 'discontinued' || Boolean(searchTerm.trim()) || showMissingPhotos || [filterType, filterCategory, filterSubcategory, filterManufacturer, filterVendor, filterPhase].some(value => value !== 'all')}
          canEdit={canEdit}
          hideCost={hideCost}
          onView={setViewingProductId}
          onEdit={handleEdit}
          onDuplicate={handleDuplicate}
          onArchive={(id, archive) => setConfirmModal({ title: archive ? 'Archive Product' : 'Restore Product', message: archive ? 'Hide this product from the current catalog and prevent new proposal or invoice additions? Existing records are preserved.' : 'Restore this product to the current catalog?', onConfirm: () => handleArchive(id, archive) })}
          onDelete={(id) => setConfirmModal({ title: 'Delete Product', message: 'Permanently delete this unused product? Products in use cannot be deleted; archive them instead.', onConfirm: () => handleDelete(id) })}
        />
      ) : activeTab === 'packages' ? (
        <PackagesList
          key={packagesKey}
          searchTerm={searchTerm}
          sortBy={packageSortBy}
          sortOrder={packageSortOrder}
          filterStatus={packageFilterStatus}
          canEdit={canEdit}
          viewMode={packagesViewMode}
          onEdit={(packageId) => {
            console.log('onEdit called with packageId:', packageId);
            setEditingPackageId(packageId);
            setShowPackageForm(true);
            console.log('showPackageForm set to true, editingPackageId:', packageId);
          }}
          onRefresh={() => setPackagesKey(prev => prev + 1)}
        />
      ) : (
        <MonitoringServicesCatalog />
      )}

      {showPackageForm && (
        <>
          {console.log('Rendering PackageForm, editingPackageId:', editingPackageId)}
          <PackageForm
            packageId={editingPackageId || undefined}
            readOnly={!canEdit}
            onClose={() => {
              console.log('PackageForm onClose called');
              setShowPackageForm(false);
              setEditingPackageId(null);
            }}
            onSave={() => {
              console.log('PackageForm onSave called');
              setShowPackageForm(false);
              setEditingPackageId(null);
              setPackagesKey(prev => prev + 1);
            }}
          />
        </>
      )}

      {viewingProductId && (
        <ProductDetailModal
          productId={viewingProductId}
          onSaved={loadProducts}
          onDuplicate={() => { const id = viewingProductId; setViewingProductId(null); handleDuplicate(id); }}
          onArchive={() => { const id = viewingProductId; const product = products.find(p => p.id === id); const archive = product?.is_active !== false; setViewingProductId(null); setConfirmModal({ title: archive ? 'Archive Product' : 'Restore Product', message: archive ? 'Hide this product from the current catalog and prevent new proposal or invoice additions? Existing records are preserved.' : 'Restore this product to the current catalog?', onConfirm: () => handleArchive(id, archive) }); }}
          onDelete={() => { const id = viewingProductId; setViewingProductId(null); setConfirmModal({ title: 'Delete Product', message: 'Permanently delete this unused product? Products in use cannot be deleted; archive them instead.', onConfirm: () => handleDelete(id) }); }}
          onClose={() => setViewingProductId(null)}
          onEdit={() => {
            setEditingProductId(viewingProductId);
            setViewingProductId(null);
            setShowForm(true);
          }}
        />
      )}

      <ConfirmModal
        isOpen={confirmModal !== null}
        title={confirmModal?.title ?? ''}
        message={confirmModal?.message ?? ''}
        variant={confirmModal?.title === 'Delete Product' ? 'danger' : 'neutral'}
        confirmLabel={confirmModal?.title === 'Delete Product' ? 'Delete' : confirmModal?.title === 'Restore Product' ? 'Restore' : 'Archive'}
        onConfirm={() => { confirmModal?.onConfirm(); setConfirmModal(null); }}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}
