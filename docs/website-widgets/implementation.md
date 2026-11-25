# Website widgets — Issue #1272

Foundation contract only; no runtime endpoints or production activation in this PR.

Each of sales-lead, chat, service, feedback, portal and analytics has a distinct public identifier and script entry point. The public identifier is not a credential. All widgets default disabled; resolve organization and routing server-side from stored configuration, never from caller-supplied tenant or rep IDs. Exact HTTPS origin checks are defense in depth, not authentication. Use server-side abuse controls, atomic idempotency, and tenant-scoped database access. Do not expose customer records without verified identity.

## Delivery gates
1. Dealer settings and authorization, persistence, public config endpoint, independent script entry points and accessible preview.
2. Website lead intake: reuse existing contacts, leads, website source and notifications; preserve kiosk behavior.
3. Service intake: reuse service requests; unverified requests must not disclose customer data.
4. Feedback: reuse satisfaction inbox, preserve token-linked flow; review links available regardless of rating.
5. Portal: reuse existing authentication and dealer URL.
6. Chat: staff inbox, offline fallback, scoped visitor session, transcript and idempotent conversion.
7. Analytics: independent opt-in installation, consent-aware events, attribution through existing sales records, no sensitive form contents in events.
8. Synthetic end-to-end tests on private EL prototype; explicit approval before live website changes.

Test every widget independently and together, disabled behavior, invalid origin, cross-tenant access, duplicate submissions, mobile and accessibility. Do not deploy from this foundation PR.
