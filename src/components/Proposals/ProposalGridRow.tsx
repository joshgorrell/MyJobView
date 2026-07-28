import React, { useState, useEffect } from 'react';
import { ProposalLineItem, Product } from '../../lib/types';
import { GripVertical, Trash2, Eye, EyeOff, Info, Package } from 'lucide-react';
import ProductDetailEditModal from './ProductDetailEditModal';
import ConfirmModal from '../ui/ConfirmModal';

interface ProposalGridRowProps {
  item: ProposalLineItem & { products?: Product };
  columnPrefs: {
    sku: boolean;
    cost: boolean;
    margin: boolean;
    marginPercent: boolean;
    itemClass: boolean;
    laborPhase: boolean;
    taskNotes: boolean;
    hide: boolean;
  };
  productClasses: Array<{ id: string; name: string; color: string }>;
  laborPhases: Array<{ id: string; name: string; default_rate: number }>;
  calculatorMode: 'price' | 'margin';
  onUpdate: (itemId: string, updates: Partial<ProposalLineItem>) => void;
  onDelete: (itemId: string) => void;
  onSelect: (itemId: string) => void;
  isSelected: boolean;
  coStatus?: 'added' | 'modified';
}

export default function ProposalGridRow({
  item,
  columnPrefs,
  productClasses,
  laborPhases,
  calculatorMode,
  onUpdate,
  onDelete,
  onSelect,
  isSelected,
  coStatus
}: ProposalGridRowProps) {
  const [localItem, setLocalItem] = useState(item);
  const [showProductModal, setShowProductModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  useEffect(() => {
    setLocalItem(item);
  }, [item]);

  function handleFieldChange(field: keyof ProposalLineItem, value: any) {
    const updated = { ...localItem, [field]: value };

    if (field === 'quantity' || field === 'unit_price') {
      updated.line_total = updated.quantity * updated.unit_price;
    }

    if (field === 'cost' && calculatorMode === 'price') {
      updated.line_total = updated.quantity * updated.unit_price;
    }

    if (field === 'unit_price' && calculatorMode === 'margin') {
      const margin = updated.unit_price - (updated.cost || 0);
      const marginPercent = updated.unit_price > 0 ? (margin / updated.unit_price) * 100 : 0;
    }

    setLocalItem(updated);
  }

  function handleBlur(field: keyof ProposalLineItem) {
    if (localItem[field] !== item[field]) {
      const updates: Partial<ProposalLineItem> = {
        [field]: localItem[field]
      };

      if (field === 'quantity' || field === 'unit_price' || field === 'cost') {
        updates.line_total = localItem.quantity * localItem.unit_price;
      }

      onUpdate(item.id, updates);
    }
  }

  function handleMarginPercentChange(marginPercent: number) {
    const cost = localItem.cost || 0;
    if (marginPercent >= 100) {
      marginPercent = 99;
    }
    const newPrice = cost / (1 - marginPercent / 100);
    const updated = {
      ...localItem,
      unit_price: newPrice,
      line_total: localItem.quantity * newPrice
    };
    setLocalItem(updated);
    onUpdate(item.id, {
      unit_price: newPrice,
      line_total: localItem.quantity * newPrice
    });
  }

  const margin = localItem.unit_price - (localItem.cost || 0);
  const marginPercent = localItem.unit_price > 0 ? (margin / localItem.unit_price) * 100 : 0;

  const classColor = productClasses.find(c => c.name === (localItem as any).item_class)?.color || '#6b7280';

  const rowBg = coStatus === 'added'
    ? 'border-emerald-900/30 bg-emerald-950/15'
    : coStatus === 'modified'
      ? 'border-amber-900/30 bg-amber-950/15'
      : 'border-gray-800';

  return (
    <>
    <ConfirmModal
      isOpen={!!confirmModal}
      title={confirmModal?.title || ''}
      message={confirmModal?.message || ''}
      variant="danger"
      onConfirm={() => confirmModal?.onConfirm()}
      onCancel={() => setConfirmModal(null)}
    />
    <tr
      className={`group border-b hover:bg-gray-800/50 transition-colors ${rowBg} ${
        isSelected ? 'bg-blue-900/20' : ''
      } ${(localItem as any).is_hidden ? 'opacity-50' : ''} ${(localItem as any).is_customer_supplied ? 'bg-amber-950/10' : ''}`}
      onClick={() => onSelect(item.id)}
    >
      <td className="py-2 px-3 sticky left-0 z-10 bg-gray-900 group-hover:bg-gray-800/50">
        <button className="text-gray-500 hover:text-gray-300 cursor-grab">
          <GripVertical className="w-4 h-4" />
        </button>
      </td>

      <td className="py-2 px-3 sticky left-10 z-10 bg-gray-900 shadow-[2px_0_4px_rgba(0,0,0,0.3)] group-hover:bg-gray-800/50">
        <div className="flex items-center gap-1.5">
          {coStatus && (
            <div
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                coStatus === 'added' ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
              title={coStatus === 'added' ? 'Added in this change order' : 'Modified in this change order'}
            />
          )}
          <input
            type="text"
            value={localItem.description}
            onChange={(e) => handleFieldChange('description', e.target.value)}
            onBlur={() => handleBlur('description')}
            className="w-full bg-transparent border-none text-white focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-2 py-1"
            onClick={(e) => e.stopPropagation()}
          />
          {coStatus === 'added' && (
            <span className="text-xs text-emerald-400 font-normal whitespace-nowrap">+New</span>
          )}
          {coStatus === 'modified' && (
            <span className="text-xs text-amber-400 font-normal whitespace-nowrap">Edited</span>
          )}
          {(localItem as any).is_customer_supplied && (
            <span className="inline-flex items-center gap-1 text-xs text-amber-400 font-medium whitespace-nowrap bg-amber-900/20 px-1.5 py-0.5 rounded" title="Customer Supplied — no charge">
              <Package className="w-3 h-3" />
              Cust. Supplied
            </span>
          )}
        </div>
      </td>

      {columnPrefs.sku && (
        <td className="py-2 px-3">
          {localItem.product_id ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowProductModal(true);
              }}
              className="text-blue-400 hover:text-blue-300 text-xs underline decoration-dotted"
            >
              {localItem.products?.sku || '-'}
            </button>
          ) : (
            <div className="text-gray-400 text-xs">-</div>
          )}
        </td>
      )}

      {columnPrefs.itemClass && (
        <td className="py-2 px-3">
          <select
            value={(localItem as any).item_class || ''}
            onChange={(e) => {
              handleFieldChange('item_class' as any, e.target.value);
              handleBlur('item_class' as any);
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-gray-800 border border-gray-700 text-white text-xs rounded px-2 py-1 focus:ring-1 focus:ring-blue-500"
          >
            <option value="">None</option>
            {productClasses.map((pc) => (
              <option key={pc.id} value={pc.name}>
                {pc.name}
              </option>
            ))}
          </select>
        </td>
      )}

      {columnPrefs.laborPhase && (
        <td className="py-2 px-3">
          <select
            value={(localItem as any).labor_phase || ''}
            onChange={(e) => {
              handleFieldChange('labor_phase' as any, e.target.value);
              handleBlur('labor_phase' as any);
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-gray-800 border border-gray-700 text-white text-xs rounded px-2 py-1 focus:ring-1 focus:ring-blue-500"
          >
            <option value="">None</option>
            {laborPhases.map((lp) => (
              <option key={lp.id} value={lp.name}>
                {lp.name}
              </option>
            ))}
          </select>
        </td>
      )}

      <td className="py-2 px-3">
        <input
          type="number"
          value={localItem.quantity}
          onChange={(e) => handleFieldChange('quantity', parseFloat(e.target.value) || 0)}
          onBlur={() => handleBlur('quantity')}
          onClick={(e) => e.stopPropagation()}
          className="w-full bg-transparent border-none text-white text-right focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-2 py-1"
          min="0"
          step="0.01"
        />
      </td>

      <td className="py-2 px-3">
        <input
          type="text"
          value={localItem.unit}
          onChange={(e) => handleFieldChange('unit', e.target.value)}
          onBlur={() => handleBlur('unit')}
          onClick={(e) => e.stopPropagation()}
          className="w-full bg-transparent border-none text-white focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-2 py-1"
        />
      </td>

      {columnPrefs.cost && (
        <td className="py-2 px-3">
          {(localItem as any).is_customer_supplied ? (
            <span className="text-amber-400 text-right block text-sm">—</span>
          ) : (
            <input
              type="number"
              value={localItem.cost || 0}
              onChange={(e) => handleFieldChange('cost', parseFloat(e.target.value) || 0)}
              onBlur={() => handleBlur('cost')}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-transparent border-none text-white text-right focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-2 py-1"
              min="0"
              step="0.01"
            />
          )}
        </td>
      )}

      <td className="py-2 px-3">
        {(localItem as any).is_customer_supplied ? (
          <span className="text-amber-400 text-right block text-sm">—</span>
        ) : (
          <input
            type="number"
            value={localItem.unit_price}
            onChange={(e) => handleFieldChange('unit_price', parseFloat(e.target.value) || 0)}
            onBlur={() => handleBlur('unit_price')}
            onClick={(e) => e.stopPropagation()}
            className="w-full bg-transparent border-none text-white text-right focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-2 py-1"
            min="0"
            step="0.01"
          />
        )}
      </td>

      {columnPrefs.margin && (
        <td className="py-2 px-3">
          {(localItem as any).is_customer_supplied ? (
            <span className="text-amber-400 text-right block text-sm">—</span>
          ) : (
            <div className={`text-right ${margin >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              ${margin.toFixed(2)}
            </div>
          )}
        </td>
      )}

      {columnPrefs.marginPercent && (
        <td className="py-2 px-3">
          {(localItem as any).is_customer_supplied ? (
            <span className="text-amber-400 text-right block text-sm">—</span>
          ) : (
            <input
              type="number"
              value={marginPercent.toFixed(1)}
              onChange={(e) => handleMarginPercentChange(parseFloat(e.target.value) || 0)}
              onClick={(e) => e.stopPropagation()}
              className={`w-full bg-transparent border-none text-right focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-2 py-1 ${
                marginPercent >= 0 ? 'text-green-400' : 'text-red-400'
              }`}
              min="0"
              max="99"
              step="0.1"
            />
          )}
        </td>
      )}

      <td className="py-2 px-3 text-right font-semibold">
        {(localItem as any).is_customer_supplied ? (
          <span className="text-amber-400">${(parseFloat(localItem.labor_total || 0)).toFixed(2)}</span>
        ) : (
          <span>${localItem.line_total.toFixed(2)}</span>
        )}
      </td>

      {columnPrefs.hide && (
        <td className="py-2 px-3 text-center">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onUpdate(item.id, { is_hidden: !(localItem as any).is_hidden } as any);
            }}
            className="text-gray-400 hover:text-white"
          >
            {(localItem as any).is_hidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </td>
      )}

      <td className="py-2 px-3">
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelect(item.id);
            }}
            className="text-gray-400 hover:text-blue-400 p-1"
            title="View details"
          >
            <Info className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setConfirmModal({
                title: 'Delete Item',
                message: 'Delete this item?',
                onConfirm: () => {
                  setConfirmModal(null);
                  onDelete(item.id);
                },
              });
            }}
            className="text-gray-400 hover:text-red-400 p-1"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
    {showProductModal && localItem.product_id && (
      <ProductDetailEditModal
        productId={localItem.product_id}
        proposalLineItemId={item.id}
        onClose={() => setShowProductModal(false)}
        onUpdate={() => window.location.reload()}
      />
    )}
  </>
  );
}
