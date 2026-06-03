/*
  # Fix Database Security - Part 1: Add Missing Foreign Key Indexes

  ## Changes
  - Added indexes for all unindexed foreign keys in jobs schema
  - Added indexes for all unindexed foreign keys in public schema
  - Improves query performance for joins and foreign key lookups

  ## Performance Impact
  - Significantly improves JOIN performance
  - Reduces query execution time for foreign key lookups
  - Minimal impact on INSERT/UPDATE operations
*/

-- Jobs schema indexes
CREATE INDEX IF NOT EXISTS idx_appointments_created_by ON jobs.appointments(created_by);
CREATE INDEX IF NOT EXISTS idx_message_threads_created_by ON jobs.message_threads(created_by);
CREATE INDEX IF NOT EXISTS idx_payments_created_by ON jobs.payments(created_by);
CREATE INDEX IF NOT EXISTS idx_projects_office_id ON jobs.projects(office_id);
CREATE INDEX IF NOT EXISTS idx_projects_proposal_id ON jobs.projects(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_line_items_product_id ON jobs.proposal_line_items(product_id);
CREATE INDEX IF NOT EXISTS idx_proposals_lead_id ON jobs.proposals(lead_id);

-- Public schema indexes
CREATE INDEX IF NOT EXISTS idx_commission_adjustments_adjusted_by ON public.commission_adjustments(adjusted_by);
CREATE INDEX IF NOT EXISTS idx_commission_adjustments_commission_record_id ON public.commission_adjustments(commission_record_id);
CREATE INDEX IF NOT EXISTS idx_commission_payments_commission_record_id ON public.commission_payments(commission_record_id);
CREATE INDEX IF NOT EXISTS idx_commission_payments_processed_by ON public.commission_payments(processed_by);
CREATE INDEX IF NOT EXISTS idx_connections_lead_id ON public.connections(lead_id);
CREATE INDEX IF NOT EXISTS idx_customers_stage_id ON public.customers(stage_id);
CREATE INDEX IF NOT EXISTS idx_discussion_post_likes_user_id ON public.discussion_post_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_discussion_posts_last_bumped_by ON public.discussion_posts(last_bumped_by);
CREATE INDEX IF NOT EXISTS idx_discussion_posts_lead_id ON public.discussion_posts(lead_id);
CREATE INDEX IF NOT EXISTS idx_feed_events_lead_id ON public.feed_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_feed_events_message_id ON public.feed_events(message_id);
CREATE INDEX IF NOT EXISTS idx_feed_events_user_id ON public.feed_events(user_id);
CREATE INDEX IF NOT EXISTS idx_lead_messages_replied_to_message_id ON public.lead_messages(replied_to_message_id);
CREATE INDEX IF NOT EXISTS idx_lead_messages_user_id ON public.lead_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_created_by ON public.leads(created_by);
CREATE INDEX IF NOT EXISTS idx_notifications_lead_id ON public.notifications(lead_id);
CREATE INDEX IF NOT EXISTS idx_notifications_message_id ON public.notifications(message_id);
CREATE INDEX IF NOT EXISTS idx_points_configuration_company_id ON public.points_configuration(company_id);
CREATE INDEX IF NOT EXISTS idx_project_commission_overrides_created_by ON public.project_commission_overrides(created_by);
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_reward_id ON public.reward_redemptions(reward_id);
CREATE INDEX IF NOT EXISTS idx_rewards_catalog_company_id ON public.rewards_catalog(company_id);