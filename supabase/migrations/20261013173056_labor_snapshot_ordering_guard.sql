-- Keep a delayed older delivery from replacing a newer source correction.
CREATE OR REPLACE FUNCTION public.ingest_external_labor(p_organization_id uuid,p_source text,p_snapshots jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s jsonb; k text; d date; h text; old_hash text; old_updated timestamptz; incoming_updated timestamptz; enabled_source boolean; changed integer:=0; skipped integer:=0; cutoff date;
BEGIN
 IF p_source NOT IN ('ipoint','quickbooks_time') OR jsonb_typeof(p_snapshots)<>'array' OR jsonb_array_length(p_snapshots)>1000 THEN RAISE EXCEPTION 'Invalid labor import'; END IF;
 SELECT enabled,native_from INTO enabled_source,cutoff FROM public.labor_import_sources WHERE organization_id=p_organization_id AND source=p_source FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Labor source is not configured'; END IF;
 IF NOT enabled_source THEN RETURN jsonb_build_object('changed',0,'disabled',true); END IF;
 FOR s IN SELECT value FROM jsonb_array_elements(p_snapshots) LOOP
  k:=s->>'kind'; d:=(s->>'day')::date;
  IF d IS NULL OR d>current_date OR NOT((p_source='ipoint' AND k IN ('technician','project')) OR(p_source='quickbooks_time' AND k='payroll')) OR jsonb_typeof(s->'records') IS DISTINCT FROM 'array' OR jsonb_array_length(s->'records')=0 THEN RAISE EXCEPTION 'Invalid or empty labor snapshot'; END IF;
  -- Cutover is explicit; historical records remain intact. Project snapshots are not cumulative sums.
  IF cutoff IS NOT NULL AND d>=cutoff THEN skipped:=skipped+1; CONTINUE; END IF;
  incoming_updated:=(s->>'updatedAt')::timestamptz;
  IF incoming_updated IS NULL THEN RAISE EXCEPTION 'Source observation timestamp required'; END IF;
  h:=md5((s-'updatedAt')::text);
  SELECT content_hash,(payload->>'updatedAt')::timestamptz INTO old_hash,old_updated FROM public.external_labor_snapshots WHERE organization_id=p_organization_id AND source=p_source AND kind=k AND day=d;
  IF old_hash=h OR (old_updated IS NOT NULL AND incoming_updated<old_updated) THEN skipped:=skipped+1; CONTINUE; END IF;
  INSERT INTO public.labor_import_batches(organization_id,source,kind,day,content_hash,payload) VALUES(p_organization_id,p_source,k,d,h,s) ON CONFLICT DO NOTHING;
  INSERT INTO public.external_labor_snapshots(organization_id,source,kind,day,content_hash,payload) VALUES(p_organization_id,p_source,k,d,h,s)
  ON CONFLICT(organization_id,source,kind,day) DO UPDATE SET payload=excluded.payload,content_hash=excluded.content_hash,imported_at=now();
  changed:=changed+1;
 END LOOP;
 UPDATE public.labor_import_sources SET last_success_at=now(),last_error=NULL,updated_at=now() WHERE organization_id=p_organization_id AND source=p_source;
 RETURN jsonb_build_object('changed',changed,'unchanged_or_cutover',skipped,'disabled',false);
END $$;
REVOKE ALL ON FUNCTION public.ingest_external_labor(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_external_labor(uuid,text,jsonb) TO service_role;
