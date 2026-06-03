/*
  # Revoke PUBLIC execute grant on SECURITY DEFINER functions — Batch 3 (grant → update_session_activity)

  Revoke from PUBLIC then re-grant to authenticated only.
  Trigger functions and internal helpers get revoked from all client roles.
*/

-- grant_punchlist_access_directly
REVOKE EXECUTE ON FUNCTION public.grant_punchlist_access_directly(uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_punchlist_access_directly(uuid, integer, text) TO authenticated;

-- handle_deposit_billing_action
REVOKE EXECUTE ON FUNCTION public.handle_deposit_billing_action(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_deposit_billing_action(uuid, boolean) TO authenticated;

-- handle_no_deposit_action
REVOKE EXECUTE ON FUNCTION public.handle_no_deposit_action(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_no_deposit_action(uuid, boolean) TO authenticated;

-- handle_po_acceptance_action
REVOKE EXECUTE ON FUNCTION public.handle_po_acceptance_action(uuid, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_po_acceptance_action(uuid, text, text, boolean) TO authenticated;

-- is_admin_bypass_rls (internal helper, used by RLS policies — keep authenticated access)
REVOKE EXECUTE ON FUNCTION public.is_admin_bypass_rls() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_bypass_rls() TO authenticated;

-- is_global_admin
REVOKE EXECUTE ON FUNCTION public.is_global_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_global_admin() TO authenticated;

-- is_manager_user
REVOKE EXECUTE ON FUNCTION public.is_manager_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_manager_user() TO authenticated;

-- is_staff_user
REVOKE EXECUTE ON FUNCTION public.is_staff_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_staff_user() TO authenticated;

-- is_working_today
REVOKE EXECUTE ON FUNCTION public.is_working_today(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_working_today(uuid, date) TO authenticated;

-- link_work_orders
REVOKE EXECUTE ON FUNCTION public.link_work_orders(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_work_orders(uuid[]) TO authenticated;

-- lock_proposal
REVOKE EXECUTE ON FUNCTION public.lock_proposal(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lock_proposal(uuid) TO authenticated;

-- log_sms
REVOKE EXECUTE ON FUNCTION public.log_sms(uuid, uuid, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_sms(uuid, uuid, text, text, text, text, text) TO authenticated;

-- mark_proposal_activity_viewed (also needs authenticated re-grant after anon revoke)
REVOKE EXECUTE ON FUNCTION public.mark_proposal_activity_viewed(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_proposal_activity_viewed(uuid, uuid) TO authenticated;

-- mark_punchlist_task_completed (also needs authenticated re-grant; 2 overloads)
REVOKE EXECUTE ON FUNCTION public.mark_punchlist_task_completed(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_punchlist_task_completed(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.mark_punchlist_task_completed(uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_punchlist_task_completed(uuid, uuid, boolean) TO authenticated;

-- mark_settings_section_reviewed
REVOKE EXECUTE ON FUNCTION public.mark_settings_section_reviewed(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_settings_section_reviewed(uuid, text) TO authenticated;

-- notify_sales_rep_of_approval
REVOKE EXECUTE ON FUNCTION public.notify_sales_rep_of_approval(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_sales_rep_of_approval(uuid, text) TO authenticated;

-- process_subscription_cancellation
REVOKE EXECUTE ON FUNCTION public.process_subscription_cancellation(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_subscription_cancellation(uuid, text, text) TO authenticated;

-- promote_revision_to_live
REVOKE EXECUTE ON FUNCTION public.promote_revision_to_live(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promote_revision_to_live(uuid, boolean, text) TO authenticated;

-- recalculate_sales_quota_for_user
REVOKE EXECUTE ON FUNCTION public.recalculate_sales_quota_for_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalculate_sales_quota_for_user(uuid) TO authenticated;

-- record_invoice_open (also needs authenticated re-grant; 2 overloads)
REVOKE EXECUTE ON FUNCTION public.record_invoice_open(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_invoice_open(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.record_invoice_open(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_invoice_open(uuid, text, text) TO authenticated;

-- record_proposal_notification (also needs authenticated re-grant)
REVOKE EXECUTE ON FUNCTION public.record_proposal_notification(uuid, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_proposal_notification(uuid, text, text, text, text, jsonb) TO authenticated;

-- refresh_contact_portal_access_cache
REVOKE EXECUTE ON FUNCTION public.refresh_contact_portal_access_cache(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_contact_portal_access_cache(uuid) TO authenticated;

-- reject_change_order
REVOKE EXECUTE ON FUNCTION public.reject_change_order(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_change_order(uuid, text) TO authenticated;

-- renew_punchlist_access
REVOKE EXECUTE ON FUNCTION public.renew_punchlist_access(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.renew_punchlist_access(uuid, integer) TO authenticated;

-- request_punchlist_service (also needs authenticated re-grant)
REVOKE EXECUTE ON FUNCTION public.request_punchlist_service(uuid[], uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_punchlist_service(uuid[], uuid, text) TO authenticated;

-- restore_portal_version
REVOKE EXECUTE ON FUNCTION public.restore_portal_version(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_portal_version(uuid) TO authenticated;

-- revert_proposal_from_snapshot
REVOKE EXECUTE ON FUNCTION public.revert_proposal_from_snapshot(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revert_proposal_from_snapshot(uuid, jsonb) TO authenticated;

-- rollback_time_entry_import
REVOKE EXECUTE ON FUNCTION public.rollback_time_entry_import(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rollback_time_entry_import(uuid) TO authenticated;

-- save_portal_version_snapshot
REVOKE EXECUTE ON FUNCTION public.save_portal_version_snapshot(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_portal_version_snapshot(uuid, text) TO authenticated;

-- send_punchlist_invite
REVOKE EXECUTE ON FUNCTION public.send_punchlist_invite(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_punchlist_invite(uuid) TO authenticated;

-- set_active_revision
REVOKE EXECUTE ON FUNCTION public.set_active_revision(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_active_revision(uuid) TO authenticated;

-- set_global_admin_status
REVOKE EXECUTE ON FUNCTION public.set_global_admin_status(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_global_admin_status(uuid, boolean) TO authenticated;

-- set_job_elr_override
REVOKE EXECUTE ON FUNCTION public.set_job_elr_override(uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_job_elr_override(uuid, numeric, text) TO authenticated;

-- set_organization_plan
REVOKE EXECUTE ON FUNCTION public.set_organization_plan(uuid, text, text, integer, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_organization_plan(uuid, text, text, integer, timestamptz) TO authenticated;

-- start_user_session
REVOKE EXECUTE ON FUNCTION public.start_user_session(uuid, text, text, text, text, text, text, text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_user_session(uuid, text, text, text, text, text, text, text, text, text, uuid) TO authenticated;

-- submit_security_onboarding (also needs authenticated re-grant)
REVOKE EXECUTE ON FUNCTION public.submit_security_onboarding(text, text, text, text, text, text, text, text, text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_security_onboarding(text, text, text, text, text, text, text, text, text, text, text, text, text, jsonb) TO authenticated;

-- toggle_punchlist_access_suspension
REVOKE EXECUTE ON FUNCTION public.toggle_punchlist_access_suspension(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_punchlist_access_suspension(uuid) TO authenticated;

-- toggle_revision_portal_visibility
REVOKE EXECUTE ON FUNCTION public.toggle_revision_portal_visibility(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_revision_portal_visibility(uuid) TO authenticated;

-- transfer_change_order_to_proposal
REVOKE EXECUTE ON FUNCTION public.transfer_change_order_to_proposal(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_change_order_to_proposal(uuid, text) TO authenticated;

-- unarchive_work_order
REVOKE EXECUTE ON FUNCTION public.unarchive_work_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unarchive_work_order(uuid) TO authenticated;

-- unlink_work_order
REVOKE EXECUTE ON FUNCTION public.unlink_work_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unlink_work_order(uuid) TO authenticated;

-- unlock_change_order
REVOKE EXECUTE ON FUNCTION public.unlock_change_order(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unlock_change_order(uuid, text) TO authenticated;

-- unlock_proposal
REVOKE EXECUTE ON FUNCTION public.unlock_proposal(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unlock_proposal(uuid) TO authenticated;

-- update_contact_portal_access
REVOKE EXECUTE ON FUNCTION public.update_contact_portal_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_contact_portal_access(uuid) TO authenticated;

-- update_labor_phase_mapping
REVOKE EXECUTE ON FUNCTION public.update_labor_phase_mapping(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_labor_phase_mapping(uuid, boolean, text) TO authenticated;

-- update_platform_pricing
REVOKE EXECUTE ON FUNCTION public.update_platform_pricing(numeric, numeric, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_platform_pricing(numeric, numeric, integer, text) TO authenticated;

-- update_project_notes_updated_at (trigger function — revoke from all client roles)
REVOKE EXECUTE ON FUNCTION public.update_project_notes_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_project_notes_updated_at() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.update_project_notes_updated_at() FROM anon;

-- update_proposal_pricing
REVOKE EXECUTE ON FUNCTION public.update_proposal_pricing(uuid, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_proposal_pricing(uuid, boolean, boolean) TO authenticated;

-- update_session_activity (2 overloads)
REVOKE EXECUTE ON FUNCTION public.update_session_activity(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_session_activity(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_session_activity(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_session_activity(uuid, text, uuid) TO authenticated;

-- user_can_view_record
REVOKE EXECUTE ON FUNCTION public.user_can_view_record(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_view_record(uuid, uuid) TO authenticated;

-- user_has_module_access
REVOKE EXECUTE ON FUNCTION public.user_has_module_access(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_module_access(uuid, text) TO authenticated;

-- validate_discount_code (also needs authenticated re-grant)
REVOKE EXECUTE ON FUNCTION public.validate_discount_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_discount_code(text) TO authenticated;

-- validate_invoice_amount
REVOKE EXECUTE ON FUNCTION public.validate_invoice_amount(uuid, numeric, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_invoice_amount(uuid, numeric, uuid) TO authenticated;
