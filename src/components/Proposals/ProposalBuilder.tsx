import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { ProposalRoom, ProposalLineItem, Product, ProposalWithDetails } from '../../lib/types';
import { Plus, Save, Send, Eye, ChevronDown, ChevronRight, GripVertical, Trash2, Copy, BarChart3, Layers, Indent, Outdent, GitBranch, RotateCcw, ListChecks, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import ProductSelector from './ProductSelector';
import ProposalSummary from './ProposalSummary';
import ProposalLineItemModal from './ProposalLineItemModal';
import ClassSummaryReport from './ClassSummaryReport';
import { ProposalRevisionSelector } from './ProposalRevisionSelector';
import BulkUpdateConfirmationModal from './BulkUpdateConfirmationModal';
import ConfirmModal from '../ui/ConfirmModal';
import {
  recordCOAction,
  updateCOTotals,
  loadCOLineItems,
  restoreCOLineItem,
  type COLineItemRecord,
} from '../../lib/coAuditTrail';

interface ProposalBuilderProps {
  proposalId: string;
  onSave?: () => void;
  onRevisionChange?: (newProposalId: string) => void;
  changeOrderId?: string;
  onCORefresh?: () => void;
  inline?: boolean;
}

interface ProposalClass {
  id: string;
  name: string;
  color: string;
}

export default function ProposalBuilder({ proposalId, onSave, onRevisionChange, changeOrderId, onCORefresh, inline }: ProposalBuilderProps) {
  const { profile } = useAuth();
  const isCoMode = !!changeOrderId;
  const [proposal, setProposal] = useState<ProposalWithDetails | null>(null);
  const [rooms, setRooms] = useState<(ProposalRoom & { line_items: ProposalLineItem[]; expanded: boolean })[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [coLineItems, setCoLineItems] = useState<COLineItemRecord[]>([]);
  const [showProductSelector, setShowProductSelector] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [draggedRoomId, setDraggedRoomId] = useState<string | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [showCopyToModal, setShowCopyToModal] = useState(false);
  const [editingItem, setEditingItem] = useState<ProposalLineItem | null>(null);
  const [showClassSummary, setShowClassSummary] = useState(false);
  const [showClassesOnScreen, setShowClassesOnScreen] = useState(false);
  const [classes, setClasses] = useState<ProposalClass[]>([]);
  const [editingDescriptionId, setEditingDescriptionId] = useState<string | null>(null);
  const [editingDescriptionValue, setEditingDescriptionValue] = useState('');
  const [pendingBulkUpdate, setPendingBulkUpdate] = useState<{
    itemId: string;
    productId: string;
    fieldName: 'unit_price' | 'cost';
    oldValue: number;
    newValue: number;
    description: string;
    instanceCount: number;
  } | null>(null);
  const [bulkUpdateLoading, setBulkUpdateLoading] = useState(false);
  const [collapsedParentIds, setCollapsedParentIds] = useState<Set<string>>(new Set());
  const [showCOSummary, setShowCOSummary] = useState(false);
  const [restoringItemId, setRestoringItemId] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  function getDisplayTitle(title: string) {
    // Remove "Proposal for" prefix for internal display
    return title.replace(/^Proposal for\s+/i, '');
  }

  function toggleParentCollapse(itemId: string) {
    const newSet = new Set(collapsedParentIds);
    if (newSet.has(itemId)) {
      newSet.delete(itemId);
    } else {
      newSet.add(itemId);
    }
    setCollapsedParentIds(newSet);
  }

  function organizeItemsWithAccessories(items: ProposalLineItem[]): ProposalLineItem[] {
    const itemMap = new Map<string, ProposalLineItem>();
    const rootItems: ProposalLineItem[] = [];

    items.forEach(item => {
      itemMap.set(item.id, { ...item, accessories: [] });
    });

    items.forEach(item => {
      const itemWithAccessories = itemMap.get(item.id);
      if (!itemWithAccessories) return;

      if (item.parent_item_id) {
        const parent = itemMap.get(item.parent_item_id);
        if (parent) {
          parent.accessories = parent.accessories || [];
          parent.accessories.push(itemWithAccessories);
        } else {
          rootItems.push(itemWithAccessories);
        }
      } else {
        rootItems.push(itemWithAccessories);
      }
    });

    return rootItems;
  }

  const refreshCOLineItems = useCallback(async () => {
    if (!changeOrderId) return;
    const items = await loadCOLineItems(changeOrderId);
    setCoLineItems(items);
  }, [changeOrderId]);

  useEffect(() => {
    console.log('ProposalBuilder mounted with proposalId:', proposalId);
    loadProposal();
  }, [proposalId]);

  useEffect(() => {
    refreshCOLineItems();
  }, [refreshCOLineItems]);

  async function loadProposal() {
    try {
      setLoading(true);

      const { data: proposalData, error: proposalError } = await supabase
        .from('proposals')
        .select(`
          *,
          contacts:contacts!proposals_contact_id_fkey(*),
          profiles!proposals_created_by_fkey(*),
          leads(*)
        `)
        .eq('id', proposalId)
        .maybeSingle();

      if (proposalError) throw proposalError;
      if (!proposalData) throw new Error('Proposal not found');

      const [roomsRes, lineItemsRes, settingsRes, classesRes] = await Promise.all([
        supabase
          .from('proposal_rooms')
          .select('*')
          .eq('proposal_id', proposalId)
          .order('sort_order'),
        supabase
          .from('proposal_line_items')
          .select(`
            *,
            products(*, manufacturers(id, name)),
            proposal_classes(id, name, color)
          `)
          .eq('proposal_id', proposalId)
          .order('sort_order'),
        supabase
          .from('proposal_settings')
          .select('show_classes_in_builder, show_classes_in_pdf')
          .maybeSingle(),
        supabase
          .from('proposal_classes')
          .select('id, name, color')
          .eq('is_active', true)
          .order('name')
      ]);

      if (roomsRes.error) throw roomsRes.error;
      if (lineItemsRes.error) throw lineItemsRes.error;

      const roomsWithItems = (roomsRes.data || []).map(room => ({
        ...room,
        line_items: (lineItemsRes.data || []).filter(item => item.room_id === room.id),
        expanded: true
      }));

      setClasses(classesRes.data || []);

      const showClasses = proposalData.show_classes_on_screen !== null
        ? proposalData.show_classes_on_screen
        : (settingsRes.data?.show_classes_in_builder || false);

      setShowClassesOnScreen(showClasses);

      setProposal(proposalData as ProposalWithDetails);
      setRooms(roomsWithItems);

      // Recalculate totals to ensure they're current
      const { error: calcError } = await supabase.rpc('calculate_proposal_totals', {
        p_proposal_id: proposalId
      });

      if (calcError) {
        console.error('Error calculating totals:', calcError);
      } else {
        // Fetch the updated proposal with calculated totals
        const { data: updatedProposal } = await supabase
          .from('proposals')
          .select('*')
          .eq('id', proposalId)
          .single();

        if (updatedProposal) {
          setProposal(prev => prev ? { ...prev, ...updatedProposal } : null);
        }
      }
    } catch (error) {
      console.error('Error loading proposal:', error);
    } finally {
      setLoading(false);
    }
  }

  async function addRoom() {
    if (!proposal) return;

    try {
      // Get the organization_id from the proposal
      const { data: proposalData, error: proposalError } = await supabase
        .from('proposals')
        .select('organization_id')
        .eq('id', proposalId)
        .single();

      if (proposalError) throw proposalError;

      const newRoom = {
        proposal_id: proposalId,
        organization_id: proposalData.organization_id,
        name: `Area ${rooms.length + 1}`,
        description: '',
        sort_order: rooms.length
      };

      const { data, error } = await supabase
        .from('proposal_rooms')
        .insert(newRoom)
        .select()
        .single();

      if (error) throw error;

      setRooms([...rooms, { ...data, line_items: [], expanded: true }]);

      setTimeout(() => {
        const inputs = document.querySelectorAll('input[placeholder="Area name"]');
        const lastInput = inputs[inputs.length - 1] as HTMLInputElement;
        if (lastInput) {
          lastInput.focus();
          lastInput.select();
        }
      }, 100);
    } catch (error) {
      console.error('Error adding room:', error);
    }
  }

  async function updateRoom(roomId: string, updates: Partial<ProposalRoom>) {
    try {
      const { error } = await supabase
        .from('proposal_rooms')
        .update(updates)
        .eq('id', roomId);

      if (error) throw error;

      setRooms(rooms.map(room =>
        room.id === roomId ? { ...room, ...updates } : room
      ));
    } catch (error) {
      console.error('Error updating room:', error);
    }
  }

  async function deleteRoom(roomId: string) {
    async function doDeleteRoom() {
      try {
        const { error } = await supabase
          .from('proposal_rooms')
          .delete()
          .eq('id', roomId);

        if (error) throw error;

        setRooms(rooms.filter(room => room.id !== roomId));
        await recalculateProposal();
      } catch (error) {
        console.error('Error deleting room:', error);
      }
    }
    setConfirmModal({ title: 'Delete Room', message: 'Delete this room and all its line items?', onConfirm: doDeleteRoom });
  }

  function handleRoomDragStart(roomId: string) {
    setDraggedRoomId(roomId);
  }

  function handleRoomDragOver(e: React.DragEvent, targetRoomId: string) {
    e.preventDefault();
    if (!draggedRoomId || draggedRoomId === targetRoomId) return;

    const draggedIndex = rooms.findIndex(r => r.id === draggedRoomId);
    const targetIndex = rooms.findIndex(r => r.id === targetRoomId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const reorderedRooms = [...rooms];
    const [draggedRoom] = reorderedRooms.splice(draggedIndex, 1);
    reorderedRooms.splice(targetIndex, 0, draggedRoom);

    setRooms(reorderedRooms);
  }

  async function handleRoomDragEnd() {
    if (!draggedRoomId) return;

    try {
      const updates = rooms.map((room, index) => ({
        id: room.id,
        sort_order: index
      }));

      for (const update of updates) {
        await supabase
          .from('proposal_rooms')
          .update({ sort_order: update.sort_order })
          .eq('id', update.id);
      }
    } catch (error) {
      console.error('Error updating room order:', error);
    } finally {
      setDraggedRoomId(null);
    }
  }

  function handleRoomNameKeyDown(e: React.KeyboardEvent, roomId: string) {
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      addRoom();
    }
  }

  async function addLineItem(roomId: string, product: Product | null, customData?: Partial<ProposalLineItem>) {
    if (!proposal) return;

    const newItem: any = {
      proposal_id: proposalId,
      room_id: roomId,
      product_id: product?.id || null,
      description: customData?.description || product?.name || '',
      quantity: customData?.quantity || 1,
      unit: customData?.unit || product?.unit || 'each',
      unit_price: customData?.unit_price || product?.unit_price || 0,
      cost: customData?.cost || product?.cost || 0,
      line_total: 0,
      sort_order: rooms.find(r => r.id === roomId)?.line_items.length || 0,
      is_custom: !product,
      class_id: customData?.class_id || (product as any)?.default_class_id || null
    };

    newItem.line_total = newItem.quantity * newItem.unit_price;

    try {
      const { data, error } = await supabase
        .from('proposal_line_items')
        .insert(newItem)
        .select(`
          *,
          products(*)
        `)
        .single();

      if (error) throw error;

      setRooms(rooms.map(room => {
        if (room.id === roomId) {
          return {
            ...room,
            line_items: [...room.line_items, data]
          };
        }
        return room;
      }));

      if (changeOrderId) {
        const roomName = rooms.find(r => r.id === roomId)?.name || '';
        const freshRecords = await loadCOLineItems(changeOrderId);
        await recordCOAction(changeOrderId, data.id, 'add', {
          description: data.description,
          quantity: data.quantity,
          unit_price: data.unit_price,
          line_total: data.line_total,
          labor_total: data.labor_total ?? 0,
          item_type: data.item_type || 'material',
          is_taxable: data.is_taxable ?? true,
        }, roomName, freshRecords);
        await updateCOTotals(changeOrderId, onCORefresh);
        await refreshCOLineItems();
      }

      await recalculateProposal();
    } catch (error) {
      console.error('Error adding line item:', error);
    }
  }

  async function countMatchingProducts(productId: string): Promise<number> {
    try {
      const { count, error } = await supabase
        .from('proposal_line_items')
        .select('*', { count: 'exact', head: true })
        .eq('proposal_id', proposalId)
        .eq('product_id', productId);

      if (error) throw error;
      return count || 0;
    } catch (error) {
      console.error('Error counting matching products:', error);
      return 0;
    }
  }

  async function updateLineItem(itemId: string, updates: Partial<ProposalLineItem>) {
    try {
      const updatedItem = { ...updates };
      const currentItem = rooms.flatMap(r => r.line_items).find(i => i.id === itemId);

      if (!currentItem) {
        console.error('Item not found:', itemId);
        return;
      }

      // Check if this is a price/cost change for a catalog item
      const isPriceChange = updates.unit_price !== undefined && updates.unit_price !== currentItem.unit_price;
      const isCostChange = updates.cost !== undefined && updates.cost !== currentItem.cost;
      const hasPriceOrCostChange = isPriceChange || isCostChange;
      const isProductItem = currentItem.product_id !== null;

      if (hasPriceOrCostChange && isProductItem) {
        // Count how many times this product appears in the proposal
        const instanceCount = await countMatchingProducts(currentItem.product_id);

        if (instanceCount > 1) {
          // Show bulk update confirmation modal
          const fieldName = isPriceChange ? 'unit_price' : 'cost';
          const oldValue = isPriceChange ? currentItem.unit_price : (currentItem.cost || 0);
          const newValue = isPriceChange ? updates.unit_price! : updates.cost!;

          setPendingBulkUpdate({
            itemId,
            productId: currentItem.product_id,
            fieldName,
            oldValue,
            newValue,
            description: currentItem.description,
            instanceCount
          });
          return; // Don't proceed with update yet
        }
      }

      // Always calculate line_total when quantity or unit_price changes
      if (updates.quantity !== undefined || updates.unit_price !== undefined) {
        const quantity = updates.quantity ?? currentItem.quantity;
        const unitPrice = updates.unit_price ?? currentItem.unit_price;
        updatedItem.line_total = quantity * unitPrice;
      }

      const { error } = await supabase
        .from('proposal_line_items')
        .update(updatedItem)
        .eq('id', itemId);

      if (error) throw error;

      const updatedCurrentItem = { ...currentItem, ...updatedItem };

      const hasQtyChange = updates.quantity !== undefined;
      const hasPriceChange = updates.unit_price !== undefined;
      const hasLaborChange = updates.labor_total !== undefined || updates.labor_hours !== undefined || updates.labor_rate !== undefined;

      if (changeOrderId && (hasQtyChange || hasPriceChange || hasLaborChange)) {
        let actionType: 'modify_quantity' | 'modify_price' | 'modify_labor';
        if (hasLaborChange && !hasQtyChange && !hasPriceChange) {
          actionType = 'modify_labor';
        } else if (hasQtyChange) {
          actionType = 'modify_quantity';
        } else {
          actionType = 'modify_price';
        }
        const origQty = currentItem.quantity || 0;
        const origUp = currentItem.unit_price || 0;
        const origLaborTotal = currentItem.labor_total ?? 0;
        const origLineTotal = origQty * origUp;
        const roomName = rooms.find(r => r.line_items.some(i => i.id === itemId))?.name || '';
        const freshRecords = await loadCOLineItems(changeOrderId);
        await recordCOAction(changeOrderId, itemId, actionType, {
          description: updatedCurrentItem.description,
          quantity: updatedCurrentItem.quantity,
          unit_price: updatedCurrentItem.unit_price,
          line_total: updatedCurrentItem.line_total,
          labor_total: updatedCurrentItem.labor_total ?? 0,
          item_type: updatedCurrentItem.item_type || 'material',
          is_taxable: updatedCurrentItem.is_taxable ?? true,
          original_quantity: origQty,
          original_unit_price: origUp,
          original_line_total: origLineTotal,
          original_labor_total: origLaborTotal,
        }, roomName, freshRecords);
        await updateCOTotals(changeOrderId, onCORefresh);
        await refreshCOLineItems();
      }

      // Update state with recalculated line_total
      setRooms(rooms.map(room => ({
        ...room,
        line_items: room.line_items.map(item => {
          if (item.id === itemId) {
            const newItem = { ...item, ...updatedItem };
            // Ensure line_total is always set correctly
            if (updates.quantity !== undefined || updates.unit_price !== undefined) {
              newItem.line_total = (updates.quantity ?? item.quantity) * (updates.unit_price ?? item.unit_price);
            }
            return newItem;
          }
          return item;
        })
      })));

      await recalculateProposal();
    } catch (error) {
      console.error('Error updating line item:', error);
    }
  }

  function startEditingDescription(item: ProposalLineItem) {
    setEditingDescriptionId(item.id);
    setEditingDescriptionValue(item.description);
  }

  async function saveDescriptionEdit(itemId: string) {
    if (!editingDescriptionValue.trim()) {
      alert('Description cannot be empty');
      return;
    }

    await updateLineItem(itemId, { description: editingDescriptionValue });
    setEditingDescriptionId(null);
    setEditingDescriptionValue('');
  }

  function cancelDescriptionEdit() {
    setEditingDescriptionId(null);
    setEditingDescriptionValue('');
  }

  function handleDescriptionKeyDown(e: React.KeyboardEvent, itemId: string) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveDescriptionEdit(itemId);
    } else if (e.key === 'Escape') {
      cancelDescriptionEdit();
    }
  }

  async function deleteLineItem(itemId: string) {
    if (isCoMode) {
      const item = rooms.flatMap(r => r.line_items).find(i => i.id === itemId);
      if (!item) return;
      const existingCORecord = coLineItems.find(c => c.proposal_line_item_id === itemId);
      if (existingCORecord?.action_type === 'add') {
        async function doRemoveCOAddedItem() {
          try {
            await supabase.from('change_order_line_items').delete().eq('id', existingCORecord!.id);
            await supabase.from('proposal_line_items').delete().eq('id', itemId);
            setRooms(rooms.map(room => ({
              ...room,
              line_items: room.line_items.filter(i => i.id !== itemId),
            })));
            await updateCOTotals(changeOrderId!, onCORefresh);
            await refreshCOLineItems();
            await recalculateProposal();
          } catch (err) {
            console.error('Error removing CO-added item:', err);
          }
        }
        setConfirmModal({ title: 'Remove Item', message: 'Remove this newly-added item from the change order?', onConfirm: doRemoveCOAddedItem });
        return;
      }
      async function doRemoveCOScopeItem() {
        try {
          const roomName = rooms.find(r => r.line_items.some(i => i.id === itemId))?.name || '';
          const freshRecords = await loadCOLineItems(changeOrderId!);
          await recordCOAction(changeOrderId!, itemId, 'remove', {
            description: item!.description,
            quantity: item!.quantity,
            unit_price: item!.unit_price,
            line_total: item!.line_total,
            labor_total: item!.labor_total ?? 0,
            is_taxable: item!.is_taxable ?? true,
          }, roomName, freshRecords);
          await supabase.from('proposal_line_items').update({ is_hidden: true }).eq('id', itemId);
          setRooms(rooms.map(room => ({
            ...room,
            line_items: room.line_items.map(i => i.id === itemId ? { ...i, is_hidden: true } : i),
          })));
          await updateCOTotals(changeOrderId!, onCORefresh);
          await refreshCOLineItems();
          await recalculateProposal();
        } catch (err) {
          console.error('Error recording CO removal:', err);
        }
      }
      setConfirmModal({ title: 'Remove Item', message: 'Remove this item from the scope? It will be tracked as a removal in the change order.', onConfirm: doRemoveCOScopeItem });
      return;
    }

    async function doDeleteLineItem() {
      try {
        const { error } = await supabase
          .from('proposal_line_items')
          .delete()
          .eq('id', itemId);

        if (error) throw error;

        setRooms(rooms.map(room => ({
          ...room,
          line_items: room.line_items.filter(item => item.id !== itemId)
        })));

        await recalculateProposal();
      } catch (error) {
        console.error('Error deleting line item:', error);
      }
    }
    setConfirmModal({ title: 'Delete Item', message: 'Delete this line item?', onConfirm: doDeleteLineItem });
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

  function toggleItemSelection(itemId: string) {
    const newSelection = new Set(selectedItemIds);
    if (newSelection.has(itemId)) {
      newSelection.delete(itemId);
    } else {
      newSelection.add(itemId);
    }
    console.log('Toggle item selection:', itemId, 'New size:', newSelection.size, 'Selected IDs:', Array.from(newSelection));
    setSelectedItemIds(newSelection);
  }

  function toggleRoomSelection(roomId: string) {
    const room = rooms.find(r => r.id === roomId);
    if (!room) return;

    const roomItemIds = room.line_items.map(item => item.id);
    const allSelected = roomItemIds.every(id => selectedItemIds.has(id));

    const newSelection = new Set(selectedItemIds);
    if (allSelected) {
      roomItemIds.forEach(id => newSelection.delete(id));
    } else {
      roomItemIds.forEach(id => newSelection.add(id));
    }
    setSelectedItemIds(newSelection);
  }

  async function deleteSelectedItems() {
    if (selectedItemIds.size === 0) return;
    async function doDeleteSelectedItems() {
      if (isCoMode) {
        try {
          for (const itemId of Array.from(selectedItemIds)) {
            await deleteLineItem(itemId);
          }
          setSelectedItemIds(new Set());
        } catch (error) {
          console.error('Error removing selected items in CO mode:', error);
        }
        return;
      }

      try {
        const { error } = await supabase
          .from('proposal_line_items')
          .delete()
          .in('id', Array.from(selectedItemIds));

        if (error) throw error;

        setRooms(rooms.map(room => ({
          ...room,
          line_items: room.line_items.filter(item => !selectedItemIds.has(item.id))
        })));

        setSelectedItemIds(new Set());
        await recalculateProposal();
      } catch (error) {
        console.error('Error deleting selected items:', error);
      }
    }
    setConfirmModal({ title: `${isCoMode ? 'Remove' : 'Delete'} Items`, message: `${isCoMode ? 'Remove' : 'Delete'} ${selectedItemIds.size} selected item(s)?${isCoMode ? ' Removals will be tracked in the change order.' : ''}`, onConfirm: doDeleteSelectedItems });
  }

  async function copyItemsToRooms(targetRoomIds: string[]) {
    console.log('copyItemsToRooms called with:', targetRoomIds, 'Selected items:', selectedItemIds.size);
    if (selectedItemIds.size === 0 || targetRoomIds.length === 0) return;

    try {
      const selectedItems = rooms
        .flatMap(room => room.line_items)
        .filter(item => selectedItemIds.has(item.id));

      console.log('Copying', selectedItems.length, 'items to', targetRoomIds.length, 'rooms');

      for (const targetRoomId of targetRoomIds) {
        const targetRoom = rooms.find(r => r.id === targetRoomId);
        if (!targetRoom) continue;

        const maxSortOrder = targetRoom.line_items.length;

        for (let i = 0; i < selectedItems.length; i++) {
          const item = selectedItems[i];
          const newItem = {
            proposal_id: proposalId,
            room_id: targetRoomId,
            product_id: item.product_id,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unit_price: item.unit_price,
            cost: item.cost,
            line_total: item.line_total,
            sort_order: maxSortOrder + i,
            is_custom: item.is_custom,
            class_id: item.class_id
          };

          const { data, error } = await supabase
            .from('proposal_line_items')
            .insert(newItem)
            .select(`
              *,
              products(*)
            `)
            .single();

          if (error) throw error;

          setRooms(prevRooms => prevRooms.map(room => {
            if (room.id === targetRoomId) {
              return {
                ...room,
                line_items: [...room.line_items, data]
              };
            }
            return room;
          }));
        }
      }

      await recalculateProposal();
      setSelectedItemIds(new Set());
      setShowCopyToModal(false);
    } catch (error) {
      console.error('Error copying items:', error);
    }
  }

  async function handleBulkNestItems() {
    if (selectedItemIds.size === 0) return;

    try {
      // Get all selected items and sort by room and sort_order
      const allItems = rooms.flatMap(room =>
        room.line_items.map(item => ({ ...item, roomSortOrder: room.sort_order }))
      );

      const selectedItems = allItems
        .filter(item => selectedItemIds.has(item.id))
        .sort((a, b) => {
          if (a.room_id !== b.room_id) {
            return a.roomSortOrder - b.roomSortOrder;
          }
          return a.sort_order - b.sort_order;
        });

      if (selectedItems.length === 0) return;

      const firstSelectedItem = selectedItems[0];

      // Find the item immediately above the first selected item in the same room
      const itemsInSameRoom = allItems
        .filter(item => item.room_id === firstSelectedItem.room_id)
        .sort((a, b) => a.sort_order - b.sort_order);

      const firstSelectedIndex = itemsInSameRoom.findIndex(item => item.id === firstSelectedItem.id);

      // If there's no item above (it's first in the list), skip silently
      if (firstSelectedIndex <= 0) {
        setSelectedItemIds(new Set());
        return;
      }

      const targetParent = itemsInSameRoom[firstSelectedIndex - 1];

      // Validate: target parent must not be nested (only top-level items can be parents)
      if (targetParent.parent_item_id) {
        alert('Cannot nest under a nested item. Only top-level items can be parents.');
        return;
      }

      // Validate: none of the selected items should have children
      const itemsWithChildren = selectedItems.filter(item =>
        allItems.some(i => i.parent_item_id === item.id)
      );

      if (itemsWithChildren.length > 0) {
        alert('Cannot nest items that have children. Please unnest their children first.');
        return;
      }

      // Update all selected items to nest under the target parent
      const { error } = await supabase
        .from('proposal_line_items')
        .update({ parent_item_id: targetParent.id })
        .in('id', Array.from(selectedItemIds));

      if (error) throw error;

      // Reload the proposal to refresh the data
      await loadProposal();
      setSelectedItemIds(new Set());
    } catch (error) {
      console.error('Error nesting items:', error);
      alert('Failed to nest items. Please try again.');
    }
  }

  async function handleBulkUnnestItems() {
    if (selectedItemIds.size === 0) return;

    try {
      // Get all selected items that are nested
      const selectedItems = rooms
        .flatMap(room => room.line_items)
        .filter(item => selectedItemIds.has(item.id) && item.parent_item_id);

      if (selectedItems.length === 0) {
        setSelectedItemIds(new Set());
        return;
      }

      // Update all selected nested items to remove their parent
      const { error } = await supabase
        .from('proposal_line_items')
        .update({ parent_item_id: null })
        .in('id', selectedItems.map(item => item.id));

      if (error) throw error;

      // Reload the proposal to refresh the data
      await loadProposal();
      setSelectedItemIds(new Set());
    } catch (error) {
      console.error('Error unnesting items:', error);
      alert('Failed to unnest items. Please try again.');
    }
  }

  async function handleLineItemSave(itemId: string, updates: Partial<ProposalLineItem>) {
    try {
      const currentItem = rooms.flatMap(r => r.line_items).find(i => i.id === itemId);

      const { error } = await supabase
        .from('proposal_line_items')
        .update(updates)
        .eq('id', itemId);

      if (error) throw error;

      const updatedItem = currentItem ? { ...currentItem, ...updates } : updates;

      if (changeOrderId && currentItem) {
        const hasQtyChange = updates.quantity !== undefined && updates.quantity !== currentItem.quantity;
        const hasPriceChange = updates.unit_price !== undefined && updates.unit_price !== currentItem.unit_price;
        const hasLaborChange = (updates.labor_total !== undefined && updates.labor_total !== currentItem.labor_total)
          || (updates.labor_hours !== undefined && updates.labor_hours !== currentItem.labor_hours)
          || (updates.labor_rate !== undefined && updates.labor_rate !== currentItem.labor_rate)
          || (updates.labor_phase_id !== undefined && updates.labor_phase_id !== currentItem.labor_phase_id);

        if (hasQtyChange || hasPriceChange || hasLaborChange) {
          let actionType: 'modify_quantity' | 'modify_price' | 'modify_labor';
          if (hasLaborChange && !hasQtyChange && !hasPriceChange) {
            actionType = 'modify_labor';
          } else if (hasQtyChange) {
            actionType = 'modify_quantity';
          } else {
            actionType = 'modify_price';
          }
          const roomName = rooms.find(r => r.line_items.some(i => i.id === itemId))?.name || '';
          const freshRecords = await loadCOLineItems(changeOrderId);

          const newQty = (updates.quantity ?? currentItem.quantity);
          const newPrice = (updates.unit_price ?? currentItem.unit_price);
          const newLaborTotal = updates.labor_total ?? (
            (updates.labor_hours ?? currentItem.labor_hours ?? 0) * (updates.labor_rate ?? currentItem.labor_rate ?? 0)
          ) ?? currentItem.labor_total ?? 0;
          const newLineTotal = newQty * newPrice;

          await recordCOAction(changeOrderId, itemId, actionType, {
            description: updatedItem.description as string,
            quantity: newQty,
            unit_price: newPrice,
            line_total: newLineTotal,
            labor_total: newLaborTotal,
            labor_hours: (updates.labor_hours ?? currentItem.labor_hours) ?? undefined,
            labor_rate: (updates.labor_rate ?? currentItem.labor_rate) ?? undefined,
            labor_phase_id: (updates.labor_phase_id !== undefined ? updates.labor_phase_id : currentItem.labor_phase_id) ?? null,
            item_type: (updatedItem.item_type as string) || 'material',
            is_taxable: (updatedItem.is_taxable as boolean) ?? true,
          }, roomName, freshRecords);
          await updateCOTotals(changeOrderId, onCORefresh);
          await refreshCOLineItems();
        }
      }

      setRooms(rooms.map(room => ({
        ...room,
        line_items: room.line_items.map(item =>
          item.id === itemId ? { ...item, ...updates } : item
        )
      })));

      await recalculateProposal();
      setEditingItem(null);
    } catch (error) {
      console.error('Error saving line item:', error);
    }
  }

  async function handleSaveToMaster(productId: string, updates: Partial<Product>) {
    try {
      const { error } = await supabase
        .from('products')
        .update(updates)
        .eq('id', productId);

      if (error) throw error;
    } catch (error) {
      console.error('Error saving to master product:', error);
    }
  }

  async function handleUpdateAllInstances(productId: string, updates: Partial<ProposalLineItem>) {
    try {
      const { error } = await supabase
        .from('proposal_line_items')
        .update(updates)
        .eq('proposal_id', proposalId)
        .eq('product_id', productId);

      if (error) throw error;

      setRooms(rooms.map(room => ({
        ...room,
        line_items: room.line_items.map(item =>
          item.product_id === productId ? { ...item, ...updates } : item
        )
      })));

      await recalculateProposal();
      setEditingItem(null);
    } catch (error) {
      console.error('Error updating all instances:', error);
    }
  }

  async function handleSubstituteProduct(oldProductId: string | null, newProduct: Product, replaceAll: boolean) {
    try {
      if (!editingItem) return;

      const laborTotal = (newProduct.default_labor_hours || 0) * editingItem.quantity * (editingItem.labor_rate || 0);
      const updates: Partial<ProposalLineItem> = {
        product_id: newProduct.id,
        description: newProduct.name,
        unit_price: newProduct.unit_price || newProduct.our_price || 0,
        cost: newProduct.cost || 0,
        unit: newProduct.unit || 'each',
        item_type: newProduct.item_type || null,
        labor_hours: newProduct.default_labor_hours || null,
        labor_total: laborTotal || null,
        labor_phase_id: newProduct.labor_phase_id || null,
        is_taxable: newProduct.is_taxable !== undefined ? newProduct.is_taxable : true,
        class_id: newProduct.class_id || null,
      };

      if (replaceAll && oldProductId) {
        const { error } = await supabase
          .from('proposal_line_items')
          .update(updates)
          .eq('proposal_id', proposalId)
          .eq('product_id', oldProductId);

        if (error) throw error;

        setRooms(rooms.map(room => ({
          ...room,
          line_items: room.line_items.map(item =>
            item.product_id === oldProductId
              ? { ...item, ...updates, line_total: item.quantity * (updates.unit_price || 0) }
              : item
          )
        })));
      } else {
        const lineTotal = editingItem.quantity * (updates.unit_price || 0);
        const { error } = await supabase
          .from('proposal_line_items')
          .update({ ...updates, line_total: lineTotal })
          .eq('id', editingItem.id);

        if (error) throw error;

        setRooms(rooms.map(room => ({
          ...room,
          line_items: room.line_items.map(item =>
            item.id === editingItem.id
              ? { ...item, ...updates, line_total: lineTotal }
              : item
          )
        })));
      }

      await recalculateProposal();
      setEditingItem(null);
    } catch (error) {
      console.error('Error substituting product:', error);
      alert('Failed to substitute product. Please try again.');
    }
  }

  async function toggleClassVisibility() {
    try {
      const newValue = !showClassesOnScreen;

      const { error } = await supabase
        .from('proposals')
        .update({ show_classes_on_screen: newValue })
        .eq('id', proposalId);

      if (error) throw error;
      setShowClassesOnScreen(newValue);
    } catch (error) {
      console.error('Error toggling class visibility:', error);
    }
  }

  function groupItemsByClass(items: ProposalLineItem[]) {
    const grouped = new Map<string, ProposalLineItem[]>();

    items.forEach(item => {
      const classKey = item.class_id || 'no-class';
      if (!grouped.has(classKey)) {
        grouped.set(classKey, []);
      }
      grouped.get(classKey)!.push(item);
    });

    return grouped;
  }

  function getClassName(classId: string | null): { name: string; color: string } {
    if (!classId) return { name: 'Uncategorized', color: '#6B7280' };
    const cls = classes.find(c => c.id === classId);
    return cls ? { name: cls.name, color: cls.color } : { name: 'Uncategorized', color: '#6B7280' };
  }

  async function recalculateProposal() {
    if (!proposal) return;

    try {
      // Call the database function to calculate all totals correctly
      // This includes modifiers, tax environment rules, and deposit calculations
      const { error: calcError } = await supabase.rpc('calculate_proposal_totals', {
        p_proposal_id: proposalId
      });

      if (calcError) throw calcError;

      // Fetch the updated proposal data
      const { data: updatedProposal, error: fetchError } = await supabase
        .from('proposals')
        .select('*')
        .eq('id', proposalId)
        .single();

      if (fetchError) throw fetchError;

      if (updatedProposal) {
        setProposal(prev => prev ? { ...prev, ...updatedProposal } : null);
      }
    } catch (error) {
      console.error('Error recalculating proposal:', error);
    }
  }

  function toggleRoomExpanded(roomId: string) {
    setRooms(rooms.map(room =>
      room.id === roomId ? { ...room, expanded: !room.expanded } : room
    ));
  }

  async function handleBulkUpdateSingle() {
    if (!pendingBulkUpdate) return;

    setBulkUpdateLoading(true);
    try {
      const currentItem = rooms.flatMap(r => r.line_items).find(i => i.id === pendingBulkUpdate.itemId);
      if (!currentItem) throw new Error('Item not found');

      const updates: Partial<ProposalLineItem> = {
        [pendingBulkUpdate.fieldName]: pendingBulkUpdate.newValue
      };

      // Calculate line_total if unit_price is being changed
      if (pendingBulkUpdate.fieldName === 'unit_price') {
        updates.line_total = currentItem.quantity * pendingBulkUpdate.newValue;
      }

      const { error } = await supabase
        .from('proposal_line_items')
        .update(updates)
        .eq('id', pendingBulkUpdate.itemId);

      if (error) throw error;

      // Update local state
      setRooms(rooms.map(room => ({
        ...room,
        line_items: room.line_items.map(item => {
          if (item.id === pendingBulkUpdate.itemId) {
            return { ...item, ...updates };
          }
          return item;
        })
      })));

      await recalculateProposal();
      setPendingBulkUpdate(null);
    } catch (error) {
      console.error('Error updating single item:', error);
      alert('Failed to update item. Please try again.');
    } finally {
      setBulkUpdateLoading(false);
    }
  }

  async function handleBulkUpdateAll() {
    if (!pendingBulkUpdate) return;

    setBulkUpdateLoading(true);
    try {
      const updates: Partial<ProposalLineItem> = {
        [pendingBulkUpdate.fieldName]: pendingBulkUpdate.newValue
      };

      // If updating unit_price, we need to recalculate line_total for each item
      // However, since each item might have different quantities, we'll do this in a second pass
      const { error } = await supabase
        .from('proposal_line_items')
        .update(updates)
        .eq('proposal_id', proposalId)
        .eq('product_id', pendingBulkUpdate.productId);

      if (error) throw error;

      // If we updated unit_price, we need to recalculate line_total for each affected item
      if (pendingBulkUpdate.fieldName === 'unit_price') {
        // Get all affected items to recalculate their line_total
        const affectedItems = rooms.flatMap(r => r.line_items).filter(
          item => item.product_id === pendingBulkUpdate.productId
        );

        for (const item of affectedItems) {
          const newLineTotal = item.quantity * pendingBulkUpdate.newValue;
          await supabase
            .from('proposal_line_items')
            .update({ line_total: newLineTotal })
            .eq('id', item.id);
        }
      }

      // Update local state for all matching items
      setRooms(rooms.map(room => ({
        ...room,
        line_items: room.line_items.map(item => {
          if (item.product_id === pendingBulkUpdate.productId) {
            const updatedItem = { ...item, ...updates };
            if (pendingBulkUpdate.fieldName === 'unit_price') {
              updatedItem.line_total = item.quantity * pendingBulkUpdate.newValue;
            }
            return updatedItem;
          }
          return item;
        })
      })));

      await recalculateProposal();
      setPendingBulkUpdate(null);
    } catch (error) {
      console.error('Error updating all instances:', error);
      alert('Failed to update all instances. Please try again.');
    } finally {
      setBulkUpdateLoading(false);
    }
  }

  function handleBulkUpdateCancel() {
    setPendingBulkUpdate(null);
  }

  function renderLineItemRow(item: ProposalLineItem, depth: number = 0) {
    const hasAccessories = item.accessories && item.accessories.length > 0;
    const isCollapsed = collapsedParentIds.has(item.id);
    const displayMode = item.display_mode || 'itemized';

    const shouldShowAccessories = hasAccessories && displayMode === 'itemized' && !isCollapsed;

    const bundleTotal = hasAccessories && displayMode === 'bundle'
      ? (item.line_total || 0) + item.accessories.reduce((sum, acc) => sum + (acc.line_total || 0), 0)
      : item.line_total;

    const coRecord = isCoMode ? coLineItems.find(c => c.proposal_line_item_id === item.id) : null;
    const isRemovedInCO = item.is_hidden && coRecord?.action_type === 'remove';
    const isAddedInCO = coRecord?.action_type === 'add';
    const isModifiedInCO = coRecord && (coRecord.action_type === 'modify_quantity' || coRecord.action_type === 'modify_price' || coRecord.action_type === 'modify_labor');
    const isRestoring = restoringItemId === item.id;

    if (isRemovedInCO) {
      const partsTotal = item.line_total || 0;
      const laborTotal = item.labor_total || 0;
      const negativeAmt = coRecord?.remove_scope === 'parts_only' ? partsTotal : (partsTotal + laborTotal);
      return (
        <tr key={item.id} className="border-b border-red-900/30 bg-red-950/20">
          <td className="py-2 px-2" style={{ paddingLeft: `${8 + depth * 24}px` }}>
            <XCircle size={14} className="text-red-500" />
          </td>
          <td className="py-2 px-2 hidden sm:table-cell">
            <span className="text-[10px] font-bold px-1 py-0.5 rounded bg-red-900/60 text-red-400">
              {coRecord?.remove_scope === 'parts_only' ? '−PART' : '−REMOVED'}
            </span>
          </td>
          <td className="py-2 px-2" colSpan={3}>
            <span className="text-sm text-red-400/70 line-through">{item.description}</span>
          </td>
          <td className="py-2 px-2 text-right text-red-400 text-sm tabular-nums font-medium">
            −${negativeAmt.toFixed(2)}
          </td>
          <td className="py-2 px-2 text-right">
            <button
              onClick={() => restoreLineItem(item.id)}
              disabled={isRestoring}
              title="Restore this item — undo the removal"
              className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors disabled:opacity-50"
            >
              {isRestoring
                ? <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                : <RotateCcw size={11} />
              }
              Restore
            </button>
          </td>
        </tr>
      );
    }

    if (item.is_hidden) return null;

    return (
      <React.Fragment key={item.id}>
        <tr className={`border-b ${
          isAddedInCO
            ? 'border-emerald-900/30 bg-emerald-950/15'
            : isModifiedInCO
              ? 'border-amber-900/30 bg-amber-950/15'
              : 'border-gray-700'
        }`}>
          <td className="py-2 px-2" style={{ paddingLeft: `${8 + depth * 24}px` }}>
            <div className="flex items-center gap-1">
              {isCoMode && (isAddedInCO || isModifiedInCO) && (
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isAddedInCO ? 'bg-emerald-400' : 'bg-amber-400'}`} title={isAddedInCO ? 'Added in this change order' : 'Modified in this change order'} />
              )}
              {hasAccessories && (
                <button
                  onClick={() => toggleParentCollapse(item.id)}
                  className="text-gray-400 hover:text-white flex-shrink-0 mr-1"
                  title={isCollapsed ? 'Expand accessories' : 'Collapse accessories'}
                >
                  {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                </button>
              )}
              <input
                type="checkbox"
                checked={selectedItemIds.has(item.id)}
                onChange={() => toggleItemSelection(item.id)}
                className="rounded border-gray-600 text-blue-600 focus:ring-blue-500"
              />
            </div>
          </td>
          <td className="py-2 px-2 hidden sm:table-cell">
            {item.products?.sku ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingItem(item);
                }}
                className="text-xs text-blue-400 hover:text-blue-300 hover:underline focus:outline-none"
                title="Click to view/edit full details"
              >
                {item.products.sku}
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingItem(item);
                }}
                className="text-xs text-gray-500 hover:text-gray-400 hover:underline focus:outline-none"
                title="Click to view/edit full details"
              >
                Custom
              </button>
            )}
          </td>
          <td className="py-2 px-2">
            {editingDescriptionId === item.id ? (
              <input
                type="text"
                value={editingDescriptionValue}
                onChange={(e) => setEditingDescriptionValue(e.target.value)}
                onKeyDown={(e) => handleDescriptionKeyDown(e, item.id)}
                onBlur={() => saveDescriptionEdit(item.id)}
                autoFocus
                className="w-full bg-gray-900 border border-blue-500 text-white px-2 py-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            ) : (
              <div>
                <button
                  onClick={() => startEditingDescription(item)}
                  className="w-full text-left text-white hover:text-blue-400 focus:outline-none px-2 py-1 rounded hover:bg-gray-900"
                  title="Click to edit description"
                >
                  {item.description}
                  {isAddedInCO && <span className="ml-2 text-xs text-emerald-400 font-normal">+New</span>}
                  {isModifiedInCO && <span className="ml-2 text-xs text-amber-400 font-normal">Edited</span>}
                </button>
                {hasAccessories && displayMode === 'collapsed' && isCollapsed && (
                  <div className="text-xs text-gray-500 mt-1 px-2">
                    Includes: {item.accessories.map(acc => acc.description).join(', ')}
                  </div>
                )}
              </div>
            )}
          </td>
          <td className="py-2 px-2">
            <input
              type="number"
              value={item.quantity}
              onChange={(e) => updateLineItem(item.id, { quantity: parseFloat(e.target.value) || 0 })}
              className="w-full bg-transparent border-none text-white text-right focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-1"
              min="0"
              step="0.01"
            />
          </td>
          <td className="py-2 px-2 text-gray-400 text-right text-xs hidden sm:table-cell">{item.unit}</td>
          <td className="py-2 px-2">
            <input
              type="number"
              value={item.unit_price}
              onChange={(e) => updateLineItem(item.id, { unit_price: parseFloat(e.target.value) || 0 })}
              className="w-full bg-transparent border-none text-white text-right focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-1"
              min="0"
              step="0.01"
            />
          </td>
          <td className="py-2 px-2 text-right text-white font-semibold">
            ${(bundleTotal || 0).toFixed(2)}
          </td>
        </tr>

        {shouldShowAccessories && item.accessories.map(accessory => renderLineItemRow(accessory, depth + 1))}
      </React.Fragment>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">Loading proposal...</div>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <div className="text-gray-400 text-sm">
          {isCoMode ? 'Could not load the linked proposal. The proposal may have been deleted or you may not have access.' : 'Proposal not found'}
        </div>
        <button
          onClick={() => loadProposal()}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded-lg transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  console.log('ProposalBuilder render - selectedItemIds:', selectedItemIds, 'size:', selectedItemIds.size);

  return (
    <div className={`flex flex-col lg:flex-row ${inline && !isCoMode ? 'h-auto' : 'h-auto lg:h-[calc(100vh-4rem)]'}`}>
      <div className="flex-1 p-3 sm:p-4 lg:p-6">
        <div className="max-w-7xl mx-auto">
          {isCoMode && (() => {
            const liveChangeAmount = coLineItems.reduce((sum, i) => sum + (i.change_amount || 0), 0);
            const isPositive = liveChangeAmount > 0;
            const isNegative = liveChangeAmount < 0;
            const fmt = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);
            const addedCount = coLineItems.filter(i => i.action_type === 'add').length;
            const removedCount = coLineItems.filter(i => i.action_type === 'remove').length;
            const modifiedCount = coLineItems.filter(i => ['modify_quantity','modify_price','modify_labor'].includes(i.action_type)).length;
            return (
              <div className="mb-4">
                <div className="flex items-center justify-end gap-3 px-3 py-2 bg-amber-900/40 border border-amber-600/50 rounded-lg flex-wrap gap-y-2">
                  <div className="flex items-center gap-3">
                    {coLineItems.length > 0 && (
                      <>
                        <div className="flex items-center gap-1.5">
                          <span className="text-gray-400 text-xs">Delta:</span>
                          <span className={`font-bold tabular-nums text-sm ${isPositive ? 'text-emerald-400' : isNegative ? 'text-red-400' : 'text-gray-300'}`}>
                            {isPositive ? '+' : ''}{fmt(liveChangeAmount)}
                          </span>
                        </div>
                        <span className="text-gray-600">|</span>
                        <button
                          onClick={() => setShowCOSummary(v => !v)}
                          className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-800/50 hover:bg-amber-700/60 border border-amber-600/40 text-amber-200 text-xs rounded-md transition-colors"
                        >
                          <ListChecks size={13} />
                          {showCOSummary ? 'Hide' : 'View'} Changes ({coLineItems.length})
                        </button>
                      </>
                    )}
                    {coLineItems.length === 0 && (
                      <span className="text-amber-500/60 text-xs">No changes yet</span>
                    )}
                  </div>
                </div>
                {showCOSummary && coLineItems.length > 0 && (
                  <div className="mt-1 border border-amber-600/30 rounded-lg bg-gray-900/60 overflow-hidden">
                    <div className="px-3 py-2 bg-amber-900/30 border-b border-amber-600/20 flex items-center justify-between">
                      <span className="text-amber-300 text-xs font-semibold uppercase tracking-wide">Change Summary</span>
                      <div className="flex items-center gap-3 text-xs text-gray-400">
                        {addedCount > 0 && <span className="text-emerald-400">+{addedCount} added</span>}
                        {removedCount > 0 && <span className="text-red-400">-{removedCount} removed</span>}
                        {modifiedCount > 0 && <span className="text-amber-400">{modifiedCount} modified</span>}
                      </div>
                    </div>
                    <div className="divide-y divide-gray-700/40">
                      {coLineItems.map(item => {
                        const isAdd = item.action_type === 'add';
                        const isRemove = item.action_type === 'remove';
                        const delta = item.change_amount || 0;
                        return (
                          <div key={item.id} className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-gray-800/40">
                            <div className="flex items-center gap-2 min-w-0">
                              {isAdd && <span className="flex-shrink-0 px-1.5 py-0.5 bg-emerald-900/50 text-emerald-400 text-[10px] font-semibold rounded border border-emerald-700/40">Added</span>}
                              {isRemove && <span className="flex-shrink-0 px-1.5 py-0.5 bg-red-900/50 text-red-400 text-[10px] font-semibold rounded border border-red-700/40">Removed</span>}
                              {item.action_type === 'modify_labor' && <span className="flex-shrink-0 px-1.5 py-0.5 bg-blue-900/50 text-blue-400 text-[10px] font-semibold rounded border border-blue-700/40">Labor</span>}
                              {(item.action_type === 'modify_quantity' || item.action_type === 'modify_price') && <span className="flex-shrink-0 px-1.5 py-0.5 bg-amber-900/50 text-amber-400 text-[10px] font-semibold rounded border border-amber-700/40">Modified</span>}
                              <span className="text-gray-200 text-xs truncate">{item.product_name}</span>
                              {item.room_name && <span className="text-gray-500 text-xs flex-shrink-0 hidden sm:inline">· {item.room_name}</span>}
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0 text-xs tabular-nums">
                              {!isAdd && item.original_total != null && (
                                <span className="text-gray-500 line-through hidden sm:inline">{fmt((item.original_total || 0) + (item.original_labor_total || 0))}</span>
                              )}
                              {!isRemove && (
                                <span className="text-gray-300">{fmt((item.new_total || 0))}</span>
                              )}
                              <span className={`font-semibold min-w-[60px] text-right ${delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                                {delta > 0 ? '+' : ''}{fmt(delta)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="px-3 py-2 bg-gray-800/40 border-t border-gray-700/40 flex items-center justify-between">
                      <span className="text-gray-400 text-xs">Total change</span>
                      <span className={`font-bold text-sm tabular-nums ${isPositive ? 'text-emerald-400' : isNegative ? 'text-red-400' : 'text-gray-300'}`}>
                        {isPositive ? '+' : ''}{fmt(liveChangeAmount)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
          <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl font-bold text-white mb-1 leading-snug">{getDisplayTitle(proposal.title)}</h1>
              <div className="text-xs sm:text-sm text-gray-400">
                {proposal.proposal_number} • {proposal.contacts?.contact_name}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {onRevisionChange && (
                <ProposalRevisionSelector
                  proposalId={proposalId}
                  currentRevisionName={proposal.revision_name}
                  isRevision={proposal.is_revision || false}
                  onRevisionChange={onRevisionChange}
                />
              )}
              {(() => {
                console.log('Render toolbar - selectedItemIds.size:', selectedItemIds.size);
                return selectedItemIds.size > 0 ? (
                  <>
                    <span className="text-sm text-gray-400">
                      {selectedItemIds.size} item{selectedItemIds.size !== 1 ? 's' : ''} selected
                    </span>
                    {(() => {
                      const allItems = rooms.flatMap(r => r.line_items);
                      const selectedItems = allItems.filter(item => selectedItemIds.has(item.id));
                      const hasNestedItems = selectedItems.some(item => item.parent_item_id);
                      console.log('Button logic - hasNestedItems:', hasNestedItems, 'selectedItems:', selectedItems.length);

                      return hasNestedItems ? (
                        <button
                          onClick={handleBulkUnnestItems}
                          className="px-3 py-2 text-xs sm:text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center gap-1.5"
                          title="Remove nesting from selected items"
                        >
                          <Outdent size={14} />
                          <span className="hidden xs:inline">Unnest</span>
                        </button>
                      ) : (
                        <button
                          onClick={handleBulkNestItems}
                          className="px-3 py-2 text-xs sm:text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-1.5"
                          title="Nest selected items under the item above"
                        >
                          <Indent size={14} />
                          <span className="hidden xs:inline">Nest</span>
                        </button>
                      );
                    })()}
                    <button
                      onClick={() => {
                        console.log('Copy button clicked, selected items:', selectedItemIds.size);
                        setShowCopyToModal(true);
                      }}
                      className="px-3 py-2 text-xs sm:text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-1.5"
                    >
                      <Copy size={14} />
                      <span>Copy to...</span>
                    </button>
                    <button
                      onClick={deleteSelectedItems}
                      className="px-3 py-2 text-xs sm:text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center gap-1.5"
                    >
                      <Trash2 size={14} />
                      <span className="hidden xs:inline">Delete</span>
                    </button>
                  </>
                ) : null;
              })()}
            </div>
          </div>

          <div className="space-y-4">
            {rooms.map((room, index) => {
              const roomTotal = room.line_items.reduce((sum, item) => sum + (item.line_total || 0), 0);
              return (
              <div
                key={room.id}
                className={`bg-gray-800 rounded-lg border ${
                  draggedRoomId === room.id ? 'border-blue-500 opacity-50' : 'border-gray-700'
                }`}
                draggable
                onDragStart={() => handleRoomDragStart(room.id)}
                onDragOver={(e) => handleRoomDragOver(e, room.id)}
                onDragEnd={handleRoomDragEnd}
              >
                <div className="flex items-center gap-2 p-4 border-b border-gray-700">
                  <button
                    onClick={() => toggleRoomExpanded(room.id)}
                    className="text-gray-400 hover:text-white flex-shrink-0"
                  >
                    {room.expanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                  </button>

                  <div className="flex-shrink-0 text-gray-400 hover:text-gray-300 cursor-grab active:cursor-grabbing p-1" title="Drag to reorder">
                    <GripVertical size={20} />
                  </div>

                  <input
                    type="text"
                    value={room.name}
                    onChange={(e) => updateRoom(room.id, { name: e.target.value })}
                    onKeyDown={(e) => handleRoomNameKeyDown(e, room.id)}
                    className="flex-1 bg-transparent border-none text-white font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1"
                    placeholder="Area name"
                    title="Press Tab to add new area"
                  />

                  <span className="text-sm font-bold text-gray-200 flex-shrink-0 px-2">
                    ${roomTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>

                  <button
                    onClick={() => deleteRoom(room.id)}
                    className="text-gray-400 hover:text-red-400 flex-shrink-0"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>

                {room.expanded && (
                  <div className="p-4">
                    <textarea
                      value={room.description || ''}
                      onChange={(e) => updateRoom(room.id, { description: e.target.value })}
                      placeholder="Scope of work for this room..."
                      className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white text-sm mb-4"
                      rows={2}
                    />

                    <div className="-mx-4 px-4 sm:mx-0 sm:px-0">
                      <table className="min-w-full">
                        <thead className="text-xs text-gray-400 border-b border-gray-700">
                          <tr>
                            <th className="text-left py-2 px-2 w-8">
                              <input
                                type="checkbox"
                                checked={room.line_items.length > 0 && room.line_items.every(item => selectedItemIds.has(item.id))}
                                onChange={() => toggleRoomSelection(room.id)}
                                className="rounded border-gray-600 text-blue-600 focus:ring-blue-500"
                              />
                            </th>
                            <th className="text-left py-2 px-2 w-20 hidden sm:table-cell">SKU</th>
                            <th className="text-left py-2 px-2">Description</th>
                            <th className="text-right py-2 px-2 w-16">Qty</th>
                            <th className="text-right py-2 px-2 w-16 hidden sm:table-cell">Unit</th>
                            <th className="text-right py-2 px-2 w-24">Price</th>
                            <th className="text-right py-2 px-2 w-24">Total</th>
                          </tr>
                        </thead>
                        <tbody className="text-sm">
                          {!showClassesOnScreen ? (
                            organizeItemsWithAccessories(room.line_items).map(item => renderLineItemRow(item, 0))
                          ) : (
                            Array.from(groupItemsByClass(room.line_items)).map(([classId, items]) => {
                              const classInfo = getClassName(classId === 'no-class' ? null : classId);
                              return (
                                <React.Fragment key={classId}>
                                  <tr className="bg-gray-900/50">
                                    <td colSpan={7} className="py-2 px-2">
                                      <div className="flex items-center gap-2">
                                        <div
                                          className="w-3 h-3 rounded"
                                          style={{ backgroundColor: classInfo.color }}
                                        />
                                        <span className="font-semibold text-gray-300">{classInfo.name}</span>
                                      </div>
                                    </td>
                                  </tr>
                                  {organizeItemsWithAccessories(items).map(item => renderLineItemRow(item, 1))}
                                </React.Fragment>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>

                    <button
                      onClick={() => {
                        setSelectedRoomId(room.id);
                        setShowProductSelector(true);
                      }}
                      className="mt-4 flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm"
                    >
                      <Plus size={16} />
                      Add Product
                    </button>
                  </div>
                )}
              </div>
            );
            })}

            <button
              onClick={addRoom}
              className="w-full py-3 border-2 border-dashed border-gray-600 rounded-lg text-gray-400 hover:text-white hover:border-gray-500 flex flex-col items-center justify-center gap-1"
              title="Click to add area, or press Tab in any area name field"
            >
              <div className="flex items-center gap-2">
                <Plus size={20} />
                <span>Add Area</span>
              </div>
              <span className="text-xs text-gray-500">or press Tab in area name</span>
            </button>
          </div>
        </div>
      </div>

      {(!inline || isCoMode) && <ProposalSummary proposal={proposal} onSave={onSave} changeOrderMode={isCoMode} />}

      {showProductSelector && selectedRoomId && (
        <ProductSelector
          onSelect={(product) => {
            addLineItem(selectedRoomId, product);
            setShowProductSelector(false);
            setSelectedRoomId(null);
          }}
          onClose={() => {
            setShowProductSelector(false);
            setSelectedRoomId(null);
          }}
        />
      )}

      {showCopyToModal && (
        <CopyToModal
          rooms={rooms}
          onCopy={copyItemsToRooms}
          onClose={() => setShowCopyToModal(false)}
        />
      )}

      {editingItem && (
        <ProposalLineItemModal
          item={editingItem}
          proposalId={proposalId}
          onSave={(updates) => handleLineItemSave(editingItem.id, updates)}
          onSaveToMaster={handleSaveToMaster}
          onUpdateAllInstances={handleUpdateAllInstances}
          onSubstituteProduct={handleSubstituteProduct}
          onClose={() => setEditingItem(null)}
        />
      )}

      {showClassSummary && (
        <ClassSummaryReport
          proposalId={proposalId}
          rooms={rooms}
          onClose={() => setShowClassSummary(false)}
        />
      )}

      {pendingBulkUpdate && (
        <BulkUpdateConfirmationModal
          itemDescription={pendingBulkUpdate.description}
          fieldName={pendingBulkUpdate.fieldName}
          oldValue={pendingBulkUpdate.oldValue}
          newValue={pendingBulkUpdate.newValue}
          instanceCount={pendingBulkUpdate.instanceCount}
          onUpdateSingle={handleBulkUpdateSingle}
          onUpdateAll={handleBulkUpdateAll}
          onCancel={handleBulkUpdateCancel}
          isLoading={bulkUpdateLoading}
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

function CopyToModal({ rooms, onCopy, onClose }: {
  rooms: (ProposalRoom & { line_items: ProposalLineItem[] })[];
  onCopy: (roomIds: string[]) => void;
  onClose: () => void;
}) {
  const [selectedRoomIds, setSelectedRoomIds] = useState<Set<string>>(new Set());

  function toggleRoom(roomId: string) {
    const newSelection = new Set(selectedRoomIds);
    if (newSelection.has(roomId)) {
      newSelection.delete(roomId);
    } else {
      newSelection.add(roomId);
    }
    setSelectedRoomIds(newSelection);
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg p-6 max-w-full sm:max-w-md w-full">
        <h2 className="text-xl font-bold text-white mb-4">Copy Items To...</h2>
        <p className="text-sm text-gray-400 mb-4">
          Select the area(s) where you want to copy the selected items
        </p>

        <div className="space-y-2 max-h-96 overflow-y-auto mb-6">
          {rooms.map(room => (
            <label
              key={room.id}
              className="flex items-center gap-3 p-3 bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-600"
            >
              <input
                type="checkbox"
                checked={selectedRoomIds.has(room.id)}
                onChange={() => toggleRoom(room.id)}
                className="rounded border-gray-600 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-white">{room.name}</span>
            </label>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={() => onCopy(Array.from(selectedRoomIds))}
            disabled={selectedRoomIds.size === 0}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg"
          >
            Copy to {selectedRoomIds.size} area{selectedRoomIds.size !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
