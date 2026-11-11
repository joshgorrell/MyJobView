-- Prevent destructive unlock of approved, financially committed change orders.
-- Existing RPC resets status to draft, deletes approvals, and leaves applied proposal
-- lines in place. Until atomic relock exists, that path must fail closed.
CREATE OR REPLACE FUNCTION public.unlock_change_order(
 p_change_order_id uuid, p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
 v_co public.change_orders%ROWTYPE;
 v_role text;
 v_org uuid;
 v_caller uuid;
BEGIN
 v_caller := auth.uid();
 IF v_caller IS NULL THEN
   RETURN jsonb_build_object('success',false,'error','Not authenticated');
 END IF;
 SELECT role,organization_id INTO v_role,v_org FROM public.profiles WHERE id=v_caller;
 IF v_role NOT IN ('admin','office_manager','project_manager') OR v_org IS NULL THEN
   RETURN jsonb_build_object('success',false,'error','Insufficient permissions to unlock change orders');
 END IF;
 SELECT * INTO v_co FROM public.change_orders
  WHERE id=p_change_order_id AND organization_id=v_org FOR UPDATE;
 IF NOT FOUND THEN
   RETURN jsonb_build_object('success',false,'error','Change order not found');
 END IF;
 IF NOT COALESCE(v_co.is_locked,false) THEN
   RETURN jsonb_build_object('success',false,'error','Change order is not locked');
 END IF;
 -- Never erase an approved customer's authorization or expose already-applied
 -- Sales Order lines to a non-transactional edit. No mutation in this branch.
 IF v_co.status='approved' OR v_co.customer_approved IS TRUE OR
    EXISTS (SELECT 1 FROM change_order_commit.revisions
            WHERE change_order_id=v_co.id) THEN
   RETURN jsonb_build_object('success',false,
    'error','Approved change orders cannot be unlocked safely until committed-revision reconciliation is enabled. Approval and Sales Order values were preserved.',
    'code','committed_unlock_requires_reconciliation');
 END IF;
 -- Preserve the existing legacy behavior for never-approved locked records,
 -- but scope the update and approval deletion to the authenticated tenant.
 UPDATE public.change_orders SET
   status='draft',is_locked=false,is_active=false,
   approved_by=NULL,approved_by_name=NULL,approval_date=NULL,
   approval_notes=NULL,customer_approved=false,
   unlocked_by=v_caller,unlocked_at=now()
 WHERE id=v_co.id AND organization_id=v_org;
 DELETE FROM public.change_order_approvals WHERE change_order_id=v_co.id
   AND organization_id=v_org;
 INSERT INTO public.change_order_history
   (change_order_id,organization_id,action,performed_by,description,snapshot)
 VALUES (v_co.id,v_org,'status_changed',v_caller,
   COALESCE('Change order unlocked: '||NULLIF(p_reason,''),'Change order unlocked'),
   to_jsonb(v_co));
 RETURN jsonb_build_object('success',true);
END;
$$;
REVOKE ALL ON FUNCTION public.unlock_change_order(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.unlock_change_order(uuid,text) TO authenticated;
