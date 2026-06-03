import { useState, useEffect } from 'react';
import { Shield, Calendar, Clock, MapPin, User, CheckCircle, ArrowLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface VIPWorkOrder {
  id: string;
  work_order_number: string;
  description: string;
  start_date: string;
  start_time: string;
  end_time: string;
  status: string;
  location: string | null;
  notes: string | null;
  technician: {
    full_name: string;
    phone: string | null;
  } | null;
  recurring_subscription: {
    id: string;
    plan: {
      plan_name: string;
      description: string;
    } | null;
  } | null;
}

export function PortalVIPServices() {
  const [workOrders, setWorkOrders] = useState<VIPWorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'upcoming' | 'completed'>('upcoming');

  useEffect(() => {
    loadVIPWorkOrders();
  }, [filter]);

  async function loadVIPWorkOrders() {
    try {
      const impersonatingContactId = localStorage.getItem('admin_impersonating_contact');
      let contactId: string | null = null;

      if (impersonatingContactId) {
        contactId = impersonatingContactId;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from('profiles')
          .select('contact_id')
          .eq('id', user.id)
          .maybeSingle();

        if (!profile?.contact_id) return;
        contactId = profile.contact_id;
      }

      if (!contactId) return;

      let query = supabase
        .from('work_orders')
        .select(`
          id,
          work_order_number,
          description,
          start_date,
          start_time,
          end_time,
          status,
          location,
          notes,
          technician:profiles!assigned_technician(
            full_name,
            phone
          ),
          recurring_subscription:recurring_subscriptions(
            id,
            plan:recurring_plans(
              plan_name,
              description
            )
          )
        `)
        .eq('contact_id', contactId)
        .eq('type', 'vip_program')
        .order('start_date', { ascending: true });

      if (filter === 'upcoming') {
        query = query
          .gte('start_date', new Date().toISOString().split('T')[0])
          .in('status', ['scheduled', 'in_progress']);
      } else {
        query = query.eq('status', 'completed');
      }

      const { data, error } = await query;

      if (error) throw error;

      setWorkOrders(data || []);
    } catch (error) {
      console.error('Error loading VIP work orders:', error);
    } finally {
      setLoading(false);
    }
  }

  function getStatusBadge(status: string) {
    const badges = {
      scheduled: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Scheduled' },
      in_progress: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'In Progress' },
      completed: { bg: 'bg-green-100', text: 'text-green-800', label: 'Completed' },
    };

    const badge = badges[status as keyof typeof badges] || badges.scheduled;

    return (
      <span className={`px-3 py-1 ${badge.bg} ${badge.text} text-sm font-medium rounded-full`}>
        {badge.label}
      </span>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-300">Loading your VIP services...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <a
              href="/portal"
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </a>
            <img
              src="/el_logo_color_(2).png"
              alt="Electronic Life"
              className="h-10 object-contain"
            />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">VIP Services</h1>
              <p className="text-sm text-gray-600">Your scheduled VIP service appointments</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filter Tabs */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="flex gap-4">
            <button
              onClick={() => setFilter('upcoming')}
              className={`px-4 py-3 border-b-2 font-medium transition-colors ${
                filter === 'upcoming'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Upcoming
            </button>
            <button
              onClick={() => setFilter('completed')}
              className={`px-4 py-3 border-b-2 font-medium transition-colors ${
                filter === 'completed'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Completed
            </button>
          </nav>
        </div>

        {/* Work Orders List */}
        {workOrders.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <Shield className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {filter === 'upcoming' ? 'No Upcoming Services' : 'No Completed Services'}
            </h3>
            <p className="text-gray-600">
              {filter === 'upcoming'
                ? 'You have no upcoming VIP service appointments scheduled.'
                : 'No VIP service appointments have been completed yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {workOrders.map((wo) => (
              <div
                key={wo.id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Shield className="w-6 h-6 text-purple-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        {wo.recurring_subscription?.plan?.plan_name || 'VIP Service'}
                      </h3>
                      <p className="text-sm text-gray-600">
                        Work Order #{wo.work_order_number}
                      </p>
                    </div>
                  </div>
                  {getStatusBadge(wo.status)}
                </div>

                <p className="text-gray-700 mb-4">
                  {wo.description || wo.recurring_subscription?.plan?.description || 'Regular VIP maintenance service'}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center gap-2 text-gray-700">
                    <Calendar className="w-4 h-4 text-gray-500" />
                    <span>
                      {new Date(wo.start_date).toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </span>
                  </div>

                  {(wo.start_time || wo.end_time) && (
                    <div className="flex items-center gap-2 text-gray-700">
                      <Clock className="w-4 h-4 text-gray-500" />
                      <span>
                        {wo.start_time || 'TBD'} {wo.end_time && `- ${wo.end_time}`}
                      </span>
                    </div>
                  )}

                  {wo.technician && (
                    <div className="flex items-center gap-2 text-gray-700">
                      <User className="w-4 h-4 text-gray-500" />
                      <span>{wo.technician.full_name}</span>
                    </div>
                  )}

                  {wo.location && (
                    <div className="flex items-center gap-2 text-gray-700">
                      <MapPin className="w-4 h-4 text-gray-500" />
                      <span>{wo.location}</span>
                    </div>
                  )}
                </div>

                {wo.notes && (
                  <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-700">
                      <strong>Notes:</strong> {wo.notes}
                    </p>
                  </div>
                )}

                {wo.status === 'completed' && (
                  <div className="mt-4 flex items-center gap-2 text-green-600">
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-medium">Service Completed</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* VIP Program Info */}
        <div className="mt-8 bg-purple-50 border border-purple-200 rounded-lg p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Shield className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-purple-900 mb-2">
                VIP Program Benefits
              </h3>
              <ul className="space-y-1 text-purple-800">
                <li>• Priority scheduling and service</li>
                <li>• Regular maintenance visits</li>
                <li>• Exclusive member benefits</li>
                <li>• Direct technician contact</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
