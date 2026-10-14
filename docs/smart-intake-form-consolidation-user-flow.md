# Smart Intake — form consolidation and User Flow integration audit

Status: design and implementation audit; not a release authorization. Do not deploy migrations, turn on intake routing, or merge on the basis of this document.

## Confirmed existing implementation

- `src/components/Dispatch/ServiceRequestConsole.tsx` has Queue, Analytics, and a feature-flagged Smart Intake tab. New Intake currently opens `ManualIntake` in the same console.
- `src/components/Dispatch/ManualIntake.tsx` independently captures customer, type, priority, subject, details, and some task/support notes. Its Create button is disabled. This is a prototype, **not** an alternative production form.
- `src/components/Service/ServiceRequestForm.tsx` already supports contact search/creation, customer locations and job addresses, service versus project request, scheduling, billability/warranty, technician requests, photos, and service request insert/update. It emits `source_type: 'staff_form'` on new requests.
- `src/components/Dispatch/ServiceRequestQueue.tsx` already displays service requests and converts them to work orders downstream. Smart Intake must not ask for an existing work order at initial receipt.
- The Smart Intake history query reads `intake_items`, but manual entry does not yet create intake history. Intake schema migrations have not been deployed.

## Consolidation decisions

1. **One employee-facing entry form** for manual Service Request, Customer Support, or Task. Do not show a second form after classification. Do not offer Sales Lead or Needs Review as manual types.
2. **Reuse existing service request domain logic**, not duplicate it in a second insert implementation. Extract the reusable contact/location/validation/creation pieces from `ServiceRequestForm` into shared hooks/services and render the relevant fields inside the one intake experience. Preserve the existing standalone form until migrated callers are verified.
3. **Sales stays in Pipeline.** Inbound communications that are sales inquiries may be routed to Pipeline, but the service console should not expose a duplicate lead form.
4. **Needs Review is an exception status**, used for unclassified/ambiguous inbound email or text, never an initial manual creation type.
5. **Track source separately from purpose**: email/SMS/MMS/manual, originating sender and destination, classification, actor, assignment, created record ID, and audit events. Preserve the original message without pretending that manual submissions arrived by email.
6. **User Flow is a release requirement**, not an optional integration: confirm that the created service request, support issue, or task appears in the responsible employee's existing queue, is accessible under the correct permissions, produces only appropriate notifications, and remains actionable through completion.

## Work not yet verified

- Locate and inspect the canonical Customer Support and Task creation components, schemas, assignments, and notification mechanisms before writing any alternative insert paths.
- Locate the actual User Flow component/query and check the destination records' eligibility and lifecycle transitions.
- Determine whether one server-side transactional creation endpoint can create destination + intake audit together with tenant authorization and idempotency. Avoid a client-side two-step write that can leave orphaned history.
- Reconcile the intake schema: `intake_items.channel` currently excludes manual; classification currently excludes support. Add explicit origin and destination distinctions in a reviewed migration, with tenant-scoped access controls.
- Ensure selected customer remains stable across asynchronous searches; test unknown/new customer handling, cancellation, retry, attachments, assignment, and office selection.
- Run build, typecheck, contract tests, RLS tests, and User Flow end-to-end tests before enabling submission or merging.

## Safe implementation order

1. Inventory existing Support, Task, Pipeline, and User Flow entry points and database contracts.
2. Define a shared intake draft and conditional field rules with no duplicate persisted state.
3. Extract existing domain creation operations; implement secure atomic routing and intake audit.
4. Wire the single form and inbox triage to those operations; verify destination visibility in User Flow.
5. Add tests and complete feature-flagged rollout gates.

**Explicitly deferred:** enabling the prototype's Create button, inserting directly into guessed tables, deploying migrations, and altering production routing.
