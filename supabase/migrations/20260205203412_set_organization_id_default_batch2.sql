/*\n  # Set organization_id default to get_user_org_id() - Batch 2\n\n  Tables from invoice_change_order_links through proposal_rooms\n\n  ## Purpose\n  Auto-populate organization_id on INSERT without frontend changes\n*/\n\nALTER TABLE invoice_change_order_links ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE invoice_line_item_sources ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE invoice_line_items ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE invoices ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE ip_nicknames ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE issue_reports ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE job_acceptance_log ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE job_completion_templates ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE job_completions ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE job_merge_sources ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE job_merges ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE job_photo_likes ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE job_photos ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE job_split_parts ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE job_splits ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE job_status_history ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE labor_phases ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE lead_messages ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE lead_tags ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE leads ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE location_quality_metrics ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE manufacturers ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE message_threads ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE messages ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE module_access ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE module_role_access ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE module_user_overrides ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE monitoring_services ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE notifications ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE office_travel_settings ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE organization_secrets ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE payment_methods ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE payments ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE pending_payments ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE pending_punchlist_invites ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE pipeline_stages ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE points_configuration ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE points_history ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE points_transactions ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE portal_io_cache ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE portal_views ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE priority_levels ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE priority_settings ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE product_accessories ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE product_categories ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE product_classes ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE product_colors ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE product_inventory ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE product_package_items ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE product_packages ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE product_request_items ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE product_request_settings ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE product_requests ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE product_subcategories ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE products ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE profiles ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE project_commission_overrides ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE project_tasks ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE projects ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE proposal_activity ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE proposal_archive_log ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE proposal_area_templates ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE proposal_class_templates ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE proposal_classes ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE proposal_line_item_labor_phases ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE proposal_line_items ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE proposal_messages ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE proposal_notifications ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE proposal_reactivation_requests ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE proposal_report_templates ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\nALTER TABLE proposal_rooms ALTER COLUMN organization_id SET DEFAULT get_user_org_id()

\n
