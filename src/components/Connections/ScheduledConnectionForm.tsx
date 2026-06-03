import { useState, useEffect } from 'react';
import { X, Calendar, Clock, User, AlertCircle, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Prospect {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  company_name: string;
}

interface ScheduledConnectionFormProps {
  schedule?: any;
  onClose: () => void;
  onSuccess: () => void;
}

export function ScheduledConnectionForm({ schedule, onClose, onSuccess }: ScheduledConnectionFormProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [formData, setFormData] = useState({
    prospect_id: schedule?.prospect_id || '',
    connection_type: schedule?.connection_type || 'call',
    recurrence_pattern: schedule?.recurrence_pattern || 'monthly',
    recurrence_interval: schedule?.recurrence_interval || 1,
    recurrence_day_rule: schedule?.recurrence_day_rule || '',
    schedule_start_date: schedule?.schedule_start_date || new Date().toISOString().split('T')[0],
    schedule_end_date: schedule?.schedule_end_date || '',
    is_time_specific: schedule?.is_time_specific || false,
    preferred_time: schedule?.preferred_time || '09:00',
    default_notes: schedule?.default_notes || '',
    default_location: schedule?.default_location || ''
  });
  const [previewDates, setPreviewDates] = useState<string[]>([]);

  useEffect(() => {
    loadProspects();
  }, []);

  useEffect(() => {
    generatePreview();
  }, [
    formData.recurrence_pattern,
    formData.recurrence_interval,
    formData.recurrence_day_rule,
    formData.schedule_start_date
  ]);

  async function loadProspects() {
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, full_name, company_name')
        .eq('contact_type', 'prospect')
        .order('full_name');

      if (error) throw error;
      setProspects(data || []);
    } catch (error) {
      console.error('Error loading prospects:', error);
    }
  }

  function generatePreview() {
    const dates: string[] = [];
    let currentDate = new Date(formData.schedule_start_date);

    for (let i = 0; i < 5 && dates.length < 5; i++) {
      if (i === 0) {
        dates.push(currentDate.toISOString().split('T')[0]);
      } else {
        currentDate = calculateNextDate(currentDate);
        dates.push(currentDate.toISOString().split('T')[0]);
      }
    }

    setPreviewDates(dates);
  }

  function calculateNextDate(date: Date): Date {
    const next = new Date(date);

    switch (formData.recurrence_pattern) {
      case 'weekly':
        next.setDate(next.getDate() + 7 * formData.recurrence_interval);
        break;
      case 'biweekly':
        next.setDate(next.getDate() + 14);
        break;
      case 'monthly':
        next.setMonth(next.getMonth() + formData.recurrence_interval);
        break;
      case 'quarterly':
        next.setMonth(next.getMonth() + 3);
        break;
      case 'semi_annually':
        next.setMonth(next.getMonth() + 6);
        break;
      case 'annually':
        next.setFullYear(next.getFullYear() + 1);
        break;
      case 'custom':
        next.setMonth(next.getMonth() + formData.recurrence_interval);
        break;
    }

    return next;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.prospect_id) {
      alert('Please select a prospect');
      return;
    }

    try {
      setLoading(true);

      const scheduleData = {
        ...formData,
        created_by_user_id: profile?.id,
        schedule_end_date: formData.schedule_end_date || null,
        preferred_time: formData.is_time_specific ? formData.preferred_time : null,
        recurrence_day_rule: formData.recurrence_day_rule || null
      };

      if (schedule) {
        // Update existing schedule
        const { error } = await supabase
          .from('scheduled_connections')
          .update(scheduleData)
          .eq('id', schedule.id);

        if (error) throw error;
      } else {
        // Create new schedule
        const { data: newSchedule, error: insertError } = await supabase
          .from('scheduled_connections')
          .insert([scheduleData])
          .select()
          .single();

        if (insertError) throw insertError;

        // Generate initial occurrences
        if (newSchedule) {
          await supabase.rpc('generate_scheduled_occurrences');
        }
      }

      onSuccess();
    } catch (error) {
      console.error('Error saving schedule:', error);
      alert('Failed to save schedule. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50">
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-lg shadow-xl max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-b-lg overflow-hidden">
        {/* Swipe Handle (Mobile only) */}
        <div className="sm:hidden flex justify-center pt-3 pb-2 bg-white">
          <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900">
            {schedule ? 'Edit Schedule' : 'New Schedule'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Form - scrollable content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
            {/* Prospect Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <User className="w-4 h-4 inline mr-1" />
                Prospect *
              </label>
              <select
                required
                value={formData.prospect_id}
                onChange={(e) => setFormData({ ...formData, prospect_id: e.target.value })}
                className="w-full px-3 sm:px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base touch-manipulation"
              >
                <option value="">Select a prospect...</option>
                {prospects.map((prospect) => (
                  <option key={prospect.id} value={prospect.id}>
                    {prospect.full_name || prospect.company_name}
                    {prospect.company_name && prospect.full_name && ` (${prospect.company_name})`}
                  </option>
                ))}
              </select>
            </div>

            {/* Connection Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Connection Type *
              </label>
              <select
                required
                value={formData.connection_type}
                onChange={(e) => setFormData({ ...formData, connection_type: e.target.value })}
                className="w-full px-3 sm:px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base touch-manipulation"
              >
                <option value="call">Phone Call</option>
                <option value="email">Email</option>
                <option value="meeting">In-Person Meeting</option>
                <option value="site_visit">Site Visit</option>
                <option value="check_in">Quick Check-in</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* Recurrence Pattern */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Calendar className="w-4 h-4 inline mr-1" />
                Recurrence Pattern *
              </label>
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, recurrence_pattern: 'weekly', recurrence_interval: 1 })}
                  className={`px-3 sm:px-4 py-3 sm:py-3.5 rounded-lg border-2 text-sm font-medium transition-colors touch-manipulation min-h-[44px] ${
                    formData.recurrence_pattern === 'weekly'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-300 text-gray-700 hover:border-gray-400'
                  }`}
                >
                  Weekly
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, recurrence_pattern: 'biweekly', recurrence_interval: 1 })}
                  className={`px-3 sm:px-4 py-3 sm:py-3.5 rounded-lg border-2 text-sm font-medium transition-colors touch-manipulation min-h-[44px] ${
                    formData.recurrence_pattern === 'biweekly'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-300 text-gray-700 hover:border-gray-400'
                  }`}
                >
                  Bi-weekly
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, recurrence_pattern: 'monthly', recurrence_interval: 1 })}
                  className={`px-3 sm:px-4 py-3 sm:py-3.5 rounded-lg border-2 text-sm font-medium transition-colors touch-manipulation min-h-[44px] ${
                    formData.recurrence_pattern === 'monthly'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-300 text-gray-700 hover:border-gray-400'
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, recurrence_pattern: 'quarterly', recurrence_interval: 3 })}
                  className={`px-3 sm:px-4 py-3 sm:py-3.5 rounded-lg border-2 text-sm font-medium transition-colors touch-manipulation min-h-[44px] ${
                    formData.recurrence_pattern === 'quarterly'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-300 text-gray-700 hover:border-gray-400'
                  }`}
                >
                  Quarterly
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, recurrence_pattern: 'custom', recurrence_interval: 4 })}
                  className={`px-3 sm:px-4 py-3 sm:py-3.5 rounded-lg border-2 text-sm font-medium transition-colors touch-manipulation min-h-[44px] col-span-2 ${
                    formData.recurrence_pattern === 'custom'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-300 text-gray-700 hover:border-gray-400'
                  }`}
                >
                  Custom Interval
                </button>
              </div>
            </div>

            {/* Custom Interval */}
            {formData.recurrence_pattern === 'custom' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Repeat every (months)
                </label>
                <input
                  type="number"
                  min="1"
                  max="24"
                  value={formData.recurrence_interval}
                  onChange={(e) => setFormData({ ...formData, recurrence_interval: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 sm:px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base touch-manipulation"
                />
              </div>
            )}

          {/* Day Rule (Optional) */}
          {(formData.recurrence_pattern === 'monthly' || formData.recurrence_pattern === 'custom') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Specific Day (Optional)
              </label>
              <select
                value={formData.recurrence_day_rule}
                onChange={(e) => setFormData({ ...formData, recurrence_day_rule: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Any day of month</option>
                <option value="1">1st of month</option>
                <option value="15">15th of month</option>
                <option value="first_monday">First Monday</option>
                <option value="first_tuesday">First Tuesday</option>
                <option value="first_friday">First Friday</option>
              </select>
            </div>
          )}

          {/* Start Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Start Date *
            </label>
            <input
              type="date"
              required
              value={formData.schedule_start_date}
              onChange={(e) => setFormData({ ...formData, schedule_start_date: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* End Date (Optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              End Date (Optional)
            </label>
            <input
              type="date"
              value={formData.schedule_end_date}
              onChange={(e) => setFormData({ ...formData, schedule_end_date: e.target.value })}
              min={formData.schedule_start_date}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">Leave empty for ongoing schedule</p>
          </div>

          {/* Time Settings */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
              <input
                type="checkbox"
                checked={formData.is_time_specific}
                onChange={(e) => setFormData({ ...formData, is_time_specific: e.target.checked })}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Schedule at a specific time
            </label>

            {formData.is_time_specific && (
              <input
                type="time"
                step="1800"
                value={formData.preferred_time}
                onChange={(e) => setFormData({ ...formData, preferred_time: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            )}

            {!formData.is_time_specific && (
              <p className="text-sm text-gray-500 bg-blue-50 border border-blue-200 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 inline mr-1" />
                All-day events will appear at the top of your calendar and roll over to the next day if not completed
              </p>
            )}
          </div>

          {/* Template Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Template Notes (Optional)
            </label>
            <textarea
              value={formData.default_notes}
              onChange={(e) => setFormData({ ...formData, default_notes: e.target.value })}
              rows={3}
              placeholder="These notes will be pre-filled when completing the connection..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Preview */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
            <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600" />
              Next 5 Occurrences Preview
            </h4>
            <div className="space-y-2">
              {previewDates.map((date, index) => (
                <div key={index} className="flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                  <span className="text-gray-700">
                    {new Date(date).toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                    {formData.is_time_specific && formData.preferred_time && (
                      <span className="text-gray-500 ml-2">at {formData.preferred_time}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>

            {/* Actions - Fixed at bottom on mobile */}
            <div className="sticky bottom-0 bg-white border-t border-gray-200 -mx-4 sm:-mx-6 px-4 sm:px-6 py-4 flex flex-col sm:flex-row gap-3 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:flex-1 px-4 py-3 sm:py-2 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium text-base touch-manipulation min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="w-full sm:flex-1 px-4 py-3 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium text-base touch-manipulation min-h-[44px] flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="w-5 h-5" />
                    {schedule ? 'Update Schedule' : 'Create Schedule'}
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
