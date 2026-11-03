/*\n  # Add organization_id to Operations Tables - Batch 2\n\n  Adds organization_id to dispatch, production, time tracking, and work order tables.\n  All existing records backfilled with first organization's ID.\n*/\n\n-- work_orders\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_orders' AND column_name = 'organization_id') THEN\n    ALTER TABLE work_orders ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE work_orders SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE work_orders ALTER COLUMN organization_id SET NOT NULL

\nCREATE INDEX IF NOT EXISTS idx_work_orders_organization_id ON work_orders(organization_id)

\n\n-- service_requests\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'service_requests' AND column_name = 'organization_id') THEN\n    ALTER TABLE service_requests ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE service_requests SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE service_requests ALTER COLUMN organization_id SET NOT NULL

\nCREATE INDEX IF NOT EXISTS idx_service_requests_organization_id ON service_requests(organization_id)

\n\n-- daily_clock_entries\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'daily_clock_entries' AND column_name = 'organization_id') THEN\n    ALTER TABLE daily_clock_entries ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE daily_clock_entries SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE daily_clock_entries ALTER COLUMN organization_id SET NOT NULL

\nCREATE INDEX IF NOT EXISTS idx_daily_clock_entries_organization_id ON daily_clock_entries(organization_id)

\n\n-- job_photos\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'job_photos' AND column_name = 'organization_id') THEN\n    ALTER TABLE job_photos ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE job_photos SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE job_photos ALTER COLUMN organization_id SET NOT NULL

\nCREATE INDEX IF NOT EXISTS idx_job_photos_organization_id ON job_photos(organization_id)

\n\n-- gps_breadcrumbs\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'gps_breadcrumbs' AND column_name = 'organization_id') THEN\n    ALTER TABLE gps_breadcrumbs ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE gps_breadcrumbs SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE gps_breadcrumbs ALTER COLUMN organization_id SET NOT NULL

\nCREATE INDEX IF NOT EXISTS idx_gps_breadcrumbs_organization_id ON gps_breadcrumbs(organization_id)

\n\n-- technician_skills\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'technician_skills' AND column_name = 'organization_id') THEN\n    ALTER TABLE technician_skills ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE technician_skills SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE technician_skills ALTER COLUMN organization_id SET NOT NULL

\n\n-- skills\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'skills' AND column_name = 'organization_id') THEN\n    ALTER TABLE skills ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE skills SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE skills ALTER COLUMN organization_id SET NOT NULL

\n\n-- skill_categories\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'skill_categories' AND column_name = 'organization_id') THEN\n    ALTER TABLE skill_categories ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE skill_categories SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE skill_categories ALTER COLUMN organization_id SET NOT NULL

\n\n-- push_subscriptions\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'push_subscriptions' AND column_name = 'organization_id') THEN\n    ALTER TABLE push_subscriptions ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE push_subscriptions SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE push_subscriptions ALTER COLUMN organization_id SET NOT NULL

\n\n-- user_sessions\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_sessions' AND column_name = 'organization_id') THEN\n    ALTER TABLE user_sessions ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE user_sessions SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE user_sessions ALTER COLUMN organization_id SET NOT NULL

\n\n-- bug_reports\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bug_reports' AND column_name = 'organization_id') THEN\n    ALTER TABLE bug_reports ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE bug_reports SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE bug_reports ALTER COLUMN organization_id SET NOT NULL

\n\n-- sticky_notes\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sticky_notes' AND column_name = 'organization_id') THEN\n    ALTER TABLE sticky_notes ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE sticky_notes SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE sticky_notes ALTER COLUMN organization_id SET NOT NULL

\n\n-- calendars\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calendars' AND column_name = 'organization_id') THEN\n    ALTER TABLE calendars ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE calendars SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE calendars ALTER COLUMN organization_id SET NOT NULL

\n\n-- competitors\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'competitors' AND column_name = 'organization_id') THEN\n    ALTER TABLE competitors ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE competitors SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE competitors ALTER COLUMN organization_id SET NOT NULL

\n\n-- scheduled_connections\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scheduled_connections' AND column_name = 'organization_id') THEN\n    ALTER TABLE scheduled_connections ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE scheduled_connections SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE scheduled_connections ALTER COLUMN organization_id SET NOT NULL

\n\n-- review_requests\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'review_requests' AND column_name = 'organization_id') THEN\n    ALTER TABLE review_requests ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE review_requests SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE review_requests ALTER COLUMN organization_id SET NOT NULL

\n\n-- monitoring_services\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'monitoring_services' AND column_name = 'organization_id') THEN\n    ALTER TABLE monitoring_services ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE monitoring_services SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE monitoring_services ALTER COLUMN organization_id SET NOT NULL

\n\n-- issue_reports\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'issue_reports' AND column_name = 'organization_id') THEN\n    ALTER TABLE issue_reports ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE issue_reports SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE issue_reports ALTER COLUMN organization_id SET NOT NULL

\n
