-- Use the same current mandate for new staff/customer submissions; existing signed snapshots stay intact.
DO $migration$
DECLARE definition text; revised text;
BEGIN
 definition:=pg_get_functiondef('private.security_onboarding_core(text,uuid,text,jsonb)'::regprocedure);
 revised:=regexp_replace(definition,$pattern$v_authorization text := '[^']*';$pattern$,'v_authorization text := private.security_autopay_authorization();');
 IF revised=definition AND definition NOT LIKE '%v_authorization text := private.security_autopay_authorization();%' THEN RAISE EXCEPTION 'Current portal mandate declaration was not found'; END IF;
 IF revised<>definition THEN EXECUTE revised; END IF;
END $migration$;
