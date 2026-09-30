import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { lossReasons, lostReviewAction } from "./lostReview";
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
  reviewed_at: string | null;
  shared_at: string | null;
  recovery_outcome: string;
  response?: Response;
  recipient?: string;
}
export default function LostOpportunityReviews(
  { showCreate = false }: { showCreate?: boolean },
) {
  const { profile } = useAuth();
  const [owner, setOwner] = useState<string | null>(null);
  const [staff, setStaff] = useState<{ id: string; full_name: string }[]>([]);
  const [ownerChoice, setOwnerChoice] = useState("");
  const [reviews, setReviews] = useState<Review[]>([]);
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
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const isOwner = owner === profile?.id;
  const org = profile?.organization_id;
  async function load() {
    if (!org) return;
    setLoading(true);
    try {
      const [o, d, r, q] = await Promise.all([
        supabase.from("lost_review_owners").select("owner_id").eq(
          "organization_id",
          org,
        ).maybeSingle(),
        supabase.from("lost_review_details").select("*").eq(
          "organization_id",
          org,
        ).order("request_id"),
        supabase.from("lost_review_responses").select("*"),
        supabase.from("review_requests").select(
          "id,recipient_name,recipient_email",
        ).eq("request_type", "lost_opportunity").order("sent_at", {
          ascending: false,
        }),
      ]);
      for (const result of [o, d, r, q]) if (result.error) throw result.error;
      setOwner(o.data?.owner_id || null);
      setReviews((q.data || []).flatMap((request) => {
        const detail = d.data?.find((v) => v.request_id === request.id);
        return detail
          ? [{
            ...detail,
            response: r.data?.find((v) => v.request_id === request.id),
            recipient: request.recipient_name || request.recipient_email,
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
  }, [org]);
  useEffect(() => {
    if (!org) return;
    let active = true;
    supabase.from("profiles").select("id,full_name").eq("organization_id", org)
      .eq("is_active", true).order("full_name").then(({ data, error }) => {
        if (active) {
          if (error) setError(error.message);
          else setStaff(data || []);
        }
      });
    return () => {
      active = false;
    };
  }, [org]);
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
  function opportunity(value: string) {
    setName(value);
    if (!titleEdited) setTitle(value ? `Why didn’t we win your ${value}?` : "");
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
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">
            Lost Opportunity Reviews
          </h2>
          <p className="text-gray-400 text-sm mt-1">
            Learn why we lost and earn another chance. Customer feedback is
            owner only until shared.
          </p>
        </div>
        <button
          onClick={() => setCreating(!creating)}
          className="bg-cyan-700 text-white rounded-lg px-4 py-2"
        >
          {creating ? "Cancel" : "Create Review Request"}
        </button>
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
      {!owner && !loading && (
        <section className="border border-amber-700 bg-gray-800 p-5 rounded-xl">
          <h3 className="font-semibold text-white">
            Designate the owner first
          </h3>
          <p className="text-gray-300 text-sm mt-2">
            Only this person sees new customer responses and competing bids.
            Other admins do not receive access automatically.
          </p>
          {profile?.role === "admin"
            ? (
              <>
                <label className="block text-gray-200 mt-3">
                  Owner<select
                    value={ownerChoice}
                    onChange={(e) => setOwnerChoice(e.target.value)}
                    className={input}
                  >
                    <option value="">Select the business owner</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>{s.full_name}</option>
                    ))}
                  </select>
                </label>
                <button
                  disabled={!ownerChoice || busy}
                  onClick={() =>
                    action({ action: "set_owner", owner_id: ownerChoice })}
                  className="mt-3 rounded-lg bg-cyan-700 text-white p-3 disabled:opacity-50"
                >
                  Save Owner
                </button>
              </>
            )
            : (
              <p className="text-amber-300 mt-3">
                An admin needs to designate the owner before you can send
                requests.
              </p>
            )}
        </section>
      )}
      {owner && (
        <p className="text-sm text-gray-400">
          Owner:{" "}
          {staff.find((s) => s.id === owner)?.full_name || "Designated owner"}
        </p>
      )}
      {creating && (
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
            Opportunity / Project Name<input
              required
              maxLength={200}
              value={name}
              onChange={(e) => opportunity(e.target.value)}
              className={input}
            />
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
          <div className="bg-gray-900 rounded-lg p-4 text-gray-300 space-y-2 text-sm">
            <p>
              Thank you for giving us the opportunity to help with{" "}
              <strong>{name || "your project"}</strong>.
            </p>
            <p>
              Your feedback goes directly to our owner first. Constructive
              criticism is absolutely welcome. We want to improve and win you
              over.
            </p>
            <p>
              For a competing proposal with comparable equipment and scope, we
              will work to meet or beat their price. If we can’t, we’ll buy you
              dinner.
            </p>
            <p className="text-cyan-300">Tell Our Owner Why →</p>
          </div>
          <button
            disabled={busy || !owner || !contact?.email || !name.trim() ||
              !title.trim()}
            className="rounded-lg bg-cyan-700 px-5 py-3 text-white disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send Lost Opportunity Review"}
          </button>
        </form>
      )}
      <label className="flex items-center gap-3 text-gray-300">
        Filter<select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-lg bg-gray-800 border border-gray-600 p-2"
        >
          <option value="all">All Lost Opportunities</option>
          <option value="needs_review">Needs Owner Review</option>
          <option value="winnable">Still Winnable (visible responses)</option>
          <option value="bids">
            Competing Bid Uploaded (visible responses)
          </option>
        </select>
      </label>
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
            className="rounded-xl border border-gray-700 bg-gray-800 p-5 space-y-3"
          >
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <h3 className="text-white font-semibold">
                  {v.opportunity_name}
                </h3>
                <p className="text-gray-400 text-sm">{v.recipient}</p>
              </div>
              <p className="text-cyan-300 text-sm">
                {v.responded_at
                  ? (v.shared_at
                    ? "Reviewed & Shared"
                    : v.reviewed_at
                    ? "Owner Reviewed"
                    : "Needs Owner Review")
                  : v.delivery_status === "failed"
                  ? "Delivery Failed"
                  : v.delivery_status === "pending"
                  ? "Delivery Pending"
                  : "Awaiting Response"}
              </p>
            </div>
            {v.response
              ? (
                <div className="space-y-3 text-gray-200">
                  <p>
                    {v.response.reasons.map((r) =>
                      lossReasons.find(([key]) => key === r)?.[1] || r
                    ).join(" • ")}
                  </p>
                  {v.response.message && (
                    <p className="whitespace-pre-wrap">{v.response.message}</p>
                  )}
                  <p className="text-sm text-cyan-300">
                    Another chance: {v.response.recoverable}
                  </p>
                  {v.response.recovery_message && (
                    <p className="whitespace-pre-wrap">
                      {v.response.recovery_message}
                    </p>
                  )}
                  {v.response.attachments.map((a) => (
                    <button
                      disabled={busy}
                      key={a.path}
                      className="block text-cyan-300 underline"
                      onClick={async () => {
                        try {
                          const data = await lostReviewAction({
                            action: "download",
                            request_id: v.request_id,
                            path: a.path,
                          });
                          window.open(
                            data.url,
                            "_blank",
                            "noopener,noreferrer",
                          );
                        } catch (e) {
                          setError(
                            e instanceof Error
                              ? e.message
                              : "Unable to open bid.",
                          );
                        }
                      }}
                    >
                      {a.name}
                    </button>
                  ))}
                </div>
              )
              : v.responded_at
              ? (
                <p className="text-gray-400 text-sm">
                  Owner Only — the owner must review and share this feedback
                  before your team can view it.
                </p>
              )
              : null}
            {isOwner && v.response && (
              <div className="flex flex-wrap gap-3">
                {!v.reviewed_at && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      action({ action: "review", request_id: v.request_id })}
                    className="bg-gray-700 text-white rounded-lg px-3 py-2"
                  >
                    Mark Reviewed
                  </button>
                )}
                {!v.shared_at && (
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Share this response and its competing bids with your team?",
                        )
                      ) action({ action: "share", request_id: v.request_id });
                    }}
                    className="bg-cyan-700 text-white rounded-lg px-3 py-2"
                  >
                    Review & Share with Team
                  </button>
                )}
                <label className="text-gray-300">
                  Recovery outcome<select
                    disabled={busy}
                    value={v.recovery_outcome}
                    onChange={(e) =>
                      action({
                        action: "outcome",
                        request_id: v.request_id,
                        outcome: e.target.value,
                      })}
                    className="ml-2 rounded-lg bg-gray-900 border border-gray-600 p-2"
                  >
                    <option value="unreviewed" disabled>Unreviewed</option>
                    <option value="following_up">Following Up</option>
                    <option value="recovered">Recovered</option>
                    <option value="closed">Closed</option>
                  </select>
                </label>
              </div>
            )}
          </article>
        ))}
    </section>
  );
}
