import { responseReasons } from "./lostReview";

interface PrintableReview {
  opportunity_name: string;
  title: string;
  recipient?: string;
  responded_at: string | null;
  reviewed_at: string | null;
  sent_by_name: string | null;
  recovery_outcome: string;
  response?: {
    reasons: string[];
    message: string;
    recoverable: string;
    recovery_message: string;
    attachments: { name: string; path: string }[];
  };
}
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character]!));
const dateLabel = (value: string | null) => value ? new Date(value).toLocaleString() : "—";

export function printLostReview(review: PrintableReview, companyName: string) {
  if (!review.response) throw new Error("This review has no completed response.");
  const report = window.open("", "_blank");
  if (!report) throw new Error("Allow pop-ups to print or save this review.");
  report.opener = null;
  const response = review.response;
  const answer = (heading: string, value: string) =>
    `<section><h2>${escapeHtml(heading)}</h2><p>${escapeHtml(value || "Not provided")}</p></section>`;
  const reasons = response.reasons.map(reason =>
    responseReasons.find(([key]) => key === reason)?.[1] || reason
  );
  const outcomes: Record<string, string> = {
    unreviewed: "Unreviewed", following_up: "Following up", recovered: "Recovered", closed: "Closed",
  };
  report.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(review.opportunity_name)} - Lost Opportunity Review</title>
<style>
  :root{color-scheme:light}body{margin:0;background:#f1f5f9;color:#0f172a;font:15px/1.6 Arial,sans-serif}
  main{max-width:760px;margin:28px auto;padding:36px;background:white}
  header{border-bottom:3px solid #0e7490;padding-bottom:20px}h1{font-size:26px;margin:8px 0}h2{font-size:15px;margin:0 0 6px}
  .company{font-weight:bold;color:#0e7490}.private{font-size:12px;color:#475569}
  dl{display:grid;grid-template-columns:140px 1fr;gap:5px 12px;margin:20px 0}dt{font-weight:bold}dd{margin:0;overflow-wrap:anywhere}
  section{border-top:1px solid #cbd5e1;padding:16px 0}p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
  .toolbar{max-width:760px;margin:20px auto;padding:0 16px}button{background:#0e7490;color:white;border:0;border-radius:8px;padding:12px 18px;font:inherit;cursor:pointer}
  .hint{margin-top:8px;color:#475569;font-size:13px}
  @page{size:letter;margin:18mm}@media print{body{background:white}main{margin:0;padding:0;max-width:none}.toolbar{display:none}h2{break-after:avoid}header,dl{break-inside:avoid}}
</style></head><body><div class="toolbar"><button id="print-review">Print / Save PDF</button><div class="hint">Choose Save as PDF in your print dialog to download a copy.</div></div><main>
<header><div class="company">${escapeHtml(companyName)}</div><h1>Lost Opportunity Review</h1><p>${escapeHtml(review.opportunity_name)}</p><div class="private">Private customer feedback · For authorized internal review</div></header>
<dl><dt>Customer</dt><dd>${escapeHtml(review.recipient || "Customer")}</dd><dt>Submitted</dt><dd>${escapeHtml(dateLabel(review.responded_at))}</dd><dt>Requested by</dt><dd>${escapeHtml(review.sent_by_name || "—")}</dd><dt>Reviewed</dt><dd>${escapeHtml(dateLabel(review.reviewed_at))}</dd><dt>Recovery outcome</dt><dd>${escapeHtml(outcomes[review.recovery_outcome] || review.recovery_outcome)}</dd></dl>
${answer("Why did we lose your business?", reasons.length ? reasons.join("\n") : "Comment only")}
${answer("Customer comments", response.message)}
${answer("Is there still a chance to earn their business?", {yes:"Yes",maybe:"Maybe",no:"No"}[response.recoverable] || response.recoverable)}
${answer("What would it take to earn their business?", response.recovery_message)}
${answer("Competing bid attachments", response.attachments.length ? response.attachments.map(file => file.name).join("\n") : "None uploaded")}
<div class="private">Attachments are listed here. Download the original files separately from MJV.</div>
</main></body></html>`);
  report.document.close();
  report.document.getElementById("print-review")?.addEventListener("click", () => report.print());
  report.focus();
}
