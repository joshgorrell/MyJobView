# Supabase migration history reconciliation audit

Generated from connected live Supabase migration listing and GitHub `main` tree on 2026-10-14. **Read-only comparison.** This is not a database migration, and no repair is authorized by this report alone.

- Project: `bqtsuzvuvqvgidipbsis`
- GitHub repository: `joshgorrell/MyJobView`, branch `main`
- Local SQL migration files: 1331
- Remote migration records: 1773
- Remote records lacking an exact matching filename version: 518
- Nonstandard remote version strings with an existing 14-digit local prefix: 398
- Missing canonical 14-digit remote versions: 120

**Important:** Some nonstandard entries may be connector output formatting artifacts rather than invalid Supabase history records. Verify against `supabase_migrations.schema_migrations` before any history repair. Do not use `supabase migration repair`, reset, or reapply SQL based on this report alone. Recover original SQL for each missing version before creating migration files.

## Missing canonical versions

| Remote version | Remote migration name |
|---|---|
| `20251104191142` | create_customer_pipeline |
| `20251109171144` | add_email_reply_tracking |
| `20251112123013` | create_jobs_schema_foundation |
| `20251112143252` | create_priority_settings |
| `20251112145821` | update_tasks_for_assignment_and_rewards |
| `20251117203925` | clean_up_footer_menu_items |
| `20251117203946` | add_feature_suggestions_to_admin |
| `20251118224738` | add_portal_invite_permission |
| `20251120040023` | fix_punchlist_invites_allow_null_project |
| `20251120040042` | update_pending_invites_view_for_manual_invites |
| `20251124152031` | create_security_contracts_system |
| `20251124152122` | add_security_contracts_modules_to_finance |
| `20251204143805` | create_vip_appointment_work_order_automation |
| `20251204143846` | add_vip_appointment_to_work_order_automation |
| `20251204144027` | add_work_order_reminder_tracking_fields |
| `20251207150416` | add_work_schedule_and_clock_in_alerts |
| `20251210163802` | fix_proposal_child_tables_rls_consistency |
| `20251210164000` | fix_remaining_proposal_tables_rls_consistency |
| `20251210164149` | fix_proposal_labor_phases_rls_consistency |
| `20251216144703` | fix_revision_proposal_settings_columns |
| `20251219161413` | update_vip_function_include_trials |
| `20251219161659` | update_vip_check_include_trial_status |
| `20251220152345` | add_gps_to_daily_clock |
| `20260107030442` | add_vip_signup_notification_type_v2 |
| `20260107123218` | add_dismissed_status_to_signup_attempts |
| `20260117214150` | 20260117220000_add_payment_methods_configuration |
| `20260117214230` | 20260117220100_refactor_approval_triggers_remove_deposit_paid |
| `20260117214314` | 20260117220200_create_invoice_payment_status_monitor |
| `20260120152547` | create_time_adjustment_requests_system_v3 |
| `20260124131409` | fix_kiosk_contact_creation_rls |
| `20260126161442` | remove_draft_status_simplify_workflow |
| `20260127225941` | fix_kiosk_contact_creation_policy |
| `20260127230123` | require_email_and_phone_for_kiosk |
| `20260130214217` | add_contact_temperature_field |
| `20260130214924` | add_automatic_temperature_cooling_system |
| `20260203175617` | fix_punchlist_invite_company_id |
| `20260203194142` | enhance_punchlist_conversion_system |
| `20260205200649` | create_organizations_table |
| `20260205200726` | seed_first_organization_from_company_settings |
| `20260205200757` | add_organization_id_to_profiles |
| `20260205200829` | add_organization_id_batch1_core_tables |
| `20260205200853` | add_organization_id_batch2_operations_tables |
| `20260205200915` | add_organization_id_batch3_finance_and_remaining |
| `20260205200955` | add_organization_id_batch4_existing_company_id_tables |
| `20260205201035` | rewrite_rls_policies_tenant_isolation_batch1 |
| `20260205201104` | rewrite_rls_policies_tenant_isolation_batch2 |
| `20260205201731` | add_organization_id_batch1_child_tables |
| `20260205201746` | add_organization_id_batch2_invoice_and_inventory |
| `20260205201830` | add_organization_id_batch3_fixed_v2 |
| `20260205201859` | add_organization_id_batch4_security_and_service |
| `20260205201912` | add_organization_id_batch5_remaining_tables |
| `20260205202227` | drop_legacy_rls_core_tables |
| `20260205202326` | add_org_rls_and_drop_legacy_batch1 |
| `20260205202427` | add_org_rls_and_drop_legacy_batch2 |
| `20260205202550` | add_org_rls_and_drop_legacy_batch3 |
| `20260205202616` | fix_payments_rls_org_scoped |
| `20260205202814` | replace_remaining_legacy_rls_part_a |
| `20260205203100` | replace_remaining_legacy_rls_part_b1_drop_duplicates |
| `20260205203145` | replace_remaining_legacy_rls_part_b2_create_org_policies |
| `20260205203246` | replace_remaining_legacy_rls_part_b3_create_org_policies_final |
| `20260205203353` | set_organization_id_default_batch1 |
| `20260205203412` | set_organization_id_default_batch2 |
| `20260205203436` | set_organization_id_default_batch3 |
| `20260205221851` | add_integration_columns_to_organizations |
| `20260211233523` | add_programming_labor_to_line_items |
| `20260226200608` | fix_notifications_constraint_add_task_types |
| `20260304163839` | add_source_type_to_work_orders |
| `20260309133056` | create_onboarding_progress_table |
| `20260324150648` | add_decline_reason_to_proposals |
| `20260408185056` | add_invoice_display_mode_and_report_attachments |
| `20260408185122` | fix_invoice_line_items_null_item_type |
| `20260409142015` | add_default_calendar_view_to_profiles |
| `20260423143437` | fix_home_clock_notification_trigger |
| `20260423144552` | add_late_clock_in_reason_feature |
| `20260423154046` | update_time_request_notification_message_payroll |
| `20260423163610` | add_can_create_work_orders_permission |
| `20260429184041` | add_proposal_recordings |
| `20260609141225` | add_by_office_module_to_sales_v2 |
| `20260609211200` | add_geo_and_security_flags_to_user_sessions |
| `20260611151318` | add_proposals_visible_rep_ids |
| `20260810172437` | restrict_profile_privilege_column_updates |
| `20260810172726` | enforce_profile_privilege_columns_via_trigger |
| `20260810172752` | require_admin_for_access_control_writes |
| `20260810172827` | hide_company_settings_api_keys_from_clients |
| `20260810172845` | create_company_settings_public_view |
| `20260810173200` | regrant_google_maps_browser_key_column |
| `20260825183230` | add_per_item_source_to_product_request_items |
| `20260911141635` | create_master_state_tax_rules |
| `20260911141810` | index_master_state_tax_rules_foreign_keys |
| `20260915162912` | remove_obsolete_tax_stage_rollback_tables |
| `20260929143846` | my_flow_customer_conversations |
| `20260930154313` | lost_opportunity_reviews |
| `20260930162924` | lost_review_user_permissions |
| `20260930165707` | add_opened_at_to_lost_review_details |
| `20261001005202` | compact_punchlist_and_safe_service_requests |
| `20261001122053` | work_order_configuration_and_program_access |
| `20261001164954` | lost_review_viewed_audit |
| `20261001165805` | lost_job_admin_assessments |
| `20261001170232` | lost_review_office_bid_formats |
| `20261001200540` | add_sales_rep_designation |
| `20261005181941` | employee_welcome_email_tracking |
| `20261008124508` | proposal_check_history |
| `20261008161510` | proposal_check_responses |
| `20261009151501` | flow_portal_messaging |
| `20261009162033` | staff_assignment_designations |
| `20261009171051` | permission_catalog_consistency |
| `20261009171419` | align_legacy_permission_helper |
| `20261009175852` | flow_interactions_and_followups |
| `20261009225730` | project_task_visit_handoff |
| `20261009225736` | service_request_fast_intake |
| `20261009225750` | complete_work_order_scheduling |
| `20261009225938` | harden_work_order_handoff_triggers |
| `20261013110724` | restore_missing_workspace_theme_preference |
| `20261013111939` | browser_session_identity |
| `20261013165010` | external_labor_dashboard |
| `20261013173133` | labor_snapshot_ordering_guard |
| `20261013175929` | labor_project_asof_guard |
| `20261014000227` | proposal_share_links_private_revocable_tokens |
| `20261014000804` | one_share_link_per_proposal |
| `20261014002011` | dealer_proposal_approval_window |

## Verification steps

1. Obtain the raw remote migration history and check each recorded version against the filenames in `supabase/migrations/`.
2. Locate original SQL in repository history, deployment artifacts, or backups; verify SQL against live schema.
3. Commit recovered original migration files using matching versions; never invent empty placeholders.
4. Separately inspect nonstandard version strings for connector formatting artifacts before proposing history changes.
5. Run migration validation against a disposable clone/staging database before touching production history.
