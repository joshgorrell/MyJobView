import { useState, useEffect } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Printer,
  Plus,
  Trash2,
  RefreshCw,
  DollarSign,
  Shield,
  Star,
  Wrench,
  MoreHorizontal,
  AlertCircle,
  Check,
  X,
  Pencil,
  Users,
  TrendingUp,
  Hash
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

// ─── Types ───────────────────────────────────────────────────────────────────

type SourceType = 'security_contract' | 'vip_plan' | 'service_plan' | 'other';

interface Rep {
  id: string;
  full_name: string;
}

interface PayPeriod {
  label: string;
  start: string;
  end: string;
}

interface ContractLine {
  // Identity
  recordId: string | null;   // contract_commission_records.id (null if not yet saved)
  sourceType: SourceType;
  sourceId: string;
  contractNumber: string;
  customerName: string;
  saleDate: string;
  // Financials
  employeeId: string;
  employeeName: string;
  monthlyAmount: number;
  termMonths: number;
  totalContractValue: number; // monthlyAmount * termMonths (live calc)
  originalRate: number;       // from company/employee config
  effectiveRate: number;      // may be overridden
  commissionAmount: number;   // totalContractValue * effectiveRate / 100
  // State
  status: 'pending' | 'approved' | 'paid';
}

interface Deduction {
  id: string;
  employeeId: string;
  description: string;
  amount: number;
  isNew?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function fmtDate(s: string | null | undefined) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function generatePayPeriods(frequency: string): PayPeriod[] {
  const periods: PayPeriod[] = [];
  const now = new Date();
  if (frequency === 'monthly') {
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      const end = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${lastDay}`;
      periods.push({ label: d.toLocaleString('en-US', { month: 'long', year: 'numeric' }), start, end });
    }
  } else {
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - Math.floor(i / 2), 1);
      const year = d.getFullYear();
      const month = d.getMonth();
      const monthStr = String(month + 1).padStart(2, '0');
      const lastDay = new Date(year, month + 1, 0).getDate();
      const monthName = d.toLocaleString('en-US', { month: 'short' });
      if (i % 2 === 0) {
        periods.push({ label: `${monthName} 16–${lastDay}, ${year}`, start: `${year}-${monthStr}-16`, end: `${year}-${monthStr}-${lastDay}` });
      } else {
        periods.push({ label: `${monthName} 1–15, ${year}`, start: `${year}-${monthStr}-01`, end: `${year}-${monthStr}-15` });
      }
    }
  }
  return periods;
}

const SOURCE_TYPE_META: Record<SourceType, { label: string; icon: typeof Shield; color: string; bg: string }> = {
  security_contract: { label: 'Security Contract', icon: Shield, color: 'text-blue-400', bg: 'bg-blue-500/15 border-blue-500/30' },
  vip_plan:          { label: 'VIP Plan',           icon: Star,   color: 'text-amber-400', bg: 'bg-amber-500/15 border-amber-500/30' },
  service_plan:      { label: 'Service Plan',       icon: Wrench, color: 'text-green-400', bg: 'bg-green-500/15 border-green-500/30' },
  other:             { label: 'Other Contract',     icon: MoreHorizontal, color: 'text-gray-400', bg: 'bg-gray-500/15 border-gray-500/30' },
};

// ─── Component ───────────────────────────────────────────────────────────────

export function ContractCommissionReportPage() {
  const { profile } = useAuth();

  // Filters
  const [dateMode, setDateMode] = useState<'period' | 'custom'>('period');
  const [selectedPeriod, setSelectedPeriod] = useState<PayPeriod | null>(null);
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [selectedReps, setSelectedReps] = useState<string[]>([]);
  const [sourceTypeFilter, setSourceTypeFilter] = useState<SourceType | 'all'>('all');

  // Reference data
  const [reps, setReps] = useState<Rep[]>([]);
  const [payPeriods, setPayPeriods] = useState<PayPeriod[]>([]);
  const [defaultRate, setDefaultRate] = useState(7);

  // Report state
  const [lines, setLines] = useState<ContractLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, number>>({}); // key: sourceId__employeeId
  const [editingOverride, setEditingOverride] = useState<string | null>(null);
  const [overrideDraft, setOverrideDraft] = useState('');
  const [deductions, setDeductions] = useState<Record<string, Deduction[]>>({});
  const [collapsedReps, setCollapsedReps] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadReferenceData();
  }, []);

  async function loadReferenceData() {
    // Load reps
    const { data: repsData } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('is_active', true)
      .order('full_name');
    setReps((repsData || []) as Rep[]);

    // Load payroll frequency + default contract rate
    const { data: commSettings } = await supabase
      .from('company_commission_settings')
      .select('payroll_frequency, default_contract_commission_rate')
      .maybeSingle();

    const freq = commSettings?.payroll_frequency || 'semi-monthly';
    const rate = Number(commSettings?.default_contract_commission_rate || 7);
    setDefaultRate(rate);

    const periods = generatePayPeriods(freq);
    setPayPeriods(periods);
    if (periods.length > 0) {
      setSelectedPeriod(periods[0]);
      setDateStart(periods[0].start);
      setDateEnd(periods[0].end);
    }
  }

  function getActiveRange() {
    if (dateMode === 'period' && selectedPeriod) return { start: selectedPeriod.start, end: selectedPeriod.end };
    return { start: dateStart, end: dateEnd };
  }

  // Computed lines: apply overrides reactively
  const computedLines = lines.map(line => {
    const key = `${line.sourceId}__${line.employeeId}`;
    const rate = overrides[key] ?? line.originalRate;
    return { ...line, effectiveRate: rate, commissionAmount: (line.totalContractValue * rate) / 100 };
  });

  // Filter by source type
  const filteredLines = sourceTypeFilter === 'all'
    ? computedLines
    : computedLines.filter(l => l.sourceType === sourceTypeFilter);

  async function runReport() {
    const { start, end } = getActiveRange();
    if (!start || !end) return;
    setLoading(true);
    setHasRun(true);

    try {
      const orgId = profile?.organization_id;

      // 1. Load per-employee contract rates
      const { data: empConfigs } = await supabase
        .from('employee_commission_config')
        .select('employee_id, custom_contract_commission_rate')
        .eq('organization_id', orgId);

      const empRateMap: Record<string, number> = {};
      for (const ec of empConfigs || []) {
        if (ec.custom_contract_commission_rate != null) {
          empRateMap[ec.employee_id] = Number(ec.custom_contract_commission_rate);
        }
      }

      // 2. Load rate overrides saved for this org
      const { data: savedOverrides } = await supabase
        .from('commission_report_rate_overrides')
        .select('*')
        .eq('organization_id', orgId)
        .eq('role_type', 'contract_sales');

      const overrideMap: Record<string, number> = {};
      for (const o of savedOverrides || []) {
        overrideMap[`${o.invoice_id}__${o.employee_id}`] = Number(o.overridden_rate);
      }
      setOverrides(overrideMap);

      // 3. Fetch security contracts signed in the date range
      let scQuery = supabase
        .from('security_contracts')
        .select(`
          id,
          contract_number,
          monthly_price,
          price_override,
          term_months,
          created_at,
          status,
          created_by_user_id,
          contacts(full_name),
          profiles!security_contracts_created_by_user_id_fkey(full_name)
        `)
        .gte('created_at', `${start}T00:00:00`)
        .lte('created_at', `${end}T23:59:59`)
        .in('status', ['active', 'pending_approval', 'approved', 'completed']);

      if (orgId) scQuery = scQuery.eq('organization_id', orgId);
      if (selectedReps.length > 0) scQuery = scQuery.in('created_by_user_id', selectedReps);

      const { data: scData } = await scQuery;

      // 4. Fetch recurring subscriptions (VIP / service plans) created in range
      let subQuery = supabase
        .from('recurring_subscriptions')
        .select(`
          id,
          start_date,
          custom_amount,
          status,
          created_by,
          contacts(full_name),
          recurring_plans(plan_name, plan_type, amount),
          profiles!recurring_subscriptions_created_by_fkey(full_name)
        `)
        .gte('start_date', start)
        .lte('start_date', end)
        .in('status', ['active', 'paused', 'trial']);

      if (orgId) subQuery = subQuery.eq('organization_id', orgId);
      if (selectedReps.length > 0) subQuery = subQuery.in('created_by', selectedReps);

      const { data: subData } = await subQuery;

      // 5. Also load any manually entered contract_commission_records in this range
      let savedQuery = supabase
        .from('contract_commission_records')
        .select('*')
        .gte('sale_date', start)
        .lte('sale_date', end);
      if (orgId) savedQuery = savedQuery.eq('organization_id', orgId);
      if (selectedReps.length > 0) savedQuery = savedQuery.in('employee_id', selectedReps);
      const { data: savedRecords } = await savedQuery;

      // Build lines
      const reportLines: ContractLine[] = [];

      // Security contracts
      for (const sc of scData || []) {
        const empId = sc.created_by_user_id;
        const empName = (sc.profiles as any)?.full_name || 'Unknown';
        const monthly = Number(sc.price_override || sc.monthly_price || 0);
        const term = Number(sc.term_months || 36);
        const baseRate = empRateMap[empId] ?? defaultRate;
        const overrideKey = `${sc.id}__${empId}`;
        const rate = overrideMap[overrideKey] ?? baseRate;
        const total = monthly * term;

        reportLines.push({
          recordId: savedRecords?.find(r => r.source_id === sc.id && r.employee_id === empId)?.id || null,
          sourceType: 'security_contract',
          sourceId: sc.id,
          contractNumber: sc.contract_number || '—',
          customerName: (sc.contacts as any)?.full_name || '—',
          saleDate: sc.created_at?.split('T')[0] || start,
          employeeId: empId || '',
          employeeName: empName,
          monthlyAmount: monthly,
          termMonths: term,
          totalContractValue: total,
          originalRate: baseRate,
          effectiveRate: rate,
          commissionAmount: (total * rate) / 100,
          status: 'pending'
        });
      }

      // Recurring subscriptions (VIP / service plans)
      for (const sub of subData || []) {
        const empId = (sub as any).created_by;
        const plan = (sub as any).recurring_plans;
        if (!plan) continue;
        const empName = (sub as any).profiles?.full_name || 'Unknown';
        const monthly = Number((sub as any).custom_amount || plan.amount || 0);
        // Plans don't have a term — treat as 12 months for VIP, or use 1 for service (monthly, commission on first month only)
        const planType = plan.plan_type as SourceType || 'other';
        const term = planType === 'vip_plan' ? 12 : 12;
        const baseRate = empRateMap[empId] ?? defaultRate;
        const overrideKey = `${sub.id}__${empId}`;
        const rate = overrideMap[overrideKey] ?? baseRate;
        const total = monthly * term;

        reportLines.push({
          recordId: savedRecords?.find(r => r.source_id === sub.id && r.employee_id === empId)?.id || null,
          sourceType: planType === 'security_contract' ? 'security_contract' : planType === 'vip_plan' ? 'vip_plan' : 'service_plan',
          sourceId: sub.id,
          contractNumber: `SUB-${sub.id.slice(0, 8).toUpperCase()}`,
          customerName: (sub as any).contacts?.full_name || '—',
          saleDate: (sub as any).start_date || start,
          employeeId: empId || '',
          employeeName: empName,
          monthlyAmount: monthly,
          termMonths: term,
          totalContractValue: total,
          originalRate: baseRate,
          effectiveRate: rate,
          commissionAmount: (total * rate) / 100,
          status: 'pending'
        });
      }

      // Sort by rep name, then date
      reportLines.sort((a, b) => {
        const empCmp = a.employeeName.localeCompare(b.employeeName);
        return empCmp !== 0 ? empCmp : a.saleDate.localeCompare(b.saleDate);
      });

      setLines(reportLines);

      // Load deductions for this period
      if (orgId) {
        const { data: dedsData } = await supabase
          .from('commission_report_deductions')
          .select('*')
          .eq('organization_id', orgId)
          .eq('period_start', start)
          .eq('period_end', end);

        if (dedsData) {
          const grouped: Record<string, Deduction[]> = {};
          for (const d of dedsData) {
            const k = d.employee_id || '__all__';
            if (!grouped[k]) grouped[k] = [];
            grouped[k].push({ id: d.id, employeeId: d.employee_id, description: d.description, amount: Number(d.amount) });
          }
          setDeductions(grouped);
        }
      }
    } catch (err) {
      console.error('Contract commission report error:', err);
    } finally {
      setLoading(false);
    }
  }

  // Group filtered lines by employee
  const linesByEmployee = filteredLines.reduce((acc, line) => {
    if (!acc[line.employeeId]) acc[line.employeeId] = { name: line.employeeName, lines: [] };
    acc[line.employeeId].lines.push(line);
    return acc;
  }, {} as Record<string, { name: string; lines: ContractLine[] }>);

  // Summary
  const totalContracts = filteredLines.length;
  const totalContractValue = filteredLines.reduce((s, l) => s + l.totalContractValue, 0);
  const totalCommission = filteredLines.reduce((s, l) => s + l.commissionAmount, 0);
  const totalDeductions = Object.values(deductions).flat().reduce((s, d) => s + d.amount, 0);
  const netCommission = totalCommission - totalDeductions;

  // ── Rate override handlers ──

  function startEdit(key: string, currentRate: number) {
    setEditingOverride(key);
    setOverrideDraft(String(currentRate));
  }

  async function saveOverride(line: ContractLine) {
    const key = `${line.sourceId}__${line.employeeId}`;
    const newRate = parseFloat(overrideDraft);
    if (isNaN(newRate) || newRate < 0) { setEditingOverride(null); return; }
    setOverrides(prev => ({ ...prev, [key]: newRate }));
    setEditingOverride(null);

    if (!profile?.organization_id) return;
    // Reuse commission_report_rate_overrides — store source_id in invoice_id column, role_type='contract_sales'
    await supabase
      .from('commission_report_rate_overrides')
      .upsert({
        organization_id: profile.organization_id,
        invoice_id: line.sourceId,
        employee_id: line.employeeId,
        role_type: 'contract_sales',
        original_rate: line.originalRate,
        overridden_rate: newRate,
        created_by: profile.id
      }, { onConflict: 'organization_id,invoice_id,employee_id,role_type' });
  }

  async function resetOverride(line: ContractLine) {
    const key = `${line.sourceId}__${line.employeeId}`;
    setOverrides(prev => { const n = { ...prev }; delete n[key]; return n; });
    if (!profile?.organization_id) return;
    await supabase
      .from('commission_report_rate_overrides')
      .delete()
      .eq('organization_id', profile.organization_id)
      .eq('invoice_id', line.sourceId)
      .eq('employee_id', line.employeeId)
      .eq('role_type', 'contract_sales');
  }

  // ── Deduction handlers ──

  function addDeduction(empId: string) {
    const d: Deduction = { id: crypto.randomUUID(), employeeId: empId, description: '', amount: 0, isNew: true };
    setDeductions(prev => ({ ...prev, [empId]: [...(prev[empId] || []), d] }));
  }

  function updateDeduction(empId: string, dId: string, field: 'description' | 'amount', val: string) {
    setDeductions(prev => ({
      ...prev,
      [empId]: (prev[empId] || []).map(d => d.id === dId ? { ...d, [field]: field === 'amount' ? parseFloat(val) || 0 : val } : d)
    }));
  }

  async function saveDeduction(empId: string, dId: string) {
    const ded = (deductions[empId] || []).find(d => d.id === dId);
    if (!ded || !profile?.organization_id) return;
    const { start, end } = getActiveRange();
    if (ded.isNew) {
      const { data } = await supabase
        .from('commission_report_deductions')
        .insert({ organization_id: profile.organization_id, employee_id: empId, period_start: start, period_end: end, description: ded.description, amount: ded.amount, created_by: profile.id })
        .select('id').single();
      if (data) {
        setDeductions(prev => ({ ...prev, [empId]: (prev[empId] || []).map(d => d.id === dId ? { ...d, id: data.id, isNew: false } : d) }));
      }
    } else {
      await supabase.from('commission_report_deductions').update({ description: ded.description, amount: ded.amount }).eq('id', dId);
    }
  }

  async function deleteDeduction(empId: string, dId: string) {
    const ded = (deductions[empId] || []).find(d => d.id === dId);
    if (!ded) return;
    if (!ded.isNew) await supabase.from('commission_report_deductions').delete().eq('id', dId);
    setDeductions(prev => ({ ...prev, [empId]: (prev[empId] || []).filter(d => d.id !== dId) }));
  }

  // ── Export ──

  function exportCSV() {
    const { start, end } = getActiveRange();
    const rows: string[][] = [];
    rows.push(['Contract Commission Report', `Period: ${fmtDate(start)} – ${fmtDate(end)}`]);
    rows.push([]);
    rows.push(['Contract #', 'Customer', 'Sale Date', 'Type', 'Monthly Amount', 'Term (Months)', 'Total Contract Value', 'Employee', 'Rate %', 'Commission $', 'Formula']);

    for (const [empId, group] of Object.entries(linesByEmployee)) {
      for (const line of group.lines) {
        rows.push([
          line.contractNumber,
          line.customerName,
          fmtDate(line.saleDate),
          SOURCE_TYPE_META[line.sourceType].label,
          line.monthlyAmount.toFixed(2),
          String(line.termMonths),
          line.totalContractValue.toFixed(2),
          line.employeeName,
          line.effectiveRate.toFixed(2),
          line.commissionAmount.toFixed(2),
          `${line.termMonths} × $${line.monthlyAmount.toFixed(2)} = $${line.totalContractValue.toFixed(2)} × ${line.effectiveRate}% = $${line.commissionAmount.toFixed(2)}`
        ]);
      }
      const subtotal = group.lines.reduce((s, l) => s + l.commissionAmount, 0);
      const repDeds = (deductions[empId] || []).reduce((s, d) => s + d.amount, 0);
      rows.push(['', '', '', '', '', '', '', `${group.name} Subtotal`, '', subtotal.toFixed(2), '']);
      if (repDeds > 0) {
        for (const d of deductions[empId] || []) rows.push(['', '', '', '', '', '', '', `  Deduction: ${d.description}`, '', (-d.amount).toFixed(2), '']);
        rows.push(['', '', '', '', '', '', '', `${group.name} Net`, '', (subtotal - repDeds).toFixed(2), '']);
      }
      rows.push([]);
    }
    rows.push(['', '', '', '', '', '', '', 'GRAND TOTAL', '', netCommission.toFixed(2), '']);

    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contract-commission-report-${start}-to-${end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const { start: activeStart, end: activeEnd } = getActiveRange();
  const canRun = Boolean(activeStart && activeEnd);

  return (
    <div className="space-y-6 print:space-y-4">

      {/* ── Filter Panel ── */}
      <div className="print:hidden bg-gray-900/60 rounded-xl border border-gray-700 p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Calendar className="w-4 h-4 text-emerald-400" />
            Report Filters
          </h2>
          {hasRun && (
            <button
              onClick={runReport}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          )}
        </div>

        {/* Date mode toggle */}
        <div className="flex items-center gap-1 bg-gray-800 p-1 rounded-lg w-fit">
          <button
            onClick={() => setDateMode('period')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${dateMode === 'period' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
          >
            Pay Period
          </button>
          <button
            onClick={() => setDateMode('custom')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${dateMode === 'custom' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
          >
            Custom Dates
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Date / Period */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              {dateMode === 'period' ? 'Pay Period' : 'Date Range'}
            </label>
            {dateMode === 'period' ? (
              <select
                value={selectedPeriod?.label || ''}
                onChange={e => {
                  const p = payPeriods.find(x => x.label === e.target.value);
                  if (p) { setSelectedPeriod(p); setDateStart(p.start); setDateEnd(p.end); }
                }}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {payPeriods.map(p => <option key={p.label} value={p.label}>{p.label}</option>)}
              </select>
            ) : (
              <div className="space-y-1.5">
                <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
              </div>
            )}
          </div>

          {/* Reps */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              Sales Rep <span className="text-gray-600 normal-case">(blank = all)</span>
            </label>
            <select multiple size={3} value={selectedReps}
              onChange={e => setSelectedReps(Array.from(e.target.selectedOptions, o => o.value))}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {reps.map(r => <option key={r.id} value={r.id}>{r.full_name}</option>)}
            </select>
            {selectedReps.length > 0 && (
              <button onClick={() => setSelectedReps([])} className="text-xs text-blue-400 hover:text-blue-300">Clear</button>
            )}
          </div>

          {/* Source type */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Contract Type</label>
            <div className="space-y-1.5">
              {([['all', 'All Types'], ['security_contract', 'Security Contracts'], ['vip_plan', 'VIP Plans'], ['service_plan', 'Service Plans'], ['other', 'Other']] as const).map(([val, lbl]) => (
                <label key={val} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="sourceType" value={val} checked={sourceTypeFilter === val}
                    onChange={() => setSourceTypeFilter(val as SourceType | 'all')}
                    className="text-blue-500 bg-gray-700 border-gray-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-300">{lbl}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Info */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider block">Commission Info</label>
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3 space-y-1.5">
              <p className="text-xs text-gray-400 font-medium">Default Rate: <span className="text-emerald-400">{defaultRate}%</span></p>
              <p className="text-xs text-gray-500">Formula:</p>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Term × Monthly = Total Value × Rate% = Commission
              </p>
              <p className="text-[10px] text-gray-600">
                Earned at point of sale
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={runReport}
            disabled={!canRun || loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            {loading ? 'Running...' : 'Run Report'}
          </button>
        </div>
      </div>

      {/* ── Report Output ── */}
      {hasRun && !loading && (
        <div className="space-y-6">
          {/* Print header */}
          <div className="hidden print:block">
            <h1 className="text-2xl font-bold text-gray-900">Contract Commission Report</h1>
            <p className="text-sm text-gray-600">Period: {fmtDate(activeStart)} – {fmtDate(activeEnd)}</p>
            <p className="text-xs text-gray-400">Generated {new Date().toLocaleString()}</p>
          </div>

          {/* Actions */}
          {filteredLines.length > 0 && (
            <div className="print:hidden flex items-center justify-between">
              <p className="text-sm text-gray-400">
                {filteredLines.length} contract{filteredLines.length !== 1 ? 's' : ''} found
              </p>
              <div className="flex items-center gap-2">
                <button onClick={exportCSV}
                  className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors">
                  <Download className="w-4 h-4" />Export CSV
                </button>
                <button onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded-lg transition-colors">
                  <Printer className="w-4 h-4" />Print / PDF
                </button>
              </div>
            </div>
          )}

          {/* Summary cards */}
          {filteredLines.length > 0 && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <SummaryCard label="Contracts Sold" value={String(totalContracts)} icon={Hash} color="text-white" />
              <SummaryCard label="Total Contract Value" value={fmt(totalContractValue)} icon={DollarSign} color="text-blue-400" />
              <SummaryCard label="Total Commissions" value={fmt(totalCommission)} icon={TrendingUp} color="text-emerald-400" />
              <SummaryCard
                label="Net After Deductions"
                value={fmt(netCommission)}
                icon={Users}
                color="text-green-400"
                sub={totalDeductions > 0 ? `After ${fmt(totalDeductions)} deducted` : undefined}
              />
            </div>
          )}

          {/* Empty state */}
          {filteredLines.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 bg-gray-900/40 rounded-xl border border-gray-700">
              <AlertCircle className="w-10 h-10 text-gray-600 mb-3" />
              <p className="text-sm font-medium text-gray-400">No contracts found</p>
              <p className="text-xs text-gray-600 mt-1">No active contracts found for the selected period and filters</p>
            </div>
          )}

          {/* Per-rep sections */}
          {Object.entries(linesByEmployee).map(([empId, group]) => {
            const repSubtotal = group.lines.reduce((s, l) => s + l.commissionAmount, 0);
            const repDeductions = (deductions[empId] || []).reduce((s, d) => s + d.amount, 0);
            const repNet = repSubtotal - repDeductions;
            const isCollapsed = collapsedReps.has(empId);

            return (
              <div key={empId} className="bg-gray-900/40 rounded-xl border border-gray-700 overflow-hidden print:break-inside-avoid">
                {/* Rep header */}
                <div
                  className="flex items-center justify-between px-5 py-3 bg-gray-800/60 cursor-pointer select-none print:cursor-default"
                  onClick={() => setCollapsedReps(prev => { const n = new Set(prev); if (n.has(empId)) n.delete(empId); else n.add(empId); return n; })}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-sm font-bold text-emerald-400">
                      {group.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{group.name}</p>
                      <p className="text-xs text-gray-500">{group.lines.length} contract{group.lines.length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs text-gray-500">Commission</p>
                      <p className="text-sm font-bold text-emerald-400">{fmt(repNet)}</p>
                    </div>
                    <div className="print:hidden">
                      {isCollapsed ? <ChevronRight className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                    </div>
                  </div>
                </div>

                {!isCollapsed && (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-800/30 text-xs text-gray-500 uppercase tracking-wider border-b border-gray-700/50">
                            <th className="px-4 py-2.5 text-left">Contract #</th>
                            <th className="px-4 py-2.5 text-left">Customer</th>
                            <th className="px-4 py-2.5 text-left">Sale Date</th>
                            <th className="px-4 py-2.5 text-center">Type</th>
                            <th className="px-4 py-2.5 text-right">Monthly</th>
                            <th className="px-4 py-2.5 text-center">Term</th>
                            <th className="px-4 py-2.5 text-right">Total Value</th>
                            <th className="px-4 py-2.5 text-center">Rate %</th>
                            <th className="px-4 py-2.5 text-right">Commission</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700/30">
                          {group.lines.map(line => {
                            const overrideKey = `${line.sourceId}__${line.employeeId}`;
                            const isEditing = editingOverride === overrideKey;
                            const hasOverride = overrides[overrideKey] !== undefined && overrides[overrideKey] !== line.originalRate;
                            const meta = SOURCE_TYPE_META[line.sourceType];
                            const Icon = meta.icon;

                            return (
                              <tr key={line.sourceId} className="hover:bg-gray-800/30 transition-colors">
                                <td className="px-4 py-2.5 font-mono text-xs text-gray-300">{line.contractNumber}</td>
                                <td className="px-4 py-2.5 text-gray-300">{line.customerName}</td>
                                <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap text-xs">{fmtDate(line.saleDate)}</td>
                                <td className="px-4 py-2.5 text-center">
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full border ${meta.bg} ${meta.color}`}>
                                    <Icon className="w-3 h-3" />
                                    {meta.label}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-right text-gray-300">{fmt(line.monthlyAmount)}</td>
                                <td className="px-4 py-2.5 text-center text-gray-400">
                                  <span className="px-1.5 py-0.5 bg-gray-700/60 rounded text-xs">{line.termMonths} mo</span>
                                </td>
                                <td className="px-4 py-2.5 text-right font-medium text-white">
                                  <span title={`${line.termMonths} × ${fmt(line.monthlyAmount)}`}>
                                    {fmt(line.totalContractValue)}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  {isEditing ? (
                                    <div className="flex items-center gap-1 justify-center print:hidden">
                                      <input type="number" step="0.1" min="0" max="100" value={overrideDraft}
                                        onChange={e => setOverrideDraft(e.target.value)}
                                        className="w-16 px-1.5 py-0.5 bg-gray-700 border border-emerald-500 rounded text-xs text-white text-center focus:outline-none"
                                        autoFocus
                                        onKeyDown={e => { if (e.key === 'Enter') saveOverride(line); if (e.key === 'Escape') setEditingOverride(null); }}
                                      />
                                      <button onClick={() => saveOverride(line)} className="text-green-400 hover:text-green-300"><Check className="w-3.5 h-3.5" /></button>
                                      <button onClick={() => setEditingOverride(null)} className="text-gray-500 hover:text-gray-400"><X className="w-3.5 h-3.5" /></button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1 justify-center group">
                                      <span className={`font-medium ${hasOverride ? 'text-amber-400' : 'text-gray-300'}`}>{line.effectiveRate}%</span>
                                      {hasOverride && <span className="text-[10px] text-gray-600">(was {line.originalRate}%)</span>}
                                      <button onClick={() => startEdit(overrideKey, line.effectiveRate)}
                                        className="print:hidden opacity-0 group-hover:opacity-100 transition-opacity ml-1 text-gray-600 hover:text-emerald-400" title="Edit rate">
                                        <Pencil className="w-3 h-3" />
                                      </button>
                                      {hasOverride && (
                                        <button onClick={() => resetOverride(line)}
                                          className="print:hidden opacity-0 group-hover:opacity-100 transition-opacity text-gray-600 hover:text-red-400" title="Reset">
                                          <X className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                  )}
                                  <span className="hidden print:inline">{line.effectiveRate}%</span>
                                </td>
                                <td className="px-4 py-2.5 text-right font-semibold text-emerald-400">
                                  {fmt(line.commissionAmount)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>

                        {/* Formula legend row */}
                        <tbody>
                          <tr className="border-t border-gray-700/30">
                            <td colSpan={9} className="px-4 py-1.5">
                              <p className="text-[10px] text-gray-600 italic">
                                Formula: Term (months) × Monthly Amount = Total Value × Rate % = Commission
                              </p>
                            </td>
                          </tr>
                        </tbody>

                        <tfoot>
                          <tr className="bg-gray-800/50 border-t border-gray-700">
                            <td colSpan={8} className="px-4 py-2 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">
                              {group.name} Subtotal
                            </td>
                            <td className="px-4 py-2 text-right font-bold text-emerald-400">{fmt(repSubtotal)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Deductions */}
                    <div className="px-5 py-4 border-t border-gray-700/50 bg-gray-900/30">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                          <TrendingUp className="w-3.5 h-3.5 text-red-400" />Deductions
                        </h4>
                        <button onClick={() => addDeduction(empId)}
                          className="print:hidden flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors">
                          <Plus className="w-3.5 h-3.5" />Add Deduction
                        </button>
                      </div>

                      {(deductions[empId] || []).length === 0 ? (
                        <p className="text-xs text-gray-600 italic">No deductions</p>
                      ) : (
                        <div className="space-y-2">
                          {(deductions[empId] || []).map(ded => (
                            <div key={ded.id} className="flex items-center gap-3">
                              <input type="text" placeholder="Description" value={ded.description}
                                onChange={e => updateDeduction(empId, ded.id, 'description', e.target.value)}
                                onBlur={() => saveDeduction(empId, ded.id)}
                                className="print:hidden flex-1 px-2.5 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-600 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                              />
                              <span className="hidden print:inline text-xs text-gray-400 flex-1">{ded.description}</span>
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-gray-500">$</span>
                                <input type="number" min="0" step="0.01" placeholder="0.00" value={ded.amount || ''}
                                  onChange={e => updateDeduction(empId, ded.id, 'amount', e.target.value)}
                                  onBlur={() => saveDeduction(empId, ded.id)}
                                  className="print:hidden w-24 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white text-right placeholder-gray-600 focus:ring-1 focus:ring-blue-500"
                                />
                                <span className="hidden print:inline text-xs text-red-400 w-24 text-right">{fmt(ded.amount)}</span>
                              </div>
                              <button onClick={() => deleteDeduction(empId, ded.id)}
                                className="print:hidden text-gray-600 hover:text-red-400 transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="mt-4 flex items-center justify-between pt-3 border-t border-gray-700/50">
                        <span className="text-xs font-semibold text-gray-300">{group.name} — Net Commission</span>
                        <div className="text-right">
                          {repDeductions > 0 && <p className="text-xs text-red-400">- {fmt(repDeductions)} deductions</p>}
                          <p className="text-sm font-bold text-emerald-400">{fmt(repNet)}</p>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}

          {/* Grand total */}
          {filteredLines.length > 0 && (
            <div className="flex items-center justify-between px-6 py-4 bg-gray-900 rounded-xl border border-gray-700 print:break-inside-avoid">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">Grand Total — All Reps</p>
                <p className="text-xs text-gray-600 mt-0.5">Period: {fmtDate(activeStart)} – {fmtDate(activeEnd)}</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-emerald-400">{fmt(netCommission)}</p>
                {totalDeductions > 0 && <p className="text-xs text-gray-500">After {fmt(totalDeductions)} in deductions</p>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── SummaryCard ─────────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub?: string; icon: typeof DollarSign; color: string;
}) {
  return (
    <div className="rounded-xl border border-gray-700 bg-gray-900/60 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-600 mt-0.5">{sub}</p>}
    </div>
  );
}
