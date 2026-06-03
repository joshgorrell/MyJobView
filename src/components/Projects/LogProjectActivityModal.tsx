import React, { useState } from 'react';
import { X, MapPin, Pencil, Users, Car, FileText, Clock, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface LogProjectActivityModalProps {
  projectId: string;
  projectName: string;
  onClose: () => void;
  onSave: () => void;
}

type ActivityType = 'site_survey' | 'planning_design' | 'client_meeting' | 'travel' | 'other';

const ACTIVITY_TYPES: { id: ActivityType; label: string; icon: React.ReactNode; color: string }[] = [
  {
    id: 'site_survey',
    label: 'Site Survey',
    icon: <MapPin size={20} />,
    color: 'text-cyan-400 border-cyan-500/40 bg-cyan-500/10',
  },
  {
    id: 'planning_design',
    label: 'Planning / Design',
    icon: <Pencil size={20} />,
    color: 'text-blue-400 border-blue-500/40 bg-blue-500/10',
  },
  {
    id: 'client_meeting',
    label: 'Client Meeting',
    icon: <Users size={20} />,
    color: 'text-green-400 border-green-500/40 bg-green-500/10',
  },
  {
    id: 'travel',
    label: 'Travel',
    icon: <Car size={20} />,
    color: 'text-amber-400 border-amber-500/40 bg-amber-500/10',
  },
  {
    id: 'other',
    label: 'Other',
    icon: <FileText size={20} />,
    color: 'text-gray-400 border-gray-500/40 bg-gray-500/10',
  },
];

const QUICK_DURATIONS = [
  { label: '30 min', minutes: 30 },
  { label: '1 hr', minutes: 60 },
  { label: '2 hrs', minutes: 120 },
  { label: '3 hrs', minutes: 180 },
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function LogProjectActivityModal({
  projectId,
  projectName,
  onClose,
  onSave,
}: LogProjectActivityModalProps) {
  const { profile } = useAuth();

  const [activityType, setActivityType] = useState<ActivityType | null>(null);
  const [durationMinutes, setDurationMinutes] = useState<number | null>(null);
  const [customDuration, setCustomDuration] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [notes, setNotes] = useState('');
  const [loggedAt, setLoggedAt] = useState(todayStr());
  const [saving, setSaving] = useState(false);
  const [notesError, setNotesError] = useState(false);

  const effectiveDuration = showCustom
    ? customDuration
      ? Math.round(parseFloat(customDuration) * 60)
      : null
    : durationMinutes;

  const canSave =
    activityType !== null &&
    effectiveDuration !== null &&
    effectiveDuration > 0 &&
    notes.trim().length > 0;

  async function handleSave() {
    if (!canSave) {
      if (!notes.trim()) setNotesError(true);
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('project_activity_logs').insert({
        project_id: projectId,
        logged_by: profile?.id,
        company_id: profile?.company_id,
        activity_type: activityType,
        duration_minutes: effectiveDuration,
        notes: notes.trim(),
        logged_at: loggedAt,
      });

      if (error) throw error;

      onSave();
      onClose();
    } catch (err) {
      console.error('Error saving activity log:', err);
    } finally {
      setSaving(false);
    }
  }

  function selectQuickDuration(minutes: number) {
    setDurationMinutes(minutes);
    setShowCustom(false);
    setCustomDuration('');
  }

  function handleCustomToggle() {
    setShowCustom(true);
    setDurationMinutes(null);
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-700">
          <div>
            <h2 className="text-lg font-bold text-white">Log Project Activity</h2>
            <p className="text-sm text-gray-400 mt-0.5 truncate max-w-xs">{projectName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Activity Type */}
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-3">
              Activity Type <span className="text-red-400">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ACTIVITY_TYPES.map((type) => {
                const selected = activityType === type.id;
                return (
                  <button
                    key={type.id}
                    onClick={() => setActivityType(type.id)}
                    className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all text-sm font-medium ${
                      selected
                        ? `${type.color} border-current shadow-lg scale-[1.02]`
                        : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                    }`}
                  >
                    {type.icon}
                    <span className="text-center leading-tight">{type.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-3">
              Duration <span className="text-red-400">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {QUICK_DURATIONS.map((d) => {
                const selected = !showCustom && durationMinutes === d.minutes;
                return (
                  <button
                    key={d.minutes}
                    onClick={() => selectQuickDuration(d.minutes)}
                    className={`flex-1 min-w-[72px] px-4 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                      selected
                        ? 'border-blue-500 bg-blue-500/20 text-blue-300 scale-[1.03]'
                        : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-500 hover:text-white'
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
              <button
                onClick={handleCustomToggle}
                className={`flex-1 min-w-[72px] px-4 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                  showCustom
                    ? 'border-blue-500 bg-blue-500/20 text-blue-300 scale-[1.03]'
                    : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-500 hover:text-white'
                }`}
              >
                Custom
              </button>
            </div>

            {showCustom && (
              <div className="mt-3 flex items-center gap-3">
                <Clock size={16} className="text-gray-400 shrink-0" />
                <input
                  type="number"
                  min="0.25"
                  step="0.25"
                  max="24"
                  value={customDuration}
                  onChange={(e) => setCustomDuration(e.target.value)}
                  placeholder="e.g. 1.5"
                  className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  autoFocus
                />
                <span className="text-gray-400 text-sm shrink-0">hours</span>
              </div>
            )}
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-3">Date</label>
            <input
              type="date"
              value={loggedAt}
              max={todayStr()}
              onChange={(e) => setLoggedAt(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>

          {/* Who */}
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-1">Logged By</label>
            <div className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 text-sm">
              {profile?.full_name || 'You'}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-3">
              Notes <span className="text-red-400">*</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                if (e.target.value.trim()) setNotesError(false);
              }}
              placeholder="Describe what was done, what was observed, decisions made..."
              rows={4}
              className={`w-full bg-gray-800 border rounded-lg px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none ${
                notesError ? 'border-red-500 ring-1 ring-red-500' : 'border-gray-700'
              }`}
            />
            {notesError && (
              <p className="mt-1 text-xs text-red-400">Notes are required — describe what was done.</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors"
          >
            {saving ? (
              'Saving...'
            ) : (
              <>
                Save Activity
                <ChevronRight size={16} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
