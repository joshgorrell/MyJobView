-- Scope the existing production RPC without replacing its evolving business logic.
-- Uses existing visibility_scope and user_offices; no new settings or tables.
-- Fail closed if the expected function body changes. This migration does not grant user access.
DO $migration$
DECLARE definition text; insertion text := $insertion$
  -- Existing per-user visibility scope applies to the full Tech Stats payload.
  IF EXISTS (SELECT 1 FROM public.user_visibility_settings v WHERE v.user_id=auth.uid() AND v.visibility_scope <> 'all_offices')
     AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.role='admin') THEN
    DECLARE ids uuid[]; names text[]; scope text; field text; filtered jsonb;
    BEGIN
      SELECT visibility_scope INTO scope FROM public.user_visibility_settings WHERE user_id=auth.uid();
      SELECT COALESCE(array_agg(p.id),ARRAY[]::uuid[]),COALESCE(array_agg(lower(btrim(p.full_name))),ARRAY[]::text[])
      INTO ids,names FROM public.profiles p WHERE p.organization_id=org AND
        ((scope='own_only' AND p.id=auth.uid())
        OR (scope='office_only' AND EXISTS (SELECT 1 FROM public.profiles v JOIN public.user_offices a ON a.user_id=p.id AND a.office_id=v.primary_office_id WHERE v.id=auth.uid()))
        OR (scope='selected_offices' AND EXISTS (SELECT 1 FROM public.user_offices a JOIN public.user_offices b ON b.office_id=a.office_id WHERE a.user_id=auth.uid() AND b.user_id=p.id)));
      FOREACH field IN ARRAY ARRAY['roster','configs','mappings','native_jobs','native_payroll'] LOOP
        SELECT COALESCE(jsonb_agg(item),'[]'::jsonb) INTO filtered FROM jsonb_array_elements(COALESCE(result->field,'[]'::jsonb)) item
        WHERE (CASE WHEN field='roster' THEN item->>'id' ELSE item->>'profile_id' END) = ANY(SELECT x::text FROM unnest(ids) x);
        result:=jsonb_set(result,ARRAY[field],filtered);
      END LOOP;
      SELECT COALESCE(jsonb_agg(jsonb_set(s,'{payload,records}',COALESCE((
        SELECT jsonb_agg(rec) FROM jsonb_array_elements(COALESCE(s#>'{payload,records}','[]'::jsonb)) rec
        WHERE CASE WHEN s->>'kind'='technician' THEN
          lower(btrim(rec->>'technician'))=ANY(names)
          AND (SELECT count(*) FROM public.profiles p WHERE p.organization_id=org AND lower(btrim(p.full_name))=lower(btrim(rec->>'technician')))=1
        ELSE (rec->>'user_id')=ANY(SELECT x::text FROM unnest(ids) x) END
      ),'[]'::jsonb))),'[]'::jsonb) INTO filtered
      FROM jsonb_array_elements(COALESCE(result->'snapshots','[]'::jsonb)) s;
      result:=jsonb_set(result,'{snapshots}',filtered);
    END;
  END IF;
$insertion$;
BEGIN
  SELECT pg_get_functiondef('public.get_tech_production(date,date)'::regprocedure) INTO definition;
  IF position('Existing per-user visibility scope applies' IN definition)>0 THEN RETURN; END IF;
  IF position('  RETURN result;' IN definition)=0 OR position('DECLARE org uuid; result jsonb;' IN definition)=0 THEN
    RAISE EXCEPTION 'Unexpected get_tech_production function shape; refusing unsafe patch';
  END IF;
  definition := replace(definition,'  RETURN result;',insertion || '  RETURN result;');
  EXECUTE definition;
END $migration$;
REVOKE ALL ON FUNCTION public.get_tech_production(date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tech_production(date,date) TO authenticated;
