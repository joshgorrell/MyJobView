-- Preserve the existing decline actor type without rewriting historical records.
CREATE OR REPLACE FUNCTION public.record_proposal_decline(p_proposal_id uuid,p_reason text,p_notes text,p_source text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v_id uuid; v_org uuid; v_feedback_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.flow_has_module_access('proposals') THEN RAISE EXCEPTION 'Proposal access required'; END IF;
 SELECT p.id,p.organization_id INTO v_id,v_org FROM public.proposals p JOIN public.profiles actor ON actor.id=auth.uid()
 WHERE p.id=p_proposal_id AND actor.is_active AND p.organization_id=actor.organization_id
 AND p.status NOT IN ('approved','approved_pending_action','cancelled','archived')
 AND (p.created_by=actor.id OR actor.role IN ('admin','owner','super_admin','manager','sales_manager')) FOR UPDATE OF p;
 IF v_id IS NULL THEN RAISE EXCEPTION 'This proposal is not available for decline'; END IF;
 -- Older installations store the actor UUID; newer ones store the actor category.
 -- PL/pgSQL prepares only the executed branch, preserving each column's native type.
 IF (SELECT atttypid='uuid'::regtype FROM pg_attribute
     WHERE attrelid='public.proposals'::regclass AND attname='declined_by' AND NOT attisdropped) THEN
  UPDATE public.proposals SET status='declined',decline_reason=p_reason,
   decline_notes=nullif(trim(p_notes),''),declined_by=auth.uid(),
   declined_at=coalesce(declined_at,now()) WHERE id=v_id;
 ELSE
  UPDATE public.proposals SET status='declined',decline_reason=p_reason,
   decline_notes=nullif(trim(p_notes),''),declined_by='rep',
   declined_at=coalesce(declined_at,now()) WHERE id=v_id;
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unable to decline this proposal'; END IF;
 INSERT INTO public.proposal_loss_feedback(organization_id,proposal_id,source,reasons,notes)
 VALUES(v_org,v_id,p_source,ARRAY[p_reason],coalesce(trim(p_notes),'')) RETURNING id INTO v_feedback_id;
 RETURN v_feedback_id;
END $$;
REVOKE ALL ON FUNCTION public.record_proposal_decline(uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_proposal_decline(uuid,text,text,text) TO authenticated;

