import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { X, Save, Clock, User, Calendar, BookOpen, Wrench, AlertCircle, ToggleLeft, ToggleRight } from 'lucide-react';

interface Employee {
  id: string;
  full_name: string;
  role: string;
  employment_type: string | null;
}

interface InternalSession {
  id: string;
  session_type: 'shop_time' | 'training';
  title: string;
  description: string | null;
  session_date: string;
  start_time: string | null;
  end_time: string | null;
  assigned_to: string;
  status: string;
  predetermined_hours: number | null;
  notes: string | null;
  assigned_profile?: { full_name: string };
}

interface CreateInternalSessionModalProps {
  sessionToEdit?: InternalSession | null;
  onClose: () => void;
  onSave: () => void;
}

export function CreateInternalSessionModal({
  sessionToEdit,
  onClose,
  onSave,
}: CreateInternalSessionModalProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [sessionType, setSessionType] = useState<'shop_time' | 'training'>(
    sessionToEdit?.session_type ?? 'shop_time'
  );
  const [title, setTitle] = useState(sessionToEdit?.title ?? '');
  const [description, setDescription] = useState(sessionToEdit?.description ?? '');
  const [sessionDate, setSessionDate] = useState(
    sessionToEdit?.session_date ?? new Date().toISOString().split('T')[0]
  );
  const [startTime, setStartTime] = useState(sessionToEdit?.start_time ?? '');
  const [endTime, setEndTime] = useState(sessionToEdit?.end_time ?? '');
  const [assignedTo, setAssignedTo] = useState(sessionToEdit?.assigned_to ?? '');
  const [usePredetermined, setUsePredetermined] = useState(
    sessionToEdit ? sessionToEdit.predetermined_hours !== null : false
  );
  const [predeterminedHours, setPredeterminedHours] = useState<string>(
    sessionToEdit?.predetermined_hours !== null && sessionToEdit?.predetermined_hours !== undefined
      ? String(sessionToEdit.predetermined_hours)
      : ''
  );
  const [notes, setNotes] = useState(sessionToEdit?.notes ?? '');

  useEffect(() => {
    loadEmployees();
  }, []);

  async function loadEmployees() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, role, employment_type')
      .eq('is_active', true)
      .in('role', ['tech', 'manager', 'admin', 'service_manager', 'office_manager', 'sales_rep', 'sales_manager'])
      .order('full_name');
    setEmployees(data || []);
  }

  const defaultTitle = sessionType === 'shop_time' ? 'Shop Time' : 'Training Session';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!assignedTo) {
      alert('Please select an employee');
      return;
    }
    if (usePredetermined && (!predeterminedHours || parseFloat(predeterminedHours) <= 0)) {
      alert('Please enter valid predetermined hours');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        session_type: sessionType,
        title: title.trim() || defaultTitle,
        description: description.trim() || null,
        session_date: sessionDate,
        start_time: (!usePredetermined && startTime) ? startTime : null,
        end_time: (!usePredetermined && endTime) ? endTime : null,
        assigned_to: assignedTo,
        predetermined_hours: usePredetermined ? parseFloat(predeterminedHours) : null,
        notes: notes.trim() || null,
      };

      if (sessionToEdit) {
        const { error } = await supabase
          .from('internal_time_sessions')
          .update(payload)
          .eq('id', sessionToEdit.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('internal_time_sessions')
          .insert({ ...payload, created_by: profile?.id });
        if (error) throw error;
      }

      onSave();
      onClose();
    } catch (err: any) {
      console.error('Error saving session:', err);
      alert(err.message || 'Failed to save session');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className={`sticky top-0 text-white p-5 rounded-t-xl flex items-center justify-between ${
          sessionType === 'shop_time'
            ? 'bg-gradient-to-r from-amber-500 to-amber-600'
            : 'bg-gradient-to-r from-teal-600 to-teal-700'
        }`}>
          <div className="flex items-center gap-3">
            {sessionType === 'shop_time'
              ? <Wrench className="w-5 h-5" />
              : <BookOpen className="w-5 h-5" />
            }
            <div>
              <h2 className="text-lg font-bold">
                {sessionToEdit ? 'Edit Session' : 'Schedule Internal Session'}
              </h2>
              <p className="text-white/80 text-xs">
                Shop time, training, and other paid internal work
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Session Type */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Session Type *</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSessionType('shop_time')}
                className={`flex items-center gap-2 px-4 py-3 rounded-lg border-2 transition-all text-sm font-medium ${
                  sessionType === 'shop_time'
                    ? 'border-amber-500 bg-amber-50 text-amber-800'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                <Wrench className="w-4 h-4 flex-shrink-0" />
                <div className="text-left">
                  <div className="font-semibold">Shop Time</div>
                  <div className="text-xs font-normal opacity-70">Chores, cleaning, organizing</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setSessionType('training')}
                className={`flex items-center gap-2 px-4 py-3 rounded-lg border-2 transition-all text-sm font-medium ${
                  sessionType === 'training'
                    ? 'border-teal-600 bg-teal-50 text-teal-800'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                <BookOpen className="w-4 h-4 flex-shrink-0" />
                <div className="text-left">
                  <div className="font-semibold">Training</div>
                  <div className="text-xs font-normal opacity-70">Instruction, certifications</div>
                </div>
              </button>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={defaultTitle}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Assign To */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              <User className="w-4 h-4 inline mr-1" />
              Assign To *
            </label>
            <select
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select employee...</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.full_name}
                  {emp.employment_type ? ` (${emp.employment_type.replace('_', ' ')})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              <Calendar className="w-4 h-4 inline mr-1" />
              Date *
            </label>
            <input
              type="date"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Predetermined Hours Toggle */}
          <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
            <button
              type="button"
              onClick={() => setUsePredetermined(!usePredetermined)}
              className="flex items-center justify-between w-full"
            >
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-600" />
                <div className="text-left">
                  <div className="text-sm font-semibold text-gray-800">Predetermined Hours</div>
                  <div className="text-xs text-gray-500">Enter a fixed block instead of live clock-in/out</div>
                </div>
              </div>
              {usePredetermined
                ? <ToggleRight className="w-6 h-6 text-blue-600" />
                : <ToggleLeft className="w-6 h-6 text-gray-400" />
              }
            </button>

            {usePredetermined ? (
              <div className="mt-3">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Hours to award (requires manager/admin approval)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={predeterminedHours}
                    onChange={(e) => setPredeterminedHours(e.target.value)}
                    placeholder="e.g. 2.5"
                    min="0.25"
                    max="24"
                    step="0.25"
                    required={usePredetermined}
                    className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <span className="text-sm text-gray-600">hours</span>
                </div>
                <div className="flex items-start gap-1.5 mt-2">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">
                    These hours will be created as submitted and must be approved before counting toward pay.
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Start Time</label>
                  <input
                    type="time"
                    step="1800"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">End Time</label>
                  <input
                    type="time"
                    step="1800"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <p className="col-span-2 text-xs text-gray-500">
                  Suggested times only — employee will clock in/out against this session.
                </p>
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Description / Instructions
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What should the employee do during this session?"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Admin Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Internal notes (not shown to employee)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
            >
              <Save className="w-4 h-4" />
              {loading ? 'Saving...' : sessionToEdit ? 'Update Session' : 'Schedule Session'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
