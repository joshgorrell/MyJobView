-- Limit revision draft APIs to authenticated sessions. The legacy unversioned
-- writer must be inaccessible to every API role, including anon/service_role.
REVOKE ALL ON FUNCTION public.save_approved_change_order_revision_draft(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.save_approved_change_order_revision_draft_if_current(uuid,jsonb,bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.save_approved_change_order_revision_draft_if_current(uuid,jsonb,bigint) TO authenticated;
REVOKE ALL ON FUNCTION public.get_approved_change_order_revision_draft(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_approved_change_order_revision_draft(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.inspect_staged_change_order_revision(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.inspect_staged_change_order_revision(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.commit_staged_change_order_material_revision(uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;
