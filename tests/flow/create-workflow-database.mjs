import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const id = number => `00000000-0000-0000-0000-${String(number).padStart(12, '0')}`;
const org = id(1), otherOrg = id(2), creator = id(10), recipient = id(11);
const departmentMember = id(12), disconnected = id(13), admin = id(14), otherAdmin = id(15);
const department = id(20), customer = id(21), legacySupport = id(30), standalone = id(31), support = id(32);
const legacyRequest = id(40), legacyWorkOrder = id(41), currentRequest = id(42), currentWorkOrder = id(43);

try {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth; CREATE SCHEMA flow_private;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE TABLE profiles (id uuid PRIMARY KEY, organization_id uuid, full_name text, role text, is_active boolean);
    CREATE TABLE contacts (id uuid PRIMARY KEY, organization_id uuid, full_name text, contact_name text, company_name text, assigned_to uuid);
    CREATE TABLE projects (id uuid PRIMARY KEY, organization_id uuid, contact_id uuid, assigned_pm uuid, salesperson_id uuid, designer_id uuid);
    CREATE TABLE work_orders (id uuid PRIMARY KEY, organization_id uuid, project_id uuid, contact_id uuid, assigned_to uuid, customer_sales_rep_id uuid);
    CREATE TABLE tasks (
      id uuid PRIMARY KEY, organization_id uuid, contact_id uuid, project_id uuid, work_order_id uuid,
      user_id uuid, assigned_to uuid, assigned_department_id uuid, claimed_by uuid, title text, status text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE task_comments (id uuid PRIMARY KEY, content text);
    CREATE TABLE messages (id uuid PRIMARY KEY, body text);
    CREATE TABLE message_threads (id uuid PRIMARY KEY, organization_id uuid, context_type text, context_id uuid, contact_id uuid, created_by uuid, assigned_sales_rep_id uuid);
    CREATE TABLE discussion_posts (id uuid PRIMARY KEY, content text, is_private boolean, audience_type text, audience_department_id uuid, user_id uuid, assigned_to uuid, audience_user_ids uuid[]);
    CREATE TABLE flow_events (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, organization_id uuid, contact_id uuid, project_id uuid,
      work_order_id uuid, actor_id uuid, actor_name text, customer_name text, category text, event_type text,
      summary text, source_table text, source_id uuid, required_module text, task_id uuid, created_at timestamptz,
      location_name text, project_name text, work_order_number text, customer_location_id uuid, office_id uuid,
      thread_id uuid, activity_recipient_user_id uuid, mentioned_user_ids uuid[] DEFAULT '{}'
    );
    CREATE TABLE flow_event_views (event_id bigint, user_id uuid);
    CREATE TABLE service_requests (
      id uuid PRIMARY KEY, organization_id uuid, source_type text, notes text, customer_name text,
      job_description text, work_order_id uuid, created_by uuid, status text
    );
    CREATE TABLE notifications (
      user_id uuid, organization_id uuid, title text, body text, type text, related_id uuid, is_read boolean, created_at timestamptz
    );
    CREATE PUBLICATION supabase_realtime FOR TABLE flow_events;
    CREATE FUNCTION get_my_task_department_ids() RETURNS TABLE(department_id uuid) LANGUAGE sql STABLE AS $$
      SELECT '${department}'::uuid WHERE auth.uid() = '${departmentMember}'
    $$;
    ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
    CREATE POLICY task_audience ON tasks FOR SELECT TO authenticated USING (
      organization_id = (SELECT p.organization_id FROM profiles p WHERE p.id = auth.uid())
      AND (auth.uid() IN (user_id, assigned_to, claimed_by)
        OR assigned_department_id IN (SELECT department_id FROM get_my_task_department_ids())
        OR (assigned_to IS NULL AND assigned_department_id IS NULL)
        OR auth.uid() = '${admin}')
    );
    ALTER TABLE flow_events ENABLE ROW LEVEL SECURITY;
    CREATE POLICY organization_flow ON flow_events FOR SELECT TO authenticated USING (
      organization_id = (SELECT p.organization_id FROM profiles p WHERE p.id = auth.uid())
      AND current_setting('test.tasks_access', true) IS DISTINCT FROM 'off'
    );
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
    CREATE FUNCTION flow_private.old_capture() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW; END$$;
    CREATE TRIGGER capture_task_flow AFTER INSERT OR UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION flow_private.old_capture();
    CREATE FUNCTION notify_service_managers_new_request() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW; END$$;
    CREATE TRIGGER new_service_notice AFTER INSERT ON service_requests FOR EACH ROW EXECUTE FUNCTION notify_service_managers_new_request();
    CREATE FUNCTION notify_managers_service_request_resubmitted() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW; END$$;
    CREATE TRIGGER resubmit_notice AFTER UPDATE ON service_requests FOR EACH ROW EXECUTE FUNCTION notify_managers_service_request_resubmitted();
    INSERT INTO profiles VALUES
      ('${creator}','${org}','Creator','sales',true),
      ('${recipient}','${org}','Recipient','technician',true),
      ('${departmentMember}','${org}','Department member','service_manager',true),
      ('${disconnected}','${org}','Unrelated coworker','technician',true),
      ('${admin}','${org}','Admin','admin',true),
      ('${otherAdmin}','${otherOrg}','Other organization admin','admin',true);
    INSERT INTO contacts(id, organization_id, full_name) VALUES ('${customer}','${org}','Customer');
    INSERT INTO tasks(id, organization_id, contact_id, user_id, title, status)
      VALUES ('${legacySupport}','${org}','${customer}','${creator}','Support: Old issue','pending');
    INSERT INTO service_requests VALUES ('${legacyRequest}','${org}','staff_form',null,'Customer','Old issue','${legacyWorkOrder}','${creator}','open');
    INSERT INTO notifications (user_id, organization_id, type, related_id)
      VALUES ('${departmentMember}','${org}','service_request_created','${legacyWorkOrder}');
  `);

  const migrationDir = new URL('../../supabase/migrations/', import.meta.url);
  const migration = (await readdir(migrationDir)).find(name => name.endsWith('_create_workflow_readiness.sql'));
  await db.exec(await readFile(new URL(migration, migrationDir), 'utf-8'));
  assert.equal((await db.query('SELECT is_support_request FROM tasks WHERE id=$1', [legacySupport])).rows[0].is_support_request, true);
  assert.equal((await db.query("SELECT count(*)::int AS count FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='tasks'")).rows[0].count, 1);
  assert.equal((await db.query('SELECT related_id FROM notifications')).rows[0].related_id, legacyRequest);

  await db.exec(`
    SET request.jwt.claim.sub = '${creator}';
    INSERT INTO tasks(id, organization_id, user_id, assigned_to, title, status, created_at)
      VALUES ('${standalone}','${org}','${creator}','${recipient}','Call vendor','pending','2020-01-01');
    INSERT INTO tasks(id, organization_id, user_id, assigned_department_id, contact_id, title, status, is_support_request)
      VALUES ('${support}','${org}','${creator}','${department}','${customer}','Support: Fix remote access','pending',true);
    UPDATE tasks SET title='Call vendor today' WHERE id='${standalone}';
    SET request.jwt.claim.sub = '${recipient}';
    UPDATE tasks SET status='completed' WHERE id='${standalone}';
  `);

  async function events(user, filters = {}) {
    await db.exec(`RESET ROLE; SET request.jwt.claim.sub = '${user}'; SET ROLE authenticated;`);
    return (await db.query('SELECT * FROM get_flow_events($1)', [JSON.stringify(filters)])).rows.map(row => row.get_flow_events);
  }
  const created = await events(creator, { my_work: true });
  assert.deepEqual(created.map(event => event.summary), [
    'Assignment completed: Call vendor today', 'Support request created: Fix remote access', 'Assignment created: Call vendor',
  ]);
  const recent = await events(recipient, { my_work: true, since: '2025-01-01' });
  assert.equal(recent.length, 1);
  assert.equal(recent[0].actor_id, recipient);
  assert.equal(recent[0].contact_id, null);
  assert.equal((await events(departmentMember, { my_work: true }))[0].source_id, support);
  assert.equal((await events(admin)).length, 3);
  assert.equal((await events(disconnected)).length, 0);
  assert.equal((await events(otherAdmin)).length, 0);
  await db.exec("SET test.tasks_access = 'off'");
  assert.equal((await events(recipient)).length, 0);
  await db.exec("RESET ROLE; SET test.tasks_access = 'on'");

  await db.exec(`
    INSERT INTO service_requests VALUES ('${currentRequest}','${org}','staff_form',null,'Customer','New issue','${currentWorkOrder}','${creator}','needs_more_info');
    UPDATE service_requests SET status='open' WHERE id='${currentRequest}';
  `);
  const notifications = (await db.query('SELECT user_id, organization_id, type FROM notifications WHERE related_id=$1 ORDER BY type, user_id', [currentRequest])).rows;
  assert.deepEqual(notifications, [
    { user_id: departmentMember, organization_id: org, type: 'service_request_created' },
    { user_id: departmentMember, organization_id: org, type: 'service_request_resubmitted' },
    { user_id: admin, organization_id: org, type: 'service_request_resubmitted' },
  ]);
  console.log('PASS: support classification, assignment Flow timing and audiences, live publication, exact service links, and resubmission recipients.');
} finally {
  await db.close();
}
