import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
type Person = {
  id: string;
  full_name: string | null;
  email: string;
  my_job_view_enabled: boolean;
};
type Recipient = {
  user_id: string;
  recipient_role: "responsible" | "backup";
  email_enabled: boolean;
};
type Mailbox = {
  id: string;
  display_name: string | null;
  extension_number: string | null;
  extension_type: string | null;
  ringcentral_extension_id: string;
  enabled: boolean;
  default_department: string | null;
  primary_user_id: string | null;
  escalation_minutes: number;
  version: number;
  recipients: Recipient[];
};
const departments = [
  "sales",
  "service",
  "projects",
  "security",
  "accounting",
  "administration",
];
async function invoke(
  name: string,
  method: "GET" | "POST" | "PUT",
  body?: unknown,
) {
  const { data, error } = await supabase.functions.invoke(name, {
    method,
    ...(body ? { body } : {}),
  });
  if (error) {
    let reason = "Request failed";
    try {
      const details = await (error as { context?: Response }).context?.json();
      if (typeof details?.error === "string")
        reason = details.error.replace(/_/g, " ");
    } catch {
      /* Gateway error */
    }
    throw Error(reason);
  }
  return data;
}
export function RingCentralMailboxMapping() {
  const [showHelp, setShowHelp] = useState(false);
  const [emailHealth, setEmailHealth] = useState({ failed: 0, unknown: 0 });
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]),
    [people, setPeople] = useState<Person[]>([]),
    [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(true);
  async function load() {
    const data = await invoke("ringcentral-mailbox-mapping", "GET");
    setPeople(data.people || []);
    setEmailHealth(data.email_health || { failed: 0, unknown: 0 });
    setMailboxes(
      (data.mailboxes || []).map((m: Mailbox) => ({
        ...m,
        recipients: (data.recipients || []).filter(
          (r: Recipient & { mailbox_id: string }) => r.mailbox_id === m.id,
        ),
      })),
    );
  }
  useEffect(() => {
    void load()
      .catch(() =>
        setError(
          "Mailbox mapping is unavailable. Confirm the mailbox mapping update is deployed.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);
  const patch = (id: string, changes: Partial<Mailbox>) =>
    setMailboxes((old) =>
      old.map((m) => (m.id === id ? { ...m, ...changes } : m)),
    );
  async function discover() {
    setBusy("discover");
    setError("");
    setNotice("");
    try {
      const result = await invoke("ringcentral-mailbox-mapping", "POST", {});
      await load();
      setNotice(
        `Found ${result.discovered} RingCentral destinations. Choose the mailboxes that receive voicemail and assign their owners.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Discovery failed");
    } finally {
      setBusy(null);
    }
  }
  async function sync() {
    await invoke("ringcentral-webhook-subscription", "POST", {});
  }
  async function save(m: Mailbox) {
    setBusy(m.id);
    setError("");
    setNotice("");
    try {
      await invoke("ringcentral-mailbox-mapping", "PUT", {
        mailboxId: m.id,
        version: m.version,
        enabled: m.enabled,
        department: m.default_department,
        primaryUserId: m.primary_user_id,
        escalationMinutes: m.escalation_minutes,
        recipients: m.recipients,
      });
      await load();
      try {
        await sync();
        setNotice(
          "Mapping saved and RingCentral notification subscription updated. Verify delivery with a test voicemail.",
        );
      } catch (cause) {
        setError(
          `Mapping saved, but subscription update failed: ${cause instanceof Error ? cause.message : "unknown error"}. Use Sync monitored mailboxes after correcting provider access.`,
        );
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Save failed");
    } finally {
      setBusy(null);
    }
  }
  function recipient(
    m: Mailbox,
    id: string,
    role: Recipient["recipient_role"] | null,
  ) {
    const others = m.recipients.filter((r) => r.user_id !== id);
    patch(m.id, {
      recipients: role
        ? [
            ...others,
            {
              user_id: id,
              recipient_role: role,
              email_enabled:
                m.recipients.find((r) => r.user_id === id)?.email_enabled ??
                false,
            },
          ]
        : others,
      primary_user_id:
        m.primary_user_id === id && role !== "responsible"
          ? null
          : m.primary_user_id,
    });
  }
  return (
    <section
      className="space-y-3 border-t border-gray-200 pt-5"
      aria-label="RingCentral mailbox mapping"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h5 className="font-semibold text-gray-900">Mailbox mapping</h5>
          <p className="text-sm text-gray-600">
            Choose who handles each RingCentral voicemail destination.
          </p>
          <button
            type="button"
            aria-expanded={showHelp}
            aria-controls="ringcentral-mailbox-how-it-works"
            onClick={() => setShowHelp((open) => !open)}
            className="mt-1 text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900"
          >
            {showHelp ? "Hide instructions" : "How it works"}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void discover()}
            className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
          >
            Discover RingCentral destinations
          </button>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => {
              setBusy("sync");
              setError("");
              void sync()
                .then(() =>
                  setNotice("Monitored mailbox subscription synchronized."),
                )
                .catch((cause) => setError(cause.message))
                .finally(() => setBusy(null));
            }}
            className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
          >
            Sync monitored mailboxes
          </button>
        </div>
      </div>
      {showHelp && (
        <div id="ringcentral-mailbox-how-it-works" className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-gray-800">
          <h6 className="font-semibold text-gray-900">Set up voicemail routing in MyJobView</h6>
          <ol className="mt-2 list-decimal space-y-2 pl-5">
            <li><strong>Connect RingCentral</strong> using the integration above. Your account must have permission to read the mailboxes you want to monitor.</li>
            <li><strong>Discover RingCentral destinations</strong> to list available extensions. Discovery does not change your phone system or turn on monitoring.</li>
            <li><strong>Open an actual voicemail mailbox</strong> and select Monitor this mailbox. An IVR or announcement extension may not have its own voicemail.</li>
            <li><strong>Choose the default department and primary owner.</strong> The mailbox's department determines where its messages go in Flow, even when AI suggests another department.</li>
            <li><strong>Assign responsible and backup employees.</strong> Responsible employees receive Flow alerts; backups are alerted after the specified delay if the voicemail still needs attention. Select Email for anyone who should also get an email notification.</li>
            <li><strong>Save mapping</strong> to check mailbox access and synchronize monitored mailboxes. If subscription synchronization fails, correct the provider permissions and use Sync monitored mailboxes.</li>
            <li><strong>Leave a real test voicemail.</strong> Verify the correct department, owner, Flow alert, email (if enabled), recording and transcript. Use Import last 14 days to recover earlier messages if needed.</li>
          </ol>
          <p className="mt-3 text-xs text-gray-600">Only enabled mailboxes are monitored. Employees must have active MJV access. Email alerts link to authenticated Flow; they do not include caller details, recordings or transcripts. These settings do not change RingCentral call routing.</p>
        </div>
      )}
      <p className="text-xs text-gray-600">
        Discovery preserves your phone routing. Only enabled mailboxes are
        monitored. Saving assigns department access to selected recipients.
        Email alerts link to Flow; recordings and transcripts remain in MJV.
      </p>
      {loading && <p className="text-sm">Loading mailbox mappings…</p>}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-green-800">
          {notice}
        </p>
      )}
      {(emailHealth.failed > 0 || emailHealth.unknown > 0) && (
        <p role="alert" className="text-sm text-amber-800">
          Email delivery needs attention: {emailHealth.failed} failed;{" "}
          {emailHealth.unknown} uncertain. Uncertain deliveries require review
          before resending.
        </p>
      )}
      {!loading && !mailboxes.length && (
        <p className="text-sm text-gray-500">
          Discover your RingCentral destinations to begin.
        </p>
      )}
      {mailboxes.map((m) => (
        <article key={m.id} className="rounded-lg border border-gray-200 p-3">
          <button
            type="button"
            aria-expanded={expanded === m.id}
            onClick={() => setExpanded(expanded === m.id ? null : m.id)}
            className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
          >
            <span>
              <strong className="text-sm">
                {m.display_name || "RingCentral mailbox"}
                {m.extension_number ? ` · Ext. ${m.extension_number}` : ""}
              </strong>
              <span className="ml-2 text-xs text-gray-500">
                {m.extension_type || "Mailbox"}
              </span>
            </span>
            <span className="text-xs">
              {m.enabled ? "Monitoring enabled" : "Not monitored"} ·{" "}
              {people.find((p) => p.id === m.primary_user_id)?.full_name ||
                "No owner"}
            </span>
          </button>
          {expanded === m.id && (
            <div className="mt-4 space-y-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={m.enabled}
                  onChange={(e) => patch(m.id, { enabled: e.target.checked })}
                />
                Monitor this mailbox
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-sm">
                  Default department
                  <select
                    aria-label="Default voicemail department"
                    className="mt-1 block w-full rounded border p-2"
                    value={m.default_department || ""}
                    onChange={(e) =>
                      patch(m.id, {
                        default_department: e.target.value || null,
                      })
                    }
                  >
                    <option value="">Choose department</option>
                    {departments.map((d) => (
                      <option key={d} value={d}>
                        {d === "service"
                          ? "Service / Support"
                          : d[0].toUpperCase() + d.slice(1)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  Primary owner
                  <select
                    aria-label="Primary voicemail owner"
                    className="mt-1 block w-full rounded border p-2"
                    value={m.primary_user_id || ""}
                    onChange={(e) => {
                      const id = e.target.value;
                      patch(m.id, {
                        primary_user_id: id || null,
                        recipients: id
                          ? [
                              ...m.recipients.filter((r) => r.user_id !== id),
                              {
                                user_id: id,
                                recipient_role: "responsible",
                                email_enabled:
                                  m.recipients.find((r) => r.user_id === id)
                                    ?.email_enabled ?? false,
                              },
                            ]
                          : m.recipients,
                      });
                    }}
                  >
                    <option value="">Choose employee</option>
                    {people.map((p) => (
                      <option
                        key={p.id}
                        value={p.id}
                        disabled={!p.my_job_view_enabled}
                      >
                        {p.full_name || p.email}
                        {!p.my_job_view_enabled
                          ? " (enable MJV access first)"
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  Backup alert after (minutes)
                  <input
                    aria-label="Backup alert delay"
                    type="number"
                    min={5}
                    max={10080}
                    className="mt-1 block w-full rounded border p-2"
                    value={m.escalation_minutes}
                    onChange={(e) =>
                      patch(m.id, {
                        escalation_minutes: Number(e.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <p className="text-xs text-gray-500">
                The mailbox determines the default department. AI topic
                suggestions are retained for review. Backup alerts stop when
                follow-up is in progress or a service request is linked.
              </p>
              <div className="space-y-2">
                <h6 className="text-sm font-semibold">
                  Recipients and email alerts
                </h6>
                {people.map((p) => {
                  const r = m.recipients.find((r) => r.user_id === p.id);
                  return (
                    <div
                      key={p.id}
                      className="flex flex-wrap items-center gap-3 rounded bg-gray-50 p-2 text-sm"
                    >
                      <span className="min-w-0 flex-1 break-words">
                        {p.full_name || p.email}
                        <span className="block text-xs text-gray-500">
                          {p.email}
                        </span>
                      </span>
                      <label className="text-xs">
                        Receive in Flow
                        <select
                          aria-label={`Voicemail role for ${p.full_name || p.email}`}
                          value={r?.recipient_role || ""}
                          disabled={
                            !p.my_job_view_enabled || m.primary_user_id === p.id
                          }
                          onChange={(e) =>
                            recipient(
                              m,
                              p.id,
                              (e.target.value as Recipient["recipient_role"]) ||
                                null,
                            )
                          }
                          className="ml-2 rounded border p-2"
                        >
                          <option value="">No alerts</option>
                          <option value="responsible">Responsible</option>
                          <option value="backup">Backup</option>
                        </select>
                      </label>
                      <label className="flex items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          aria-label={`Email voicemail alerts to ${p.email}`}
                          disabled={!r}
                          checked={r?.email_enabled ?? false}
                          onChange={(e) =>
                            patch(m.id, {
                              recipients: m.recipients.map((x) =>
                                x.user_id === p.id
                                  ? { ...x, email_enabled: e.target.checked }
                                  : x,
                              ),
                            })
                          }
                        />
                        Email
                      </label>
                    </div>
                  );
                })}
              </div>
              {m.enabled && (
                <button
                  type="button"
                  disabled={!!busy}
                  className="mr-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
                  onClick={() => {
                    setBusy(m.id);
                    setError("");
                    void invoke("ringcentral-mailbox-mapping", "POST", {
                      action: "scan",
                      mailboxId: m.id,
                    })
                      .then((result) =>
                        setNotice(
                          `${result.queued} earlier voicemails queued for processing. Existing imports were preserved.`,
                        ),
                      )
                      .catch((cause) => setError(cause.message))
                      .finally(() => setBusy(null));
                  }}
                >
                  Import last 14 days
                </button>
              )}
              <button
                type="button"
                disabled={!!busy}
                onClick={() => void save(m)}
                className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy === m.id ? "Saving…" : "Save mapping"}
              </button>
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
