import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import { ProposalRoom, ProposalLineItem, Product } from '../../lib/types';
import { useAuth } from '../../contexts/AuthContext';
import { ArrowLeft, Plus, Settings, CreditCard as Edit2, Trash2, Package, DollarSign, ChevronDown, ChevronRight, GitBranch, Target, Zap, X, AlignJustify, Maximize2, CheckCircle2, Eye, EyeOff, FileText, PanelLeftClose, PanelLeft, Check, GripVertical, Wrench, ChevronUp, User, MapPin, Download, Filter, Receipt, Copy, RefreshCw, Save, Mail, ExternalLink, RotateCcw, Clock, MoreVertical, Bell, XCircle, ThumbsUp, Layers, Unlink, Lock, AlertTriangle, AlertCircle, Globe, Activity, Indent, Outdent } from 'lucide-react';
import {
  recordCOAction,
  recordCOModifierChange,
  updateCOTotals,
  loadCOLineItems,
  restoreCOLineItem,
  type COLineItemRecord,
  type COModifierSnapshot,
} from '../../lib/coAuditTrail';
import ProposalSettings from './ProposalSettings';
import ProposalRevisionManager from './ProposalRevisionManager';
import AddItemToAreasModal from './AddItemToAreasModal';
import QuickAddProductModal from './QuickAddProductModal';
import AreaScopeEditor from './AreaScopeEditor';
import InlineProductSearch from './InlineProductSearch';
import ProposalTaxReport from './ProposalTaxReport';
import LaborPhaseReport from './LaborPhaseReport';
import ProductDetailModal from './ProductDetailModal';
import EditCustomerModal from './EditCustomerModal';
import { ManualApprovalModal } from './ManualApprovalModal';
import ProposalNotificationHistory from './ProposalNotificationHistory';
import ApprovalActionModal from './ApprovalActionModal';
import { PreSendValidationModal } from './PreSendValidationModal';
import { ReactivateProposalModal } from './ReactivateProposalModal';
import { ProposalQA } from './ProposalQA';
import { QaDot } from '../Shared/QaDot';
import BulkUpdateConfirmationModal from './BulkUpdateConfirmationModal';
import BulkUpdateProjectInfoModal from './BulkUpdateProjectInfoModal';
import TwoPhaseLaborEditor from './TwoPhaseLaborEditor';
import { UnlockProposalModal } from './UnlockProposalModal';
import { PromoteRevisionModal } from './PromoteRevisionModal';
import { PortalVersionHistoryModal } from './PortalVersionHistoryModal';
import { PortalProposalDetail } from '../Portal/PortalProposalDetail';
import { EmailProposalModal } from './EmailProposalModal';
import { checkProposalReadiness, type ValidationSection } from '../../lib/proposalValidation';
import { getTaxApplicability, computeTaxTotals, type TaxEnvironment, type TaxProjectType } from '../../lib/taxCalculations';
import type { ProposalRoomPrefill } from '../AIAssistant/AIAssistant';

interface ProposalBuilderCompactProps {
  proposalId: string;
  onBack: () => void;
  onNavigateToSalesOrder?: (salesOrderId: string) => void;
  targetRoomIds?: Set<string>;
  onTargetRoomsChange?: (rooms: Set<string>) => void;
  isStandalone?: boolean;
  onProposalIdChange?: (newProposalId: string) => void;
  aiPrefillRooms?: ProposalRoomPrefill[];
  changeOrderId?: string;
  onCORefresh?: () => void;
}

interface RoomWithItems extends ProposalRoom {
  line_items: (ProposalLineItem & { products?: Product })[];
}

function PricingModifiersModal({ proposal, showApplyToggles = false, onClose, onSave }: { proposal: any; showApplyToggles?: boolean; onClose: () => void; onSave: (modifiers: any) => Promise<void> }) {
  const [discountPercent, setDiscountPercent] = useState(proposal?.discount_percent || 0);
  const [pmPercent, setPmPercent] = useState(proposal?.project_management_percent || 0);
  const [designPercent, setDesignPercent] = useState(proposal?.project_design_percent || 0);
  const [systemDesignPercent, setSystemDesignPercent] = useState(proposal?.system_design_percent || 0);
  const [ccFeePercent, setCcFeePercent] = useState(proposal?.credit_card_fee_percent || 0);
  const [miscPartsPercent, setMiscPartsPercent] = useState(proposal?.misc_parts_percent || 0);
  const [custom1Label, setCustom1Label] = useState(proposal?.custom_modifier_1_label || '');
  const [custom1Percent, setCustom1Percent] = useState(proposal?.custom_modifier_1_percent || 0);
  const [custom2Label, setCustom2Label] = useState(proposal?.custom_modifier_2_label || '');
  const [custom2Percent, setCustom2Percent] = useState(proposal?.custom_modifier_2_percent || 0);
  const [applyDiscount, setApplyDiscount] = useState(proposal?.apply_discount ?? (proposal?.discount_percent > 0));
  const [applyPm, setApplyPm] = useState(proposal?.apply_project_management ?? (proposal?.project_management_percent > 0));
  const [applyDesign, setApplyDesign] = useState(proposal?.apply_project_design ?? (proposal?.project_design_percent > 0));
  const [applySystemDesign, setApplySystemDesign] = useState(proposal?.apply_system_design ?? (proposal?.system_design_percent > 0));
  const [applyCcFee, setApplyCcFee] = useState(proposal?.apply_credit_card_fee ?? (proposal?.credit_card_fee_percent > 0));
  const [applyMiscParts, setApplyMiscParts] = useState(proposal?.apply_misc_parts ?? (proposal?.misc_parts_percent > 0));
  const [applyCustom1, setApplyCustom1] = useState(proposal?.apply_custom_modifier_1 ?? (proposal?.custom_modifier_1_percent !== 0));
  const [applyCustom2, setApplyCustom2] = useState(proposal?.apply_custom_modifier_2 ?? (proposal?.custom_modifier_2_percent !== 0));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave({
      discount_percent: discountPercent,
      project_management_percent: pmPercent,
      project_design_percent: designPercent,
      system_design_percent: systemDesignPercent,
      credit_card_fee_percent: ccFeePercent,
      misc_parts_percent: miscPartsPercent,
      custom_modifier_1_label: custom1Label || null,
      custom_modifier_1_percent: custom1Percent,
      custom_modifier_2_label: custom2Label || null,
      custom_modifier_2_percent: custom2Percent,
      apply_discount: applyDiscount,
      apply_project_management: applyPm,
      apply_project_design: applyDesign,
      apply_system_design: applySystemDesign,
      apply_credit_card_fee: applyCcFee,
      apply_misc_parts: applyMiscParts,
      apply_custom_modifier_1: applyCustom1,
      apply_custom_modifier_2: applyCustom2,
    });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">Pricing Modifiers</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {showApplyToggles && (
            <div className="bg-amber-900/30 border border-amber-700/40 rounded-lg px-4 py-2.5 text-xs text-amber-300 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>You are editing modifiers for this Change Order. Toggle each modifier on/off and adjust its percentage. Changes will be tracked in the CO audit trail.</span>
            </div>
          )}
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-300">Discount %</label>
                {showApplyToggles && (
                  <button
                    type="button"
                    onClick={() => setApplyDiscount(!applyDiscount)}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${applyDiscount ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300' : 'bg-gray-700 border-gray-600 text-gray-400'}`}
                  >
                    {applyDiscount ? 'Active' : 'Off'}
                  </button>
                )}
              </div>
              <input
                type="number"
                value={discountPercent}
                onChange={(e) => setDiscountPercent(parseFloat(e.target.value) || 0)}
                step="0.01"
                className={`w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white transition-opacity ${showApplyToggles && !applyDiscount ? 'opacity-40' : ''}`}
                placeholder="0.00"
              />
              <p className="text-xs text-gray-500 mt-1">Enter positive number to subtract from subtotal</p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-300">Project Management %</label>
                {showApplyToggles && (
                  <button
                    type="button"
                    onClick={() => setApplyPm(!applyPm)}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${applyPm ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300' : 'bg-gray-700 border-gray-600 text-gray-400'}`}
                  >
                    {applyPm ? 'Active' : 'Off'}
                  </button>
                )}
              </div>
              <input
                type="number"
                value={pmPercent}
                onChange={(e) => setPmPercent(parseFloat(e.target.value) || 0)}
                step="0.01"
                className={`w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white transition-opacity ${showApplyToggles && !applyPm ? 'opacity-40' : ''}`}
                placeholder="0.00"
              />
              <p className="text-xs text-gray-500 mt-1">Project management fee percentage</p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-300">Project Design %</label>
                {showApplyToggles && (
                  <button
                    type="button"
                    onClick={() => setApplyDesign(!applyDesign)}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${applyDesign ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300' : 'bg-gray-700 border-gray-600 text-gray-400'}`}
                  >
                    {applyDesign ? 'Active' : 'Off'}
                  </button>
                )}
              </div>
              <input
                type="number"
                value={designPercent}
                onChange={(e) => setDesignPercent(parseFloat(e.target.value) || 0)}
                step="0.01"
                className={`w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white transition-opacity ${showApplyToggles && !applyDesign ? 'opacity-40' : ''}`}
                placeholder="0.00"
              />
              <p className="text-xs text-gray-500 mt-1">Design fee percentage</p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-300">System Design %</label>
                {showApplyToggles && (
                  <button
                    type="button"
                    onClick={() => setApplySystemDesign(!applySystemDesign)}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${applySystemDesign ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300' : 'bg-gray-700 border-gray-600 text-gray-400'}`}
                  >
                    {applySystemDesign ? 'Active' : 'Off'}
                  </button>
                )}
              </div>
              <input
                type="number"
                value={systemDesignPercent}
                onChange={(e) => setSystemDesignPercent(parseFloat(e.target.value) || 0)}
                step="0.01"
                className={`w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white transition-opacity ${showApplyToggles && !applySystemDesign ? 'opacity-40' : ''}`}
                placeholder="0.00"
              />
              <p className="text-xs text-gray-500 mt-1">System design fee percentage</p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-300">Credit Card Fee %</label>
                {showApplyToggles && (
                  <button
                    type="button"
                    onClick={() => setApplyCcFee(!applyCcFee)}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${applyCcFee ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300' : 'bg-gray-700 border-gray-600 text-gray-400'}`}
                  >
                    {applyCcFee ? 'Active' : 'Off'}
                  </button>
                )}
              </div>
              <input
                type="number"
                value={ccFeePercent}
                onChange={(e) => setCcFeePercent(parseFloat(e.target.value) || 0)}
                step="0.01"
                className={`w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white transition-opacity ${showApplyToggles && !applyCcFee ? 'opacity-40' : ''}`}
                placeholder="0.00"
              />
              <p className="text-xs text-gray-500 mt-1">Credit card processing fee</p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-300">Misc Parts %</label>
                {showApplyToggles && (
                  <button
                    type="button"
                    onClick={() => setApplyMiscParts(!applyMiscParts)}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${applyMiscParts ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300' : 'bg-gray-700 border-gray-600 text-gray-400'}`}
                  >
                    {applyMiscParts ? 'Active' : 'Off'}
                  </button>
                )}
              </div>
              <input
                type="number"
                value={miscPartsPercent}
                onChange={(e) => setMiscPartsPercent(parseFloat(e.target.value) || 0)}
                step="0.01"
                className={`w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white transition-opacity ${showApplyToggles && !applyMiscParts ? 'opacity-40' : ''}`}
                placeholder="0.00"
              />
              <p className="text-xs text-gray-500 mt-1">Miscellaneous parts markup</p>
            </div>

            <div className="border-t border-gray-700 pt-4">
              <h3 className="text-sm font-semibold text-white mb-3">Custom Modifiers</h3>

              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-300">Custom Modifier 1 Label</label>
                    {showApplyToggles && (
                      <button
                        type="button"
                        onClick={() => setApplyCustom1(!applyCustom1)}
                        className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${applyCustom1 ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300' : 'bg-gray-700 border-gray-600 text-gray-400'}`}
                      >
                        {applyCustom1 ? 'Active' : 'Off'}
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={custom1Label}
                    onChange={(e) => setCustom1Label(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white mb-2"
                    placeholder="e.g., Rush Fee, Volume Discount, etc."
                  />
                  <input
                    type="number"
                    value={custom1Percent}
                    onChange={(e) => setCustom1Percent(parseFloat(e.target.value) || 0)}
                    step="0.01"
                    className={`w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white transition-opacity ${showApplyToggles && !applyCustom1 ? 'opacity-40' : ''}`}
                    placeholder="0.00"
                  />
                  <p className="text-xs text-gray-500 mt-1">Use positive for additions, negative for deductions</p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-300">Custom Modifier 2 Label</label>
                    {showApplyToggles && (
                      <button
                        type="button"
                        onClick={() => setApplyCustom2(!applyCustom2)}
                        className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${applyCustom2 ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300' : 'bg-gray-700 border-gray-600 text-gray-400'}`}
                      >
                        {applyCustom2 ? 'Active' : 'Off'}
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={custom2Label}
                    onChange={(e) => setCustom2Label(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white mb-2"
                    placeholder="e.g., Referral Credit, Fuel Surcharge, etc."
                  />
                  <input
                    type="number"
                    value={custom2Percent}
                    onChange={(e) => setCustom2Percent(parseFloat(e.target.value) || 0)}
                    step="0.01"
                    className={`w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white transition-opacity ${showApplyToggles && !applyCustom2 ? 'opacity-40' : ''}`}
                    placeholder="0.00"
                  />
                  <p className="text-xs text-gray-500 mt-1">Use positive for additions, negative for deductions</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 bg-gray-800 border-t border-gray-700 px-6 py-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : 'Save Modifiers'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterModal({
  onClose,
  filters,
  onApply,
  rooms,
  uniquePhases,
  uniqueManufacturers
}: {
  onClose: () => void;
  filters: any;
  onApply: (filters: any) => void;
  rooms: RoomWithItems[];
  uniquePhases: string[];
  uniqueManufacturers: string[];
}) {
  const [localFilters, setLocalFilters] = useState(filters);

  const toggleFilter = (category: 'areas' | 'phases' | 'manufacturers', value: string) => {
    setLocalFilters((prev: any) => ({
      ...prev,
      [category]: prev[category].includes(value)
        ? prev[category].filter((v: string) => v !== value)
        : [...prev[category], value]
    }));
  };

  const clearAll = () => {
    setLocalFilters({
      areas: [],
      phases: [],
      manufacturers: []
    });
  };

  const handleApply = () => {
    onApply(localFilters);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">Filter Items</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Areas */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-3">Areas</h3>
            <div className="flex flex-wrap gap-2">
              {rooms.map((room) => (
                <button
                  key={room.id}
                  onClick={() => toggleFilter('areas', room.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    localFilters.areas.includes(room.id)
                      ? 'bg-cyan-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {room.name}
                </button>
              ))}
            </div>
          </div>

          {/* Labor Phases */}
          {uniquePhases.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-white mb-3">Labor Phases</h3>
              <div className="flex flex-wrap gap-2">
                {uniquePhases.map((phase) => (
                  <button
                    key={phase}
                    onClick={() => toggleFilter('phases', phase)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      localFilters.phases.includes(phase)
                        ? 'bg-cyan-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {phase}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Manufacturers */}
          {uniqueManufacturers.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-white mb-3">Manufacturers</h3>
              <div className="flex flex-wrap gap-2">
                {uniqueManufacturers.map((manufacturer) => (
                  <button
                    key={manufacturer}
                    onClick={() => toggleFilter('manufacturers', manufacturer)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      localFilters.manufacturers.includes(manufacturer)
                        ? 'bg-cyan-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {manufacturer}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-gray-800 border-t border-gray-700 px-6 py-4 flex items-center justify-between">
          <button
            onClick={clearAll}
            className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
          >
            Clear All
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors"
            >
              Apply Filters
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProposalBuilderCompact({ proposalId, onBack, onNavigateToSalesOrder, targetRoomIds: externalTargetRoomIds, onTargetRoomsChange, isStandalone = false, onProposalIdChange, aiPrefillRooms, changeOrderId, onCORefresh }: ProposalBuilderCompactProps) {
  const isCoMode = !!changeOrderId;
  const { profile } = useAuth();
  const [proposal, setProposal] = useState<any>(null);
  const [proposalSettings, setProposalSettings] = useState<any>(null);
  const [rooms, setRooms] = useState<RoomWithItems[]>([]);
  const [unassignedItems, setUnassignedItems] = useState<(ProposalLineItem & { products?: Product })[]>([]);
  const [loading, setLoading] = useState(true);
  const aiPrefillSeeded = useRef(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showTaxReport, setShowTaxReport] = useState(false);
  const [showLaborPhaseReport, setShowLaborPhaseReport] = useState(false);

  // Helper function to calculate parts and labor tax for a single line item
  function calculateItemTax(item: any, proposal: any) {
    const taxRate = proposal?.tax_rate || 0;
    const priceTotal = parseFloat(item.price_total || 0);
    const laborTotal = parseFloat(item.labor_total || 0);

    if (!item.is_taxable || taxRate === 0) {
      return { partsTax: 0, laborTax: 0 };
    }

    const env = (proposal?.tax_environment || 'residential') as TaxEnvironment;
    const projType = (proposal?.tax_project_type || 'general_installation_repair') as TaxProjectType;
    const { partsTaxable, laborTaxable } = getTaxApplicability(env, projType);

    return {
      partsTax: partsTaxable ? priceTotal * taxRate : 0,
      laborTax: laborTaxable ? laborTotal * taxRate : 0,
    };
  }
  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set());
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showRevisionManager, setShowRevisionManager] = useState(false);
  const [pricingExpanded, setPricingExpanded] = useState(false);
  const [laborHoursExpanded, setLaborHoursExpanded] = useState(false);
  const [showModifiersModal, setShowModifiersModal] = useState(false);
  const [showAddItemToAreasModal, setShowAddItemToAreasModal] = useState(false);
  const [showQuickAddProduct, setShowQuickAddProduct] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true); // Start collapsed for max screen space
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
  const [editingAreaName, setEditingAreaName] = useState('');
  const [activeAreaId, setActiveAreaId] = useState<string | null>(null);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [filters, setFilters] = useState<{
    areas: string[];
    phases: string[];
    manufacturers: string[];
  }>({
    areas: [],
    phases: [],
    manufacturers: []
  });
  const [newAreaName, setNewAreaName] = useState('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingValues, setEditingValues] = useState<{[key: string]: any}>({});
  const [addingItemToRoom, setAddingItemToRoom] = useState<string | null>(null);
  const [newItemValues, setNewItemValues] = useState({
    description: '',
    quantity: 1,
    price: 0,
    item_type: 'material' as 'material' | 'labor',
    labor_phase: '',
    labor_hours: 0,
    labor_rate: 0,
    product_id: null as string | null
  });
  const [editingScopeRoom, setEditingScopeRoom] = useState<{id: string, name: string, description: string | null, showScope: boolean} | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [showCopyToModal, setShowCopyToModal] = useState(false);
  const [selectedRoomsToCopy, setSelectedRoomsToCopy] = useState<Set<string>>(new Set());
  const [quickAddAreaName, setQuickAddAreaName] = useState('');
  const [showProductDetail, setShowProductDetail] = useState<string | null>(null);
  const [substituteItemId, setSubstituteItemId] = useState<string | null>(null);
  const [substituteSearchQuery, setSubstituteSearchQuery] = useState('');
  const [substituteProducts, setSubstituteProducts] = useState<Product[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set([
    'description', 'manufacturer', 'sku', 'qty', 'cost', 'price',
    'laborPhase', 'laborHrs', 'laborRate', 'laborTotal', 'lineTotal'
  ]));
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [dragOverItem, setDragOverItem] = useState<string | null>(null);
  const [collapsedParents, setCollapsedParents] = useState<Set<string>>(new Set());
  const [editingItemNotes, setEditingItemNotes] = useState<{id: string, notes: string | null, showNotes: boolean} | null>(null);
  const [editingLaborItem, setEditingLaborItem] = useState<{
    id: string;
    description: string;
    productId?: string | null;
  } | null>(null);
  const [bulkUpdateProjectInfo, setBulkUpdateProjectInfo] = useState<{
    itemId: string;
    productId: string | null;
    description: string;
    field: 'install' | 'programming';
    instanceCount: number;
    newValues: any;
  } | null>(null);
  const [laborPhases, setLaborPhases] = useState<any[]>([]);
  const [programmingPhase, setProgrammingPhase] = useState<any | null>(null);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfTemplates, setPdfTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [showEditCustomerModal, setShowEditCustomerModal] = useState(false);
  const [showManualApprovalModal, setShowManualApprovalModal] = useState(false);
  const [showNotificationHistory, setShowNotificationHistory] = useState(false);
  const [showApprovalActionModal, setShowApprovalActionModal] = useState(false);
  const [showSubmissionModal, setShowSubmissionModal] = useState(false);
  const [showReactivateModal, setShowReactivateModal] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState<ValidationSection['name']>('details');
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateDescription, setNewTemplateDescription] = useState('');
  const [newTemplateIsPersonal, setNewTemplateIsPersonal] = useState(true);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [sending, setSending] = useState(false);
  const [recalling, setRecalling] = useState(false);
  const [showPortalDropdown, setShowPortalDropdown] = useState(false);
  const [showPortalPreview, setShowPortalPreview] = useState(false);
  const [showMoreOptionsMenu, setShowMoreOptionsMenu] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showUnlockWarningModal, setShowUnlockWarningModal] = useState(false);
  const [showPortalVersionHistory, setShowPortalVersionHistory] = useState(false);
  const [showPromoteRevisionModal, setShowPromoteRevisionModal] = useState(false);
  const [showEmailProposalModal, setShowEmailProposalModal] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [activityData, setActivityData] = useState<any>(null);
  const [proposalReadiness, setProposalReadiness] = useState<any>(null);
  const [pdfDisplayOptions, setPdfDisplayOptions] = useState({
    showRoomScope: true,
    showProposalNotes: true,
    showDeposit: true,
    showModifiers: true,
    showUnitPrice: true,
    showLinePrice: true,
    showSKU: true,
    showManufacturer: true,
    showColor: true,
    showAreaTotals: true,
    showInstalledPrice: true,
    showLaborPerLine: true,
    separatePartsLabor: false,
    showSalesTax: true,
    showAccessories: true,
    showPackageItems: true,
    hideAllPrices: false,
    showDescription: true,
    showScopeOfWorkPage: true,
    showContractPage: true,
    showDepositPage: true,
    showProductImages: true
  });
  const [pendingBulkUpdate, setPendingBulkUpdate] = useState<{
    itemId: string;
    productId: string;
    fieldName: 'unit_price' | 'cost';
    oldValue: number;
    newValue: number;
    description: string;
    instanceCount: number;
    fullUpdates: any;
  } | null>(null);
  const [bulkUpdateLoading, setBulkUpdateLoading] = useState(false);
  const [coverPageImage, setCoverPageImage] = useState<string | null>(null);
  const [showQA, setShowQA] = useState(false);
  const [qaContext, setQaContext] = useState<{ roomId: string | null; lineItemId: string | null; label: string | null }>({ roomId: null, lineItemId: null, label: null });
  const [messagesByContext, setMessagesByContext] = useState<Record<string, boolean>>({});
  const [unreadByContext, setUnreadByContext] = useState<Record<string, number>>({});

  // CO mode state
  const [coLineItems, setCoLineItems] = useState<COLineItemRecord[]>([]);
  const [coRecord, setCoRecord] = useState<any>(null);
  const [restoringItemId, setRestoringItemId] = useState<string | null>(null);
  const [pendingCORemoval, setPendingCORemoval] = useState<{
    itemId: string;
    item: any;
    roomName: string;
    hasLabor: boolean;
  } | null>(null);
  const [pendingBulkCORemoval, setPendingBulkCORemoval] = useState<Array<{
    itemId: string;
    item: any;
    roomName: string;
    hasLabor: boolean;
  }> | null>(null);
  const [bulkCORemovalScopes, setBulkCORemovalScopes] = useState<Record<string, 'parts_only' | 'parts_and_labor'>>({});
  const [executingBulkRemoval, setExecutingBulkRemoval] = useState(false);

  // Use external state if provided, otherwise use local state
  const targetRoomIds = externalTargetRoomIds || new Set<string>();
  const setTargetRoomIds = onTargetRoomsChange || (() => {});

  const refreshCOLineItems = useCallback(async () => {
    if (!changeOrderId) return;
    const items = await loadCOLineItems(changeOrderId);
    setCoLineItems(items);
  }, [changeOrderId]);

  const loadCORecord = useCallback(async () => {
    if (!changeOrderId) return;
    const { data } = await supabase
      .from('change_orders')
      .select('discount_percent,project_management_percent,project_design_percent,system_design_percent,credit_card_fee_percent,misc_parts_percent,custom_modifier_1_percent,custom_modifier_2_percent,custom_modifier_1_label,custom_modifier_2_label,apply_discount,apply_project_management,apply_project_design,apply_system_design,apply_credit_card_fee,apply_misc_parts,apply_custom_modifier_1,apply_custom_modifier_2')
      .eq('id', changeOrderId)
      .maybeSingle();
    if (data) setCoRecord(data);
  }, [changeOrderId]);

  useEffect(() => {
    refreshCOLineItems();
    loadCORecord();
  }, [refreshCOLineItems, loadCORecord]);

  useEffect(() => {
    if (proposalId) {
      loadData();
      loadColumnPreferences();
      loadLaborPhases();
      loadProposalReadiness();
      loadQaMessages();
    }
  }, [proposalId]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    // Expand all rooms by default
    if (rooms.length > 0) {
      setExpandedRooms(new Set(rooms.map(r => r.id)));
    }
  }, [rooms.length]);

  useEffect(() => {
    if (!aiPrefillRooms || aiPrefillRooms.length === 0 || loading || aiPrefillSeeded.current) return;
    aiPrefillSeeded.current = true;
    seedAiPrefillRooms();
  }, [loading]);

  async function seedAiPrefillRooms() {
    if (!aiPrefillRooms || aiPrefillRooms.length === 0) return;
    try {
      const { data: allProducts } = await supabase
        .from('products')
        .select('id, name, description, unit_price, cost, unit, item_type, is_taxable, labor_phase_id')
        .eq('active', true);

      const products = allProducts || [];

      function findMatchingProduct(description: string) {
        if (!description) return null;
        const needle = description.toLowerCase().trim();
        const exact = products.find(p => p.name?.toLowerCase().trim() === needle);
        if (exact) return exact;
        const partial = products.find(p =>
          p.name?.toLowerCase().includes(needle) || needle.includes(p.name?.toLowerCase() ?? '')
        );
        return partial ?? null;
      }

      for (let i = 0; i < aiPrefillRooms.length; i++) {
        const roomPrefill = aiPrefillRooms[i];
        const { data: newRoom, error: roomError } = await supabase
          .from('proposal_rooms')
          .insert({ proposal_id: proposalId, name: roomPrefill.name, sort_order: i })
          .select()
          .single();
        if (roomError) throw roomError;

        for (let j = 0; j < roomPrefill.lineItems.length; j++) {
          const item = roomPrefill.lineItems[j];
          const matched = item.itemType !== 'labor' ? findMatchingProduct(item.description) : null;

          if (matched) {
            const unitPrice = matched.unit_price ?? 0;
            const cost = matched.cost ?? 0;
            const qty = item.quantity ?? 1;
            await supabase.from('proposal_line_items').insert({
              proposal_id: proposalId,
              room_id: newRoom.id,
              product_id: matched.id,
              description: matched.description ?? matched.name,
              quantity: qty,
              unit: matched.unit ?? item.unit,
              unit_price: unitPrice,
              cost: cost,
              line_total: unitPrice * qty,
              sort_order: j,
              is_custom: false,
              item_type: matched.item_type ?? item.itemType,
              labor_hours: item.laborHours ?? null,
              is_taxable: matched.is_taxable ?? true,
              labor_phase_id: matched.labor_phase_id ?? null,
            });
          } else {
            await supabase.from('proposal_line_items').insert({
              proposal_id: proposalId,
              room_id: newRoom.id,
              description: item.description,
              quantity: item.quantity,
              unit: item.unit,
              unit_price: 0,
              cost: 0,
              line_total: 0,
              sort_order: j,
              is_custom: true,
              item_type: item.itemType,
              labor_hours: item.laborHours ?? null,
              is_taxable: true,
            });
          }
        }
      }
      await loadData();
    } catch (err) {
      console.error('Failed to seed AI prefill rooms:', err);
    }
  }

  function toggleRoomExpanded(roomId: string) {
    setExpandedRooms(prev => {
      const newSet = new Set(prev);
      if (newSet.has(roomId)) {
        newSet.delete(roomId);
      } else {
        newSet.add(roomId);
      }
      return newSet;
    });
  }

  function collapseAllRooms() {
    setExpandedRooms(new Set());
  }

  function expandAllRooms() {
    setExpandedRooms(new Set(rooms.map(r => r.id)));
  }

  async function loadLaborPhases() {
    try {
      const { data, error } = await supabase
        .from('labor_phases')
        .select('*')
        .order('name');

      if (error) throw error;
      setLaborPhases(data || []);

      // Find the Programming phase
      const progPhase = data?.find(p => p.name.toLowerCase() === 'programming');
      setProgrammingPhase(progPhase || null);
    } catch (error: any) {
      console.error('Error loading labor phases:', error);
    }
  }

  async function loadPdfTemplates() {
    try {
      if (!profile?.id) {
        console.log('Profile not loaded yet, skipping template load');
        return;
      }

      const { data, error } = await supabase
        .from('proposal_report_templates')
        .select('*')
        .or(`is_personal.eq.false,created_by.eq.${profile.id}`)
        .order('is_default', { ascending: false })
        .order('name');

      if (error) {
        console.error('Supabase error loading templates:', error);
        throw error;
      }

      setPdfTemplates(data || []);

      // Auto-select template based on priority:
      // 1. Proposal's saved template (if already sent)
      // 2. User's default template preference
      // 3. Company default template
      // 4. First available template
      let templateToSelect = null;

      if (proposal?.report_template_id) {
        // Use the proposal's saved template
        templateToSelect = data?.find(t => t.id === proposal.report_template_id);
      } else if (profile?.default_proposal_report_template_id) {
        // Use user's default template
        templateToSelect = data?.find(t => t.id === profile.default_proposal_report_template_id);
      } else {
        // Fall back to company default or first available
        const defaultTemplate = data?.find(t => t.is_default && !t.is_personal);
        templateToSelect = defaultTemplate || (data && data.length > 0 ? data[0] : null);
      }

      if (templateToSelect) {
        setSelectedTemplateId(templateToSelect.id);
        applyTemplateSettings(templateToSelect);
      }
    } catch (error: any) {
      console.error('Error loading PDF templates:', error);
      alert('Failed to load PDF templates: ' + (error.message || 'Unknown error'));
    }
  }

  function applyTemplateSettings(template: any) {
    if (!template) return;

    setPdfDisplayOptions({
      showRoomScope: template.show_area_descriptions ?? true,
      showProposalNotes: template.show_notes ?? true,
      showDeposit: (template.show_deposit_amount || template.show_deposit_percentage) ?? true,
      showModifiers: (template.show_discount || template.show_project_management_fee || template.show_design_fee) ?? true,
      showUnitPrice: template.show_unit_price ?? true,
      showLinePrice: template.show_line_item_total ?? true,
      showSKU: template.show_sku ?? true,
      showManufacturer: template.show_manufacturer ?? true,
      showColor: template.color_scheme !== 'grayscale',
      showAreaTotals: template.show_area_subtotals ?? true,
      showInstalledPrice: template.show_labor_total ?? true,
      showLaborPerLine: template.show_labor_hours ?? true,
      separatePartsLabor: template.show_labor_separate_from_parts ?? false,
      showSalesTax: template.show_tax_breakdown ?? true,
      showAccessories: (template.max_product_images ?? 0) > 0,
      showPackageItems: template.include_appendix ?? true,
      hideAllPrices: !template.show_subtotal,
      showDescription: template.show_line_item_description ?? true,
      showScopeOfWorkPage: template.show_scope_of_work ?? true,
      showContractPage: template.show_contract_terms ?? true,
      showDepositPage: template.show_payment_schedule ?? true,
      showProductImages: template.show_product_images ?? true
    });
  }

  async function fetchActivityData() {
    try {
      const { data, error } = await supabase.rpc('get_proposal_activity_summary', {
        p_proposal_id: proposalId
      });

      if (error) throw error;
      setActivityData(data?.[0] || null);
      setShowActivityModal(true);
      setShowMoreOptionsMenu(false);

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
      console.error('Error fetching activity data:', error);
      alert('Failed to load activity history');
    }
  }

  async function saveAsTemplate() {
    if (!newTemplateName.trim() || !profile?.id) return;

    try {
      setSavingTemplate(true);

      // Get company_id from company_settings (single-tenant system)
      const { data: companyData, error: companyError } = await supabase
        .from('company_settings')
        .select('id')
        .single();

      if (companyError) throw companyError;

      const templateData = {
        name: newTemplateName.trim(),
        description: newTemplateDescription.trim() || null,
        is_personal: newTemplateIsPersonal,
        created_by: profile.id,
        company_id: companyData.id,
        is_default: false,

        // Map display options to template fields - using actual pdfDisplayOptions state
        show_company_logo: true,
        show_company_info: true,
        show_proposal_number: true,
        show_proposal_date: true,
        show_valid_until_date: true,
        show_proposal_title: true,
        show_customer_name: true,
        show_customer_address: true,
        show_customer_contact_info: true,
        show_jobsite_location: true,

        show_line_item_description: pdfDisplayOptions.showDescription,
        show_manufacturer: pdfDisplayOptions.showManufacturer,
        show_sku: pdfDisplayOptions.showSKU,
        show_model_number: pdfDisplayOptions.showSKU,
        show_quantity: !pdfDisplayOptions.hideAllPrices,
        show_unit_price: pdfDisplayOptions.showUnitPrice && !pdfDisplayOptions.hideAllPrices,
        show_line_item_total: pdfDisplayOptions.showLinePrice && !pdfDisplayOptions.hideAllPrices,
        show_item_cost: false,
        show_markup_percentage: false,

        show_area_names: true,
        show_area_descriptions: pdfDisplayOptions.showRoomScope,
        show_area_subtotals: pdfDisplayOptions.showAreaTotals && !pdfDisplayOptions.hideAllPrices,
        group_by_area: true,

        show_labor_phase: false,
        show_labor_hours: pdfDisplayOptions.showLaborPerLine,
        show_labor_rate: false,
        show_labor_total: pdfDisplayOptions.showInstalledPrice && !pdfDisplayOptions.hideAllPrices,
        show_labor_separate_from_parts: pdfDisplayOptions.separatePartsLabor,

        show_tax_breakdown: pdfDisplayOptions.showSalesTax && !pdfDisplayOptions.hideAllPrices,
        show_parts_tax_separate: false,
        show_labor_tax_separate: false,
        show_tax_rate: pdfDisplayOptions.showSalesTax && !pdfDisplayOptions.hideAllPrices,
        show_tax_exempt_notice: true,

        show_subtotal: !pdfDisplayOptions.hideAllPrices,
        show_discount: pdfDisplayOptions.showModifiers && !pdfDisplayOptions.hideAllPrices,
        show_project_management_fee: pdfDisplayOptions.showModifiers && !pdfDisplayOptions.hideAllPrices,
        show_design_fee: pdfDisplayOptions.showModifiers && !pdfDisplayOptions.hideAllPrices,
        show_credit_card_fee: pdfDisplayOptions.showModifiers && !pdfDisplayOptions.hideAllPrices,
        show_custom_modifiers: pdfDisplayOptions.showModifiers && !pdfDisplayOptions.hideAllPrices,

        show_deposit_amount: pdfDisplayOptions.showDeposit && !pdfDisplayOptions.hideAllPrices,
        show_deposit_percentage: pdfDisplayOptions.showDeposit && !pdfDisplayOptions.hideAllPrices,
        show_payment_schedule: pdfDisplayOptions.showDepositPage,
        show_accepted_payment_methods: pdfDisplayOptions.showDeposit,
        show_payment_instructions: pdfDisplayOptions.showDeposit,

        show_scope_of_work: pdfDisplayOptions.showScopeOfWorkPage,
        show_contract_terms: pdfDisplayOptions.showContractPage,
        show_notes: pdfDisplayOptions.showProposalNotes,
        show_internal_notes: false,
        show_signature_section: true,
        show_acceptance_section: true,

        page_size: 'letter',
        color_scheme: pdfDisplayOptions.showColor ? 'default' : 'grayscale',
        font_family: 'sans-serif',
        show_page_numbers: true,
        show_watermark: false,
        watermark_text: null,

        max_product_images: pdfDisplayOptions.showAccessories ? 3 : 0,
        show_before_after_photos: false,
        show_product_images: pdfDisplayOptions.showProductImages,

        include_cover_page: false,
        include_table_of_contents: false,
        include_appendix: pdfDisplayOptions.showPackageItems
      };

      // Check if we're editing an existing template
      const isEditing = selectedTemplateId && pdfTemplates.find(t => t.id === selectedTemplateId && t.created_by === profile?.id);

      if (isEditing) {
        // Update existing template
        const { error } = await supabase
          .from('proposal_report_templates')
          .update(templateData)
          .eq('id', selectedTemplateId);

        if (error) throw error;
        alert('Template updated successfully!');
      } else {
        // Insert new template
        const { error } = await supabase
          .from('proposal_report_templates')
          .insert(templateData);

        if (error) throw error;
        alert('Template saved successfully!');
      }

      setShowSaveTemplateModal(false);
      setNewTemplateName('');
      setNewTemplateDescription('');
      setNewTemplateIsPersonal(true);
      loadPdfTemplates();
    } catch (error) {
      console.error('Error saving template:', error);
      alert('Failed to save template');
    } finally {
      setSavingTemplate(false);
    }
  }

  function deleteTemplate(templateId: string) {
    setConfirmModal({
      title: 'Delete Template',
      message: 'Are you sure you want to delete this template?',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          const { error } = await supabase
            .from('proposal_report_templates')
            .delete()
            .eq('id', templateId);

          if (error) throw error;

          alert('Template deleted successfully!');

          if (selectedTemplateId === templateId) {
            setSelectedTemplateId(null);
          }

          loadPdfTemplates();
        } catch (error) {
          console.error('Error deleting template:', error);
          alert('Failed to delete template');
        }
      },
    });
  }

  async function handleGeneratePdf() {
    if (!selectedTemplateId) {
      alert('Please select a template');
      return;
    }

    console.log('=== GENERATING PDF REPORT ===');
    console.log('Proposal ID:', proposalId);
    console.log('Template ID:', selectedTemplateId);
    console.log('Display Options:', pdfDisplayOptions);

    setGeneratingPdf(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Not authenticated - please log in again');
      }

      console.log('Calling PDF generation edge function...');
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-proposal-pdf`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            proposalId,
            templateId: selectedTemplateId,
            displayOptions: pdfDisplayOptions,
            coverPageImage: coverPageImage || undefined
          })
        }
      );

      console.log('Response status:', response.status);
      console.log('Response OK:', response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('PDF generation failed. Response:', errorText);
        let errorMessage = 'Failed to generate PDF report';
        let errorDetails = '';
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorMessage;
          errorDetails = errorJson.details || '';
          console.error('Error details:', errorJson);
        } catch (e) {
          errorMessage = errorText || errorMessage;
        }
        const fullError = errorDetails ? `${errorMessage}\n\nDetails: ${errorDetails}` : errorMessage;
        throw new Error(fullError);
      }

      const html = await response.text();
      console.log('PDF HTML generated successfully, length:', html.length);
      console.log('HTML preview:', html.substring(0, 200));

      if (!html || html.length < 100) {
        throw new Error('Generated HTML is empty or too short. The edge function may have returned an error.');
      }

      // Open in new window for printing/saving
      console.log('Opening new window...');
      const windowName = `proposal_pdf_${proposalId}_${Date.now()}`;
      const printWindow = window.open('', windowName);

      console.log('Window opened, reference:', printWindow);

      if (!printWindow) {
        throw new Error('Could not open new window. Please check your popup blocker settings.');
      }

      try {
        console.log('Writing HTML to window...');
        printWindow.document.write(html);
        printWindow.document.close();
        console.log('PDF report opened successfully');
      } catch (writeError: any) {
        printWindow.close();
        throw new Error(`Failed to write content to window: ${writeError.message}`);
      }

      setShowPdfModal(false);
    } catch (error: any) {
      console.error('=== PDF GENERATION ERROR ===');
      console.error('Error:', error);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);

      // Show detailed error in a more readable format
      const errorDiv = document.createElement('div');
      errorDiv.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 24px; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); z-index: 10000; max-width: 90%; max-height: 80%; overflow: auto;';
      errorDiv.innerHTML = `
        <div style="font-family: system-ui, -apple-system, sans-serif;">
          <h3 style="color: #dc2626; margin: 0 0 12px 0;">PDF Generation Failed</h3>
          <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 12px; border-radius: 4px; margin-bottom: 12px;">
            <pre style="white-space: pre-wrap; word-wrap: break-word; margin: 0; font-size: 13px; color: #991b1b;">${error.message}</pre>
          </div>
          <button onclick="this.parentElement.parentElement.remove()" style="background: #3b82f6; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; width: 100%;">Close</button>
        </div>
      `;
      document.body.appendChild(errorDiv);
    } finally {
      setGeneratingPdf(false);
    }
  }

  async function loadQaMessages() {
    try {
      const { data: thread } = await supabase
        .from('message_threads')
        .select('id')
        .eq('proposal_id', proposalId)
        .eq('context_type', 'proposal')
        .maybeSingle();
      if (!thread) return;
      const { data: msgs } = await supabase
        .from('messages')
        .select('context_room_id, context_line_item_id, is_read, author_type, is_internal')
        .eq('thread_id', thread.id)
        .eq('is_internal', false);
      if (!msgs) return;
      const hasMsg: Record<string, boolean> = {};
      const unread: Record<string, number> = {};
      for (const m of msgs) {
        const key = m.context_line_item_id || m.context_room_id || 'general';
        hasMsg[key] = true;
        if (!m.is_read && m.author_type === 'customer') {
          unread[key] = (unread[key] || 0) + 1;
        }
      }
      setMessagesByContext(hasMsg);
      setUnreadByContext(unread);
    } catch {}
  }

  async function loadProposalReadiness() {
    try {
      const readiness = await checkProposalReadiness(proposalId);
      setProposalReadiness(readiness);
    } catch (error) {
      console.error('Error loading proposal readiness:', error);
    }
  }

  async function loadData(): Promise<RoomWithItems[]> {
    try {
      console.log('Loading proposal:', proposalId);
      setLoading(true);

      const { data: proposalRes, error: propError } = await supabase
        .from('proposals')
        .select(`
          *,
          contacts:contacts!proposals_contact_id_fkey (id, full_name, email, phone, company_name)
        `)
        .eq('id', proposalId)
        .maybeSingle();

      console.log('Proposal response:', proposalRes);
      console.log('Contacts data:', proposalRes?.contacts);

      if (propError) {
        console.error('Error loading proposal:', propError);
        alert('Failed to load proposal: ' + propError.message);
        return [];
      }

      setProposal(proposalRes);

      // Load proposal settings
      const { data: settingsRes, error: settingsError } = await supabase
        .from('proposal_settings')
        .select('*')
        .eq('proposal_id', proposalId)
        .maybeSingle();

      if (settingsError) {
        console.error('Error loading proposal settings:', settingsError);
      }
      setProposalSettings(settingsRes);

      const { data: roomsRes, error: roomsError } = await supabase
        .from('proposal_rooms')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('sort_order');

      console.log('Rooms response:', roomsRes);

      if (roomsError) {
        console.error('Error loading rooms:', roomsError);
        alert('Failed to load areas: ' + roomsError.message);
        return [];
      }

      const { data: itemsRes, error: itemsError } = await supabase
        .from('proposal_line_items')
        .select(`
          *,
          products (
            *,
            manufacturers (
              id,
              name
            )
          ),
          labor_phases:labor_phase_id (
            id,
            name
          )
        `)
        .eq('proposal_id', proposalId)
        .order('sort_order');

      console.log('Items response:', itemsRes);

      if (itemsError) {
        console.error('Error loading items:', itemsError);
        alert('Failed to load line items: ' + itemsError.message);
        return [];
      }

      const roomsWithItems: RoomWithItems[] = (roomsRes || []).map(room => ({
        ...room,
        line_items: (itemsRes || []).filter(item => item.room_id === room.id)
      }));

      const orphaned = (itemsRes || []).filter(item => !item.room_id);

      setRooms(roomsWithItems);
      setUnassignedItems(orphaned);

      // Recalculate totals to ensure they're current
      const { error: calcError } = await supabase.rpc('calculate_proposal_totals', {
        p_proposal_id: proposalId
      });

      if (calcError) {
        console.error('Error calculating totals:', calcError);
      } else {
        // Fetch the updated proposal with calculated totals and contacts
        const { data: updatedProposal } = await supabase
          .from('proposals')
          .select(`
            *,
            contacts:contacts!proposals_contact_id_fkey (id, full_name, email, phone, company_name)
          `)
          .eq('id', proposalId)
          .single();

        if (updatedProposal) {
          setProposal(updatedProposal);
        }
      }
      return roomsWithItems;
    } catch (error: any) {
      console.error('Error in loadData:', error);
      alert('Failed to load data: ' + error.message);
      return [];
    } finally {
      setLoading(false);
      loadProposalReadiness();
    }
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
      'portal': { label: 'Portal', bgColor: 'bg-cyan-600', textColor: 'text-white' },
      'accepted': { label: 'Accepted', bgColor: 'bg-green-600', textColor: 'text-white', icon: <CheckCircle2 className="w-3 h-3" /> },
      'declined': { label: 'Declined', bgColor: 'bg-red-600', textColor: 'text-white' },
      'expired': { label: 'Expired', bgColor: 'bg-orange-600', textColor: 'text-white' }
    };

    const config = statusConfig[status] || { label: status, bgColor: 'bg-gray-600', textColor: 'text-white' };

    return (
      <span className={`inline-flex items-center gap-1.5 text-[10px] sm:text-xs px-2 py-1 rounded font-medium ${config.bgColor} ${config.textColor}`}>
        {config.icon}
        <span>{config.label}</span>
      </span>
    );
  }

  async function loadColumnPreferences() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('user_column_preferences')
        .select('column_settings')
        .eq('user_id', user.id)
        .eq('view_name', 'proposal_builder_compact')
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error loading column preferences:', error);
        return;
      }

      if (data?.column_settings?.visibleColumns) {
        setVisibleColumns(new Set(data.column_settings.visibleColumns));
      }
    } catch (error) {
      console.error('Error loading column preferences:', error);
    }
  }

  async function saveColumnPreferences(columns: Set<string>) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('user_column_preferences')
        .upsert({
          user_id: user.id,
          view_name: 'proposal_builder_compact',
          column_settings: { visibleColumns: Array.from(columns) },
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,view_name'
        });

      if (error) {
        console.error('Error saving column preferences:', error);
      }
    } catch (error) {
      console.error('Error saving column preferences:', error);
    }
  }

  // Handler to unlock a locked proposal
  async function handleUnlockProposal() {
    try {
      const { data, error } = await supabase.rpc('unlock_proposal', {
        proposal_id_param: proposalId
      });

      if (error) throw error;

      if (data?.success) {
        // Also hide from portal so the customer doesn't see mid-edit state
        await supabase
          .from('proposals')
          .update({ is_portal_visible: false })
          .eq('id', proposalId);

        await loadData();
        setShowUnlockWarningModal(false);
      } else {
        alert(data?.error || 'Failed to unlock proposal');
      }
    } catch (error: any) {
      console.error('Error unlocking proposal:', error);
      alert('Failed to unlock proposal: ' + error.message);
    }
  }

  // Handler to create a revision
  async function handleCreateRevision() {
    try {
      // Create a new revision by duplicating the current proposal
      const { data: newRevision, error: createError } = await supabase
        .from('proposals')
        .insert({
          contact_id: proposal.contact_id,
          lead_id: proposal.lead_id,
          title: proposal.title,
          status: 'designing',
          is_revision: true,
          parent_proposal_id: proposal.parent_proposal_id || proposal.id,
          revision_name: `Revision ${(proposal.revision_count || 0) + 1}`,
          is_active_revision: false,
          is_portal_visible: false,
          created_by: profile?.id
        })
        .select()
        .single();

      if (createError) throw createError;

      // Copy rooms and line items
      const { data: roomsData, error: roomsError } = await supabase
        .from('proposal_rooms')
        .select('*')
        .eq('proposal_id', proposalId);

      if (roomsError) throw roomsError;

      for (const room of roomsData || []) {
        const { data: newRoom, error: roomError } = await supabase
          .from('proposal_rooms')
          .insert({
            proposal_id: newRevision.id,
            name: room.name,
            description: room.description,
            sort_order: room.sort_order,
            show_scope: room.show_scope
          })
          .select()
          .single();

        if (roomError) throw roomError;

        // Copy line items for this room
        const { data: itemsData, error: itemsError } = await supabase
          .from('proposal_line_items')
          .select('*')
          .eq('room_id', room.id);

        if (itemsError) throw itemsError;

        for (const item of itemsData || []) {
          await supabase
            .from('proposal_line_items')
            .insert({
              proposal_id: newRevision.id,
              room_id: newRoom.id,
              product_id: item.product_id,
              description: item.description,
              quantity: item.quantity,
              unit: item.unit,
              unit_price: item.unit_price,
              cost: item.cost,
              line_total: item.line_total,
              sort_order: item.sort_order,
              is_custom: item.is_custom,
              labor_hours: item.labor_hours,
              labor_rate: item.labor_rate,
              labor_total: item.labor_total,
              item_type: item.item_type,
              task_notes: item.task_notes,
              parent_item_id: item.parent_item_id,
              display_mode: item.display_mode,
              show_task_notes: item.show_task_notes,
              is_hidden: item.is_hidden,
              labor_phase_id: item.labor_phase_id,
              class_id: item.class_id,
              is_taxable: item.is_taxable,
              is_customer_supplied: item.is_customer_supplied
            });
        }
      }

      // Navigate to the new revision
      setShowUnlockWarningModal(false);
      if (onProposalIdChange) {
        onProposalIdChange(newRevision.id);
      }
    } catch (error: any) {
      console.error('Error creating revision:', error);
      alert('Failed to create revision: ' + error.message);
    }
  }

  // Handler to promote a revision to live
  async function handlePromoteRevision(sendNotification: boolean, notificationMessage: string) {
    try {
      const { data, error } = await supabase.rpc('promote_revision_to_live', {
        revision_id_param: proposalId,
        send_notification: sendNotification,
        notification_message: notificationMessage
      });

      if (error) throw error;

      if (data?.success) {
        await loadData(); // Reload to get updated status
        setShowPromoteRevisionModal(false);
      } else {
        alert(data?.error || 'Failed to promote revision');
      }
    } catch (error: any) {
      console.error('Error promoting revision:', error);
      alert('Failed to promote revision: ' + error.message);
    }
  }

  function handleDragStart(e: React.DragEvent, itemId: string) {
    const draggedItemObj = rooms.flatMap(r => r.line_items).find(item => item.id === itemId);

    setDraggedItem(itemId);
    e.dataTransfer.effectAllowed = 'move';

    // Add a visual indicator that we're dragging
    const dragImage = document.createElement('div');
    dragImage.style.padding = '8px 12px';
    dragImage.style.background = 'rgb(17, 24, 39)';
    dragImage.style.border = `2px solid ${draggedItemObj?.parent_item_id ? 'rgb(34, 197, 94)' : 'rgb(34, 211, 238)'}`;
    dragImage.style.borderRadius = '6px';
    dragImage.style.color = 'white';
    dragImage.style.fontSize = '14px';
    dragImage.style.position = 'absolute';
    dragImage.style.top = '-1000px';
    dragImage.textContent = (draggedItemObj?.parent_item_id ? '↳ ' : '') + (draggedItemObj?.description || 'Item');
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 0, 0);
    setTimeout(() => document.body.removeChild(dragImage), 0);
  }

  function handleDragOver(e: React.DragEvent, itemId: string) {
    e.preventDefault();

    if (!draggedItem) return;

    // Don't allow dropping on self
    if (draggedItem === itemId) {
      e.dataTransfer.dropEffect = 'none';
      return;
    }

    const draggedItemObj = rooms.flatMap(r => r.line_items).find(item => item.id === draggedItem);
    const targetItem = rooms.flatMap(r => r.line_items).find(item => item.id === itemId);

    // If dragging a nested item
    if (draggedItemObj?.parent_item_id) {
      // Can only reorder with siblings (items with same parent) or unnest
      if (targetItem?.parent_item_id === draggedItemObj.parent_item_id) {
        // Reordering among siblings - allowed
        e.dataTransfer.dropEffect = 'move';
      } else if (!targetItem?.parent_item_id) {
        // Unnesting - can drop on top-level items
        e.dataTransfer.dropEffect = 'move';
      } else {
        // Can't drop on items with different parents
        e.dataTransfer.dropEffect = 'none';
        return;
      }
    } else {
      // Dragging a top-level item
      // Can only reorder with other top-level items
      if (targetItem?.parent_item_id) {
        e.dataTransfer.dropEffect = 'none';
        return;
      }
      e.dataTransfer.dropEffect = 'move';
    }

    // Only update state if it changed
    if (dragOverItem !== itemId) setDragOverItem(itemId);
  }

  function handleDragLeave() {
    setDragOverItem(null);
  }

  async function handleDrop(e: React.DragEvent, targetItemId: string, roomId: string) {
    e.preventDefault();

    if (!draggedItem || draggedItem === targetItemId) {
      setDraggedItem(null);
      setDragOverItem(null);
      return;
    }

    setSaving(true);
    try {
      // Get all items in this room
      const room = rooms.find(r => r.id === roomId);
      if (!room) return;

      const items = [...room.line_items].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

      // Find the dragged and target items
      const draggedIndex = items.findIndex(item => item.id === draggedItem);
      const targetIndex = items.findIndex(item => item.id === targetItemId);

      if (draggedIndex === -1 || targetIndex === -1) return;

      const draggedItemData = items[draggedIndex];
      const targetItemData = items[targetIndex];

      const draggedIsNested = draggedItemData.parent_item_id !== null;
      const targetIsNested = targetItemData.parent_item_id !== null;

      let shouldUnnest = false;
      let shouldNest = false;

      if (draggedIsNested && !targetIsNested) {
        shouldUnnest = true;
      } else if (!draggedIsNested && !targetIsNested) {
        const hasChildren = room.line_items.some(li => li.parent_item_id === draggedItem);
        if (hasChildren) {
          alert('Cannot nest items that already have nested accessories');
          return;
        }
        shouldNest = true;
      } else if (draggedIsNested && targetIsNested && draggedItemData.parent_item_id !== targetItemData.parent_item_id) {
        return;
      }

      // Reorder the items array
      const [movedItem] = items.splice(draggedIndex, 1);
      items.splice(targetIndex, 0, movedItem);

      // Update sort_order for all items in this room
      const updates = items.map((item, index) => ({
        id: item.id,
        sort_order: index,
        ...(item.id === draggedItem && shouldUnnest ? { parent_item_id: null } : {}),
        ...(item.id === draggedItem && shouldNest ? { parent_item_id: targetItemId } : {})
      }));

      // Update all items
      for (const update of updates) {
        const updateData: any = { sort_order: update.sort_order };
        if (update.id === draggedItem && shouldUnnest) {
          updateData.parent_item_id = null;
        }
        if (update.id === draggedItem && shouldNest) {
          updateData.parent_item_id = targetItemId;
        }

        const { error } = await supabase
          .from('proposal_line_items')
          .update(updateData)
          .eq('id', update.id);

        if (error) throw error;
      }

      await loadData();
    } catch (error: any) {
      console.error('Error updating items:', error);
      alert('Failed to update items');
    } finally {
      setSaving(false);
      setDraggedItem(null);
      setDragOverItem(null);
    }
  }

  async function handleSendToPortal() {
    setShowSubmissionModal(true);
  }

  async function handleConfirmSubmission(sendToPortal: boolean, approvalWindowDays: number) {
    setSending(true);
    setShowSubmissionModal(false);

    try {
      // Calculate expiration date
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + approvalWindowDays);

      // Update proposal status, expiration
      const { error: updateError } = await supabase
        .from('proposals')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          expires_at: expiresAt.toISOString(),
          is_portal_visible: sendToPortal
        })
        .eq('id', proposalId);

      if (updateError) throw updateError;

      // Send email notification
      const { error: emailError } = await supabase.functions.invoke('send-proposal-email', {
        body: { proposalId: proposalId }
      });

      if (emailError) {
        console.error('Email sending error:', emailError);
        // Don't throw - proposal was updated successfully
      }

      const successMessage = sendToPortal
        ? 'Proposal sent successfully! Customer will receive an email notification.'
        : 'Proposal marked as sent. Email sent to customer.';

      alert(successMessage);

      await loadData();
    } catch (error: any) {
      console.error('Error sending proposal:', error);
      alert('Failed to send proposal: ' + (error.message || 'Unknown error'));
    } finally {
      setSending(false);
    }
  }

  async function handleRecallProposal() {
    if (!confirm('This will return the proposal to designing status and remove it from the customer portal. Continue?')) {
      return;
    }

    setRecalling(true);
    try {
      const { error } = await supabase
        .from('proposals')
        .update({
          status: 'designing',
          sent_at: null,
          is_portal_visible: false,
          is_locked: false,
          locked_at: null,
          locked_by: null
        })
        .eq('id', proposalId);

      if (error) throw error;

      // Log activity
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('activity_feed')
          .insert({
            user_id: user.id,
            activity_type: 'proposal_recalled',
            entity_type: 'proposal',
            entity_id: proposalId,
            description: 'Recalled proposal from customer portal'
          });
      }

      // Reload the data to show updated status
      await loadData();
      setShowPortalDropdown(false);
    } catch (error) {
      console.error('Error recalling proposal:', error);
      alert('Failed to recall proposal. Please try again.');
    } finally {
      setRecalling(false);
    }
  }

  function openPortalPreview() {
    setShowPortalPreview(true);
    setShowPortalDropdown(false);
  }

  async function handleAddArea() {
    if (!newAreaName.trim()) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('proposal_rooms')
        .insert({
          proposal_id: proposalId,
          name: newAreaName.trim(),
          sort_order: rooms.length
        });

      if (error) throw error;

      setNewAreaName('');
      await loadData();
    } catch (error: any) {
      console.error('Error adding area:', error);
      alert('Failed to add area');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateArea(areaId: string, newName: string) {
    if (!newName.trim()) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('proposal_rooms')
        .update({ name: newName.trim() })
        .eq('id', areaId);

      if (error) throw error;

      setEditingAreaId(null);
      setEditingAreaName('');
      await loadData();
    } catch (error: any) {
      console.error('Error updating area:', error);
      alert('Failed to update area');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteArea(areaId: string) {
    if (isCoMode) {
      alert('Areas cannot be deleted while editing a Change Order. Remove individual items instead.');
      return;
    }

    const area = rooms.find(r => r.id === areaId);
    if (!area) return;

    if (area.line_items.length > 0) {
      if (!confirm(`This area contains ${area.line_items.length} items. Are you sure you want to delete it and all its items?`)) {
        return;
      }
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('proposal_rooms')
        .delete()
        .eq('id', areaId);

      if (error) throw error;

      if (activeAreaId === areaId) {
        setActiveAreaId(null);
      }
      await loadData();
    } catch (error: any) {
      console.error('Error deleting area:', error);
      alert('Failed to delete area');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteItem(itemId: string) {
    if (isCoMode && changeOrderId) {
      const item = rooms.flatMap(r => r.line_items).find(i => i.id === itemId);
      if (!item) return;
      const existingCORecord = coLineItems.find(c => c.proposal_line_item_id === itemId);

      if (existingCORecord?.action_type === 'add') {
        if (!confirm('Remove this newly-added item from the change order?')) return;
        setSaving(true);
        try {
          await supabase.from('change_order_line_items').delete().eq('id', existingCORecord.id);
          await supabase.from('proposal_line_items').delete().eq('id', itemId);
          setRooms(rooms.map(room => ({
            ...room,
            line_items: room.line_items.filter(i => i.id !== itemId),
          })));
          await updateCOTotals(changeOrderId, onCORefresh);
          await refreshCOLineItems();
          await supabase.rpc('calculate_proposal_totals', { p_proposal_id: proposalId });
        } catch (error: any) {
          console.error('Error removing added CO item:', error);
          alert('Failed to remove item');
        } finally {
          setSaving(false);
        }
        return;
      }

      const roomName = rooms.find(r => r.line_items.some(i => i.id === itemId))?.name || '';
      const itemLaborTotal = (item as any).labor_total ?? 0;
      const hasLabor = itemLaborTotal > 0;
      setPendingCORemoval({ itemId, item, roomName, hasLabor });
      return;
    }

    if (!confirm('Delete this line item?')) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('proposal_line_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;
      await loadData();
    } catch (error: any) {
      console.error('Error deleting item:', error);
      alert('Failed to delete item');
    } finally {
      setSaving(false);
    }
  }

  async function executeCORemoval(scope: 'parts_only' | 'parts_and_labor') {
    if (!pendingCORemoval || !changeOrderId) return;
    const { itemId, item, roomName } = pendingCORemoval;
    setPendingCORemoval(null);
    setSaving(true);
    try {
      const freshRecords = await loadCOLineItems(changeOrderId);
      const computedLineTotal = (item.line_total && item.line_total > 0)
        ? item.line_total
        : (parseFloat(item.unit_price || 0) * (item.quantity || 1));
      await recordCOAction(changeOrderId, itemId, 'remove', {
        description: (item as any).description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        line_total: computedLineTotal,
        labor_total: (item as any).labor_total ?? 0,
        labor_hours: (item as any).labor_hours ?? null,
        labor_rate: (item as any).labor_rate ?? null,
        labor_phase_id: (item as any).labor_phase_id ?? null,
        is_taxable: (item as any).is_taxable ?? true,
        remove_scope: scope,
      }, roomName, freshRecords);
      await supabase.from('proposal_line_items').update({ is_hidden: true }).eq('id', itemId);
      setRooms(rooms.map(room => ({
        ...room,
        line_items: room.line_items.map(i => i.id === itemId ? { ...i, is_hidden: true } : i),
      })));
      await updateCOTotals(changeOrderId, onCORefresh);
      await refreshCOLineItems();
      await supabase.rpc('calculate_proposal_totals', { p_proposal_id: proposalId });
    } catch (error: any) {
      console.error('Error marking CO item as removed:', error);
      alert('Failed to remove item');
    } finally {
      setSaving(false);
    }
  }

  async function handleRestoreItem(itemId: string) {
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
      await supabase.rpc('calculate_proposal_totals', { p_proposal_id: proposalId });
    } catch (error: any) {
      console.error('Error restoring line item:', error);
      alert('Failed to restore item');
    } finally {
      setRestoringItemId(null);
    }
  }

  async function handleBulkDeleteItems() {
    if (selectedItems.size === 0) return;

    if (isCoMode && changeOrderId) {
      const selectedIds = Array.from(selectedItems);
      const allItems = rooms.flatMap(r => r.line_items);

      const newlyAddedIds = selectedIds.filter(id => {
        const coRecord = coLineItems.find(c => c.proposal_line_item_id === id);
        return coRecord?.action_type === 'add';
      });
      const existingIds = selectedIds.filter(id => !newlyAddedIds.includes(id));

      setSaving(true);
      try {
        if (newlyAddedIds.length > 0) {
          const coRecordIds = newlyAddedIds
            .map(id => coLineItems.find(c => c.proposal_line_item_id === id)?.id)
            .filter(Boolean) as string[];
          if (coRecordIds.length > 0) {
            await supabase.from('change_order_line_items').delete().in('id', coRecordIds);
          }
          await supabase.from('proposal_line_items').delete().in('id', newlyAddedIds);
          setRooms(rooms.map(room => ({
            ...room,
            line_items: room.line_items.filter(i => !newlyAddedIds.includes(i.id)),
          })));
        }
      } catch (error: any) {
        console.error('Error removing newly-added CO items:', error);
        alert('Failed to remove items from change order');
        setSaving(false);
        return;
      } finally {
        if (existingIds.length === 0) setSaving(false);
      }

      if (existingIds.length > 0) {
        const itemsForModal = existingIds.map(id => {
          const item = allItems.find(i => i.id === id);
          const roomName = rooms.find(r => r.line_items.some(i => i.id === id))?.name || '';
          const hasLabor = !!((item as any)?.labor_total && (item as any).labor_total > 0);
          return { itemId: id, item, roomName, hasLabor };
        }).filter(e => e.item != null) as Array<{ itemId: string; item: any; roomName: string; hasLabor: boolean }>;

        const initialScopes: Record<string, 'parts_only' | 'parts_and_labor'> = {};
        for (const entry of itemsForModal) {
          initialScopes[entry.itemId] = 'parts_and_labor';
        }
        setBulkCORemovalScopes(initialScopes);
        setPendingBulkCORemoval(itemsForModal);
        setSaving(false);
      } else {
        setSelectedItems(new Set());
      }
      return;
    }

    if (!confirm(`Delete ${selectedItems.size} selected item${selectedItems.size > 1 ? 's' : ''}?`)) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('proposal_line_items')
        .delete()
        .in('id', Array.from(selectedItems));

      if (error) throw error;
      setSelectedItems(new Set());
      await loadData();
    } catch (error: any) {
      console.error('Error deleting items:', error);
      alert('Failed to delete items');
    } finally {
      setSaving(false);
    }
  }

  async function executeBulkCORemoval() {
    if (!pendingBulkCORemoval || !changeOrderId) return;
    setExecutingBulkRemoval(true);
    try {
      const freshRecords = await loadCOLineItems(changeOrderId);
      const removedIds: string[] = [];
      for (const entry of pendingBulkCORemoval) {
        const { itemId, item, roomName, hasLabor } = entry;
        const scope = bulkCORemovalScopes[itemId] ?? 'parts_and_labor';
        const computedLineTotal = (item.line_total && item.line_total > 0)
          ? item.line_total
          : (parseFloat(String(item.unit_price || 0)) * (item.quantity || 1));
        await recordCOAction(changeOrderId, itemId, 'remove', {
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          line_total: computedLineTotal,
          labor_total: hasLabor ? (item.labor_total ?? 0) : 0,
          labor_hours: item.labor_hours ?? null,
          labor_rate: item.labor_rate ?? null,
          labor_phase_id: item.labor_phase_id ?? null,
          is_taxable: item.is_taxable ?? true,
          remove_scope: hasLabor ? scope : 'parts_and_labor',
        }, roomName, freshRecords);
        await supabase.from('proposal_line_items').update({ is_hidden: true }).eq('id', itemId);
        removedIds.push(itemId);
      }
      setRooms(rooms.map(room => ({
        ...room,
        line_items: room.line_items.map(i =>
          removedIds.includes(i.id) ? { ...i, is_hidden: true } : i
        ),
      })));
      await updateCOTotals(changeOrderId, onCORefresh);
      await refreshCOLineItems();
      await supabase.rpc('calculate_proposal_totals', { p_proposal_id: proposalId });
      setSelectedItems(new Set());
      setPendingBulkCORemoval(null);
      setBulkCORemovalScopes({});
    } catch (error: any) {
      console.error('Error executing bulk CO removal:', error);
      alert('Failed to remove items from change order');
    } finally {
      setExecutingBulkRemoval(false);
    }
  }

  async function copyItemsToRooms(targetRoomIds: string[]) {
    if (selectedItems.size === 0 || targetRoomIds.length === 0) return;

    setSaving(true);
    try {
      // Get all selected items
      const selectedItemsArray = rooms
        .flatMap(room => room.line_items)
        .filter(item => selectedItems.has(item.id));

      // Copy each item to each target room
      for (const targetRoomId of targetRoomIds) {
        const targetRoom = rooms.find(r => r.id === targetRoomId);
        if (!targetRoom) continue;

        const maxSortOrder = targetRoom.line_items.length;

        for (let i = 0; i < selectedItemsArray.length; i++) {
          const item = selectedItemsArray[i];
          const newItem = {
            proposal_id: proposalId,
            room_id: targetRoomId,
            product_id: item.product_id,
            description: item.description,
            manufacturer: item.manufacturer,
            model: item.model,
            sku: item.sku,
            quantity: item.quantity,
            unit_cost: item.unit_cost,
            unit_price: item.unit_price,
            labor_hours: item.labor_hours,
            labor_rate: item.labor_rate,
            sort_order: maxSortOrder + i,
            notes: item.notes,
            labor_phase_id: item.labor_phase_id,
            install_instructions: item.install_instructions,
            color: item.color,
            parent_package_item_id: item.parent_package_item_id,
            is_accessory_item: item.is_accessory_item,
            is_package_item: item.is_package_item,
            package_description: item.package_description,
            class_id: item.class_id
          };

          const { error } = await supabase
            .from('proposal_line_items')
            .insert(newItem);

          if (error) throw error;
        }
      }

      // Clear selection and reload
      setSelectedItems(new Set());
      setShowCopyToModal(false);
      setSelectedRoomsToCopy(new Set());
      await loadData();
    } catch (error: any) {
      console.error('Error copying items:', error);
      alert('Failed to copy items to areas');
    } finally {
      setSaving(false);
    }
  }

  async function handleBulkNestItems() {
    if (selectedItems.size === 0) return;

    // Check if any selected items have children
    const hasChildItems = Array.from(selectedItems).some(selectedId =>
      rooms.some(room =>
        room.line_items.some(item => item.parent_item_id === selectedId)
      )
    );

    if (hasChildItems) {
      alert('Cannot nest items that already have nested accessories.');
      return;
    }

    // Get all selected items to determine their rooms
    const selectedItemsData = rooms.flatMap(room =>
      room.line_items
        .filter(item => selectedItems.has(item.id))
        .map(item => ({ ...item, room_id: room.id }))
    );

    // Check if all selected items are in the same room
    const uniqueRooms = new Set(selectedItemsData.map(item => item.room_id));
    if (uniqueRooms.size > 1) {
      alert('All selected items must be in the same area to nest/unnest them.');
      return;
    }

    const roomId = selectedItemsData[0]?.room_id;
    const room = rooms.find(r => r.id === roomId);
    if (!room) return;

    // Check if all selected items are already nested
    const allNested = selectedItemsData.every(item => item.parent_item_id);

    setSaving(true);
    try {
      const updates: { id: string; parentId: string | null }[] = [];

      if (allNested) {
        // UNNEST: All items are nested, so unnest them
        for (const selectedItemId of Array.from(selectedItems)) {
          const { error } = await supabase
            .from('proposal_line_items')
            .update({ parent_item_id: null })
            .eq('id', selectedItemId);

          if (error) throw error;
          updates.push({ id: selectedItemId, parentId: null });
        }
      } else {
        // NEST: Find the item directly above each selected item and nest under it
        const allItems = [...room.line_items].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

        for (const selectedItemId of Array.from(selectedItems)) {
          const itemIndex = allItems.findIndex(item => item.id === selectedItemId);
          if (itemIndex === -1) continue;

          const currentItem = allItems[itemIndex];

          // If already nested, skip
          if (currentItem.parent_item_id) continue;

          // Find the item directly above this one
          let itemAbove = null;
          for (let i = itemIndex - 1; i >= 0; i--) {
            const candidate = allItems[i];
            // Skip other selected items when looking for parent
            if (!selectedItems.has(candidate.id)) {
              itemAbove = candidate;
              break;
            }
          }

          if (!itemAbove) {
            // No item above in the same room - skip this item
            continue;
          }

          // Determine the parent: if item above is nested, nest under its parent; otherwise, nest under the item above
          const parentId = itemAbove.parent_item_id || itemAbove.id;

          const { error } = await supabase
            .from('proposal_line_items')
            .update({ parent_item_id: parentId })
            .eq('id', selectedItemId);

          if (error) throw error;
          updates.push({ id: selectedItemId, parentId });
        }
      }

      // Update local state instantly without reloading
      setRooms(prevRooms =>
        prevRooms.map(r => {
          if (r.id === roomId) {
            return {
              ...r,
              line_items: r.line_items.map(item => {
                const update = updates.find(u => u.id === item.id);
                if (update) {
                  return { ...item, parent_item_id: update.parentId };
                }
                return item;
              })
            };
          }
          return r;
        })
      );

      // Clear selection
      setSelectedItems(new Set());
    } catch (error: any) {
      console.error('Error nesting/unnesting items:', error);
      alert('Failed to nest/unnest items');
    } finally {
      setSaving(false);
    }
  }

  async function quickAddArea() {
    if (!quickAddAreaName.trim()) return;

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('proposal_rooms')
        .insert({
          proposal_id: proposalId,
          name: quickAddAreaName.trim(),
          sort_order: rooms.length
        })
        .select()
        .single();

      if (error) throw error;

      // Automatically select the newly created area for copying
      setSelectedRoomsToCopy(prev => new Set([...prev, data.id]));
      setQuickAddAreaName('');
      await loadData();
    } catch (error: any) {
      console.error('Error adding area:', error);
      alert('Failed to add new area');
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (substituteItemId) {
      loadProductsForSubstitution();
    }
  }, [substituteItemId]);

  async function loadProductsForSubstitution() {
    try {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          manufacturers (
            id,
            name
          )
        `)
        .order('sku');

      if (error) throw error;
      setSubstituteProducts(data || []);
    } catch (error) {
      console.error('Error loading products:', error);
    }
  }

  async function substituteItem(newProductId: string) {
    if (!substituteItemId) return;

    setSaving(true);
    try {
      // Get the new product details
      const { data: product, error: productError } = await supabase
        .from('products')
        .select(`
          *,
          manufacturers (
            id,
            name
          )
        `)
        .eq('id', newProductId)
        .maybeSingle();

      if (productError) throw productError;
      if (!product) throw new Error('Product not found');

      // Get the current item
      const currentItem = rooms
        .flatMap(r => r.line_items)
        .find(item => item.id === substituteItemId);

      if (!currentItem) throw new Error('Item not found');

      // Update the line item with new product details
      const { error: updateError } = await supabase
        .from('proposal_line_items')
        .update({
          product_id: product.id,
          description: product.name || product.description,
          manufacturer: product.manufacturers?.name || null,
          model: product.model,
          sku: product.sku,
          unit_price: product.price || currentItem.unit_price,
          unit_cost: product.cost || currentItem.unit_cost,
          labor_hours: product.labor_hours || currentItem.labor_hours,
          labor_rate: product.labor_rate || currentItem.labor_rate,
          labor_phase_id: product.labor_phase_id || currentItem.labor_phase_id
        })
        .eq('id', substituteItemId);

      if (updateError) throw updateError;

      setSubstituteItemId(null);
      setSubstituteSearchQuery('');
      await loadData();
    } catch (error: any) {
      console.error('Error substituting item:', error);
      alert('Failed to substitute item: ' + error.message);
    } finally {
      setSaving(false);
    }
  }

  function toggleItemSelection(itemId: string) {
    console.log('toggleItemSelection called for:', itemId);
    console.log('Current selectedItems:', selectedItems);
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
      console.log('Removed item from selection');
    } else {
      newSelected.add(itemId);
      console.log('Added item to selection');
    }
    console.log('New selectedItems:', newSelected, 'Size:', newSelected.size);
    setSelectedItems(newSelected);
  }

  function toggleSelectAll() {
    if (selectedItems.size > 0) {
      setSelectedItems(new Set());
    } else {
      const allItemIds = rooms.flatMap(room => room.line_items.map(item => item.id));
      setSelectedItems(new Set(allItemIds));
    }
  }

  async function toggleRoomScopeVisibility(roomId: string, currentValue: boolean) {
    // This just toggles visibility in the builder UI, not in the final proposal
    const updatedRooms = rooms.map(room =>
      room.id === roomId ? { ...room, show_scope: !currentValue } : room
    );
    setRooms(updatedRooms);
  }

  async function saveItemNotes() {
    if (!editingItemNotes) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('proposal_line_items')
        .update({
          task_notes: editingItemNotes.notes,
          show_task_notes: editingItemNotes.showNotes
        })
        .eq('id', editingItemNotes.id);

      if (error) throw error;
      await loadData();
      setEditingItemNotes(null);
    } catch (error: any) {
      console.error('Error toggling scope visibility:', error);
      alert('Failed to update scope visibility');
    } finally {
      setSaving(false);
    }
  }

  async function saveProjectInfo() {
    if (!editingProjectInfo) return;

    // Count instances of this product in the proposal
    const productId = editingProjectInfo.product_id;
    const allItems = rooms.flatMap(r => r.line_items);
    const instances = allItems.filter(item => item.product_id === productId);

    // Check if values have changed
    const currentItem = allItems.find(i => i.id === editingProjectInfo.id);
    const installChanged = currentItem?.task_notes !== editingProjectInfo.installNotes ||
                          currentItem?.show_task_notes !== editingProjectInfo.showInstallNotes;
    const programmingChanged = currentItem?.programming_labor_hours !== editingProjectInfo.programmingHours ||
                              currentItem?.programming_notes !== editingProjectInfo.programmingNotes ||
                              currentItem?.show_programming_notes !== editingProjectInfo.showProgrammingNotes;

    // If multiple instances and something changed, show bulk update modal
    if (instances.length > 1 && (installChanged || programmingChanged)) {
      let field: 'install' | 'programming' = 'install';
      if (programmingChanged && !installChanged) field = 'programming';

      setBulkUpdateProjectInfo({
        itemId: editingProjectInfo.id,
        productId: editingProjectInfo.product_id,
        description: editingProjectInfo.description,
        field,
        instanceCount: instances.length,
        newValues: {
          task_notes: editingProjectInfo.installNotes,
          show_task_notes: editingProjectInfo.showInstallNotes,
          programming_labor_hours: editingProjectInfo.programmingHours,
          programming_notes: editingProjectInfo.programmingNotes,
          show_programming_notes: editingProjectInfo.showProgrammingNotes
        }
      });
      return;
    }

    // Single instance or no change - update directly
    await updateProjectInfoSingle(editingProjectInfo.id, {
      task_notes: editingProjectInfo.installNotes,
      show_task_notes: editingProjectInfo.showInstallNotes,
      programming_labor_hours: editingProjectInfo.programmingHours,
      programming_notes: editingProjectInfo.programmingNotes,
      show_programming_notes: editingProjectInfo.showProgrammingNotes
    });
  }

  async function toggleTaskCompleted(itemId: string, currentValue: boolean) {
    try {
      const { error } = await supabase
        .from('proposal_line_items')
        .update({ task_completed: !currentValue })
        .eq('id', itemId);

      if (error) throw error;

      setRooms(prev => prev.map(room => ({
        ...room,
        line_items: room.line_items.map(li =>
          li.id === itemId ? { ...li, task_completed: !currentValue } : li
        )
      })));
    } catch (error: any) {
      console.error('Error toggling task completion:', error);
    }
  }

  async function updateProjectInfoSingle(itemId: string, updates: any) {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('proposal_line_items')
        .update(updates)
        .eq('id', itemId);

      if (error) throw error;
      await loadData();
      setEditingProjectInfo(null);
      setBulkUpdateProjectInfo(null);
    } catch (error: any) {
      console.error('Error updating project info:', error);
      alert('Failed to update project information');
    } finally {
      setSaving(false);
    }
  }

  async function updateProjectInfoAll() {
    if (!bulkUpdateProjectInfo) return;

    setSaving(true);
    try {
      const allItems = rooms.flatMap(r => r.line_items);
      const instances = allItems.filter(item => item.product_id === bulkUpdateProjectInfo.productId);
      const itemIds = instances.map(i => i.id);

      const { error } = await supabase
        .from('proposal_line_items')
        .update(bulkUpdateProjectInfo.newValues)
        .in('id', itemIds);

      if (error) throw error;
      await loadData();
      setEditingProjectInfo(null);
      setBulkUpdateProjectInfo(null);
    } catch (error: any) {
      console.error('Error updating all project info:', error);
      alert('Failed to update project information');
    } finally {
      setSaving(false);
    }
  }

  async function applyLineItemUpdate(itemId: string, updates: any) {
    const currentItem = rooms.flatMap(r => r.line_items).find(i => i.id === itemId);
    if (currentItem) {
      const merged = { ...currentItem, ...updates };
      const quantity = merged.quantity || 0;
      const unitPrice = merged.unit_price || 0;
      const laborHours = merged.labor_hours || 0;
      const laborRate = merged.labor_rate || 0;
      const partsTotal = quantity * unitPrice;
      const laborTotal = laborHours * quantity * laborRate;
      const lineTotal = partsTotal + laborTotal;
      if (updates.quantity !== undefined || updates.unit_price !== undefined) {
        updates.line_total = lineTotal;
        if (laborHours > 0 && laborRate > 0) {
          updates.labor_total = laborTotal;
        }
      }
      if (updates.labor_hours !== undefined || updates.labor_rate !== undefined) {
        updates.labor_total = laborTotal;
        updates.line_total = lineTotal;
      }
    }

    const { error } = await supabase
      .from('proposal_line_items')
      .update(updates)
      .eq('id', itemId);

    if (error) throw error;

    setRooms(prevRooms => {
      return prevRooms.map(room => ({
        ...room,
        line_items: room.line_items.map(item => {
          if (item.id === itemId) {
            const updatedItem = { ...item, ...updates };
            const quantity = updatedItem.quantity || 0;
            const unitPrice = updatedItem.unit_price || 0;
            const laborHours = updatedItem.labor_hours || 0;
            const laborRate = updatedItem.labor_rate || 0;
            updatedItem.parts_total = quantity * unitPrice;
            updatedItem.labor_total = laborHours * quantity * laborRate;
            updatedItem.line_total = updatedItem.parts_total + updatedItem.labor_total;
            return updatedItem;
          }
          return item;
        })
      }));
    });

    if (isCoMode && changeOrderId) {
      if (currentItem) {
        const hasQtyChange = updates.quantity !== undefined;
        const hasPriceChange = updates.unit_price !== undefined;
        const hasLaborChange = updates.labor_total !== undefined || updates.labor_hours !== undefined || updates.labor_rate !== undefined || updates.labor_phase_id !== undefined;
        if (hasQtyChange || hasPriceChange || hasLaborChange) {
          let actionType: 'modify_quantity' | 'modify_price' | 'modify_labor';
          if (hasLaborChange && !hasQtyChange && !hasPriceChange) {
            actionType = 'modify_labor';
          } else if (hasQtyChange) {
            actionType = 'modify_quantity';
          } else {
            actionType = 'modify_price';
          }
          const updatedItem = { ...currentItem, ...updates };
          const qty = updatedItem.quantity || 0;
          const up = updatedItem.unit_price || 0;
          const lh = updatedItem.labor_hours || 0;
          const lr = updatedItem.labor_rate || 0;
          const newLaborTotal = lh * qty * lr;
          const origQty = currentItem.quantity || 0;
          const origUp = (currentItem as any).unit_price || 0;
          const origLaborHours = currentItem.labor_hours || 0;
          const origLaborRate = (currentItem as any).labor_rate || 0;
          const origLaborTotal = origLaborHours * origQty * origLaborRate;
          const origLineTotal = origQty * origUp;
          const roomName = rooms.find(r => r.line_items.some(i => i.id === itemId))?.name || '';
          const freshRecords = await loadCOLineItems(changeOrderId);
          await recordCOAction(changeOrderId, itemId, actionType, {
            description: (updatedItem as any).description,
            quantity: qty,
            unit_price: up,
            line_total: qty * up,
            labor_total: newLaborTotal,
            labor_hours: lh,
            labor_rate: lr,
            labor_phase_id: updatedItem.labor_phase_id,
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
    }

    await supabase.rpc('calculate_proposal_totals', { p_proposal_id: proposalId });

    const { data: updatedProposal } = await supabase
      .from('proposals')
      .select(`*, contacts:contacts!proposals_contact_id_fkey (id, full_name, email, phone, company_name)`)
      .eq('id', proposalId)
      .maybeSingle();

    if (updatedProposal) {
      setProposal(updatedProposal);
    }
  }

  async function updateLineItem(itemId: string, updates: any) {
    try {
      const currentItem = rooms.flatMap(r => r.line_items).find(i => i.id === itemId);
      if (!currentItem) {
        await applyLineItemUpdate(itemId, updates);
        return;
      }

      const isPriceChange = updates.unit_price !== undefined && updates.unit_price !== currentItem.unit_price;
      const isCostChange = updates.cost !== undefined && updates.cost !== currentItem.cost;
      const hasPriceOrCostChange = isPriceChange || isCostChange;
      const isProductItem = currentItem.product_id !== null;

      if (hasPriceOrCostChange && isProductItem) {
        const { count } = await supabase
          .from('proposal_line_items')
          .select('*', { count: 'exact', head: true })
          .eq('proposal_id', proposalId)
          .eq('product_id', currentItem.product_id);

        if ((count || 0) > 1) {
          setPendingBulkUpdate({
            itemId,
            productId: currentItem.product_id!,
            fieldName: isPriceChange ? 'unit_price' : 'cost',
            oldValue: isPriceChange ? currentItem.unit_price : (currentItem.cost || 0),
            newValue: isPriceChange ? updates.unit_price : updates.cost,
            description: currentItem.description,
            instanceCount: count || 0,
            fullUpdates: updates,
          });
          return;
        }
      }

      await applyLineItemUpdate(itemId, updates);
    } catch (error: any) {
      console.error('Error updating line item:', error);
      alert('Failed to update item');
    }
  }

  async function handleBulkUpdateSingle() {
    if (!pendingBulkUpdate) return;
    setBulkUpdateLoading(true);
    try {
      await applyLineItemUpdate(pendingBulkUpdate.itemId, pendingBulkUpdate.fullUpdates);
      setPendingBulkUpdate(null);
    } catch (error: any) {
      console.error('Error updating single item:', error);
      alert('Failed to update item');
    } finally {
      setBulkUpdateLoading(false);
    }
  }

  async function handleBulkUpdateAll() {
    if (!pendingBulkUpdate) return;
    setBulkUpdateLoading(true);
    try {
      const priceUpdate: any = {};
      priceUpdate[pendingBulkUpdate.fieldName] = pendingBulkUpdate.newValue;

      const { error } = await supabase
        .from('proposal_line_items')
        .update(priceUpdate)
        .eq('proposal_id', proposalId)
        .eq('product_id', pendingBulkUpdate.productId);

      if (error) throw error;

      if (pendingBulkUpdate.fieldName === 'unit_price') {
        const affectedItems = rooms.flatMap(r => r.line_items).filter(
          item => item.product_id === pendingBulkUpdate.productId
        );
        for (const item of affectedItems) {
          const newLineTotal = item.quantity * pendingBulkUpdate.newValue;
          const laborTotal = (item.labor_hours || 0) * item.quantity * (item.labor_rate || 0);
          await supabase
            .from('proposal_line_items')
            .update({ line_total: (item.quantity * pendingBulkUpdate.newValue) + laborTotal })
            .eq('id', item.id);
        }
      }

      setRooms(prevRooms => prevRooms.map(room => ({
        ...room,
        line_items: room.line_items.map(item => {
          if (item.product_id === pendingBulkUpdate.productId) {
            const updatedItem = { ...item, ...priceUpdate };
            const quantity = updatedItem.quantity || 0;
            const unitPrice = updatedItem.unit_price || 0;
            const laborHours = updatedItem.labor_hours || 0;
            const laborRate = updatedItem.labor_rate || 0;
            updatedItem.parts_total = quantity * unitPrice;
            updatedItem.labor_total = laborHours * laborRate;
            updatedItem.line_total = updatedItem.parts_total + updatedItem.labor_total;
            return updatedItem;
          }
          return item;
        })
      })));

      await supabase.rpc('calculate_proposal_totals', { p_proposal_id: proposalId });

      const { data: updatedProposal } = await supabase
        .from('proposals')
        .select(`*, contacts:contacts!proposals_contact_id_fkey (id, full_name, email, phone, company_name)`)
        .eq('id', proposalId)
        .maybeSingle();

      if (updatedProposal) {
        setProposal(updatedProposal);
      }

      setPendingBulkUpdate(null);
    } catch (error: any) {
      console.error('Error updating all instances:', error);
      alert('Failed to update all instances');
    } finally {
      setBulkUpdateLoading(false);
    }
  }

  function startEditingItem(itemId: string, field: string, currentValue: any) {
    setEditingItemId(itemId);
    setEditingValues({
      ...editingValues,
      [`${itemId}_${field}`]: currentValue
    });
  }

  function handleEditChange(itemId: string, field: string, value: any) {
    setEditingValues({
      ...editingValues,
      [`${itemId}_${field}`]: value
    });
  }

  async function saveEdit(itemId: string, field: string) {
    const key = `${itemId}_${field}`;
    const value = editingValues[key];

    if (value === undefined) {
      setEditingItemId(null);
      return;
    }

    const updates: any = {};

    if (field === 'quantity') {
      updates.quantity = parseFloat(value) || 0;
    } else if (field === 'cost') {
      updates.cost = parseFloat(value) || 0;
    } else if (field === 'unit_price') {
      updates.unit_price = parseFloat(value) || 0;
    } else if (field === 'labor_hours') {
      updates.labor_hours = parseFloat(value) || 0;
    } else if (field === 'labor_rate') {
      updates.labor_rate = parseFloat(value) || 0;
    } else if (field === 'labor_phase_id') {
      updates.labor_phase_id = value || null;

      // When labor phase changes, update the labor rate to match the phase's default rate
      if (value) {
        const selectedPhase = laborPhases.find(phase => phase.id === value);
        if (selectedPhase && selectedPhase.default_rate) {
          updates.labor_rate = selectedPhase.default_rate;
        }
      }
    } else if (field === 'description') {
      updates.description = value || '';
    }

    await updateLineItem(itemId, updates);
    setEditingItemId(null);
  }

  function cancelEdit() {
    setEditingItemId(null);
    setEditingValues({});
  }

  function handlePopOut() {
    window.open(`/proposals-fullscreen?id=${proposalId}`, '_blank', 'width=1400,height=900');
  }

  function calculatePricingBreakdown() {
    // Always calculate materials and labor breakdown from line items
    let totalLabor = 0;
    let totalMaterials = 0;
    let calculatedSubtotal = 0;
    let totalLaborHours = 0;
    const laborHoursByPhase: { [key: string]: { name: string; hours: number } } = {};

    rooms.forEach(room => {
      // Only count top-level items (exclude nested items to avoid double counting)
      room.line_items.filter(item => !item.parent_item_id).forEach(item => {
        // Calculate item total including its nested children
        const itemMaterialTotal = item.unit_price * item.quantity;
        const itemLaborTotal = parseFloat(item.labor_total || 0);
        const itemLaborHours = parseFloat(item.labor_hours || 0);

        // Track labor hours by phase
        if (itemLaborHours > 0) {
          const phaseName = item.labor_phases?.name || 'Unassigned';
          const phaseId = item.labor_phase_id || 'unassigned';
          if (!laborHoursByPhase[phaseId]) {
            laborHoursByPhase[phaseId] = { name: phaseName, hours: 0 };
          }
          laborHoursByPhase[phaseId].hours += itemLaborHours;
          totalLaborHours += itemLaborHours;
        }

        // Add nested children totals
        const nestedChildren = room.line_items.filter(nested => nested.parent_item_id === item.id);
        const nestedMaterialTotal = nestedChildren.reduce((sum, nested) =>
          sum + (nested.unit_price * nested.quantity), 0);
        const nestedLaborTotal = nestedChildren.reduce((sum, nested) =>
          sum + parseFloat(nested.labor_total || 0), 0);
        const nestedLaborHours = nestedChildren.reduce((sum, nested) => {
          const hours = parseFloat(nested.labor_hours || 0);
          if (hours > 0) {
            const phaseName = nested.labor_phases?.name || 'Unassigned';
            const phaseId = nested.labor_phase_id || 'unassigned';
            if (!laborHoursByPhase[phaseId]) {
              laborHoursByPhase[phaseId] = { name: phaseName, hours: 0 };
            }
            laborHoursByPhase[phaseId].hours += hours;
          }
          return sum + hours;
        }, 0);

        totalLaborHours += nestedLaborHours;

        // Add to subtotal
        calculatedSubtotal += itemMaterialTotal + nestedMaterialTotal;

        // Calculate labor from labor_total field (supports both material+labor items)
        totalLabor += itemLaborTotal + nestedLaborTotal;

        // Materials is the remainder after labor
        totalMaterials += (itemMaterialTotal + nestedMaterialTotal) - (itemLaborTotal + nestedLaborTotal);
      });
    });

    // Use database-stored values when available (but keep materials/labor from line items)
    if (proposal && proposal.subtotal !== undefined && proposal.total !== undefined) {
      return {
        subtotal: parseFloat(proposal.subtotal || 0),
        totalLabor,
        totalMaterials,
        totalLaborHours,
        laborHoursByPhase: Object.values(laborHoursByPhase).sort((a, b) => a.name.localeCompare(b.name)),
        discountPercent: proposalSettings?.discount_percent || 0,
        discountAmount: parseFloat(proposal.discount_amount || 0),
        pmPercent: proposalSettings?.project_management_percent || 0,
        pmAmount: parseFloat(proposal.project_management_amount || 0),
        designPercent: proposalSettings?.project_design_percent || 0,
        designAmount: parseFloat(proposal.project_design_amount || 0),
        systemDesignPercent: proposalSettings?.system_design_percent || 0,
        systemDesignAmount: parseFloat(proposal.system_design_amount || 0),
        ccFeePercent: proposalSettings?.credit_card_fee_percent || 0,
        ccFeeAmount: parseFloat(proposal.credit_card_fee_amount || 0),
        miscPartsPercent: proposalSettings?.misc_parts_percent || 0,
        miscPartsAmount: parseFloat(proposal.misc_parts_amount || 0),
        custom1Label: proposalSettings?.custom_modifier_1_label || '',
        custom1Percent: proposalSettings?.custom_modifier_1_percent || 0,
        custom1Amount: parseFloat(proposal.custom_modifier_1_amount || 0),
        custom2Label: proposalSettings?.custom_modifier_2_label || '',
        custom2Percent: proposalSettings?.custom_modifier_2_percent || 0,
        custom2Amount: parseFloat(proposal.custom_modifier_2_amount || 0),
        adjustedSubtotal: parseFloat(proposal.subtotal || 0) - parseFloat(proposal.discount_amount || 0) + parseFloat(proposal.project_management_amount || 0) + parseFloat(proposal.project_design_amount || 0) + parseFloat(proposal.system_design_amount || 0) + parseFloat(proposal.credit_card_fee_amount || 0) + parseFloat(proposal.misc_parts_amount || 0) + parseFloat(proposal.custom_modifier_1_amount || 0) + parseFloat(proposal.custom_modifier_2_amount || 0),
        taxRate: proposal?.tax_rate || 0,
        taxAmount: parseFloat(proposal.tax_amount || 0),
        total: parseFloat(proposal.total || 0),
        depositPercent: proposal?.deposit_percent || 0,
        depositAmount: parseFloat(proposal.deposit_amount || 0)
      };
    }

    // Fallback: Calculate everything from line items if database values aren't available
    const subtotal = calculatedSubtotal;

    // Calculate modifiers from proposalSettings
    const discountPercent = proposalSettings?.discount_percent || 0;
    const discountAmount = subtotal * (discountPercent / 100);

    const pmPercent = proposalSettings?.project_management_percent || 0;
    const pmAmount = subtotal * (pmPercent / 100);

    const designPercent = proposalSettings?.project_design_percent || 0;
    const designAmount = subtotal * (designPercent / 100);

    const systemDesignPercent = proposalSettings?.system_design_percent || 0;
    const systemDesignAmount = subtotal * (systemDesignPercent / 100);

    const ccFeePercent = proposalSettings?.credit_card_fee_percent || 0;
    const ccFeeAmount = subtotal * (ccFeePercent / 100);

    const miscPartsPercent = proposalSettings?.misc_parts_percent || 0;
    const miscPartsAmount = subtotal * (miscPartsPercent / 100);

    const custom1Percent = proposalSettings?.custom_modifier_1_percent || 0;
    const custom1Amount = subtotal * (custom1Percent / 100);
    const custom1Label = proposalSettings?.custom_modifier_1_label || '';

    const custom2Percent = proposalSettings?.custom_modifier_2_percent || 0;
    const custom2Amount = subtotal * (custom2Percent / 100);
    const custom2Label = proposalSettings?.custom_modifier_2_label || '';

    // Calculate net modifier percent (sum of all modifiers)
    const netModifierPercent = -discountPercent + pmPercent + designPercent + systemDesignPercent + ccFeePercent + miscPartsPercent + custom1Percent + custom2Percent;

    // Apply modifiers proportionally to parts and labor (matches database logic)
    const modifiedMaterials = totalMaterials * (1 + netModifierPercent / 100);
    const modifiedLabor = totalLabor * (1 + netModifierPercent / 100);
    const adjustedSubtotal = modifiedMaterials + modifiedLabor;

    // Calculate tax based on proposal tax settings and sales tax matrix
    const taxRateDecimal = (proposal?.tax_rate || 0) / 100;

    let taxAmount = 0;
    if (proposal?.tax_override) {
      taxAmount = proposal?.tax_amount || 0;
    } else {
      const taxResult = computeTaxTotals({
        lineItems: [{ partsAmount: totalMaterials, laborAmount: totalLabor }],
        environment: (proposal?.tax_environment || 'residential') as TaxEnvironment,
        projectType: (proposal?.tax_project_type || 'general_installation_repair') as TaxProjectType,
        taxRate: taxRateDecimal,
        isTaxExempt: false,
        netModifierPct: netModifierPercent,
      });
      taxAmount = taxResult.taxAmount;
    }

    const total = adjustedSubtotal + taxAmount;

    const depositPercent = proposal?.deposit_percent || 0;
    const depositAmount = proposal?.deposit_amount || (total * (depositPercent / 100));

    return {
      subtotal,
      totalLabor,
      totalMaterials,
      totalLaborHours,
      laborHoursByPhase: Object.values(laborHoursByPhase).sort((a, b) => a.name.localeCompare(b.name)),
      discountPercent,
      discountAmount,
      pmPercent,
      pmAmount,
      designPercent,
      designAmount,
      systemDesignPercent,
      systemDesignAmount,
      ccFeePercent,
      ccFeeAmount,
      miscPartsPercent,
      miscPartsAmount,
      custom1Label,
      custom1Percent,
      custom1Amount,
      custom2Label,
      custom2Percent,
      custom2Amount,
      adjustedSubtotal,
      taxRate: taxRate * 100,
      taxAmount,
      total,
      depositPercent,
      depositAmount
    };
  }

  // Early loading state check is handled below with more comprehensive check
  // Removed duplicate loading/error screens to prevent premature error displays

  let pricing;
  try {
    pricing = calculatePricingBreakdown();
  } catch (error) {
    console.error('Error calculating pricing:', error);
    pricing = {
      subtotal: 0,
      totalLabor: 0,
      totalMaterials: 0,
      totalLaborHours: 0,
      laborHoursByPhase: [],
      taxRate: 0,
      taxAmount: 0,
      total: 0
    };
  }

  const containerClass = isCoMode ? "h-full flex flex-col bg-gray-900 overflow-hidden" : "h-screen flex flex-col bg-gray-900 overflow-hidden";

  const containerStyle = {};

  console.log('Rendering proposal with:', { proposal, rooms, pricing, selectedItems: selectedItems, selectedItemsSize: selectedItems.size });

  // Show loading state
  if (loading) {
    return (
      <div className={`${isCoMode ? 'h-full' : 'h-screen'} flex items-center justify-center bg-gray-900`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-cyan-500 mx-auto mb-4"></div>
          <div className="text-white text-lg mb-2">{changeOrderId ? 'Change Order Loading...' : 'Loading Proposal...'}</div>
          <div className="text-gray-400 text-sm">Please wait while we load the data</div>
        </div>
      </div>
    );
  }

  // Safety check - render minimal UI if there's an issue
  // Only show error state if loading is complete and data is still missing
  if (!loading && (!proposal || !rooms)) {
    return (
      <div className={`${isCoMode ? 'h-full' : 'h-screen'} flex items-center justify-center bg-gray-900`}>
        <div className="text-center">
          <div className="text-yellow-400 text-lg mb-2">Data Loading Issue</div>
          <div className="text-gray-500 text-sm mb-4">Proposal: {proposal ? 'OK' : 'Missing'}, Rooms: {rooms ? 'OK' : 'Missing'}</div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onBack();
            }}
            className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const activeArea = rooms.find(r => r.id === activeAreaId);

  // Get all line items with filtering
  // In non-CO mode, hide items marked is_hidden (they don't belong to this view)
  // In CO mode, include hidden items so removed items show with strikethrough
  let displayItems = [
    ...rooms.flatMap(r => r.line_items.map(item => ({ ...item, areaName: r.name, areaId: r.id }))),
    ...unassignedItems.map(item => ({ ...item, areaName: 'Unassigned', areaId: '__unassigned__' }))
  ].filter(item => isCoMode || !item.is_hidden);

  // Apply filters
  if (filters.areas.length > 0) {
    displayItems = displayItems.filter(item => filters.areas.includes(item.areaId));
  }
  if (filters.phases.length > 0) {
    displayItems = displayItems.filter(item => item.labor_phases?.name && filters.phases.includes(item.labor_phases.name));
  }
  if (filters.manufacturers.length > 0) {
    displayItems = displayItems.filter(item => {
      const manufacturer = item.products?.manufacturers?.name || '';
      return filters.manufacturers.includes(manufacturer);
    });
  }
  // Get unique values for filter options
  const uniquePhases = Array.from(new Set(rooms.flatMap(r =>
    r.line_items.map(item => item.labor_phases?.name).filter(Boolean)
  )));
  const uniqueManufacturers = Array.from(new Set(rooms.flatMap(r =>
    r.line_items.map(item => item.products?.manufacturers?.name).filter(Boolean)
  )));

  const activeFilterCount = filters.areas.length + filters.phases.length + filters.manufacturers.length;

  return (
    <div className={containerClass} style={containerStyle}>
      {/* Header */}
      <div className="sticky top-0 bg-gray-800 border-b border-gray-700 flex-shrink-0 z-30">
        {/* Compact Header — single row */}
        <div className="px-3 sm:px-4 py-2 flex items-center justify-between gap-2 flex-wrap">
          {/* Left: Back + Title + Customer */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onBack();
                }}
                className="text-gray-400 hover:text-white transition-colors flex-shrink-0"
                title="Back to Proposals"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-base font-semibold text-white truncate">
                    {proposal?.title || proposal?.proposal_number || 'Proposal Builder'}
                  </h1>
                  {proposal?.status && getStatusBadge(proposal.status)}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-0.5">
                  <User className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{proposal?.contacts?.full_name || 'Loading...'}</span>
                  <span className="text-gray-600">•</span>
                  <span className="text-gray-500">#{proposal?.proposal_number}</span>
                </div>
              </div>
          </div>

          {/* Right: Badges + All Actions */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* Live on Portal Badge */}
              {proposal?.is_portal_visible && proposal?.is_active_revision && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">
                  <Globe className="w-3 h-3" />
                  <span className="hidden sm:inline">Live</span>
                </span>
              )}

              {/* Portal Version Badge */}
              {(proposal?.current_portal_version ?? 0) > 0 && (
                <button
                  onClick={() => setShowPortalVersionHistory(true)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
                  title="View portal version history"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span className="hidden sm:inline">v{proposal.current_portal_version}</span>
                </button>
              )}

              {/* Locked Badge — click to open unlock modal */}
              {proposal?.is_locked && (
                <button
                  onClick={() => setShowUnlockWarningModal(true)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 hover:bg-yellow-500/20 transition-colors"
                  title="Proposal is locked — click to unlock"
                >
                  <Lock className="w-3 h-3" />
                  <span className="hidden sm:inline">Locked</span>
                </button>
              )}

              {/* Expiration Badge */}
              {(proposal?.status === 'sent' || proposal?.status === 'portal' || proposal?.status === 'expired') && proposal?.sent_at && (() => {
                const expiresAt = new Date(proposal.sent_at);
                expiresAt.setDate(expiresAt.getDate() + 30);
                const now = new Date();
                const daysUntilExpiration = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                const isExpired = daysUntilExpiration <= 0;

                return (
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                    isExpired
                      ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                      : daysUntilExpiration <= 7
                        ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                        : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                  }`}>
                    <Clock className="w-3 h-3" />
                    <span className="hidden sm:inline">{isExpired ? 'Expired' : `${daysUntilExpiration}d left`}</span>
                    <span className="sm:hidden">{isExpired ? 'Exp' : `${daysUntilExpiration}d`}</span>
                  </span>
                );
              })()}

            {/* Sidebar Toggle (mobile/collapsed) */}
            {sidebarCollapsed && (
              <button
                onClick={() => setSidebarCollapsed(false)}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors lg:hidden"
                title="Show Areas"
              >
                <PanelLeft className="w-4 h-4" />
              </button>
            )}

            {/* Bulk Actions (when items selected) */}
            {selectedItems.size > 0 && (
              <>
                <div className="h-6 w-px bg-gray-700 mx-1" />
                {(() => {
                  const selectedItemsData = rooms.flatMap(room =>
                    room.line_items.filter(item => selectedItems.has(item.id))
                  );
                  const allNested = selectedItemsData.length > 0 && selectedItemsData.every(item => item.parent_item_id);
                  if (allNested) {
                    return (
                      <button
                        onClick={handleBulkNestItems}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-600 text-white hover:bg-amber-700 rounded-lg transition-colors text-xs font-medium"
                        title="Unnest selected items"
                      >
                        <Outdent className="w-3.5 h-3.5" />
                        <span>Unnest {selectedItems.size}</span>
                      </button>
                    );
                  }
                  return (
                    <button
                      onClick={handleBulkNestItems}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-green-600 text-white hover:bg-green-700 rounded-lg transition-colors text-xs font-medium"
                      title="Nest selected items under the item above"
                    >
                      <Indent className="w-3.5 h-3.5" />
                      <span>Nest {selectedItems.size}</span>
                    </button>
                  );
                })()}
                <button
                  onClick={() => setShowCopyToModal(true)}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors text-xs font-medium"
                  title="Copy selected items"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{selectedItems.size}</span>
                </button>
                <button
                  onClick={handleBulkDeleteItems}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-red-600 text-white hover:bg-red-700 rounded-lg transition-colors text-xs font-medium"
                  title="Delete selected items"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{selectedItems.size}</span>
                </button>
                <div className="h-6 w-px bg-gray-700 mx-1" />
              </>
            )}

            {/* Send/Portal Button */}
            {proposal?.status !== 'approved' && (
              <>
                {(proposal?.status === 'designing' || proposal?.status === 'ready_to_submit') ? (
                  <div className="flex items-center gap-2">
                    {proposalReadiness && (
                      <button
                        onClick={() => setShowSettings(true)}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${
                          proposalReadiness.isReady
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                        }`}
                        title={`${proposalReadiness.overallProgress}% complete - Click to review settings`}
                      >
                        {proposalReadiness.isReady ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5" />
                        )}
                        <span className="hidden sm:inline">{proposalReadiness.overallProgress}%</span>
                      </button>
                    )}
                    <button
                      onClick={handleSendToPortal}
                      disabled={sending}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors font-medium text-xs disabled:opacity-50 ${
                        proposalReadiness?.isReady
                          ? 'bg-blue-600 hover:bg-blue-700 text-white'
                          : 'bg-gray-600/50 text-gray-300 hover:bg-gray-600/70 border border-gray-500/50'
                      }`}
                      title={proposalReadiness?.isReady ? "Send to Customer Portal" : `Proposal is ${proposalReadiness?.overallProgress ?? 0}% complete — finish settings, scope, billing & contract before sending`}
                    >
                      <Mail className="w-4 h-4" />
                      <span className="hidden sm:inline">{sending ? 'Sending...' : 'Send'}</span>
                    </button>
                  </div>
                ) : (proposal?.status === 'sent' || proposal?.status === 'portal' || proposal?.status === 'expired') && (
                  <div className="relative">
                    <button
                      onClick={() => setShowPortalDropdown(!showPortalDropdown)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-medium text-xs"
                      title="Portal Actions"
                    >
                      <Eye className="w-4 h-4" />
                      <span className="hidden sm:inline">Portal</span>
                      <ChevronDown className="w-3 h-3" />
                    </button>

                    {showPortalDropdown && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowPortalDropdown(false)} />
                        <div className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-20 min-w-[180px]">
                          <button
                            onClick={openPortalPreview}
                            className="w-full px-3 py-2 text-left text-gray-700 hover:bg-gray-100 flex items-center gap-2 text-sm"
                          >
                            <ExternalLink className="w-4 h-4" />
                            Preview
                          </button>
                          {proposal?.status === 'expired' && (
                            <>
                              <div className="border-t border-gray-200 my-1" />
                              <button
                                onClick={() => {
                                  setShowReactivateModal(true);
                                  setShowPortalDropdown(false);
                                }}
                                className="w-full px-3 py-2 text-left text-green-600 hover:bg-green-50 flex items-center gap-2 text-sm"
                              >
                                <RefreshCw className="w-4 h-4" />
                                Reactivate
                              </button>
                            </>
                          )}
                          {proposal?.status !== 'expired' && (
                            <>
                              <div className="border-t border-gray-200 my-1" />
                              <button
                                onClick={handleRecallProposal}
                                disabled={recalling}
                                className="w-full px-3 py-2 text-left text-amber-600 hover:bg-amber-50 flex items-center gap-2 text-sm disabled:opacity-50"
                              >
                                <RotateCcw className="w-4 h-4" />
                                {recalling ? 'Recalling...' : 'Recall'}
                              </button>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Status Actions Dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors font-medium text-xs ${
                      proposalReadiness?.isReady
                        ? 'bg-gray-700 text-white hover:bg-gray-600'
                        : 'bg-gray-800/60 text-gray-400 hover:bg-gray-700/60 border border-gray-600/40'
                    }`}
                    title={proposalReadiness?.isReady ? "Status Actions" : `Complete proposal settings before approving (${proposalReadiness?.overallProgress ?? 0}% ready)`}
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
                          className={`w-full px-3 py-2 text-left flex items-center gap-2 text-sm disabled:opacity-50 ${
                            proposalReadiness?.isReady
                              ? 'text-green-600 hover:bg-green-50'
                              : 'text-gray-400 hover:bg-gray-50'
                          }`}
                          title={proposalReadiness?.isReady ? undefined : `Proposal is ${proposalReadiness?.overallProgress ?? 0}% complete — review settings before approving`}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="flex-1">Approve</span>
                          {!proposalReadiness?.isReady && (
                            <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                          )}
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
                              Mark Ready
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
              </>
            )}

            {/* Add Item Button */}
            <button
              onClick={() => {
                setShowAddItemToAreasModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 text-white hover:bg-cyan-700 rounded-lg transition-colors font-medium text-xs"
              title="Add Item"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add</span>
            </button>

            {/* Proposal Settings */}
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
              title="Proposal Settings"
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* More Options Menu */}
            <div className="relative">
              <button
                onClick={() => setShowMoreOptionsMenu(!showMoreOptionsMenu)}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                title="More Options"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {showMoreOptionsMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowMoreOptionsMenu(false)} />
                  <div className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-20 min-w-[200px]">
                    {/* Customer Section */}
                    {proposal?.contact_id && (
                      <>
                        <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer</div>
                        <a
                          href={`/contacts?id=${proposal.contact_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full px-3 py-2 text-left text-gray-700 hover:bg-gray-100 flex items-center gap-2 text-sm"
                        >
                          <ExternalLink className="w-4 h-4" />
                          <span>View Customer</span>
                        </a>
                        <button
                          onClick={() => {
                            setShowEditCustomerModal(true);
                            setShowMoreOptionsMenu(false);
                          }}
                          className="w-full px-3 py-2 text-left text-gray-700 hover:bg-gray-100 flex items-center gap-2 text-sm"
                        >
                          <Edit2 className="w-4 h-4" />
                          <span>Change Customer</span>
                        </button>
                        <div className="border-t border-gray-200 my-1" />
                      </>
                    )}

                    {/* Proposal Actions */}
                    <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Proposal</div>
                    <button
                      onClick={() => {
                        setShowFilterModal(true);
                        setShowMoreOptionsMenu(false);
                      }}
                      className="w-full px-3 py-2 text-left text-gray-700 hover:bg-gray-100 flex items-center gap-2 text-sm"
                    >
                      <Filter className="w-4 h-4" />
                      <span>Filter Items</span>
                      {activeFilterCount > 0 && (
                        <span className="ml-auto px-1.5 py-0.5 bg-cyan-600 text-white text-xs rounded-full font-medium">
                          {activeFilterCount}
                        </span>
                      )}
                    </button>

                    <button
                      onClick={() => {
                        setShowEmailProposalModal(true);
                        setShowMoreOptionsMenu(false);
                      }}
                      className={`w-full px-3 py-2 text-left flex items-center gap-2 text-sm ${
                        proposalReadiness?.isReady
                          ? 'text-gray-700 hover:bg-gray-100'
                          : 'text-gray-400 hover:bg-gray-50'
                      }`}
                      title={proposalReadiness?.isReady ? undefined : `Proposal is ${proposalReadiness?.overallProgress ?? 0}% complete — finish settings before emailing`}
                    >
                      <Mail className="w-4 h-4" />
                      <span className="flex-1">Email Proposal</span>
                      {!proposalReadiness?.isReady && (
                        <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                      )}
                    </button>

                    <button
                      onClick={() => {
                        loadPdfTemplates();
                        setShowPdfModal(true);
                        setShowMoreOptionsMenu(false);
                      }}
                      className="w-full px-3 py-2 text-left text-gray-700 hover:bg-gray-100 flex items-center gap-2 text-sm"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download PDF</span>
                    </button>

                    <div className="border-t border-gray-200 my-1" />

                    {/* View Options */}
                    <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">View</div>
                    <button
                      onClick={() => {
                        const newColumns = new Set(visibleColumns);
                        if (newColumns.has('cost')) {
                          newColumns.delete('cost');
                        } else {
                          newColumns.add('cost');
                        }
                        setVisibleColumns(newColumns);
                        saveColumnPreferences(newColumns);
                        setShowMoreOptionsMenu(false);
                      }}
                      className="w-full px-3 py-2 text-left text-gray-700 hover:bg-gray-100 flex items-center gap-2 text-sm"
                    >
                      {visibleColumns.has('cost') ? (
                        <>
                          <EyeOff className="w-4 h-4" />
                          <span>Hide Cost Column</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-4 h-4" />
                          <span>Show Cost Column</span>
                        </>
                      )}
                    </button>

                    <div className="border-t border-gray-200 my-1" />

                    {/* Reports & History */}
                    <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Reports</div>
                    <button
                      onClick={() => {
                        setShowRevisionManager(true);
                        setShowMoreOptionsMenu(false);
                      }}
                      className="w-full px-3 py-2 text-left text-gray-700 hover:bg-gray-100 flex items-center gap-2 text-sm"
                    >
                      <GitBranch className="w-4 h-4" />
                      <span>Revisions</span>
                      {(proposal?.revision_count && proposal.revision_count > 1) && (
                        <span className="ml-auto px-1.5 py-0.5 bg-blue-600 text-white text-xs rounded-full font-medium">
                          {proposal.revision_count}
                        </span>
                      )}
                    </button>

                    <button
                      onClick={() => {
                        setShowTaxReport(true);
                        setShowMoreOptionsMenu(false);
                      }}
                      className="w-full px-3 py-2 text-left text-gray-700 hover:bg-gray-100 flex items-center gap-2 text-sm"
                    >
                      <Receipt className="w-4 h-4" />
                      <span>Tax Report</span>
                    </button>

                    <button
                      onClick={() => {
                        setShowLaborPhaseReport(true);
                        setShowMoreOptionsMenu(false);
                      }}
                      className="w-full px-3 py-2 text-left text-gray-700 hover:bg-gray-100 flex items-center gap-2 text-sm"
                    >
                      <Layers className="w-4 h-4" />
                      <span>Phase Report</span>
                    </button>

                    <button
                      onClick={() => {
                        setShowNotificationHistory(true);
                        setShowMoreOptionsMenu(false);
                      }}
                      className="w-full px-3 py-2 text-left text-gray-700 hover:bg-gray-100 flex items-center gap-2 text-sm"
                    >
                      <Bell className="w-4 h-4" />
                      <span>Notifications</span>
                    </button>

                    {proposal && (proposal.status === 'sent' || proposal.status === 'portal' || proposal.status === 'approved' || proposal.status === 'approved_pending_action' || proposal.status === 'declined' || proposal.status === 'expired') && (
                      <button
                        onClick={fetchActivityData}
                        className="w-full px-3 py-2 text-left text-gray-700 hover:bg-gray-100 flex items-center gap-2 text-sm"
                      >
                        <Activity className="w-4 h-4" />
                        <span>Activity Log</span>
                      </button>
                    )}

                    <div className="border-t border-gray-200 my-1" />

                    {/* Settings */}
                    <button
                      onClick={() => {
                        setShowSettings(true);
                        setShowMoreOptionsMenu(false);
                      }}
                      className="w-full px-3 py-2 text-left text-gray-700 hover:bg-gray-100 flex items-center gap-2 text-sm"
                    >
                      <Settings className="w-4 h-4" />
                      <span>Settings</span>
                    </button>

                    {!isStandalone && (
                      <>
                        <div className="border-t border-gray-200 my-1" />
                        <button
                          onClick={() => {
                            handlePopOut();
                            setShowMoreOptionsMenu(false);
                          }}
                          className="w-full px-3 py-2 text-left text-gray-700 hover:bg-gray-100 flex items-center gap-2 text-sm"
                        >
                          <Maximize2 className="w-4 h-4" />
                          <span>Pop Out</span>
                        </button>
                      </>
                    )}

                    {isStandalone && (
                      <>
                        <div className="border-t border-gray-200 my-1" />
                        <button
                          onClick={() => window.close()}
                          className="w-full px-3 py-2 text-left text-gray-700 hover:bg-gray-100 flex items-center gap-2 text-sm"
                        >
                          <X className="w-4 h-4" />
                          <span>Close Window</span>
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* CO Mode Summary Bar */}
        {isCoMode && (
          <div className="bg-amber-950/40 border-b border-amber-700/40 px-4 py-2 flex items-center gap-2 text-xs flex-shrink-0">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
            <span className="text-amber-300 font-semibold">Change Order Mode</span>
          </div>
        )}
      </div>

      {/* Locked Banner — shown when proposal is locked (live on portal) */}
      {proposal?.is_locked && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-3 flex items-center gap-3">
          <Lock className="w-5 h-5 text-yellow-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-200">
              This proposal is live on the customer portal and is locked
            </p>
            <p className="text-xs text-yellow-300">
              Editing is disabled. Unlock to make changes, or create a revision to work privately.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {(proposal?.current_portal_version ?? 0) > 0 && (
              <button
                onClick={() => setShowPortalVersionHistory(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-xs font-medium transition-colors border border-gray-600"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Version History</span>
              </button>
            )}
            <button
              onClick={() => setShowUnlockWarningModal(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-xs font-medium transition-colors"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Unlock to Edit</span>
            </button>
          </div>
        </div>
      )}

      {/* Warning Banner for Unlocked Live Proposals */}
      {proposal?.is_portal_visible && proposal?.is_active_revision && !proposal?.is_locked &&
       (proposal?.status === 'sent' || proposal?.status === 'portal' || proposal?.status === 'viewed' || proposal?.status === 'expired') && (
        <div className="bg-orange-500/10 border-b border-orange-500/20 px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-orange-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-orange-200">
              Proposal hidden from portal — editing in progress
            </p>
            <p className="text-xs text-orange-300">
              Any changes you save are not yet visible to the customer. Re-submit to the portal when ready.
            </p>
          </div>
          <button
            onClick={() => setShowRevisionManager(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors"
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span>Create Revision</span>
          </button>
        </div>
      )}

      {/* CO Mode Banner */}
      {isCoMode && (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 flex items-center gap-3">
          <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <p className="text-xs text-amber-200">
            <span className="font-semibold text-amber-300">Change Order Mode</span> — use the <span className="font-semibold">trash icon</span> on each item to track removals. Area deletion is disabled.
          </p>
        </div>
      )}

      {/* Main Content: Sidebar + Items */}
      <div className="flex-1 flex relative overflow-hidden">
        {/* Floating Edge Arrow (when sidebar collapsed) — desktop only */}
        {sidebarCollapsed && !isMobile && (
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-gray-700 hover:bg-gray-600 text-white p-2 rounded-r-lg shadow-lg transition-all hover:pl-3"
            title="Show Areas Sidebar"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}

        {/* ── DESKTOP SIDEBAR (md and up) ── */}
        {!sidebarCollapsed && !isMobile && (
          <div className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col overflow-y-auto flex-shrink-0">
            <div className="p-3 sm:p-4 border-b border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-white font-semibold text-sm sm:text-base">Areas</h2>
                <button
                  onClick={() => setSidebarCollapsed(true)}
                  className="text-gray-400 hover:text-white hover:bg-gray-700 p-1 rounded transition-colors"
                  title="Collapse Sidebar"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              </div>

              {/* Add New Area */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newAreaName}
                  onChange={(e) => setNewAreaName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddArea()}
                  placeholder="New area name..."
                  className="flex-1 px-2 sm:px-3 py-1.5 sm:py-2 bg-gray-700 border border-gray-600 text-white text-xs sm:text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
                <button
                  onClick={handleAddArea}
                  disabled={!newAreaName.trim() || saving}
                  className="p-1.5 sm:p-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Add Area"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Areas List — Desktop */}
            <div className="flex-1">
              {unassignedItems.filter(i => isCoMode || !i.is_hidden).length > 0 && (() => {
                const visibleUnassigned = unassignedItems.filter(i => isCoMode || !i.is_hidden);
                const isActive = activeAreaId === '__unassigned__';
                const topLevelUnassigned = visibleUnassigned.filter(i => !i.parent_item_id);
                const unassignedTotal = topLevelUnassigned.reduce((sum, item) => {
                  const itemTotal = (item.unit_price * item.quantity) + parseFloat(item.labor_total || 0);
                  const nestedTotal = visibleUnassigned
                    .filter(nested => nested.parent_item_id === item.id)
                    .reduce((ns, nested) => ns + (nested.unit_price * nested.quantity) + parseFloat(nested.labor_total || 0), 0);
                  return sum + itemTotal + nestedTotal;
                }, 0);
                return (
                  <div
                    key="__unassigned__"
                    className={`border-b border-amber-700/40 ${isActive ? 'bg-amber-900/20' : 'bg-amber-900/10'}`}
                  >
                    <div
                      onClick={() => setActiveAreaId(isActive ? null : '__unassigned__')}
                      className={`p-3 cursor-pointer hover:bg-amber-900/30 transition-colors ${isActive ? 'border-l-4 border-amber-500' : ''}`}
                      title="Items without an assigned area. Click to target these items, or reassign them to a room."
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {isActive && <Target className="w-4 h-4 text-amber-400 flex-shrink-0" />}
                            <h3 className={`font-medium truncate ${isActive ? 'text-amber-300' : 'text-amber-400'}`}>
                              Unassigned
                            </h3>
                          </div>
                          <div className="flex items-center justify-between mt-1 gap-2">
                            <span className="text-xs text-amber-500/80 truncate">
                              {topLevelUnassigned.length} item{topLevelUnassigned.length !== 1 ? 's' : ''}{visibleUnassigned.length > topLevelUnassigned.length ? ` (${visibleUnassigned.length - topLevelUnassigned.length} nested)` : ''} · no area
                            </span>
                            <span className={`text-xs font-bold flex-shrink-0 ${isActive ? 'text-amber-300' : 'text-amber-200'}`}>
                              ${unassignedTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
              {rooms.map((room) => {
                const isActive = activeAreaId === room.id;
                const topLevelItems = room.line_items.filter(item => !item.parent_item_id);
                const roomTotal = topLevelItems.reduce((sum, item) => {
                  const itemTotal = (item.unit_price * item.quantity) + parseFloat(item.labor_total || 0);
                  const nestedTotal = room.line_items
                    .filter(nested => nested.parent_item_id === item.id)
                    .reduce((nestedSum, nested) =>
                      nestedSum + (nested.unit_price * nested.quantity) + parseFloat(nested.labor_total || 0), 0
                    );
                  return sum + itemTotal + nestedTotal;
                }, 0);

                return (
                  <div
                    key={room.id}
                    className={`border-b border-gray-700 ${isActive ? 'bg-cyan-900/30' : ''}`}
                  >
                    {editingAreaId === room.id ? (
                      <div className="p-3">
                        <input
                          type="text"
                          value={editingAreaName}
                          onChange={(e) => setEditingAreaName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleUpdateArea(room.id, editingAreaName);
                            if (e.key === 'Escape') {
                              setEditingAreaId(null);
                              setEditingAreaName('');
                            }
                          }}
                          className="w-full px-2 py-1 bg-gray-700 border border-gray-600 text-white text-sm rounded focus:outline-none focus:ring-2 focus:ring-cyan-500"
                          autoFocus
                        />
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => handleUpdateArea(room.id, editingAreaName)}
                            className="flex-1 px-2 py-1 bg-cyan-600 text-white text-xs rounded hover:bg-cyan-700"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => {
                              setEditingAreaId(null);
                              setEditingAreaName('');
                            }}
                            className="flex-1 px-2 py-1 bg-gray-700 text-gray-300 text-xs rounded hover:bg-gray-600"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        onClick={() => setActiveAreaId(isActive ? null : room.id)}
                        className={`p-3 cursor-pointer hover:bg-gray-700/50 transition-colors ${isActive ? 'border-l-4 border-cyan-500' : ''}`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              {isActive && <Target className="w-4 h-4 text-blue-400 flex-shrink-0" />}
                              <h3 className={`font-medium truncate ${isActive ? 'text-blue-400' : 'text-white'}`}>
                                {room.name}
                              </h3>
                            </div>
                            <div className="flex items-center justify-between mt-1 gap-2">
                              <span className="text-xs text-gray-400 truncate">
                                {topLevelItems.length} item{topLevelItems.length !== 1 ? 's' : ''}{room.line_items.length > topLevelItems.length ? ` (${room.line_items.length - topLevelItems.length} nested)` : ''}
                              </span>
                              <span className={`text-xs font-bold flex-shrink-0 ${isActive ? 'text-cyan-300' : 'text-gray-200'}`}>
                                ${roomTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>

                          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => {
                                setEditingAreaId(room.id);
                                setEditingAreaName(room.name);
                              }}
                              className="p-1 text-gray-400 hover:text-blue-400 hover:bg-gray-700 rounded"
                              title="Edit Area"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => setEditingScopeRoom({id: room.id, name: room.name, description: room.description, showScope: room.show_scope})}
                              className="p-1 text-gray-400 hover:text-blue-400 hover:bg-gray-700 rounded"
                              title="Edit Area Notes"
                            >
                              <FileText className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => toggleRoomScopeVisibility(room.id, room.show_scope ?? true)}
                              className={`p-1 rounded ${room.show_scope ? 'text-blue-400' : 'text-gray-400 hover:text-blue-400 hover:bg-gray-700'}`}
                              title={room.show_scope ? 'Hide scope' : 'Show scope'}
                            >
                              {room.show_scope ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                            </button>
                            <button
                              onClick={() => handleDeleteArea(room.id)}
                              className="p-1 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded"
                              title="Delete Area"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {rooms.length === 0 && (
                <div className="p-4 text-center text-gray-500 text-sm">
                  No areas yet. Add one above to get started.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── MOBILE BOTTOM SHEET (below md) ── */}
        {isMobile && (
          <>
            {/* Backdrop */}
            <div
              className={`fixed inset-0 bg-black/60 z-40 transition-opacity duration-300 ${!sidebarCollapsed ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
              onClick={() => setSidebarCollapsed(true)}
            />

            {/* Bottom Sheet Panel */}
            <div
              className={`fixed bottom-0 left-0 right-0 z-50 bg-gray-800 rounded-t-2xl shadow-2xl flex flex-col transition-transform duration-300 ease-out ${!sidebarCollapsed ? 'translate-y-0' : 'translate-y-full'}`}
              style={{ maxHeight: '78vh', paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
              {/* Drag Handle */}
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className="w-10 h-1 bg-gray-600 rounded-full" />
              </div>

              {/* Sheet Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700 flex-shrink-0">
                <h2 className="text-white font-semibold text-base">Areas</h2>
                <button
                  onClick={() => setSidebarCollapsed(true)}
                  className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                  title="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Add New Area — mobile stacked layout */}
              <div className="px-4 pt-3 pb-3 border-b border-gray-700 flex-shrink-0">
                <input
                  type="text"
                  value={newAreaName}
                  onChange={(e) => setNewAreaName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddArea()}
                  placeholder="New area name..."
                  className="w-full px-3 py-3 bg-gray-700 border border-gray-600 text-white text-base rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 mb-2"
                />
                <button
                  onClick={handleAddArea}
                  disabled={!newAreaName.trim() || saving}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-cyan-600 text-white text-sm font-medium rounded-xl hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Area
                </button>
              </div>

              {/* Areas List — Mobile, scrollable */}
              <div className="flex-1 overflow-y-auto">
                {unassignedItems.filter(i => isCoMode || !i.is_hidden).length > 0 && (() => {
                  const visibleUnassigned = unassignedItems.filter(i => isCoMode || !i.is_hidden);
                  const isActive = activeAreaId === '__unassigned__';
                  const topLevelUnassigned = visibleUnassigned.filter(i => !i.parent_item_id);
                  const unassignedTotal = topLevelUnassigned.reduce((sum, item) => {
                    const itemTotal = (item.unit_price * item.quantity) + parseFloat(item.labor_total || 0);
                    const nestedTotal = visibleUnassigned
                      .filter(nested => nested.parent_item_id === item.id)
                      .reduce((ns, nested) => ns + (nested.unit_price * nested.quantity) + parseFloat(nested.labor_total || 0), 0);
                    return sum + itemTotal + nestedTotal;
                  }, 0);
                  return (
                    <div
                      key="__unassigned__"
                      className={`border-b border-amber-700/40 ${isActive ? 'bg-amber-900/20' : 'bg-amber-900/10'}`}
                    >
                      <div
                        onClick={() => {
                          setActiveAreaId(isActive ? null : '__unassigned__');
                          if (!isActive) setSidebarCollapsed(true);
                        }}
                        className={`p-4 cursor-pointer transition-colors ${isActive ? 'border-l-4 border-amber-500' : ''}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              {isActive && <Target className="w-4 h-4 text-amber-400 flex-shrink-0" />}
                              <h3 className={`font-medium text-sm truncate ${isActive ? 'text-amber-300' : 'text-amber-400'}`}>
                                Unassigned
                              </h3>
                            </div>
                            <div className="flex items-center justify-between mt-1 gap-2">
                              <span className="text-xs text-amber-500/80">
                                {topLevelUnassigned.length} item{topLevelUnassigned.length !== 1 ? 's' : ''}{visibleUnassigned.length > topLevelUnassigned.length ? ` +${visibleUnassigned.length - topLevelUnassigned.length}` : ''} · no area
                              </span>
                              <span className={`text-xs font-bold ${isActive ? 'text-amber-300' : 'text-amber-200'}`}>
                                ${unassignedTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
                {rooms.map((room) => {
                  const isActive = activeAreaId === room.id;
                  const topLevelItems = room.line_items.filter(item => !item.parent_item_id);
                  const roomTotal = topLevelItems.reduce((sum, item) => {
                    const itemTotal = (item.unit_price * item.quantity) + parseFloat(item.labor_total || 0);
                    const nestedTotal = room.line_items
                      .filter(nested => nested.parent_item_id === item.id)
                      .reduce((nestedSum, nested) =>
                        nestedSum + (nested.unit_price * nested.quantity) + parseFloat(nested.labor_total || 0), 0
                      );
                    return sum + itemTotal + nestedTotal;
                  }, 0);

                  return (
                    <div
                      key={room.id}
                      className={`border-b border-gray-700 ${isActive ? 'bg-cyan-900/30' : ''}`}
                    >
                      {editingAreaId === room.id ? (
                        <div className="p-4">
                          <input
                            type="text"
                            value={editingAreaName}
                            onChange={(e) => setEditingAreaName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleUpdateArea(room.id, editingAreaName);
                              if (e.key === 'Escape') {
                                setEditingAreaId(null);
                                setEditingAreaName('');
                              }
                            }}
                            className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 text-white text-base rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500"
                            autoFocus
                          />
                          <div className="flex gap-2 mt-3">
                            <button
                              onClick={() => handleUpdateArea(room.id, editingAreaName)}
                              className="flex-1 py-2.5 bg-cyan-600 text-white text-sm font-medium rounded-xl hover:bg-cyan-700"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => {
                                setEditingAreaId(null);
                                setEditingAreaName('');
                              }}
                              className="flex-1 py-2.5 bg-gray-700 text-gray-300 text-sm rounded-xl hover:bg-gray-600"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          onClick={() => {
                            setActiveAreaId(isActive ? null : room.id);
                            if (!isActive) setSidebarCollapsed(true);
                          }}
                          className={`p-4 cursor-pointer transition-colors ${isActive ? 'border-l-4 border-cyan-500' : ''}`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                {isActive && <Target className="w-4 h-4 text-blue-400 flex-shrink-0" />}
                                <h3 className={`font-medium text-sm truncate ${isActive ? 'text-blue-400' : 'text-white'}`}>
                                  {room.name}
                                </h3>
                              </div>
                              <div className="flex items-center justify-between mt-1 gap-2">
                                <span className="text-xs text-gray-400">
                                  {topLevelItems.length} item{topLevelItems.length !== 1 ? 's' : ''}{room.line_items.length > topLevelItems.length ? ` +${room.line_items.length - topLevelItems.length}` : ''}
                                </span>
                                <span className={`text-xs font-bold ${isActive ? 'text-cyan-300' : 'text-gray-200'}`}>
                                  ${roomTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </div>
                            </div>

                            {/* Action buttons — only shown for the active area on mobile */}
                            {isActive && (
                              <div className="flex gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => {
                                    setEditingAreaId(room.id);
                                    setEditingAreaName(room.name);
                                  }}
                                  className="p-2.5 text-gray-400 hover:text-blue-400 hover:bg-gray-700 rounded-lg"
                                  title="Edit Area"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setEditingScopeRoom({id: room.id, name: room.name, description: room.description, showScope: room.show_scope})}
                                  className="p-2.5 text-gray-400 hover:text-blue-400 hover:bg-gray-700 rounded-lg"
                                  title="Edit Area Notes"
                                >
                                  <FileText className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => toggleRoomScopeVisibility(room.id, room.show_scope ?? true)}
                                  className={`p-2.5 rounded-lg ${room.show_scope ? 'text-blue-400' : 'text-gray-400 hover:text-blue-400 hover:bg-gray-700'}`}
                                  title={room.show_scope ? 'Hide scope' : 'Show scope'}
                                >
                                  {room.show_scope ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                </button>
                                <button
                                  onClick={() => handleDeleteArea(room.id)}
                                  className="p-2.5 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded-lg"
                                  title="Delete Area"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {rooms.length === 0 && (
                  <div className="p-6 text-center text-gray-500 text-sm">
                    No areas yet. Add one above to get started.
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Line Items Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
            {rooms.length === 0 && unassignedItems.filter(i => isCoMode || !i.is_hidden).length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <Package className="w-16 h-16 text-gray-600 mb-4" />
                <p className="text-gray-400 text-lg mb-2">No items yet</p>
                <p className="text-gray-500 text-sm mb-4">Click "Add" in the toolbar to add your first item</p>
              </div>
            ) : (
              <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}>
                {/* Collapse/Expand All Button */}
                <div className="bg-gray-850 border-b border-gray-700 px-3 py-2 flex items-center justify-between">
                  <div className="text-xs text-gray-400">
                    {rooms.length > 0 ? `${rooms.length} ${rooms.length === 1 ? 'Area' : 'Areas'}` : 'Unassigned Items'}
                  </div>
                  <button
                    onClick={() => expandedRooms.size === 0 ? expandAllRooms() : collapseAllRooms()}
                    className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-700 transition-colors"
                    title={expandedRooms.size === 0 ? 'Expand All Areas' : 'Collapse All Areas'}
                  >
                    {expandedRooms.size === 0 ? (
                      <>
                        <ChevronDown className="w-3 h-3" />
                        Expand All
                      </>
                    ) : (
                      <>
                        <ChevronUp className="w-3 h-3" />
                        Collapse All
                      </>
                    )}
                  </button>
                </div>
                <table className="w-full text-xs sm:text-xs" style={{ minWidth: '1200px' }}>
                  <thead className="bg-gray-800 text-gray-400">
                    <tr>
                      <th className="text-center py-2 px-2 w-16">
                        <div className="flex items-center justify-center gap-1">
                          <GripVertical className="w-3 h-3 text-gray-600" />
                          <input
                            type="checkbox"
                            checked={selectedItems.size > 0 && selectedItems.size === rooms.flatMap(r => r.line_items).length}
                            onChange={toggleSelectAll}
                            className="rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </th>
                      {visibleColumns.has('manufacturer') && <th className="text-left py-2 px-3 whitespace-nowrap">Manufacturer</th>}
                      {visibleColumns.has('sku') && <th className="text-left py-2 px-3 whitespace-nowrap">SKU</th>}
                      {visibleColumns.has('description') && <th className="text-left py-2 px-3">Description</th>}
                      {visibleColumns.has('qty') && <th className="text-right py-2 px-3 whitespace-nowrap">Qty</th>}
                      {visibleColumns.has('cost') && <th className="text-right py-2 px-3 whitespace-nowrap">Cost</th>}
                      {visibleColumns.has('price') && <th className="text-right py-2 px-3 whitespace-nowrap">Price</th>}
                      {visibleColumns.has('laborPhase') && <th className="text-left py-2 px-3 whitespace-nowrap">Labor Phase</th>}
                      {visibleColumns.has('laborHrs') && <th className="text-right py-2 px-3 whitespace-nowrap">Labor Hrs</th>}
                      {visibleColumns.has('laborRate') && <th className="text-right py-2 px-3 whitespace-nowrap">Labor Rate</th>}
                      {visibleColumns.has('laborTotal') && <th className="text-right py-2 px-3 whitespace-nowrap">Labor Total</th>}
                      {visibleColumns.has('partsTax') && <th className="text-right py-2 px-3 whitespace-nowrap">Parts Tax</th>}
                      {visibleColumns.has('laborTax') && <th className="text-right py-2 px-3 whitespace-nowrap">Labor Tax</th>}
                      {visibleColumns.has('lineTotal') && <th className="text-right py-2 px-3 whitespace-nowrap">Line Total</th>}
                      <th className="text-right py-2 px-3 w-24"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const visibleUnassigned = unassignedItems.filter(item => {
                        if (!isCoMode && item.is_hidden) return false;
                        if (filters.areas.length > 0 && !filters.areas.includes('__unassigned__')) return false;
                        return displayItems.some(di => di.id === item.id);
                      });
                      const hasUnassigned = visibleUnassigned.length > 0;
                      const hasRooms = rooms.length > 0;

                      const unassignedVirtualRoom: RoomWithItems = {
                        id: '__unassigned__',
                        name: hasRooms ? 'Unassigned' : '',
                        description: null,
                        show_scope: false,
                        sort_order: -1,
                        proposal_id: proposalId,
                        organization_id: '',
                        line_items: visibleUnassigned as any,
                      };

                      const roomsToRender: RoomWithItems[] = [
                        ...(hasUnassigned ? [unassignedVirtualRoom] : []),
                        ...rooms.filter(room => {
                          if (filters.areas.length > 0 && !filters.areas.includes(room.id)) return false;
                          const roomItems = room.line_items.filter(item => {
                            const itemWithMeta = { ...item, areaId: room.id, areaName: room.name };
                            return displayItems.some(di => di.id === itemWithMeta.id);
                          });
                          return roomItems.length > 0;
                        }),
                      ];

                      return roomsToRender;
                    })()
                      .map(room => {
                        // Calculate top-level items for this room in table view
                        const topLevelItems = room.line_items.filter(item => !item.parent_item_id);

                        return (
                      <React.Fragment key={room.id}>
                        {/* Area Header Row — hidden for flat unassigned items (no rooms case) */}
                        {room.name !== '' && (
                        <tr className={`bg-gray-800/50 border-t-2 border-gray-700 cursor-pointer hover:bg-gray-800/70 transition-colors ${room.id === '__unassigned__' ? 'border-amber-700/40' : ''}`}>
                          <td colSpan={visibleColumns.size + 2} className="py-3 px-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => toggleRoomExpanded(room.id)}
                                  className="p-1 hover:bg-gray-700 rounded transition-colors"
                                  title={expandedRooms.has(room.id) ? 'Collapse Area' : 'Expand Area'}
                                >
                                  {expandedRooms.has(room.id) ? (
                                    <ChevronDown className="w-4 h-4 text-cyan-400" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4 text-cyan-400" />
                                  )}
                                </button>
                                <h3
                                  className={`text-sm font-semibold ${room.id === '__unassigned__' ? 'text-amber-400' : 'text-blue-400'}`}
                                  onClick={() => toggleRoomExpanded(room.id)}
                                >
                                  {room.name}
                                </h3>
                                {room.id !== '__unassigned__' && (
                                  <QaDot
                                    hasMessages={messagesByContext[room.id] || false}
                                    unreadCount={unreadByContext[room.id] || 0}
                                    onClick={() => { setQaContext({ roomId: room.id, lineItemId: null, label: room.name }); setShowQA(true); }}
                                  />
                                )}
                                {room.id !== '__unassigned__' && room.description && room.show_scope && (
                                  <span className="text-xs text-gray-400 italic">
                                    {room.description}
                                  </span>
                                )}
                                {room.id !== '__unassigned__' && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingScopeRoom({
                                      id: room.id,
                                      name: room.name,
                                      description: room.description,
                                      showScope: room.show_scope
                                    });
                                  }}
                                  className={`p-1 rounded transition-colors ${
                                    room.description
                                      ? 'text-blue-400 hover:text-blue-300 hover:bg-gray-700'
                                      : 'text-gray-500 hover:text-blue-400 hover:bg-gray-700'
                                  }`}
                                  title="Edit Area Notes"
                                >
                                  <FileText className="w-4 h-4" />
                                </button>
                                )}
                                {room.id === '__unassigned__' && (
                                  <span className="text-xs text-amber-600 italic">No area assigned</span>
                                )}
                              </div>
                              <span className="text-xs text-gray-500">
                                {topLevelItems.length} items
                                {room.line_items.length > topLevelItems.length && (
                                  <span className="text-gray-600"> ({room.line_items.length - topLevelItems.length} nested)</span>
                                )}
                              </span>
                            </div>
                          </td>
                        </tr>
                        )}
                        {/* Items for this area */}
                        {(expandedRooms.has(room.id) || room.id === '__unassigned__') && (
                          room.line_items
                            .filter(item => {
                              // Only show items that passed the filters
                              const itemWithMeta = { ...item, areaId: room.id, areaName: room.name };
                              const passedFilter = displayItems.some(di => di.id === itemWithMeta.id);

                              // Hide nested items if their parent is collapsed
                              if (item.parent_item_id && collapsedParents.has(item.parent_item_id)) {
                                return false;
                              }

                              return passedFilter;
                            })
                            .sort((a, b) => a.sort_order - b.sort_order)
                            .map((item: any) => {
                              const isNested = !!item.parent_item_id;
                              const hasChildren = room.line_items.some(li => li.parent_item_id === item.id);
                              const isCollapsed = collapsedParents.has(item.id);
                              const parentItem = isNested ? room.line_items.find(li => li.id === item.parent_item_id) : null;
                              const childrenCount = room.line_items.filter(li => li.parent_item_id === item.id).length;
                              const coRecord = isCoMode ? coLineItems.find(c => c.proposal_line_item_id === item.id) : null;
                              const coActionType = coRecord?.action_type ?? null;
                              const isCoRemoved = item.is_hidden === true && coActionType === 'remove';
                              const isCoAdded = coActionType === 'add';
                              const isCoModified = coActionType?.startsWith('modify') ?? false;
                              const isPartsOnlyRemoval = isCoRemoved && coRecord?.remove_scope === 'parts_only';
                              const isFullRemoval = isCoRemoved && coRecord?.remove_scope !== 'parts_only';
                              const materialStrike = isCoRemoved ? 'line-through text-red-400' : '';
                              const laborStrike = isFullRemoval ? 'line-through text-red-400' : '';

                              return (
                            <tr
                              key={item.id}
                              className={`border-t border-gray-700 hover:bg-gray-800/50 transition-colors h-10 relative ${
                                isCoRemoved ? 'bg-red-950/30 opacity-60' : ''
                              } ${
                                isCoAdded ? 'bg-emerald-950/30' : ''
                              } ${
                                isCoModified ? 'bg-amber-950/20' : ''
                              } ${
                                draggedItem === item.id ? 'opacity-50' : ''
                              } ${
                                dragOverItem === item.id ? 'border-t-2 border-blue-500 bg-blue-900/20' : ''
                              }`}
                              draggable={true}
                              onDragStart={(e) => handleDragStart(e, item.id)}
                              onDragOver={(e) => handleDragOver(e, item.id)}
                              onDragLeave={handleDragLeave}
                              onDrop={(e) => handleDrop(e, item.id, room.id)}
                              title={
                                isNested
                                  ? 'Drag to reorder with siblings or drag to top-level item to unnest'
                                  : hasChildren
                                  ? 'Drag to reorder'
                                  : 'Drag to reorder'
                              }
                            >
                              <td className="text-center py-2 px-2" style={{ paddingLeft: isNested ? '1rem' : undefined }}>
                                <div className="flex items-center justify-center gap-1">
                                  {hasChildren && (
                                    <button
                                      onClick={() => {
                                        const newCollapsed = new Set(collapsedParents);
                                        if (isCollapsed) {
                                          newCollapsed.delete(item.id);
                                        } else {
                                          newCollapsed.add(item.id);
                                        }
                                        setCollapsedParents(newCollapsed);
                                      }}
                                      className="text-cyan-400 hover:text-cyan-300 p-1 sm:p-0.5 -m-0.5"
                                      title={isCollapsed ? `Show ${childrenCount} nested items` : `Hide ${childrenCount} nested items`}
                                    >
                                      {isCollapsed ? <ChevronRight className="w-4 h-4 sm:w-3 sm:h-3" /> : <ChevronDown className="w-4 h-4 sm:w-3 sm:h-3" />}
                                    </button>
                                  )}
                                  {hasChildren && (
                                    <Layers className="w-4 h-4 sm:w-3 sm:h-3 text-cyan-400" title={`${childrenCount} nested accessories`} />
                                  )}
                                  {!hasChildren && (
                                    <div
                                      className="cursor-move text-gray-500 hover:text-gray-300"
                                      title={isNested ? "Drag to reorder with siblings or unnest" : "Drag to reorder"}
                                    >
                                      <GripVertical className="w-4 h-4 sm:w-3 sm:h-3" />
                                    </div>
                                  )}
                                  <input
                                    type="checkbox"
                                    checked={selectedItems.has(item.id)}
                                    onChange={(e) => {
                                      console.log('Checkbox onChange fired for item:', item.id, 'Checked:', e.target.checked);
                                      toggleItemSelection(item.id);
                                    }}
                                    className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-2 focus:ring-blue-500 cursor-pointer"
                                  />
                                </div>
                              </td>

                              {visibleColumns.has('manufacturer') && (
                                <td className="py-2 px-3 text-gray-400 whitespace-nowrap overflow-hidden text-ellipsis max-w-[150px]" title={item.products?.manufacturers?.name || '-'}>
                                  {item.products?.manufacturers?.name || '-'}
                                </td>
                              )}
                              {visibleColumns.has('sku') && (
                                <td
                                  className="py-2 px-3 text-cyan-400 whitespace-nowrap overflow-hidden text-ellipsis max-w-[120px] cursor-pointer hover:bg-gray-700 hover:text-cyan-300 transition-colors underline"
                                  title={`${item.products?.sku || '-'} (click to edit)`}
                                  onClick={() => setShowProductDetail(item.id)}
                                >
                                  {item.products?.sku || '-'}
                                </td>
                              )}
                              {visibleColumns.has('description') && (
                                <td
                                  className="py-2 px-3 text-white whitespace-nowrap overflow-hidden text-ellipsis max-w-[250px] cursor-pointer hover:bg-gray-700"
                                  title={isNested ? `Nested under: ${parentItem?.description || 'Unknown'}` : "Click to edit description"}
                                  onClick={() => startEditingItem(item.id, 'description', item.description)}
                                  style={{ paddingLeft: isNested ? '1.5rem' : undefined }}
                                >
                                  {editingItemId === item.id && editingValues[`${item.id}_description`] !== undefined && !isCoRemoved ? (
                                    <input
                                      type="text"
                                      value={editingValues[`${item.id}_description`]}
                                      onChange={(e) => handleEditChange(item.id, 'description', e.target.value)}
                                      onBlur={() => saveEdit(item.id, 'description')}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') saveEdit(item.id, 'description');
                                        if (e.key === 'Escape') cancelEdit();
                                      }}
                                      className="w-full bg-gray-600 text-white px-2 py-0.5 rounded focus:outline-none focus:ring-1 focus:ring-cyan-500"
                                      autoFocus
                                    />
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <span className={`${isNested && !isCoRemoved ? 'text-green-200 text-xs' : ''} ${materialStrike}`}>
                                        {isNested && !isCoRemoved && '↳ '}
                                        {item.description}
                                      </span>
                                      <QaDot
                                        hasMessages={messagesByContext[item.id] || false}
                                        unreadCount={unreadByContext[item.id] || 0}
                                        onClick={() => { setQaContext({ roomId: room.id, lineItemId: item.id, label: item.description }); setShowQA(true); }}
                                      />
                                      {isCoAdded && (
                                        <span className="text-[10px] font-bold px-1 py-0.5 rounded bg-emerald-800 text-emerald-300 shrink-0">NEW</span>
                                      )}
                                      {isCoModified && (
                                        <span className="text-[10px] font-bold px-1 py-0.5 rounded bg-amber-800 text-amber-300 shrink-0">MODIFIED</span>
                                      )}
                                      {isCoRemoved && (
                                        <span className="text-[10px] font-bold px-1 py-0.5 rounded bg-red-900/60 text-red-400 shrink-0">
                                          {isPartsOnlyRemoval ? '−PART ONLY' : '−REMOVED'}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </td>
                              )}
                              {visibleColumns.has('qty') && (
                                <td
                                  className={`py-2 px-3 text-right whitespace-nowrap cursor-pointer hover:bg-gray-700 ${materialStrike || 'text-gray-300'}`}
                                  onClick={() => startEditingItem(item.id, 'quantity', item.quantity)}
                                >
                                  {editingItemId === item.id && editingValues[`${item.id}_quantity`] !== undefined ? (
                                    <input
                                      type="number"
                                      value={editingValues[`${item.id}_quantity`]}
                                      onChange={(e) => handleEditChange(item.id, 'quantity', e.target.value)}
                                      onBlur={() => saveEdit(item.id, 'quantity')}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') saveEdit(item.id, 'quantity');
                                        if (e.key === 'Escape') cancelEdit();
                                      }}
                                      className="w-full bg-gray-600 text-white text-right px-1 py-0.5 rounded focus:outline-none focus:ring-1 focus:ring-cyan-500"
                                      autoFocus
                                      step="0.01"
                                    />
                                  ) : (
                                    item.quantity
                                  )}
                                </td>
                              )}
                              {visibleColumns.has('cost') && (
                                <td
                                  className={`py-2 px-3 text-right whitespace-nowrap cursor-pointer hover:bg-gray-700 ${materialStrike || 'text-gray-400'}`}
                                  onClick={() => startEditingItem(item.id, 'cost', item.cost || 0)}
                                >
                                  {editingItemId === item.id && editingValues[`${item.id}_cost`] !== undefined ? (
                                    <input
                                      type="number"
                                      value={editingValues[`${item.id}_cost`]}
                                      onChange={(e) => handleEditChange(item.id, 'cost', e.target.value)}
                                      onBlur={() => saveEdit(item.id, 'cost')}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') saveEdit(item.id, 'cost');
                                        if (e.key === 'Escape') cancelEdit();
                                      }}
                                      className="w-full bg-gray-600 text-white text-right px-1 py-0.5 rounded focus:outline-none focus:ring-1 focus:ring-cyan-500"
                                      autoFocus
                                      step="0.01"
                                    />
                                  ) : (
                                    formatCurrency(parseFloat(item.cost || 0))
                                  )}
                                </td>
                              )}
                              {visibleColumns.has('price') && (
                                <td
                                  className={`py-2 px-3 text-right whitespace-nowrap cursor-pointer hover:bg-gray-700 ${materialStrike || 'text-gray-300'}`}
                                  onClick={() => startEditingItem(item.id, 'unit_price', item.unit_price || 0)}
                                >
                                  {editingItemId === item.id && editingValues[`${item.id}_unit_price`] !== undefined ? (
                                    <input
                                      type="number"
                                      value={editingValues[`${item.id}_unit_price`]}
                                      onChange={(e) => handleEditChange(item.id, 'unit_price', e.target.value)}
                                      onBlur={() => saveEdit(item.id, 'unit_price')}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') saveEdit(item.id, 'unit_price');
                                        if (e.key === 'Escape') cancelEdit();
                                      }}
                                      className="w-full bg-gray-600 text-white text-right px-1 py-0.5 rounded focus:outline-none focus:ring-1 focus:ring-cyan-500"
                                      autoFocus
                                      step="0.01"
                                    />
                                  ) : (
                                    formatCurrency(parseFloat(item.unit_price || 0))
                                  )}
                                </td>
                              )}
                              {visibleColumns.has('laborPhase') && (
                                <td
                                  className={`py-2 px-3 whitespace-nowrap ${laborStrike || 'text-gray-400'}`}
                                >
                                  {isFullRemoval ? (
                                    <span className={laborStrike}>
                                      {laborPhases.find(p => p.id === item.labor_phase_id)?.name || '—'}
                                    </span>
                                  ) : (
                                    <select
                                      value={item.labor_phase_id || ''}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={async (e) => {
                                        e.stopPropagation();
                                        const newValue = e.target.value;

                                        const updates: any = {
                                          labor_phase_id: newValue || null
                                        };

                                        if (newValue) {
                                          const selectedPhase = laborPhases.find(phase => phase.id === newValue);
                                          if (selectedPhase && selectedPhase.default_rate) {
                                            updates.labor_rate = selectedPhase.default_rate;
                                          }
                                        }

                                        await updateLineItem(item.id, updates);
                                      }}
                                      className="w-full bg-gray-700 text-white px-1 py-0.5 rounded focus:outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer hover:bg-gray-600"
                                    >
                                      <option value="">None</option>
                                      {laborPhases.map(phase => (
                                        <option key={phase.id} value={phase.id}>{phase.name}</option>
                                      ))}
                                    </select>
                                  )}
                                </td>
                              )}
                              {visibleColumns.has('laborHrs') && (
                                <td
                                  className={`py-2 px-3 text-right whitespace-nowrap cursor-pointer hover:bg-gray-700 ${laborStrike || 'text-gray-400'}`}
                                  onClick={() => !isFullRemoval && startEditingItem(item.id, 'labor_hours', item.labor_hours || 0)}
                                >
                                  {editingItemId === item.id && editingValues[`${item.id}_labor_hours`] !== undefined && !isFullRemoval ? (
                                    <input
                                      type="number"
                                      value={editingValues[`${item.id}_labor_hours`]}
                                      onChange={(e) => handleEditChange(item.id, 'labor_hours', e.target.value)}
                                      onBlur={() => saveEdit(item.id, 'labor_hours')}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') saveEdit(item.id, 'labor_hours');
                                        if (e.key === 'Escape') cancelEdit();
                                      }}
                                      className="w-full bg-gray-600 text-white text-right px-1 py-0.5 rounded focus:outline-none focus:ring-1 focus:ring-cyan-500"
                                      autoFocus
                                      step="0.01"
                                    />
                                  ) : (
                                    parseFloat(item.labor_hours || 0).toFixed(2)
                                  )}
                                </td>
                              )}
                              {visibleColumns.has('laborRate') && (
                                <td
                                  className={`py-2 px-3 text-right whitespace-nowrap cursor-pointer hover:bg-gray-700 ${laborStrike || 'text-gray-400'}`}
                                  onClick={() => !isFullRemoval && startEditingItem(item.id, 'labor_rate', item.labor_rate || 0)}
                                >
                                  {editingItemId === item.id && editingValues[`${item.id}_labor_rate`] !== undefined && !isFullRemoval ? (
                                    <input
                                      type="number"
                                      value={editingValues[`${item.id}_labor_rate`]}
                                      onChange={(e) => handleEditChange(item.id, 'labor_rate', e.target.value)}
                                      onBlur={() => saveEdit(item.id, 'labor_rate')}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') saveEdit(item.id, 'labor_rate');
                                        if (e.key === 'Escape') cancelEdit();
                                      }}
                                      className="w-full bg-gray-600 text-white text-right px-1 py-0.5 rounded focus:outline-none focus:ring-1 focus:ring-cyan-500"
                                      autoFocus
                                      step="0.01"
                                    />
                                  ) : (
                                    formatCurrency(parseFloat(item.labor_rate || 0))
                                  )}
                                </td>
                              )}
                              {visibleColumns.has('laborTotal') && (
                                <td className={`py-2 px-3 text-right whitespace-nowrap ${laborStrike || 'text-gray-300'}`}>
                                  ${parseFloat(item.labor_total || 0).toFixed(2)}
                                </td>
                              )}
                              {visibleColumns.has('partsTax') && (
                                <td className={`py-2 px-3 text-right whitespace-nowrap ${materialStrike || 'text-green-400'}`}>
                                  ${calculateItemTax(item, proposal).partsTax.toFixed(2)}
                                </td>
                              )}
                              {visibleColumns.has('laborTax') && (
                                <td className={`py-2 px-3 text-right whitespace-nowrap ${laborStrike || 'text-green-400'}`}>
                                  ${calculateItemTax(item, proposal).laborTax.toFixed(2)}
                                </td>
                              )}
                              {visibleColumns.has('lineTotal') && (
                                <td className={`py-2 px-3 text-right font-medium whitespace-nowrap ${isCoRemoved ? 'line-through text-red-400' : 'text-white'}`}>
                                  {isCoRemoved ? (() => {
                                    const materialTotal = parseFloat(item.unit_price || 0) * item.quantity;
                                    const laborTotal = parseFloat(item.labor_total || 0);
                                    const negativeAmt = isPartsOnlyRemoval ? materialTotal : (materialTotal + laborTotal);
                                    return `−${formatCurrency(negativeAmt)}`;
                                  })() : (() => {
                                    const materialTotal = parseFloat(item.unit_price || 0) * item.quantity;
                                    const laborTotal = parseFloat(item.labor_total || 0);
                                    let displayTotal = materialTotal + laborTotal;
                                    if (hasChildren) {
                                      const nestedChildren = room.line_items.filter(nested => nested.parent_item_id === item.id);
                                      const nestedMaterial = nestedChildren.reduce((sum, n) => sum + (parseFloat(n.unit_price || 0) * n.quantity), 0);
                                      const nestedLabor = nestedChildren.reduce((sum, n) => sum + parseFloat(n.labor_total || 0), 0);
                                      displayTotal += nestedMaterial + nestedLabor;
                                    }
                                    return formatCurrency(displayTotal);
                                  })()}
                                </td>
                              )}
                              <td className="py-2 px-3 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  {isCoRemoved ? (
                                    <button
                                      onClick={() => handleRestoreItem(item.id)}
                                      disabled={restoringItemId === item.id}
                                      className="p-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300 rounded hover:bg-emerald-900/40 disabled:opacity-50"
                                      title="Restore item (undo removal)"
                                    >
                                      {restoringItemId === item.id ? '...' : 'Restore'}
                                    </button>
                                  ) : (
                                    <>
                                      <button
                                        onClick={() => setEditingLaborItem({
                                          id: item.id,
                                          description: item.description || '',
                                          productId: item.product_id || null
                                        })}
                                        className={`p-1 rounded transition-colors ${item.task_completed ? 'text-orange-400 hover:text-orange-300' : 'text-gray-500 hover:text-orange-400'}`}
                                        title="Task & Tech Notes"
                                      >
                                        <Wrench className="w-3 h-3" />
                                      </button>
                                      <button
                                        onClick={() => setSubstituteItemId(item.id)}
                                        className="p-1 text-gray-400 hover:text-blue-400 rounded"
                                        title="Substitute Item"
                                      >
                                        <RefreshCw className="w-3 h-3" />
                                      </button>
                                      <button
                                        onClick={() => handleDeleteItem(item.id)}
                                        className="p-1 text-gray-400 hover:text-red-400 rounded"
                                        title={isCoMode ? 'Remove from Change Order' : 'Delete'}
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                              );
                            })
                        )}
                      </React.Fragment>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      </div>

      {/* Footer - Pricing Summary */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700 z-50 pb-safe" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0px)' }}>
        {/* Collapsed View */}
        {!pricingExpanded && (
          <button
            onClick={() => setPricingExpanded(true)}
            className="w-full px-2 sm:px-4 py-2 flex items-center justify-between hover:bg-gray-750 transition-colors group"
          >
            <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm">
              <span className="text-gray-400">Subtotal: <span className="text-white font-medium">{formatCurrency(pricing.subtotal)}</span></span>
              <span className="text-gray-400 hidden sm:inline">Tax: <span className="text-white font-medium">{formatCurrency(pricing.taxAmount)}</span></span>
              {isCoMode && (() => {
                const nonModifierItems = coLineItems.filter(c => c.action_type !== 'modify_modifiers');
                const coDelta = nonModifierItems.reduce((sum, c) => sum + (c.change_amount || 0), 0);
                const hasModifierAdj = coLineItems.some(r => r.action_type === 'modify_modifiers' && r.modifier_adjustments && r.modifier_adjustments.length > 0);
                if (coLineItems.length === 0 && !hasModifierAdj) return null;
                return (
                  <span className={`font-semibold ${coDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    CO: {coDelta >= 0 ? '+' : ''}{formatCurrency(coDelta)}
                    {hasModifierAdj && <span className="ml-1 text-amber-400 text-[10px]">+modifiers</span>}
                  </span>
                );
              })()}
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="text-right">
                <div className="text-cyan-400 text-base sm:text-xl font-bold">{formatCurrency(pricing.total)}</div>
              </div>
              <ChevronUp className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" />
            </div>
          </button>
        )}

        {/* Expanded View */}
        {pricingExpanded && (
          <div className="px-2 sm:px-4 py-3 max-h-[60vh] overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-semibold text-sm sm:text-base">Pricing Details</h3>
              <div className="flex items-center gap-1 sm:gap-2">
                <button
                  onClick={() => setShowModifiersModal(true)}
                  className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-1 bg-gray-700 text-gray-300 rounded hover:bg-gray-600 hover:text-white transition-colors"
                >
                  Edit Modifiers
                </button>
                <button
                  onClick={() => setPricingExpanded(false)}
                  className="text-gray-400 hover:text-white transition-colors p-1"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="space-y-2 text-xs sm:text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Materials:</span>
                <span className="text-white font-medium">{formatCurrency(pricing.totalMaterials)}</span>
              </div>
              <div>
                <button
                  onClick={() => setLaborHoursExpanded(!laborHoursExpanded)}
                  className="w-full flex justify-between hover:bg-gray-750 rounded px-1 py-0.5 transition-colors"
                >
                  <span className="text-gray-400 flex items-center gap-1">
                    Labor:
                    {pricing.totalLaborHours > 0 && (
                      <span className="text-[10px] text-cyan-500">
                        ({pricing.totalLaborHours.toFixed(1)} hrs)
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium">{formatCurrency(pricing.totalLabor)}</span>
                    {pricing.totalLaborHours > 0 && (
                      <ChevronRight className={`w-3 h-3 text-gray-500 transition-transform ${laborHoursExpanded ? 'rotate-90' : ''}`} />
                    )}
                  </div>
                </button>
                {laborHoursExpanded && pricing.laborHoursByPhase && pricing.laborHoursByPhase.length > 0 && (
                  <div className="ml-4 mt-1 space-y-1 border-l-2 border-gray-700 pl-3">
                    {pricing.laborHoursByPhase.map((phase, index) => (
                      <div key={index} className="flex justify-between text-[11px]">
                        <span className="text-gray-500">{phase.name}:</span>
                        <span className="text-gray-400">{phase.hours.toFixed(1)} hrs</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex justify-between pt-2 border-t border-gray-700">
                <span className="text-gray-400">Subtotal:</span>
                <span className="text-white font-medium">{formatCurrency(pricing.subtotal)}</span>
              </div>

              {/* Modifiers Section */}
              {(pricing.discountAmount !== 0 || pricing.pmAmount !== 0 || pricing.designAmount !== 0 || pricing.systemDesignAmount !== 0 || pricing.ccFeeAmount !== 0 || pricing.miscPartsAmount !== 0 || pricing.custom1Amount !== 0 || pricing.custom2Amount !== 0) && (
                <div className="pt-2 border-t border-gray-700 space-y-2">
                  <div className="text-xs text-gray-500 font-semibold uppercase">Adjustments</div>

                  {pricing.discountAmount !== 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Discount ({pricing.discountPercent}%):</span>
                      <span className="text-red-400 font-medium">-${Math.abs(pricing.discountAmount).toFixed(2)}</span>
                    </div>
                  )}

                  {pricing.pmAmount !== 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Project Management ({pricing.pmPercent}%):</span>
                      <span className="text-green-400 font-medium">{formatCurrency(pricing.pmAmount)}</span>
                    </div>
                  )}

                  {pricing.designAmount !== 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Project Design ({pricing.designPercent}%):</span>
                      <span className="text-green-400 font-medium">{formatCurrency(pricing.designAmount)}</span>
                    </div>
                  )}

                  {pricing.systemDesignAmount !== 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">System Design ({pricing.systemDesignPercent}%):</span>
                      <span className="text-green-400 font-medium">{formatCurrency(pricing.systemDesignAmount)}</span>
                    </div>
                  )}

                  {pricing.ccFeeAmount !== 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Credit Card Fee ({pricing.ccFeePercent}%):</span>
                      <span className="text-green-400 font-medium">{formatCurrency(pricing.ccFeeAmount)}</span>
                    </div>
                  )}

                  {pricing.miscPartsAmount !== 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Misc Parts ({pricing.miscPartsPercent}%):</span>
                      <span className="text-green-400 font-medium">{formatCurrency(pricing.miscPartsAmount)}</span>
                    </div>
                  )}

                  {pricing.custom1Amount !== 0 && pricing.custom1Label && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">{pricing.custom1Label} ({pricing.custom1Percent}%):</span>
                      <span className={`font-medium ${pricing.custom1Amount < 0 ? 'text-red-400' : 'text-green-400'}`}>
                        {pricing.custom1Amount < 0 ? '-' : ''}${Math.abs(pricing.custom1Amount).toFixed(2)}
                      </span>
                    </div>
                  )}

                  {pricing.custom2Amount !== 0 && pricing.custom2Label && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">{pricing.custom2Label} ({pricing.custom2Percent}%):</span>
                      <span className={`font-medium ${pricing.custom2Amount < 0 ? 'text-red-400' : 'text-green-400'}`}>
                        {pricing.custom2Amount < 0 ? '-' : ''}${Math.abs(pricing.custom2Amount).toFixed(2)}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between pt-1 border-t border-gray-600">
                    <span className="text-gray-400">Adjusted Subtotal:</span>
                    <span className="text-white font-medium">{formatCurrency(pricing.adjustedSubtotal)}</span>
                  </div>
                </div>
              )}

              {isCoMode && (() => {
                const modifierRecord = coLineItems.find(r => r.action_type === 'modify_modifiers');
                const adjustments = modifierRecord?.modifier_adjustments;
                if (!adjustments || adjustments.length === 0) return null;
                return (
                  <div className="pt-2 border-t border-amber-700/50 space-y-1.5">
                    <div className="text-xs text-amber-400 font-semibold uppercase tracking-wide flex items-center gap-1.5">
                      <Activity className="w-3 h-3" />
                      Modifier Adjustments:
                    </div>
                    {adjustments.map((adj, i) => {
                      const wasOff = adj.old_value === 0;
                      const isOff = adj.new_value === 0;
                      return (
                        <div key={i} className="flex justify-between items-center text-xs">
                          <span className="text-gray-400">{adj.label}:</span>
                          <span className="font-medium tabular-nums">
                            {wasOff ? (
                              <span className="text-gray-500 line-through">off</span>
                            ) : (
                              <span className="text-gray-400">{adj.old_value}%</span>
                            )}
                            <span className="text-gray-500 mx-1">→</span>
                            {isOff ? (
                              <span className="text-red-400">off</span>
                            ) : (
                              <span className={adj.new_value > adj.old_value ? 'text-amber-300' : 'text-emerald-400'}>{adj.new_value}%</span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              <div className="flex justify-between pt-2 border-t border-gray-700">
                <span className="text-gray-400">Tax ({pricing.taxRate}%):</span>
                <span className="text-white font-medium">{formatCurrency(pricing.taxAmount)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-gray-700">
                <span className="text-white font-semibold">Total:</span>
                <div className="text-right">
                  <div className="text-cyan-400 text-xl font-bold">{formatCurrency(pricing.total)}</div>
                  {(() => {
                    // Calculate total cost from all line items
                    let lineItemsCost = 0;
                    rooms.forEach(room => {
                      room.line_items.forEach(item => {
                        const itemCost = (parseFloat(item.cost || 0) * item.quantity) + (parseFloat(item.labor_cost || 0) * parseFloat(item.labor_hours || 0));
                        lineItemsCost += itemCost;
                      });
                    });

                    // Add cost of modifiers (assuming 50% margin on all positive modifiers)
                    const modifiersCost = (
                      Math.max(0, pricing.pmAmount || 0) +
                      Math.max(0, pricing.designAmount || 0) +
                      Math.max(0, pricing.systemDesignAmount || 0) +
                      Math.max(0, pricing.ccFeeAmount || 0) +
                      Math.max(0, pricing.miscPartsAmount || 0) +
                      Math.max(0, pricing.custom1Amount || 0) +
                      Math.max(0, pricing.custom2Amount || 0)
                    ) * 0.5;

                    const totalCost = lineItemsCost + modifiersCost;
                    const profitMargin = pricing.total > 0 ? ((pricing.total - totalCost) / pricing.total) * 100 : 0;

                    return (
                      <div className={`text-xs mt-0.5 ${profitMargin >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {profitMargin.toFixed(1)}% margin
                      </div>
                    );
                  })()}
                </div>
              </div>
              {pricing.depositAmount > 0 && (
                <>
                  <div className="flex justify-between pt-2 border-t border-gray-700">
                    <span className="text-gray-400">
                      Deposit {pricing.depositPercent > 0 ? `(${pricing.depositPercent}%)` : ''}:
                    </span>
                    <span className="text-yellow-400 font-medium">{formatCurrency(pricing.depositAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Balance Due:</span>
                    <span className="text-white font-medium">${(pricing.total - pricing.depositAmount).toFixed(2)}</span>
                  </div>
                </>
              )}

            </div>
          </div>
        )}
      </div>

      {/* CO Removal Scope Modal */}
      {pendingCORemoval && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="px-5 pt-5 pb-4 border-b border-gray-700">
              <h3 className="text-base font-semibold text-white">Remove from Change Order</h3>
              <p className="text-sm text-gray-400 mt-1 line-clamp-2">{pendingCORemoval.item.description}</p>
            </div>
            <div className="p-5 space-y-3">
              {pendingCORemoval.hasLabor ? (
                <>
                  <button
                    onClick={() => executeCORemoval('parts_only')}
                    className="w-full flex items-start gap-3 p-3 rounded-lg border border-gray-700 hover:border-orange-500/60 hover:bg-orange-950/20 transition-colors text-left group"
                  >
                    <div className="mt-0.5 w-4 h-4 rounded-full border-2 border-orange-500/60 group-hover:border-orange-400 shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-white">Remove Part Only</div>
                      <div className="text-xs text-gray-400 mt-0.5">Removes the part cost. Labor remains billable.</div>
                    </div>
                  </button>
                  <button
                    onClick={() => executeCORemoval('parts_and_labor')}
                    className="w-full flex items-start gap-3 p-3 rounded-lg border border-gray-700 hover:border-red-500/60 hover:bg-red-950/20 transition-colors text-left group"
                  >
                    <div className="mt-0.5 w-4 h-4 rounded-full border-2 border-red-500/60 group-hover:border-red-400 shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-white">Remove Part + Labor</div>
                      <div className="text-xs text-gray-400 mt-0.5">Removes both part and labor cost from scope.</div>
                    </div>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => executeCORemoval('parts_and_labor')}
                  className="w-full flex items-start gap-3 p-3 rounded-lg border border-red-700/40 bg-red-950/20 hover:bg-red-950/40 transition-colors text-left"
                >
                  <div className="mt-0.5 w-4 h-4 rounded-full border-2 border-red-500/60 shrink-0" />
                  <div>
                    <div className="text-sm font-medium text-white">Remove from Scope</div>
                    <div className="text-xs text-gray-400 mt-0.5">This item will be tracked as removed in this change order.</div>
                  </div>
                </button>
              )}
            </div>
            <div className="px-5 pb-5">
              <button
                onClick={() => setPendingCORemoval(null)}
                className="w-full py-2 text-sm text-gray-400 hover:text-white rounded-lg border border-gray-700 hover:border-gray-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk CO Removal Scope Modal */}
      {pendingBulkCORemoval && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[80vh]">
            <div className="px-5 pt-5 pb-4 border-b border-gray-700 shrink-0">
              <h3 className="text-base font-semibold text-white">Remove Items from Change Order</h3>
              <p className="text-sm text-gray-400 mt-1">
                {pendingBulkCORemoval.length} item{pendingBulkCORemoval.length !== 1 ? 's' : ''} will be removed. For items with labor, choose what to remove.
              </p>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-3 space-y-2">
              {pendingBulkCORemoval.map((entry) => (
                <div key={entry.itemId} className="rounded-lg border border-gray-700 bg-gray-800/50 p-3">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white leading-snug truncate">{entry.item.description}</p>
                      {entry.roomName && (
                        <p className="text-xs text-gray-500 mt-0.5">{entry.roomName}</p>
                      )}
                    </div>
                    {!entry.hasLabor && (
                      <span className="shrink-0 text-xs bg-red-950/50 text-red-400 border border-red-800/50 rounded px-2 py-0.5">Remove</span>
                    )}
                  </div>

                  {entry.hasLabor ? (
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => setBulkCORemovalScopes(prev => ({ ...prev, [entry.itemId]: 'parts_only' }))}
                        className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium border transition-colors ${
                          bulkCORemovalScopes[entry.itemId] === 'parts_only'
                            ? 'bg-orange-500/20 border-orange-500/60 text-orange-300'
                            : 'bg-gray-700/50 border-gray-600 text-gray-400 hover:border-orange-500/40 hover:text-orange-400'
                        }`}
                      >
                        Part Only
                      </button>
                      <button
                        onClick={() => setBulkCORemovalScopes(prev => ({ ...prev, [entry.itemId]: 'parts_and_labor' }))}
                        className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium border transition-colors ${
                          bulkCORemovalScopes[entry.itemId] === 'parts_and_labor'
                            ? 'bg-red-500/20 border-red-500/60 text-red-300'
                            : 'bg-gray-700/50 border-gray-600 text-gray-400 hover:border-red-500/40 hover:text-red-400'
                        }`}
                      >
                        Part + Labor
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500 mt-1">No labor attached — item will be fully removed from scope.</p>
                  )}
                </div>
              ))}
            </div>

            <div className="px-5 py-4 border-t border-gray-700 shrink-0 flex gap-3">
              <button
                onClick={() => { setPendingBulkCORemoval(null); setBulkCORemovalScopes({}); }}
                disabled={executingBulkRemoval}
                className="flex-1 py-2 text-sm text-gray-400 hover:text-white rounded-lg border border-gray-700 hover:border-gray-600 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={executeBulkCORemoval}
                disabled={executingBulkRemoval}
                className="flex-1 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {executingBulkRemoval ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Removing...
                  </>
                ) : (
                  `Confirm Removal (${pendingBulkCORemoval.length})`
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {showAddItemToAreasModal && (
        <AddItemToAreasModal
          proposalId={proposalId}
          rooms={rooms}
          activeAreaId={activeAreaId && activeAreaId !== '__unassigned__' ? activeAreaId : undefined}
          onClose={() => setShowAddItemToAreasModal(false)}
          onItemsAdded={async () => {
            setShowAddItemToAreasModal(false);
            if (isCoMode && changeOrderId) {
              const existingIds = new Set(rooms.flatMap(r => r.line_items.map(i => i.id)));
              const freshRooms = await loadData();
              const freshRecords = await loadCOLineItems(changeOrderId);
              const allItemsAfter = freshRooms.flatMap(r =>
                r.line_items.map(item => ({ ...item, roomName: r.name }))
              );
              for (const item of allItemsAfter) {
                if (!existingIds.has(item.id)) {
                  await recordCOAction(changeOrderId, item.id, 'add', {
                    description: (item as any).description,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    line_total: item.line_total,
                    labor_total: (item as any).labor_total ?? 0,
                    item_type: (item as any).item_type || 'material',
                    is_taxable: (item as any).is_taxable ?? true,
                  }, (item as any).roomName || '', freshRecords);
                }
              }
              await updateCOTotals(changeOrderId, onCORefresh);
              await refreshCOLineItems();
            } else {
              loadData();
            }
          }}
          onRoomsUpdate={(updatedRooms) => {
            setRooms(prev => updatedRooms.map(r => {
              const existing = prev.find(p => p.id === r.id);
              return existing ?? { ...r, line_items: [] };
            }));
          }}
        />
      )}

      {showRevisionManager && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <ProposalRevisionManager
            proposalId={proposalId}
            onSelectRevision={(revisionId) => {
              setShowRevisionManager(false);
              if (onProposalIdChange) {
                onProposalIdChange(revisionId);
              } else if (isStandalone) {
                window.location.href = `/proposals?id=${revisionId}`;
              }
            }}
            onPromoteToLive={(revisionId) => {
              // Switch to the revision first, then show promote modal
              if (onProposalIdChange) {
                onProposalIdChange(revisionId);
              }
              setShowPromoteRevisionModal(true);
            }}
            onClose={() => setShowRevisionManager(false)}
          />
        </div>
      )}

      {showModifiersModal && (
        <PricingModifiersModal
          proposal={isCoMode ? (coRecord || proposalSettings || {}) : (proposalSettings || {})}
          showApplyToggles={isCoMode}
          onClose={() => setShowModifiersModal(false)}
          onSave={async (modifiers) => {
            try {
              if (isCoMode && changeOrderId) {
                const oldSnapshot: COModifierSnapshot = {
                  discount_percent: coRecord?.discount_percent ?? 0,
                  project_management_percent: coRecord?.project_management_percent ?? 0,
                  project_design_percent: coRecord?.project_design_percent ?? 0,
                  system_design_percent: coRecord?.system_design_percent ?? 0,
                  credit_card_fee_percent: coRecord?.credit_card_fee_percent ?? 0,
                  misc_parts_percent: coRecord?.misc_parts_percent ?? 0,
                  custom_modifier_1_percent: coRecord?.custom_modifier_1_percent ?? 0,
                  custom_modifier_2_percent: coRecord?.custom_modifier_2_percent ?? 0,
                  custom_modifier_1_label: coRecord?.custom_modifier_1_label ?? null,
                  custom_modifier_2_label: coRecord?.custom_modifier_2_label ?? null,
                  apply_discount: coRecord?.apply_discount ?? false,
                  apply_project_management: coRecord?.apply_project_management ?? false,
                  apply_project_design: coRecord?.apply_project_design ?? false,
                  apply_system_design: coRecord?.apply_system_design ?? false,
                  apply_credit_card_fee: coRecord?.apply_credit_card_fee ?? false,
                  apply_misc_parts: coRecord?.apply_misc_parts ?? false,
                  apply_custom_modifier_1: coRecord?.apply_custom_modifier_1 ?? false,
                  apply_custom_modifier_2: coRecord?.apply_custom_modifier_2 ?? false,
                };
                const newSnapshot: COModifierSnapshot = {
                  discount_percent: modifiers.discount_percent ?? 0,
                  project_management_percent: modifiers.project_management_percent ?? 0,
                  project_design_percent: modifiers.project_design_percent ?? 0,
                  system_design_percent: modifiers.system_design_percent ?? 0,
                  credit_card_fee_percent: modifiers.credit_card_fee_percent ?? 0,
                  misc_parts_percent: modifiers.misc_parts_percent ?? 0,
                  custom_modifier_1_percent: modifiers.custom_modifier_1_percent ?? 0,
                  custom_modifier_2_percent: modifiers.custom_modifier_2_percent ?? 0,
                  custom_modifier_1_label: modifiers.custom_modifier_1_label ?? null,
                  custom_modifier_2_label: modifiers.custom_modifier_2_label ?? null,
                  apply_discount: modifiers.apply_discount ?? false,
                  apply_project_management: modifiers.apply_project_management ?? false,
                  apply_project_design: modifiers.apply_project_design ?? false,
                  apply_system_design: modifiers.apply_system_design ?? false,
                  apply_credit_card_fee: modifiers.apply_credit_card_fee ?? false,
                  apply_misc_parts: modifiers.apply_misc_parts ?? false,
                  apply_custom_modifier_1: modifiers.apply_custom_modifier_1 ?? false,
                  apply_custom_modifier_2: modifiers.apply_custom_modifier_2 ?? false,
                };

                const { error: coError } = await supabase
                  .from('change_orders')
                  .update({
                    discount_percent: newSnapshot.discount_percent,
                    project_management_percent: newSnapshot.project_management_percent,
                    project_design_percent: newSnapshot.project_design_percent,
                    system_design_percent: newSnapshot.system_design_percent,
                    credit_card_fee_percent: newSnapshot.credit_card_fee_percent,
                    misc_parts_percent: newSnapshot.misc_parts_percent,
                    custom_modifier_1_percent: newSnapshot.custom_modifier_1_percent,
                    custom_modifier_2_percent: newSnapshot.custom_modifier_2_percent,
                    custom_modifier_1_label: newSnapshot.custom_modifier_1_label,
                    custom_modifier_2_label: newSnapshot.custom_modifier_2_label,
                    apply_discount: newSnapshot.apply_discount,
                    apply_project_management: newSnapshot.apply_project_management,
                    apply_project_design: newSnapshot.apply_project_design,
                    apply_system_design: newSnapshot.apply_system_design,
                    apply_credit_card_fee: newSnapshot.apply_credit_card_fee,
                    apply_misc_parts: newSnapshot.apply_misc_parts,
                    apply_custom_modifier_1: newSnapshot.apply_custom_modifier_1,
                    apply_custom_modifier_2: newSnapshot.apply_custom_modifier_2,
                  })
                  .eq('id', changeOrderId);

                if (coError) throw coError;

                const freshItems = await loadCOLineItems(changeOrderId);
                await recordCOModifierChange(changeOrderId, oldSnapshot, newSnapshot, freshItems);
                await updateCOTotals(changeOrderId, onCORefresh);

                await loadCORecord();
                await refreshCOLineItems();
                setShowModifiersModal(false);
                loadData();
              } else {
                if (!proposalSettings) {
                  const { error } = await supabase
                    .from('proposal_settings')
                    .insert({
                      proposal_id: proposalId,
                      ...modifiers
                    });
                  if (error) throw error;
                } else {
                  const { error } = await supabase
                    .from('proposal_settings')
                    .update(modifiers)
                    .eq('proposal_id', proposalId);
                  if (error) throw error;
                }
                setShowModifiersModal(false);
                loadData();
              }
            } catch (error) {
              console.error('Error updating modifiers:', error);
              alert('Failed to update modifiers');
            }
          }}
        />
      )}

      {showSettings && (
        <div className="fixed inset-0 z-50">
          <ProposalSettings
            proposalId={proposalId}
            initialTab={activeSettingsTab}
            onBack={() => {
              setShowSettings(false);
              setActiveSettingsTab('details');
              loadData();
              loadColumnPreferences();
            }}
          />
        </div>
      )}

      {showTaxReport && (
        <ProposalTaxReport
          proposalId={proposalId}
          onClose={() => setShowTaxReport(false)}
        />
      )}

      {showLaborPhaseReport && (
        <LaborPhaseReport
          proposalId={proposalId}
          proposalNumber={proposal?.proposal_number}
          customerName={proposal?.contacts?.full_name || proposal?.contacts?.company_name || undefined}
          rooms={rooms}
          onClose={() => setShowLaborPhaseReport(false)}
        />
      )}

      {showFilterModal && (
        <FilterModal
          onClose={() => setShowFilterModal(false)}
          filters={filters}
          onApply={setFilters}
          rooms={rooms}
          uniquePhases={uniquePhases}
          uniqueManufacturers={uniqueManufacturers}
        />
      )}

      {editingScopeRoom && (
        <AreaScopeEditor
          roomId={editingScopeRoom.id}
          roomName={editingScopeRoom.name}
          currentDescription={editingScopeRoom.description}
          currentShowScope={editingScopeRoom.showScope}
          onClose={() => setEditingScopeRoom(null)}
          onSave={async () => {
            await loadData();
            setEditingScopeRoom(null);
          }}
        />
      )}

      {editingLaborItem && (
        <TwoPhaseLaborEditor
          lineItemId={editingLaborItem.id}
          itemDescription={editingLaborItem.description}
          productId={editingLaborItem.productId}
          proposalId={proposalId}
          onClose={() => setEditingLaborItem(null)}
          onSave={() => {
            setEditingLaborItem(null);
            loadData();
          }}
        />
      )}

      {/* PDF Generation Modal */}
      {showPdfModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between sticky top-0 bg-gray-800 z-10">
              <h3 className="text-lg font-semibold text-white">Generate Proposal Report</h3>
              <button
                onClick={() => setShowPdfModal(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-3">
                  Select Report Template
                </label>
                <div className="space-y-2">
                  {pdfTemplates.map((template) => (
                    <div
                      key={template.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                        selectedTemplateId === template.id
                          ? 'bg-blue-900 bg-opacity-30 border-blue-500'
                          : 'bg-gray-700 border-gray-600'
                      }`}
                    >
                      <label className="flex items-start gap-3 flex-1 min-w-0 cursor-pointer">
                        <input
                          type="radio"
                          name="template"
                          value={template.id}
                          checked={selectedTemplateId === template.id}
                          onChange={(e) => {
                            setSelectedTemplateId(e.target.value);
                            applyTemplateSettings(template);
                          }}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white">{template.name}</span>
                            {template.is_default && (
                              <span className="px-1.5 py-0.5 bg-yellow-900 text-yellow-200 text-xs font-medium rounded">
                                Default
                              </span>
                            )}
                            {template.created_by === profile?.id && (
                              <span className="px-1.5 py-0.5 bg-blue-900 text-blue-200 text-xs font-medium rounded">
                                Personal
                              </span>
                            )}
                          </div>
                          {template.description && (
                            <p className="text-sm text-gray-400 mt-1">{template.description}</p>
                          )}
                        </div>
                      </label>
                      {template.created_by === profile?.id && (
                        <button
                          onClick={() => {
                            setSelectedTemplateId(template.id);
                            applyTemplateSettings(template);
                            setShowSaveTemplateModal(true);
                          }}
                          className="flex-shrink-0 p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-900 hover:bg-opacity-30 rounded transition-colors"
                          title="Edit this template"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  {pdfTemplates.length === 0 && (
                    <div className="text-center py-8 text-gray-400">
                      <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">No report templates available</p>
                      <p className="text-xs mt-1">Create your first template below</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-gray-700 pt-6">
                <h4 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  Display Options
                </h4>
                <p className="text-xs text-gray-400 mb-4">
                  Control what appears in this printed proposal (independent of screen settings)
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="flex items-start gap-3 p-3 rounded-lg bg-gray-700 border border-gray-600 hover:bg-gray-650 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={pdfDisplayOptions.showRoomScope}
                      onChange={(e) => setPdfDisplayOptions(prev => ({
                        ...prev,
                        showRoomScope: e.target.checked
                      }))}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-white">Area Scope of Work</div>
                      <div className="text-xs text-gray-400 mt-0.5">Show scope descriptions per area/room</div>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3 rounded-lg bg-gray-700 border border-gray-600 hover:bg-gray-650 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={pdfDisplayOptions.showProposalNotes}
                      onChange={(e) => setPdfDisplayOptions(prev => ({
                        ...prev,
                        showProposalNotes: e.target.checked
                      }))}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-white">Proposal Notes</div>
                      <div className="text-xs text-gray-400 mt-0.5">Show general proposal notes</div>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3 rounded-lg bg-gray-700 border border-gray-600 hover:bg-gray-650 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={pdfDisplayOptions.showModifiers}
                      onChange={(e) => setPdfDisplayOptions(prev => ({
                        ...prev,
                        showModifiers: e.target.checked
                      }))}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-white">Pricing Modifiers</div>
                      <div className="text-xs text-gray-400 mt-0.5">Show discount, fees, adjustments</div>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3 rounded-lg bg-gray-700 border border-gray-600 hover:bg-gray-650 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={pdfDisplayOptions.showDeposit}
                      onChange={(e) => setPdfDisplayOptions(prev => ({
                        ...prev,
                        showDeposit: e.target.checked
                      }))}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-white">Deposit & Payment Information</div>
                      <div className="text-xs text-gray-400 mt-0.5">Show deposit requirements and accepted payment methods</div>
                    </div>
                  </label>
                </div>

                <div className="border-t border-gray-700 pt-4 mt-4">
                  <h5 className="text-xs font-semibold text-gray-300 mb-3 uppercase tracking-wide">Pricing & Item Details</h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="flex items-start gap-3 p-3 rounded-lg bg-gray-700 border border-gray-600 hover:bg-gray-650 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={pdfDisplayOptions.showDescription}
                        onChange={(e) => setPdfDisplayOptions(prev => ({
                          ...prev,
                          showDescription: e.target.checked
                        }))}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-white">Item Description</div>
                        <div className="text-xs text-gray-400 mt-0.5">Show item description column</div>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 p-3 rounded-lg bg-gray-700 border border-gray-600 hover:bg-gray-650 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={pdfDisplayOptions.showUnitPrice}
                        onChange={(e) => setPdfDisplayOptions(prev => ({
                          ...prev,
                          showUnitPrice: e.target.checked
                        }))}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-white">Unit Price</div>
                        <div className="text-xs text-gray-400 mt-0.5">Show price per unit column</div>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 p-3 rounded-lg bg-gray-700 border border-gray-600 hover:bg-gray-650 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={pdfDisplayOptions.showLinePrice}
                        onChange={(e) => setPdfDisplayOptions(prev => ({
                          ...prev,
                          showLinePrice: e.target.checked
                        }))}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-white">Line Price</div>
                        <div className="text-xs text-gray-400 mt-0.5">Show line total price column</div>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 p-3 rounded-lg bg-gray-700 border border-gray-600 hover:bg-gray-650 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={pdfDisplayOptions.showSKU}
                        onChange={(e) => setPdfDisplayOptions(prev => ({
                          ...prev,
                          showSKU: e.target.checked
                        }))}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-white">SKU / Model</div>
                        <div className="text-xs text-gray-400 mt-0.5">Show product SKU/model number</div>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 p-3 rounded-lg bg-gray-700 border border-gray-600 hover:bg-gray-650 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={pdfDisplayOptions.showManufacturer}
                        onChange={(e) => setPdfDisplayOptions(prev => ({
                          ...prev,
                          showManufacturer: e.target.checked
                        }))}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-white">Manufacturer</div>
                        <div className="text-xs text-gray-400 mt-0.5">Show manufacturer/brand name</div>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 p-3 rounded-lg bg-gray-700 border border-gray-600 hover:bg-gray-650 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={pdfDisplayOptions.showColor}
                        onChange={(e) => setPdfDisplayOptions(prev => ({
                          ...prev,
                          showColor: e.target.checked
                        }))}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-white">Color / Finish</div>
                        <div className="text-xs text-gray-400 mt-0.5">Show item color or finish</div>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 p-3 rounded-lg bg-gray-700 border border-gray-600 hover:bg-gray-650 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={pdfDisplayOptions.showSalesTax}
                        onChange={(e) => setPdfDisplayOptions(prev => ({
                          ...prev,
                          showSalesTax: e.target.checked
                        }))}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-white">Sales Tax</div>
                        <div className="text-xs text-gray-400 mt-0.5">Show sales tax calculation</div>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="border-t border-gray-700 pt-4 mt-4">
                  <h5 className="text-xs font-semibold text-gray-300 mb-3 uppercase tracking-wide">Labor & Totals</h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="flex items-start gap-3 p-3 rounded-lg bg-gray-700 border border-gray-600 hover:bg-gray-650 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={pdfDisplayOptions.showInstalledPrice}
                        onChange={(e) => setPdfDisplayOptions(prev => ({
                          ...prev,
                          showInstalledPrice: e.target.checked
                        }))}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-white">Installed Price</div>
                        <div className="text-xs text-gray-400 mt-0.5">Show item + labor combined price</div>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 p-3 rounded-lg bg-gray-700 border border-gray-600 hover:bg-gray-650 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={pdfDisplayOptions.showLaborPerLine}
                        onChange={(e) => setPdfDisplayOptions(prev => ({
                          ...prev,
                          showLaborPerLine: e.target.checked
                        }))}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-white">Labor Per Line</div>
                        <div className="text-xs text-gray-400 mt-0.5">Show labor breakdown per item</div>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 p-3 rounded-lg bg-gray-700 border border-gray-600 hover:bg-gray-650 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={pdfDisplayOptions.showAreaTotals}
                        onChange={(e) => setPdfDisplayOptions(prev => ({
                          ...prev,
                          showAreaTotals: e.target.checked
                        }))}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-white">Area Totals</div>
                        <div className="text-xs text-gray-400 mt-0.5">Show grand total per area/room</div>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 p-3 rounded-lg bg-gray-700 border border-gray-600 hover:bg-gray-650 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={pdfDisplayOptions.separatePartsLabor}
                        onChange={(e) => setPdfDisplayOptions(prev => ({
                          ...prev,
                          separatePartsLabor: e.target.checked
                        }))}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-white">Separate Parts & Labor</div>
                        <div className="text-xs text-gray-400 mt-0.5">Split parts and labor into sections</div>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="border-t border-gray-700 pt-4 mt-4">
                  <h5 className="text-xs font-semibold text-gray-300 mb-3 uppercase tracking-wide">Additional Options</h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="flex items-start gap-3 p-3 rounded-lg bg-gray-700 border border-gray-600 hover:bg-gray-650 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={pdfDisplayOptions.showAccessories}
                        onChange={(e) => setPdfDisplayOptions(prev => ({
                          ...prev,
                          showAccessories: e.target.checked
                        }))}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-white">Show Accessories</div>
                        <div className="text-xs text-gray-400 mt-0.5">Include accessory items in report</div>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 p-3 rounded-lg bg-gray-700 border border-gray-600 hover:bg-gray-650 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={pdfDisplayOptions.showPackageItems}
                        onChange={(e) => setPdfDisplayOptions(prev => ({
                          ...prev,
                          showPackageItems: e.target.checked
                        }))}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-white">Show Package Items</div>
                        <div className="text-xs text-gray-400 mt-0.5">Show individual items in packages</div>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 p-3 rounded-lg bg-red-900 bg-opacity-30 border border-red-600 hover:bg-red-900 hover:bg-opacity-40 cursor-pointer transition-colors col-span-2">
                      <input
                        type="checkbox"
                        checked={pdfDisplayOptions.hideAllPrices}
                        onChange={(e) => setPdfDisplayOptions(prev => ({
                          ...prev,
                          hideAllPrices: e.target.checked
                        }))}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-white flex items-center gap-2">
                          Hide All Prices
                          <span className="text-xs px-2 py-0.5 bg-red-600 rounded text-white font-semibold">IMPORTANT</span>
                        </div>
                        <div className="text-xs text-gray-300 mt-0.5">Remove all pricing information from report (unit price, line price, labor, totals, tax, etc.)</div>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-700 pt-6">
                <h4 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Cover Page
                </h4>
                <p className="text-xs text-gray-400 mb-3">
                  Optionally add a professional cover page before your proposal
                </p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  <button
                    onClick={() => setCoverPageImage(null)}
                    className={`relative rounded-lg border-2 transition-all overflow-hidden aspect-[8.5/11] flex items-center justify-center ${
                      !coverPageImage
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-gray-600 bg-gray-700 hover:border-gray-500'
                    }`}
                  >
                    <div className="text-center px-1">
                      <X className="w-5 h-5 text-gray-400 mx-auto mb-1" />
                      <span className="text-[10px] text-gray-400 leading-tight block">No Cover</span>
                    </div>
                  </button>
                  {[
                    { id: 'modern-home', url: 'https://images.pexels.com/photos/1643384/pexels-photo-1643384.jpeg?auto=compress&cs=tinysrgb&w=600', label: 'Modern Home' },
                    { id: 'luxury-interior', url: 'https://images.pexels.com/photos/1571460/pexels-photo-1571460.jpeg?auto=compress&cs=tinysrgb&w=600', label: 'Luxury Interior' },
                    { id: 'architecture', url: 'https://images.pexels.com/photos/323780/pexels-photo-323780.jpeg?auto=compress&cs=tinysrgb&w=600', label: 'Architecture' },
                    { id: 'smart-home', url: 'https://images.pexels.com/photos/1034584/pexels-photo-1034584.jpeg?auto=compress&cs=tinysrgb&w=600', label: 'Smart Home' },
                    { id: 'home-theater', url: 'https://images.pexels.com/photos/7991579/pexels-photo-7991579.jpeg?auto=compress&cs=tinysrgb&w=600', label: 'Home Theater' },
                    { id: 'outdoor-living', url: 'https://images.pexels.com/photos/1080721/pexels-photo-1080721.jpeg?auto=compress&cs=tinysrgb&w=600', label: 'Outdoor Living' },
                    { id: 'commercial', url: 'https://images.pexels.com/photos/380769/pexels-photo-380769.jpeg?auto=compress&cs=tinysrgb&w=600', label: 'Commercial' },
                    { id: 'elegant-home', url: 'https://images.pexels.com/photos/2724749/pexels-photo-2724749.jpeg?auto=compress&cs=tinysrgb&w=600', label: 'Elegant Home' },
                    { id: 'minimalist', url: 'https://images.pexels.com/photos/1571453/pexels-photo-1571453.jpeg?auto=compress&cs=tinysrgb&w=600', label: 'Minimalist' },
                    { id: 'tech-setup', url: 'https://images.pexels.com/photos/1444416/pexels-photo-1444416.jpeg?auto=compress&cs=tinysrgb&w=600', label: 'Tech Setup' },
                    { id: 'cityscape', url: 'https://images.pexels.com/photos/2462015/pexels-photo-2462015.jpeg?auto=compress&cs=tinysrgb&w=600', label: 'Cityscape' },
                  ].map(img => (
                    <button
                      key={img.id}
                      onClick={() => setCoverPageImage(img.url)}
                      className={`relative rounded-lg border-2 transition-all overflow-hidden aspect-[8.5/11] group ${
                        coverPageImage === img.url
                          ? 'border-blue-500 ring-1 ring-blue-500/50'
                          : 'border-gray-600 hover:border-gray-500'
                      }`}
                    >
                      <img
                        src={img.url}
                        alt={img.label}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent pt-4 pb-1 px-1">
                        <span className="text-[9px] text-white/90 font-medium leading-none">{img.label}</span>
                      </div>
                      {coverPageImage === img.url && (
                        <div className="absolute top-1 right-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                          <Check className="w-2.5 h-2.5 text-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-700 pt-6">
                <h4 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Additional Pages
                </h4>
                <p className="text-xs text-gray-400 mb-4">
                  Include these as separate pages after the proposal
                </p>

                <div className="grid grid-cols-1 gap-3">
                  <label className="flex items-start gap-3 p-3 rounded-lg bg-gray-700 border border-gray-600 hover:bg-gray-650 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={pdfDisplayOptions.showScopeOfWorkPage}
                      onChange={(e) => setPdfDisplayOptions(prev => ({
                        ...prev,
                        showScopeOfWorkPage: e.target.checked
                      }))}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-white">Scope of Work Page</div>
                      <div className="text-xs text-gray-400 mt-0.5">Include detailed narrative overview as a separate page (from Scope tab)</div>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3 rounded-lg bg-gray-700 border border-gray-600 hover:bg-gray-650 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={pdfDisplayOptions.showContractPage}
                      onChange={(e) => setPdfDisplayOptions(prev => ({
                        ...prev,
                        showContractPage: e.target.checked
                      }))}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-white">Contract Terms Page</div>
                      <div className="text-xs text-gray-400 mt-0.5">Include contract terms and conditions as a separate page (from Contract tab)</div>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3 rounded-lg bg-gray-700 border border-gray-600 hover:bg-gray-650 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={pdfDisplayOptions.showDepositPage}
                      onChange={(e) => setPdfDisplayOptions(prev => ({
                        ...prev,
                        showDepositPage: e.target.checked
                      }))}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-white">Payment Schedule Page</div>
                      <div className="text-xs text-gray-400 mt-0.5">Include detailed payment schedule as a separate page (from Deposit tab)</div>
                    </div>
                  </label>
                </div>
              </div>

              <div className="bg-blue-900 bg-opacity-30 border border-blue-500 rounded-lg p-3">
                <p className="text-sm text-blue-200">
                  These display options only affect the printed report and do not change your screen settings.
                </p>
              </div>
            </div>

            <div className="px-4 sm:px-6 py-4 border-t border-gray-700 sticky bottom-0 bg-gray-800">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                {/* Template Actions */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setShowSaveTemplateModal(true)}
                    className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
                    title="Save current display options as a template"
                  >
                    <Save className="w-4 h-4" />
                    <span className="hidden sm:inline">Save as Template</span>
                    <span className="sm:hidden">Save</span>
                  </button>
                  {selectedTemplateId && pdfTemplates.find(t => t.id === selectedTemplateId && t.created_by === profile?.id) && (
                    <button
                      onClick={() => deleteTemplate(selectedTemplateId)}
                      className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm font-medium"
                      title="Delete this template"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span className="hidden sm:inline">Delete</span>
                    </button>
                  )}
                </div>

                {/* Primary Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowPdfModal(false)}
                    className="flex-1 sm:flex-initial flex items-center justify-center px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleGeneratePdf}
                    disabled={!selectedTemplateId || generatingPdf || pdfTemplates.length === 0}
                    className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                  >
                    <Download className="w-4 h-4" />
                    {generatingPdf ? 'Generating...' : 'Generate Report'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Save Template Modal */}
      {showSaveTemplateModal && (() => {
        const isEditing = selectedTemplateId && pdfTemplates.find(t => t.id === selectedTemplateId && t.created_by === profile?.id);
        const editingTemplate = isEditing ? pdfTemplates.find(t => t.id === selectedTemplateId) : null;

        // Pre-populate form when opening for edit
        if (isEditing && editingTemplate && !newTemplateName) {
          setNewTemplateName(editingTemplate.name);
          setNewTemplateDescription(editingTemplate.description || '');
          setNewTemplateIsPersonal(editingTemplate.is_personal);

          // Pre-populate PDF display options from the template
          setPdfDisplayOptions({
            showDescription: editingTemplate.show_line_item_description ?? true,
            showManufacturer: editingTemplate.show_manufacturer ?? true,
            showSKU: editingTemplate.show_sku ?? true,
            showColor: editingTemplate.color_scheme !== 'grayscale',
            showUnitPrice: editingTemplate.show_unit_price ?? true,
            showLinePrice: editingTemplate.show_line_item_total ?? true,
            showInstalledPrice: editingTemplate.show_labor_total ?? true,
            showLaborPerLine: editingTemplate.show_labor_hours ?? false,
            showRoomScope: editingTemplate.show_area_descriptions ?? true,
            showAreaTotals: editingTemplate.show_area_subtotals ?? true,
            separatePartsLabor: editingTemplate.show_labor_separate_from_parts ?? false,
            showSalesTax: editingTemplate.show_tax_breakdown ?? true,
            showModifiers: editingTemplate.show_discount ?? true,
            showDeposit: editingTemplate.show_deposit_amount ?? true,
            showProposalNotes: editingTemplate.show_notes ?? true,
            showAccessories: editingTemplate.max_product_images > 0,
            showPackageItems: editingTemplate.include_appendix ?? true,
            showScopeOfWorkPage: editingTemplate.show_scope_of_work ?? true,
            showContractPage: editingTemplate.show_contract_terms ?? true,
            showDepositPage: editingTemplate.show_payment_schedule ?? true,
            hideAllPrices: !editingTemplate.show_subtotal
          });
        }

        return (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-gray-800 rounded-lg shadow-xl max-w-full sm:max-w-3xl w-full my-8">
              <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">
                  {isEditing ? 'Edit Report Template' : 'Save Report Template'}
                </h3>
                <button
                  onClick={() => {
                    setShowSaveTemplateModal(false);
                    setNewTemplateName('');
                    setNewTemplateDescription('');
                  }}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Template Name
                  </label>
                  <input
                    type="text"
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                    placeholder="e.g., Residential Standard, Commercial Detailed"
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Description (Optional)
                  </label>
                  <textarea
                    value={newTemplateDescription}
                    onChange={(e) => setNewTemplateDescription(e.target.value)}
                    placeholder="When to use this template..."
                    rows={3}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="bg-gray-700 border border-gray-600 rounded-lg p-4">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!newTemplateIsPersonal}
                      onChange={(e) => setNewTemplateIsPersonal(!e.target.checked)}
                      className="mt-1"
                    />
                    <div>
                      <div className="text-sm font-medium text-white">Make this a company-wide template</div>
                      <div className="text-xs text-gray-400 mt-1">
                        All team members will be able to use this template. Otherwise, only you can use it.
                      </div>
                    </div>
                  </label>
                </div>

                {/* PDF Display Options */}
                <div className="border-t border-gray-700 pt-6">
                  <h4 className="text-sm font-semibold text-white mb-4">PDF Display Options</h4>
                  <p className="text-xs text-gray-400 mb-4">Configure what appears in the generated PDF. Your current selections are shown below.</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="flex items-start gap-3 cursor-pointer p-3 bg-gray-700 rounded-lg hover:bg-gray-650">
                      <input
                        type="checkbox"
                        checked={pdfDisplayOptions.showDescription}
                        onChange={(e) => setPdfDisplayOptions({...pdfDisplayOptions, showDescription: e.target.checked})}
                        className="mt-1"
                      />
                      <div className="text-sm text-gray-200">Show Description</div>
                    </label>

                    <label className="flex items-start gap-3 cursor-pointer p-3 bg-gray-700 rounded-lg hover:bg-gray-650">
                      <input
                        type="checkbox"
                        checked={pdfDisplayOptions.showManufacturer}
                        onChange={(e) => setPdfDisplayOptions({...pdfDisplayOptions, showManufacturer: e.target.checked})}
                        className="mt-1"
                      />
                      <div className="text-sm text-gray-200">Show Manufacturer</div>
                    </label>

                    <label className="flex items-start gap-3 cursor-pointer p-3 bg-gray-700 rounded-lg hover:bg-gray-650">
                      <input
                        type="checkbox"
                        checked={pdfDisplayOptions.showSKU}
                        onChange={(e) => setPdfDisplayOptions({...pdfDisplayOptions, showSKU: e.target.checked})}
                        className="mt-1"
                      />
                      <div className="text-sm text-gray-200">Show SKU/Model</div>
                    </label>

                    <label className="flex items-start gap-3 cursor-pointer p-3 bg-gray-700 rounded-lg hover:bg-gray-650">
                      <input
                        type="checkbox"
                        checked={pdfDisplayOptions.showColor}
                        onChange={(e) => setPdfDisplayOptions({...pdfDisplayOptions, showColor: e.target.checked})}
                        className="mt-1"
                      />
                      <div className="text-sm text-gray-200">Show Color</div>
                    </label>

                    <label className="flex items-start gap-3 cursor-pointer p-3 bg-gray-700 rounded-lg hover:bg-gray-650">
                      <input
                        type="checkbox"
                        checked={pdfDisplayOptions.showUnitPrice}
                        onChange={(e) => setPdfDisplayOptions({...pdfDisplayOptions, showUnitPrice: e.target.checked})}
                        className="mt-1"
                      />
                      <div className="text-sm text-gray-200">Show Unit Price</div>
                    </label>

                    <label className="flex items-start gap-3 cursor-pointer p-3 bg-gray-700 rounded-lg hover:bg-gray-650">
                      <input
                        type="checkbox"
                        checked={pdfDisplayOptions.showLinePrice}
                        onChange={(e) => setPdfDisplayOptions({...pdfDisplayOptions, showLinePrice: e.target.checked})}
                        className="mt-1"
                      />
                      <div className="text-sm text-gray-200">Show Line Total</div>
                    </label>

                    <label className="flex items-start gap-3 cursor-pointer p-3 bg-gray-700 rounded-lg hover:bg-gray-650">
                      <input
                        type="checkbox"
                        checked={pdfDisplayOptions.showInstalledPrice}
                        onChange={(e) => setPdfDisplayOptions({...pdfDisplayOptions, showInstalledPrice: e.target.checked})}
                        className="mt-1"
                      />
                      <div className="text-sm text-gray-200">Show Installed Price</div>
                    </label>

                    <label className="flex items-start gap-3 cursor-pointer p-3 bg-gray-700 rounded-lg hover:bg-gray-650">
                      <input
                        type="checkbox"
                        checked={pdfDisplayOptions.showLaborPerLine}
                        onChange={(e) => setPdfDisplayOptions({...pdfDisplayOptions, showLaborPerLine: e.target.checked})}
                        className="mt-1"
                      />
                      <div className="text-sm text-gray-200">Show Labor Hours</div>
                    </label>

                    <label className="flex items-start gap-3 cursor-pointer p-3 bg-gray-700 rounded-lg hover:bg-gray-650">
                      <input
                        type="checkbox"
                        checked={pdfDisplayOptions.showRoomScope}
                        onChange={(e) => setPdfDisplayOptions({...pdfDisplayOptions, showRoomScope: e.target.checked})}
                        className="mt-1"
                      />
                      <div className="text-sm text-gray-200">Show Area Descriptions</div>
                    </label>

                    <label className="flex items-start gap-3 cursor-pointer p-3 bg-gray-700 rounded-lg hover:bg-gray-650">
                      <input
                        type="checkbox"
                        checked={pdfDisplayOptions.showAreaTotals}
                        onChange={(e) => setPdfDisplayOptions({...pdfDisplayOptions, showAreaTotals: e.target.checked})}
                        className="mt-1"
                      />
                      <div className="text-sm text-gray-200">Show Area Subtotals</div>
                    </label>

                    <label className="flex items-start gap-3 cursor-pointer p-3 bg-gray-700 rounded-lg hover:bg-gray-650">
                      <input
                        type="checkbox"
                        checked={pdfDisplayOptions.separatePartsLabor}
                        onChange={(e) => setPdfDisplayOptions({...pdfDisplayOptions, separatePartsLabor: e.target.checked})}
                        className="mt-1"
                      />
                      <div className="text-sm text-gray-200">Separate Parts/Labor</div>
                    </label>

                    <label className="flex items-start gap-3 cursor-pointer p-3 bg-gray-700 rounded-lg hover:bg-gray-650">
                      <input
                        type="checkbox"
                        checked={pdfDisplayOptions.showSalesTax}
                        onChange={(e) => setPdfDisplayOptions({...pdfDisplayOptions, showSalesTax: e.target.checked})}
                        className="mt-1"
                      />
                      <div className="text-sm text-gray-200">Show Sales Tax</div>
                    </label>

                    <label className="flex items-start gap-3 cursor-pointer p-3 bg-gray-700 rounded-lg hover:bg-gray-650">
                      <input
                        type="checkbox"
                        checked={pdfDisplayOptions.showModifiers}
                        onChange={(e) => setPdfDisplayOptions({...pdfDisplayOptions, showModifiers: e.target.checked})}
                        className="mt-1"
                      />
                      <div className="text-sm text-gray-200">Show Modifiers (Discounts/Fees)</div>
                    </label>

                    <label className="flex items-start gap-3 cursor-pointer p-3 bg-gray-700 rounded-lg hover:bg-gray-650">
                      <input
                        type="checkbox"
                        checked={pdfDisplayOptions.showDeposit}
                        onChange={(e) => setPdfDisplayOptions({...pdfDisplayOptions, showDeposit: e.target.checked})}
                        className="mt-1"
                      />
                      <div className="text-sm text-gray-200">Show Deposit Info</div>
                    </label>

                    <label className="flex items-start gap-3 cursor-pointer p-3 bg-gray-700 rounded-lg hover:bg-gray-650">
                      <input
                        type="checkbox"
                        checked={pdfDisplayOptions.showProposalNotes}
                        onChange={(e) => setPdfDisplayOptions({...pdfDisplayOptions, showProposalNotes: e.target.checked})}
                        className="mt-1"
                      />
                      <div className="text-sm text-gray-200">Show Proposal Notes</div>
                    </label>

                    <label className="flex items-start gap-3 cursor-pointer p-3 bg-gray-700 rounded-lg hover:bg-gray-650">
                      <input
                        type="checkbox"
                        checked={pdfDisplayOptions.showAccessories}
                        onChange={(e) => setPdfDisplayOptions({...pdfDisplayOptions, showAccessories: e.target.checked})}
                        className="mt-1"
                      />
                      <div className="text-sm text-gray-200">Show Product Images</div>
                    </label>

                    <label className="flex items-start gap-3 cursor-pointer p-3 bg-gray-700 rounded-lg hover:bg-gray-650">
                      <input
                        type="checkbox"
                        checked={pdfDisplayOptions.showPackageItems}
                        onChange={(e) => setPdfDisplayOptions({...pdfDisplayOptions, showPackageItems: e.target.checked})}
                        className="mt-1"
                      />
                      <div className="text-sm text-gray-200">Show Package Breakdowns</div>
                    </label>

                    <label className="flex items-start gap-3 cursor-pointer p-3 bg-gray-700 rounded-lg hover:bg-gray-650">
                      <input
                        type="checkbox"
                        checked={pdfDisplayOptions.showScopeOfWorkPage}
                        onChange={(e) => setPdfDisplayOptions({...pdfDisplayOptions, showScopeOfWorkPage: e.target.checked})}
                        className="mt-1"
                      />
                      <div className="text-sm text-gray-200">Show Scope of Work Page</div>
                    </label>

                    <label className="flex items-start gap-3 cursor-pointer p-3 bg-gray-700 rounded-lg hover:bg-gray-650">
                      <input
                        type="checkbox"
                        checked={pdfDisplayOptions.showContractPage}
                        onChange={(e) => setPdfDisplayOptions({...pdfDisplayOptions, showContractPage: e.target.checked})}
                        className="mt-1"
                      />
                      <div className="text-sm text-gray-200">Show Contract Terms Page</div>
                    </label>

                    <label className="flex items-start gap-3 cursor-pointer p-3 bg-gray-700 rounded-lg hover:bg-gray-650">
                      <input
                        type="checkbox"
                        checked={pdfDisplayOptions.showDepositPage}
                        onChange={(e) => setPdfDisplayOptions({...pdfDisplayOptions, showDepositPage: e.target.checked})}
                        className="mt-1"
                      />
                      <div className="text-sm text-gray-200">Show Payment Schedule Page</div>
                    </label>

                    <label className="flex items-start gap-3 cursor-pointer p-3 bg-gray-700 rounded-lg hover:bg-gray-650">
                      <input
                        type="checkbox"
                        checked={pdfDisplayOptions.hideAllPrices}
                        onChange={(e) => setPdfDisplayOptions({...pdfDisplayOptions, hideAllPrices: e.target.checked})}
                        className="mt-1"
                      />
                      <div className="text-sm text-gray-200">Hide All Prices</div>
                    </label>
                  </div>
                </div>

                <div className="bg-blue-900 bg-opacity-30 border border-blue-500 rounded-lg p-3">
                  <p className="text-xs text-blue-200">
                    {isEditing
                      ? 'This will update your template with the display options selected above.'
                      : 'This will save the display options selected above as a reusable template.'}
                  </p>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-gray-700 flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowSaveTemplateModal(false);
                    setNewTemplateName('');
                    setNewTemplateDescription('');
                  }}
                  className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={saveAsTemplate}
                  disabled={!newTemplateName.trim() || savingTemplate}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                >
                  <Save className="w-4 h-4" />
                  {savingTemplate ? 'Saving...' : (isEditing ? 'Update Template' : 'Save Template')}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Copy to Areas Modal */}
      {showCopyToModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold text-white mb-4">Copy Items To...</h2>
            <p className="text-sm text-gray-400 mb-4">
              Select the area(s) where you want to copy the {selectedItems.size} selected item{selectedItems.size !== 1 ? 's' : ''}
            </p>

            {/* Quick Add Area */}
            <div className="mb-4 p-3 bg-gray-700 rounded-lg border border-gray-600">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Create New Area
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={quickAddAreaName}
                  onChange={(e) => setQuickAddAreaName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      quickAddArea();
                    }
                  }}
                  placeholder="Enter area name..."
                  className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={quickAddArea}
                  disabled={!quickAddAreaName.trim() || saving}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add
                </button>
              </div>
            </div>

            <div className="space-y-2 max-h-96 overflow-y-auto mb-6">
              {rooms
                .filter(room => !room.line_items.some(item => selectedItems.has(item.id)))
                .map(room => (
                  <label
                    key={room.id}
                    className="flex items-center gap-3 p-3 bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-600"
                  >
                    <input
                      type="checkbox"
                      checked={selectedRoomsToCopy.has(room.id)}
                      onChange={() => {
                        const newRooms = new Set(selectedRoomsToCopy);
                        if (newRooms.has(room.id)) {
                          newRooms.delete(room.id);
                        } else {
                          newRooms.add(room.id);
                        }
                        setSelectedRoomsToCopy(newRooms);
                      }}
                      className="rounded border-gray-600 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-white">{room.name}</span>
                  </label>
                ))}
              {rooms.filter(room => !room.line_items.some(item => selectedItems.has(item.id))).length === 0 && (
                <p className="text-gray-400 text-center py-4">
                  No available areas (all areas contain selected items)
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCopyToModal(false);
                  setSelectedRoomsToCopy(new Set());
                  setQuickAddAreaName('');
                }}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await copyItemsToRooms(Array.from(selectedRoomsToCopy));
                  setQuickAddAreaName('');
                }}
                disabled={selectedRoomsToCopy.size === 0}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg"
              >
                Copy to {selectedRoomsToCopy.size} area{selectedRoomsToCopy.size !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Detail / Edit Modal */}
      {showProductDetail && (
        <ProductDetailModal
          lineItemId={showProductDetail}
          onClose={() => setShowProductDetail(null)}
          onSaved={() => {
            setShowProductDetail(null);
            loadData();
          }}
        />
      )}

      {/* Substitute Item Modal */}
      {substituteItemId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg p-6 max-w-full sm:max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Substitute Item</h2>
              <button
                onClick={() => {
                  setSubstituteItemId(null);
                  setSubstituteSearchQuery('');
                }}
                className="p-1 text-gray-400 hover:text-white rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-gray-400 mb-4">
              Search for a product to replace the current item with. All product details (price, cost, labor, etc.) will be updated.
            </p>

            {/* Search Bar */}
            <div className="mb-4">
              <input
                type="text"
                value={substituteSearchQuery}
                onChange={(e) => setSubstituteSearchQuery(e.target.value)}
                placeholder="Search by SKU, name, description..."
                className="w-full bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>

            {/* Products List */}
            <div className="flex-1 overflow-y-auto space-y-2">
              {substituteProducts
                .filter(product => {
                  if (!substituteSearchQuery) return true;
                  const query = substituteSearchQuery.toLowerCase();
                  return (
                    product.sku?.toLowerCase().includes(query) ||
                    product.name?.toLowerCase().includes(query) ||
                    product.description?.toLowerCase().includes(query) ||
                    product.category?.toLowerCase().includes(query)
                  );
                })
                .map(product => (
                  <div
                    key={product.id}
                    onClick={() => {
                      if (confirm(`Replace current item with "${product.name || product.description}"?`)) {
                        substituteItem(product.id);
                      }
                    }}
                    className="p-4 bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-600 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-mono text-cyan-400">{product.sku}</span>
                          {product.manufacturers?.name && (
                            <span className="text-xs text-gray-400">| {product.manufacturers.name}</span>
                          )}
                        </div>
                        <h3 className="text-white font-medium mb-1">{product.name || product.description}</h3>
                        {product.description && product.name && (
                          <p className="text-sm text-gray-400 line-clamp-2">{product.description}</p>
                        )}
                        {product.category && (
                          <span className="inline-block mt-2 text-xs px-2 py-1 bg-gray-800 text-gray-300 rounded">
                            {product.category}
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-green-400 font-medium">${product.price?.toFixed(2) || '0.00'}</div>
                        <div className="text-xs text-gray-400">Cost: ${product.cost?.toFixed(2) || '0.00'}</div>
                        {product.labor_hours && (
                          <div className="text-xs text-gray-400 mt-1">{product.labor_hours}h labor</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              {substituteProducts.filter(product => {
                if (!substituteSearchQuery) return true;
                const query = substituteSearchQuery.toLowerCase();
                return (
                  product.sku?.toLowerCase().includes(query) ||
                  product.name?.toLowerCase().includes(query) ||
                  product.description?.toLowerCase().includes(query) ||
                  product.category?.toLowerCase().includes(query)
                );
              }).length === 0 && (
                <p className="text-gray-400 text-center py-8">
                  {substituteSearchQuery ? 'No products found matching your search' : 'No products available'}
                </p>
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-700">
              <button
                onClick={() => {
                  setSubstituteItemId(null);
                  setSubstituteSearchQuery('');
                }}
                className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
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

      {showManualApprovalModal && proposal && proposal.contacts && (
        proposal.status === 'approved_pending_action' ? (
          <ApprovalActionModal
            proposal={proposal}
            contact={proposal.contacts}
            onClose={() => setShowManualApprovalModal(false)}
            onComplete={() => {
              setShowManualApprovalModal(false);
              loadData();
            }}
          />
        ) : (
          <ManualApprovalModal
            proposalId={proposal.id}
            proposalNumber={proposal.proposal_number}
            contactEmail={proposal.contacts?.email || ''}
            depositAmount={proposal.deposit_amount_due || 0}
            onClose={() => setShowManualApprovalModal(false)}
            onSuccess={(salesOrderId) => {
              setShowManualApprovalModal(false);
              if (salesOrderId && onNavigateToSalesOrder) {
                onNavigateToSalesOrder(salesOrderId);
              } else {
                loadData();
              }
            }}
          />
        )
      )}

      {showNotificationHistory && proposal && (
        <ProposalNotificationHistory
          proposalId={proposal.id}
          onClose={() => setShowNotificationHistory(false)}
        />
      )}

      {showApprovalActionModal && proposal && proposal.contacts && (
        <ApprovalActionModal
          proposal={proposal}
          contact={proposal.contacts}
          onClose={() => setShowApprovalActionModal(false)}
          onComplete={() => {
            setShowApprovalActionModal(false);
            loadData();
          }}
        />
      )}

      {showSubmissionModal && proposal && (
        <PreSendValidationModal
          proposalId={proposal.id}
          proposalNumber={proposal.proposal_number}
          onClose={() => setShowSubmissionModal(false)}
          onSend={(approvalWindow) => handleConfirmSubmission(true, approvalWindow)}
          onNavigateToSettings={(section) => {
            setShowSubmissionModal(false);
            setShowSettings(true);
            setActiveSettingsTab(section);
          }}
        />
      )}

      {showReactivateModal && proposal && (
        <ReactivateProposalModal
          proposalId={proposal.id}
          proposalNumber={proposal.proposal_number}
          lastModified={proposal.updated_at || proposal.created_at}
          totalAmount={pricing.total}
          onClose={() => setShowReactivateModal(false)}
          onSuccess={() => {
            setShowReactivateModal(false);
            loadData();
          }}
          onReview={() => {
            setShowReactivateModal(false);
          }}
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
          onCancel={() => setPendingBulkUpdate(null)}
          isLoading={bulkUpdateLoading}
        />
      )}

      {bulkUpdateProjectInfo && (
        <BulkUpdateProjectInfoModal
          itemDescription={bulkUpdateProjectInfo.description}
          field={bulkUpdateProjectInfo.field}
          instanceCount={bulkUpdateProjectInfo.instanceCount}
          onUpdateSingle={() => updateProjectInfoSingle(bulkUpdateProjectInfo.itemId, bulkUpdateProjectInfo.newValues)}
          onUpdateAll={updateProjectInfoAll}
          onCancel={() => setBulkUpdateProjectInfo(null)}
          isLoading={saving}
        />
      )}

      {showUnlockWarningModal && proposal && (
        <UnlockProposalModal
          proposalNumber={proposal.proposal_number}
          onCreateRevision={handleCreateRevision}
          onUnlockAndEdit={handleUnlockProposal}
          onClose={() => setShowUnlockWarningModal(false)}
        />
      )}

      {showPortalVersionHistory && proposal && (
        <PortalVersionHistoryModal
          proposalId={proposal.id}
          proposalNumber={proposal.proposal_number}
          currentPortalVersion={proposal.current_portal_version ?? 0}
          onClose={() => setShowPortalVersionHistory(false)}
          onRestored={() => {
            setShowPortalVersionHistory(false);
            loadData();
          }}
        />
      )}

      {showPromoteRevisionModal && proposal && (
        <PromoteRevisionModal
          revisionName={proposal.revision_name || 'Revision'}
          revisionNumber={proposal.proposal_number}
          onConfirm={handlePromoteRevision}
          onClose={() => setShowPromoteRevisionModal(false)}
        />
      )}

      {showEmailProposalModal && proposal && proposal.contacts && (
        <EmailProposalModal
          proposalId={proposal.id}
          proposalNumber={proposal.proposal_number}
          contactEmail={proposal.contacts.email || ''}
          contactName={proposal.contacts.full_name || proposal.contacts.contact_name}
          onClose={() => setShowEmailProposalModal(false)}
        />
      )}

      {showActivityModal && proposal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-full sm:max-w-2xl border border-gray-700">
            <div className="p-6 border-b border-gray-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Activity className="text-blue-400" size={24} />
                  <div>
                    <h2 className="text-xl font-bold text-white">
                      Customer Activity
                    </h2>
                    <p className="text-sm text-gray-400">
                      Proposal {proposal.proposal_number}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowActivityModal(false);
                    setActivityData(null);
                  }}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <XCircle size={24} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
              {activityData ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-gray-700 p-4 rounded-lg">
                      <div className="text-gray-400 text-sm mb-1">Total Views</div>
                      <div className="text-2xl font-bold text-white">
                        {activityData.total_views || 0}
                      </div>
                    </div>
                    <div className="bg-gray-700 p-4 rounded-lg">
                      <div className="text-gray-400 text-sm mb-1">Unique Sessions</div>
                      <div className="text-2xl font-bold text-white">
                        {activityData.unique_sessions || 0}
                      </div>
                    </div>
                    <div className="bg-gray-700 p-4 rounded-lg">
                      <div className="text-gray-400 text-sm mb-1">Total Time</div>
                      <div className="text-2xl font-bold text-white">
                        {activityData.total_time_seconds
                          ? `${Math.floor(activityData.total_time_seconds / 60)}m ${activityData.total_time_seconds % 60}s`
                          : '0m 0s'
                        }
                      </div>
                    </div>
                    <div className="bg-gray-700 p-4 rounded-lg">
                      <div className="text-gray-400 text-sm mb-1">Last Viewed</div>
                      <div className="text-sm font-bold text-white">
                        {activityData.last_viewed_at
                          ? new Date(activityData.last_viewed_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit'
                            })
                          : 'Never'
                        }
                      </div>
                    </div>
                  </div>

                  {activityData.activity_timeline && activityData.activity_timeline.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wide">
                        Activity Timeline
                      </h3>
                      <div className="space-y-2">
                        {activityData.activity_timeline.map((activity: any, index: number) => (
                          <div
                            key={index}
                            className="flex items-center justify-between bg-gray-700 p-3 rounded-lg"
                          >
                            <div className="flex items-center gap-3">
                              {activity.type === 'viewed' && <Eye className="text-blue-400" size={16} />}
                              {activity.type === 'downloaded' && <Download className="text-green-400" size={16} />}
                              {activity.type === 'accepted' && <CheckCircle2 className="text-green-400" size={16} />}
                              {activity.type === 'declined' && <XCircle className="text-red-400" size={16} />}
                              <div>
                                <div className="text-sm text-white capitalize">{activity.type}</div>
                                {activity.duration > 0 && (
                                  <div className="text-xs text-gray-400">
                                    {Math.floor(activity.duration / 60)}m {activity.duration % 60}s
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="text-xs text-gray-400">
                              {new Date(activity.created_at).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit'
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-12 text-gray-400">
                  <Activity className="mx-auto mb-3 text-gray-600" size={48} />
                  <p>No activity recorded yet</p>
                  <p className="text-sm mt-2">Customer hasn't viewed this proposal</p>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-700">
              <button
                onClick={() => {
                  setShowActivityModal(false);
                  setActivityData(null);
                }}
                className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Portal Preview — full-screen overlay rendered to document.body */}
      {showPortalPreview && createPortal(
        <div className="fixed inset-0 z-[9999] flex flex-col bg-gray-950">
          <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 bg-gray-900 border-b border-gray-700 shrink-0 flex-wrap">
            <div className="flex items-center gap-2">
              <Eye className={`w-4 h-4 ${proposal?.is_portal_visible ? 'text-green-400' : 'text-blue-400'}`} />
              <span className="text-sm font-semibold text-white">Customer Portal Preview</span>
            </div>
            {proposal?.is_portal_visible ? (
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
          <div className="flex-1 overflow-y-auto bg-gray-50">
            <PortalProposalDetail
              proposalId={proposalId}
              onBack={() => setShowPortalPreview(false)}
              previewMode={true}
              templateOverrideId={proposal?.report_template_id ?? null}
            />
          </div>
        </div>,
        document.body
      )}
      {showQA && (
        <ProposalQA
          proposalId={proposalId}
          isPortal={false}
          onClose={() => { setShowQA(false); setQaContext({ roomId: null, lineItemId: null, label: null }); loadQaMessages(); }}
          contextRoomId={qaContext.roomId}
          contextLineItemId={qaContext.lineItemId}
          contextLabel={qaContext.label}
          onMessagesChanged={loadQaMessages}
        />
      )}
    </div>
  );
}
