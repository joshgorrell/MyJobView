/*\n  # Update VIP Function to Include Trial Period Support\n\n  1. Changes\n    - Update contact_has_active_vip_subscription() function to check for:\n      - Active VIP subscriptions\n      - Active trial periods (trial_end_date >= CURRENT_DATE)\n    - Customers with active trials get VIP access (like "Test & Tune" period)\n\n  2. Purpose\n    - Allow trial customers to access VIP features (messaging, etc.)\n    - Trial access expires when trial_end_date passes\n    - Admins can extend trials by updating trial_end_date\n*/\n\n-- Update function to check for active VIP subscriptions OR active trials\nCREATE OR REPLACE FUNCTION contact_has_active_vip_subscription(p_contact_id uuid)\nRETURNS boolean AS $$\nBEGIN\n  RETURN EXISTS (\n    SELECT 1 \n    FROM recurring_subscriptions rs\n    JOIN recurring_plans rp ON rp.id = rs.plan_id\n    WHERE rs.contact_id = p_contact_id\n      AND rs.status = 'active'\n      AND rp.plan_type = 'vip_plan'\n      AND (\n        -- Regular active subscription\n        (rs.end_date IS NULL OR rs.end_date >= CURRENT_DATE)\n        -- OR active trial period\n        OR (rs.trial_end_date IS NOT NULL AND rs.trial_end_date >= CURRENT_DATE)\n      )\n  )

\nEND

\n$$ LANGUAGE plpgsql SECURITY DEFINER

\n\nCOMMENT ON FUNCTION contact_has_active_vip_subscription(uuid) IS 'Returns true if contact has an active VIP subscription or active trial period (Test & Tune)'

\n
