import React, { useEffect, useState } from "react";
import { Trash2, FileText, Download, ExternalLink, Paperclip } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { responseReasons, lostReviewAction } from "./lostReview";
import { printLostReview } from "./printLostReview";
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
    filter === "all" ||
    filter === "needs_review" && !!v.responded_at && !v.reviewed_at ||
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
              <option value="needs_review">Needs Review</option>
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
      {loading
        ? <p className="text-gray-400">Loading…</p>
        : visible.length === 0
        ? (
          <p className="text-gray-400">
            No lost opportunity reviews match this filter.
          </p>
        )
        : visible.map((v) => (
          <article
            key={v.request_id}
            className="rounded-lg border border-gray-700 bg-gray-800 p-3 space-y-2"
          >
            <div className="flex flex-col items-start gap-2">
              <div className="w-full min-w-0">
                {v.response ? (
                  <button type="button"
                    aria-expanded={expandedReview === v.request_id}
                    aria-controls={`lost-response-${v.request_id}`}
                    onClick={() => setExpandedReview(expandedReview === v.request_id ? null : v.request_id)}
                    className="text-left w-full rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500">
                    <span className="block text-white font-semibold">{v.opportunity_name}</span>
                    <span className="block text-gray-400 text-sm">{v.recipient} <span className="text-cyan-300 ml-2">{expandedReview === v.request_id ? "Hide answers ↑" : "View answers →"}</span></span>
                  </button>
                ) : (
                  <>
                    <h3 className="text-white font-semibold">{v.opportunity_name}</h3>
                    <p className="text-gray-400 text-sm">{v.recipient}</p>
                  </>
                )}
              </div>
              <div className="w-full min-w-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <p className="text-cyan-300">
                  {v.responded_at
                    ? (v.reviewed_at ? "Reviewed" : "Needs Review")
                    : v.delivery_status === "failed"
                    ? "Delivery Failed"
                    : v.delivery_status === "pending"
                    ? "Delivery Pending"
                    : "Awaiting Response"}
                </p>
                <HistoryLine v={v} />
                {canView && !!v.response?.attachments.length && (
                  <span className="inline-flex items-center gap-1 text-gray-300">
                    <Paperclip size={14} aria-hidden="true" />
                    {v.response.attachments.length} {v.response.attachments.length === 1 ? "attachment" : "attachments"}
                  </span>
                )}
                {canView && v.response && (
                  <button type="button"
                    onClick={() => {
                      try { printLostReview(v, companySettings?.company_name || "Customer Feedback"); }
                      catch (e) { setError(e instanceof Error ? e.message : "Unable to open printable review."); }
                    }}
                    className="text-cyan-300 hover:underline whitespace-nowrap">
                    Print / Save PDF
                  </button>
                )}
                {canView && (
                  <button
                    type="button"
                    disabled={busy}
                    aria-label="Delete lost opportunity review"
                    title="Delete review"
                    onClick={async () => {
                      if (
                        !window.confirm(
                          "Delete this lost opportunity review? This permanently removes the request, any customer response, and uploaded bid files. This cannot be undone.",
                        )
                      ) return;
                      if (await action({ action: "delete", request_id: v.request_id })) {
                        setNotice("Lost opportunity review deleted.");
                      }
                    }}
                    className="text-red-400 hover:text-red-300 disabled:opacity-50"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
            {v.response && expandedReview === v.request_id
              ? (
                <div id={`lost-response-${v.request_id}`} className="border-t border-gray-700 pt-3 space-y-3 text-gray-200">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-400">Reasons</h4>
                    <p className="mt-1">{v.response.reasons.map((r) =>
                      responseReasons.find(([key]) => key === r)?.[1] || r
                    ).join(" • ") || "Comment only"}</p>
                  </div>
                  {v.response.message && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-400">Customer comments</h4>
                      <p className="mt-1 whitespace-pre-wrap break-words">{v.response.message}</p>
                    </div>
                  )}
                  <div>
                    <h4 className="text-sm font-semibold text-gray-400">Is there still a chance to earn your business?</h4>
                    <p className="mt-1 text-cyan-300">
                      {({ yes: "Yes", maybe: "Maybe", no: "No" } as Record<string, string>)[v.response.recoverable] || v.response.recoverable}
                    </p>
                  </div>
                  {v.response.recovery_message && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-400">What would it take to earn your business?</h4>
                      <p className="mt-1 whitespace-pre-wrap break-words">{v.response.recovery_message}</p>
                    </div>
                  )}
                  {!!v.response.attachments.length && (
                    <section aria-label="Attachments" className="space-y-2">
                      <h4 className="text-sm font-semibold text-gray-400">Attachments</h4>
                      {v.response.attachments.map((a) => (
                        <div key={a.path} className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-600 bg-gray-900/40 p-3">
                          <FileText size={20} className="shrink-0 text-cyan-300" aria-hidden="true" />
                          <span className="min-w-0 flex-1 basis-[calc(100%-32px)] sm:basis-auto break-words text-sm">
                            {a.name}
                            <span className="block text-xs text-gray-400">{a.name.toLowerCase().endsWith(".pdf") ? "PDF document" : "Image attachment"}</span>
                          </span>
                          <div className="flex w-full sm:w-auto items-center gap-3 pl-8 sm:pl-0">
                          <button type="button" disabled={busy}
                            aria-label={`View ${a.name}`}
                            onClick={() => openAttachment(v, a, false)}
                            className="min-h-11 inline-flex items-center gap-1 text-sm text-cyan-300 hover:underline disabled:opacity-50">
                            <ExternalLink size={14} aria-hidden="true" /> View
                          </button>
                          <button type="button" disabled={busy}
                            aria-label={`Download ${a.name}`}
                            onClick={() => openAttachment(v, a, true)}
                            className="min-h-11 inline-flex items-center gap-1 text-sm text-cyan-300 hover:underline disabled:opacity-50">
                            <Download size={14} aria-hidden="true" /> Download
                          </button>
                          </div>
                        </div>
                      ))}
                    </section>
                  )}
                </div>
              )
              : v.responded_at && !v.response
              ? (
                <p className="text-gray-400 text-sm">
                  Private — viewing this response requires the View Lost
                  Opportunity Submissions permission.
                </p>
              )
              : null}
            {canView && v.response && expandedReview === v.request_id && (
              <div className="flex flex-wrap gap-3 items-center">
                {v.response && !v.reviewed_at && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      action({ action: "review", request_id: v.request_id })}
                    className="bg-gray-700 text-white rounded-lg px-3 py-2"
                  >
                    Mark Reviewed
                  </button>
                )}
                {v.response && (
                  <label className="w-full sm:w-auto text-gray-300">
                    Follow-up status<select
                      disabled={busy}
                      value={v.recovery_outcome}
                      onChange={(e) =>
                        action({
                          action: "outcome",
                          request_id: v.request_id,
                          outcome: e.target.value,
                        })}
                      className="block sm:inline-block w-full sm:w-auto mt-2 sm:mt-0 sm:ml-2 min-h-11 rounded-lg bg-gray-900 border border-gray-600 p-2"
                    >
                      <option value="unreviewed" disabled>Not started</option>
                      <option value="following_up">Following Up</option>
                      <option value="recovered">Recovered</option>
                      <option value="closed">Closed</option>
                    </select>
                  </label>
                )}
              </div>
            )}
          </article>
        ))}
    </section>
  );
}
