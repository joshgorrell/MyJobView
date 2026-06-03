import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Package, Loader2, Hash, Tag, ChevronDown, ChevronRight, LayoutList, Clock, Wrench, Building2, LayoutGrid, List, Columns2 as Columns, Check, Printer } from 'lucide-react';
import type { SalesOrderFull } from './SalesOrderDetail';
import { SalesOrderProductDetailModal } from './SalesOrderProductDetailModal';
import {
  LineItemGrid,
  type GridLineItem,
  type GridColumnKey,
  DEFAULT_COLUMNS,
} from '../Shared/LineItemGrid';

interface SalesOrderProductsTabProps {
  order: SalesOrderFull;
}

type ProductLineItem = GridLineItem;

interface Room {
  id: string;
  name: string;
  sort_order: number;
}

type GroupBy = 'room' | 'manufacturer' | 'vendor';
type ViewMode = 'grid' | 'clean';

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function effectiveCost(item: GridLineItem): number | null {
  if (item.cost != null && item.cost !== 0) return item.cost;
  if (item.cost === 0 && item.product_id && item.products?.cost != null) return item.products.cost;
  return item.cost;
}

function isVisibleItem(item: GridLineItem): boolean {
  const t = item.item_type?.toLowerCase();
  if (!t) return !!item.product_id;
  return t === 'material' || t === 'product' || t === 'both' || t === 'labor';
}

const GROUP_OPTIONS: { id: GroupBy; label: string }[] = [
  { id: 'room', label: 'By Room' },
  { id: 'manufacturer', label: 'By Manufacturer' },
  { id: 'vendor', label: 'By Vendor' },
];

const COLUMN_OPTIONS: { key: GridColumnKey; label: string }[] = [
  { key: 'manufacturer', label: 'Manufacturer' },
  { key: 'sku', label: 'SKU' },
  { key: 'description', label: 'Description' },
  { key: 'roomOrGroup', label: 'Room / Area' },
  { key: 'qty', label: 'Qty' },
  { key: 'cost', label: 'Cost' },
  { key: 'price', label: 'Price' },
  { key: 'laborPhase', label: 'Labor Phase' },
  { key: 'laborHrs', label: 'Labor Hrs' },
  { key: 'laborRate', label: 'Labor Rate' },
  { key: 'laborTotal', label: 'Labor Total' },
  { key: 'lineTotal', label: 'Line Total' },
];

const STORAGE_KEY = 'so_products_columns_v2';

function loadColumnPrefs(): Set<GridColumnKey> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as GridColumnKey[];
      if (Array.isArray(arr) && arr.length > 0) return new Set(arr);
    }
  } catch {}
  return new Set(DEFAULT_COLUMNS);
}

function saveColumnPrefs(cols: Set<GridColumnKey>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(cols)));
  } catch {}
}

export function SalesOrderProductsTab({ order }: SalesOrderProductsTabProps) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [items, setItems] = useState<ProductLineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupBy, setGroupBy] = useState<GroupBy>('vendor');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectedItem, setSelectedItem] = useState<ProductLineItem | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [visibleColumns, setVisibleColumns] = useState<Set<GridColumnKey>>(loadColumnPrefs);
  const [showColumnsMenu, setShowColumnsMenu] = useState(false);
  const [showGroupMenu, setShowGroupMenu] = useState(false);
  const columnsMenuRef = useRef<HTMLDivElement>(null);
  const groupMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (order.proposal_id) loadData();
  }, [order.proposal_id]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (columnsMenuRef.current && !columnsMenuRef.current.contains(e.target as Node)) {
        setShowColumnsMenu(false);
      }
      if (groupMenuRef.current && !groupMenuRef.current.contains(e.target as Node)) {
        setShowGroupMenu(false);
      }
    }
    if (showColumnsMenu || showGroupMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showColumnsMenu, showGroupMenu]);

  async function loadData() {
    try {
      const [roomsRes, itemsRes] = await Promise.all([
        supabase
          .from('proposal_rooms')
          .select('id, name, sort_order')
          .eq('proposal_id', order.proposal_id)
          .order('sort_order'),
        supabase
          .from('proposal_line_items')
          .select(`
            id, description, quantity, unit, unit_price, line_total, cost,
            item_type, is_hidden, parent_item_id, sort_order, room_id, product_id,
            labor_hours, labor_rate, labor_total, labor_phase_id,
            products(name, sku, vendor, cost, manufacturers(name), vendors:default_vendor_id(vendor_name)),
            labor_phases(name),
            proposal_classes(name, color)
          `)
          .eq('proposal_id', order.proposal_id)
          .order('sort_order'),
      ]);

      if (roomsRes.error) throw roomsRes.error;
      if (itemsRes.error) throw itemsRes.error;

      const roomMap: Record<string, string> = {};
      (roomsRes.data || []).forEach((r: any) => { roomMap[r.id] = r.name; });

      const allItems: ProductLineItem[] = (itemsRes.data || []).map((item: any) => {
        const prod = Array.isArray(item.products) ? item.products[0] ?? null : item.products;
        if (prod) {
          prod.vendors = Array.isArray(prod.vendors) ? prod.vendors[0] ?? null : prod.vendors;
        }
        return {
          ...item,
          products: prod,
          labor_phases: Array.isArray(item.labor_phases) ? item.labor_phases[0] ?? null : item.labor_phases,
          proposal_classes: Array.isArray(item.proposal_classes) ? item.proposal_classes[0] ?? null : item.proposal_classes,
          _roomName: item.room_id ? (roomMap[item.room_id] ?? null) : null,
        };
      });

      setRooms(roomsRes.data || []);
      setItems(allItems);
    } catch (error) {
      console.error('Error loading products:', error);
    } finally {
      setLoading(false);
    }
  }

  function toggleSection(key: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleColumn(key: GridColumnKey) {
    const next = new Set(visibleColumns);
    if (next.has(key)) {
      if (next.size > 1) next.delete(key);
    } else {
      next.add(key);
    }
    setVisibleColumns(next);
    saveColumnPrefs(next);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
      </div>
    );
  }

  const visibleItems = items.filter(i => isVisibleItem(i) && !i.is_hidden);

  if (visibleItems.length === 0) {
    return (
      <div className="text-center py-16">
        <Package className="w-10 h-10 text-gray-600 mx-auto mb-3" />
        <p className="text-gray-400 mb-1">No items found.</p>
        <p className="text-sm text-gray-600">This proposal has no visible line items.</p>
      </div>
    );
  }

  const grandTotal = visibleItems.reduce((sum, i) => sum + (i.line_total || 0), 0);
  const totalQty = visibleItems.reduce((sum, i) => sum + (i.quantity || 0), 0);
  const totalLaborHours = visibleItems.reduce((sum, i) => sum + (i.labor_hours || 0), 0);
  const totalLaborTotal = visibleItems.reduce((sum, i) => sum + (i.labor_total || 0), 0);

  const sections = buildSections(visibleItems, groupBy, rooms);

  const roomOrGroupLabel = 'Room / Area';

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Package className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-gray-400">Line Items</span>
          </div>
          <div className="text-lg font-bold text-white">{visibleItems.length}</div>
          <div className="text-[10px] text-gray-600 mt-0.5">total items</div>
        </div>
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Hash className="w-4 h-4 text-teal-400" />
            <span className="text-xs text-gray-400">Quantity</span>
          </div>
          <div className="text-lg font-bold text-white">{fmt(totalQty)}</div>
          <div className="text-[10px] text-gray-600 mt-0.5">units total</div>
        </div>
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-amber-400" />
            <span className="text-xs text-gray-400">Labor Hours</span>
          </div>
          <div className="text-lg font-bold text-white">{fmt(totalLaborHours)}</div>
          <div className="text-[10px] text-gray-600 mt-0.5">${fmt(totalLaborTotal)} labor</div>
        </div>
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Tag className="w-4 h-4 text-green-400" />
            <span className="text-xs text-gray-400">Line Total</span>
          </div>
          <div className="text-lg font-bold text-green-400">${fmt(grandTotal)}</div>
          <div className="text-[10px] text-gray-600 mt-0.5">before tax &amp; modifiers</div>
        </div>
      </div>

      {/* Toolbar row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* View toggle */}
        <div className="flex items-center gap-0.5 bg-gray-800 border border-gray-700 rounded-lg p-1">
          <button
            onClick={() => setViewMode('clean')}
            title="Clean view"
            className={`flex items-center justify-center w-7 h-7 rounded transition-colors ${
              viewMode === 'clean'
                ? 'bg-blue-600 text-white'
                : 'text-gray-500 hover:text-white hover:bg-gray-700/50'
            }`}
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            title="Grid view"
            className={`flex items-center justify-center w-7 h-7 rounded transition-colors ${
              viewMode === 'grid'
                ? 'bg-blue-600 text-white'
                : 'text-gray-500 hover:text-white hover:bg-gray-700/50'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Separator */}
        <div className="w-px h-5 bg-gray-700 mx-0.5" />

        {/* Group by dropdown */}
        <div className="relative" ref={groupMenuRef}>
          <button
            onClick={() => setShowGroupMenu(v => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
              showGroupMenu
                ? 'bg-gray-700 border-gray-600 text-white'
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700/50'
            }`}
          >
            <LayoutList className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{GROUP_OPTIONS.find(o => o.id === groupBy)?.label ?? 'Group'}</span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>
          {showGroupMenu && (
            <div className="absolute right-0 sm:left-0 sm:right-auto top-full mt-1 z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-xl min-w-[160px] max-w-[calc(100vw-1rem)] py-1">
              <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Group by</div>
              {GROUP_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => { setGroupBy(opt.id); setCollapsed(new Set()); setShowGroupMenu(false); }}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-gray-700 transition-colors text-left"
                >
                  <span className={groupBy === opt.id ? 'text-white font-medium' : 'text-gray-400'}>{opt.label}</span>
                  {groupBy === opt.id && <Check className="w-3.5 h-3.5 text-blue-400" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Separator */}
        <div className="w-px h-5 bg-gray-700 mx-0.5" />

        {/* Expand / Collapse all */}
        <button
          onClick={() => {
            const allKeys = sections.map(s => s.key);
            const allCollapsed = allKeys.every(k => collapsed.has(k));
            if (allCollapsed) {
              setCollapsed(new Set());
            } else {
              setCollapsed(new Set(allKeys));
            }
          }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-gray-700 bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors whitespace-nowrap"
        >
          {sections.every(s => collapsed.has(s.key))
            ? <><ChevronDown className="w-3.5 h-3.5" /><span className="hidden sm:inline"> Expand All</span></>
            : <><ChevronRight className="w-3.5 h-3.5" /><span className="hidden sm:inline"> Collapse All</span></>
          }
        </button>

        {/* Columns (grid mode only) */}
        {viewMode === 'grid' && (
          <>
            <div className="w-px h-5 bg-gray-700 mx-0.5" />
            <div className="relative" ref={columnsMenuRef}>
              <button
                onClick={() => setShowColumnsMenu(v => !v)}
                title="Toggle columns"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                  showColumnsMenu
                    ? 'bg-gray-700 border-gray-600 text-white'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700/50'
                }`}
              >
                <Columns className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Columns</span>
              </button>
              {showColumnsMenu && (
                <div className="absolute right-0 sm:left-0 sm:right-auto top-full mt-1 z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-xl min-w-[180px] max-w-[calc(100vw-1rem)] py-1">
                  {COLUMN_OPTIONS.map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => toggleColumn(key)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-700 transition-colors text-left"
                    >
                      <span className={`w-4 h-4 flex items-center justify-center rounded border flex-shrink-0 ${
                        visibleColumns.has(key)
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'border-gray-600 text-transparent'
                      }`}>
                        {visibleColumns.has(key) && <Check className="w-2.5 h-2.5" />}
                      </span>
                      <span className={visibleColumns.has(key) ? 'text-white' : 'text-gray-400'}>{label}</span>
                    </button>
                  ))}
                  <div className="border-t border-gray-700 mt-1 pt-1 px-3 pb-1 flex gap-2">
                    <button
                      onClick={() => {
                        const all = new Set<GridColumnKey>(COLUMN_OPTIONS.map(c => c.key));
                        setVisibleColumns(all);
                        saveColumnPrefs(all);
                      }}
                      className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      Show all
                    </button>
                    <span className="text-gray-700">·</span>
                    <button
                      onClick={() => {
                        const minimal = new Set<GridColumnKey>(['description', 'qty', 'price', 'lineTotal']);
                        setVisibleColumns(minimal);
                        saveColumnPrefs(minimal);
                      }}
                      className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      Minimal
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Print */}
        <button
          onClick={() => window.print()}
          title="Print report"
          className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-700 bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors"
        >
          <Printer className="w-3.5 h-3.5" />
        </button>
      </div>

      {viewMode === 'grid' ? (
        <LineItemGrid
          sections={sections}
          visibleColumns={
            groupBy === 'room'
              ? new Set([...visibleColumns].filter(c => c !== 'roomOrGroup') as GridColumnKey[])
              : visibleColumns
          }
          roomOrGroupLabel={roomOrGroupLabel}
          onRowClick={setSelectedItem}
          collapsedSections={collapsed}
          onToggleSection={toggleSection}
        />
      ) : (
        <CleanView
          sections={sections}
          collapsedSections={collapsed}
          onToggleSection={toggleSection}
          onClickItem={setSelectedItem}
          groupBy={groupBy}
        />
      )}

      {selectedItem && (
        <SalesOrderProductDetailModal
          lineItem={selectedItem}
          onClose={() => setSelectedItem(null)}
          onSaved={() => {
            setSelectedItem(null);
            loadData();
          }}
        />
      )}
    </div>
  );
}

interface SectionDef {
  key: string;
  label: string;
  items: ProductLineItem[];
}

function buildSections(items: ProductLineItem[], groupBy: GroupBy, rooms: Room[]): SectionDef[] {
  if (groupBy === 'room') {
    const roomOrder = rooms.map(r => r.id);
    const grouped: Record<string, ProductLineItem[]> = {};
    const roomNames: Record<string, string> = {};
    rooms.forEach(r => { roomNames[r.id] = r.name; });

    items.forEach(item => {
      const key = item.room_id ?? '__none__';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(item);
    });

    const keys = [...roomOrder.filter(id => grouped[id]), ...(grouped['__none__'] ? ['__none__'] : [])];
    return keys.map(key => ({
      key,
      label: key === '__none__' ? 'No Room / Area' : (roomNames[key] ?? 'Unknown Room'),
      items: grouped[key],
    }));
  }

  if (groupBy === 'manufacturer') {
    const grouped: Record<string, ProductLineItem[]> = {};
    items.forEach(item => {
      const key = item.products?.manufacturers?.name ?? '__none__';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(item);
    });
    return Object.entries(grouped)
      .sort(([a], [b]) => (a === '__none__' ? 1 : b === '__none__' ? -1 : a.localeCompare(b)))
      .map(([key, its]) => ({ key, label: key === '__none__' ? 'No Manufacturer' : key, items: its }));
  }

  if (groupBy === 'vendor') {
    const grouped: Record<string, ProductLineItem[]> = {};
    items.forEach(item => {
      const key = item.products?.vendors?.vendor_name ?? item.products?.vendor ?? '__none__';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(item);
    });
    return Object.entries(grouped)
      .sort(([a], [b]) => (a === '__none__' ? 1 : b === '__none__' ? -1 : a.localeCompare(b)))
      .map(([key, its]) => ({ key, label: key === '__none__' ? 'No Vendor' : key, items: its }));
  }

  return [];
}

function CleanView({
  sections,
  collapsedSections,
  onToggleSection,
  onClickItem,
  groupBy,
}: {
  sections: SectionDef[];
  collapsedSections: Set<string>;
  onToggleSection: (key: string) => void;
  onClickItem: (item: ProductLineItem) => void;
  groupBy: GroupBy;
}) {
  return (
    <div className="space-y-3">
      {sections.map(section => {
        const sectionTotal = section.items.reduce((s, i) => s + (i.line_total || 0), 0);
        const isCollapsed = collapsedSections.has(section.key);

        return (
          <div key={section.key} className="rounded-lg border border-gray-700 overflow-hidden">
            <button
              onClick={() => onToggleSection(section.key)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-800/50 hover:bg-gray-800/70 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                {isCollapsed
                  ? <ChevronRight className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                  : <ChevronDown className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                }
                {(groupBy === 'manufacturer' || groupBy === 'vendor') && (
                  <Building2 className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                )}
                <span className="text-sm font-semibold text-blue-400 truncate">{section.label}</span>
                <span className="text-xs text-gray-500 flex-shrink-0">
                  {section.items.length} item{section.items.length !== 1 ? 's' : ''}
                </span>
              </div>
              <span className="text-sm font-semibold text-gray-300 flex-shrink-0 ml-3">${fmt(sectionTotal)}</span>
            </button>

            {!isCollapsed && (
              <div className="divide-y divide-gray-700/40">
                {section.items.map(item => (
                  <CleanItemRow key={item.id} item={item} onClickItem={onClickItem} />
                ))}
                <div className="px-4 py-3 bg-gray-800/30 flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-400">Section Subtotal</span>
                  <span className="text-sm font-bold text-white">${fmt(sectionTotal)}</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CleanItemRow({
  item,
  onClickItem,
}: {
  item: ProductLineItem;
  onClickItem: (item: ProductLineItem) => void;
}) {
  const sku = item.products?.sku;
  const classColor = item.proposal_classes?.color;
  const isLaborOnly = item.item_type?.toLowerCase() === 'labor';
  const hasLabor = item.labor_hours != null && item.labor_hours > 0;

  return (
    <div
      className="px-4 py-3 cursor-pointer hover:bg-gray-800/30 transition-colors"
      onClick={() => onClickItem(item)}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          {classColor && (
            <span className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: classColor }} />
          )}
          <div className="min-w-0">
            {isLaborOnly ? (
              <div className="flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                <span className="text-sm text-gray-200">{item.description}</span>
              </div>
            ) : sku ? (
              <>
                <div className="font-mono text-xs text-cyan-400">{sku}</div>
                <div className="text-sm text-gray-200 mt-0.5">{item.description}</div>
              </>
            ) : (
              <div className="text-sm text-gray-200">{item.description}</div>
            )}
            {item.labor_phases?.name && (
              <div className="text-xs text-gray-500 mt-0.5">{item.labor_phases.name}</div>
            )}
            {item._roomName && (
              <div className="text-xs text-gray-600 mt-0.5">{item._roomName}</div>
            )}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-sm font-semibold text-white">${fmt(item.line_total)}</div>
          {!isLaborOnly && (
            <div className="text-xs text-gray-500 mt-0.5">
              {item.quantity}{item.unit ? ` ${item.unit}` : ''} &times; ${fmt(item.unit_price)}
            </div>
          )}
          {hasLabor && (
            <div className="flex items-center justify-end gap-1 mt-0.5">
              <Clock className="w-3 h-3 text-amber-400" />
              <span className="text-xs text-amber-400">{fmt(item.labor_hours!)} hrs</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
