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
        recovery_message: recovery,
        files: encoded,
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to submit feedback.");
    } finally {
      setBusy(false);
    }
  }
  const price = reasons.includes("price") || reasons.includes("value");
  return (
    <main className="min-h-screen bg-slate-100 p-4 sm:p-8 text-slate-900">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-lg overflow-hidden">
        <header className="bg-slate-900 p-6 text-white">
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
          <h1 className="text-2xl font-bold">
            {invitation?.title || "A private note to our leadership"}
          </h1>
        </header>
        <div className="p-6 sm:p-8">
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
              <div role="status">
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
              <form onSubmit={submit} className="space-y-6">
                <section className="bg-cyan-50 border border-cyan-200 rounded-xl p-4">
                  <h2 className="font-bold">
                    This feedback is privately reviewed by company leadership.
                  </h2>
                  <p className="mt-2 text-sm leading-6">
                    Only authorized reviewers can see your response and
                    attachments. Sending this request does not give your
                    salesperson access to your feedback. Please be
                    candid—constructive criticism is absolutely welcome. We want
                    to know where we fell short, how we can improve, and whether
                    we can win you over.
                  </p>
                </section>
                <fieldset>
                  <legend className="font-semibold">
                    Why did you decide not to move forward with us?
                  </legend>
                  <p className="text-sm text-slate-600 my-2">
                    Select all that apply, add a message, or both.
                  </p>
                  <div className="space-y-3">
                    {lossReasons.map(([value, label]) => (
                      <label key={value} className="flex gap-3 items-start">
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
                          className="mt-1 h-4 w-4"
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label className="block font-semibold">
                  Tell us more<textarea
                    value={message}
                    maxLength={10000}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={5}
                    className="block mt-2 w-full border border-slate-300 rounded-lg p-3 font-normal"
                    placeholder="What could we have done differently? Good, bad, or somewhere in between—your feedback helps us improve."
                  />
                </label>
                <fieldset>
                  <legend className="font-semibold mb-3">
                    Is there still a chance for us to earn your business?
                  </legend>
                  {[["yes", "Yes — I’d like you to try"], [
                    "maybe",
                    "Maybe — reach out to me",
                  ], ["no", "No — I’ve made my decision"]].map(([v, l]) => (
                    <label key={v} className="flex gap-3 mb-3">
                      <input
                        required
                        type="radio"
                        name="chance"
                        value={v}
                        checked={chance === v}
                        onChange={() => setChance(v)}
                      />
                      {l}
                    </label>
                  ))}
                </fieldset>
                {(price || chance === "yes" || chance === "maybe") && (
                  <section className="rounded-xl border border-cyan-200 p-5 space-y-4">
                    <h2 className="text-lg font-bold">Give us another shot.</h2>
                    {price && (
                      <>
                        <p>
                          If you would rather work with{" "}
                          {invitation.company_name}{" "}
                          but price is standing in the way, upload the competing
                          proposal. For comparable equipment and scope, we will
                          work to <strong>meet or beat their price.</strong>
                        </p>
                        <p className="font-bold">
                          If we can’t, we’ll buy you dinner.
                        </p>
                      </>
                    )}
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
                        className="block w-full text-sm"
                      />
                    </label>
                    {files.map((f) => (
                      <p key={f.name + f.size} className="text-sm">{f.name}</p>
                    ))}
                    <label className="block font-semibold">
                      What would it take to earn your business?<textarea
                        rows={3}
                        maxLength={10000}
                        value={recovery}
                        onChange={(e) => setRecovery(e.target.value)}
                        className="block mt-2 w-full border border-slate-300 rounded-lg p-3 font-normal"
                      />
                    </label>
                  </section>
                )}
                <button
                  disabled={busy || (!reasons.length && !message.trim()) ||
                    !chance}
                  className="w-full rounded-lg bg-cyan-700 hover:bg-cyan-800 text-white py-3 font-bold disabled:opacity-50"
                >
                  {busy ? "Sending…" : "Send Private Feedback"}
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
