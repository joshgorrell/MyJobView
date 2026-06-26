import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import { ProposalRoom, ProposalLineItem, Product } from '../../lib/types';
import { Plus, GripVertical, Settings, Grid3x3, Calculator, X, RotateCcw, XCircle, AlertTriangle } from 'lucide-react';
import ProposalGridRow from './ProposalGridRow';
import ProposalDetailCard from './ProposalDetailCard';
import ConfirmModal from '../ui/ConfirmModal';
import {
  recordCOAction,
  updateCOTotals,
  loadCOLineItems,
  restoreCOLineItem,
  type COLineItemRecord,
} from '../../lib/coAuditTrail';

interface ProposalBuilderProProps {
  proposalId: string;
  onSave?: () => void;
  changeOrderId?: string;
  onCORefresh?: () => void;
}

interface RoomWithItems extends ProposalRoom {
  line_items: (ProposalLineItem & { products?: Product })[];
}

interface ProductClass {
  id: string;
  name: string;
  color: string;
  sort_order: number;
}

interface LaborPhase {
  id: string;
  name: string;
  default_rate: number;
  sort_order: number;
}

interface ColumnPreferences {
  sku: boolean;
  cost: boolean;
  margin: boolean;
  marginPercent: boolean;
  itemClass: boolean;
  laborPhase: boolean;
  taskNotes: boolean;
  hide: boolean;
}

export default function ProposalBuilderPro({ proposalId, onSave, changeOrderId, onCORefresh }: ProposalBuilderProProps) {
  const isCoMode = !!changeOrderId;

  const [rooms, setRooms] = useState<RoomWithItems[]>([]);
  const [productClasses, setProductClasses] = useState<ProductClass[]>([]);
  const [laborPhases, setLaborPhases] = useState<LaborPhase[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [calculatorMode, setCalculatorMode] = useState<'price' | 'margin'>('price');
  const [coLineItems, setCoLineItems] = useState<COLineItemRecord[]>([]);
  const [restoringItemId, setRestoringItemId] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  const [columnPrefs, setColumnPrefs] = useState<ColumnPreferences>({
    sku: true,
    cost: true,
    margin: true,
    marginPercent: true,
    itemClass: true,
    laborPhase: false,
    taskNotes: false,
    hide: false
  });

  useEffect(() => {
    loadProposalData();
    loadProductClasses();
    loadLaborPhases();
    loadUserPreferences();

    const handleProposalUpdate = (e: CustomEvent) => {
      if (e.detail?.proposalId === proposalId) {
        loadProposalData();
      }
    };

    window.addEventListener('proposal-updated' as any, handleProposalUpdate);
    return () => window.removeEventListener('proposal-updated' as any, handleProposalUpdate);
  }, [proposalId]);

  const refreshCOLineItems = useCallback(async () => {
    if (!changeOrderId) return;
    const items = await loadCOLineItems(changeOrderId);
    setCoLineItems(items);
  }, [changeOrderId]);

  useEffect(() => {
    refreshCOLineItems();
  }, [refreshCOLineItems]);

  async function loadProposalData() {
    try {
      const { data: roomsData, error: roomsError } = await supabase
        .from('proposal_rooms')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('sort_order');

      if (roomsError) throw roomsError;

      const { data: itemsData, error: itemsError } = await supabase
        .from('proposal_line_items')
        .select(`
          *,
          products (*)
        `)
        .eq('proposal_id', proposalId)
        .order('sort_order');

      if (itemsError) throw itemsError;

      const roomsWithItems = (roomsData || []).map(room => ({
        ...room,
        line_items: (itemsData || []).filter(item => item.room_id === room.id)
      }));

      setRooms(roomsWithItems);
    } catch (error) {
      console.error('Error loading proposal data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadProductClasses() {
    const { data } = await supabase
      .from('product_classes')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');

    if (data) setProductClasses(data);
  }

  async function loadLaborPhases() {
    const { data } = await supabase
      .from('labor_phases')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');

    if (data) setLaborPhases(data);
  }

  async function loadUserPreferences() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('user_column_preferences')
      .select('column_settings')
      .eq('user_id', user.id)
      .eq('view_name', 'proposals_pro')
      .maybeSingle();

    if (data?.column_settings) {
      setColumnPrefs(data.column_settings);
    }
  }

  async function saveUserPreferences() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('user_column_preferences')
      .upsert({
        user_id: user.id,
        view_name: 'proposals_pro',
        column_settings: columnPrefs
      }, {
        onConflict: 'user_id,view_name'
      });
  }

  async function recalculateProposal() {
    await supabase.rpc('calculate_proposal_totals', { p_proposal_id: proposalId });
    window.dispatchEvent(new CustomEvent('proposal-updated', { detail: { proposalId } }));
  }

  async function updateLineItem(itemId: string, updates: Partial<ProposalLineItem>) {
    const updatedRooms = rooms.map(room => ({
      ...room,
      line_items: room.line_items.map(item =>
        item.id === itemId ? { ...item, ...updates } : item
      )
    }));

    setRooms(updatedRooms);

    const { error } = await supabase
      .from('proposal_line_items')
      .update(updates)
      .eq('id', itemId);

    if (error) {
      console.error('Error updating line item:', error);
      loadProposalData();
      return;
    }

    if (isCoMode && changeOrderId) {
      const currentItem = rooms.flatMap(r => r.line_items).find(i => i.id === itemId);
      const hasQtyChange = updates.quantity !== undefined;
      const hasPriceChange = updates.unit_price !== undefined;
      const hasLaborChange = updates.labor_total !== undefined || updates.labor_hours !== undefined || updates.labor_rate !== undefined;

      if (currentItem && (hasQtyChange || hasPriceChange || hasLaborChange)) {
        let actionType: 'modify_quantity' | 'modify_price' | 'modify_labor';
        if (hasLaborChange && !hasQtyChange && !hasPriceChange) {
          actionType = 'modify_labor';
        } else if (hasQtyChange) {
          actionType = 'modify_quantity';
        } else {
          actionType = 'modify_price';
        }
        const updatedItem = { ...currentItem, ...updates };
        const origQty = currentItem.quantity || 0;
        const origUp = (currentItem as any).unit_price || 0;
        const origLaborHours = (currentItem as any).labor_hours || 0;
        const origLaborRate = (currentItem as any).labor_rate || 0;
        const origLaborTotal = origLaborHours * origLaborRate;
        const origLineTotal = origQty * origUp;
        const roomName = rooms.find(r => r.line_items.some(i => i.id === itemId))?.name || '';
        const freshRecords = await loadCOLineItems(changeOrderId);
        await recordCOAction(changeOrderId, itemId, actionType, {
          description: updatedItem.description,
          quantity: updatedItem.quantity,
          unit_price: updatedItem.unit_price,
          line_total: updatedItem.line_total,
          labor_total: (updatedItem as any).labor_total ?? 0,
          item_type: (updatedItem as any).item_type || 'material',
          is_taxable: (updatedItem as any).is_taxable ?? true,
          original_quantity: origQty,
          original_unit_price: origUp,
          original_line_total: origLineTotal,
          original_labor_total: origLaborTotal,
        }, roomName, freshRecords);
        await updateCOTotals(changeOrderId, onCORefresh);
        await refreshCOLineItems();
      }
    }

    await recalculateProposal();
  }

  async function deleteLineItem(itemId: string) {
    if (isCoMode && changeOrderId) {
      const item = rooms.flatMap(r => r.line_items).find(i => i.id === itemId);
      if (!item) return;
      const existingCORecord = coLineItems.find(c => c.proposal_line_item_id === itemId);

      if (existingCORecord?.action_type === 'add') {
        async function doRemoveCOAddedItem() {
          await supabase.from('change_order_line_items').delete().eq('id', existingCORecord!.id);
          await supabase.from('proposal_line_items').delete().eq('id', itemId);
          setRooms(rooms.map(room => ({
            ...room,
            line_items: room.line_items.filter(i => i.id !== itemId),
          })));
          await updateCOTotals(changeOrderId!, onCORefresh);
          await refreshCOLineItems();
          await recalculateProposal();
        }
        setConfirmModal({ title: 'Remove Item', message: 'Remove this newly-added item from the change order?', onConfirm: doRemoveCOAddedItem });
        return;
      }

      async function doRemoveCOScopeItem() {
        const roomName = rooms.find(r => r.line_items.some(i => i.id === itemId))?.name || '';
        const freshRecords = await loadCOLineItems(changeOrderId!);
        await recordCOAction(changeOrderId!, itemId, 'remove', {
          description: item!.description,
          quantity: item!.quantity,
          unit_price: item!.unit_price,
          line_total: item!.line_total,
          labor_total: (item as any).labor_total ?? 0,
          is_taxable: (item as any).is_taxable ?? true,
        }, roomName, freshRecords);
        await supabase.from('proposal_line_items').update({ is_hidden: true }).eq('id', itemId);
        setRooms(rooms.map(room => ({
          ...room,
          line_items: room.line_items.map(i => i.id === itemId ? { ...i, is_hidden: true } : i),
        })));
        await updateCOTotals(changeOrderId!, onCORefresh);
        await refreshCOLineItems();
        await recalculateProposal();
      }
      setConfirmModal({ title: 'Remove Item', message: 'Remove this item from the scope? It will be tracked as a removal in the change order.', onConfirm: doRemoveCOScopeItem });
      return;
    }

    async function doDeleteItem() {
      const { error } = await supabase
        .from('proposal_line_items')
        .delete()
        .eq('id', itemId);

      if (error) {
        console.error('Error deleting line item:', error);
        return;
      }

      loadProposalData();
    }
    setConfirmModal({ title: 'Delete Item', message: 'Delete this item?', onConfirm: doDeleteItem });
  }

  async function restoreLineItem(itemId: string) {
    if (!changeOrderId) return;
    const coRecord = coLineItems.find(c => c.proposal_line_item_id === itemId && c.action_type === 'remove');
    if (!coRecord) return;
    setRestoringItemId(itemId);
    try {
      await restoreCOLineItem(changeOrderId, coRecord.id, itemId, onCORefresh);
      setRooms(rooms.map(room => ({
        ...room,
        line_items: room.line_items.map(i => i.id === itemId ? { ...i, is_hidden: false } : i),
      })));
      await refreshCOLineItems();
      await recalculateProposal();
    } catch (err) {
      console.error('Error restoring line item:', err);
    } finally {
      setRestoringItemId(null);
    }
  }

  async function addLineItem(roomId: string) {
    const room = rooms.find(r => r.id === roomId);
    if (!room) return;

    const maxSortOrder = Math.max(...room.line_items.map(i => i.sort_order), 0);

    const { data, error } = await supabase
      .from('proposal_line_items')
      .insert({
        proposal_id: proposalId,
        room_id: roomId,
        description: 'New Item',
        quantity: 1,
        unit: 'ea',
        unit_price: 0,
        cost: 0,
        line_total: 0,
        sort_order: maxSortOrder + 1,
        is_custom: true
      })
      .select(`*, products(*)`)
      .single();

    if (error) {
      console.error('Error adding line item:', error);
      return;
    }

    if (isCoMode && changeOrderId) {
      const roomName = room.name;
      const freshRecords = await loadCOLineItems(changeOrderId);
      await recordCOAction(changeOrderId, data.id, 'add', {
        description: data.description,
        quantity: data.quantity,
        unit_price: data.unit_price,
        line_total: data.line_total,
        labor_total: 0,
        item_type: 'material',
        is_taxable: true,
      }, roomName, freshRecords);
      await updateCOTotals(changeOrderId, onCORefresh);
      await refreshCOLineItems();
    }

    setRooms(rooms.map(r => r.id === roomId ? { ...r, line_items: [...r.line_items, data] } : r));
    await recalculateProposal();
  }

  const selectedItem = rooms
    .flatMap(r => r.line_items)
    .find(item => item.id === selectedItemId);

  const allVisibleItems = rooms.flatMap(r => r.line_items).filter(i => !(i as any).is_hidden);
  const totalCost = allVisibleItems.reduce((sum, item) => sum + ((item.cost || 0) * item.quantity), 0);
  const totalPrice = allVisibleItems.reduce((sum, item) => sum + item.line_total, 0);
  const totalMargin = totalPrice - totalCost;
  const totalMarginPercent = totalPrice > 0 ? (totalMargin / totalPrice) * 100 : 0;

  const coSummary = isCoMode ? {
    added: coLineItems.filter(c => c.action_type === 'add').length,
    removed: coLineItems.filter(c => c.action_type === 'remove').length,
    modified: coLineItems.filter(c => c.action_type.startsWith('modify')).length,
    totalChange: coLineItems.reduce((sum, c) => sum + (c.change_amount || 0), 0),
  } : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-900 text-white">
      {/* Toolbar */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 flex-shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-sm font-semibold flex items-center gap-2 text-gray-300">
            <Grid3x3 className="w-4 h-4 text-blue-400" />
            Pro Grid
          </h2>
          {!isCoMode && (
            <div className="flex items-center gap-1.5 text-xs">
              <Calculator className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-gray-400">Calc:</span>
              <button
                onClick={() => setCalculatorMode('price')}
                className={`px-2 py-0.5 rounded text-xs ${
                  calculatorMode === 'price'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                Price
              </button>
              <button
                onClick={() => setCalculatorMode('margin')}
                className={`px-2 py-0.5 rounded text-xs ${
                  calculatorMode === 'margin'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                Margin %
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setShowColumnSettings(!showColumnSettings);
              if (showColumnSettings) saveUserPreferences();
            }}
            className="px-2.5 py-1.5 bg-gray-700 hover:bg-gray-600 rounded flex items-center gap-1.5 text-xs"
          >
            <Settings className="w-3.5 h-3.5" />
            Columns
          </button>
          {onSave && !isCoMode && (
            <button
              onClick={onSave}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded flex items-center gap-1.5 text-xs"
            >
              Save
            </button>
          )}
        </div>
      </div>

      {/* Column Settings Panel */}
      {showColumnSettings && (
        <div className="bg-gray-800 border-b border-gray-700 px-4 py-2.5 flex-shrink-0">
          <div className="flex flex-wrap gap-4">
            {Object.entries({
              sku: 'SKU',
              cost: 'Cost',
              margin: 'Margin $',
              marginPercent: 'Margin %',
              itemClass: 'Class',
              laborPhase: 'Phase',
              taskNotes: 'Notes',
              hide: 'Hidden'
            }).map(([key, label]) => (
              <label key={key} className="flex items-center gap-1.5 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={columnPrefs[key as keyof ColumnPreferences]}
                  onChange={(e) => setColumnPrefs({
                    ...columnPrefs,
                    [key]: e.target.checked
                  })}
                  className="rounded bg-gray-700 border-gray-600"
                />
                <span className="text-gray-300">{label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* CO Summary Bar */}
      {isCoMode && coSummary && (coSummary.added > 0 || coSummary.removed > 0 || coSummary.modified > 0) && (
        <div className="bg-amber-950/30 border-b border-amber-700/30 px-4 py-2 flex flex-wrap items-center gap-2 sm:gap-4 text-xs flex-shrink-0">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
          <span className="text-amber-300 font-medium">Change Order Edits:</span>
          {coSummary.added > 0 && (
            <span className="text-emerald-400">{coSummary.added} added</span>
          )}
          {coSummary.removed > 0 && (
            <span className="text-red-400">{coSummary.removed} removed</span>
          )}
          {coSummary.modified > 0 && (
            <span className="text-amber-400">{coSummary.modified} modified</span>
          )}
          <span className="sm:ml-auto text-gray-300 font-semibold">
            Change: {coSummary.totalChange >= 0 ? '+' : ''}${coSummary.totalChange.toFixed(2)}
          </span>
        </div>
      )}

      {/* Summary Bar */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs flex-shrink-0">
        <div className="flex flex-wrap items-center gap-3 sm:gap-5">
          <div>
            <span className="text-gray-400">Cost: </span>
            <span className="font-semibold">{formatCurrency(totalCost)}</span>
          </div>
          <div>
            <span className="text-gray-400">Price: </span>
            <span className="font-semibold">{formatCurrency(totalPrice)}</span>
          </div>
          <div>
            <span className="text-gray-400">Margin: </span>
            <span className={`font-semibold ${totalMargin >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              ${totalMargin.toFixed(2)} ({totalMarginPercent.toFixed(1)}%)
            </span>
          </div>
        </div>
        <div className="text-gray-400">
          {allVisibleItems.length} items / {rooms.length} areas
        </div>
      </div>

      {/* Grid */}
      <div
        className="flex-1 overflow-auto"
        style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x pan-y' } as React.CSSProperties}
      >
        <table className="text-sm" style={{ minWidth: '600px' }}>
          <thead className="sticky top-0 bg-gray-800 text-gray-400 border-b border-gray-700 z-20">
            <tr>
              <th className="text-left py-2 px-3 w-10 sticky left-0 z-30 bg-gray-800"></th>
              <th className="text-left py-2 px-3 w-56 sticky left-10 z-30 bg-gray-800 shadow-[2px_0_4px_rgba(0,0,0,0.3)]">Description</th>
              {columnPrefs.sku && <th className="text-left py-2 px-3 w-32">SKU</th>}
              {columnPrefs.itemClass && <th className="text-left py-2 px-3 w-32">Class</th>}
              {columnPrefs.laborPhase && <th className="text-left py-2 px-3 w-32">Phase</th>}
              <th className="text-right py-2 px-3 w-20">Qty</th>
              <th className="text-left py-2 px-3 w-16">Unit</th>
              {columnPrefs.cost && <th className="text-right py-2 px-3 w-24">Cost</th>}
              <th className="text-right py-2 px-3 w-24">Price</th>
              {columnPrefs.margin && <th className="text-right py-2 px-3 w-24">Margin</th>}
              {columnPrefs.marginPercent && <th className="text-right py-2 px-3 w-24">Margin %</th>}
              <th className="text-right py-2 px-3 w-28">Total</th>
              {columnPrefs.hide && <th className="text-center py-2 px-3 w-16">Hide</th>}
              <th className="w-20"></th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((room) => (
              <React.Fragment key={room.id}>
                {/* Room Header Row */}
                <tr className="bg-gray-800 border-t border-gray-700">
                  <td colSpan={100} className="py-2.5 px-3">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-white text-sm">{room.name}</div>
                      <button
                        onClick={() => addLineItem(room.id)}
                        className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        Add Item
                      </button>
                    </div>
                  </td>
                </tr>

                {/* Line Items */}
                {room.line_items.map((item) => {
                  const coRecord = isCoMode ? coLineItems.find(c => c.proposal_line_item_id === item.id) : null;
                  const isRemovedInCO = (item as any).is_hidden && coRecord?.action_type === 'remove';
                  const isAddedInCO = coRecord?.action_type === 'add';
                  const isModifiedInCO = coRecord && coRecord.action_type.startsWith('modify');
                  const isRestoring = restoringItemId === item.id;

                  if (isRemovedInCO) {
                    const partsTotal = item.line_total || 0;
                    const laborTotal = (item as any).labor_total || 0;
                    const negativeAmt = coRecord?.remove_scope === 'parts_only' ? partsTotal : (partsTotal + laborTotal);
                    return (
                      <tr key={item.id} className="border-b border-red-900/30 bg-red-950/20">
                        <td className="py-2 px-3">
                          <XCircle className="w-4 h-4 text-red-500" />
                        </td>
                        <td className="py-2 px-3" colSpan={
                          1 +
                          (columnPrefs.sku ? 1 : 0) +
                          (columnPrefs.itemClass ? 1 : 0) +
                          (columnPrefs.laborPhase ? 1 : 0) +
                          2 +
                          (columnPrefs.cost ? 1 : 0) +
                          1 +
                          (columnPrefs.margin ? 1 : 0) +
                          (columnPrefs.marginPercent ? 1 : 0)
                        }>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-red-400/70 line-through">{item.description}</span>
                            <span className="text-[10px] font-bold px-1 py-0.5 rounded bg-red-900/60 text-red-400">
                              {coRecord?.remove_scope === 'parts_only' ? '−PART' : '−REMOVED'}
                            </span>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right text-red-400 text-sm tabular-nums font-medium">
                          −${negativeAmt.toFixed(2)}
                        </td>
                        {columnPrefs.hide && <td />}
                        <td className="py-2 px-3 text-right">
                          <button
                            onClick={() => restoreLineItem(item.id)}
                            disabled={isRestoring}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {isRestoring
                              ? <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                              : <RotateCcw className="w-3 h-3" />
                            }
                            Restore
                          </button>
                        </td>
                      </tr>
                    );
                  }

                  if ((item as any).is_hidden) return null;

                  return (
                    <ProposalGridRow
                      key={item.id}
                      item={item}
                      columnPrefs={columnPrefs}
                      productClasses={productClasses}
                      laborPhases={laborPhases}
                      calculatorMode={calculatorMode}
                      onUpdate={updateLineItem}
                      onDelete={deleteLineItem}
                      onSelect={setSelectedItemId}
                      isSelected={selectedItemId === item.id}
                      coStatus={isAddedInCO ? 'added' : isModifiedInCO ? 'modified' : undefined}
                    />
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail Card */}
      {selectedItem && (
        <ProposalDetailCard
          item={selectedItem}
          productClasses={productClasses}
          laborPhases={laborPhases}
          onClose={() => setSelectedItemId(null)}
          onUpdate={updateLineItem}
        />
      )}

      <ConfirmModal
        isOpen={confirmModal !== null}
        title={confirmModal?.title ?? ''}
        message={confirmModal?.message ?? ''}
        variant="danger"
        onConfirm={confirmModal?.onConfirm ?? (() => {})}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}
