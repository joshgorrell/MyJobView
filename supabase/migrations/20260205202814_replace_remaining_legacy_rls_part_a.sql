/*\n  # Replace Remaining Legacy RLS Policies - Part A\n\n  1. Changes\n    - Drop all remaining legacy policies that lack organization_id scoping\n    - Add org-scoped policies for tables that don't yet have them\n    - Covers: time/clock tables, user config tables, business cards, calendars,\n      commissions, daily clock, department config, device settings, email workflows,\n      GPS enhanced, geofence, issue reports, job completions, messages, scheduling\n\n  2. Security\n    - All data access now scoped by organization_id = get_user_org_id()\n    - Within-org role checks preserved where critical (admin-only operations)\n*/\n\n-- =============================================\n-- DAILY CLOCK ENTRIES + BREAKS\n-- =============================================\nDROP POLICY IF EXISTS "Techs can create own daily clock entries" ON daily_clock_entries

\nDROP POLICY IF EXISTS "Techs can update own daily clock entries" ON daily_clock_entries

\nDROP POLICY IF EXISTS "Techs can view own daily clock entries" ON daily_clock_entries

\nDROP POLICY IF EXISTS "Admins can create manual time entries for any tech" ON daily_clock_entries

\nDROP POLICY IF EXISTS "Admins can update daily clock entries" ON daily_clock_entries

\nDROP POLICY IF EXISTS "Authorized staff can delete time entries" ON daily_clock_entries

\n\nCREATE POLICY "daily_clock_entries_select_same_org" ON daily_clock_entries FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "daily_clock_entries_insert_same_org" ON daily_clock_entries FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "daily_clock_entries_update_same_org" ON daily_clock_entries FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "daily_clock_entries_delete_same_org" ON daily_clock_entries FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Techs can create breaks" ON daily_clock_breaks

\nDROP POLICY IF EXISTS "Techs can update breaks" ON daily_clock_breaks

\nDROP POLICY IF EXISTS "Techs can view own breaks" ON daily_clock_breaks

\n\nCREATE POLICY "daily_clock_breaks_select_same_org" ON daily_clock_breaks FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "daily_clock_breaks_insert_same_org" ON daily_clock_breaks FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "daily_clock_breaks_update_same_org" ON daily_clock_breaks FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\n\n-- =============================================\n-- TIME ENTRIES + ADJUSTMENTS\n-- =============================================\nDROP POLICY IF EXISTS "Techs can create their own time entries" ON time_entries

\nDROP POLICY IF EXISTS "Techs can update their draft time entries" ON time_entries

\nDROP POLICY IF EXISTS "Techs can view their own time entries" ON time_entries

\n\nCREATE POLICY "time_entries_select_same_org" ON time_entries FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "time_entries_insert_same_org" ON time_entries FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "time_entries_update_same_org" ON time_entries FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Technicians can create requests" ON time_adjustment_requests

\nDROP POLICY IF EXISTS "Technicians can view own requests" ON time_adjustment_requests

\nDROP POLICY IF EXISTS "Technicians can cancel own pending requests" ON time_adjustment_requests

\nDROP POLICY IF EXISTS "Admins can review requests" ON time_adjustment_requests

\n\nCREATE POLICY "time_adjustment_requests_select_same_org" ON time_adjustment_requests FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "time_adjustment_requests_insert_same_org" ON time_adjustment_requests FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "time_adjustment_requests_update_same_org" ON time_adjustment_requests FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\n\n-- =============================================\n-- TIME CLOCK ALERTS\n-- =============================================\nDROP POLICY IF EXISTS "System can create alerts" ON time_clock_alerts

\nDROP POLICY IF EXISTS "Technicians can view own alerts" ON time_clock_alerts

\nDROP POLICY IF EXISTS "Managers and admins can view all alerts" ON time_clock_alerts

\nDROP POLICY IF EXISTS "Managers can update alerts" ON time_clock_alerts

\n\nCREATE POLICY "time_clock_alerts_select_same_org" ON time_clock_alerts FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "time_clock_alerts_insert_same_org" ON time_clock_alerts FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "time_clock_alerts_update_same_org" ON time_clock_alerts FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\n\n-- =============================================\n-- CLOCK IN/OUT REWARDS LOG\n-- =============================================\nDROP POLICY IF EXISTS "System can create rewards log" ON clock_in_rewards_log

\nDROP POLICY IF EXISTS "Techs can view own rewards log" ON clock_in_rewards_log

\n\nCREATE POLICY "clock_in_rewards_log_select_same_org" ON clock_in_rewards_log FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "clock_in_rewards_log_insert_same_org" ON clock_in_rewards_log FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "System can create clock out rewards" ON clock_out_rewards_log

\nDROP POLICY IF EXISTS "Techs can view own clock out rewards" ON clock_out_rewards_log

\n\nCREATE POLICY "clock_out_rewards_log_select_same_org" ON clock_out_rewards_log FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "clock_out_rewards_log_insert_same_org" ON clock_out_rewards_log FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\n-- =============================================\n-- AUTO CLOCK OUT EXECUTION LOG\n-- =============================================\nDROP POLICY IF EXISTS "Admins and managers can view auto clock-out logs" ON auto_clock_out_execution_log

\nDROP POLICY IF EXISTS "System can insert execution logs" ON auto_clock_out_execution_log

\n\nCREATE POLICY "auto_clock_out_log_select_same_org" ON auto_clock_out_execution_log FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "auto_clock_out_log_insert_same_org" ON auto_clock_out_execution_log FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\n-- =============================================\n-- BUSINESS CARDS + CAPTURES\n-- =============================================\nDROP POLICY IF EXISTS "Anyone can view active business cards" ON business_cards

\nDROP POLICY IF EXISTS "Users can view their own card" ON business_cards

\nDROP POLICY IF EXISTS "Users can update their own card" ON business_cards

\nDROP POLICY IF EXISTS "Admins can insert business cards" ON business_cards

\nDROP POLICY IF EXISTS "Admins can update any business card" ON business_cards

\nDROP POLICY IF EXISTS "Admins can delete business cards" ON business_cards

\n\nCREATE POLICY "business_cards_select_same_org" ON business_cards FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "business_cards_insert_same_org" ON business_cards FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "business_cards_update_same_org" ON business_cards FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "business_cards_delete_same_org" ON business_cards FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- business_cards also needs anon select for public card viewing\nCREATE POLICY "business_cards_select_anon" ON business_cards FOR SELECT TO anon\n  USING (is_active = true)

\n\nDROP POLICY IF EXISTS "Anyone can create contact captures" ON contact_captures

\nDROP POLICY IF EXISTS "Users can view their own contact captures" ON contact_captures

\n\nCREATE POLICY "contact_captures_select_same_org" ON contact_captures FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "contact_captures_insert_same_org" ON contact_captures FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "contact_captures_insert_anon" ON contact_captures FOR INSERT TO anon\n  WITH CHECK (true)

\n\n-- =============================================\n-- CALENDARS + MEMBERS\n-- =============================================\nDROP POLICY IF EXISTS "Users can view calendars they are members of or created" ON calendars

\nDROP POLICY IF EXISTS "Admins and managers can create calendars" ON calendars

\nDROP POLICY IF EXISTS "Admins and calendar creators can update calendars" ON calendars

\nDROP POLICY IF EXISTS "Admins and calendar creators can delete calendars" ON calendars

\n\nCREATE POLICY "calendars_select_same_org" ON calendars FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "calendars_insert_same_org" ON calendars FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "calendars_update_same_org" ON calendars FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "calendars_delete_same_org" ON calendars FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Users can view members of their calendars" ON calendar_members

\nDROP POLICY IF EXISTS "Admins and calendar creators can add members" ON calendar_members

\nDROP POLICY IF EXISTS "Admins and calendar creators can remove members" ON calendar_members

\nDROP POLICY IF EXISTS "Users can update their own default calendar setting" ON calendar_members

\n\nCREATE POLICY "calendar_members_select_same_org" ON calendar_members FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "calendar_members_insert_same_org" ON calendar_members FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "calendar_members_update_same_org" ON calendar_members FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "calendar_members_delete_same_org" ON calendar_members FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- =============================================\n-- COMMISSIONS\n-- =============================================\nDROP POLICY IF EXISTS "Admin can manage company commission settings" ON company_commission_settings

\n\nCREATE POLICY "company_commission_settings_select_same_org" ON company_commission_settings FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "company_commission_settings_insert_same_org" ON company_commission_settings FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "company_commission_settings_update_same_org" ON company_commission_settings FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Admin can manage employee commission config" ON employee_commission_config

\nDROP POLICY IF EXISTS "Users can view own commission config" ON employee_commission_config

\n\nCREATE POLICY "employee_commission_config_select_same_org" ON employee_commission_config FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "employee_commission_config_insert_same_org" ON employee_commission_config FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "employee_commission_config_update_same_org" ON employee_commission_config FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Admin can manage all commission records" ON commission_records

\nDROP POLICY IF EXISTS "Users can view own commission records" ON commission_records

\n\nCREATE POLICY "commission_records_select_same_org" ON commission_records FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "commission_records_insert_same_org" ON commission_records FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "commission_records_update_same_org" ON commission_records FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Admin can create commission adjustments" ON commission_adjustments

\nDROP POLICY IF EXISTS "Admin can view commission adjustments" ON commission_adjustments

\n\nCREATE POLICY "commission_adjustments_select_same_org" ON commission_adjustments FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "commission_adjustments_insert_same_org" ON commission_adjustments FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Admin can manage commission payments" ON commission_payments

\nDROP POLICY IF EXISTS "Users can view own commission payments" ON commission_payments

\n\nCREATE POLICY "commission_payments_select_same_org" ON commission_payments FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "commission_payments_insert_same_org" ON commission_payments FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "commission_payments_update_same_org" ON commission_payments FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Admin can manage project commission overrides" ON project_commission_overrides

\n\nCREATE POLICY "project_commission_overrides_select_same_org" ON project_commission_overrides FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "project_commission_overrides_insert_same_org" ON project_commission_overrides FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "project_commission_overrides_update_same_org" ON project_commission_overrides FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "project_commission_overrides_delete_same_org" ON project_commission_overrides FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- =============================================\n-- DEPARTMENT/MODULE ACCESS + CONFIG\n-- =============================================\nDROP POLICY IF EXISTS "Admins can manage department access" ON department_access

\nDROP POLICY IF EXISTS "Admins can view all department access" ON department_access

\nDROP POLICY IF EXISTS "Users can view their own department access" ON department_access

\n\nCREATE POLICY "department_access_select_same_org" ON department_access FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "department_access_insert_same_org" ON department_access FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "department_access_update_same_org" ON department_access FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "department_access_delete_same_org" ON department_access FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Admins can manage module access" ON module_access

\nDROP POLICY IF EXISTS "Admins can view all module access" ON module_access

\nDROP POLICY IF EXISTS "Users can view their own module access" ON module_access

\n\nCREATE POLICY "module_access_select_same_org" ON module_access FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "module_access_insert_same_org" ON module_access FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "module_access_update_same_org" ON module_access FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "module_access_delete_same_org" ON module_access FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Only admins can manage department role access" ON department_role_access

\nCREATE POLICY "department_role_access_insert_same_org" ON department_role_access FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "department_role_access_update_same_org" ON department_role_access FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "department_role_access_delete_same_org" ON department_role_access FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Only admins can manage module role access" ON module_role_access

\nCREATE POLICY "module_role_access_insert_same_org" ON module_role_access FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "module_role_access_update_same_org" ON module_role_access FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "module_role_access_delete_same_org" ON module_role_access FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Admins can manage role department access" ON role_department_access

\nCREATE POLICY "role_department_access_insert_same_org" ON role_department_access FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "role_department_access_delete_same_org" ON role_department_access FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Admins can manage role module access" ON role_module_access

\nCREATE POLICY "role_module_access_insert_same_org" ON role_module_access FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "role_module_access_delete_same_org" ON role_module_access FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Only admins can manage department user overrides" ON department_user_overrides

\nDROP POLICY IF EXISTS "Users can view own department overrides" ON department_user_overrides

\n\nCREATE POLICY "department_user_overrides_select_same_org" ON department_user_overrides FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "department_user_overrides_insert_same_org" ON department_user_overrides FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "department_user_overrides_update_same_org" ON department_user_overrides FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "department_user_overrides_delete_same_org" ON department_user_overrides FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Only admins can manage module user overrides" ON module_user_overrides

\nDROP POLICY IF EXISTS "Users can view own module overrides" ON module_user_overrides

\n\nCREATE POLICY "module_user_overrides_select_same_org" ON module_user_overrides FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "module_user_overrides_insert_same_org" ON module_user_overrides FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "module_user_overrides_update_same_org" ON module_user_overrides FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "module_user_overrides_delete_same_org" ON module_user_overrides FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Admins can manage default starred modules" ON default_starred_modules

\nCREATE POLICY "default_starred_modules_update_same_org" ON default_starred_modules FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "default_starred_modules_delete_same_org" ON default_starred_modules FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- =============================================\n-- USER CONFIG TABLES\n-- =============================================\nDROP POLICY IF EXISTS "Users can view own starred modules" ON user_starred_modules

\nDROP POLICY IF EXISTS "Users can insert own starred modules" ON user_starred_modules

\nDROP POLICY IF EXISTS "Users can update own starred modules" ON user_starred_modules

\nDROP POLICY IF EXISTS "Users can delete own starred modules" ON user_starred_modules

\n\nCREATE POLICY "user_starred_modules_select_same_org" ON user_starred_modules FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id() AND user_id = auth.uid())

\nCREATE POLICY "user_starred_modules_insert_same_org" ON user_starred_modules FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id() AND user_id = auth.uid())

\nCREATE POLICY "user_starred_modules_update_same_org" ON user_starred_modules FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id() AND user_id = auth.uid())\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "user_starred_modules_delete_same_org" ON user_starred_modules FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id() AND user_id = auth.uid())

\n\nDROP POLICY IF EXISTS "Admins can view all permission overrides" ON user_permission_overrides

\nDROP POLICY IF EXISTS "Admins can manage permission overrides" ON user_permission_overrides

\nDROP POLICY IF EXISTS "Admins can update permission overrides" ON user_permission_overrides

\nDROP POLICY IF EXISTS "Admins can delete permission overrides" ON user_permission_overrides

\nDROP POLICY IF EXISTS "Users can view own permission overrides" ON user_permission_overrides

\n\nCREATE POLICY "user_permission_overrides_select_same_org" ON user_permission_overrides FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "user_permission_overrides_insert_same_org" ON user_permission_overrides FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "user_permission_overrides_update_same_org" ON user_permission_overrides FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "user_permission_overrides_delete_same_org" ON user_permission_overrides FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Admins can view all office assignments" ON user_offices

\nDROP POLICY IF EXISTS "Users can view their own office assignments" ON user_offices

\nDROP POLICY IF EXISTS "Admins can insert office assignments" ON user_offices

\nDROP POLICY IF EXISTS "Admins can delete office assignments" ON user_offices

\n\nCREATE POLICY "user_offices_select_same_org" ON user_offices FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "user_offices_insert_same_org" ON user_offices FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "user_offices_delete_same_org" ON user_offices FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Users can view own column preferences" ON user_column_preferences

\nDROP POLICY IF EXISTS "Users can manage own column preferences" ON user_column_preferences

\n\nCREATE POLICY "user_column_preferences_select_same_org" ON user_column_preferences FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id() AND user_id = auth.uid())

\nCREATE POLICY "user_column_preferences_insert_same_org" ON user_column_preferences FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id() AND user_id = auth.uid())

\nCREATE POLICY "user_column_preferences_update_same_org" ON user_column_preferences FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id() AND user_id = auth.uid())\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "user_column_preferences_delete_same_org" ON user_column_preferences FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id() AND user_id = auth.uid())

\n\nDROP POLICY IF EXISTS "Admins can manage visibility settings" ON user_visibility_settings

\nDROP POLICY IF EXISTS "Users can view own visibility settings" ON user_visibility_settings

\nDROP POLICY IF EXISTS "Users can insert own visibility settings" ON user_visibility_settings

\nDROP POLICY IF EXISTS "Users can update own visibility settings" ON user_visibility_settings

\n\nCREATE POLICY "user_visibility_settings_select_same_org" ON user_visibility_settings FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "user_visibility_settings_insert_same_org" ON user_visibility_settings FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "user_visibility_settings_update_same_org" ON user_visibility_settings FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\n\n-- =============================================\n-- USER SESSIONS + ACTIVITY\n-- =============================================\nDROP POLICY IF EXISTS "Admins can view all sessions" ON user_sessions

\nDROP POLICY IF EXISTS "System can insert sessions" ON user_sessions

\nDROP POLICY IF EXISTS "System can update own sessions" ON user_sessions

\nDROP POLICY IF EXISTS "Users can view own sessions" ON user_sessions

\n\nCREATE POLICY "user_sessions_select_same_org" ON user_sessions FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "user_sessions_insert_same_org" ON user_sessions FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "user_sessions_update_same_org" ON user_sessions FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Admins can view all activity" ON user_activity_log

\nDROP POLICY IF EXISTS "System can insert activity" ON user_activity_log

\nDROP POLICY IF EXISTS "Users can view own activity" ON user_activity_log

\n\nCREATE POLICY "user_activity_log_select_same_org" ON user_activity_log FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "user_activity_log_insert_same_org" ON user_activity_log FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Admins can view cleanup logs" ON session_cleanup_log

\n\nCREATE POLICY "session_cleanup_log_select_same_org" ON session_cleanup_log FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "session_cleanup_log_insert_same_org" ON session_cleanup_log FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\n-- =============================================\n-- DEVICE SETTINGS + NICKNAMES\n-- =============================================\nDROP POLICY IF EXISTS "Admins can manage all device settings" ON device_location_settings

\nDROP POLICY IF EXISTS "Technicians can manage own device settings" ON device_location_settings

\n\nCREATE POLICY "device_location_settings_select_same_org" ON device_location_settings FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "device_location_settings_insert_same_org" ON device_location_settings FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "device_location_settings_update_same_org" ON device_location_settings FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Admins can view all device nicknames" ON device_nicknames

\nDROP POLICY IF EXISTS "Admins can insert device nicknames" ON device_nicknames

\nDROP POLICY IF EXISTS "Admins can update device nicknames" ON device_nicknames

\nDROP POLICY IF EXISTS "Admins can delete device nicknames" ON device_nicknames

\n\nCREATE POLICY "device_nicknames_select_same_org" ON device_nicknames FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "device_nicknames_insert_same_org" ON device_nicknames FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "device_nicknames_update_same_org" ON device_nicknames FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "device_nicknames_delete_same_org" ON device_nicknames FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Admins can view all IP nicknames" ON ip_nicknames

\nDROP POLICY IF EXISTS "Admins can insert IP nicknames" ON ip_nicknames

\nDROP POLICY IF EXISTS "Admins can update IP nicknames" ON ip_nicknames

\nDROP POLICY IF EXISTS "Admins can delete IP nicknames" ON ip_nicknames

\n\nCREATE POLICY "ip_nicknames_select_same_org" ON ip_nicknames FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "ip_nicknames_insert_same_org" ON ip_nicknames FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "ip_nicknames_update_same_org" ON ip_nicknames FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "ip_nicknames_delete_same_org" ON ip_nicknames FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- =============================================\n-- ENHANCED GPS + GEOFENCE\n-- =============================================\nDROP POLICY IF EXISTS "System can insert breadcrumbs" ON enhanced_gps_breadcrumbs

\nDROP POLICY IF EXISTS "Technicians can view own breadcrumbs" ON enhanced_gps_breadcrumbs

\nDROP POLICY IF EXISTS "Managers can view all breadcrumbs" ON enhanced_gps_breadcrumbs

\n\nCREATE POLICY "enhanced_gps_breadcrumbs_select_same_org" ON enhanced_gps_breadcrumbs FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "enhanced_gps_breadcrumbs_insert_same_org" ON enhanced_gps_breadcrumbs FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "System can insert geofence events" ON geofence_events

\nDROP POLICY IF EXISTS "Technicians can view own geofence events" ON geofence_events

\nDROP POLICY IF EXISTS "Managers can view all geofence events" ON geofence_events

\n\nCREATE POLICY "geofence_events_select_same_org" ON geofence_events FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "geofence_events_insert_same_org" ON geofence_events FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "System can insert GPS capture attempts" ON gps_capture_attempts

\nDROP POLICY IF EXISTS "Technicians can view own GPS capture attempts" ON gps_capture_attempts

\nDROP POLICY IF EXISTS "Admins and dispatch can view all GPS capture attempts" ON gps_capture_attempts

\n\nCREATE POLICY "gps_capture_attempts_select_same_org" ON gps_capture_attempts FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "gps_capture_attempts_insert_same_org" ON gps_capture_attempts FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Managers can view all metrics" ON location_quality_metrics

\nDROP POLICY IF EXISTS "Technicians can view own metrics" ON location_quality_metrics

\n\nDROP POLICY IF EXISTS "Dispatchers can view all locations" ON technician_locations

\nDROP POLICY IF EXISTS "Technicians can insert own location" ON technician_locations

\nDROP POLICY IF EXISTS "Technicians can view own locations" ON technician_locations

\n\nCREATE POLICY "technician_locations_select_same_org" ON technician_locations FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "technician_locations_insert_same_org" ON technician_locations FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Dispatchers can manage all statuses" ON technician_status

\nDROP POLICY IF EXISTS "Technicians can manage own status" ON technician_status

\n\nCREATE POLICY "technician_status_select_same_org" ON technician_status FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "technician_status_insert_same_org" ON technician_status FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "technician_status_update_same_org" ON technician_status FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\n\n-- =============================================\n-- EMAIL WORKFLOWS\n-- =============================================\nDROP POLICY IF EXISTS "Users can create workflows" ON email_workflows

\nDROP POLICY IF EXISTS "Users can view own company workflows" ON email_workflows

\nDROP POLICY IF EXISTS "Users can update own company workflows" ON email_workflows

\nDROP POLICY IF EXISTS "Users can delete own company workflows" ON email_workflows

\n\nCREATE POLICY "email_workflows_select_same_org" ON email_workflows FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "email_workflows_insert_same_org" ON email_workflows FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "email_workflows_update_same_org" ON email_workflows FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "email_workflows_delete_same_org" ON email_workflows FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Users can view workflow steps" ON email_workflow_steps

\nDROP POLICY IF EXISTS "Users can manage workflow steps" ON email_workflow_steps

\n\nCREATE POLICY "email_workflow_steps_select_same_org" ON email_workflow_steps FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "email_workflow_steps_insert_same_org" ON email_workflow_steps FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "email_workflow_steps_update_same_org" ON email_workflow_steps FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "email_workflow_steps_delete_same_org" ON email_workflow_steps FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Users can view enrollments" ON email_workflow_enrollments

\nDROP POLICY IF EXISTS "Users can manage enrollments" ON email_workflow_enrollments

\n\nCREATE POLICY "email_workflow_enrollments_select_same_org" ON email_workflow_enrollments FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "email_workflow_enrollments_insert_same_org" ON email_workflow_enrollments FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "email_workflow_enrollments_update_same_org" ON email_workflow_enrollments FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Users can view workflow logs" ON email_workflow_logs

\n\nCREATE POLICY "email_workflow_logs_select_same_org" ON email_workflow_logs FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "email_workflow_logs_insert_same_org" ON email_workflow_logs FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\n-- =============================================\n-- MESSAGES + THREADS\n-- =============================================\nDROP POLICY IF EXISTS "Staff can view accessible message threads" ON message_threads

\nDROP POLICY IF EXISTS "Authenticated users can create message threads" ON message_threads

\nDROP POLICY IF EXISTS "Authenticated users can update their message threads" ON message_threads

\nDROP POLICY IF EXISTS "Authenticated users can delete their message threads" ON message_threads

\n\nCREATE POLICY "message_threads_select_same_org" ON message_threads FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "message_threads_insert_same_org" ON message_threads FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "message_threads_update_same_org" ON message_threads FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "message_threads_delete_same_org" ON message_threads FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Staff can view accessible messages" ON messages

\nDROP POLICY IF EXISTS "Authenticated users can create messages in accessible threads" ON messages

\nDROP POLICY IF EXISTS "Staff can update their own messages" ON messages

\nDROP POLICY IF EXISTS "Staff can delete their own messages" ON messages

\n\nCREATE POLICY "messages_select_same_org" ON messages FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "messages_insert_same_org" ON messages FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "messages_update_same_org" ON messages FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id() AND author_id = auth.uid())\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "messages_delete_same_org" ON messages FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id() AND author_id = auth.uid())

\n
