import { needsPersonalFollowup } from "../../lib/lostOpportunityFollowup";
import {RecordLostFeedback} from './RecordLostFeedback';
import { requestConfirmation } from '../../lib/feedback';
import { FullEmailPreview } from "./FullEmailPreview";
import AdminSalesReviewModal from "./AdminSalesReviewModal";
import React, { useEffect, useState } from "react";
import { Trash2, FileText, Download, ExternalLink, Paperclip } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { responseReasons, lostReviewAction } from "./lostReview";
import { printLostReview } from "./printLostReview";
import { ReviewStatsRow, ReviewFilterBar, type StatItem, type FilterOption } from "./ReviewStats";
import { Send, TrendingUp, RotateCcw, AlertCircle, TrendingDown } from 'lucide-react';
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
  source?: string;
  recorded_by?: string;
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
  sender_variant?: string;
  follow_up_sent_at?: string|null;
  manual_resend_history?: {sent_at:string;sent_by:string}[];
}
export default function LostOpportunityReviews(
  { showCreate = true }: { showCreate?: boolean },
) {
  const { profile, companySettings } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [expandedReview, setExpandedReview] = useState<string | null>(null);
  const [adminReview, setAdminReview] = useState<Review | null>(null);
  const [filter, setFilter] = useState("all");
  const [historySearch, setHistorySearch] = useState("");

  const [search, setSearch] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contact, setContact] = useState<Contact | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [proposal, setProposal] = useState("");
  const [recipientMode, setRecipientMode] = useState<"customer" | "proposal">("customer");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [titleEdited, setTitleEdited] = useState(false);
  const [senderVariant, setSenderVariant] = useState<"sales" | "owner">("sales");
  const [preview, setPreview] = useState<
    { subject: string; recipient: string; html: string } | null
  >(null);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const isAdmin = ['admin', 'owner', 'super_admin'].includes(profile?.role || '');
  const canSend = isAdmin || (profile?.can_send_lost_opportunity_reviews ?? false);
  const canView = isAdmin || (profile?.can_view_lost_opportunity_submissions ?? false);
  const [createOpen, setCreateOpen] = useState(showCreate);
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
          opportunity_name: name,
          title,
          sender_variant: senderVariant,
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
        opportunity_name: name,
        title,
        sender_variant: senderVariant,
      })
    ) {

      setContact(null);
      setSearch("");
      setName("");
      setTitle("");
      setTitleEdited(false);
      setProposal("");
      setPreview(null);
      setNotice("Lost Opportunity review request sent.");
    }
  }
  const totalSent = reviews.length;
  const respondedCount = reviews.filter(v => !!v.responded_at).length;
  const pendingCount = reviews.filter(v => !v.responded_at).length;
  const reviewedCount = reviews.filter(v => !!v.reviewed_at).length;
  const winnableCount = reviews.filter(v => ["yes", "maybe"].includes(v.response?.recoverable || "")).length;
  const recoveredCount = reviews.filter(v => v.recovery_outcome === "recovered").length;
  const responseRate = totalSent > 0 ? Math.round((respondedCount / totalSent) * 100) : 0;
  const recoveryRate = respondedCount > 0 ? Math.round((recoveredCount / respondedCount) * 100) : 0;

  const lostStats: StatItem[] = [
    { label: 'Requests Sent', value: totalSent, sublabel: `${pendingCount} awaiting response`, icon: Send, iconColor: 'text-blue-400' },
    { label: 'Response Rate', value: `${responseRate}%`, sublabel: `${respondedCount} of ${totalSent} responded`, icon: TrendingUp, iconColor: 'text-blue-400' },
    { label: 'Recovery Rate', value: `${recoveryRate}%`, sublabel: `${recoveredCount} won back`, icon: RotateCcw, iconColor: 'text-green-400' },
    { label: 'Winnable', value: winnableCount, sublabel: 'recoverable opportunities', icon: AlertCircle, iconColor: 'text-amber-400' },
  ];

  const filterOptions: FilterOption[] = [
    { value: 'all', label: 'All', count: totalSent },
    { value: 'awaiting', label: 'Awaiting', count: pendingCount },
    { value:'call_list',label:'Needs Personal Follow-up',count:reviews.filter(v=>needsPersonalFollowup(v)).length },
    { value: 'new', label: 'New', count: reviews.filter(v => !!v.responded_at && !v.reviewed_at).length },
    { value: 'winnable', label: 'Winnable', count: winnableCount },
    { value: 'complete', label: 'Complete', count: reviewedCount },
    { value: 'bids', label: 'Bids', count: reviews.filter(v => !!v.response?.attachments.length).length },
  ];

  const historySearchLower = historySearch.trim().toLowerCase();
  const visible = reviews.filter((v) =>
    (filter === "all" || v.request_id === expandedReview ||
    filter === "call_list" && needsPersonalFollowup(v) ||
    filter === "new" && !!v.responded_at && !v.reviewed_at ||
    filter === "awaiting" && !v.responded_at ||
    filter === "complete" && !!v.reviewed_at ||
    filter === "winnable" &&
      ["yes", "maybe"].includes(v.response?.recoverable || "") ||
    filter === "bids" && !!v.response?.attachments.length) &&
    (!historySearchLower ||
      (v.recipient || "").toLowerCase().includes(historySearchLower) ||
      (v.opportunity_name || "").toLowerCase().includes(historySearchLower) ||
      (v.title || "").toLowerCase().includes(historySearchLower))
  );
  const input =
    "block w-full rounded-lg border border-gray-600 bg-gray-900 text-gray-100 px-3 py-2 mt-1";
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
      const variantLabel = v.sender_variant === "owner" ? " (Owner version)" : "";
      const sender = v.sent_by_name ? `Sent by ${v.sent_by_name}${variantLabel}` : `Sent${variantLabel}`;
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
    <section className="min-w-0 space-y-3 [overflow-wrap:anywhere]">
      <div className="flex items-center gap-2 px-1">
        <TrendingDown className="h-5 w-5 shrink-0 text-blue-400" />
        <h2 className="text-lg font-semibold text-white">Lost Opportunities</h2>
        <span className="hidden text-sm text-gray-400 sm:inline">· Learn why we lost and earn another chance.</span>
      </div>
      {error && !expandedReview && (
        <p role="alert" className="p-3 rounded-lg bg-red-950 text-red-200">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="p-3 rounded-lg bg-green-950 text-green-200">
          {notice}
        </p>
      )}
      {canSend && !createOpen && (
        <button type="button" onClick={() => setCreateOpen(true)} className="min-h-11 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-500">Show Feedback Form</button>
      )}
      {canSend && createOpen && (
        <form
          onSubmit={send}
          className="bg-gray-800 border border-gray-700 rounded-xl p-3 sm:p-4 space-y-3"
        >
          <div className="flex justify-end">
            <button type="button" onClick={() => setCreateOpen(false)} className="text-sm text-gray-400 hover:text-white">Hide form</button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">{(["sales", "owner"] as const).map(variant => <button key={variant} type="button" disabled={busy} onClick={() => { setSenderVariant(variant); setPreview(null); }} className={`cursor-pointer rounded-xl border px-3 py-2 text-left transition ${senderVariant === variant ? "border-blue-500 bg-blue-950/40" : "border-gray-600 hover:border-gray-400"}`} aria-pressed={senderVariant === variant}><div className="font-semibold text-white">{variant === "sales" ? "Sales Rep" : "Owner"}</div><p className="mt-0.5 text-xs text-gray-400">{variant === "sales" ? "Personal message from the assigned salesperson (or you when no proposal is linked)." : "Personal message from the company owner with their signature and reply-to address."}</p></button>)}</div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Choose recipient method">
            {(["customer", "proposal"] as const).map(mode => (
              <button key={mode} type="button" aria-pressed={recipientMode === mode}
                onClick={() => setRecipientMode(mode)}
                className={`min-h-10 rounded-lg border px-3 py-2 text-sm ${recipientMode === mode ? "border-blue-500 bg-blue-950/40 text-blue-200" : "border-gray-600 text-gray-300"}`}>
                {mode === "customer" ? "Select Customer" : "Link a Proposal"}
              </button>
            ))}
          </div>
          <label className="block text-gray-200">
            {recipientMode === "proposal" ? "Find proposal customer (required)" : "Select Customer (required)"}<input
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
          {(recipientMode === "proposal" || contact) && <label className="block text-gray-200">
            {recipientMode === "proposal" ? "Link a Proposal" : "Proposal (optional)"}<select
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
          </label>}
          {!proposal && <label className="block text-gray-200">Opportunity Name (required for manual entry)<input required maxLength={200} value={name} onChange={(e) => opportunity(e.target.value)} placeholder="e.g. Home Theater Installation" className={input} /></label>}
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
          <button
            type="button"
            disabled={busy || previewing || !canSend || !contact?.email ||
              !title.trim() || !name.trim()}
            onClick={previewEmail}
            className="w-full sm:w-auto rounded-lg border border-blue-600 px-5 py-3 text-blue-300 disabled:opacity-50"
          >
            {previewing ? "Loading Preview…" : "Preview Email"}
          </button>
          <button
            disabled={busy || !canSend || !contact?.email || !title.trim()}
            className="w-full sm:w-auto rounded-lg bg-blue-600 px-5 py-3 text-white disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send Lost Opportunity Review"}
          </button>
        </form>
      )}
      <ReviewStatsRow stats={lostStats} />
      {preview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="lost-email-preview-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 sm:p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="flex h-[92dvh] max-h-[92dvh] w-full max-w-3xl flex-col rounded-xl bg-gray-800 border border-gray-600 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 flex shrink-0 justify-between gap-4">
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
                className="min-h-11 shrink-0 px-3 text-gray-200 self-start"
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-white" role="region" aria-label="Full email preview" tabIndex={0}>
              <FullEmailPreview title="Lost Opportunity email preview" html={preview.html} />
            </div>
            <p className="shrink-0 p-3 text-sm text-gray-400">
              Scroll to see the entire email, including its buttons and footer. Preview only—no email has been sent.
            </p>
          </div>
        </div>
      )}
      {adminReview && <AdminSalesReviewModal requestId={adminReview.request_id} customer={adminReview.recipient || "Customer"} onClose={() => setAdminReview(null)} />}
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold text-white">Send History & Responses</h2>
          <input value={historySearch} onChange={e=>setHistorySearch(e.target.value)} placeholder="Search history" className="min-h-11 w-full sm:w-56 rounded-lg border border-gray-600 bg-gray-900 p-3 text-white" /></div>
      <ReviewFilterBar options={filterOptions} active={filter} onChange={setFilter} />
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
                : needsPersonalFollowup(v) ? "Needs Follow-up" : "Awaiting Response";
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
                  className="w-full min-h-[108px] rounded-xl border border-gray-700 bg-gray-900 p-4 text-left transition hover:border-gray-600 hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60"
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-semibold text-white">{v.recipient || "Customer"}</h3>
                      <p className="mt-0.5 truncate text-sm text-gray-400">{v.title || v.opportunity_name}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                      status === "NEW!" ? "bg-blue-600 text-white" :
                      status === "Delivery Failed" ? "bg-red-950 text-red-200" :
                      status === "Needs Follow-up" ? "bg-amber-950 text-amber-200" :
                      "bg-gray-700 text-blue-300"
                    }`}>{status}</span>
                  </div>
                  <div className="mt-3 flex min-w-0 items-center gap-3 text-xs text-gray-400">
                    <span className="truncate">
                      {v.responded_at ? "Customer responded" : "Sent"}{activityAt ? ` · ${formatDateTime(activityAt)}` : ""}
                    </span>
                    {v.sender_variant === "owner" && <span className="shrink-0 rounded-full bg-blue-950 px-2 py-0.5 text-blue-300">Owner</span>}
                    {canView && !!v.response?.attachments.length && (
                      <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-gray-300">
                        <Paperclip size={14} aria-hidden="true" />
                        {v.response.attachments.length}
                      </span>
                    )}
                    <span className="shrink-0 text-blue-300" aria-hidden="true">›</span>
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
              className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-gray-700 bg-gray-800 p-5 sm:max-w-3xl sm:rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 border-b border-gray-700 pb-4">
                <div className="min-w-0">
                  <h3 id={`lost-review-detail-${v.request_id}`} className="text-xl font-semibold text-white">{v.recipient || "Customer"}</h3>
                  <p className="mt-1 text-sm text-gray-400">{v.title || v.opportunity_name}</p>
                  {v.sender_variant === "owner" && <span className="mt-1 inline-block rounded-full bg-blue-950 px-2 py-0.5 text-xs text-blue-300">Owner version</span>}
                </div>
                <button type="button" onClick={() => setExpandedReview(null)} className="min-h-11 shrink-0 px-2 text-sm text-gray-300">Close</button>
              </div>

              <div className="space-y-4 py-4">
                {error&&<p role="alert" className="text-sm text-red-300">{error}</p>}
                <HistoryLine v={v} />
                {needsPersonalFollowup(v)&&<p className="rounded-lg border border-amber-700 bg-amber-900/20 p-3 text-sm text-amber-200">Needs Personal Follow-up — 30 days or more without customer feedback. No automatic email is sent at day 30.</p>}
                {(v.manual_resend_history||[]).map((entry,i)=><p key={i} className="text-sm text-gray-400">Survey manually resent {formatDateTime(entry.sent_at)}</p>)}
                {!v.responded_at&&canSend&&<button type="button" disabled={busy} className="min-h-11 rounded-lg bg-blue-600 px-4 text-white disabled:opacity-50" onClick={async()=>{
                  const confirmed=await requestConfirmation(`Send the survey again to ${v.recipient||'this customer'}? This keeps the original request date and follow-up flag.`,{title:'Resend feedback survey?',confirmLabel:'Resend survey',theme:'blue'});
                  if(!confirmed)return;
                  setBusy(true);setError('');
                  try{await lostReviewAction({action:'resend',request_id:v.request_id});setNotice('Survey resent. The request is still awaiting feedback.');await load();}
                  catch(e){setError(e instanceof Error?e.message:'Unable to resend survey.');}
                  finally{setBusy(false);}
                }}>Resend survey</button>}

                {v.follow_up_sent_at&&<p className="text-sm text-gray-400">Final feedback reminder sent {formatDateTime(v.follow_up_sent_at)}</p>}
                {!v.responded_at&&canView&&(canSend||['admin','owner','super_admin'].includes(profile?.role||''))&&<RecordLostFeedback requestId={v.request_id} onSaved={()=>void load()}/>}
                {v.response?.source&&<p className="text-sm text-blue-300">Feedback source: {v.response.source==='customer'?'Customer online':v.response.source==='in_person'?'Customer in person':`Customer by ${v.response.source}`}</p>}
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
                      <p className="mt-1 text-blue-300">{({ yes: "Yes", maybe: "Maybe", no: "No" } as Record<string, string>)[v.response.recoverable] || v.response.recoverable}</p>
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
                            <FileText size={20} className="shrink-0 text-blue-300" aria-hidden="true" />
                            <span className="min-w-0 flex-1 break-words text-sm text-gray-200">{a.name}<span className="block text-xs text-gray-400">{bidFileFormat(a.name)?.label || "File attachment"}</span></span>
                            <button type="button" disabled={busy} onClick={() => openAttachment(v, a, false)} className="min-h-11 inline-flex items-center gap-1 text-sm text-blue-300"><ExternalLink size={14} /> View</button>
                            <button type="button" disabled={busy} onClick={() => openAttachment(v, a, true)} className="min-h-11 inline-flex items-center gap-1 text-sm text-blue-300"><Download size={14} /> Download</button>
                          </div>
                        ))}
                      </section>
                    )}
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t border-gray-700 pt-4">
                {canView && profile?.role === "admin" && v.response && (
                  <button type="button" disabled={busy} onClick={() => setAdminReview(v)} className="min-h-11 rounded-lg border border-blue-600 px-3 text-sm text-blue-300">Admin Review</button>
                )}
                {canView && v.response && (
                  <button type="button" onClick={() => {
                    try { printLostReview(v, companySettings?.company_name || "Customer Feedback"); void markViewed(v); }
                    catch (e) { setError(e instanceof Error ? e.message : "Unable to open printable review."); }
                  }} className="min-h-11 rounded-lg border border-gray-600 px-3 text-sm text-blue-300">Print / Save PDF</button>
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
                      if (!(await requestConfirmation("Delete this lost opportunity review? This permanently removes the request, any customer response, and uploaded bid files. This cannot be undone.", { theme: 'blue' }))) return;
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
