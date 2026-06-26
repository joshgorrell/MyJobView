import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import { ProposalRoom, ProposalLineItem, Product } from '../../lib/types';
import { Settings, Share2, MoreVertical, ChevronDown, ChevronUp, Plus, GripVertical, Image, DollarSign, ArrowLeft, Calendar, Activity, Eye, FileText, Wrench } from 'lucide-react';
import ProposalSettings from './ProposalSettings';
import AreaScopeEditor from './AreaScopeEditor';
import InstallTaskEditor from './InstallTaskEditor';
import TwoPhaseLaborEditor from './TwoPhaseLaborEditor';

interface ProposalBuilderLuxuryProps {
  proposalId: string;
  onBack: () => void;
}

interface RoomWithItems extends ProposalRoom {
  line_items: (ProposalLineItem & { products?: Product })[];
}

export default function ProposalBuilderLuxury({ proposalId, onBack }: ProposalBuilderLuxuryProps) {
  const [proposal, setProposal] = useState<any>(null);
  const [rooms, setRooms] = useState<RoomWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [scopeCollapsed, setScopeCollapsed] = useState(false);
  const [footerState, setFooterState] = useState<'full' | 'compact' | 'hidden'>('compact');
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date>(new Date());
  const [showAddAreaModal, setShowAddAreaModal] = useState(false);
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [showMultiAreaItemModal, setShowMultiAreaItemModal] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showExpirationModal, setShowExpirationModal] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [editingScopeRoomId, setEditingScopeRoomId] = useState<string | null>(null);
  const [editingTaskItemId, setEditingTaskItemId] = useState<string | null>(null);
  const [editingTechNotesItemId, setEditingTechNotesItemId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [proposalId]);

  async function loadData() {
    try {
      const [proposalRes, roomsRes, itemsRes] = await Promise.all([
        supabase.from('proposals').select('*, contacts:contacts!proposals_contact_id_fkey(*)').eq('id', proposalId).maybeSingle(),
        supabase.from('proposal_rooms').select('*').eq('proposal_id', proposalId).order('sort_order'),
        supabase.from('proposal_line_items').select('*, products(*, manufacturers(id, name))').eq('proposal_id', proposalId).order('sort_order')
      ]);

      if (proposalRes.data) setProposal(proposalRes.data);

      const roomsWithItems = (roomsRes.data || []).map(room => ({
        ...room,
        line_items: (itemsRes.data || []).filter(item => item.room_id === room.id)
      }));

      setRooms(roomsWithItems);
    } catch (error) {
      console.error('Error loading proposal:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddArea(areaName: string) {
    try {
      const nextSortOrder = rooms.length > 0 ? Math.max(...rooms.map(r => r.sort_order || 0)) + 1 : 1;

      const { data, error } = await supabase
        .from('proposal_rooms')
        .insert({
          proposal_id: proposalId,
          name: areaName,
          sort_order: nextSortOrder
        })
        .select()
        .single();

      if (error) throw error;

      setRooms([...rooms, { ...data, line_items: [] }]);
      setShowAddAreaModal(false);
      setLastSaved(new Date());
    } catch (error) {
      console.error('Error adding area:', error);
      alert('Failed to add area');
    }
  }

  async function handleAddItem(roomId: string, itemData: any) {
    try {
      const room = rooms.find(r => r.id === roomId);
      if (!room) return;

      const nextSortOrder = room.line_items.length > 0
        ? Math.max(...room.line_items.map(i => i.sort_order || 0)) + 1
        : 1;

      const { data, error } = await supabase
        .from('proposal_line_items')
        .insert({
          proposal_id: proposalId,
          room_id: roomId,
          description: itemData.description,
          sku: itemData.sku || null,
          quantity: itemData.quantity,
          unit: itemData.unit || 'EA',
          cost: itemData.cost,
          unit_price: itemData.unit_price,
          line_total: itemData.quantity * itemData.unit_price,
          sort_order: nextSortOrder,
          product_id: itemData.product_id || null
        })
        .select('*, products(*)')
        .single();

      if (error) throw error;

      setRooms(rooms.map(r =>
        r.id === roomId
          ? { ...r, line_items: [...r.line_items, data] }
          : r
      ));
      setShowAddItemModal(false);
      setSelectedRoomId(null);
      setLastSaved(new Date());
    } catch (error) {
      console.error('Error adding item:', error);
      alert('Failed to add item');
    }
  }

  async function handleAddItemToMultipleAreas(itemData: any, selectedRoomIds: string[]) {
    try {
      const itemsToInsert = selectedRoomIds.map(roomId => {
        const room = rooms.find(r => r.id === roomId);
        const nextSortOrder = room && room.line_items.length > 0
          ? Math.max(...room.line_items.map(i => i.sort_order || 0)) + 1
          : 1;

        return {
          proposal_id: proposalId,
          room_id: roomId,
          description: itemData.description,
          sku: itemData.sku || null,
          quantity: itemData.quantity,
          unit: itemData.unit || 'EA',
          cost: itemData.cost,
          unit_price: itemData.unit_price,
          line_total: itemData.quantity * itemData.unit_price,
          sort_order: nextSortOrder,
          product_id: itemData.product_id || null
        };
      });

      const { data, error } = await supabase
        .from('proposal_line_items')
        .insert(itemsToInsert)
        .select('*, products(*)');

      if (error) throw error;

      // Update rooms with new items
      const updatedRooms = rooms.map(room => {
        const newItems = (data || []).filter(item => item.room_id === room.id);
        if (newItems.length > 0) {
          return { ...room, line_items: [...room.line_items, ...newItems] };
        }
        return room;
      });

      setRooms(updatedRooms);
      setShowMultiAreaItemModal(false);
      setLastSaved(new Date());
    } catch (error) {
      console.error('Error adding item to multiple areas:', error);
      alert('Failed to add item');
    }
  }

  const allItems = rooms.flatMap(r => r.line_items);
  const totalCost = allItems.reduce((sum, item) => sum + ((item.cost || 0) * item.quantity), 0);
  const totalSell = allItems.reduce((sum, item) => sum + item.line_total, 0);
  const totalProfit = totalSell - totalCost;
  const totalMarginPercent = totalSell > 0 ? (totalProfit / totalSell) * 100 : 0;

  const hoveredItem = allItems.find(item => item.id === hoveredItemId);
  const selectedItem = allItems.find(item => item.id === selectedItemId);
  const detailItem = selectedItem || hoveredItem;

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#FDFDFD]">
        <div className="text-[#222222]">Loading proposal...</div>
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

  if (showPreview) {
    return (
      <CustomerPreview
        proposalId={proposalId}
        onBack={() => setShowPreview(false)}
      />
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#FDFDFD] text-[#222222] relative overflow-hidden">
      {/* Top Bar - 48px */}
      <div className="h-12 bg-[#FAFAFA] border-b border-[#E5E5E5] flex items-center justify-between px-6 flex-shrink-0">
        <div className="flex items-baseline gap-4">
          <button
            onClick={onBack}
            className="p-1.5 hover:bg-[#F0F0F0] rounded transition-all duration-200"
            title="Back to Proposals List"
          >
            <ArrowLeft className="w-4 h-4 text-[#666666]" />
          </button>
          <input
            type="text"
            value={proposal?.title || ''}
            onChange={(e) => setProposal({ ...proposal, title: e.target.value })}
            className="text-xl font-bold bg-transparent border-none outline-none text-[#111111] hover:text-[#0A1A2F] focus:text-[#0A1A2F] transition-colors"
            style={{ width: `${(proposal?.title?.length || 8) * 12}px` }}
          />
          <span className="text-sm text-[#666666]">
            {proposal?.contacts?.full_name || proposal?.contacts?.company_name || 'Customer'}
          </span>
        </div>

        <div className="text-xs text-[#999999]">
          All changes saved • {lastSaved.toLocaleTimeString()}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowMultiAreaItemModal(true)}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-all duration-200 flex items-center gap-1.5"
            title="Add item to multiple areas"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Item
          </button>
          <button
            onClick={() => setShowExpirationModal(true)}
            className="p-2 hover:bg-[#F0F0F0] rounded-lg transition-all duration-200"
            title="Set Expiration Date"
          >
            <Calendar className="w-4 h-4 text-[#666666]" />
          </button>
          {proposal?.status !== 'designing' && (
            <button
              onClick={() => setShowActivityModal(true)}
              className="p-2 hover:bg-[#F0F0F0] rounded-lg transition-all duration-200"
              title="View Customer Activity"
            >
              <Activity className="w-4 h-4 text-[#666666]" />
            </button>
          )}
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 hover:bg-[#F0F0F0] rounded-lg transition-all duration-200"
            title="Proposal Settings"
          >
            <Settings className="w-4 h-4 text-[#666666]" />
          </button>
          <button
            onClick={() => setShowPreview(true)}
            className="px-3 py-1.5 bg-gray-600 text-white text-sm rounded-lg hover:bg-gray-700 transition-all duration-200 flex items-center gap-1.5"
            title="Preview as Customer"
          >
            <Eye className="w-3.5 h-3.5" />
            Preview
          </button>
          <button className="px-3 py-1.5 bg-[#0A1A2F] text-white text-sm rounded-lg hover:bg-[#0D2342] transition-all duration-200">
            <Share2 className="w-3.5 h-3.5 inline mr-1.5" />
            Share with Customer
          </button>
          <button className="p-2 hover:bg-[#F0F0F0] rounded-lg transition-all duration-200">
            <MoreVertical className="w-4 h-4 text-[#666666]" />
          </button>
        </div>
      </div>

      {/* Global Scope Section */}
      <div className={`bg-white border-b border-[#E5E5E5] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        scopeCollapsed ? 'h-12' : 'h-32'
      }`}>
        <div
          className="h-12 px-6 flex items-center justify-between cursor-pointer"
          onClick={() => setScopeCollapsed(!scopeCollapsed)}
        >
          <span className="text-sm font-medium text-[#666666]">Project Summary</span>
          <ChevronDown className={`w-4 h-4 text-[#999999] transition-transform duration-300 ${
            scopeCollapsed ? 'rotate-180' : ''
          }`} />
        </div>
        {!scopeCollapsed && (
          <div className="px-6 pb-4">
            <textarea
              value={proposal?.notes || ''}
              onChange={(e) => setProposal({ ...proposal, notes: e.target.value })}
              placeholder="Add project overview, scope of work, or special notes for the customer..."
              className="w-full h-16 px-3 py-2 border border-[#E5E5E5] rounded-lg text-sm text-[#222222] resize-none focus:outline-none focus:ring-1 focus:ring-[#0A1A2F] focus:border-transparent transition-all duration-200"
            />
          </div>
        )}
      </div>

      {/* Main Grid */}
      <div className="flex-1 overflow-auto relative" style={{ paddingBottom: footerState === 'full' ? '250px' : footerState === 'compact' ? '48px' : '0px' }}>
        <table className="min-w-full">
          <thead className="sticky top-0 bg-[#FAFAFA] z-20">
            <tr className="border-b border-[#E5E5E5]">
              <th className="text-left py-3 px-4 text-xs font-semibold text-[#666666] uppercase tracking-wide w-8"></th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-[#666666] uppercase tracking-wide w-48">Area</th>
              <th className="text-center py-3 px-4 text-xs font-semibold text-[#666666] uppercase tracking-wide w-20">Qty</th>
              <th className="text-left py-3 px-4 text-xs font-semibold text-[#666666] uppercase tracking-wide">Product / Description</th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-[#666666] uppercase tracking-wide w-28">Cost</th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-[#666666] uppercase tracking-wide w-24">Margin %</th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-[#666666] uppercase tracking-wide w-32">Sell Price</th>
              <th className="text-right py-3 px-4 text-xs font-semibold text-[#666666] uppercase tracking-wide w-32">Total Sell</th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((room) => (
              <React.Fragment key={room.id}>
                {/* Area Header Row */}
                <tr className="bg-[#0A1A2F] h-16">
                  <td colSpan={8} className="px-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-white font-semibold">{room.name}</span>
                        {room.description && (
                          <span className="px-2 py-1 bg-blue-500/20 text-blue-200 text-xs rounded flex items-center gap-1">
                            <FileText className="w-3 h-3" />
                            Scope
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditingScopeRoomId(room.id)}
                          className="text-white/70 hover:text-white text-sm flex items-center gap-1 transition-colors duration-200"
                          title="Edit Scope of Work"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          {room.description ? 'Edit' : 'Add'} Scope
                        </button>
                        <button
                          onClick={() => {
                            setSelectedRoomId(room.id);
                            setShowAddItemModal(true);
                          }}
                          className="text-white/70 hover:text-white text-sm flex items-center gap-1 transition-colors duration-200"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add Item
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>

                {/* Line Items */}
                {room.line_items.map((item) => {
                  const margin = item.unit_price - (item.cost || 0);
                  const marginPercent = item.unit_price > 0 ? (margin / item.unit_price) * 100 : 0;
                  const isHovered = hoveredItemId === item.id;
                  const isSelected = selectedItemId === item.id;

                  return (
                    <tr
                      key={item.id}
                      className={`h-[52px] border-b border-[#F0F0F0] cursor-pointer transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                        isSelected ? 'bg-[#0A1A2F]/5 border-l-2 border-l-[#0A1A2F]' :
                        isHovered ? 'bg-[#0A1A2F]/4 shadow-sm translate-y-[-1px]' :
                        'bg-white hover:bg-[#0A1A2F]/4'
                      }`}
                      onMouseEnter={() => setHoveredItemId(item.id)}
                      onMouseLeave={() => setHoveredItemId(null)}
                      onClick={() => setSelectedItemId(item.id === selectedItemId ? null : item.id)}
                    >
                      <td className="px-4">
                        <GripVertical className="w-4 h-4 text-[#CCCCCC] opacity-0 group-hover:opacity-100" />
                      </td>
                      <td className="px-4 text-sm text-[#999999]">{room.name}</td>
                      <td className="px-4 text-center">
                        <input
                          type="number"
                          value={item.quantity}
                          className="w-16 text-center bg-transparent border-none text-[#222222] font-mono tabular-nums"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td className="px-4">
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <div className="text-sm font-medium text-[#111111]">{item.description}</div>
                            {item.sku && <div className="text-xs text-[#999999] mt-0.5">{item.sku}</div>}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingTechNotesItemId(item.id);
                            }}
                            className={`p-1 hover:bg-orange-100 rounded transition-colors ${
                              item.task_notes ? 'text-orange-600' : 'text-gray-400'
                            }`}
                            title={item.task_notes ? "Has tech notes" : "Add tech notes"}
                          >
                            <Wrench className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 text-right font-mono tabular-nums text-sm text-[#666666]">
                        ${(item.cost || 0).toFixed(2)}
                      </td>
                      <td className={`px-4 text-right font-mono tabular-nums text-sm font-medium ${
                        marginPercent >= 40 ? 'text-[#227700]' : marginPercent >= 25 ? 'text-[#666666]' : 'text-[#CC3300]'
                      }`}>
                        {marginPercent.toFixed(1)}%
                      </td>
                      <td className="px-4 text-right font-mono tabular-nums text-sm text-[#222222]">
                        ${item.unit_price.toFixed(2)}
                      </td>
                      <td className="px-4 text-right font-mono tabular-nums font-semibold text-[#111111]">
                        ${item.line_total.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}

            {/* Add Area Row */}
            <tr className="h-16 bg-[#FAFAFA] border-t border-[#E5E5E5]">
              <td colSpan={8} className="px-4">
                <button
                  onClick={() => setShowAddAreaModal(true)}
                  className="w-full text-left text-[#666666] hover:text-[#0A1A2F] flex items-center gap-2 transition-colors duration-200"
                >
                  <Plus className="w-4 h-4" />
                  <span className="text-sm font-medium">Add Area</span>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Detail Card - Slides from Right */}
      <div className={`fixed top-0 right-0 w-full sm:w-[380px] h-full bg-white shadow-2xl transition-transform duration-[240ms] ease-[cubic-bezier(0.16,1,0.3,1)] z-30 ${
        detailItem ? 'translate-x-0' : 'translate-x-full'
      }`}>
        {detailItem && (
          <div className="h-full flex flex-col">
            {/* Hero Image */}
            <div className="h-48 bg-gradient-to-br from-[#F5F5F5] to-[#E5E5E5] flex items-center justify-center">
              {detailItem.products?.image_url ? (
                <img src={detailItem.products.image_url} alt={detailItem.description} className="w-full h-full object-cover" />
              ) : (
                <Image className="w-16 h-16 text-[#CCCCCC]" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6 space-y-6">
              <div>
                <h3 className="text-lg font-bold text-[#111111] mb-1">{detailItem.description}</h3>
                {detailItem.sku && (
                  <p className="text-sm text-[#999999]">SKU: {detailItem.sku}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-xs text-[#999999] uppercase tracking-wide mb-1">Quantity</div>
                  <div className="font-mono text-[#222222]">{detailItem.quantity}</div>
                </div>
                <div>
                  <div className="text-xs text-[#999999] uppercase tracking-wide mb-1">Unit</div>
                  <div className="font-mono text-[#222222]">{detailItem.unit || 'EA'}</div>
                </div>
              </div>

              <div className="border-t border-[#E5E5E5] pt-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[#666666]">Cost per unit</span>
                  <span className="font-mono text-[#222222]">{formatCurrency(detailItem.cost || 0)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[#666666]">Sell price</span>
                  <span className="font-mono font-semibold text-[#111111]">{formatCurrency(detailItem.unit_price)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[#666666]">Margin</span>
                  <span className="font-mono font-semibold text-[#227700]">
                    {detailItem.unit_price > 0 ? (((detailItem.unit_price - (detailItem.cost || 0)) / detailItem.unit_price) * 100).toFixed(1) : 0}%
                  </span>
                </div>
              </div>

              <div className="border-t border-[#E5E5E5] pt-4">
                <div className="text-xs text-[#999999] uppercase tracking-wide mb-2">Line Total</div>
                <div className="text-3xl font-bold text-[#0A1A2F] font-mono">{formatCurrency(detailItem.line_total)}</div>
              </div>

              {selectedItem && (
                <div className="space-y-2">
                  <button
                    onClick={() => setEditingTaskItemId(detailItem.id)}
                    className="w-full py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-all duration-200 text-sm font-medium flex items-center justify-center gap-2"
                  >
                    <Wrench className="w-4 h-4" />
                    {detailItem.task_notes ? 'Edit' : 'Add'} Install Instructions
                  </button>
                  <button
                    onClick={() => setSelectedItemId(null)}
                    className="w-full py-2.5 bg-[#F5F5F5] hover:bg-[#E5E5E5] text-[#222222] rounded-lg transition-all duration-200 text-sm font-medium"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* The Money Bar - Footer */}
      <div className={`fixed bottom-0 left-0 right-0 bg-[#0A1A2F] text-white transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] z-20 ${
        footerState === 'full' ? 'h-[250px]' : footerState === 'compact' ? 'h-12' : 'h-0'
      }`}>
        {footerState === 'compact' && (
          <div className="h-12 px-6 flex items-center justify-between">
            <div className="flex items-center gap-8 font-mono">
              <div>
                <span className="text-white/60 text-xs mr-2">Total Sell</span>
                <span className="text-white font-bold text-lg">{formatCurrency(totalSell)}</span>
              </div>
              <div>
                <span className="text-white/60 text-xs mr-2">Cost</span>
                <span className="text-white">{formatCurrency(totalCost)}</span>
              </div>
              <div>
                <span className="text-white/60 text-xs mr-2">Margin</span>
                <span className="text-[#88DD66] font-semibold">{totalMarginPercent.toFixed(1)}%</span>
              </div>
              <div>
                <span className="text-white/60 text-xs mr-2">Profit</span>
                <span className="text-[#88DD66] font-semibold">{formatCurrency(totalProfit)}</span>
              </div>
            </div>
            <button
              onClick={() => setFooterState(footerState === 'compact' ? 'full' : 'compact')}
              className="p-2 hover:bg-white/10 rounded transition-colors duration-200"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
          </div>
        )}

        {footerState === 'full' && (
          <div className="h-full flex flex-col">
            <div className="h-12 px-6 flex items-center justify-between border-b border-white/10">
              <div className="flex gap-6">
                <button className="text-sm font-medium text-white border-b-2 border-white pb-3">Overview</button>
                <button className="text-sm text-white/60 hover:text-white pb-3 transition-colors duration-200">By Area</button>
                <button className="text-sm text-white/60 hover:text-white pb-3 transition-colors duration-200">By Class</button>
                <button className="text-sm text-white/60 hover:text-white pb-3 transition-colors duration-200">By Labor Phase</button>
              </div>
              <button
                onClick={() => setFooterState('compact')}
                className="p-2 hover:bg-white/10 rounded transition-colors duration-200"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 p-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                <div className="text-center">
                  <div className="text-xs text-white/60 uppercase tracking-wide mb-2">Total Sell</div>
                  <div className="text-4xl font-bold font-mono">{formatCurrency(totalSell)}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-white/60 uppercase tracking-wide mb-2">Total Cost</div>
                  <div className="text-4xl font-bold font-mono">{formatCurrency(totalCost)}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-white/60 uppercase tracking-wide mb-2">Margin %</div>
                  <div className="text-4xl font-bold font-mono text-[#88DD66]">{totalMarginPercent.toFixed(1)}%</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-white/60 uppercase tracking-wide mb-2">Profit</div>
                  <div className="text-4xl font-bold font-mono text-[#88DD66]">{formatCurrency(totalProfit)}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Floating Show Totals Button (when footer hidden) */}
      {footerState === 'hidden' && (
        <button
          onClick={() => setFooterState('compact')}
          className="fixed bottom-4 right-4 px-4 py-2 bg-[#0A1A2F] text-white text-sm rounded-lg shadow-lg hover:shadow-xl transition-all duration-200"
        >
          Show Totals
        </button>
      )}

      {/* Add Area Modal */}
      {showAddAreaModal && (
        <AddAreaModal
          onClose={() => setShowAddAreaModal(false)}
          onAdd={handleAddArea}
        />
      )}

      {/* Add Item Modal */}
      {showAddItemModal && selectedRoomId && (
        <AddLineItemModal
          proposalId={proposalId}
          roomId={selectedRoomId}
          onClose={() => {
            setShowAddItemModal(false);
            setSelectedRoomId(null);
          }}
          onAdd={(itemData) => handleAddItem(selectedRoomId, itemData)}
        />
      )}

      {/* Add Item to Multiple Areas Modal */}
      {showMultiAreaItemModal && (
        <AddItemToMultipleAreasModal
          proposalId={proposalId}
          rooms={rooms}
          onClose={() => setShowMultiAreaItemModal(false)}
          onAdd={handleAddItemToMultipleAreas}
        />
      )}

      {/* Expiration Date Modal */}
      {showExpirationModal && (
        <ExpirationDateModal
          proposalId={proposalId}
          currentExpirationDate={proposal?.expiration_date}
          onClose={() => setShowExpirationModal(false)}
          onSave={async (date) => {
            try {
              const { error } = await supabase
                .from('proposals')
                .update({ expiration_date: date })
                .eq('id', proposalId);

              if (error) throw error;
              setProposal({ ...proposal, expiration_date: date });
              setShowExpirationModal(false);
              alert('Expiration date updated successfully');
            } catch (error) {
              console.error('Error updating expiration date:', error);
              alert('Failed to update expiration date');
            }
          }}
        />
      )}

      {/* Activity Modal */}
      {showActivityModal && (
        <ProposalActivityModal
          proposalId={proposalId}
          onClose={() => setShowActivityModal(false)}
        />
      )}

      {/* Area Scope Editor */}
      {editingScopeRoomId && (() => {
        const room = rooms.find(r => r.id === editingScopeRoomId);
        return room ? (
          <AreaScopeEditor
            roomId={room.id}
            roomName={room.name}
            currentDescription={room.description}
            onClose={() => setEditingScopeRoomId(null)}
            onSave={(description) => {
              setRooms(rooms.map(r =>
                r.id === room.id ? { ...r, description } : r
              ));
            }}
          />
        ) : null;
      })()}

      {/* Install Task Editor */}
      {editingTaskItemId && (() => {
        const item = rooms.flatMap(r => r.line_items).find(i => i.id === editingTaskItemId);
        return item ? (
          <InstallTaskEditor
            lineItemId={item.id}
            itemDescription={item.description}
            currentTaskNotes={item.task_notes || null}
            currentShowTaskNotes={item.show_task_notes ?? false}
            onClose={() => setEditingTaskItemId(null)}
            onSave={(taskNotes) => {
              setRooms(rooms.map(r => ({
                ...r,
                line_items: r.line_items.map(i =>
                  i.id === item.id ? { ...i, task_notes: taskNotes } : i
                )
              })));
            }}
          />
        ) : null;
      })()}

      {/* Labor & Tech Notes Editor */}
      {editingTechNotesItemId && (() => {
        const item = rooms.flatMap(r => r.line_items).find(i => i.id === editingTechNotesItemId);
        return item ? (
          <TwoPhaseLaborEditor
            lineItemId={item.id}
            itemDescription={item.description}
            onClose={() => setEditingTechNotesItemId(null)}
            onSave={() => {
              setEditingTechNotesItemId(null);
              loadData(); // Reload to get updated tech notes
            }}
          />
        ) : null;
      })()}
    </div>
  );
}

function AddAreaModal({ onClose, onAdd }: { onClose: () => void; onAdd: (name: string) => void }) {
  const [areaTemplates, setAreaTemplates] = useState<{ id: string; name: string }[]>([]);
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [customAreaName, setCustomAreaName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAreaTemplates();
  }, []);

  async function loadAreaTemplates() {
    try {
      const { data, error } = await supabase
        .from('proposal_area_templates')
        .select('id, name')
        .order('sort_order');

      if (error) throw error;
      setAreaTemplates(data || []);
    } catch (error) {
      console.error('Error loading area templates:', error);
    } finally {
      setLoading(false);
    }
  }

  function toggleArea(areaName: string) {
    setSelectedAreas(prev =>
      prev.includes(areaName)
        ? prev.filter(a => a !== areaName)
        : [...prev, areaName]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Add selected areas
    selectedAreas.forEach(areaName => onAdd(areaName));

    // Add custom area if provided
    if (customAreaName.trim()) {
      onAdd(customAreaName.trim());
    }

    onClose();
  }

  const hasSelection = selectedAreas.length > 0 || customAreaName.trim();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold text-[#111111] mb-4">Add Areas</h2>

        {loading ? (
          <div className="py-8 text-center text-gray-500">Loading areas...</div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              {/* Template Areas */}
              {areaTemplates.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select from templates:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {areaTemplates.map(template => (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => toggleArea(template.name)}
                        className={`px-4 py-2 border rounded-lg text-left transition-colors ${
                          selectedAreas.includes(template.name)
                            ? 'bg-[#0A1A2F] text-white border-[#0A1A2F]'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {template.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom Area */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Or enter custom area:
                </label>
                <input
                  type="text"
                  value={customAreaName}
                  onChange={(e) => setCustomAreaName(e.target.value)}
                  placeholder="Enter custom area name"
                  className="w-full px-4 py-3 border border-[#E5E5E5] rounded-lg text-[#222222] focus:outline-none focus:ring-2 focus:ring-[#0A1A2F] focus:border-transparent"
                />
              </div>

              {selectedAreas.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-blue-900 mb-1">
                    {selectedAreas.length} area{selectedAreas.length !== 1 ? 's' : ''} selected:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selectedAreas.map(area => (
                      <span key={area} className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                        {area}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2.5 bg-[#F5F5F5] hover:bg-[#E5E5E5] text-[#222222] rounded-lg transition-colors duration-200 font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!hasSelection}
                className="flex-1 px-4 py-2.5 bg-[#0A1A2F] hover:bg-[#0D2342] text-white rounded-lg transition-colors duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Area{selectedAreas.length > 1 || (selectedAreas.length === 1 && customAreaName.trim()) ? 's' : ''}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function AddLineItemModal({
  proposalId,
  roomId,
  onClose,
  onAdd
}: {
  proposalId: string;
  roomId: string;
  onClose: () => void;
  onAdd: (data: any) => void;
}) {
  const [formData, setFormData] = useState({
    description: '',
    sku: '',
    quantity: 1,
    unit: 'EA',
    cost: 0,
    unit_price: 0
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (formData.description.trim()) {
      onAdd(formData);
    }
  }

  const margin = formData.unit_price - formData.cost;
  const marginPercent = formData.unit_price > 0 ? (margin / formData.unit_price) * 100 : 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold text-[#111111] mb-4">Add Line Item</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#666666] mb-1">Description</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Product or service description"
              className="w-full px-4 py-2.5 border border-[#E5E5E5] rounded-lg text-[#222222] focus:outline-none focus:ring-2 focus:ring-[#0A1A2F] focus:border-transparent"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#666666] mb-1">SKU (optional)</label>
              <input
                type="text"
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                placeholder="Product SKU"
                className="w-full px-4 py-2.5 border border-[#E5E5E5] rounded-lg text-[#222222] focus:outline-none focus:ring-2 focus:ring-[#0A1A2F] focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#666666] mb-1">Unit</label>
              <select
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                className="w-full px-4 py-2.5 border border-[#E5E5E5] rounded-lg text-[#222222] focus:outline-none focus:ring-2 focus:ring-[#0A1A2F] focus:border-transparent"
              >
                <option value="EA">Each</option>
                <option value="SF">Square Foot</option>
                <option value="LF">Linear Foot</option>
                <option value="HR">Hour</option>
                <option value="BOX">Box</option>
                <option value="GAL">Gallon</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#666666] mb-1">Quantity</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) || 0 })}
                className="w-full px-4 py-2.5 border border-[#E5E5E5] rounded-lg text-[#222222] focus:outline-none focus:ring-2 focus:ring-[#0A1A2F] focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#666666] mb-1">Cost</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.cost}
                onChange={(e) => setFormData({ ...formData, cost: parseFloat(e.target.value) || 0 })}
                className="w-full px-4 py-2.5 border border-[#E5E5E5] rounded-lg text-[#222222] focus:outline-none focus:ring-2 focus:ring-[#0A1A2F] focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#666666] mb-1">Sell Price</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.unit_price}
                onChange={(e) => setFormData({ ...formData, unit_price: parseFloat(e.target.value) || 0 })}
                className="w-full px-4 py-2.5 border border-[#E5E5E5] rounded-lg text-[#222222] focus:outline-none focus:ring-2 focus:ring-[#0A1A2F] focus:border-transparent"
              />
            </div>
          </div>

          <div className="bg-[#FAFAFA] p-4 rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-[#666666]">Margin:</span>
              <span className={`font-mono font-semibold ${marginPercent >= 40 ? 'text-[#227700]' : marginPercent >= 25 ? 'text-[#666666]' : 'text-[#CC3300]'}`}>
                {marginPercent.toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#666666]">Line Total:</span>
              <span className="font-mono font-bold text-[#0A1A2F] text-lg">
                ${(formData.quantity * formData.unit_price).toFixed(2)}
              </span>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-[#F5F5F5] hover:bg-[#E5E5E5] text-[#222222] rounded-lg transition-colors duration-200 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!formData.description.trim()}
              className="flex-1 px-4 py-2.5 bg-[#0A1A2F] hover:bg-[#0D2342] text-white rounded-lg transition-colors duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add Item
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddItemToMultipleAreasModal({
  proposalId,
  rooms,
  onClose,
  onAdd
}: {
  proposalId: string;
  rooms: RoomWithItems[];
  onClose: () => void;
  onAdd: (itemData: any, selectedRoomIds: string[]) => void;
}) {
  const [formData, setFormData] = useState({
    description: '',
    sku: '',
    quantity: 1,
    unit: 'EA',
    cost: 0,
    unit_price: 0
  });
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>([]);

  function toggleRoom(roomId: string) {
    setSelectedRoomIds(prev =>
      prev.includes(roomId)
        ? prev.filter(id => id !== roomId)
        : [...prev, roomId]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (formData.description.trim() && selectedRoomIds.length > 0) {
      onAdd(formData, selectedRoomIds);
    }
  }

  const margin = formData.unit_price - formData.cost;
  const marginPercent = formData.unit_price > 0 ? (margin / formData.unit_price) * 100 : 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-3xl p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold text-[#111111] mb-4">Add Item to Multiple Areas</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Item Details */}
          <div className="space-y-4 pb-4 border-b border-gray-200">
            <div>
              <label className="block text-sm font-medium text-[#666666] mb-1">Description</label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Product or service description"
                className="w-full px-4 py-2.5 border border-[#E5E5E5] rounded-lg text-[#222222] focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#666666] mb-1">SKU (optional)</label>
                <input
                  type="text"
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  placeholder="Product SKU"
                  className="w-full px-4 py-2.5 border border-[#E5E5E5] rounded-lg text-[#222222] focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#666666] mb-1">Unit</label>
                <select
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  className="w-full px-4 py-2.5 border border-[#E5E5E5] rounded-lg text-[#222222] focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                >
                  <option value="EA">Each</option>
                  <option value="SF">Square Foot</option>
                  <option value="LF">Linear Foot</option>
                  <option value="HR">Hour</option>
                  <option value="BOX">Box</option>
                  <option value="GAL">Gallon</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#666666] mb-1">Quantity</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-2.5 border border-[#E5E5E5] rounded-lg text-[#222222] focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#666666] mb-1">Cost</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.cost}
                  onChange={(e) => setFormData({ ...formData, cost: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-2.5 border border-[#E5E5E5] rounded-lg text-[#222222] focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#666666] mb-1">Sell Price</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.unit_price}
                  onChange={(e) => setFormData({ ...formData, unit_price: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-2.5 border border-[#E5E5E5] rounded-lg text-[#222222] focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                />
              </div>
            </div>

            <div className="bg-[#FAFAFA] p-4 rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-[#666666]">Margin:</span>
                <span className={`font-mono font-semibold ${marginPercent >= 40 ? 'text-[#227700]' : marginPercent >= 25 ? 'text-[#666666]' : 'text-[#CC3300]'}`}>
                  {marginPercent.toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#666666]">Line Total:</span>
                <span className="font-mono font-bold text-blue-600 text-lg">
                  ${(formData.quantity * formData.unit_price).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Area Selection */}
          <div>
            <label className="block text-sm font-medium text-[#666666] mb-2">
              Select areas to add this item to:
            </label>
            {rooms.length === 0 ? (
              <div className="text-center py-8 text-gray-500 border border-dashed border-gray-300 rounded-lg">
                No areas yet. Add areas to the proposal first.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 border border-gray-200 rounded-lg">
                {rooms.map(room => (
                  <button
                    key={room.id}
                    type="button"
                    onClick={() => toggleRoom(room.id)}
                    className={`px-4 py-2 border rounded-lg text-left transition-colors ${
                      selectedRoomIds.includes(room.id)
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {room.name}
                  </button>
                ))}
              </div>
            )}

            {selectedRoomIds.length > 0 && (
              <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm font-medium text-blue-900 mb-1">
                  {selectedRoomIds.length} area{selectedRoomIds.length !== 1 ? 's' : ''} selected
                </p>
                <p className="text-xs text-blue-700">
                  Item will be added {selectedRoomIds.length} time{selectedRoomIds.length !== 1 ? 's' : ''}
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-[#F5F5F5] hover:bg-[#E5E5E5] text-[#222222] rounded-lg transition-colors duration-200 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!formData.description.trim() || selectedRoomIds.length === 0}
              className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add to {selectedRoomIds.length || 0} Area{selectedRoomIds.length !== 1 ? 's' : ''}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ExpirationDateModal({
  proposalId,
  currentExpirationDate,
  onClose,
  onSave
}: {
  proposalId: string;
  currentExpirationDate: string | null;
  onClose: () => void;
  onSave: (date: string | null) => void;
}) {
  const [expirationDate, setExpirationDate] = useState(
    currentExpirationDate
      ? new Date(currentExpirationDate).toISOString().split('T')[0]
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [noExpiration, setNoExpiration] = useState(!currentExpirationDate);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave(noExpiration ? null : expirationDate);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center gap-3 mb-4">
          <Calendar className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-bold text-gray-900">Set Expiration Date</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-900">
              Set when this proposal expires. After this date, customers cannot accept it from the portal.
            </p>
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={noExpiration}
                onChange={(e) => setNoExpiration(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">No expiration date</span>
            </label>

            {!noExpiration && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Expiration Date
                </label>
                <input
                  type="date"
                  value={expirationDate}
                  onChange={(e) => setExpirationDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  required={!noExpiration}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Default is 30 days from submission
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProposalActivityModal({
  proposalId,
  onClose
}: {
  proposalId: string;
  onClose: () => void;
}) {
  const [activity, setActivity] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadActivity();
  }, [proposalId]);

  async function loadActivity() {
    try {
      const [activityRes, summaryRes] = await Promise.all([
        supabase
          .from('proposal_activity')
          .select('*')
          .eq('proposal_id', proposalId)
          .order('created_at', { ascending: false }),
        supabase.rpc('get_proposal_activity_summary', { p_proposal_id: proposalId })
      ]);

      if (activityRes.error) throw activityRes.error;
      if (summaryRes.error) console.error('Summary error:', summaryRes.error);

      setActivity(activityRes.data || []);
      setSummary(summaryRes.data?.[0] || null);

      // Mark activity as viewed to clear the "New" indicator
      try {
        const { error: markError } = await supabase.rpc('mark_proposal_activity_viewed', {
          p_proposal_id: proposalId
        });

        if (markError) {
          console.error('Failed to mark activity as viewed:', markError);
        }
      } catch (markError) {
        console.error('Error marking activity as viewed:', markError);
      }
    } catch (error) {
      console.error('Error loading activity:', error);
    } finally {
      setLoading(false);
    }
  }

  function formatDuration(seconds: number) {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  function getActivityIcon(type: string) {
    switch (type) {
      case 'viewed':
        return '👁️';
      case 'downloaded':
        return '📥';
      case 'shared':
        return '📤';
      case 'accepted':
        return '✅';
      case 'declined':
        return '❌';
      case 'time_spent':
        return '⏱️';
      default:
        return '📄';
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-bold text-gray-900">Customer Activity</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <span className="text-2xl text-gray-400">×</span>
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <div className="text-gray-500">Loading activity...</div>
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-6">
            {summary && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-blue-600">
                    {summary.total_views || 0}
                  </div>
                  <div className="text-sm text-blue-900">Total Views</div>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-green-600">
                    {summary.unique_sessions || 0}
                  </div>
                  <div className="text-sm text-green-900">Unique Sessions</div>
                </div>
                <div className="bg-purple-50 rounded-lg p-4">
                  <div className="text-2xl font-bold text-purple-600">
                    {formatDuration(summary.total_time_seconds || 0)}
                  </div>
                  <div className="text-sm text-purple-900">Time Spent</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm font-medium text-gray-600">Last Viewed</div>
                  <div className="text-sm text-gray-900">
                    {summary.last_viewed_at
                      ? new Date(summary.last_viewed_at).toLocaleDateString()
                      : 'Never'}
                  </div>
                </div>
              </div>
            )}

            <h3 className="text-lg font-semibold text-gray-900 mb-4">Activity Timeline</h3>

            {activity.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-gray-400 mb-2">No activity yet</div>
                <p className="text-sm text-gray-500">
                  Activity will appear here once the customer views the proposal
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {activity.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg"
                  >
                    <div className="text-2xl">{getActivityIcon(item.activity_type)}</div>
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 capitalize">
                        {item.activity_type.replace('_', ' ')}
                      </div>
                      <div className="text-sm text-gray-600">
                        {new Date(item.created_at).toLocaleString()}
                      </div>
                      {item.duration_seconds > 0 && (
                        <div className="text-sm text-gray-500 mt-1">
                          Duration: {formatDuration(item.duration_seconds)}
                        </div>
                      )}
                      {item.user_agent && (
                        <div className="text-xs text-gray-400 mt-1 truncate">
                          {item.user_agent}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function CustomerPreview({
  proposalId,
  onBack
}: {
  proposalId: string;
  onBack: () => void;
}) {
  const [proposal, setProposal] = useState<any>(null);
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProposal();
  }, [proposalId]);

  async function loadProposal() {
    try {
      const { data: proposalData, error: proposalError } = await supabase
        .from('proposals')
        .select(`
          *,
          contacts:contacts!proposals_contact_id_fkey(*)
        `)
        .eq('id', proposalId)
        .single();

      if (proposalError) throw proposalError;

      const { data: roomsData, error: roomsError } = await supabase
        .from('proposal_rooms')
        .select(`
          *,
          line_items:proposal_line_items(*)
        `)
        .eq('proposal_id', proposalId)
        .order('sort_order');

      if (roomsError) throw roomsError;

      setProposal(proposalData);
      setRooms(roomsData || []);
    } catch (error) {
      console.error('Error loading proposal:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading preview...</div>
      </div>
    );
  }

  const allItems = rooms.flatMap(r => r.line_items || []);
  const total = allItems.reduce((sum, item) => sum + (item.line_total || 0), 0);

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Customer Preview</h1>
            <p className="text-sm text-gray-500">This is how customers see your proposal</p>
          </div>
        </div>
        <div className="px-4 py-2 bg-blue-50 text-blue-700 text-sm font-medium rounded-lg border border-blue-200">
          Preview Mode
        </div>
      </div>

      {/* Proposal Content - Customer View */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto">
          {/* Proposal Header */}
          <div className="bg-white rounded-lg shadow-sm p-8 mb-6">
            <div className="border-b border-gray-200 pb-6 mb-6">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">{proposal?.title}</h2>
              <div className="flex items-center justify-between text-sm text-gray-600">
                <div>
                  <span className="font-medium">Proposal #:</span> {proposal?.proposal_number}
                </div>
                <div>
                  <span className="font-medium">Prepared for:</span> {proposal?.contacts?.full_name || proposal?.contacts?.company_name}
                </div>
                <div>
                  <span className="font-medium">Date:</span> {new Date(proposal?.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>

            {/* Project Summary */}
            {proposal?.notes && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Project Overview</h3>
                <p className="text-gray-700 whitespace-pre-wrap">{proposal.notes}</p>
              </div>
            )}

            {/* Areas and Items */}
            {rooms.map((room) => (
              <div key={room.id} className="mb-6">
                <div className="bg-blue-600 text-white px-4 py-3 rounded-t-lg">
                  <h3 className="text-lg font-semibold">{room.name}</h3>
                </div>
                <div className="border border-t-0 border-gray-200 rounded-b-lg overflow-hidden">
                  <table className="min-w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left py-2 px-4 text-sm font-medium text-gray-700">Description</th>
                        <th className="text-center py-2 px-4 text-sm font-medium text-gray-700 w-20">Qty</th>
                        <th className="text-right py-2 px-4 text-sm font-medium text-gray-700 w-32">Price</th>
                        <th className="text-right py-2 px-4 text-sm font-medium text-gray-700 w-32">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(room.line_items || []).map((item: any) => (
                        <tr key={item.id} className="border-t border-gray-200">
                          <td className="py-3 px-4 text-gray-800">{item.description}</td>
                          <td className="py-3 px-4 text-center text-gray-800">{item.quantity}</td>
                          <td className="py-3 px-4 text-right text-gray-800">
                            ${item.unit_price?.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right font-medium text-gray-900">
                            ${item.line_total?.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            {/* Total */}
            <div className="border-t-2 border-gray-300 pt-4 mt-6">
              <div className="flex justify-end items-center">
                <span className="text-lg font-semibold text-gray-700 mr-4">Total Investment:</span>
                <span className="text-3xl font-bold text-blue-600">{formatCurrency(total)}</span>
              </div>
            </div>
          </div>

          {/* Customer Actions (Simulated) */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Customer Actions</h3>
            <div className="flex gap-4">
              <button
                disabled
                className="flex-1 px-6 py-3 bg-green-600 text-white font-semibold rounded-lg opacity-50 cursor-not-allowed"
              >
                ✓ Accept Proposal
              </button>
              <button
                disabled
                className="flex-1 px-6 py-3 bg-gray-600 text-white font-semibold rounded-lg opacity-50 cursor-not-allowed"
              >
                📥 Download PDF
              </button>
              <button
                disabled
                className="flex-1 px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg opacity-50 cursor-not-allowed"
              >
                💬 Ask Question
              </button>
            </div>
            <p className="text-xs text-gray-500 text-center mt-3">
              These buttons are disabled in preview mode
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
