import { useEffect, useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { getOrganizationTimezone } from "../../lib/timezoneUtils";
import { canManageTimeOff, displayDate, LeaveDay } from "../../lib/timeOff";
import { PTOManagement } from "../Admin/PTOManagement";
import { TeamTimeOffPanel } from "../Shared/TeamTimeOffPanel";
interface Balance {
  id: string;
  current_balance_hours: number;
  pending_hours: number;
  used_hours_ytd: number;
  policy: {
    id: string;
    policy_name: string;
    pto_type: string;
    is_paid: boolean;
  };
}
interface Request {
  id: string;
  start_date: string;
  end_date: string;
  total_hours: number;
  status: string;
  request_type: string;
  reason: string | null;
  review_notes: string | null;
  leave_days: LeaveDay[] | null;
  policy: { policy_name: string };
}
export function MyTimeOff() {
  const { user, profile } = useAuth();
  const [tab, setTab] = useState<"mine" | "team" | "manage">("mine");
  const [balances, setBalances] = useState<Balance[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [policy, setPolicy] = useState("");
  const [type, setType] = useState("full_day");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("12:00");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<LeaveDay[]>([]);
  const [previewError, setPreviewError] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [today, setToday] = useState("");
  const [settings, setSettings] = useState({
    notice: 14,
    cutoff: "07:00",
    points: 10,
  });
  useEffect(() => {
    let active = true;
    getOrganizationTimezone().then((tz) => {
      if (active) setToday(formatInTimeZone(new Date(), tz, "yyyy-MM-dd"));
    });
    supabase
      .from("company_settings")
      .select(
        "pto_vacation_advance_days,pto_same_day_callin_cutoff_time,pto_same_day_callin_points_loss",
      )
      .maybeSingle()
      .then(({ data }) => {
        if (data && active)
          setSettings({
            notice: data.pto_vacation_advance_days ?? 14,
            cutoff: (data.pto_same_day_callin_cutoff_time ?? "07:00").slice(
              0,
              5,
            ),
            points: data.pto_same_day_callin_points_loss ?? 10,
          });
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([
      supabase
        .from("pto_balances")
        .select(
          "id,current_balance_hours,pending_hours,used_hours_ytd,policy:pto_policies!policy_id(id,policy_name,pto_type,is_paid)",
        )
        .eq("employee_id", user.id),
      supabase
        .from("pto_requests")
        .select(
          "id,start_date,end_date,total_hours,request_type,status,reason,review_notes,leave_days,policy:pto_policies!policy_id(policy_name)",
        )
        .eq("employee_id", user.id)
        .order("submitted_at", { ascending: false }),
    ])
      .then(([b, r]) => {
        if (b.error) throw b.error;
        if (r.error) throw r.error;
        if (active) {
          setBalances((b.data as unknown as Balance[]) || []);
          setRequests((r.data as unknown as Request[]) || []);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user?.id, refresh]);
  useEffect(() => {
    const channel = supabase
      .channel("my-time-off")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pto_requests",
          filter: `employee_id=eq.${user?.id}`,
        },
        () => setRefresh((v) => v + 1),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pto_balances",
          filter: `employee_id=eq.${user?.id}`,
        },
        () => setRefresh((v) => v + 1),
      )
      .subscribe();
    const focus = () => setRefresh((v) => v + 1);
    window.addEventListener("focus", focus);
    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener("focus", focus);
    };
  }, [user?.id]);
  useEffect(() => {
    let active = true;
    setPreview([]);
    setPreviewError("");
    setPreviewLoading(false);
    if (!showForm || !start || !end) return;
    setPreviewLoading(true);
    const timer = setTimeout(() => {
      supabase
        .rpc("preview_time_off", {
          p_start: start,
          p_end: end,
          p_type: type,
          p_start_time: type === "full_day" ? null : startTime,
          p_end_time: type === "full_day" ? null : endTime,
        })
        .then(({ data, error }) => {
          if (active) {
            if (error) setPreviewError(error.message);
            else setPreview(data || []);
            setPreviewLoading(false);
          }
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [showForm, start, end, type, startTime, endTime]);
  const selected = balances.find((b) => b.policy.id === policy);
  const total = preview.reduce((sum, d) => sum + Number(d.hours), 0);
  const shortNotice =
    selected?.policy.pto_type === "vacation" &&
    start &&
    today &&
    (new Date(start + "T12:00Z").getTime() -
      new Date(today + "T12:00Z").getTime()) /
      86400000 <
      settings.notice;
  async function submit() {
    if (!policy || !preview.length || previewError) return;
    setBusy(true);
    setError("");
    const { error } = await supabase.rpc("submit_time_off", {
      p_policy: policy,
      p_start: start,
      p_end: end,
      p_type: type,
      p_start_time: type === "full_day" ? null : startTime,
      p_end_time: type === "full_day" ? null : endTime,
      p_reason: reason || null,
    });
    if (error) setError(error.message);
    else {
      setShowForm(false);
      setRefresh((v) => v + 1);
    }
    setBusy(false);
  }
  async function cancel(id: string) {
    if (!window.confirm("Cancel this time off request?")) return;
    setBusy(true);
    const { error } = await supabase.rpc("cancel_time_off", { p_request: id });
    if (error) setError(error.message);
    else setRefresh((v) => v + 1);
    setBusy(false);
  }
  const field =
    "min-h-11 w-full rounded-lg border border-subtle bg-canvas p-2 text-primary";
  return (
    <div className="space-y-4 text-primary">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h2 className="text-2xl font-bold">My Time Off</h2>
        <button
          type="button"
          onClick={() => {
            setError("");
            setShowForm(true);
          }}
          className="min-h-11 rounded-lg bg-blue-600 px-4 text-white"
        >
          Request Time Off
        </button>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          aria-pressed={tab === "mine"}
          onClick={() => setTab("mine")}
          className={`min-h-11 px-4 rounded-lg ${tab === "mine" ? "bg-blue-600 text-white" : "bg-surface"}`}
        >
          My Requests & Balances
        </button>
        <button
          type="button"
          aria-pressed={tab === "team"}
          onClick={() => setTab("team")}
          className={`min-h-11 px-4 rounded-lg ${tab === "team" ? "bg-blue-600 text-white" : "bg-surface"}`}
        >
          Team Time Off
        </button>
        {canManageTimeOff(profile?.role) && (
          <button
            type="button"
            onClick={() => setTab("manage")}
            className="min-h-11 px-4 rounded-lg bg-surface"
          >
            Manage Time Off
          </button>
        )}
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-800"
        >
          {error}
        </p>
      )}
      {tab === "manage" && canManageTimeOff(profile?.role) ? (
        <PTOManagement />
      ) : tab === "team" ? (
        <TeamTimeOffPanel />
      ) : (
        <>
          {loading && <p role="status">Loading time off…</p>}
          <div className="grid gap-3 md:grid-cols-3">
            {balances.map((b) => (
              <div
                key={b.id}
                className="bg-surface border border-subtle rounded-xl p-4"
              >
                <h3 className="font-semibold">{b.policy.policy_name}</h3>
                <p className="text-2xl font-bold mt-2">
                  {Math.max(
                    0,
                    Number(b.current_balance_hours) - Number(b.pending_hours),
                  ).toFixed(1)}{" "}
                  hrs available
                </p>
                <p className="text-sm text-muted">
                  {Number(b.pending_hours).toFixed(1)} pending ·{" "}
                  {Number(b.used_hours_ytd).toFixed(1)} used YTD
                </p>
              </div>
            ))}
          </div>
          {!loading && !balances.length && (
            <p className="bg-surface rounded-lg p-4">
              Your leave policies and opening balances have not been assigned.
              Ask your manager to set them up in the Time Clock Command Center.
            </p>
          )}
          <section className="rounded-xl border border-subtle bg-surface p-4 space-y-3">
            <h3 className="font-semibold">Request History</h3>
            {requests.map((r) => (
              <article key={r.id} className="border-b border-subtle pb-3">
                <div className="flex flex-wrap justify-between gap-2">
                  <strong>{r.policy?.policy_name || "Time off"}</strong>
                  <span className="capitalize">{r.status}</span>
                </div>
                <p>
                  {displayDate(r.start_date)} – {displayDate(r.end_date)} ·{" "}
                  {Number(r.total_hours).toFixed(1)} hours
                </p>
                {r.leave_days && r.request_type !== "full_day" && (
                  <p className="text-sm text-muted">
                    {r.leave_days[0].start?.slice(0, 5)}–
                    {r.leave_days[0].end?.slice(0, 5)}
                  </p>
                )}
                {r.reason && <p className="text-sm mt-1">{r.reason}</p>}
                {r.review_notes && (
                  <p className="text-sm text-muted">
                    Manager: {r.review_notes}
                  </p>
                )}
                {["pending", "approved"].includes(r.status) && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => cancel(r.id)}
                    className="min-h-11 mt-2 px-3 border rounded-lg"
                  >
                    Cancel Request
                  </button>
                )}
              </article>
            ))}
            {!loading && !requests.length && (
              <p className="text-muted">No time off requests yet.</p>
            )}
          </section>
        </>
      )}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/60 p-4 flex items-center justify-center">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="pto-request-title"
            className="bg-surface text-primary rounded-xl p-5 max-w-xl w-full max-h-[90vh] overflow-auto space-y-4"
          >
            <div className="flex justify-between">
              <h3 id="pto-request-title" className="text-xl font-semibold">
                Request Time Off
              </h3>
              <button
                type="button"
                aria-label="Close request"
                disabled={busy}
                onClick={() => setShowForm(false)}
                className="min-h-11 px-3"
              >
                Close
              </button>
            </div>
            {error && (
              <p role="alert" className="text-red-600">
                {error}
              </p>
            )}
            <label className="block">
              Leave Policy
              <select
                className={field}
                value={policy}
                onChange={(e) => setPolicy(e.target.value)}
              >
                <option value="">Select policy…</option>
                {balances.map((b) => (
                  <option key={b.id} value={b.policy.id}>
                    {b.policy.policy_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              Request Type
              <select
                className={field}
                value={type}
                onChange={(e) => {
                  setType(e.target.value);
                  if (e.target.value === "hours") setEnd(start);
                }}
              >
                <option value="full_day">Full workday(s)</option>
                <option value="half_day">Half workday(s)</option>
                <option value="hours">Specific hours (one day)</option>
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label>
                Start Date
                <input
                  className={field}
                  type="date"
                  min={today}
                  value={start}
                  onChange={(e) => {
                    setStart(e.target.value);
                    if (type === "hours" || !end || end < e.target.value)
                      setEnd(e.target.value);
                  }}
                />
              </label>
              <label>
                End Date
                <input
                  className={field}
                  type="date"
                  min={start || today}
                  value={end}
                  disabled={type === "hours"}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </label>
            </div>
            {type !== "full_day" && (
              <div className="grid grid-cols-2 gap-3">
                <label>
                  Leave Starts
                  <input
                    className={field}
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                  />
                </label>
                <label>
                  Leave Ends
                  <input
                    className={field}
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </label>
              </div>
            )}
            <p className="text-sm text-muted">
              Only your configured workdays are charged. Half days must match
              half your configured daily hours.
            </p>
            {previewLoading ? (
              <p role="status">Calculating hours…</p>
            ) : previewError ? (
              <p role="alert" className="text-red-600">
                {previewError}
              </p>
            ) : (
              preview.length > 0 && (
                <p className="font-semibold">
                  {preview.length} workday(s) · {total.toFixed(1)} hours total
                </p>
              )
            )}
            {shortNotice && (
              <p className="rounded bg-amber-50 text-amber-900 p-3">
                Vacation with less than {settings.notice} days’ notice can be
                submitted, but needs a manager override reason to approve.
              </p>
            )}
            {start === today &&
              selected &&
              !["bereavement", "jury_duty", "unpaid"].includes(
                selected.policy.pto_type,
              ) && (
                <p className="rounded bg-amber-50 text-amber-900 p-3">
                  Same-day requests submitted after {settings.cutoff} may deduct{" "}
                  {settings.points} rewards points under your company’s current
                  settings.
                </p>
              )}
            <label className="block">
              Reason (private, optional)
              <textarea
                className={field}
                rows={3}
                maxLength={5000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={
                busy ||
                previewLoading ||
                !policy ||
                !preview.length ||
                !!previewError
              }
              onClick={submit}
              className="min-h-11 w-full rounded-lg bg-blue-600 text-white disabled:opacity-50"
            >
              {busy ? "Submitting…" : "Submit Request"}
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
