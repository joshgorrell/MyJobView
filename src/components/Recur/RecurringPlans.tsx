import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Edit2, Trash2, DollarSign, Search } from 'lucide-react';
import CreatePlanModal from './CreatePlanModal';
import ConfirmModal from '../ui/ConfirmModal';

interface RecurringPlan {
  id: string;
  plan_name: string;
  description: string;
  billing_frequency: string;
  amount: number;
  tax_rate: number;
  is_active: boolean;
  plan_type: string;
  created_at: string;
}

interface RecurringPlansProps {
  planType?: string;
}

export default function RecurringPlans({ planType }: RecurringPlansProps) {
  const [plans, setPlans] = useState<RecurringPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingPlan, setEditingPlan] = useState<RecurringPlan | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadPlans();
  }, []);

  async function loadPlans() {
    try {
      setLoading(true);
      let query = supabase
        .from('recurring_plans')
        .select('*');

      if (planType) {
        query = query.eq('plan_type', planType);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      setPlans(data || []);
    } catch (error) {
      console.error('Error loading plans:', error);
    } finally {
      setLoading(false);
    }
  }

  async function togglePlanStatus(plan: RecurringPlan) {
    try {
      const { error } = await supabase
        .from('recurring_plans')
        .update({ is_active: !plan.is_active })
        .eq('id', plan.id);

      if (error) throw error;
      await loadPlans();
    } catch (error) {
      console.error('Error toggling plan status:', error);
      alert('Failed to update plan status');
    }
  }

  async function deletePlan(id: string) {
    try {
      const { error } = await supabase
        .from('recurring_plans')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await loadPlans();
    } catch (error) {
      console.error('Error deleting plan:', error);
    }
  }

  function handlePlanCreated() {
    setShowCreateModal(false);
    setEditingPlan(null);
    loadPlans();
  }

  const frequencyLabels: Record<string, string> = {
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    yearly: 'Yearly',
  };

  const filteredPlans = plans.filter(plan =>
    plan.plan_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    plan.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading plans...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <h2 className="text-xl font-bold text-white">
          {planType === 'vip_plan' ? 'VIP Plans' : 'Recurring Plans'}
        </h2>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search plans..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-64 bg-gray-700 border border-gray-600 rounded-lg pl-10 pr-4 py-2 text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
          >
            <Plus size={20} />
            Create Plan
          </button>
        </div>
      </div>

      {filteredPlans.length === 0 ? (
        <div className="text-center py-12 bg-gray-800 rounded-lg border border-gray-700">
          <DollarSign className="mx-auto text-gray-600 mb-4" size={48} />
          <p className="text-gray-400 mb-4">
            {searchQuery ? 'No plans match your search' : 'No recurring plans yet'}
          </p>
          {!searchQuery && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors"
            >
              Create Your First Plan
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPlans.map((plan) => (
            <div
              key={plan.id}
              className="bg-gray-800 rounded-lg p-6 border border-gray-700"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white mb-1">
                    {plan.plan_name}
                  </h3>
                  <p className="text-sm text-gray-400">{plan.description}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditingPlan(plan);
                      setShowCreateModal(true);
                    }}
                    className="text-gray-400 hover:text-blue-400 transition-colors"
                  >
                    <Edit2 size={18} />
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(plan.id)}
                    className="text-gray-400 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex justify-between">
                  <span className="text-gray-400">Amount:</span>
                  <span className="text-white font-semibold">
                    ${plan.amount.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Frequency:</span>
                  <span className="text-white">
                    {frequencyLabels[plan.billing_frequency]}
                  </span>
                </div>
                {plan.tax_rate > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Tax Rate:</span>
                    <span className="text-white">
                      {(plan.tax_rate * 100).toFixed(2)}%
                    </span>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-gray-700">
                <button
                  onClick={() => togglePlanStatus(plan)}
                  className={`w-full px-4 py-2 rounded-lg transition-colors ${
                    plan.is_active
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-gray-600 hover:bg-gray-700 text-gray-300'
                  }`}
                >
                  {plan.is_active ? 'Active' : 'Inactive'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreatePlanModal
          plan={editingPlan}
          planType={planType}
          onClose={() => {
            setShowCreateModal(false);
            setEditingPlan(null);
          }}
          onSaved={handlePlanCreated}
        />
      )}

      <ConfirmModal
        isOpen={confirmDeleteId !== null}
        title="Delete Plan"
        message="Are you sure you want to delete this plan? This cannot be undone."
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => { const id = confirmDeleteId; setConfirmDeleteId(null); id && deletePlan(id); }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
