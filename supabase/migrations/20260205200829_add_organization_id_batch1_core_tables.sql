/*\n  # Add organization_id to Core Business Tables - Batch 1\n\n  Adds organization_id to the most fundamental tables:\n  - leads, contacts, connections, tasks, business_cards\n  - company_offices, departments, roles\n  - feed_events, discussion_posts, notifications\n  - email_templates, feature_suggestions\n\n  All existing records are backfilled with the first organization's ID.\n*/\n\n-- Helper: Add org_id column, backfill, set NOT NULL, add index\n-- We'll repeat this pattern for each table\n\n-- leads\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'organization_id') THEN\n    ALTER TABLE leads ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE leads SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE leads ALTER COLUMN organization_id SET NOT NULL

\nCREATE INDEX IF NOT EXISTS idx_leads_organization_id ON leads(organization_id)

\n\n-- contacts\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contacts' AND column_name = 'organization_id') THEN\n    ALTER TABLE contacts ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE contacts SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE contacts ALTER COLUMN organization_id SET NOT NULL

\nCREATE INDEX IF NOT EXISTS idx_contacts_organization_id ON contacts(organization_id)

\n\n-- connections\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'connections' AND column_name = 'organization_id') THEN\n    ALTER TABLE connections ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE connections SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE connections ALTER COLUMN organization_id SET NOT NULL

\nCREATE INDEX IF NOT EXISTS idx_connections_organization_id ON connections(organization_id)

\n\n-- tasks\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tasks' AND column_name = 'organization_id') THEN\n    ALTER TABLE tasks ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE tasks SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE tasks ALTER COLUMN organization_id SET NOT NULL

\nCREATE INDEX IF NOT EXISTS idx_tasks_organization_id ON tasks(organization_id)

\n\n-- business_cards\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_cards' AND column_name = 'organization_id') THEN\n    ALTER TABLE business_cards ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE business_cards SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE business_cards ALTER COLUMN organization_id SET NOT NULL

\nCREATE INDEX IF NOT EXISTS idx_business_cards_organization_id ON business_cards(organization_id)

\n\n-- company_offices\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_offices' AND column_name = 'organization_id') THEN\n    ALTER TABLE company_offices ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE company_offices SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE company_offices ALTER COLUMN organization_id SET NOT NULL

\nCREATE INDEX IF NOT EXISTS idx_company_offices_organization_id ON company_offices(organization_id)

\n\n-- departments\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'departments' AND column_name = 'organization_id') THEN\n    ALTER TABLE departments ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE departments SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE departments ALTER COLUMN organization_id SET NOT NULL

\nCREATE INDEX IF NOT EXISTS idx_departments_organization_id ON departments(organization_id)

\n\n-- roles\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'roles' AND column_name = 'organization_id') THEN\n    ALTER TABLE roles ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE roles SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE roles ALTER COLUMN organization_id SET NOT NULL

\nCREATE INDEX IF NOT EXISTS idx_roles_organization_id ON roles(organization_id)

\n\n-- feed_events\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'feed_events' AND column_name = 'organization_id') THEN\n    ALTER TABLE feed_events ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE feed_events SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE feed_events ALTER COLUMN organization_id SET NOT NULL

\nCREATE INDEX IF NOT EXISTS idx_feed_events_organization_id ON feed_events(organization_id)

\n\n-- discussion_posts\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'discussion_posts' AND column_name = 'organization_id') THEN\n    ALTER TABLE discussion_posts ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE discussion_posts SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE discussion_posts ALTER COLUMN organization_id SET NOT NULL

\nCREATE INDEX IF NOT EXISTS idx_discussion_posts_organization_id ON discussion_posts(organization_id)

\n\n-- notifications\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notifications' AND column_name = 'organization_id') THEN\n    ALTER TABLE notifications ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE notifications SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE notifications ALTER COLUMN organization_id SET NOT NULL

\nCREATE INDEX IF NOT EXISTS idx_notifications_organization_id ON notifications(organization_id)

\n\n-- email_templates\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_templates' AND column_name = 'organization_id') THEN\n    ALTER TABLE email_templates ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE email_templates SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE email_templates ALTER COLUMN organization_id SET NOT NULL

\nCREATE INDEX IF NOT EXISTS idx_email_templates_organization_id ON email_templates(organization_id)

\n\n-- feature_suggestions\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'feature_suggestions' AND column_name = 'organization_id') THEN\n    ALTER TABLE feature_suggestions ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE feature_suggestions SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE feature_suggestions ALTER COLUMN organization_id SET NOT NULL

\nCREATE INDEX IF NOT EXISTS idx_feature_suggestions_organization_id ON feature_suggestions(organization_id)

\n\n-- company_messages\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_messages' AND column_name = 'organization_id') THEN\n    ALTER TABLE company_messages ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE company_messages SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE company_messages ALTER COLUMN organization_id SET NOT NULL

\nCREATE INDEX IF NOT EXISTS idx_company_messages_organization_id ON company_messages(organization_id)

\n
