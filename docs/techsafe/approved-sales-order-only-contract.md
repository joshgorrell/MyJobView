# Techsafe approved Sales Order source contract

MJV owns the change-order lifecycle and the authoritative current Sales Order.
Techsafe does **not** receive, display, replay, or separately approve change orders.

- Draft change orders do not affect the committed Sales Order source.
- Approved, locked change orders contribute their committed parts **and labor** through MJV's existing Sales Order representation.
- Editing an approved change order must leave the last committed Sales Order snapshot unchanged until the revised version is saved and locked.
- Voiding an approved change order must create an auditable reversal in MJV; Techsafe sees only the resulting current approved Sales Order.
- The Techsafe draft may refresh from the newly committed source after tenant, approval, completeness, and freshness checks. Purchased coverage is immutable and must not silently refresh.
- Do not create a separate Techsafe change-order table, UI, or reducer.

**Implementation gate:** The existing `mjvCurrentEquipmentAdapter` is an inspection-only equipment adapter. Its `authorized`, `snapshotReady`, and `quoteReady` outputs remain false. Passing its unit tests does not prove live Techsafe sync or labor inclusion. Before activation, trace the trusted production Sales Order reader, verify that labor is present in the authoritative approved payload and covered by the Techsafe receiver contract, and validate a real approved addition/removal/revision/void without reapplying CO source rows. Do not infer labor from a separate CO list.
