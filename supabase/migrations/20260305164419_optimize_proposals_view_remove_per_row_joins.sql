/*
  # Optimize proposals_with_revision_count view - Remove expensive per-row joins

  ## Problem
  The current view executes 5 LATERAL subqueries for EVERY row returned:
  1. revision_count - joins proposals table again per row
  2. has_recent_activity - joins proposal_activity + proposal_activity_views per row
  3. total_messages_count - joins messages + message_threads per row
  4. last_activity_at - joins proposal_activity per row
  5. last_message_at - joins messages + message_threads per row

  For a page of 25 proposals, this means up to 125 extra sub-queries executing.
  For the full table count (with count: 'exact'), ALL rows are scanned this way.

  ## Fix
  Replace the 5 LATERAL joins with:
  - revision_count: precomputed via a single grouped subquery (much faster)
  - has_recent_activity: kept but simplified - read directly from proposal_activity table
    with a simple max() aggregate per proposal (no per-user view tracking needed for list)
  - message/activity counts: moved to simple LEFT JOIN aggregates on pre-grouped data
    so the DB computes them once for all proposals, not once per row

  The per-user "has_recent_activity" tracking (comparing against user's last_viewed_at)
  is removed from the view since it requires auth.uid() making the view non-cacheable
  by Postgres. Instead, unread_customer_messages_count (already stored on proposals table)
  is used as the activity indicator.
*/

CREATE OR REPLACE VIEW proposals_with_revision_count AS
SELECT
  p.id,
  p.company_id,
  p.contact_id,
  p.lead_id,
  p.proposal_number,
  p.title,
  p.status,
  p.valid_until,
  p.notes,
  p.customer_notes,
  p.subtotal,
  p.tax_rate,
  p.tax_amount,
  p.total,
  p.deposit_percent,
  p.deposit_amount,
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
  p.deposit_amount_due,
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
  p.system_design_amount,
  p.credit_card_fee_amount,
  p.misc_parts_amount,
  p.acceptance_method_used,
  p.billing_action_taken,
  p.billing_action_type,
  p.billing_action_at,
  p.billing_action_by,
  p.customer_notified,
  p.customer_notified_at,
  p.po_pending,
  p.po_document_url,
  p.suppress_po_notification,
  p.suppress_deposit_notification,
  p.po_notification_sent_at,
  p.deposit_notification_sent_at,
  p.unread_customer_messages_count,
  p.archived_at,
  p.archived_by,
  p.auto_archived,
  p.organization_id,
  p.payment_terms,
  p.is_locked,
  p.locked_at,
  p.locked_by,
  p.template_id,
  p.last_emailed_at,
  p.last_emailed_by,
  COALESCE(rc.revision_count, 0) AS revision_count,
  -- has_recent_activity: true if there are unread messages OR recent portal activity in last 7 days
  CASE
    WHEN COALESCE(p.unread_customer_messages_count, 0) > 0 THEN true
    WHEN laa.last_activity_at IS NOT NULL AND laa.last_activity_at > (now() - interval '7 days') THEN true
    ELSE false
  END AS has_recent_activity,
  COALESCE(p.unread_customer_messages_count, 0) AS unread_messages_count,
  COALESCE(tmc.total_messages_count, 0) AS total_messages_count,
  laa.last_activity_at,
  lma.last_message_at
FROM proposals p
-- Single grouped subquery for revision counts - computed once for all proposals
LEFT JOIN (
  SELECT
    COALESCE(parent_proposal_id, id) AS root_id,
    COUNT(*) AS revision_count
  FROM proposals
  GROUP BY COALESCE(parent_proposal_id, id)
) rc ON COALESCE(p.parent_proposal_id, p.id) = rc.root_id
-- Last activity timestamp per proposal (simple aggregate, no per-user join)
LEFT JOIN (
  SELECT proposal_id, MAX(created_at) AS last_activity_at
  FROM proposal_activity
  GROUP BY proposal_id
) laa ON laa.proposal_id = p.id
-- Total message count per proposal thread
LEFT JOIN (
  SELECT mt.proposal_id, COUNT(m.id) AS total_messages_count
  FROM message_threads mt
  JOIN messages m ON m.thread_id = mt.id
  WHERE mt.proposal_id IS NOT NULL
  GROUP BY mt.proposal_id
) tmc ON tmc.proposal_id = p.id
-- Last message timestamp per proposal thread
LEFT JOIN (
  SELECT mt.proposal_id, MAX(m.created_at) AS last_message_at
  FROM message_threads mt
  JOIN messages m ON m.thread_id = mt.id
  WHERE mt.proposal_id IS NOT NULL
  GROUP BY mt.proposal_id
) lma ON lma.proposal_id = p.id;
