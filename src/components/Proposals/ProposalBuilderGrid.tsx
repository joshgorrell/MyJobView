import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { ProposalRoom, ProposalLineItem, Product } from '../../lib/types';
import { ArrowLeft, Plus, Settings, ExternalLink, LayoutGrid, List, Trash2, Copy, CreditCard as Edit2, Eye, DollarSign, Package, User, ChevronRight, CheckCircle2, Maximize2, GripVertical, FileText, X, AlignJustify, GitBranch, Target, Zap, Receipt, ChevronDown, ChevronUp, XCircle, ThumbsUp, MoreHorizontal } from 'lucide-react';
import ProposalSettings from './ProposalSettings';
import ProposalRevisionManager from './ProposalRevisionManager';
import AddItemToAreasModal from './AddItemToAreasModal';
import QuickAddProductModal from './QuickAddProductModal';
import ProposalTaxReport from './ProposalTaxReport';
import EditCustomerModal from './EditCustomerModal';
import { ManualApprovalModal } from './ManualApprovalModal';

interface ProposalBuilderGridProps {
  proposalId: string;
  onBack: () => void;
  onNavigateToSalesOrder?: (salesOrderId: string) => void;
  isFullscreen?: boolean;
  onChangeViewMode?: (mode: 'card' | 'compact') => void;
  targetRoomIds?: Set<string>;
  onTargetRoomsChange?: (rooms: Set<string>) => void;
}

interface RoomWithItems extends ProposalRoom {
  line_items: (ProposalLineItem & { products?: Product })[];
}

export default function ProposalBuilderGrid({ proposalId, onBack, onNavigateToSalesOrder, isFullscreen = false, onChangeViewMode, targetRoomIds: externalTargetRoomIds, onTargetRoomsChange }: ProposalBuilderGridProps) {
  const [proposal, setProposal] = useState<any>(null);
  const [rooms, setRooms] = useState<RoomWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [viewMode, setViewMode] = useState<'inline' | 'sidebar'>('sidebar');
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [showAddRoomModal, setShowAddRoomModal] = useState(false);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [showTotalsBar, setShowTotalsBar] = useState(true);
  const [showRevisionManager, setShowRevisionManager] = useState(false);
  const [showAddItemToAreasModal, setShowAddItemToAreasModal] = useState(false);
  const [showQuickAddProduct, setShowQuickAddProduct] = useState(false);
  const [showTaxReport, setShowTaxReport] = useState(false);
  const [showEditCustomerModal, setShowEditCustomerModal] = useState(false);
  const [showManualApprovalModal, setShowManualApprovalModal] = useState(false);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editingRoomName, setEditingRoomName] = useState('');
  const [draggedRoomId, setDraggedRoomId] = useState<string | null>(null);
  const [dragOverRoomId, setDragOverRoomId] = useState<string | null>(null);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const addRoomInputRef = useRef<HTMLInputElement>(null);

  // Use external state if provided, otherwise use local state
  const targetRoomIds = externalTargetRoomIds || new Set<string>();
  const setTargetRoomIds = onTargetRoomsChange || (() => {});

  // Focus the add room input after clearing it
  useEffect(() => {
    if (showAddRoomModal && !saving && !newRoomName) {
      addRoomInputRef.current?.focus();
    }
  }, [showAddRoomModal, saving, newRoomName]);

  useEffect(() => {
    loadData();
  }, [proposalId]);

  useEffect(() => {
    // Set first room as active by default in sidebar mode
    if (viewMode === 'sidebar' && rooms.length > 0 && !activeRoomId) {
      setActiveRoomId(rooms[0].id);
    }
  }, [rooms, viewMode]);

  async function loadData() {
    try {
      console.log('Loading proposal data...');
      const [proposalRes, settingsRes, roomsRes, itemsRes] = await Promise.all([
        supabase.from('proposals').select('*, contacts:contacts!proposals_contact_id_fkey(*)').eq('id', proposalId).maybeSingle(),
        supabase.from('proposal_settings').select('*').eq('proposal_id', proposalId).maybeSingle(),
        supabase.from('proposal_rooms').select('*').eq('proposal_id', proposalId).order('sort_order'),
        supabase.from('proposal_line_items').select('*, products(*, manufacturers(id, name))').eq('proposal_id', proposalId).order('sort_order')
      ]);

      console.log('Proposal data:', proposalRes.data);
      console.log('Contacts data:', proposalRes.data?.contacts);
      console.log('Rooms:', roomsRes.data);
      console.log('Items:', itemsRes.data);

      if (proposalRes.data) {
        // Merge settings into proposal object for easier access
        const proposalData = {
          ...proposalRes.data,
          ...(settingsRes.data || {})
        };
        setProposal(proposalData);
      }

      const roomsWithItems = (roomsRes.data || []).map(room => ({
        ...room,
        line_items: (itemsRes.data || []).filter(item => item.room_id === room.id)
      }));

      console.log('Rooms with items:', roomsWithItems);
      setRooms(roomsWithItems);
    } catch (error) {
      console.error('Error loading proposal:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddRoom(closeAfter = false) {
    if (!newRoomName.trim()) return;

    try {
      setSaving(true);
      const nextSortOrder = rooms.length > 0 ? Math.max(...rooms.map(r => r.sort_order || 0)) + 1 : 1;

      // Get the organization_id from the proposal
      const { data: proposalData, error: proposalError } = await supabase
        .from('proposals')
        .select('organization_id')
        .eq('id', proposalId)
        .single();

      if (proposalError) throw proposalError;

      const { data, error } = await supabase
        .from('proposal_rooms')
        .insert({
          proposal_id: proposalId,
          organization_id: proposalData.organization_id,
          name: newRoomName.trim(),
          sort_order: nextSortOrder
        })
        .select()
        .single();

      if (error) throw error;

      setRooms([...rooms, { ...data, line_items: [] }]);
      setNewRoomName('');

      if (closeAfter) {
        setShowAddRoomModal(false);
      }

      setActiveRoomId(data.id);
    } catch (error) {
      console.error('Error adding room:', error);
      alert('Failed to add room');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteRoom(roomId: string) {
    if (!confirm('Delete this room and all its items?')) return;

    try {
      const { error } = await supabase
        .from('proposal_rooms')
        .delete()
        .eq('id', roomId);

      if (error) throw error;

      setRooms(rooms.filter(r => r.id !== roomId));
      if (activeRoomId === roomId) {
        setActiveRoomId(rooms[0]?.id || null);
      }
    } catch (error) {
      console.error('Error deleting room:', error);
      alert('Failed to delete room');
    }
  }

  async function handleUpdateRoomName(roomId: string, newName: string) {
    if (!newName.trim()) return;

    try {
      const { error } = await supabase
        .from('proposal_rooms')
        .update({ name: newName.trim() })
        .eq('id', roomId);

      if (error) throw error;

      setRooms(rooms.map(r => r.id === roomId ? { ...r, name: newName.trim() } : r));
      setEditingRoomId(null);
      setEditingRoomName('');
    } catch (error) {
      console.error('Error updating room name:', error);
      alert('Failed to update room name');
    }
  }

  async function handleReorderRooms(draggedId: string, targetId: string) {
    const draggedIndex = rooms.findIndex(r => r.id === draggedId);
    const targetIndex = rooms.findIndex(r => r.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const newRooms = [...rooms];
    const [draggedRoom] = newRooms.splice(draggedIndex, 1);
    newRooms.splice(targetIndex, 0, draggedRoom);

    // Update sort_order for all affected rooms
    const updates = newRooms.map((room, index) => ({
      id: room.id,
      sort_order: index + 1
    }));

    setRooms(newRooms);

    try {
      for (const update of updates) {
        await supabase
          .from('proposal_rooms')
          .update({ sort_order: update.sort_order })
          .eq('id', update.id);
      }
    } catch (error) {
      console.error('Error reordering rooms:', error);
      alert('Failed to reorder rooms');
      loadData(); // Reload to get correct order
    }
  }

  function handlePopOut() {
    const url = `/proposals?id=${proposalId}&standalone=true`;
    const windowFeatures = 'width=' + window.screen.availWidth + ',height=' + window.screen.availHeight + ',left=0,top=0';
    window.open(url, '_blank', windowFeatures);
  }

  function calculateRoomTotal(room: RoomWithItems): number {
    return room.line_items.reduce((sum, item) => {
      return sum + (parseFloat(item.unit_price) * parseFloat(item.quantity));
    }, 0);
  }

  function calculatePricingBreakdown() {
    // Calculate parts and labor totals
    const partsTotal = rooms.reduce((sum, room) => {
      return sum + room.line_items.reduce((itemSum, item) => {
        if (item.item_type === 'product' || item.item_type === 'material') {
          return itemSum + (parseFloat(item.unit_price) * parseFloat(item.quantity));
        }
        return itemSum;
      }, 0);
    }, 0);

    const laborTotal = rooms.reduce((sum, room) => {
      return sum + room.line_items.reduce((itemSum, item) => {
        // Use labor_total field to support both material+labor items
        return itemSum + parseFloat(item.labor_total || 0);
      }, 0);
    }, 0);

    const programmingTotal = rooms.reduce((sum, room) => {
      return sum + room.line_items.reduce((itemSum, item) => {
        if (item.item_type === 'programming') {
          return itemSum + (parseFloat(item.unit_price) * parseFloat(item.quantity));
        }
        return itemSum;
      }, 0);
    }, 0);

    const hoursTotal = rooms.reduce((sum, room) => {
      return sum + room.line_items.reduce((itemSum, item) => {
        if (item.type === 'labor' || item.type === 'programming') {
          return itemSum + item.quantity;
        }
        return itemSum;
      }, 0);
    }, 0);

    const itemsSubtotal = partsTotal + laborTotal + programmingTotal;

    // Get modifiers from proposal settings
    const projectManagementPercent = proposal?.project_management_percent || 0;
    const systemDesignPercent = proposal?.system_design_percent || 0;
    const creditCardFeePercent = proposal?.credit_card_fee_percent || 0;
    const miscPartsPercent = proposal?.misc_parts_percent || 0;

    const projectManagementTotal = itemsSubtotal * (projectManagementPercent / 100);
    const systemDesignTotal = itemsSubtotal * (systemDesignPercent / 100);
    const creditCardFeeTotal = itemsSubtotal * (creditCardFeePercent / 100);
    const miscPartsTotal = itemsSubtotal * (miscPartsPercent / 100);

    const modifiersTotal = projectManagementTotal + systemDesignTotal + creditCardFeeTotal + miscPartsTotal;

    const subtotal = itemsSubtotal + modifiersTotal;
    const taxRate = proposal?.tax_rate || 0;
    const salesTax = subtotal * (taxRate / 100);
    const total = subtotal + salesTax;

    return {
      partsTotal,
      laborTotal,
      programmingTotal,
      hoursTotal,
      projectManagementTotal,
      projectManagementPercent,
      systemDesignTotal,
      systemDesignPercent,
      creditCardFeeTotal,
      creditCardFeePercent,
      miscPartsTotal,
      miscPartsPercent,
      modifiersTotal,
      subtotal,
      salesTax,
      taxRate,
      total
    };
  }

  function calculateProposalTotal(): number {
    return calculatePricingBreakdown().total;
  }

  async function handleUpdateStatus(newStatus: string) {
    if (updatingStatus) return;

    try {
      setUpdatingStatus(true);
      const { error } = await supabase
        .from('proposals')
        .update({ status: newStatus })
        .eq('id', proposalId);

      if (error) throw error;
      await loadData();
      setShowStatusDropdown(false);
    } catch (error) {
      console.error('Error updating proposal status:', error);
      alert('Failed to update proposal status');
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function handleDeclineProposal() {
    if (!confirm('Are you sure you want to decline this proposal?')) return;
    await handleUpdateStatus('declined');
  }

  function getStatusBadge(status: string) {
    const statusConfig: Record<string, { label: string; bgColor: string; textColor: string; icon?: React.ReactNode }> = {
      'designing': { label: 'Designing', bgColor: 'bg-pink-600', textColor: 'text-white' },
      'ready_to_submit': { label: 'Ready', bgColor: 'bg-yellow-600', textColor: 'text-white' },
      'sent': { label: 'Sent', bgColor: 'bg-blue-600', textColor: 'text-white' },
      'viewed': { label: 'Viewed', bgColor: 'bg-cyan-600', textColor: 'text-white' },
      'approved': { label: 'Approved', bgColor: 'bg-green-600', textColor: 'text-white', icon: <CheckCircle2 className="w-3 h-3" /> },
      'declined': { label: 'Declined', bgColor: 'bg-red-600', textColor: 'text-white' },
      'expired': { label: 'Expired', bgColor: 'bg-orange-600', textColor: 'text-white' }
    };

    const config = statusConfig[status] || { label: status, bgColor: 'bg-gray-600', textColor: 'text-white' };

    return (
      <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${config.bgColor} ${config.textColor}`}>
        {config.icon}
        <span>{config.label}</span>
      </span>
    );
  }

  const activeRoom = rooms.find(r => r.id === activeRoomId);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">Loading proposal...</div>
      </div>
    );
  }

  if (showSettings) {
    return (
      <ProposalSettings
        proposalId={proposalId}
        onBack={() => setShowSettings(false)}
      />
    );
  }

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-gray-50 to-gray-100 relative">
      {/* Top Navigation Bar */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="px-4 sm:px-6 py-4 sm:py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              {isFullscreen ? (
                <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                  <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h1 className="text-base sm:text-xl font-bold text-gray-900 truncate">
                        {proposal?.proposal_number || 'Proposal Builder'}
                      </h1>
                      {proposal?.status && getStatusBadge(proposal.status)}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs sm:text-sm text-gray-500 mt-1">
                      <User className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      <span className="truncate">
                        {proposal?.contacts?.full_name || 'Loading...'}
                      </span>
                      <button
                        onClick={() => setShowEditCustomerModal(true)}
                        className="text-gray-400 hover:text-blue-600 transition-colors p-0.5"
                        title="Change customer"
                      >
                        <Edit2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    onClick={onBack}
                    className="flex items-center gap-1 sm:gap-2 text-gray-600 hover:text-gray-900 transition-colors flex-shrink-0"
                  >
                    <ArrowLeft className="w-5 h-5" />
                    <span className="font-medium hidden sm:inline">Back</span>
                  </button>
                  <div className="h-8 w-px bg-gray-300 hidden sm:block" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h1 className="text-base sm:text-xl font-bold text-gray-900 truncate">
                        {proposal?.proposal_number || 'Proposal Builder'}
                      </h1>
                      {proposal?.status && getStatusBadge(proposal.status)}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs sm:text-sm text-gray-500 mt-1">
                      <User className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      <span className="truncate">
                        {proposal?.contacts?.full_name || 'Loading...'}
                      </span>
                      <button
                        onClick={() => setShowEditCustomerModal(true)}
                        className="text-gray-400 hover:text-blue-600 transition-colors p-0.5"
                        title="Change customer"
                      >
                        <Edit2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* View Mode Toggle */}
              <div className="flex items-center gap-0.5 sm:gap-1 bg-gray-100 rounded-lg p-0.5 sm:p-1">
                <button
                  onClick={() => setViewMode('inline')}
                  className={`flex items-center gap-1 px-3 sm:px-3 py-2 sm:py-1.5 rounded text-xs sm:text-sm font-medium transition-colors ${
                    viewMode === 'inline'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <List className="w-4 h-4" />
                  <span className="hidden md:inline">Inline</span>
                </button>
                <button
                  onClick={() => setViewMode('sidebar')}
                  className={`flex items-center gap-1 px-3 sm:px-3 py-2 sm:py-1.5 rounded text-xs sm:text-sm font-medium transition-colors ${
                    viewMode === 'sidebar'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <LayoutGrid className="w-4 h-4" />
                  <span className="hidden md:inline">Sidebar</span>
                </button>
              </div>

              {/* Add Item Button */}
              {targetRoomIds.size === 0 ? (
                <button
                  onClick={() => setShowAddItemToAreasModal(true)}
                  className="flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors font-medium"
                  title="Add Item"
                >
                  <Plus className="w-4 h-4" />
                  <span className="text-xs sm:text-sm">Add Item</span>
                </button>
              ) : (
                <button
                  onClick={() => setShowQuickAddProduct(true)}
                  className="flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-green-600 text-white hover:bg-green-700 rounded-lg transition-colors font-medium animate-pulse"
                  title="Quick Add to Selected Areas"
                >
                  <Zap className="w-4 h-4" />
                  <span className="text-xs sm:text-sm hidden sm:inline">Quick Add ({targetRoomIds.size})</span>
                  <span className="text-xs sm:hidden">{targetRoomIds.size}</span>
                </button>
              )}

              {/* Status Dropdown - always visible */}
              {proposal?.status !== 'approved' && (
                <div className="relative">
                  <button
                    onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                    className="flex items-center gap-1 px-2 sm:px-3 py-2 bg-gray-600 text-white hover:bg-gray-700 rounded-lg transition-colors font-medium text-xs"
                    title="Status Actions"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="hidden sm:inline">Status</span>
                    <ChevronDown className="w-3 h-3" />
                  </button>

                  {showStatusDropdown && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowStatusDropdown(false)} />
                      <div className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-20 min-w-[180px]">
                        <button
                          onClick={() => {
                            setShowManualApprovalModal(true);
                            setShowStatusDropdown(false);
                          }}
                          disabled={updatingStatus}
                          className="w-full px-3 py-2 text-left text-green-600 hover:bg-green-50 flex items-center gap-2 text-sm disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Approve
                        </button>
                        {proposal?.status !== 'declined' && (
                          <button
                            onClick={handleDeclineProposal}
                            disabled={updatingStatus}
                            className="w-full px-3 py-2 text-left text-red-600 hover:bg-red-50 flex items-center gap-2 text-sm disabled:opacity-50"
                          >
                            <XCircle className="w-4 h-4" />
                            Decline
                          </button>
                        )}

                        {proposal?.status === 'designing' && (
                          <>
                            <div className="border-t border-gray-200 my-1" />
                            <button
                              onClick={() => handleUpdateStatus('ready_to_submit')}
                              disabled={updatingStatus}
                              className="w-full px-3 py-2 text-left text-yellow-600 hover:bg-yellow-50 flex items-center gap-2 text-sm disabled:opacity-50"
                            >
                              <ThumbsUp className="w-4 h-4" />
                              Mark as Ready to Submit
                            </button>
                          </>
                        )}

                        {proposal?.status !== 'designing' && (
                          <>
                            <div className="border-t border-gray-200 my-1" />
                            <button
                              onClick={() => handleUpdateStatus('designing')}
                              disabled={updatingStatus}
                              className="w-full px-3 py-2 text-left text-gray-700 hover:bg-gray-50 flex items-center gap-2 text-sm disabled:opacity-50"
                            >
                              <Edit2 className="w-4 h-4" />
                              Return to Designing
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Desktop icon buttons - hidden on mobile */}
              <div className="hidden sm:flex items-center gap-1">
                {!isFullscreen && (
                  <button
                    onClick={handlePopOut}
                    className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Open in Full Screen"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                )}

                <button
                  onClick={() => setShowRevisionManager(true)}
                  className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Manage Revisions"
                >
                  <GitBranch className="w-4 h-4" />
                  {(proposal?.revision_count && proposal.revision_count > 1) && (
                    <span className="absolute -top-1 -right-1 px-1 py-0.5 bg-blue-600 text-white text-[9px] font-bold rounded-full min-w-[16px] text-center">
                      {proposal.revision_count}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setShowTaxReport(true)}
                  className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Sales Tax Report"
                >
                  <Receipt className="w-4 h-4" />
                </button>

                {onChangeViewMode && (
                  <button
                    onClick={() => onChangeViewMode('compact')}
                    className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Switch to Compact View"
                  >
                    <AlignJustify className="w-4 h-4" />
                  </button>
                )}

                <button
                  onClick={() => setShowSettings(true)}
                  className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Proposal Settings"
                >
                  <Settings className="w-4 h-4" />
                </button>

                {isFullscreen && (
                  <button
                    onClick={() => window.close()}
                    className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Close Window"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Mobile overflow menu */}
              <div className="relative sm:hidden">
                <button
                  onClick={() => setShowMobileMenu(!showMobileMenu)}
                  className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                  title="More options"
                >
                  <MoreHorizontal className="w-5 h-5" />
                </button>

                {showMobileMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowMobileMenu(false)} />
                    <div className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-20 min-w-[200px]">
                      {!isFullscreen && (
                        <button
                          onClick={() => { handlePopOut(); setShowMobileMenu(false); }}
                          className="w-full px-3 py-2.5 text-left text-gray-700 hover:bg-gray-50 flex items-center gap-2 text-sm"
                        >
                          <Maximize2 className="w-4 h-4 text-gray-500" />
                          Open Full Screen
                        </button>
                      )}
                      <button
                        onClick={() => { setShowRevisionManager(true); setShowMobileMenu(false); }}
                        className="w-full px-3 py-2.5 text-left text-gray-700 hover:bg-gray-50 flex items-center gap-2 text-sm"
                      >
                        <GitBranch className="w-4 h-4 text-gray-500" />
                        Manage Revisions
                        {(proposal?.revision_count && proposal.revision_count > 1) && (
                          <span className="ml-auto px-1.5 py-0.5 bg-blue-600 text-white text-[9px] font-bold rounded-full">
                            {proposal.revision_count}
                          </span>
                        )}
                      </button>
                      <button
                        onClick={() => { setShowTaxReport(true); setShowMobileMenu(false); }}
                        className="w-full px-3 py-2.5 text-left text-gray-700 hover:bg-gray-50 flex items-center gap-2 text-sm"
                      >
                        <Receipt className="w-4 h-4 text-gray-500" />
                        Sales Tax Report
                      </button>
                      {onChangeViewMode && (
                        <button
                          onClick={() => { onChangeViewMode('compact'); setShowMobileMenu(false); }}
                          className="w-full px-3 py-2.5 text-left text-gray-700 hover:bg-gray-50 flex items-center gap-2 text-sm"
                        >
                          <AlignJustify className="w-4 h-4 text-gray-500" />
                          Switch to Compact View
                        </button>
                      )}
                      <div className="border-t border-gray-200 my-1" />
                      <button
                        onClick={() => { setShowSettings(true); setShowMobileMenu(false); }}
                        className="w-full px-3 py-2.5 text-left text-gray-700 hover:bg-gray-50 flex items-center gap-2 text-sm"
                      >
                        <Settings className="w-4 h-4 text-gray-500" />
                        Proposal Settings
                      </button>
                      {isFullscreen && (
                        <button
                          onClick={() => window.close()}
                          className="w-full px-3 py-2.5 text-left text-red-600 hover:bg-red-50 flex items-center gap-2 text-sm"
                        >
                          <X className="w-4 h-4" />
                          Close Window
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col sm:flex-row overflow-hidden">
        {/* Sidebar Mode: Room Selector */}
        {viewMode === 'sidebar' && (
          <div className="w-full sm:w-64 md:w-80 bg-white border-b sm:border-b-0 sm:border-r border-gray-200 flex flex-col max-h-80 sm:max-h-none" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
            <div className="p-3 sm:p-4 border-b border-gray-200 space-y-2">
              <button
                onClick={() => setShowAddRoomModal(true)}
                className="w-full flex items-center justify-center gap-2 px-3 sm:px-4 py-2 sm:py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all shadow-sm text-sm sm:text-base"
              >
                <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="font-semibold">Add Room/Area</span>
              </button>

              {targetRoomIds.size > 0 && (
                <button
                  onClick={() => setTargetRoomIds(new Set())}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-all text-sm"
                >
                  <X className="w-4 h-4" />
                  <span className="font-medium">Clear Target Areas ({targetRoomIds.size})</span>
                </button>
              )}
            </div>

            <div
              className="flex-1 overflow-y-auto overflow-x-hidden p-2 sm:p-4"
              style={{
                WebkitOverflowScrolling: 'touch',
                touchAction: 'pan-y',
                overscrollBehavior: 'contain'
              } as React.CSSProperties}
            >
              <div className="flex flex-col gap-2">
                {rooms.map(room => {
                  const roomTotal = calculateRoomTotal(room);
                  const isActive = room.id === activeRoomId;
                  const isTargeted = targetRoomIds.has(room.id);
                  const isEditing = editingRoomId === room.id;
                  const isDragging = draggedRoomId === room.id;
                  const isDragOver = dragOverRoomId === room.id;

                  return (
                    <div
                      key={room.id}
                      className="relative"
                      draggable={!isEditing}
                      onDragStart={(e) => {
                        setDraggedRoomId(room.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        if (draggedRoomId && draggedRoomId !== room.id) {
                          setDragOverRoomId(room.id);
                        }
                      }}
                      onDragLeave={() => {
                        setDragOverRoomId(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (draggedRoomId && draggedRoomId !== room.id) {
                          handleReorderRooms(draggedRoomId, room.id);
                        }
                        setDraggedRoomId(null);
                        setDragOverRoomId(null);
                      }}
                      onDragEnd={() => {
                        setDraggedRoomId(null);
                        setDragOverRoomId(null);
                      }}
                    >
                      {/* Drop Indicator */}
                      {isDragOver && !isDragging && (
                        <div className="absolute inset-0 border-4 border-blue-500 bg-blue-50 bg-opacity-50 rounded-lg pointer-events-none z-10 animate-pulse">
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-bold shadow-lg">
                              Drop Here
                            </div>
                          </div>
                        </div>
                      )}

                      <button
                        onClick={() => !isEditing && setActiveRoomId(room.id)}
                        className={`text-left p-4 sm:p-4 rounded-lg border-2 transition-all w-full ${
                          isDragging
                            ? 'opacity-30 border-dashed border-blue-400 bg-blue-50'
                            : isDragOver
                            ? 'opacity-50'
                            : isActive
                            ? 'border-blue-600 bg-blue-50 shadow-md'
                            : isTargeted
                            ? 'border-green-500 bg-green-50 shadow-md'
                            : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                        }`}
                      >
                        <div className="flex items-start gap-2 mb-2">
                          <GripVertical className={`w-4 h-4 flex-shrink-0 mt-0.5 cursor-move ${
                            isActive ? 'text-blue-400' : 'text-gray-400'
                          }`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={isEditing ? editingRoomName : room.name}
                                onChange={(e) => {
                                  if (!isEditing) {
                                    setEditingRoomId(room.id);
                                    setEditingRoomName(e.target.value);
                                  } else {
                                    setEditingRoomName(e.target.value);
                                  }
                                }}
                                onFocus={() => {
                                  if (!isEditing) {
                                    setEditingRoomId(room.id);
                                    setEditingRoomName(room.name);
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleUpdateRoomName(room.id, editingRoomName);
                                  } else if (e.key === 'Escape') {
                                    setEditingRoomId(null);
                                    setEditingRoomName('');
                                  }
                                }}
                                onBlur={() => {
                                  if (isEditing) {
                                    handleUpdateRoomName(room.id, editingRoomName);
                                  }
                                }}
                                className={`w-full px-2 py-1 text-sm sm:text-base font-semibold rounded transition-all ${
                                  isEditing
                                    ? 'border border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white'
                                    : `border border-transparent hover:border-gray-300 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-transparent ${
                                        isActive ? 'text-blue-900' : isTargeted ? 'text-green-900' : 'text-gray-900'
                                      }`
                                }`}
                                onClick={(e) => e.stopPropagation()}
                              />
                              {isTargeted && (
                                <Target className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                              )}
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              {room.line_items.length} {room.line_items.length === 1 ? 'item' : 'items'}
                            </div>
                          </div>
                          {isActive && !isEditing && (
                            <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 flex-shrink-0" />
                          )}
                        </div>
                        <div className={`text-sm font-bold ${isActive ? 'text-blue-600' : isTargeted ? 'text-green-600' : 'text-gray-700'}`}>
                          ${roomTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                      </button>

                      <div className="absolute top-2 right-2 flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const newTargets = new Set(targetRoomIds);
                            if (isTargeted) {
                              newTargets.delete(room.id);
                            } else {
                              newTargets.add(room.id);
                            }
                            setTargetRoomIds(newTargets);
                          }}
                          className={`p-1.5 rounded-full transition-all ${
                            isTargeted
                              ? 'bg-green-600 text-white'
                              : 'bg-gray-200 text-gray-500 hover:bg-green-100 hover:text-green-600'
                          }`}
                          title={isTargeted ? 'Remove as target' : 'Set as target for quick add'}
                        >
                          <Target className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteRoom(room.id);
                          }}
                          className="p-1.5 rounded-full bg-gray-200 text-gray-600 hover:bg-red-100 hover:text-red-600 transition-all"
                          title="Delete room"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {rooms.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <Package className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                  <p className="text-sm font-medium">No rooms yet</p>
                  <p className="text-xs mt-1">Click "Add Room/Area" to start</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Main Content: Card View */}
        <div
          className="flex-1 overflow-y-auto overflow-x-auto p-3 sm:p-6 pb-32 sm:pb-24"
          style={{
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-x pan-y',
            overscrollBehavior: 'contain'
          } as React.CSSProperties}
        >
          {viewMode === 'inline' ? (
            // Inline Mode: Show all rooms
            <div className="space-y-6">
              {rooms.map(room => (
                <RoomCard
                  key={room.id}
                  room={room}
                  onDelete={() => handleDeleteRoom(room.id)}
                  onAddItem={() => setShowAddItemToAreasModal(true)}
                />
              ))}

              <button
                onClick={() => setShowAddRoomModal(true)}
                className="w-full p-8 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all group"
              >
                <div className="flex flex-col items-center gap-2 text-gray-500 group-hover:text-blue-600">
                  <Plus className="w-8 h-8" />
                  <span className="font-medium">Add Room/Area</span>
                </div>
              </button>
            </div>
          ) : (
            // Sidebar Mode: Show active room only
            activeRoom ? (
              <RoomCard
                room={activeRoom}
                onDelete={() => handleDeleteRoom(activeRoom.id)}
                onAddItem={() => setShowAddItemToAreasModal(true)}
                isActive
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-gray-500">
                  <Package className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                  <p className="font-medium">No room selected</p>
                  <p className="text-sm mt-1">Select a room from the sidebar</p>
                </div>
              </div>
            )
          )}
        </div>
      </div>

      {/* Add Room Modal */}
      {showAddRoomModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => {
            setShowAddRoomModal(false);
            setNewRoomName('');
          }}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-gray-900 mb-2">Add New Room/Area</h2>
            <p className="text-sm text-gray-600 mb-4">
              Press <kbd className="px-2 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs font-mono">Enter</kbd> to add another, <kbd className="px-2 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs font-mono">Esc</kbd> to close
            </p>
            <input
              ref={addRoomInputRef}
              type="text"
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newRoomName.trim()) {
                  e.preventDefault();
                  handleAddRoom(false);
                } else if (e.key === 'Escape') {
                  setShowAddRoomModal(false);
                  setNewRoomName('');
                }
              }}
              placeholder="Living Room, Kitchen, CCTV, etc..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowAddRoomModal(false);
                  setNewRoomName('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Done
              </button>
              <button
                onClick={() => handleAddRoom(false)}
                disabled={!newRoomName.trim() || saving}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving ? 'Adding...' : (
                  <>
                    <Plus className="w-4 h-4" />
                    Add & Continue
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fixed Bottom Totals Bar - Always Visible with Collapsed/Expanded States */}
      <div
        className="fixed bottom-0 left-0 right-0 bg-gradient-to-r from-gray-900 via-black to-gray-900 border-t-2 border-blue-500 shadow-2xl transition-all duration-300 ease-in-out z-50"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        {(() => {
          const pricing = calculatePricingBreakdown();
          const totalItems = rooms.reduce((sum, r) => sum + r.line_items.length, 0);
          return (
            <>
              {/* Toggle Button */}
              <button
                onClick={() => setShowTotalsBar(!showTotalsBar)}
                className="absolute -top-8 right-3 sm:right-6 bg-gradient-to-r from-gray-900 to-black text-white px-3 sm:px-4 py-1.5 rounded-t-lg shadow-lg hover:from-gray-800 hover:to-gray-900 transition-all flex items-center gap-2 border-t-2 border-x-2 border-blue-500"
              >
                {showTotalsBar ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                <span className="text-xs sm:text-sm font-semibold">{showTotalsBar ? 'Collapse' : 'Expand'} Details</span>
              </button>

              {showTotalsBar ? (
                // Expanded View - Two-row layout on mobile, single row on desktop
                <div className="px-3 sm:px-6 py-2 sm:py-2.5">
                  {/* Row 1 (mobile) / Inline on desktop: Grand Total + Subtotal + Tax */}
                  <div className="flex items-center justify-between gap-3 sm:gap-6">
                    {/* Counts - always visible */}
                    <div className="hidden sm:flex items-center gap-6">
                      <div className="text-center">
                        <div className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider mb-0.5">Rooms</div>
                        <div className="text-lg font-bold text-white">{rooms.length}</div>
                      </div>
                      <div className="h-8 w-px bg-gradient-to-b from-transparent via-blue-500 to-transparent" />
                      <div className="text-center">
                        <div className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider mb-0.5">Items</div>
                        <div className="text-lg font-bold text-white">{totalItems}</div>
                      </div>
                    </div>

                    {/* Mobile counts inline */}
                    <div className="flex sm:hidden items-center gap-2 text-xs text-gray-400">
                      <DollarSign className="w-3.5 h-3.5 text-blue-400" />
                      <span>{rooms.length}R • {totalItems}I</span>
                    </div>

                    {/* Desktop: full breakdown inline */}
                    <div className="hidden sm:flex items-center gap-6 flex-1 justify-center">
                      <div className="h-8 w-px bg-gradient-to-b from-transparent via-blue-500 to-transparent" />
                      <div className="text-center">
                        <div className="text-[10px] text-blue-300 mb-0.5 uppercase tracking-wide">Parts</div>
                        <div className="text-sm font-bold text-white">${pricing.partsTotal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] text-blue-300 mb-0.5 uppercase tracking-wide">Labor</div>
                        <div className="text-sm font-bold text-white">${pricing.laborTotal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] text-blue-300 mb-0.5 uppercase tracking-wide">Prog</div>
                        <div className="text-sm font-bold text-white">${pricing.programmingTotal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                      </div>
                      <div className="h-8 w-px bg-gradient-to-b from-transparent via-blue-500 to-transparent" />
                      <div className="text-center">
                        <div className="text-[10px] text-blue-300 mb-0.5 uppercase tracking-wide">Hours</div>
                        <div className="text-sm font-bold text-white">{pricing.hoursTotal.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</div>
                      </div>
                      {(pricing.projectManagementPercent > 0 || pricing.systemDesignPercent > 0 || pricing.creditCardFeePercent > 0 || pricing.miscPartsPercent > 0) && (
                        <>
                          <div className="h-8 w-px bg-gradient-to-b from-transparent via-blue-500 to-transparent" />
                          {pricing.projectManagementPercent > 0 && (
                            <div className="text-center">
                              <div className="text-[10px] text-blue-300 mb-0.5 uppercase tracking-wide">PM ({pricing.projectManagementPercent}%)</div>
                              <div className="text-sm font-bold text-white">${pricing.projectManagementTotal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                            </div>
                          )}
                          {pricing.systemDesignPercent > 0 && (
                            <div className="text-center">
                              <div className="text-[10px] text-blue-300 mb-0.5 uppercase tracking-wide">Design ({pricing.systemDesignPercent}%)</div>
                              <div className="text-sm font-bold text-white">${pricing.systemDesignTotal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                            </div>
                          )}
                          {pricing.creditCardFeePercent > 0 && (
                            <div className="text-center">
                              <div className="text-[10px] text-blue-300 mb-0.5 uppercase tracking-wide">CC Fee ({pricing.creditCardFeePercent}%)</div>
                              <div className="text-sm font-bold text-white">${pricing.creditCardFeeTotal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                            </div>
                          )}
                          {pricing.miscPartsPercent > 0 && (
                            <div className="text-center">
                              <div className="text-[10px] text-blue-300 mb-0.5 uppercase tracking-wide">Misc ({pricing.miscPartsPercent}%)</div>
                              <div className="text-sm font-bold text-white">${pricing.miscPartsTotal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                            </div>
                          )}
                        </>
                      )}
                      <div className="h-8 w-px bg-gradient-to-b from-transparent via-blue-500 to-transparent" />
                      <div className="text-center">
                        <div className="text-[10px] text-blue-300 mb-0.5 uppercase tracking-wide">Subtotal</div>
                        <div className="text-sm font-bold text-white">${pricing.subtotal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-[10px] text-blue-300 mb-0.5 uppercase tracking-wide">Tax</div>
                        <div className="text-sm font-bold text-white">${pricing.salesTax.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                      </div>
                    </div>

                    {/* Grand Total - always visible */}
                    <div className="text-center bg-gradient-to-br from-blue-600 to-blue-700 px-4 sm:px-6 py-1.5 sm:py-2 rounded-lg shadow-xl border border-blue-400 flex-shrink-0">
                      <div className="text-[10px] font-bold text-blue-200 uppercase tracking-wider mb-0.5">Total</div>
                      <div className="text-lg sm:text-2xl font-black text-white drop-shadow-lg">
                        ${pricing.total.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </div>
                    </div>
                  </div>

                  {/* Row 2 - Mobile only: scrollable breakdown strip */}
                  <div
                    className="sm:hidden mt-2 overflow-x-auto relative"
                    style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x', overscrollBehaviorX: 'contain' } as React.CSSProperties}
                  >
                    <div className="flex items-center gap-4 min-w-max pb-0.5">
                      <div className="text-center">
                        <div className="text-[10px] text-blue-300 mb-0.5 uppercase tracking-wide">Parts</div>
                        <div className="text-xs font-bold text-white">${pricing.partsTotal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                      </div>
                      <div className="h-6 w-px bg-blue-700" />
                      <div className="text-center">
                        <div className="text-[10px] text-blue-300 mb-0.5 uppercase tracking-wide">Labor</div>
                        <div className="text-xs font-bold text-white">${pricing.laborTotal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                      </div>
                      <div className="h-6 w-px bg-blue-700" />
                      <div className="text-center">
                        <div className="text-[10px] text-blue-300 mb-0.5 uppercase tracking-wide">Prog</div>
                        <div className="text-xs font-bold text-white">${pricing.programmingTotal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                      </div>
                      <div className="h-6 w-px bg-blue-700" />
                      <div className="text-center">
                        <div className="text-[10px] text-blue-300 mb-0.5 uppercase tracking-wide">Hours</div>
                        <div className="text-xs font-bold text-white">{pricing.hoursTotal.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</div>
                      </div>
                      {pricing.projectManagementPercent > 0 && (
                        <>
                          <div className="h-6 w-px bg-blue-700" />
                          <div className="text-center">
                            <div className="text-[10px] text-blue-300 mb-0.5 uppercase tracking-wide">PM {pricing.projectManagementPercent}%</div>
                            <div className="text-xs font-bold text-white">${pricing.projectManagementTotal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                          </div>
                        </>
                      )}
                      {pricing.systemDesignPercent > 0 && (
                        <>
                          <div className="h-6 w-px bg-blue-700" />
                          <div className="text-center">
                            <div className="text-[10px] text-blue-300 mb-0.5 uppercase tracking-wide">Design {pricing.systemDesignPercent}%</div>
                            <div className="text-xs font-bold text-white">${pricing.systemDesignTotal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                          </div>
                        </>
                      )}
                      {pricing.creditCardFeePercent > 0 && (
                        <>
                          <div className="h-6 w-px bg-blue-700" />
                          <div className="text-center">
                            <div className="text-[10px] text-blue-300 mb-0.5 uppercase tracking-wide">CC {pricing.creditCardFeePercent}%</div>
                            <div className="text-xs font-bold text-white">${pricing.creditCardFeeTotal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                          </div>
                        </>
                      )}
                      {pricing.miscPartsPercent > 0 && (
                        <>
                          <div className="h-6 w-px bg-blue-700" />
                          <div className="text-center">
                            <div className="text-[10px] text-blue-300 mb-0.5 uppercase tracking-wide">Misc {pricing.miscPartsPercent}%</div>
                            <div className="text-xs font-bold text-white">${pricing.miscPartsTotal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                          </div>
                        </>
                      )}
                      <div className="h-6 w-px bg-blue-700" />
                      <div className="text-center">
                        <div className="text-[10px] text-blue-300 mb-0.5 uppercase tracking-wide">Subtotal</div>
                        <div className="text-xs font-bold text-white">${pricing.subtotal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                      </div>
                      <div className="h-6 w-px bg-blue-700" />
                      <div className="text-center">
                        <div className="text-[10px] text-blue-300 mb-0.5 uppercase tracking-wide">Tax</div>
                        <div className="text-xs font-bold text-white">${pricing.salesTax.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                // Collapsed View - Just the Total
                <div className="px-3 sm:px-6 py-2 sm:py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2 sm:gap-4 text-white">
                    <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
                    <span className="text-xs sm:text-sm font-medium text-gray-300">
                      {rooms.length} {rooms.length === 1 ? 'Room' : 'Rooms'} • {totalItems} Items
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-bold text-blue-200 uppercase tracking-wider mb-0.5">Proposal Total</div>
                    <div className="text-xl sm:text-3xl font-black text-white drop-shadow-lg">
                      ${pricing.total.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </div>
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </div>

      {/* Modals - Rendered via Portal to ensure they appear above everything */}
      {showAddItemToAreasModal && createPortal(
        <AddItemToAreasModal
          proposalId={proposalId}
          rooms={rooms}
          onClose={() => setShowAddItemToAreasModal(false)}
          onItemsAdded={() => {
            setShowAddItemToAreasModal(false);
            loadData();
          }}
        />,
        document.body
      )}

      {showQuickAddProduct && createPortal(
        <QuickAddProductModal
          proposalId={proposalId}
          targetRoomIds={Array.from(targetRoomIds)}
          onClose={() => setShowQuickAddProduct(false)}
          onItemAdded={() => {
            loadData();
          }}
        />,
        document.body
      )}

      {showRevisionManager && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[9999]">
          <ProposalRevisionManager
            proposalId={proposalId}
            onSelectRevision={(revisionId) => {
              setShowRevisionManager(false);
              window.location.href = `/proposals?id=${revisionId}`;
            }}
            onClose={() => setShowRevisionManager(false)}
          />
        </div>,
        document.body
      )}

      {showTaxReport && (
        <ProposalTaxReport
          proposalId={proposalId}
          onClose={() => setShowTaxReport(false)}
        />
      )}

      {showEditCustomerModal && proposal && (
        <EditCustomerModal
          proposalId={proposal.id}
          currentContactId={proposal.contact_id}
          onClose={() => setShowEditCustomerModal(false)}
          onSaved={async () => {
            setShowEditCustomerModal(false);
            await loadData();
          }}
        />
      )}

      {showManualApprovalModal && proposal && (
        <ManualApprovalModal
          proposalId={proposal.id}
          proposalNumber={proposal.proposal_number}
          contactEmail={proposal.contacts?.email || ''}
          depositAmount={proposal.deposit_amount_due || 0}
          onClose={() => setShowManualApprovalModal(false)}
          onSuccess={(salesOrderId) => {
            setShowManualApprovalModal(false);
            loadData();
            if (salesOrderId && onNavigateToSalesOrder) {
              onNavigateToSalesOrder(salesOrderId);
            }
          }}
        />
      )}
    </div>
  );
}

interface RoomCardProps {
  room: RoomWithItems;
  onDelete: () => void;
  onAddItem: () => void;
  isActive?: boolean;
}

function RoomCard({ room, onDelete, onAddItem, isActive }: RoomCardProps) {
  const [expanded, setExpanded] = useState(true);

  const roomTotal = room.line_items.reduce((sum, item) => {
    return sum + (parseFloat(item.unit_price) * parseFloat(item.quantity));
  }, 0);

  return (
    <div className={`bg-white rounded-lg shadow-md border-2 overflow-hidden ${
      isActive ? 'border-blue-500' : 'border-gray-200'
    }`}>
      {/* Room Header */}
      <div className="bg-gradient-to-r from-gray-800 to-gray-900 px-3 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <GripVertical className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 flex-shrink-0" />
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-bold text-white truncate">{room.name}</h3>
              <p className="text-xs sm:text-sm text-gray-400">{room.line_items.length} items</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
            <div className="text-right">
              <div className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wide">Room Total</div>
              <div className="text-base sm:text-xl font-bold text-white">
                ${roomTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                onClick={() => setExpanded(!expanded)}
                className="p-1.5 sm:p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                <ChevronRight className={`w-4 h-4 sm:w-5 sm:h-5 transition-transform ${expanded ? 'rotate-90' : ''}`} />
              </button>
              <button
                onClick={onDelete}
                className="p-1.5 sm:p-2 text-gray-400 hover:text-red-400 rounded-lg hover:bg-gray-700 transition-colors"
              >
                <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Items Grid */}
      {expanded && (
        <div className="p-3 sm:p-6">
          {room.line_items.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3 sm:gap-4">
              {room.line_items.map(item => (
                <ItemCard key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <Package className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p className="text-sm">No items in this room</p>
            </div>
          )}

          <button
            onClick={onAddItem}
            className="w-full mt-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 transition-all flex items-center justify-center gap-2 font-medium"
          >
            <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="text-sm sm:text-base">Add Item to {room.name}</span>
          </button>
        </div>
      )}
    </div>
  );
}

interface ItemCardProps {
  item: ProposalLineItem & { products?: Product };
}

function ItemCard({ item }: ItemCardProps) {
  const totalPrice = parseFloat(item.unit_price) * parseFloat(item.quantity);

  return (
    <div className="bg-gradient-to-br from-white to-gray-50 rounded-lg border border-gray-200 hover:border-blue-400 hover:shadow-lg transition-all p-3 sm:p-4 group h-full flex flex-col">
      <div className="flex items-start justify-between mb-3 gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm sm:text-base text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2">
            {item.description}
          </h4>
          {item.products && (
            <p className="text-[10px] sm:text-xs text-gray-500 mt-1 truncate">SKU: {item.products.sku}</p>
          )}
        </div>
        <button className="p-1.5 text-gray-400 hover:text-blue-600 rounded opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
          <Edit2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>
      </div>

      <div className="space-y-1.5 sm:space-y-2 mt-auto">
        <div className="flex items-center justify-between text-xs sm:text-sm">
          <span className="text-gray-600">Qty:</span>
          <span className="font-semibold text-gray-900">{parseFloat(item.quantity)}</span>
        </div>
        <div className="flex items-center justify-between text-xs sm:text-sm">
          <span className="text-gray-600">Price:</span>
          <span className="font-semibold text-gray-900">
            ${parseFloat(item.unit_price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="pt-1.5 sm:pt-2 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm font-medium text-gray-700">Total:</span>
            <span className="text-base sm:text-lg font-bold text-blue-600">
              ${totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
