/*\n  # Add organization_id to Finance and Remaining Tables - Batch 3\n\n  Adds organization_id to financial, punchlist, warehouse, PTO, and remaining tables.\n  All existing records backfilled with first organization's ID.\n*/\n\n-- security_contracts\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'security_contracts' AND column_name = 'organization_id') THEN\n    ALTER TABLE security_contracts ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE security_contracts SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE security_contracts ALTER COLUMN organization_id SET NOT NULL

\nCREATE INDEX IF NOT EXISTS idx_security_contracts_organization_id ON security_contracts(organization_id)

\n\n-- security_contract_templates\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'security_contract_templates' AND column_name = 'organization_id') THEN\n    ALTER TABLE security_contract_templates ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE security_contract_templates SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE security_contract_templates ALTER COLUMN organization_id SET NOT NULL

\n\n-- pending_punchlist_invites\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pending_punchlist_invites' AND column_name = 'organization_id') THEN\n    ALTER TABLE pending_punchlist_invites ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE pending_punchlist_invites SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE pending_punchlist_invites ALTER COLUMN organization_id SET NOT NULL

\n\n-- punch_lists\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'punch_lists' AND column_name = 'organization_id') THEN\n    ALTER TABLE punch_lists ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE punch_lists SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE punch_lists ALTER COLUMN organization_id SET NOT NULL

\n\n-- warehouses\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'warehouses' AND column_name = 'organization_id') THEN\n    ALTER TABLE warehouses ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE warehouses SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE warehouses ALTER COLUMN organization_id SET NOT NULL

\n\n-- pto_policies\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pto_policies' AND column_name = 'organization_id') THEN\n    ALTER TABLE pto_policies ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE pto_policies SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE pto_policies ALTER COLUMN organization_id SET NOT NULL

\n\n-- pto_requests\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pto_requests' AND column_name = 'organization_id') THEN\n    ALTER TABLE pto_requests ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE pto_requests SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE pto_requests ALTER COLUMN organization_id SET NOT NULL

\n\n-- product_categories\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_categories' AND column_name = 'organization_id') THEN\n    ALTER TABLE product_categories ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE product_categories SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE product_categories ALTER COLUMN organization_id SET NOT NULL

\n\n-- product_classes\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_classes' AND column_name = 'organization_id') THEN\n    ALTER TABLE product_classes ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE product_classes SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE product_classes ALTER COLUMN organization_id SET NOT NULL

\n\n-- ip_nicknames\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ip_nicknames' AND column_name = 'organization_id') THEN\n    ALTER TABLE ip_nicknames ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE ip_nicknames SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE ip_nicknames ALTER COLUMN organization_id SET NOT NULL

\n\n-- device_nicknames\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'device_nicknames' AND column_name = 'organization_id') THEN\n    ALTER TABLE device_nicknames ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE device_nicknames SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE device_nicknames ALTER COLUMN organization_id SET NOT NULL

\n\n-- signup_attempts\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'signup_attempts' AND column_name = 'organization_id') THEN\n    ALTER TABLE signup_attempts ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE signup_attempts SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE signup_attempts ALTER COLUMN organization_id SET NOT NULL

\n\n-- time_adjustment_requests\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'time_adjustment_requests' AND column_name = 'organization_id') THEN\n    ALTER TABLE time_adjustment_requests ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE time_adjustment_requests SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE time_adjustment_requests ALTER COLUMN organization_id SET NOT NULL

\n\n-- product_request_settings\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_request_settings' AND column_name = 'organization_id') THEN\n    ALTER TABLE product_request_settings ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE product_request_settings SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE product_request_settings ALTER COLUMN organization_id SET NOT NULL

\n\n-- product_requests\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_requests' AND column_name = 'organization_id') THEN\n    ALTER TABLE product_requests ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE product_requests SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE product_requests ALTER COLUMN organization_id SET NOT NULL

\n
