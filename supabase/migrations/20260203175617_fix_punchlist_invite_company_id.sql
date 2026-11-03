/*\n  # Fix Punchlist Invite Company ID Issue\n\n  ## Summary\n  Fixes the send_punchlist_invite function to properly get company_id from\n  company_settings instead of contacts table (which doesn't have company_id).\n\n  ## Changes\n  - Update send_punchlist_invite() to get company_id from company_settings\n  - For single-tenant systems, there should be only one company_settings record\n  - Makes company_id optional when creating trial subscriptions\n\n  ## Security\n  - Maintains SECURITY DEFINER with proper checks\n  - No changes to RLS policies\n*/\n\n-- Update the send_punchlist_invite function to get company_id from company_settings\nCREATE OR REPLACE FUNCTION send_punchlist_invite(p_invite_id uuid)\nRETURNS uuid\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = public\nAS $$\nDECLARE\n  v_invite record

\n  v_access_grant_id uuid

\n  v_company_id uuid

\nBEGIN\n  -- Get the pending invite\n  SELECT * INTO v_invite\n  FROM pending_punchlist_invites\n  WHERE id = p_invite_id\n  AND status = 'pending'

\n\n  IF NOT FOUND THEN\n    RAISE EXCEPTION 'Invite not found or already processed'

\n  END IF

\n\n  -- Get company_id from company_settings (single-tenant system)\n  SELECT id INTO v_company_id\n  FROM company_settings\n  LIMIT 1

\n\n  -- Check if contact already has active access\n  IF EXISTS (\n    SELECT 1 FROM punchlist_access_grants\n    WHERE contact_id = v_invite.contact_id\n    AND status = 'active'\n    AND (expiration_date IS NULL OR expiration_date >= CURRENT_DATE)\n  ) THEN\n    RAISE EXCEPTION 'Contact already has active punchlist access'

\n  END IF

\n\n  -- Create the access grant with 'active' status\n  INSERT INTO punchlist_access_grants (\n    contact_id,\n    access_type,\n    project_id,\n    granted_date,\n    expiration_date,\n    status,\n    notes\n  ) VALUES (\n    v_invite.contact_id,\n    'test_and_tune',\n    v_invite.project_id,\n    CURRENT_DATE,\n    CURRENT_DATE + INTERVAL '90 days',\n    'active',\n    'Granted via manual invite approval'\n  )\n  RETURNING id INTO v_access_grant_id

\n\n  -- Create trial subscription if one doesn't exist\n  -- Check if contact already has an active or trial subscription\n  IF NOT EXISTS (\n    SELECT 1 FROM recurring_subscriptions\n    WHERE contact_id = v_invite.contact_id\n    AND status IN ('trial', 'active')\n  ) THEN\n    INSERT INTO recurring_subscriptions (\n      company_id,\n      contact_id,\n      plan_id,\n      status,\n      start_date,\n      next_billing_date,\n      trial_started_date,\n      trial_end_date,\n      notes,\n      created_by\n    ) VALUES (\n      v_company_id,\n      v_invite.contact_id,\n      NULL,  -- No plan yet, just trial\n      'trial',\n      CURRENT_DATE,\n      CURRENT_DATE + INTERVAL '90 days',  -- Set next billing after trial\n      CURRENT_DATE,\n      CURRENT_DATE + INTERVAL '90 days',\n      'Trial subscription created from punchlist invite',\n      auth.uid()\n    )

\n  END IF

\n\n  -- Update the invite status to 'sent' and link to access grant\n  UPDATE pending_punchlist_invites\n  SET\n    status = 'sent',\n    reviewed_by = auth.uid(),\n    reviewed_at = now(),\n    invite_sent_at = now(),\n    access_grant_id = v_access_grant_id\n  WHERE id = p_invite_id

\n\n  RETURN v_access_grant_id

\nEND

\n$$

\n\n-- Grant execute permission to authenticated users\nGRANT EXECUTE ON FUNCTION send_punchlist_invite(uuid) TO authenticated

\n
