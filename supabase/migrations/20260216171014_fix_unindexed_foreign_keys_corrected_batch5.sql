/*
  # Fix Unindexed Foreign Keys - Corrected Batch 5
  
  1. Performance Optimization
    - Add indexes to foreign key columns in task and tracking tables
    - Improves task management and collaboration features
    
  2. Tables Covered
    - tasks (lead_id, contact_id, assigned_to, user_id)
    - task_comments (task_id, user_id)
    - task_watchers (task_id, user_id)
*/

-- Tasks table indexes  
CREATE INDEX IF NOT EXISTS idx_tasks_lead_id ON tasks(lead_id);
CREATE INDEX IF NOT EXISTS idx_tasks_contact_id ON tasks(contact_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);

-- Task comments indexes
CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_user_id ON task_comments(user_id);

-- Task watchers indexes
CREATE INDEX IF NOT EXISTS idx_task_watchers_task_id ON task_watchers(task_id);
CREATE INDEX IF NOT EXISTS idx_task_watchers_user_id ON task_watchers(user_id);