drop policy website_widget_admin on public.website_widget_settings;
create policy website_widget_admin on public.website_widget_settings for all to authenticated
using (organization_id=public.get_user_org_id() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.organization_id=website_widget_settings.organization_id and p.role='admin' and p.is_active and p.contact_id is null))
with check (organization_id=public.get_user_org_id() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.organization_id=website_widget_settings.organization_id and p.role='admin' and p.is_active and p.contact_id is null));
