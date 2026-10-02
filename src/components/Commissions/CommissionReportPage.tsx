import { useEffect, useState, useRef } from "react";
import { Calendar, Download, Printer, RefreshCw } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import {
  commissionPeriods,
  organizationToday,
  type CommissionPeriod,
} from "../../lib/commissionPeriods";

interface ReportLine {
  commissionRecordId: string;
  collectionId: string;
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  paymentDate: string;
  paymentMethod: string;
  employeeId: string;
  employeeName: string;
  roleType: string;
  effectiveRate: number;
  grossSale: number;
  ccFeeDeducted: number;
  netCommissionable: number;
  commissionAmount: number;
  approvalStatus: string;
}
const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    n,
  );
const roles: Record<string, string> = {
  sales_projects: "Project Sales",
  design: "Design",
  pm: "Project Manager",
  service_sales: "Service Sales",
  service_pm: "Service Department",
};

export function CommissionReportPage() {
  const { profile } = useAuth();
  const organizationId = profile?.organization_id;
  const requestId = useRef(0);
  const [periods, setPeriods] = useState<CommissionPeriod[]>([]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [lines, setLines] = useState<ReportLine[]>([]);
  const [employee, setEmployee] = useState("all");
  const [legacyCount, setLegacyCount] = useState(0);
  const [adjustmentCount, setAdjustmentCount] = useState(0);
  const [error, setError] = useState("");
  const [periodNote, setPeriodNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [reportRange, setReportRange] = useState({ start: "", end: "" });

  useEffect(() => {
    requestId.current += 1;
    setLines([]);
    setHasRun(false);
    setLegacyCount(0);
    setAdjustmentCount(0);
    setEmployee("all");
    setError("");
    setLoading(false);
    setPeriodNote("");
    if (!organizationId) return;
    let canceled = false;
    async function load() {
      const [settings, organization] = await Promise.all([
        supabase
          .from("company_commission_settings")
          .select("payroll_frequency,payroll_start_date")
          .eq("organization_id", organizationId)
          .maybeSingle(),
        supabase
          .from("organizations")
          .select("timezone")
          .eq("id", organizationId)
          .single(),
      ]);
      if (canceled) return;
      if (settings.error || organization.error) {
        setError(
          settings.error?.message ||
            organization.error?.message ||
            "Could not load payroll settings.",
        );
        return;
      }
      const today = organizationToday(
        organization.data?.timezone || "America/Chicago",
      );
      const options = commissionPeriods(
        settings.data?.payroll_frequency || "custom",
        settings.data?.payroll_start_date || null,
        today,
      );
      setPeriods(options);
      setStart(options[0]?.start || `${today.slice(0, 7)}-01`);
      setEnd(options[0]?.end || today);
      if (!options.length)
        setPeriodNote(
          "Choose custom dates. Weekly and bi-weekly periods require a payroll start date in commission settings.",
        );
    }
    load().catch((err) => {
      if (!canceled) setError(err.message);
    });
    return () => {
      canceled = true;
    };
  }, [organizationId]);

  async function runReport() {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError("");
    try {
      const { data, error: reportError } = await supabase.rpc(
        "get_commission_period_report",
        { p_start: start, p_end: end },
      );
      if (currentRequest !== requestId.current) return;
      if (reportError) throw reportError;
      setLines(data?.lines || []);
      setLegacyCount(data?.legacyCount || 0);
      setAdjustmentCount(data?.adjustmentCount || 0);
      setReportRange({ start, end });
      setHasRun(true);
    } catch (err) {
      if (currentRequest !== requestId.current) return;
      setError(
        err instanceof Error ? err.message : "Could not generate report.",
      );
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }
  const filtered = lines.filter(
    (line) => employee === "all" || line.employeeId === employee,
  );
  const employees = [
    ...new Map(
      lines.map((line) => [line.employeeId, line.employeeName]),
    ).entries(),
  ];
  const grouped = filtered.reduce(
    (groups, line) => {
      (groups[line.employeeId] ||= {
        name: line.employeeName,
        lines: [],
      }).lines.push(line);
      return groups;
    },
    {} as Record<string, { name: string; lines: ReportLine[] }>,
  );
  const uniqueCollections = [
    ...new Map(
      filtered.map((line) => [`${line.invoiceId}:${line.collectionId}`, line]),
    ).values(),
  ];
  const totalBase = uniqueCollections.reduce(
    (sum, line) => sum + line.netCommissionable,
    0,
  );
  const totalEarned = filtered.reduce(
    (sum, line) => sum + line.commissionAmount,
    0,
  );

  function exportCsv() {
    const rows = [
      [
        "Payment Date",
        "Invoice",
        "Customer",
        "Recipient",
        "Role",
        "Method",
        "Commissionable Collection",
        "Rate %",
        "Commission Earned",
        "Approval",
      ],
    ];
    for (const line of filtered)
      rows.push([
        line.paymentDate,
        line.invoiceNumber,
        line.customerName,
        line.employeeName,
        roles[line.roleType] || line.roleType,
        line.paymentMethod,
        line.netCommissionable.toFixed(2),
        line.effectiveRate.toFixed(2),
        line.commissionAmount.toFixed(2),
        line.approvalStatus,
      ]);
    const escape = (s: string) =>
      `"${(/^[=+@-]/.test(s) ? "'" : "") + s.replace(/"/g, '""')}"`;
    const csv = rows.map((row) => row.map(escape).join(",")).join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `commission-earnings-${reportRange.start}-to-${reportRange.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5 print:text-black print:[&_*]:text-black print:[&_*]:bg-white">
      <div className="rounded-xl bg-gray-900/60 border border-gray-700 p-5 print:hidden space-y-4">
        <h2 className="font-semibold text-white flex gap-2 items-center">
          <Calendar className="w-4 h-4" />
          Commission Earnings Report
        </h2>
        <p className="text-sm text-gray-400">
          Shows commission earned on payments received in the selected period,
          including deposits, partial payments, and refunds. Approval and
          recorded payouts are tracked separately.
        </p>
        {periodNote && <p className="text-sm text-amber-300">{periodNote}</p>}
        <div className="flex flex-wrap gap-3 items-end">
          {periods.length > 0 && (
            <label className="text-sm text-gray-300">
              Pay period
              <select
                aria-label="Pay period"
                className="block mt-1 p-2 rounded bg-white text-black"
                value={periods.findIndex(
                  (p) => p.start === start && p.end === end,
                )}
                onChange={(e) => {
                  const p = periods[Number(e.target.value)];
                  if (p) {
                    setStart(p.start);
                    setEnd(p.end);
                  }
                }}
              >
                <option value={-1}>Custom dates</option>
                {periods.map((p, index) => (
                  <option key={p.start} value={index}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="text-sm text-gray-300">
            From
            <input
              aria-label="From"
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="block mt-1 p-2 rounded bg-white text-black"
            />
          </label>
          <label className="text-sm text-gray-300">
            Through
            <input
              aria-label="Through"
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="block mt-1 p-2 rounded bg-white text-black"
            />
          </label>
          <button
            disabled={loading || !start || !end || end < start}
            onClick={runReport}
            className="flex gap-2 items-center p-2 rounded bg-blue-600 text-white disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Loading…" : "Run Report"}
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="p-3 rounded bg-red-900/30 text-red-300">
          {error}
        </p>
      )}
      {hasRun && (
        <>
          <div className="flex flex-wrap justify-between gap-3 items-center">
            <h3 className="font-semibold text-white">
              Earnings: {reportRange.start} – {reportRange.end}
            </h3>
            <div className="flex gap-2 print:hidden">
              <select
                aria-label="Recipient"
                value={employee}
                onChange={(e) => setEmployee(e.target.value)}
                className="p-2 rounded bg-white text-black"
              >
                <option value="all">All recipients</option>
                {employees.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
              <button
                onClick={exportCsv}
                className="p-2 text-gray-300"
                title="Export earnings CSV"
              >
                <Download className="w-5 h-5" />
              </button>
              <button
                onClick={() => window.print()}
                className="p-2 text-gray-300"
                title="Print earnings report"
              >
                <Printer className="w-5 h-5" />
              </button>
            </div>
          </div>
          {legacyCount > 0 && (
            <p
              role="alert"
              className="p-3 rounded bg-amber-900/30 text-amber-200"
            >
              {legacyCount} historical commission record(s) with payments in
              this period require reconciliation and are excluded from this
              report. Review All Records before preparing payroll.
            </p>
          )}
          {adjustmentCount > 0 && (
            <p
              role="alert"
              className="p-3 rounded bg-amber-900/30 text-amber-200"
            >
              Saved report overrides or deductions exist for this period. They
              require review before payroll and have not changed these ledger
              earnings.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded border border-gray-700 p-4 text-gray-300">
              Commissionable collections
              <div className="text-xl font-bold text-white">
                {money(totalBase)}
              </div>
            </div>
            <div className="rounded border border-gray-700 p-4 text-gray-300">
              Commission earned
              <div className="text-xl font-bold text-green-400">
                {money(totalEarned)}
              </div>
            </div>
          </div>
          {filtered.length === 0 && (
            <p className="text-gray-400 p-5">
              No commission earnings found for these dates and recipient.
            </p>
          )}
          {Object.entries(grouped).map(([id, group]) => (
            <div
              key={id}
              className="rounded-xl border border-gray-700 overflow-hidden"
            >
              <div className="p-4 flex justify-between text-white bg-gray-800">
                <span className="font-semibold">{group.name}</span>
                <span>
                  {money(
                    group.lines.reduce(
                      (sum, line) => sum + line.commissionAmount,
                      0,
                    ),
                  )}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-gray-400 bg-gray-900">
                    <tr>
                      <th className="p-3 text-left">Payment</th>
                      <th className="p-3 text-left">Invoice / Customer</th>
                      <th className="p-3 text-left">Role</th>
                      <th className="p-3 text-right">Eligible Collection</th>
                      <th className="p-3 text-right">Rate</th>
                      <th className="p-3 text-right">Earned</th>
                      <th className="p-3 text-left">Approval</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.lines.map((line) => (
                      <tr
                        key={`${line.commissionRecordId}:${line.collectionId}`}
                        className="border-t border-gray-700 text-gray-300"
                      >
                        <td className="p-3 whitespace-nowrap">
                          {line.paymentDate}
                          <div className="text-xs text-gray-500">
                            {line.paymentMethod}
                          </div>
                        </td>
                        <td className="p-3">
                          {line.invoiceNumber}
                          <div className="text-xs text-gray-500">
                            {line.customerName}
                          </div>
                        </td>
                        <td className="p-3">
                          {roles[line.roleType] || line.roleType}
                        </td>
                        <td className="p-3 text-right">
                          {money(line.netCommissionable)}
                        </td>
                        <td className="p-3 text-right">
                          {line.effectiveRate}%
                        </td>
                        <td className="p-3 text-right text-green-400">
                          {money(line.commissionAmount)}
                        </td>
                        <td className="p-3">
                          {line.approvalStatus.replace(/_/g, " ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
