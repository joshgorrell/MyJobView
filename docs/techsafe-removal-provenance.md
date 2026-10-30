> Superseded activation guidance: the workflow-isolation migration detaches legacy receipt hooks and managed invalidation triggers. Keep the managed engine unused and do not register live COs. See [background sync plan](techsafe-background-sync.md). The historical tests below validate the earlier migration alone, not current export readiness.

# Applied change-order removal evidence

This source-data prerequisite separates equipment scope from portal presentation. It does not enable equipment export, live synchronization or checkout. It is a membership-evidence layer, not a complete committed sales-order revision implementation.

## Behavior

An applied_removals record is written inside the existing apply_change_order removal branch, after the equipment line is successfully hidden and within the same transaction. It records the order/proposal/organization, original change-order line identity, target equipment line and source payload. Repeated application updates the same source identity rather than creating duplicate receipts. Changing that identity to another order/equipment line is rejected.

The existing reject_change_order restoration path records that restoration in the same transaction as unhiding equipment and changing rejection status. Source relationships and caller organization/active profile are validated at these recording boundaries. The private helpers are invoker functions without browser execution grants, called under the already-privileged existing applier/restorer. They do not create a new public write API or grant new browser access.

The private membership reader returns:

- included: no applied removal or uncertain removal history affects the line. A portal-hidden flag alone does not remove equipment.
- removed: matching evidence proves that an approved removal was applied and not restored.
- unverified: an approved removal lacks evidence, a previously applied removal was unlocked/edited/deleted, identity is inconsistent, or conflicting restoration/removal actions exist.

No legacy receipt is backfilled from approval status or is_hidden. Historical approved removals without application evidence remain unverified and must be reconciled before a future draft can be sold. Pending removal requests do not remove equipment from committed scope. No current proposal visibility, quantity, price or labor calculations are replaced by this reader.

## Migration safety

The migration inserts one private receipt call into each established stored function using guarded anchors. It refuses changed/missing/duplicate anchors or a changed security-definer execution model. Tests compare normalized stored function definitions before and after, proving existing code is unchanged except for those recording calls. All additions/quantity/price/labor branches keep their current behavior. An invalid removal source or failed receipt aborts the removal transaction instead of producing false verification.

The deployed functions were read-only inspected and owned by postgres. Apply this migration with the normal migration owner and verify those ownership/permission assumptions in the test environment. No schema reset, source-row backfill or production deployment is performed by this PR. Receipt records intentionally have no cascading source foreign keys: deleted history must become uncertain, not erase the evidence and silently re-include equipment. RLS is enabled and browser table/function grants are revoked.

This does not repair every existing change-order issue. Approval and equipment application are still separate operations, duplicate-add matching and safe changed-payload reapproval remain separate work, and full order export must prove quantities/prices/additions and committed source revision independently. The future exporter must reject unverified membership; it must not equate this reader's included/removed result with complete-order verification.

## Verification

Run node tests/techsafe/removal-provenance.mjs. It executes the actual migration against an isolated PGlite PostgreSQL fixture using the repository's existing applier and a restoration fixture matching the inspected live function. Tests cover portal-hidden lines, approved-but-unapplied history, successful removal/retry/restoration, unlock/source edit/deletion, pending changes, tenant validation, receipt-failure rollback, conflicting actions, preserved quantity/price/labor/add behavior and private grants/RLS.

Full deployed-schema regression, Supabase API authorization and multi-session concurrency testing remain required before production rollout. Also test all manual, email and portal approval paths in that environment. A receipt failure adds a small local database dependency to removal/rejection; remote Techsafe availability never participates in these transactions. Keep the integration disabled during rollout and reconcile historical uncertainty explicitly.

Rollback requires a reviewed restoration of the two prior function definitions while retaining receipt records. Do not drop evidence or reopen private grants to disable the integration.
