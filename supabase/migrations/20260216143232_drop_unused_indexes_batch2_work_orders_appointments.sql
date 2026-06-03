/*
  # Drop Unused Indexes - Batch 2 (Work Orders, Appointments, Invoices)

  1. Performance Improvements
    - Remove additional unused indexes
    - Reduces storage overhead and speeds up write operations

  2. Tables Targeted
    - work_orders (high-volume table)
    - appointments (frequently accessed)
    - invoices (billing table)
    - time_entries (high-volume table)
    - job_photos (media table)
*/

-- Drop unused work_order indexes
DROP INDEX IF EXISTS public.idx_work_orders_merge_id;
DROP INDEX IF EXISTS public.idx_work_orders_parent_split_id;
DROP INDEX IF EXISTS public.idx_work_orders_project_id;
DROP INDEX IF EXISTS public.idx_work_orders_reminder_pending;
DROP INDEX IF EXISTS public.idx_work_orders_on_my_way;
DROP INDEX IF EXISTS public.idx_work_orders_feedback_sent;
DROP INDEX IF EXISTS public.idx_work_orders_is_billable;
DROP INDEX IF EXISTS public.idx_work_orders_is_archived;
DROP INDEX IF EXISTS public.idx_work_orders_billing_queue;
DROP INDEX IF EXISTS public.idx_work_orders_warranty_ref;
DROP INDEX IF EXISTS public.idx_work_orders_recurring_sub;
DROP INDEX IF EXISTS public.idx_work_orders_appointment;
DROP INDEX IF EXISTS public.idx_work_orders_reminders;
DROP INDEX IF EXISTS public.idx_work_orders_orphaned_created;
DROP INDEX IF EXISTS public.idx_work_orders_group_id;
DROP INDEX IF EXISTS public.idx_work_orders_labor_phase_id;
DROP INDEX IF EXISTS public.idx_work_orders_labor_category;
DROP INDEX IF EXISTS public.idx_work_orders_organization_id;

-- Drop unused appointment indexes
DROP INDEX IF EXISTS public.idx_appointments_project_id;
DROP INDEX IF EXISTS public.idx_appointments_recurrence_parent_id;
DROP INDEX IF EXISTS public.idx_appointments_subscription;
DROP INDEX IF EXISTS public.idx_appointments_recurring_subscription;
DROP INDEX IF EXISTS public.idx_appointments_type;
DROP INDEX IF EXISTS public.idx_appointments_private;
DROP INDEX IF EXISTS public.idx_appointments_organization_id;

-- Drop unused invoice indexes
DROP INDEX IF EXISTS public.idx_invoices_office_id;
DROP INDEX IF EXISTS public.idx_invoices_project_id;
DROP INDEX IF EXISTS public.idx_invoices_orphaned;
DROP INDEX IF EXISTS public.idx_invoices_sales_order;
DROP INDEX IF EXISTS public.idx_invoices_invoice_type;
DROP INDEX IF EXISTS public.idx_invoices_organization_id;

-- Drop unused time_entries indexes
DROP INDEX IF EXISTS public.idx_time_entries_gps_reporting;
DROP INDEX IF EXISTS public.idx_time_entries_missing_clock_in_gps;
DROP INDEX IF EXISTS public.idx_time_entries_missing_clock_out_gps;
DROP INDEX IF EXISTS public.idx_time_entries_gps_accuracy;
DROP INDEX IF EXISTS public.idx_time_entries_clock_in_location;
DROP INDEX IF EXISTS public.idx_time_entries_clock_out_location;
DROP INDEX IF EXISTS public.idx_time_entries_work_order_gps;
DROP INDEX IF EXISTS public.idx_time_entries_project;
DROP INDEX IF EXISTS public.idx_time_entries_work_order_id;
DROP INDEX IF EXISTS public.idx_time_entries_marked_complete;
DROP INDEX IF EXISTS public.idx_time_entries_gps_refined;
DROP INDEX IF EXISTS public.idx_time_entries_gps_quality;
DROP INDEX IF EXISTS public.idx_time_entries_import_batch;
DROP INDEX IF EXISTS public.idx_time_entries_organization_id;

-- Drop unused job_photos indexes
DROP INDEX IF EXISTS public.idx_job_photos_technician_id;
DROP INDEX IF EXISTS public.idx_job_photos_work_order_id;
DROP INDEX IF EXISTS public.idx_job_photos_media_type;
DROP INDEX IF EXISTS public.idx_job_photos_contact_id;
DROP INDEX IF EXISTS public.idx_job_photos_project_id;
DROP INDEX IF EXISTS public.idx_job_photos_created_at_desc;
DROP INDEX IF EXISTS public.idx_job_photos_category_created_at;
DROP INDEX IF EXISTS public.idx_job_photos_media_type_created_at;
DROP INDEX IF EXISTS public.idx_job_photos_paparazzi_request_id;
DROP INDEX IF EXISTS public.idx_job_photos_bonus_points;
DROP INDEX IF EXISTS public.idx_job_photos_organization_id;
