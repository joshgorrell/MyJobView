-- Preserve existing MJV approval/application behavior. Techsafe bookkeeping must
-- not become a dependency of legacy sales-order work. Keep private evidence for
-- history, but detach the synchronous calls introduced by the foundation.
DO $migration$
DECLARE signature text; definition text; pattern text; matches integer;
BEGIN
  FOREACH signature IN ARRAY ARRAY['public.apply_change_order(uuid)','public.reject_change_order(uuid,text)'] LOOP
    SELECT pg_get_functiondef(signature::regprocedure) INTO definition;
    IF signature='public.apply_change_order(uuid)' THEN
      pattern:='PERFORM[[:space:]]+techsafe_source[.]record_scope_removal\(v_co[.]id,v_item[.]id,v_item[.]proposal_line_item_id\);';
    ELSE
      pattern:='PERFORM[[:space:]]+techsafe_source[.]record_scope_restoration\(p_change_order_id\);';
    END IF;
    SELECT count(*) INTO matches FROM regexp_matches(definition,pattern,'g');
    IF matches<>1 THEN
      RAISE EXCEPTION 'Unexpected Techsafe hook in %; review before detaching',signature;
    END IF;
    EXECUTE regexp_replace(definition,pattern,'');
  END LOOP;
END;
$migration$;
-- Retained membership helpers are not an export/freshness certificate. Once
-- legacy hooks are detached, removals without trusted evidence stay unverified.
-- No replacement finalizer, source guard, registration or sync is enabled.

-- The unused managed engine also installed receipt-invalidation triggers.
-- Keep it dormant; background observation must not run in MJV transactions.
DROP TRIGGER invalidate_techsafe_change_application_status ON public.change_orders;
DROP TRIGGER invalidate_techsafe_change_application_delete ON public.change_orders;
