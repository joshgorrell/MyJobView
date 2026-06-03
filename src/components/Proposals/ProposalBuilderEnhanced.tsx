import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { ProposalRoom, ProposalLineItem, Product, ProposalWithDetails } from '../../lib/types';
import { LayoutGrid, LayoutList, Rows } from 'lucide-react';
import ProductSelector from './ProductSelector';
import ProposalSummary from './ProposalSummary';
import ProposalBuilderStandard from './ProposalBuilderStandard';
import ProposalBuilderCondensed from './ProposalBuilderCondensed';
import ProposalBuilderAllRooms from './ProposalBuilderAllRooms';
import ConfirmModal from '../ui/ConfirmModal';

interface ProposalBuilderEnhancedProps {
  proposalId: string;
  onSave?: () => void;
}

type LayoutMode = 'standard' | 'condensed' | 'all-rooms';

export default function ProposalBuilderEnhanced({ proposalId, onSave }: ProposalBuilderEnhancedProps) {
  const { profile } = useAuth();
  const [proposal, setProposal] = useState<ProposalWithDetails | null>(null);
  const [rooms, setRooms] = useState<(ProposalRoom & { line_items: ProposalLineItem[]; expanded: boolean })[]>([]);
  const [loading, setLoading] = useState(true);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('standard');
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [showProductSelector, setShowProductSelector] = useState(false);
  const [productSelectorRoomId, setProductSelectorRoomId] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  function getDisplayTitle(title: string) {
    // Remove "Proposal for" prefix for internal display
    return title.replace(/^Proposal for\s+/i, '');
  }

  useEffect(() => {
    loadProposal();

    const handleProposalUpdate = (e: CustomEvent) => {
      if (e.detail?.proposalId === proposalId) {
        loadProposal();
      }
    };

    window.addEventListener('proposal-updated' as any, handleProposalUpdate);
    return () => window.removeEventListener('proposal-updated' as any, handleProposalUpdate);
  }, [proposalId]);

  useEffect(() => {
    // Auto-select first room in standard mode
    if (layoutMode === 'standard' && rooms.length > 0 && !selectedRoomId) {
      setSelectedRoomId(rooms[0].id);
    }
  }, [layoutMode, rooms, selectedRoomId]);

  async function loadProposal() {
    try {
      setLoading(true);

      const { data: proposalData, error: proposalError } = await supabase
        .from('proposals')
        .select(`
          *,
          contacts:contacts!proposals_contact_id_fkey(*),
          profiles(*),
          leads(*)
        `)
        .eq('id', proposalId)
        .maybeSingle();

      if (proposalError) throw proposalError;
      if (!proposalData) throw new Error('Proposal not found');

      const { data: roomsData, error: roomsError } = await supabase
        .from('proposal_rooms')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('sort_order');

      if (roomsError) throw roomsError;

      const { data: lineItemsData, error: lineItemsError } = await supabase
        .from('proposal_line_items')
        .select(`
          *,
          products(*)
        `)
        .eq('proposal_id', proposalId)
        .order('sort_order');

      if (lineItemsError) throw lineItemsError;

      const roomsWithItems = (roomsData || []).map(room => ({
        ...room,
        line_items: (lineItemsData || []).filter(item => item.room_id === room.id),
        expanded: true
      }));

      setProposal(proposalData as ProposalWithDetails);
      setRooms(roomsWithItems);
    } catch (error) {
      console.error('Error loading proposal:', error);
    } finally {
      setLoading(false);
    }
  }

  async function addRoom() {
    if (!proposal) return;

    const newRoom = {
      proposal_id: proposalId,
      name: `Room ${rooms.length + 1}`,
      description: '',
      sort_order: rooms.length
    };

    try {
      const { data, error } = await supabase
        .from('proposal_rooms')
        .insert(newRoom)
        .select()
        .single();

      if (error) throw error;

      const newRoomWithItems = { ...data, line_items: [], expanded: true };
      setRooms([...rooms, newRoomWithItems]);

      // Auto-select new room in standard mode
      if (layoutMode === 'standard') {
        setSelectedRoomId(data.id);
      }
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
    setConfirmModal({
      title: 'Delete Room',
      message: 'Delete this room and all its line items?',
      onConfirm: async () => {
        setConfirmModal(null);
        await doDeleteRoom(roomId);
      }
    });
  }

  async function doDeleteRoom(roomId: string) {
    try {
      const { error } = await supabase
        .from('proposal_rooms')
        .delete()
        .eq('id', roomId);

      if (error) throw error;

      setRooms(rooms.filter(room => room.id !== roomId));

      // Clear selection if deleted room was selected
      if (selectedRoomId === roomId) {
        setSelectedRoomId(rooms.length > 1 ? rooms.find(r => r.id !== roomId)?.id || null : null);
      }

      await recalculateProposal();
    } catch (error) {
      console.error('Error deleting room:', error);
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
      is_custom: !product
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

      await recalculateProposal();
    } catch (error) {
      console.error('Error adding line item:', error);
    }
  }

  async function updateLineItem(itemId: string, updates: Partial<ProposalLineItem>) {
    try {
      const updatedItem = { ...updates };
      if (updates.quantity !== undefined || updates.unit_price !== undefined) {
        const item = rooms.flatMap(r => r.line_items).find(i => i.id === itemId);
        if (item) {
          const quantity = updates.quantity ?? item.quantity;
          const unitPrice = updates.unit_price ?? item.unit_price;
          updatedItem.line_total = quantity * unitPrice;
        }
      }

      const { error } = await supabase
        .from('proposal_line_items')
        .update(updatedItem)
        .eq('id', itemId);

      if (error) throw error;

      setRooms(rooms.map(room => ({
        ...room,
        line_items: room.line_items.map(item =>
          item.id === itemId ? { ...item, ...updatedItem } : item
        )
      })));

      await recalculateProposal();
    } catch (error) {
      console.error('Error updating line item:', error);
    }
  }

  async function deleteLineItem(itemId: string) {
    setConfirmModal({
      title: 'Delete Line Item',
      message: 'Delete this line item?',
      onConfirm: async () => {
        setConfirmModal(null);
        await doDeleteLineItem(itemId);
      }
    });
  }

  async function doDeleteLineItem(itemId: string) {
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

  function handleAddProduct(roomId: string) {
    setProductSelectorRoomId(roomId);
    setShowProductSelector(true);
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
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">Proposal not found</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header with Title and Layout Mode Switcher */}
      <div className="flex-shrink-0 border-b border-gray-700 bg-gray-900 px-6 py-4">
        <div className="flex items-center justify-between max-w-7xl mx-auto flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">{getDisplayTitle(proposal.title)}</h1>
            <div className="text-sm text-gray-400">
              {proposal.proposal_number} • {proposal.contacts?.contact_name}
            </div>
          </div>

          {/* Layout Mode Switcher */}
          <div className="flex items-center gap-2 bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setLayoutMode('standard')}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                layoutMode === 'standard'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
              title="Standard Builder - Room by Room"
            >
              <LayoutList size={18} />
              Standard
            </button>
            <button
              onClick={() => setLayoutMode('condensed')}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                layoutMode === 'condensed'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
              title="Condensed View - Compact Cards"
            >
              <LayoutGrid size={18} />
              Condensed
            </button>
            <button
              onClick={() => setLayoutMode('all-rooms')}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                layoutMode === 'all-rooms'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
              title="All Rooms View - Full Overview"
            >
              <Rows size={18} />
              All Rooms
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <div className="flex-1 overflow-hidden">
          {layoutMode === 'standard' && (
            <ProposalBuilderStandard
              rooms={rooms}
              selectedRoomId={selectedRoomId}
              onSelectRoom={setSelectedRoomId}
              onToggleRoom={toggleRoomExpanded}
              onUpdateRoom={updateRoom}
              onDeleteRoom={deleteRoom}
              onUpdateLineItem={updateLineItem}
              onDeleteLineItem={deleteLineItem}
              onAddProduct={handleAddProduct}
              onAddRoom={addRoom}
            />
          )}
          {layoutMode === 'condensed' && (
            <ProposalBuilderCondensed
              rooms={rooms}
              onToggleRoom={toggleRoomExpanded}
              onUpdateRoom={updateRoom}
              onDeleteRoom={deleteRoom}
              onUpdateLineItem={updateLineItem}
              onDeleteLineItem={deleteLineItem}
              onAddProduct={handleAddProduct}
              onAddRoom={addRoom}
            />
          )}
          {layoutMode === 'all-rooms' && (
            <ProposalBuilderAllRooms
              rooms={rooms}
              onToggleRoom={toggleRoomExpanded}
              onUpdateRoom={updateRoom}
              onDeleteRoom={deleteRoom}
              onUpdateLineItem={updateLineItem}
              onDeleteLineItem={deleteLineItem}
              onAddProduct={handleAddProduct}
              onAddRoom={addRoom}
            />
          )}
        </div>

        {/* Right Sidebar - Summary */}
        <ProposalSummary proposal={proposal} onSave={onSave} />
      </div>

      {/* Product Selector Modal */}
      {showProductSelector && productSelectorRoomId && (
        <ProductSelector
          onSelect={(product) => {
            addLineItem(productSelectorRoomId, product);
            setShowProductSelector(false);
            setProductSelectorRoomId(null);
          }}
          onClose={() => {
            setShowProductSelector(false);
            setProductSelectorRoomId(null);
          }}
        />
      )}

      <ConfirmModal
        isOpen={!!confirmModal}
        title={confirmModal?.title || ''}
        message={confirmModal?.message || ''}
        variant="danger"
        onConfirm={() => confirmModal?.onConfirm()}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}
