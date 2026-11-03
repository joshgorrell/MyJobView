-- Weekly delivery is a private Flow post, never an email or HTTP worker.
DO $$ DECLARE job record; BEGIN
 FOR job IN SELECT jobid FROM cron.job WHERE jobname='proposal-activity-weekly-due-reports'
 LOOP PERFORM cron.unschedule(job.jobid); END LOOP;
END $$;
DROP FUNCTION IF EXISTS private.invoke_proposal_activity_weekly();
DROP FUNCTION IF EXISTS public.proposal_activity_weekly_worker(text,uuid,uuid,jsonb);
DROP FUNCTION IF EXISTS private.proposal_activity_weekly_worker(text,uuid,uuid,jsonb);
UPDATE public.proposal_activity_weekly_reports SET status='skipped',error='Weekly delivery moved to Flow',lease_token=NULL,lease_until=NULL
 WHERE status IN('pending','processing','failed');
ALTER TABLE public.proposal_activity_weekly_reports ADD COLUMN flow_event_id bigint REFERENCES public.flow_events(id) ON DELETE SET NULL;
ALTER TABLE public.proposal_activity_weekly_reports DROP CONSTRAINT proposal_activity_weekly_reports_status_check;
ALTER TABLE public.proposal_activity_weekly_reports ADD CONSTRAINT proposal_activity_weekly_reports_status_check
 CHECK(status IN('pending','processing','sent','failed','skipped','published'));
CREATE UNIQUE INDEX flow_weekly_proposal_activity ON public.flow_events(organization_id,source_id)
 WHERE source_table='proposal_activity_weekly_reports' AND event_type='proposal_activity_weekly';

DROP POLICY flow_proposal_activity_recipient ON public.flow_events;
CREATE POLICY flow_proposal_activity_recipient ON public.flow_events AS RESTRICTIVE FOR SELECT TO authenticated USING(
 CASE WHEN event_type='proposal_first_opened' THEN
   activity_recipient_user_id=(SELECT auth.uid()) AND public.flow_has_module_access('feed')
   AND EXISTS(SELECT 1 FROM public.proposals p WHERE p.id=source_id AND p.organization_id=flow_events.organization_id)
 WHEN event_type='proposal_activity_weekly' THEN
   activity_recipient_user_id=(SELECT auth.uid()) AND public.flow_has_module_access('feed')
   AND EXISTS(SELECT 1 FROM public.proposal_activity_weekly_reports r WHERE r.id=source_id AND r.organization_id=flow_events.organization_id AND r.recipient_user_id=(SELECT auth.uid()))
 ELSE true END
);
DROP POLICY proposal_weekly_report_read ON public.proposal_activity_weekly_reports;
CREATE POLICY proposal_weekly_report_read ON public.proposal_activity_weekly_reports FOR SELECT TO authenticated USING(
 recipient_user_id=(SELECT auth.uid()) AND organization_id=public.get_user_org_id()
 AND public.user_has_module_access(auth.uid(),'proposals') AND public.flow_has_module_access('feed')
);

CREATE FUNCTION private.publish_weekly_proposal_activity() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE candidate record; report_window jsonb; content jsonb; report public.proposal_activity_weekly_reports;
 published integer=0; event_id bigint; newly_posted boolean; start_day date;
BEGIN
 FOR candidate IN SELECT employee.id rep_id,employee.organization_id,org.timezone FROM public.profiles employee
   JOIN public.organizations org ON org.id=employee.organization_id
   WHERE employee.is_active AND employee.role<>'portal_user'
     AND private.can_access_page(employee.id,'proposals') AND private.can_access_page(employee.id,'feed')
     AND EXISTS(SELECT 1 FROM public.proposals p WHERE p.created_by=employee.id AND p.organization_id=employee.organization_id AND p.is_active_revision AND p.status<>'archived')
 LOOP
  report_window=private.proposal_activity_report_window(candidate.timezone,clock_timestamp());
  IF NOT (report_window->>'due')::boolean THEN CONTINUE; END IF;
  start_day=(report_window->>'week_start')::date;
  IF EXISTS(SELECT 1 FROM public.proposal_activity_weekly_reports r WHERE r.organization_id=candidate.organization_id AND r.recipient_user_id=candidate.rep_id AND r.week_start=start_day AND r.status='published') THEN CONTINUE; END IF;
  content=private.proposal_weekly_data(candidate.organization_id,candidate.rep_id,(report_window->>'period_start')::timestamptz,(report_window->>'period_end')::timestamptz);
  IF jsonb_array_length(content)=0 THEN CONTINUE; END IF;
  INSERT INTO public.proposal_activity_weekly_reports(organization_id,recipient_user_id,week_start,timezone,period_start,period_end,report_data,status)
   VALUES(candidate.organization_id,candidate.rep_id,start_day,report_window->>'timezone',(report_window->>'period_start')::timestamptz,(report_window->>'period_end')::timestamptz,content,'pending')
   ON CONFLICT(organization_id,recipient_user_id,week_start) DO UPDATE SET report_data=excluded.report_data,timezone=excluded.timezone,period_start=excluded.period_start,period_end=excluded.period_end
     WHERE proposal_activity_weekly_reports.flow_event_id IS NULL AND proposal_activity_weekly_reports.status<>'published'
   RETURNING * INTO report;
  IF report.id IS NULL THEN CONTINUE; END IF;
  INSERT INTO public.flow_events(organization_id,actor_name,category,event_type,summary,details,source_table,source_id,required_module,is_internal,activity_recipient_user_id)
   VALUES(candidate.organization_id,'MyJobView','sales','proposal_activity_weekly',
     'Weekly Proposal Activity · '||to_char(start_day,'Mon DD')||'–'||to_char(start_day+6,'Mon DD'),
     'Open this post to see your engaged and unopened proposals, with links to Activity.',
     'proposal_activity_weekly_reports',report.id,'proposals',false,candidate.rep_id)
   ON CONFLICT(organization_id,source_id) WHERE source_table='proposal_activity_weekly_reports' AND event_type='proposal_activity_weekly' DO NOTHING
   RETURNING id INTO event_id;
  newly_posted=FOUND;
  IF event_id IS NULL THEN SELECT id INTO event_id FROM public.flow_events WHERE organization_id=candidate.organization_id AND source_id=report.id AND source_table='proposal_activity_weekly_reports' AND event_type='proposal_activity_weekly'; END IF;
  UPDATE public.proposal_activity_weekly_reports SET status='published',flow_event_id=event_id,error=NULL,lease_token=NULL,lease_until=NULL WHERE id=report.id;
  IF newly_posted THEN published=published+1; END IF;
 END LOOP;
 RETURN published;
END $$;
REVOKE ALL ON FUNCTION private.publish_weekly_proposal_activity() FROM PUBLIC,anon,authenticated,service_role;

-- Return only the owning rep's currently assigned proposals, never the email payload.
CREATE FUNCTION private.get_weekly_proposal_activity(p_report_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE report public.proposal_activity_weekly_reports; content jsonb;
BEGIN
 SELECT r.* INTO report FROM public.proposal_activity_weekly_reports r JOIN public.profiles me ON me.id=auth.uid()
  WHERE r.id=p_report_id AND r.recipient_user_id=me.id AND r.organization_id=me.organization_id AND me.is_active AND me.role<>'portal_user' AND r.status='published';
 IF report.id IS NULL OR NOT private.can_access_page(auth.uid(),'proposals') OR NOT private.can_access_page(auth.uid(),'feed') THEN RETURN NULL; END IF;
 SELECT coalesce(jsonb_agg(item ORDER BY ordinal),'[]') INTO content FROM jsonb_array_elements(report.report_data) WITH ORDINALITY entry(item,ordinal)
  WHERE EXISTS(SELECT 1 FROM public.proposals p WHERE p.id=(item->>'proposal_id')::uuid AND p.organization_id=report.organization_id AND p.created_by=auth.uid());
 RETURN jsonb_build_object('period_start',report.period_start,'period_end',report.period_end,'timezone',report.timezone,'report_data',content);
END $$;
REVOKE ALL ON FUNCTION private.get_weekly_proposal_activity(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.get_weekly_proposal_activity(uuid) TO authenticated;
CREATE FUNCTION public.get_weekly_proposal_activity(p_report_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.get_weekly_proposal_activity(p_report_id); $$;
REVOKE ALL ON FUNCTION public.get_weekly_proposal_activity(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_weekly_proposal_activity(uuid) TO authenticated;
SELECT cron.schedule('proposal-activity-weekly-due-reports','*/15 * * * *','select private.publish_weekly_proposal_activity();');
NOTIFY pgrst,'reload schema';
