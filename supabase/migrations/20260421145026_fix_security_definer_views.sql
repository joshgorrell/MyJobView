/*
  # Fix Security Definer Views

  Recreates all SECURITY DEFINER views as SECURITY INVOKER (the safe default).
  SECURITY DEFINER views run with the view owner's privileges, bypassing RLS on
  the underlying tables. SECURITY INVOKER views run with the querying user's
  privileges, so RLS is properly enforced.

  Views fixed:
  1. home_clock_events_pending_review
  2. job_photo_stats
  3. session_analytics_by_device
  4. session_analytics_by_location
  5. gps_capture_stats_by_technician
  6. gps_capture_stats_by_day
  7. proposals_with_revision_count
  8. pending_invites_with_details
  9. entries_pending_auto_clock_out
  10. time_entries_with_project
*/

-- 1. home_clock_events_pending_review
CREATE OR REPLACE VIEW public.home_clock_events_pending_review
WITH (security_invoker = true)
AS
SELECT
  dce.id,
  dce.technician_id,
  dce.entry_date,
  dce.clock_in,
  dce.clock_out,
  dce.clock_in_address,
  dce.clock_out_address,
  dce.clocked_in_from_home,
  dce.clocked_out_from_home,
  dce.home_clock_review_status,
  dce.home_clock_review_notes,
  dce.reviewed_by,
  dce.reviewed_at,
  p.full_name AS technician_name,
  p.email AS technician_email,
  p.home_address,
  reviewer.full_name AS reviewed_by_name,
  CASE
    WHEN (dce.clock_in_latitude IS NOT NULL AND dce.clock_in_longitude IS NOT NULL
          AND p.home_latitude IS NOT NULL AND p.home_longitude IS NOT NULL)
      THEN calculate_distance_meters(dce.clock_in_latitude, dce.clock_in_longitude, p.home_latitude, p.home_longitude)
    ELSE NULL::integer
  END AS clock_in_distance_meters,
  CASE
    WHEN (dce.clock_out_latitude IS NOT NULL AND dce.clock_out_longitude IS NOT NULL
          AND p.home_latitude IS NOT NULL AND p.home_longitude IS NOT NULL)
      THEN calculate_distance_meters(dce.clock_out_latitude, dce.clock_out_longitude, p.home_latitude, p.home_longitude)
    ELSE NULL::integer
  END AS clock_out_distance_meters
FROM daily_clock_entries dce
JOIN profiles p ON dce.technician_id = p.id
LEFT JOIN profiles reviewer ON dce.reviewed_by = reviewer.id
WHERE (dce.clocked_in_from_home = true OR dce.clocked_out_from_home = true)
ORDER BY dce.entry_date DESC, dce.clock_in DESC;

-- 2. job_photo_stats
CREATE OR REPLACE VIEW public.job_photo_stats
WITH (security_invoker = true)
AS
SELECT
  jp.id,
  jp.work_order_id,
  jp.technician_id,
  jp.photo_url,
  jp.caption,
  jp.category,
  jp.taken_at,
  jp.created_at,
  p.full_name AS technician_name,
  count(DISTINCT jpl.id) AS like_count
FROM job_photos jp
LEFT JOIN profiles p ON p.id = jp.technician_id
LEFT JOIN job_photo_likes jpl ON jpl.photo_id = jp.id
GROUP BY jp.id, jp.work_order_id, jp.technician_id, jp.photo_url, jp.caption, jp.category, jp.taken_at, jp.created_at, p.full_name;

-- 3. session_analytics_by_device
CREATE OR REPLACE VIEW public.session_analytics_by_device
WITH (security_invoker = true)
AS
SELECT
  us.device_type,
  us.browser_name,
  us.os_name,
  dn.nickname AS device_nickname,
  dn.color AS device_color,
  dn.icon AS device_icon,
  count(DISTINCT us.id) AS session_count,
  count(DISTINCT us.user_id) AS unique_users,
  sum(us.duration_seconds) AS total_time_seconds,
  avg(us.duration_seconds) AS avg_session_duration,
  max(us.last_activity) AS last_seen
FROM user_sessions us
LEFT JOIN device_nicknames dn ON generate_device_signature(us.device_type, us.browser_name, us.os_name) = dn.device_signature
WHERE us.device_type IS NOT NULL
GROUP BY us.device_type, us.browser_name, us.os_name, dn.nickname, dn.color, dn.icon;

-- 4. session_analytics_by_location
CREATE OR REPLACE VIEW public.session_analytics_by_location
WITH (security_invoker = true)
AS
SELECT
  us.ip_address,
  COALESCE(ip.nickname, us.ip_address) AS location_name,
  ip.color,
  ip.icon,
  ip.is_trusted,
  count(DISTINCT us.id) AS session_count,
  count(DISTINCT us.user_id) AS unique_users,
  sum(us.duration_seconds) AS total_time_seconds,
  avg(us.duration_seconds) AS avg_session_duration,
  max(us.last_activity) AS last_seen,
  min(us.session_start) AS first_seen
FROM user_sessions us
LEFT JOIN ip_nicknames ip ON us.ip_address = ip.ip_address
WHERE us.ip_address IS NOT NULL
GROUP BY us.ip_address, ip.nickname, ip.color, ip.icon, ip.is_trusted;

-- 5. gps_capture_stats_by_technician
CREATE OR REPLACE VIEW public.gps_capture_stats_by_technician
WITH (security_invoker = true)
AS
SELECT
  p.id AS technician_id,
  p.full_name,
  p.role,
  count(DISTINCT dce.id) AS total_clock_entries,
  count(CASE WHEN dce.clock_in_gps_capture_method IS NOT NULL THEN 1 END) AS clock_in_gps_attempts,
  count(CASE WHEN dce.clock_in_gps_capture_method <> ALL (ARRAY['failed'::text,'none'::text]) THEN 1 END) AS clock_in_gps_success,
  round(
    (100.0 * count(CASE WHEN dce.clock_in_gps_capture_method <> ALL (ARRAY['failed'::text,'none'::text]) THEN 1 END)::numeric)
    / NULLIF(count(CASE WHEN dce.clock_in_gps_capture_method IS NOT NULL THEN 1 END), 0)::numeric,
    1
  ) AS clock_in_success_rate,
  round(avg(dce.clock_in_gps_accuracy)::numeric, 1) AS avg_clock_in_accuracy,
  round(avg(dce.clock_out_gps_accuracy)::numeric, 1) AS avg_clock_out_accuracy,
  round(avg(dce.clock_in_gps_quality_score), 0) AS avg_clock_in_quality_score,
  round(avg(dce.clock_out_gps_quality_score), 0) AS avg_clock_out_quality_score,
  count(CASE WHEN dce.clock_in_gps_capture_method = 'high_accuracy'::text THEN 1 END) AS high_accuracy_count,
  count(CASE WHEN dce.clock_in_gps_capture_method = 'network'::text THEN 1 END) AS network_count,
  count(CASE WHEN dce.clock_in_gps_capture_method = 'cached'::text THEN 1 END) AS cached_count,
  count(CASE WHEN dce.clock_in_gps_capture_method = ANY (ARRAY['failed'::text,'none'::text]) THEN 1 END) AS failed_count,
  count(CASE WHEN dce.clock_in_gps_refined = true THEN 1 END) AS clock_in_refined_count,
  count(CASE WHEN dce.clock_out_gps_refined = true THEN 1 END) AS clock_out_refined_count,
  round(avg(dce.clock_in_gps_duration_ms), 0) AS avg_capture_duration_ms,
  max(dce.clock_in_gps_captured_at) AS last_gps_capture
FROM profiles p
LEFT JOIN daily_clock_entries dce ON dce.technician_id = p.id
WHERE p.role = ANY (ARRAY['tech'::text,'lead_tech'::text,'tech_manager'::text,'dispatcher'::text,'production_manager'::text])
  AND dce.entry_date >= (CURRENT_DATE - '30 days'::interval)
GROUP BY p.id, p.full_name, p.role
ORDER BY clock_in_success_rate DESC NULLS LAST, total_clock_entries DESC;

-- 6. gps_capture_stats_by_day
CREATE OR REPLACE VIEW public.gps_capture_stats_by_day
WITH (security_invoker = true)
AS
SELECT
  entry_date,
  count(DISTINCT technician_id) AS unique_technicians,
  count(id) AS total_clock_entries,
  count(CASE WHEN clock_in_gps_capture_method <> ALL (ARRAY['failed'::text,'none'::text]) THEN 1 END) AS successful_captures,
  round(
    (100.0 * count(CASE WHEN clock_in_gps_capture_method <> ALL (ARRAY['failed'::text,'none'::text]) THEN 1 END)::numeric)
    / NULLIF(count(id), 0)::numeric,
    1
  ) AS success_rate,
  round(avg(clock_in_gps_accuracy)::numeric, 1) AS avg_accuracy,
  round(avg(clock_in_gps_quality_score), 0) AS avg_quality_score,
  count(CASE WHEN clock_in_gps_capture_method = 'high_accuracy'::text THEN 1 END) AS high_accuracy_count,
  count(CASE WHEN clock_in_gps_capture_method = 'network'::text THEN 1 END) AS network_count,
  count(CASE WHEN clock_in_gps_capture_method = 'cached'::text THEN 1 END) AS cached_count,
  count(CASE WHEN clock_in_gps_capture_method = ANY (ARRAY['failed'::text,'none'::text]) THEN 1 END) AS failed_count
FROM daily_clock_entries dce
WHERE entry_date >= (CURRENT_DATE - '90 days'::interval)
GROUP BY entry_date
ORDER BY entry_date DESC;

-- 7. proposals_with_revision_count
CREATE OR REPLACE VIEW public.proposals_with_revision_count
WITH (security_invoker = true)
AS
SELECT
  p.id, p.company_id, p.contact_id, p.lead_id, p.proposal_number, p.title, p.status,
  p.valid_until, p.notes, p.customer_notes, p.subtotal, p.tax_rate, p.tax_amount, p.total,
  p.deposit_percent, p.deposit_amount, p.created_by, p.sent_at, p.viewed_at, p.approved_at,
  p.declined_at, p.created_at, p.updated_at, p.office_id, p.tax_environment, p.tax_project_type,
  p.tax_jurisdiction_id, p.tax_override, p.tax_override_reason, p.expires_at, p.last_renewed_at,
  p.renewal_count, p.revision_notes, p.revision_history, p.parts_total, p.labor_total,
  p.deposit_amount_due, p.purchase_order_number, p.purchase_order_file_url, p.deposit_invoice_id,
  p.accepted_via_method, p.is_revision, p.parent_proposal_id, p.revision_name,
  p.is_active_revision, p.is_portal_visible, p.revision_number, p.approval_completed_at,
  p.approved_by, p.deposit_paid, p.deposit_payment_date, p.sales_order_id, p.discount_percent,
  p.discount_amount, p.project_management_percent, p.project_management_amount,
  p.project_design_percent, p.project_design_amount, p.custom_modifier_1_label,
  p.custom_modifier_1_percent, p.custom_modifier_1_amount, p.custom_modifier_2_label,
  p.custom_modifier_2_percent, p.custom_modifier_2_amount, p.jobsite_address, p.jobsite_city,
  p.jobsite_state, p.jobsite_zip, p.jobsite_notes, p.report_template_id, p.use_customer_override,
  p.customer_override_first_name, p.customer_override_last_name, p.customer_override_company_name,
  p.customer_override_email, p.customer_override_phone, p.customer_override_street_address,
  p.customer_override_city, p.customer_override_state, p.customer_override_zip, p.approval_notes,
  p.deposit_request_sent, p.deposit_request_sent_at, p.acceptance_methods, p.require_deposit,
  p.deposit_reminder_count, p.last_deposit_reminder_sent_at, p.show_classes_on_screen,
  p.show_classes_in_report, p.created_by_name, p.system_design_amount, p.credit_card_fee_amount,
  p.misc_parts_amount, p.acceptance_method_used, p.billing_action_taken, p.billing_action_type,
  p.billing_action_at, p.billing_action_by, p.customer_notified, p.customer_notified_at,
  p.po_pending, p.po_document_url, p.suppress_po_notification, p.suppress_deposit_notification,
  p.po_notification_sent_at, p.deposit_notification_sent_at, p.unread_customer_messages_count,
  p.archived_at, p.archived_by, p.auto_archived, p.organization_id, p.payment_terms,
  p.is_locked, p.locked_at, p.locked_by, p.template_id, p.last_emailed_at, p.last_emailed_by,
  p.bill_to_contact_id,
  COALESCE(rc.revision_count, 0::bigint) AS revision_count,
  CASE
    WHEN COALESCE(p.unread_customer_messages_count, 0) > 0 THEN true
    WHEN (laa.last_activity_at IS NOT NULL AND laa.last_activity_at > (now() - '7 days'::interval)) THEN true
    ELSE false
  END AS has_recent_activity,
  COALESCE(p.unread_customer_messages_count, 0) AS unread_messages_count,
  COALESCE(tmc.total_messages_count, 0::bigint) AS total_messages_count,
  laa.last_activity_at,
  lma.last_message_at
FROM proposals p
LEFT JOIN (
  SELECT COALESCE(parent_proposal_id, id) AS root_id, count(*) AS revision_count
  FROM proposals
  GROUP BY COALESCE(parent_proposal_id, id)
) rc ON COALESCE(p.parent_proposal_id, p.id) = rc.root_id
LEFT JOIN (
  SELECT proposal_id, max(created_at) AS last_activity_at
  FROM proposal_activity
  GROUP BY proposal_id
) laa ON laa.proposal_id = p.id
LEFT JOIN (
  SELECT mt.proposal_id, count(m.id) AS total_messages_count
  FROM message_threads mt
  JOIN messages m ON m.thread_id = mt.id
  WHERE mt.proposal_id IS NOT NULL
  GROUP BY mt.proposal_id
) tmc ON tmc.proposal_id = p.id
LEFT JOIN (
  SELECT mt.proposal_id, max(m.created_at) AS last_message_at
  FROM message_threads mt
  JOIN messages m ON m.thread_id = mt.id
  WHERE mt.proposal_id IS NOT NULL
  GROUP BY mt.proposal_id
) lma ON lma.proposal_id = p.id;

-- 8. pending_invites_with_details
CREATE OR REPLACE VIEW public.pending_invites_with_details
WITH (security_invoker = true)
AS
SELECT
  pi.id,
  pi.contact_id,
  pi.project_id,
  pi.status,
  pi.created_at,
  pi.reviewed_by,
  pi.reviewed_at,
  pi.decline_reason,
  pi.notes,
  c.full_name AS contact_name,
  c.email AS contact_email,
  c.phone AS contact_phone,
  p.name AS project_name,
  p.project_number,
  p.substantial_completion_date,
  EXTRACT(day FROM (now() - pi.created_at)) AS days_pending,
  reviewer.full_name AS reviewed_by_name
FROM pending_punchlist_invites pi
JOIN contacts c ON c.id = pi.contact_id
LEFT JOIN projects p ON p.id = pi.project_id
LEFT JOIN profiles reviewer ON reviewer.id = pi.reviewed_by
WHERE pi.status = 'pending';

-- 9. entries_pending_auto_clock_out
CREATE OR REPLACE VIEW public.entries_pending_auto_clock_out
WITH (security_invoker = true)
AS
SELECT
  dce.id,
  dce.technician_id,
  p.full_name,
  p.email,
  dce.entry_date,
  dce.clock_in,
  ((((dce.entry_date || ' '::text) || (COALESCE(p.standard_end_time, org.business_day_end_time))::text)::timestamp without time zone) AT TIME ZONE COALESCE(org.timezone, 'America/Chicago')) AS will_clock_out_at,
  (EXTRACT(epoch FROM (now() - dce.clock_in)) / 3600::numeric) AS hours_since_clock_in
FROM daily_clock_entries dce
JOIN profiles p ON p.id = dce.technician_id
JOIN organizations org ON org.id = dce.organization_id
WHERE dce.status = 'clocked_in'
  AND dce.entry_date < CURRENT_DATE
  AND org.auto_clock_out_enabled = true
ORDER BY dce.entry_date, dce.clock_in;

-- 10. time_entries_with_project (exact column order preserved)
CREATE OR REPLACE VIEW public.time_entries_with_project
WITH (security_invoker = true)
AS
SELECT
  te.id,
  te.company_id,
  te.work_order_id,
  te.technician_id,
  te.entry_date,
  te.clock_in,
  te.clock_out,
  te.total_hours,
  te.break_minutes,
  te.overtime_hours,
  te.notes,
  te.status,
  te.approved_by,
  te.approved_at,
  te.created_at,
  te.marked_complete,
  te.clock_in_latitude,
  te.clock_in_longitude,
  te.clock_in_gps_accuracy,
  te.clock_in_gps_capture_method,
  te.clock_in_gps_duration_ms,
  te.clock_in_gps_attempted_at,
  te.clock_in_gps_captured_at,
  te.clock_out_latitude,
  te.clock_out_longitude,
  te.clock_out_gps_accuracy,
  te.clock_out_gps_capture_method,
  te.clock_out_gps_duration_ms,
  te.clock_out_gps_attempted_at,
  te.clock_out_gps_captured_at,
  te.clock_in_gps_refined,
  te.clock_in_gps_refined_at,
  te.clock_in_gps_original_accuracy,
  te.clock_out_gps_refined,
  te.clock_out_gps_refined_at,
  te.clock_out_gps_original_accuracy,
  te.clock_in_address,
  te.clock_out_address,
  te.clock_in_gps_quality_score,
  te.clock_out_gps_quality_score,
  te.organization_id,
  te.import_batch_id,
  te.project_id,
  COALESCE(te.project_id, wo.project_id) AS effective_project_id,
  wo.work_order_number,
  wo.title AS work_order_title,
  wo.type AS work_order_type,
  p.project_number,
  p.name AS project_name,
  p.status AS project_status,
  c.full_name AS contact_name,
  tech.full_name AS technician_name
FROM time_entries te
LEFT JOIN work_orders wo ON te.work_order_id = wo.id
LEFT JOIN projects p ON COALESCE(te.project_id, wo.project_id) = p.id
LEFT JOIN contacts c ON p.contact_id = c.id
LEFT JOIN profiles tech ON te.technician_id = tech.id;
