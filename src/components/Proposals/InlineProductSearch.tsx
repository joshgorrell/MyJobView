import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Package, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Product } from '../../lib/types';
import { useAuth } from '../../contexts/AuthContext';

interface ProductPackageItem {
  id: string;
  product_id: string;
  quantity: number;
  include_labor: boolean;
  product?: {
    id: string;
    sku: string;
    name: string;
    our_price?: number;
    cost?: number;
    unit: string;
    is_taxable: boolean;
  };
}

interface ProductPackage {
  id: string;
  package_name: string;
  package_sku?: string;
  description?: string;
  package_price?: number;
  is_price_override: boolean;
  is_active: boolean;
  items?: ProductPackageItem[];
}

type DropdownItem =
  | { kind: 'product'; data: Product }
  | { kind: 'package'; data: ProductPackage }
  | { kind: 'recent'; data: Product };

interface InlineProductSearchProps {
  value: string;
  onChange: (value: string) => void;
  onProductSelect: (product: Product) => void;
  onPackageSelect?: (pkg: ProductPackage) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onTabAfterSelect?: () => void;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  dataRoomId?: string;
}

export default function InlineProductSearch({
  value,
  onChange,
  onProductSelect,
  onPackageSelect,
  onKeyDown,
  onTabAfterSelect,
  className,
  placeholder,
  autoFocus,
  dataRoomId
}: InlineProductSearchProps) {
  const { profile } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [packages, setPackages] = useState<ProductPackage[]>([]);
  const [recentProducts, setRecentProducts] = useState<Product[]>([]);
  const [dropdownItems, setDropdownItems] = useState<DropdownItem[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const justSelectedRef = useRef(false);

  useEffect(() => {
    loadProducts();
    if (onPackageSelect) {
      loadPackages();
    }
  }, [profile?.company_id]);

  useEffect(() => {
    if (value.length >= 1) {
      const query = value.toLowerCase();

      const filteredProducts: DropdownItem[] = products
        .filter(p =>
          p.sku?.toLowerCase().includes(query) ||
          p.name?.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query)
        )
        .slice(0, 8)
        .map(p => ({ kind: 'product', data: p }));

      const filteredPackages: DropdownItem[] = onPackageSelect
        ? packages
            .filter(pkg =>
              pkg.package_sku?.toLowerCase().includes(query) ||
              pkg.package_name?.toLowerCase().includes(query)
            )
            .slice(0, 4)
            .map(pkg => ({ kind: 'package', data: pkg }))
        : [];

      const combined = [...filteredProducts, ...filteredPackages];
      setDropdownItems(combined);
      setShowDropdown(combined.length > 0);
      setSelectedIndex(0);
    } else {
      setDropdownItems([]);
      setShowDropdown(false);
    }
  }, [value, products, packages]);

  async function loadProducts() {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('company_id', profile?.company_id)
        .eq('is_active', true)
        .order('sku');

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error loading products:', error);
    }
  }

  async function loadPackages() {
    try {
      const { data: pkgData, error: pkgError } = await supabase
        .from('product_packages')
        .select('id, package_name, package_sku, description, package_price, is_price_override, is_active')
        .eq('company_id', profile?.company_id)
        .eq('is_active', true)
        .not('package_sku', 'is', null)
        .order('package_name');

      if (pkgError) throw pkgError;

      const packagesWithItems = await Promise.all(
        (pkgData || []).map(async (pkg) => {
          const { data: items } = await supabase
            .from('product_package_items')
            .select('id, product_id, quantity, include_labor, product:products(id, sku, name, our_price, cost, unit, is_taxable)')
            .eq('package_id', pkg.id)
            .order('sort_order');
          return { ...pkg, items: items || [] };
        })
      );

      setPackages(packagesWithItems);
    } catch (error) {
      console.error('Error loading packages:', error);
    }
  }

  const loadRecentProducts = useCallback(async () => {
    if (recentProducts.length > 0) return;
    setLoadingRecent(true);
    try {
      const { data } = await supabase
        .rpc('get_recently_used_products', {
          p_company_id: profile?.company_id,
          p_limit: 6
        });
      if (data && data.length > 0) {
        const ids = data.map((r: any) => r.product_id || r.id).filter(Boolean);
        if (ids.length > 0) {
          const { data: prods } = await supabase
            .from('products')
            .select('*')
            .in('id', ids)
            .eq('is_active', true);
          setRecentProducts(prods || []);
        }
      }
    } catch {
      // recent products are optional
    } finally {
      setLoadingRecent(false);
    }
  }, [profile?.company_id, recentProducts.length]);

  function handleFocus() {
    if (value.length >= 1 && dropdownItems.length > 0) {
      setShowDropdown(true);
    } else if (value.length === 0) {
      loadRecentProducts();
      if (recentProducts.length > 0) {
        setDropdownItems(recentProducts.map(p => ({ kind: 'recent', data: p })));
        setShowDropdown(true);
        setSelectedIndex(0);
      }
    }
  }

  useEffect(() => {
    if (value.length === 0 && recentProducts.length > 0) {
      const items: DropdownItem[] = recentProducts.map(p => ({ kind: 'recent', data: p }));
      setDropdownItems(items);
    }
  }, [recentProducts]);

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (showDropdown && dropdownItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, dropdownItems.length - 1));
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        return;
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = dropdownItems[selectedIndex];
        if (item) {
          handleSelectItem(item);
          justSelectedRef.current = true;
        }
        return;
      } else if (e.key === 'Tab') {
        const item = dropdownItems[selectedIndex];
        if (item) {
          e.preventDefault();
          handleSelectItem(item);
          justSelectedRef.current = true;
          setTimeout(() => {
            if (onTabAfterSelect) {
              onTabAfterSelect();
            }
          }, 10);
        }
        return;
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowDropdown(false);
        return;
      }
    }

    if (onKeyDown) {
      onKeyDown(e);
    }
  }

  function handleSelectItem(item: DropdownItem) {
    if (item.kind === 'product' || item.kind === 'recent') {
      onProductSelect(item.data);
    } else if (item.kind === 'package' && onPackageSelect) {
      onPackageSelect(item.data);
    }
    setShowDropdown(false);
    setDropdownItems([]);
  }

  function handleBlur() {
    setTimeout(() => {
      if (!justSelectedRef.current) {
        setShowDropdown(false);
      }
      justSelectedRef.current = false;
    }, 150);
  }

  return (
    <div className="relative flex-1">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleInputKeyDown}
        onBlur={handleBlur}
        onFocus={handleFocus}
        className={className}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        data-room-id={dataRoomId}
      />

      {showDropdown && dropdownItems.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-[100] left-0 bg-gray-800 border border-gray-600 rounded-lg shadow-2xl mt-1 overflow-y-auto"
          style={{ minWidth: '280px', maxWidth: '420px', maxHeight: '300px' }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {dropdownItems[0]?.kind === 'recent' && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-gray-700">
              <Clock className="w-3 h-3 text-gray-500" />
              <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Recently Used</span>
            </div>
          )}
          {dropdownItems.map((item, index) => (
            item.kind === 'product' || item.kind === 'recent' ? (
              <button
                key={`product-${item.data.id}`}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelectItem(item);
                }}
                className={`w-full text-left px-3 py-2.5 min-h-[44px] flex items-center hover:bg-gray-700 border-b border-gray-700/60 last:border-b-0 transition-colors ${
                  index === selectedIndex ? 'bg-gray-700' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2 w-full">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-white text-sm leading-tight truncate">{item.data.name}</div>
                    {item.data.sku && (
                      <div className="text-gray-400 text-xs mt-0.5">
                        {item.data.sku}
                      </div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <div className="text-cyan-400 font-semibold text-sm">
                      ${(item.data.our_price ?? (item.data as any).price ?? 0).toFixed(2)}
                    </div>
                  </div>
                </div>
              </button>
            ) : (
              <button
                key={`package-${item.data.id}`}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelectItem(item);
                }}
                className={`w-full text-left px-3 py-2.5 min-h-[44px] flex items-center hover:bg-gray-700 border-b border-gray-700/60 last:border-b-0 transition-colors ${
                  index === selectedIndex ? 'bg-gray-700' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2 w-full">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-900/60 border border-amber-700 rounded text-[9px] font-semibold text-amber-300 uppercase tracking-wide flex-shrink-0">
                        <Package className="w-2.5 h-2.5" />
                        PKG
                      </span>
                      <div className="font-medium text-white text-sm leading-tight truncate">{item.data.package_name}</div>
                    </div>
                    {item.data.package_sku && (
                      <div className="text-gray-400 text-xs mt-0.5">{item.data.package_sku}</div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <div className="text-amber-400 font-semibold text-sm">
                      ${item.data.is_price_override && item.data.package_price
                        ? item.data.package_price.toFixed(2)
                        : (item.data.items || []).reduce((sum, i) => sum + (i.product?.our_price || 0) * i.quantity, 0).toFixed(2)
                      }
                    </div>
                    <div className="text-gray-500 text-[10px]">{(item.data.items || []).length} items</div>
                  </div>
                </div>
              </button>
            )
          ))}
          {loadingRecent && (
            <div className="px-3 py-2 text-xs text-gray-500 text-center">Loading...</div>
          )}
        </div>
      )}
    </div>
  );
}
