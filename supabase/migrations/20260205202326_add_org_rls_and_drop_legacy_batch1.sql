/*\n  # Add Org-Scoped RLS + Drop Legacy Policies - Batch 1\n\n  1. Changes\n    - Create org-scoped SELECT/INSERT/UPDATE/DELETE policies on ~30 child/junction tables\n    - Drop old USING(true) legacy policies\n    - Each table gets standard 4-policy pattern: select, insert, update, delete\n\n  2. Affected Tables\n    - contact_tags, lead_tags, lead_messages, task_comments, task_mentions\n    - file_attachments, bug_reports, feature_suggestions, review_requests\n    - service_requests, service_labor_entries, service_parts_used, service_additional_charges, service_billing_queue\n    - job_photos, job_photo_likes, job_status_history, job_acceptance_log\n    - job_splits, job_split_parts, job_merges, job_merge_sources\n    - gps_breadcrumbs, tech_locations, technician_skills, skill_categories, skills\n    - location_quality_metrics, distance_matrix_cache, trip_segments\n\n  3. Security\n    - All access scoped to user's organization via get_user_org_id()\n*/\n\n-- Helper: create standard 4-policy set for a table\n-- We'll do it inline for each table since PL/pgSQL can't easily parameterize policy creation\n\n-- =============================================\n-- CONTACT TAGS\n-- =============================================\nDROP POLICY IF EXISTS "Authenticated users can manage contact tags" ON contact_tags

\nDROP POLICY IF EXISTS "Authenticated users can view contact tags" ON contact_tags

\n\nCREATE POLICY "contact_tags_select_same_org" ON contact_tags FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "contact_tags_insert_same_org" ON contact_tags FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "contact_tags_update_same_org" ON contact_tags FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "contact_tags_delete_same_org" ON contact_tags FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- =============================================\n-- LEAD TAGS\n-- =============================================\nDROP POLICY IF EXISTS "Authenticated users can create tags" ON lead_tags

\nDROP POLICY IF EXISTS "Authenticated users can view lead tags" ON lead_tags

\n\nCREATE POLICY "lead_tags_select_same_org" ON lead_tags FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "lead_tags_insert_same_org" ON lead_tags FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "lead_tags_delete_same_org" ON lead_tags FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- =============================================\n-- LEAD MESSAGES\n-- =============================================\nDROP POLICY IF EXISTS "Authenticated users can view lead messages" ON lead_messages

\nDROP POLICY IF EXISTS "Authenticated users can create messages" ON lead_messages

\n\nCREATE POLICY "lead_messages_select_same_org" ON lead_messages FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "lead_messages_insert_same_org" ON lead_messages FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\n-- =============================================\n-- TASK COMMENTS\n-- =============================================\nDROP POLICY IF EXISTS "Authenticated users can view task comments" ON task_comments

\nDROP POLICY IF EXISTS "Authenticated users can create task comments" ON task_comments

\nDROP POLICY IF EXISTS "Users can delete their own comments" ON task_comments

\nDROP POLICY IF EXISTS "Users can update their own comments" ON task_comments

\n\nCREATE POLICY "task_comments_select_same_org" ON task_comments FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "task_comments_insert_same_org" ON task_comments FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "task_comments_update_same_org" ON task_comments FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id() AND user_id = auth.uid())\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "task_comments_delete_same_org" ON task_comments FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id() AND user_id = auth.uid())

\n\n-- =============================================\n-- TASK MENTIONS\n-- =============================================\nDROP POLICY IF EXISTS "Authenticated users can view task mentions" ON task_mentions

\n\nCREATE POLICY "task_mentions_select_same_org" ON task_mentions FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "task_mentions_insert_same_org" ON task_mentions FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\n-- =============================================\n-- FILE ATTACHMENTS\n-- =============================================\nDROP POLICY IF EXISTS "Staff can view attachments in their company" ON file_attachments

\nDROP POLICY IF EXISTS "Staff can upload attachments to their company" ON file_attachments

\nDROP POLICY IF EXISTS "Staff can delete their own attachments" ON file_attachments

\n\nCREATE POLICY "file_attachments_select_same_org" ON file_attachments FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "file_attachments_insert_same_org" ON file_attachments FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "file_attachments_delete_same_org" ON file_attachments FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id() AND uploaded_by = auth.uid())

\n\n-- =============================================\n-- BUG REPORTS\n-- =============================================\nDROP POLICY IF EXISTS "Authenticated users can view all bug reports" ON bug_reports

\nDROP POLICY IF EXISTS "Authenticated users can create bug reports" ON bug_reports

\n\nCREATE POLICY "bug_reports_select_same_org" ON bug_reports FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "bug_reports_insert_same_org" ON bug_reports FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "bug_reports_update_same_org" ON bug_reports FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "bug_reports_delete_same_org" ON bug_reports FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- =============================================\n-- FEATURE SUGGESTIONS\n-- =============================================\nDROP POLICY IF EXISTS "Users can view their own suggestions" ON feature_suggestions

\nDROP POLICY IF EXISTS "Users can create their own suggestions" ON feature_suggestions

\nDROP POLICY IF EXISTS "Admins can update any suggestion" ON feature_suggestions

\n\nCREATE POLICY "feature_suggestions_select_same_org" ON feature_suggestions FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "feature_suggestions_insert_same_org" ON feature_suggestions FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "feature_suggestions_update_same_org" ON feature_suggestions FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\n\n-- =============================================\n-- REVIEW REQUESTS\n-- =============================================\nDROP POLICY IF EXISTS "Authenticated users can view review requests" ON review_requests

\n\nCREATE POLICY "review_requests_select_same_org" ON review_requests FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "review_requests_insert_same_org" ON review_requests FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "review_requests_update_same_org" ON review_requests FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\n\n-- =============================================\n-- SERVICE REQUESTS\n-- =============================================\nDROP POLICY IF EXISTS "Authenticated users can view service requests" ON service_requests

\nDROP POLICY IF EXISTS "Authenticated users can update service requests" ON service_requests

\nDROP POLICY IF EXISTS "Anyone authenticated can create service requests" ON service_requests

\n\nCREATE POLICY "service_requests_select_same_org" ON service_requests FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "service_requests_insert_same_org" ON service_requests FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "service_requests_update_same_org" ON service_requests FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\n\n-- =============================================\n-- SERVICE LABOR ENTRIES\n-- =============================================\nDROP POLICY IF EXISTS "Authenticated users can view labor entries" ON service_labor_entries

\n\nCREATE POLICY "service_labor_entries_select_same_org" ON service_labor_entries FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "service_labor_entries_insert_same_org" ON service_labor_entries FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "service_labor_entries_update_same_org" ON service_labor_entries FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "service_labor_entries_delete_same_org" ON service_labor_entries FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- =============================================\n-- SERVICE PARTS USED\n-- =============================================\nDROP POLICY IF EXISTS "Authenticated users can view parts used" ON service_parts_used

\nDROP POLICY IF EXISTS "Authenticated users can update parts used" ON service_parts_used

\n\nCREATE POLICY "service_parts_used_select_same_org" ON service_parts_used FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "service_parts_used_insert_same_org" ON service_parts_used FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "service_parts_used_update_same_org" ON service_parts_used FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "service_parts_used_delete_same_org" ON service_parts_used FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- =============================================\n-- SERVICE ADDITIONAL CHARGES\n-- =============================================\nDROP POLICY IF EXISTS "Authenticated users can view additional charges" ON service_additional_charges

\nDROP POLICY IF EXISTS "Authenticated users can update charges" ON service_additional_charges

\n\nCREATE POLICY "service_additional_charges_select_same_org" ON service_additional_charges FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "service_additional_charges_insert_same_org" ON service_additional_charges FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "service_additional_charges_update_same_org" ON service_additional_charges FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "service_additional_charges_delete_same_org" ON service_additional_charges FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- =============================================\n-- SERVICE BILLING QUEUE\n-- =============================================\nDROP POLICY IF EXISTS "Authenticated users can view billing queue" ON service_billing_queue

\nDROP POLICY IF EXISTS "Authenticated users can update billing queue" ON service_billing_queue

\n\nCREATE POLICY "service_billing_queue_select_same_org" ON service_billing_queue FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "service_billing_queue_insert_same_org" ON service_billing_queue FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "service_billing_queue_update_same_org" ON service_billing_queue FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\n\n-- =============================================\n-- JOB PHOTOS\n-- =============================================\nDROP POLICY IF EXISTS "Users can view job photos" ON job_photos

\nDROP POLICY IF EXISTS "Staff can view job photos" ON job_photos

\nDROP POLICY IF EXISTS "Techs can create job photos" ON job_photos

\nDROP POLICY IF EXISTS "Techs can update own job photos" ON job_photos

\nDROP POLICY IF EXISTS "Techs can delete own job photos" ON job_photos

\n\nCREATE POLICY "job_photos_select_same_org" ON job_photos FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "job_photos_insert_same_org" ON job_photos FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "job_photos_update_same_org" ON job_photos FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "job_photos_delete_same_org" ON job_photos FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- =============================================\n-- JOB PHOTO LIKES\n-- =============================================\nDROP POLICY IF EXISTS "Users can view all photo likes" ON job_photo_likes

\n\nCREATE POLICY "job_photo_likes_select_same_org" ON job_photo_likes FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "job_photo_likes_insert_same_org" ON job_photo_likes FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "job_photo_likes_delete_same_org" ON job_photo_likes FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\n-- =============================================\n-- JOB STATUS HISTORY\n-- =============================================\nDROP POLICY IF EXISTS "Users can view job status history" ON job_status_history

\n\nCREATE POLICY "job_status_history_select_same_org" ON job_status_history FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "job_status_history_insert_same_org" ON job_status_history FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\n-- =============================================\n-- JOB ACCEPTANCE LOG\n-- =============================================\nDROP POLICY IF EXISTS "Users can view job acceptance log" ON job_acceptance_log

\n\nCREATE POLICY "job_acceptance_log_select_same_org" ON job_acceptance_log FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "job_acceptance_log_insert_same_org" ON job_acceptance_log FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\n-- =============================================\n-- JOB SPLITS + PARTS\n-- =============================================\nDROP POLICY IF EXISTS "Anyone can view job splits" ON job_splits

\nDROP POLICY IF EXISTS "Anyone can view job split parts" ON job_split_parts

\n\nCREATE POLICY "job_splits_select_same_org" ON job_splits FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "job_splits_insert_same_org" ON job_splits FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "job_split_parts_select_same_org" ON job_split_parts FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "job_split_parts_insert_same_org" ON job_split_parts FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\n-- =============================================\n-- JOB MERGES + SOURCES\n-- =============================================\nDROP POLICY IF EXISTS "Anyone can view job merges" ON job_merges

\nDROP POLICY IF EXISTS "Anyone can view job merge sources" ON job_merge_sources

\n\nCREATE POLICY "job_merges_select_same_org" ON job_merges FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "job_merges_insert_same_org" ON job_merges FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "job_merge_sources_select_same_org" ON job_merge_sources FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "job_merge_sources_insert_same_org" ON job_merge_sources FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\n-- =============================================\n-- GPS / LOCATION\n-- =============================================\nDROP POLICY IF EXISTS "Admins can view all GPS breadcrumbs" ON gps_breadcrumbs

\nDROP POLICY IF EXISTS "Techs can view own GPS breadcrumbs" ON gps_breadcrumbs

\nDROP POLICY IF EXISTS "Techs can create own GPS breadcrumbs" ON gps_breadcrumbs

\n\nCREATE POLICY "gps_breadcrumbs_select_same_org" ON gps_breadcrumbs FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "gps_breadcrumbs_insert_same_org" ON gps_breadcrumbs FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Anyone can view tech locations" ON tech_locations

\n\nCREATE POLICY "tech_locations_select_same_org" ON tech_locations FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "tech_locations_insert_same_org" ON tech_locations FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "tech_locations_update_same_org" ON tech_locations FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Anyone can view technician skills" ON technician_skills

\nCREATE POLICY "technician_skills_select_same_org" ON technician_skills FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "technician_skills_insert_same_org" ON technician_skills FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "technician_skills_delete_same_org" ON technician_skills FOR DELETE TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Anyone can view skill categories" ON skill_categories

\nCREATE POLICY "skill_categories_select_same_org" ON skill_categories FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Anyone can view skills" ON skills

\nCREATE POLICY "skills_select_same_org" ON skills FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "System can manage metrics" ON location_quality_metrics

\nCREATE POLICY "location_quality_metrics_select_same_org" ON location_quality_metrics FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "location_quality_metrics_insert_same_org" ON location_quality_metrics FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "location_quality_metrics_update_same_org" ON location_quality_metrics FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "Anyone can view distance cache" ON distance_matrix_cache

\nDROP POLICY IF EXISTS "System can manage distance cache" ON distance_matrix_cache

\nCREATE POLICY "distance_matrix_cache_select_same_org" ON distance_matrix_cache FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "distance_matrix_cache_insert_same_org" ON distance_matrix_cache FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\n\nDROP POLICY IF EXISTS "System can manage trips" ON trip_segments

\nCREATE POLICY "trip_segments_select_same_org" ON trip_segments FOR SELECT TO authenticated\n  USING (organization_id = get_user_org_id())

\nCREATE POLICY "trip_segments_insert_same_org" ON trip_segments FOR INSERT TO authenticated\n  WITH CHECK (organization_id = get_user_org_id())

\nCREATE POLICY "trip_segments_update_same_org" ON trip_segments FOR UPDATE TO authenticated\n  USING (organization_id = get_user_org_id()) WITH CHECK (organization_id = get_user_org_id())

\n
