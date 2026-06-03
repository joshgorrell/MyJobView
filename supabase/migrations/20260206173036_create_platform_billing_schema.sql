/*
  # Create Platform Billing Schema

  This migration creates the billing infrastructure for MyJobView's per-user
  pricing model ($50 base + $10 per additional user).

  1. New Tables
    - `platform_pricing` - Stores configurable pricing model (base price, per-user price)
      - `id` (uuid, primary key)
      - `base_price` (numeric) - Monthly base price (default $50)
      - `per_user_price` (numeric) - Per additional user price (default $10)
      - `included_users` (integer) - Users included in base price (default 1)
      - `billing_interval` (text) - 'monthly' or 'yearly'
      - `is_active` (boolean) - Only one active pricing row at a time
      - `created_by` (uuid) - Global admin who set this pricing
      - `created_at` (timestamptz)
    - `platform_pricing_history` - Audit log of pricing changes
      - `id` (uuid, primary key)
      - `pricing_id` (uuid) - Reference to platform_pricing
      - `base_price` (numeric)
      - `per_user_price` (numeric)
      - `included_users` (integer)
      - `changed_by` (uuid) - Global admin who made the change
      - `changed_at` (timestamptz)
      - `notes` (text)
    - `tenant_subscriptions` - Tracks each org's Stripe subscription
      - `id` (uuid, primary key)
      - `organization_id` (uuid) - FK to organizations
      - `stripe_customer_id` (text)
      - `stripe_subscription_id` (text)
      - `stripe_price_id_base` (text)
      - `stripe_price_id_per_user` (text)
      - `current_user_count` (integer)
      - `base_amount` (numeric)
      - `per_user_amount` (numeric)
      - `total_monthly_amount` (numeric)
      - `discount_code_id` (uuid, nullable)
      - `discount_amount` (numeric)
      - `current_period_start` (timestamptz)
      - `current_period_end` (timestamptz)
      - `payment_status` (text) - 'current', 'past_due', 'failed', 'cancelled'
      - `cancelled_at` (timestamptz, nullable)
      - `cancel_at_period_end` (boolean)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    - `discount_codes` - Configurable discount codes
      - `id` (uuid, primary key)
      - `code` (text, unique) - The actual code string
      - `description` (text) - Admin description
      - `discount_type` (text) - 'percent' or 'flat'
      - `discount_value` (numeric) - Percentage (0-100) or flat dollar amount
      - `duration_type` (text) - 'one_time', 'ongoing', 'limited_months'
      - `duration_months` (integer, nullable) - For 'limited_months' type
      - `max_redemptions` (integer, nullable) - NULL = unlimited
      - `times_redeemed` (integer, default 0)
      - `valid_from` (timestamptz)
      - `valid_until` (timestamptz, nullable) - NULL = no expiry
      - `is_active` (boolean)
      - `created_by` (uuid)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    - `discount_code_redemptions` - Which org used which code
      - `id` (uuid, primary key)
      - `discount_code_id` (uuid) - FK to discount_codes
      - `organization_id` (uuid) - FK to organizations
      - `tenant_subscription_id` (uuid) - FK to tenant_subscriptions
      - `stripe_coupon_id` (text, nullable) - Stripe coupon reference
      - `applied_at` (timestamptz)
      - `expires_at` (timestamptz, nullable) - When the discount expires
      - `is_active` (boolean)

  2. Changes
    - Add `stripe_customer_id` to organizations table
    
  3. Security
    - Enable RLS on all new tables
    - Global admins can manage platform_pricing and discount_codes
    - Global admins can view all tenant_subscriptions
    - Org admins can view their own tenant_subscription
    - Org admins can view discount_codes (for redemption)

  4. Seed Data
    - Insert default pricing: $50 base, $10 per user, 1 included user
*/

-- Add stripe_customer_id to organizations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations' AND column_name = 'stripe_customer_id'
  ) THEN
    ALTER TABLE organizations ADD COLUMN stripe_customer_id text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_organizations_stripe_customer_id
  ON organizations(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- Platform Pricing table
CREATE TABLE IF NOT EXISTS platform_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_price numeric NOT NULL DEFAULT 50,
  per_user_price numeric NOT NULL DEFAULT 10,
  included_users integer NOT NULL DEFAULT 1,
  billing_interval text NOT NULL DEFAULT 'monthly' CHECK (billing_interval IN ('monthly', 'yearly')),
  is_active boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE platform_pricing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Global admins can manage platform pricing" ON platform_pricing;
CREATE POLICY "Global admins can manage platform pricing"
  ON platform_pricing
  FOR ALL
  TO authenticated
  USING (public.is_global_admin())
  WITH CHECK (public.is_global_admin());

-- Platform Pricing History table
CREATE TABLE IF NOT EXISTS platform_pricing_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pricing_id uuid REFERENCES platform_pricing(id) ON DELETE SET NULL,
  base_price numeric NOT NULL,
  per_user_price numeric NOT NULL,
  included_users integer NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz DEFAULT now(),
  notes text
);

ALTER TABLE platform_pricing_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Global admins can manage pricing history" ON platform_pricing_history;
CREATE POLICY "Global admins can manage pricing history"
  ON platform_pricing_history
  FOR ALL
  TO authenticated
  USING (public.is_global_admin())
  WITH CHECK (public.is_global_admin());

-- Discount Codes table
CREATE TABLE IF NOT EXISTS discount_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  description text,
  discount_type text NOT NULL CHECK (discount_type IN ('percent', 'flat')),
  discount_value numeric NOT NULL CHECK (discount_value > 0),
  duration_type text NOT NULL DEFAULT 'one_time' CHECK (duration_type IN ('one_time', 'ongoing', 'limited_months')),
  duration_months integer CHECK (duration_months > 0 OR duration_months IS NULL),
  max_redemptions integer CHECK (max_redemptions > 0 OR max_redemptions IS NULL),
  times_redeemed integer NOT NULL DEFAULT 0,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT discount_codes_code_unique UNIQUE (code),
  CONSTRAINT percent_max_100 CHECK (discount_type != 'percent' OR discount_value <= 100)
);

ALTER TABLE discount_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Global admins can manage discount codes" ON discount_codes;
CREATE POLICY "Global admins can manage discount codes"
  ON discount_codes
  FOR ALL
  TO authenticated
  USING (public.is_global_admin())
  WITH CHECK (public.is_global_admin());

DROP POLICY IF EXISTS "Authenticated users can view active discount codes" ON discount_codes;
CREATE POLICY "Authenticated users can view active discount codes"
  ON discount_codes
  FOR SELECT
  TO authenticated
  USING (is_active = true AND valid_from <= now() AND (valid_until IS NULL OR valid_until > now()));

-- Tenant Subscriptions table
CREATE TABLE IF NOT EXISTS tenant_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id_base text,
  stripe_price_id_per_user text,
  current_user_count integer NOT NULL DEFAULT 1,
  base_amount numeric NOT NULL DEFAULT 50,
  per_user_amount numeric NOT NULL DEFAULT 0,
  total_monthly_amount numeric NOT NULL DEFAULT 50,
  discount_code_id uuid REFERENCES discount_codes(id) ON DELETE SET NULL,
  discount_amount numeric NOT NULL DEFAULT 0,
  current_period_start timestamptz,
  current_period_end timestamptz,
  payment_status text NOT NULL DEFAULT 'current' CHECK (payment_status IN ('current', 'past_due', 'failed', 'cancelled', 'trialing')),
  cancelled_at timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT tenant_subscriptions_org_unique UNIQUE (organization_id)
);

ALTER TABLE tenant_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_org_id ON tenant_subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_stripe_sub_id ON tenant_subscriptions(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_payment_status ON tenant_subscriptions(payment_status);

DROP POLICY IF EXISTS "Global admins can manage all tenant subscriptions" ON tenant_subscriptions;
CREATE POLICY "Global admins can manage all tenant subscriptions"
  ON tenant_subscriptions
  FOR ALL
  TO authenticated
  USING (public.is_global_admin())
  WITH CHECK (public.is_global_admin());

DROP POLICY IF EXISTS "Org admins can view own subscription" ON tenant_subscriptions;
CREATE POLICY "Org admins can view own subscription"
  ON tenant_subscriptions
  FOR SELECT
  TO authenticated
  USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

-- Discount Code Redemptions table
CREATE TABLE IF NOT EXISTS discount_code_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discount_code_id uuid NOT NULL REFERENCES discount_codes(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tenant_subscription_id uuid REFERENCES tenant_subscriptions(id) ON DELETE SET NULL,
  stripe_coupon_id text,
  applied_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true
);

ALTER TABLE discount_code_redemptions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_discount_redemptions_org_id ON discount_code_redemptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_discount_redemptions_code_id ON discount_code_redemptions(discount_code_id);

DROP POLICY IF EXISTS "Global admins can manage all redemptions" ON discount_code_redemptions;
CREATE POLICY "Global admins can manage all redemptions"
  ON discount_code_redemptions
  FOR ALL
  TO authenticated
  USING (public.is_global_admin())
  WITH CHECK (public.is_global_admin());

DROP POLICY IF EXISTS "Org members can view own redemptions" ON discount_code_redemptions;
CREATE POLICY "Org members can view own redemptions"
  ON discount_code_redemptions
  FOR SELECT
  TO authenticated
  USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

-- Seed default pricing
INSERT INTO platform_pricing (base_price, per_user_price, included_users, billing_interval, is_active)
SELECT 50, 10, 1, 'monthly', true
WHERE NOT EXISTS (SELECT 1 FROM platform_pricing WHERE is_active = true);

-- Insert initial history record
INSERT INTO platform_pricing_history (pricing_id, base_price, per_user_price, included_users, notes)
SELECT id, 50, 10, 1, 'Initial platform pricing configuration'
FROM platform_pricing
WHERE is_active = true
AND NOT EXISTS (SELECT 1 FROM platform_pricing_history);

-- RPC: Validate a discount code
CREATE OR REPLACE FUNCTION public.validate_discount_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code discount_codes%ROWTYPE;
BEGIN
  SELECT * INTO v_code
  FROM discount_codes
  WHERE UPPER(code) = UPPER(p_code)
  AND is_active = true
  AND valid_from <= now()
  AND (valid_until IS NULL OR valid_until > now());

  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Invalid or expired discount code');
  END IF;

  IF v_code.max_redemptions IS NOT NULL AND v_code.times_redeemed >= v_code.max_redemptions THEN
    RETURN jsonb_build_object('valid', false, 'error', 'This discount code has reached its maximum usage');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'id', v_code.id,
    'code', v_code.code,
    'discount_type', v_code.discount_type,
    'discount_value', v_code.discount_value,
    'duration_type', v_code.duration_type,
    'duration_months', v_code.duration_months,
    'description', v_code.description
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_discount_code TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_discount_code TO anon;

-- RPC: Get active platform pricing
CREATE OR REPLACE FUNCTION public.get_platform_pricing()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pricing platform_pricing%ROWTYPE;
BEGIN
  SELECT * INTO v_pricing
  FROM platform_pricing
  WHERE is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'base_price', 50,
      'per_user_price', 10,
      'included_users', 1,
      'billing_interval', 'monthly'
    );
  END IF;

  RETURN jsonb_build_object(
    'id', v_pricing.id,
    'base_price', v_pricing.base_price,
    'per_user_price', v_pricing.per_user_price,
    'included_users', v_pricing.included_users,
    'billing_interval', v_pricing.billing_interval
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_platform_pricing TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_platform_pricing TO anon;

-- RPC: Update platform pricing (global admin only)
CREATE OR REPLACE FUNCTION public.update_platform_pricing(
  p_base_price numeric,
  p_per_user_price numeric,
  p_included_users integer DEFAULT 1,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_id uuid;
BEGIN
  IF NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Only global admins can update platform pricing';
  END IF;

  IF p_base_price < 0 OR p_per_user_price < 0 THEN
    RAISE EXCEPTION 'Prices cannot be negative';
  END IF;

  UPDATE platform_pricing SET is_active = false WHERE is_active = true;

  INSERT INTO platform_pricing (base_price, per_user_price, included_users, billing_interval, is_active, created_by)
  VALUES (p_base_price, p_per_user_price, p_included_users, 'monthly', true, auth.uid())
  RETURNING id INTO v_new_id;

  INSERT INTO platform_pricing_history (pricing_id, base_price, per_user_price, included_users, changed_by, notes)
  VALUES (v_new_id, p_base_price, p_per_user_price, p_included_users, auth.uid(), p_notes);

  RETURN jsonb_build_object('success', true, 'pricing_id', v_new_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_platform_pricing TO authenticated;

-- RPC: Get tenant billing summary
CREATE OR REPLACE FUNCTION public.get_tenant_billing_summary(p_org_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_sub tenant_subscriptions%ROWTYPE;
  v_user_count integer;
  v_org organizations%ROWTYPE;
BEGIN
  IF p_org_id IS NOT NULL AND public.is_global_admin() THEN
    v_org_id := p_org_id;
  ELSE
    SELECT organization_id INTO v_org_id FROM profiles WHERE id = auth.uid();
  END IF;

  SELECT * INTO v_org FROM organizations WHERE id = v_org_id;
  SELECT * INTO v_sub FROM tenant_subscriptions WHERE organization_id = v_org_id;
  SELECT count(*) INTO v_user_count FROM profiles WHERE organization_id = v_org_id AND is_active = true;

  RETURN jsonb_build_object(
    'organization_name', v_org.name,
    'plan_type', v_org.plan_type,
    'subscription_status', v_org.subscription_status,
    'trial_ends_at', v_org.trial_ends_at,
    'user_count', v_user_count,
    'subscription', CASE WHEN v_sub.id IS NOT NULL THEN jsonb_build_object(
      'id', v_sub.id,
      'stripe_subscription_id', v_sub.stripe_subscription_id,
      'current_user_count', v_sub.current_user_count,
      'base_amount', v_sub.base_amount,
      'per_user_amount', v_sub.per_user_amount,
      'total_monthly_amount', v_sub.total_monthly_amount,
      'discount_amount', v_sub.discount_amount,
      'payment_status', v_sub.payment_status,
      'current_period_start', v_sub.current_period_start,
      'current_period_end', v_sub.current_period_end,
      'cancel_at_period_end', v_sub.cancel_at_period_end
    ) ELSE NULL END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_billing_summary TO authenticated;
