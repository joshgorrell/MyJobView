# Complete work-order scheduling

Unscheduled intake stays a service request. Every new work order needs a title, customer, active technician, date, start time and later end time. Work-order and appointment writes share a server availability guard. Approved time off blocks booking; only authorized scheduling roles can explicitly override an overlap through the rescheduling RPC.

## Creation and scheduling

- Emergency jobs use the standard work-order form with urgent priority.
- Team creation, request conversion, combined requests, copies, split jobs and recurring series use transactional RPCs. Retry keys return the original result.
- Combined requests must share the customer, project, billing type and service location. Both selected times are saved, and work orders share a group.
- Split parts each need a complete booking and positive estimated hours. Parts cannot overlap for one technician. The original booking is cancelled only inside the same transaction that creates all children. Original notes, tasks, time, parts, photos and billing references are retained. No history is copied into billable parts or deleted.
- Copies require an explicit booking. Remaining open task assignments are copied; consumed parts and actual time are not duplicated.
- Recurring children carry canonical date/start/end fields and open task assignments. Creation happens after the parent's assignments are saved, inside the creation transaction. Time-off or availability failures roll back the whole new series. Weekly selected weekdays and month-end/leap dates are supported. Series have a maximum horizon of five years and 500 occurrences per generation.
- Legacy automatic service-request/VIP conversion triggers and date-only conversion RPC access are removed. VIP work orders use explicit standard creation, with active subscription verification.

## Existing incomplete and overdue work

The migration never backfills, deletes or automatically converts existing work orders. Their notes, progress and close-out can still be saved. Scheduling changes and reopening a closed work order require a complete valid booking. Date changes update both canonical scheduled date and legacy start date.

Dispatch Overview displays an attention banner; Needs attention lists incomplete and overdue unfinished orders with pagination, Review and Finish scheduling/Reschedule. Results refresh on work-order changes and every minute, using the organization's timezone. Completed, cancelled and archived work are excluded. Load failures display an error instead of a false all-clear.

## Deployment gate

The connected MJV project inspected on October 9 was behind current main: `create_work_order_assignments(uuid,jsonb,uuid)` was absent and legacy conversion triggers remained. This change has **not** been applied to that project.

1. Confirm the deployed application's Supabase project reference. Reconcile its migration history with current main; do not blindly run every historical migration against an existing database.
2. In an isolated staging copy, apply required handoff/employee-time/work-order-configuration migrations and this migration. This migration fails before schema changes if the handoff RPC is absent.
3. Run the read-only preflight below and database advisors. Verify all actual RLS grants/policies allow intended staff creation, scheduling and attention queries.
4. Test signed-in admin/service manager creation from customer, project, request, Dispatch, emergency, split, duplicate and recurring paths; confirm the calendar, technician view and billing/history links. Test simultaneous booking from two sessions and appointment/work-order overlap. Test mobile Safari keyboard/focus handling.
5. Deploy the migration before the matching frontend. Refresh clients: older date-only RPCs intentionally stop working. Review existing incomplete records individually; preserve their history.

```sql
select to_regprocedure('public.create_work_order_assignments(uuid,jsonb,uuid)') as handoff_rpc;
select column_name,data_type from information_schema.columns
where table_schema='public' and table_name='work_orders'
and column_name in ('scheduled_date','scheduled_start_time','scheduled_end_time','creation_request_id','creation_sequence');
select tgrelid::regclass,tgname,pg_get_triggerdef(oid) from pg_trigger
where not tgisinternal and tgrelid in ('public.work_orders'::regclass,'public.appointments'::regclass,'public.service_requests'::regclass);
select status,count(*) from public.work_orders
where not coalesce(is_archived,false) and status not in ('completed','cancelled','archived','split')
and (scheduled_date is null or scheduled_start_time is null or scheduled_end_time is null or scheduled_end_time<=scheduled_start_time)
group by status;
```

## Verification

`npm run test:work-orders` includes real PostgreSQL/PGlite tests for completeness, transactions, replay, authorization, hidden appointments, PTO, recurrence and legacy history. `npm run test:work-orders:complete:browser` checks split/combine/schedule forms and attention pagination, error recovery and review at 320/390/768/1280px, including short keyboard-sized viewports. Existing handoff, scheduling/calendar and service-intake browser suites remain required.

The repository-wide type check has an existing failing baseline. Fixture browser tests and PGlite tests do not replace the staging checks above.
