# Security portal onboarding

Invitations open `/portal/security?token=...`. The original `/onboarding` and `/security-onboarding` URLs remain compatible. Signed-in customers can list their agreements in Security and resume after an invitation expires. Drafts restore safe fields and the current step; payment numbers, signatures, and acceptance checkboxes are never saved in drafts.

Onboarding requires a real QuickBooks Payments card or bank account and fresh payment verification at signing. Existing methods are fetched from the customer's QuickBooks Payments vault, not from the legacy `payment_methods` table containing simulated Stripe IDs. New payment numbers go directly from the browser to Intuit's token endpoint. The edge handler accepts only processor tokens and returns masked method data. Adding a method does not charge it.

Admin can authorize mailed invoices on an unsigned agreement in Finance. This adds exactly $7 to the monthly contract price, records the authorizing Admin, and discloses the fee in the agreement. Removing the exception subtracts the fee. Finance and portal customers cannot authorize it, and customers cannot choose it during onboarding. Accepted billing terms and payment authorization cannot silently be changed through ordinary contract updates.

## Validation

```sh
npm ci
npm run test:security-onboarding
npm run build
```

Database tests use PGlite and the five actual migrations in an isolated fixture. They cover customer ownership, token expiry, inaccessible tables, sanitized drafts, conflicting revisions, document changes, atomic signing, immutable copies, payment ownership/freshness/consent, the Admin-only $7 mail exception, portal visibility, contract summaries, anchored billing periods, invoice idempotency, advance notice, payment reconciliation, tax blocking, and revocation. Tax submission is stubbed in this isolated fixture; production tax configuration still needs acceptance testing.

The browser harness uses the actual React components with mocked Supabase and Intuit responses, starts its own Vite server, and requires Playwright and Chromium:

```sh
# Use an installed Playwright runtime; optionally specify an existing Chromium binary.
CHROMIUM_EXECUTABLE_PATH=/path/to/chromium node tests/security-onboarding/browser.mjs
```

It covers mobile resume, save failure/retry, existing/new payment selection, direct Intuit tokenization, re-signing, mandatory acceptance/AutoPay, signed downloads, and full-length printable terms. It does not exercise a real merchant account. The repository-wide TypeScript check has existing failures; compare against the base branch before attributing errors to this change.

## Deployment and acceptance

1. Confirm the production Supabase project serving the dealer portal. Apply the four `20260930` migrations and `20261002142729_security_onboarding_staff_workflows.sql` in order through the normal migration process.
2. Deploy `security-payment-methods`, `send-contract-invitation`, `quickbooks-oauth-initiate`, and `quickbooks-oauth-callback`, and `security-recurring-billing`, including the shared function modules and `config.toml` settings. Deploy the frontend after the migration/functions.
3. In the Intuit developer account, enable the approved Payments API capability and merchant access. Admin reconnects through **Connect QuickBooks Payments**. Accounting-only connections intentionally cannot enroll payments. Existing customer records must be synced to the correct QuickBooks customer IDs.
4. Test real sandbox card and ACH tokenization, existing-method lists, permission denial, expired methods, provider outages, and consent/copy retrieval. Do not perform production charges as an enrollment test.
5. Configure the monitoring QuickBooks sales item in Admin QuickBooks Settings and a valid monitoring tax classification in Finance before activation. MyJobView generates each signed monitoring billing period once, submits an invoice through tax preflight, syncs it to QuickBooks, sends an advance amount notice, and waits at least 10 days before initiating the debit. Card capture and confirmed ACH settlement record payment once. Pending ACH stays outstanding; uncertain outcomes require Admin reconciliation and never automatically replay a charge. Admin can document a confirmed no-charge retry, which starts a new notice period. Accounting payment recording uses `ProcessPayment:false`. Mailed-invoice exceptions never enter the debit queue.
6. Set `SECURITY_BILLING_CRON_SECRET` to a dedicated random server secret, configure `RESEND_API_KEY` and company sender/support email, and verify `SECURITY_ACH_SETTLED_STATUS` against the actual merchant sandbox before enabling ACH charges. Schedule a server-side POST to `/functions/v1/security-recurring-billing` every 15 minutes with `Authorization: Bearer <dedicated secret>` stored in the scheduler's secret store (never frontend code). There is no deployed cron job in this branch. The worker is bounded to 20 cycles / 45 seconds per invocation, and preparation/provider outages defer work without a debit. Do not use a customer session as the cron credential.
7. Merchant acceptance must verify invoice totals/tax, notice delivery and date, recurring card debit, ACH pending-to-settled behavior, declines, timeout reconciliation, Admin retry evidence, accounting webhook deduplication, revocation before debit, and returned/refunded transactions. Returns/refunds after confirmed settlement currently require staff reconciliation through the existing accounting workflow; the new worker does not automatically reverse prior settlements. Historical active contracts are not enrolled or backfilled; their balances display as unavailable until linked billing data exists. No live payment is authorized by this PR.
8. Complete the contract/legal items identified in the onboarding audit, including applicable cancellation notices, approved renewal wording, debit timing and varying-amount notices, and electronic-record disclosures. The template language is preserved; this PR is not legal approval.

No production migration, function deployment, invitation email, or payment charge is performed by the tests.

## Processor references

- Intuit's official Payments SDK: https://github.com/intuit/PHP-Payments-SDK (`TokenOperations`, `CardOperations`, `BankAccountOperations`).
- Payments resources: https://developer.intuit.com/app/developer/qbpayments/docs/api/resources/all-entities/cards and https://developer.intuit.com/app/developer/qbpayments/docs/api/resources/all-entities/bankaccounts.

## Portal visibility and review

Admin → Company Settings → Customer Portal Visibility → **Security Contracts** controls the section and navigation. The contract management module must also be enabled. Server RPCs enforce the same visibility rule for authenticated portal lists/details. A valid invitation still lets its customer finish onboarding and retain the agreement when the dashboard section is hidden.

The customer summary uses the accepted monthly amount, activation-based initial term dates (months remaining rounded up), linked monitoring invoice balances, invoice status, and scheduled debits. Annual billing frequency and Admin-approved mail fees are disclosed. Unknown historical balances are not represented as zero. Renewal wording remains the signed agreement's wording and requires legal review where template terms conflict with recorded renewal intervals.

Review this branch as a draft until merchant sandbox acceptance, target-project migration/function deployment, scheduler setup, and legal-template approval are complete.

## Additional pre-merge findings (September 30)

- Corrected activation so new portal-signed monitoring agreements do not also create a legacy recurring subscription. Existing non-portal contracts keep the legacy path. An existing linked subscription must be reconciled before enrolling in the new scheduler.
- New monitoring contracts allow 12, 24, 36, 48, or 60 months for the initial term (default 36), with month-to-month renewal. Historical contracts are not converted.
- Migration `20260930175017_security_monitoring_terms_review.sql` creates a separate **inactive** Electronic Life review template. It removes the legacy renewal surcharges, separates Admin mail fees, drafts payment/revocation and electronic-record disclosures, and consolidates the conflicting early-termination/default provisions. Unresolved legal-review markers block activation and portal signing. The original template and signed copies are preserved.
- Still requiring approval: early-termination formula; statutory cancellation forms and transaction applicability; central-station/service responsibility; liability, warranties, indemnity and insurance provisions; legal identity, venue and electronic-record delivery procedures. Drafting is not counsel sign-off.
- Connected project currently reports an accounting connection in **sandbox**, but the new Payments capability column/functions are not deployed. No real merchant debit or enrollment test has been run. Confirm the target environment, deploy to the designated test project, reconnect with Payments access, and execute merchant acceptance before removing draft status.

## October 2 audit

See `docs/audits/security-onboarding-2026-10-02.md` for current source and connected-project findings. Initial terms, light controls, transactional entry/creation, invitation failure handling, approval visibility, and deliberate Admin/manager corrections are corrected. Submitted fields are locked by default; each edit records a reason and revision, retains the original submission, and returns the contract for approval. Printing is read-only and requires no new paper upload. Remaining gates cover coordinated deployment, merchant acceptance, and approved legal/template/delivery procedures. Browser coverage saves each initial duration and checks light controls under a dark workspace.


Staff corrections require the existing Contract Management module capability. `security_correct_onboarding` accepts only approved form fields, validates tenant/payment/service ownership, checks the expected revision, and atomically retains original evidence, changes the current document/operational fields, and appends correction history. Original submission copies and staff-corrected copies remain distinct. Direct signed-field and related service/emergency changes are blocked. The mailed-invoice exception remains Admin-only and adds/removes exactly $7/month. Invitation attempts freeze the message and provider key; provider failure leaves the existing link valid, and a recording failure can be safely reconciled by retry within the provider window.

### Paper form flow

Print Paper Form prepares a customer-fillable form without creating any customer or contract. After the handwritten form is returned, Enter Completed Paper Form starts staff web entry. Printing uses a read-only, tenant-checked template/service RPC. The print tests verify no records or workflow states change, selected terms and all web fields are represented, and the browser test checks mobile print options and a letter-sized PDF.
