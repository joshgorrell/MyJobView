import { useCompletion } from "../../hooks/useCompletion";
import { notify } from "../../lib/feedback";
import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { useEmployeeTimePolicy } from "../../hooks/useEmployeeTimePolicy";
import { QuickActionModal } from "../Shared/QuickActionModal";
import { WorkOrderTimeControl } from "../Production/WorkOrderTimeControl";
import { MobileClockRedirect } from "../Layout/MobileClockRedirect";
import {
  createTimestampInTimezone,
  formatDateInTimezone,
  getOrganizationTimezone,
} from "../../lib/timezoneUtils";
import {
  customerTimeActivities,
  workTimeClassification,
  type CustomerTimeTarget,
  type TimeProject,
  type TimeWorkOrder,
} from "../../lib/customerJobTime";
import { CustomerTimeTimer, saveCustomerTimeGps } from "./CustomerTimeTimer";
import { gpsTrackingService } from "../../lib/gpsTracking";

type Customer = { id: string; full_name: string; company_name: string | null };
const inputClass =
  "mt-1 w-full rounded-lg border border-subtle bg-white p-2 text-gray-900";
export function ManualJobTimeRequestModal({
  onClose,
  onSubmitted,
}: {
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const { profile } = useAuth();
  const policy = useEmployeeTimePolicy();
  const completion = useCompletion(() => {
    onSubmitted();
    onClose();
  });
  const [query, setQuery] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [projects, setProjects] = useState<TimeProject[]>([]);
  const [orders, setOrders] = useState<TimeWorkOrder[]>([]);
  const [project, setProject] = useState("");
  const [target, setTarget] = useState<CustomerTimeTarget | null>(null);
  const [mode, setMode] = useState<"timer" | "manual">("timer");
  const [date, setDate] = useState("");
  const [timezone, setTimezone] = useState("");
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("09:00");
  const [activity, setActivity] = useState("meeting");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [workFailed, setWorkFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const startId = useRef<string | null>(null);
  useEffect(() => {
    let disposed = false;
    void getOrganizationTimezone()
      .then((tz) => {
        if (!disposed) {
          setTimezone(tz);
          setDate(formatDateInTimezone(new Date().toISOString(), tz));
        }
      })
      .catch(() => {
        if (!disposed)
          setError("Unable to load your work timezone. Reopen and try again.");
      });
    return () => {
      disposed = true;
    };
  }, []);
  useEffect(() => {
    let disposed = false;
    if (!profile || customer) return;
    setSearching(true);
    setCustomers([]);
    const timer = setTimeout(async () => {
      const term = query.replace(/[%_,().\\]/g, " ").trim();
      let request = supabase
        .from("contacts")
        .select("id,full_name,company_name")
        .eq("organization_id", profile.organization_id);
      if (term)
        request = request.or(
          `full_name.ilike.%${term}%,company_name.ilike.%${term}%`,
        );
      const { data, error } = await request.order("full_name").limit(20);
      if (!disposed) {
        setSearching(false);
        if (error) setError("Unable to search customers. Try again.");
        else {
          setCustomers(data || []);
          setError("");
        }
      }
    }, 250);
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [profile?.id, query, customer?.id]);
  useEffect(() => {
    let disposed = false;
    setProjects([]);
    setOrders([]);
    setProject("");
    setTarget(null);
    startId.current = null;
    if (!customer || !profile) return;
    setLoading(true);
    setWorkFailed(false);
    setError("");
    async function load() {
      // Two WO queries include service visits linked to projects without misclassifying them.
      const p = await supabase
        .from("projects")
        .select("id,contact_id,name,project_number,status")
        .eq("organization_id", profile!.organization_id)
        .eq("contact_id", customer!.id)
        .order("name");
      if (disposed) return;
      if (p.error) {
        setWorkFailed(true);
        setError(
          "Unable to load this customer’s work. Try selecting the customer again.",
        );
        setLoading(false);
        return;
      }
      const ids = (p.data || []).map((row) => row.id);
      const fields =
        "id,contact_id,project_id,title,work_order_number,status,type,assigned_to";
      const direct = supabase
        .from("work_orders")
        .select(fields)
        .eq("organization_id", profile!.organization_id)
        .eq("contact_id", customer!.id)
        .in("status", ["pending", "assigned", "in_progress"])
        .order("work_order_number");
      const [d, linked] = await Promise.all([
        direct,
        ids.length
          ? supabase
              .from("work_orders")
              .select(fields)
              .eq("organization_id", profile!.organization_id)
              .in("project_id", ids)
              .in("status", ["pending", "assigned", "in_progress"])
              .order("work_order_number")
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (disposed) return;
      setLoading(false);
      if (d.error || linked.error) {
        setWorkFailed(true);
        setError("Unable to load this customer’s Work Orders. Try again.");
        return;
      }
      setProjects(
        (p.data || []).filter((p) => ["planning", "active"].includes(p.status)),
      );
      setOrders([
        ...new Map(
          [...(d.data || []), ...(linked.data || [])]
            .filter((w) => !w.contact_id || w.contact_id === customer!.id)
            .map((w) => [w.id, w]),
        ).values(),
      ]);
    }
    void load().catch(() => {
      if (!disposed) {
        setLoading(false);
        setWorkFailed(true);
        setError("Unable to load this customer’s work. Try again.");
      }
    });
    return () => {
      disposed = true;
    };
  }, [customer?.id, profile?.id, reload]);
  function choose(value: CustomerTimeTarget) {
    setTarget(value);
    setError("");
    startId.current = null;
  }
  const selectedOrder =
    target?.kind === "work_order"
      ? orders.find((w) => w.id === target.id)
      : null;
  const services = orders.filter(
    (w) => workTimeClassification(w) === "service",
  );
  const projectOrders = orders.filter(
    (w) => workTimeClassification(w) === "project" && w.project_id === project,
  );
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (
      !profile ||
      !customer ||
      !target ||
      !timezone ||
      saving ||
      completion.completed
    )
      return;
    setError("");
    setSaving(true);
    try {
      if (reason.trim().length < 3)
        throw new Error("Describe the work performed.");
      if (mode === "timer") {
        if (target.kind === "work_order") return;
        if (!navigator.onLine) throw new Error("Reconnect to start a timer.");
        startId.current ||= crypto.randomUUID();
        const capture = gpsTrackingService.captureLocationForClockEvent();
        const { data, error } = await supabase.rpc("start_customer_job_time", {
          p_session_id: startId.current,
          p_contact_id: customer.id,
          p_project_id: target.kind === "project" ? target.id : null,
          p_activity_type:
            target.kind === "project" ? "project_work" : activity,
          p_notes: reason.trim(),
        });
        if (error) throw error;
        void saveCustomerTimeGps(data, false, capture).catch((error) =>
          console.error("Customer timer GPS save:", error),
        );
        window.dispatchEvent(new Event("customer-time-changed"));
        onSubmitted();
        onClose();
      } else {
        const clockIn = createTimestampInTimezone(date, start, timezone),
          clockOut = createTimestampInTimezone(date, end, timezone);
        if (clockOut <= clockIn)
          throw new Error("End time must be after start time.");
        if (new Date(clockOut) > new Date())
          throw new Error("Enter time that has already been worked.");
        const { error } = await supabase
          .from("manual_job_time_requests")
          .insert({
            organization_id: profile.organization_id,
            technician_id: profile.id,
            contact_id: customer.id,
            project_id: target.kind === "project" ? target.id : null,
            work_order_id: target.kind === "work_order" ? target.id : null,
            activity_type:
              target.kind === "customer_activity" ? activity : null,
            entry_date: date,
            clock_in: clockIn,
            clock_out: clockOut,
            reason: reason.trim(),
            status: "pending",
          });
        if (error) throw error;
        notify("Time submitted for review.", {
          theme: "blue",
          tone: "success",
        });
        completion.complete();
      }
    } catch (error: any) {
      setError(error.message || "Unable to record time.");
      window.dispatchEvent(new Event("customer-time-changed"));
    } finally {
      setSaving(false);
    }
  }
  return (
    <QuickActionModal
      title="Record Job Time"
      subtitle="Choose the customer, then the work"
      icon={<Clock className="w-5 h-5" />}
      onClose={completion.completed ? completion.finish : onClose}
      showSuccess={completion.completed}
      successMessage="Time submitted for review!"
    >
      <form onSubmit={submit} className="space-y-4">
        <CustomerTimeTimer onChanged={onSubmitted} />
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        {!customer ? (
          <section className="space-y-2">
            <label className="block text-sm font-semibold">
              Customer
              <input
                aria-label="Search customers"
                autoFocus
                placeholder="Search customer or company"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className={inputClass}
              />
            </label>
            {searching ? (
              <p role="status">Searching customers…</p>
            ) : (
              <div className="max-h-60 overflow-y-auto space-y-1">
                {customers.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCustomer(c)}
                    className="block w-full rounded-lg border border-subtle p-3 text-left aria-pressed:border-blue-500 aria-pressed:bg-blue-500/10"
                  >
                    <span className="block font-medium">{c.full_name}</span>
                    {c.company_name && (
                      <span className="text-xs text-secondary">
                        {c.company_name}
                      </span>
                    )}
                  </button>
                ))}
                {!customers.length && (
                  <p className="text-sm text-secondary">
                    No customers found. Try another name.
                  </p>
                )}
                {customers.length === 20 && (
                  <p className="text-xs text-secondary">
                    Showing the first 20 matches. Type more to narrow your
                    search.
                  </p>
                )}
              </div>
            )}
          </section>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 rounded-lg border border-subtle p-3">
              <p className="font-semibold">{customer.full_name}</p>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setCustomer(null);
                  setQuery("");
                  setTarget(null);
                }}
                className="min-h-11 text-sm text-blue-600"
              >
                Change customer
              </button>
            </div>
            {loading ? (
              <p role="status">Loading open work…</p>
            ) : workFailed ? (
              <button
                type="button"
                onClick={() => setReload((value) => value + 1)}
                className="min-h-11 rounded-lg border border-subtle p-3"
              >
                Retry loading work
              </button>
            ) : (
              <div className="space-y-3">
                <section className="space-y-2" aria-label="Open projects">
                  <h3 className="font-semibold">Projects</h3>
                  {!projects.length && (
                    <p className="text-sm text-secondary">No open projects.</p>
                  )}
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={project === p.id}
                      onClick={() => {
                        setProject(p.id);
                        setTarget(null);
                      }}
                      className="block w-full rounded-lg border border-subtle p-3 text-left aria-pressed:border-blue-500 aria-pressed:bg-blue-500/10"
                    >
                      <span className="text-xs font-semibold text-blue-600">
                        Project · {p.status}
                      </span>
                      <span className="block">
                        {p.project_number} · {p.name}
                      </span>
                    </button>
                  ))}
                  {project && (
                    <div className="space-y-2 rounded-lg bg-elevated p-3">
                      {projectOrders.map((w) => (
                        <button
                          key={w.id}
                          type="button"
                          aria-pressed={
                            target?.kind === "work_order" && target.id === w.id
                          }
                          onClick={() =>
                            choose({
                              kind: "work_order",
                              id: w.id,
                              label: `Project Work Order · ${w.work_order_number} · ${w.title}`,
                            })
                          }
                          className="block w-full rounded-lg border border-subtle p-3 text-left aria-pressed:border-blue-500 aria-pressed:bg-blue-500/10"
                        >
                          Project Work Order · {w.work_order_number} · {w.title}
                          <span className="block text-xs text-secondary">
                            {w.status}
                          </span>
                        </button>
                      ))}
                      {!projectOrders.length && (
                        <p className="text-sm text-secondary">
                          No open project Work Orders.
                        </p>
                      )}
                      <button
                        type="button"
                        aria-pressed={
                          target?.kind === "project" && target.id === project
                        }
                        onClick={() =>
                          choose({
                            kind: "project",
                            id: project,
                            label: `Project · ${projects.find((p) => p.id === project)?.name}`,
                          })
                        }
                        className="min-h-11 rounded-lg border border-blue-500 p-3 text-sm"
                      >
                        Record project time outside a Work Order
                      </button>
                    </div>
                  )}
                </section>
                <section
                  className="space-y-2"
                  aria-label="Open service work orders"
                >
                  <h3 className="font-semibold">Service Work Orders</h3>
                  {!services.length && (
                    <p className="text-sm text-secondary">
                      No open service Work Orders.
                    </p>
                  )}
                  {services.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      aria-pressed={
                        target?.kind === "work_order" && target.id === w.id
                      }
                      onClick={() =>
                        choose({
                          kind: "work_order",
                          id: w.id,
                          label: `Service · ${w.work_order_number} · ${w.title}`,
                        })
                      }
                      className="block w-full rounded-lg border border-subtle p-3 text-left aria-pressed:border-blue-500 aria-pressed:bg-blue-500/10"
                    >
                      <span className="text-xs font-semibold text-amber-600">
                        Service · {w.type.replace(/_/g, " ")} · {w.status}
                      </span>
                      <span className="block">
                        {w.work_order_number} · {w.title}
                      </span>
                    </button>
                  ))}
                </section>
                <button
                  type="button"
                  aria-pressed={target?.kind === "customer_activity"}
                  onClick={() =>
                    choose({
                      kind: "customer_activity",
                      id: customer.id,
                      label: "Customer Activity",
                    })
                  }
                  className="block min-h-11 w-full rounded-lg border border-subtle p-3 text-left aria-pressed:border-blue-500 aria-pressed:bg-blue-500/10"
                >
                  <span className="block font-semibold">
                    Record Customer Activity
                  </span>
                  <span className="text-xs text-secondary">
                    Meeting, site survey or other work without a project or
                    service Work Order
                  </span>
                </button>
              </div>
            )}
            {target && !loading && !workFailed && (
              <section className="space-y-3 border-t border-subtle pt-4">
                <h3 className="font-semibold">{target.label}</h3>
                <div className="flex gap-2" aria-label="Recording method">
                  {(["timer", "manual"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={mode === value}
                      disabled={saving}
                      onClick={() => setMode(value)}
                      className={`min-h-11 rounded-lg border px-3 py-2 ${mode === value ? "bg-blue-600 text-white" : "border-subtle"}`}
                    >
                      {value === "timer"
                        ? "Start a timer"
                        : "Enter time already worked"}
                    </button>
                  ))}
                </div>
                {mode === "timer" && policy.clockAccess === "mobile" ? (
                  <MobileClockRedirect />
                ) : mode === "timer" && selectedOrder ? (
                  <>
                    {selectedOrder.assigned_to === profile?.id ? (
                      <WorkOrderTimeControl
                        workOrderId={selectedOrder.id}
                        assignedTo={selectedOrder.assigned_to}
                        onChanged={onSubmitted}
                      />
                    ) : (
                      <p className="text-sm text-secondary">
                        This Work Order is assigned to another employee or is
                        unassigned. Ask dispatch to assign it to you, or enter
                        time already worked for review.
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    {target.kind === "customer_activity" && (
                      <label className="block text-sm">
                        Activity
                        <select
                          value={activity}
                          onChange={(e) => {
                            setActivity(e.target.value);
                            startId.current = null;
                          }}
                          className={inputClass}
                        >
                          {customerTimeActivities.map((a) => (
                            <option key={a.value} value={a.value}>
                              {a.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {mode === "manual" && (
                      <>
                        <label className="block text-sm">
                          Work date
                          <input
                            type="date"
                            required
                            value={date}
                            max={
                              timezone
                                ? formatDateInTimezone(
                                    new Date().toISOString(),
                                    timezone,
                                  )
                                : undefined
                            }
                            onChange={(e) => setDate(e.target.value)}
                            className={inputClass}
                          />
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                          <label className="text-sm">
                            Start time
                            <input
                              type="time"
                              required
                              value={start}
                              onChange={(e) => setStart(e.target.value)}
                              className={inputClass}
                            />
                          </label>
                          <label className="text-sm">
                            End time
                            <input
                              type="time"
                              required
                              value={end}
                              onChange={(e) => setEnd(e.target.value)}
                              className={inputClass}
                            />
                          </label>
                        </div>
                        <p className="text-xs text-secondary">
                          Times are in {timezone}. Requests are reviewed before
                          they become approved job time.
                        </p>
                      </>
                    )}
                    <label className="block text-sm">
                      Work notes
                      <textarea
                        required
                        minLength={3}
                        value={reason}
                        onChange={(e) => {
                          setReason(e.target.value);
                          startId.current = null;
                        }}
                        rows={3}
                        className={inputClass}
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={
                        saving ||
                        completion.completed ||
                        !timezone ||
                        !policy.ready
                      }
                      className="min-h-11 w-full rounded-lg bg-blue-600 p-3 text-white disabled:opacity-50"
                    >
                      {saving
                        ? "Saving…"
                        : mode === "timer"
                          ? "Start Timer"
                          : "Submit Time for Review"}
                    </button>
                  </>
                )}
              </section>
            )}
          </>
        )}
      </form>
    </QuickActionModal>
  );
}
