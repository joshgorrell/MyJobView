import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Star, Calendar, CheckCircle, Clock, AlertCircle, User, Phone } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmModal from '../ui/ConfirmModal';

interface VIPTracking {
  id: string;
  installation_date: string;
  status: string;
  day_30_scheduled: string | null;
  day_30_completed: string | null;
  day_30_notes: string | null;
  day_60_scheduled: string | null;
  day_60_completed: string | null;
  day_60_notes: string | null;
  day_90_scheduled: string | null;
  day_90_completed: string | null;
  day_90_notes: string | null;
  project: {
    name: string;
    project_number: string;
  };
  contact: {
    full_name: string;
    phone: string;
    email: string;
  };
  technician?: {
    full_name: string;
  };
}

interface TrialCustomer {
  id: string;
  contact_id: string;
  access_type: string;
  granted_date: string;
  expiration_date: string;
  status: string;
  project_id: string;
  contact: {
    full_name: string;
    phone: string;
    email: string;
  };
  project: {
    name: string;
    project_number: string;
  };
}

export function VIPProgramView() {
  const { profile } = useAuth();
  const [vipRecords, setVipRecords] = useState<VIPTracking[]>([]);
  const [trialCustomers, setTrialCustomers] = useState<TrialCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [confirmCompleteVisit, setConfirmCompleteVisit] = useState<{ vipId: string; day: '30' | '60' | '90' } | null>(null);

  useEffect(() => {
    loadVIPRecords();
    loadTrialCustomers();

    const channel = supabase
      .channel('vip-tracking-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'vip_program_tracking'
      }, () => {
        loadVIPRecords();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'punchlist_access_grants'
      }, () => {
        loadTrialCustomers();
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, []);

  async function loadVIPRecords() {
    try {
      let query = supabase
        .from('vip_program_tracking')
        .select(`
          *,
          project:projects(name, project_number),
          contact:contacts(full_name, phone, email),
          technician:profiles!assigned_technician(full_name)
        `)
        .order('installation_date', { ascending: false });

      if (profile?.role === 'technician' || profile?.role === 'field_tech') {
        query = query.eq('assigned_technician', profile.id);
      }

      const { data, error } = await query;

      if (error) throw error;
      setVipRecords(data || []);
    } catch (error) {
      console.error('Error loading VIP records:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadTrialCustomers() {
    try {
      const { data, error } = await supabase
        .from('punchlist_access_grants')
        .select(`
          *,
          contact:contacts(full_name, phone, email),
          project:projects(name, project_number)
        `)
        .eq('access_type', 'test_and_tune')
        .eq('status', 'active')
        .gte('expiration_date', new Date().toISOString().split('T')[0])
        .order('expiration_date', { ascending: true });

      if (error) throw error;
      setTrialCustomers(data || []);
    } catch (error) {
      console.error('Error loading trial customers:', error);
    }
  }

  async function updateVisit(vipId: string, visit: '30' | '60' | '90', field: 'scheduled' | 'completed', value: string | null) {
    const fieldName = `day_${visit}_${field}`;
    try {
      const { error } = await supabase
        .from('vip_program_tracking')
        .update({ [fieldName]: value })
        .eq('id', vipId);

      if (error) throw error;
      loadVIPRecords();
    } catch (error) {
      console.error('Error updating visit:', error);
    }
  }

  async function addNotes(vipId: string, visit: '30' | '60' | '90') {
    const notes = prompt(`Add notes for ${visit}-day visit:`);
    if (!notes) return;

    try {
      const { error } = await supabase
        .from('vip_program_tracking')
        .update({ [`day_${visit}_notes`]: notes })
        .eq('id', vipId);

      if (error) throw error;
      loadVIPRecords();
    } catch (error) {
      console.error('Error adding notes:', error);
    }
  }

  function getVisitStatus(scheduled: string | null, completed: string | null, targetDate: Date) {
    if (completed) return 'completed';
    if (scheduled) return 'scheduled';
    if (new Date() > targetDate) return 'overdue';
    return 'pending';
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'scheduled':
        return 'bg-blue-100 text-blue-800';
      case 'overdue':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

  const filteredRecords = vipRecords.filter(record => {
    if (statusFilter === 'all') return true;
    return record.status === statusFilter;
  });

  const statusCounts = {
    all: vipRecords.length,
    active: vipRecords.filter(r => r.status === 'active').length,
    completed: vipRecords.filter(r => r.status === 'completed').length,
    cancelled: vipRecords.filter(r => r.status === 'cancelled').length
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading VIP program...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
          <Star className="w-6 h-6 text-yellow-500" />
          VIP 90-Day Program
        </h2>
        <p className="text-gray-300">
          Post-installation follow-up program for customer satisfaction
        </p>
      </div>

      {trialCustomers.length > 0 && (
        <div className="bg-gray-800/30 rounded-lg p-6 border border-gray-700">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-400" />
            Test & Tune Trial Customers ({trialCustomers.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {trialCustomers.map(trial => {
              const expirationDate = new Date(trial.expiration_date);
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const daysRemaining = Math.ceil((expirationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              const isExpiringSoon = daysRemaining <= 14;

              return (
                <div
                  key={trial.id}
                  className={`rounded-lg border-2 p-4 ${
                    isExpiringSoon
                      ? 'bg-orange-900/20 border-orange-500'
                      : 'bg-blue-900/20 border-blue-500'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h4 className="font-semibold text-white">{trial.contact?.full_name}</h4>
                      <div className="text-sm text-gray-400 mt-1">
                        <div>{trial.project?.name}</div>
                        <div className="text-xs text-gray-500">{trial.project?.project_number}</div>
                      </div>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                      isExpiringSoon
                        ? 'bg-orange-500 text-white'
                        : 'bg-blue-500 text-white'
                    }`}>
                      {daysRemaining}d
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    {trial.contact?.phone && (
                      <div className="flex items-center gap-2 text-gray-400">
                        <Phone className="w-3 h-3" />
                        {trial.contact.phone}
                      </div>
                    )}
                    {trial.contact?.email && (
                      <div className="text-gray-400 text-xs truncate">
                        {trial.contact.email}
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-gray-400 pt-2 border-t border-gray-700">
                      <Calendar className="w-3 h-3" />
                      <span className="text-xs">
                        Expires: {expirationDate.toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {isExpiringSoon && (
                    <div className="mt-3 pt-3 border-t border-orange-500/30">
                      <div className="flex items-center gap-2 text-orange-400 text-xs">
                        <AlertCircle className="w-3 h-3" />
                        <span className="font-medium">Expiring soon</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-6">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <Star className="w-5 h-5 text-yellow-500" />
          VIP Program Tracking
        </h3>

        <div className="flex gap-2 border-b border-gray-700 overflow-x-auto mb-4">
          {[
            { value: 'active', label: 'Active' },
            { value: 'completed', label: 'Completed' },
            { value: 'cancelled', label: 'Cancelled' },
            { value: 'all', label: 'All' }
          ].map(filter => (
            <button
              key={filter.value}
              onClick={() => setStatusFilter(filter.value)}
              className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                statusFilter === filter.value
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
            >
              {filter.label} ({statusCounts[filter.value as keyof typeof statusCounts] || 0})
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {filteredRecords.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <Star className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No VIP records found</h3>
          </div>
        ) : (
          filteredRecords.map(record => {
            const installDate = new Date(record.installation_date);
            const day30Target = new Date(installDate);
            day30Target.setDate(day30Target.getDate() + 30);
            const day60Target = new Date(installDate);
            day60Target.setDate(day60Target.getDate() + 60);
            const day90Target = new Date(installDate);
            day90Target.setDate(day90Target.getDate() + 90);

            const visit30Status = getVisitStatus(record.day_30_scheduled, record.day_30_completed, day30Target);
            const visit60Status = getVisitStatus(record.day_60_scheduled, record.day_60_completed, day60Target);
            const visit90Status = getVisitStatus(record.day_90_scheduled, record.day_90_completed, day90Target);

            return (
              <div
                key={record.id}
                className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
              >
                <div className="bg-gradient-to-r from-yellow-50 to-orange-50 px-6 py-4 border-b border-gray-200">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{record.project?.name}</h3>
                      <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                        <span className="font-medium">{record.project?.project_number}</span>
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {record.contact?.full_name}
                        </span>
                        {record.contact?.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {record.contact.phone}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-600">Installed</div>
                      <div className="font-semibold text-gray-900">
                        {installDate.toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                  {[
                    { day: '30', status: visit30Status, scheduled: record.day_30_scheduled, completed: record.day_30_completed, notes: record.day_30_notes, target: day30Target },
                    { day: '60', status: visit60Status, scheduled: record.day_60_scheduled, completed: record.day_60_completed, notes: record.day_60_notes, target: day60Target },
                    { day: '90', status: visit90Status, scheduled: record.day_90_scheduled, completed: record.day_90_completed, notes: record.day_90_notes, target: day90Target }
                  ].map(visit => (
                    <div key={visit.day} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold text-gray-900">{visit.day}-Day Visit</h4>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(visit.status)}`}>
                          {visit.status}
                        </span>
                      </div>

                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2 text-gray-600">
                          <Calendar className="w-4 h-4" />
                          Target: {visit.target.toLocaleDateString()}
                        </div>

                        {visit.scheduled && (
                          <div className="flex items-center gap-2 text-blue-600">
                            <Clock className="w-4 h-4" />
                            Scheduled: {new Date(visit.scheduled).toLocaleDateString()}
                          </div>
                        )}

                        {visit.completed && (
                          <div className="flex items-center gap-2 text-green-600">
                            <CheckCircle className="w-4 h-4" />
                            Completed: {new Date(visit.completed).toLocaleDateString()}
                          </div>
                        )}

                        {visit.notes && (
                          <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
                            {visit.notes}
                          </div>
                        )}
                      </div>

                      <div className="mt-3 space-y-2">
                        {!visit.completed && (
                          <>
                            {!visit.scheduled ? (
                              <button
                                onClick={() => {
                                  const date = prompt('Schedule date (YYYY-MM-DD):');
                                  if (date) updateVisit(record.id, visit.day as any, 'scheduled', date);
                                }}
                                className="w-full px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                              >
                                Schedule Visit
                              </button>
                            ) : (
                              <button
                                onClick={() => setConfirmCompleteVisit({ vipId: record.id, day: visit.day as any })}
                                className="w-full px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                              >
                                Complete Visit
                              </button>
                            )}
                            <button
                              onClick={() => addNotes(record.id, visit.day as any)}
                              className="w-full px-3 py-1.5 text-xs border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
                            >
                              {visit.notes ? 'Update Notes' : 'Add Notes'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
      <ConfirmModal
        isOpen={!!confirmCompleteVisit}
        title="Complete Visit"
        message="Mark this visit as completed?"
        variant="neutral"
        confirmLabel="Complete"
        onConfirm={() => {
          if (confirmCompleteVisit) {
            const { vipId, day } = confirmCompleteVisit;
            setConfirmCompleteVisit(null);
            updateVisit(vipId, day, 'completed', new Date().toISOString());
          }
        }}
        onCancel={() => setConfirmCompleteVisit(null)}
      />
    </div>
  );
}
