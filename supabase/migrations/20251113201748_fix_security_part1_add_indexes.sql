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

-- Some installations never had the legacy jobs schema. Resolve each target
-- explicitly, falling back to public only for legacy jobs tables. Tables or
-- columns introduced by later migrations are intentionally skipped here.
DO $migration$
DECLARE
  target record;
  relation_oid regclass;
  relation_schema text;
BEGIN
  FOR target IN SELECT * FROM (VALUES
      ('idx_appointments_created_by', 'jobs', 'appointments', 'created_by'),
      ('idx_message_threads_created_by', 'jobs', 'message_threads', 'created_by'),
      ('idx_payments_created_by', 'jobs', 'payments', 'created_by'),
      ('idx_projects_office_id', 'jobs', 'projects', 'office_id'),
      ('idx_projects_proposal_id', 'jobs', 'projects', 'proposal_id'),
      ('idx_proposal_line_items_product_id', 'jobs', 'proposal_line_items', 'product_id'),
      ('idx_proposals_lead_id', 'jobs', 'proposals', 'lead_id'),
      ('idx_commission_adjustments_adjusted_by', 'public', 'commission_adjustments', 'adjusted_by'),
      ('idx_commission_adjustments_commission_record_id', 'public', 'commission_adjustments', 'commission_record_id'),
      ('idx_commission_payments_commission_record_id', 'public', 'commission_payments', 'commission_record_id'),
      ('idx_commission_payments_processed_by', 'public', 'commission_payments', 'processed_by'),
      ('idx_connections_lead_id', 'public', 'connections', 'lead_id'),
      ('idx_customers_stage_id', 'public', 'customers', 'stage_id'),
      ('idx_discussion_post_likes_user_id', 'public', 'discussion_post_likes', 'user_id'),
      ('idx_discussion_posts_last_bumped_by', 'public', 'discussion_posts', 'last_bumped_by'),
      ('idx_discussion_posts_lead_id', 'public', 'discussion_posts', 'lead_id'),
      ('idx_feed_events_lead_id', 'public', 'feed_events', 'lead_id'),
      ('idx_feed_events_message_id', 'public', 'feed_events', 'message_id'),
      ('idx_feed_events_user_id', 'public', 'feed_events', 'user_id'),
      ('idx_lead_messages_replied_to_message_id', 'public', 'lead_messages', 'replied_to_message_id'),
      ('idx_lead_messages_user_id', 'public', 'lead_messages', 'user_id'),
      ('idx_leads_created_by', 'public', 'leads', 'created_by'),
      ('idx_notifications_lead_id', 'public', 'notifications', 'lead_id'),
      ('idx_notifications_message_id', 'public', 'notifications', 'message_id'),
      ('idx_points_configuration_company_id', 'public', 'points_configuration', 'company_id'),
      ('idx_project_commission_overrides_created_by', 'public', 'project_commission_overrides', 'created_by'),
      ('idx_reward_redemptions_reward_id', 'public', 'reward_redemptions', 'reward_id'),
      ('idx_rewards_catalog_company_id', 'public', 'rewards_catalog', 'company_id')
  ) AS targets(index_name, preferred_schema, table_name, column_name)
  LOOP
    relation_oid := to_regclass(format('%I.%I', target.preferred_schema, target.table_name));
    IF relation_oid IS NULL AND target.preferred_schema = 'jobs' THEN
      relation_oid := to_regclass(format('public.%I', target.table_name));
    END IF;
    IF relation_oid IS NULL THEN
      RAISE NOTICE 'Skipping index %: table is not present yet', target.index_name;
      CONTINUE;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_attribute
      WHERE attrelid = relation_oid AND attname = target.column_name
        AND attnum > 0 AND NOT attisdropped
    ) THEN
      RAISE NOTICE 'Skipping index %: column is not present', target.index_name;
      CONTINUE;
    END IF;
    SELECT n.nspname INTO relation_schema
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.oid = relation_oid;
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.%I (%I)',
      target.index_name, relation_schema, target.table_name, target.column_name);
  END LOOP;
END;
$migration$;
