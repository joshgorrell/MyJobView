/*
  # Fix Unindexed Foreign Keys - Corrected Batch 4
  
  1. Performance Optimization
    - Add indexes to foreign key columns in discussion and messaging tables
    - Improves feed loading and message retrieval performance
    
  2. Tables Covered
    - discussion_posts (user_id, parent_id, assigned_to, last_bumped_by, completed_by, lead_id)
    - discussion_post_likes (post_id, user_id)
    - message_threads (proposal_id, contact_id, created_by, assigned_sales_rep_id)
    - messages (thread_id, author_id)
*/

-- Discussion posts indexes
CREATE INDEX IF NOT EXISTS idx_discussion_posts_user_id ON discussion_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_discussion_posts_parent_id ON discussion_posts(parent_id);
CREATE INDEX IF NOT EXISTS idx_discussion_posts_assigned_to ON discussion_posts(assigned_to);
CREATE INDEX IF NOT EXISTS idx_discussion_posts_last_bumped_by ON discussion_posts(last_bumped_by);
CREATE INDEX IF NOT EXISTS idx_discussion_posts_completed_by ON discussion_posts(completed_by);
CREATE INDEX IF NOT EXISTS idx_discussion_posts_lead_id ON discussion_posts(lead_id);

-- Discussion post likes indexes
CREATE INDEX IF NOT EXISTS idx_discussion_post_likes_post_id ON discussion_post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_discussion_post_likes_user_id ON discussion_post_likes(user_id);

-- Message threads indexes
CREATE INDEX IF NOT EXISTS idx_message_threads_proposal_id ON message_threads(proposal_id);
CREATE INDEX IF NOT EXISTS idx_message_threads_contact_id ON message_threads(contact_id);
CREATE INDEX IF NOT EXISTS idx_message_threads_created_by ON message_threads(created_by);
CREATE INDEX IF NOT EXISTS idx_message_threads_assigned_sales_rep_id ON message_threads(assigned_sales_rep_id);

-- Messages indexes
CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_author_id ON messages(author_id);