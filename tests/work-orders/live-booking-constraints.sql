-- Read-only snapshot of MJV CHECK constraints, audited 2026-10-09.
-- NOT VALID preserves the legacy fixture; every new write is still checked.
ALTER TABLE public.appointments ADD CONSTRAINT appointments_appointment_type_check CHECK ((appointment_type = ANY (ARRAY['customer_meeting'::text, 'personal'::text, 'work_order'::text, 'shop_time'::text, 'training'::text, 'other'::text]))) NOT VALID;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text]))) NOT VALID;
ALTER TABLE public.appointments ADD CONSTRAINT check_all_day_times CHECK (((all_day = true) OR ((all_day = false) AND (start_time IS NOT NULL) AND (end_time IS NOT NULL)))) NOT VALID;
ALTER TABLE public.appointments ADD CONSTRAINT check_customer_meeting_contact CHECK (((appointment_type <> 'customer_meeting'::text) OR ((appointment_type = 'customer_meeting'::text) AND (contact_id IS NOT NULL)))) NOT VALID;
ALTER TABLE public.work_orders ADD CONSTRAINT feedback_email_sent_at_consistency CHECK ((((feedback_email_sent = false) AND (feedback_email_sent_at IS NULL)) OR (feedback_email_sent = true))) NOT VALID;
ALTER TABLE public.work_orders ADD CONSTRAINT project_type_requires_project_id CHECK ((((type = 'project'::text) AND (project_id IS NOT NULL)) OR (type <> 'project'::text))) NOT VALID;
ALTER TABLE public.work_orders ADD CONSTRAINT valid_wo_priority CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text]))) NOT VALID;
ALTER TABLE public.work_orders ADD CONSTRAINT valid_wo_status CHECK ((status = ANY (ARRAY['pending'::text, 'assigned'::text, 'in_progress'::text, 'completed'::text, 'on_hold'::text, 'cancelled'::text]))) NOT VALID;
ALTER TABLE public.work_orders ADD CONSTRAINT valid_wo_type CHECK ((type = ANY (ARRAY['project'::text, 'service'::text, 'site_survey'::text, 'warranty'::text, 'punchlist'::text, 'vip_program'::text]))) NOT VALID;
ALTER TABLE public.work_orders ADD CONSTRAINT vip_requires_subscription CHECK ((((type = 'vip_program'::text) AND (recurring_subscription_id IS NOT NULL)) OR (type <> 'vip_program'::text))) NOT VALID;
ALTER TABLE public.work_orders ADD CONSTRAINT warranty_requires_reference CHECK ((((type = 'warranty'::text) AND (warranty_reference_id IS NOT NULL)) OR (type <> 'warranty'::text))) NOT VALID;
ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_billable_type_check CHECK ((billable_type = ANY (ARRAY['billable'::text, 'warranty'::text, 'project'::text]))) NOT VALID;
ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_source_type_check CHECK ((source_type = ANY (ARRAY['dispatch_calendar'::text, 'technician_calendar'::text, 'service_request'::text, 'project'::text, 'contact'::text, 'work_orders_list'::text, 'punchlist_portal'::text]))) NOT VALID;
ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_warranty_reference_type_check CHECK ((warranty_reference_type = ANY (ARRAY['project'::text, 'service'::text]))) NOT VALID;
ALTER TABLE public.service_requests ADD CONSTRAINT service_requests_billable_by_check CHECK ((billable_by = ANY (ARRAY['admin'::text, 'dispatch'::text, 'assigned_sales_rep'::text, 'other_sales_rep'::text]))) NOT VALID;
ALTER TABLE public.service_requests ADD CONSTRAINT service_requests_billable_type_check CHECK ((billable_type = ANY (ARRAY['billable'::text, 'warranty'::text]))) NOT VALID;
ALTER TABLE public.service_requests ADD CONSTRAINT service_requests_priority_check CHECK ((priority = ANY (ARRAY['normal'::text, 'urgent'::text, 'emergency'::text]))) NOT VALID;
ALTER TABLE public.service_requests ADD CONSTRAINT service_requests_request_type_check CHECK ((request_type = ANY (ARRAY['service'::text, 'project'::text]))) NOT VALID;
ALTER TABLE public.service_requests ADD CONSTRAINT service_requests_source_type_check CHECK ((source_type = ANY (ARRAY['punchlist'::text, 'staff_form'::text, 'customer_portal'::text, 'other'::text]))) NOT VALID;
ALTER TABLE public.service_requests ADD CONSTRAINT service_requests_status_check CHECK ((status = ANY (ARRAY['open'::text, 'scheduled'::text, 'in_progress'::text, 'closed'::text, 'cancelled'::text, 'needs_more_info'::text]))) NOT VALID;
ALTER TABLE public.job_splits ADD CONSTRAINT job_splits_split_type_check CHECK ((split_type = ANY (ARRAY['multi_day'::text, 'multi_tech'::text, 'multi_task'::text]))) NOT VALID;
ALTER TABLE public.job_splits ADD CONSTRAINT job_splits_total_parts_check CHECK ((total_parts > 1)) NOT VALID;
ALTER TABLE public.job_split_parts ADD CONSTRAINT job_split_parts_part_number_check CHECK ((part_number > 0)) NOT VALID;
ALTER TABLE public.project_tasks ADD CONSTRAINT project_tasks_source_check CHECK ((source = ANY (ARRAY['proposal'::text, 'manual'::text, 'customer'::text]))) NOT VALID;
ALTER TABLE public.project_tasks ADD CONSTRAINT project_tasks_status_check CHECK ((status = ANY (ARRAY['open'::text, 'completed'::text, 'cancelled'::text]))) NOT VALID;
ALTER TABLE public.project_tasks ADD CONSTRAINT project_tasks_visibility_check CHECK ((visibility = ANY (ARRAY['internal'::text, 'customer_visible'::text]))) NOT VALID;
