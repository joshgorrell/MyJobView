import { useState, useEffect } from 'react';
import { Award, Trophy, ShoppingCart, History, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmModal from '../ui/ConfirmModal';

interface Reward {
  id: string;
  name: string;
  description: string;
  points_cost: number;
  image_url: string | null;
  stock_quantity: number | null;
}

interface Transaction {
  id: string;
  points_amount: number;
  transaction_type: string;
  description: string;
  created_at: string;
}

interface Redemption {
  id: string;
  points_spent: number;
  status: string;
  created_at: string;
  rewards_catalog: { name: string };
}

interface TopPerformer {
  id: string;
  full_name: string;
  points_earned: number;
}

export function RewardsDashboard() {
  const { profile } = useAuth();
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'rewards' | 'history'>('rewards');
  const [userPoints, setUserPoints] = useState(0);
  const [topPerformers, setTopPerformers] = useState<TopPerformer[]>([]);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  useEffect(() => {
    loadData();
  }, [profile]);

  async function loadData() {
    if (!profile) return;

    try {
      const [rewardsResult, transactionsResult, redemptionsResult, topPerformersResult] = await Promise.all([
        supabase.from('rewards_catalog').select('*').eq('available', true).order('points_cost'),
        supabase
          .from('points_transactions')
          .select('*')
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('reward_redemptions')
          .select('*, rewards_catalog(name)')
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('profiles')
          .select('id, full_name, points_earned')
          .gt('points_earned', 0)
          .order('points_earned', { ascending: false })
          .limit(10),
      ]);

      setRewards(rewardsResult.data || []);
      setTransactions(transactionsResult.data || []);
      setRedemptions(redemptionsResult.data || []);
      setUserPoints(profile.points_earned || 0);
      setTopPerformers(topPerformersResult.data || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function redeemReward(reward: Reward) {
    if (!profile) return;

    if (userPoints < reward.points_cost) {
      alert(`You need ${reward.points_cost - userPoints} more points to redeem this reward.`);
      return;
    }

    try {
      const [redemptionResult, transactionResult] = await Promise.all([
        supabase.from('reward_redemptions').insert([
          {
            user_id: profile.id,
            reward_id: reward.id,
            points_spent: reward.points_cost,
            status: 'pending',
          },
        ]),
        supabase.from('points_transactions').insert([
          {
            user_id: profile.id,
            points_amount: -reward.points_cost,
            transaction_type: 'reward_redemption',
            reference_id: reward.id,
            description: `Redeemed: ${reward.name}`,
          },
        ]),
      ]);

      if (redemptionResult.error) throw redemptionResult.error;
      if (transactionResult.error) throw transactionResult.error;

      if (reward.stock_quantity !== null) {
        await supabase
          .from('rewards_catalog')
          .update({ stock_quantity: reward.stock_quantity - 1 })
          .eq('id', reward.id);
      }

      alert('Reward redeemed successfully! It will be processed by an administrator.');
      loadData();
    } catch (error) {
      console.error('Error redeeming reward:', error);
      alert('Failed to redeem reward. Please try again.');
    }
  }

  if (loading) {
    return <div className="text-center py-8 text-gray-400">Loading...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-gradient-to-r from-cyan-600 via-blue-600 to-blue-700 rounded-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold mb-2">Your Points</h2>
              <p className="text-cyan-100">Earn points by completing tasks, creating contacts, logging connections, and converting leads</p>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-2 justify-end">
                <Trophy className="w-8 h-8" />
                <span className="text-5xl font-bold">{userPoints}</span>
              </div>
              <p className="text-cyan-100 mt-1">Total Points</p>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div className="flex items-center gap-2 mb-4">
            <Trophy className="w-5 h-5 text-yellow-500" />
            <h3 className="text-lg font-bold text-white">Top Performers</h3>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {topPerformers.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">No points earned yet. Be the first!</p>
            ) : (
              topPerformers.map((performer, index) => {
              const isCurrentUser = performer.id === profile?.id;
              const medalColor = index === 0 ? 'text-yellow-500' : index === 1 ? 'text-gray-400' : index === 2 ? 'text-orange-600' : 'text-gray-600';
              return (
                <div
                  key={performer.id}
                  className={`flex items-center justify-between p-2 rounded ${
                    isCurrentUser ? 'bg-blue-900/50 border border-blue-500' : 'bg-gray-900/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`font-bold ${medalColor} w-6 text-center`}>
                      {index + 1}
                    </span>
                    <span className={`text-sm ${isCurrentUser ? 'text-white font-semibold' : 'text-gray-300'}`}>
                      {performer.full_name}
                      {isCurrentUser && ' (You)'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-yellow-500 font-bold text-sm">
                    <Award className="w-3 h-3" />
                    {performer.points_earned || 0}
                  </div>
                </div>
              );
            })
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-2 border-b border-gray-700">
        <button
          onClick={() => setActiveTab('rewards')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'rewards'
              ? 'text-cyan-400 border-b-2 border-cyan-400'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          <ShoppingCart className="w-4 h-4 inline mr-2" />
          Available Rewards
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'history'
              ? 'text-cyan-400 border-b-2 border-cyan-400'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          <History className="w-4 h-4 inline mr-2" />
          History
        </button>
      </div>

      {activeTab === 'rewards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rewards.length === 0 ? (
            <div className="col-span-full text-center py-12">
              <Award className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">No rewards available yet</p>
            </div>
          ) : (
            rewards.map((reward) => (
              <div key={reward.id} className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700">
                {reward.image_url && (
                  <img src={reward.image_url} alt={reward.name} className="w-full h-48 object-cover" />
                )}
                <div className="p-4">
                  <h3 className="text-xl font-semibold text-white mb-2">{reward.name}</h3>
                  <p className="text-gray-400 text-sm mb-4">{reward.description}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Award className="w-5 h-5 text-cyan-400" />
                      <span className="text-2xl font-bold text-cyan-400">{reward.points_cost}</span>
                    </div>
                    {reward.stock_quantity !== null && (
                      <span className="text-gray-500 text-sm">
                        {reward.stock_quantity > 0 ? `${reward.stock_quantity} left` : 'Out of stock'}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setConfirmModal({ title: 'Redeem Reward', message: `Redeem ${reward.name} for ${reward.points_cost} points?`, onConfirm: () => redeemReward(reward) })}
                    disabled={
                      userPoints < reward.points_cost ||
                      (reward.stock_quantity !== null && reward.stock_quantity <= 0)
                    }
                    className="w-full mt-4 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  >
                    {userPoints < reward.points_cost
                      ? `Need ${reward.points_cost - userPoints} more points`
                      : reward.stock_quantity !== null && reward.stock_quantity <= 0
                      ? 'Out of Stock'
                      : 'Redeem'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-6">
          <div>
            <h3 className="text-xl font-semibold text-white mb-4">Your Redemptions</h3>
            <div className="space-y-3">
              {redemptions.length === 0 ? (
                <p className="text-gray-400 text-center py-8">No redemptions yet</p>
              ) : (
                redemptions.map((redemption) => (
                  <div key={redemption.id} className="bg-gray-800 rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <h4 className="text-white font-medium">{redemption.rewards_catalog.name}</h4>
                      <p className="text-gray-400 text-sm">{redemption.points_spent} points</p>
                      <p className="text-gray-500 text-xs mt-1">
                        {new Date(redemption.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium ${
                        redemption.status === 'pending'
                          ? 'bg-yellow-500/20 text-yellow-300'
                          : redemption.status === 'approved'
                          ? 'bg-blue-500/20 text-blue-300'
                          : redemption.status === 'fulfilled'
                          ? 'bg-green-500/20 text-green-300'
                          : 'bg-red-500/20 text-red-300'
                      }`}
                    >
                      {redemption.status === 'fulfilled' && <Check className="w-4 h-4 inline mr-1" />}
                      {redemption.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <h3 className="text-xl font-semibold text-white mb-4">Points History</h3>
            <div className="space-y-2">
              {transactions.length === 0 ? (
                <p className="text-gray-400 text-center py-8">No transactions yet</p>
              ) : (
                transactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    className="bg-gray-800 rounded-lg p-4 flex items-center justify-between"
                  >
                    <div className="flex-1">
                      <p className="text-white">{transaction.description}</p>
                      <p className="text-gray-500 text-xs mt-1">
                        {new Date(transaction.created_at).toLocaleDateString()} at{' '}
                        {new Date(transaction.created_at).toLocaleTimeString()}
                      </p>
                    </div>
                    <span
                      className={`text-xl font-bold ${
                        transaction.points_amount > 0 ? 'text-green-400' : 'text-red-400'
                      }`}
                    >
                      {transaction.points_amount > 0 ? '+' : ''}
                      {transaction.points_amount}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmModal !== null}
        title={confirmModal?.title ?? ''}
        message={confirmModal?.message ?? ''}
        variant="warning"
        confirmLabel="Redeem"
        onConfirm={() => { confirmModal?.onConfirm(); setConfirmModal(null); }}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}
