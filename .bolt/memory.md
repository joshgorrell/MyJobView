# Project memory

## Product intent & audience

- MyJobView is a dealer/job management platform with per-dealer workspaces served on subdomains (e.g., `elife.myjobview.com`).
- New public marketing homepage targets prospective dealers/visitors at `myjobview.com` and `www.myjobview.com`.
- Customer portal exists for end-users (login, password reset, signup).
- Staff/dealer authentication routes users to their correct dealer workspace after sign-in.

## Brand personality & voice

- Production-grade marketing surface; polished and distinctive, not template-like.
- Trust-oriented: existing auth and routing must remain untouched and reliable.

## Visual design & UX direction

- Marketing homepage includes a hero section, screenshot imagery (stored in `public/marketing/`), navigation, and a prominent **Dealer Login** button.
- Responsive requirements: homepage must render correctly at both desktop and mobile widths.
- Dealer Login button must invoke the existing staff sign-in flow (not a new one), then redirect authenticated users to their dealer workspace via the existing auth bridge.

## Decisions, constraints & rationale

- **Do not** rebuild or replace the existing authentication system.
- **Do not** change Supabase configuration, GoDaddy DNS, or dealer routing logic.
- Root domain and `www` show the marketing homepage; dealer subdomains are explicitly excluded and continue rendering the app.
- Cross-domain sign-in handoff uses existing routes `/auth-bridge` and `/auth-callback`.
- Other known routes to preserve: `/login`, `/portal`, security onboarding, password flows, proposals, punchlist, signup, business card pages.
- PRs #1191 and #1193 introduced the marketing homepage; syncing from GitHub `main` is the intended update path.
- Marketing screenshots must preserve their exact original filenames from the uploaded ZIP.

## Open questions & assumptions

- ZIP containing four marketing screenshots was not readable in the workspace; exact filenames remain unknown.
- GitHub connection was not detected in the workspace; sync method needs user confirmation.
- Verification target unclear: live `myjobview.com` vs. Bolt preview URL.
- User expects a report of issues before any changes beyond sync and screenshot placement.