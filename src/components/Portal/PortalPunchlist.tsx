import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import { SupportPhotos } from "../Shared/SupportPhotos";

interface Item {
  id: string;
  description: string;
  status: string;
  progress: string;
  source: string;
  requested: boolean;
  photos: string[];
  legacy_photos?: string[];
}
interface Project {
  id: string;
  name: string;
  number: string;
  end_date: string;
  days_remaining: number;
  can_submit: boolean;
  tasks: Item[];
}
interface Service {
  id: string;
  description: string;
  status: string;
  created_at: string;
  photos: string[];
}
interface Support {
  organization_id: string;
  vip_service_access: boolean;
  projects: Project[];
  requests: Service[];
  legacy_items: Array<{ id: string; description: string; status: string }>;
}
const statusLabel = (value: string) =>
  ({
    open: "Open",
    pending: "Open",
    partial: "In progress",
    blocked: "Needs follow-up",
    completed: "Completed",
    cancelled: "Cancelled",
    requested: "Requested",
    scheduled: "Scheduled",
    closed: "Closed",
    in_progress: "In progress",
    needs_more_info: "More information needed",
  })[value] || value;
const dateLabel = (value: string) =>
  new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString();

function ProjectScopeNotice() {
  return <p className="text-sm text-gray-600 leading-relaxed">
    <strong>For your existing project only.</strong> Project Punchlist is for completing and fine-tuning the work included in your agreed project scope. New equipment, upgrades, and other additions are not included. For additional work, <a href="/portal?tab=messages" className="text-blue-700 underline">send us a message</a> or contact your sales representative.
  </p>;
}

export function PortalPunchlist({
  previewContactId,
  isEmbedded = false,
  initialView = "projects",
}: {
  previewContactId?: string;
  isEmbedded?: boolean;
  initialView?: "projects" | "service";
} = {}) {
  const { profile, user } = useAuth();
  const contactId =
    previewContactId ||
    new URLSearchParams(window.location.search).get("contact") ||
    localStorage.getItem("admin_impersonating_contact") ||
    profile?.contact_id ||
    user?.app_metadata?.contact_id;
  const preview = !!(
    previewContactId ||
    new URLSearchParams(window.location.search).get("contact") ||
    localStorage.getItem("admin_impersonating_contact")
  );
  const [data, setData] = useState<Support | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"projects" | "service">(
    new URLSearchParams(window.location.search).get("tab") ===
      "service-requests"
      ? "service"
      : initialView,
  );
  const [projectId, setProjectId] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const generation = useRef(0);
  const writing = useRef(false);
  const submission = useRef(crypto.randomUUID());
  const visitSubmission = useRef(crypto.randomUUID());
  const uploaded = useRef<string[]>([]);
  const load = useCallback(async () => {
    const version = ++generation.current;
    if (!contactId) {
      setError("Open your customer portal access link to continue.");
      setLoading(false);
      return;
    }
    const { data: result, error: failure } = await supabase.rpc(
      "get_customer_support",
      { p_contact_id: contactId },
    );
    if (version !== generation.current) return;
    if (failure) setError(failure.message);
    else {
      setData(result);
      setError("");
      setProjectId((previous) =>
        result.projects.some((p: Project) => p.id === previous)
          ? previous
          : result.projects[0]?.id || "",
      );
    }
    setLoading(false);
  }, [contactId]);
  useEffect(() => {
    setData(null);
    setLoading(true);
    void load();
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    const timer = window.setInterval(refresh, 30000);
    return () => {
      window.clearInterval(timer);
      generation.current++;
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [load]);
  useEffect(() => {
    if (!description && !files.length) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [description, files.length]);
  const project = data?.projects.find((p) => p.id === projectId);
  useEffect(() => {
    setSelected([]);
    visitSubmission.current = crypto.randomUUID();
  }, [projectId]);
  async function uploadPhotos() {
    if (!data) return [];
    for (let i = uploaded.current.length; i < files.length; i++) {
      const file = files[i];
      const extension =
        file.type === "image/png"
          ? "png"
          : file.type === "image/webp"
            ? "webp"
            : "jpg";
      const path = `${data.organization_id}/${contactId}/${submission.current}/${i}.${extension}`;
      const { error: failure } = await supabase.storage
        .from("portal-support")
        .upload(path, file, { upsert: false });
      if (failure && !/already exists|duplicate/i.test(failure.message))
        throw failure;
      uploaded.current.push(path);
    }
    return uploaded.current;
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (writing.current || preview) return;
    writing.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const photos = await uploadPhotos();
      const { error: failure } =
        view === "projects"
          ? await supabase.rpc("submit_project_punchlist_item", {
              p_project_id: projectId,
              p_description: description,
              p_submission_id: submission.current,
              p_photos: photos,
            })
          : await supabase.rpc("submit_vip_service_request", {
              p_contact_id: contactId,
              p_description: description,
              p_address: address,
              p_submission_id: submission.current,
              p_photos: photos,
            });
      if (failure) throw failure;
      setDescription("");
      setFiles([]);
      uploaded.current = [];
      submission.current = crypto.randomUUID();
      setMessage(
        view === "projects"
          ? "Item added. Select items and request a visit when ready."
          : "Service request submitted. Our team will contact you to arrange service.",
      );
      await load();
    } catch (failure) {
      setError(
        (failure as { message?: string }).message ||
          "Your submission could not be saved. Please retry.",
      );
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }
  async function requestVisit() {
    if (writing.current || !selected.length || preview) return;
    writing.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { error: failure } = await supabase.rpc(
        "request_project_punchlist_visit",
        {
          p_project_id: projectId,
          p_task_ids: selected,
          p_submission_id: visitSubmission.current,
        },
      );
      if (failure) throw failure;
      setSelected([]);
      visitSubmission.current = crypto.randomUUID();
      setMessage("Visit requested. Our team will arrange scheduling.");
      await load();
    } catch (failure) {
      setError(
        (failure as { message?: string }).message ||
          "The visit could not be requested.",
      );
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }
  function changeView(next: "projects" | "service") {
    if (description || files.length) {
      if (!window.confirm("Discard this unsent draft?")) return;
    }
    setView(next);
    setDescription("");
    setFiles([]);
    uploaded.current = [];
    submission.current = crypto.randomUUID();
    setMessage("");
  }
  const content = (
    <section
      aria-label="Punchlist and Service Requests"
      className="space-y-4 rounded-2xl bg-gray-50 p-4 sm:p-6 text-gray-900"
    >
      <div>
        <h1 className="text-xl font-bold">Punchlist & Service Requests</h1>
        <p className="text-sm text-gray-600">
          Project adjustments and ongoing VIP support.
        </p>
      </div>
      {preview && (
        <p className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm">
          Customer preview — submissions are disabled.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          disabled={busy}
          onClick={() => changeView("projects")}
          aria-pressed={view === "projects"}
          className={`min-h-11 rounded-xl px-4 border ${view === "projects" ? "bg-blue-600 text-white" : "bg-white"}`}
        >
          Project Punchlist
        </button>
        <button
          disabled={busy}
          onClick={() => changeView("service")}
          aria-pressed={view === "service"}
          className={`min-h-11 rounded-xl px-4 border ${view === "service" ? "bg-blue-600 text-white" : "bg-white"}`}
        >
          Service Requests
        </button>
        <button
          disabled={busy}
          onClick={() => void load()}
          className="min-h-11 px-3 underline"
        >
          Refresh
        </button>
      </div>
      {loading && <p>Loading your items…</p>}
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 text-red-700 p-3">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="rounded-xl bg-green-50 text-green-800 p-3">
          {message}
        </p>
      )}
      {data && view === "projects" && (
        <>
          <p className="text-sm text-gray-600">
            Add project items from substantial completion through the end of
            Test & Tune. Afterward, you can still track shared items until they
            are resolved.
          </p>
          {!!data.projects.length && (
            <label className="block font-medium">
              Project
              <select
                disabled={busy}
                value={projectId}
                onChange={(event) => {
                  if (description || files.length) {
                    if (!window.confirm("Discard this unsent draft?")) return;
                  }
                  setProjectId(event.target.value);
                  setDescription("");
                  setFiles([]);
                  uploaded.current = [];
                  submission.current = crypto.randomUUID();
                }}
                className="block w-full min-h-11 border rounded-xl p-3 mt-1 bg-white"
              >
                {data.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.number} · {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!data.projects.length && (
            <p className="bg-white rounded-xl border p-4">
              Your project punchlist becomes available at substantial
              completion.
            </p>
          )}
          {project && (
            <>
              <aside aria-label="Test & Tune access" className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-2 text-sm">
                <h2 className="font-semibold text-base text-gray-900">{project.can_submit
                  ? `Test & Tune · ${project.days_remaining === 0 ? 'Ends today' : `${project.days_remaining} day${project.days_remaining === 1 ? '' : 's'} remaining`}`
                  : project.days_remaining > 0 ? 'Project Punchlist · Submissions paused' : 'Test & Tune · Ended'}</h2>
                <p>{project.can_submit
                  ? `Your included project punchlist access is active through ${dateLabel(project.end_date)}. Add items and request a visit while this period is active.`
                  : project.days_remaining > 0 ? 'View-only. New submissions are paused. You can still track your shared items.'
                  : `View-only. Your included Test & Tune period ended ${dateLabel(project.end_date)}.`}</p>
                <ProjectScopeNotice />
                <p><strong>What happens afterward?</strong> This project punchlist becomes view-only. Unfinished items remain for our team to resolve.</p>
                <p>{data.vip_service_access
                  ? 'Your active VIP plan lets you submit new general service requests online. Plan benefits determine any service charges.'
                  : 'An active paid or complimentary VIP plan enables new general service requests online. Your shared project items remain viewable either way.'}</p>
                <button type="button" disabled={busy} onClick={() => changeView('service')} className="min-h-11 text-blue-700 underline">{data.vip_service_access ? 'Open VIP Service Requests' : 'View Service Request Access'}</button>
              </aside>
              <div className="space-y-3">
                {project.tasks.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-xl border bg-white p-4 space-y-2"
                  >
                    <div className="flex gap-3 items-start">
                      {project.can_submit &&
                        !preview &&
                        item.status === "open" &&
                        !item.requested && (
                          <input
                            type="checkbox"
                            disabled={busy}
                            aria-label={`Request visit for ${item.description}`}
                            checked={selected.includes(item.id)}
                            onChange={(e) => {
                              setSelected((current) =>
                                e.target.checked
                                  ? [...current, item.id]
                                  : current.filter((id) => id !== item.id),
                              );
                              visitSubmission.current = crypto.randomUUID();
                            }}
                            className="w-5 h-5 mt-1 shrink-0"
                          />
                        )}
                      <p className="whitespace-pre-wrap break-words flex-1">
                        {item.description}
                      </p>
                    </div>
                    <p className="text-sm text-gray-600">
                      {statusLabel(
                        item.status === "open" ? item.progress : item.status,
                      )}
                      {item.requested && " · Visit requested"} ·{" "}
                      {item.source === "customer"
                        ? "Added by you"
                        : "Shared by our team"}
                    </p>
                    <SupportPhotos paths={item.photos} />
                    {item.legacy_photos
                      ?.filter((url) => /^https:\/\//i.test(url))
                      .map((url, index) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <img
                            src={url}
                            alt={`Earlier customer photo ${index + 1}`}
                            className="inline-block w-20 h-20 object-cover rounded-lg mr-2"
                          />
                        </a>
                      ))}
                  </article>
                ))}
              </div>
              {!project.tasks.length && (
                <p className="text-sm text-gray-600">
                  No shared punchlist items yet.
                </p>
              )}
              {project.can_submit && !preview && (
                <button
                  disabled={busy || !selected.length}
                  onClick={() => void requestVisit()}
                  className="min-h-11 rounded-xl bg-blue-600 text-white px-4 disabled:opacity-50"
                >
                  Request visit ({selected.length})
                </button>
              )}
            </>
          )}
          {!!data.legacy_items.length && (
            <details className="rounded-xl border bg-white p-4">
              <summary className="min-h-11 cursor-pointer font-medium">
                Earlier customer items ({data.legacy_items.length})
              </summary>
              <p className="text-sm text-gray-600 mb-3">
                These items are preserved for our team to review and resolve.
              </p>
              {data.legacy_items.map((item) => (
                <p
                  key={item.id}
                  className="whitespace-pre-wrap break-words border-t py-3"
                >
                  {item.description}
                  <span className="block text-sm text-gray-600">
                    {statusLabel(item.status)}
                  </span>
                </p>
              ))}
            </details>
          )}
        </>
      )}
      {data && view === "service" && (
        <>
          <p className="text-sm text-gray-600">
            Ongoing service outside your project punchlist. An active paid or
            complimentary VIP plan lets you submit online. Included work,
            discounts, and charges follow your plan benefits.
          </p>
          {!data.vip_service_access && (
            <p className="rounded-xl bg-blue-50 p-4">
              An active paid or complimentary VIP plan is required for new
              online service requests. Your previous requests remain available
              below.
            </p>
          )}
          <div className="space-y-3">
            {data.requests.map((request) => (
              <article
                key={request.id}
                className="rounded-xl border bg-white p-4 space-y-2"
              >
                <p className="text-sm text-gray-600">
                  {dateLabel(request.created_at)} ·{" "}
                  {statusLabel(request.status)}
                </p>
                <p className="whitespace-pre-wrap break-words">
                  {request.description}
                </p>
                <SupportPhotos paths={request.photos} />
              </article>
            ))}
          </div>
          {!data.requests.length && (
            <p className="text-sm text-gray-600">
              No online service requests yet.
            </p>
          )}
        </>
      )}
      {data &&
        !preview &&
        ((view === "projects" && project?.can_submit) ||
          (view === "service" && data.vip_service_access)) && (
          <form
            onSubmit={submit}
            className="rounded-xl border bg-white p-4 space-y-3"
          >
            <h2 className="font-semibold">
              {view === "projects" ? "Add Punchlist Item" : "Request Service"}
            </h2>
            {view === "projects" && <ProjectScopeNotice />}
            <label className="block text-sm">
              {view === "projects"
                ? "What needs attention?"
                : "Describe the issues you want us to address"}
              <textarea
                required
                maxLength={view === "projects" ? 10000 : 20000}
                disabled={busy}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                className="block w-full mt-1 rounded-lg border p-3 text-base"
              />
            </label>
            {view === "service" && (
              <label className="block text-sm">
                Service address
                <input
                  required
                  maxLength={1000}
                  disabled={busy}
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  className="block w-full mt-1 rounded-lg border p-3 text-base"
                />
              </label>
            )}
            <label className="block text-sm">
              Photos (optional, up to 10)
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                disabled={busy || uploaded.current.length > 0}
                onChange={(event) => {
                  const next = Array.from(event.target.files || []);
                  if (
                    next.length > 10 ||
                    next.some(
                      (f) =>
                        f.size > 10485760 ||
                        !["image/jpeg", "image/png", "image/webp"].includes(
                          f.type,
                        ),
                    )
                  ) {
                    setError(
                      "Choose up to 10 JPG, PNG, or WebP photos, each under 10 MB.",
                    );
                    return;
                  }
                  setFiles(next);
                }}
                className="block w-full mt-2 text-base"
              />
            </label>
            {!!files.length && (
              <p className="text-sm text-gray-600">
                {files.length} photo{files.length === 1 ? "" : "s"} selected
              </p>
            )}
            <button
              disabled={busy || !description.trim()}
              type="submit"
              className="min-h-11 rounded-xl bg-blue-600 text-white px-5 disabled:opacity-50"
            >
              {busy
                ? "Saving…"
                : view === "projects"
                  ? "Add Item"
                  : "Submit Service Request"}
            </button>
          </form>
        )}
    </section>
  );
  return isEmbedded || previewContactId ? (
    content
  ) : (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        <a
          href="/portal"
          className="inline-block min-h-11 text-blue-700 underline"
        >
          Back to Portal
        </a>
        {content}
      </div>
    </main>
  );
}
