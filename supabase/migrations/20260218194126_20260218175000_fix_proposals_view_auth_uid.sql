/*
  # Fix proposals_with_revision_count View - Auth UID Performance

  ## Summary
  Updates the proposals_with_revision_count view to use (select auth.uid())
  instead of auth.uid() directly. This prevents re-evaluation of the auth
  function for every row in the view, improving query performance.

  The view is recreated with the fix applied to the has_recent_activity subquery.
*/

CREATE OR REPLACE VIEW proposals_with_revision_count AS
SELECT
  id, company_id, contact_id, lead_id, proposal_number, title, status,
  valid_until, notes, customer_notes, subtotal, tax_rate, tax_amount, total,
  deposit_percent, deposit_amount, created_by, sent_at, viewed_at, approved_at,
  declined_at, created_at, updated_at, office_id, tax_environment, tax_project_type,
  tax_jurisdiction_id, tax_override, tax_override_reason, expires_at, last_renewed_at,
  renewal_count, revision_notes, revision_history, parts_total, labor_total,
  deposit_amount_due, purchase_order_number, purchase_order_file_url, deposit_invoice_id,
  accepted_via_method, is_revision, parent_proposal_id, revision_name, is_active_revision,
  is_portal_visible, revision_number, approval_completed_at, approved_by, deposit_paid,
  deposit_payment_date, sales_order_id, discount_percent, discount_amount,
  project_management_percent, project_management_amount, project_design_percent,
  project_design_amount, custom_modifier_1_label, custom_modifier_1_percent,
  custom_modifier_1_amount, custom_modifier_2_label, custom_modifier_2_percent,
  custom_modifier_2_amount, jobsite_address, jobsite_city, jobsite_state, jobsite_zip,
  jobsite_notes, report_template_id, use_customer_override, customer_override_first_name,
  customer_override_last_name, customer_override_company_name, customer_override_email,
  customer_override_phone, customer_override_street_address, customer_override_city,
  customer_override_state, customer_override_zip, approval_notes, deposit_request_sent,
  deposit_request_sent_at, acceptance_methods, require_deposit, deposit_reminder_count,
  last_deposit_reminder_sent_at, show_classes_on_screen, show_classes_in_report,
  created_by_name, system_design_amount, credit_card_fee_amount, misc_parts_amount,
  acceptance_method_used, billing_action_taken, billing_action_type, billing_action_at,
  billing_action_by, customer_notified, customer_notified_at, po_pending, po_document_url,
  suppress_po_notification, suppress_deposit_notification, po_notification_sent_at,
  deposit_notification_sent_at, unread_customer_messages_count, archived_at, archived_by,
  auto_archived, organization_id, payment_terms, is_locked, locked_at, locked_by,
  template_id, last_emailed_at, last_emailed_by,
  CASE
    WHEN is_revision THEN (
      SELECT count(*) FROM proposals
      WHERE proposals.parent_proposal_id = p.parent_proposal_id
         OR proposals.id = p.parent_proposal_id
    )
    ELSE (
      SELECT count(*) FROM proposals
      WHERE proposals.parent_proposal_id = p.id
         OR proposals.id = p.id
    )
  END AS revision_count,
  (EXISTS (
    SELECT 1 FROM proposal_activity pa
    WHERE pa.proposal_id = p.id
      AND pa.created_at > COALESCE(
        (SELECT proposal_activity_views.last_viewed_at
         FROM proposal_activity_views
         WHERE proposal_activity_views.proposal_id = p.id
           AND proposal_activity_views.user_id = (SELECT auth.uid())),
        now() - interval '7 days'
      )
  )) AS has_recent_activity,
  COALESCE(unread_customer_messages_count, 0) AS unread_messages_count,
  COALESCE((
    SELECT count(*) FROM messages m
    JOIN message_threads mt ON m.thread_id = mt.id
    WHERE mt.proposal_id = p.id
  ), 0) AS total_messages_count,
  (SELECT max(pa.created_at) FROM proposal_activity pa WHERE pa.proposal_id = p.id) AS last_activity_at,
  (SELECT max(m.created_at) FROM messages m JOIN message_threads mt ON m.thread_id = mt.id WHERE mt.proposal_id = p.id) AS last_message_at
FROM proposals p;
