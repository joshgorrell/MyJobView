/*
  # Remove Unused Indexes - Batch 1

  1. Purpose
    - Remove indexes that are never used to reduce maintenance overhead
    - Improves write performance by reducing index updates
    - Frees up storage space

  2. Strategy
    - Remove clearly unused indexes in batches
    - Keep indexes that may be used in future queries
    - Focus on safe removals first
*/

-- Appointments unused indexes
DROP INDEX IF EXISTS idx_appointments_recurrence_parent;
DROP INDEX IF EXISTS idx_appointments_is_recurring_parent;

-- Subscription cancellations
DROP INDEX IF EXISTS idx_subscription_cancellations_subscription;
DROP INDEX IF EXISTS idx_subscription_cancellations_company;
DROP INDEX IF EXISTS idx_subscription_cancellations_effective_date;
DROP INDEX IF EXISTS idx_subscription_cancellations_reason;

-- Profiles
DROP INDEX IF EXISTS idx_profiles_primary_office;

-- Lead-related
DROP INDEX IF EXISTS idx_leads_fishbowl;
DROP INDEX IF EXISTS idx_lead_tags_tag;
DROP INDEX IF EXISTS idx_leads_priority;
DROP INDEX IF EXISTS idx_leads_converted_from_contact;
DROP INDEX IF EXISTS idx_leads_reminder_date;
DROP INDEX IF EXISTS idx_leads_office_id;

-- Email workflows
DROP INDEX IF EXISTS idx_email_workflow_steps_workflow;
DROP INDEX IF EXISTS idx_email_workflow_enrollments_status;
DROP INDEX IF EXISTS idx_email_workflow_enrollments_contact;
DROP INDEX IF EXISTS idx_email_workflow_enrollments_lead;
DROP INDEX IF EXISTS idx_email_workflow_logs_enrollment;

-- Discussion posts
DROP INDEX IF EXISTS idx_discussion_posts_hashtags;
DROP INDEX IF EXISTS idx_discussion_posts_top_level;
DROP INDEX IF EXISTS idx_discussion_posts_bumped_at;
DROP INDEX IF EXISTS idx_discussion_posts_assigned_to;
DROP INDEX IF EXISTS idx_discussion_posts_completed;
DROP INDEX IF EXISTS idx_discussion_posts_completed_by;
DROP INDEX IF EXISTS idx_discussion_posts_is_private;
DROP INDEX IF EXISTS idx_discussion_posts_last_bumped_by;
DROP INDEX IF EXISTS idx_discussion_posts_lead_id;
DROP INDEX IF EXISTS idx_discussion_post_likes_user_id;
DROP INDEX IF EXISTS idx_discussion_posts_reminder_date;

-- Notifications
DROP INDEX IF EXISTS idx_notifications_unread;
DROP INDEX IF EXISTS idx_notifications_lead_id;
DROP INDEX IF EXISTS idx_notifications_message_id;

-- Technician locations
DROP INDEX IF EXISTS idx_tech_locations_tech_time;
DROP INDEX IF EXISTS idx_tech_locations_active;

-- Tax jurisdictions
DROP INDEX IF EXISTS idx_tax_jurisdictions_zip;
DROP INDEX IF EXISTS idx_tax_jurisdictions_company;
DROP INDEX IF EXISTS idx_tax_jurisdictions_default;

-- Feature suggestions
DROP INDEX IF EXISTS idx_feature_suggestions_status;

-- QuickBooks
DROP INDEX IF EXISTS idx_qbo_synced_customers_qbo_id;

-- Contact tags
DROP INDEX IF EXISTS idx_contact_tags_tag;

-- Contacts
DROP INDEX IF EXISTS idx_contacts_qbo_customer_id;
DROP INDEX IF EXISTS idx_contacts_company_name;
DROP INDEX IF EXISTS idx_contacts_created_by;
DROP INDEX IF EXISTS idx_contacts_office_id;
DROP INDEX IF EXISTS idx_contacts_first_name;
DROP INDEX IF EXISTS idx_contacts_last_name;
DROP INDEX IF EXISTS idx_contacts_assigned_to;
DROP INDEX IF EXISTS idx_contacts_portal_user;

-- Tasks
DROP INDEX IF EXISTS idx_tasks_reminder_date;
DROP INDEX IF EXISTS idx_tasks_contact_id;
DROP INDEX IF EXISTS tasks_assigned_to_idx;
DROP INDEX IF EXISTS tasks_claimed_by_idx;

-- SMS logs
DROP INDEX IF EXISTS idx_sms_logs_contact;
DROP INDEX IF EXISTS idx_sms_logs_appointment;

-- User offices
DROP INDEX IF EXISTS idx_user_offices_office_id;

-- Products
DROP INDEX IF EXISTS idx_products_category;
DROP INDEX IF EXISTS idx_products_active;
DROP INDEX IF EXISTS idx_products_vendor_id;
DROP INDEX IF EXISTS idx_products_manufacturer;
DROP INDEX IF EXISTS idx_products_model_number;
DROP INDEX IF EXISTS idx_products_mpn;
DROP INDEX IF EXISTS idx_products_upc;
DROP INDEX IF EXISTS idx_products_reorder_point;

-- Feed events
DROP INDEX IF EXISTS idx_feed_events_task_id;
DROP INDEX IF EXISTS idx_feed_events_discussion_post_id;
DROP INDEX IF EXISTS idx_feed_events_contact_id;
DROP INDEX IF EXISTS idx_feed_events_lead_id;
DROP INDEX IF EXISTS idx_feed_events_message_id;
DROP INDEX IF EXISTS idx_feed_events_user_id;

-- Points
DROP INDEX IF EXISTS points_history_task_id_idx;

COMMENT ON TABLE appointments IS 'Cleaned up unused recurring appointment indexes';
COMMENT ON TABLE leads IS 'Cleaned up unused lead tracking indexes';
COMMENT ON TABLE contacts IS 'Cleaned up unused contact lookup indexes';
