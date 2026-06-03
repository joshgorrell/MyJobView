/*
  # Create Paparazzi Photo Request System

  1. New Tables
    - `paparazzi_requests`
      - `id` (uuid, primary key)
      - `organization_id` (uuid, references organizations)
      - `contact_id` (uuid, references contacts)
      - `project_id` (uuid, references projects, nullable)
      - `requested_by` (uuid, references profiles)
      - `description` (text - description of the cool work completed)
      - `customer_name` (text)
      - `customer_phone` (text)
      - `customer_email` (text)
      - `status` (text - pending, completed, cancelled)
      - `completed_at` (timestamptz, nullable)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Schema Changes
    - Add `photographer_email` to company_settings table
    - Add `paparazzi_request_id` to job_photos table

  3. Security
    - Enable RLS on `paparazzi_requests` table
    - Add policies for authenticated users to view and create requests
    - Add policies for admins to manage requests

  4. Indexes
    - Add indexes for foreign keys and common queries

  5. Notifications
    - Add 'paparazzi_photos_uploaded' notification type
    - Create trigger to notify requester when photos are uploaded
*/

-- Add photographer_email to company_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'company_settings' AND column_name = 'photographer_email'
  ) THEN
    ALTER TABLE company_settings ADD COLUMN photographer_email text;
  END IF;
END $$;

-- Create paparazzi_requests table
CREATE TABLE IF NOT EXISTS paparazzi_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE NOT NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  requested_by uuid REFERENCES profiles(id) ON DELETE SET NULL NOT NULL,
  description text NOT NULL,
  customer_name text NOT NULL,
  customer_phone text,
  customer_email text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  completed_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_paparazzi_requests_organization_id ON paparazzi_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_paparazzi_requests_contact_id ON paparazzi_requests(contact_id);
CREATE INDEX IF NOT EXISTS idx_paparazzi_requests_project_id ON paparazzi_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_paparazzi_requests_requested_by ON paparazzi_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_paparazzi_requests_status ON paparazzi_requests(status);
CREATE INDEX IF NOT EXISTS idx_paparazzi_requests_created_at ON paparazzi_requests(created_at DESC);

-- Enable RLS
ALTER TABLE paparazzi_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies for paparazzi_requests
CREATE POLICY "Users can view requests in their organization"
  ON paparazzi_requests FOR SELECT
  TO authenticated
  USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can create paparazzi requests"
  ON paparazzi_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND requested_by = auth.uid()
  );

CREATE POLICY "Users can update their own requests and admins can update any"
  ON paparazzi_requests FOR UPDATE
  TO authenticated
  USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (
      requested_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND role IN ('admin', 'owner')
      )
    )
  )
  WITH CHECK (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

-- Add notification type for paparazzi photo upload
DO $$
BEGIN
  -- Drop the existing constraint if it exists
  ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
  
  -- Add the new constraint with all existing types plus the new one
  ALTER TABLE notifications ADD CONSTRAINT notifications_type_check 
    CHECK (type IN (
      'lead', 'task', 'appointment', 'proposal', 'invoice', 'message', 
      'work_order', 'service_request', 'review_request', 'punchlist',
      'test_tune', 'product_request', 'work_order_assignment', 'proposal_message',
      'bug_report', 'paparazzi_photos_uploaded', 'vip_signup', 'time_adjustment_request', 
      'home_clock', 'proposal_approval', 'auto_clock_out', 'punchlist_service_request',
      'service_request_created', 'system'
    ));
END $$;

-- Create function to notify requester when photos are uploaded
CREATE OR REPLACE FUNCTION notify_paparazzi_requester()
RETURNS TRIGGER AS $$
DECLARE
  v_requester_id uuid;
  v_customer_name text;
  v_project_name text;
BEGIN
  -- Only proceed if status changed to completed
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    -- Get requester info
    SELECT requested_by, customer_name INTO v_requester_id, v_customer_name
    FROM paparazzi_requests
    WHERE id = NEW.id;
    
    -- Get project name if exists
    IF NEW.project_id IS NOT NULL THEN
      SELECT name INTO v_project_name
      FROM projects
      WHERE id = NEW.project_id;
    END IF;
    
    -- Create notification
    INSERT INTO notifications (
      user_id,
      type,
      title,
      message,
      related_id,
      organization_id
    ) VALUES (
      v_requester_id,
      'paparazzi_photos_uploaded',
      'Photos Uploaded',
      'Photos have been uploaded for ' || v_customer_name || 
      CASE WHEN v_project_name IS NOT NULL THEN ' - ' || v_project_name ELSE '' END,
      NEW.id,
      NEW.organization_id
    );
    
    -- Set completed_at if not already set
    IF NEW.completed_at IS NULL THEN
      NEW.completed_at = now();
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for notifications
DROP TRIGGER IF EXISTS trigger_notify_paparazzi_requester ON paparazzi_requests;
CREATE TRIGGER trigger_notify_paparazzi_requester
  BEFORE UPDATE ON paparazzi_requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_paparazzi_requester();

-- Add paparazzi_request_id to job_photos for linking
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'job_photos' AND column_name = 'paparazzi_request_id'
  ) THEN
    ALTER TABLE job_photos ADD COLUMN paparazzi_request_id uuid REFERENCES paparazzi_requests(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_job_photos_paparazzi_request_id ON job_photos(paparazzi_request_id);
  END IF;
END $$;