-- A request for staff corrections does not invalidate the customer's submitted
-- copy. Retain the original token/ownership checks and submission lock.
DO $patch$
DECLARE body text; needle text := '''pending_customer'',''customer_completed'',''pending_approval'',''approved'',''active'',''cancelled''';
BEGIN
 body := pg_get_functiondef('private.security_onboarding_core(text,uuid,text,jsonb)'::regprocedure);
 IF position(needle IN body)=0 THEN RAISE EXCEPTION 'Expected portal status gates were not found'; END IF;
 body := replace(body,needle,needle||',''rejected''');
 EXECUTE body;
END $patch$;
