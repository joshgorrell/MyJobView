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

- **Task form located:** `src/components/Tasks/TaskForm.tsx` provides contact selection/creation, employee or department assignment, priority levels, due dates, reminders, offline-aware creation, and AI prefill. It already inserts tasks; Smart Intake should reuse its task domain logic rather than replicate its fields and save behavior. Confirm the task's User Flow visibility and notification behavior before routing.
- Locate and inspect the canonical Customer Support creation component, schemas, assignments, and notification mechanisms before writing any alternative insert paths.
- Locate the actual User Flow component/query and check the destination records' eligibility and lifecycle transitions.
- Determine whether one server-side transactional creation endpoint can create destination + intake audit together with tenant authorization and idempotency. Avoid a client-side two-step write that can leave orphaned history.
- Reconcile the intake schema: `intake_items.channel` currently excludes manual; classification currently excludes support. Add explicit origin and destination distinctions in a reviewed migration, with tenant-scoped access controls.
- Ensure selected customer remains stable across asynchronous searches; test unknown/new customer handling, cancellation, retry, attachments, assignment, and office selection.
- Run build, typecheck, contract tests, RLS tests, and User Flow end-to-end tests before enabling submission or merging.

## Safe implementation order

1. Inventory existing Support, Pipeline, and User Flow entry points and database contracts; TaskForm is now identified but its User Flow integration remains unverified.
2. Define a shared intake draft and conditional field rules with no duplicate persisted state.
3. Extract existing domain creation operations; implement secure atomic routing and intake audit.
4. Wire the single form and inbox triage to those operations; verify destination visibility in User Flow.
5. Add tests and complete feature-flagged rollout gates.

**Explicitly deferred:** enabling the prototype's Create button, inserting directly into guessed tables, deploying migrations, and altering production routing.

## Verified destination behavior (follow-up)

- **Tasks:** `TaskForm.handleSubmit` uses `offlineSupabaseInsert('tasks', ...)` with `assigned_to`, `assigned_department_id`, `contact_id`, `due_date`, `reminder_date`, `user_id`, and task points. It also writes `feed_events` for task creation/updates and may create a Google Calendar reminder. Reimplementing task creation as a bare insert would silently lose these behaviors. The existing form redirects to `#tasks` after creation; this is **not** proof of User Flow integration.
- **Service requests:** `ServiceRequestQueue` subscribes to `service_requests` changes and loads non-closed/non-cancelled requests, optionally filtered by priority and source type. Any Smart Intake-created service request must use the same valid schema/status and appear here; queue visibility under source filters requires an explicit check.
- **Atomicity risk:** task creation and `feed_events` creation are separate offline-aware writes today. An intake routing endpoint should not claim atomic audit history unless the database transaction actually includes destination creation and the intake event. Do not bypass existing offline behavior without a migration plan.
- **Tenant isolation check:** `TaskForm.loadContacts/loadUsers/loadDepartments` queries shown in the inspected component lack explicit `organization_id` predicates. Verify enforced RLS and correct tenant context before reusing them in Smart Intake. This is an audit concern, not a confirmed data leak.

## User Flow / Feed integration confirmed from source

- `src/App.tsx` mounts `MasterFeed` for `feed` and `tasks`, with `TasksView` embedded as `tasksContent`. Deep links accept `taskId` and `threadId`; task creation should preserve these existing navigation patterns.
- `src/components/Tasks/TasksView.tsx` loads `tasks` with assignee and department relations and subscribes to `tasks` changes. Its My filter includes tasks created by the user, assigned to the user, assigned to one of the user\'s departments, **and unassigned tasks**. This last rule is broad: do not assume an unassigned task is hidden from employees. Confirm expected product behavior before changing it.
- `TasksView` also reads task-related notifications (`task_assigned`, `task`) and includes `discussion_posts` of `post_type=task`. Smart Intake should create canonical `tasks` records through the existing workflow, not create discussion tasks as a parallel destination.
- `QuickFlowUpdateModal` exists in `src/components/Flow`, but it is a quick composer, **not** the canonical Customer Support ticket form. Customer Support routing is still unresolved; do not invent a support table or conflate a feed discussion with a customer support issue without verifying product semantics.

## Customer Support vs Flow — confirmed source audit

- `src/components/Flow/Flow.tsx` combines a live activity stream, Tasks, and a shared message inbox; `src/components/Flow/CustomerConversations.tsx` persists customer/coworker communications in `message_threads` and `messages` and supports customer/project/work-order context. This is the canonical **conversation** interface, not evidence of a dedicated support-ticket record.
- `src/components/Flow/PostFlowUpdate.tsx` persists `flow_updates` with categories including `working_issue` and `customer_contact`. These are **activity updates**, not a verified lifecycle-managed Customer Support issue with assignment, status, and closure. Do not route support intake into `flow_updates` merely because its category says `working_issue`.
- **Required product decision:** Should Customer Support be a distinct actionable support case with owner/status/resolution, linked to existing Flow customer conversations, or an existing verified case model elsewhere? Locate any current case entity before implementing. Flow should surface linked case activity and the original conversation without duplicating messages.
- **Data separation:** inbound email/SMS receipt is not automatically a `message_threads` record. A reviewed bridge must preserve source/provider IDs, customer consent and visibility, tenant permissions, attachment safety, and idempotency before surfacing external correspondence in customer-facing messaging.
