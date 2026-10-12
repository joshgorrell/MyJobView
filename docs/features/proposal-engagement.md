# Proposal Activity

Customer proposal visits now use a verified portal identity and a random visit ID. The existing Activity panel shows first/latest opens, visit count, verified customer count, approximate active viewing, section interest, and selected action clicks. A factual Activity summary sits above the timeline. Existing workflow badges and activity-summary RPC use the same active viewing totals.

## Deployment

1. Apply `supabase/migrations/20261012130517_proposal_engagement_sessions.sql` using the normal migration process before deploying the frontend. This reuses `proposal_activity`, preserves historical rows, adds visit/identity columns, and replaces the permissive activity policies.
2. Deploy the frontend from the same commit. No additional provider, paid analytics service, environment variable, or Edge Function is needed.
3. Open a published proposal as its linked portal customer (including a customer with no employee profile). Confirm a view appears, the proposal changes from `sent` to `portal`, and approval/payment controls remain available.
4. Keep the proposal focused for 15 seconds, scroll to a room, and click Questions. Verify timing/section/action updates in Activity as an employee with access to the proposal and the Proposals module.
5. Confirm internal previews and the sales-order viewer do not add visits. Confirm another dealer cannot read the history or call the summary RPC for this proposal.

Deploy the migration and frontend close together. Older browser bundles lose the retired duration RPC and direct `viewed` inserts after the migration; existing download/decline action inserts remain authorized for the owning customer. Refresh old clients for new visit tracking. Do not roll back only the frontend to the old tracker. Historical records are preserved, but the new frontend depends on the new columns/RPCs.

## Measurement

- Active time requires a visible, focused page; it pauses after 60 seconds without pointer, keyboard, or scroll interaction. Browser suspension cannot create catch-up time.
- Each interval is assigned to one section with the greatest visible viewport area. Room totals include scope/products within that room. Time with no tagged section is included in visit time only.
- Heartbeats save cumulative snapshots every 15 seconds; clicks, focus/visibility changes, and navigation also attempt a save. Abrupt browser termination may lose the latest unsaved interval. These are estimates, not proof of reading or comprehension.
- Visits are separate page sessions, not unique people. Only new verified identities count as verified customers. Older foreground duration is displayed separately and excluded from active time. Existing legacy IP/device data is preserved; new visit tracking does not collect IP addresses or fingerprint visitors.
- Actions distinguish opening approval or clicking payment from completing either. Completed approvals/downloads/declines continue to use their existing event workflows. No form values, messages, payment details, URLs, or cursor coordinates are collected by the new tracker.
- Only published proposals belonging to the authenticated customer's contact can start or update a visit. Employee identities are excluded. Read access requires existing proposal visibility, the same dealer, and current Proposals module permission. The legacy summary RPC now respects RLS.
- New visit creation is idempotent by verified identity and visit ID. Tabs/navigation have separate IDs. Updates validate elapsed time, allowlisted actions, room ownership, nonnegative integer counts, and monotonic snapshots. Public RPC wrappers invoke narrowly authorized functions in the private schema.
- Visual heat maps, anonymous/shared-link tracking, and option selection analytics are outside this change. The first-open Flow event and weekly email are covered in proposal-activity-weekly.md. The current viewer's actual actions are instrumented; no new proposal options are introduced.

## Validation

- `npm run test:proposal-engagement`: deterministic attention/summary behavior and PGlite database permission/validation tests.
- `npm run test:proposal-engagement:browser`: actual React hook and Activity UI under Chromium, including StrictMode, idle/background, tab/navigation isolation, temporary failures, privacy, and mobile layout.
- `node tests/proposals/preview-safety.mjs` and `node tests/proposals/preview-browser.mjs`: existing preview/action safety plus live-viewer tracking and sales-order exclusion.
- `node tests/proposals/mobile-browser.mjs`: existing proposal-list layout and actions.
- `npm run build`: production bundle.

Browser tests accept `CHROMIUM_EXECUTABLE_PATH` when using a system browser. Repository-wide `npm run typecheck` has existing errors; compare diagnostics with the unchanged base rather than treating this branch as the origin of those failures.
