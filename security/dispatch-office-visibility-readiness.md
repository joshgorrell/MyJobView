# Office Visibility rollout gate

**Do not activate the GPS RLS proposal in `security/dispatch-office-visibility-review.sql` until this gate passes.**

## Observed live database state (2026-11-17)
- 15 active profiles; 13 have no `user_offices` membership.
- 2 total `user_offices` membership rows.
- 0 active profiles have a `primary_office_id`.
- `user_visible_offices` has 1 row.
- Most users have no `user_visibility_settings` row. Existing Tech Stats treats unset visibility as all offices.

## Decision required
1. Define which office(s) each technician belongs to. Populate `user_offices` and/or `primary_office_id` using the existing Admin workflow; do not guess from location or clock records.
2. Choose whether missing visibility settings should continue to mean all offices. The current proposal preserves existing behavior, so it **will not restrict** users without an explicit setting.
3. Align `office_only` semantics: existing Tech Stats uses viewer's `primary_office_id`, whereas the proposed GPS helper intersects `user_offices`. With zero active primary-office values, those interpretations are not equivalent.
4. Confirm explicit administrative overrides and technician self-access.
5. Run `security/dispatch-office-visibility-readiness.sql` before migration. Confirm membership integrity and selected-office assignments.
6. Run direct authenticated API and RPC tests with restricted users before deploying; then update Live Map and Overview in the same release.

No production data or RLS policies are modified by this PR.

## Confirmed existing Admin semantics (2026-11-17)
`src/components/Admin/EditUserForm.tsx` explicitly separates Office Visibility from office memberships. Options are All Offices, Selected Offices, Own Records Only, Primary Office Only. Missing visibility setting defaults to All Offices. **Membership does not automatically restrict visibility.** The GPS SQL review was updated to match Tech Stats' Primary Office Only interpretation instead of using the viewer's membership intersection.
