# Customer-first job time

Time Clock → Record Job Time opens one customer-first recorder. A customer’s open projects appear separately from service Work Orders. Selecting a project reveals its open Project Work Orders and a project-time option outside a Work Order. Service visits linked to a project remain in Service, including legacy visits that inherit the customer through a closed project. The project link does not redefine a service visit as project work.

Customer Activity is available even when no project or service Work Order exists. Meeting, Site Survey, Troubleshooting and Other require notes. Changing customer clears the target. A failed work lookup offers Retry rather than presenting an empty list as proof no work exists.

Assigned Work Order timers use the existing canonical start/stop controls and retain assignment rules. Anyone can submit already-worked time against a selected target for manager review. The recorder does not create projects, Work Orders or service requests, change assignments, or complete Work Orders.

Project time outside a Work Order and Customer Activity timers use `customer_time_sessions`. They persist start time server-side, use stable IDs for start retries, prevent concurrent canonical/customer timers through a shared employee row lock, and capture explicit-event GPS evidence (including denied attempts). Starts/stops require connectivity; an offline stop leaves the server timer running and explains that to the user. GPS saves use the existing account-owned durable offline queue. This feature does not introduce continuous web location tracking.

Stopping creates one pending manual-time request; long sessions split into requests no longer than 24 hours. The timer and requests commit atomically, and repeat stops return the original request. Another manager reviews requests through the existing queue. No payable canonical time is created until approval. Approval stores contact, activity and derived Project/Service/Customer Activity classification; original request data and edited-review audit remain intact. History includes the customer and classification. Effective employee configuration still controls payroll: salary remains salary, daily clock pay is not duplicated, and allocation payroll uses approved time. Pending allocation requests/running customer timers block finalization for the relevant schedule/period.

## Release

Apply `20261021174441_customer_first_job_time.sql` before publishing the web application. It extends existing tables and adds an RLS-protected timer table and authenticated start/stop RPCs. No existing time is rewritten. The established legacy authority migration is a prerequisite; the tests also load the native live internal-time guard migration and production Work Order/project inheritance trigger snapshot.

This change implements the web flow, including responsive phone browsers. The Expo native recorder is not changed. Existing native timers share database overlap protection; use the web Time Clock to stop customer/project timers started here.

Validation: customer-time database tests exercise tenant/ownership boundaries, customer mismatch, service-with-project classification, GPS writes, retry/overlap/atomic stop, pending payroll and disabled actors. Browser fixtures test customer-first selection and payloads at 320px, 390px and desktop, including an empty customer, legacy service on a closed project, assignment restrictions and customer switching. Browser data and the Work Order control are mocked; the actual Work Order controls and authority functions have their separate existing suites. Isolated tests do not certify hosted migration rollout or physical-device GPS.
