import { useState, useEffect, useMemo } from 'react';
import {
  DollarSign, TrendingUp, Clock, CheckCircle, ArrowUpDown, Users,
  Loader2, Calendar, ChevronDown, Download, Briefcase, PenTool,
  Filter, X, ChevronsUpDown
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface CommissionRecord {
  id: string;
  employee_id: string;
  employee_name: string;
  role_type: string;
  basis_type: string;
  basis_amount: number;
  commission_rate: number;
  total_potential_commission: number;
  amount_collected: number;
  amount_earned: number;
  amount_paid: number;
  status: string;
  project_id: string | null;
  invoice_id: string | null;
  created_at: string;
}

interface EmployeeSummary {
  id: string;
  name: string;
  potential: number;
  earned: number;
  paid: number;
  owed: number;
  recordCount: number;
  roles: string[];
}

type SortField = 'date' | 'employee' | 'earned' | 'paid' | 'potential';
type SortDir = 'asc' | 'desc';
type ViewMode = 'all' | 'employee';

const roleTypeLabels: Record<string, { label: string; color: string; icon: typeof DollarSign }> = {
  sales_projects: { label: 'Sales', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: DollarSign },
  design: { label: 'Design', color: 'bg-teal-500/20 text-teal-400 border-teal-500/30', icon: PenTool },
  pm: { label: 'Project Mgmt', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: Briefcase },
  service_sales: { label: 'Service Sales', color: 'bg-green-500/20 text-green-400 border-green-500/30', icon: DollarSign },
  service_pm: { label: 'Service PM', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', icon: Briefcase },
};

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'text-gray-400 bg-gray-500/20 border-gray-500/30' },
  accruing: { label: 'Accruing', color: 'text-blue-400 bg-blue-500/20 border-blue-500/30' },
  ready_to_pay: { label: 'Ready to Pay', color: 'text-green-400 bg-green-500/20 border-green-500/30' },
  paid: { label: 'Paid', color: 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30' },
};

function getPayrollPeriods() {
  const now = new Date();
  const periods: { label: string; start: string; end: string }[] = [];

  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const biWeeklyStart1 = new Date(currentYear, currentMonth, 1);
  const biWeeklyEnd1 = new Date(currentYear, currentMonth, 15);
  const biWeeklyStart2 = new Date(currentYear, currentMonth, 16);
  const biWeeklyEnd2 = new Date(currentYear, currentMonth + 1, 0);

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  periods.push({
    label: `${monthNames[currentMonth]} 1-15`,
    start: biWeeklyStart1.toISOString().split('T')[0],
    end: biWeeklyEnd1.toISOString().split('T')[0],
  });
  periods.push({
    label: `${monthNames[currentMonth]} 16-${biWeeklyEnd2.getDate()}`,
    start: biWeeklyStart2.toISOString().split('T')[0],
    end: biWeeklyEnd2.toISOString().split('T')[0],
  });

  const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
  const prevMonthEnd = new Date(prevYear, prevMonth + 1, 0);
  periods.push({
    label: `${monthNames[prevMonth]} 1-15`,
    start: new Date(prevYear, prevMonth, 1).toISOString().split('T')[0],
    end: new Date(prevYear, prevMonth, 15).toISOString().split('T')[0],
  });
  periods.push({
    label: `${monthNames[prevMonth]} 16-${prevMonthEnd.getDate()}`,
    start: new Date(prevYear, prevMonth, 16).toISOString().split('T')[0],
    end: prevMonthEnd.toISOString().split('T')[0],
  });

  periods.push({
    label: `${monthNames[currentMonth]} (Full Month)`,
    start: new Date(currentYear, currentMonth, 1).toISOString().split('T')[0],
    end: new Date(currentYear, currentMonth + 1, 0).toISOString().split('T')[0],
  });
  periods.push({
    label: `${monthNames[prevMonth]} (Full Month)`,
    start: new Date(prevYear, prevMonth, 1).toISOString().split('T')[0],
    end: prevMonthEnd.toISOString().split('T')[0],
  });

  const qStart = new Date(currentYear, Math.floor(currentMonth / 3) * 3, 1);
  const qEnd = new Date(currentYear, Math.floor(currentMonth / 3) * 3 + 3, 0);
  periods.push({
    label: `Q${Math.floor(currentMonth / 3) + 1} ${currentYear}`,
    start: qStart.toISOString().split('T')[0],
    end: qEnd.toISOString().split('T')[0],
  });

  periods.push({
    label: `YTD ${currentYear}`,
    start: `${currentYear}-01-01`,
    end: now.toISOString().split('T')[0],
  });

  return periods;
}

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function CommissionDashboard() {
  const { profile } = useAuth();
  const [records, setRecords] = useState<CommissionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<{ id: string; full_name: string }[]>([]);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterEmployee, setFilterEmployee] = useState('all');
  const [filterRole, setFilterRole] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);

  const isAdmin = profile?.role === 'admin' || profile?.role === 'manager' || profile?.role === 'finance';

  useEffect(() => {
    loadData();
  }, [profile?.id, isAdmin]);

  async function loadData() {
    try {
      let query = supabase
        .from('commission_records')
        .select(`
          *,
          profiles!commission_records_employee_id_fkey(full_name)
        `);

      if (!isAdmin) {
        query = query.eq('employee_id', profile?.id);
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;

      const formatted = (data || []).map((r: any) => ({
        ...r,
        employee_name: r.profiles?.full_name || 'Unknown',
      }));
      setRecords(formatted);

      if (isAdmin) {
        const { data: empData } = await supabase
          .from('employee_commission_config')
          .select('employee_id, profiles!employee_commission_config_employee_id_fkey(full_name)')
          .eq('eligible_for_commissions', true);

        const empList = (empData || []).map((e: any) => ({
          id: e.employee_id,
          full_name: e.profiles?.full_name || 'Unknown',
        })).sort((a: any, b: any) => a.full_name.localeCompare(b.full_name));
        setEmployees(empList);
      }
    } catch (err) {
      console.error('Error loading commission data:', err);
    } finally {
      setLoading(false);
    }
  }

  const payrollPeriods = useMemo(() => getPayrollPeriods(), []);

  function applyPeriod(start: string, end: string) {
    setStartDate(start);
    setEndDate(end);
  }

  const filteredRecords = useMemo(() => {
    return records
      .filter(r => {
        if (filterStatus !== 'all' && r.status !== filterStatus) return false;
        if (filterEmployee !== 'all' && r.employee_id !== filterEmployee) return false;
        if (filterRole !== 'all' && r.role_type !== filterRole) return false;
        if (selectedEmployee && r.employee_id !== selectedEmployee) return false;
        if (startDate) {
          const rd = new Date(r.created_at);
          if (rd < new Date(startDate)) return false;
        }
        if (endDate) {
          const rd = new Date(r.created_at);
          const ed = new Date(endDate);
          ed.setHours(23, 59, 59, 999);
          if (rd > ed) return false;
        }
        return true;
      })
      .sort((a, b) => {
        let cmp = 0;
        switch (sortField) {
          case 'date': cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime(); break;
          case 'employee': cmp = a.employee_name.localeCompare(b.employee_name); break;
          case 'earned': cmp = a.amount_earned - b.amount_earned; break;
          case 'paid': cmp = a.amount_paid - b.amount_paid; break;
          case 'potential': cmp = a.total_potential_commission - b.total_potential_commission; break;
        }
        return sortDir === 'asc' ? cmp : -cmp;
      });
  }, [records, filterStatus, filterEmployee, filterRole, selectedEmployee, startDate, endDate, sortField, sortDir]);

  const stats = useMemo(() => {
    const src = selectedEmployee ? filteredRecords : records;
    return src.reduce(
      (acc, r) => {
        acc.potential += r.total_potential_commission || 0;
        acc.earned += r.amount_earned || 0;
        acc.paid += r.amount_paid || 0;
        if (r.status === 'ready_to_pay') acc.readyToPay += (r.amount_earned || 0) - (r.amount_paid || 0);
        return acc;
      },
      { potential: 0, earned: 0, paid: 0, readyToPay: 0 }
    );
  }, [records, filteredRecords, selectedEmployee]);

  const employeeSummaries = useMemo((): EmployeeSummary[] => {
    const map = new Map<string, EmployeeSummary>();
    const src = records.filter(r => {
      if (startDate && new Date(r.created_at) < new Date(startDate)) return false;
      if (endDate) { const ed = new Date(endDate); ed.setHours(23, 59, 59, 999); if (new Date(r.created_at) > ed) return false; }
      return true;
    });
    src.forEach(r => {
      if (!map.has(r.employee_id)) {
        map.set(r.employee_id, {
          id: r.employee_id,
          name: r.employee_name,
          potential: 0, earned: 0, paid: 0, owed: 0,
          recordCount: 0, roles: [],
        });
      }
      const s = map.get(r.employee_id)!;
      s.potential += r.total_potential_commission || 0;
      s.earned += r.amount_earned || 0;
      s.paid += r.amount_paid || 0;
      s.owed = s.earned - s.paid;
      s.recordCount++;
      if (!s.roles.includes(r.role_type)) s.roles.push(r.role_type);
    });
    return [...map.values()].sort((a, b) => b.earned - a.earned);
  }, [records, startDate, endDate]);

  function toggleSort(field: SortField) {
    if (sortField === field) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); }
    else { setSortField(field); setSortDir('desc'); }
  }

  function clearFilters() {
    setFilterStatus('all');
    setFilterEmployee('all');
    setFilterRole('all');
    setStartDate('');
    setEndDate('');
    setSelectedEmployee(null);
    setViewMode('all');
  }

  const hasFilters = filterStatus !== 'all' || filterEmployee !== 'all' || filterRole !== 'all' || startDate || endDate || selectedEmployee;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-5 h-5 text-green-400" />
          <h2 className="text-lg font-semibold text-white">
            {isAdmin ? 'Commission Dashboard' : 'My Commissions'}
          </h2>
          {selectedEmployee && (
            <button
              onClick={() => { setSelectedEmployee(null); setViewMode('all'); }}
              className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 px-2 py-1 rounded"
            >
              <X className="w-3 h-3" />
              {employeeSummaries.find(e => e.id === selectedEmployee)?.name || 'Employee'}
            </button>
          )}
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setViewMode('all'); setSelectedEmployee(null); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                viewMode === 'all' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-700'
              }`}
            >
              All Records
            </button>
            <button
              onClick={() => setViewMode('employee')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                viewMode === 'employee' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-700'
              }`}
            >
              By Employee
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Potential" value={`$${fmt(stats.potential)}`} icon={TrendingUp} color="text-blue-400" />
        <StatCard label="Earned to Date" value={`$${fmt(stats.earned)}`} icon={DollarSign} color="text-green-400" />
        <StatCard label="Paid Out" value={`$${fmt(stats.paid)}`} icon={CheckCircle} color="text-emerald-400" />
        <StatCard label="Ready to Pay" value={`$${fmt(stats.readyToPay)}`} icon={Clock} color={stats.readyToPay > 0 ? 'text-amber-400' : 'text-gray-500'} />
      </div>

      <div className="bg-gray-900/50 rounded-lg border border-gray-700/50 p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Filter className="w-3.5 h-3.5" />
          Filters & Date Range
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Status</label>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="w-full px-2 py-1.5 bg-gray-800 border border-gray-600 rounded text-xs text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="accruing">Accruing</option>
              <option value="ready_to_pay">Ready to Pay</option>
              <option value="paid">Paid</option>
            </select>
          </div>

          {isAdmin && !selectedEmployee && (
            <div>
              <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Employee</label>
              <select
                value={filterEmployee}
                onChange={e => setFilterEmployee(e.target.value)}
                className="w-full px-2 py-1.5 bg-gray-800 border border-gray-600 rounded text-xs text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Role Type</label>
            <select
              value={filterRole}
              onChange={e => setFilterRole(e.target.value)}
              className="w-full px-2 py-1.5 bg-gray-800 border border-gray-600 rounded text-xs text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All</option>
              {Object.entries(roleTypeLabels).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full px-2 py-1.5 bg-gray-800 border border-gray-600 rounded text-xs text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full px-2 py-1.5 bg-gray-800 border border-gray-600 rounded text-xs text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Payroll Period</label>
            <select
              value=""
              onChange={e => {
                const p = payrollPeriods.find(pp => pp.label === e.target.value);
                if (p) applyPeriod(p.start, p.end);
              }}
              className="w-full px-2 py-1.5 bg-gray-800 border border-gray-600 rounded text-xs text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select period...</option>
              {payrollPeriods.map(p => (
                <option key={p.label} value={p.label}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>

        {hasFilters && (
          <div className="flex items-center gap-2 pt-1">
            <span className="text-[10px] text-gray-600">Active:</span>
            {filterStatus !== 'all' && <FilterBadge label={`Status: ${statusLabels[filterStatus]?.label || filterStatus}`} onRemove={() => setFilterStatus('all')} />}
            {filterEmployee !== 'all' && <FilterBadge label={`Employee: ${employees.find(e => e.id === filterEmployee)?.full_name}`} onRemove={() => setFilterEmployee('all')} />}
            {filterRole !== 'all' && <FilterBadge label={`Role: ${roleTypeLabels[filterRole]?.label || filterRole}`} onRemove={() => setFilterRole('all')} />}
            {startDate && <FilterBadge label={`From: ${startDate}`} onRemove={() => setStartDate('')} />}
            {endDate && <FilterBadge label={`To: ${endDate}`} onRemove={() => setEndDate('')} />}
            <button onClick={clearFilters} className="text-[10px] text-blue-400 hover:text-blue-300 ml-1">Clear all</button>
          </div>
        )}
      </div>

      {isAdmin && viewMode === 'employee' && !selectedEmployee && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-400 flex items-center gap-2">
            <Users className="w-4 h-4" />
            Employee Summary
            {(startDate || endDate) && <span className="text-[10px] text-gray-600">(filtered by date)</span>}
          </h3>
          {employeeSummaries.length === 0 ? (
            <div className="bg-gray-900/50 rounded-lg border border-gray-700/50 p-6 text-center text-gray-500 text-sm">
              No commission records found
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {employeeSummaries.map(emp => (
                <button
                  key={emp.id}
                  onClick={() => { setSelectedEmployee(emp.id); setViewMode('all'); }}
                  className="bg-gray-900/50 rounded-lg border border-gray-700/50 p-4 text-left hover:border-blue-500/50 transition-colors group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-white group-hover:text-blue-400 transition-colors">{emp.name}</span>
                    <span className="text-[10px] text-gray-600">{emp.recordCount} records</span>
                  </div>
                  <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                    {emp.roles.map(r => {
                      const cfg = roleTypeLabels[r];
                      return cfg ? (
                        <span key={r} className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${cfg.color}`}>
                          {cfg.label}
                        </span>
                      ) : null;
                    })}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <div className="text-[10px] text-gray-600">Earned</div>
                      <div className="text-sm font-semibold text-green-400">${fmt(emp.earned)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-600">Paid</div>
                      <div className="text-sm font-medium text-emerald-400">${fmt(emp.paid)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-600">Owed</div>
                      <div className={`text-sm font-medium ${emp.owed > 0 ? 'text-amber-400' : 'text-gray-500'}`}>${fmt(emp.owed)}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {(viewMode === 'all' || selectedEmployee) && (
        <div className="bg-gray-900/50 rounded-lg border border-gray-700/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-700/50 flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
              {selectedEmployee
                ? `${employeeSummaries.find(e => e.id === selectedEmployee)?.name || 'Employee'} - Commission Records`
                : `Commission Records (${filteredRecords.length})`}
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-[10px] text-gray-500 uppercase tracking-wider border-b border-gray-700/50">
                  {isAdmin && !selectedEmployee && (
                    <th className="text-left px-4 py-2.5">
                      <SortButton field="employee" current={sortField} dir={sortDir} onClick={toggleSort} label="Employee" />
                    </th>
                  )}
                  <th className="text-left px-4 py-2.5">Type</th>
                  <th className="text-right px-4 py-2.5">Basis Amt</th>
                  <th className="text-right px-4 py-2.5">Rate</th>
                  <th className="text-right px-4 py-2.5">
                    <SortButton field="potential" current={sortField} dir={sortDir} onClick={toggleSort} label="Potential" align="right" />
                  </th>
                  <th className="text-right px-4 py-2.5">
                    <SortButton field="earned" current={sortField} dir={sortDir} onClick={toggleSort} label="Earned" align="right" />
                  </th>
                  <th className="text-right px-4 py-2.5">
                    <SortButton field="paid" current={sortField} dir={sortDir} onClick={toggleSort} label="Paid" align="right" />
                  </th>
                  <th className="text-center px-4 py-2.5">Status</th>
                  <th className="text-center px-4 py-2.5">
                    <SortButton field="date" current={sortField} dir={sortDir} onClick={toggleSort} label="Date" align="center" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/30">
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin && !selectedEmployee ? 9 : 8} className="px-4 py-12 text-center text-gray-500 text-sm">
                      No commission records found
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map(r => {
                    const roleCfg = roleTypeLabels[r.role_type] || { label: r.role_type, color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' };
                    const sCfg = statusLabels[r.status] || statusLabels.pending;
                    return (
                      <tr key={r.id} className="hover:bg-gray-800/30 transition-colors">
                        {isAdmin && !selectedEmployee && (
                          <td className="px-4 py-2.5">
                            <button
                              onClick={() => { setSelectedEmployee(r.employee_id); setViewMode('all'); }}
                              className="text-sm text-white hover:text-blue-400 transition-colors"
                            >
                              {r.employee_name}
                            </button>
                          </td>
                        )}
                        <td className="px-4 py-2.5">
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${roleCfg.color}`}>
                            {roleCfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-sm text-white text-right">${fmt(r.basis_amount)}</td>
                        <td className="px-4 py-2.5 text-sm text-gray-400 text-right">{Number(r.commission_rate).toFixed(2)}%</td>
                        <td className="px-4 py-2.5 text-sm text-gray-300 text-right">${fmt(r.total_potential_commission)}</td>
                        <td className="px-4 py-2.5 text-sm font-semibold text-green-400 text-right">${fmt(r.amount_earned)}</td>
                        <td className="px-4 py-2.5 text-sm text-emerald-400 text-right">${fmt(r.amount_paid)}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${sCfg.color}`}>
                            {sCfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-500 text-center">
                          {new Date(r.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {filteredRecords.length > 1 && (
                <tfoot>
                  <tr className="border-t-2 border-gray-600 bg-gray-800/30">
                    {isAdmin && !selectedEmployee && <td className="px-4 py-2.5 text-sm font-semibold text-white">Totals</td>}
                    {(!isAdmin || selectedEmployee) && <td className="px-4 py-2.5 text-sm font-semibold text-white">Totals</td>}
                    <td className="px-4 py-2.5" />
                    <td className="px-4 py-2.5" />
                    <td className="px-4 py-2.5 text-sm font-semibold text-gray-300 text-right">
                      ${fmt(filteredRecords.reduce((s, r) => s + (r.total_potential_commission || 0), 0))}
                    </td>
                    <td className="px-4 py-2.5 text-sm font-semibold text-green-400 text-right">
                      ${fmt(filteredRecords.reduce((s, r) => s + (r.amount_earned || 0), 0))}
                    </td>
                    <td className="px-4 py-2.5 text-sm font-semibold text-emerald-400 text-right">
                      ${fmt(filteredRecords.reduce((s, r) => s + (r.amount_paid || 0), 0))}
                    </td>
                    <td className="px-4 py-2.5" />
                    <td className="px-4 py-2.5" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {records.length === 0 && (
        <div className="bg-gray-900/50 rounded-lg border border-gray-700/50 p-8 text-center">
          <DollarSign className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-gray-400 mb-1">No Commissions Yet</h3>
          <p className="text-xs text-gray-600">
            {isAdmin
              ? 'Commission records appear when invoices are generated for eligible employees.'
              : 'Your commission records appear when you earn commissions on completed work.'}
          </p>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: string; icon: typeof DollarSign; color: string;
}) {
  return (
    <div className="bg-gray-900/50 rounded-lg border border-gray-700/50 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
    </div>
  );
}

function SortButton({ field, current, dir, onClick, label, align = 'left' }: {
  field: SortField; current: SortField; dir: SortDir; onClick: (f: SortField) => void; label: string; align?: 'left' | 'right' | 'center';
}) {
  const isActive = current === field;
  return (
    <button
      onClick={() => onClick(field)}
      className={`flex items-center gap-0.5 hover:text-gray-300 transition-colors ${
        align === 'right' ? 'ml-auto' : align === 'center' ? 'mx-auto' : ''
      } ${isActive ? 'text-gray-300' : ''}`}
    >
      {label}
      {isActive && <ChevronsUpDown className={`w-3 h-3 ${dir === 'asc' ? 'rotate-180' : ''}`} />}
    </button>
  );
}

function FilterBadge({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/30 rounded text-[10px] font-medium">
      {label}
      <button onClick={onRemove} className="hover:text-white"><X className="w-2.5 h-2.5" /></button>
    </span>
  );
}
