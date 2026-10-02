BEGIN;
SET search_path=public,extensions;
INSERT INTO organizations(id,name,slug,timezone) VALUES('77000000-0000-0000-0000-000000000001','PR77 Synthetic','pr77-synthetic','America/Chicago'),('77000000-0000-0000-0000-000000000002','PR77 Foreign','pr77-foreign','America/Chicago');
INSERT INTO auth.users(id,aud,role,email) VALUES('77000000-0000-0000-0000-000000000012','authenticated','authenticated','pr77-admin@example.invalid'),('77000000-0000-0000-0000-000000000010','authenticated','authenticated','pr77-tech@example.invalid'),('77000000-0000-0000-0000-000000000011','authenticated','authenticated','pr77-daily@example.invalid'),('77000000-0000-0000-0000-000000000013','authenticated','authenticated','pr77-foreign@example.invalid'),('77000000-0000-0000-0000-000000000015','authenticated','authenticated','pr77-inactive@example.invalid');
INSERT INTO profiles(id,email,full_name,username,role,organization_id,is_active,employment_type) VALUES
('77000000-0000-0000-0000-000000000012','pr77-admin@example.invalid','Synthetic admin','pr77-admin','admin','77000000-0000-0000-0000-000000000001',true,'hourly'),
('77000000-0000-0000-0000-000000000010','pr77-tech@example.invalid','Synthetic tech','pr77-tech','technician','77000000-0000-0000-0000-000000000001',true,'job_time'),
('77000000-0000-0000-0000-000000000011','pr77-daily@example.invalid','Synthetic daily','pr77-daily','technician','77000000-0000-0000-0000-000000000001',true,'hourly'),
('77000000-0000-0000-0000-000000000013','pr77-foreign@example.invalid','Synthetic foreign','pr77-foreign','admin','77000000-0000-0000-0000-000000000002',true,'hourly'),
('77000000-0000-0000-0000-000000000015','pr77-inactive@example.invalid','Synthetic inactive','pr77-inactive','admin','77000000-0000-0000-0000-000000000001',false,'hourly');
INSERT INTO employees(id,organization_id,user_id,hire_date) VALUES('77000000-0000-0000-0000-000000000020','77000000-0000-0000-0000-000000000001','77000000-0000-0000-0000-000000000010','2020-01-01'),('77000000-0000-0000-0000-000000000021','77000000-0000-0000-0000-000000000001','77000000-0000-0000-0000-000000000011','2020-01-01');
INSERT INTO employee_payroll_configs(id,employee_id,organization_id,effective_from,compensation_type,requires_daily_clock,requires_time_allocation,payroll_time_basis) VALUES
('77000000-0000-0000-0000-000000000030','77000000-0000-0000-0000-000000000020','77000000-0000-0000-0000-000000000001','2020-01-01','hourly',false,true,'work_allocation'),
('77000000-0000-0000-0000-000000000031','77000000-0000-0000-0000-000000000021','77000000-0000-0000-0000-000000000001','2020-01-01','hourly',true,false,'daily_clock');
INSERT INTO company_offices(id,office_name,organization_id) VALUES('77000000-0000-0000-0000-000000000061','Synthetic office','77000000-0000-0000-0000-000000000001');
INSERT INTO company_settings(organization_id,time_request_approver_ids,home_clock_notification_enabled,home_location_radius_meters,home_clock_notification_roles) VALUES('77000000-0000-0000-0000-000000000001',ARRAY['77000000-0000-0000-0000-000000000012']::uuid[],true,150,ARRAY['admin']);
UPDATE profiles SET home_latitude=39,home_longitude=-95 WHERE id='77000000-0000-0000-0000-000000000011';
UPDATE company_offices SET latitude=39,longitude=-95 WHERE id='77000000-0000-0000-0000-000000000061';
UPDATE profiles SET travel_bonus_enabled=true,primary_office_id='77000000-0000-0000-0000-000000000061' WHERE id='77000000-0000-0000-0000-000000000010';
INSERT INTO office_travel_settings(office_id,radius_miles,calculation_method,organization_id) VALUES('77000000-0000-0000-0000-000000000061',15,'round_trip','77000000-0000-0000-0000-000000000001');

INSERT INTO contacts(id,contact_name,username,office_id,organization_id) VALUES('77000000-0000-0000-0000-000000000041','Synthetic contact','pr77-contact','77000000-0000-0000-0000-000000000061','77000000-0000-0000-0000-000000000001');
INSERT INTO labor_phases(id,name,company_id,organization_id) VALUES('77000000-0000-0000-0000-000000000060','Synthetic phase','77000000-0000-0000-0000-000000000001','77000000-0000-0000-0000-000000000001');
INSERT INTO projects(id,company_id,organization_id,contact_id,project_number,name,status,created_by) VALUES('77000000-0000-0000-0000-000000000040','77000000-0000-0000-0000-000000000001','77000000-0000-0000-0000-000000000001','77000000-0000-0000-0000-000000000041','PR77-P','Synthetic project','planning','77000000-0000-0000-0000-000000000012');
INSERT INTO work_orders(id,company_id,organization_id,project_id,work_order_number,title,assigned_to,labor_phase_id,created_by,status,type,office_id,latitude,longitude) VALUES('77000000-0000-0000-0000-000000000050','77000000-0000-0000-0000-000000000001','77000000-0000-0000-0000-000000000001','77000000-0000-0000-0000-000000000040','PR77-WO','Synthetic visit','77000000-0000-0000-0000-000000000010','77000000-0000-0000-0000-000000000060','77000000-0000-0000-0000-000000000012','pending','service','77000000-0000-0000-0000-000000000061',40,-95);
SELECT set_config('request.jwt.claim.sub','77000000-0000-0000-0000-000000000010',true),set_config('request.jwt.claims','{"sub":"77000000-0000-0000-0000-000000000010","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE a uuid;b uuid;blocked boolean:=false;
BEGIN
 BEGIN INSERT INTO daily_clock_entries(technician_id,entry_date,clock_in) VALUES('77000000-0000-0000-0000-000000000010',(now() AT TIME ZONE 'America/Chicago')::date,now()); EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Job Time employees do not use%' THEN RAISE; END IF; blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Job Time Daily Clock bypass'; END IF;
 a:=start_work_order_time('77000000-0000-0000-0000-000000000050');b:=start_work_order_time('77000000-0000-0000-0000-000000000050');
 IF a<>b THEN RAISE EXCEPTION 'Repeated start duplicated allocation'; END IF;
 IF (SELECT project_id FROM time_entries WHERE id=a) IS DISTINCT FROM '77000000-0000-0000-0000-000000000040'::uuid THEN RAISE EXCEPTION 'Project inheritance failed'; END IF;
 IF (SELECT count(*) FROM travel_bonus_requests WHERE work_order_id='77000000-0000-0000-0000-000000000050')<>1 THEN RAISE EXCEPTION 'Travel request missing or duplicated'; END IF;
 IF (SELECT count(*) FROM time_entries WHERE work_order_id='77000000-0000-0000-0000-000000000050')<>1 THEN RAISE EXCEPTION 'Unexpected time count'; END IF;
 UPDATE time_entries SET clock_out=now(),status='submitted' WHERE id=a;
 UPDATE time_entries SET clock_in_latitude=39,clock_in_longitude=-95,clock_in_gps_capture_method='high_accuracy',clock_out_latitude=39,clock_out_longitude=-95,clock_out_gps_capture_method='high_accuracy' WHERE id=a;
 IF (SELECT count(*) FROM travel_bonus_requests WHERE work_order_id='77000000-0000-0000-0000-000000000050')<>1 THEN RAISE EXCEPTION 'Stop duplicated travel request'; END IF;
 IF NOT EXISTS(SELECT 1 FROM time_entries WHERE id=a AND clock_out IS NOT NULL AND clock_in_latitude=39 AND clock_out_latitude=39) THEN RAISE EXCEPTION 'Clock/GPS evidence missing'; END IF;
 blocked:=false;
 BEGIN INSERT INTO time_entries(technician_id,entry_date,clock_in,clock_out,entry_type,status) VALUES('77000000-0000-0000-0000-000000000010',(now() AT TIME ZONE 'America/Chicago')::date,now()-interval '2 hours',now()-interval '1 hour','office','submitted'); EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Request manual job or internal time%' THEN RAISE; END IF; blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Unapproved non-WO bypass'; END IF;
END $test$;
INSERT INTO manual_job_time_requests(id,technician_id,project_id,entry_date,clock_in,clock_out,reason) VALUES('77000000-0000-0000-0000-000000000070','77000000-0000-0000-0000-000000000010','77000000-0000-0000-0000-000000000040',((now()-interval '1 day') AT TIME ZONE 'America/Chicago')::date,now()-interval '1 day 2 hours',now()-interval '1 day 1 hour','Synthetic programming');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','77000000-0000-0000-0000-000000000013',true),set_config('request.jwt.claims','{"sub":"77000000-0000-0000-0000-000000000013","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$ DECLARE blocked boolean:=false; BEGIN
 BEGIN PERFORM review_manual_job_time_request('77000000-0000-0000-0000-000000000070','approve'); EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Time review permission required%' THEN RAISE; END IF; blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Foreign manager review bypass'; END IF;
END $test$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','77000000-0000-0000-0000-000000000015',true),set_config('request.jwt.claims','{"sub":"77000000-0000-0000-0000-000000000015","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$ DECLARE blocked boolean:=false; BEGIN
 BEGIN PERFORM review_manual_job_time_request('77000000-0000-0000-0000-000000000070','approve'); EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Time review permission required%' THEN RAISE; END IF; blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Inactive manager review bypass'; END IF;
END $test$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','77000000-0000-0000-0000-000000000012',true),set_config('request.jwt.claims','{"sub":"77000000-0000-0000-0000-000000000012","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$ DECLARE a uuid;b uuid; BEGIN
 a:=review_manual_job_time_request('77000000-0000-0000-0000-000000000070','approve');b:=review_manual_job_time_request('77000000-0000-0000-0000-000000000070','approve');
 IF a<>b OR NOT EXISTS(SELECT 1 FROM time_entries WHERE id=a AND status='approved') THEN RAISE EXCEPTION 'Atomic/idempotent manual review failed'; END IF;
END $test$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','77000000-0000-0000-0000-000000000011',true),set_config('request.jwt.claims','{"sub":"77000000-0000-0000-0000-000000000011","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
INSERT INTO daily_clock_entries(id,technician_id,entry_date,clock_in) VALUES('77000000-0000-0000-0000-000000000080','77000000-0000-0000-0000-000000000011',(now() AT TIME ZONE 'America/Chicago')::date,now()-interval '1 hour');
UPDATE daily_clock_entries SET clock_out=now(),clock_in_latitude=39,clock_in_longitude=-95,clock_out_latitude=39,clock_out_longitude=-95 WHERE id='77000000-0000-0000-0000-000000000080';
UPDATE daily_clock_entries SET clock_in_latitude=39,clock_out_latitude=39 WHERE id='77000000-0000-0000-0000-000000000080';
DO $test$ BEGIN

 IF NOT EXISTS(SELECT 1 FROM daily_clock_entries WHERE id='77000000-0000-0000-0000-000000000080' AND clock_out IS NOT NULL AND clock_in_latitude=39 AND clock_out_latitude=39 AND total_hours=1 AND status='clocked_out') THEN RAISE EXCEPTION 'Daily clock/GPS evidence missing'; END IF;
END $test$;

RESET ROLE;
DO $test$ BEGIN IF (SELECT count(*) FROM notifications WHERE related_id='77000000-0000-0000-0000-000000000080' AND type='home_clock')<>2 THEN RAISE EXCEPTION 'Home-clock notification missing or duplicated'; END IF;
END $test$;
SELECT set_config('request.jwt.claim.sub','77000000-0000-0000-0000-000000000010',true),set_config('request.jwt.claims','{"sub":"77000000-0000-0000-0000-000000000010","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
INSERT INTO internal_time_sessions(id,session_type,title,session_date,start_time,predetermined_hours,assigned_to,created_by,status,request_reason,organization_id,requested_by)
VALUES('77000000-0000-0000-0000-000000000090','training','Synthetic office session',(now() AT TIME ZONE 'America/Chicago')::date-1,'08:00',1,'77000000-0000-0000-0000-000000000010','77000000-0000-0000-0000-000000000010','pending_approval','Synthetic office work','77000000-0000-0000-0000-000000000001','77000000-0000-0000-0000-000000000010');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','77000000-0000-0000-0000-000000000012',true),set_config('request.jwt.claims','{"sub":"77000000-0000-0000-0000-000000000012","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$ DECLARE a uuid;b uuid; BEGIN
 PERFORM review_internal_time('77000000-0000-0000-0000-000000000090','approve');
 IF EXISTS(SELECT 1 FROM time_entries WHERE internal_session_id='77000000-0000-0000-0000-000000000090') THEN RAISE EXCEPTION 'Scheduling manufactured payable hours'; END IF;
 a:=review_internal_time('77000000-0000-0000-0000-000000000090','complete');b:=review_internal_time('77000000-0000-0000-0000-000000000090','complete');
 IF a<>b OR (SELECT count(*) FROM time_entries WHERE internal_session_id='77000000-0000-0000-0000-000000000090')<>1 THEN RAISE EXCEPTION 'Internal completion duplicated time'; END IF;
 IF (SELECT status FROM time_entries WHERE id=a)<>'submitted' THEN RAISE EXCEPTION 'Completion bypassed payroll review'; END IF;
 PERFORM review_internal_time('77000000-0000-0000-0000-000000000090','approve_time');
 IF (SELECT status FROM time_entries WHERE id=a)<>'approved' THEN RAISE EXCEPTION 'Internal pay approval failed'; END IF;
END $test$;


RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true);
INSERT INTO pay_periods(id,organization_id,period_start_date,period_end_date,status) VALUES('77000000-0000-0000-0000-000000000095','77000000-0000-0000-0000-000000000001',(now() AT TIME ZONE 'America/Chicago')::date-2,(now() AT TIME ZONE 'America/Chicago')::date,'payroll_approved');
SELECT set_config('request.jwt.claim.sub','77000000-0000-0000-0000-000000000010',true),set_config('request.jwt.claims','{"sub":"77000000-0000-0000-0000-000000000010","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
INSERT INTO manual_job_time_requests(id,technician_id,project_id,entry_date,clock_in,clock_out,reason) VALUES('77000000-0000-0000-0000-000000000071','77000000-0000-0000-0000-000000000010','77000000-0000-0000-0000-000000000040',((now()-interval '1 day') AT TIME ZONE 'America/Chicago')::date,now()-interval '1 day 2 hours',now()-interval '1 day 1 hour','Synthetic locked period request');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','77000000-0000-0000-0000-000000000012',true),set_config('request.jwt.claims','{"sub":"77000000-0000-0000-0000-000000000012","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $test$ DECLARE blocked boolean:=false; BEGIN
 BEGIN PERFORM review_manual_job_time_request('77000000-0000-0000-0000-000000000071','approve'); EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Reopen the payroll period%' THEN RAISE; END IF; blocked:=true; END;
 IF NOT blocked OR NOT EXISTS(SELECT 1 FROM manual_job_time_requests WHERE id='77000000-0000-0000-0000-000000000071' AND status='pending' AND time_entry_id IS NULL) THEN RAISE EXCEPTION 'Payroll lock bypass or partial review'; END IF;
END $test$;

RESET ROLE;
ROLLBACK;
SELECT 'hosted employee-time scenarios passed; synthetic rows rolled back' AS result;
