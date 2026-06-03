/*
  # Add Portal User Role and Contact Authentication

  1. Changes
    - Add 'portal_user' role option to profiles
    - Add contact_id reference to profiles for portal users
    - Add portal_access_enabled to contacts
    - Add portal_last_login to contacts
    - Update profile trigger to support portal users

  2. Notes
    - Portal users are customers who can log in
    - They are linked to a contact record
    - Their company_id comes from the staff who created their contact
    - Portal users can only see their own data
*/

DO $$
BEGIN
  -- Add contact_id to profiles
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'contact_id'
  ) THEN
    ALTER TABLE profiles ADD COLUMN contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE;
  END IF;

  -- Add portal fields to contacts
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'portal_access_enabled'
  ) THEN
    ALTER TABLE contacts ADD COLUMN portal_access_enabled boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'portal_last_login'
  ) THEN
    ALTER TABLE contacts ADD COLUMN portal_last_login timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'portal_user_id'
  ) THEN
    ALTER TABLE contacts ADD COLUMN portal_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add index on contact_id in profiles
CREATE INDEX IF NOT EXISTS idx_profiles_contact ON profiles(contact_id);

-- Add index on portal_user_id in contacts
CREATE INDEX IF NOT EXISTS idx_contacts_portal_user ON contacts(portal_user_id);

-- Update RLS policies for contacts to allow portal users to see their own contact
CREATE POLICY "Portal users can view their own contact"
  ON contacts FOR SELECT
  TO authenticated
  USING (
    portal_user_id = auth.uid()
  );

-- Policy for proposals - portal users can see proposals for their contact
CREATE POLICY "Portal users can view their proposals"
  ON proposals FOR SELECT
  TO authenticated
  USING (
    contact_id IN (
      SELECT id FROM contacts WHERE portal_user_id = auth.uid()
    )
  );

-- Policy for proposal rooms - portal users can see rooms for their proposals
CREATE POLICY "Portal users can view rooms in their proposals"
  ON proposal_rooms FOR SELECT
  TO authenticated
  USING (
    proposal_id IN (
      SELECT p.id FROM proposals p
      JOIN contacts c ON p.contact_id = c.id
      WHERE c.portal_user_id = auth.uid()
    )
  );

-- Policy for proposal line items - portal users can see line items in their proposals
CREATE POLICY "Portal users can view line items in their proposals"
  ON proposal_line_items FOR SELECT
  TO authenticated
  USING (
    proposal_id IN (
      SELECT p.id FROM proposals p
      JOIN contacts c ON p.contact_id = c.id
      WHERE c.portal_user_id = auth.uid()
    )
  );

-- Policy for projects - portal users can see their projects
CREATE POLICY "Portal users can view their projects"
  ON projects FOR SELECT
  TO authenticated
  USING (
    contact_id IN (
      SELECT id FROM contacts WHERE portal_user_id = auth.uid()
    )
  );

-- Policy for appointments - portal users can see their appointments
CREATE POLICY "Portal users can view their appointments"
  ON appointments FOR SELECT
  TO authenticated
  USING (
    contact_id IN (
      SELECT id FROM contacts WHERE portal_user_id = auth.uid()
    )
  );

-- Policy for invoices - portal users can see their invoices
CREATE POLICY "Portal users can view their invoices"
  ON invoices FOR SELECT
  TO authenticated
  USING (
    contact_id IN (
      SELECT id FROM contacts WHERE portal_user_id = auth.uid()
    )
  );

-- Policy for invoice line items - portal users can see line items in their invoices
CREATE POLICY "Portal users can view their invoice line items"
  ON invoice_line_items FOR SELECT
  TO authenticated
  USING (
    invoice_id IN (
      SELECT inv.id FROM invoices inv
      JOIN contacts c ON inv.contact_id = c.id
      WHERE c.portal_user_id = auth.uid()
    )
  );

-- Policy for payments - portal users can see payments on their invoices
CREATE POLICY "Portal users can view their payments"
  ON payments FOR SELECT
  TO authenticated
  USING (
    invoice_id IN (
      SELECT inv.id FROM invoices inv
      JOIN contacts c ON inv.contact_id = c.id
      WHERE c.portal_user_id = auth.uid()
    )
  );

-- Policy for message threads - portal users can see public threads related to their context
CREATE POLICY "Portal users can view their public message threads"
  ON message_threads FOR SELECT
  TO authenticated
  USING (
    visibility = 'public' AND (
      (context_type = 'contact' AND context_id IN (
        SELECT id FROM contacts WHERE portal_user_id = auth.uid()
      )) OR
      (context_type = 'proposal' AND context_id IN (
        SELECT p.id FROM proposals p
        JOIN contacts c ON p.contact_id = c.id
        WHERE c.portal_user_id = auth.uid()
      )) OR
      (context_type = 'project' AND context_id IN (
        SELECT pr.id FROM projects pr
        JOIN contacts c ON pr.contact_id = c.id
        WHERE c.portal_user_id = auth.uid()
      ))
    )
  );

-- Policy for messages - portal users can see messages in their public threads
CREATE POLICY "Portal users can view messages in their public threads"
  ON messages FOR SELECT
  TO authenticated
  USING (
    thread_id IN (
      SELECT id FROM message_threads 
      WHERE visibility = 'public' AND (
        (context_type = 'contact' AND context_id IN (
          SELECT id FROM contacts WHERE portal_user_id = auth.uid()
        )) OR
        (context_type = 'proposal' AND context_id IN (
          SELECT p.id FROM proposals p
          JOIN contacts c ON p.contact_id = c.id
          WHERE c.portal_user_id = auth.uid()
        )) OR
        (context_type = 'project' AND context_id IN (
          SELECT pr.id FROM projects pr
          JOIN contacts c ON pr.contact_id = c.id
          WHERE c.portal_user_id = auth.uid()
        ))
      )
    )
  );

-- Policy for portal users to create messages in their public threads
CREATE POLICY "Portal users can create messages in their public threads"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (
    thread_id IN (
      SELECT id FROM message_threads 
      WHERE visibility = 'public' AND (
        (context_type = 'contact' AND context_id IN (
          SELECT id FROM contacts WHERE portal_user_id = auth.uid()
        )) OR
        (context_type = 'proposal' AND context_id IN (
          SELECT p.id FROM proposals p
          JOIN contacts c ON p.contact_id = c.id
          WHERE c.portal_user_id = auth.uid()
        )) OR
        (context_type = 'project' AND context_id IN (
          SELECT pr.id FROM projects pr
          JOIN contacts c ON pr.contact_id = c.id
          WHERE c.portal_user_id = auth.uid()
        ))
      )
    )
  );
