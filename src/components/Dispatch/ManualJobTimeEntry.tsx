import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Clock, Save, X, Calendar, User, AlertCircle, Edit2, Plus, Briefcase, Wrench, BookOpen } from 'lucide-react';

interface Technician {
  id: string;
  full_name: string;
}

interface WorkOrder {
  id: string;
  work_order_number: string;
  title: string;
  status: string;
  type: string;
  project?: {
    project_number: string;
    title: string;
  };
}

interface Project {
  id: string;
  project_number: string;
  name: string;
  status: string;
  contact?: {
    full_name: string;
  };
  sales_order?: {
    order_number: string;
  };
}

interface JobTimeEntry {
  id: string;
  technician_id: string;
  work_order_id: string;
  entry_date: string;
  clock_in: string;
  clock_out: string | null;
  total_hours: number;
  break_minutes: number;
  notes: string | null;
  status: string;
  technician: {
    full_name: string;
  };
  work_order?: {
    work_order_number: string;
    title: string;
  };
}

interface ManualJobTimeEntryProps {
  entryToEdit?: JobTimeEntry | null;
  preselectedWorkOrderId?: string;
  onClose: () => void;
  onSave: () => void;
}

export function ManualJobTimeEntry({
  entryToEdit,
  preselectedWorkOrderId,
  onClose,
  onSave
}: ManualJobTimeEntryProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  // Entry mode: 'work_order', 'project', 'shop_time', or 'training'
  const [entryMode, setEntryMode] = useState<'work_order' | 'project' | 'shop_time' | 'training'>(
    entryToEdit?.work_order_id || preselectedWorkOrderId ? 'work_order' : 'project'
  );

  const [technicianId, setTechnicianId] = useState(
    entryToEdit?.technician_id ||
    (profile?.role === 'tech' ? profile?.id : '') ||
    ''
  );
  const [workOrderId, setWorkOrderId] = useState(entryToEdit?.work_order_id || preselectedWorkOrderId || '');
  const [projectId, setProjectId] = useState('');
  const [entryDate, setEntryDate] = useState(entryToEdit?.entry_date || new Date().toISOString().split('T')[0]);
  const [clockIn, setClockIn] = useState(entryToEdit?.clock_in ? new Date(entryToEdit.clock_in).toISOString().slice(0, 16) : '');
  const [clockOut, setClockOut] = useState(entryToEdit?.clock_out ? new Date(entryToEdit.clock_out).toISOString().slice(0, 16) : '');
  const [breakMinutes, setBreakMinutes] = useState(entryToEdit?.break_minutes || 0);
  const [notes, setNotes] = useState(entryToEdit?.notes || '');

  useEffect(() => {
    loadTechnicians();
    loadWorkOrders();
    loadProjects();
  }, []);

  async function loadTechnicians() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('role', ['tech', 'manager'])
        .order('full_name');

      if (error) throw error;
      setTechnicians(data || []);
    } catch (error) {
      console.error('Error loading technicians:', error);
    }
  }

  async function loadWorkOrders() {
    try {
      const { data, error } = await supabase
        .from('work_orders')
        .select(`
          id,
          work_order_number,
          title,
          status,
          type,
          project:projects(project_number, title)
        `)
        .in('status', ['assigned', 'in_progress', 'pending'])
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setWorkOrders(data || []);
    } catch (error) {
      console.error('Error loading work orders:', error);
    }
  }

  async function loadProjects() {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select(`
          id,
          project_number,
          name,
          status,
          contact:contacts(full_name),
          sales_order:sales_orders(order_number)
        `)
        .in('status', ['planning', 'active'])
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setProjects(data || []);
    } catch (error) {
      console.error('Error loading projects:', error);
    }
  }

  function calculateTotalHours(): number {
    if (!clockIn || !clockOut) return 0;

    const start = new Date(clockIn);
    const end = new Date(clockOut);
    const diffMs = end.getTime() - start.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    const hoursAfterBreaks = diffHours - (breakMinutes / 60);

    return Math.max(0, hoursAfterBreaks);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!technicianId) {
      alert('Please select a technician');
      return;
    }

    if (entryMode === 'work_order' && !workOrderId) {
      alert('Please select a work order');
      return;
    }

    if (entryMode === 'project' && !projectId) {
      alert('Please select a project');
      return;
    }

    if (!clockIn) {
      alert('Please enter clock in time');
      return;
    }

    setLoading(true);
    try {
      const totalHours = calculateTotalHours();
      const isInternalType = entryMode === 'shop_time' || entryMode === 'training';
      const status = isInternalType ? 'submitted' : (clockOut ? 'completed' : 'draft');

      const entryData: any = {
        technician_id: technicianId,
        entry_date: entryDate,
        clock_in: new Date(clockIn).toISOString(),
        clock_out: clockOut ? new Date(clockOut).toISOString() : null,
        total_hours: totalHours,
        break_minutes: breakMinutes,
        notes: notes || null,
        status: status,
        entry_type: entryMode,
      };

      if (entryMode === 'work_order') {
        entryData.work_order_id = workOrderId;
        entryData.project_id = null;
        entryData.internal_session_id = null;
      } else if (entryMode === 'project') {
        entryData.project_id = projectId;
        entryData.work_order_id = null;
        entryData.internal_session_id = null;
      } else {
        entryData.work_order_id = null;
        entryData.project_id = null;
        entryData.internal_session_id = null;
      }

      if (!entryToEdit) {
        const { data: companyData } = await supabase
          .from('company_settings')
          .select('id')
          .maybeSingle();
        if (companyData?.id) entryData.company_id = companyData.id;
      }

      if (entryToEdit) {
        const { error } = await supabase
          .from('time_entries')
          .update(entryData)
          .eq('id', entryToEdit.id);

        if (error) throw error;
        alert('Time entry updated successfully');
      } else {
        const { error } = await supabase
          .from('time_entries')
          .insert(entryData);

        if (error) throw error;
        alert('Time entry created successfully');
      }

      onSave();
      onClose();
    } catch (error: any) {
      console.error('Error saving job time entry:', error);
      alert(error.message || 'Failed to save job time entry');
    } finally {
      setLoading(false);
    }
  }

  const totalHours = calculateTotalHours();
  const selectedWorkOrder = workOrders.find(wo => wo.id === workOrderId);
  const selectedProject = projects.find(p => p.id === projectId);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
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
                  {entryMode === 'shop_time' ? 'Shop time — chores, cleaning, organizing' :
                   entryMode === 'training' ? 'Training session — instruction, certifications' :
                   entryMode === 'project' ? 'Project time — ad-hoc work, no work order' :
                   'Add time worked on a specific work order'}
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
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-900">
              <p className="font-semibold mb-1">Job Time Entry</p>
              <p>
                This records time worked on a specific work order or project. Use "Work Order" mode for normal
                tracked work, or "Project" mode for ad-hoc project work when no work order has been created yet.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Entry Mode Selector - Only show if not editing or preselected */}
            {!entryToEdit && !preselectedWorkOrderId && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Time Entry Type *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'work_order', label: 'Work Order', sub: 'Normal tracked work', icon: <Briefcase className="w-4 h-4" /> },
                    { value: 'project', label: 'Project', sub: 'Ad-hoc, no work order', icon: <Briefcase className="w-4 h-4" /> },
                    { value: 'shop_time', label: 'Shop Time', sub: 'Chores, cleaning, etc.', icon: <Wrench className="w-4 h-4" /> },
                    { value: 'training', label: 'Training', sub: 'Instruction, certs', icon: <BookOpen className="w-4 h-4" /> },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setEntryMode(opt.value as typeof entryMode);
                        if (opt.value !== 'work_order') setWorkOrderId('');
                        if (opt.value !== 'project') setProjectId('');
                      }}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 text-left text-sm transition-all ${
                        entryMode === opt.value
                          ? opt.value === 'shop_time' ? 'border-amber-500 bg-amber-50 text-amber-800' :
                            opt.value === 'training' ? 'border-teal-600 bg-teal-50 text-teal-800' :
                            'border-blue-500 bg-blue-50 text-blue-800'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {opt.icon}
                      <div>
                        <div className="font-semibold">{opt.label}</div>
                        <div className="text-xs opacity-70 font-normal">{opt.sub}</div>
                      </div>
                    </button>
                  ))}
                </div>
                {(entryMode === 'shop_time' || entryMode === 'training') && (
                  <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Internal time entries are submitted for manager/admin approval.
                  </p>
                )}
                {entryMode === 'project' && (
                  <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Project mode is for sales order projects only. Service work must use a work order.
                  </p>
                )}
              </div>
            )}

            {/* Work Order Selection */}
            {entryMode === 'work_order' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Briefcase className="w-4 h-4 inline mr-1" />
                  Work Order *
                </label>
                <select
                  value={workOrderId}
                  onChange={(e) => setWorkOrderId(e.target.value)}
                  required
                  disabled={!!entryToEdit || !!preselectedWorkOrderId}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                  <option value="">Select work order...</option>
                  {workOrders.map(wo => (
                    <option key={wo.id} value={wo.id}>
                      {wo.work_order_number} - {wo.title}
                      {wo.project && ` (${wo.project.project_number})`}
                    </option>
                  ))}
                </select>
                {selectedWorkOrder?.project && (
                  <p className="text-xs text-gray-600 mt-1">
                    Project: {selectedWorkOrder.project.project_number} - {selectedWorkOrder.project.title}
                  </p>
                )}
                {(entryToEdit || preselectedWorkOrderId) && (
                  <p className="text-xs text-gray-500 mt-1">
                    Work order cannot be changed when editing an entry
                  </p>
                )}
              </div>
            )}

            {/* Project Selection */}
            {entryMode === 'project' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Briefcase className="w-4 h-4 inline mr-1" />
                  Project / Sales Order *
                </label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select project...</option>
                  {projects.map(proj => (
                    <option key={proj.id} value={proj.id}>
                      {proj.project_number} - {proj.name}
                      {proj.contact && ` (${proj.contact.full_name})`}
                    </option>
                  ))}
                </select>
                {selectedProject && (
                  <div className="mt-2 text-xs space-y-1">
                    {selectedProject.contact && (
                      <p className="text-gray-600">
                        Customer: {selectedProject.contact.full_name}
                      </p>
                    )}
                    {selectedProject.sales_order && (
                      <p className="text-gray-600">
                        Sales Order: {selectedProject.sales_order.order_number}
                      </p>
                    )}
                    <p className="text-gray-600">
                      Status: {selectedProject.status}
                    </p>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <User className="w-4 h-4 inline mr-1" />
                Technician *
              </label>
              <select
                value={technicianId}
                onChange={(e) => setTechnicianId(e.target.value)}
                required
                disabled={profile?.role === 'tech' && !entryToEdit}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                <option value="">Select technician...</option>
                {technicians.map(tech => (
                  <option key={tech.id} value={tech.id}>
                    {tech.full_name}
                  </option>
                ))}
              </select>
              {profile?.role === 'tech' && !entryToEdit && (
                <p className="text-xs text-gray-500 mt-1">
                  You can only log time for yourself
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Calendar className="w-4 h-4 inline mr-1" />
                Date *
              </label>
              <input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                required
                max={new Date().toISOString().split('T')[0]}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Clock className="w-4 h-4 inline mr-1" />
                  Clock In Time *
                </label>
                <input
                  type="datetime-local"
                  value={clockIn}
                  onChange={(e) => setClockIn(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Clock className="w-4 h-4 inline mr-1" />
                  Clock Out Time
                </label>
                <input
                  type="datetime-local"
                  value={clockOut}
                  onChange={(e) => setClockOut(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Leave blank if still working on job
                </p>
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
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                Break time during this job (if any)
              </p>
            </div>

            {clockIn && clockOut && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-blue-900">
                    Calculated Job Hours:
                  </span>
                  <span className="text-lg font-bold text-blue-600">
                    {totalHours.toFixed(2)} hours
                  </span>
                </div>
                <p className="text-xs text-blue-700 mt-1">
                  After {breakMinutes} minutes of breaks
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes (Optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Any notes about this job time entry..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
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
