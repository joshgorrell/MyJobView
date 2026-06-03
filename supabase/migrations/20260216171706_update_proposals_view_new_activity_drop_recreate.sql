/*
  # Update Proposals View to Track NEW Activity
  
  1. Changes
    - Drop and recreate view to update has_recent_activity logic
    - Check if activity exists AFTER user's last view
    - If user hasn't viewed activity yet, show as new if activity exists in last 7 days
    
  2. Logic
    - Get user's last view timestamp for this proposal
    - Check if any activity created after that timestamp exists
    - If no view record exists, fall back to 7-day window
*/

-- Drop the existing view
DROP VIEW IF EXISTS proposals_with_revision_count;

-- Recreate with updated logic
CREATE VIEW proposals_with_revision_count AS
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
  
  -- Revision count
  CASE
    WHEN p.is_revision THEN (
      SELECT COUNT(*) 
      FROM proposals 
      WHERE parent_proposal_id = p.parent_proposal_id 
         OR id = p.parent_proposal_id
    )
    ELSE (
      SELECT COUNT(*) 
      FROM proposals 
      WHERE parent_proposal_id = p.id 
         OR id = p.id
    )
  END AS revision_count,
  
  -- NEW: Check if activity exists after user's last view
  EXISTS (
    SELECT 1
    FROM proposal_activity pa
    WHERE pa.proposal_id = p.id
      AND pa.created_at > COALESCE(
        (SELECT last_viewed_at FROM proposal_activity_views 
         WHERE proposal_id = p.id AND user_id = auth.uid()),
        now() - INTERVAL '7 days'
      )
  ) AS has_recent_activity,
  
  -- Unread customer messages count
  COALESCE(p.unread_customer_messages_count, 0) AS unread_messages_count,
  
  -- Total messages count
  COALESCE((
    SELECT COUNT(*)
    FROM messages m
    JOIN message_threads mt ON m.thread_id = mt.id
    WHERE mt.proposal_id = p.id
  ), 0) AS total_messages_count,
  
  -- Last activity timestamp
  (
    SELECT MAX(pa.created_at)
    FROM proposal_activity pa
    WHERE pa.proposal_id = p.id
  ) AS last_activity_at,
  
  -- Last message timestamp
  (
    SELECT MAX(m.created_at)
    FROM messages m
    JOIN message_threads mt ON m.thread_id = mt.id
    WHERE mt.proposal_id = p.id
  ) AS last_message_at
FROM proposals p;