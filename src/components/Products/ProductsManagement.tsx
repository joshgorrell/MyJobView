import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Product } from '../../lib/types';
import { Plus, CreditCard as Edit2, Trash2, Package, Search, Filter, Eye, Lock, Copy, X, ArrowUpDown, SlidersHorizontal, Grid3x3, List } from 'lucide-react';
import SinglePageProductForm from './SinglePageProductForm';
import PackagesList from './PackagesList';
import PackageForm from './PackageForm';
import MonitoringServicesCatalog from './MonitoringServicesCatalog';
import { ProductDetailModal } from './ProductDetailModal';
import ProductsGridView from './ProductsGridView';
import PackagesListView from './PackagesListView';
import ConfirmModal from '../ui/ConfirmModal';

export default function ProductsManagement() {
  const { profile, loading: authLoading } = useAuth();
  const canEdit = profile?.can_edit_products ?? false;

  console.log('ProductsManagement canEdit:', canEdit, 'profile:', profile, 'authLoading:', authLoading);
  const [activeTab, setActiveTab] = useState<'products' | 'packages' | 'monitoring'>('products');
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
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
  const [filterType, setFilterType] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
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
  }, [products, searchTerm, filterType, filterCategory, filterManufacturer, filterVendor, filterPhase]);

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
        .select('*')
        .order('vendor', { nullsFirst: false })
        .order('sku', { nullsFirst: false });

      console.log('ProductsManagement: Products query result:', { data: data?.length, error });

      if (error) throw error;

      setProducts(data || []);
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
        supabase.from('vendors').select('id, name').order('name'),
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
    let filtered = [...products];

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(p =>
        (p.manufacturer_model_number?.toLowerCase().includes(search)) ||
        (p.sku?.toLowerCase().includes(search)) ||
        (p.category?.toLowerCase().includes(search))
      );
    }

    if (filterType !== 'all') {
      filtered = filtered.filter(p => p.inventory_type === filterType);
    }

    if (filterCategory !== 'all') {
      filtered = filtered.filter(p => p.category === filterCategory);
    }

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
      const va = (a.vendor || '').toLowerCase();
      const vb = (b.vendor || '').toLowerCase();
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
    } catch (error) {
      console.error('Error deleting product:', error);
      alert('Failed to delete product');
    }
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

  const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean)));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
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
      <div className="flex gap-2 border-b border-gray-700">
        <button
          onClick={() => setActiveTab('products')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'products'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Products
        </button>
        <button
          onClick={() => setActiveTab('packages')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'packages'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          Packages
        </button>
        <button
          onClick={() => setActiveTab('monitoring')}
          className={`px-4 py-2 font-medium transition-colors ${
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
        <div className="relative flex-1 min-w-[240px]">
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
              filterType !== 'all' || filterCategory !== 'all' || filterManufacturer !== 'all' || filterVendor !== 'all' || filterPhase !== 'all'
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-750'
            }`}
          >
            <Filter size={16} />
            Filters
            {(filterType !== 'all' || filterCategory !== 'all' || filterManufacturer !== 'all' || filterVendor !== 'all' || filterPhase !== 'all') && (
              <span className="bg-white text-blue-600 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {[filterType, filterCategory, filterManufacturer, filterVendor, filterPhase].filter(f => f !== 'all').length}
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

      {/* Products Filter Panel */}
      {activeTab === 'products' && showFilterPanel && (
        <>
          {/* Backdrop to close filter when clicking outside */}
          <div
            className="fixed inset-0 z-[9998]"
            onClick={() => setShowFilterPanel(false)}
          />
          <div className="fixed right-4 top-32 w-80 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-[9999] p-4 space-y-4 max-h-[calc(100vh-150px)] overflow-y-auto">
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
                onChange={(e) => setFilterCategory(e.target.value)}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="all">All Categories</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          )}

          {manufacturers.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Manufacturer</label>
              <select
                value={filterManufacturer}
                onChange={(e) => setFilterManufacturer(e.target.value)}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                <option value="all">All Manufacturers</option>
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
                  <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
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
                setFilterType('all');
                setFilterCategory('all');
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
        productsViewMode === 'grid' ? (
          <ProductsGridView
            products={filteredProducts}
            canEdit={canEdit}
            hideCost={hideCost}
            onView={(productId) => setViewingProductId(productId)}
            onEdit={handleEdit}
            onDuplicate={handleDuplicate}
            onDelete={(id) => setConfirmModal({ title: 'Delete Product', message: 'Delete this product?', onConfirm: () => handleDelete(id) })}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="text-[10px] sm:text-xs lg:text-sm text-gray-400 border-b border-gray-700">
                <tr>
                  <th className="text-left py-1 sm:py-1.5 px-1 sm:px-2 w-8 sm:w-10 lg:w-12"></th>
                  <th className="text-left py-1 sm:py-1.5 px-1 sm:px-2">Vendor / SKU</th>
                  <th className="text-left py-1 sm:py-1.5 px-1 sm:px-2">Description</th>
                  <th className="text-right py-1 sm:py-1.5 px-1 sm:px-2">Price</th>
                  {!hideCost && (
                    <th className="text-right py-1 sm:py-1.5 px-1 sm:px-2">Cost</th>
                  )}
                  <th className="text-right py-1 sm:py-1.5 px-1 sm:px-2">Actions</th>
                </tr>
              </thead>
              <tbody className="text-[10px] sm:text-xs lg:text-sm">
                {filteredProducts.map(product => {
                  const cost = Number(product.cost || 0);
                  const price = Number(product.our_price || product.unit_price || 0);
                  const profit = price - cost;
                  const margin = price > 0 ? (profit / price) * 100 : 0;
                  const description = product.description || '-';
                  const truncatedDescription = description.length > 60 ? description.substring(0, 60) + '...' : description;

                  return (
                    <tr
                      key={product.id}
                      onClick={() => setViewingProductId(product.id)}
                      className="border-b border-gray-700 hover:bg-gray-800 cursor-pointer"
                    >
                      <td className="py-0.5 sm:py-1 lg:py-1.5 px-1 sm:px-2">
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt={product.manufacturer_model_number}
                            className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10 object-cover rounded border border-gray-600"
                          />
                        ) : (
                          <div className="w-6 h-6 sm:w-8 sm:h-8 lg:w-10 lg:h-10 bg-gray-700 rounded flex items-center justify-center">
                            <Package size={12} className="text-gray-500 sm:w-3 sm:h-3 lg:w-4 lg:h-4" />
                          </div>
                        )}
                      </td>
                      <td className="py-0.5 sm:py-1 lg:py-1.5 px-1 sm:px-2">
                        {product.vendor && (
                          <div className="text-[9px] sm:text-[10px] text-gray-500 uppercase tracking-wide font-medium truncate">
                            {product.vendor}
                          </div>
                        )}
                        <div className="font-mono font-medium text-white truncate lg:whitespace-normal">
                          {product.sku || product.manufacturer_model_number}
                        </div>
                      </td>
                      <td
                        className="py-0.5 sm:py-1 lg:py-1.5 px-1 sm:px-2 text-gray-300 max-w-xs"
                        title={description}
                      >
                        <div className="truncate">
                          {truncatedDescription}
                        </div>
                      </td>
                      <td className="py-0.5 sm:py-1 lg:py-1.5 px-1 sm:px-2 text-right text-white font-medium">
                        ${price.toFixed(2)}
                      </td>
                      {!hideCost && (
                        <td className="py-0.5 sm:py-1 lg:py-1.5 px-1 sm:px-2 text-right text-gray-300">
                          ${cost.toFixed(2)}
                        </td>
                      )}
                      <td className="py-0.5 sm:py-1 lg:py-1.5 px-1 sm:px-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-0.5 sm:gap-1">
                          <button
                            onClick={() => setViewingProductId(product.id)}
                            className="text-green-400 hover:text-green-300 p-1 touch-manipulation"
                            title="View details & history"
                          >
                            <Eye size={12} className="sm:w-3.5 sm:h-3.5 lg:w-4 lg:h-4" />
                          </button>
                          {canEdit && (
                            <>
                              <button
                                onClick={() => handleEdit(product.id)}
                                className="text-blue-400 hover:text-blue-300 p-1 touch-manipulation"
                                title="Edit product"
                              >
                                <Edit2 size={12} className="sm:w-3.5 sm:h-3.5 lg:w-4 lg:h-4" />
                              </button>
                              <button
                                onClick={() => handleDuplicate(product.id)}
                                className="text-purple-400 hover:text-purple-300 p-1 touch-manipulation"
                                title="Duplicate product"
                              >
                                <Copy size={12} className="sm:w-3.5 sm:h-3.5 lg:w-4 lg:h-4" />
                              </button>
                              <button
                                onClick={() => setConfirmModal({ title: 'Delete Product', message: 'Delete this product?', onConfirm: () => handleDelete(product.id) })}
                                className="text-red-400 hover:text-red-300 p-1 touch-manipulation"
                                title="Delete product"
                              >
                                <Trash2 size={12} className="sm:w-3.5 sm:h-3.5 lg:w-4 lg:h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
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
        onConfirm={() => { confirmModal?.onConfirm(); setConfirmModal(null); }}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}
