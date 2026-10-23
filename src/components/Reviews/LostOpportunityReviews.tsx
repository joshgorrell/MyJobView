          <div className="grid gap-3 sm:grid-cols-2">{(["sales", "owner"] as const).map(variant => <button key={variant} type="button" disabled={busy} onClick={() => { setSenderVariant(variant); setPreview(null); }} className={`cursor-pointer rounded-xl border p-4 text-left transition ${senderVariant === variant ? "border-blue-500 bg-blue-950/40" : "border-gray-600 hover:border-gray-400"}`} aria-pressed={senderVariant === variant}><div className="font-semibold text-white">{variant === "sales" ? "Sales Rep" : "Owner"}</div><p className="mt-1 text-sm text-gray-400">{variant === "sales" ? "Personal message from the assigned salesperson (or you when no proposal is linked)." : "Personal message from the company owner with their signature and reply-to address."}</p></button>)}</div>
          <div className="grid gap-3 sm:grid-cols-2">{(["sales", "owner"] as const).map(variant => <button key={variant} type="button" disabled={busy} onClick={() => { setSenderVariant(variant); setPreview(null); }} className={`cursor-pointer rounded-xl border p-4 text-left transition ${senderVariant === variant ? "border-blue-500 bg-blue-950/40" : "border-gray-600 hover:border-gray-400"}`} aria-pressed={senderVariant === variant}><div className="font-semibold text-white">{variant === "sales" ? "Sales Rep" : "Owner"}</div>
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
