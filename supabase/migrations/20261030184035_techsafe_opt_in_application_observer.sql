-- Explicit opt-in only. No rows are seeded and browser roles cannot enable it.
CREATE TABLE techsafe_source.application_observer_controls (
  organization_id uuid PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false
);
ALTER TABLE techsafe_source.application_observer_controls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE techsafe_source.application_observer_controls FROM PUBLIC,anon,authenticated;

-- Preserve the current public function's signature, ownership, privileges,
-- settings and business body. Add only marked, error-isolated observations.
DO $migration$
DECLARE definition text; body text; original_body text; restored text; marker text; pattern text; matches integer;
BEGIN
  SELECT pg_get_functiondef(oid),prosrc INTO definition,body FROM pg_proc
    WHERE oid='public.apply_change_order(uuid)'::regprocedure AND prosecdef
      AND prorettype='void'::regtype AND NOT proretset;
  IF NOT FOUND THEN RAISE EXCEPTION 'Review changed application execution model'; END IF;
  original_body:=body;
  marker:='AS $function$'||body||'$function$';
  IF position(marker IN definition)=0 OR position('v_techsafe_observation' IN body)>0
    OR position('techsafe_source.record_scope_removal' IN body)>0
    OR position('techsafe_source.require_legacy_order_path' IN body)>0
    OR body ~ '\mRETURN\M' THEN
    RAISE EXCEPTION 'Review changed application body before attaching observer';
  END IF;
  pattern:='\mDECLARE\M';
  SELECT count(*) INTO matches FROM regexp_matches(body,pattern,'g');
  IF matches<>1 THEN RAISE EXCEPTION 'Review application declarations'; END IF;
  body:=regexp_replace(body,pattern,E'DECLARE\n  v_techsafe_observation uuid; -- TECHSAFE_OBSERVER_VARIABLE');
  pattern:='WHERE[[:space:]]+id[[:space:]]*=[[:space:]]*v_co[.]sales_order_id;';
  SELECT count(*) INTO matches FROM regexp_matches(body,pattern,'g');
  IF matches<>1 THEN RAISE EXCEPTION 'Review application parent-resolution point'; END IF;
  body:=regexp_replace(body,pattern,E'\\&\n-- TECHSAFE_OBSERVER_BEGIN_START\nBEGIN\n  IF EXISTS(SELECT 1 FROM techsafe_source.application_observer_controls\n    WHERE organization_id=v_co.organization_id AND enabled IS TRUE) THEN\n    v_techsafe_observation:=techsafe_source.try_begin_application_observation(p_change_order_id);\n  END IF;\nEXCEPTION WHEN OTHERS THEN\n  v_techsafe_observation:=NULL;\nEND;\n-- TECHSAFE_OBSERVER_BEGIN_END\n');
  pattern:='END;[[:space:]]*$';
  SELECT count(*) INTO matches FROM regexp_matches(body,pattern,'g');
  IF matches<>1 THEN RAISE EXCEPTION 'Review application return point'; END IF;
  body:=regexp_replace(body,pattern,E'-- TECHSAFE_OBSERVER_FINISH_START\nBEGIN\n  IF v_techsafe_observation IS NOT NULL THEN\n    PERFORM techsafe_source.try_finish_application_observation(p_change_order_id,v_techsafe_observation);\n  END IF;\nEXCEPTION WHEN OTHERS THEN\n  NULL;\nEND;\n-- TECHSAFE_OBSERVER_FINISH_END\nEND;\n');
  -- Refuse any accidental change outside the three instrumentation sections.
  restored:=regexp_replace(body,'v_techsafe_observation uuid; -- TECHSAFE_OBSERVER_VARIABLE','');
  restored:=regexp_replace(restored,'(?s)-- TECHSAFE_OBSERVER_BEGIN_START.*?-- TECHSAFE_OBSERVER_BEGIN_END','');
  restored:=regexp_replace(restored,'(?s)-- TECHSAFE_OBSERVER_FINISH_START.*?-- TECHSAFE_OBSERVER_FINISH_END','');
  IF btrim(regexp_replace(restored,'[[:space:]]+',' ','g')) IS DISTINCT FROM
    btrim(regexp_replace(original_body,'[[:space:]]+',' ','g')) THEN
    RAISE EXCEPTION 'Observer changed application business body';
  END IF;
  definition:=replace(definition,marker,'AS $function$'||body||'$function$');
  EXECUTE definition;
END;
$migration$;
-- No approval routing, source guards, connection seeds, worker or quote enablement.
-- Completion is diagnostic evidence only. Missing evidence keeps Techsafe
-- unverified; it must never require replaying or blocking an MJV action.
