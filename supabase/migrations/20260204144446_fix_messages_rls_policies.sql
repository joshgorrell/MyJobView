/*
  # Fix Messages RLS Policies
  
  1. Issues Fixed
    - Remove conflicting policies on messages table
    - Keep only the unified messaging system policies
    - Simplify INSERT policies
  
  2. Changes
    - Drop old/conflicting policies
    - Ensure staff can create messages in accessible threads
    - Keep the unified SELECT policy that respects visibility
*/

-- Drop old conflicting policies
DROP POLICY IF EXISTS "Staff can create messages in their company threads" ON messages;
DROP POLICY IF EXISTS "Users can view messages in company threads" ON messages;
DROP POLICY IF EXISTS "Users can insert messages in company threads" ON messages;
DROP POLICY IF EXISTS "Users can update their own messages" ON messages;

-- Keep these existing policies from unified system:
-- "Staff can view accessible messages" - respects visibility scope
-- "Staff can update their own messages" - author_id check
-- "Staff can delete their own messages" - author_id check
-- "Portal users can view messages in their public threads" - for customers

-- Create simplified INSERT policy
CREATE POLICY "Authenticated users can create messages in accessible threads"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Can create message if they can view the thread
    EXISTS (
      SELECT 1 FROM message_threads mt
      WHERE mt.id = thread_id
      AND (
        -- Portal users can post to their threads
        (
          mt.contact_id IN (SELECT contact_id FROM profiles WHERE id = auth.uid() AND contact_id IS NOT NULL)
          AND mt.visibility = 'public'
        )
        OR
        -- Staff users can post to accessible threads
        (
          EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND contact_id IS NULL)
          AND (
            mt.proposal_id IS NULL
            OR can_view_message_thread(auth.uid(), mt.id)
          )
        )
      )
    )
  );
