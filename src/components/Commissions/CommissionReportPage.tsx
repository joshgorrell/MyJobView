import { useState, useEffect, useCallback } from 'react';
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
  CreditCard,
  TrendingUp,
  Users,
  AlertCircle,
  Check,
  X,
  Pencil
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Rep {
  id: string;
  full_name: string;
  role: string;
}

interface PayPeriod {
  label: string;
  start: string;
  end: string;
}

interface ReportLine {
  commissionRecordId: string;
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  invoiceDate: string;
  paymentDate: string;
  paymentMethod: string;
  grossSale: number;
  taxAmount: number;
  ccFeeDeducted: number;
  netCommissionable: number;
  employeeId: string;
  employeeName: string;
  roleType: string;
  originalRate: number;
  effectiveRate: number;
  commissionAmount: number;
  isSplit: boolean;
  splitGroupKey: string; // invoiceId — used to visually group splits
}

interface Deduction {
  id: string;
  employeeId: string;
  description: string;
  amount: number;
  isNew?: boolean;
}

interface RateOverride {
  commissionRecordId: string;
  invoiceId: string;
  employeeId: string;
  roleType: string;
  originalRate: number;
  overriddenRate: number;
}

interface SummaryCards {
  totalGross: number;
  totalCcFees: number;
  totalNetCommissionable: number;
  totalCommissionsOwed: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function fmtDate(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const roleTypeLabels: Record<string, string> = {
  sales_projects: 'Sales (Projects)',
  design: 'Design',
  pm: 'Project Manager',
  service_sales: 'Service Sales',
  service_pm: 'Service PM'
};

function generatePayPeriods(frequency: string): PayPeriod[] {
  const periods: PayPeriod[] = [];
  const now = new Date();

  if (frequency === 'monthly') {
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      const end = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${lastDay}`;
      periods.push({
        label: d.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
        start,
        end
      });
    }
  } else {
    // bi-weekly / semi-monthly: split each month into 1–15 and 16–end
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - Math.floor(i / 2), 1);
      const year = d.getFullYear();
      const month = d.getMonth();
      const monthStr = String(month + 1).padStart(2, '0');
      const lastDay = new Date(year, month + 1, 0).getDate();
      const monthName = d.toLocaleString('en-US', { month: 'short' });

      if (i % 2 === 0) {
        periods.push({
          label: `${monthName} 16–${lastDay}, ${year}`,
          start: `${year}-${monthStr}-16`,
          end: `${year}-${monthStr}-${lastDay}`
        });
      } else {
        periods.push({
          label: `${monthName} 1–15, ${year}`,
          start: `${year}-${monthStr}-01`,
          end: `${year}-${monthStr}-15`
        });
      }
    }
  }

  return periods;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CommissionReportPage() {
  const { profile } = useAuth();

  // Filters
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [selectedReps, setSelectedReps] = useState<string[]>([]);
  const [includePartial, setIncludePartial] = useState(false);
  const [dateMode, setDateMode] = useState<'custom' | 'period'>('period');
  const [selectedPeriod, setSelectedPeriod] = useState<PayPeriod | null>(null);

  // Reference data
  const [reps, setReps] = useState<Rep[]>([]);
  const [payPeriods, setPayPeriods] = useState<PayPeriod[]>([]);
  const [ccFeePercent, setCcFeePercent] = useState(0);

  // Report state
  const [lines, setLines] = useState<ReportLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, number>>({}); // key: commissionRecordId
  const [editingOverride, setEditingOverride] = useState<string | null>(null);
  const [overrideDraft, setOverrideDraft] = useState('');
  const [deductions, setDeductions] = useState<Record<string, Deduction[]>>({}); // key: employeeId
  const [collapsedReps, setCollapsedReps] = useState<Set<string>>(new Set());

  // Load reference data on mount
  useEffect(() => {
    loadReferenceData();
  }, []);

  // Recompute lines when overrides change (no re-fetch needed)
  const computedLines = lines.map(line => {
    const rate = overrides[line.commissionRecordId] ?? line.originalRate;
    return {
      ...line,
      effectiveRate: rate,
      commissionAmount: (line.netCommissionable * rate) / 100
    };
  });

  async function loadReferenceData() {
    const { data: repsData } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .in('role', ['sales', 'bd', 'admin', 'manager', 'sales_manager', 'service_manager'])
      .eq('is_active', true)
      .order('full_name');

    setReps((repsData || []) as Rep[]);

    const { data: settings } = await supabase
      .from('company_settings')
      .select('default_cc_fee_percent, payroll_frequency')
      .maybeSingle();

    const freq = settings?.payroll_frequency || 'semi-monthly';
    const periods = generatePayPeriods(freq);
    setPayPeriods(periods);
    if (periods.length > 0 && !selectedPeriod) {
      setSelectedPeriod(periods[0]);
      setDateStart(periods[0].start);
      setDateEnd(periods[0].end);
    }

    // Also check company_commission_settings for payroll_frequency
    const { data: commSettings } = await supabase
      .from('company_commission_settings')
      .select('payroll_frequency')
      .maybeSingle();

    const commFreq = commSettings?.payroll_frequency;
    if (commFreq) {
      const newPeriods = generatePayPeriods(commFreq);
      setPayPeriods(newPeriods);
      if (newPeriods.length > 0) {
        setSelectedPeriod(newPeriods[0]);
        setDateStart(newPeriods[0].start);
        setDateEnd(newPeriods[0].end);
      }
    }

    setCcFeePercent(Number(settings?.default_cc_fee_percent || 0));

    // Load any saved overrides for this org
    if (profile?.organization_id) {
      const { data: savedOverrides } = await supabase
        .from('commission_report_rate_overrides')
        .select('*')
        .eq('organization_id', profile.organization_id);

      if (savedOverrides) {
        const map: Record<string, number> = {};
        for (const o of savedOverrides) {
          // key by invoice_id + employee_id + role_type as a composite
          map[`${o.invoice_id}__${o.employee_id}__${o.role_type}`] = Number(o.overridden_rate);
        }
        setOverrides(map);
      }
    }
  }

  function getEffectiveStartEnd() {
    if (dateMode === 'period' && selectedPeriod) {
      return { start: selectedPeriod.start, end: selectedPeriod.end };
    }
    return { start: dateStart, end: dateEnd };
  }

  async function runReport() {
    const { start, end } = getEffectiveStartEnd();
    if (!start || !end) return;

    setLoading(true);
    setHasRun(true);

    try {
      // 1. Fetch paid invoices in date range with payment info
      const statusFilter = includePartial ? ['paid', 'partial'] : ['paid'];

      let invoiceQuery = supabase
        .from('invoices')
        .select(`
          id,
          invoice_number,
          invoice_date,
          subtotal,
          tax_amount,
          total,
          proposal_id,
          contact_id,
          contacts(full_name),
          proposals(credit_card_fee_amount)
        `)
        .in('status', statusFilter)
        .gte('invoice_date', start)
        .lte('invoice_date', end);

      if (profile?.organization_id) {
        invoiceQuery = invoiceQuery.eq('organization_id', profile.organization_id);
      }

      const { data: invoicesData } = await invoiceQuery;
      const invoices = invoicesData || [];
      if (invoices.length === 0) {
        setLines([]);
        setLoading(false);
        return;
      }

      const invoiceIds = invoices.map((i: any) => i.id);

      // 2. Fetch payments for these invoices (to detect CC)
      const { data: paymentsData } = await supabase
        .from('payments')
        .select('invoice_id, payment_method, payment_date, amount')
        .in('invoice_id', invoiceIds)
        .order('payment_date', { ascending: false });

      // Map invoice → latest payment
      const paymentByInvoice: Record<string, { method: string; date: string; amount: number }> = {};
      for (const p of paymentsData || []) {
        if (!paymentByInvoice[p.invoice_id]) {
          paymentByInvoice[p.invoice_id] = {
            method: p.payment_method,
            date: p.payment_date,
            amount: Number(p.amount)
          };
        }
      }

      // 3. Fetch commission records for these invoices (or by employee+date if no invoice link)
      let commQuery = supabase
        .from('commission_records')
        .select(`
          id,
          invoice_id,
          project_id,
          employee_id,
          role_type,
          commission_rate,
          basis_amount,
          amount_earned,
          profiles!commission_records_employee_id_fkey(full_name)
        `);

      // Filter by invoice IDs or by pay period dates
      commQuery = commQuery.in('invoice_id', invoiceIds);

      if (selectedReps.length > 0) {
        commQuery = commQuery.in('employee_id', selectedReps);
      }

      const { data: commData } = await commQuery;

      // 4. Fetch saved rate overrides
      const overrideMap: Record<string, number> = { ...overrides };
      if (profile?.organization_id) {
        const { data: savedOverrides } = await supabase
          .from('commission_report_rate_overrides')
          .select('*')
          .eq('organization_id', profile.organization_id)
          .in('invoice_id', invoiceIds);

        for (const o of savedOverrides || []) {
          const key = `${o.invoice_id}__${o.employee_id}__${o.role_type}`;
          overrideMap[key] = Number(o.overridden_rate);
        }
      }

      setOverrides(overrideMap);

      // 5. Build report lines
      const invoiceMap: Record<string, any> = {};
      for (const inv of invoices) {
        invoiceMap[inv.id] = inv;
      }

      // Group commissions by invoice to detect splits
      const commByInvoice: Record<string, any[]> = {};
      for (const c of commData || []) {
        if (!commByInvoice[c.invoice_id]) commByInvoice[c.invoice_id] = [];
        commByInvoice[c.invoice_id].push(c);
      }

      const reportLines: ReportLine[] = [];

      for (const comm of commData || []) {
        const inv = invoiceMap[comm.invoice_id];
        if (!inv) continue;

        const payment = paymentByInvoice[comm.invoice_id];
        const grossSale = Number(inv.subtotal || 0);
        const taxAmount = Number(inv.tax_amount || 0);

        // CC fee: use proposal's credit_card_fee_amount if available, else calc from %
        let ccFeeDeducted = 0;
        if (payment?.method === 'credit_card') {
          const proposalFee = Number(inv.proposals?.credit_card_fee_amount || 0);
          ccFeeDeducted = proposalFee > 0 ? proposalFee : (grossSale * ccFeePercent) / 100;
        }

        const netCommissionable = Math.max(0, grossSale - ccFeeDeducted);
        const overrideKey = `${comm.invoice_id}__${comm.employee_id}__${comm.role_type}`;
        const originalRate = Number(comm.commission_rate || 0);
        const effectiveRate = overrideMap[overrideKey] ?? originalRate;
        const commissionAmount = (netCommissionable * effectiveRate) / 100;

        const siblingsOnInvoice = commByInvoice[comm.invoice_id] || [];
        const isSplit = siblingsOnInvoice.length > 1;

        reportLines.push({
          commissionRecordId: comm.id,
          invoiceId: comm.invoice_id,
          invoiceNumber: inv.invoice_number || '—',
          customerName: (inv.contacts as any)?.full_name || '—',
          invoiceDate: inv.invoice_date,
          paymentDate: payment?.date || '',
          paymentMethod: payment?.method || '',
          grossSale,
          taxAmount,
          ccFeeDeducted,
          netCommissionable,
          employeeId: comm.employee_id,
          employeeName: (comm.profiles as any)?.full_name || 'Unknown',
          roleType: comm.role_type,
          originalRate,
          effectiveRate,
          commissionAmount,
          isSplit,
          splitGroupKey: comm.invoice_id
        });
      }

      // Sort: by employee name, then invoice date
      reportLines.sort((a, b) => {
        const empCmp = a.employeeName.localeCompare(b.employeeName);
        if (empCmp !== 0) return empCmp;
        return a.invoiceDate.localeCompare(b.invoiceDate);
      });

      setLines(reportLines);

      // Load deductions for this period
      if (profile?.organization_id) {
        const { start: s, end: e } = getEffectiveStartEnd();
        const { data: deductionsData } = await supabase
          .from('commission_report_deductions')
          .select('*')
          .eq('organization_id', profile.organization_id)
          .eq('period_start', s)
          .eq('period_end', e);

        if (deductionsData) {
          const grouped: Record<string, Deduction[]> = {};
          for (const d of deductionsData) {
            const key = d.employee_id || '__all__';
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push({ id: d.id, employeeId: d.employee_id, description: d.description, amount: Number(d.amount) });
          }
          setDeductions(grouped);
        }
      }
    } catch (err) {
      console.error('Error running commission report:', err);
    } finally {
      setLoading(false);
    }
  }

  // Group lines by employee
  const linesByEmployee = computedLines.reduce((acc, line) => {
    if (!acc[line.employeeId]) acc[line.employeeId] = { name: line.employeeName, lines: [] };
    acc[line.employeeId].lines.push(line);
    return acc;
  }, {} as Record<string, { name: string; lines: ReportLine[] }>);

  // Summary cards
  const summary: SummaryCards = computedLines.reduce(
    (acc, line) => ({
      totalGross: acc.totalGross + line.grossSale,
      totalCcFees: acc.totalCcFees + line.ccFeeDeducted,
      totalNetCommissionable: acc.totalNetCommissionable + line.netCommissionable,
      totalCommissionsOwed: acc.totalCommissionsOwed + line.commissionAmount
    }),
    { totalGross: 0, totalCcFees: 0, totalNetCommissionable: 0, totalCommissionsOwed: 0 }
  );

  // Adjust totalCommissionsOwed for deductions
  const allDeductionAmounts = Object.values(deductions).flat().reduce((s, d) => s + d.amount, 0);
  const finalCommissionsOwed = summary.totalCommissionsOwed - allDeductionAmounts;

  // ── Rate override handlers ──

  function startEditRate(commissionRecordId: string, invoiceId: string, employeeId: string, roleType: string, currentRate: number) {
    const key = `${invoiceId}__${employeeId}__${roleType}`;
    setEditingOverride(key);
    setOverrideDraft(String(currentRate));
  }

  async function saveRateOverride(line: ReportLine) {
    const key = `${line.invoiceId}__${line.employeeId}__${line.roleType}`;
    const newRate = parseFloat(overrideDraft);
    if (isNaN(newRate) || newRate < 0) {
      setEditingOverride(null);
      return;
    }

    setOverrides(prev => ({ ...prev, [key]: newRate }));
    setEditingOverride(null);

    // Persist to DB
    if (!profile?.organization_id) return;
    await supabase
      .from('commission_report_rate_overrides')
      .upsert({
        organization_id: profile.organization_id,
        invoice_id: line.invoiceId,
        employee_id: line.employeeId,
        role_type: line.roleType,
        original_rate: line.originalRate,
        overridden_rate: newRate,
        created_by: profile.id
      }, {
        onConflict: 'organization_id,invoice_id,employee_id,role_type'
      });
  }

  async function resetRate(line: ReportLine) {
    const key = `${line.invoiceId}__${line.employeeId}__${line.roleType}`;
    setOverrides(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    if (!profile?.organization_id) return;
    await supabase
      .from('commission_report_rate_overrides')
      .delete()
      .eq('organization_id', profile.organization_id)
      .eq('invoice_id', line.invoiceId)
      .eq('employee_id', line.employeeId)
      .eq('role_type', line.roleType);
  }

  // ── Deduction handlers ──

  function addDeduction(employeeId: string) {
    const newDed: Deduction = {
      id: crypto.randomUUID(),
      employeeId,
      description: '',
      amount: 0,
      isNew: true
    };
    setDeductions(prev => ({
      ...prev,
      [employeeId]: [...(prev[employeeId] || []), newDed]
    }));
  }

  function updateDeduction(employeeId: string, dedId: string, field: 'description' | 'amount', value: string) {
    setDeductions(prev => ({
      ...prev,
      [employeeId]: (prev[employeeId] || []).map(d =>
        d.id === dedId
          ? { ...d, [field]: field === 'amount' ? parseFloat(value) || 0 : value }
          : d
      )
    }));
  }

  async function saveDeduction(employeeId: string, dedId: string) {
    const ded = (deductions[employeeId] || []).find(d => d.id === dedId);
    if (!ded || !profile?.organization_id) return;

    const { start, end } = getEffectiveStartEnd();

    if (ded.isNew) {
      const { data } = await supabase
        .from('commission_report_deductions')
        .insert({
          organization_id: profile.organization_id,
          employee_id: employeeId,
          period_start: start,
          period_end: end,
          description: ded.description,
          amount: ded.amount,
          created_by: profile.id
        })
        .select('id')
        .single();

      if (data) {
        setDeductions(prev => ({
          ...prev,
          [employeeId]: (prev[employeeId] || []).map(d =>
            d.id === dedId ? { ...d, id: data.id, isNew: false } : d
          )
        }));
      }
    } else {
      await supabase
        .from('commission_report_deductions')
        .update({ description: ded.description, amount: ded.amount })
        .eq('id', dedId);
    }
  }

  async function deleteDeduction(employeeId: string, dedId: string) {
    const ded = (deductions[employeeId] || []).find(d => d.id === dedId);
    if (!ded) return;
    if (!ded.isNew) {
      await supabase.from('commission_report_deductions').delete().eq('id', dedId);
    }
    setDeductions(prev => ({
      ...prev,
      [employeeId]: (prev[employeeId] || []).filter(d => d.id !== dedId)
    }));
  }

  // ── Export ──

  function exportCSV() {
    const { start, end } = getEffectiveStartEnd();
    const rows: string[][] = [];
    rows.push(['Sales Rep Commission Report', `Period: ${fmtDate(start)} – ${fmtDate(end)}`]);
    rows.push([]);
    rows.push(['Invoice #', 'Customer', 'Invoice Date', 'Payment Date', 'Payment Method', 'Gross Sale', 'CC Fee Deducted', 'Net Commissionable', 'Employee', 'Role', 'Rate %', 'Commission $', 'Split?']);

    for (const [empId, group] of Object.entries(linesByEmployee)) {
      for (const line of group.lines) {
        rows.push([
          line.invoiceNumber,
          line.customerName,
          fmtDate(line.invoiceDate),
          fmtDate(line.paymentDate),
          line.paymentMethod,
          line.grossSale.toFixed(2),
          line.ccFeeDeducted.toFixed(2),
          line.netCommissionable.toFixed(2),
          line.employeeName,
          roleTypeLabels[line.roleType] || line.roleType,
          line.effectiveRate.toFixed(2),
          line.commissionAmount.toFixed(2),
          line.isSplit ? 'Yes' : 'No'
        ]);
      }
      // Subtotal
      const subtotal = group.lines.reduce((s, l) => s + l.commissionAmount, 0);
      const repDeds = (deductions[empId] || []).reduce((s, d) => s + d.amount, 0);
      rows.push(['', '', '', '', '', '', '', '', `${group.name} Subtotal`, '', '', subtotal.toFixed(2), '']);
      if (repDeds > 0) {
        for (const d of deductions[empId] || []) {
          rows.push(['', '', '', '', '', '', '', '', `  Deduction: ${d.description}`, '', '', (-d.amount).toFixed(2), '']);
        }
        rows.push(['', '', '', '', '', '', '', '', `${group.name} Net Commission`, '', '', (subtotal - repDeds).toFixed(2), '']);
      }
      rows.push([]);
    }

    rows.push(['', '', '', '', '', '', '', '', 'GRAND TOTAL', '', '', finalCommissionsOwed.toFixed(2), '']);

    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `commission-report-${start}-to-${end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const { start: activeStart, end: activeEnd } = getEffectiveStartEnd();
  const canRun = Boolean(activeStart && activeEnd);

  return (
    <div className="space-y-6 print:space-y-4">
      {/* ── Filter Panel ── */}
      <div className="print:hidden bg-gray-900/60 rounded-xl border border-gray-700 p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-400" />
            Report Filters
          </h2>
          <div className="flex items-center gap-2">
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
        </div>

        {/* Date mode toggle */}
        <div className="flex items-center gap-1 bg-gray-800 p-1 rounded-lg w-fit">
          <button
            onClick={() => setDateMode('period')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              dateMode === 'period' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Pay Period
          </button>
          <button
            onClick={() => setDateMode('custom')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              dateMode === 'custom' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Custom Dates
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                {payPeriods.map(p => (
                  <option key={p.label} value={p.label}>{p.label}</option>
                ))}
              </select>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dateStart}
                  onChange={e => setDateStart(e.target.value)}
                  className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <span className="text-gray-600 text-xs">to</span>
                <input
                  type="date"
                  value={dateEnd}
                  onChange={e => setDateEnd(e.target.value)}
                  className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            )}
          </div>

          {/* Sales Reps */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              Sales Representatives
              <span className="ml-1 text-gray-600 normal-case">(leave blank for all)</span>
            </label>
            <select
              multiple
              size={3}
              value={selectedReps}
              onChange={e => setSelectedReps(Array.from(e.target.selectedOptions, o => o.value))}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {reps.map(r => (
                <option key={r.id} value={r.id}>{r.full_name}</option>
              ))}
            </select>
            {selectedReps.length > 0 && (
              <button onClick={() => setSelectedReps([])} className="text-xs text-blue-400 hover:text-blue-300">
                Clear selection
              </button>
            )}
          </div>

          {/* Options */}
          <div className="space-y-3">
            <label className="text-xs font-medium text-gray-400 uppercase tracking-wider block">Options</label>
            <label className="flex items-center gap-2.5 cursor-pointer group">
              <div
                onClick={() => setIncludePartial(!includePartial)}
                className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                  includePartial ? 'bg-blue-600' : 'bg-gray-700'
                }`}
              >
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  includePartial ? 'translate-x-4' : 'translate-x-0.5'
                }`} />
              </div>
              <span className="text-sm text-gray-300">Include partial payments</span>
            </label>
            {ccFeePercent > 0 && (
              <p className="text-xs text-gray-500 flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-gray-600" />
                CC fee deduction: {ccFeePercent}% (auto-applied)
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={runReport}
            disabled={!canRun || loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <FileText className="w-4 h-4" />
            )}
            {loading ? 'Running...' : 'Run Report'}
          </button>
        </div>
      </div>

      {/* ── Report Output ── */}
      {hasRun && !loading && (
        <div className="space-y-6">
          {/* Report Header (visible on print) */}
          <div className="hidden print:block">
            <h1 className="text-2xl font-bold text-gray-900">Sales Rep Commission Report</h1>
            <p className="text-sm text-gray-600">Period: {fmtDate(activeStart)} – {fmtDate(activeEnd)}</p>
            <p className="text-xs text-gray-400">Generated {new Date().toLocaleString()}</p>
          </div>

          {/* Export actions */}
          {computedLines.length > 0 && (
            <div className="print:hidden flex items-center justify-between">
              <p className="text-sm text-gray-400">
                {computedLines.length} commission line{computedLines.length !== 1 ? 's' : ''} found
                {selectedReps.length > 0 ? ` for ${selectedReps.length} rep${selectedReps.length !== 1 ? 's' : ''}` : ''}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={exportCSV}
                  className="flex items-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Export CSV
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded-lg transition-colors"
                >
                  <Printer className="w-4 h-4" />
                  Print / PDF
                </button>
              </div>
            </div>
          )}

          {/* Summary Cards */}
          {computedLines.length > 0 && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <SummaryCard
                label="Total Gross Sales"
                value={fmt(summary.totalGross)}
                icon={DollarSign}
                color="text-white"
                bg="bg-gray-900/60"
              />
              <SummaryCard
                label="CC Fees Deducted"
                value={fmt(summary.totalCcFees)}
                icon={CreditCard}
                color="text-amber-400"
                bg="bg-amber-500/5 border-amber-500/20"
                sub={ccFeePercent > 0 ? `${ccFeePercent}% rate applied` : 'No CC payments'}
              />
              <SummaryCard
                label="Net Commissionable"
                value={fmt(summary.totalNetCommissionable)}
                icon={TrendingUp}
                color="text-blue-400"
                bg="bg-blue-500/5 border-blue-500/20"
              />
              <SummaryCard
                label="Total Commissions Owed"
                value={fmt(finalCommissionsOwed)}
                icon={Users}
                color="text-green-400"
                bg="bg-green-500/5 border-green-500/20"
                sub={allDeductionAmounts > 0 ? `Incl. ${fmt(allDeductionAmounts)} deductions` : undefined}
              />
            </div>
          )}

          {/* Empty state */}
          {computedLines.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 bg-gray-900/40 rounded-xl border border-gray-700">
              <AlertCircle className="w-10 h-10 text-gray-600 mb-3" />
              <p className="text-sm font-medium text-gray-400">No commissions found</p>
              <p className="text-xs text-gray-600 mt-1">
                No paid invoices with commission records found for the selected period
              </p>
            </div>
          )}

          {/* Per-Rep Sections */}
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
                  onClick={() => {
                    setCollapsedReps(prev => {
                      const next = new Set(prev);
                      if (next.has(empId)) next.delete(empId); else next.add(empId);
                      return next;
                    });
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-sm font-bold text-blue-400">
                      {group.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{group.name}</p>
                      <p className="text-xs text-gray-500">{group.lines.length} invoice{group.lines.length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xs text-gray-500">Commission</p>
                      <p className="text-sm font-bold text-green-400">{fmt(repNet)}</p>
                    </div>
                    <div className="print:hidden">
                      {isCollapsed ? <ChevronRight className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                    </div>
                  </div>
                </div>

                {!isCollapsed && (
                  <>
                    {/* Commission lines table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-800/30 text-xs text-gray-500 uppercase tracking-wider border-b border-gray-700/50">
                            <th className="px-4 py-2.5 text-left">Invoice #</th>
                            <th className="px-4 py-2.5 text-left">Customer</th>
                            <th className="px-4 py-2.5 text-left">Inv Date</th>
                            <th className="px-4 py-2.5 text-left">Paid Date</th>
                            <th className="px-4 py-2.5 text-right">Gross Sale</th>
                            <th className="px-4 py-2.5 text-right">CC Fee</th>
                            <th className="px-4 py-2.5 text-right">Net Comm.</th>
                            <th className="px-4 py-2.5 text-center">Role</th>
                            <th className="px-4 py-2.5 text-center">Rate %</th>
                            <th className="px-4 py-2.5 text-right">Commission</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700/30">
                          {group.lines.map((line, idx) => {
                            const overrideKey = `${line.invoiceId}__${line.employeeId}__${line.roleType}`;
                            const isEditing = editingOverride === overrideKey;
                            const hasOverride = overrides[overrideKey] !== undefined && overrides[overrideKey] !== line.originalRate;

                            return (
                              <tr
                                key={line.commissionRecordId}
                                className={`hover:bg-gray-800/30 transition-colors ${
                                  line.isSplit ? 'bg-blue-950/10' : ''
                                }`}
                              >
                                <td className="px-4 py-2.5 font-mono text-xs text-gray-300">
                                  {line.invoiceNumber}
                                  {line.isSplit && (
                                    <span className="ml-1.5 px-1 py-0.5 bg-blue-500/20 text-blue-400 text-[10px] rounded border border-blue-500/30">
                                      Split
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-2.5 text-gray-300">{line.customerName}</td>
                                <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{fmtDate(line.invoiceDate)}</td>
                                <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                                  <span className="flex items-center gap-1">
                                    {fmtDate(line.paymentDate)}
                                    {line.paymentMethod === 'credit_card' && (
                                      <CreditCard className="w-3 h-3 text-amber-400" title="Credit card payment" />
                                    )}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-right text-gray-300">{fmt(line.grossSale)}</td>
                                <td className="px-4 py-2.5 text-right text-amber-400">
                                  {line.ccFeeDeducted > 0 ? `-${fmt(line.ccFeeDeducted)}` : '—'}
                                </td>
                                <td className="px-4 py-2.5 text-right text-white font-medium">{fmt(line.netCommissionable)}</td>
                                <td className="px-4 py-2.5 text-center">
                                  <span className="px-1.5 py-0.5 bg-gray-700/60 text-gray-400 text-xs rounded">
                                    {roleTypeLabels[line.roleType] || line.roleType}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  {isEditing ? (
                                    <div className="flex items-center gap-1 justify-center print:hidden">
                                      <input
                                        type="number"
                                        step="0.1"
                                        min="0"
                                        max="100"
                                        value={overrideDraft}
                                        onChange={e => setOverrideDraft(e.target.value)}
                                        className="w-16 px-1.5 py-0.5 bg-gray-700 border border-blue-500 rounded text-xs text-white text-center focus:outline-none"
                                        autoFocus
                                        onKeyDown={e => {
                                          if (e.key === 'Enter') saveRateOverride(line);
                                          if (e.key === 'Escape') setEditingOverride(null);
                                        }}
                                      />
                                      <button onClick={() => saveRateOverride(line)} className="text-green-400 hover:text-green-300">
                                        <Check className="w-3.5 h-3.5" />
                                      </button>
                                      <button onClick={() => setEditingOverride(null)} className="text-gray-500 hover:text-gray-400">
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1 justify-center group">
                                      <span className={`font-medium ${hasOverride ? 'text-amber-400' : 'text-gray-300'}`}>
                                        {line.effectiveRate}%
                                      </span>
                                      {hasOverride && (
                                        <span className="text-[10px] text-gray-600">
                                          (was {line.originalRate}%)
                                        </span>
                                      )}
                                      <button
                                        onClick={() => startEditRate(line.commissionRecordId, line.invoiceId, line.employeeId, line.roleType, line.effectiveRate)}
                                        className="print:hidden opacity-0 group-hover:opacity-100 transition-opacity ml-1 text-gray-600 hover:text-blue-400"
                                        title="Edit rate"
                                      >
                                        <Pencil className="w-3 h-3" />
                                      </button>
                                      {hasOverride && (
                                        <button
                                          onClick={() => resetRate(line)}
                                          className="print:hidden opacity-0 group-hover:opacity-100 transition-opacity text-gray-600 hover:text-red-400"
                                          title="Reset to original"
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                  )}
                                  {/* Print view */}
                                  <span className="hidden print:inline">{line.effectiveRate}%</span>
                                </td>
                                <td className="px-4 py-2.5 text-right font-semibold text-green-400">{fmt(line.commissionAmount)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        {/* Rep subtotal row */}
                        <tfoot>
                          <tr className="bg-gray-800/50 border-t border-gray-700">
                            <td colSpan={9} className="px-4 py-2 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">
                              {group.name} Subtotal
                            </td>
                            <td className="px-4 py-2 text-right font-bold text-green-400">{fmt(repSubtotal)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Deductions Section */}
                    <div className="px-5 py-4 border-t border-gray-700/50 bg-gray-900/30">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                          <TrendingUp className="w-3.5 h-3.5 text-red-400" />
                          Deductions
                        </h4>
                        <button
                          onClick={() => addDeduction(empId)}
                          className="print:hidden flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add Deduction
                        </button>
                      </div>

                      {(deductions[empId] || []).length === 0 ? (
                        <p className="text-xs text-gray-600 italic">No deductions</p>
                      ) : (
                        <div className="space-y-2">
                          {(deductions[empId] || []).map(ded => (
                            <div key={ded.id} className="flex items-center gap-3">
                              <input
                                type="text"
                                placeholder="Description (e.g. chargeback, correction)"
                                value={ded.description}
                                onChange={e => updateDeduction(empId, ded.id, 'description', e.target.value)}
                                onBlur={() => saveDeduction(empId, ded.id)}
                                className="print:hidden flex-1 px-2.5 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-600 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                              />
                              <span className="hidden print:inline text-xs text-gray-400 flex-1">{ded.description}</span>
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-gray-500">$</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  placeholder="0.00"
                                  value={ded.amount || ''}
                                  onChange={e => updateDeduction(empId, ded.id, 'amount', e.target.value)}
                                  onBlur={() => saveDeduction(empId, ded.id)}
                                  className="print:hidden w-24 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white text-right placeholder-gray-600 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                />
                                <span className="hidden print:inline text-xs text-red-400 text-right w-24">{fmt(ded.amount)}</span>
                              </div>
                              <button
                                onClick={() => deleteDeduction(empId, ded.id)}
                                className="print:hidden text-gray-600 hover:text-red-400 transition-colors"
                                title="Remove deduction"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Rep net total */}
                      <div className="mt-4 flex items-center justify-between pt-3 border-t border-gray-700/50">
                        <span className="text-xs font-semibold text-gray-300">
                          {group.name} — Net Commission
                        </span>
                        <div className="text-right">
                          {repDeductions > 0 && (
                            <p className="text-xs text-red-400">- {fmt(repDeductions)} deductions</p>
                          )}
                          <p className="text-sm font-bold text-green-400">{fmt(repNet)}</p>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}

          {/* Grand Total */}
          {computedLines.length > 0 && (
            <div className="flex items-center justify-between px-6 py-4 bg-gray-900 rounded-xl border border-gray-700 print:break-inside-avoid">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">Grand Total — All Reps</p>
                <p className="text-xs text-gray-600 mt-0.5">
                  Period: {fmtDate(activeStart)} – {fmtDate(activeEnd)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-green-400">{fmt(finalCommissionsOwed)}</p>
                {allDeductionAmounts > 0 && (
                  <p className="text-xs text-gray-500">After {fmt(allDeductionAmounts)} in deductions</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── SummaryCard ─────────────────────────────────────────────────────────────

function SummaryCard({
  label, value, sub, icon: Icon, color, bg
}: {
  label: string;
  value: string;
  sub?: string;
  icon: typeof DollarSign;
  color: string;
  bg: string;
}) {
  return (
    <div className={`rounded-xl border border-gray-700 p-4 ${bg}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-600 mt-0.5">{sub}</p>}
    </div>
  );
}
