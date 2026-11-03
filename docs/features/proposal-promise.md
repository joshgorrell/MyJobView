# Electronic Life proposal promise

Customers can open **Our Promise to You** from the portal dashboard or an individual proposal. It covers adjusting the budget and scope, the existing comparable-scope best-price/dinner policy, and 90-Day Test & Tune. Portal access to the promise is independent of the rep’s print choice.

The same content appears on a dedicated printed page after any optional photo cover and before proposal data. Reps can include/omit it from the print options, email dialog, or unified delivery dialog; it defaults on. This is a per-delivery/report choice, not a new saved report-template setting. Proposal line items and prices stay on their own pages.

## Branding

`proposalBrand.ts` owns the official logo, blue (`#0099cf`), navy, and Arial/Helvetica typography. The embedded PNG is byte-identical to `public/el_logo_color_(2).png` and the supplied official logo. Embedding keeps it available offline. The promise, main proposal, standalone terms, and payment schedule share this branding. Contract/customer text is preserved; only CSS is recolored. Other dealers retain their own configured branding and do not inherit Electronic Life’s guarantee. If the official logo changes, update both copies together.

## Delivery

`generate-proposal-pdf` currently returns printable HTML, not PDF bytes. Both sending dialogs now attach that actual HTML document instead of silently dropping the attachment while waiting for a nonexistent `base64` field. Customers can open it to print or save as PDF. The helper also accepts PDF/base64 responses for future compatibility. Generation failures stop sending. The existing portal Download PDF button only records activity; that separate issue is not changed here.

## Release and validation

Deploy the frontend and redeploy `generate-proposal-pdf` and `generate-proposal-documents` with their shared dependencies. No migration is needed. Before release, use a controlled inbox and real Electronic Life portal account to verify branding, an emailed attachment, and print output. No live customer email was sent during implementation.

- `npm run build`
- `npm run test:proposal-promise`: actual generator handlers with fixtures, default/opt-out, cover/promise/detail order, tenant scoping, official logo bytes, contract wording, Unicode attachments, and generation failures.
- `npm run test:proposal-promise:browser`: mobile/tablet/desktop, actual logo loading, keyboard banner, horizontal overflow, rep delivery opt-out, and Letter print fit.
- Full typecheck has existing failures in BusinessCard, Layout/Header, Reviews/LostOpportunityReviews, Sales/DesignBriefModal, Sales/DesignQueue, and Tasks/TaskForm. None are in changed files.
