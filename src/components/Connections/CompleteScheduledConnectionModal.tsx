import { useState, useEffect, useRef } from 'react';
import { X, Check, Calendar, Clock, FileText, Bell, AlertCircle, ChevronDown } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface CompleteScheduledConnectionModalProps {
  occurrence: {
    id: string;
    occurrence_date: string;
    scheduled_connection: {
      id: string;
      prospect_id: string;
      connection_type: string;
      default_notes?: string;
      prospect: {
        id: string;
        full_name: string;
        company_name?: string;
      };
    };
  };
  onClose: () => void;
  onSuccess: () => void;
}

export function CompleteScheduledConnectionModal({ occurrence, onClose, onSuccess }: CompleteScheduledConnectionModalProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [touchStart, setTouchStart] = useState(0);
  const [touchEnd, setTouchEnd] = useState(0);
  const modalRef = useRef<HTMLDivElement>(null);
  const [formData, setFormData] = useState({
    connection_date: new Date().toISOString().split('T')[0],
    notes: occurrence.scheduled_connection.default_notes || '',
    follow_up_needed: false,
    reminder_date: '',
    follow_up_description: ''
  });

  useEffect(() => {
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  // Handle swipe down to dismiss on mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientY);
  };

  const handleTouchEnd = () => {
    if (touchStart - touchEnd < -150) {
      // Swiped down more than 150px
      onClose();
    }
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.notes.trim()) {
      alert('Please add notes about this connection');
      return;
    }

    try {
      setLoading(true);

      // Create connection record
      const { error: connectionError } = await supabase
        .from('connections')
        .insert([{
          contact_id: occurrence.scheduled_connection.prospect_id,
          user_id: profile?.id,
          connection_type: occurrence.scheduled_connection.connection_type,
          connection_date: formData.connection_date,
          notes: formData.notes,
          follow_up_needed: formData.follow_up_needed,
          reminder_date: formData.follow_up_needed ? formData.reminder_date : null,
          follow_up_description: formData.follow_up_needed ? formData.follow_up_description : null,
          scheduled_connection_id: occurrence.scheduled_connection.id
        }]);

      if (connectionError) throw connectionError;

      // Mark occurrence as completed
      const { error: updateError } = await supabase
        .from('scheduled_connection_occurrences')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          actual_connection_date: formData.connection_date
        })
        .eq('id', occurrence.id);

      if (updateError) throw updateError;

      onSuccess();
    } catch (error) {
      console.error('Error completing connection:', error);
      alert('Failed to complete connection. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const prospectName = occurrence.scheduled_connection.prospect.full_name ||
                       occurrence.scheduled_connection.prospect.company_name ||
                       'Unknown';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50">
      {/* Mobile: Full screen bottom sheet */}
      {/* Desktop: Centered modal */}
      <div
        ref={modalRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="bg-white w-full sm:max-w-2xl sm:rounded-lg shadow-xl max-h-[90vh] flex flex-col rounded-t-3xl sm:rounded-b-lg overflow-hidden animate-slide-up"
      >
        {/* Swipe Handle (Mobile only) */}
        <div className="sm:hidden flex justify-center pt-3 pb-2">
          <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200 bg-white sticky top-0 z-10">
          <div className="flex-1 min-w-0 pr-4">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 truncate">
              Complete Connection
            </h2>
            <p className="text-sm text-gray-600 truncate mt-0.5">
              {prospectName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0 touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
            {/* Connection Type Badge */}
            <div className="flex items-center gap-2">
              <span className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                {occurrence.scheduled_connection.connection_type.replace(/_/g, ' ')}
              </span>
              <span className="text-sm text-gray-500">
                Scheduled: {new Date(occurrence.occurrence_date).toLocaleDateString()}
              </span>
            </div>

            {/* Connection Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Calendar className="w-4 h-4 inline mr-1" />
                Actual Connection Date
              </label>
              <input
                type="date"
                required
                value={formData.connection_date}
                onChange={(e) => setFormData({ ...formData, connection_date: e.target.value })}
                max={new Date().toISOString().split('T')[0]}
                className="w-full px-3 sm:px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base touch-manipulation"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <FileText className="w-4 h-4 inline mr-1" />
                Connection Notes *
              </label>
              <textarea
                required
                value={formData.notes}
                onChange={(e) => {
                  setFormData({ ...formData, notes: e.target.value });
                  // Auto-expand textarea
                  e.target.style.height = 'auto';
                  e.target.style.height = e.target.scrollHeight + 'px';
                }}
                rows={4}
                placeholder="What did you discuss? What was the outcome?"
                className="w-full px-3 sm:px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-base touch-manipulation min-h-[120px]"
                style={{ maxHeight: '300px' }}
              />
              <p className="text-xs text-gray-500 mt-1">
                {formData.notes.length} characters
              </p>
            </div>

            {/* Follow-up Toggle */}
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <label className="flex items-start gap-3 cursor-pointer touch-manipulation min-h-[44px]">
                <input
                  type="checkbox"
                  checked={formData.follow_up_needed}
                  onChange={(e) => setFormData({ ...formData, follow_up_needed: e.target.checked })}
                  className="mt-1 w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                />
                <div className="flex-1">
                  <span className="text-sm font-medium text-gray-900 block">
                    Follow-up needed
                  </span>
                  <span className="text-xs text-gray-600 block mt-0.5">
                    Set a reminder for the next action
                  </span>
                </div>
              </label>

              {/* Follow-up Details */}
              {formData.follow_up_needed && (
                <div className="mt-4 space-y-4 pl-8 border-l-2 border-blue-200">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <Bell className="w-4 h-4 inline mr-1" />
                      Reminder Date
                    </label>
                    <input
                      type="date"
                      required={formData.follow_up_needed}
                      value={formData.reminder_date}
                      onChange={(e) => setFormData({ ...formData, reminder_date: e.target.value })}
                      min={formData.connection_date}
                      className="w-full px-3 sm:px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base touch-manipulation"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Follow-up Action
                    </label>
                    <textarea
                      required={formData.follow_up_needed}
                      value={formData.follow_up_description}
                      onChange={(e) => setFormData({ ...formData, follow_up_description: e.target.value })}
                      rows={2}
                      placeholder="What needs to be done?"
                      className="w-full px-3 sm:px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-base touch-manipulation"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Info Alert */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-900">
                <p className="font-medium mb-1">This will be logged in your connection history</p>
                <p className="text-blue-700">The next occurrence will be automatically generated based on your schedule.</p>
              </div>
            </div>
          </div>

          {/* Actions - Fixed at bottom on mobile, regular on desktop */}
          <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4 sm:p-6 flex flex-col sm:flex-row gap-3">
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
              className="w-full sm:flex-1 px-4 py-3 sm:py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium text-base touch-manipulation min-h-[44px] flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Completing...
                </>
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  Complete Connection
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        @keyframes slide-up {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
        @media (min-width: 640px) {
          .animate-slide-up {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
