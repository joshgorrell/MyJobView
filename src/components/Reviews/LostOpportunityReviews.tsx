import AdminSalesReviewModal from "./AdminSalesReviewModal";
import React, { useEffect, useState } from "react";
import { Trash2, FileText, Download, ExternalLink, Paperclip } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { responseReasons, lostReviewAction } from "./lostReview";
import { printLostReview } from "./printLostReview";
import { bidFileFormat } from "../../../supabase/functions/lost-opportunity-review/bidFileTypes";
interface Contact {
  id: string;
  contact_name: string;
  company_name: string;
  email: string;
}
interface Proposal {
  id: string;
  title: string;
  proposal_number: string;
}
interface Response {
  reasons: string[];
  message: string;
  recoverable: string;
  recovery_message: string;
  attachments: { name: string; path: string }[];
}
interface Review {
  request_id: string;
  opportunity_name: string;
  title: string;
  delivery_status: string;
  responded_at: string | null;
  opened_at: string | null;
  reviewed_at: string | null;
  shared_at: string | null;
  recovery_outcome: string;
  response?: Response;
  recipient?: string;
  sent_at: string | null;
  sent_by_name: string | null;
  response_created_at: string | null;
}
export default function LostOpportunityReviews(
  { showCreate = false }: { showCreate?: boolean },
) {
  const { profile, companySettings } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [expandedReview, setExpandedReview] = useState<string | null>(null);
  const [adminReview, setAdminReview] = useState<Review | null>(null);
  const [filter, setFilter] = useState("all");
  const [creating, setCreating] = useState(showCreate);
  const [search, setSearch] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contact, setContact] = useState<Contact | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [proposal, setProposal] = useState("");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [titleEdited, setTitleEdited] = useState(false);
  const [preview, setPreview] = useState<
    { subject: string; recipient: string; html: string } | null
  >(null);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const canSend = profile?.can_send_lost_opportunity_reviews ?? false;
  const canView = profile?.can_view_lost_opportunity_submissions ?? false;
  const org = profile?.organization_id;
  async function load() {
    if (!org) return;
    setLoading(true);
    try {
      const [d, r, q] = await Promise.all([
        supabase.from("lost_review_details").select("*").eq(
          "organization_id",
          org,
        ).order("request_id"),
        canView
          ? supabase.from("lost_review_responses").select("*")
          : Promise.resolve({ data: [], error: null }),
        supabase.from("review_requests").select(
          "id,recipient_name,recipient_email,sent_at,sent_by",
        ).eq("request_type", "lost_opportunity").order("sent_at", {
          ascending: false,
        }),
      ]);
      for (const result of [d, r, q]) if (result.error) throw result.error;
      const senderIds = [...new Set(
        (q.data || []).map((req) => req.sent_by).filter(Boolean),
      )] as string[];
      const senders = senderIds.length
        ? await supabase.from("profiles").select("id,first_name,last_name")
            .in("id", senderIds)
        : { data: [], error: null };
      if (senders.error) throw senders.error;
      const senderMap = new Map(
        (senders.data || []).map((p) => [
          p.id,
          [p.first_name, p.last_name].filter(Boolean).join(" ") || "Unknown user",
        ]),
      );
      setReviews((q.data || []).flatMap((request) => {
        const detail = d.data?.find((v) => v.request_id === request.id);
        const response = r.data?.find((v) => v.request_id === request.id);
        return detail
          ? [{
            ...detail,
            response,
            recipient: request.recipient_name || request.recipient_email,
            sent_at: request.sent_at,
            sent_by_name: request.sent_by
              ? senderMap.get(request.sent_by) || "Unknown user"
              : null,
            response_created_at: response?.created_at || null,
          }]
          : [];
      }));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unable to load lost opportunity reviews.",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, [org, canView]);
  useEffect(() => {
    if (!search.trim() || contact) {
      setContacts([]);
      return;
    }
    let active = true;
    const timer = setTimeout(async () => {
      const safe = search.trim().replace(/[%_,()]/g, "");
      const { data, error } = await supabase.from("contacts").select(
        "id,contact_name,company_name,email",
      ).eq("organization_id", org).or(
        `contact_name.ilike.%${safe}%,company_name.ilike.%${safe}%`,
      ).limit(20);
      if (active) {
        if (error) setError(error.message);
        else setContacts(data || []);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, contact, org]);
  useEffect(() => {
    setProposal("");
    setProposals([]);
    setName("");
    if (!titleEdited) setTitle("");
    if (!contact) return;
    let active = true;
    supabase.from("proposals").select("id,title,proposal_number").eq(
      "contact_id",
      contact.id,
    ).eq("organization_id", org).order("created_at", { ascending: false }).then(
      ({ data, error }) => {
        if (active) {
          if (error) setError(error.message);
          else setProposals(data || []);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [contact, org]);
  async function openResponse(review: Review) {
    if (expandedReview === review.request_id) {
      setExpandedReview(null);
      return;
    }
    setExpandedReview(review.request_id);
    await markViewed(review);
  }
  async function markViewed(review: Review) {
    if (review.reviewed_at) return;
    setBusy(true);
    setError("");
    try {
      const data = await lostReviewAction({ action: "review", request_id: review.request_id });
      if (!data?.reviewed_at) throw new Error("Unable to mark this response Complete. Reopen it to retry.");
      setReviews(current => current.map(item => item.request_id === review.request_id
        ? { ...item, reviewed_at: data.reviewed_at } : item));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to mark this response Complete. Reopen it to retry.");
    } finally {
      setBusy(false);
    }
  }
  async function action(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await lostReviewAction(body);
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to complete action.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function openAttachment(review: Review, attachment: Response["attachments"][number], download: boolean) {
    const viewer = download ? null : window.open("", "_blank");
    if (!download && !viewer) {
      setError("Allow pop-ups to view this attachment.");
      return;
    }
    if (viewer) viewer.opener = null;
    setBusy(true);
    setError("");
    try {
      const data = await lostReviewAction({
        action: "download", request_id: review.request_id, path: attachment.path,
      });
      if (download) {
        const result = await fetch(data.url);
        if (!result.ok) throw new Error("Unable to download attachment.");
        const url = URL.createObjectURL(await result.blob());
        const link = document.createElement("a");
        link.href = url;
        link.download = attachment.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else if (viewer) {
        viewer.location.replace(data.url);
      }
    } catch (e) {
      viewer?.close();
      setError(e instanceof Error ? e.message : "Unable to open attachment.");
    } finally {
      setBusy(false);
    }
  }
  function opportunity(value: string) {
    setName(value);
    if (!titleEdited) setTitle(value ? `Why didn’t we win your ${value}?` : "");
  }
  async function previewEmail() {
    setPreviewing(true);
    setError("");
    try {
      setPreview(
        await lostReviewAction({
          action: "preview",
          contact_id: contact?.id,
          proposal_id: proposal || null,
          opportunity_name: name || title,
          title,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to preview email.");
    } finally {
      setPreviewing(false);
    }
  }
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (
      await action({
        action: "create",
        contact_id: contact?.id,
        proposal_id: proposal || null,
        opportunity_name: name || title,
        title,
      })
    ) {
      setCreating(false);
      setContact(null);
      setSearch("");
      setName("");
      setTitle("");
      setTitleEdited(false);
      setNotice("Lost Opportunity review request sent.");
    }
  }
  const visible = reviews.filter((v) =>
    filter === "all" || v.request_id === expandedReview ||
    filter === "new" && !!v.responded_at && !v.reviewed_at ||
    filter === "awaiting" && !v.responded_at ||
    filter === "complete" && !!v.reviewed_at ||
    filter === "winnable" &&
      ["yes", "maybe"].includes(v.response?.recoverable || "") ||
    filter === "bids" && !!v.response?.attachments.length
  );
  const input =
    "block w-full rounded-lg border border-gray-600 bg-gray-900 text-gray-100 p-3 mt-2";
  function formatDateTime(iso: string | null): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  function HistoryLine({ v }: { v: Review }) {
    const segments: string[] = [];
    if (v.sent_at) {
      const sender = v.sent_by_name ? `Sent by ${v.sent_by_name}` : "Sent";
      segments.push(`${sender} \u00b7 ${formatDateTime(v.sent_at)}`);
    }
    if (v.delivery_status === "sent" && v.sent_at) {
      segments.push("Delivered");
    }
    if (v.opened_at) {
      segments.push(`Form opened \u00b7 ${formatDateTime(v.opened_at)}`);
    }
    if (v.response_created_at || v.responded_at) {
      segments.push(
        `Customer responded \u00b7 ${formatDateTime(v.response_created_at || v.responded_at)}`,
      );
    }
    if (v.reviewed_at) {
      segments.push(`Reviewed \u00b7 ${formatDateTime(v.reviewed_at)}`);
    }
    if (v.shared_at) {
      segments.push(`Shared \u00b7 ${formatDateTime(v.shared_at)}`);
    }
    if (segments.length === 0) return null;
    return (
      <p className="text-xs text-gray-400 leading-relaxed">
        {segments.join("  \u2022  ")}
      </p>
    );
  }
  return (
    <section className="min-w-0 space-y-5 [overflow-wrap:anywhere]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Lost Opportunity Reviews
          </h2>
          <p className="text-gray-400 text-sm mt-0.5">
            Learn why we lost and earn another chance. Customer feedback is
            visible only to users with submission viewing permission.
          </p>
        </div>
        <div className="flex w-full sm:w-auto flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <label className="flex min-w-0 items-center gap-2 text-gray-300 text-sm">
            Filter
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="min-h-11 min-w-0 flex-1 rounded-lg bg-gray-800 border border-gray-600 p-2 text-base sm:text-sm"
            >
              <option value="all">All</option>
              <option value="awaiting">Awaiting Response</option>
              <option value="new">NEW!</option>
              <option value="complete">Complete</option>
              <option value="winnable">Still Winnable</option>
              <option value="bids">Competing Bid Uploaded</option>
            </select>
          </label>
          <button
            disabled={!canSend}
            onClick={() => setCreating(!creating)}
            className="min-h-11 bg-cyan-700 text-white rounded-lg px-4 py-2 text-sm"
          >
            {creating ? "Cancel" : "Create Review Request"}
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="p-3 rounded-lg bg-red-950 text-red-200">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="p-3 rounded-lg bg-green-950 text-green-200">
          {notice}
        </p>
      )}
      {creating && canSend && (
        <form
          onSubmit={send}
          className="bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-4 max-w-3xl"
        >
          <label className="block text-gray-200">
            Customer (required)<input
              value={contact
                ? contact.contact_name || contact.company_name
                : search}
              onChange={(e) => {
                setContact(null);
                setSearch(e.target.value);
              }}
              placeholder="Search customers"
              className={input}
            />
          </label>
          {contacts.length > 0 && (
            <div className="max-h-56 overflow-auto border border-gray-600 rounded-lg">
              {contacts.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => {
                    setContact(c);
                    setContacts([]);
                  }}
                  className="block text-left w-full p-3 text-gray-200 hover:bg-gray-700"
                >
                  {c.contact_name || c.company_name}
                  <span className="text-gray-400 text-sm ml-2">
                    {c.email || "No email address"}
                  </span>
                </button>
              ))}
            </div>
          )}
          {contact && (
            <p className="text-gray-400 text-sm">
              Send to: {contact.email ||
                "Add an email address to this customer before sending."}
            </p>
          )}
          <label className="block text-gray-200">
            Proposal (optional)<select
              value={proposal}
              disabled={!contact}
              onChange={(e) => {
                setProposal(e.target.value);
                const selected = proposals.find((p) => p.id === e.target.value);
                if (selected) opportunity(selected.title);
                else opportunity("");
              }}
              className={input}
            >
              <option value="">No MJV proposal / external proposal</option>
              {proposals.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.proposal_number} — {p.title}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-gray-200">
            Review Title / Email Subject<input
              required
              maxLength={300}
              value={title}
              onChange={(e) => {
                setTitleEdited(true);
                setTitle(e.target.value);
              }}
              className={input}
            />
          </label>
          <p className="text-sm text-gray-400">
            Use Preview Email to see the personalized message before sending.
          </p>
          <button
            type="button"
            disabled={busy || previewing || !canSend || !contact?.email ||
              !title.trim()}
            onClick={previewEmail}
            className="w-full sm:w-auto rounded-lg border border-cyan-600 px-5 py-3 text-cyan-200 disabled:opacity-50"
          >
            {previewing ? "Loading Preview…" : "Preview Email"}
          </button>
          <button
            disabled={busy || !canSend || !contact?.email || !title.trim()}
            className="w-full sm:w-auto rounded-lg bg-cyan-700 px-5 py-3 text-white disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send Lost Opportunity Review"}
          </button>
        </form>
      )}
      {preview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="lost-email-preview-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="w-full max-w-3xl rounded-xl bg-gray-800 border border-gray-600 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 flex justify-between gap-4">
              <div>
                <h3
                  id="lost-email-preview-title"
                  className="text-lg font-bold text-white"
                >
                  Email Preview
                </h3>
                <p className="text-gray-300 text-sm">To: {preview.recipient}</p>
                <p className="text-gray-300 text-sm">
                  Subject: {preview.subject}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="text-gray-200 self-start"
              >
                Close
              </button>
            </div>
            <iframe
              title="Lost Opportunity email preview"
              sandbox=""
              srcDoc={preview.html}
              className="w-full h-[70vh] bg-white"
            />
            <p className="p-3 text-sm text-gray-400">
              Preview only. No email has been sent.
            </p>
          </div>
        </div>
      )}
      {adminReview && <AdminSalesReviewModal requestId={adminReview.request_id} customer={adminReview.recipient || "Customer"} onClose={() => setAdminReview(null)} />}
      {loading
        ? <p className="text-gray-400">Loading…</p>
        : visible.length === 0
        ? <p className="text-gray-400">No lost opportunity reviews match this filter.</p>
        : (
          <div className="space-y-3">
            {visible.map((v) => {
              const status = v.responded_at
                ? (v.reviewed_at ? "Complete" : "NEW!")
                : v.delivery_status === "failed"
                ? "Delivery Failed"
                : v.delivery_status === "pending"
                ? "Delivery Pending"
                : "Awaiting Response";
              const activityAt = v.response_created_at || v.responded_at || v.sent_at;
              return (
                <button
                  type="button"
                  key={v.request_id}
                  disabled={busy}
                  onClick={() => {
                    setExpandedReview(v.request_id);
                    if (v.response) void markViewed(v);
                  }}
                  className="w-full min-h-[108px] rounded-xl border border-gray-700 bg-gray-800 p-4 text-left transition hover:border-gray-600 hover:bg-gray-750 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:opacity-60"
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-semibold text-white">{v.recipient || "Customer"}</h3>
                      <p className="mt-0.5 truncate text-sm text-gray-400">{v.title || v.opportunity_name}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                      status === "NEW!" ? "bg-cyan-700 text-white" :
                      status === "Delivery Failed" ? "bg-red-950 text-red-200" :
                      "bg-gray-700 text-cyan-300"
                    }`}>{status}</span>
                  </div>
                  <div className="mt-3 flex min-w-0 items-center gap-3 text-xs text-gray-400">
                    <span className="truncate">
                      {v.responded_at ? "Customer responded" : "Sent"}{activityAt ? ` · ${formatDateTime(activityAt)}` : ""}
                    </span>
                    {canView && !!v.response?.attachments.length && (
                      <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-gray-300">
                        <Paperclip size={14} aria-hidden="true" />
                        {v.response.attachments.length}
                      </span>
                    )}
                    <span className="shrink-0 text-cyan-300" aria-hidden="true">›</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

      {expandedReview && (() => {
        const v = reviews.find((item) => item.request_id === expandedReview);
        if (!v) return null;
        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`lost-review-detail-${v.request_id}`}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
            onClick={() => setExpandedReview(null)}
          >
            <div
              className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-gray-700 bg-gray-800 p-5 sm:max-w-2xl sm:rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 border-b border-gray-700 pb-4">
                <div className="min-w-0">
                  <h3 id={`lost-review-detail-${v.request_id}`} className="text-xl font-semibold text-white">{v.recipient || "Customer"}</h3>
                  <p className="mt-1 text-sm text-gray-400">{v.title || v.opportunity_name}</p>
                </div>
                <button type="button" onClick={() => setExpandedReview(null)} className="min-h-11 shrink-0 px-2 text-sm text-gray-300">Close</button>
              </div>

              <div className="space-y-4 py-4">
                <HistoryLine v={v} />
                {v.responded_at && !v.response && (
                  <p className="text-sm text-gray-400">Private — viewing this response requires the View Lost Opportunity Submissions permission.</p>
                )}
                {v.response && (
                  <>
                    <div>
                      <h4 className="text-sm font-semibold text-gray-400">Reasons</h4>
                      <p className="mt-1 text-gray-200">{v.response.reasons.map((r) => responseReasons.find(([key]) => key === r)?.[1] || r).join(" • ") || "Comment only"}</p>
                    </div>
                    {v.response.message && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-400">Customer comments</h4>
                        <p className="mt-1 whitespace-pre-wrap break-words text-gray-200">{v.response.message}</p>
                      </div>
                    )}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-400">Is there still a chance to earn your business?</h4>
                      <p className="mt-1 text-cyan-300">{({ yes: "Yes", maybe: "Maybe", no: "No" } as Record<string, string>)[v.response.recoverable] || v.response.recoverable}</p>
                    </div>
                    {v.response.recovery_message && (
                      <div>
                        <h4 className="text-sm font-semibold text-gray-400">What would it take to earn your business?</h4>
                        <p className="mt-1 whitespace-pre-wrap break-words text-gray-200">{v.response.recovery_message}</p>
                      </div>
                    )}
                    {!!v.response.attachments.length && (
                      <section aria-label="Attachments" className="space-y-2">
                        <h4 className="text-sm font-semibold text-gray-400">Competing bid attachments ({v.response.attachments.length})</h4>
                        {v.response.attachments.map((a) => (
                          <div key={a.path} className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-600 bg-gray-900/40 p-3">
                            <FileText size={20} className="shrink-0 text-cyan-300" aria-hidden="true" />
                            <span className="min-w-0 flex-1 break-words text-sm text-gray-200">{a.name}<span className="block text-xs text-gray-400">{bidFileFormat(a.name)?.label || "File attachment"}</span></span>
                            <button type="button" disabled={busy} onClick={() => openAttachment(v, a, false)} className="min-h-11 inline-flex items-center gap-1 text-sm text-cyan-300"><ExternalLink size={14} /> View</button>
                            <button type="button" disabled={busy} onClick={() => openAttachment(v, a, true)} className="min-h-11 inline-flex items-center gap-1 text-sm text-cyan-300"><Download size={14} /> Download</button>
                          </div>
                        ))}
                      </section>
                    )}
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t border-gray-700 pt-4">
                {canView && profile?.role === "admin" && v.response && (
                  <button type="button" disabled={busy} onClick={() => setAdminReview(v)} className="min-h-11 rounded-lg border border-cyan-700 px-3 text-sm text-cyan-300">Admin Review</button>
                )}
                {canView && v.response && (
                  <button type="button" onClick={() => {
                    try { printLostReview(v, companySettings?.company_name || "Customer Feedback"); void markViewed(v); }
                    catch (e) { setError(e instanceof Error ? e.message : "Unable to open printable review."); }
                  }} className="min-h-11 rounded-lg border border-gray-600 px-3 text-sm text-cyan-300">Print / Save PDF</button>
                )}
                {canView && v.response && (
                  <label className="w-full text-sm text-gray-300 sm:ml-auto sm:w-auto">
                    Follow-up
                    <select disabled={busy} value={v.recovery_outcome} onChange={(e) => action({ action: "outcome", request_id: v.request_id, outcome: e.target.value })} className="ml-2 min-h-11 rounded-lg border border-gray-600 bg-gray-900 p-2">
                      <option value="unreviewed" disabled>Not started</option>
                      <option value="following_up">Following Up</option>
                      <option value="recovered">Recovered</option>
                      <option value="closed">Closed</option>
                    </select>
                  </label>
                )}
                {canView && (
                  <button
                    type="button"
                    disabled={busy}
                    aria-label="Delete lost opportunity review"
                    title="Delete review"
                    onClick={async () => {
                      if (!window.confirm("Delete this lost opportunity review? This permanently removes the request, any customer response, and uploaded bid files. This cannot be undone.")) return;
                      if (await action({ action: "delete", request_id: v.request_id })) {
                        setExpandedReview(null);
                        setNotice("Lost opportunity review deleted.");
                      }
                    }}
                    className="ml-auto min-h-11 px-2 text-red-400 hover:text-red-300 disabled:opacity-50"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </section>
  );
}
