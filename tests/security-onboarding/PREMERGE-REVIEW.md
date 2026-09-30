# Security onboarding pre-merge review

Status checked September 30, 2026. Applies to draft PR #33. This is an implementation and acceptance record, not legal approval.

## Business decisions

| Item | Selected behavior | Status |
|---|---|---|
| Initial monitoring term | 36 months from separately confirmed monitoring activation | Drafted for future Electronic Life agreements |
| Renewal | Automatic month-to-month; ordinary cancellation on 30 days' notice, subject to mandatory rights | Drafted; confirm notice mechanics |
| Initial-term early cancellation | 100% of unpaid remaining base monitoring fees, one charge; no additional 80% charge | Selected by Josh September 30; drafted, legal approval outstanding |
| Calculation | Effective cancellation date to initial-term end; partial-month daily proration; credit prepaid amounts for the same unserved period | Proposed implementation detail for review |
| Exclusions from buyout | Future taxes, mailed-invoice fees, separately contracted optional coverage | Proposed detail requiring business/legal confirmation |
| Buyout collection | Ordinary recurring-payment consent does not authorize an automatic buyout debit | Separate authorization/review required |
| Statutory cancellation | Preserve mandatory cancellation/refund rights and applicable notices | Transaction-specific forms and legal approval outstanding |
| Monitoring payment | Verified QuickBooks method and recurring-payment consent required | Locally tested |
| Mailed invoices | Admin only; $7/month; no customer-selectable exception | Locally tested |
| Customer visibility | Admin → Company Settings → Portal Visibility → Security Contracts, with contract module enabled | Locally tested |

The revised template is inactive. Review markers block activation and portal signing. Existing templates, signed snapshots, rates and terms are not converted by the draft revision.

## Legal review packet

Review the original 22-section agreement alongside migration `20260930175017_security_monitoring_terms_review.sql`. The migration intentionally changes selected commercial/disclosure clauses while retaining other original provisions for review; it is not a fully approved replacement agreement.

1. **Cancellation and damages:** approve whether the selected 100% remaining-term provision is enforceable for the actual alarm-service transaction; approve calculation, prepaid credits and lawful exceptions. Remove all conflicting acceleration/liquidated-damages text. Do not charge a statutory cancellation as an ordinary early termination.
2. **Responsibilities and activation:** confirm the dealer legal entity, CMS relationship, subscriber agreement, alarm types, verification/dispatch protocols, and required permits. Align “billing provider” language with actual installation, maintenance and account responsibilities.
3. **Warranty and liability:** review original sections 7–10, including blanket warranty disclaimers, exculpation and $250 liability limit. Approve language with alarm-contract counsel and the insurer; the draft migration does not certify those clauses.
4. **Default and operational actions:** approve notices before suspension, reconnect/service charges, equipment removal and remote access actions. Define treatment of warranty coverage independently.
5. **Insurance and indemnity:** review original sections 17–18, additional-insured requirements and subrogation waivers against actual policy availability and applicable law.
6. **Consumer notices:** determine sale location/channel and jurisdiction. Supply completed federal/Kansas/Missouri cancellation documents when applicable, with correct seller details, dates, timing and delivery. A general rights-saving clause does not replace required forms.
7. **Electronic records:** approve affirmative delivery consent, access/retention demonstration, paper-copy fee policy, withdrawal process, address changes and proof of required delivery. Requested paper agreement copies and the Admin-approved mailed-invoice billing fee are different matters.
8. **Rate adjustments and venue:** align retained rate-change language with signed-price protection and the amendment workflow; approve notices, applicable state law and venue separately.

Primary references for the reviewer:
- Recurring consumer-account authorization/copy and varying-amount notices: https://www.consumerfinance.gov/rules-policy/regulations/1005/10/
- Electronic-record consent and retention: https://www.law.cornell.edu/uscode/text/15/7001
- Kansas consumer unconscionability: https://www.kslegislature.gov/b2025_26/laws/050_000_0000_chapter/050_006_0000_article/050_006_0027_section/050_006_0027_k/
- Kansas qualifying door-to-door cancellation: https://www.kslegislature.gov/b2025_26/laws/050_000_0000_chapter/050_006_0000_article/050_006_0040_section/050_006_0040_k/
- Missouri cancellation notice: https://revisor.mo.gov/main/OneSection.aspx?section=407.710

## Verified environment evidence

The connected MJV project reports a connected QuickBooks account with `environment=sandbox` and a realm mapping. On the latest read-only check:
- `security-payment-methods` and `security-recurring-billing` were absent from the deployed function list.
- `quickbooks_settings.payments_enabled` and `security_contracts.security_billing_anchor` were absent.
- No Supabase development branches were available on September 30.
- The execution workspace was unavailable; connector access supports repository and database review but does not provide a secure merchant-test runner.

An accounting sandbox connection alone does not demonstrate Payments enrollment or merchant charge capability. No real merchant charge, payment enrollment, test email, migration or function deployment was performed. Confirm the actual test portal and Supabase project before applying schema changes; a sandbox QuickBooks flag does not prove the entire database is a test database.

## Merchant acceptance sequence

Use synthetic customers and Intuit test instruments only in the verified test environment. Never put credentials, card numbers or bank details in this document or repository.

| Case | Required evidence |
|---|---|
| Configuration | Test portal points to confirmed test project; migrations/functions match PR head; approved Payments OAuth connection; monitoring sales item and customer mapping; tax classification; sender and dedicated server cron secret |
| Existing method | Merchant vault method belongs to the intended dealer/customer; masked details only; another customer's method rejected |
| New method | Browser tokenization succeeds; server receives token/reference only; no PAN/CVV/bank data in drafts, logs or retained artifacts |
| Agreement | Early review/print works; pause/resume works across sessions; signing binds the exact terms, price and mandate; signed copy remains unchanged after template edits |
| Invoice | Activation creates one monitoring schedule and no duplicate legacy subscription; tax preflight succeeds; QuickBooks and MyJobView totals agree |
| Advance notice | Confirm customer delivery evidence, exact amount and scheduled date; no debit before the minimum notice window |
| Card | Saved-method sandbox capture succeeds once; amount and transaction match; one local payment and one accounting payment; accounting recording never creates a second charge |
| ACH | Initial pending response leaves balance outstanding; read-only polling follows the same transaction; only merchant-verified settlement clears balance |
| Failure/timeout | Decline visible; uncertain POST never automatically replayed; Admin records merchant reconciliation evidence before a new attempt |
| Retry | Confirmed no-charge retry produces a new notice period; known unresolved transaction cannot be bypassed |
| Manual payment race | Changed local or QuickBooks balance prevents scheduled debit; webhook does not duplicate recorded payment |
| Revocation | Revocation before submission prevents future debit; already-submitted transfers handled through provider follow-up |
| Mail exception | Admin authorizes $7/month; invoice created without debit; customer cannot opt into or alter the exception |
| Returns/refunds | Exercise existing staff/accounting reconciliation after a settled payment; confirm invoice balance and customer display |
| Portal visibility | Off hides section and authenticated detail access; valid invitation retains scoped onboarding/copy access; on shows only the customer's agreements |

Retain masked transaction IDs, notice timestamps, invoice totals, outcomes and build/commit identity for each test. Record actual results rather than treating the expected-result table as passing evidence.

## Merge gates

- [x] Initial technical audit and implementation.
- [x] Previously recorded local production build, mobile browser, isolated migration/vault/charge tests and current-main review regression checks.
- [x] Selected 100% early-termination policy drafted in an inactive revision.
- [x] GitHub Actions run 36757918853 passed the onboarding tests, production build and browser/printing checks after the selected cancellation wording (commit 557e303467c492132f5a20369ffcc530e2754de1).
- [ ] Confirm test environment and complete actual merchant acceptance.
- [ ] Approve remaining legal provisions and completed transaction-specific notices.
- [ ] Independent PR review and final release configuration.

Keep PR #33 in draft until these remaining gates are satisfied. No merge or live billing activation is implied by this record.

## Follow-up legal findings and test disposition — September 30

### Required electronic-record workflow

Section 20 draft text alone does not complete the consumer electronic-delivery workflow. Before relying on electronic records to satisfy required written disclosures, add a distinct affirmative consent with the applicable record categories, paper-copy request procedure and any fee, withdrawal/contact-change procedure and consequences, and actual access/retention requirements. Capture the disclosure version, affirmative action and time, and demonstrate access to the format used. Retain the delivered authorization/agreement and delivery evidence; merely displaying a print button does not establish all these facts. Do not conflate this consent with recurring-payment consent or the $7 mailed-invoice exception. This remains an implementation/release gate, not a completed feature.

Primary authority: https://uscode.house.gov/view.xhtml?req=(title:15%20section:7001%20edition:prelim)

### AutoPay and credit classification

For covered consumer-account recurring transfers, obtain a signed or similarly authenticated authorization and provide the customer a copy. Preserve financial-institution stop-payment rights and operational revocation. The worker's ten-day advance notice for every charge is a conservative product policy; the cited regulation specifically addresses varying-amount transfers. Determine whether any financed equipment or bundled installment arrangement constitutes consumer credit: Regulation E prohibits conditioning an extension of consumer credit on repayment by preauthorized electronic fund transfers, subject to its stated exceptions. Do not assume the ordinary monitoring AutoPay rule can be applied unchanged to financed equipment. Counsel must classify the actual offering before approving mandatory AutoPay language.

Primary authority: https://www.consumerfinance.gov/rules-policy/regulations/1005/10/ (paragraphs b–e).

### Cancellation documents and remaining-fee example

Determine applicability from the actual sale and solicitation facts, not merely the fact that the customer signs through a portal. Where a cooling-off rule applies, supply the prescribed notices and completed cancellation forms; keep transaction dates and delivery evidence. Do not use the ordinary remaining-term formula for a qualifying statutory rescission.

For review only: at a $40 base monthly rate with exactly 12 complete unpaid initial-term months remaining and no prepaid credit, the selected formula gives $480 once. Future tax, mailed-invoice fees and separate optional agreements are excluded under the proposed draft. Partial-month math and legally required reductions/exceptions still require approval. The recurring mandate does not independently authorize debiting this amount.

Federal reference: https://www.ftc.gov/legal-library/browse/rules/cooling-period-sales-made-home-or-other-locations

### Actual merchant tests: not run

The connected accounting account reports sandbox, but Payments authorization and new endpoints are not deployed. No existing isolated database branch was found. No safe authenticated merchant-test runner is available through the current execution tools. No test instrument, customer email or production account was used. Do not label mocked tests as merchant acceptance.

Next executable path: provide an authenticated test runtime with Intuit sandbox Payments authorization, synthetic customer mapping and a designated test recipient; deploy this PR to an isolated test project or an explicitly reviewed controlled rollout. Do not apply all onboarding migrations to the live portal merely to obtain a merchant test: the old live frontend and changed signing/RLS interfaces must be released together. Keep the scheduler disabled until merchant outcomes and notice delivery are verified. No merge, live migration, live debit or counsel outreach was performed as part of this follow-up.

## Equipment credit recovery — revised scope September 30

Josh clarified that MJV does not currently calculate equipment-credit balances. This request is contract wording only: no new credit fields, portal balances or automated repayment calculation is required. Any cancellation amount must be determined and documented manually from the actual signed agreement and equipment discount records.

Proposed clause for legal review:

> If this Agreement is terminated before the initial term ends, you remain responsible, to the extent permitted by applicable law, for any remaining repayable portion of equipment credits, discounts or subsidies actually granted and disclosed under this Agreement, in addition to any other lawful amounts due under this Agreement. Any repayment will be determined under the terms disclosed when the credit, discount or subsidy was granted, with credit for amounts already repaid, and without duplicate recovery. This provision does not limit mandatory cancellation or refund rights.

The signed agreement or incorporated equipment discount document must identify the actual credit and its repayment terms; this general clause does not create a repayment obligation for an undisclosed credit or supply a missing proration formula. If prorated repayment is intended, disclose that basis when the discount is granted. Staff must itemize and substantiate the remaining amount before collection. Ordinary recurring-payment consent does not independently authorize a cancellation or equipment-credit recovery debit. Do not modify existing signed agreements.

Status: draft wording recorded; legal approval outstanding. No automated calculation, credit tracking or portal balance display is included in this request.
