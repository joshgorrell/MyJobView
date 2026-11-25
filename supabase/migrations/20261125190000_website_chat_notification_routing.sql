create or replace function public.notify_website_chat_first_message() returns trigger language plpgsql security definer set search_path='' as $$
declare recipients jsonb;
begin
 if new.sender<>'visitor' then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.conversation_id::text,0));
 if exists(select 1 from public.website_chat_messages m where m.conversation_id=new.conversation_id and m.sender='visitor' and m.id<>new.id) then return new; end if;
 select w.options->'notification_recipients' into recipients from public.website_chat_conversations c join public.website_widget_settings w on w.id=c.widget_id and w.organization_id=c.organization_id where c.id=new.conversation_id and c.organization_id=new.organization_id;
 if recipients is null or jsonb_typeof(recipients)<>'array' then recipients:='[]'::jsonb; end if;
 insert into public.notifications(organization_id,user_id,type,title,body,related_id,is_read)
 select new.organization_id,p.id,'message','New website chat','A website visitor has started a conversation.',new.conversation_id,false
 from public.profiles p where p.organization_id=new.organization_id and p.is_active and p.contact_id is null and ((jsonb_array_length(recipients)=0 and p.role='admin') or recipients ? p.id::text);
 return new;
end; $$;
