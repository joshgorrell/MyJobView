/*
# Fix Guard Trigger to Allow Technician Completion Notes

## Problem
The `guard_punchlist_api_update` trigger blocks ALL updates that set
`installer_notes` to non-NULL, with no user check. This conflicts with
`report_work_order_punchlist` (SECURITY DEFINER), which needs to set
`installer_notes` to the technician's completion notes so customers can
see what was done.

The SECURITY DEFINER function runs as the function owner (postgres), so
`current_user` inside the trigger is NOT `authenticated` when the function
does its UPDATE. The guard's first block already checks
`current_user = 'authenticated'` for portal-user restrictions. The
installer_notes block should do the same — only block direct API updates
from authenticated users, not updates from SECURITY DEFINER functions.

## Fix
Wrap the installer_notes check in `current_user = 'authenticated'` so it
only blocks direct table updates from the API (portal users and staff
bypassing the RPC), not from authorized SECURITY DEFINER functions.

## Scope
- Modified function: `private.guard_punchlist_api_update` — added
  `current_user = 'authenticated'` condition to the installer_notes check.
- No schema changes, no new tables, no RLS policy changes.
*/

CREATE OR REPLACE FUNCTION private.guard_punchlist_api_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
IF TG_OP = 'UPDATE'
AND current_user = 'authenticated'
AND private.punchlist_portal_identity(OLD.contact_id, OLD.organization_id)
AND (to_jsonb(NEW) - ARRAY['title','details','customer_notes','priority_order','updated_at'])
IS DISTINCT FROM
(to_jsonb(OLD) - ARRAY['title','details','customer_notes','priority_order','updated_at'])
THEN
RAISE EXCEPTION 'Use the authorized Punchlist action to change status or completion notes'
USING ERRCODE = '42501';
END IF;

IF current_user = 'authenticated' AND NEW.installer_notes IS NOT NULL THEN
RAISE EXCEPTION 'Technician notes must be saved as internal notes';
END IF;

RETURN NEW;
END;
$function$;
