import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { Search, Clock, Briefcase, MapPin, Download, AlertCircle, ChevronDown, ChevronUp, Trash2, Wrench, BookOpen, Check, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmModal from '../ui/ConfirmModal';
import {
  getOrganizationTimezone,
  formatTimeInTimezone,
} from '../../lib/timezoneUtils';

function formatTime12Hour(dateString: string, timezone: string = 'America/Chicago'): string {
  return formatTimeInTimezone(dateString, timezone, 'h:mm aa');
}

function parseLocalDate(dateString: string): Date {
  const parts = dateString.split('T')[0].split('-');
  if (parts.length === 3) {
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  }
  return new Date(dateString);
}

function formatLocalDate(dateString: string): string {
  return parseLocalDate(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

interface UnifiedTimeEntry {
  id: string;
  source: 'shift' | 'job';
  entry_date: string;
  clock_in: string;
  clock_out: string | null;
  total_hours: number;
  break_minutes: number;
  notes: string | null;
  status: string;
  technician_id: string;
  technician_name: string;
  clock_in_latitude: number | null;
  clock_in_longitude: number | null;
  clock_out_latitude: number | null;
  clock_out_longitude: number | null;
  work_order_id?: string | null;
  work_order_number?: string | null;
  project_id?: string | null;
  project_name?: string | null;
  import_batch_id?: string | null;
  overtime_hours?: number | null;
  approved_by_name?: string | null;
  entry_type?: string | null;
  internal_session_id?: string | null;
  session_title?: string | null;
}

interface EmployeeOption {
  id: string;
  full_name: string;
}

function getDateRange(range: string, startDate: string, endDate: string): { start: string; end: string } {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  if (range === 'today') return { start: todayStr, end: todayStr };
  if (range === 'yesterday') {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    const s = y.toISOString().split('T')[0];
    return { start: s, end: s };
  }
  if (range === 'this_week') {
    const dow = today.getDay();
    const offset = dow === 0 ? -6 : 1 - dow;
    const mon = new Date(today);
    mon.setDate(today.getDate() + offset);
    return { start: mon.toISOString().split('T')[0], end: todayStr };
  }
  if (range === 'week') {
    const w = new Date(today);
    w.setDate(w.getDate() - 7);
    return { start: w.toISOString().split('T')[0], end: todayStr };
  }
  if (range === 'month') {
    const m = new Date(today);
    m.setMonth(m.getMonth() - 1);
    return { start: m.toISOString().split('T')[0], end: todayStr };
  }
  return { start: startDate, end: endDate };
}

export function JobTimeHistory() {
  const { profile } = useAuth();
  const [orgTimezone, setOrgTimezone] = useState<string>('America/Chicago');
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [entries, setEntries] = useState<UnifiedTimeEntry[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('this_week');
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [sourceFilter] = useState<'all' | 'shift' | 'job'>('job');
  const [entryTypeFilter, setEntryTypeFilter] = useState<string>('all');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteEntry, setConfirmDeleteEntry] = useState<UnifiedTimeEntry | null>(null);

  useEffect(() => {
    getOrganizationTimezone().then(tz => setOrgTimezone(tz));
  }, []);

  useEffect(() => {
    if (!profile) return;
    loadEmployees();
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    loadEntries();
  }, [profile, selectedEmployee, dateRange, startDate, endDate]);

  async function loadEmployees() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'tech')
      .eq('is_active', true)
      .order('full_name');
    setEmployees(data || []);
  }

  async function loadEntries() {
    setLoading(true);
    try {
      const { start, end } = getDateRange(dateRange, startDate, endDate);

      let jobQuery = supabase
        .from('time_entries')
        .select(`
          id,
          entry_date,
          clock_in,
          clock_out,
          total_hours,
          break_minutes,
          overtime_hours,
          notes,
          status,
          technician_id,
          clock_in_latitude,
          clock_in_longitude,
          clock_out_latitude,
          clock_out_longitude,
          work_order_id,
          project_id,
          import_batch_id,
          approved_by,
          entry_type,
          internal_session_id,
          technician:profiles!technician_id(id, full_name),
          work_order:work_orders!work_order_id(id, work_order_number),
          project:projects!project_id(id, name),
          approver:profiles!approved_by(id, full_name),
          internal_session:internal_time_sessions!internal_session_id(id, title)
        `)
        .gte('entry_date', start)
        .lte('entry_date', end)
        .order('entry_date', { ascending: false })
        .order('clock_in', { ascending: false })
        .limit(500);

      if (selectedEmployee !== 'all') {
        jobQuery = jobQuery.eq('technician_id', selectedEmployee);
      }

      const jobResult = await jobQuery;

      const jobEntries: UnifiedTimeEntry[] = (jobResult.data || []).map((e: any) => ({
        id: e.id,
        source: 'job',
        entry_date: e.entry_date,
        clock_in: e.clock_in,
        clock_out: e.clock_out,
        total_hours: e.total_hours || 0,
        break_minutes: e.break_minutes || 0,
        notes: e.notes,
        status: e.status,
        technician_id: e.technician_id,
        technician_name: e.technician?.full_name || 'Unknown',
        clock_in_latitude: e.clock_in_latitude,
        clock_in_longitude: e.clock_in_longitude,
        clock_out_latitude: e.clock_out_latitude,
        clock_out_longitude: e.clock_out_longitude,
        work_order_id: e.work_order_id,
        work_order_number: e.work_order?.work_order_number || null,
        project_id: e.project_id,
        project_name: e.project?.name || null,
        import_batch_id: e.import_batch_id,
        overtime_hours: e.overtime_hours,
        approved_by_name: e.approver?.full_name || null,
        entry_type: e.entry_type || 'work_order',
        internal_session_id: e.internal_session_id || null,
        session_title: e.internal_session?.title || null,
      }));

      setEntries(jobEntries);
    } catch (err) {
      console.error('Error loading unified time entries:', err);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }

  const filteredEntries = useMemo(() => {
    const lower = searchTerm.toLowerCase();
    return entries.filter(e => {
      const matchSearch = !searchTerm || e.technician_name.toLowerCase().includes(lower);
      const matchSource = sourceFilter === 'all' || e.source === sourceFilter;
      const matchType = entryTypeFilter === 'all' || (e.entry_type || 'work_order') === entryTypeFilter;
      return matchSearch && matchSource && matchType;
    });
  }, [entries, searchTerm, sourceFilter, entryTypeFilter]);

  const summary = useMemo(() => {
    let jobHours = 0;
    for (const e of filteredEntries) jobHours += e.total_hours;
    return { jobHours };
  }, [filteredEntries]);

  async function deleteEntry(entry: UnifiedTimeEntry) {
    setDeletingId(entry.id);
    try {
      const { error } = await supabase
        .from('time_entries')
        .delete()
        .eq('id', entry.id);
      if (error) throw error;
      setEntries(prev => prev.filter(e => e.id !== entry.id));
    } catch (err) {
      console.error('Error deleting job time entry:', err);
      alert('Failed to delete entry. You may not have permission.');
    } finally {
      setDeletingId(null);
    }
  }

  function exportCSV() {
    const headers = ['Type', 'Employee', 'Date', 'Clock In', 'Clock Out', 'Hours', 'Break (min)', 'Overtime Hours', 'Status', 'Work Order', 'Project', 'Session', 'Notes'];
    const rows = filteredEntries.map(e => [
      e.entry_type === 'shop_time' ? 'Shop Time' : e.entry_type === 'training' ? 'Training' : e.entry_type === 'project' ? 'Project Time' : 'Job Time',
      e.technician_name,
      e.entry_date,
      e.clock_in ? new Date(e.clock_in).toLocaleString() : '',
      e.clock_out ? new Date(e.clock_out).toLocaleString() : '',
      e.total_hours.toFixed(2),
      e.break_minutes || 0,
      e.overtime_hours?.toFixed(2) || '',
      e.status || '',
      e.work_order_number || '',
      e.project_name || '',
      e.session_title || '',
      (e.notes || '').replace(/,/g, ';'),
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `job_time_history_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400 text-sm">Loading time history...</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div className="bg-gray-800 rounded-lg px-3 py-2.5 border border-gray-700">
          <div className="text-[11px] text-gray-400 uppercase tracking-wide mb-0.5">Job Time Hours</div>
          <div className="text-xl font-bold text-emerald-300">{summary.jobHours.toFixed(1)}h</div>
          <div className="text-[11px] text-gray-500">{filteredEntries.length} entries</div>
        </div>
        <div className="bg-gray-800 rounded-lg px-3 py-2.5 border border-gray-700">
          <div className="text-[11px] text-gray-400 uppercase tracking-wide mb-0.5">Regular Hours</div>
          <div className="text-xl font-bold text-white">{filteredEntries.reduce((s, e) => s + Math.max(0, e.total_hours - (e.overtime_hours ?? 0)), 0).toFixed(1)}h</div>
          <div className="text-[11px] text-gray-500">non-overtime</div>
        </div>
        <div className="bg-gray-800 rounded-lg px-3 py-2.5 border border-gray-700">
          <div className="text-[11px] text-gray-400 uppercase tracking-wide mb-0.5">Overtime Hours</div>
          <div className="text-xl font-bold text-orange-300">{filteredEntries.reduce((s, e) => s + (e.overtime_hours ?? 0), 0).toFixed(1)}h</div>
          <div className="text-[11px] text-gray-500">{filteredEntries.filter(e => (e.overtime_hours ?? 0) > 0).length} entries with OT</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-gray-800 rounded-lg p-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search employee..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-2.5 py-1.5 text-sm bg-gray-700 border border-gray-600 text-white rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <select
            value={selectedEmployee}
            onChange={e => setSelectedEmployee(e.target.value)}
            className="px-2.5 py-1.5 text-sm bg-gray-700 border border-gray-600 text-white rounded focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All Employees</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.full_name}</option>
            ))}
          </select>

          <select
            value={dateRange}
            onChange={e => setDateRange(e.target.value)}
            className="px-2.5 py-1.5 text-sm bg-gray-700 border border-gray-600 text-white rounded focus:ring-1 focus:ring-blue-500"
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="this_week">This Week</option>
            <option value="week">Past Week</option>
            <option value="month">Past Month</option>
            <option value="custom">Custom</option>
          </select>

          <button
            onClick={exportCSV}
            className="px-3 py-1.5 text-sm bg-gray-700 border border-gray-600 text-gray-300 rounded hover:bg-gray-600 flex items-center gap-1.5 transition-colors ml-auto"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>

        {dateRange === 'custom' && (
          <div className="flex gap-2 mt-2 pt-2 border-t border-gray-700">
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="px-2.5 py-1.5 text-sm bg-gray-700 border border-gray-600 text-white rounded focus:ring-1 focus:ring-blue-500"
            />
            <span className="text-gray-400 text-sm py-1.5">to</span>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="px-2.5 py-1.5 text-sm bg-gray-700 border border-gray-600 text-white rounded focus:ring-1 focus:ring-blue-500"
            />
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-gray-700">
          {[
            { value: 'all', label: 'All Types' },
            { value: 'work_order', label: 'Job Time' },
            { value: 'project', label: 'Project' },
            { value: 'shop_time', label: 'Shop Time' },
            { value: 'training', label: 'Training' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setEntryTypeFilter(opt.value)}
              className={`px-2.5 py-1 text-xs rounded-full font-medium transition-colors ${
                entryTypeFilter === opt.value
                  ? opt.value === 'shop_time' ? 'bg-amber-500 text-white' :
                    opt.value === 'training' ? 'bg-teal-600 text-white' :
                    opt.value === 'project' ? 'bg-blue-600 text-white' :
                    opt.value === 'work_order' ? 'bg-emerald-600 text-white' :
                    'bg-gray-500 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {filteredEntries.length >= 500 && (
        <div className="bg-blue-900/30 border border-blue-600 rounded-lg p-2 text-sm text-blue-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          Showing up to 500 entries per source. Use filters to narrow results.
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700 w-5"></th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700">Type</th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700">Employee</th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700">Date</th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700">In</th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700">Out</th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700">Hours</th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700">Reference</th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700">Status</th>
                {(profile?.role === 'admin' || profile?.role === 'manager') && (
                  <th className="px-2 py-2 w-8"></th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={(profile?.role === 'admin' || profile?.role === 'manager') ? 10 : 9} className="px-4 py-8 text-center text-sm text-gray-400">
                    No time entries found for the selected filters
                  </td>
                </tr>
              ) : (
                filteredEntries.map(entry => {
                  const isExpanded = expandedRow === entry.id;
                  const hasDetails = !!(entry.notes || entry.work_order_number || entry.project_name || entry.approved_by_name || entry.import_batch_id || entry.session_title);

                  return (
                    <React.Fragment key={`${entry.source}-${entry.id}`}>
                      <tr
                        className={`hover:bg-gray-50 transition-colors border-l-2 ${
                          entry.entry_type === 'shop_time' ? 'border-l-amber-400' :
                          entry.entry_type === 'training' ? 'border-l-teal-500' :
                          entry.entry_type === 'project' ? 'border-l-blue-400' :
                          'border-l-emerald-400'
                        }`}
                      >
                        <td className="px-2 py-1.5 w-5">
                          {hasDetails && (
                            <button
                              onClick={() => setExpandedRow(isExpanded ? null : entry.id)}
                              className="p-0.5 text-gray-400 hover:text-gray-600 transition-colors"
                            >
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          {entry.entry_type === 'shop_time' ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-amber-100 text-amber-800">
                              <Wrench className="w-3 h-3" /> Shop Time
                            </span>
                          ) : entry.entry_type === 'training' ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-teal-100 text-teal-800">
                              <BookOpen className="w-3 h-3" /> Training
                            </span>
                          ) : entry.entry_type === 'project' ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-blue-100 text-blue-800">
                              <Briefcase className="w-3 h-3" /> Project
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-emerald-100 text-emerald-800">
                              <Briefcase className="w-3 h-3" /> Job Time
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="text-sm font-medium text-gray-900">{entry.technician_name}</div>
                        </td>
                        <td className="px-2 py-1.5 text-xs text-gray-700 whitespace-nowrap">
                          {formatLocalDate(entry.entry_date)}
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-0.5">
                            <span className="text-xs text-gray-900 font-medium">{formatTime12Hour(entry.clock_in, orgTimezone)}</span>
                            {entry.clock_in_latitude && <MapPin className="w-2.5 h-2.5 text-green-500" />}
                          </div>
                        </td>
                        <td className="px-2 py-1.5">
                          {entry.clock_out ? (
                            <div className="flex items-center gap-0.5">
                              <span className="text-xs text-gray-900 font-medium">{formatTime12Hour(entry.clock_out, orgTimezone)}</span>
                              {entry.clock_out_latitude && <MapPin className="w-2.5 h-2.5 text-green-500" />}
                            </div>
                          ) : (
                            <span className="text-xs text-blue-600 font-semibold">Active</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="text-sm font-bold text-gray-900">{entry.total_hours.toFixed(2)}h</div>
                          {entry.break_minutes > 0 && (
                            <div className="text-[11px] text-gray-400">{entry.break_minutes}m brk</div>
                          )}
                          {(entry.overtime_hours ?? 0) > 0 && (
                            <div className="text-[11px] text-orange-600 font-medium">+{(entry.overtime_hours ?? 0).toFixed(2)}h OT</div>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          {(entry.entry_type === 'shop_time' || entry.entry_type === 'training') && entry.session_title ? (
                            <div className="flex items-center gap-1">
                              {entry.entry_type === 'shop_time'
                                ? <Wrench className="w-3 h-3 text-amber-500 flex-shrink-0" />
                                : <BookOpen className="w-3 h-3 text-teal-600 flex-shrink-0" />}
                              <span className="text-xs text-gray-700 font-medium truncate max-w-[140px]" title={entry.session_title}>
                                {entry.session_title}
                              </span>
                            </div>
                          ) : entry.source === 'job' && (entry.work_order_number || entry.project_name) ? (
                            <div className="space-y-0.5">
                              {entry.work_order_number && (
                                <div className="text-xs text-gray-700 font-medium flex items-center gap-1">
                                  <Briefcase className="w-3 h-3 text-gray-400" />
                                  {entry.work_order_number}
                                </div>
                              )}
                              {entry.project_name && (
                                <div className="text-[11px] text-gray-500 truncate max-w-[140px]" title={entry.project_name}>
                                  {entry.project_name}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-medium border ${
                            entry.status === 'approved' ? 'bg-green-100 text-green-800 border-green-300' :
                            entry.status === 'submitted' ? 'bg-amber-100 text-amber-800 border-amber-300' :
                            entry.status === 'draft' ? 'bg-gray-100 text-gray-600 border-gray-300' :
                            entry.status === 'clocked_in' ? 'bg-blue-100 text-blue-800 border-blue-300' :
                            entry.status === 'clocked_out' ? 'bg-gray-100 text-gray-700 border-gray-300' :
                            entry.status === 'rejected' ? 'bg-red-100 text-red-700 border-red-300' :
                            'bg-gray-100 text-gray-700 border-gray-300'
                          }`}>
                            {entry.status === 'approved' && <Check className="w-2.5 h-2.5" />}
                            {entry.status === 'rejected' && <X className="w-2.5 h-2.5" />}
                            {entry.status === 'approved' ? 'Approved' :
                             entry.status === 'submitted' ? 'Pending' :
                             entry.status === 'draft' ? 'Draft' :
                             entry.status === 'clocked_in' ? 'Active' :
                             entry.status === 'clocked_out' ? 'Out' :
                             entry.status === 'rejected' ? 'Rejected' :
                             entry.status || '—'}
                          </span>
                        </td>
                        {(profile?.role === 'admin' || profile?.role === 'manager') && (
                          <td className="px-2 py-1.5 text-right">
                            <button
                              onClick={() => setConfirmDeleteEntry(entry)}
                              disabled={deletingId === entry.id}
                              className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-40"
                              title="Delete entry"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>

                      {isExpanded && hasDetails && (
                        <tr className={`border-l-2 ${
                          entry.entry_type === 'shop_time' ? 'bg-amber-50/50 border-l-amber-400' :
                          entry.entry_type === 'training' ? 'bg-teal-50/50 border-l-teal-500' :
                          entry.entry_type === 'project' ? 'bg-blue-50/50 border-l-blue-400' :
                          'bg-emerald-50/50 border-l-emerald-400'
                        }`}>
                          <td colSpan={(profile?.role === 'admin' || profile?.role === 'manager') ? 10 : 9} className="px-4 py-2.5">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                              {entry.session_title && (
                                <div>
                                  <div className="text-gray-500 font-medium uppercase tracking-wide text-[10px] mb-0.5">Session</div>
                                  <div className="text-gray-800">{entry.session_title}</div>
                                </div>
                              )}
                              {entry.notes && (
                                <div>
                                  <div className="text-gray-500 font-medium uppercase tracking-wide text-[10px] mb-0.5">Notes</div>
                                  <div className="text-gray-800">{entry.notes}</div>
                                </div>
                              )}
                              {entry.approved_by_name && (
                                <div>
                                  <div className="text-gray-500 font-medium uppercase tracking-wide text-[10px] mb-0.5">Approved By</div>
                                  <div className="text-gray-800">{entry.approved_by_name}</div>
                                </div>
                              )}
                              {entry.import_batch_id && (
                                <div>
                                  <div className="text-gray-500 font-medium uppercase tracking-wide text-[10px] mb-0.5">Import Batch</div>
                                  <div className="text-gray-600 font-mono text-[10px]">{entry.import_batch_id.slice(0, 8)}...</div>
                                </div>
                              )}
                              {entry.work_order_id && (
                                <div>
                                  <div className="text-gray-500 font-medium uppercase tracking-wide text-[10px] mb-0.5">Work Order ID</div>
                                  <div className="text-gray-600 font-mono text-[10px]">{entry.work_order_id.slice(0, 8)}...</div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {filteredEntries.length > 0 && (
          <div className="px-3 py-2 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
            <span>{filteredEntries.length} entries</span>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 inline-block"></span>
                Job Time: {summary.jobHours.toFixed(1)}h
              </span>
            </div>
          </div>
        )}
      </div>
      <ConfirmModal
        isOpen={confirmDeleteEntry !== null}
        title="Delete Time Entry"
        message={confirmDeleteEntry ? `Delete this job time entry?\n\n${confirmDeleteEntry.technician_name} — ${formatLocalDate(confirmDeleteEntry.entry_date)} — ${confirmDeleteEntry.total_hours.toFixed(2)}h\n\nThis cannot be undone.` : ''}
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => {
          if (confirmDeleteEntry) {
            deleteEntry(confirmDeleteEntry);
          }
          setConfirmDeleteEntry(null);
        }}
        onCancel={() => setConfirmDeleteEntry(null)}
      />
    </div>
  );
}
