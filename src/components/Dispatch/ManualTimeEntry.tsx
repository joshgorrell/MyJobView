import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Clock, Save, X, Calendar, User, AlertCircle, CreditCard as Edit2, Plus } from 'lucide-react';
import {
  getOrganizationTimezone,
  createTimestampInTimezone,
  formatTimeInTimezone,
  formatDateInTimezone,
  calculateDuration,
  getTimezoneLabel
} from '../../lib/timezoneUtils';
import { TimePicker } from '../Shared/TimePicker';

interface Technician {
  id: string;
  full_name: string;
  employment_type: string;
  standard_start_time: string | null;
  standard_end_time: string | null;
}

interface TimeEntry {
  id: string;
  technician_id: string;
  entry_date: string;
  clock_in: string;
  clock_out: string | null;
  total_hours: number;
  break_minutes: number;
  status: string;
  notes: string | null;
  admin_adjusted: boolean;
  adjustment_reason: string | null;
  auto_clocked_out?: boolean;
  auto_clock_out_approved?: boolean;
  technician: {
    full_name: string;
  };
}

interface ManualTimeEntryProps {
  entryToEdit?: TimeEntry | null;
  onClose: () => void;
  onSave: () => void;
}

export function ManualTimeEntry({ entryToEdit, onClose, onSave }: ManualTimeEntryProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [defaultPointsLoss, setDefaultPointsLoss] = useState(10);
  const [orgTimezone, setOrgTimezone] = useState<string>('America/Chicago');
  const [timezoneLoaded, setTimezoneLoaded] = useState(false);

  const [technicianId, setTechnicianId] = useState(entryToEdit?.technician_id || '');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [clockInTime, setClockInTime] = useState('');
  const [clockOutTime, setClockOutTime] = useState('');
  const [breakMinutes, setBreakMinutes] = useState(entryToEdit?.break_minutes || 0);
  const [notes, setNotes] = useState(entryToEdit?.notes || '');
  const [adjustmentReason, setAdjustmentReason] = useState(entryToEdit?.adjustment_reason || '');
  const [deductPoints, setDeductPoints] = useState(true);

  // Convert 24-hour time to 12-hour display format
  function formatTo12Hour(time24: string): string {
    if (!time24) return '';
    const [hours, minutes] = time24.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
  }

  useEffect(() => {
    loadTimezoneAndInitialize();
    loadTechnicians();
    loadPointsConfiguration();
  }, []);

  async function loadTimezoneAndInitialize() {
    try {
      const tz = await getOrganizationTimezone();
      setOrgTimezone(tz);

      if (entryToEdit) {
        setStartDate(entryToEdit.entry_date);
        setEndDate(
          entryToEdit.clock_out
            ? formatDateInTimezone(entryToEdit.clock_out, tz, 'yyyy-MM-dd')
            : entryToEdit.entry_date
        );
        setClockInTime(formatTimeInTimezone(entryToEdit.clock_in, tz, 'HH:mm'));
        setClockOutTime(
          entryToEdit.clock_out
            ? formatTimeInTimezone(entryToEdit.clock_out, tz, 'HH:mm')
            : ''
        );
      } else {
        const today = formatDateInTimezone(new Date().toISOString(), tz, 'yyyy-MM-dd');
        setStartDate(today);
        setEndDate(today);
      }

      setTimezoneLoaded(true);
    } catch (error) {
      console.error('Error loading timezone:', error);
      setTimezoneLoaded(true);
    }
  }

  async function loadTechnicians() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, employment_type, standard_start_time, standard_end_time')
        .eq('role', 'tech')
        .eq('is_active', true)
        .order('full_name');

      if (error) throw error;
      setTechnicians(data || []);
    } catch (error) {
      console.error('Error loading technicians:', error);
    }
  }

  async function loadPointsConfiguration() {
    try {
      const { data, error } = await supabase
        .from('points_configuration')
        .select('manual_entry_points_loss')
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (data?.manual_entry_points_loss) {
        setDefaultPointsLoss(data.manual_entry_points_loss);
      }
    } catch (error) {
      console.error('Error loading points configuration:', error);
    }
  }

  function calculateTotalHours(): number {
    if (!startDate || !clockInTime || !clockOutTime || !endDate) return 0;

    try {
      const clockInTimestamp = createTimestampInTimezone(startDate, clockInTime, orgTimezone);
      const clockOutTimestamp = createTimestampInTimezone(endDate, clockOutTime, orgTimezone);
      return calculateDuration(clockInTimestamp, clockOutTimestamp, breakMinutes);
    } catch (error) {
      console.error('Error calculating hours:', error);
      return 0;
    }
  }

  const selectedTechnician = technicians.find(t => t.id === technicianId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!technicianId) {
      alert('Please select a technician');
      return;
    }

    if (!startDate) {
      alert('Please select a start date');
      return;
    }

    if (!clockInTime) {
      alert('Please enter clock in time');
      return;
    }

    if (!adjustmentReason.trim()) {
      alert('Please provide a reason for this manual entry/adjustment');
      return;
    }

    setLoading(true);
    try {
      const totalHours = calculateTotalHours();
      const status = clockOutTime ? 'clocked_out' : 'clocked_in';

      // Create timezone-aware timestamps
      const clockInTimestamp = createTimestampInTimezone(startDate, clockInTime, orgTimezone);
      let clockOutTimestamp = null;

      if (clockOutTime && endDate) {
        clockOutTimestamp = createTimestampInTimezone(endDate, clockOutTime, orgTimezone);

        // Validation: Ensure clock_out is after clock_in
        if (new Date(clockOutTimestamp) <= new Date(clockInTimestamp)) {
          alert('Error: Clock out time must be after clock in time. For overnight shifts, make sure the end date is set to the next day.');
          setLoading(false);
          return;
        }
      }

      const entryData = {
        technician_id: technicianId,
        entry_date: startDate,
        clock_in: clockInTimestamp,
        clock_out: clockOutTimestamp,
        total_hours: totalHours,
        break_minutes: breakMinutes,
        status: status,
        notes: notes || null,
        admin_adjusted: true,
        adjusted_by: profile?.id,
        adjustment_reason: adjustmentReason,
        deduct_points: deductPoints,
      };

      if (entryToEdit) {
        // If editing an auto-clocked-out entry, automatically approve it
        const updateData: any = { ...entryData };
        if (entryToEdit.auto_clocked_out && !entryToEdit.auto_clock_out_approved) {
          updateData.auto_clock_out_approved = true;
          updateData.auto_clock_out_approved_by = profile?.id;
          updateData.auto_clock_out_approved_at = new Date().toISOString();
        }

        const { error } = await supabase
          .from('daily_clock_entries')
          .update(updateData)
          .eq('id', entryToEdit.id);

        if (error) throw error;
        alert('Time entry updated successfully');
      } else {
        const { error } = await supabase
          .from('daily_clock_entries')
          .insert(entryData);

        if (error) throw error;
        alert('Time entry created successfully');
      }

      onSave();
      onClose();
    } catch (error: any) {
      console.error('Error saving time entry:', error);
      alert(error.message || 'Failed to save time entry');
    } finally {
      setLoading(false);
    }
  }

  const totalHours = calculateTotalHours();

  if (!timezoneLoaded) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl p-8">
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="text-gray-700">Loading timezone settings...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-full sm:max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 rounded-t-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {entryToEdit ? (
                <Edit2 className="w-6 h-6" />
              ) : (
                <Plus className="w-6 h-6" />
              )}
              <div>
                <h2 className="text-2xl font-bold">
                  {entryToEdit ? 'Edit Time Entry' : 'Manual Time Entry'}
                </h2>
                <p className="text-blue-100 text-sm">
                  {entryToEdit ? 'Adjust existing time clock entry' : 'Add missed clock in/out for technician'}
                </p>
                <p className="text-blue-200 text-xs mt-1">
                  All times in {getTimezoneLabel(orgTimezone)}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900">
              <p className="font-semibold mb-1">Manual Time Entry</p>
              <p>
                Use this form to add or correct time clock entries for technicians who forgot to clock in or out.
                These entries will be marked as admin-adjusted and included in efficiency calculations.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <User className="w-4 h-4 inline mr-1" />
                Technician *
              </label>
              <select
                value={technicianId}
                onChange={(e) => setTechnicianId(e.target.value)}
                required
                disabled={!!entryToEdit}
                tabIndex={1}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                <option value="">Select technician...</option>
                {technicians.map(tech => (
                  <option key={tech.id} value={tech.id}>
                    {tech.full_name} ({tech.employment_type})
                  </option>
                ))}
              </select>
              {entryToEdit && (
                <p className="text-xs text-gray-500 mt-1">
                  Technician cannot be changed when editing an entry
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  Start Date *
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      // Auto-update end date to match start date
                      if (!clockOutTime) {
                        setEndDate(e.target.value);
                      }
                    }}
                    required
                    tabIndex={2}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => {
                      const today = formatDateInTimezone(new Date().toISOString(), orgTimezone, 'yyyy-MM-dd');
                      setStartDate(today);
                      setEndDate(today);
                    }}
                    className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors whitespace-nowrap"
                  >
                    Today
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  End Date
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    tabIndex={3}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => {
                      const yesterday = new Date();
                      yesterday.setDate(yesterday.getDate() - 1);
                      const yesterdayDate = formatDateInTimezone(yesterday.toISOString(), orgTimezone, 'yyyy-MM-dd');
                      setStartDate(yesterdayDate);
                      setEndDate(yesterdayDate);
                    }}
                    className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors whitespace-nowrap"
                  >
                    Yesterday
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Usually same as start date
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TimePicker
                label="Clock In Time"
                required
                value={clockInTime}
                onChange={setClockInTime}
                presets={[
                  { label: '6:00 AM', value: '06:00' },
                  { label: '7:00 AM', value: '07:00' },
                  { label: '8:00 AM', value: '08:00' },
                  { label: '9:00 AM', value: '09:00' },
                ]}
              />

              <div>
                <TimePicker
                  label="Clock Out Time"
                  value={clockOutTime}
                  onChange={setClockOutTime}
                  placeholder="Leave blank if still clocked in"
                  presets={[
                    { label: '3:00 PM', value: '15:00' },
                    { label: '4:00 PM', value: '16:00' },
                    { label: '5:00 PM', value: '17:00' },
                    { label: '6:00 PM', value: '18:00' },
                  ]}
                />
                {clockOutTime && (
                  <button
                    type="button"
                    onClick={() => setClockOutTime('')}
                    className="mt-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors"
                    tabIndex={-1}
                  >
                    Clear (still clocked in)
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Break Time (minutes)
              </label>
              <input
                type="number"
                value={breakMinutes}
                onChange={(e) => setBreakMinutes(parseInt(e.target.value) || 0)}
                min="0"
                max="480"
                step="15"
                tabIndex={6}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                Total break time (lunch, personal breaks, etc.)
              </p>
            </div>

            {startDate && clockInTime && clockOutTime && endDate && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-blue-900">
                    Calculated Total Hours:
                  </span>
                  <span className="text-lg font-bold text-blue-600">
                    {totalHours.toFixed(2)} hours
                  </span>
                </div>
                <p className="text-xs text-blue-700 mt-1">
                  {startDate !== endDate ? (
                    <>
                      From {new Date(startDate).toLocaleDateString()} at {formatTo12Hour(clockInTime)} to{' '}
                      {new Date(endDate).toLocaleDateString()} at {formatTo12Hour(clockOutTime)}
                      {breakMinutes > 0 && `, minus ${breakMinutes} minutes of breaks`}
                    </>
                  ) : (
                    <>
                      {formatTo12Hour(clockInTime)} to {formatTo12Hour(clockOutTime)}
                      {breakMinutes > 0 && `, minus ${breakMinutes} minutes of breaks`}
                    </>
                  )}
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason for Manual Entry/Adjustment *
              </label>
              <textarea
                value={adjustmentReason}
                onChange={(e) => setAdjustmentReason(e.target.value)}
                required
                rows={3}
                tabIndex={7}
                placeholder="e.g., Technician forgot to clock in, System issue, Approved by manager, etc."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                This reason will be visible in time clock history
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Additional Notes (Optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                tabIndex={8}
                placeholder="Any additional notes about this entry..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deductPoints}
                  onChange={(e) => setDeductPoints(e.target.checked)}
                  tabIndex={9}
                  className="mt-1 w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-red-900">
                      Deduct points from employee?
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700">
                      -{defaultPointsLoss} points
                    </span>
                  </div>
                  <p className="text-sm text-red-700 mt-1">
                    If checked, {defaultPointsLoss} points will be deducted from the employee's rewards balance for forgetting to clock in/out.
                  </p>
                  <p className="text-xs text-red-600 mt-1">
                    Default penalty can be adjusted in Admin → Points & Rewards settings
                  </p>
                </div>
              </label>
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              tabIndex={11}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              tabIndex={10}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
            >
              <Save className="w-4 h-4" />
              {loading ? 'Saving...' : entryToEdit ? 'Update Entry' : 'Create Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
