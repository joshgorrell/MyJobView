# Existing Service Queue integration audit

The real MJV screen is src/components/Dispatch/ServiceRequestQueue.tsx, mounted through ServiceRequestConsole. It already subscribes to public.service_requests postgres_changes and reloads on changes. **Do not add a redundant polling or realtime mechanism.** New Smart Intake service requests should use the existing service_requests schema and will flow into that queue automatically, subject to current filters and RLS.

Per-user notifications are independent of access. The staged intake_notification_preferences migration defaults all categories off and intentionally does not grant direct browser access until existing MJV organization membership and role authorization conventions are verified.

Remaining integration: server-side notification fan-out with per-user opt-in, secure preference management UI, and service-request creation after AI classification. No automatic assignment or claiming.
