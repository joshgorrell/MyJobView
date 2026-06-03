import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Award,
  CheckCircle2,
  XCircle,
  DollarSign,
  Clock,
  Users,
  TrendingUp,
  AlertCircle,
  Edit,
  Eye,
  Calendar,
  Target,
  Unlock,
  X
} from 'lucide-react';
import { UserSelector } from '../Shared/UserSelector';

interface BonusCalculation {
  id: string;
  sales_order_number: string;
  contact_name: string;
  evaluation_date: string;
  total_estimated_labor: number;
  field_labor_target: number;
  total_field_hours: number;
  labor_savings_hours: number;
  labor_burden_rate: number;
  total_savings_amount: number;
  bonus_tier: string;
  bonus_percentage: number;
  total_bonus_amount: number;
  tech_bonus_amount: number;
  pm_bonus_amount: number;
  lead_tech_name: string | null;
  pm_name: string | null;
  lead_technician_id: string | null;
  project_manager_id: string | null;
  status: string;
  notes: string | null;
  created_at: string;
}

interface ApprovalModalState {
  isOpen: boolean;
  calculationId: string | null;
  action: 'approve' | 'deny' | 'adjust' | null;
  overrideAmount: string;
  reason: string;
}

interface AssignmentModalState {
  isOpen: boolean;
  calculationId: string | null;
  leadTechId: string | null;
  projectManagerId: string | null;
  originalTechId: string | null;
  originalPMId: string | null;
}

export function BonusApprovalDashboard() {
  const [calculations, setCalculations] = useState<BonusCalculation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<'pending' | 'approved' | 'denied' | 'all'>('pending');
  const [selectedCalculation, setSelectedCalculation] = useState<BonusCalculation | null>(null);
  const [approvalModal, setApprovalModal] = useState<ApprovalModalState>({
    isOpen: false,
    calculationId: null,
    action: null,
    overrideAmount: '',
    reason: ''
  });
  const [assignmentModal, setAssignmentModal] = useState<AssignmentModalState>({
    isOpen: false,
    calculationId: null,
    leadTechId: null,
    projectManagerId: null,
    originalTechId: null,
    originalPMId: null
  });
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    loadCalculations();

    // Set up real-time subscription
    const subscription = supabase
      .channel('bonus_calculations_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'test_tune_bonus_calculations' },
        () => {
          loadCalculations();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function loadCalculations() {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('test_tune_bonus_calculations')
        .select(`
          *,
          sales_orders!inner(
            order_number,
            contacts!inner(full_name)
          ),
          lead_tech:profiles!lead_technician_id(full_name),
          pm:profiles!project_manager_id(full_name)
        `)
        .order('evaluation_date', { ascending: false });

      if (error) throw error;

      if (data) {
        const formatted = data.map((calc: any) => ({
          id: calc.id,
          sales_order_number: calc.sales_orders.order_number,
          contact_name: calc.sales_orders.contacts.full_name,
          evaluation_date: calc.evaluation_date,
          total_estimated_labor: calc.total_estimated_labor,
          field_labor_target: calc.field_labor_target,
          total_field_hours: calc.total_field_hours,
          labor_savings_hours: calc.labor_savings_hours,
          labor_burden_rate: calc.labor_burden_rate,
          total_savings_amount: calc.total_savings_amount,
          bonus_tier: calc.bonus_tier,
          bonus_percentage: calc.bonus_percentage,
          total_bonus_amount: calc.total_bonus_amount,
          tech_bonus_amount: calc.tech_bonus_amount,
          pm_bonus_amount: calc.pm_bonus_amount,
          lead_tech_name: calc.lead_tech?.full_name || null,
          pm_name: calc.pm?.full_name || null,
          lead_technician_id: calc.lead_technician_id,
          project_manager_id: calc.project_manager_id,
          status: calc.status,
          notes: calc.notes,
          created_at: calc.created_at
        }));

        setCalculations(formatted);
      }
    } catch (error) {
      console.error('Error loading bonus calculations:', error);
    } finally {
      setLoading(false);
    }
  }

  function getFilteredCalculations() {
    if (selectedTab === 'all') return calculations;
    if (selectedTab === 'pending') return calculations.filter(c => c.status === 'provisional');
    return calculations.filter(c => c.status === selectedTab);
  }

  async function handleApproval(calculationId: string, action: 'approve' | 'deny' | 'adjust') {
    setApprovalModal({
      isOpen: true,
      calculationId,
      action,
      overrideAmount: '',
      reason: ''
    });
  }

  async function submitApproval() {
    if (!approvalModal.calculationId || !approvalModal.action) return;

    setProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const calculation = calculations.find(c => c.id === approvalModal.calculationId);
      if (!calculation) throw new Error('Calculation not found');

      // Create approval record
      const approvalData: any = {
        bonus_calculation_id: approvalModal.calculationId,
        reviewed_by: user.id,
        action: approvalModal.action
      };

      if (approvalModal.action === 'adjust' && approvalModal.overrideAmount) {
        approvalData.override_bonus_amount = parseFloat(approvalModal.overrideAmount);
        approvalData.override_reason = approvalModal.reason;
      }

      if (approvalModal.action === 'deny') {
        approvalData.override_reason = approvalModal.reason;
      }

      if (approvalModal.action === 'approve') {
        approvalData.approved_at = new Date().toISOString();
      }

      const { error: approvalError } = await supabase
        .from('test_tune_bonus_approvals')
        .insert(approvalData);

      if (approvalError) throw approvalError;

      // Update calculation status
      let newStatus = 'approved';
      let updatedAmount = calculation.total_bonus_amount;

      if (approvalModal.action === 'deny') {
        newStatus = 'denied';
        updatedAmount = 0;
      } else if (approvalModal.action === 'adjust' && approvalModal.overrideAmount) {
        updatedAmount = parseFloat(approvalModal.overrideAmount);
      }

      const updateData: any = {
        status: newStatus,
        total_bonus_amount: updatedAmount,
        tech_bonus_amount: updatedAmount * 0.65,
        pm_bonus_amount: updatedAmount * 0.35,
        notes: approvalModal.reason || calculation.notes
      };

      const { error: updateError } = await supabase
        .from('test_tune_bonus_calculations')
        .update(updateData)
        .eq('id', approvalModal.calculationId);

      if (updateError) throw updateError;

      // Update sales order test_tune_status
      const { data: salesOrderData } = await supabase
        .from('test_tune_bonus_calculations')
        .select('sales_order_id')
        .eq('id', approvalModal.calculationId)
        .single();

      if (salesOrderData) {
        await supabase
          .from('sales_orders')
          .update({ test_tune_status: 'completed' })
          .eq('id', salesOrderData.sales_order_id);
      }

      // Create notifications for tech and PM
      if (newStatus === 'approved' && updatedAmount > 0) {
        const notifications = [];

        if (calculation.lead_tech_name) {
          notifications.push({
            type: 'bonus_approved',
            title: 'Performance Bonus Approved',
            message: `Your Test & Tune performance bonus of $${(updatedAmount * 0.65).toFixed(2)} has been approved!`,
            related_id: approvalModal.calculationId
          });
        }

        if (calculation.pm_name) {
          notifications.push({
            type: 'bonus_approved',
            title: 'Performance Bonus Approved',
            message: `Your Test & Tune performance bonus of $${(updatedAmount * 0.35).toFixed(2)} has been approved!`,
            related_id: approvalModal.calculationId
          });
        }

        if (notifications.length > 0) {
          await supabase.from('notifications').insert(notifications);
        }
      }

      setApprovalModal({
        isOpen: false,
        calculationId: null,
        action: null,
        overrideAmount: '',
        reason: ''
      });

      loadCalculations();
    } catch (error) {
      console.error('Error processing approval:', error);
      alert('Failed to process approval. Please try again.');
    } finally {
      setProcessing(false);
    }
  }

  function handleOpenAssignmentModal(calculation: BonusCalculation) {
    setAssignmentModal({
      isOpen: true,
      calculationId: calculation.id,
      leadTechId: calculation.lead_technician_id,
      projectManagerId: calculation.project_manager_id,
      originalTechId: calculation.lead_technician_id,
      originalPMId: calculation.project_manager_id
    });
  }

  async function handleSaveAssignments() {
    if (!assignmentModal.calculationId) return;

    if (!assignmentModal.leadTechId || !assignmentModal.projectManagerId) {
      alert('Both Lead Technician and Project Manager must be assigned.');
      return;
    }

    setProcessing(true);
    try {
      const calculation = calculations.find(c => c.id === assignmentModal.calculationId);
      if (!calculation) throw new Error('Calculation not found');

      const totalBonus = calculation.total_bonus_amount;

      const samePersonAssigned = assignmentModal.leadTechId === assignmentModal.projectManagerId;

      const techBonus = samePersonAssigned ? totalBonus : totalBonus * 0.65;
      const pmBonus = samePersonAssigned ? 0 : totalBonus * 0.35;

      const { error } = await supabase
        .from('test_tune_bonus_calculations')
        .update({
          lead_technician_id: assignmentModal.leadTechId,
          project_manager_id: assignmentModal.projectManagerId,
          tech_bonus_amount: techBonus,
          pm_bonus_amount: pmBonus
        })
        .eq('id', assignmentModal.calculationId);

      if (error) throw error;

      setAssignmentModal({
        isOpen: false,
        calculationId: null,
        leadTechId: null,
        projectManagerId: null,
        originalTechId: null,
        originalPMId: null
      });

      loadCalculations();
    } catch (error) {
      console.error('Error saving assignments:', error);
      alert('Failed to save assignments. Please try again.');
    } finally {
      setProcessing(false);
    }
  }

  function getTierBadge(tier: string) {
    const colors = {
      on_target: 'bg-blue-100 text-blue-800',
      tier_1: 'bg-green-100 text-green-800',
      tier_2: 'bg-purple-100 text-purple-800',
      tier_3: 'bg-yellow-100 text-yellow-800',
      over_target: 'bg-red-100 text-red-800'
    };

    const labels = {
      on_target: 'On Target',
      tier_1: 'Tier 1 Savings',
      tier_2: 'Tier 2 Savings',
      tier_3: 'Tier 3 Savings',
      over_target: 'Over Target'
    };

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded ${colors[tier as keyof typeof colors]}`}>
        {labels[tier as keyof typeof labels]}
      </span>
    );
  }

  const filteredCalculations = getFilteredCalculations();
  const pendingCount = calculations.filter(c => c.status === 'provisional').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Clock className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
          <p className="text-gray-600">Loading bonus calculations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Award className="w-8 h-8 text-purple-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Bonus Approval Dashboard</h1>
            <p className="text-sm text-gray-600">Review and approve Test & Tune performance bonuses</p>
          </div>
        </div>
        {pendingCount > 0 && (
          <div className="bg-purple-100 border border-purple-200 rounded-lg px-4 py-2">
            <span className="text-sm font-medium text-purple-900">
              {pendingCount} Pending Approval{pendingCount !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {[
            { key: 'pending', label: 'Pending', count: calculations.filter(c => c.status === 'provisional').length },
            { key: 'approved', label: 'Approved', count: calculations.filter(c => c.status === 'approved').length },
            { key: 'denied', label: 'Denied', count: calculations.filter(c => c.status === 'denied').length },
            { key: 'all', label: 'All', count: calculations.length }
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setSelectedTab(tab.key as any)}
              className={`pb-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                selectedTab === tab.key
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </nav>
      </div>

      {/* Calculations List */}
      <div className="space-y-4">
        {filteredCalculations.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
            <Award className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No bonus calculations found</p>
          </div>
        ) : (
          filteredCalculations.map((calc) => (
            <div key={calc.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition-shadow">
              <div className="p-6">
                {/* Header Row */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{calc.contact_name}</h3>
                      {getTierBadge(calc.bonus_tier)}
                      {calc.status === 'approved' && (
                        <span className="px-2 py-1 text-xs font-medium rounded bg-green-100 text-green-800 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Approved
                        </span>
                      )}
                      {calc.status === 'denied' && (
                        <span className="px-2 py-1 text-xs font-medium rounded bg-red-100 text-red-800 flex items-center gap-1">
                          <XCircle className="w-3 h-3" />
                          Denied
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <span>Order #{calc.sales_order_number}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        Evaluated: {new Date(calc.evaluation_date).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-gray-900">
                      ${calc.total_bonus_amount.toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-500">Total Bonus</div>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-4 gap-4 mb-4 p-4 bg-gray-50 rounded-lg">
                  <div>
                    <div className="text-xs text-gray-600 mb-1">Field Target</div>
                    <div className="text-sm font-medium text-gray-900">{calc.field_labor_target.toFixed(1)}h</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 mb-1">Field Used</div>
                    <div className={`text-sm font-medium ${
                      calc.total_field_hours > calc.field_labor_target ? 'text-red-600' : 'text-gray-900'
                    }`}>
                      {calc.total_field_hours.toFixed(1)}h
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 mb-1">Hours Saved</div>
                    <div className={`text-sm font-medium ${
                      calc.labor_savings_hours > 0 ? 'text-green-600' : 'text-gray-900'
                    }`}>
                      {calc.labor_savings_hours.toFixed(1)}h
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600 mb-1">Savings Value</div>
                    <div className="text-sm font-medium text-green-600">
                      ${calc.total_savings_amount.toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Team Split */}
                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium text-gray-700">Bonus Split</h4>
                    {calc.status === 'provisional' && (
                      <button
                        onClick={() => handleOpenAssignmentModal(calc)}
                        className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
                      >
                        <Edit className="w-3 h-3" />
                        Edit Assignments
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <div className="flex items-center gap-2 mb-2">
                        <Users className="w-4 h-4 text-gray-400" />
                        <span className="text-xs text-gray-600">Lead Technician</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className={`text-sm font-medium ${calc.lead_tech_name ? 'text-gray-900' : 'text-red-600'}`}>
                            {calc.lead_tech_name || 'Not Assigned'}
                          </div>
                          <div className="text-xs text-gray-500">65% of bonus</div>
                        </div>
                        <div className="text-lg font-bold text-green-600">
                          ${calc.tech_bonus_amount.toLocaleString()}
                        </div>
                      </div>
                      {!calc.lead_tech_name && (
                        <div className="mt-2 flex items-center gap-1 text-xs text-red-600">
                          <AlertCircle className="w-3 h-3" />
                          Required
                        </div>
                      )}
                    </div>

                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <div className="flex items-center gap-2 mb-2">
                        <Users className="w-4 h-4 text-gray-400" />
                        <span className="text-xs text-gray-600">Project Manager</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className={`text-sm font-medium ${calc.pm_name ? 'text-gray-900' : 'text-red-600'}`}>
                            {calc.pm_name || 'Not Assigned'}
                          </div>
                          <div className="text-xs text-gray-500">35% of bonus</div>
                        </div>
                        <div className="text-lg font-bold text-green-600">
                          ${calc.pm_bonus_amount.toLocaleString()}
                        </div>
                      </div>
                      {!calc.pm_name && (
                        <div className="mt-2 flex items-center gap-1 text-xs text-red-600">
                          <AlertCircle className="w-3 h-3" />
                          Required
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Notes */}
                {calc.notes && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg mb-4">
                    <p className="text-sm text-blue-900">{calc.notes}</p>
                  </div>
                )}

                {/* Actions */}
                {calc.status === 'provisional' && (
                  <div className="flex items-center gap-3 pt-4 border-t border-gray-200">
                    <button
                      onClick={() => handleApproval(calc.id, 'approve')}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Approve
                    </button>
                    <button
                      onClick={() => handleApproval(calc.id, 'adjust')}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <Edit className="w-4 h-4" />
                      Adjust Amount
                    </button>
                    <button
                      onClick={() => handleApproval(calc.id, 'deny')}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      <XCircle className="w-4 h-4" />
                      Deny
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Approval Modal */}
      {approvalModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                {approvalModal.action === 'approve' && 'Approve Bonus'}
                {approvalModal.action === 'adjust' && 'Adjust Bonus Amount'}
                {approvalModal.action === 'deny' && 'Deny Bonus'}
              </h3>
              <button
                onClick={() => setApprovalModal({ ...approvalModal, isOpen: false })}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {approvalModal.action === 'adjust' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Override Bonus Amount
                  </label>
                  <input
                    type="number"
                    value={approvalModal.overrideAmount}
                    onChange={(e) => setApprovalModal({ ...approvalModal, overrideAmount: e.target.value })}
                    placeholder="Enter new bonus amount"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {approvalModal.action === 'deny' ? 'Reason (Required)' : 'Notes (Optional)'}
                </label>
                <textarea
                  value={approvalModal.reason}
                  onChange={(e) => setApprovalModal({ ...approvalModal, reason: e.target.value })}
                  placeholder={
                    approvalModal.action === 'deny'
                      ? 'Explain why this bonus is being denied'
                      : 'Add any notes or explanation'
                  }
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setApprovalModal({ ...approvalModal, isOpen: false })}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={submitApproval}
                disabled={processing || (approvalModal.action === 'deny' && !approvalModal.reason)}
                className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processing ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assignment Modal */}
      {assignmentModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Edit Bonus Assignments</h3>
                <p className="text-sm text-gray-600 mt-1">Assign Lead Technician and Project Manager to receive bonuses</p>
              </div>
              <button
                onClick={() => setAssignmentModal({
                  isOpen: false,
                  calculationId: null,
                  leadTechId: null,
                  projectManagerId: null,
                  originalTechId: null,
                  originalPMId: null
                })}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-900">
                    <p className="font-medium mb-1">Bonus Split Information</p>
                    <p>The bonus will be split 65% to the Lead Technician and 35% to the Project Manager.</p>
                    <p className="mt-1">If the same person is assigned to both roles, they receive 100% of the bonus.</p>
                  </div>
                </div>
              </div>

              <UserSelector
                selectedUserId={assignmentModal.leadTechId}
                onSelect={(id) => setAssignmentModal({ ...assignmentModal, leadTechId: id })}
                roleFilter={['technician', 'production_manager', 'service_manager']}
                label="Lead Technician"
                placeholder="Select Lead Technician..."
                showClearButton={false}
              />

              <UserSelector
                selectedUserId={assignmentModal.projectManagerId}
                onSelect={(id) => setAssignmentModal({ ...assignmentModal, projectManagerId: id })}
                roleFilter={['production_manager', 'sales_manager', 'office_manager', 'admin']}
                label="Project Manager"
                placeholder="Select Project Manager..."
                showClearButton={false}
              />

              {assignmentModal.leadTechId && assignmentModal.projectManagerId && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Bonus Preview</h4>
                  {assignmentModal.leadTechId === assignmentModal.projectManagerId ? (
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                      <p className="text-sm text-yellow-900">
                        Same person assigned to both roles will receive 100% of the bonus.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white border border-gray-200 rounded p-3">
                        <div className="text-xs text-gray-600 mb-1">Lead Technician</div>
                        <div className="text-sm font-medium text-gray-900">65% of bonus</div>
                      </div>
                      <div className="bg-white border border-gray-200 rounded p-3">
                        <div className="text-xs text-gray-600 mb-1">Project Manager</div>
                        <div className="text-sm font-medium text-gray-900">35% of bonus</div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {(!assignmentModal.leadTechId || !assignmentModal.projectManagerId) && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-red-900">
                      <p className="font-medium">Both roles must be assigned</p>
                      <p className="mt-1">You must assign both a Lead Technician and Project Manager before saving.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setAssignmentModal({
                  isOpen: false,
                  calculationId: null,
                  leadTechId: null,
                  projectManagerId: null,
                  originalTechId: null,
                  originalPMId: null
                })}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAssignments}
                disabled={processing || !assignmentModal.leadTechId || !assignmentModal.projectManagerId}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processing ? 'Saving...' : 'Save Assignments'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
