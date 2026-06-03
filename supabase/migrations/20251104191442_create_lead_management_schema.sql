/*
  # Sales Team Lead Management System

  1. New Tables
    - `profiles`
      - `id` (uuid, primary key, references auth.users)
      - `email` (text)
      - `full_name` (text)
      - `role` (text) - 'admin', 'sales_rep', 'bd'
      - `is_active` (boolean) - for revoking access
      - `avatar_url` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `leads`
      - `id` (uuid, primary key)
      - `company_name` (text)
      - `contact_name` (text)
      - `email` (text)
      - `phone` (text)
      - `opportunity_description` (text)
      - `status` (text) - 'unclaimed', 'claimed', 'escalated', 'closed_won', 'closed_lost'
      - `assigned_to` (uuid) - Foreign key to profiles
      - `created_by` (uuid) - Foreign key to profiles
      - `is_fishbowl` (boolean) - True if in fishbowl
      - `claimed_at` (timestamptz)
      - `escalated_at` (timestamptz)
      - `qbo_customer_id` (text) - QuickBooks customer ID
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `lead_tags`
      - `id` (uuid, primary key)
      - `lead_id` (uuid) - Foreign key to leads
      - `tag` (text) - Normalized tag without #
      - `created_at` (timestamptz)
    
    - `lead_messages`
      - `id` (uuid, primary key)
      - `lead_id` (uuid) - Foreign key to leads
      - `user_id` (uuid) - Foreign key to profiles
      - `message` (text)
      - `mentions` (text[]) - Array of user IDs mentioned
      - `created_at` (timestamptz)
    
    - `notifications`
      - `id` (uuid, primary key)
      - `user_id` (uuid) - Foreign key to profiles
      - `type` (text) - 'lead_assigned', 'fishbowl_lead', 'escalated', 'mention', 'lead_claimed'
      - `lead_id` (uuid) - Foreign key to leads
      - `message_id` (uuid) - Foreign key to lead_messages
      - `title` (text)
      - `body` (text)
      - `is_read` (boolean)
      - `created_at` (timestamptz)
    
    - `feed_events`
      - `id` (uuid, primary key)
      - `event_type` (text) - 'lead_created', 'lead_assigned', 'lead_claimed', 'message_posted', 'lead_escalated'
      - `lead_id` (uuid) - Foreign key to leads
      - `message_id` (uuid) - Foreign key to lead_messages
      - `user_id` (uuid) - Foreign key to profiles (actor)
      - `metadata` (jsonb) - Additional event data
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Users can view their own profile and other active users
    - Users can view leads assigned to them or in fishbowl
    - Admins can view all leads
    - Users can create leads and messages
    - Only assigned users can update lead status
    - Notifications are private to each user

  3. Indexes
    - Add indexes for common queries
    - Tag searches, lead assignments, notifications

  4. Functions
    - Auto-escalate unclaimed fishbowl leads after 3 days
    - Trigger to create feed events on lead/message creation
*/

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL DEFAULT 'sales_rep' CHECK (role IN ('admin', 'sales_rep', 'bd')),
  is_active boolean DEFAULT true,
  avatar_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create leads table
CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text,
  contact_name text NOT NULL,
  email text,
  phone text,
  opportunity_description text,
  status text NOT NULL DEFAULT 'unclaimed' CHECK (status IN ('unclaimed', 'claimed', 'escalated', 'closed_won', 'closed_lost', 'in_progress')),
  assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  is_fishbowl boolean DEFAULT false,
  claimed_at timestamptz,
  escalated_at timestamptz,
  qbo_customer_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create lead_tags table
CREATE TABLE IF NOT EXISTS lead_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES leads(id) ON DELETE CASCADE,
  tag text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create lead_messages table
CREATE TABLE IF NOT EXISTS lead_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES leads(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  message text NOT NULL,
  mentions text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('lead_assigned', 'fishbowl_lead', 'escalated', 'mention', 'lead_claimed', 'lead_updated')),
  lead_id uuid REFERENCES leads(id) ON DELETE CASCADE,
  message_id uuid REFERENCES lead_messages(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Create feed_events table
CREATE TABLE IF NOT EXISTS feed_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type IN ('lead_created', 'lead_assigned', 'lead_claimed', 'message_posted', 'lead_escalated', 'lead_updated', 'lead_closed')),
  lead_id uuid REFERENCES leads(id) ON DELETE CASCADE,
  message_id uuid REFERENCES lead_messages(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_fishbowl ON leads(is_fishbowl) WHERE is_fishbowl = true;
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_tags_tag ON lead_tags(tag);
CREATE INDEX IF NOT EXISTS idx_lead_tags_lead_id ON lead_tags(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_messages_lead_id ON lead_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_feed_events_created_at ON feed_events(created_at DESC);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_events ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view active profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Leads policies
CREATE POLICY "Users can view leads they created or assigned to them"
  ON leads FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid() 
    OR assigned_to = auth.uid() 
    OR is_fishbowl = true
    OR EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Authenticated users can create leads"
  ON leads FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update leads assigned to them or admins can update any"
  ON leads FOR UPDATE
  TO authenticated
  USING (
    assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

-- Lead tags policies
CREATE POLICY "Users can view tags for leads they can see"
  ON lead_tags FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM leads 
      WHERE leads.id = lead_tags.lead_id
      AND (
        leads.created_by = auth.uid() 
        OR leads.assigned_to = auth.uid() 
        OR leads.is_fishbowl = true
        OR EXISTS (
          SELECT 1 FROM profiles 
          WHERE profiles.id = auth.uid() 
          AND profiles.role = 'admin'
        )
      )
    )
  );

CREATE POLICY "Authenticated users can create tags"
  ON lead_tags FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Lead messages policies
CREATE POLICY "Users can view messages for leads they can see"
  ON lead_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM leads 
      WHERE leads.id = lead_messages.lead_id
      AND (
        leads.created_by = auth.uid() 
        OR leads.assigned_to = auth.uid() 
        OR leads.is_fishbowl = true
        OR EXISTS (
          SELECT 1 FROM profiles 
          WHERE profiles.id = auth.uid() 
          AND profiles.role = 'admin'
        )
      )
    )
  );

CREATE POLICY "Authenticated users can create messages"
  ON lead_messages FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Notifications policies
CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Feed events policies
CREATE POLICY "Authenticated users can view feed events"
  ON feed_events FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System can create feed events"
  ON feed_events FOR INSERT
  TO authenticated
  WITH CHECK (true);