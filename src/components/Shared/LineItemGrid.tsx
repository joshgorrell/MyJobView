import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Building2, Wrench, Clock } from 'lucide-react';

export interface GridLineItem {
  id: string;
  description: string;
  quantity: number;
  unit: string | null;
  unit_price: number;
  line_total: number;
  cost: number | null;
  item_type: string | null;
  is_hidden: boolean;
  parent_item_id: string | null;
  sort_order: number;
  room_id: string | null;
  product_id: string | null;
  labor_hours: number | null;
  labor_rate: number | null;
  labor_total: number | null;
  labor_phase_id: string | null;
  products?: {
    name: string;
    sku: string | null;
    vendor: string | null;
    cost: number | null;
    manufacturers?: { name: string } | null;
    vendors?: { vendor_name: string } | null;
  } | null;
  labor_phases?: { name: string } | null;
  proposal_classes?: { name: string; color: string } | null;
  _roomName?: string;
}

export interface GridSection {
  key: string;
  label: string;
  items: GridLineItem[];
}

export type GridColumnKey =
  | 'manufacturer'
  | 'sku'
  | 'description'
  | 'roomOrGroup'
  | 'qty'
  | 'cost'
  | 'price'
  | 'laborPhase'
  | 'laborHrs'
  | 'laborRate'
  | 'laborTotal'
  | 'lineTotal';

export const ALL_COLUMNS: GridColumnKey[] = [
  'manufacturer',
  'sku',
  'description',
  'roomOrGroup',
  'qty',
  'cost',
  'price',
  'laborPhase',
  'laborHrs',
  'laborRate',
  'laborTotal',
  'lineTotal',
];

export const DEFAULT_COLUMNS: Set<GridColumnKey> = new Set([
  'manufacturer',
  'sku',
  'description',
  'roomOrGroup',
  'qty',
  'cost',
  'price',
  'laborPhase',
  'laborHrs',
  'laborRate',
  'laborTotal',
  'lineTotal',
]);

const COLUMN_LABELS: Record<GridColumnKey, string> = {
  manufacturer: 'Manufacturer',
  sku: 'SKU',
  description: 'Description',
  roomOrGroup: 'Room / Area',
  qty: 'Qty',
  cost: 'Cost',
  price: 'Price',
  laborPhase: 'Labor Phase',
  laborHrs: 'Labor Hrs',
  laborRate: 'Labor Rate',
  laborTotal: 'Labor Total',
  lineTotal: 'Line Total',
};

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function effectiveCost(item: GridLineItem): number | null {
  if (item.cost != null && item.cost !== 0) return item.cost;
  if (item.cost === 0 && item.product_id && item.products?.cost != null) return item.products.cost;
  return item.cost;
}

interface LineItemGridProps {
  sections: GridSection[];
  visibleColumns: Set<GridColumnKey>;
  roomOrGroupLabel?: string;
  onRowClick?: (item: GridLineItem) => void;
  collapsedSections: Set<string>;
  onToggleSection: (key: string) => void;
  showCollapseAll?: boolean;
}

export function LineItemGrid({
  sections,
  visibleColumns,
  roomOrGroupLabel = 'Room / Area',
  onRowClick,
  collapsedSections,
  onToggleSection,
  showCollapseAll = false,
}: LineItemGridProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const allItemIds = sections.flatMap(s => s.items.map(i => i.id));
  const allSelected = allItemIds.length > 0 && allItemIds.every(id => selectedIds.has(id));
  const someSelected = !allSelected && allItemIds.some(id => selectedIds.has(id));

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allItemIds));
    }
  }

  function toggleSelectItem(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const colCount = visibleColumns.size + 1;

  return (
    <div className="rounded-lg border border-gray-700 overflow-hidden">
      {/* Desktop unified table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead className="bg-gray-800 text-gray-400 sticky top-0 z-10">
            <tr>
              <th className="py-2 px-3 w-8">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={el => { if (el) el.indeterminate = someSelected; }}
                  onChange={toggleSelectAll}
                  className="w-3.5 h-3.5 rounded border-gray-600 bg-gray-700 text-blue-500 cursor-pointer accent-blue-500"
                />
              </th>
              {visibleColumns.has('manufacturer') && (
                <th className="text-left py-2 px-3 whitespace-nowrap text-xs">{COLUMN_LABELS.manufacturer}</th>
              )}
              {visibleColumns.has('sku') && (
                <th className="text-left py-2 px-3 whitespace-nowrap text-xs">{COLUMN_LABELS.sku}</th>
              )}
              {visibleColumns.has('description') && (
                <th className="text-left py-2 px-3 text-xs">{COLUMN_LABELS.description}</th>
              )}
              {visibleColumns.has('roomOrGroup') && (
                <th className="text-left py-2 px-3 whitespace-nowrap text-xs">{roomOrGroupLabel}</th>
              )}
              {visibleColumns.has('qty') && (
                <th className="text-right py-2 px-3 whitespace-nowrap text-xs">{COLUMN_LABELS.qty}</th>
              )}
              {visibleColumns.has('cost') && (
                <th className="text-right py-2 px-3 whitespace-nowrap text-xs">{COLUMN_LABELS.cost}</th>
              )}
              {visibleColumns.has('price') && (
                <th className="text-right py-2 px-3 whitespace-nowrap text-xs">{COLUMN_LABELS.price}</th>
              )}
              {visibleColumns.has('laborPhase') && (
                <th className="text-left py-2 px-3 whitespace-nowrap text-xs">{COLUMN_LABELS.laborPhase}</th>
              )}
              {visibleColumns.has('laborHrs') && (
                <th className="text-right py-2 px-3 whitespace-nowrap text-xs">{COLUMN_LABELS.laborHrs}</th>
              )}
              {visibleColumns.has('laborRate') && (
                <th className="text-right py-2 px-3 whitespace-nowrap text-xs">{COLUMN_LABELS.laborRate}</th>
              )}
              {visibleColumns.has('laborTotal') && (
                <th className="text-right py-2 px-3 whitespace-nowrap text-xs">{COLUMN_LABELS.laborTotal}</th>
              )}
              {visibleColumns.has('lineTotal') && (
                <th className="text-right py-2 px-3 whitespace-nowrap text-xs">{COLUMN_LABELS.lineTotal}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {sections.map((section, idx) => {
              const sectionTotal = section.items.reduce((s, i) => s + (i.line_total || 0), 0);
              const collapsed = collapsedSections.has(section.key);
              return (
                <React.Fragment key={section.key}>
                  {/* Section header row */}
                  <tr
                    className={`bg-gray-800/50 hover:bg-gray-800/70 transition-colors cursor-pointer ${
                      idx > 0 ? 'border-t-2 border-gray-700' : ''
                    }`}
                    onClick={() => onToggleSection(section.key)}
                  >
                    <td colSpan={colCount} className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        {collapsed
                          ? <ChevronRight className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                          : <ChevronDown className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                        }
                        <span className="text-sm font-semibold text-blue-400 truncate flex-1 min-w-0">
                          {section.label}
                        </span>
                        <span className="text-xs text-gray-500 flex-shrink-0 ml-auto pr-4">
                          {section.items.length} item{section.items.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </td>
                  </tr>

                  {/* Item rows */}
                  {!collapsed && section.items.map(item => (
                    <GridRow
                      key={item.id}
                      item={item}
                      visibleColumns={visibleColumns}
                      onRowClick={onRowClick}
                      selected={selectedIds.has(item.id)}
                      onToggleSelect={() => toggleSelectItem(item.id)}
                    />
                  ))}

                  {/* Section subtotal row */}
                  {!collapsed && (
                    <tr className="border-t border-gray-700 bg-gray-800/30">
                      <td
                        colSpan={colCount - 1}
                        className="py-2 px-3 text-xs font-semibold text-gray-500 text-right"
                      >
                        Section Subtotal
                      </td>
                      <td className="py-2 px-3 text-sm font-bold text-white text-right whitespace-nowrap">
                        ${fmt(sectionTotal)}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden divide-y divide-gray-700/40">
        {sections.map((section, idx) => {
          const sectionTotal = section.items.reduce((s, i) => s + (i.line_total || 0), 0);
          const collapsed = collapsedSections.has(section.key);
          return (
            <React.Fragment key={section.key}>
              <button
                onClick={() => onToggleSection(section.key)}
                className={`w-full flex items-center gap-2 px-3 py-2.5 bg-gray-800/50 hover:bg-gray-800/70 transition-colors ${
                  idx > 0 ? 'border-t-2 border-gray-700' : ''
                }`}
              >
                {collapsed
                  ? <ChevronRight className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                  : <ChevronDown className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                }
                <span className="text-sm font-semibold text-blue-400 truncate flex-1 min-w-0 text-left">
                  {section.label}
                </span>
                <span className="text-xs text-gray-500 flex-shrink-0">
                  {section.items.length} item{section.items.length !== 1 ? 's' : ''}
                </span>
                <span className="text-sm font-semibold text-gray-300 flex-shrink-0 ml-1">${fmt(sectionTotal)}</span>
              </button>
              {!collapsed && (
                <>
                  {section.items.map(item => (
                    <MobileGridCard
                      key={item.id}
                      item={item}
                      visibleColumns={visibleColumns}
                      onRowClick={onRowClick}
                    />
                  ))}
                  <div className="px-4 py-3 bg-gray-800/50 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-400">Section Subtotal</span>
                    <span className="text-sm font-bold text-white">${fmt(sectionTotal)}</span>
                  </div>
                </>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

function GridRow({
  item,
  visibleColumns,
  onRowClick,
  selected,
  onToggleSelect,
}: {
  item: GridLineItem;
  visibleColumns: Set<GridColumnKey>;
  onRowClick?: (item: GridLineItem) => void;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const sku = item.products?.sku;
  const manufacturer = item.products?.manufacturers?.name;
  const classColor = item.proposal_classes?.color;
  const isLaborOnly = item.item_type?.toLowerCase() === 'labor';
  const cost = effectiveCost(item);

  return (
    <tr
      className={`border-t border-gray-700/60 transition-colors h-10 ${
        selected ? 'bg-blue-900/20' : 'hover:bg-gray-800/40'
      } ${onRowClick ? 'cursor-pointer' : ''}`}
      onClick={onRowClick ? () => onRowClick(item) : undefined}
    >
      <td
        className="py-2 px-3 w-8"
        onClick={e => { e.stopPropagation(); onToggleSelect(); }}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="w-3.5 h-3.5 rounded border-gray-600 bg-gray-700 text-blue-500 cursor-pointer accent-blue-500"
        />
      </td>
      {visibleColumns.has('manufacturer') && (
        <td
          className="py-2 px-3 text-xs text-gray-400 whitespace-nowrap overflow-hidden text-ellipsis max-w-[150px]"
          title={manufacturer || ''}
        >
          {manufacturer ? (
            <span className="truncate">{manufacturer}</span>
          ) : (
            <span className="text-gray-700">—</span>
          )}
        </td>
      )}
      {visibleColumns.has('sku') && (
        <td
          className="py-2 px-3 text-xs whitespace-nowrap overflow-hidden text-ellipsis max-w-[120px]"
          title={sku || ''}
          onClick={sku && onRowClick ? (e) => { e.stopPropagation(); onRowClick(item); } : undefined}
        >
          {sku ? (
            <span className={`font-mono text-cyan-400 ${onRowClick ? 'hover:text-cyan-300 underline underline-offset-2 decoration-dashed cursor-pointer' : ''}`}>
              {sku}
            </span>
          ) : (
            <span className="text-gray-700">—</span>
          )}
        </td>
      )}
      {visibleColumns.has('description') && (
        <td className="py-2 px-3 text-xs text-white whitespace-nowrap overflow-hidden text-ellipsis max-w-[250px]">
          <div className="flex items-start gap-2 min-w-0">
            {classColor && (
              <span className="mt-0.5 w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: classColor }} />
            )}
            {isLaborOnly ? (
              <div className="flex items-center gap-1.5">
                <Wrench className="w-3 h-3 text-amber-400 flex-shrink-0" />
                <span className="text-gray-300">{item.description}</span>
              </div>
            ) : (
              <span className="text-gray-300">{item.description}</span>
            )}
          </div>
        </td>
      )}
      {visibleColumns.has('roomOrGroup') && (
        <td className="py-2 px-3 text-xs text-gray-400 whitespace-nowrap">
          {item._roomName ? (
            <span>{item._roomName}</span>
          ) : (
            <span className="text-gray-700">—</span>
          )}
        </td>
      )}
      {visibleColumns.has('qty') && (
        <td className="py-2 px-3 text-xs text-gray-300 text-right whitespace-nowrap">
          {isLaborOnly ? (
            <span className="text-gray-700">—</span>
          ) : (
            `${item.quantity}${item.unit ? ` ${item.unit}` : ''}`
          )}
        </td>
      )}
      {visibleColumns.has('cost') && (
        <td className="py-2 px-3 text-xs text-gray-300 text-right whitespace-nowrap">
          {cost != null ? `$${fmt(cost)}` : <span className="text-gray-700">—</span>}
        </td>
      )}
      {visibleColumns.has('price') && (
        <td className="py-2 px-3 text-xs text-gray-300 text-right whitespace-nowrap">
          {isLaborOnly ? (
            <span className="text-gray-700">—</span>
          ) : (
            `$${fmt(item.unit_price)}`
          )}
        </td>
      )}
      {visibleColumns.has('laborPhase') && (
        <td className="py-2 px-3 text-xs text-gray-400 whitespace-nowrap">
          {item.labor_phases?.name ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded border border-gray-600 bg-gray-700/60 text-gray-300 text-[11px]">
              {item.labor_phases.name}
            </span>
          ) : (
            <span className="text-gray-700">—</span>
          )}
        </td>
      )}
      {visibleColumns.has('laborHrs') && (
        <td className="py-2 px-3 text-xs text-gray-300 text-right whitespace-nowrap">
          {item.labor_hours != null && item.labor_hours > 0 ? (
            fmt(item.labor_hours)
          ) : (
            <span className="text-gray-700">—</span>
          )}
        </td>
      )}
      {visibleColumns.has('laborRate') && (
        <td className="py-2 px-3 text-xs text-gray-300 text-right whitespace-nowrap">
          {item.labor_rate != null && item.labor_rate > 0 ? (
            `$${fmt(item.labor_rate)}`
          ) : (
            <span className="text-gray-700">—</span>
          )}
        </td>
      )}
      {visibleColumns.has('laborTotal') && (
        <td className="py-2 px-3 text-xs text-right whitespace-nowrap">
          {item.labor_total != null && item.labor_total > 0 ? (
            <span className="text-white font-semibold">${fmt(item.labor_total)}</span>
          ) : (
            <span className="text-gray-700">—</span>
          )}
        </td>
      )}
      {visibleColumns.has('lineTotal') && (
        <td className="py-2 px-3 text-xs font-bold text-white text-right whitespace-nowrap">
          ${fmt(item.line_total)}
        </td>
      )}
    </tr>
  );
}

function MobileGridCard({
  item,
  visibleColumns,
  onRowClick,
}: {
  item: GridLineItem;
  visibleColumns: Set<GridColumnKey>;
  onRowClick?: (item: GridLineItem) => void;
}) {
  const sku = item.products?.sku;
  const manufacturer = item.products?.manufacturers?.name;
  const classColor = item.proposal_classes?.color;
  const isLaborOnly = item.item_type?.toLowerCase() === 'labor';
  const hasLabor = item.labor_hours != null && item.labor_hours > 0;
  const cost = effectiveCost(item);

  return (
    <div
      className={`px-4 py-3 space-y-1.5 ${onRowClick ? 'cursor-pointer active:bg-gray-800/50' : ''}`}
      onClick={onRowClick ? () => onRowClick(item) : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          {classColor && (
            <span className="mt-1 w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: classColor }} />
          )}
          <div className="min-w-0">
            {isLaborOnly ? (
              <div className="flex items-center gap-1.5">
                <Wrench className="w-3 h-3 text-amber-400 flex-shrink-0" />
                <span className="text-sm text-gray-300 leading-snug">{item.description}</span>
              </div>
            ) : sku ? (
              <>
                <div className="text-sm font-mono text-cyan-400 leading-snug">{sku}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">{item.description}</div>
              </>
            ) : (
              <div className="text-sm text-gray-300 leading-snug">{item.description}</div>
            )}
            {visibleColumns.has('roomOrGroup') && item._roomName && (
              <div className="text-[11px] text-gray-500 mt-0.5">{item._roomName}</div>
            )}
            {visibleColumns.has('manufacturer') && manufacturer && (
              <div className="flex items-center gap-1 mt-0.5">
                <Building2 className="w-3 h-3 text-gray-600" />
                <span className="text-[11px] text-gray-500">{manufacturer}</span>
              </div>
            )}
            {item.labor_phases?.name && (
              <div className="text-[11px] text-gray-500 mt-0.5">{item.labor_phases.name}</div>
            )}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-sm font-semibold text-white">${fmt(item.line_total)}</div>
          {!isLaborOnly && (
            <div className="text-xs text-gray-500">x{item.quantity} @ ${fmt(item.unit_price)}</div>
          )}
          {hasLabor && (
            <div className="flex items-center justify-end gap-1 mt-0.5">
              <Clock className="w-3 h-3 text-amber-400" />
              <span className="text-xs text-amber-400">{fmt(item.labor_hours!)} hrs</span>
            </div>
          )}
          {visibleColumns.has('cost') && cost != null && (
            <div className="text-xs text-gray-600 mt-0.5">Cost: ${fmt(cost)}</div>
          )}
        </div>
      </div>
    </div>
  );
}
