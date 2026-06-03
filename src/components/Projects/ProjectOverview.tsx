import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Calendar, DollarSign, FileText, CreditCard as Edit2, Save, X, Timer, Clock, AlertTriangle, CheckCircle, Flag } from 'lucide-react';
import { ProjectRoleAssignment } from './ProjectRoleAssignment';

interface ProjectOverviewProps {
  project: any;
  onUpdate: (updates: any) => void;
  onRefresh: () => void;
}

interface HoursData {
  estimatedHours: number;
  actualHours: number;
  activityHours: number;
}

export default function ProjectOverview({ project, onUpdate, onRefresh }: ProjectOverviewProps) {
  const [editing, setEditing] = useState(false);
  const [editedProject, setEditedProject] = useState<any>({});
  const [invoicesTotal, setInvoicesTotal] = useState({ total: 0, paid: 0, outstanding: 0 });
  const [appointmentsCount, setAppointmentsCount] = useState(0);
  const [hoursData, setHoursData] = useState<HoursData | null>(null);
  const [roleAssignments, setRoleAssignments] = useState({
    salesperson_id: project.salesperson_id || null,
    designer_id: project.designer_id || null,
    project_manager_id: project.project_manager_id || null,
  });

  useEffect(() => {
    loadInvoicesSummary();
    loadAppointmentsCount();
    loadHoursData();
  }, [project.id]);

  async function loadInvoicesSummary() {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('total, amount_paid, amount_due')
        .eq('project_id', project.id);

      if (error) throw error;

      const summary = (data || []).reduce(
        (acc, inv) => ({
          total: acc.total + (inv.total || 0),
          paid: acc.paid + (inv.amount_paid || 0),
          outstanding: acc.outstanding + (inv.amount_due || 0),
        }),
        { total: 0, paid: 0, outstanding: 0 }
      );

      setInvoicesTotal(summary);
    } catch (error) {
      console.error('Error loading invoices summary:', error);
    }
  }

  async function loadAppointmentsCount() {
    try {
      const { count, error } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', project.id);

      if (error) throw error;

      setAppointmentsCount(count || 0);
    } catch (error) {
      console.error('Error loading appointments count:', error);
    }
  }

  async function loadHoursData() {
    try {
      const [woResult, actResult] = await Promise.all([
        supabase
          .from('work_orders')
          .select('estimated_hours, actual_hours')
          .eq('project_id', project.id),
        supabase
          .from('project_activity_logs')
          .select('duration_minutes')
          .eq('project_id', project.id),
      ]);

      if (woResult.error) throw woResult.error;

      const totalEstimated = (woResult.data || []).reduce((s, w) => s + (w.estimated_hours || 0), 0);
      const totalActual = (woResult.data || []).reduce((s, w) => s + (w.actual_hours || 0), 0);
      const totalActivityMins = (actResult.data || []).reduce((s, a) => s + (a.duration_minutes || 0), 0);
      const activityHours = Math.round((totalActivityMins / 60) * 10) / 10;

      if (totalEstimated > 0 || totalActual > 0 || activityHours > 0) {
        setHoursData({ estimatedHours: totalEstimated, actualHours: totalActual, activityHours });
      }
    } catch (error) {
      console.error('Error loading hours data:', error);
    }
  }

  function startEditing() {
    setEditedProject({ ...project });
    setEditing(true);
  }

  function cancelEditing() {
    setEditedProject({});
    setEditing(false);
  }

  async function saveChanges() {
    await onUpdate(editedProject);
    setEditing(false);
    onRefresh();
  }

  return (
    <div className="p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Financial Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-2">
              <DollarSign size={20} className="text-green-400" />
              <div className="text-sm text-gray-400">Contract Total</div>
            </div>
            <div className="text-2xl font-bold text-white">
              ${project.sales_orders?.contract_total?.toFixed(2) || '0.00'}
            </div>
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-2">
              <DollarSign size={20} className="text-blue-400" />
              <div className="text-sm text-gray-400">Collected</div>
            </div>
            <div className="text-2xl font-bold text-white">
              ${invoicesTotal.paid.toFixed(2)}
            </div>
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-2">
              <DollarSign size={20} className="text-yellow-400" />
              <div className="text-sm text-gray-400">Outstanding</div>
            </div>
            <div className="text-2xl font-bold text-white">
              ${invoicesTotal.outstanding.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-2">
              <Calendar size={20} className="text-cyan-400" />
              <div className="text-sm text-gray-400">Appointments Scheduled</div>
            </div>
            <div className="text-2xl font-bold text-white">{appointmentsCount}</div>
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-2">
              <FileText size={20} className="text-purple-400" />
              <div className="text-sm text-gray-400">Status</div>
            </div>
            <div className="text-2xl font-bold text-white capitalize">{project.status}</div>
          </div>
        </div>

        {/* Hours Progress */}
        {hoursData && hoursData.estimatedHours > 0 && (
          <HoursProgressBar
            estimatedHours={hoursData.estimatedHours}
            actualHours={hoursData.actualHours}
          />
        )}

        {/* Non-WO Activity Hours */}
        {hoursData && hoursData.activityHours > 0 && (
          <div className="bg-gray-800 border border-gray-700 rounded-lg px-5 py-3 flex items-center gap-3">
            <Clock size={16} className="text-cyan-400 shrink-0" />
            <span className="text-sm text-gray-400">Non-WO Activity:</span>
            <span className="text-sm font-semibold text-white">{hoursData.activityHours}h logged</span>
            <span className="text-xs text-gray-500">(site surveys, meetings &amp; other project time)</span>
          </div>
        )}

        {/* Project Details */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg">
          <div className="flex items-center justify-between p-4 border-b border-gray-700">
            <h3 className="text-lg font-semibold text-white">Project Details</h3>
            {!editing ? (
              <button
                onClick={startEditing}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
              >
                <Edit2 size={16} />
                Edit
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={saveChanges}
                  className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm"
                >
                  <Save size={16} />
                  Save
                </button>
                <button
                  onClick={cancelEditing}
                  className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm"
                >
                  <X size={16} />
                  Cancel
                </button>
              </div>
            )}
          </div>

          <div className="p-4 space-y-4">
            {/* Customer */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Customer</label>
              <div className="text-white">{project.contacts?.contact_name}</div>
            </div>

            {/* Team Role Assignments */}
            <div className="border-t border-gray-700/50 pt-4">
              <ProjectRoleAssignment
                projectId={project.id}
                currentSalespersonId={roleAssignments.salesperson_id}
                currentDesignerId={roleAssignments.designer_id}
                currentProjectManagerId={roleAssignments.project_manager_id}
                onUpdate={(updates) => {
                  setRoleAssignments(prev => ({ ...prev, ...updates }));
                }}
                readOnly={editing}
              />
            </div>

            {/* Dates */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Start Date</label>
                {editing ? (
                  <input
                    type="date"
                    value={editedProject.start_date || ''}
                    onChange={(e) => setEditedProject({ ...editedProject, start_date: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <div className="text-white">
                    {project.start_date ? new Date(project.start_date).toLocaleDateString() : 'Not set'}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  Target Completion
                </label>
                {editing ? (
                  <input
                    type="date"
                    value={editedProject.target_completion_date || ''}
                    onChange={(e) =>
                      setEditedProject({ ...editedProject, target_completion_date: e.target.value })
                    }
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <div className="text-white">
                    {project.target_completion_date
                      ? new Date(project.target_completion_date).toLocaleDateString()
                      : 'Not set'}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  Substantial Completion
                </label>
                {editing ? (
                  <input
                    type="date"
                    value={editedProject.substantial_completion_date || ''}
                    onChange={(e) =>
                      setEditedProject({ ...editedProject, substantial_completion_date: e.target.value })
                    }
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <div className="text-white">
                    {project.substantial_completion_date
                      ? new Date(project.substantial_completion_date).toLocaleDateString()
                      : 'Not set'}
                  </div>
                )}
              </div>
            </div>

            {/* Job Site Address */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Job Site Address</label>
              {editing ? (
                <textarea
                  value={
                    typeof editedProject.job_site_address === 'string'
                      ? editedProject.job_site_address
                      : JSON.stringify(editedProject.job_site_address || {}, null, 2)
                  }
                  onChange={(e) =>
                    setEditedProject({ ...editedProject, job_site_address: e.target.value })
                  }
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
              ) : (
                <div className="text-white">
                  {typeof project.job_site_address === 'string'
                    ? project.job_site_address
                    : JSON.stringify(project.job_site_address || 'Not set')}
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Notes</label>
              {editing ? (
                <textarea
                  value={editedProject.notes || ''}
                  onChange={(e) => setEditedProject({ ...editedProject, notes: e.target.value })}
                  placeholder="Project notes..."
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px]"
                />
              ) : (
                <div className="text-white whitespace-pre-wrap">
                  {project.notes || 'No notes'}
                </div>
              )}
            </div>

            {/* Internal Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">
                Internal Notes (Staff Only)
              </label>
              {editing ? (
                <textarea
                  value={editedProject.internal_notes || ''}
                  onChange={(e) =>
                    setEditedProject({ ...editedProject, internal_notes: e.target.value })
                  }
                  placeholder="Internal notes not visible to customer..."
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px]"
                />
              ) : (
                <div className="text-white whitespace-pre-wrap">
                  {project.internal_notes || 'No internal notes'}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HoursProgressBar({ estimatedHours, actualHours }: { estimatedHours: number; actualHours: number }) {
  const isOver = actualHours > estimatedHours;
  const pct = estimatedHours > 0 ? (actualHours / estimatedHours) * 100 : 0;
  const clampedPct = Math.min(pct, 100);

  let barColor = 'bg-green-500';
  let textColor = 'text-green-400';
  let statusLabel = 'On Track';
  let statusBadgeClass = 'bg-green-500/15 text-green-400 border border-green-500/30';

  if (isOver) {
    barColor = 'bg-red-500';
    textColor = 'text-red-400';
    statusLabel = 'Over Budget';
    statusBadgeClass = 'bg-red-500/15 text-red-400 border border-red-500/30';
  } else if (pct >= 85) {
    barColor = 'bg-amber-500';
    textColor = 'text-amber-400';
    statusLabel = 'Nearing Limit';
    statusBadgeClass = 'bg-amber-500/15 text-amber-400 border border-amber-500/30';
  }

  const remainingHours = isOver ? 0 : estimatedHours - actualHours;
  const overHours = isOver ? actualHours - estimatedHours : 0;

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <Timer size={18} className={textColor} />
          <span className="text-sm font-semibold text-white">Hours Progress</span>
        </div>
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusBadgeClass}`}>
          {statusLabel}
        </span>
      </div>

      <div className="flex items-end gap-3 mb-4">
        <div className={`text-4xl font-black tabular-nums ${textColor}`}>
          {pct.toFixed(1)}%
        </div>
        <div className="pb-1 text-sm text-gray-400 leading-tight">
          <div className="font-medium text-white">{actualHours.toFixed(1)}h worked</div>
          <div>of {estimatedHours.toFixed(1)}h estimated</div>
        </div>
      </div>

      <div className="relative mb-3">
        <div className="h-5 bg-gray-900 rounded-full overflow-hidden border border-gray-600">
          {!isOver ? (
            <div
              className={`h-full rounded-full transition-all duration-700 ${barColor}`}
              style={{ width: `${clampedPct}%` }}
            />
          ) : (
            <div className="relative h-full">
              <div className="h-full bg-green-800 rounded-l-full absolute left-0 top-0" style={{ width: '100%' }} />
              <div className={`h-full rounded-full ${barColor} absolute left-0 top-0`} style={{ width: '100%' }} />
            </div>
          )}
        </div>
        <div className="absolute top-0 h-5 w-px bg-gray-500/60" style={{ right: 0 }} />
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
        <span>0h</span>
        {!isOver ? (
          <span className="flex items-center gap-1">
            <Flag size={12} />
            {estimatedHours.toFixed(1)}h
          </span>
        ) : (
          <span className={`font-semibold ${textColor}`}>{estimatedHours.toFixed(1)}h limit</span>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-700">
        {!isOver ? (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 rounded-lg border border-gray-700 text-xs text-gray-300">
            <Clock size={14} className="text-gray-500" />
            <span className="text-white font-medium">{remainingHours.toFixed(1)}h</span>
            <span className="text-gray-500">remaining</span>
          </div>
        ) : (
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium ${statusBadgeClass}`}>
            <AlertTriangle size={14} />
            <span>{overHours.toFixed(1)}h over estimate</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 rounded-lg border border-gray-700 text-xs text-gray-300">
          <CheckCircle size={14} className="text-gray-500" />
          <span className="text-white font-medium">{actualHours.toFixed(1)}h</span>
          <span className="text-gray-500">worked</span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 rounded-lg border border-gray-700 text-xs text-gray-300">
          <Timer size={14} className="text-gray-500" />
          <span className="text-white font-medium">{estimatedHours.toFixed(1)}h</span>
          <span className="text-gray-500">estimated</span>
        </div>
      </div>
    </div>
  );
}
