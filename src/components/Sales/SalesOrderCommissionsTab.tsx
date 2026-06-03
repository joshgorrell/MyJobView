import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  DollarSign, TrendingUp, Clock, CheckCircle, Users, Briefcase,
  Loader2, AlertCircle, Percent, PenTool, ChevronDown, ChevronUp,
  Receipt, Sparkles, ArrowRight
} from 'lucide-react';
import type { SalesOrderFull, ChangeOrderSummary } from './SalesOrderDetail';

interface SalesOrderCommissionsTabProps {
  order: SalesOrderFull;
  changeOrders: ChangeOrderSummary[];
}

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
  invoice_id: string | null;
  invoice_number?: string;
  invoice_total?: number;
  invoice_amount_paid?: number;
  invoice_amount_due?: number;
  created_at: string;
}

interface CommissionSettings {
  commission_basis: string;
  default_sales_projects_rate: number;
  default_design_rate: number;
  default_pm_rate: number;
}

interface EmployeeConfig {
  employee_id: string;
  role_type: string;
  commission_rate: number;
  is_eligible: boolean;
}

const roleTypeLabels: Record<string, { label: string; color: string; icon: typeof DollarSign }> = {
  sales_projects: { label: 'Sales', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: DollarSign },
  design: { label: 'Design', color: 'bg-teal-500/20 text-teal-400 border-teal-500/30', icon: PenTool },
  pm: { label: 'Project Mgmt', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: Briefcase },
  service_sales: { label: 'Service Sales', color: 'bg-green-500/20 text-green-400 border-green-500/30', icon: DollarSign },
  service_pm: { label: 'Service PM', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', icon: Briefcase },
};

const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: 'Pending', color: 'text-gray-400', icon: Clock },
  accruing: { label: 'Accruing', color: 'text-blue-400', icon: TrendingUp },
  ready_to_pay: { label: 'Ready to Pay', color: 'text-green-400', icon: CheckCircle },
  paid: { label: 'Paid', color: 'text-emerald-400', icon: CheckCircle },
};

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function SalesOrderCommissionsTab({ order, changeOrders }: SalesOrderCommissionsTabProps) {
  const { profile } = useAuth();
  const [records, setRecords] = useState<CommissionRecord[]>([]);
  const [settings, setSettings] = useState<CommissionSettings | null>(null);
  const [employeeConfigs, setEmployeeConfigs] = useState<EmployeeConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDetail, setShowDetail] = useState(false);

  const isAdmin = profile?.role === 'admin' || profile?.role === 'manager' || profile?.role === 'finance';
  const projectId = order.project?.id ?? (order as any).project_id ?? null;

  useEffect(() => {
    loadData();
  }, [projectId, profile?.id]);

  async function loadData() {
    try {
      let recordsQuery = supabase
        .from('commission_records')
        .select(`
          id, employee_id, role_type, basis_type, basis_amount,
          commission_rate, total_potential_commission, amount_collected,
          amount_earned, amount_paid, status, invoice_id, created_at,
          profiles!commission_records_employee_id_fkey(full_name)
        `)
        .eq('project_id', projectId || '00000000-0000-0000-0000-000000000000');

      if (!isAdmin && profile?.id) {
        recordsQuery = recordsQuery.eq('employee_id', profile.id);
      }

      const [recordsResult, settingsResult, configResult] = await Promise.all([
        projectId ? recordsQuery.order('created_at', { ascending: true }) : Promise.resolve({ data: [], error: null }),
        supabase
          .from('company_commission_settings')
          .select('commission_basis, default_sales_projects_rate, default_design_rate, default_pm_rate')
          .limit(1)
          .maybeSingle(),
        supabase
          .from('employee_commission_config')
          .select('employee_id, role_type, commission_rate, eligible_for_commissions')
          .eq('eligible_for_commissions', true),
      ]);

      if (recordsResult.error) throw recordsResult.error;

      const rawRecords = recordsResult.data || [];
      const invoiceIds = rawRecords.map((r: any) => r.invoice_id).filter(Boolean);

      let invoiceMap: Record<string, { number: string; total: number; paid: number; due: number }> = {};
      if (invoiceIds.length > 0) {
        const { data: invoices } = await supabase
          .from('invoices')
          .select('id, invoice_number, total, amount_paid, amount_due')
          .in('id', invoiceIds);
        (invoices || []).forEach((inv: any) => {
          invoiceMap[inv.id] = {
            number: inv.invoice_number,
            total: inv.total,
            paid: inv.amount_paid,
            due: inv.amount_due,
          };
        });
      }

      const formatted: CommissionRecord[] = rawRecords.map((r: any) => {
        const inv = r.invoice_id ? invoiceMap[r.invoice_id] : null;
        return {
          ...r,
          employee_name: r.profiles?.full_name || 'Unknown',
          invoice_number: inv?.number,
          invoice_total: inv?.total,
          invoice_amount_paid: inv?.paid,
          invoice_amount_due: inv?.due,
        };
      });

      setRecords(formatted);
      setSettings(settingsResult.data || null);
      setEmployeeConfigs(
        (configResult.data || []).map((c: any) => ({
          employee_id: c.employee_id,
          role_type: c.role_type,
          commission_rate: Number(c.commission_rate),
          is_eligible: c.eligible_for_commissions,
        }))
      );
    } catch (error) {
      console.error('Error loading commissions:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
      </div>
    );
  }

  // ─── Derived Totals ───────────────────────────────────────────
  const totalEarned = records.reduce((s, r) => s + (r.amount_earned || 0), 0);
  const totalPaid = records.reduce((s, r) => s + (r.amount_paid || 0), 0);
  const totalOwed = totalEarned - totalPaid;

  // Upcoming = commission on invoiced-but-unpaid invoices
  // = total_potential_commission - amount_earned  (the unearned portion on live invoices)
  const totalUpcoming = records
    .filter(r => r.status === 'accruing' || (r.status === 'pending' && r.invoice_id))
    .reduce((s, r) => s + Math.max(0, (r.total_potential_commission || 0) - (r.amount_earned || 0)), 0);

  // Future potential = commission on unbilled contract + unbilled approved COs
  // We calculate this from the commission rate on existing records or employee configs
  const avgCommRate = records.length > 0
    ? records.reduce((s, r) => s + Number(r.commission_rate), 0) / records.length
    : (settings?.default_sales_projects_rate ? Number(settings.default_sales_projects_rate) : 0);

  const originalTotal = order.original_contract_total || order.contract_total || 0;
  const approvedCOs = changeOrders.filter(co => co.status === 'approved' && co.is_billable !== false);
  const totalCOBillable = approvedCOs.reduce((s, co) => s + Math.abs(co.change_amount) + (co.tax_amount || 0), 0);
  const totalCOBilled = approvedCOs.reduce((s, co) => s + (co.amount_billed || 0), 0);
  const totalCOUnbilled = Math.max(0, totalCOBillable - totalCOBilled);

  const totalInvoicedFromRecords = records.reduce((s, r) => s + (r.invoice_total || 0), 0);
  const originalUnbilled = Math.max(0, originalTotal - totalInvoicedFromRecords + totalCOBilled);

  const totalUnbilledAmount = originalUnbilled + totalCOUnbilled;
  const futurePotential = totalUnbilledAmount * (avgCommRate / 100);

  // Total potential (all)
  const totalPotentialOnRecords = records.reduce((s, r) => s + (r.total_potential_commission || 0), 0);
  const grandTotalPotential = totalPotentialOnRecords + futurePotential;

  // Group by employee for admin view
  const byEmployee: Record<string, { name: string; records: CommissionRecord[] }> = {};
  records.forEach(r => {
    if (!byEmployee[r.employee_id]) byEmployee[r.employee_id] = { name: r.employee_name, records: [] };
    byEmployee[r.employee_id].records.push(r);
  });

  const hasRecords = records.length > 0;
  const hasNoProject = !projectId;

  return (
    <div className="space-y-5">

      {/* ─── Three Core Buckets ─────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

        {/* Earned */}
        <div className="bg-gray-900/60 rounded-xl border border-gray-700/50 p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-green-500/15 flex items-center justify-center">
                <CheckCircle className="w-4 h-4 text-green-400" />
              </div>
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Earned</span>
            </div>
          </div>
          <div className="text-2xl font-bold text-green-400">${fmt(totalEarned)}</div>
          <div className="text-xs text-gray-500 mt-1">Based on payments received</div>
          {totalOwed > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-700/50 flex items-center justify-between">
              <span className="text-xs text-gray-500">Awaiting payout</span>
              <span className="text-xs font-semibold text-amber-400">${fmt(totalOwed)}</span>
            </div>
          )}
          {totalPaid > 0 && (
            <div className={`mt-${totalOwed > 0 ? '1' : '3 pt-3 border-t border-gray-700/50'} flex items-center justify-between`}>
              <span className="text-xs text-gray-500">Paid out</span>
              <span className="text-xs font-semibold text-emerald-400">${fmt(totalPaid)}</span>
            </div>
          )}
        </div>

        {/* Upcoming — invoiced but not yet paid */}
        <div className="bg-gray-900/60 rounded-xl border border-gray-700/50 p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
                <Receipt className="w-4 h-4 text-blue-400" />
              </div>
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Upcoming</span>
            </div>
          </div>
          <div className="text-2xl font-bold text-blue-400">${fmt(totalUpcoming)}</div>
          <div className="text-xs text-gray-500 mt-1">On invoices sent, awaiting payment</div>
          {totalUpcoming > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-700/50 flex items-center gap-1.5 text-xs text-gray-600">
              <Clock className="w-3 h-3" />
              <span>Earns when customer pays</span>
            </div>
          )}
          {totalUpcoming === 0 && hasRecords && (
            <div className="mt-3 pt-3 border-t border-gray-700/50 text-xs text-gray-600">
              No outstanding invoices
            </div>
          )}
          {!hasRecords && (
            <div className="mt-3 pt-3 border-t border-gray-700/50 text-xs text-gray-600">
              Commission on invoices not yet created
            </div>
          )}
        </div>

        {/* Future Potential */}
        <div className="bg-gray-900/60 rounded-xl border border-gray-700/50 p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-amber-400" />
              </div>
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Future</span>
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-400">${fmt(futurePotential)}</div>
          <div className="text-xs text-gray-500 mt-1">Approved but not yet invoiced</div>
          {avgCommRate > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-700/50 flex items-center justify-between text-xs">
              <span className="text-gray-500">Rate used</span>
              <span className="text-gray-400">{avgCommRate.toFixed(2)}%</span>
            </div>
          )}
          {futurePotential === 0 && (
            <div className="mt-3 pt-3 border-t border-gray-700/50 text-xs text-gray-600">
              All approved amounts invoiced
            </div>
          )}
        </div>
      </div>

      {/* ─── Pipeline Summary Bar ────────────────────────────── */}
      {grandTotalPotential > 0 && (
        <div className="bg-gray-900/50 rounded-xl border border-gray-700/50 p-4">
          <div className="flex items-center justify-between mb-3 text-xs">
            <span className="text-gray-400 font-medium">Commission Pipeline</span>
            <span className="text-gray-500">Total: ${fmt(grandTotalPotential)}</span>
          </div>

          {/* Stacked bar */}
          <div className="h-4 bg-gray-700 rounded-full overflow-hidden flex gap-0.5">
            {totalPaid > 0 && grandTotalPotential > 0 && (
              <div
                className="bg-emerald-500 h-full rounded-l-full transition-all duration-700"
                style={{ width: `${(totalPaid / grandTotalPotential) * 100}%` }}
                title={`Paid: $${fmt(totalPaid)}`}
              />
            )}
            {(totalEarned - totalPaid) > 0 && grandTotalPotential > 0 && (
              <div
                className="bg-green-400 h-full transition-all duration-700"
                style={{ width: `${((totalEarned - totalPaid) / grandTotalPotential) * 100}%` }}
                title={`Earned (owed): $${fmt(totalEarned - totalPaid)}`}
              />
            )}
            {totalUpcoming > 0 && grandTotalPotential > 0 && (
              <div
                className="bg-blue-500 h-full transition-all duration-700"
                style={{ width: `${(totalUpcoming / grandTotalPotential) * 100}%` }}
                title={`Upcoming: $${fmt(totalUpcoming)}`}
              />
            )}
            {futurePotential > 0 && grandTotalPotential > 0 && (
              <div
                className="bg-amber-500 h-full rounded-r-full transition-all duration-700"
                style={{ width: `${(futurePotential / grandTotalPotential) * 100}%` }}
                title={`Future: $${fmt(futurePotential)}`}
              />
            )}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-[11px] text-gray-500">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
              Paid out ${fmt(totalPaid)}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-green-400" />
              Earned (owed) ${fmt(Math.max(0, totalEarned - totalPaid))}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-blue-500" />
              Upcoming ${fmt(totalUpcoming)}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
              Future ${fmt(futurePotential)}
            </span>
          </div>
        </div>
      )}

      {/* ─── Unbilled Breakdown (future detail) ─────────────── */}
      {totalUnbilledAmount > 0 && (
        <div className="bg-gray-900/50 rounded-xl border border-gray-700/50 p-4">
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Unbilled Approved Work
          </div>
          <div className="space-y-2">
            {originalUnbilled > 0 && (
              <div className="flex items-center justify-between py-1.5 px-3 bg-gray-800/50 rounded-lg">
                <span className="text-sm text-gray-300">Original Contract — unbilled balance</span>
                <div className="text-right">
                  <div className="text-sm font-semibold text-gray-200">${fmt(originalUnbilled)}</div>
                  {avgCommRate > 0 && (
                    <div className="text-xs text-amber-400/80">${fmt(originalUnbilled * avgCommRate / 100)} est.</div>
                  )}
                </div>
              </div>
            )}
            {approvedCOs.filter(co => co.billing_status !== 'fully_billed').map(co => {
              const coTotal = Math.abs(co.change_amount) + (co.tax_amount || 0);
              const remaining = Math.max(0, coTotal - (co.amount_billed || 0));
              if (remaining <= 0) return null;
              return (
                <div key={co.id} className="flex items-center justify-between py-1.5 px-3 bg-gray-800/50 rounded-lg">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm text-gray-300 truncate">{co.change_order_number}</span>
                    <span className="text-xs text-gray-500 truncate">{co.title}</span>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <div className="text-sm font-semibold text-gray-200">${fmt(remaining)}</div>
                    {avgCommRate > 0 && (
                      <div className="text-xs text-amber-400/80">${fmt(remaining * avgCommRate / 100)} est.</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {avgCommRate > 0 && (
            <div className="mt-2 text-[11px] text-gray-600 flex items-center gap-1">
              <ArrowRight className="w-3 h-3" />
              Estimated commission at {avgCommRate.toFixed(2)}% rate
            </div>
          )}
        </div>
      )}

      {/* ─── No project warning ──────────────────────────────── */}
      {hasNoProject && (
        <div className="bg-gray-900/50 rounded-xl border border-gray-700/50 p-5 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-gray-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-gray-400 font-medium">No project linked yet</p>
            <p className="text-xs text-gray-600 mt-1">Commission records will appear here once a project is created from the Project tab and invoices are generated.</p>
          </div>
        </div>
      )}

      {/* ─── Commission Records Detail ──────────────────────── */}
      {hasRecords && (
        <div className="bg-gray-900/50 rounded-xl border border-gray-700/50 overflow-hidden">
          <button
            onClick={() => setShowDetail(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3.5 border-b border-gray-700/50 hover:bg-gray-800/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-300">Commission Records</span>
              <span className="text-xs text-gray-600">({records.length} record{records.length !== 1 ? 's' : ''})</span>
            </div>
            {showDetail
              ? <ChevronUp className="w-4 h-4 text-gray-500" />
              : <ChevronDown className="w-4 h-4 text-gray-500" />
            }
          </button>

          {showDetail && (
            <>
              {/* By-employee summary for admin */}
              {isAdmin && Object.keys(byEmployee).length > 0 && (
                <div className="p-4 border-b border-gray-700/40 space-y-2">
                  {Object.entries(byEmployee).map(([empId, emp]) => {
                    const empEarned = emp.records.reduce((s, r) => s + (r.amount_earned || 0), 0);
                    const empPotential = emp.records.reduce((s, r) => s + (r.total_potential_commission || 0), 0);
                    const empPaid = emp.records.reduce((s, r) => s + (r.amount_paid || 0), 0);
                    const roles = [...new Set(emp.records.map(r => r.role_type))];
                    return (
                      <div key={empId} className="flex items-center gap-4 px-3 py-2.5 bg-gray-800/50 rounded-lg">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-white truncate">{emp.name}</div>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            {roles.map(r => {
                              const cfg = roleTypeLabels[r] || { label: r, color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' };
                              return (
                                <span key={r} className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${cfg.color}`}>
                                  {cfg.label}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-semibold text-green-400">${fmt(empEarned)}</div>
                          <div className="text-xs text-gray-500">
                            of ${fmt(empPotential)} potential
                            {empPaid > 0 && <span className="text-emerald-400 ml-1">(${fmt(empPaid)} paid)</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Mobile card view */}
              <div className="md:hidden divide-y divide-gray-700/30">
                {records.map(r => {
                  const roleCfg = roleTypeLabels[r.role_type] || { label: r.role_type, color: 'bg-gray-500/20 text-gray-400 border-gray-500/30', icon: DollarSign };
                  const sCfg = statusConfig[r.status] || statusConfig.pending;
                  const StatusIcon = sCfg.icon;
                  const invDue = r.invoice_amount_due || 0;
                  const invPaid = r.invoice_amount_paid || 0;
                  return (
                    <div key={r.id} className="p-4 space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          {isAdmin && <span className="text-sm font-medium text-white">{r.employee_name}</span>}
                          <span className={`text-xs font-medium px-2 py-0.5 rounded border ${roleCfg.color}`}>{roleCfg.label}</span>
                        </div>
                        <span className={`flex items-center gap-1 text-xs font-medium ${sCfg.color}`}>
                          <StatusIcon className="w-3 h-3" />
                          {sCfg.label}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <div className="text-gray-500">Invoice</div>
                        <div className="text-gray-400 text-right">{r.invoice_number ? `#${r.invoice_number}` : '—'}</div>
                        {r.invoice_number && <>
                          <div className="text-gray-500">Inv. Paid</div>
                          <div className="text-gray-400 text-right">${fmt(invPaid)}{invDue > 0 && <span className="text-amber-400 ml-1">(${fmt(invDue)} due)</span>}</div>
                        </>}
                        <div className="text-gray-500">Rate</div>
                        <div className="text-gray-300 text-right">{Number(r.commission_rate).toFixed(2)}%</div>
                        <div className="text-gray-500">Potential</div>
                        <div className="text-gray-300 text-right">${fmt(r.total_potential_commission)}</div>
                        <div className="text-gray-500">Earned</div>
                        <div className="text-green-400 font-medium text-right">${fmt(r.amount_earned)}</div>
                        <div className="text-gray-500">Paid</div>
                        <div className="text-emerald-400 text-right">${fmt(r.amount_paid)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop table view */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-700/50">
                      {isAdmin && <th className="text-left px-4 py-3">Employee</th>}
                      <th className="text-left px-4 py-3">Type</th>
                      <th className="text-left px-4 py-3">Invoice</th>
                      <th className="text-right px-4 py-3">Inv. Paid</th>
                      <th className="text-right px-4 py-3">Inv. Due</th>
                      <th className="text-right px-4 py-3">Rate</th>
                      <th className="text-right px-4 py-3">Potential</th>
                      <th className="text-right px-4 py-3">Earned</th>
                      <th className="text-right px-4 py-3">Paid</th>
                      <th className="text-left px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700/30">
                    {records.map(r => {
                      const roleCfg = roleTypeLabels[r.role_type] || { label: r.role_type, color: 'bg-gray-500/20 text-gray-400 border-gray-500/30', icon: DollarSign };
                      const sCfg = statusConfig[r.status] || statusConfig.pending;
                      const StatusIcon = sCfg.icon;
                      return (
                        <tr key={r.id} className="hover:bg-gray-800/30 transition-colors">
                          {isAdmin && <td className="px-4 py-3 text-sm text-white">{r.employee_name}</td>}
                          <td className="px-4 py-3">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded border ${roleCfg.color}`}>
                              {roleCfg.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-400">
                            {r.invoice_number ? `#${r.invoice_number}` : '—'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-300 text-right">
                            {r.invoice_amount_paid != null ? `$${fmt(r.invoice_amount_paid)}` : '—'}
                          </td>
                          <td className="px-4 py-3 text-sm text-right">
                            {r.invoice_amount_due != null && r.invoice_amount_due > 0
                              ? <span className="text-amber-400">${fmt(r.invoice_amount_due)}</span>
                              : <span className="text-gray-600">—</span>
                            }
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-300 text-right">{Number(r.commission_rate).toFixed(2)}%</td>
                          <td className="px-4 py-3 text-sm text-gray-300 text-right">${fmt(r.total_potential_commission)}</td>
                          <td className="px-4 py-3 text-sm font-medium text-green-400 text-right">${fmt(r.amount_earned)}</td>
                          <td className="px-4 py-3 text-sm text-emerald-400 text-right">${fmt(r.amount_paid)}</td>
                          <td className="px-4 py-3">
                            <span className={`flex items-center gap-1 text-xs font-medium ${sCfg.color}`}>
                              <StatusIcon className="w-3 h-3" />
                              {sCfg.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {records.length > 1 && (
                    <tfoot>
                      <tr className="border-t-2 border-gray-600 bg-gray-800/30">
                        {isAdmin && <td className="px-4 py-3 text-sm font-semibold text-white" colSpan={1}>Totals</td>}
                        {!isAdmin && <td className="px-4 py-3 text-sm font-semibold text-white">Totals</td>}
                        <td colSpan={4} />
                        <td className="px-4 py-3 text-sm font-semibold text-white text-right">${fmt(totalPotentialOnRecords)}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-green-400 text-right">${fmt(totalEarned)}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-emerald-400 text-right">${fmt(totalPaid)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {!hasRecords && !hasNoProject && (
        <div className="bg-gray-900/50 rounded-xl border border-gray-700/50 p-8 text-center">
          <Users className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 mb-1">No commission records yet</p>
          <p className="text-sm text-gray-600">
            Records are created automatically when invoices are generated for eligible employees.
          </p>
        </div>
      )}

      {settings && (
        <div className="text-xs text-gray-600 text-right">
          Company defaults — Basis: {settings.commission_basis} &middot; Sales {Number(settings.default_sales_projects_rate).toFixed(1)}% &middot; PM {Number(settings.default_pm_rate).toFixed(1)}% &middot; Design {Number(settings.default_design_rate).toFixed(1)}%
        </div>
      )}
    </div>
  );
}
