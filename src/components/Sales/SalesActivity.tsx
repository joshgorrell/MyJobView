import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  Phone,
  Mail,
  Calendar,
  Presentation,
  MapPin,
  FileText,
  Clock,
  Plus,
  Filter,
  User,
  Building,
  CheckCircle
} from 'lucide-react';

interface Activity {
  id: string;
  type: string;
  description: string;
  lead_id: string;
  contact_id: string;
  user_id: string;
  created_at: string;
  follow_up_date: string | null;
  metadata: any;
  user: {
    full_name: string;
  };
  lead?: {
    company_name: string;
  };
  contact?: {
    full_name: string;
    company_name: string;
  };
}

export function SalesActivity() {
  const { profile } = useAuth();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [filterType, setFilterType] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  const [newActivity, setNewActivity] = useState({
    type: 'call',
    description: '',
    lead_id: '',
    contact_id: '',
    follow_up_date: ''
  });

  const activityTypes = [
    { id: 'call', name: 'Call', icon: Phone, color: 'text-blue-600', bgColor: 'bg-blue-50' },
    { id: 'email', name: 'Email', icon: Mail, color: 'text-purple-600', bgColor: 'bg-purple-50' },
    { id: 'meeting', name: 'Meeting', icon: Calendar, color: 'text-green-600', bgColor: 'bg-green-50' },
    { id: 'demo', name: 'Demo', icon: Presentation, color: 'text-orange-600', bgColor: 'bg-orange-50' },
    { id: 'site_visit', name: 'Site Visit', icon: MapPin, color: 'text-cyan-600', bgColor: 'bg-cyan-50' },
    { id: 'proposal_sent', name: 'Proposal Sent', icon: FileText, color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
    { id: 'follow_up', name: 'Follow-up', icon: Clock, color: 'text-yellow-600', bgColor: 'bg-yellow-50' }
  ];

  useEffect(() => {
    loadActivities();

    const channel = supabase
      .channel('sales-activities')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'activity_feed'
      }, loadActivities)
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [filterType]);

  async function loadActivities() {
    try {
      const isManager = profile?.role === 'sales_manager' || profile?.role === 'admin';

      let query = supabase
        .from('activity_feed')
        .select(`
          *,
          user:profiles!user_id(full_name)
        `)
        .in('type', [
          'call',
          'email',
          'meeting',
          'demo',
          'site_visit',
          'proposal_sent',
          'follow_up',
          'lead_created',
          'lead_updated'
        ])
        .order('created_at', { ascending: false })
        .limit(50);

      if (!isManager && profile?.id) {
        query = query.eq('user_id', profile.id);
      }

      if (filterType !== 'all') {
        query = query.eq('type', filterType);
      }

      const { data, error } = await query;

      if (error) throw error;

      setActivities(data || []);
    } catch (error) {
      console.error('Error loading activities:', error);
    } finally {
      setLoading(false);
    }
  }

  async function logActivity() {
    try {
      if (!newActivity.description.trim()) {
        alert('Please enter a description');
        return;
      }

      const { error } = await supabase.from('activity_feed').insert({
        type: newActivity.type,
        user_id: profile?.id,
        metadata: {
          description: newActivity.description,
          lead_id: newActivity.lead_id || null,
          contact_id: newActivity.contact_id || null,
          follow_up_date: newActivity.follow_up_date || null
        }
      });

      if (error) throw error;

      setNewActivity({
        type: 'call',
        description: '',
        lead_id: '',
        contact_id: '',
        follow_up_date: ''
      });
      setShowAddForm(false);
      loadActivities();
    } catch (error) {
      console.error('Error logging activity:', error);
      alert('Failed to log activity. Please try again.');
    }
  }

  const getActivityIcon = (type: string) => {
    const activityType = activityTypes.find(t => t.id === type);
    if (!activityType) return Phone;
    return activityType.icon;
  };

  const getActivityColor = (type: string) => {
    const activityType = activityTypes.find(t => t.id === type);
    return activityType?.color || 'text-gray-600';
  };

  const getActivityBg = (type: string) => {
    const activityType = activityTypes.find(t => t.id === type);
    return activityType?.bgColor || 'bg-gray-50';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading activities...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
            Sales Activity
          </h2>
          <p className="text-gray-300">
            {activities.length} activities logged
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Filter className="w-4 h-4" />
            Filter
          </button>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Log Activity
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1 rounded-lg text-sm font-medium ${
                filterType === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All
            </button>
            {activityTypes.map(type => (
              <button
                key={type.id}
                onClick={() => setFilterType(type.id)}
                className={`px-3 py-1 rounded-lg text-sm font-medium ${
                  filterType === type.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {type.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {showAddForm && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Log New Activity
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Activity Type
              </label>
              <select
                value={newActivity.type}
                onChange={(e) => setNewActivity({ ...newActivity, type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {activityTypes.map(type => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                value={newActivity.description}
                onChange={(e) => setNewActivity({ ...newActivity, description: e.target.value })}
                rows={3}
                placeholder="What did you do?"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Follow-up Date (Optional)
              </label>
              <input
                type="date"
                value={newActivity.follow_up_date}
                onChange={(e) => setNewActivity({ ...newActivity, follow_up_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={logActivity}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Save Activity
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {activityTypes.map(type => {
          const count = activities.filter(a => a.type === type.id).length;
          const Icon = type.icon;
          return (
            <div key={type.id} className={`${type.bgColor} border border-gray-200 rounded-lg p-4`}>
              <div className="flex items-center gap-3">
                <Icon className={`w-5 h-5 ${type.color}`} />
                <div>
                  <p className="text-sm text-gray-600">{type.name}</p>
                  <p className={`text-2xl font-bold ${type.color}`}>{count}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-3">
        {activities.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <CheckCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No Activities Yet
            </h3>
            <p className="text-gray-600 mb-4">
              Start logging your sales activities to track your progress
            </p>
            <button
              onClick={() => setShowAddForm(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Log First Activity
            </button>
          </div>
        ) : (
          activities.map(activity => {
            const Icon = getActivityIcon(activity.type);
            const color = getActivityColor(activity.type);
            const bgColor = getActivityBg(activity.type);

            return (
              <div
                key={activity.id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-all"
              >
                <div className="flex items-start gap-4">
                  <div className={`${bgColor} p-3 rounded-lg`}>
                    <Icon className={`w-5 h-5 ${color}`} />
                  </div>

                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h4 className="font-semibold text-gray-900">
                          {activityTypes.find(t => t.id === activity.type)?.name || activity.type}
                        </h4>
                        <p className="text-gray-300">
                          {activity.metadata?.description || 'No description'}
                        </p>
                      </div>
                      <span className="text-xs text-gray-500">
                        {new Date(activity.created_at).toLocaleString()}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <div className="flex items-center gap-1">
                        <User className="w-4 h-4" />
                        <span>{activity.user?.full_name || 'Unknown'}</span>
                      </div>

                      {activity.lead?.company_name && (
                        <div className="flex items-center gap-1">
                          <Building className="w-4 h-4" />
                          <span>{activity.lead.company_name}</span>
                        </div>
                      )}

                      {activity.metadata?.follow_up_date && (
                        <div className="flex items-center gap-1 text-orange-600">
                          <Clock className="w-4 h-4" />
                          <span>
                            Follow-up: {new Date(activity.metadata.follow_up_date).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
