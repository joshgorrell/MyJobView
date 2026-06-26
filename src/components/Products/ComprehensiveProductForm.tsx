import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency } from '../../lib/utils';
import { X, Save, Package, DollarSign, Wrench, FileText, Link, Image, Upload, ExternalLink, Search } from 'lucide-react';
import ImageSearchModal from './ImageSearchModal';

interface Manufacturer {
  id: string;
  name: string;
}

interface Vendor {
  id: string;
  vendor_name: string;
}

interface LaborPhase {
  id: string;
  name: string;
}

interface ProposalClass {
  id: string;
  name: string;
  color: string;
}

interface ProductFormProps {
  productId?: string;
  onClose: () => void;
  onSave: () => void;
}

export default function ComprehensiveProductForm({ productId, onClose, onSave }: ProductFormProps) {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'basic' | 'pricing' | 'inventory' | 'descriptions' | 'accessories'>('basic');
  const [saving, setSaving] = useState(false);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [laborPhases, setLaborPhases] = useState<LaborPhase[]>([]);
  const [classes, setClasses] = useState<ProposalClass[]>([]);
  const [showNewManufacturer, setShowNewManufacturer] = useState(false);
  const [newManufacturerName, setNewManufacturerName] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [showImageSearch, setShowImageSearch] = useState(false);
  const [autoSearchTriggered, setAutoSearchTriggered] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    // Basic Info
    manufacturer_id: '',
    manufacturer_model_number: '',
    item_name: '',
    item_color: '',
    category: '',
    sku: '',
    default_qty: 1,
    unit: 'ea',
    image_url: '',
    product_link: '',

    // Pricing
    cost: 0,
    margin_percent: 50,
    our_price: 0,
    minimum_price: 0,
    minimum_margin: 0,

    // Inventory
    inventory_type: 'inventory',
    item_type: 'material' as 'material' | 'labor',
    is_taxable: null as boolean | null,
    default_vendor_id: '',

    // Labor
    labor_phase_id: '',
    default_labor_hours: 0,

    // Descriptions
    sales_description: '',
    purchase_description: '',
    default_install_task: '',

    // Class
    default_class_id: '',

    // Legacy fields (keep for compatibility)
    name: '',
    description: ''
  });

  useEffect(() => {
    loadOptions();
    if (productId) {
      loadProduct();
    }
  }, [productId]);

  useEffect(() => {
    // Auto-calculate price when cost or margin changes
    if (formData.cost > 0 && formData.margin_percent > 0) {
      const calculatedPrice = formData.cost / (1 - (formData.margin_percent / 100));
      setFormData(prev => ({ ...prev, our_price: Number(calculatedPrice.toFixed(2)) }));
    }
  }, [formData.cost, formData.margin_percent]);

  useEffect(() => {
    // Copy model number to item_name if empty
    if (formData.manufacturer_model_number && !formData.item_name) {
      setFormData(prev => ({ ...prev, item_name: formData.manufacturer_model_number }));
    }

    // Auto-trigger image search after model number is entered (once per product)
    if (formData.manufacturer_model_number && !imagePreview && !autoSearchTriggered && !productId) {
      const timer = setTimeout(() => {
        setShowImageSearch(true);
        setAutoSearchTriggered(true);
      }, 1500); // Wait 1.5 seconds after typing stops

      return () => clearTimeout(timer);
    }
  }, [formData.manufacturer_model_number, imagePreview, autoSearchTriggered, productId]);

  function getSearchQuery(): string {
    const parts = [];
    if (formData.manufacturer_id) {
      const mfg = manufacturers.find(m => m.id === formData.manufacturer_id);
      if (mfg) parts.push(mfg.name);
    }
    if (formData.manufacturer_model_number) {
      parts.push(formData.manufacturer_model_number);
    }
    return parts.join(' ') || 'product';
  }

  async function loadOptions() {
    const [mfgRes, vendorRes, phaseRes, classRes] = await Promise.all([
      supabase.from('manufacturers').select('id, name').order('name'),
      supabase.from('vendors').select('id, vendor_name').eq('is_active', true).order('vendor_name'),
      supabase.from('labor_phases').select('id, name').eq('is_active', true).order('sort_order'),
      supabase.from('proposal_classes').select('id, name, color').eq('is_active', true).order('name')
    ]);

    if (mfgRes.data) setManufacturers(mfgRes.data);
    if (vendorRes.data) setVendors(vendorRes.data);
    if (phaseRes.data) setLaborPhases(phaseRes.data);
    if (classRes.data) setClasses(classRes.data);
  }

  async function loadProduct() {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .single();

    if (data) {
      setFormData({
        manufacturer_id: data.manufacturer_id || '',
        manufacturer_model_number: data.manufacturer_model_number || '',
        item_name: data.item_name || data.name || '',
        item_color: data.item_color || '',
        category: data.category || '',
        sku: data.sku || '',
        default_qty: data.default_qty || 1,
        unit: data.unit || 'ea',
        image_url: data.image_url || '',
        product_link: data.product_link || '',
        cost: Number(data.cost || 0),
        margin_percent: Number(data.margin_percent || 50),
        our_price: Number(data.our_price || data.unit_price || 0),
        minimum_price: Number(data.minimum_price || 0),
        minimum_margin: Number(data.minimum_margin || 0),
        inventory_type: data.inventory_type || 'inventory',
        item_type: data.item_type || 'material',
        is_taxable: data.is_taxable,
        default_vendor_id: data.default_vendor_id || '',
        labor_phase_id: data.labor_phase_id || '',
        default_labor_hours: Number(data.default_labor_hours || 0),
        sales_description: data.sales_description || data.description || '',
        purchase_description: data.purchase_description || '',
        default_install_task: data.default_install_task || '',
        default_class_id: data.default_class_id || '',
        name: data.name || '',
        description: data.description || ''
      });
      if (data.image_url) {
        setImagePreview(data.image_url);
      }
    }
  }

  async function handleAddManufacturer() {
    if (!newManufacturerName.trim()) return;

    const { data, error } = await supabase
      .from('manufacturers')
      .insert({ name: newManufacturerName })
      .select()
      .single();

    if (data) {
      setManufacturers([...manufacturers, data]);
      setFormData(prev => ({ ...prev, manufacturer_id: data.id }));
      setNewManufacturerName('');
      setShowNewManufacturer(false);
    }
  }

  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploadingImage(true);

      // Create unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `products/${Date.now()}.${fileExt}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(fileName);

      setFormData(prev => ({ ...prev, image_url: publicUrl }));
      setImagePreview(publicUrl);
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  }

  function handleImageUrlChange(url: string) {
    setFormData(prev => ({ ...prev, image_url: url }));
    setImagePreview(url);
  }

  function handleRemoveImage() {
    setFormData(prev => ({ ...prev, image_url: '' }));
    setImagePreview('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.image_url) {
      alert('A product image is required. Please upload an image or paste an image URL.');
      return;
    }

    setSaving(true);

    try {
      // Destructure to exclude item_name and other fields that need transformation
      const { item_name, ...restFormData } = formData;

      const productData = {
        ...restFormData,
        name: item_name || formData.manufacturer_model_number,
        description: formData.sales_description,
        unit_price: formData.our_price
      };

      if (productId) {
        const { error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', productId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('products')
          .insert(productData);
        if (error) throw error;
      }

      onSave();
      onClose();
    } catch (error) {
      console.error('Error saving product:', error);
      alert('Failed to save product');
    } finally {
      setSaving(false);
    }
  }

  const tabs = [
    { id: 'basic', label: 'Basic Info', icon: Package },
    { id: 'pricing', label: 'Pricing', icon: DollarSign },
    { id: 'inventory', label: 'Inventory & Labor', icon: Wrench },
    { id: 'descriptions', label: 'Descriptions', icon: FileText },
    { id: 'accessories', label: 'Accessories', icon: Link }
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {productId ? 'Edit Product' : 'New Product'}
            </h2>
            <p className="text-sm text-gray-500 mt-1">Complete product catalog information</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 px-6">
          <div className="flex gap-1 overflow-x-auto">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Form Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-auto p-6">
          {/* Basic Info Tab */}
          {activeTab === 'basic' && (
            <div className="space-y-6 max-w-3xl">
              <div className="grid grid-cols-2 gap-4">
                {/* Manufacturer */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Manufacturer
                  </label>
                  {!showNewManufacturer ? (
                    <div className="flex gap-2">
                      <select
                        value={formData.manufacturer_id}
                        onChange={(e) => setFormData({ ...formData, manufacturer_id: e.target.value })}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                      >
                        <option value="">Select manufacturer...</option>
                        {manufacturers.map(m => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setShowNewManufacturer(true)}
                        className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm transition-colors"
                      >
                        New
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newManufacturerName}
                        onChange={(e) => setNewManufacturerName(e.target.value)}
                        placeholder="Manufacturer name"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                      <button
                        type="button"
                        onClick={handleAddManufacturer}
                        className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowNewManufacturer(false)}
                        className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                {/* Model Number */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Manufacturer Model Number
                  </label>
                  <input
                    type="text"
                    value={formData.manufacturer_model_number}
                    onChange={(e) => setFormData({ ...formData, manufacturer_model_number: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    placeholder="MFG-123-ABC"
                  />
                </div>

                {/* Item Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Item Name (For Proposals) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.item_name}
                    onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    placeholder="Customer-facing product name"
                  />
                  <p className="text-xs text-gray-500 mt-1">This appears on proposals</p>
                </div>

                {/* Item Color */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Item Color
                  </label>
                  <input
                    type="text"
                    value={formData.item_color}
                    onChange={(e) => setFormData({ ...formData, item_color: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    placeholder="Black, White, Silver..."
                  />
                </div>

                {/* Category */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category
                  </label>
                  <input
                    type="text"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    placeholder="Displays, Speakers, etc."
                  />
                </div>

                {/* Default Class */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Default Class (Optional)
                  </label>
                  <select
                    value={formData.default_class_id}
                    onChange={(e) => setFormData({ ...formData, default_class_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="">No Default Class</option>
                    {classes.map(cls => (
                      <option key={cls.id} value={cls.id}>
                        {cls.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    When added to proposals, this item will automatically be assigned to this class
                  </p>
                </div>

                {/* SKU */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    SKU
                  </label>
                  <input
                    type="text"
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    placeholder="Internal SKU"
                  />
                </div>

                {/* Default Qty */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Default Quantity
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.default_qty}
                    onChange={(e) => setFormData({ ...formData, default_qty: parseFloat(e.target.value) || 1 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                {/* Units */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Unit of Measure
                  </label>
                  <select
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="ea">Each</option>
                    <option value="ft">Feet</option>
                    <option value="hr">Hours</option>
                    <option value="box">Box</option>
                    <option value="roll">Roll</option>
                    <option value="pkg">Package</option>
                  </select>
                </div>
              </div>

              {/* Product Image Section */}
              <div className="border-t border-gray-200 pt-6 mt-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
                  <Image className="w-5 h-5" />
                  Product Image
                  <span className="text-red-500">*</span>
                </h3>
                {!formData.image_url && (
                  <p className="text-xs text-red-600 mb-3">An image is required to save this product.</p>
                )}
                {formData.image_url && <div className="mb-4" />}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Image Preview */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Image Preview
                    </label>
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 bg-gray-50 flex items-center justify-center h-48">
                      {imagePreview ? (
                        <div className="relative w-full h-full">
                          <img
                            src={imagePreview}
                            alt="Product preview"
                            className="w-full h-full object-contain rounded"
                            onError={() => {
                              setImagePreview('');
                              alert('Failed to load image from URL');
                            }}
                          />
                          <button
                            type="button"
                            onClick={handleRemoveImage}
                            className="absolute top-2 right-2 p-1 bg-red-600 hover:bg-red-700 text-white rounded-full transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="text-center">
                          <Image className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                          <p className="text-sm text-gray-500">No image uploaded</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Upload/Link Options */}
                  <div className="space-y-4">
                    {/* Search for Image */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Search for Image
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowImageSearch(true)}
                        className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
                      >
                        <Search className="w-5 h-5" />
                        Find Product Image
                      </button>
                      <p className="text-xs text-gray-500 mt-1">
                        Automatically search for images online
                      </p>
                    </div>

                    {/* Upload Image */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Or Upload Image
                      </label>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingImage}
                        className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                      >
                        <Upload className="w-5 h-5" />
                        {uploadingImage ? 'Uploading...' : 'Upload from Computer'}
                      </button>
                      <p className="text-xs text-gray-500 mt-1">
                        JPG, PNG, GIF up to 10MB
                      </p>
                    </div>

                    {/* Image URL */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Or paste image URL
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="url"
                          value={formData.image_url}
                          onChange={(e) => handleImageUrlChange(e.target.value)}
                          placeholder="https://example.com/image.jpg"
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Find images on manufacturer websites or product databases
                      </p>
                    </div>

                    {/* Product Link */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                        <ExternalLink className="w-4 h-4" />
                        Product Web Link
                      </label>
                      <input
                        type="url"
                        value={formData.product_link}
                        onChange={(e) => setFormData({ ...formData, product_link: e.target.value })}
                        placeholder="https://manufacturer.com/product-page"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Link to manufacturer product page or spec sheet
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Pricing Tab */}
          {activeTab === 'pricing' && (
            <div className="space-y-6 max-w-2xl">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  Enter cost and margin to auto-calculate price, or enter price to calculate margin.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Cost */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cost <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-gray-500">$</span>
                    <input
                      type="number"
                      required
                      step="0.01"
                      value={formData.cost}
                      onChange={(e) => setFormData({ ...formData, cost: parseFloat(e.target.value) || 0 })}
                      className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>

                {/* Margin/Markup */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Margin %
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.1"
                      value={formData.margin_percent}
                      onChange={(e) => setFormData({ ...formData, margin_percent: parseFloat(e.target.value) || 0 })}
                      className="w-full pr-8 pl-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <span className="absolute right-3 top-2.5 text-gray-500">%</span>
                  </div>
                </div>

                {/* Our Price */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Our Price (Selling Price)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-gray-500">$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.our_price}
                      onChange={(e) => setFormData({ ...formData, our_price: parseFloat(e.target.value) || 0 })}
                      className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 bg-blue-50"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Auto-calculated from cost + margin</p>
                </div>

                {/* Minimum Price */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Minimum Price
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-gray-500">$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.minimum_price}
                      onChange={(e) => setFormData({ ...formData, minimum_price: parseFloat(e.target.value) || 0 })}
                      className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Sales reps cannot go below this</p>
                </div>

                {/* Minimum Margin */}
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Minimum Margin %
                  </label>
                  <div className="relative max-w-xs">
                    <input
                      type="number"
                      step="0.1"
                      value={formData.minimum_margin}
                      onChange={(e) => setFormData({ ...formData, minimum_margin: parseFloat(e.target.value) || 0 })}
                      className="w-full pr-8 pl-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    <span className="absolute right-3 top-2.5 text-gray-500">%</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Minimum profit margin required</p>
                </div>
              </div>

              {/* Pricing Summary */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h4 className="font-medium text-gray-900 mb-3">Pricing Summary</h4>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-gray-500">Cost</div>
                    <div className="font-semibold text-lg">{formatCurrency(formData.cost)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Margin</div>
                    <div className="font-semibold text-lg">{formData.margin_percent.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-gray-500">Sell Price</div>
                    <div className="font-semibold text-lg text-green-600">{formatCurrency(formData.our_price)}</div>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-300">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Profit per unit:</span>
                    <span className="font-semibold text-green-600">
                      ${(formData.our_price - formData.cost).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Inventory & Labor Tab */}
          {activeTab === 'inventory' && (
            <div className="space-y-6 max-w-2xl">
              <div className="grid grid-cols-2 gap-4">
                {/* Inventory Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Inventory Type
                  </label>
                  <select
                    value={formData.inventory_type}
                    onChange={(e) => setFormData({ ...formData, inventory_type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="inventory">Inventory</option>
                    <option value="non_inventory">Non-Inventory</option>
                    <option value="labor">Labor</option>
                    <option value="other">Other</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Stocked vs ordered per job</p>
                </div>

                {/* Item Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Item Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.item_type || ''}
                    onChange={(e) => setFormData({ ...formData, item_type: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="material">Material</option>
                    <option value="labor">Labor</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">For tax calculation purposes</p>
                </div>
              </div>

              {/* Taxable Override - Only for exceptions */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Taxable Override <span className="text-xs text-gray-500">(Optional - for exceptions only)</span>
                  </label>
                  <select
                    value={formData.is_taxable === null ? 'standard' : formData.is_taxable ? 'yes' : 'no'}
                    onChange={(e) => {
                      const value = e.target.value === 'standard' ? null : e.target.value === 'yes';
                      setFormData({ ...formData, is_taxable: value });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
                  >
                    <option value="standard">Follow Standard Rules</option>
                    <option value="yes">Always Taxable</option>
                    <option value="no">Never Taxable (Exempt)</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Override default tax behavior</p>
                </div>

                {/* Default Vendor */}
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Default Vendor
                  </label>
                  <select
                    value={formData.default_vendor_id}
                    onChange={(e) => setFormData({ ...formData, default_vendor_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="">No default vendor</option>
                    {vendors.map(v => (
                      <option key={v.id} value={v.id}>{v.vendor_name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Labor Settings</h3>
                <div className="grid grid-cols-2 gap-4">
                  {/* Labor Phase */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Labor Phase
                    </label>
                    <select
                      value={formData.labor_phase_id}
                      onChange={(e) => setFormData({ ...formData, labor_phase_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      <option value="">No labor phase</option>
                      {laborPhases.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Default Labor Time */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Default Labor Time (hours)
                    </label>
                    <input
                      type="number"
                      step="0.25"
                      value={formData.default_labor_hours}
                      onChange={(e) => setFormData({ ...formData, default_labor_hours: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                      placeholder="1.5"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Descriptions Tab */}
          {activeTab === 'descriptions' && (
            <div className="space-y-6 max-w-3xl">
              {/* Sales Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sales Description (Shown on Proposals)
                </label>
                <textarea
                  value={formData.sales_description}
                  onChange={(e) => setFormData({ ...formData, sales_description: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  placeholder="Customer-facing description for proposals..."
                />
              </div>

              {/* Purchase Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Purchase Description (Shown on POs)
                </label>
                <textarea
                  value={formData.purchase_description}
                  onChange={(e) => setFormData({ ...formData, purchase_description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  placeholder="Vendor-facing description for purchase orders..."
                />
                <p className="text-xs text-gray-500 mt-1">Defaults to sales description if empty</p>
              </div>

              {/* Default Install Task */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Default Install Instructions
                </label>
                <textarea
                  value={formData.default_install_task}
                  onChange={(e) => setFormData({ ...formData, default_install_task: e.target.value })}
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 font-mono text-sm"
                  placeholder="Step-by-step installation instructions for technicians...

1. Verify power requirements
2. Mount at specified location
3. Make all connections
4. Test functionality"
                />
                <p className="text-xs text-gray-500 mt-1">
                  These instructions appear on work orders when this item is added
                </p>
              </div>
            </div>
          )}

          {/* Accessories Tab */}
          {activeTab === 'accessories' && (
            <div className="space-y-6 max-w-3xl">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-800">
                  Accessories and Packages features coming soon! You'll be able to link related products and create bundles.
                </p>
              </div>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Product'}
          </button>
        </div>
      </div>

      {/* Image Search Modal */}
      {showImageSearch && (
        <ImageSearchModal
          searchQuery={getSearchQuery()}
          onClose={() => setShowImageSearch(false)}
          onSelectImage={(url) => {
            handleImageUrlChange(url);
            setShowImageSearch(false);
          }}
        />
      )}
    </div>
  );
}
