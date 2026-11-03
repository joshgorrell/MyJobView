/*\n  # Update VIP Subscription Check to Include Trial Status\n  \n  ## Summary\n  Updates the contact_has_active_vip_subscription function to check for both 'active' and 'trial' \n  status subscriptions. Trial subscriptions are considered valid only if trial_end_date hasn't passed.\n  \n  ## Changes\n  1. Update contact_has_active_vip_subscription function\n    - Include status = 'trial' in the check\n    - Verify trial_end_date >= CURRENT_DATE for trial subscriptions\n    - Keep existing 'active' subscription logic\n  \n  ## Purpose\n  - Allow customers in "Test & Tune" trial period to access VIP features like messaging\n  - Automatically expire trial access when trial_end_date passes\n  - Support both ongoing paid subscriptions and limited-time trials\n*/\n\n-- Update function to check for both active subscriptions and valid trials\nCREATE OR REPLACE FUNCTION contact_has_active_vip_subscription(p_contact_id uuid)\nRETURNS boolean AS $$\nBEGIN\n  RETURN EXISTS (\n    SELECT 1 \n    FROM recurring_subscriptions rs\n    JOIN recurring_plans rp ON rp.id = rs.plan_id\n    WHERE rs.contact_id = p_contact_id\n      AND rp.plan_type = 'vip_plan'\n      AND (\n        -- Active subscription with valid end date (or no end date)\n        (rs.status = 'active' AND (rs.end_date IS NULL OR rs.end_date >= CURRENT_DATE))\n        OR\n        -- Trial subscription with valid trial end date\n        (rs.status = 'trial' AND rs.trial_end_date >= CURRENT_DATE)\n      )\n  )

\nEND

\n$$ LANGUAGE plpgsql SECURITY DEFINER

\n\nCOMMENT ON FUNCTION contact_has_active_vip_subscription(uuid) IS 'Returns true if contact has an active VIP subscription or valid trial (Test & Tune)'

\n
