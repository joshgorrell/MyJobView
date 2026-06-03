/*
  # Optimize proposals_with_revision_count view (v2)

  Replace correlated subqueries with LATERAL joins for significant performance gains.
  The auth.uid() CTE is renamed to avoid conflict with the reserved keyword.
*/

CREATE OR REPLACE VIEW proposals_with_revision_count AS
WITH auth_user AS (
  SELECT auth.uid() AS uid
)
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
  rc.revision_count,
  COALESCE(hra.has_recent_activity, false) AS has_recent_activity,
  COALESCE(p.unread_customer_messages_count, 0) AS unread_messages_count,
  COALESCE(tmc.total_messages_count, 0) AS total_messages_count,
  laa.last_activity_at,
  lma.last_message_at
FROM proposals p
CROSS JOIN auth_user au
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS revision_count
  FROM proposals r
  WHERE
    CASE
      WHEN p.is_revision THEN
        r.parent_proposal_id = p.parent_proposal_id OR r.id = p.parent_proposal_id
      ELSE
        r.parent_proposal_id = p.id OR r.id = p.id
    END
) rc ON true
LEFT JOIN LATERAL (
  SELECT EXISTS (
    SELECT 1
    FROM proposal_activity pa
    WHERE pa.proposal_id = p.id
      AND pa.created_at > COALESCE(
        (SELECT pav.last_viewed_at
         FROM proposal_activity_views pav
         WHERE pav.proposal_id = p.id AND pav.user_id = au.uid),
        now() - interval '7 days'
      )
  ) AS has_recent_activity
) hra ON true
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS total_messages_count
  FROM messages m
  JOIN message_threads mt ON mt.id = m.thread_id
  WHERE mt.proposal_id = p.id
) tmc ON true
LEFT JOIN LATERAL (
  SELECT MAX(pa.created_at) AS last_activity_at
  FROM proposal_activity pa
  WHERE pa.proposal_id = p.id
) laa ON true
LEFT JOIN LATERAL (
  SELECT MAX(m.created_at) AS last_message_at
  FROM messages m
  JOIN message_threads mt ON mt.id = m.thread_id
  WHERE mt.proposal_id = p.id
) lma ON true;
