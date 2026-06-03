/*
  # Drop Unused Indexes - Batch 1

  ## Summary
  Removes indexes that have 0 scans since server restart and cover low-priority
  columns. These indexes add write overhead without providing read benefit.

  ## Note
  Only indexes on non-critical lookup columns are dropped. FK indexes are kept
  as they are needed for constraint checking and JOIN performance even if
  not scanned as indexes directly.

  ## Indexes Dropped
  Primarily internal tracking/audit columns and redundant org_id indexes
  where the table already has sufficient coverage through other means.
*/

-- Low-value indexes on small/infrequently queried tables
DROP INDEX IF EXISTS idx_auto_clock_out_log_technician_ids;
DROP INDEX IF EXISTS idx_job_photo_likes_created_at;
DROP INDEX IF EXISTS idx_proposal_settings_scope_updated;
DROP INDEX IF EXISTS idx_product_packages_thumbnail;
DROP INDEX IF EXISTS idx_points_configuration_company_id;

-- Redundant organization_id indexes (covered by other composite indexes or RLS functions)
DROP INDEX IF EXISTS idx_product_package_items_org_id;
DROP INDEX IF EXISTS idx_proposal_line_item_labor_phases_org_id;
DROP INDEX IF EXISTS idx_security_contract_emergency_contacts_org_id;
DROP INDEX IF EXISTS idx_clock_out_rewards_log_org_id;
DROP INDEX IF EXISTS idx_clock_in_rewards_log_org_id;
DROP INDEX IF EXISTS idx_discussion_post_bumps_org_id;
DROP INDEX IF EXISTS idx_task_watchers_org_id;
DROP INDEX IF EXISTS idx_daily_clock_breaks_org_id;
DROP INDEX IF EXISTS idx_department_user_overrides_org_id;
DROP INDEX IF EXISTS idx_department_role_access_org_id;
DROP INDEX IF EXISTS idx_contact_tags_org_id;
DROP INDEX IF EXISTS idx_lead_tags_org_id;
DROP INDEX IF EXISTS idx_user_offices_org_id;
DROP INDEX IF EXISTS idx_user_points_org_id;
DROP INDEX IF EXISTS idx_points_transactions_org_id;
DROP INDEX IF EXISTS idx_skills_organization_id;
DROP INDEX IF EXISTS idx_skill_categories_organization_id;
DROP INDEX IF EXISTS idx_priority_levels_organization_id;
DROP INDEX IF EXISTS idx_pipeline_stages_org_id;
DROP INDEX IF EXISTS idx_tax_jurisdictions_organization_id;
DROP INDEX IF EXISTS idx_role_department_access_org_id;
DROP INDEX IF EXISTS idx_role_department_access_department_id;

-- Low-value single-column indexes on rarely-queried columns
DROP INDEX IF EXISTS idx_product_colors_active;
DROP INDEX IF EXISTS idx_product_categories_active;
DROP INDEX IF EXISTS idx_sticky_notes_archived;
DROP INDEX IF EXISTS idx_sticky_notes_pinned;
DROP INDEX IF EXISTS idx_proposal_report_templates_default;
DROP INDEX IF EXISTS idx_proposal_report_templates_company;
DROP INDEX IF EXISTS idx_proposal_report_templates_personal;

-- Redundant on tables with adequate coverage
DROP INDEX IF EXISTS idx_lead_messages_replied_to_message_id;
DROP INDEX IF EXISTS idx_proposal_line_item_labor_phases_line_item;
DROP INDEX IF EXISTS idx_proposal_line_item_labor_phases_composite;
DROP INDEX IF EXISTS idx_line_item_labor_phases_line_item;
DROP INDEX IF EXISTS idx_line_item_labor_phases_composite;
