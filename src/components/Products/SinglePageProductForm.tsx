import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useAutoSave } from '../../hooks/useAutoSave';
import { X, Save, Package, Plus, Search, Upload, DollarSign, AlertCircle, Link2, FileText, Video, Sparkles, Globe, Loader2 } from 'lucide-react';
import ConfirmModal from '../ui/ConfirmModal';

interface Category {
  id: string;
  name: string;
}

interface Subcategory {
  id: string;
  category_id: string;
  name: string;
}

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
  default_price: number;
}

interface Color {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

interface ProductFormProps {
  productId?: string;
  duplicateFromId?: string;
  readOnly?: boolean;
  onClose: () => void;
  onSave: (productData?: any) => void;
  allowOneOffItem?: boolean; // Show "Add to Catalog" toggle for proposal context
}

export default function SinglePageProductForm({ productId, duplicateFromId, readOnly = false, onClose, onSave, allowOneOffItem = false }: ProductFormProps) {
  const { profile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [addToCatalog, setAddToCatalog] = useState(true); // Default to true

  // Dropdown options
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [laborPhases, setLaborPhases] = useState<LaborPhase[]>([]);
  const [colors, setColors] = useState<Color[]>([]);

  // Add new item states
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [showNewSubcategory, setShowNewSubcategory] = useState(false);
  const [showNewManufacturer, setShowNewManufacturer] = useState(false);
  const [showNewVendor, setShowNewVendor] = useState(false);
  const [showNewColor, setShowNewColor] = useState(false);
  const [newItemName, setNewItemName] = useState('');

  // Company settings
  const [globalMinMargin, setGlobalMinMargin] = useState(0);
  const [enforceMinPricing, setEnforceMinPricing] = useState(false);
  const [laborRate, setLaborRate] = useState(100);

  // Image handling
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-save key (needed early for scroll position tracking)
  const autoSaveKey = productId ? `product_edit_${productId}` : duplicateFromId ? `product_duplicate_${duplicateFromId}` : 'product_new';

  // Scroll position tracking
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollPositionKey = `product_form_scroll_${autoSaveKey}`;

  // Track when user is manually editing price
  const [isEditingPrice, setIsEditingPrice] = useState(false);

  // Track if user has manually set a custom price (prevents auto-calculation from overwriting it)
  const [userHasSetCustomPrice, setUserHasSetCustomPrice] = useState(false);

  // Track if user has manually edited SKU (to avoid overwriting their custom value)
  const [skuManuallyEdited, setSkuManuallyEdited] = useState(false);

  // Add from Web state
  const [productUrl, setProductUrl] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  const [extractSuccess, setExtractSuccess] = useState(false);
  const [showAddFromWeb, setShowAddFromWeb] = useState(false);

  // Track if there's saved draft data
  const [hasSavedDraft, setHasSavedDraft] = useState(false);


  const [formData, setFormData] = useState({
    // Basic Info
    manufacturer_id: '',
    manufacturer_model_number: '',
    item_color: '',
    sku: '',
    category_id: '',
    subcategory_id: '',
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
    enforce_minimum: false,

    // Inventory & Labor
    inventory_type: 'non-inventory' as 'inventory' | 'non-inventory' | 'labor',
    item_type: 'material' as 'material' | 'labor',
    is_taxable: true,
    default_vendor_id: '',
    labor_phase_id: '',
    default_labor_hours: 0,
    labor_cost: 0,

    // Descriptions
    sales_description: '',
    purchase_description: '',
    default_install_task: '',

    // Resources
    manufacturer_url: '',
    supplier_url: '',
    datasheet_url: '',
    installation_video_url: ''
  });

  // Auto-save hook
  const { restoreSavedData, clearSavedData } = useAutoSave({
    key: autoSaveKey,
    data: formData,
    enabled: true // Auto-save for all forms (new, edit, and duplicate)
  });

  useEffect(() => {
    // Clean up old localStorage keys that might have invalid data
    const keysToCheck = ['product_new', 'product_edit_'];
    Object.keys(localStorage).forEach(key => {
      if (keysToCheck.some(prefix => key.includes(prefix))) {
        try {
          const data = JSON.parse(localStorage.getItem(key) || '{}');
          // If it has item_name, it's old data - remove it
          if (data.item_name !== undefined) {
            localStorage.removeItem(key);
            console.log('Cleaned up old product data:', key);
          }
        } catch (e) {
          // Invalid JSON, remove it
          localStorage.removeItem(key);
        }
      }
    });

    loadOptions();
    loadCompanySettings();

    const initializeForm = async () => {
      if (productId) {
        await loadProduct();
        setSkuManuallyEdited(true); // Editing existing product - don't auto-populate SKU
        // After loading, check if there's newer auto-saved data
        const savedData = restoreSavedData();
        if (savedData) {
          const { item_name, ...validData } = savedData as any;
          setFormData(prev => ({ ...prev, ...validData }));
          setHasSavedDraft(true);
          // If restored data has a price, mark it as custom to prevent auto-calculation
          if (validData.our_price && validData.our_price > 0) {
            setUserHasSetCustomPrice(true);
          }
        }
      } else if (duplicateFromId) {
        await loadProductForDuplication();
        // For duplication, we cleared the SKU, so don't mark as manually edited
      } else {
        // Auto-restore saved data on mount (new product)
        const savedData = restoreSavedData();
        if (savedData) {
          const { item_name, ...validData } = savedData as any;
          setFormData(prev => ({ ...prev, ...validData }));
          setHasSavedDraft(true);
          // If restored data has a SKU, mark as manually edited to preserve it
          if (validData.sku) {
            setSkuManuallyEdited(true);
          }
          // If restored data has a price, mark it as custom to prevent auto-calculation
          if (validData.our_price && validData.our_price > 0) {
            setUserHasSetCustomPrice(true);
          }
        }
      }
    };

    initializeForm();
  }, [productId, duplicateFromId]);

  // Prevent body scrolling when modal is open (mobile fix)
  useEffect(() => {
    // Store original body overflow style
    const originalStyle = window.getComputedStyle(document.body).overflow;

    // Prevent body scrolling
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';

    // Restore on cleanup
    return () => {
      document.body.style.overflow = originalStyle;
      document.body.style.touchAction = 'auto';
    };
  }, []);

  // Restore scroll position on mount
  useEffect(() => {
    const savedScrollPosition = localStorage.getItem(scrollPositionKey);
    if (savedScrollPosition && scrollContainerRef.current) {
      // Use requestAnimationFrame to ensure the DOM is ready
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = parseInt(savedScrollPosition, 10);
        }
      });
    }
  }, [scrollPositionKey]);

  // Save scroll position whenever it changes
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      localStorage.setItem(scrollPositionKey, container.scrollTop.toString());
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [scrollPositionKey]);

  // Auto-populate SKU from Model Number (unless user has manually edited it)
  useEffect(() => {
    // Only auto-populate if:
    // 1. User hasn't manually edited the SKU
    // 2. There's a model number to copy
    // 3. We're not in edit mode (productId exists means we're editing)
    if (!skuManuallyEdited && formData.manufacturer_model_number && !productId) {
      setFormData(prev => ({ ...prev, sku: formData.manufacturer_model_number }));
    }
  }, [formData.manufacturer_model_number, skuManuallyEdited, productId]);

  // Track the last user-edited field to prevent circular updates
  const [lastEditedField, setLastEditedField] = React.useState<'price' | 'margin' | 'cost' | null>(null);

  // Auto-calculate price when cost or margin changes (but not when user has manually set a custom price)
  useEffect(() => {
    // Only auto-calculate when:
    // 1. User is NOT currently editing the price field
    // 2. User has NOT manually set a custom price
    // 3. The last field edited was the margin or cost field (NOT the price field)
    if (!isEditingPrice && !userHasSetCustomPrice && (lastEditedField === 'margin' || lastEditedField === 'cost') && formData.cost > 0 && formData.margin_percent >= 0 && formData.margin_percent < 100) {
      // Formula: Price = Cost / (1 - Margin%)
      // Example: $100 cost with 50% margin = $100 / (1 - 0.50) = $100 / 0.50 = $200
      const marginDecimal = formData.margin_percent / 100;
      const calculatedPrice = formData.cost / (1 - marginDecimal);
      // Use Math.round to avoid floating point precision errors
      const roundedPrice = Math.round(calculatedPrice * 100) / 100;

      // Only update if the calculated price is different from current price
      if (Math.abs(formData.our_price - roundedPrice) > 0.005) {
        setFormData(prev => ({ ...prev, our_price: roundedPrice }));
      }
    }
  }, [formData.cost, formData.margin_percent, isEditingPrice, lastEditedField, userHasSetCustomPrice]);

  // Recalculate margin when price is manually changed
  const handlePriceChange = (newPrice: number) => {
    // Mark that user has manually set a custom price - this prevents auto-calculation from overwriting it
    setUserHasSetCustomPrice(true);
    setIsEditingPrice(true);
    setLastEditedField('price');

    // Round to exactly 2 decimal places to match database precision
    const roundedPrice = Math.round(newPrice * 100) / 100;
    const updates: any = { our_price: roundedPrice };

    // Recalculate margin based on the new price
    if (formData.cost > 0 && roundedPrice > 0) {
      const newMargin = ((roundedPrice - formData.cost) / roundedPrice) * 100;
      updates.margin_percent = Math.round(newMargin * 100) / 100;
    }

    setFormData(prev => ({ ...prev, ...updates }));
  };

  // Format currency for display
  const formatCurrency = (value: number): string => {
    if (!value) return '';
    return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Parse currency input
  const parseCurrency = (value: string): number => {
    const cleaned = value.replace(/[^0-9.]/g, '');
    return parseFloat(cleaned) || 0;
  };

  // Calculate labor cost when hours change
  useEffect(() => {
    if (formData.default_labor_hours > 0) {
      const selectedPhase = laborPhases.find(p => p.id === formData.labor_phase_id);
      const rate = selectedPhase?.default_price || laborRate;
      setFormData(prev => ({
        ...prev,
        labor_cost: Number((formData.default_labor_hours * rate).toFixed(2))
      }));
    } else {
      setFormData(prev => ({ ...prev, labor_cost: 0 }));
    }
  }, [formData.default_labor_hours, formData.labor_phase_id, laborPhases, laborRate]);

  // Auto-copy sales description to purchase description
  // Track the last purchase description to know if user manually edited it
  const [lastSalesDescription, setLastSalesDescription] = useState('');
  const [userEditedPurchaseDesc, setUserEditedPurchaseDesc] = useState(false);

  useEffect(() => {
    if (formData.sales_description !== lastSalesDescription) {
      // Sales description changed
      if (!userEditedPurchaseDesc) {
        // Auto-copy to purchase description
        setFormData(prev => ({ ...prev, purchase_description: formData.sales_description }));
      }
      setLastSalesDescription(formData.sales_description);
    }
  }, [formData.sales_description, lastSalesDescription, userEditedPurchaseDesc]);


  // Auto-fill install instructions with "Install {modelname}"
  // Track if user has manually edited the install task
  const [userEditedInstallTask, setUserEditedInstallTask] = useState(false);
  const [lastModelForInstall, setLastModelForInstall] = useState('');

  useEffect(() => {
    if (formData.manufacturer_model_number && formData.manufacturer_model_number !== lastModelForInstall) {
      // Model changed
      if (!userEditedInstallTask) {
        // Auto-update install task
        setFormData(prev => ({
          ...prev,
          default_install_task: `Install ${formData.manufacturer_model_number}`
        }));
      }
      setLastModelForInstall(formData.manufacturer_model_number);
    }
  }, [formData.manufacturer_model_number, userEditedInstallTask, lastModelForInstall]);

  // Filter subcategories by selected category
  const filteredSubcategories = subcategories.filter(
    sub => sub.category_id === formData.category_id
  );

  // Calculate minimum price based on global or product minimum margin
  const effectiveMinMargin = formData.enforce_minimum
    ? formData.minimum_margin
    : (enforceMinPricing ? globalMinMargin : 0);

  const calculatedMinPrice = effectiveMinMargin > 0 && formData.cost > 0
    ? formData.cost / (1 - (effectiveMinMargin / 100))
    : 0;

  async function loadOptions() {
    try {
      const [categoriesRes, subcategoriesRes, manufacturersRes, vendorsRes, laborPhasesRes, colorsRes] = await Promise.all([
        supabase.from('product_categories').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('product_subcategories').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('manufacturers').select('id, name').order('name'),
        supabase.from('vendors').select('id, vendor_name').order('vendor_name'),
        supabase.from('labor_phases').select('id, name, default_price').eq('is_active', true).order('sort_order'),
        supabase.from('product_colors').select('*').eq('is_active', true).order('sort_order')
      ]);

      if (categoriesRes.data) setCategories(categoriesRes.data);
      if (subcategoriesRes.data) setSubcategories(subcategoriesRes.data);
      if (manufacturersRes.data) setManufacturers(manufacturersRes.data);
      if (vendorsRes.data) setVendors(vendorsRes.data);
      if (laborPhasesRes.data) setLaborPhases(laborPhasesRes.data);
      if (colorsRes.data) setColors(colorsRes.data);
    } catch (error) {
      console.error('Error loading options:', error);
    }
  }

  async function loadCompanySettings() {
    try {
      const { data } = await supabase
        .from('company_settings')
        .select('global_minimum_margin, enforce_minimum_pricing, labor_rate_per_hour')
        .single();

      if (data) {
        setGlobalMinMargin(data.global_minimum_margin || 0);
        setEnforceMinPricing(data.enforce_minimum_pricing || false);
        setLaborRate(data.labor_rate_per_hour || 100);
      }
    } catch (error) {
      console.error('Error loading company settings:', error);
    }
  }

  async function loadProduct() {
    if (!productId) return;

    try {
      const { data, error } = await supabase.from('products').select(`
        id,
        manufacturer_id,
        manufacturer_model_number,
        sku,
        item_color,
        category_id,
        subcategory_id,
        default_qty,
        unit,
        image_url,
        product_link,
        cost,
        margin_percent,
        our_price,
        minimum_price,
        minimum_margin,
        inventory_type,
        item_type,
        is_taxable,
        default_vendor_id,
        labor_phase_id,
        default_labor_hours,
        sales_description,
        purchase_description,
        default_install_task,
        manufacturer_url,
        supplier_url,
        datasheet_url,
        installation_video_url
      `).eq('id', productId).single();

      if (error) throw error;
      if (data) {
        setFormData({
          manufacturer_id: data.manufacturer_id || '',
          manufacturer_model_number: data.manufacturer_model_number || '',
          sku: data.sku || '',
          item_color: data.item_color || '',
          category_id: data.category_id || '',
          subcategory_id: data.subcategory_id || '',
          default_qty: data.default_qty || 1,
          unit: data.unit || 'ea',
          image_url: data.image_url || '',
          product_link: data.product_link || '',
          cost: data.cost || 0,
          margin_percent: data.margin_percent || 50,
          our_price: data.our_price || 0,
          minimum_price: data.minimum_price || 0,
          minimum_margin: data.minimum_margin || 0,
          enforce_minimum: (data.minimum_margin || 0) > 0,
          inventory_type: data.inventory_type || 'inventory',
          item_type: data.item_type || 'material',
          is_taxable: data.is_taxable !== false,
          default_vendor_id: data.default_vendor_id || '',
          labor_phase_id: data.labor_phase_id || '',
          default_labor_hours: data.default_labor_hours || 0,
          labor_cost: 0,
          sales_description: data.sales_description || '',
          purchase_description: data.purchase_description || '',
          default_install_task: data.default_install_task || '',
          manufacturer_url: data.manufacturer_url || '',
          supplier_url: data.supplier_url || '',
          datasheet_url: data.datasheet_url || '',
          installation_video_url: data.installation_video_url || ''
        });
        // If the product already has a price set, mark it as custom to prevent auto-calculation
        if (data.our_price && data.our_price > 0) {
          setUserHasSetCustomPrice(true);
        }
      }
    } catch (error) {
      console.error('Error loading product:', error);
    }
  }

  async function loadProductForDuplication() {
    if (!duplicateFromId) return;

    try {
      const { data, error } = await supabase.from('products').select(`
        id,
        manufacturer_id,
        manufacturer_model_number,
        sku,
        item_color,
        category_id,
        subcategory_id,
        default_qty,
        unit,
        image_url,
        product_link,
        cost,
        margin_percent,
        our_price,
        minimum_price,
        minimum_margin,
        inventory_type,
        item_type,
        is_taxable,
        default_vendor_id,
        labor_phase_id,
        default_labor_hours,
        sales_description,
        purchase_description,
        default_install_task,
        manufacturer_url,
        supplier_url,
        datasheet_url,
        installation_video_url
      `).eq('id', duplicateFromId).single();

      if (error) throw error;
      if (data) {
        const baseData = {
          manufacturer_id: data.manufacturer_id || '',
          manufacturer_model_number: data.manufacturer_model_number ? `${data.manufacturer_model_number}*copy*` : '',
          sku: '', // Clear SKU - user must enter a unique one
          item_color: data.item_color || '',
          category_id: data.category_id || '',
          subcategory_id: data.subcategory_id || '',
          default_qty: data.default_qty || 1,
          unit: data.unit || 'ea',
          image_url: data.image_url || '',
          product_link: data.product_link || '',
          cost: data.cost || 0,
          margin_percent: data.margin_percent || 50,
          our_price: data.our_price || 0,
          minimum_price: data.minimum_price || 0,
          minimum_margin: data.minimum_margin || 0,
          enforce_minimum: (data.minimum_margin || 0) > 0,
          inventory_type: data.inventory_type || 'non-inventory',
          item_type: data.item_type || 'material',
          is_taxable: data.is_taxable !== false,
          default_vendor_id: data.default_vendor_id || '',
          labor_phase_id: data.labor_phase_id || '',
          default_labor_hours: data.default_labor_hours || 0,
          labor_cost: 0,
          sales_description: data.sales_description || '',
          purchase_description: data.purchase_description || '',
          default_install_task: data.default_install_task || '',
          manufacturer_url: data.manufacturer_url || '',
          supplier_url: data.supplier_url || '',
          datasheet_url: data.datasheet_url || '',
          installation_video_url: data.installation_video_url || ''
        };

        setFormData(baseData);

        // If the duplicated product has a price set, mark it as custom to prevent auto-calculation
        if (data.our_price && data.our_price > 0) {
          setUserHasSetCustomPrice(true);
        }

        // Check if there's auto-saved data (user might have navigated away and come back)
        const savedData = restoreSavedData();
        if (savedData) {
          const { item_name, ...validData } = savedData as any;
          setFormData(prev => ({ ...prev, ...validData }));
          setHasSavedDraft(true);
          // If restored data has a price, mark it as custom to prevent auto-calculation
          if (validData.our_price && validData.our_price > 0) {
            setUserHasSetCustomPrice(true);
          }
        }
      }
    } catch (error) {
      console.error('Error loading product for duplication:', error);
    }
  }

  async function handleAddCategory() {
    if (!newItemName.trim()) return;

    try {
      const { data, error } = await supabase
        .from('product_categories')
        .insert({ name: newItemName, sort_order: categories.length })
        .select()
        .single();

      if (error) throw error;
      if (data) {
        setCategories(prev => [...prev, data]);
        setFormData(prev => ({ ...prev, category_id: data.id }));
        setShowNewCategory(false);
        setNewItemName('');
      }
    } catch (error) {
      console.error('Error adding category:', error);
    }
  }

  async function handleAddSubcategory() {
    if (!newItemName.trim() || !formData.category_id) return;

    try {
      const { data, error } = await supabase
        .from('product_subcategories')
        .insert({
          category_id: formData.category_id,
          name: newItemName,
          sort_order: filteredSubcategories.length
        })
        .select()
        .single();

      if (error) throw error;
      if (data) {
        setSubcategories(prev => [...prev, data]);
        setFormData(prev => ({ ...prev, subcategory_id: data.id }));
        setShowNewSubcategory(false);
        setNewItemName('');
      }
    } catch (error) {
      console.error('Error adding subcategory:', error);
    }
  }

  async function handleAddManufacturer() {
    if (!newItemName.trim()) return;

    try {
      const { data, error } = await supabase
        .from('manufacturers')
        .insert({
          name: newItemName
        })
        .select()
        .single();

      if (error) {
        console.error('Error adding manufacturer:', error);
        throw error;
      }

      if (data) {
        setManufacturers(prev => [...prev, data]);
        setFormData(prev => ({ ...prev, manufacturer_id: data.id }));
        setShowNewManufacturer(false);
        setNewItemName('');
      }
    } catch (error: any) {
      console.error('Error adding manufacturer:', error);
      alert(`Failed to add manufacturer: ${error?.message || 'Unknown error'}`);
    }
  }

  async function handleAddVendor() {
    if (!newItemName.trim()) return;

    try {
      const { data, error } = await supabase
        .from('vendors')
        .insert({
          vendor_name: newItemName
        })
        .select()
        .single();

      if (error) {
        console.error('Error adding vendor:', error);
        throw error;
      }

      if (data) {
        setVendors(prev => [...prev, data]);
        setFormData(prev => ({ ...prev, default_vendor_id: data.id }));
        setShowNewVendor(false);
        setNewItemName('');
      }
    } catch (error: any) {
      console.error('Error adding vendor:', error);
      alert(`Failed to add vendor: ${error?.message || 'Unknown error'}`);
    }
  }

  async function handleAddColor() {
    if (!newItemName.trim()) return;

    try {
      const { data, error } = await supabase
        .from('product_colors')
        .insert({
          name: newItemName,
          sort_order: colors.length,
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;

      if (data) {
        setColors(prev => [...prev, data]);
        setFormData(prev => ({ ...prev, item_color: data.name }));
        setShowNewColor(false);
        setNewItemName('');
      }
    } catch (error: any) {
      console.error('Error adding color:', error);
      alert(`Failed to add color: ${error?.message || 'Unknown error'}`);
    }
  }

  function handleImageSearch() {
    if (!formData.manufacturer_id || !formData.manufacturer_model_number) {
      alert('Please select a manufacturer and enter a model number first');
      return;
    }

    const manufacturer = manufacturers.find(m => m.id === formData.manufacturer_id);
    if (!manufacturer) return;

    const searchQuery = `${manufacturer.name} ${formData.manufacturer_model_number}`;
    const googleImageSearchUrl = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(searchQuery)}`;

    // Open Google Image Search in new tab
    window.open(googleImageSearchUrl, '_blank');
  }

  async function uploadImageFile(file: File) {
    setUploadingImage(true);
    try {
      const fileExt = file.name.split('.').pop() || 'png';
      const fileName = `products/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(fileName);

      setFormData(prev => ({ ...prev, image_url: publicUrl }));
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    await uploadImageFile(file);
  }

  // Handle paste events for image upload
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          e.preventDefault();
          const blob = items[i].getAsFile();
          if (blob) {
            await uploadImageFile(blob);
          }
          break;
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, []);

  function validateForm(): boolean {
    const newErrors: Record<string, string> = {};

    if (!formData.manufacturer_id) newErrors.manufacturer = 'Manufacturer is required';
    if (!formData.manufacturer_model_number) newErrors.model = 'Model number is required';
    if (!formData.sku) newErrors.sku = 'SKU is required';
    if (!formData.category_id) newErrors.category = 'Category is required';
    if (formData.cost < 0) newErrors.cost = 'Cost must be positive';
    if (formData.our_price < 0) newErrors.price = 'Price must be positive';

    if (effectiveMinMargin > 0 && formData.our_price < calculatedMinPrice) {
      newErrors.price = `Price must be at least $${calculatedMinPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${effectiveMinMargin}% margin)`;
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      setTimeout(() => {
        const firstErrorEl = document.querySelector('[data-error-field]');
        firstErrorEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
      return false;
    }
    return true;
  }

  async function handleSave() {
    if (!validateForm()) return;

    setSaving(true);
    try {
      // Get category name from category_id
      const selectedCategory = categories.find(c => c.id === formData.category_id);
      const selectedManufacturer = manufacturers.find(m => m.id === formData.manufacturer_id);
      const selectedVendor = vendors.find(v => v.id === formData.default_vendor_id);
      const selectedLaborPhase = laborPhases.find(lp => lp.id === formData.labor_phase_id);

      const productData = {
        manufacturer_id: formData.manufacturer_id || null,
        manufacturer_model_number: formData.manufacturer_model_number,
        item_color: formData.item_color || null,
        sku: formData.sku,
        category_id: formData.category_id || null,
        category: selectedCategory?.name || null,
        subcategory_id: formData.subcategory_id || null,
        default_qty: formData.default_qty,
        unit: formData.unit,
        image_url: formData.image_url || null,
        product_link: formData.product_link || null,
        cost: formData.cost,
        margin_percent: formData.margin_percent,
        our_price: formData.our_price,
        minimum_price: formData.enforce_minimum ? calculatedMinPrice : null,
        minimum_margin: formData.enforce_minimum ? formData.minimum_margin : null,
        inventory_type: formData.inventory_type,
        item_type: formData.item_type,
        is_taxable: formData.is_taxable,
        default_vendor_id: formData.default_vendor_id || null,
        labor_phase_id: formData.labor_phase_id || null,
        default_labor_hours: formData.default_labor_hours,
        sales_description: formData.sales_description || null,
        purchase_description: formData.purchase_description || null,
        default_install_task: formData.default_install_task || null,
        manufacturer_url: formData.manufacturer_url || null,
        supplier_url: formData.supplier_url || null,
        datasheet_url: formData.datasheet_url || null,
        installation_video_url: formData.installation_video_url || null,
        // Legacy compatibility
        name: formData.manufacturer_model_number,
        description: formData.sales_description || null,
        unit_price: formData.our_price,
        updated_at: new Date().toISOString()
      };

      // If this is a one-off item (not being added to catalog), return the data
      if (allowOneOffItem && !addToCatalog) {
        const oneOffItemData = {
          ...productData,
          // Include lookup names for display
          manufacturer_name: selectedManufacturer?.name || null,
          vendor_name: selectedVendor?.vendor_name || null,
          labor_phase_name: selectedLaborPhase?.name || null,
          isOneOff: true
        };
        clearSavedData();
        setHasSavedDraft(false);
        onSave(oneOffItemData);
        onClose();
        return;
      }

      // Otherwise, save to catalog as normal
      console.log('=== SAVING PRODUCT ===');
      console.log('Product ID:', productId);
      console.log('Product Data:', JSON.stringify(productData, null, 2));
      console.log('Product Data Keys:', Object.keys(productData));

      let savedProductId = productId;
      let savedData: any = null;

      if (productId) {
        const { data, error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', productId)
          .select();

        console.log('Update result:', { data, error });
        if (error) {
          console.error('UPDATE ERROR:', {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code
          });
          throw error;
        }
        savedData = data;
      } else {
        const dataToInsert = { ...productData, created_at: new Date().toISOString() };
        console.log('Inserting data:', JSON.stringify(dataToInsert, null, 2));
        console.log('Insert data keys:', Object.keys(dataToInsert));

        const { data, error } = await supabase
          .from('products')
          .insert(dataToInsert)
          .select();

        console.log('Insert result:', { data, error });
        if (error) {
          console.error('INSERT ERROR DETAILS:', {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code
          });
          throw error;
        }
        savedData = data;
        if (data && data.length > 0) {
          savedProductId = data[0].id;
        }
      }

      clearSavedData(); // Clear auto-saved data on successful save
      setHasSavedDraft(false); // Clear draft indicator
      localStorage.removeItem(scrollPositionKey); // Clear scroll position on successful save

      // Show success message
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);

      // Return the saved product data
      if (savedData && savedData.length > 0) {
        onSave(savedData[0]);
      } else {
        onSave();
      }
      // Don't close - let parent decide what to do
      // onClose();
    } catch (error: any) {
      console.error('Error saving product:', error);
      const errorMessage = error?.message || error?.error_description || 'Unknown error';
      alert(`Failed to save product: ${errorMessage}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleExtractFromWeb() {
    if (!productUrl.trim()) {
      setExtractError('Please enter a product URL');
      return;
    }

    setExtracting(true);
    setExtractError('');
    setExtractSuccess(false);

    try {
      const { data, error } = await supabase.functions.invoke('extract-product-from-url', {
        body: { url: productUrl }
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      const extractedData = data.data;

      // Populate form with extracted data
      const updates: any = {};

      if (extractedData.manufacturer_model_number) {
        updates.manufacturer_model_number = extractedData.manufacturer_model_number;
      }

      if (extractedData.sales_description) {
        updates.sales_description = extractedData.sales_description;
      }

      if (extractedData.purchase_description) {
        updates.purchase_description = extractedData.purchase_description;
      }

      if (extractedData.specifications) {
        // Append specifications to purchase description if not already there
        if (updates.purchase_description) {
          updates.purchase_description += '\n\n' + extractedData.specifications;
        } else if (formData.purchase_description) {
          updates.purchase_description = formData.purchase_description + '\n\n' + extractedData.specifications;
        } else {
          updates.purchase_description = extractedData.specifications;
        }
      }

      if (extractedData.cost) {
        updates.cost = extractedData.cost;
        setLastEditedField('cost');
      }

      if (extractedData.our_price) {
        updates.our_price = extractedData.our_price;
      }

      if (extractedData.list_price) {
        // Store list price in purchase description or a note
        const listPriceNote = `\nMSRP: $${extractedData.list_price}`;
        if (updates.purchase_description) {
          updates.purchase_description += listPriceNote;
        } else if (formData.purchase_description) {
          updates.purchase_description = formData.purchase_description + listPriceNote;
        } else {
          updates.purchase_description = listPriceNote.trim();
        }
      }

      if (extractedData.image_url) {
        updates.image_url = extractedData.image_url;
      }

      // Set both product_link and supplier_url to the extracted URL
      if (extractedData.product_link || productUrl) {
        updates.product_link = extractedData.product_link || productUrl;
        updates.supplier_url = extractedData.product_link || productUrl;
      }

      // Set SKU to model number (preferred) or UPC code
      if (extractedData.manufacturer_model_number) {
        updates.sku = extractedData.manufacturer_model_number;
      } else if (extractedData.upc_code) {
        updates.sku = extractedData.upc_code;
      }

      // Try to match manufacturer
      if (extractedData.manufacturer_name) {
        const matchedManufacturer = manufacturers.find(m =>
          m.name.toLowerCase() === extractedData.manufacturer_name.toLowerCase()
        );
        if (matchedManufacturer) {
          updates.manufacturer_id = matchedManufacturer.id;
        }
      }

      // Try to match category
      if (extractedData.category) {
        const matchedCategory = categories.find(c =>
          c.name.toLowerCase().includes(extractedData.category.toLowerCase()) ||
          extractedData.category.toLowerCase().includes(c.name.toLowerCase())
        );
        if (matchedCategory) {
          updates.category_id = matchedCategory.id;

          // Try to match subcategory
          if (extractedData.subcategory) {
            const matchedSubcategory = subcategories.find(s =>
              s.category_id === matchedCategory.id &&
              (s.name.toLowerCase().includes(extractedData.subcategory.toLowerCase()) ||
                extractedData.subcategory.toLowerCase().includes(s.name.toLowerCase()))
            );
            if (matchedSubcategory) {
              updates.subcategory_id = matchedSubcategory.id;
            }
          }
        }
      }

      setFormData(prev => ({ ...prev, ...updates }));
      setExtractSuccess(true);
      setExtractError('');

      // Show success message briefly
      setTimeout(() => setExtractSuccess(false), 5000);

    } catch (error: any) {
      console.error('Error extracting product:', error);
      setExtractError(error.message || 'Failed to extract product information. Please check the URL and try again.');
    } finally {
      setExtracting(false);
    }
  }

  function handleClose() {
    // Keep auto-saved data so user can resume later
    // Data will only be cleared on successful save
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-hidden">
      <div
        ref={scrollContainerRef}
        className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto overscroll-contain touch-pan-y"
      >
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <Package className="w-6 h-6 text-blue-600" />
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold text-gray-900">
                {readOnly ? 'View Product' : productId ? 'Edit Product' : 'New Product'}
              </h2>
              {hasSavedDraft && !readOnly && (
                <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                  Draft Restored
                </span>
              )}
            </div>
          </div>
          <button onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* AUTO-SAVE INFO */}
          {!readOnly && (
            <div className="bg-blue-50 border border-blue-200 rounded p-2 flex items-center gap-2">
              <Save className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
              <p className="text-xs text-blue-700">
                Auto-saves as you type. Safe to navigate away.
              </p>
            </div>
          )}

          {/* ADD FROM WEB */}
          {!readOnly && !productId && showAddFromWeb && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-2">
              <div className="flex items-center gap-2 mb-2">
                <Globe className="w-4 h-4 text-blue-600 flex-shrink-0" />
                <span className="text-xs font-medium text-gray-700">Import from URL</span>
                <button
                  onClick={() => setShowAddFromWeb(false)}
                  className="ml-auto text-gray-400 hover:text-gray-600"
                  title="Hide"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  type="url"
                  value={productUrl}
                  onChange={(e) => {
                    setProductUrl(e.target.value);
                    setExtractError('');
                  }}
                  placeholder="Paste product URL..."
                  className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  disabled={extracting}
                />
                <button
                  onClick={handleExtractFromWeb}
                  disabled={extracting || !productUrl.trim()}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-1.5 text-xs font-medium whitespace-nowrap"
                >
                  {extracting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Extracting</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Extract</span>
                    </>
                  )}
                </button>
              </div>

              {extractError && (
                <div className="flex items-start gap-1.5 mt-2 p-1.5 bg-red-50 border border-red-200 rounded">
                  <AlertCircle className="w-3.5 h-3.5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">{extractError}</p>
                </div>
              )}

              {extractSuccess && (
                <div className="flex items-start gap-1.5 mt-2 p-1.5 bg-green-50 border border-green-200 rounded">
                  <Sparkles className="w-3.5 h-3.5 text-green-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-green-700">Details extracted! Review below.</p>
                </div>
              )}
            </div>
          )}

          {!showAddFromWeb && !readOnly && !productId && (
            <button
              onClick={() => setShowAddFromWeb(true)}
              className="w-full p-2 border border-dashed border-gray-300 rounded hover:border-blue-400 hover:bg-blue-50 transition-colors flex items-center justify-center gap-1.5 text-gray-600 hover:text-blue-600"
            >
              <Globe className="w-4 h-4" />
              <span className="text-xs font-medium">Import from URL</span>
            </button>
          )}

          {/* BASIC INFO */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Basic Information</h3>

            {/* Manufacturer */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Manufacturer <span className="text-red-500">*</span>
              </label>
              {showNewManufacturer ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter manufacturer name"
                    autoFocus
                  />
                  <button
                    onClick={handleAddManufacturer}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => {
                      setShowNewManufacturer(false);
                      setNewItemName('');
                    }}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <select
                    value={formData.manufacturer_id}
                    onChange={(e) => setFormData(prev => ({ ...prev, manufacturer_id: e.target.value }))}
                    className={`flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                      errors.manufacturer ? 'border-red-500' : 'border-gray-300'
                    }`}
                  >
                    <option value="">Select Manufacturer</option>
                    {manufacturers.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setShowNewManufacturer(true)}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    New
                  </button>
                </div>
              )}
              {errors.manufacturer && (
                <p className="text-sm text-red-600 mt-1" data-error-field="manufacturer">{errors.manufacturer}</p>
              )}
            </div>

            {/* Model Number */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Model Number <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.manufacturer_model_number}
                onChange={(e) => setFormData(prev => ({ ...prev, manufacturer_model_number: e.target.value }))}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  errors.model ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Enter model number"
              />
              {errors.model && (
                <p className="text-sm text-red-600 mt-1">{errors.model}</p>
              )}
            </div>

            {/* SKU */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                SKU <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.sku}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, sku: e.target.value }));
                  setSkuManuallyEdited(true); // Mark that user has manually edited SKU
                }}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  errors.sku ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Auto-filled from Model Number"
              />
              {errors.sku && (
                <p className="text-sm text-red-600 mt-1">{errors.sku}</p>
              )}
            </div>

            {/* Color */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Color/Finish
              </label>
              {showNewColor ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter color/finish name"
                    autoFocus
                  />
                  <button
                    onClick={handleAddColor}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => {
                      setShowNewColor(false);
                      setNewItemName('');
                    }}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <select
                    value={formData.item_color}
                    onChange={(e) => setFormData(prev => ({ ...prev, item_color: e.target.value }))}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Color/Finish</option>
                    {colors.map(c => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setShowNewColor(true)}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    New
                  </button>
                </div>
              )}
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category <span className="text-red-500">*</span>
              </label>
              {showNewCategory ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter category name"
                    autoFocus
                  />
                  <button
                    onClick={handleAddCategory}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => {
                      setShowNewCategory(false);
                      setNewItemName('');
                    }}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <select
                    value={formData.category_id}
                    onChange={(e) => setFormData(prev => ({ ...prev, category_id: e.target.value, subcategory_id: '' }))}
                    className={`flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                      errors.category ? 'border-red-500' : 'border-gray-300'
                    }`}
                  >
                    <option value="">Select Category</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setShowNewCategory(true)}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    New
                  </button>
                </div>
              )}
              {errors.category && (
                <p className="text-sm text-red-600 mt-1">{errors.category}</p>
              )}
            </div>

            {/* Subcategory */}
            {formData.category_id && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Subcategory
                </label>
                {showNewSubcategory ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="Enter subcategory name"
                      autoFocus
                    />
                    <button
                      onClick={handleAddSubcategory}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => {
                        setShowNewSubcategory(false);
                        setNewItemName('');
                      }}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <select
                      value={formData.subcategory_id}
                      onChange={(e) => setFormData(prev => ({ ...prev, subcategory_id: e.target.value }))}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select Subcategory</option>
                      {filteredSubcategories.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => setShowNewSubcategory(true)}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      New
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Product Image */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Product Image
              </label>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <button
                    onClick={handleImageSearch}
                    disabled={!formData.manufacturer_id || !formData.manufacturer_model_number}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 flex items-center justify-center gap-2"
                  >
                    <Search className="w-4 h-4" />
                    Search Image
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImage}
                    className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center justify-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    {uploadingImage ? 'Uploading...' : 'Upload Image'}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </div>
                <input
                  type="url"
                  value={formData.image_url}
                  onChange={(e) => setFormData(prev => ({ ...prev, image_url: e.target.value }))}
                  placeholder="Or paste image URL here"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                />
                <p className="text-xs text-gray-500">
                  Search opens Google Images. Right-click image → "Copy image address" → Paste URL above. Or paste image directly (Ctrl+V)
                </p>
                {formData.image_url && (
                  <div className="relative inline-block">
                    <div className="relative w-32 h-32 border-2 border-gray-300 rounded-lg overflow-hidden bg-gray-50">
                      <img
                        src={formData.image_url}
                        alt="Product preview"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          console.error('Failed to load image:', formData.image_url);
                          e.currentTarget.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%23999">No Image</text></svg>';
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, image_url: '' }))}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* PRICING */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 border-b pb-2 flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Pricing
            </h3>

            <div className="grid grid-cols-2 gap-4">
              {/* Cost */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cost
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.cost || ''}
                    onChange={(e) => {
                      setLastEditedField('cost');
                      setFormData(prev => ({ ...prev, cost: parseFloat(e.target.value) || 0 }));
                    }}
                    placeholder="0.00"
                    className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Our Price */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Our Price
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={formData.our_price || ''}
                    onChange={(e) => {
                      const value = e.target.value === '' ? 0 : parseFloat(e.target.value);
                      if (!isNaN(value)) {
                        handlePriceChange(value);
                      }
                    }}
                    onFocus={() => {
                      setIsEditingPrice(true);
                    }}
                    onBlur={() => {
                      // Ensure the final value is properly rounded to 2 decimal places
                      const roundedPrice = Math.round(formData.our_price * 100) / 100;
                      if (roundedPrice !== formData.our_price) {
                        setFormData(prev => ({ ...prev, our_price: roundedPrice }));
                      }
                      // Re-enable auto-calculation after user is done editing
                      setTimeout(() => {
                        setIsEditingPrice(false);
                        setLastEditedField(null);
                      }, 100);
                    }}
                    placeholder="0.00"
                    className={`w-full pl-8 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                      errors.price ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                </div>
                {errors.price && (
                  <p className="text-sm text-red-600 mt-1">{errors.price}</p>
                )}
              </div>

              {/* Margin % */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Margin %
                  <span className="text-xs text-gray-500 ml-2">(auto-adjusts with price)</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    value={formData.margin_percent ? formData.margin_percent.toFixed(2) : ''}
                    onChange={(e) => {
                      setLastEditedField('margin');
                      setFormData(prev => ({ ...prev, margin_percent: parseFloat(e.target.value) || 0 }));
                    }}
                    className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">%</span>
                </div>
              </div>

              {/* Installed Price */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Installed Price
                  <span className="text-xs text-gray-500 ml-2">(Material + Labor)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="text"
                    value={(formData.our_price + formData.labor_cost).toFixed(2)}
                    disabled
                    className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600"
                  />
                </div>
              </div>

              {/* Minimum Margin (Admin only) */}
              {profile?.role === 'admin' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <input
                      type="checkbox"
                      checked={formData.enforce_minimum}
                      onChange={(e) => setFormData(prev => ({ ...prev, enforce_minimum: e.target.checked }))}
                      className="mr-2"
                    />
                    Enforce Minimum Margin %
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.minimum_margin}
                    onChange={(e) => setFormData(prev => ({ ...prev, minimum_margin: parseFloat(e.target.value) || 0 }))}
                    disabled={!formData.enforce_minimum}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                  />
                </div>
              )}
            </div>

            {/* Minimum Price Display */}
            {(effectiveMinMargin > 0 || enforceMinPricing) && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-yellow-900">Minimum Pricing Enforced</p>
                  <p className="text-yellow-700">
                    Minimum Price: ${calculatedMinPrice.toFixed(2)} ({effectiveMinMargin}% margin)
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* INVENTORY & LABOR */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Inventory & Labor</h3>

            {/* Inventory Type and Item Type */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Inventory Type
                </label>
                <select
                  value={formData.inventory_type}
                  onChange={(e) => setFormData(prev => ({ ...prev, inventory_type: e.target.value as any }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="inventory">Inventory</option>
                  <option value="non-inventory">Non-Inventory</option>
                  <option value="labor">Labor</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">Stocked vs ordered per job</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Item Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.item_type}
                  onChange={(e) => setFormData(prev => ({ ...prev, item_type: e.target.value as any }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="material">Material</option>
                  <option value="labor">Labor</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">For tax calculation purposes</p>
              </div>
            </div>

            {/* Vendor */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Default Vendor
              </label>
              {showNewVendor ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter vendor name"
                    autoFocus
                  />
                  <button
                    onClick={handleAddVendor}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => {
                      setShowNewVendor(false);
                      setNewItemName('');
                    }}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <select
                    value={formData.default_vendor_id}
                    onChange={(e) => setFormData(prev => ({ ...prev, default_vendor_id: e.target.value }))}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Vendor</option>
                    {vendors.map(v => (
                      <option key={v.id} value={v.id}>{v.vendor_name}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setShowNewVendor(true)}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    New
                  </button>
                </div>
              )}
            </div>

            {/* Labor Phase */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Labor Phase
              </label>
              <select
                value={formData.labor_phase_id}
                onChange={(e) => setFormData(prev => ({ ...prev, labor_phase_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select Labor Phase</option>
                {laborPhases.map(p => (
                  <option key={p.id} value={p.id}>{p.name} (${p.default_price}/hr)</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Admin can set up labor phases in Settings
              </p>
            </div>

            {/* Labor Hours and Cost */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Default Labor Hours
                </label>
                <input
                  type="number"
                  step="0.25"
                  value={formData.default_labor_hours || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, default_labor_hours: e.target.value === '' ? 0 : parseFloat(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Calculated Labor Cost
                </label>
                <input
                  type="text"
                  value={`$${formData.labor_cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600"
                />
              </div>
            </div>

          </div>

          {/* DESCRIPTIONS */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Descriptions & Instructions</h3>

            {/* Sales Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sales Description (Shown on Proposals)
              </label>
              <textarea
                value={formData.sales_description}
                onChange={(e) => setFormData(prev => ({ ...prev, sales_description: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Description that customers will see on proposals"
              />
            </div>

            {/* Purchase Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Purchase Description (Shown on POs)
              </label>
              <textarea
                value={formData.purchase_description}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, purchase_description: e.target.value }));
                  setUserEditedPurchaseDesc(true);
                }}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Auto-copied from sales description, edit if needed"
              />
            </div>

            {/* Default Install Instructions */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Default Install Instructions
              </label>
              <input
                type="text"
                value={formData.default_install_task}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, default_install_task: e.target.value }));
                  setUserEditedInstallTask(true);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Auto-filled with 'Install {model}'"
              />
            </div>
          </div>

          {/* RESOURCES */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 border-b pb-2 flex items-center gap-2">
              <Link2 className="w-5 h-5" />
              Resources & Links
            </h3>

            <div className="grid grid-cols-1 gap-4">
              {/* Manufacturer URL */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-gray-500" />
                  Manufacturer Product Page
                </label>
                <input
                  type="url"
                  value={formData.manufacturer_url}
                  onChange={(e) => setFormData(prev => ({ ...prev, manufacturer_url: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="https://manufacturer.com/product-page"
                />
                <p className="text-xs text-gray-500 mt-1">Official manufacturer product information page</p>
              </div>

              {/* Supplier URL */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-gray-500" />
                  Supplier/Vendor Page
                </label>
                <input
                  type="url"
                  value={formData.supplier_url}
                  onChange={(e) => setFormData(prev => ({ ...prev, supplier_url: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="https://supplier.com/product-page"
                />
                <p className="text-xs text-gray-500 mt-1">Where to purchase this product</p>
              </div>

              {/* Datasheet URL */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-gray-500" />
                  Product Datasheet / Spec Sheet
                </label>
                <input
                  type="url"
                  value={formData.datasheet_url}
                  onChange={(e) => setFormData(prev => ({ ...prev, datasheet_url: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="https://example.com/datasheet.pdf"
                />
                <p className="text-xs text-gray-500 mt-1">Technical specifications and documentation</p>
              </div>

              {/* Installation Video URL */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                  <Video className="w-4 h-4 text-gray-500" />
                  Installation Video / Tutorial
                </label>
                <input
                  type="url"
                  value={formData.installation_video_url}
                  onChange={(e) => setFormData(prev => ({ ...prev, installation_video_url: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="https://youtube.com/watch?v=..."
                />
                <p className="text-xs text-gray-500 mt-1">Installation guide or tutorial video</p>
              </div>

              {/* Product Link (General) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-gray-500" />
                  Additional Product Link
                </label>
                <input
                  type="url"
                  value={formData.product_link}
                  onChange={(e) => setFormData(prev => ({ ...prev, product_link: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="https://example.com/additional-info"
                />
                <p className="text-xs text-gray-500 mt-1">Any other relevant product information link</p>
              </div>
            </div>
          </div>

          {/* Accessories Section */}
          {productId && (
            <AccessoriesSection productId={productId} />
          )}
        </div>

        {/* Footer Actions */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex items-center justify-between gap-3">
          {allowOneOffItem && !productId ? (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={addToCatalog}
                onChange={(e) => setAddToCatalog(e.target.checked)}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">
                Add to Product Catalog
              </span>
              <span className="text-xs text-gray-500">(Uncheck for one-time use only)</span>
            </label>
          ) : (
            <div></div>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            {saveSuccess && (
              <div className="text-green-600 font-medium flex items-center gap-2">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Saved successfully!
              </div>
            )}
            {Object.keys(errors).length > 0 && (
              <div className="text-red-600 text-sm font-medium flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {Object.keys(errors).length} field{Object.keys(errors).length !== 1 ? 's' : ''} require attention
              </div>
            )}
            <button
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : (addToCatalog ? 'Save Product' : 'Add to Proposal')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AccessoriesSection({ productId }: { productId: string }) {
  const [accessories, setAccessories] = useState<any[]>([]);
  const [availableProducts, setAvailableProducts] = useState<any[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [usedInPackages, setUsedInPackages] = useState<any[]>([]);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  const isOnline = navigator.onLine;

  useEffect(() => {
    loadAccessories();
    loadAvailableProducts();
    loadPackages();
  }, [productId]);

  async function loadAccessories() {
    try {
      const { data, error } = await supabase
        .from('product_accessories')
        .select(`
          id,
          is_default_selected,
          sort_order,
          accessory:products!product_accessories_accessory_product_id_fkey (
            id,
            manufacturer_model_number,
            our_price,
            sku
          )
        `)
        .eq('parent_product_id', productId)
        .order('sort_order');

      if (error) throw error;
      setAccessories(data || []);
    } catch (error) {
      console.error('Error loading accessories:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadAvailableProducts() {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, manufacturer_model_number, our_price, sku')
        .eq('is_active', true)
        .neq('id', productId)
        .order('manufacturer_model_number');

      if (error) throw error;
      setAvailableProducts(data || []);
    } catch (error) {
      console.error('Error loading products:', error);
    }
  }

  async function loadPackages() {
    try {
      const { data, error } = await supabase
        .from('product_package_items')
        .select(`
          package:product_packages (
            id,
            package_name
          )
        `)
        .eq('product_id', productId);

      if (error) throw error;
      setUsedInPackages(data?.map((item: any) => item.package).filter(Boolean) || []);
    } catch (error) {
      console.error('Error loading packages:', error);
    }
  }

  async function addAccessory(accessoryProductId: string) {
    try {
      const existing = accessories.find(acc => acc.accessory.id === accessoryProductId);
      if (existing) {
        alert('This product is already added as an accessory');
        return;
      }

      const { error } = await supabase
        .from('product_accessories')
        .insert({
          parent_product_id: productId,
          accessory_product_id: accessoryProductId,
          is_default_selected: false,
          sort_order: accessories.length
        });

      if (error) throw error;

      loadAccessories();
      setShowSearch(false);
      setSearchTerm('');
    } catch (error) {
      console.error('Error adding accessory:', error);
      alert('Failed to add accessory');
    }
  }

  async function removeAccessory(accessoryId: string) {
    try {
      const { error } = await supabase
        .from('product_accessories')
        .delete()
        .eq('id', accessoryId);

      if (error) throw error;
      loadAccessories();
    } catch (error) {
      console.error('Error removing accessory:', error);
      alert('Failed to remove accessory');
    }
  }

  async function toggleDefaultSelected(accessoryId: string, currentValue: boolean) {
    try {
      const { error } = await supabase
        .from('product_accessories')
        .update({ is_default_selected: !currentValue })
        .eq('id', accessoryId);

      if (error) throw error;
      loadAccessories();
    } catch (error) {
      console.error('Error updating accessory:', error);
      alert('Failed to update accessory');
    }
  }

  const filteredProducts = searchTerm
    ? availableProducts.filter(p =>
        p.manufacturer_model_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.sku?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : availableProducts;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Accessories & Packages</h3>

      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="block text-sm font-medium text-gray-700">
            Accessories for this product
          </label>
          <button
            type="button"
            onClick={() => setShowSearch(!showSearch)}
            disabled={!isOnline}
            className="px-2 sm:px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs sm:text-sm flex items-center gap-1 disabled:bg-gray-600 disabled:cursor-not-allowed touch-manipulation"
            title={!isOnline ? 'Available when online' : 'Add accessory'}
          >
            <Plus size={12} className="sm:w-3.5 sm:h-3.5" />
            <span className="hidden xs:inline">Add Accessory</span>
          </button>
        </div>

        {showSearch && (
          <div className="mb-3 p-3 bg-gray-50 border border-gray-300 rounded-lg">
            <div className="relative mb-2">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search products..."
                className="w-full pl-9 pr-3 py-2 bg-white border border-gray-300 rounded text-sm"
              />
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {filteredProducts.slice(0, 10).map(product => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => addAccessory(product.id)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm"
                >
                  <div className="font-medium text-gray-900">{product.manufacturer_model_number}</div>
                  <div className="text-xs text-gray-500">
                    ${Number(product.our_price).toFixed(2)} • {product.sku}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-500 text-center py-4">Loading...</p>
        ) : accessories.length === 0 ? (
          <p className="text-xs sm:text-sm text-gray-500 text-center py-3 sm:py-4">
            No accessories added yet. Accessories are optional add-on products that customers can select.
          </p>
        ) : (
          <div className="space-y-2">
            {accessories.map(acc => (
              <div key={acc.id} className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-gray-50 border border-gray-300 rounded-lg">
                <input
                  type="checkbox"
                  checked={acc.is_default_selected}
                  onChange={() => toggleDefaultSelected(acc.id, acc.is_default_selected)}
                  disabled={!isOnline}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-600 disabled:bg-gray-200 disabled:cursor-not-allowed flex-shrink-0"
                  title={!isOnline ? 'Available when online' : acc.is_default_selected ? 'Default selected' : 'Optional'}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 text-sm sm:text-base truncate">
                    {acc.accessory.manufacturer_model_number}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    ${Number(acc.accessory.our_price).toFixed(2)} •{' '}
                    {acc.is_default_selected ? 'Auto-selected by default' : 'Optional accessory'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmModal({ title: 'Remove Accessory', message: 'Remove this accessory?', onConfirm: () => removeAccessory(acc.id) })}
                  disabled={!isOnline}
                  className="text-red-600 hover:text-red-700 p-1 disabled:text-gray-400 disabled:cursor-not-allowed touch-manipulation flex-shrink-0"
                  title={!isOnline ? 'Available when online' : 'Remove'}
                >
                  <X size={14} className="sm:w-4 sm:h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {usedInPackages.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Used in packages
          </label>
          <div className="text-sm text-gray-600 space-y-1">
            {usedInPackages.map(pkg => (
              <div key={pkg.id} className="flex items-center gap-2">
                <Package size={14} className="text-gray-400" />
                <span>{pkg.package_name}</span>
              </div>
            ))}
          </div>
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
