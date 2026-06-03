/*
  # Add Performance Indexes for Frequently Filtered Columns

  ## Purpose
  Adds missing database indexes on columns that are frequently used in WHERE clauses,
  JOINs, and ORDER BY operations across the application. These indexes dramatically
  reduce query times on large datasets.

  ## Indexes Added

  ### contacts table
  - `temperature`, `contact_type`, `is_prospect`, `created_by`, `assigned_to`, `created_at`

  ### leads table
  - `created_by`, `status`

  ### discussion_posts table
  - `parent_id` (critical for optimized bulk reply fetch), `bumped_at`

  ### discussion_post_likes table
  - `post_id`, composite `user_id + post_id`

  ### connections table
  - composite `user_id + connection_date`

  ### points_transactions table
  - composite `user_id + created_at`

  ### user_sessions table
  - composite `user_id + last_activity`, `is_active`

  ### daily_clock_entries table
  - partial index for clocked-in users (clock_out IS NULL)

  ### proposals, work_orders
  - `status`, `created_by`, `assigned_to`
*/

-- contacts: temperature filter (ContactsView segments)
CREATE INDEX IF NOT EXISTS idx_contacts_temperature
  ON contacts (temperature)
  WHERE temperature IS NOT NULL;

-- contacts: contact_type filter
CREATE INDEX IF NOT EXISTS idx_contacts_contact_type
  ON contacts (contact_type)
  WHERE contact_type IS NOT NULL;

-- contacts: is_prospect boolean
CREATE INDEX IF NOT EXISTS idx_contacts_is_prospect
  ON contacts (is_prospect);

-- contacts: created_by for rep-based queries
CREATE INDEX IF NOT EXISTS idx_contacts_created_by
  ON contacts (created_by)
  WHERE created_by IS NOT NULL;

-- contacts: assigned_to for assignment views
CREATE INDEX IF NOT EXISTS idx_contacts_assigned_to
  ON contacts (assigned_to)
  WHERE assigned_to IS NOT NULL;

-- contacts: created_at for date range queries
CREATE INDEX IF NOT EXISTS idx_contacts_created_at
  ON contacts (created_at DESC);

-- leads: created_by for rep breakdown
CREATE INDEX IF NOT EXISTS idx_leads_created_by
  ON leads (created_by)
  WHERE created_by IS NOT NULL;

-- leads: status for pipeline views
CREATE INDEX IF NOT EXISTS idx_leads_status
  ON leads (status)
  WHERE status IS NOT NULL;

-- discussion_posts: parent_id for bulk reply fetch
CREATE INDEX IF NOT EXISTS idx_discussion_posts_parent_id
  ON discussion_posts (parent_id)
  WHERE parent_id IS NOT NULL;

-- discussion_posts: bumped_at for sort order
CREATE INDEX IF NOT EXISTS idx_discussion_posts_bumped_at
  ON discussion_posts (bumped_at DESC)
  WHERE bumped_at IS NOT NULL;

-- discussion_post_likes: post_id for bulk like fetch
CREATE INDEX IF NOT EXISTS idx_discussion_post_likes_post_id
  ON discussion_post_likes (post_id);

-- discussion_post_likes: user_id + post_id for user's own like check
CREATE INDEX IF NOT EXISTS idx_discussion_post_likes_user_post
  ON discussion_post_likes (user_id, post_id);

-- connections: user_id + connection_date composite
CREATE INDEX IF NOT EXISTS idx_connections_user_id_date
  ON connections (user_id, connection_date DESC);

-- points_transactions: user_id + created_at composite
CREATE INDEX IF NOT EXISTS idx_points_transactions_user_created
  ON points_transactions (user_id, created_at DESC);

-- user_sessions: user_id + last_activity for admin bulk fetch
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_last_activity
  ON user_sessions (user_id, last_activity DESC);

-- user_sessions: is_active for online user filtering
CREATE INDEX IF NOT EXISTS idx_user_sessions_is_active
  ON user_sessions (is_active)
  WHERE is_active = true;

-- daily_clock_entries: partial index for clocked-in users (clock_out IS NULL)
CREATE INDEX IF NOT EXISTS idx_daily_clock_entries_clocked_in
  ON daily_clock_entries (technician_id)
  WHERE clock_out IS NULL;

-- proposals: status for list view filtering
CREATE INDEX IF NOT EXISTS idx_proposals_status
  ON proposals (status)
  WHERE status IS NOT NULL;

-- proposals: created_by for rep-based views
CREATE INDEX IF NOT EXISTS idx_proposals_created_by
  ON proposals (created_by)
  WHERE created_by IS NOT NULL;

-- work_orders: assigned_to for technician views
CREATE INDEX IF NOT EXISTS idx_work_orders_assigned_to
  ON work_orders (assigned_to)
  WHERE assigned_to IS NOT NULL;

-- work_orders: status for filtering
CREATE INDEX IF NOT EXISTS idx_work_orders_status
  ON work_orders (status)
  WHERE status IS NOT NULL;
