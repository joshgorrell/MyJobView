import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { Package, Wrench, Tag, LayoutGrid, Globe, FileText, ChevronDown, ChevronRight, CreditCard as Edit2, Check, X, Plus, Eye, EyeOff, Trash2, Save, Lock, Receipt, TrendingDown, TrendingUp, Percent as PercentIcon, GripVertical, Columns2 as Columns, Wifi, WifiOff, Loader2, Settings, ChevronDown as ChevronDownSm, RotateCcw, ShieldCheck, Pencil } from 'lucide-react';
import type { SalesOrderFull } from './SalesOrderDetail';
import ConfirmModal from '../ui/ConfirmModal';
import { PortalProposalDetail } from '../Portal/PortalProposalDetail';
import { SalesOrderLineItemModal } from './SalesOrderLineItemModal';

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  line_total: number;
  cost: number | null;
  item_type: string | null;
  labor_hours: number | null;
  labor_rate: number | null;
  labor_total: number | null;
  task_notes: string | null;
  show_task_notes: boolean;
  is_hidden: boolean;
  parent_item_id: string | null;
  display_mode: string | null;
  is_taxable: boolean;
  sort_order: number;
  room_id: string | null;
  product_id: string | null;
  products?: {
    name: string;
    sku: string | null;
    manufacturers?: { name: string } | null;
  } | null;
  proposal_classes?: { name: string; color: string } | null;
  labor_phase_id: string | null;
  labor_phases?: { id: string; name: string } | null;
  accessories?: LineItem[];
  _coAction?: 'add' | 'remove' | 'modify_quantity' | 'modify_price' | null;
}

interface Room {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  show_scope: boolean;
  line_items: LineItem[];
  expanded: boolean;
}

interface ProposalTotals {
  subtotal: number;
  parts_total: number | null;
  labor_total: number | null;
  tax_amount: number;
  total: number;
  tax_rate: number;
  discount_amount: number;
  discount_percent: number;
  project_management_amount: number;
  project_management_percent: number;
  project_design_amount: number;
  project_design_percent: number;
  system_design_amount: number;
  system_design_percent: number;
  credit_card_fee_amount: number;
  credit_card_fee_percent: number;
  misc_parts_amount: number;
  misc_parts_percent: number;
  custom_modifier_1_amount: number;
  custom_modifier_1_percent: number;
  custom_modifier_2_amount: number;
  custom_modifier_2_percent: number;
  deposit_amount: number;
  deposit_percent: number;
}

interface ProposalSettings {
  id: string;
  custom_modifier_1_label: string | null;
  custom_modifier_2_label: string | null;
  scope_of_work: string | null;
  system_design_percent: number | null;
  credit_card_fee_percent: number | null;
  misc_parts_percent: number | null;
}

interface PortalTemplate {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  is_personal: boolean;
  // line item columns
  show_quantity: boolean;
  show_unit_price: boolean;
  show_line_item_total: boolean;
  show_manufacturer: boolean;
  show_sku: boolean;
  show_model_number: boolean;
  // area / room
  show_area_descriptions: boolean;
  show_area_subtotals: boolean;
  show_area_names: boolean;
  // labor
  show_labor_hours: boolean;
  show_labor_rate: boolean;
  show_labor_total: boolean;
  // tax / totals
  show_tax_breakdown: boolean;
  show_subtotal: boolean;
  // misc
  show_scope_of_work: boolean;
}

const ALL_SHOWING: PortalTemplate = {
  id: '',
  name: 'Show All',
  description: null,
  is_default: false,
  is_personal: false,
  show_quantity: true,
  show_unit_price: true,
  show_line_item_total: true,
  show_manufacturer: true,
  show_sku: true,
  show_model_number: true,
  show_area_descriptions: true,
  show_area_subtotals: true,
  show_area_names: true,
  show_labor_hours: true,
  show_labor_rate: true,
  show_labor_total: true,
  show_tax_breakdown: true,
  show_subtotal: true,
  show_scope_of_work: true,
};

interface SalesOrderScopeTabProps {
  order: SalesOrderFull;
  onRefresh?: () => void;
}

function getRoomItemsSubtotal(room: Room): { parts: number; labor: number } {
  const visibleItems = room.line_items.filter(i => !i.is_hidden);
  const parts = visibleItems.reduce((s, i) => {
    const accParts = (i.accessories || []).filter(a => !a.is_hidden).reduce((as, a) => as + (a.line_total || 0), 0);
    return s + (i.line_total || 0) + accParts;
  }, 0);
  const labor = visibleItems.reduce((s, i) => {
    const accLabor = (i.accessories || []).filter(a => !a.is_hidden).reduce((as, a) => as + (a.labor_total || 0), 0);
    return s + (i.labor_total || 0) + accLabor;
  }, 0);
  return { parts, labor };
}

function computeRoomTotal(
  itemsSubtotal: number,
  allRoomsSubtotal: number,
  totals: ProposalTotals | null,
): { modifiersTotal: number; taxTotal: number; areaTotal: number } {
  if (!totals || allRoomsSubtotal === 0) {
    return { modifiersTotal: 0, taxTotal: 0, areaTotal: itemsSubtotal };
  }
  const ratio = itemsSubtotal / allRoomsSubtotal;
  const modifiers =
    -(totals.discount_amount || 0) +
    (totals.project_management_amount || 0) +
    (totals.project_design_amount || 0) +
    (totals.system_design_amount || 0) +
    (totals.credit_card_fee_amount || 0) +
    (totals.misc_parts_amount || 0) +
    (totals.custom_modifier_1_amount || 0) +
    (totals.custom_modifier_2_amount || 0);
  const modifiersTotal = modifiers * ratio;
  const taxTotal = (totals.tax_amount || 0) * ratio;
  return { modifiersTotal, taxTotal, areaTotal: itemsSubtotal + modifiersTotal + taxTotal };
}

export function SalesOrderScopeTab({ order, onRefresh }: SalesOrderScopeTabProps) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [proposalTotals, setProposalTotals] = useState<ProposalTotals | null>(null);
  const [proposalSettings, setProposalSettings] = useState<ProposalSettings | null>(null);
  const [viewMode, setViewMode] = useState<'portal' | 'grid'>('portal');
  const [portalVisible, setPortalVisible] = useState(false);
  const [togglingPortal, setTogglingPortal] = useState(false);
  const [showPortalPreview, setShowPortalPreview] = useState(false);

  // Portal template state
  const [portalTemplate, setPortalTemplate] = useState<PortalTemplate | null>(null);
  const [approvedTemplate, setApprovedTemplate] = useState<PortalTemplate | null>(null);
  const [proposalTemplateId, setProposalTemplateId] = useState<string | null>(null);
  const [soTemplateOverrideId, setSoTemplateOverrideId] = useState<string | null>(null);
  const [availableTemplates, setAvailableTemplates] = useState<PortalTemplate[]>([]);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  // Warning state when rep selects a template different from what customer approved

  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [roomScopeText, setRoomScopeText] = useState('');
  const [roomShowScope, setRoomShowScope] = useState(false);
  const [savingRoomScope, setSavingRoomScope] = useState(false);

  const [editingTaskItemId, setEditingTaskItemId] = useState<string | null>(null);
  const [taskNotesText, setTaskNotesText] = useState('');
  const [taskShowNotes, setTaskShowNotes] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [laborPhases, setLaborPhases] = useState<{ id: string; name: string }[]>([]);

  // Line item modal state
  const [lineItemModal, setLineItemModal] = useState<{ id: string; mode: 'view' | 'edit' } | null>(null);
  const [scopeError, setScopeError] = useState<string | null>(null);

  const roomScopeRef = useRef<HTMLTextAreaElement>(null);

  const loadScope = useCallback(async () => {
    try {
      setLoading(true);
      setScopeError(null);

      const TEMPLATE_COLS = `id, name, description, is_default, is_personal,
        show_quantity, show_unit_price, show_line_item_total,
        show_manufacturer, show_sku, show_model_number,
        show_area_descriptions, show_area_subtotals, show_area_names,
        show_labor_hours, show_labor_rate, show_labor_total,
        show_tax_breakdown, show_subtotal, show_scope_of_work`;

      const [roomsRes, itemsRes, proposalRes, settingsRes, soRes, templatesRes] = await Promise.all([
        supabase
          .from('proposal_rooms')
          .select('*')
          .eq('proposal_id', order.proposal_id)
          .order('sort_order'),
        supabase
          .from('proposal_line_items')
          .select(`*, product_id, products(name, sku, manufacturers(name)), proposal_classes(name, color), labor_phases(id, name)`)
          .eq('proposal_id', order.proposal_id)
          .order('sort_order'),
        supabase
          .from('proposals')
          .select(`subtotal, parts_total, labor_total, tax_amount, total, tax_rate,
            discount_amount, discount_percent, project_management_amount, project_management_percent,
            project_design_amount, project_design_percent, system_design_amount,
            credit_card_fee_amount, misc_parts_amount,
            custom_modifier_1_amount, custom_modifier_1_percent, custom_modifier_2_amount, custom_modifier_2_percent,
            deposit_amount, deposit_percent, is_portal_visible, report_template_id`)
          .eq('id', order.proposal_id)
          .maybeSingle(),
        supabase
          .from('proposal_settings')
          .select('id, custom_modifier_1_label, custom_modifier_2_label, scope_of_work, system_design_percent, credit_card_fee_percent, misc_parts_percent')
          .eq('proposal_id', order.proposal_id)
          .maybeSingle(),
        supabase
          .from('sales_orders')
          .select('portal_template_override_id')
          .eq('id', order.id)
          .maybeSingle(),
        supabase
          .from('proposal_report_templates')
          .select(TEMPLATE_COLS)
          .order('name'),
      ]);

      if (roomsRes.error) throw roomsRes.error;
      if (itemsRes.error) throw itemsRes.error;
      if (proposalRes.error) throw proposalRes.error;

      const allItems: LineItem[] = itemsRes.data || [];
      const itemMap = new Map<string, LineItem>();
      allItems.forEach(item => itemMap.set(item.id, { ...item, accessories: [] }));
      allItems.forEach(item => {
        if (item.parent_item_id) {
          const parent = itemMap.get(item.parent_item_id);
          if (parent) {
            parent.accessories = parent.accessories || [];
            parent.accessories.push(itemMap.get(item.id)!);
          }
        }
      });

      const builtRooms: Room[] = (roomsRes.data || []).map(room => {
        const roomItems = allItems
          .filter(i => i.room_id === room.id && !i.parent_item_id)
          .map(i => itemMap.get(i.id)!);
        return { ...room, line_items: roomItems, expanded: true };
      });

      setRooms(builtRooms);
      if (proposalRes.data) {
        const settings = settingsRes.data;
        setProposalTotals({
          ...(proposalRes.data as Omit<ProposalTotals, 'system_design_percent' | 'credit_card_fee_percent' | 'misc_parts_percent'>),
          system_design_percent: settings?.system_design_percent ?? 0,
          credit_card_fee_percent: settings?.credit_card_fee_percent ?? 0,
          misc_parts_percent: settings?.misc_parts_percent ?? 0,
        } as ProposalTotals);
        setPortalVisible(proposalRes.data.is_portal_visible ?? false);
        setProposalTemplateId(proposalRes.data.report_template_id ?? null);
      }
      if (settingsRes.data) setProposalSettings(settingsRes.data as ProposalSettings);

      // Resolve effective template: SO override → proposal template → null (show all)
      const allTemplates: PortalTemplate[] = (templatesRes.data || []) as PortalTemplate[];
      setAvailableTemplates(allTemplates);

      const overrideId = soRes.data?.portal_template_override_id ?? null;
      const fallbackId = proposalRes.data?.report_template_id ?? null;
      setSoTemplateOverrideId(overrideId);

      // The approved template is what the customer saw at proposal time — always the proposal's template
      const approved = fallbackId ? allTemplates.find(t => t.id === fallbackId) ?? null : null;
      setApprovedTemplate(approved);

      const effectiveId = overrideId ?? fallbackId;
      const effective = effectiveId ? allTemplates.find(t => t.id === effectiveId) ?? null : null;
      setPortalTemplate(effective);
    } catch (err: unknown) {
      console.error('Error loading proposal scope:', err);
      const msg = err && typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : 'Unknown error loading scope data';
      setScopeError(msg);
    } finally {
      setLoading(false);
    }
  }, [order.proposal_id, order.id]);

  useEffect(() => {
    if (order.proposal_id) {
      loadScope();
    } else {
      setLoading(false);
    }
    supabase
      .from('labor_phases')
      .select('id, name')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => { if (data) setLaborPhases(data); });
  }, [order.proposal_id, loadScope]);

  useEffect(() => {
    if (editingRoomId && roomScopeRef.current) {
      roomScopeRef.current.focus();
    }
  }, [editingRoomId]);

  // Wraps any save action that modifies the live portal proposal.
  // If the portal is currently live, shows a confirmation first, hides the portal,
  // then runs the action. If not live, runs immediately.
  function guardPortalAction(action: () => void) {
    if (!portalVisible) {
      action();
      return;
    }
    setConfirmModal({
      title: 'Take portal offline?',
      message: 'The customer portal is currently live. This change will take it offline. You will need to review the portal view and turn it back on when ready.',
      onConfirm: async () => {
        await setPortalVisibility(false);
        action();
      },
    });
  }

  async function setPortalVisibility(newVal: boolean) {
    setTogglingPortal(true);
    try {
      const { error } = await supabase
        .from('proposals')
        .update({ is_portal_visible: newVal })
        .eq('id', order.proposal_id);
      if (error) throw error;
      setPortalVisible(newVal);
    } catch (err) {
      console.error('Error toggling portal visibility:', err);
    } finally {
      setTogglingPortal(false);
    }
  }

  function handleLiveToggleClick() {
    if (!portalVisible) {
      // Turning on: apply immediately
      setPortalVisibility(true);
    } else {
      // Turning off: require explicit confirmation
      setConfirmModal({
        title: 'Hide from customer portal?',
        message: 'This will remove the proposal from the customer\'s portal immediately. They will no longer be able to view or approve it until you turn it back on.',
        onConfirm: () => setPortalVisibility(false),
      });
    }
  }

  // Called when rep clicks a template in the picker
  function requestTemplateChange(templateId: string | null) {
    guardPortalAction(() => applyTemplateOverride(templateId));
  }

  async function applyTemplateOverride(templateId: string | null) {
    setSavingTemplate(true);
    try {
      const { error } = await supabase
        .from('sales_orders')
        .update({ portal_template_override_id: templateId })
        .eq('id', order.id);
      if (error) throw error;
      setSoTemplateOverrideId(templateId);
      // Effective template: if clearing override, fall back to proposal's template
      const effectiveId = templateId ?? proposalTemplateId;
      const effective = effectiveId ? availableTemplates.find(t => t.id === effectiveId) ?? null : null;
      setPortalTemplate(effective);
      setShowTemplatePicker(false);
    } catch (err) {
      console.error('Error saving template override:', err);
    } finally {
      setSavingTemplate(false);
    }
  }

  function getRoomsForView(): Room[] {
    return rooms;
  }

  function toggleRoom(roomId: string) {
    setRooms(prev => prev.map(r => r.id === roomId ? { ...r, expanded: !r.expanded } : r));
  }

  function startEditRoom(room: Room) {
    setEditingRoomId(room.id);
    setRoomScopeText(room.description || '');
    setRoomShowScope(room.show_scope);
  }

  function cancelEditRoom() {
    setEditingRoomId(null);
    setRoomScopeText('');
  }

  async function doSaveRoomScope(roomId: string) {
    setSavingRoomScope(true);
    try {
      const { error } = await supabase
        .from('proposal_rooms')
        .update({ description: roomScopeText.trim() || null, show_scope: roomShowScope })
        .eq('id', roomId);
      if (error) throw error;
      setRooms(prev => prev.map(r =>
        r.id === roomId ? { ...r, description: roomScopeText.trim() || null, show_scope: roomShowScope } : r
      ));
      setEditingRoomId(null);
    } catch (err) {
      console.error('Error saving room scope:', err);
      alert('Failed to save scope');
    } finally {
      setSavingRoomScope(false);
    }
  }

  function saveRoomScope(roomId: string) {
    guardPortalAction(() => doSaveRoomScope(roomId));
  }

  function startEditTask(item: LineItem) {
    setEditingTaskItemId(item.id);
    setTaskNotesText(item.task_notes || '');
    setTaskShowNotes(item.show_task_notes);
  }

  function cancelEditTask() {
    setEditingTaskItemId(null);
  }

  async function doSaveTask(itemId: string) {
    setSavingTask(true);
    try {
      const { error } = await supabase
        .from('proposal_line_items')
        .update({ task_notes: taskNotesText.trim() || null, show_task_notes: taskShowNotes })
        .eq('id', itemId);
      if (error) throw error;
      setRooms(prev => prev.map(room => ({
        ...room,
        line_items: room.line_items.map(item =>
          item.id === itemId
            ? { ...item, task_notes: taskNotesText.trim() || null, show_task_notes: taskShowNotes }
            : item
        ),
      })));
      setEditingTaskItemId(null);
    } catch (err) {
      console.error('Error saving task notes:', err);
      alert('Failed to save install task');
    } finally {
      setSavingTask(false);
    }
  }

  function saveTask(itemId: string) {
    guardPortalAction(() => doSaveTask(itemId));
  }

  async function deleteTaskNotes(itemId: string) {
    try {
      const { error } = await supabase
        .from('proposal_line_items')
        .update({ task_notes: null, show_task_notes: false })
        .eq('id', itemId);
      if (error) throw error;
      setRooms(prev => prev.map(room => ({
        ...room,
        line_items: room.line_items.map(item =>
          item.id === itemId ? { ...item, task_notes: null, show_task_notes: false } : item
        ),
      })));
    } catch (err) {
      console.error('Error deleting task notes:', err);
    }
  }

  async function handleLineItemPhaseChange(itemId: string, phaseId: string | null) {
    const { error } = await supabase
      .from('proposal_line_items')
      .update({ labor_phase_id: phaseId })
      .eq('id', itemId);
    if (error) {
      console.error('Error updating phase:', error);
      return;
    }
    const phase = phaseId ? laborPhases.find(p => p.id === phaseId) || null : null;
    setRooms(prev => prev.map(room => ({
      ...room,
      line_items: room.line_items.map(item =>
        item.id === itemId
          ? { ...item, labor_phase_id: phaseId, labor_phases: phase ? { id: phase.id, name: phase.name } : null }
          : item
      ),
    })));
  }

  function formatCurrency(val: number) {
    return '$' + val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!order.proposal_id) {
    return (
      <div className="text-center py-12 text-gray-400">
        No proposal linked to this sales order.
      </div>
    );
  }

  const allLineItems = rooms.flatMap(r => r.line_items);
  const editingTaskItem = editingTaskItemId ? allLineItems.find(i => i.id === editingTaskItemId) : null;
  const displayRooms = getRoomsForView();

  return (
    <div className="space-y-4">
      {/* Single toolbar row — Live toggle | Eye | Customer sees (portal only) | —— | Portal/Grid toggle */}
      <div className="flex items-center gap-2 flex-wrap min-w-0">

        {/* Live / Not Live toggle */}
        <button
          onClick={handleLiveToggleClick}
          disabled={togglingPortal}
          title={portalVisible ? 'Click to hide from customer portal' : 'Click to make visible on customer portal'}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all disabled:opacity-60 ${
            portalVisible
              ? 'bg-green-500/15 border-green-500/40 text-green-400 hover:bg-red-500/15 hover:border-red-500/40 hover:text-red-400'
              : 'bg-gray-800 border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-300'
          }`}
        >
          {togglingPortal ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : portalVisible ? (
            <Wifi className="w-3.5 h-3.5" />
          ) : (
            <WifiOff className="w-3.5 h-3.5" />
          )}
          {portalVisible ? (
            <span className="flex items-center gap-1.5">
              Live
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            </span>
          ) : 'Not Live'}
        </button>

        {/* Portal preview button */}
        <button
          onClick={() => setShowPortalPreview(true)}
          title="Preview customer portal view"
          className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-600 bg-gray-800 text-gray-400 hover:border-blue-500/50 hover:bg-blue-500/10 hover:text-blue-400 cursor-pointer transition-all"
        >
          <Eye className="w-3.5 h-3.5" />
        </button>

        {/* Customer sees / template strip — inline, portal mode only */}
        {viewMode === 'portal' && (
          <div className="relative flex items-center gap-1.5 px-2.5 py-1 bg-gray-800/60 border border-gray-700 rounded-lg min-w-0">
            <Globe className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
            <span className="text-xs text-gray-400 hidden sm:inline">Customer sees:</span>
            <span className="text-xs font-semibold text-white truncate max-w-[120px] sm:max-w-[200px]">
              {portalTemplate ? portalTemplate.name : 'Show All'}
            </span>
            {soTemplateOverrideId ? (
              <span className="text-xs text-amber-500/80 hidden sm:inline">overridden</span>
            ) : proposalTemplateId ? (
              <span className="text-xs text-gray-500 hidden sm:inline">from proposal</span>
            ) : null}
            {/* Reset button — only when override active */}
            {soTemplateOverrideId && (
              <button
                onClick={() => applyTemplateOverride(null)}
                disabled={savingTemplate}
                className="flex items-center p-0.5 text-gray-500 hover:text-amber-400 rounded transition-colors flex-shrink-0"
                title="Reset to proposal's original template"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            )}
            <button
              onClick={() => setShowTemplatePicker(v => !v)}
              disabled={savingTemplate}
              className="flex items-center gap-1 px-2 py-0.5 text-xs text-gray-300 hover:text-white border border-gray-600 hover:border-gray-500 rounded-md transition-colors disabled:opacity-50 flex-shrink-0"
            >
              <Settings className="w-3 h-3" />
              <span className="hidden sm:inline">Change</span>
              <ChevronDownSm className={`w-3 h-3 transition-transform ${showTemplatePicker ? 'rotate-180' : ''}`} />
            </button>

            {/* Template dropdown — anchored to this inline strip */}
            {showTemplatePicker && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => { setShowTemplatePicker(false); }} />
                <div className="absolute top-full left-0 mt-1.5 bg-gray-800 border border-gray-600 rounded-xl shadow-2xl z-20 min-w-[280px] sm:min-w-[320px] max-w-[calc(100vw-1rem)] py-1.5 overflow-hidden">
                <div className="px-3 py-2 border-b border-gray-700/50">
                  <p className="text-xs font-semibold text-gray-300">Customer Portal Display</p>
                  <p className="text-xs text-gray-500 mt-0.5">Choose what pricing details the customer sees</p>
                </div>

                {/* "Show All" option */}
                <button
                  onClick={() => requestTemplateChange(null)}
                  disabled={savingTemplate}
                  className={`w-full px-3 py-2.5 text-left hover:bg-gray-700/50 transition-colors flex items-start gap-2.5 ${!portalTemplate ? 'bg-blue-900/20' : ''}`}
                >
                  <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${!portalTemplate ? 'border-blue-500 bg-blue-500' : 'border-gray-600'}`}>
                    {!portalTemplate && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm text-white font-medium">Show All</span>
                      {/* Mark "Show All" as the approved option when proposal had no template */}
                      {!approvedTemplate && (
                        <span className="flex items-center gap-0.5 text-xs text-green-400 bg-green-900/30 px-1.5 py-0.5 rounded">
                          <ShieldCheck className="w-3 h-3" />
                          approved
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">Show all pricing details, model numbers, and labor</div>
                  </div>
                </button>

                {availableTemplates.length > 0 && (
                  <div className="border-t border-gray-700/30 mt-1 pt-1">
                    {availableTemplates.map(tmpl => (
                      <button
                        key={tmpl.id}
                        onClick={() => requestTemplateChange(tmpl.id)}
                        disabled={savingTemplate}
                        className={`w-full px-3 py-2.5 text-left hover:bg-gray-700/50 transition-colors flex items-start gap-2.5 ${portalTemplate?.id === tmpl.id ? 'bg-blue-900/20' : ''}`}
                      >
                        <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center ${portalTemplate?.id === tmpl.id ? 'border-blue-500 bg-blue-500' : 'border-gray-600'}`}>
                          {portalTemplate?.id === tmpl.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm text-white font-medium">{tmpl.name}</span>
                            {/* Always show the "approved" badge on the template the customer saw */}
                            {tmpl.id === approvedTemplate?.id && (
                              <span className="flex items-center gap-0.5 text-xs text-green-400 bg-green-900/30 px-1.5 py-0.5 rounded">
                                <ShieldCheck className="w-3 h-3" />
                                approved
                              </span>
                            )}
                            {tmpl.is_personal && (
                              <span className="text-xs text-gray-500">personal</span>
                            )}
                          </div>
                          {tmpl.description && <div className="text-xs text-gray-500 mt-0.5 truncate">{tmpl.description}</div>}
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {tmpl.show_unit_price ? <span className="text-xs text-green-400/80">Pricing</span> : <span className="text-xs text-gray-600 line-through">Pricing</span>}
                            {tmpl.show_quantity ? <span className="text-xs text-green-400/80">Qty</span> : <span className="text-xs text-gray-600 line-through">Qty</span>}
                            {tmpl.show_manufacturer ? <span className="text-xs text-green-400/80">Mfr</span> : <span className="text-xs text-gray-600 line-through">Mfr</span>}
                            {tmpl.show_sku ? <span className="text-xs text-green-400/80">SKU</span> : <span className="text-xs text-gray-600 line-through">SKU</span>}
                            {tmpl.show_area_subtotals ? <span className="text-xs text-green-400/80">Area Totals</span> : <span className="text-xs text-gray-600 line-through">Area Totals</span>}
                            {tmpl.show_labor_total ? <span className="text-xs text-green-400/80">Labor</span> : <span className="text-xs text-gray-600 line-through">Labor</span>}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {availableTemplates.length === 0 && (
                  <div className="px-3 py-3 text-xs text-gray-500">
                    No templates configured. Create templates in Admin &gt; Proposal Templates.
                  </div>
                )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Flex spacer — pushes view-mode toggle to the right */}
        <div className="flex-1" />

        {/* View mode toggle */}
        <div className="flex items-center gap-1 bg-gray-800 border border-gray-700 rounded-lg p-1">
          <button
            onClick={() => setViewMode('portal')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
              viewMode === 'portal' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-200'
            }`}
            title="Customer portal view"
          >
            <Globe className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Portal</span>
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
              viewMode === 'grid' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-200'
            }`}
            title="Internal grid view"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Grid</span>
          </button>
        </div>
      </div>

      {editingTaskItem && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-700">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-500/20 rounded-lg">
                  <Wrench className="w-5 h-5 text-orange-400" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">Install Task Notes</h3>
                  <p className="text-sm text-gray-400 truncate max-w-xs">{editingTaskItem.description}</p>
                </div>
              </div>
              <button onClick={cancelEditTask} className="p-2 hover:bg-gray-800 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-5 space-y-4">
              <div className="bg-orange-900/20 border border-orange-700/30 rounded-lg p-3">
                <p className="text-xs text-orange-300">
                  These notes describe how this item will be installed. They appear on work orders for technicians and can optionally be shown to the customer.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Installation Steps</label>
                <textarea
                  value={taskNotesText}
                  onChange={(e) => setTaskNotesText(e.target.value)}
                  placeholder={"Enter step-by-step installation instructions...\n\nExample:\n1. Verify existing infrastructure\n2. Mount equipment at specified location\n3. Make all necessary connections\n4. Test functionality and verify operation"}
                  rows={8}
                  className="w-full px-3 py-2.5 bg-gray-800 border border-gray-600 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-y font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Customer Visibility</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTaskShowNotes(false)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                      !taskShowNotes
                        ? 'bg-gray-200 border-gray-300 text-gray-900'
                        : 'bg-gray-800 border-gray-600 text-gray-500 hover:border-gray-500'
                    }`}
                  >
                    <Lock className="w-3.5 h-3.5" />
                    Internal only
                    {!taskShowNotes && <span className="text-xs opacity-60">(default)</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTaskShowNotes(true)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                      taskShowNotes
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-gray-800 border-gray-600 text-gray-500 hover:border-gray-500'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Show on proposal
                  </button>
                </div>
              </div>
            </div>
            <div className="p-5 border-t border-gray-700 flex gap-3">
              {editingTaskItem.task_notes && (
                <button
                  onClick={() => setConfirmModal({ title: 'Clear Task Notes', message: 'Clear the install task notes for this item?', onConfirm: () => { cancelEditTask(); deleteTaskNotes(editingTaskItem.id); } })}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg border border-red-700/30 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear
                </button>
              )}
              <div className="flex-1" />
              <button onClick={cancelEditTask} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 rounded-lg hover:bg-gray-800 transition-colors">
                Cancel
              </button>
              <button
                onClick={() => saveTask(editingTaskItemId!)}
                disabled={savingTask}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {savingTask ? 'Saving...' : 'Save Task Notes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {scopeError ? (
        <div className="rounded-lg border border-red-700/60 bg-red-900/20 p-5">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center mt-0.5">
              <X className="w-3 h-3 text-red-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-red-300 font-medium text-sm mb-1">Failed to load scope data</p>
              <p className="text-red-400/80 text-xs font-mono break-all">{scopeError}</p>
            </div>
            <button
              onClick={loadScope}
              className="flex-shrink-0 px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      ) : displayRooms.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No areas or items found on this proposal.</div>
      ) : viewMode === 'portal' ? (
        <PortalView
          rooms={displayRooms}
          proposalTotals={proposalTotals}
          proposalSettings={proposalSettings}
          portalTemplate={portalTemplate}
          formatCurrency={formatCurrency}
          editingRoomId={editingRoomId}
          roomScopeText={roomScopeText}
          roomShowScope={roomShowScope}
          roomScopeRef={roomScopeRef}
          savingRoomScope={savingRoomScope}
          onToggleRoom={toggleRoom}
          onStartEditRoom={startEditRoom}
          onCancelEditRoom={cancelEditRoom}
          onSaveRoomScope={saveRoomScope}
          onRoomScopeTextChange={setRoomScopeText}
          onRoomShowScopeChange={setRoomShowScope}
          onEditTask={startEditTask}
        />
      ) : (
        <GridView
          rooms={displayRooms}
          proposalTotals={proposalTotals}
          proposalSettings={proposalSettings}
          formatCurrency={formatCurrency}
          editingRoomId={editingRoomId}
          roomScopeText={roomScopeText}
          roomShowScope={roomShowScope}
          roomScopeRef={roomScopeRef}
          savingRoomScope={savingRoomScope}
          laborPhases={laborPhases}
          onToggleRoom={toggleRoom}
          onStartEditRoom={startEditRoom}
          onCancelEditRoom={cancelEditRoom}
          onSaveRoomScope={saveRoomScope}
          onRoomScopeTextChange={setRoomScopeText}
          onRoomShowScopeChange={setRoomShowScope}
          onEditTask={startEditTask}
          onPhaseChange={handleLineItemPhaseChange}
        />
      )}

      {proposalTotals && displayRooms.length > 0 && (
        <TotalsFooter totals={proposalTotals} settings={proposalSettings} formatCurrency={formatCurrency} />
      )}

      <ConfirmModal
        isOpen={confirmModal !== null}
        title={confirmModal?.title ?? ''}
        message={confirmModal?.message ?? ''}
        onConfirm={() => { confirmModal?.onConfirm(); setConfirmModal(null); }}
        onCancel={() => setConfirmModal(null)}
      />

      {/* Line Item Detail / Edit Modal */}
      {lineItemModal && (
        <SalesOrderLineItemModal
          lineItemId={lineItemModal.id}
          initialMode={lineItemModal.mode}
          onClose={() => setLineItemModal(null)}
          onSaved={() => { setLineItemModal(null); loadScope(); }}
        />
      )}

      {/* Portal Preview Modal — rendered via portal to escape overflow:hidden containers */}
      {showPortalPreview && createPortal(
        <div className="fixed inset-0 z-[9999] flex flex-col bg-gray-950">
          {/* Preview header bar */}
          <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 bg-gray-900 border-b border-gray-700 shrink-0 flex-wrap">
            <div className="flex items-center gap-2">
              <Eye className={`w-4 h-4 ${portalVisible ? 'text-green-400' : 'text-blue-400'}`} />
              <span className="text-sm font-semibold text-white">Customer Portal Preview</span>
            </div>
            {portalVisible ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-green-500/10 border border-green-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                <span className="text-xs text-green-300 font-medium">Live — customer can see this now</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span className="text-xs text-amber-300 font-medium">Not live — customer cannot see this yet</span>
              </div>
            )}
            <div className="flex-1" />
            <button
              onClick={() => setShowPortalPreview(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-700 border border-gray-600 hover:border-gray-500 rounded-lg transition-all"
            >
              <X className="w-3.5 h-3.5" />
              Close Preview
            </button>
          </div>

          {/* Portal content — scrollable */}
          <div className="flex-1 overflow-y-auto bg-gray-50">
            <PortalProposalDetail
              proposalId={order.proposal_id}
              onBack={() => setShowPortalPreview(false)}
              previewMode={true}
              hideExpiration={true}
              overrideDisplayNumber={order.order_number}
              templateOverrideId={soTemplateOverrideId ?? proposalTemplateId}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
interface PortalViewProps {
  rooms: Room[];
  proposalTotals: ProposalTotals | null;
  proposalSettings: ProposalSettings | null;
  portalTemplate: PortalTemplate | null;
  formatCurrency: (v: number) => string;
  editingRoomId: string | null;
  roomScopeText: string;
  roomShowScope: boolean;
  roomScopeRef: React.RefObject<HTMLTextAreaElement>;
  savingRoomScope: boolean;
  onToggleRoom: (id: string) => void;
  onStartEditRoom: (room: Room) => void;
  onCancelEditRoom: () => void;
  onSaveRoomScope: (id: string) => void;
  onRoomScopeTextChange: (v: string) => void;
  onRoomShowScopeChange: (v: boolean) => void;
  onEditTask: (item: LineItem) => void;
}

function PortalView({ rooms, proposalTotals, proposalSettings, portalTemplate, formatCurrency,
  editingRoomId, roomScopeText, roomShowScope, roomScopeRef, savingRoomScope,
  onToggleRoom, onStartEditRoom, onCancelEditRoom, onSaveRoomScope,
  onRoomScopeTextChange, onRoomShowScopeChange, onEditTask }: PortalViewProps) {
  // Resolve effective settings — template takes precedence, otherwise show all
  const tmpl = portalTemplate ?? ALL_SHOWING;
  const allRoomsSubtotal = rooms.reduce((s, r) => {
    const { parts, labor } = getRoomItemsSubtotal(r);
    return s + parts + labor;
  }, 0);

  return (
    <div className="space-y-5">
      {rooms.map((room, idx) => {
          const { parts: roomPartsTotal, labor: roomLaborTotal } = getRoomItemsSubtotal(room);
          const itemsSubtotal = roomPartsTotal + roomLaborTotal;
          const { modifiersTotal, taxTotal, areaTotal: roomTotal } = computeRoomTotal(itemsSubtotal, allRoomsSubtotal, proposalTotals);
          const hasModifiers = Math.abs(modifiersTotal) > 0.005;
          const hasTax = taxTotal > 0.005;
          const isEditingThisRoom = editingRoomId === room.id;
          const visibleItems = room.line_items.filter(i => !i.is_hidden);

          return (
            <div key={room.id} className="bg-white rounded-2xl shadow-md border border-gray-200 overflow-hidden"
              style={{ animation: `fadeSlideUp 0.4s ease-out ${idx * 0.06}s both` }}
            >
              <div className="bg-gradient-to-r from-gray-800 to-gray-900 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-500/20 p-2 rounded-lg flex-shrink-0">
                    <Package className="w-4 h-4 text-blue-400" />
                  </div>
                  <h3 className="text-base font-bold text-white">{room.name}</h3>
                </div>
              </div>

              {isEditingThisRoom ? (
                <div className="px-5 pt-4 pb-3 space-y-3">
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide">Area Scope of Work</label>
                  <textarea
                    ref={roomScopeRef}
                    value={roomScopeText}
                    onChange={(e) => onRoomScopeTextChange(e.target.value)}
                    placeholder="Describe the scope of work for this area..."
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                  />
                  <button onClick={() => onRoomShowScopeChange(!roomShowScope)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-colors ${roomShowScope ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-gray-50 border-gray-300 text-gray-500 hover:bg-gray-100'}`}
                  >
                    {roomShowScope ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    {roomShowScope ? 'Showing on proposal' : 'Hidden on proposal'}
                  </button>
                  <div className="flex items-center gap-2 justify-end">
                    <button onClick={onCancelEditRoom} className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors">
                      <X className="w-3.5 h-3.5" />Cancel
                    </button>
                    <button onClick={() => onSaveRoomScope(room.id)} disabled={savingRoomScope}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" />{savingRoomScope ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="px-5 pt-4 pb-2 group/scope">
                  {room.description && room.show_scope && tmpl.show_area_descriptions ? (
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 relative">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2">
                          <FileText className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                          <p className="text-xs font-bold text-blue-700 uppercase tracking-wide">Scope of Work</p>
                        </div>
                        <button onClick={() => onStartEditRoom(room)} className="p-1 text-blue-400 hover:text-blue-600 hover:bg-blue-100 rounded transition-colors opacity-0 group-hover/scope:opacity-100">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <p className="text-sm text-blue-800 whitespace-pre-wrap leading-relaxed ml-5">{room.description}</p>
                    </div>
                  ) : room.description && (!room.show_scope || !tmpl.show_area_descriptions) ? (
                    <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-3 flex items-center justify-between gap-2">
                      <span className="text-xs text-gray-400 flex items-center gap-1.5">
                        <EyeOff className="w-3 h-3" />
                        {!room.show_scope ? 'Area description hidden on proposal' : 'Area descriptions hidden by display template'}
                      </span>
                      <button onClick={() => onStartEditRoom(room)} className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => onStartEditRoom(room)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-400 hover:text-gray-600 border border-dashed border-gray-200 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />Add scope of work for this area
                    </button>
                  )}
                </div>
              )}

              <div className="px-5 pb-5 pt-2">
                {visibleItems.length === 0 ? (
                  <p className="py-4 text-sm text-gray-400 italic">No items in this area.</p>
                ) : (
                  <div className="overflow-x-auto -mx-5 px-5">
                    <table className="w-full min-w-[280px]">
                      <thead>
                        <tr className="border-b-2 border-gray-100">
                          <th className="text-left py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Item</th>
                          {tmpl.show_quantity && <th className="text-center py-3 text-xs font-bold text-gray-500 uppercase tracking-wider px-3 whitespace-nowrap">Qty</th>}
                          {tmpl.show_unit_price && <th className="text-right py-3 text-xs font-bold text-gray-500 uppercase tracking-wider px-3 whitespace-nowrap">Price</th>}
                          {tmpl.show_line_item_total && <th className="text-right py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Total</th>}
                          <th className="py-3 w-8" />
                        </tr>
                      </thead>
                      <tbody>
                        {visibleItems.map(item => (
                          <PortalLineItemRow
                            key={item.id}
                            item={item}
                            tmpl={tmpl}
                            formatCurrency={formatCurrency}
                            onEditTask={() => onEditTask(item)}
                          />
                        ))}
                      </tbody>
                      {tmpl.show_area_subtotals && (
                        <tfoot className="bg-gray-50">
                          <tr>
                            <td colSpan={[true, tmpl.show_quantity, tmpl.show_unit_price].filter(Boolean).length} className="pt-3 pb-3 pr-3 text-right">
                              <div className="flex flex-col items-end gap-0.5">
                                {roomPartsTotal > 0 && <span className="text-xs text-gray-400 tabular-nums flex items-center gap-1"><Package className="w-3 h-3 opacity-50" />Parts: {formatCurrency(roomPartsTotal)}</span>}
                                {roomLaborTotal > 0 && tmpl.show_labor_total && <span className="text-xs text-cyan-600/70 tabular-nums flex items-center gap-1"><Wrench className="w-3 h-3 opacity-50" />Labor: {formatCurrency(roomLaborTotal)}</span>}
                                {hasModifiers && <span className={`text-xs tabular-nums flex items-center gap-1 ${modifiersTotal < 0 ? 'text-red-500/70' : 'text-blue-500/70'}`}>{modifiersTotal < 0 ? '−' : '+'}{formatCurrency(Math.abs(modifiersTotal))} adj.</span>}
                                {hasTax && tmpl.show_tax_breakdown && <span className="text-xs text-gray-400/70 tabular-nums flex items-center gap-1">+{formatCurrency(taxTotal)} tax</span>}
                                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mt-0.5">Area Total</span>
                              </div>
                            </td>
                            <td className="pt-3 pb-3 text-right font-bold text-blue-600 text-base tabular-nums align-bottom">{formatCurrency(roomTotal)}</td>
                            <td />
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                )}
              </div>
            </div>
        );
      })}
    </div>
  );
}

const GRID_COLUMNS: { key: string; label: string }[] = [
  { key: 'manufacturer', label: 'Manufacturer' },
  { key: 'sku', label: 'SKU' },
  { key: 'description', label: 'Description' },
  { key: 'qty', label: 'Qty' },
  { key: 'cost', label: 'Cost' },
  { key: 'price', label: 'Price' },
  { key: 'laborPhase', label: 'Phase' },
  { key: 'laborHrs', label: 'Labor Hrs' },
  { key: 'laborRate', label: 'Labor Rate' },
  { key: 'laborTotal', label: 'Labor Total' },
  { key: 'lineTotal', label: 'Line Total' },
];

const DEFAULT_VISIBLE_COLUMNS = new Set([
  'description', 'manufacturer', 'sku', 'qty', 'cost', 'price',
  'laborPhase', 'laborHrs', 'laborRate', 'laborTotal', 'lineTotal',
]);

interface GridViewProps {
  rooms: Room[];
  proposalTotals: ProposalTotals | null;
  proposalSettings: ProposalSettings | null;
  formatCurrency: (v: number) => string;
  editingRoomId: string | null;
  roomScopeText: string;
  roomShowScope: boolean;
  roomScopeRef: React.RefObject<HTMLTextAreaElement>;
  savingRoomScope: boolean;
  laborPhases: { id: string; name: string }[];
  onToggleRoom: (id: string) => void;
  onStartEditRoom: (room: Room) => void;
  onCancelEditRoom: () => void;
  onSaveRoomScope: (id: string) => void;
  onRoomScopeTextChange: (v: string) => void;
  onRoomShowScopeChange: (v: boolean) => void;
  onEditTask: (item: LineItem) => void;
  onPhaseChange: (itemId: string, phaseId: string | null) => Promise<void>;
}

function GridView({ rooms, proposalTotals, proposalSettings, formatCurrency,
  editingRoomId, roomScopeText, roomShowScope, roomScopeRef, savingRoomScope,
  laborPhases, onToggleRoom, onStartEditRoom, onCancelEditRoom, onSaveRoomScope,
  onRoomScopeTextChange, onRoomShowScopeChange, onEditTask, onPhaseChange }: GridViewProps) {
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set(DEFAULT_VISIBLE_COLUMNS));
  const [showColumnMenu, setShowColumnMenu] = useState(false);

  function toggleColumn(key: string) {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  const visibleCount = visibleColumns.size;

  const allRoomsSubtotal = rooms.reduce((s, r) => {
    const { parts, labor } = getRoomItemsSubtotal(r);
    return s + parts + labor;
  }, 0);

  return (
    <div className="flex flex-col lg:flex-row gap-4 items-start">
      <div className="flex-1 min-w-0 space-y-2">
        {rooms.map(room => {
          const isEditingThisRoom = editingRoomId === room.id;
          const { parts: gridPartsTotal, labor: gridLaborTotal } = getRoomItemsSubtotal(room);
          const gridItemsSubtotal = gridPartsTotal + gridLaborTotal;
          const { modifiersTotal: gridModifiers, taxTotal: gridTax, areaTotal: gridRoomTotal } = computeRoomTotal(gridItemsSubtotal, allRoomsSubtotal, proposalTotals);
          const gridHasModifiers = Math.abs(gridModifiers) > 0.005;
          const gridHasTax = gridTax > 0.005;
          const visibleItemCount = room.line_items.filter(i => !i.is_hidden).length;

          return (
            <div key={room.id} className="bg-gray-900 border border-gray-700 rounded-lg overflow-hidden">
              {/* Section header — matches ProposalBuilderCompact style */}
              <div
                className="flex items-center gap-2 px-3 py-2.5 bg-gray-800/50 border-b border-gray-700 cursor-pointer hover:bg-gray-800/70 transition-colors select-none"
                onClick={() => onToggleRoom(room.id)}
              >
                {room.expanded
                  ? <ChevronDown className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                  : <ChevronRight className="w-4 h-4 text-cyan-400 flex-shrink-0" />}
                <span className="text-sm font-semibold text-blue-400">{room.name}</span>
                <div className="ml-auto flex items-center gap-3">
                  <span className="text-xs text-gray-500 tabular-nums">
                    {visibleItemCount} {visibleItemCount === 1 ? 'item' : 'items'}
                  </span>
                  <div className="relative hidden md:block" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => setShowColumnMenu(v => !v)}
                      className={`p-1 rounded transition-colors ${showColumnMenu ? 'text-cyan-400 bg-cyan-900/30' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-700'}`}
                      title="Toggle columns"
                    >
                      <Columns className="w-3.5 h-3.5" />
                    </button>
                    {showColumnMenu && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowColumnMenu(false)} />
                        <div className="absolute top-full right-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-20 min-w-[160px] max-w-[calc(100vw-1rem)] py-1">
                          <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-700/50 mb-1">Columns</div>
                          {GRID_COLUMNS.map(col => (
                            <button
                              key={col.key}
                              onClick={() => toggleColumn(col.key)}
                              className="w-full px-3 py-1.5 text-left text-xs text-gray-300 hover:bg-gray-700 flex items-center gap-2 transition-colors"
                            >
                              <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${visibleColumns.has(col.key) ? 'bg-cyan-600 border-cyan-500' : 'border-gray-500'}`}>
                                {visibleColumns.has(col.key) && <Check className="w-2.5 h-2.5 text-white" />}
                              </div>
                              {col.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); isEditingThisRoom ? onCancelEditRoom() : onStartEditRoom(room); }}
                    className="p-1 text-gray-500 hover:text-blue-400 hover:bg-blue-900/30 rounded transition-colors"
                    title="Edit room scope"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {room.expanded && (
                <div>
                  {isEditingThisRoom ? (
                    <div className="px-4 py-3 bg-gray-800/40 border-b border-gray-700/50 space-y-2">
                      <textarea ref={roomScopeRef} value={roomScopeText} onChange={(e) => onRoomScopeTextChange(e.target.value)} placeholder="Describe the scope of work for this area..." rows={3}
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y" />
                      <div className="flex items-center justify-between">
                        <button onClick={() => onRoomShowScopeChange(!roomShowScope)}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs transition-colors ${roomShowScope ? 'bg-blue-900/30 border-blue-600/40 text-blue-300' : 'bg-gray-800 border-gray-600 text-gray-500'}`}
                        >
                          {roomShowScope ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          {roomShowScope ? 'Visible on proposal' : 'Hidden on proposal'}
                        </button>
                        <div className="flex items-center gap-2">
                          <button onClick={onCancelEditRoom} className="px-2.5 py-1 text-xs text-gray-400 hover:text-gray-200 rounded-lg hover:bg-gray-700 transition-colors">Cancel</button>
                          <button onClick={() => onSaveRoomScope(room.id)} disabled={savingRoomScope}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
                          >
                            <Check className="w-3 h-3" />{savingRoomScope ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : room.description && room.show_scope ? (
                    <div className="px-4 py-2 border-b border-gray-700/50 text-xs text-gray-400 bg-gray-900/40 italic flex items-start justify-between gap-2 group/gscp">
                      <span>{room.description}</span>
                      <button onClick={() => onStartEditRoom(room)} className="p-1 text-gray-600 hover:text-blue-400 rounded transition-colors opacity-0 group-hover/gscp:opacity-100 flex-shrink-0">
                        <Edit2 className="w-3 h-3" />
                      </button>
                    </div>
                  ) : null}

                  {room.line_items.length === 0 ? (
                    <div className="px-4 py-4 text-sm text-gray-500 italic">No items in this area.</div>
                  ) : (
                    <>
                      {/* Desktop table — compact flat rows matching ProposalBuilderCompact */}
                      <div className="hidden md:block overflow-x-auto">
                        <table className="w-full min-w-[1200px] text-xs">
                          <thead className="bg-gray-800/80 text-gray-400 border-b border-gray-700">
                            <tr>
                              {/* Lock / drag handle — always visible, read-only indicator */}
                              <th className="py-2 px-2 w-7 text-center">
                                <Lock className="w-3 h-3 text-gray-600 mx-auto" title="Scope locked — edit via change order" />
                              </th>
                              {visibleColumns.has('manufacturer') && <th className="text-left py-2 px-3 whitespace-nowrap font-medium">Manufacturer</th>}
                              {visibleColumns.has('sku') && <th className="text-left py-2 px-3 whitespace-nowrap font-medium">SKU</th>}
                              {visibleColumns.has('description') && <th className="text-left py-2 px-3 whitespace-nowrap font-medium w-[28%]">Description</th>}
                              {visibleColumns.has('qty') && <th className="text-right py-2 px-3 whitespace-nowrap font-medium">Qty</th>}
                              {visibleColumns.has('cost') && <th className="text-right py-2 px-3 whitespace-nowrap font-medium text-gray-500">Cost</th>}
                              {visibleColumns.has('price') && <th className="text-right py-2 px-3 whitespace-nowrap font-medium border-r border-gray-700/60">Price</th>}
                              {visibleColumns.has('laborPhase') && <th className="text-left py-2 px-3 whitespace-nowrap font-medium text-cyan-500/80">Phase</th>}
                              {visibleColumns.has('laborHrs') && (
                                <th className="text-right py-2 px-3 whitespace-nowrap font-medium text-cyan-500/80">
                                  <span className="flex items-center justify-end gap-1"><Wrench className="w-3 h-3" />Hrs</span>
                                </th>
                              )}
                              {visibleColumns.has('laborRate') && <th className="text-right py-2 px-3 whitespace-nowrap font-medium text-cyan-500/80">Labor Rate</th>}
                              {visibleColumns.has('laborTotal') && <th className="text-right py-2 px-3 whitespace-nowrap font-medium text-cyan-500/80 border-r border-gray-700/60">Labor Total</th>}
                              {visibleColumns.has('lineTotal') && <th className="text-right py-2 px-3 whitespace-nowrap font-semibold text-white">Line Total</th>}
                              <th className="py-2 px-2 w-8" />
                            </tr>
                          </thead>
                          <tbody>
                            {room.line_items.filter(i => !i.is_hidden).map(item => (
                              <GridLineItemRow key={item.id} item={item} formatCurrency={formatCurrency} onEditTask={() => onEditTask(item)} visibleColumns={visibleColumns} laborPhases={laborPhases} onPhaseChange={onPhaseChange} onViewItem={(id) => setLineItemModal({ id, mode: 'view' })} onEditItem={(id) => setLineItemModal({ id, mode: 'edit' })} />
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t-2 border-gray-600/60 bg-gray-800/40">
                              <td colSpan={visibleCount + 2} className="px-3 py-2.5 text-right">
                                <div className="flex items-center justify-end gap-4">
                                  {gridPartsTotal > 0 && (
                                    <span className="text-xs text-gray-500 tabular-nums flex items-center gap-1">
                                      <Package className="w-3 h-3 opacity-50" />Parts: {formatCurrency(gridPartsTotal)}
                                    </span>
                                  )}
                                  {gridLaborTotal > 0 && (
                                    <span className="text-xs text-cyan-600/70 tabular-nums flex items-center gap-1">
                                      <Wrench className="w-3 h-3 opacity-50" />Labor: {formatCurrency(gridLaborTotal)}
                                    </span>
                                  )}
                                  {gridHasModifiers && (
                                    <span className={`text-xs tabular-nums ${gridModifiers < 0 ? 'text-red-400/70' : 'text-blue-400/70'}`}>
                                      {gridModifiers < 0 ? '−' : '+'}{formatCurrency(Math.abs(gridModifiers))} adj.
                                    </span>
                                  )}
                                  {gridHasTax && (
                                    <span className="text-xs text-gray-500/70 tabular-nums">
                                      +{formatCurrency(gridTax)} tax
                                    </span>
                                  )}
                                  <span className="text-xs text-gray-400">Section subtotal</span>
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-sm font-semibold text-white text-right tabular-nums whitespace-nowrap">
                                {formatCurrency(gridRoomTotal)}
                              </td>
                              <td />
                            </tr>
                          </tfoot>
                        </table>
                      </div>

                      {/* Mobile card list */}
                      <div className="md:hidden divide-y divide-gray-700/30">
                        {room.line_items.filter(i => !i.is_hidden).map(item => {
                          const isLabor = item.item_type === 'labor';
                          const hasLabor = (item.labor_total ?? 0) > 0;
                          const partsTotal = (item.quantity || 0) * (item.unit_price || 0);
                          const rowTotal = partsTotal + (item.labor_total || 0);
                          const visibleAcc = item.accessories?.filter(a => !a.is_hidden) ?? [];
                          return (
                            <div key={item.id} className="px-4 py-3">
                              <div className="flex items-start gap-2">
                                <div className="mt-0.5 flex-shrink-0">
                                  {isLabor ? <Wrench className="w-3.5 h-3.5 text-blue-400" /> : <Package className="w-3.5 h-3.5 text-gray-400" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-white leading-snug">{item.description}</div>
                                  {item.products?.sku && <div className="text-cyan-400 text-xs mt-0.5 font-mono">{item.products.sku}</div>}
                                  {item.products?.manufacturers?.name && <div className="text-gray-500 text-xs">{item.products.manufacturers.name}</div>}
                                  {item.proposal_classes && (
                                    <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded text-xs font-medium" style={{ background: item.proposal_classes.color + '30', color: item.proposal_classes.color }}>
                                      <Tag className="w-2.5 h-2.5" />{item.proposal_classes.name}
                                    </span>
                                  )}
                                </div>
                                <button onClick={() => onEditTask(item)} className={`p-1.5 rounded flex-shrink-0 ${item.task_notes ? 'text-orange-400' : 'text-gray-600'}`} title="Edit install task">
                                  <Wrench className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              {item.task_notes && (
                                <div className={`flex items-baseline gap-1.5 mt-2 px-2 py-1 rounded text-xs ${item.show_task_notes ? 'bg-green-900/20 border border-green-700/30 text-green-400' : 'bg-orange-900/20 border border-orange-700/30 text-orange-300'}`}>
                                  <span className="font-semibold shrink-0">Task{!item.show_task_notes ? ' (Internal):' : ':'}</span>
                                  <span>{item.task_notes}</span>
                                </div>
                              )}
                              <div className="mt-2.5 grid grid-cols-2 gap-2">
                                <div className="bg-gray-800/60 rounded-lg px-2.5 py-2">
                                  <div className="text-xs text-gray-500 mb-0.5">Qty × Price</div>
                                  <div className="text-sm text-gray-300 tabular-nums">{item.quantity}{item.unit && item.unit !== 'ea' ? ` ${item.unit}` : ''} × {formatCurrency(item.unit_price)}</div>
                                  <div className="text-xs text-gray-500 mt-0.5 tabular-nums">= {formatCurrency(partsTotal)}</div>
                                </div>
                                {hasLabor ? (
                                  <div className="bg-gray-800/60 rounded-lg px-2.5 py-2">
                                    <div className="text-xs text-cyan-600/80 mb-0.5">Labor</div>
                                    <div className="text-sm text-cyan-400 tabular-nums">{item.labor_hours}h × {formatCurrency(item.labor_rate || 0)}</div>
                                    <div className="text-xs text-cyan-600/70 mt-0.5 tabular-nums">= {formatCurrency(item.labor_total!)}</div>
                                  </div>
                                ) : (
                                  <div className="bg-gray-800/60 rounded-lg px-2.5 py-2 flex items-center justify-center">
                                    <span className="text-xs text-gray-600">No labor</span>
                                  </div>
                                )}
                              </div>
                              <div className="mt-2 flex items-center justify-end">
                                <span className="text-xs text-gray-500 mr-1.5">Row Total</span>
                                <span className="text-sm font-semibold text-white tabular-nums">{formatCurrency(rowTotal)}</span>
                              </div>
                              {visibleAcc.length > 0 && (
                                <div className="mt-2 pl-4 space-y-1 border-l-2 border-gray-700">
                                  {visibleAcc.map(acc => {
                                    const accTotal = (acc.quantity || 0) * (acc.unit_price || 0) + (acc.labor_total || 0);
                                    return (
                                      <div key={acc.id} className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                          <span className="text-gray-600 text-xs select-none">↳</span>
                                          <span className="text-xs text-gray-400 truncate">{acc.description}</span>
                                        </div>
                                        <span className="text-xs text-gray-500 tabular-nums flex-shrink-0">{formatCurrency(accTotal)}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <div className="px-4 py-3 bg-gray-800/30 flex items-center justify-between gap-2">
                          <div className="flex flex-col gap-0.5">
                            {gridPartsTotal > 0 && <span className="text-xs text-gray-500 tabular-nums flex items-center gap-1"><Package className="w-3 h-3 opacity-50" />Parts: {formatCurrency(gridPartsTotal)}</span>}
                            {gridLaborTotal > 0 && <span className="text-xs text-cyan-600/70 tabular-nums flex items-center gap-1"><Wrench className="w-3 h-3 opacity-50" />Labor: {formatCurrency(gridLaborTotal)}</span>}
                            {gridHasModifiers && <span className={`text-xs tabular-nums ${gridModifiers < 0 ? 'text-red-400/70' : 'text-blue-400/70'}`}>{gridModifiers < 0 ? '−' : '+'}{formatCurrency(Math.abs(gridModifiers))} adj.</span>}
                            {gridHasTax && <span className="text-xs text-gray-500/70 tabular-nums">+{formatCurrency(gridTax)} tax</span>}
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-gray-500">Area Total</div>
                            <div className="text-sm font-semibold text-white tabular-nums">{formatCurrency(gridRoomTotal)}</div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
}

function PortalLineItemRow({
  item, tmpl, formatCurrency, onEditTask,
}: {
  item: LineItem;
  tmpl: PortalTemplate;
  formatCurrency: (v: number) => string;
  onEditTask: () => void;
}) {
  const rowTotal = (item.line_total || 0) + (item.labor_total || 0);
  const visibleAccessories = item.accessories?.filter(a => !a.is_hidden) ?? [];
  const isLabor = item.item_type === 'labor';
  // Compute colspan for spanning rows (task notes, accessories)
  const colCount = 1 + (tmpl.show_quantity ? 1 : 0) + (tmpl.show_unit_price ? 1 : 0) + (tmpl.show_line_item_total ? 1 : 0) + 1;

  return (
    <>
      <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors group/row">
        <td className="py-3.5">
          <div className="flex items-start gap-2">
            {isLabor ? <Wrench className="w-3.5 h-3.5 text-blue-400 mt-0.5 flex-shrink-0" /> : <Package className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-sm font-semibold leading-snug text-gray-900">
                {item.description}
              </div>
              {tmpl.show_manufacturer && item.products?.manufacturers?.name && (
                <p className="text-xs text-gray-400 mt-0.5">{item.products.manufacturers.name}</p>
              )}
              {tmpl.show_sku && item.products?.sku && (
                <p className="text-xs text-gray-400">SKU: {item.products.sku}</p>
              )}
              {item.proposal_classes && (
                <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded text-xs font-medium" style={{ background: item.proposal_classes.color + '22', color: item.proposal_classes.color }}>
                  <Tag className="w-2.5 h-2.5" />{item.proposal_classes.name}
                </span>
              )}
            </div>
          </div>
        </td>
        {tmpl.show_quantity && (
          <td className="text-center py-3.5 px-3 text-sm text-gray-700 font-medium whitespace-nowrap align-top">
            {item.quantity}{item.unit && item.unit !== 'ea' ? ` ${item.unit}` : ''}
          </td>
        )}
        {tmpl.show_unit_price && (
          <td className="text-right py-3.5 px-3 text-sm text-gray-600 whitespace-nowrap align-top tabular-nums">{formatCurrency(item.unit_price)}</td>
        )}
        {tmpl.show_line_item_total && (
          <td className="text-right py-3.5 text-sm font-bold whitespace-nowrap align-top tabular-nums text-gray-900">{formatCurrency(rowTotal)}</td>
        )}
        <td className="py-3.5 pl-2 align-top">
          <button onClick={onEditTask} className={`p-1 rounded transition-colors opacity-0 group-hover/row:opacity-100 ${item.task_notes ? 'text-orange-400 hover:text-orange-600 hover:bg-orange-50' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'}`} title={item.task_notes ? 'Edit install task' : 'Add install task'}>
            <Wrench className="w-3.5 h-3.5" />
          </button>
        </td>
      </tr>
      {item.task_notes && (
        <tr className="border-b border-gray-100">
          <td colSpan={colCount} className="px-4 pb-2.5 pt-0">
            <div className={`flex items-baseline gap-1.5 px-2 py-1 rounded text-xs ${item.show_task_notes ? 'bg-green-50 border border-green-100 text-green-700' : 'bg-orange-50 border border-orange-100 text-orange-700'}`}>
              <span className="font-semibold shrink-0">Task{!item.show_task_notes ? ' (Internal):' : ':'}</span>
              <span>{item.task_notes}</span>
            </div>
          </td>
        </tr>
      )}
      {visibleAccessories.map(acc => (
        <tr key={acc.id} className="border-b border-gray-50 bg-gray-50/50 hover:bg-gray-50 transition-colors">
          <td className="py-2 pl-8">
            <div className="flex items-center gap-2">
              <span className="text-gray-300 text-xs select-none">↳</span>
              <p className="text-xs text-gray-600">{acc.description}</p>
            </div>
          </td>
          {tmpl.show_quantity && <td className="text-center py-2 px-3 text-xs text-gray-500 whitespace-nowrap">{acc.quantity}</td>}
          {tmpl.show_unit_price && <td className="text-right py-2 px-3 text-xs text-gray-500 whitespace-nowrap tabular-nums">{formatCurrency(acc.unit_price)}</td>}
          {tmpl.show_line_item_total && <td className="text-right py-2 text-xs text-gray-600 whitespace-nowrap tabular-nums">{formatCurrency((acc.line_total || 0) + (acc.labor_total || 0))}</td>}
          <td />
        </tr>
      ))}
    </>
  );
}

function GridLineItemRow({ item, formatCurrency, onEditTask, visibleColumns, laborPhases, onPhaseChange, onViewItem, onEditItem }: {
  item: LineItem;
  formatCurrency: (v: number) => string;
  onEditTask: () => void;
  visibleColumns: Set<string>;
  laborPhases: { id: string; name: string }[];
  onPhaseChange: (itemId: string, phaseId: string | null) => Promise<void>;
  onViewItem: (id: string) => void;
  onEditItem: (id: string) => void;
}) {
  const [savingPhase, setSavingPhase] = useState(false);
  const isLabor = item.item_type === 'labor';
  const hasLabor = (item.labor_total ?? 0) > 0;
  const visibleAccessories = item.accessories?.filter(a => !a.is_hidden) ?? [];
  const rowTotal = (item.quantity || 0) * (item.unit_price || 0) + (item.labor_total || 0);
  const mfr = item.products?.manufacturers?.name || null;
  const sku = item.products?.sku || null;
  const colCount = visibleColumns.size + 2;

  async function handlePhaseChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    setSavingPhase(true);
    await onPhaseChange(item.id, val || null);
    setSavingPhase(false);
  }

  return (
    <>
      <tr className="border-t border-gray-700 hover:bg-gray-800/50 transition-colors h-10 group/grow">
        {/* Lock handle — read-only indicator */}
        <td className="py-2 px-2 align-middle w-7">
          <GripVertical className="w-3 h-3 text-gray-700 mx-auto" />
        </td>
        {visibleColumns.has('manufacturer') && (
          <td className="py-2 px-3 text-xs text-gray-400 whitespace-nowrap overflow-hidden text-ellipsis max-w-[140px] align-middle" title={mfr || ''}>
            {mfr || <span className="text-gray-700">—</span>}
          </td>
        )}
        {visibleColumns.has('sku') && (
          <td className="py-2 px-3 text-xs font-mono whitespace-nowrap overflow-hidden text-ellipsis max-w-[110px] align-middle" title={sku || ''}>
            {sku ? (
              <button
                onClick={() => onViewItem(item.id)}
                className="text-cyan-400 hover:text-cyan-300 hover:underline cursor-pointer transition-colors"
              >
                {sku}
              </button>
            ) : (
              <span className="text-gray-700 font-sans">—</span>
            )}
          </td>
        )}
        {visibleColumns.has('description') && (
          <td className="py-2 px-3 align-middle">
            <div className="flex items-center gap-2">
              {isLabor
                ? <Wrench className="w-3 h-3 text-blue-400 flex-shrink-0" />
                : <Package className="w-3 h-3 text-gray-500 flex-shrink-0" />}
              <div className="min-w-0 flex-1">
                <button
                  onClick={() => onViewItem(item.id)}
                  className="text-white text-xs whitespace-nowrap overflow-hidden text-ellipsis block max-w-[260px] hover:text-cyan-300 transition-colors text-left cursor-pointer"
                  title={item.description}
                >
                  {item.description}
                </button>
                {item.proposal_classes && (
                  <span className="inline-flex items-center gap-1 mt-0.5 px-1 py-0.5 rounded text-xs font-medium" style={{ background: item.proposal_classes.color + '25', color: item.proposal_classes.color }}>
                    <Tag className="w-2 h-2" />{item.proposal_classes.name}
                  </span>
                )}
              </div>
            </div>
          </td>
        )}
        {visibleColumns.has('qty') && (
          <td className="py-2 px-3 text-right text-xs text-gray-300 whitespace-nowrap tabular-nums align-middle">
            {item.quantity}{item.unit && item.unit !== 'ea' ? ` ${item.unit}` : ''}
          </td>
        )}
        {visibleColumns.has('cost') && (
          <td className="py-2 px-3 text-right text-xs text-gray-500 whitespace-nowrap tabular-nums align-middle">
            {item.cost != null ? formatCurrency(item.cost) : <span className="text-gray-700">—</span>}
          </td>
        )}
        {visibleColumns.has('price') && (
          <td className="py-2 px-3 text-right text-xs text-gray-300 whitespace-nowrap tabular-nums border-r border-gray-700/60 align-middle">
            {formatCurrency(item.unit_price)}
          </td>
        )}
        {visibleColumns.has('laborPhase') && (
          <td className="py-2 px-3 align-middle min-w-[120px]">
            <div className="relative">
              <select
                value={item.labor_phase_id || ''}
                onChange={handlePhaseChange}
                disabled={savingPhase}
                className="w-full text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded px-2 py-1 focus:outline-none focus:border-cyan-600 focus:ring-1 focus:ring-cyan-600/30 disabled:opacity-50 cursor-pointer hover:border-gray-500 transition-colors appearance-none pr-5"
                title="Assign labor phase (does not affect pricing)"
              >
                <option value="">— Unassigned —</option>
                {laborPhases.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {savingPhase && (
                <Loader2 className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-cyan-400 animate-spin pointer-events-none" />
              )}
            </div>
          </td>
        )}
        {visibleColumns.has('laborHrs') && (
          <td className="py-2 px-3 text-right text-xs whitespace-nowrap align-middle">
            {hasLabor ? <span className="text-cyan-400 font-medium tabular-nums">{item.labor_hours}</span> : <span className="text-gray-700">—</span>}
          </td>
        )}
        {visibleColumns.has('laborRate') && (
          <td className="py-2 px-3 text-right text-xs whitespace-nowrap align-middle">
            {hasLabor ? <span className="text-cyan-400 tabular-nums">{formatCurrency(item.labor_rate || 0)}</span> : <span className="text-gray-700">—</span>}
          </td>
        )}
        {visibleColumns.has('laborTotal') && (
          <td className="py-2 px-3 text-right text-xs whitespace-nowrap border-r border-gray-700/60 align-middle">
            {hasLabor ? <span className="text-cyan-400 font-semibold tabular-nums">{formatCurrency(item.labor_total!)}</span> : <span className="text-gray-700">—</span>}
          </td>
        )}
        {visibleColumns.has('lineTotal') && (
          <td className="py-2 px-3 text-right text-xs font-semibold text-white whitespace-nowrap tabular-nums align-middle">
            {formatCurrency(rowTotal)}
          </td>
        )}
        {/* Actions */}
        <td className="py-2 px-2 align-middle">
          <div className="flex items-center gap-0.5 opacity-0 group-hover/grow:opacity-100 transition-opacity">
            <button
              onClick={() => onEditItem(item.id)}
              className="p-1 rounded text-gray-600 hover:text-blue-400 hover:bg-blue-900/30 transition-colors"
              title="Edit line item"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onEditTask}
              className={`p-1 rounded transition-colors ${item.task_notes ? 'text-orange-400 hover:text-orange-300 hover:bg-orange-900/30' : 'text-gray-600 hover:text-gray-400 hover:bg-gray-700'}`}
              title={item.task_notes ? 'Edit install task' : 'Add install task'}
            >
              <Wrench className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      </tr>
      {item.task_notes && (
        <tr>
          <td colSpan={colCount} className="px-3 pb-2 pt-0">
            <div className={`flex items-baseline gap-1.5 px-2.5 py-1 rounded text-xs ${item.show_task_notes ? 'bg-green-900/20 border border-green-700/30 text-green-400' : 'bg-orange-900/20 border border-orange-700/30 text-orange-300'}`}>
              <span className="font-semibold shrink-0">Task{!item.show_task_notes ? ' (Internal):' : ':'}</span>
              <span>{item.task_notes}</span>
            </div>
          </td>
        </tr>
      )}
      {visibleAccessories.map(acc => {
        const accHasLabor = (acc.labor_total ?? 0) > 0;
        const accRowTotal = (acc.quantity || 0) * (acc.unit_price || 0) + (acc.labor_total || 0);
        const accMfr = acc.products?.manufacturers?.name || null;
        const accSku = acc.products?.sku || null;
        return (
          <tr key={acc.id} className="border-t border-gray-700/50 bg-gray-900/40 hover:bg-gray-800/30 transition-colors h-9">
            {/* Lock handle placeholder */}
            <td className="py-2 px-2 align-middle w-7" />
            {visibleColumns.has('manufacturer') && (
              <td className="py-2 px-3 text-xs text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis max-w-[140px] align-middle" title={accMfr || ''}>
                {accMfr || <span className="text-gray-700">—</span>}
              </td>
            )}
            {visibleColumns.has('sku') && (
              <td className="py-2 px-3 text-xs font-mono whitespace-nowrap overflow-hidden text-ellipsis max-w-[110px] align-middle" title={accSku || ''}>
                {accSku ? (
                  <button
                    onClick={() => onViewItem(acc.id)}
                    className="text-cyan-600 hover:text-cyan-400 hover:underline cursor-pointer transition-colors"
                  >
                    {accSku}
                  </button>
                ) : (
                  <span className="text-gray-700 font-sans">—</span>
                )}
              </td>
            )}
            {visibleColumns.has('description') && (
              <td className="py-2 px-3 align-middle" style={{ paddingLeft: '1.25rem' }}>
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-600 text-xs select-none flex-shrink-0">↳</span>
                  <span className="text-xs text-green-200 whitespace-nowrap overflow-hidden text-ellipsis max-w-[240px]" title={acc.description}>
                    {acc.description}
                  </span>
                </div>
              </td>
            )}
            {visibleColumns.has('qty') && (
              <td className="py-2 px-3 text-right text-xs text-gray-500 whitespace-nowrap tabular-nums align-middle">{acc.quantity}</td>
            )}
            {visibleColumns.has('cost') && (
              <td className="py-2 px-3 text-right text-xs text-gray-600 whitespace-nowrap tabular-nums align-middle">
                {acc.cost != null ? formatCurrency(acc.cost) : <span className="text-gray-700">—</span>}
              </td>
            )}
            {visibleColumns.has('price') && (
              <td className="py-2 px-3 text-right text-xs text-gray-500 whitespace-nowrap border-r border-gray-700/50 tabular-nums align-middle">{formatCurrency(acc.unit_price)}</td>
            )}
            {visibleColumns.has('laborPhase') && <td />}
            {visibleColumns.has('laborHrs') && (
              <td className="py-2 px-3 text-right text-xs text-gray-600 whitespace-nowrap align-middle">{accHasLabor ? <span className="text-cyan-600 tabular-nums">{acc.labor_hours}</span> : <span className="text-gray-700">—</span>}</td>
            )}
            {visibleColumns.has('laborRate') && (
              <td className="py-2 px-3 text-right text-xs text-gray-600 whitespace-nowrap align-middle">{accHasLabor ? <span className="text-cyan-600 tabular-nums">{formatCurrency(acc.labor_rate || 0)}</span> : <span className="text-gray-700">—</span>}</td>
            )}
            {visibleColumns.has('laborTotal') && (
              <td className="py-2 px-3 text-right text-xs text-gray-600 whitespace-nowrap border-r border-gray-700/50 align-middle">{accHasLabor ? <span className="text-cyan-600 tabular-nums">{formatCurrency(acc.labor_total!)}</span> : <span className="text-gray-700">—</span>}</td>
            )}
            {visibleColumns.has('lineTotal') && (
              <td className="py-2 px-3 text-right text-xs text-gray-400 whitespace-nowrap tabular-nums align-middle">{formatCurrency(accRowTotal)}</td>
            )}
            <td />
          </tr>
        );
      })}
    </>
  );
}

function PricingPanel({ totals, settings, formatCurrency }: { totals: ProposalTotals; settings: ProposalSettings | null; formatCurrency: (v: number) => string }) {
  const mod1Label = settings?.custom_modifier_1_label || 'Custom Modifier 1';
  const mod2Label = settings?.custom_modifier_2_label || 'Custom Modifier 2';
  const hasDiscount = (totals.discount_amount || 0) > 0;
  const hasProjMgmt = (totals.project_management_amount || 0) > 0;
  const hasProjDesign = (totals.project_design_amount || 0) > 0;
  const hasSysDesign = (totals.system_design_amount || 0) > 0;
  const hasCCFee = (totals.credit_card_fee_amount || 0) > 0;
  const hasMiscParts = (totals.misc_parts_amount || 0) > 0;
  const hasMod1 = (totals.custom_modifier_1_amount || 0) !== 0;
  const hasMod2 = (totals.custom_modifier_2_amount || 0) !== 0;
  const hasTax = (totals.tax_amount || 0) > 0;
  const hasDeposit = (totals.deposit_amount || 0) > 0;
  const hasAnyModifier = hasDiscount || hasProjMgmt || hasProjDesign || hasSysDesign || hasCCFee || hasMiscParts || hasMod1 || hasMod2;
  const modifierCount = [hasDiscount, hasProjMgmt, hasProjDesign, hasSysDesign, hasCCFee, hasMiscParts, hasMod1, hasMod2].filter(Boolean).length;
  const hasPartsLabor = (totals.parts_total ?? 0) > 0 || (totals.labor_total ?? 0) > 0;

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden shadow-lg">
      <div className="px-4 py-3 bg-gray-800/80 border-b border-gray-700/50">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-semibold text-gray-200 uppercase tracking-wide">Contract Totals</h3>
          {modifierCount > 0 && <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-900/50 text-blue-300 border border-blue-700/40">{modifierCount} adj.</span>}
          {hasDiscount && <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-900/50 text-red-300 border border-red-700/40">Discount</span>}
        </div>
      </div>

      {hasPartsLabor && (
        <div className="px-4 py-3 bg-gray-800/30 border-b border-gray-700/40 space-y-1.5 text-sm">
          <div className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-2">Breakdown</div>
          {(totals.parts_total ?? 0) > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-gray-400 flex items-center gap-1.5"><Package className="w-3 h-3" />Materials</span>
              <span className="text-gray-300 font-medium tabular-nums">{formatCurrency(totals.parts_total ?? 0)}</span>
            </div>
          )}
          {(totals.labor_total ?? 0) > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-cyan-500/80 flex items-center gap-1.5"><Wrench className="w-3 h-3" />Labor</span>
              <span className="text-cyan-400 font-medium tabular-nums">{formatCurrency(totals.labor_total ?? 0)}</span>
            </div>
          )}
        </div>
      )}

      <div className="p-4 space-y-1.5 text-sm">
        <div className="flex justify-between items-center">
          <span className="text-gray-400">Items Subtotal</span>
          <span className="text-white font-semibold tabular-nums">{formatCurrency(totals.subtotal || 0)}</span>
        </div>
        {hasDiscount && <div className="flex justify-between items-center pl-3 border-l-2 border-red-700/50"><span className="text-red-400 text-xs">Discount{(totals.discount_percent || 0) > 0 && <span className="opacity-70 ml-1">({totals.discount_percent}%)</span>}</span><span className="text-red-400 font-medium tabular-nums">-{formatCurrency(totals.discount_amount)}</span></div>}
        {hasProjMgmt && <div className="flex justify-between items-center pl-3 border-l-2 border-blue-700/50"><span className="text-blue-400 text-xs">Proj. Mgmt{(totals.project_management_percent || 0) > 0 && <span className="opacity-70 ml-1">({totals.project_management_percent}%)</span>}</span><span className="text-blue-400 font-medium tabular-nums">+{formatCurrency(totals.project_management_amount)}</span></div>}
        {hasProjDesign && <div className="flex justify-between items-center pl-3 border-l-2 border-blue-700/50"><span className="text-blue-400 text-xs">Proj. Design{(totals.project_design_percent || 0) > 0 && <span className="opacity-70 ml-1">({totals.project_design_percent}%)</span>}</span><span className="text-blue-400 font-medium tabular-nums">+{formatCurrency(totals.project_design_amount)}</span></div>}
        {hasSysDesign && <div className="flex justify-between items-center pl-3 border-l-2 border-blue-700/50"><span className="text-blue-400 text-xs">Sys. Design{(totals.system_design_percent || 0) > 0 && <span className="opacity-70 ml-1">({totals.system_design_percent}%)</span>}</span><span className="text-blue-400 font-medium tabular-nums">+{formatCurrency(totals.system_design_amount)}</span></div>}
        {hasCCFee && <div className="flex justify-between items-center pl-3 border-l-2 border-blue-700/50"><span className="text-blue-400 text-xs">CC Fee{(totals.credit_card_fee_percent || 0) > 0 && <span className="opacity-70 ml-1">({totals.credit_card_fee_percent}%)</span>}</span><span className="text-blue-400 font-medium tabular-nums">+{formatCurrency(totals.credit_card_fee_amount)}</span></div>}
        {hasMiscParts && <div className="flex justify-between items-center pl-3 border-l-2 border-blue-700/50"><span className="text-blue-400 text-xs">Misc Parts{(totals.misc_parts_percent || 0) > 0 && <span className="opacity-70 ml-1">({totals.misc_parts_percent}%)</span>}</span><span className="text-blue-400 font-medium tabular-nums">+{formatCurrency(totals.misc_parts_amount)}</span></div>}
        {hasMod1 && <div className="flex justify-between items-center pl-3 border-l-2 border-blue-700/50"><span className="text-blue-400 text-xs">{mod1Label}{(totals.custom_modifier_1_percent || 0) !== 0 && <span className="opacity-70 ml-1">({totals.custom_modifier_1_percent}%)</span>}</span><span className={`font-medium tabular-nums ${(totals.custom_modifier_1_amount || 0) < 0 ? 'text-red-400' : 'text-blue-400'}`}>{(totals.custom_modifier_1_amount || 0) < 0 ? '-' : '+'}{formatCurrency(Math.abs(totals.custom_modifier_1_amount))}</span></div>}
        {hasMod2 && <div className="flex justify-between items-center pl-3 border-l-2 border-blue-700/50"><span className="text-blue-400 text-xs">{mod2Label}{(totals.custom_modifier_2_percent || 0) !== 0 && <span className="opacity-70 ml-1">({totals.custom_modifier_2_percent}%)</span>}</span><span className={`font-medium tabular-nums ${(totals.custom_modifier_2_amount || 0) < 0 ? 'text-red-400' : 'text-blue-400'}`}>{(totals.custom_modifier_2_amount || 0) < 0 ? '-' : '+'}{formatCurrency(Math.abs(totals.custom_modifier_2_amount))}</span></div>}
        {hasAnyModifier && <div className="pt-1 border-t border-gray-700/50" />}
        {hasTax && (
          <div className="flex justify-between items-center">
            <span className="text-gray-400 text-xs">Sales Tax{(totals.tax_rate || 0) > 0 && <span className="ml-1 opacity-60">({(totals.tax_rate * 100).toFixed(3)}%)</span>}</span>
            <span className="text-gray-300 tabular-nums">{formatCurrency(totals.tax_amount || 0)}</span>
          </div>
        )}
        <div className="pt-2 border-t border-gray-600 flex justify-between items-center">
          <span className="font-bold text-white">Contract Total</span>
          <span className="font-bold text-white text-lg tabular-nums">{formatCurrency(totals.total || 0)}</span>
        </div>
        {hasDeposit && (
          <div className="flex justify-between items-center pt-1 border-t border-gray-700/40">
            <span className="text-gray-400 text-xs">Deposit Req.{(totals.deposit_percent || 0) > 0 && <span className="ml-1 opacity-60">({totals.deposit_percent}%)</span>}</span>
            <span className="text-green-400 font-semibold tabular-nums">{formatCurrency(totals.deposit_amount)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function TotalsFooter({ totals, settings, formatCurrency }: { totals: ProposalTotals; settings: ProposalSettings | null; formatCurrency: (v: number) => string }) {
  const mod1Label = settings?.custom_modifier_1_label || 'Custom Modifier 1';
  const mod2Label = settings?.custom_modifier_2_label || 'Custom Modifier 2';
  const hasDiscount = (totals.discount_amount || 0) > 0;
  const hasProjMgmt = (totals.project_management_amount || 0) > 0;
  const hasProjDesign = (totals.project_design_amount || 0) > 0;
  const hasSysDesign = (totals.system_design_amount || 0) > 0;
  const hasCCFee = (totals.credit_card_fee_amount || 0) > 0;
  const hasMiscParts = (totals.misc_parts_amount || 0) > 0;
  const hasMod1 = (totals.custom_modifier_1_amount || 0) !== 0;
  const hasMod2 = (totals.custom_modifier_2_amount || 0) !== 0;
  const hasTax = (totals.tax_amount || 0) > 0;
  const hasDeposit = (totals.deposit_amount || 0) > 0;
  const hasAnyModifier = hasDiscount || hasProjMgmt || hasProjDesign || hasSysDesign || hasCCFee || hasMiscParts || hasMod1 || hasMod2;
  const hasPartsLabor = (totals.parts_total ?? 0) > 0 || (totals.labor_total ?? 0) > 0;

  return (
    <div className="mt-4 bg-gray-900 border border-gray-700 rounded-xl overflow-hidden shadow-xl">
      <div className="px-5 py-3 bg-gray-800/80 border-b border-gray-700/50 flex items-center gap-3">
        <Receipt className="w-4 h-4 text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-200 uppercase tracking-wide">Contract Totals</h3>
        {hasDiscount && <span className="text-xs px-2 py-0.5 rounded-full bg-red-900/50 text-red-300 border border-red-700/40 flex items-center gap-1"><TrendingDown className="w-3 h-3" />Discount</span>}
        {hasAnyModifier && !hasDiscount && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/50 text-blue-300 border border-blue-700/40 flex items-center gap-1"><TrendingUp className="w-3 h-3" />Adjustments</span>}
      </div>

      <div className="p-5">
        {hasPartsLabor && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 pb-4 border-b border-gray-700/50">
            {(totals.parts_total ?? 0) > 0 && (
              <div className="bg-gray-800/60 rounded-lg px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1"><Package className="w-3 h-3" />Materials</div>
                <div className="text-sm font-semibold text-gray-200 tabular-nums">{formatCurrency(totals.parts_total ?? 0)}</div>
              </div>
            )}
            {(totals.labor_total ?? 0) > 0 && (
              <div className="bg-gray-800/60 rounded-lg px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-xs text-cyan-600/80 mb-1"><Wrench className="w-3 h-3" />Labor</div>
                <div className="text-sm font-semibold text-cyan-400 tabular-nums">{formatCurrency(totals.labor_total ?? 0)}</div>
              </div>
            )}
            <div className="bg-gray-800/60 rounded-lg px-3 py-2.5">
              <div className="text-xs text-gray-500 mb-1">Items Subtotal</div>
              <div className="text-sm font-semibold text-white tabular-nums">{formatCurrency(totals.subtotal || 0)}</div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-0">
          {!hasPartsLabor && (
            <div className="flex justify-between items-center py-2 border-b border-gray-800/60 col-span-full">
              <span className="text-sm text-gray-400">Items Subtotal</span>
              <span className="text-sm font-semibold text-white tabular-nums">{formatCurrency(totals.subtotal || 0)}</span>
            </div>
          )}

          {hasDiscount && (
            <div className="flex justify-between items-center py-2 border-b border-gray-800/60">
              <span className="text-sm text-red-400 flex items-center gap-1.5">
                <TrendingDown className="w-3.5 h-3.5" />
                Discount{(totals.discount_percent || 0) > 0 && <span className="text-xs opacity-70 ml-0.5">({totals.discount_percent}%)</span>}
              </span>
              <span className="text-sm font-medium text-red-400 tabular-nums">-{formatCurrency(totals.discount_amount)}</span>
            </div>
          )}
          {hasProjMgmt && (
            <div className="flex justify-between items-center py-2 border-b border-gray-800/60">
              <span className="text-sm text-blue-400">
                Proj. Mgmt{(totals.project_management_percent || 0) > 0 && <span className="text-xs opacity-70 ml-1">({totals.project_management_percent}%)</span>}
              </span>
              <span className="text-sm font-medium text-blue-400 tabular-nums">+{formatCurrency(totals.project_management_amount)}</span>
            </div>
          )}
          {hasProjDesign && (
            <div className="flex justify-between items-center py-2 border-b border-gray-800/60">
              <span className="text-sm text-blue-400">
                Proj. Design{(totals.project_design_percent || 0) > 0 && <span className="text-xs opacity-70 ml-1">({totals.project_design_percent}%)</span>}
              </span>
              <span className="text-sm font-medium text-blue-400 tabular-nums">+{formatCurrency(totals.project_design_amount)}</span>
            </div>
          )}
          {hasSysDesign && (
            <div className="flex justify-between items-center py-2 border-b border-gray-800/60">
              <span className="text-sm text-blue-400">
                Sys. Design{(totals.system_design_percent || 0) > 0 && <span className="text-xs opacity-70 ml-1">({totals.system_design_percent}%)</span>}
              </span>
              <span className="text-sm font-medium text-blue-400 tabular-nums">+{formatCurrency(totals.system_design_amount)}</span>
            </div>
          )}
          {hasCCFee && (
            <div className="flex justify-between items-center py-2 border-b border-gray-800/60">
              <span className="text-sm text-blue-400">
                CC Fee{(totals.credit_card_fee_percent || 0) > 0 && <span className="text-xs opacity-70 ml-1">({totals.credit_card_fee_percent}%)</span>}
              </span>
              <span className="text-sm font-medium text-blue-400 tabular-nums">+{formatCurrency(totals.credit_card_fee_amount)}</span>
            </div>
          )}
          {hasMiscParts && (
            <div className="flex justify-between items-center py-2 border-b border-gray-800/60">
              <span className="text-sm text-blue-400">
                Misc Parts{(totals.misc_parts_percent || 0) > 0 && <span className="text-xs opacity-70 ml-1">({totals.misc_parts_percent}%)</span>}
              </span>
              <span className="text-sm font-medium text-blue-400 tabular-nums">+{formatCurrency(totals.misc_parts_amount)}</span>
            </div>
          )}
          {hasMod1 && (
            <div className="flex justify-between items-center py-2 border-b border-gray-800/60">
              <span className="text-sm text-blue-400">
                {mod1Label}{(totals.custom_modifier_1_percent || 0) !== 0 && <span className="text-xs opacity-70 ml-1">({totals.custom_modifier_1_percent}%)</span>}
              </span>
              <span className={`text-sm font-medium tabular-nums ${(totals.custom_modifier_1_amount || 0) < 0 ? 'text-red-400' : 'text-blue-400'}`}>
                {(totals.custom_modifier_1_amount || 0) < 0 ? '-' : '+'}{formatCurrency(Math.abs(totals.custom_modifier_1_amount))}
              </span>
            </div>
          )}
          {hasMod2 && (
            <div className="flex justify-between items-center py-2 border-b border-gray-800/60">
              <span className="text-sm text-blue-400">
                {mod2Label}{(totals.custom_modifier_2_percent || 0) !== 0 && <span className="text-xs opacity-70 ml-1">({totals.custom_modifier_2_percent}%)</span>}
              </span>
              <span className={`text-sm font-medium tabular-nums ${(totals.custom_modifier_2_amount || 0) < 0 ? 'text-red-400' : 'text-blue-400'}`}>
                {(totals.custom_modifier_2_amount || 0) < 0 ? '-' : '+'}{formatCurrency(Math.abs(totals.custom_modifier_2_amount))}
              </span>
            </div>
          )}
          {hasTax && (
            <div className="flex justify-between items-center py-2 border-b border-gray-800/60">
              <span className="text-sm text-gray-400 flex items-center gap-1.5">
                <PercentIcon className="w-3.5 h-3.5" />
                Sales Tax{(totals.tax_rate || 0) > 0 && <span className="text-xs opacity-60 ml-0.5">({(totals.tax_rate * 100).toFixed(3)}%)</span>}
              </span>
              <span className="text-sm text-gray-300 tabular-nums">{formatCurrency(totals.tax_amount || 0)}</span>
            </div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-gray-600 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-gray-400" />
            <span className="text-base font-bold text-white">Contract Total</span>
          </div>
          <span className="text-2xl font-bold text-white tabular-nums">{formatCurrency(totals.total || 0)}</span>
        </div>

        {hasDeposit && (
          <div className="mt-3 pt-3 border-t border-gray-700/40 flex items-center justify-between">
            <span className="text-sm text-gray-400">
              Deposit Required{(totals.deposit_percent || 0) > 0 && <span className="ml-1 opacity-60">({totals.deposit_percent}%)</span>}
            </span>
            <span className="text-base font-semibold text-green-400 tabular-nums">{formatCurrency(totals.deposit_amount)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
