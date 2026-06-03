import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Edit2, Pause, Play, X, Calendar, Shield, Award, List, Search } from 'lucide-react';
import CreateSubscriptionModal from './CreateSubscriptionModal';
import ConfirmModal from '../ui/ConfirmModal';

interface Subscription {
  id: string;
  contact_id: string;
  plan_id: string;
  custom_amount: number | null;
  start_date: string;
  end_date: string | null;
  next_billing_date: string;
  status: string;
  notes: string;
  created_at: string;
  contacts: {
    contact_name: string;
  };
  recurring_plans: {
    plan_name: string;
    billing_frequency: string;
    amount: number;
    plan_type: string;
  };
}

interface SubscriptionsListProps {
  planType?: string;
}

export default function SubscriptionsList({ planType }: SubscriptionsListProps) {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingSubscription, setEditingSubscription] = useState<Subscription | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

  useEffect(() => {
    loadSubscriptions();
  }, []);

  async function loadSubscriptions() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('recurring_subscriptions')
        .select(`
          *,
          contacts(contact_name),
          recurring_plans(plan_name, billing_frequency, amount, plan_type)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSubscriptions(data || []);
    } catch (error) {
      console.error('Error loading subscriptions:', error);
    } finally {
      setLoading(false);
    }
  }

  async function toggleSubscriptionStatus(subscription: Subscription) {
    try {
      const newStatus = subscription.status === 'active' ? 'paused' : 'active';
      const { error } = await supabase
        .from('recurring_subscriptions')
        .update({ status: newStatus })
        .eq('id', subscription.id);

      if (error) throw error;
      await loadSubscriptions();
    } catch (error) {
      console.error('Error toggling subscription status:', error);
      alert('Failed to update subscription status');
    }
  }

  async function cancelSubscription(id: string) {
    try {
      const { error } = await supabase
        .from('recurring_subscriptions')
        .update({ status: 'cancelled', end_date: new Date().toISOString().split('T')[0] })
        .eq('id', id);

      if (error) throw error;
      await loadSubscriptions();
    } catch (error) {
      console.error('Error cancelling subscription:', error);
    }
  }

  function handleSubscriptionSaved() {
    setShowCreateModal(false);
    setEditingSubscription(null);
    loadSubscriptions();
  }

  let filteredSubscriptions = filterStatus === 'all'
    ? subscriptions
    : subscriptions.filter(sub => sub.status === filterStatus);

  if (planType) {
    filteredSubscriptions = filteredSubscriptions.filter(sub =>
      sub.recurring_plans?.plan_type === planType
    );
  }

  if (searchQuery) {
    filteredSubscriptions = filteredSubscriptions.filter(sub =>
      sub.contacts?.contact_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sub.recurring_plans?.plan_name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }

  const statusColors: Record<string, string> = {
    active: 'bg-green-500/20 text-green-400 border-green-500/30',
    paused: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
    expired: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading subscriptions...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-xl font-bold text-white">
            {planType === 'security_contract' ? 'Security Contracts' : 'Subscriptions'}
          </h2>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
          >
            <Plus size={20} />
            New Subscription
          </button>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search by customer or plan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-10 pr-4 py-2 text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="cancelled">Cancelled</option>
            <option value="expired">Expired</option>
          </select>
        </div>
      </div>

      {filteredSubscriptions.length === 0 ? (
        <div className="text-center py-12 bg-gray-800 rounded-lg border border-gray-700">
          <Calendar className="mx-auto text-gray-600 mb-4" size={48} />
          <p className="text-gray-400 mb-4">
            {filterStatus === 'all' ? 'No subscriptions yet' : `No ${filterStatus} subscriptions`}
          </p>
          {filterStatus === 'all' && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors"
            >
              Create First Subscription
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredSubscriptions.map((subscription) => {
            const amount = subscription.custom_amount || subscription.recurring_plans?.amount || 0;
            const planType = subscription.recurring_plans?.plan_type;

            const getTypeIcon = () => {
              if (planType === 'security_contract') return <Shield className="w-4 h-4" />;
              if (planType === 'vip_plan') return <Award className="w-4 h-4" />;
              return <List className="w-4 h-4" />;
            };

            const getTypeBadge = () => {
              if (planType === 'security_contract') {
                return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
              }
              if (planType === 'vip_plan') {
                return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
              }
              return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
            };

            const getTypeLabel = () => {
              if (planType === 'security_contract') return 'Security';
              if (planType === 'vip_plan') return 'VIP';
              return 'Standard';
            };

            return (
              <div
                key={subscription.id}
                className="bg-gray-800 rounded-lg p-6 border border-gray-700"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <h3 className="text-lg font-semibold text-white">
                        {subscription.contacts?.contact_name || 'Unknown Contact'}
                      </h3>
                      <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${getTypeBadge()}`}>
                        {getTypeIcon()}
                        {getTypeLabel()}
                      </span>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${statusColors[subscription.status]}`}>
                        {subscription.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400">
                      {subscription.recurring_plans?.plan_name || 'No Plan'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEditingSubscription(subscription);
                        setShowCreateModal(true);
                      }}
                      className="text-gray-400 hover:text-blue-400 transition-colors"
                    >
                      <Edit2 size={18} />
                    </button>
                    {subscription.status !== 'cancelled' && (
                      <>
                        <button
                          onClick={() => toggleSubscriptionStatus(subscription)}
                          className="text-gray-400 hover:text-yellow-400 transition-colors"
                        >
                          {subscription.status === 'active' ? <Pause size={18} /> : <Play size={18} />}
                        </button>
                        <button
                          onClick={() => setConfirmCancelId(subscription.id)}
                          className="text-gray-400 hover:text-red-400 transition-colors"
                        >
                          <X size={18} />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Amount</p>
                    <p className="text-white font-semibold">${amount.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Frequency</p>
                    <p className="text-white capitalize">
                      {subscription.recurring_plans?.billing_frequency || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Next Billing</p>
                    <p className="text-white">
                      {new Date(subscription.next_billing_date).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Start Date</p>
                    <p className="text-white">
                      {new Date(subscription.start_date).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {subscription.notes && (
                  <div className="mt-4 pt-4 border-t border-gray-700">
                    <p className="text-sm text-gray-400">{subscription.notes}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showCreateModal && (
        <CreateSubscriptionModal
          subscription={editingSubscription}
          onClose={() => {
            setShowCreateModal(false);
            setEditingSubscription(null);
          }}
          onSaved={handleSubscriptionSaved}
        />
      )}

      <ConfirmModal
        isOpen={confirmCancelId !== null}
        title="Cancel Subscription"
        message="Are you sure you want to cancel this subscription?"
        variant="danger"
        confirmLabel="Cancel Subscription"
        onConfirm={() => { const id = confirmCancelId; setConfirmCancelId(null); id && cancelSubscription(id); }}
        onCancel={() => setConfirmCancelId(null)}
      />
    </div>
  );
}
