import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useOfflineStorage } from '../../hooks/useOfflineStorage';
import { X, Plus, Trash2, Save, Search, WifiOff, Upload, Image as ImageIcon } from 'lucide-react';

interface PackageFormProps {
  packageId?: string;
  readOnly?: boolean;
  onClose: () => void;
  onSave: () => void;
}

interface Product {
  id: string;
  manufacturer_model_number: string;
  our_price: number;
  cost: number;
  sku: string;
  category_id?: string;
  labor_phase_id?: string;
  default_labor_hours?: number;
  labor_cost?: number;
  labor_phases?: {
    name: string;
    default_price?: number;
  };
}

interface LaborPhase {
  id: string;
  name: string;
  default_price?: number;
  hourly_rate: number;
}

interface PackageItem {
  product_id: string;
  quantity: number;
  include_labor: boolean;
  use_custom_labor: boolean;
  labor_phase_id?: string;
  labor_hours?: number;
  product?: Product;
}

export default function PackageForm({ packageId, readOnly = false, onClose, onSave }: PackageFormProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [laborPhases, setLaborPhases] = useState<LaborPhase[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showProductSearch, setShowProductSearch] = useState(false);
  const { isOnline } = useOfflineStorage();

  // Image upload state
  const [newImage, setNewImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    package_name: '',
    package_sku: '',
    description: '',
    package_price: '',
    thumbnail_url: '',
    is_active: true
  });

  const [packageItems, setPackageItems] = useState<PackageItem[]>([]);

  useEffect(() => {
    loadProducts();
    loadLaborPhases();
    if (packageId) {
      loadPackage();
    }
  }, [packageId]);

  // Auto-populate package price with calculated total when items change (for new packages only)
  useEffect(() => {
    if (!packageId && packageItems.length > 0) {
      const calculatedTotal = calculateTotalIndividualPrice();
      // Update to calculated total - user can manually override if desired
      setFormData(prev => ({ ...prev, package_price: calculatedTotal.toFixed(2) }));
    }
  }, [packageItems]);

  async function loadProducts() {
    try {
      setLoadingProducts(true);
      const { data, error } = await supabase
        .from('products')
        .select(`
          id,
          manufacturer_model_number,
          our_price,
          cost,
          sku,
          category_id,
          labor_phase_id,
          default_labor_hours,
          labor_phases (
            name,
            default_price
          )
        `)
        .eq('is_active', true)
        .order('manufacturer_model_number');

      if (error) throw error;

      const productsWithLaborCost = (data || []).map(product => ({
        ...product,
        labor_cost: product.labor_phase_id && product.default_labor_hours
          ? (product.default_labor_hours * (product.labor_phases?.default_price || 0))
          : 0
      }));

      setProducts(productsWithLaborCost);
    } catch (error) {
      console.error('Error loading products:', error);
      alert('Failed to load products. Please try again.');
    } finally {
      setLoadingProducts(false);
    }
  }

  async function loadLaborPhases() {
    try {
      const { data, error } = await supabase
        .from('labor_phases')
        .select('id, name, default_price')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;

      const phasesWithHourlyRate = (data || []).map(phase => ({
        ...phase,
        hourly_rate: phase.default_price
      }));

      setLaborPhases(phasesWithHourlyRate);
    } catch (error) {
      console.error('Error loading labor phases:', error);
    }
  }

  async function loadPackage() {
    if (!packageId) return;

    try {
      setLoading(true);

      const { data: pkgData, error: pkgError } = await supabase
        .from('product_packages')
        .select('*')
        .eq('id', packageId)
        .single();

      if (pkgError) throw pkgError;

      setFormData({
        package_name: pkgData.package_name || '',
        package_sku: pkgData.package_sku || '',
        description: pkgData.description || '',
        package_price: pkgData.package_price?.toString() || '',
        thumbnail_url: pkgData.thumbnail_url || '',
        is_active: pkgData.is_active ?? true
      });

      const { data: itemsData, error: itemsError } = await supabase
        .from('product_package_items')
        .select(`
          product_id,
          quantity,
          include_labor,
          product:products (
            id,
            manufacturer_model_number,
            our_price,
            cost,
            sku,
            category_id,
            labor_phase_id,
            default_labor_hours,
            labor_phases (
              name,
              default_price
            )
          )
        `)
        .eq('package_id', packageId);

      if (itemsError) throw itemsError;

      const itemsWithLaborCost = itemsData?.map((item: any) => {
        const product = item.product;
        const labor_cost = product?.labor_phase_id && product?.default_labor_hours
          ? (product.default_labor_hours * (product.labor_phases?.default_price || 0))
          : 0;

        return {
          product_id: item.product_id,
          quantity: item.quantity,
          include_labor: item.include_labor || false,
          use_custom_labor: false,
          labor_phase_id: product?.labor_phase_id,
          labor_hours: product?.default_labor_hours || 0,
          product: {
            ...product,
            labor_cost
          }
        };
      }) || [];

      setPackageItems(itemsWithLaborCost);
    } catch (error) {
      console.error('Error loading package:', error);
      alert('Failed to load package');
    } finally {
      setLoading(false);
    }
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
      }
      setNewImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  function handleRemoveImage() {
    setNewImage(null);
    setPreviewUrl(null);
    setFormData({ ...formData, thumbnail_url: '' });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function uploadPackageImage(pkgId: string): Promise<string | null> {
    if (!newImage) return null;

    try {
      setUploadingImage(true);

      // Generate unique filename
      const fileExt = newImage.name.split('.').pop();
      const fileName = `package_${pkgId}_${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      // Upload to storage
      const { error: uploadError, data } = await supabase.storage
        .from('product-images')
        .upload(filePath, newImage, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      throw error;
    } finally {
      setUploadingImage(false);
    }
  }

  function addProduct(product: Product) {
    const existing = packageItems.find(item => item.product_id === product.id);
    if (existing) {
      alert('This product is already in the package');
      return;
    }

    setPackageItems([...packageItems, {
      product_id: product.id,
      quantity: 1,
      include_labor: false,
      use_custom_labor: false,
      labor_phase_id: product.labor_phase_id,
      labor_hours: product.default_labor_hours || 0,
      product
    }]);
    setShowProductSearch(false);
    setSearchTerm('');
  }

  function removeProduct(productId: string) {
    setPackageItems(packageItems.filter(item => item.product_id !== productId));
  }

  function updateQuantity(productId: string, value: string) {
    // Allow empty string temporarily while typing
    if (value === '') {
      setPackageItems(packageItems.map(item =>
        item.product_id === productId ? { ...item, quantity: 0 } : item
      ));
      return;
    }
    const quantity = Math.max(1, parseInt(value));
    if (!isNaN(quantity)) {
      setPackageItems(packageItems.map(item =>
        item.product_id === productId ? { ...item, quantity } : item
      ));
    }
  }

  function updateLaborHours(productId: string, value: string) {
    const hours = parseFloat(value) || 0;
    setPackageItems(packageItems.map(item =>
      item.product_id === productId ? { ...item, labor_hours: hours } : item
    ));
  }

  function updateLaborPhase(productId: string, laborPhaseId: string) {
    setPackageItems(packageItems.map(item =>
      item.product_id === productId ? { ...item, labor_phase_id: laborPhaseId } : item
    ));
  }

  function toggleCustomLabor(productId: string) {
    setPackageItems(packageItems.map(item => {
      if (item.product_id === productId) {
        const newUseCustom = !item.use_custom_labor;
        return {
          ...item,
          use_custom_labor: newUseCustom,
          labor_phase_id: newUseCustom ? (laborPhases[0]?.id || '') : (item.product?.labor_phase_id || ''),
          labor_hours: newUseCustom ? 0 : (item.product?.default_labor_hours || 0)
        };
      }
      return item;
    }));
  }

  function toggleIncludeLabor(productId: string) {
    setPackageItems(packageItems.map(item => {
      if (item.product_id === productId) {
        const newIncludeLabor = !item.include_labor;
        return {
          ...item,
          include_labor: newIncludeLabor,
          labor_hours: newIncludeLabor && !item.use_custom_labor ? (item.product?.default_labor_hours || 0) : item.labor_hours
        };
      }
      return item;
    }));
  }

  function calculateTotalIndividualPrice(): number {
    return packageItems.reduce((sum, item) => {
      const qty = Math.max(item.quantity, 1);
      const productCost = Number(item.product?.our_price || 0) * qty;

      let laborCost = 0;
      if (item.include_labor) {
        if (item.use_custom_labor) {
          const phase = laborPhases.find(p => p.id === item.labor_phase_id);
          laborCost = (item.labor_hours || 0) * (phase?.hourly_rate || 0);
        } else {
          laborCost = Number(item.product?.labor_cost || 0) * qty;
        }
      }

      return sum + productCost + laborCost;
    }, 0);
  }

  function calculateSavings(): number {
    const individualPrice = calculateTotalIndividualPrice();
    const packagePrice = Number(formData.package_price) || 0;
    return individualPrice - packagePrice;
  }

  async function handleSubmit(e?: React.FormEvent) {
    if (e) {
      e.preventDefault();
    }

    if (!formData.package_name.trim()) {
      alert('Package name is required');
      return;
    }

    if (!formData.package_price || Number(formData.package_price) <= 0) {
      alert('Package price is required and must be greater than 0');
      return;
    }

    if (packageItems.length === 0) {
      alert('Add at least one product to the package');
      return;
    }

    const invalidItems = packageItems.filter(item => item.quantity < 1);
    if (invalidItems.length > 0) {
      alert('All products must have a quantity of at least 1');
      return;
    }

    try {
      setSaving(true);

      const packageData = {
        package_name: formData.package_name,
        package_sku: formData.package_sku || null,
        description: formData.description || null,
        package_price: Number(formData.package_price),
        thumbnail_url: formData.thumbnail_url || null,
        is_active: formData.is_active,
        company_id: '00000000-0000-0000-0000-000000000000'
      };

      let pkgId = packageId;

      if (packageId) {
        const { error } = await supabase
          .from('product_packages')
          .update(packageData)
          .eq('id', packageId);

        if (error) throw error;

        const { error: deleteError } = await supabase
          .from('product_package_items')
          .delete()
          .eq('package_id', packageId);

        if (deleteError) throw deleteError;
      } else {
        const { data, error } = await supabase
          .from('product_packages')
          .insert(packageData)
          .select()
          .single();

        if (error) throw error;
        pkgId = data.id;
      }

      const items = packageItems.map((item, index) => ({
        package_id: pkgId,
        product_id: item.product_id,
        quantity: item.quantity,
        include_labor: item.include_labor,
        sort_order: index
      }));

      const { error: itemsError } = await supabase
        .from('product_package_items')
        .insert(items);

      if (itemsError) throw itemsError;

      // Upload image if a new one was selected
      if (newImage && pkgId) {
        try {
          const imageUrl = await uploadPackageImage(pkgId);
          if (imageUrl) {
            // Update package with new image URL
            const { error: imageError } = await supabase
              .from('product_packages')
              .update({ thumbnail_url: imageUrl })
              .eq('id', pkgId);

            if (imageError) {
              console.error('Error updating image URL:', imageError);
            }
          }
        } catch (error) {
          console.error('Error uploading image:', error);
          alert('Package saved but image upload failed. You can try uploading the image again by editing the package.');
        }
      }

      onSave();
    } catch (error) {
      console.error('Error saving package:', error);
      alert('Failed to save package');
    } finally {
      setSaving(false);
    }
  }

  const filteredProducts = searchTerm
    ? products.filter(p => {
        const search = searchTerm.toLowerCase();
        return (
          p.manufacturer_model_number?.toLowerCase().includes(search) ||
          p.sku?.toLowerCase().includes(search) ||
          p.category?.toLowerCase().includes(search)
        );
      })
    : products;

  const totalIndividualPrice = calculateTotalIndividualPrice();
  const savings = calculateSavings();
  const savingsPercent = totalIndividualPrice > 0 ? (savings / totalIndividualPrice) * 100 : 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-gray-900 rounded-lg w-full max-w-4xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-3 sm:p-6 border-b border-gray-700">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg sm:text-xl font-bold text-white truncate">
              {packageId ? 'Edit Package' : 'Create Package'}
            </h2>
            {!isOnline && (
              <div className="flex items-center gap-1 text-xs text-yellow-400 mt-1">
                <WifiOff size={12} />
                <span>Offline - changes will sync when online</span>
              </div>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white ml-2 touch-manipulation">
            <X size={20} className="sm:w-6 sm:h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4 sm:space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-gray-400">Loading...</div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Package Name *
                  </label>
                  <input
                    type="text"
                    value={formData.package_name}
                    onChange={(e) => setFormData({ ...formData, package_name: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Package SKU
                  </label>
                  <input
                    type="text"
                    value={formData.package_sku}
                    onChange={(e) => setFormData({ ...formData, package_sku: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Package Thumbnail Image
                </label>

                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="hidden"
                />

                {/* Image preview and upload button */}
                <div className="space-y-3">
                  {(previewUrl || formData.thumbnail_url) && (
                    <div className="relative w-full max-w-xs">
                      <img
                        src={previewUrl || formData.thumbnail_url}
                        alt="Package thumbnail"
                        className="w-full h-48 object-cover rounded-lg border border-gray-700"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = '';
                          target.alt = 'Failed to load image';
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="absolute top-2 right-2 p-1.5 bg-red-600 hover:bg-red-700 text-white rounded-full transition-colors"
                        title="Remove image"
                      >
                        <X size={16} />
                      </button>
                      {newImage && (
                        <div className="absolute top-2 left-2 px-2 py-1 bg-blue-600 text-white text-xs rounded">
                          New image selected
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingImage}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
                    >
                      {uploadingImage ? (
                        <>
                          <WifiOff size={16} className="animate-spin" />
                          <span>Uploading...</span>
                        </>
                      ) : (
                        <>
                          <Upload size={16} />
                          <span>{previewUrl || formData.thumbnail_url ? 'Change Image' : 'Upload Image'}</span>
                        </>
                      )}
                    </button>

                    {!previewUrl && !formData.thumbnail_url && (
                      <div className="flex-1 flex items-center text-sm text-gray-500">
                        <ImageIcon size={16} className="mr-2" />
                        No image selected
                      </div>
                    )}
                  </div>

                  {/* Optional: URL input as alternative */}
                  <details className="text-sm">
                    <summary className="cursor-pointer text-gray-400 hover:text-gray-300">
                      Or enter image URL manually
                    </summary>
                    <div className="mt-2">
                      <input
                        type="url"
                        value={formData.thumbnail_url}
                        onChange={(e) => {
                          setFormData({ ...formData, thumbnail_url: e.target.value });
                          // Clear uploaded image if user enters URL
                          setNewImage(null);
                          setPreviewUrl(null);
                        }}
                        placeholder="https://example.com/image.jpg"
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                      />
                    </div>
                  </details>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-300">
                    Products in Package *
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowProductSearch(!showProductSearch)}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm flex items-center gap-1"
                  >
                    <Plus size={14} />
                    Add Product
                  </button>
                </div>

                {showProductSearch && (
                  <div className="mb-4 p-3 bg-gray-800 border border-gray-700 rounded-lg">
                    <div className="relative mb-2">
                      <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search by product name or SKU..."
                        className="w-full pl-9 pr-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm"
                        autoFocus
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {loadingProducts ? (
                        <div className="text-center py-4 text-gray-400 text-sm">
                          Loading products...
                        </div>
                      ) : filteredProducts.length === 0 ? (
                        <div className="text-center py-4 text-gray-400 text-sm">
                          {searchTerm ? 'No products found matching your search' : 'No products available'}
                        </div>
                      ) : (
                        filteredProducts.slice(0, 10).map(product => (
                          <button
                            key={product.id}
                            type="button"
                            onClick={() => addProduct(product)}
                            className="w-full text-left px-3 py-2 hover:bg-gray-700 rounded text-sm text-white transition-colors"
                          >
                            <div className="font-medium">{product.manufacturer_model_number}</div>
                            <div className="text-xs text-gray-400">
                              ${Number(product.our_price).toFixed(2)} • {product.sku}
                            </div>
                          </button>
                        ))
                      )}
                      {!loadingProducts && filteredProducts.length > 10 && (
                        <div className="text-center py-2 text-gray-400 text-xs">
                          Showing first 10 results. Refine your search to see more.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {packageItems.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">
                    No products added yet
                  </p>
                ) : (
                  <div className="space-y-2">
                    {packageItems.map(item => {
                      const hasLabor = item.product?.labor_phase_id && (item.product?.default_labor_hours || 0) > 0;
                      return (
                        <div key={item.product_id} className="p-3 bg-gray-800 border border-gray-700 rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className="flex-1">
                              <div className="font-medium text-white">
                                {item.product?.manufacturer_model_number}
                              </div>
                              <div className="text-xs text-gray-400">
                                ${Number(item.product?.our_price || 0).toFixed(2)} each
                              </div>
                              {hasLabor && (
                                <div className="text-xs text-blue-400 mt-1">
                                  Labor: {item.product?.labor_phases?.name} - {item.product?.default_labor_hours}h
                                  {item.product?.labor_cost ? ` ($${item.product.labor_cost.toFixed(2)})` : ''}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min="1"
                                value={item.quantity || ''}
                                onChange={(e) => updateQuantity(item.product_id, e.target.value)}
                                onBlur={(e) => {
                                  if (e.target.value === '' || parseInt(e.target.value) < 1) {
                                    updateQuantity(item.product_id, '1');
                                  }
                                }}
                                className="w-16 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm text-center"
                              />
                              <span className="text-sm text-gray-400 w-20 text-right">
                                ${(Number(item.product?.our_price || 0) * Math.max(item.quantity, 1)).toFixed(2)}
                              </span>
                              <button
                                type="button"
                                onClick={() => removeProduct(item.product_id)}
                                className="text-red-400 hover:text-red-300 p-1"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                          {hasLabor && (
                            <div className="mt-2 pt-2 border-t border-gray-700 space-y-2">
                              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={item.include_labor}
                                  onChange={() => toggleIncludeLabor(item.product_id)}
                                  className="rounded border-gray-600 bg-gray-900 text-blue-600 focus:ring-blue-600 focus:ring-offset-gray-800"
                                />
                                <span>Include labor for this item</span>
                              </label>
                              {item.include_labor && (
                                <div className="pl-6 space-y-2">
                                  {!item.use_custom_labor ? (
                                    <div className="space-y-2">
                                      <div className="text-xs text-gray-400">
                                        Using product default: {item.product?.labor_phases?.name} - {item.product?.default_labor_hours}h × {Math.max(item.quantity, 1)} = ${(Number(item.product?.labor_cost || 0) * Math.max(item.quantity, 1)).toFixed(2)}
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => toggleCustomLabor(item.product_id)}
                                        className="text-xs text-blue-400 hover:text-blue-300 underline"
                                      >
                                        Use custom labor instead
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="space-y-2">
                                      <div className="flex items-center gap-2">
                                        <label className="text-xs text-gray-400 w-20">Labor Phase:</label>
                                        <select
                                          value={item.labor_phase_id || ''}
                                          onChange={(e) => updateLaborPhase(item.product_id, e.target.value)}
                                          className="flex-1 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-xs"
                                        >
                                          {laborPhases.map(phase => (
                                            <option key={phase.id} value={phase.id}>
                                              {phase.name} (${phase.hourly_rate}/hr)
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <label className="text-xs text-gray-400 w-20">Labor Hours:</label>
                                        <input
                                          type="number"
                                          min="0"
                                          step="0.25"
                                          value={item.labor_hours || 0}
                                          onChange={(e) => updateLaborHours(item.product_id, e.target.value)}
                                          className="w-20 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-xs"
                                        />
                                        <span className="text-xs text-blue-400">
                                          = ${((item.labor_hours || 0) * (laborPhases.find(p => p.id === item.labor_phase_id)?.hourly_rate || 0)).toFixed(2)}
                                        </span>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => toggleCustomLabor(item.product_id)}
                                        className="text-xs text-blue-400 hover:text-blue-300 underline"
                                      >
                                        Use product default labor
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-800 border border-gray-700 rounded-lg">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Package Selling Price *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.package_price}
                    onChange={(e) => setFormData({ ...formData, package_price: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
                    placeholder="Auto-filled with calculated total"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Defaults to calculated total. Change if you want a different price.
                  </p>
                </div>

                <div className="space-y-1">
                  <div className="text-sm text-gray-400">Calculated Total (Items + Labor):</div>
                  <div className="text-lg font-semibold text-white">
                    ${totalIndividualPrice.toFixed(2)}
                  </div>
                  {savings > 0 && (
                    <div className="text-sm text-green-400">
                      Package Discount: ${savings.toFixed(2)} ({savingsPercent.toFixed(0)}%)
                    </div>
                  )}
                  {savings < 0 && (
                    <div className="text-sm text-yellow-400">
                      Selling price is ${Math.abs(savings).toFixed(2)} above calculated total
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="rounded border-gray-700 bg-gray-800 text-blue-600 focus:ring-blue-600"
                />
                <label htmlFor="is_active" className="text-sm text-gray-300">
                  Active (available for selection)
                </label>
              </div>
            </>
          )}
        </form>

        <div className="flex items-center justify-end gap-2 sm:gap-3 p-3 sm:p-6 border-t border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="px-3 sm:px-4 py-2 text-sm sm:text-base text-gray-300 hover:text-white touch-manipulation"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || loading}
            className="px-4 sm:px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center gap-2 disabled:bg-gray-600 disabled:cursor-not-allowed text-sm sm:text-base touch-manipulation"
          >
            <Save size={14} className="sm:w-4 sm:h-4" />
            {saving ? 'Saving...' : 'Save Package'}
          </button>
        </div>
      </div>
    </div>
  );
}
