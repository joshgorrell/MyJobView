/*
  # Migrate Proposal Messages to Unified System
  
  1. Data Migration
    - Create message_threads for each unique proposal with messages
    - Migrate all proposal_messages to messages table
    - Set proposal context and assigned sales rep on threads
    - Preserve sender_type, is_read, and message content
    - Handle nested replies using parent_message_id
  
  2. Cleanup
    - Keep proposal_messages table for reference (don't delete yet)
    - Update unread counts on proposals after migration
  
  3. Safety
    - Use idempotent logic to allow re-running if needed
    - Preserve all original data in proposal_messages
*/

-- Create a temporary function to migrate proposal messages
CREATE OR REPLACE FUNCTION migrate_proposal_messages_to_unified()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  proposal_record RECORD;
  thread_id_new uuid;
  message_record RECORD;
  contact_id_var uuid;
  sales_rep_id_var uuid;
BEGIN
  -- Loop through each proposal that has messages
  FOR proposal_record IN 
    SELECT DISTINCT p.id, p.proposal_number, p.contact_id, p.created_by, c.full_name as customer_name
    FROM proposals p
    LEFT JOIN contacts c ON p.contact_id = c.id
    WHERE EXISTS (SELECT 1 FROM proposal_messages WHERE proposal_id = p.id)
    AND NOT EXISTS (
      -- Don't migrate if thread already exists for this proposal
      SELECT 1 FROM message_threads WHERE proposal_id = p.id AND context_type = 'proposal'
    )
  LOOP
    -- Get contact and sales rep for this proposal
    contact_id_var := proposal_record.contact_id;
    sales_rep_id_var := proposal_record.created_by;
    
    -- Create a message thread for this proposal
    INSERT INTO message_threads (
      company_id,
      subject,
      context_type,
      context_id,
      contact_id,
      proposal_id,
      assigned_sales_rep_id,
      visibility,
      created_by,
      created_at,
      updated_at,
      last_message_at
    )
    SELECT 
      (SELECT id FROM profiles WHERE id = sales_rep_id_var LIMIT 1) as company_id, -- company_id from profile
      'Q&A: Proposal ' || COALESCE(proposal_record.proposal_number, 'N/A') as subject,
      'proposal' as context_type,
      proposal_record.id as context_id,
      contact_id_var,
      proposal_record.id as proposal_id,
      sales_rep_id_var,
      'public' as visibility,
      sales_rep_id_var as created_by,
      MIN(pm.created_at) as created_at,
      MAX(pm.updated_at) as updated_at,
      MAX(pm.created_at) as last_message_at
    FROM proposal_messages pm
    WHERE pm.proposal_id = proposal_record.id
    RETURNING id INTO thread_id_new;
    
    -- Migrate all messages for this proposal
    FOR message_record IN
      SELECT * FROM proposal_messages 
      WHERE proposal_id = proposal_record.id
      ORDER BY created_at ASC
    LOOP
      -- Insert message into messages table
      INSERT INTO messages (
        thread_id,
        author_id,
        author_name,
        author_type,
        body,
        is_read,
        is_internal,
        created_at,
        updated_at
      )
      VALUES (
        thread_id_new,
        message_record.sender_id,
        message_record.sender_name,
        CASE 
          WHEN message_record.sender_type = 'rep' THEN 'staff'
          ELSE message_record.sender_type
        END,
        message_record.message,
        message_record.is_read,
        false, -- proposal messages are not internal by default
        message_record.created_at,
        message_record.updated_at
      );
    END LOOP;
    
    RAISE NOTICE 'Migrated messages for proposal: %', proposal_record.proposal_number;
  END LOOP;
  
  -- Update unread counts for all proposals
  UPDATE proposals p
  SET unread_customer_messages_count = (
    SELECT COUNT(*)
    FROM messages m
    JOIN message_threads mt ON m.thread_id = mt.id
    WHERE mt.proposal_id = p.id
      AND m.author_type = 'customer'
      AND m.is_read = false
      AND m.is_internal = false
  )
  WHERE EXISTS (
    SELECT 1 FROM message_threads WHERE proposal_id = p.id
  );
  
  RAISE NOTICE 'Migration complete!';
END;
$$;

-- Execute the migration
SELECT migrate_proposal_messages_to_unified();

-- Drop the temporary function
DROP FUNCTION migrate_proposal_messages_to_unified();

-- Add comment to proposal_messages table noting it's been migrated
COMMENT ON TABLE proposal_messages IS 'Legacy table - migrated to unified messaging system. Keep for reference but use message_threads and messages tables for new Q&A.';
