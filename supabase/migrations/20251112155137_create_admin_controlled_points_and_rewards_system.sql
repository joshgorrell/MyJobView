/*
  # Create Admin-Controlled Points and Rewards System

  1. New Tables
    - `points_configuration`
      - `id` (uuid, primary key)
      - `company_id` (uuid, references auth.users - admin user)
      - `task_completion_points` (integer, default 10)
      - `question_answer_points` (integer, default 5)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `rewards_catalog`
      - `id` (uuid, primary key)
      - `company_id` (uuid, references auth.users - admin user)
      - `name` (text)
      - `description` (text)
      - `points_cost` (integer)
      - `image_url` (text, optional)
      - `available` (boolean, default true)
      - `stock_quantity` (integer, null = unlimited)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `points_transactions`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `points_amount` (integer, can be negative for redemptions)
      - `transaction_type` (text: 'task_completion', 'question_answer', 'reward_redemption', 'admin_adjustment')
      - `reference_id` (uuid, optional - task_id, post_id, or reward_id)
      - `description` (text)
      - `created_at` (timestamptz)
    
    - `reward_redemptions`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `reward_id` (uuid, references rewards_catalog)
      - `points_spent` (integer)
      - `status` (text: 'pending', 'approved', 'fulfilled', 'cancelled')
      - `fulfilled_at` (timestamptz, optional)
      - `notes` (text, optional)
      - `created_at` (timestamptz)

  2. Changes
    - Remove `points_reward` from discussion_posts
    - Remove `points_reward` from tasks
    - Keep `points_earned` on profiles but calculate from transactions

  3. Security
    - Enable RLS on all tables
    - Admins can configure points and manage rewards
    - Users can view their transactions and redeem rewards
    - Users can view available rewards
*/

-- Create points_configuration table
CREATE TABLE IF NOT EXISTS points_configuration (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  task_completion_points integer DEFAULT 10 NOT NULL CHECK (task_completion_points >= 0),
  question_answer_points integer DEFAULT 5 NOT NULL CHECK (question_answer_points >= 0),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE points_configuration ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage points configuration"
  ON points_configuration FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Users can view points configuration"
  ON points_configuration FOR SELECT
  TO authenticated
  USING (true);

-- Create rewards_catalog table
CREATE TABLE IF NOT EXISTS rewards_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  points_cost integer NOT NULL CHECK (points_cost > 0),
  image_url text,
  available boolean DEFAULT true,
  stock_quantity integer CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE rewards_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage rewards catalog"
  ON rewards_catalog FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Users can view available rewards"
  ON rewards_catalog FOR SELECT
  TO authenticated
  USING (available = true);

-- Create points_transactions table
CREATE TABLE IF NOT EXISTS points_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  points_amount integer NOT NULL,
  transaction_type text NOT NULL CHECK (transaction_type IN ('task_completion', 'question_answer', 'reward_redemption', 'admin_adjustment')),
  reference_id uuid,
  description text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE points_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions"
  ON points_transactions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all transactions"
  ON points_transactions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can create transactions"
  ON points_transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Create reward_redemptions table
CREATE TABLE IF NOT EXISTS reward_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  reward_id uuid REFERENCES rewards_catalog(id) ON DELETE CASCADE NOT NULL,
  points_spent integer NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'fulfilled', 'cancelled')),
  fulfilled_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE reward_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own redemptions"
  ON reward_redemptions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can create redemptions"
  ON reward_redemptions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all redemptions"
  ON reward_redemptions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update redemptions"
  ON reward_redemptions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_points_transactions_user_id ON points_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_points_transactions_created_at ON points_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_user_id ON reward_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_status ON reward_redemptions(status);

-- Remove points_reward columns from discussion_posts and tasks
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'discussion_posts' AND column_name = 'points_reward'
  ) THEN
    ALTER TABLE discussion_posts DROP COLUMN points_reward;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'points_reward'
  ) THEN
    ALTER TABLE tasks DROP COLUMN points_reward;
  END IF;
END $$;

-- Function to calculate user's current points from transactions
CREATE OR REPLACE FUNCTION get_user_points_balance(user_uuid uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  balance integer;
BEGIN
  SELECT COALESCE(SUM(points_amount), 0)
  INTO balance
  FROM points_transactions
  WHERE user_id = user_uuid;
  
  RETURN balance;
END;
$$;

-- Function to update points_earned on profiles table
CREATE OR REPLACE FUNCTION sync_profile_points()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE profiles
  SET points_earned = get_user_points_balance(NEW.user_id)
  WHERE id = NEW.user_id;
  
  RETURN NEW;
END;
$$;

-- Trigger to keep profiles.points_earned in sync
DROP TRIGGER IF EXISTS trigger_sync_profile_points ON points_transactions;
CREATE TRIGGER trigger_sync_profile_points
  AFTER INSERT ON points_transactions
  FOR EACH ROW
  EXECUTE FUNCTION sync_profile_points();