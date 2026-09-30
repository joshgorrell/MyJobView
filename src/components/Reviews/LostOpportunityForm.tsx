import { LockKeyhole, MessageSquare, ArrowRight, CheckCircle2 } from "lucide-react";
import React, { useEffect, useState } from "react";
import { lossReasons, lostReviewAction } from "./lostReview";
interface Invitation {
  title: string;
  opportunity_name: string;
  company_name: string;
  company_logo_url?: string;
  completed: boolean;
}
export default function LostOpportunityForm() {
  const token = new URLSearchParams(window.location.search).get("token");
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [reasons, setReasons] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [addingComment, setAddingComment] = useState(false);
  const [chance, setChance] = useState("");
  const [recovery, setRecovery] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  useEffect(() => {
    if (!token) {
      setError("This review link is missing its invitation.");
      return;
    }
    lostReviewAction({ action: "load", token }).then((data) => {
      setInvitation(data);
      setDone(data.completed);
    }).catch((e) => setError(e.message));
  }, [token]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const encoded = await Promise.all(
        files.map((file) =>
          new Promise<{ name: string; type: string; data: string }>(
            (resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () =>
                resolve({
                  name: file.name,
                  type: file.type,
                  data: String(reader.result).split(",")[1],
                });
              reader.onerror = () =>
                reject(new Error("Unable to read attachment."));
              reader.readAsDataURL(file);
            },
          )
        ),
      );
      await lostReviewAction({
        action: "submit",
        token,
        reasons,
        message,
        recoverable: chance,
        recovery_message: canRecover ? recovery : "",
        files: showBidOffer ? encoded : [],
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to submit feedback.");
    } finally {
      setBusy(false);
    }
  }
  const canRecover = chance === "yes" || chance === "maybe";
  const showBidOffer = reasons.includes("price") || reasons.includes("company");
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-cyan-50 p-4 sm:p-10 text-slate-900" style={{ colorScheme: "light" }}>
      <div className="max-w-3xl mx-auto bg-white rounded-3xl shadow-xl shadow-slate-200/60 border border-slate-200 overflow-hidden">
        <header className="relative bg-gradient-to-br from-slate-900 to-cyan-950 p-7 sm:p-10 text-white">
          {invitation?.company_logo_url && (
            <img
              src={invitation.company_logo_url}
              alt={invitation.company_name}
              className="max-h-16 max-w-56 mb-5"
            />
          )}
          <p className="text-cyan-300 text-sm mb-2">
            {invitation?.company_name}
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold leading-tight tracking-tight">
            {invitation?.title || "A private note to our leadership"}
          </h1>
          <p className="mt-4 text-slate-200 text-sm flex items-center gap-2"><MessageSquare className="h-4 w-4" aria-hidden="true" /> A moment of feedback. A chance to do better.</p>
        </header>
        <div className="p-5 sm:p-9">
          {error && (
            <p
              role="alert"
              className="mb-4 rounded-lg bg-red-50 text-red-800 p-3"
            >
              {error}
            </p>
          )}
          {done
            ? (
              <div role="status" className="py-6 text-center">
                <CheckCircle2 className="h-12 w-12 text-cyan-700 mx-auto mb-4" aria-hidden="true" />
                <h2 className="text-xl font-semibold">
                  Thank you for your honest feedback.
                </h2>
                <p className="mt-3">
                  Your response has been sent privately to company leadership
                  for personal review. We appreciate the opportunity to learn
                  and do better.
                </p>
              </div>
            )
            : invitation
            ? (
              <form onSubmit={submit} className="space-y-8">
                <section className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5">
                  <h2 className="font-semibold flex items-center gap-2">
                    <LockKeyhole className="h-4 w-4 text-cyan-700" aria-hidden="true" />
                    Your feedback helps us improve.
                  </h2>
                  <p className="mt-2 text-sm leading-6">
                    Your response and attachments are shared privately with
                    authorized company reviewers. Please tell us where we fell short.
                  </p>
                </section>
                <fieldset>
                  <legend className="text-xl font-semibold tracking-tight">
                    Why did we lose your business?
                  </legend>
                  <p className="text-sm text-slate-600 my-2">
                    Select all that apply, add a message, or both.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {lossReasons.map(([value, label]) => (
                      <label key={value} className={`flex gap-3 items-start rounded-xl border p-4 cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-cyan-600 ${reasons.includes(value) ? "border-cyan-600 bg-cyan-50" : "border-slate-200 bg-white hover:border-cyan-400 hover:bg-slate-50"}`}>
                        <input
                          type="checkbox"
                          checked={reasons.includes(value)}
                          onChange={(e) =>
                            setReasons(
                              e.target.checked
                                ? [...reasons, value]
                                : reasons.filter((r) =>
                                  r !== value
                                ),
                            )}
                          className="mt-1 h-4 w-4 accent-cyan-700"
                        />
                        <span className="text-sm leading-6">{label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                {(reasons.includes("other") || addingComment || !!message) ? (
                <label className="block font-semibold">
                  {reasons.includes("other") ? "What was the other reason?" : "Tell us more"}<textarea
                    required={reasons.includes("other")}
                    value={message}
                    maxLength={10000}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={4}
                    className="block mt-2 w-full border border-slate-300 rounded-xl bg-white text-slate-900 placeholder:text-slate-500 p-4 font-normal focus:outline-none focus:ring-2 focus:ring-cyan-600 focus:border-cyan-600"
                    placeholder="What could we have done differently? We’d appreciate your honest feedback."
                  />
                </label>
                ) : (
                  <button type="button" onClick={() => setAddingComment(true)} className="text-cyan-700 font-semibold underline underline-offset-4">Add a comment (optional)</button>
                )}
                <fieldset className="border-t border-slate-200 pt-6">
                  <legend className="font-semibold text-lg mb-4">
                    Is there still a chance for us to earn your business?
                  </legend>
                  {[["yes", "Yes — I’d like you to try"], [
                    "maybe",
                    "Maybe — reach out to me",
                  ], ["no", "No — I’ve made my decision"]].map(([v, l]) => (
                    <label key={v} className={`flex gap-3 mb-3 rounded-xl border p-4 cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-cyan-600 ${chance === v ? "border-cyan-600 bg-cyan-50" : "border-slate-200 bg-white hover:border-cyan-400"}`}>
                      <input
                        required
                        type="radio"
                        name="chance"
                        className="mt-1 h-4 w-4 accent-cyan-700"
                        value={v}
                        checked={chance === v}
                        onChange={() => setChance(v)}
                      />
                      {l}
                    </label>
                  ))}
                </fieldset>
                {canRecover && (
                  <div>
                    <label className="block font-semibold">
                      What would it take to earn your business?<textarea
                        rows={3}
                        maxLength={10000}
                        value={recovery}
                        onChange={(e) => setRecovery(e.target.value)}
                        className="block mt-2 w-full border border-slate-300 rounded-xl bg-white text-slate-900 placeholder:text-slate-500 p-4 font-normal focus:outline-none focus:ring-2 focus:ring-cyan-600 focus:border-cyan-600"
                      />
                    </label>
                  </div>
                )}
                {showBidOffer && (
                  <section className="rounded-2xl bg-cyan-50/60 border border-cyan-200 p-5 sm:p-6 space-y-4">
                    <h2 className="text-lg font-bold">Our best-price policy</h2>
                    <p>
                      For comparable equipment and the same scope of work, we’ll meet or beat the competing price.
                      Upload the competing bid so we can compare it.
                    </p>
                    <p className="font-bold">If we can’t, we’ll buy you dinner!</p>
                    <label className="block font-semibold">
                      Upload Competing
                      Bid<span className="block text-sm font-normal text-slate-600 my-2">
                        Optional. Up to 5 PDF, JPG, PNG or WebP files, 10 MB
                        each.
                      </span>
                      <input
                        type="file"
                        multiple
                        accept="application/pdf,image/jpeg,image/png,image/webp"
                        onChange={(e) => {
                          const selected = Array.from(e.target.files || []);
                          if (
                            selected.length > 5 ||
                            selected.some((f) => f.size > 10485760)
                          ) {
                            setError("Upload up to five files, 10 MB each.");
                            e.target.value = "";
                            setFiles([]);
                            return;
                          }
                          setFiles(selected);
                          setError("");
                        }}
                        className="block w-full rounded-lg border border-slate-300 bg-white text-slate-900 p-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-slate-900"
                      />
                    </label>
                    {files.map((f) => (
                      <p key={f.name + f.size} className="text-sm">{f.name}</p>
                    ))}

                  </section>
                )}
                <button
                  disabled={busy || (reasons.includes("other") && !message.trim()) || (!reasons.length && !message.trim()) ||
                    !chance}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-cyan-700 hover:bg-cyan-800 text-white py-4 font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {busy ? "Sending…" : "Send Private Feedback"}
                  {!busy && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                </button>
              </form>
            )
            : !error
            ? <p>Loading your invitation…</p>
            : null}
        </div>
      </div>
    </main>
  );
}
