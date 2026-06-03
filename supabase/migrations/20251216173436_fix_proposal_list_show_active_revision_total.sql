/*
  # Fix Proposal List to Show Active Revision Total

  1. Changes
    - Update proposals_with_revision_count view to return the active revision's total
    - If a proposal has an active revision, show that revision's data
    - If no active revision, show the base proposal's data

  2. Purpose
    - Ensures the main proposal list always displays the currently active version
    - Prevents showing outdated totals when revisions exist
*/

-- Drop the old view
DROP VIEW IF EXISTS proposals_with_revision_count;

-- Create updated view that returns active revision data
CREATE OR REPLACE VIEW proposals_with_revision_count AS
WITH revision_counts AS (
  SELECT
    COALESCE(parent_proposal_id, id) as root_id,
    COUNT(*) as revision_count
  FROM proposals
  GROUP BY COALESCE(parent_proposal_id, id)
),
active_revisions AS (
  SELECT DISTINCT ON (parent_proposal_id)
    parent_proposal_id,
    id as active_revision_id,
    total as active_total,
    subtotal as active_subtotal,
    tax_amount as active_tax_amount,
    deposit_amount as active_deposit_amount,
    deposit_amount_due as active_deposit_amount_due,
    title as active_title
  FROM proposals
  WHERE is_revision = true AND is_active_revision = true
  ORDER BY parent_proposal_id, created_at DESC
)
SELECT
  p.id,
  p.company_id,
  p.contact_id,
  p.lead_id,
  p.proposal_number,
  COALESCE(ar.active_title, p.title) as title,
  p.status,
  p.valid_until,
  p.notes,
  p.customer_notes,
  COALESCE(ar.active_subtotal, p.subtotal) as subtotal,
  p.tax_rate,
  COALESCE(ar.active_tax_amount, p.tax_amount) as tax_amount,
  COALESCE(ar.active_total, p.total) as total,
  p.deposit_percent,
  COALESCE(ar.active_deposit_amount, p.deposit_amount) as deposit_amount,
  p.created_by,
  p.sent_at,
  p.viewed_at,
  p.approved_at,
  p.declined_at,
  p.created_at,
  p.updated_at,
  p.office_id,
  p.tax_environment,
  p.tax_project_type,
  p.tax_jurisdiction_id,
  p.tax_override,
  p.tax_override_reason,
  p.expires_at,
  p.last_renewed_at,
  p.renewal_count,
  p.revision_notes,
  p.revision_history,
  p.parts_total,
  p.labor_total,
  COALESCE(ar.active_deposit_amount_due, p.deposit_amount_due) as deposit_amount_due,
  p.purchase_order_number,
  p.purchase_order_file_url,
  p.deposit_invoice_id,
  p.accepted_via_method,
  p.is_revision,
  p.parent_proposal_id,
  p.revision_name,
  p.is_active_revision,
  p.is_portal_visible,
  p.revision_number,
  p.approval_completed_at,
  p.approved_by,
  p.deposit_paid,
  p.deposit_payment_date,
  p.sales_order_id,
  p.discount_percent,
  p.discount_amount,
  p.project_management_percent,
  p.project_management_amount,
  p.project_design_percent,
  p.project_design_amount,
  p.custom_modifier_1_label,
  p.custom_modifier_1_percent,
  p.custom_modifier_1_amount,
  p.custom_modifier_2_label,
  p.custom_modifier_2_percent,
  p.custom_modifier_2_amount,
  p.jobsite_address,
  p.jobsite_city,
  p.jobsite_state,
  p.jobsite_zip,
  p.jobsite_notes,
  p.report_template_id,
  p.use_customer_override,
  p.customer_override_first_name,
  p.customer_override_last_name,
  p.customer_override_company_name,
  p.customer_override_email,
  p.customer_override_phone,
  p.customer_override_street_address,
  p.customer_override_city,
  p.customer_override_state,
  p.customer_override_zip,
  p.approval_notes,
  p.deposit_request_sent,
  p.deposit_request_sent_at,
  p.acceptance_methods,
  p.require_deposit,
  p.deposit_reminder_count,
  p.last_deposit_reminder_sent_at,
  p.show_classes_on_screen,
  p.show_classes_in_report,
  p.created_by_name,
  COALESCE(rc.revision_count, 1) as revision_count,
  ar.active_revision_id,
  CASE WHEN ar.active_revision_id IS NOT NULL THEN true ELSE false END as has_active_revision
FROM proposals p
LEFT JOIN revision_counts rc ON COALESCE(p.parent_proposal_id, p.id) = rc.root_id
LEFT JOIN active_revisions ar ON p.id = ar.parent_proposal_id
WHERE p.is_revision = false;

-- Grant access to view
GRANT SELECT ON proposals_with_revision_count TO authenticated;
