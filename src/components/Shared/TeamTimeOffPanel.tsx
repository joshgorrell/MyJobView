import { useEffect, useState } from "react";
import { dateKey } from "../../lib/workOrderScheduling";
import { getOrganizationTimezone } from "../../lib/timezoneUtils";
import { formatInTimeZone } from "date-fns-tz";
import {
  displayDate,
  leaveLabel,
  loadTeamLeave,
  loadTeamWorkSchedule,
  localDate,
  TeamLeave,
} from "../../lib/timeOff";

interface RosterDay {
  employee_id: string;
  employee_name: string;
  work_date: string;
  scheduled: boolean | null;
}
export function TeamTimeOffPanel({ from, to }: { from?: string; to?: string }) {
  const [date, setDate] = useState(dateKey(new Date()));
  const [view, setView] = useState<"week" | "month" | "upcoming">("week");
  const [leaves, setLeaves] = useState<TeamLeave[]>([]);
  const [roster, setRoster] = useState<RosterDay[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    getOrganizationTimezone().then((tz) => {
      if (active) setDate(formatInTimeZone(new Date(), tz, "yyyy-MM-dd"));
    });
    return () => {
      active = false;
    };
  }, []);
  const start = localDate(from || date);
  const end = localDate(to || date);
  if (!from) {
    if (view === "month") {
      start.setDate(1);
      end.setMonth(end.getMonth() + 1, 0);
    } else if (view === "week") {
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
      end.setTime(start.getTime());
      end.setDate(end.getDate() + 6);
    } else {
      end.setDate(end.getDate() + 90);
    }
  }
  const first = dateKey(start),
    last = dateKey(end);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([loadTeamLeave(first, last), loadTeamWorkSchedule(first, last)])
      .then(([leave, res]) => {
        if (active) {
          setLeaves(leave);
          setRoster(res);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message || "Could not load team availability");
          setLeaves([]);
          setRoster([]);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [first, last, refresh]);
  useEffect(() => {
    const timer = window.setInterval(() => setRefresh((v) => v + 1), 60000);
    const onFocus = () => setRefresh((v) => v + 1);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, []);
  const navigate = (direction: number) => {
    const next = localDate(date);
    if (view === "month") {
      next.setDate(1);
      next.setMonth(next.getMonth() + direction);
    } else next.setDate(next.getDate() + direction * 7);
    setDate(dateKey(next));
  };
  const dates: string[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1))
    dates.push(dateKey(d));
  const people = Array.from(
    new Map(
      roster.map((row) => [row.employee_id, row.employee_name]),
    ).entries(),
  );
  return (
    <section className="rounded-xl border border-subtle bg-surface p-4 space-y-3 text-primary">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Team Availability</h3>
          <p className="text-sm text-muted">
            Approved time off and scheduled workdays. Scheduled does not mean
            clocked in.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRefresh((v) => v + 1)}
          className="min-h-11 px-3 border border-subtle rounded-lg"
        >
          Refresh
        </button>
      </div>
      {!from && (
        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="min-h-11 px-3 border rounded"
          >
            Previous
          </button>
          <input
            aria-label="Availability date"
            type="date"
            value={date}
            onChange={(e) => {
              if (e.target.value) setDate(e.target.value);
            }}
            className="min-h-11 rounded border bg-canvas px-2"
          />
          <button
            type="button"
            onClick={() => navigate(1)}
            className="min-h-11 px-3 border rounded"
          >
            Next
          </button>
          <select
            aria-label="Availability view"
            value={view}
            onChange={(e) => setView(e.target.value as typeof view)}
            className="min-h-11 rounded border bg-canvas px-2"
          >
            <option value="week">Week</option>
            <option value="month">Month</option>
            <option value="upcoming">Upcoming 90 days</option>
          </select>
        </div>
      )}
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      {loading && <p role="status">Loading availability…</p>}
      {!loading &&
        !error &&
        (view === "upcoming" || from ? (
          <div className="space-y-2">
            {leaves.length ? (
              leaves.map((row) => (
                <div
                  key={row.request_id + row.leave_date}
                  className="flex flex-wrap justify-between gap-2 border-b border-subtle py-2"
                >
                  <span className="font-medium">{row.employee_name}</span>
                  <span>
                    {displayDate(row.leave_date)} · {leaveLabel(row)}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-muted">
                No approved time off in this date range.
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-auto max-h-[520px]">
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-surface p-3 text-left">
                    Employee
                  </th>
                  {dates.map((day) => (
                    <th key={day} className="p-3 whitespace-nowrap">
                      {localDate(day).toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {people.map(([id, name]) => (
                  <tr key={id}>
                    <th className="sticky left-0 bg-surface text-left p-3 whitespace-nowrap">
                      {name}
                    </th>
                    {dates.map((day) => {
                      const off = leaves.filter(
                        (r) => r.employee_id === id && r.leave_date === day,
                      );
                      const scheduled = roster.find(
                        (r) => r.employee_id === id && r.work_date === day,
                      )?.scheduled;
                      return (
                        <td
                          key={day}
                          className="border border-subtle p-2 min-w-32"
                        >
                          {off.length ? (
                            off.map((r) => (
                              <div
                                key={r.request_id}
                                className="rounded bg-blue-100 text-blue-900 p-1"
                              >
                                {leaveLabel(r)}
                              </div>
                            ))
                          ) : (
                            <span className="text-muted">
                              {scheduled === true
                                ? "Scheduled"
                                : scheduled === false
                                  ? "Not scheduled"
                                  : "Schedule not set"}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {!people.length && (
              <p className="p-3 text-muted">No active employees found.</p>
            )}
          </div>
        ))}
    </section>
  );
}
