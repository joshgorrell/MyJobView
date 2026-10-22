import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { gpsTrackingService } from "../../lib/gpsTracking";
import { offlineStorage } from "../../lib/offlineStorage";
import { offlineSupabaseUpdate } from "../../lib/offlineSupport";

export async function saveCustomerTimeGps(
  id: string,
  stopping = false,
  capture = gpsTrackingService.captureLocationForClockEvent(stopping),
) {
  const gps = await capture;
  const values = { [stopping ? "stop_gps" : "start_gps"]: gps };
  try {
    const { error } = await offlineSupabaseUpdate("customer_time_sessions", values, id);
    if (error) throw error;
  } catch (error: any) {
    if (/failed to fetch|fetch failed|network|load failed/i.test(error?.message || "")) {
      await offlineStorage.addToSyncQueue({type:"update",table:"customer_time_sessions",data:{...values,id}});
    } else throw error;
  }
}
export function CustomerTimeTimer({ onChanged }: { onChanged?: () => void }) {
  const { profile } = useAuth();
  const [session, setSession] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  async function load() {
    if (!profile) return;
    const { data, error } = await supabase
      .from("customer_time_sessions")
      .select(
        "id,clock_in,notes,project_id,customer:contacts(full_name),project:projects(name,project_number)",
      )
      .eq("technician_id", profile.id)
      .is("clock_out", null)
      .maybeSingle();
    if (error)
      setError(
        "Unable to check your customer timer. Refresh before starting more time.",
      );
    else {
      setSession(data);
      setError("");
    }
  }
  useEffect(() => {
    void load();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const refresh = () => {
      void load();
    };
    window.addEventListener("customer-time-changed", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(tick);
      window.removeEventListener("customer-time-changed", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [profile?.id]);
  async function stop() {
    if (!session || busy) return;
    if (!navigator.onLine) {
      setError(
        "Reconnect to stop this timer. Its start time is saved and it continues running.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const capture = gpsTrackingService.captureLocationForClockEvent(true);
      const { error } = await supabase.rpc("stop_customer_job_time", {
        p_session_id: session.id,
      });
      if (error) throw error;
      void saveCustomerTimeGps(session.id, true, capture).catch((error) =>
        console.error("Customer timer GPS save:", error),
      );
      await load();
      onChanged?.();
      window.dispatchEvent(new Event("customer-time-changed"));
    } catch (error: any) {
      setError(error.message || "Unable to stop your timer.");
    } finally {
      setBusy(false);
    }
  }
  if (!session && !error) return null;
  const minutes = session
    ? Math.max(0, Math.floor((now - Date.parse(session.clock_in)) / 60000))
    : 0;
  return (
    <section
      className="rounded-xl border border-blue-400 bg-elevated p-3 space-y-2"
      aria-label="Running customer time"
    >
      {session && (
        <>
          <p className="font-semibold">
            {session.project_id ? "Project" : "Customer Activity"} ·{" "}
            {session.customer?.full_name}
          </p>
          <p className="text-sm">
            {session.project?.project_number}{" "}
            {session.project?.name || session.notes}
          </p>
          <p className="text-sm">
            {Math.floor(minutes / 60)}h {minutes % 60}m running
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={stop}
            className="min-h-11 rounded-lg bg-red-600 px-4 py-2 text-white disabled:opacity-50"
          >
            {busy ? "Stopping…" : "Stop & Submit Time"}
          </button>
          <p className="text-xs text-secondary">
            Stopped time goes to the existing manager review queue. Pay follows
            your employee settings.
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </section>
  );
}
