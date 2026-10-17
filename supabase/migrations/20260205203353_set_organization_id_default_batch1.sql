/*\n  # Set organization_id default to get_user_org_id() - Batch 1\n\n  Adds DEFAULT get_user_org_id() to organization_id columns so that\n  all INSERT operations automatically inherit the authenticated user's\n  organization_id without requiring the frontend to explicitly pass it.\n\n  ## Tables affected (first ~70 tables alphabetically)\n  All tables from appointments through email_workflows\n\n  ## Security impact\n  - Prevents inserts with wrong organization_id (RLS WITH CHECK still enforces)\n  - Simplifies frontend code - no need to pass organization_id in every insert\n  - Anonymous/portal inserts may need explicit organization_id passed\n*/\n\nALTER TABLE appointments ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE auto_clock_out_execution_log ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE bug_notification_settings ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE bug_reports ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE business_cards ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE calendar_members ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE calendars ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE change_order_approvals ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE change_order_documents ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE change_order_history ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE change_order_line_items ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE change_orders ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE clock_in_rewards_log ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE clock_out_rewards_log ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE commission_adjustments ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE commission_payments ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE commission_records ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE company_commission_settings ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE company_messages ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE company_offices ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE competitors ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE connections ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE contact_captures ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE contact_tags ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE contacts ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE contracts ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE control4_projects ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE crew_assignments ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE customers ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE daily_clock_breaks ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE daily_clock_entries ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE default_starred_modules ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE department_access ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE department_modules ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE department_role_access ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE department_user_overrides ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE departments ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE device_location_settings ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE device_nicknames ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE discussion_post_bumps ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE discussion_post_likes ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE discussion_posts ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE distance_matrix_cache ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE email_templates ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE email_workflow_enrollments ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE email_workflow_logs ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE email_workflow_steps ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE email_workflows ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE employee_commission_config ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE enhanced_gps_breadcrumbs ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE feature_suggestions ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE feed_events ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE file_attachments ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE geofence_events ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE gps_breadcrumbs ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE gps_capture_attempts ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\n
