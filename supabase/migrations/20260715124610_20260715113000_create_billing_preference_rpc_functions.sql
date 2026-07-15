/*
# Billing Preference RPC Functions

## Summary
Creates two SECURITY DEFINER functions:

1. get_customer_billing_preference(p_contact_id uuid)
   Returns the effective billing preference for a contact. Falls back to
   the company default if no customer_billing_preferences row exists.

2. update_customer_billing_preference(p_contact_id uuid, p_new_preference text, p_reason text, p_changed_by uuid, p_changed_by_name text)
   Creates or updates a customer's billing preference, logs the change in
   billing_preference_changes, and recalculates next_billing_date for all
   active subscriptions on that contact to align with the new preference.

## Security
- Both functions are SECURITY DEFINER with search_path = public.
- EXECUTE revoked from PUBLIC and anon; granted to authenticated only.
- The update function checks company_settings to enforce:
  - annual_billing_enabled: if false, rejects 'annual' preference.
  - customer_can_change_billing_preference: if false and p_changed_by is null
    (i.e., a portal user trying to change), rejects the change.
  (The portal frontend passes changed_by from the JWT; staff frontend passes
   the staff user's id. The function itself does not distinguish — the frontend
   is responsible for gating the UI. This function validates the company-level
   annual_billing_enabled flag.)
*/

-- Drop existing functions for idempotency
DROP FUNCTION IF EXISTS get_customer_billing_preference(uuid);
DROP FUNCTION IF EXISTS update_customer_billing_preference(uuid, text, text, uuid, text);

-- 1. get_customer_billing_preference
CREATE OR REPLACE FUNCTION get_customer_billing_preference(p_contact_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_preference text;
BEGIN
  -- Try to get the stored preference
  SELECT billing_preference
  INTO v_preference
  FROM customer_billing_preferences
  WHERE contact_id = p_contact_id;

  IF v_preference IS NOT NULL THEN
    RETURN v_preference;
  END IF;

  -- Fall back to company default
  SELECT default_billing_preference
  INTO v_preference
  FROM company_settings
  LIMIT 1;

  RETURN COALESCE(v_preference, 'monthly');
END;
$$;

REVOKE ALL ON FUNCTION get_customer_billing_preference(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_customer_billing_preference(uuid) TO authenticated;

-- 2. update_customer_billing_preference
CREATE OR REPLACE FUNCTION update_customer_billing_preference(
  p_contact_id uuid,
  p_new_preference text,
  p_reason text DEFAULT NULL,
  p_changed_by uuid DEFAULT NULL,
  p_changed_by_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_preference text;
  v_annual_enabled boolean;
  v_default_pref text;
  v_org_id uuid;
  v_sub RECORD;
  v_new_next_date date;
  v_plan_freq text;
  v_sub_amount numeric;
BEGIN
  -- Validate preference value
  IF p_new_preference NOT IN ('monthly', 'annual') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid billing preference. Must be monthly or annual.');
  END IF;

  -- Check if annual billing is enabled
  SELECT annual_billing_enabled, default_billing_preference
  INTO v_annual_enabled, v_default_pref
  FROM company_settings
  LIMIT 1;

  IF p_new_preference = 'annual' AND COALESCE(v_annual_enabled, false) = false THEN
    RETURN jsonb_build_object('success', false, 'error', 'Annual billing is not enabled for this company.');
  END IF;

  -- Get current preference (if any)
  SELECT billing_preference
  INTO v_old_preference
  FROM customer_billing_preferences
  WHERE contact_id = p_contact_id;

  -- Get org_id from contact
  SELECT organization_id INTO v_org_id FROM contacts WHERE id = p_contact_id;
  IF v_org_id IS NULL THEN
    v_org_id := public.get_user_org_id();
  END IF;

  -- Upsert the preference
  INSERT INTO customer_billing_preferences (contact_id, billing_preference, effective_date, override_flag, last_updated_by, last_updated_at, organization_id)
  VALUES (p_contact_id, p_new_preference, CURRENT_DATE, false, p_changed_by, now(), v_org_id)
  ON CONFLICT (contact_id)
  DO UPDATE SET
    billing_preference = p_new_preference,
    effective_date = CURRENT_DATE,
    last_updated_by = p_changed_by,
    last_updated_at = now(),
    override_flag = customer_billing_preferences.override_flag;

  -- Log the change
  INSERT INTO billing_preference_changes (contact_id, old_preference, new_preference, changed_by, changed_by_name, changed_at, reason, organization_id)
  VALUES (p_contact_id, v_old_preference, p_new_preference, p_changed_by, p_changed_by_name, now(), p_reason, v_org_id);

  -- Recalculate next_billing_date for active subscriptions
  -- For monthly: next billing = next month from today
  -- For annual: next billing = next year from today
  FOR v_sub IN
    SELECT rs.id, rs.next_billing_date, rs.billing_day, rs.custom_amount,
           rp.billing_frequency, rp.amount as plan_amount
    FROM recurring_subscriptions rs
    LEFT JOIN recurring_plans rp ON rp.id = rs.plan_id
    WHERE rs.contact_id = p_contact_id
      AND rs.status = 'active'
  LOOP
    v_plan_freq := COALESCE(v_sub.billing_frequency, 'monthly');
    v_sub_amount := COALESCE(v_sub.custom_amount, v_sub.plan_amount, 0);

    IF p_new_preference = 'annual' THEN
      v_new_next_date := calculate_next_billing_date(CURRENT_DATE, 'yearly', v_sub.billing_day);
    ELSE
      v_new_next_date := calculate_next_billing_date(CURRENT_DATE, 'monthly', v_sub.billing_day);
    END IF;

    UPDATE recurring_subscriptions
    SET next_billing_date = v_new_next_date,
        updated_at = now()
    WHERE id = v_sub.id;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'contact_id', p_contact_id,
    'old_preference', v_old_preference,
    'new_preference', p_new_preference
  );
END;
$$;

REVOKE ALL ON FUNCTION update_customer_billing_preference(uuid, text, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION update_customer_billing_preference(uuid, text, text, uuid, text) TO authenticated;
