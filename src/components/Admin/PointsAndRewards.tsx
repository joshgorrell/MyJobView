import { useState, useEffect } from 'react';
import { Award, Plus, Edit2, Trash2, Save, X, DollarSign, Package } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmModal from '../ui/ConfirmModal';

interface PointsConfig {
  id: string;
  task_completion_points: number;
  question_answer_points: number;
  contact_created_points: number;
  connection_logged_points: number;
  lead_created_points: number;
  lead_claimed_points: number;
  lead_converted_points: number;
  manual_entry_points_loss: number;
}

interface Reward {
  id: string;
  name: string;
  description: string;
  points_cost: number;
  image_url: string | null;
  available: boolean;
  stock_quantity: number | null;
}

interface RewardRedemption {
  id: string;
  user_id: string;
  reward_id: string;
  points_spent: number;
  status: string;
  created_at: string;
  profiles: { full_name: string };
  rewards_catalog: { name: string };
}

export function PointsAndRewards() {
  const { profile } = useAuth();
  const [pointsConfig, setPointsConfig] = useState<PointsConfig | null>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [redemptions, setRedemptions] = useState<RewardRedemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingReward, setEditingReward] = useState<Reward | null>(null);
  const [showRewardForm, setShowRewardForm] = useState(false);
  const [activeTab, setActiveTab] = useState<'points' | 'rewards' | 'redemptions'>('points');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [rewardForm, setRewardForm] = useState({
    name: '',
    description: '',
    points_cost: 100,
    image_url: '',
    available: true,
    stock_quantity: null as number | null,
  });

  const [pointsForm, setPointsForm] = useState({
    task_completion_points: 10,
    question_answer_points: 5,
    contact_created_points: 5,
    connection_logged_points: 10,
    lead_created_points: 20,
    lead_claimed_points: 15,
    lead_converted_points: 50,
    manual_entry_points_loss: 10,
  });

  const [photoUploadPoints, setPhotoUploadPoints] = useState(1);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [configResult, rewardsResult, redemptionsResult, companySettings] = await Promise.all([
        supabase.from('points_configuration').select('*').single(),
        supabase.from('rewards_catalog').select('*').order('created_at', { ascending: false }),
        supabase
          .from('reward_redemptions')
          .select(`
            *,
            profiles(full_name),
            rewards_catalog(name)
          `)
          .order('created_at', { ascending: false }),
        supabase.from('company_settings').select('id, photo_upload_points').maybeSingle(),
      ]);

      if (configResult.data) {
        setPointsConfig(configResult.data);
        setPointsForm({
          task_completion_points: configResult.data.task_completion_points,
          question_answer_points: configResult.data.question_answer_points,
          contact_created_points: configResult.data.contact_created_points || 5,
          connection_logged_points: configResult.data.connection_logged_points || 10,
          lead_created_points: configResult.data.lead_created_points || 20,
          lead_claimed_points: configResult.data.lead_claimed_points || 15,
          lead_converted_points: configResult.data.lead_converted_points || 50,
          manual_entry_points_loss: configResult.data.manual_entry_points_loss || 10,
        });
      }

      if (companySettings.data?.photo_upload_points !== undefined) {
        setPhotoUploadPoints(companySettings.data.photo_upload_points);
      }

      setRewards(rewardsResult.data || []);
      setRedemptions(redemptionsResult.data || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function savePointsConfig() {
    try {
      // Save points configuration
      if (pointsConfig) {
        await supabase
          .from('points_configuration')
          .update(pointsForm)
          .eq('id', pointsConfig.id);
      } else {
        await supabase
          .from('points_configuration')
          .insert([{ ...pointsForm, company_id: profile?.id }]);
      }

      // Save photo upload points to company settings
      const { data: settings } = await supabase
        .from('company_settings')
        .select('id')
        .maybeSingle();

      if (settings?.id) {
        await supabase
          .from('company_settings')
          .update({ photo_upload_points: photoUploadPoints })
          .eq('id', settings.id);
      }

      alert('Points configuration saved!');
      loadData();
    } catch (error) {
      console.error('Error saving points config:', error);
      alert('Failed to save points configuration');
    }
  }

  async function saveReward() {
    try {
      if (editingReward) {
        await supabase
          .from('rewards_catalog')
          .update(rewardForm)
          .eq('id', editingReward.id);
      } else {
        await supabase
          .from('rewards_catalog')
          .insert([{ ...rewardForm, company_id: profile?.id }]);
      }

      setShowRewardForm(false);
      setEditingReward(null);
      setRewardForm({
        name: '',
        description: '',
        points_cost: 100,
        image_url: '',
        available: true,
        stock_quantity: null,
      });
      loadData();
    } catch (error) {
      console.error('Error saving reward:', error);
      alert('Failed to save reward');
    }
  }

  async function deleteReward(id: string) {
    try {
      await supabase.from('rewards_catalog').delete().eq('id', id);
      loadData();
    } catch (error) {
      console.error('Error deleting reward:', error);
      alert('Failed to delete reward');
    }
  }

  async function updateRedemptionStatus(id: string, status: string) {
    try {
      await supabase
        .from('reward_redemptions')
        .update({
          status,
          fulfilled_at: status === 'fulfilled' ? new Date().toISOString() : null,
        })
        .eq('id', id);

      loadData();
    } catch (error) {
      console.error('Error updating redemption:', error);
      alert('Failed to update redemption status');
    }
  }

  function startEditReward(reward: Reward) {
    setEditingReward(reward);
    setRewardForm({
      name: reward.name,
      description: reward.description,
      points_cost: reward.points_cost,
      image_url: reward.image_url || '',
      available: reward.available,
      stock_quantity: reward.stock_quantity,
    });
    setShowRewardForm(true);
  }

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl sm:text-2xl font-bold text-white">Points & Rewards System</h2>
      </div>

      <div className="flex gap-2 border-b border-gray-700">
        <button
          onClick={() => setActiveTab('points')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'points'
              ? 'text-cyan-400 border-b-2 border-cyan-400'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          <Award className="w-4 h-4 inline mr-2" />
          Points Configuration
        </button>
        <button
          onClick={() => setActiveTab('rewards')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'rewards'
              ? 'text-cyan-400 border-b-2 border-cyan-400'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          <Package className="w-4 h-4 inline mr-2" />
          Rewards Catalog
        </button>
        <button
          onClick={() => setActiveTab('redemptions')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'redemptions'
              ? 'text-cyan-400 border-b-2 border-cyan-400'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          <DollarSign className="w-4 h-4 inline mr-2" />
          Redemptions
        </button>
      </div>

      {activeTab === 'points' && (
        <div className="bg-gray-800 rounded-lg p-4 sm:p-6">
          <h3 className="text-lg sm:text-xl font-semibold text-white mb-4">Points Values</h3>
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-white mb-4 border-b border-gray-700 pb-2">Activity Points</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Contact Created
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={pointsForm.contact_created_points}
                    onChange={(e) =>
                      setPointsForm({ ...pointsForm, contact_created_points: parseInt(e.target.value) || 0 })
                    }
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-cyan-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Points awarded when a rep creates a new contact</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Connection Logged
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={pointsForm.connection_logged_points}
                    onChange={(e) =>
                      setPointsForm({ ...pointsForm, connection_logged_points: parseInt(e.target.value) || 0 })
                    }
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-cyan-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Points awarded when a rep logs a connection</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Lead Created
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={pointsForm.lead_created_points}
                    onChange={(e) =>
                      setPointsForm({ ...pointsForm, lead_created_points: parseInt(e.target.value) || 0 })
                    }
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-cyan-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Points awarded when a rep creates a lead</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Lead Claimed
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={pointsForm.lead_claimed_points}
                    onChange={(e) =>
                      setPointsForm({ ...pointsForm, lead_claimed_points: parseInt(e.target.value) || 0 })
                    }
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-cyan-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Points awarded when a rep claims a lead from fishbowl</p>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Lead Converted
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={pointsForm.lead_converted_points}
                    onChange={(e) =>
                      setPointsForm({ ...pointsForm, lead_converted_points: parseInt(e.target.value) || 0 })
                    }
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-cyan-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Points awarded when a rep converts a lead to won/closed</p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-white mb-4 border-b border-gray-700 pb-2">Production & Documentation Points</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Photo Upload
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={photoUploadPoints}
                    onChange={(e) => setPhotoUploadPoints(parseInt(e.target.value) || 0)}
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-cyan-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Points awarded for each job photo uploaded</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Task Completion
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={pointsForm.task_completion_points}
                    onChange={(e) =>
                      setPointsForm({ ...pointsForm, task_completion_points: parseInt(e.target.value) || 0 })
                    }
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-cyan-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Points awarded when a task is completed</p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-red-400 mb-4 border-b border-gray-700 pb-2">Points Deductions</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Manual Time Entry
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={pointsForm.manual_entry_points_loss}
                    onChange={(e) =>
                      setPointsForm({ ...pointsForm, manual_entry_points_loss: parseInt(e.target.value) || 0 })
                    }
                    className="w-full px-4 py-2 bg-gray-900 border border-red-700 text-white rounded-lg focus:ring-2 focus:ring-red-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Points deducted when admin creates manual time entry for employee who forgot to clock in/out</p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-white mb-4 border-b border-gray-700 pb-2">Discussion Points</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Question Answer
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={pointsForm.question_answer_points}
                    onChange={(e) =>
                      setPointsForm({ ...pointsForm, question_answer_points: parseInt(e.target.value) || 0 })
                    }
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-cyan-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Points awarded when answering a question</p>
                </div>
              </div>
            </div>

            <button
              onClick={savePointsConfig}
              className="px-6 py-3 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors flex items-center gap-2 font-medium"
            >
              <Save className="w-5 h-5" />
              Save Points Configuration
            </button>
          </div>
        </div>
      )}

      {activeTab === 'rewards' && (
        <div className="space-y-4">
          <button
            onClick={() => {
              setShowRewardForm(true);
              setEditingReward(null);
              setRewardForm({
                name: '',
                description: '',
                points_cost: 100,
                image_url: '',
                available: true,
                stock_quantity: null,
              });
            }}
            className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Reward
          </button>

          {showRewardForm && (
            <div className="bg-gray-800 rounded-lg p-4 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold text-white">
                  {editingReward ? 'Edit Reward' : 'New Reward'}
                </h3>
                <button
                  onClick={() => {
                    setShowRewardForm(false);
                    setEditingReward(null);
                  }}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Name</label>
                <input
                  type="text"
                  value={rewardForm.name}
                  onChange={(e) => setRewardForm({ ...rewardForm, name: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 text-white rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
                <textarea
                  value={rewardForm.description}
                  onChange={(e) => setRewardForm({ ...rewardForm, description: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 text-white rounded-lg"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Points Cost</label>
                <input
                  type="number"
                  min="1"
                  value={rewardForm.points_cost}
                  onChange={(e) => setRewardForm({ ...rewardForm, points_cost: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 text-white rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Image URL (optional)</label>
                <input
                  type="text"
                  value={rewardForm.image_url}
                  onChange={(e) => setRewardForm({ ...rewardForm, image_url: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 text-white rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Stock Quantity (leave empty for unlimited)
                </label>
                <input
                  type="number"
                  min="0"
                  value={rewardForm.stock_quantity || ''}
                  onChange={(e) =>
                    setRewardForm({ ...rewardForm, stock_quantity: e.target.value ? parseInt(e.target.value) : null })
                  }
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 text-white rounded-lg"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={rewardForm.available}
                  onChange={(e) => setRewardForm({ ...rewardForm, available: e.target.checked })}
                  className="w-4 h-4"
                />
                <label className="text-sm text-gray-300">Available for redemption</label>
              </div>
              <button
                onClick={saveReward}
                className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                {editingReward ? 'Update Reward' : 'Create Reward'}
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {rewards.map((reward) => (
              <div key={reward.id} className="bg-gray-800 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="text-lg font-semibold text-white">{reward.name}</h4>
                    <p className="text-gray-400 text-sm mt-1">{reward.description}</p>
                    <div className="mt-3 flex items-center gap-4 text-sm">
                      <span className="text-cyan-400 font-semibold">{reward.points_cost} points</span>
                      {reward.stock_quantity !== null && (
                        <span className="text-gray-400">Stock: {reward.stock_quantity}</span>
                      )}
                      <span className={reward.available ? 'text-green-400' : 'text-red-400'}>
                        {reward.available ? 'Available' : 'Unavailable'}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => startEditReward(reward)}
                      className="p-2 text-gray-400 hover:text-cyan-400 transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(reward.id)}
                      className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'redemptions' && (
        <div className="space-y-4">
          {redemptions.length === 0 ? (
            <p className="text-gray-400 text-center py-8">No redemptions yet</p>
          ) : (
            <div className="space-y-3">
              {redemptions.map((redemption) => (
                <div key={redemption.id} className="bg-gray-800 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-white font-medium">{redemption.profiles.full_name}</h4>
                      <p className="text-gray-400 text-sm">{redemption.rewards_catalog.name}</p>
                      <p className="text-cyan-400 text-sm mt-1">{redemption.points_spent} points</p>
                      <p className="text-gray-500 text-xs mt-1">
                        {new Date(redemption.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-3 py-1 rounded-full text-sm ${
                          redemption.status === 'pending'
                            ? 'bg-yellow-500/20 text-yellow-300'
                            : redemption.status === 'approved'
                            ? 'bg-blue-500/20 text-blue-300'
                            : redemption.status === 'fulfilled'
                            ? 'bg-green-500/20 text-green-300'
                            : 'bg-red-500/20 text-red-300'
                        }`}
                      >
                        {redemption.status}
                      </span>
                      {redemption.status === 'pending' && (
                        <>
                          <button
                            onClick={() => updateRedemptionStatus(redemption.id, 'approved')}
                            className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => updateRedemptionStatus(redemption.id, 'cancelled')}
                            className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                      {redemption.status === 'approved' && (
                        <button
                          onClick={() => updateRedemptionStatus(redemption.id, 'fulfilled')}
                          className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                        >
                          Mark Fulfilled
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={confirmDeleteId !== null}
        title="Delete Reward"
        message="Are you sure you want to delete this reward?"
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => {
          if (confirmDeleteId) deleteReward(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
