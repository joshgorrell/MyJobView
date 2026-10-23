# Customer proposal decisions — PR #258

Integrated main through 28cba011 (including merged #248). The emailed shared-link
entrypoint validates the token/revocation/revision/deadline, then verified signed-in
customers use the same PortalProposalDetail viewer as portal links. Anonymous
visitors retain the limited summary and a customer sign-in link. Possessing a token
alone never authorizes a decision or exposes private document fields.

Approve, decline and formal change requests use one customer-authorized SQL RPC.
It checks ownership, active account, visible active revision, deadline, expected
portal version and configured acceptance method. Proposal row locks and request
receipts make retries/concurrent approvals idempotent. Private evidence captures
the reviewed proposal, settings, template, rooms and lines. Customer direct writes
to proposal financial/status fields are rejected. Existing staff workflows remain.

Approval uses the existing sales-order/project/deposit trigger. Fixed removed
jobsite-field references and invalid notification columns/types against the actual
live schema; notifications use the assigned customer owner. Approval remains
recorded when a deposit is unpaid or checkout is closed/blocked. PO acceptance
requires its number, and failed PO uploads stop submission. Deposit invoices are
refreshed after approval. Customer declines and staff entries share the canonical
loss-feedback implementation, including confirmed portal feedback and existing
in-person staff feedback. No test sends real customer messages or payments.

Formal changes persist a follow-up timestamp/version and a public conversation
message. Conversation creation is server-authorized and always routes to the
assigned customer rep, including previously misassigned threads. The viewer shows
rep call/email links, the concise Our Promise reconsideration choices and separate
decline notes. The PDF control opens the existing authorized printable document
adapter; existing template/model/SKU/price display options are retained.

## Verification

Meaningful regression suites exercise actual SQL and the actual React/edge
handlers. CI includes PostgreSQL 17, concurrent approval retries, Deno checking,
full build/typecheck, engagement/template regressions, preview side-effect guards,
and Chromium/WebKit responsive customer flows. Browser-engine testing is not a
claim of physical iOS device testing. Validation results belong in the PR body.

## Ownership remediation

On October 23, the owner explicitly instructed that customers without a rep be
assigned to Josh Gorrell for now. The live transaction assigned 407 Electronic Life
person/business customers to the uniquely resolved active Josh Gorrell profile in
their organization. Existing representative assignments and all offices were
verified unchanged. Future manual reassignment remains available.

The migrations now require complete assignments without legacy exceptions. The
customer audit must return zero invalid records and the check constraint must be
validated before rollout. New customers and ownership changes require an active
internal representative and an office in the customer's organization.
