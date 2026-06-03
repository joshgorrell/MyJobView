/*
  # Add Subscription Cancellation Tracking

  ## Summary
  Implements customer-initiated subscription cancellation with reason tracking and admin analytics.
  Customers can cancel anytime, but billing continues until contract end date.

  ## New Tables

  ### `subscription_cancellations`
  - `id` (uuid, primary key)
  - `company_id` (uuid, references company_settings)
  - `subscription_id` (uuid, references recurring_subscriptions)
  - `cancelled_by_user_id` (uuid, references profiles) - Portal user who cancelled
  - `cancellation_date` (timestamptz) - When cancellation was requested
  - `effective_date` (date) - When subscription actually ends (contract end date)
  - `reason_category` (text) - Primary reason category
  - `reason_details` (text) - Additional details from customer
  - `will_continue_billing` (boolean) - True if billing continues until contract end
  - `created_at` (timestamptz)

  ## Columns Added

  ### `recurring_subscriptions`
  - `cancellation_requested` (boolean) - Flag that cancellation was requested
  - `cancellation_id` (uuid, references subscription_cancellations)

  ## Security
  - Enable RLS on subscription_cancellations table
  - Portal users can insert their own cancellations
  - Portal users can view their own cancellations
  - Admin/sales can view all cancellations for analytics

  ## Notes
  - Customers can cancel anytime
  - Billing continues until contract end date (if applicable)
  - Cancellation reasons tracked for analytics
  - Status changes to 'cancelled' on effective date (handled by cron/edge function)
*/

-- Add cancellation columns to recurring_subscriptions
ALTER TABLE recurring_subscriptions
ADD COLUMN IF NOT EXISTS cancellation_requested boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS cancellation_id uuid;

-- Create subscription_cancellations table
CREATE TABLE IF NOT EXISTS subscription_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES company_settings(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES recurring_subscriptions(id) ON DELETE CASCADE,
  cancelled_by_user_id uuid REFERENCES profiles(id),
  cancellation_date timestamptz DEFAULT now(),
  effective_date date NOT NULL,
  reason_category text NOT NULL CHECK (reason_category IN (
    'too_expensive',
    'not_using_service',
    'switching_provider',
    'service_quality',
    'moving_relocating',
    'business_closed',
    'financial_reasons',
    'no_longer_needed',
    'other'
  )),
  reason_details text,
  will_continue_billing boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_subscription_cancellations_subscription ON subscription_cancellations(subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_cancellations_company ON subscription_cancellations(company_id);
CREATE INDEX IF NOT EXISTS idx_subscription_cancellations_effective_date ON subscription_cancellations(effective_date);
CREATE INDEX IF NOT EXISTS idx_subscription_cancellations_reason ON subscription_cancellations(reason_category);
CREATE INDEX IF NOT EXISTS idx_recurring_subscriptions_cancellation_requested ON recurring_subscriptions(cancellation_requested) WHERE cancellation_requested = true;

-- Add foreign key for cancellation_id
ALTER TABLE recurring_subscriptions
ADD CONSTRAINT fk_recurring_subscriptions_cancellation
FOREIGN KEY (cancellation_id) REFERENCES subscription_cancellations(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE subscription_cancellations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for subscription_cancellations

-- Portal users can insert cancellation for their own subscription
CREATE POLICY "Portal users can cancel their own subscriptions"
  ON subscription_cancellations FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      JOIN recurring_subscriptions ON recurring_subscriptions.id = subscription_id
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'portal_user'
      AND profiles.contact_id = recurring_subscriptions.contact_id
      AND recurring_subscriptions.status = 'active'
    )
  );

-- Portal users can view their own cancellations
CREATE POLICY "Portal users can view their own cancellations"
  ON subscription_cancellations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      JOIN recurring_subscriptions ON recurring_subscriptions.id = subscription_id
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'portal_user'
      AND profiles.contact_id = recurring_subscriptions.contact_id
    )
  );

-- Admin and sales can view all cancellations for analytics
CREATE POLICY "Admin and sales can view all cancellations"
  ON subscription_cancellations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('admin', 'sales', 'sales_manager', 'office_manager')
    )
  );

-- Create function to process subscription cancellation
CREATE OR REPLACE FUNCTION process_subscription_cancellation(
  p_subscription_id uuid,
  p_reason_category text,
  p_reason_details text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subscription record;
  v_effective_date date;
  v_will_continue_billing boolean;
  v_cancellation_id uuid;
  v_company_id uuid;
BEGIN
  -- Get subscription details
  SELECT * INTO v_subscription
  FROM recurring_subscriptions
  WHERE id = p_subscription_id
  AND status = 'active';

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Subscription not found or already cancelled'
    );
  END IF;

  -- Get company_id
  SELECT company_id INTO v_company_id
  FROM recurring_subscriptions
  WHERE id = p_subscription_id;

  -- Determine effective date
  IF v_subscription.end_date IS NOT NULL THEN
    -- Has contract end date - cancel on that date
    v_effective_date := v_subscription.end_date;
    v_will_continue_billing := true;
  ELSE
    -- No contract end date - cancel immediately at end of current billing period
    v_effective_date := v_subscription.next_billing_date;
    v_will_continue_billing := false;
  END IF;

  -- Create cancellation record
  INSERT INTO subscription_cancellations (
    company_id,
    subscription_id,
    cancelled_by_user_id,
    effective_date,
    reason_category,
    reason_details,
    will_continue_billing
  ) VALUES (
    v_company_id,
    p_subscription_id,
    auth.uid(),
    v_effective_date,
    p_reason_category,
    p_reason_details,
    v_will_continue_billing
  )
  RETURNING id INTO v_cancellation_id;

  -- Update subscription
  UPDATE recurring_subscriptions
  SET
    cancellation_requested = true,
    cancellation_id = v_cancellation_id,
    updated_at = now()
  WHERE id = p_subscription_id;

  RETURN json_build_object(
    'success', true,
    'cancellation_id', v_cancellation_id,
    'effective_date', v_effective_date,
    'will_continue_billing', v_will_continue_billing
  );
END;
$$;
