import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import {
  LOSS_REASONS,
  SOURCE_LABELS,
  lossDateRange,
  lossReasonStats,
  needsLossFeedback,
  type LossRow,
} from "../../lib/proposalLoss";
import { loadProposalLosses } from "../../lib/loadProposalLosses";
import { LossFeedbackModal } from "../Proposals/LossFeedbackModal";
const money = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
const selectClass =
  "min-h-11 max-w-full rounded-lg border border-gray-600 bg-gray-900 px-3 text-sm text-white";
export function DeclinedProposalsReport() {
  const { profile } = useAuth();
  const org = profile?.organization_id,
    canView = !!profile?.can_view_lost_opportunity_submissions;
  const isAdmin = [
    "admin",
    "owner",
    "super_admin",
    "manager",
    "sales_manager",
    "finance",
  ].includes(profile?.role || "");
  const [rows, setRows] = useState<LossRow[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [period, setPeriod] = useState("this_year"),
    [rep, setRep] = useState("all"),
    [reason, setReason] = useState("all"),
    [status, setStatus] = useState("declined"),
    [feedback, setFeedback] = useState("all"),
    [expanded, setExpanded] = useState<string | null>(null),
    [editing, setEditing] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!org || !isAdmin) return;
    setLoading(true);
    setError("");
    try {
      setRows(await loadProposalLosses(org, canView));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to load loss feedback.",
      );
    } finally {
      setLoading(false);
    }
  }, [org, isAdmin, canView]);
  useEffect(() => {
    void load();
  }, [load]);
  if (!isAdmin) return null;
  const range = lossDateRange(period);
  const visible = rows
    .filter(
      (r) =>
        (status === "all" || r.status === status) &&
        (rep === "all" || r.rep === rep) &&
        (reason === "all" || r.evidence.reasons.includes(reason)) &&
        (feedback === "all" ||
          (feedback === "needed"
            ? needsLossFeedback(r.evidence)
            : !needsLossFeedback(r.evidence))) &&
        (period === "all_time" ||
          (r.date &&
            (!range.start || Date.parse(r.date) >= Date.parse(range.start)) &&
            Date.parse(r.date) < Date.parse(range.end))),
    )
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const losses = visible.filter((r) => r.status === "declined"),
    stats = lossReasonStats(losses),
    needed = losses.filter((r) => needsLossFeedback(r.evidence)),
    missingDates = rows.filter((r) => !r.date).length;
  const months = new Map<
    string,
    { count: number; value: number; needed: number }
  >();
  for (const r of losses) {
    const m = r.date
        ? new Date(r.date).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
          })
        : "Date unknown",
      s = months.get(m) || { count: 0, value: 0, needed: 0 };
    s.count++;
    s.value += r.total;
    if (needsLossFeedback(r.evidence)) s.needed++;
    months.set(m, s);
  }
  const reps = new Map<string, string>();
  for (const r of rows)
    if (r.rep && !reps.has(r.rep)) reps.set(r.rep, r.repName);
  return (
    <div className="space-y-5 p-4 text-white">
      <div>
        <h2 className="text-lg font-semibold">Why we lose proposals</h2>
        <p className="text-sm text-gray-400">
          Each proposal counts once. Customer answers take priority over staff
          assessments. Cancellations are excluded from loss statistics.
        </p>
      </div>
      {!canView && (
        <p className="text-sm text-amber-200">
          Private questionnaire responses require Lost Opportunity submission
          permission and Reviews access. These totals include only feedback you
          can access.
        </p>
      )}
      {missingDates > 0 && (
        <p className="text-sm text-amber-200">
          {missingDates} older records have no loss date and appear under All
          time only.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Loss date range"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className={selectClass}
        >
          {Object.entries({
            this_month: "This month",
            last_month: "Last month",
            this_quarter: "This quarter",
            this_year: "This year",
            all_time: "All time",
          }).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <select
          aria-label="Loss status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={selectClass}
        >
          <option value="declined">Lost proposals</option>
          <option value="cancelled">Cancellations</option>
          <option value="all">Losses and cancellations</option>
        </select>
        <select
          aria-label="Sales representative"
          value={rep}
          onChange={(e) => setRep(e.target.value)}
          className={selectClass}
        >
          <option value="all">All reps</option>
          {[...reps].map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <select
          aria-label="Loss reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className={selectClass}
        >
          <option value="all">All reasons</option>
          {Object.entries(LOSS_REASONS).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <select
          aria-label="Feedback status"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          className={selectClass}
        >
          <option value="all">All feedback</option>
          <option value="needed">Feedback needed / call list</option>
          <option value="confirmed">Customer confirmed</option>
        </select>
        <button
          onClick={() => void load()}
          disabled={loading}
          className={selectClass}
        >
          Refresh
        </button>
      </div>
      {error && (
        <p role="alert" className="text-red-300">
          {error}
        </p>
      )}
      {loading ? (
        <p>Loading loss feedback…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["Lost proposals", losses.length],
              [
                "Known proposal value",
                money(losses.reduce((n, r) => n + r.total, 0)),
              ],
              [
                "Customer-confirmed reasons",
                `${losses.length ? Math.round(((losses.length - needed.length) / losses.length) * 100) : 0}%`,
              ],
              ["Feedback needed", needed.length],
            ].map(([l, v]) => (
              <div
                key={l}
                className="rounded-xl border border-gray-700 bg-gray-800 p-4"
              >
                <p className="text-xs text-gray-400">{l}</p>
                <p className="mt-1 text-2xl font-semibold">{v}</p>
              </div>
            ))}
          </div>
          {losses.some((r) => !r.valueKnown) && (
            <p className="text-xs text-gray-400">
              External opportunities count toward reasons; their dollar values
              are unknown and excluded from value totals.
            </p>
          )}
          <div className="overflow-x-auto rounded-xl border border-gray-700">
            <table className="w-full text-sm">
              <caption className="p-3 text-left font-semibold">
                Loss reasons
              </caption>
              <thead className="text-gray-400">
                <tr>
                  <th className="p-3 text-left">Reason</th>
                  <th>Proposals</th>
                  <th>% of losses</th>
                  <th className="pr-3 text-right">Known value</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => (
                  <tr key={s.reason} className="border-t border-gray-700">
                    <td className="p-3">
                      {LOSS_REASONS[s.reason] || s.reason}
                    </td>
                    <td className="text-center">{s.count}</td>
                    <td className="text-center">
                      {losses.length
                        ? Math.round((s.count / losses.length) * 100)
                        : 0}
                      %
                    </td>
                    <td className="pr-3 text-right">{money(s.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400">
            Customers may give several reasons. Percentages can total more than
            100%, and proposal value can appear under several reasons.
          </p>
          {!!months.size && (
            <div className="overflow-x-auto rounded-xl border border-gray-700">
              <table className="w-full text-sm">
                <caption className="p-3 text-left font-semibold">
                  Monthly loss trend
                </caption>
                <thead className="text-gray-400">
                  <tr>
                    <th className="p-3 text-left">Month</th>
                    <th>Losses</th>
                    <th>Feedback needed</th>
                    <th className="pr-3 text-right">Known value</th>
                  </tr>
                </thead>
                <tbody>
                  {[...months].map(([m, s]) => (
                    <tr key={m} className="border-t border-gray-700">
                      <td className="p-3">{m}</td>
                      <td className="text-center">{s.count}</td>
                      <td className="text-center">{s.needed}</td>
                      <td className="pr-3 text-right">{money(s.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="space-y-2">
            <h3 className="font-semibold">
              {feedback === "needed"
                ? "Customer follow-up list"
                : "Proposals and feedback"}{" "}
              ({visible.length})
            </h3>
            {!visible.length && (
              <p className="text-gray-400">No records match these filters.</p>
            )}
            {visible.map((r) => (
              <div
                key={r.id}
                className="rounded-xl border border-gray-700 bg-gray-800"
              >
                <button
                  onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                  className="w-full p-4 text-left"
                >
                  <span className="block font-medium">{r.name}</span>
                  <span className="block text-xs text-gray-400">
                    {r.number} · {r.repName} ·{" "}
                    {r.valueKnown ? money(r.total) : "Value unknown"} ·{" "}
                    {r.status}
                    {r.proposalStatus &&
                      !["declined", "cancelled", "archived"].includes(
                        r.proposalStatus,
                      ) &&
                      ` · Lost-opportunity request; proposal status: ${r.proposalStatus}`}
                  </span>
                  <span className="mt-1 block text-sm text-cyan-200">
                    {r.evidence.reasons
                      .map((k) => LOSS_REASONS[k] || k)
                      .join(", ")}
                  </span>
                  <span className="block text-xs text-gray-400">
                    {SOURCE_LABELS[r.evidence.source]}
                    {needsLossFeedback(r.evidence)
                      ? " · Customer feedback needed"
                      : ""}
                    {r.reminderSent ? " · Reminder sent" : ""}
                  </span>
                </button>
                {expanded === r.id && (
                  <div className="space-y-3 border-t border-gray-700 p-4">
                    {r.date && (
                      <p className="text-xs text-gray-400">
                        Loss date: {new Date(r.date).toLocaleDateString()}
                      </p>
                    )}
                    {r.history
                      .slice()
                      .sort((a, b) => b.created_at.localeCompare(a.created_at))
                      .map((h, i) => (
                        <div
                          key={i}
                          className="border-l-2 border-cyan-700 pl-3 text-sm"
                        >
                          <p>
                            {SOURCE_LABELS[h.source]} ·{" "}
                            {h.created_at === "1970-01-01"
                              ? "Date unknown"
                              : new Date(h.created_at).toLocaleString()}
                          </p>
                          <p>
                            {h.reasons
                              .map((k) => LOSS_REASONS[k] || k)
                              .join(", ")}
                          </p>
                          {h.notes && (
                            <p className="whitespace-pre-wrap text-gray-300">
                              {h.notes}
                            </p>
                          )}
                        </div>
                      ))}
                    {r.proposalId &&
                      r.canRecord &&
                      profile?.role !== "finance" &&
                      r.status === "declined" && (
                        <button
                          className="min-h-11 rounded bg-cyan-700 px-4"
                          onClick={() => setEditing(r.proposalId)}
                        >
                          Record customer call / feedback
                        </button>
                      )}
                    {!r.canRecord && (
                      <p className="text-sm text-gray-400">
                        Record phone or email feedback in Reviews → Lost
                        Opportunities.
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
      {editing && (
        <LossFeedbackModal
          proposalId={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </div>
  );
}
