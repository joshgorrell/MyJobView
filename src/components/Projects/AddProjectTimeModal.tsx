import { useState, useEffect } from 'react';
import { X, Clock, Briefcase, ChevronDown } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Project {
  id: string;
  project_number: string;
  name: string;
  status: string;
}

interface StaffMember {
  id: string;
  full_name: string;
}

interface LaborPhase {
  id: string;
  name: string;
  sort_order: number | null;
}

interface AddProjectTimeModalProps {
  preselectedProjectId?: string;
  preselectedProjectName?: string;
  onClose: () => void;
  onSave: () => void;
}

const DURATION_OPTIONS = [
  { label: '30m', hours: 0.5 },
  { label: '1h', hours: 1 },
  { label: '2h', hours: 2 },
  { label: '3h', hours: 3 },
  { label: 'Custom', hours: null },
];

const ACTIVITY_TYPES = [
  { value: 'site_survey', label: 'Site Survey' },
  { value: 'customer_meeting', label: 'Meeting' },
  { value: 'training', label: 'Training' },
  { value: 'other', label: 'Other' },
];

export function AddProjectTimeModal({
  preselectedProjectId,
  preselectedProjectName,
  onClose,
  onSave,
}: AddProjectTimeModalProps) {
  const { profile } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [laborPhases, setLaborPhases] = useState<LaborPhase[]>([]);
  const [projectId, setProjectId] = useState(preselectedProjectId || '');
  const [projectSearch, setProjectSearch] = useState('');
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [staffId, setStaffId] = useState(profile?.id || '');
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedDuration, setSelectedDuration] = useState<number | null>(1);
  const [customHours, setCustomHours] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [activityType, setActivityType] = useState('');
  const [laborPhaseId, setLaborPhaseId] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStaffMembers();
    loadLaborPhases();
    if (!preselectedProjectId) loadProjects();
  }, []);

  async function loadStaffMembers() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .not('role', 'in', '("portal_user")')
      .order('full_name');
    setStaffMembers(data || []);
  }

  async function loadLaborPhases() {
    const { data } = await supabase
      .from('labor_phases')
      .select('id, name, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    setLaborPhases(data || []);
  }

  async function loadProjects() {
    const { data, error } = await supabase
      .from('projects')
      .select('id, project_number, name, status')
      .in('status', ['active', 'planning'])
      .order('created_at', { ascending: false });
    if (error) console.error('Error loading projects:', error);
    setProjects(data || []);
  }

  const filteredProjects = projects.filter(p => {
    if (!projectSearch) return true;
    const q = projectSearch.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.project_number.toLowerCase().includes(q)
    );
  });

  const selectedProject = projects.find(p => p.id === projectId);

  function handleDurationSelect(hours: number | null) {
    if (hours === null) {
      setIsCustom(true);
      setSelectedDuration(null);
    } else {
      setIsCustom(false);
      setSelectedDuration(hours);
      setCustomHours('');
    }
  }

  function getEffectiveHours(): number | null {
    if (isCustom) {
      const val = parseFloat(customHours);
      return isNaN(val) || val <= 0 ? null : val;
    }
    return selectedDuration;
  }

  function getActivityLabel(): string {
    const found = ACTIVITY_TYPES.find(a => a.value === activityType);
    return found ? found.label : '';
  }

  async function handleSave() {
    setError(null);
    const hours = getEffectiveHours();
    if (!projectId) { setError('Please select a project.'); return; }
    if (!staffId) { setError('Please select a staff member.'); return; }
    if (!hours) { setError('Please select or enter a valid duration.'); return; }
    if (!activityType) { setError('Please select an activity type.'); return; }
    if (!laborPhaseId) { setError('Please select a labor phase.'); return; }
    if (activityType === 'other' && !notes.trim()) {
      setError('Please add a note describing the activity.');
      return;
    }

    setSaving(true);
    try {
      const now = new Date();
      const [y, m, d] = entryDate.split('-').map(Number);
      const clockOut = new Date(y, m - 1, d, now.getHours(), now.getMinutes());
      const clockIn = new Date(clockOut.getTime() - hours * 60 * 60 * 1000);

      const noteText = notes.trim()
        ? `${getActivityLabel()}: ${notes.trim()}`
        : getActivityLabel();

      const { error: insertError } = await supabase
        .from('time_entries')
        .insert({
          technician_id: staffId,
          project_id: projectId,
          work_order_id: null,
          entry_date: entryDate,
          clock_in: clockIn.toISOString(),
          clock_out: clockOut.toISOString(),
          total_hours: hours,
          break_minutes: 0,
          notes: noteText,
          entry_type: 'project',
          status: 'approved',
          labor_phase_id: laborPhaseId,
        });

      if (insertError) throw insertError;
      onSave();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save time entry.');
    } finally {
      setSaving(false);
    }
  }

  const canManageOthers = profile?.role && ['admin', 'manager', 'service_manager', 'sales_manager'].includes(profile.role);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
        onClick={onClose}
      />

      {/* Modal — bottom sheet on mobile, centered dialog on sm+ */}
      <div className="fixed inset-x-0 bottom-0 sm:inset-0 z-50 flex sm:items-center sm:justify-center sm:p-4 pointer-events-none">
        <div className="pointer-events-auto w-full sm:max-w-md bg-gray-900 border border-gray-700/60 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-blue-500/15 rounded-lg">
                <Clock className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">Add Project Time</h2>
                <p className="text-xs text-gray-500">Log time outside of a work order</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Form body */}
          <div className="px-4 py-3 space-y-3">

            {/* Project */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                Project
              </label>
              {preselectedProjectId ? (
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg">
                  <Briefcase className="w-4 h-4 text-blue-400 shrink-0" />
                  <span className="text-sm text-white truncate">{preselectedProjectName || 'Selected Project'}</span>
                </div>
              ) : (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowProjectDropdown(v => !v)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-left hover:border-gray-600 transition-colors"
                  >
                    <span className={`text-sm truncate ${selectedProject ? 'text-white' : 'text-gray-500'}`}>
                      {selectedProject
                        ? `${selectedProject.project_number} — ${selectedProject.name}`
                        : 'Select a project...'}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${showProjectDropdown ? 'rotate-180' : ''}`} />
                  </button>

                  {showProjectDropdown && (
                    <>
                      <div
                        className="fixed inset-0 z-10 sm:hidden"
                        onClick={() => setShowProjectDropdown(false)}
                      />
                      <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-20 max-h-52 overflow-hidden flex flex-col">
                        <div className="p-2 border-b border-gray-700">
                          <input
                            autoFocus
                            type="text"
                            placeholder="Search projects..."
                            value={projectSearch}
                            onChange={e => setProjectSearch(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                          />
                        </div>
                        <div className="overflow-y-auto">
                          {filteredProjects.length === 0 ? (
                            <div className="px-3 py-3 text-sm text-gray-500 text-center">No active projects found</div>
                          ) : (
                            filteredProjects.map(p => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => {
                                  setProjectId(p.id);
                                  setShowProjectDropdown(false);
                                  setProjectSearch('');
                                }}
                                className="w-full px-3 py-2.5 text-left hover:bg-gray-700 transition-colors border-b border-gray-700/40 last:border-0"
                              >
                                <div className="text-sm text-white font-medium">{p.project_number} — {p.name}</div>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Staff Member + Date side by side */}
            <div className={canManageOthers ? 'grid grid-cols-2 gap-3' : ''}>
              {canManageOthers && (
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                    Staff
                  </label>
                  <select
                    value={staffId}
                    onChange={e => setStaffId(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                  >
                    <option value="">Select...</option>
                    {staffMembers.map(s => (
                      <option key={s.id} value={s.id}>{s.full_name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className={canManageOthers ? '' : 'w-full'}>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  Date
                </label>
                <input
                  type="date"
                  value={entryDate}
                  onChange={e => setEntryDate(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            {/* Duration */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                Duration
              </label>
              <div className="flex gap-2">
                {DURATION_OPTIONS.map(opt => {
                  const active = opt.hours === null ? isCustom : (!isCustom && selectedDuration === opt.hours);
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => handleDurationSelect(opt.hours)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
                        active
                          ? 'bg-blue-600 border-blue-500 text-white'
                          : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {isCustom && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    autoFocus
                    type="number"
                    inputMode="decimal"
                    min="0.25"
                    step="0.25"
                    placeholder="0.00"
                    value={customHours}
                    onChange={e => setCustomHours(e.target.value)}
                    className="w-28 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                  />
                  <span className="text-sm text-gray-400">hours</span>
                </div>
              )}
            </div>

            {/* Labor Phase + Activity Type side by side */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  Labor Phase <span className="text-red-400 normal-case font-normal">(required)</span>
                </label>
                <select
                  value={laborPhaseId}
                  onChange={e => setLaborPhaseId(e.target.value)}
                  className={`w-full bg-gray-800 border rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors ${
                    !laborPhaseId && error === 'Please select a labor phase.' ? 'border-red-500' : 'border-gray-700'
                  }`}
                >
                  <option value="" disabled>— Select a phase —</option>
                  {laborPhases.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  Activity
                </label>
                <select
                  value={activityType}
                  onChange={e => setActivityType(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                >
                  <option value="">Select...</option>
                  {ACTIVITY_TYPES.map(a => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                Notes {activityType === 'other' && <span className="text-red-400 normal-case font-normal">(required)</span>}
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Optional details..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors resize-none"
              />
            </div>

            {error && (
              <div className="px-3 py-2 bg-red-500/15 border border-red-500/40 rounded-lg text-sm text-red-400">
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-gray-700/50 flex flex-col-reverse sm:flex-row items-stretch sm:items-center sm:justify-end gap-2 shrink-0 bg-gray-900 rounded-b-none sm:rounded-b-2xl">
            <button
              onClick={onClose}
              className="py-2.5 sm:py-2 sm:px-4 text-sm text-gray-400 hover:text-white transition-colors text-center"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full sm:w-auto px-5 py-2.5 sm:py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:text-blue-400 text-white text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Time Entry'
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
