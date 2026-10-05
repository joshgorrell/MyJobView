-- Staff resolve missing/incorrect information through audited field edits.
-- Retire the separate correction-request action, including older clients.
DO $patch$
DECLARE body text; needle text := ' IF p_action=''create'' THEN';
BEGIN
 body := pg_get_functiondef('private.staff_security_onboarding(text,uuid,jsonb)'::regprocedure);
 IF position(needle IN body)=0 THEN RAISE EXCEPTION 'Expected staff action gate was not found'; END IF;
 body := replace(body,needle,' IF p_action=''reject'' THEN RAISE EXCEPTION ''Update the submitted fields through the review screen, then approve the agreement''; END IF;'||E'\n'||needle);
 EXECUTE body;
END $patch$;
-- Preserve executed evidence and revisions; any historical returned submissions
-- belong in the ordinary review queue, ready for deliberate staff field edits.
DO $normalize$
DECLARE previous text := current_setting('mjv.security_signing',true);
BEGIN
 PERFORM set_config('mjv.security_signing','true',true);
 UPDATE public.security_contracts SET status='pending_approval'
 WHERE status='rejected' AND customer_completed_at IS NOT NULL;
 PERFORM set_config('mjv.security_signing',coalesce(previous,'false'),true);
END $normalize$;
