/*\n  # Add organization_id to Tables That Already Have company_id - Batch 4\n\n  Tables that already have company_id get organization_id added.\n  company_id is kept for backward compatibility but organization_id is the canonical reference.\n*/\n\n-- Helper list of tables with company_id that need organization_id:\n-- appointments, change_orders, contracts, crew_assignments, email_workflows,\n-- file_attachments, invoice_change_order_links, invoices, labor_phases,\n-- manufacturers, message_threads, payments, points_configuration, priority_levels,\n-- product_packages, products, projects, proposal_area_templates,\n-- proposal_notifications, proposal_report_templates, proposals,\n-- recurring_invoices, recurring_plans, recurring_subscriptions,\n-- rewards_catalog, sales_orders, subscription_cancellations,\n-- tax_exemption_certificates, tax_jurisdictions, time_entries,\n-- travel_logs, vendors, vip_program_tracking, work_orders (already done above)\n\n-- appointments\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'organization_id') THEN\n    ALTER TABLE appointments ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE appointments SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE appointments ALTER COLUMN organization_id SET NOT NULL

\nCREATE INDEX IF NOT EXISTS idx_appointments_organization_id ON appointments(organization_id)

\n\n-- change_orders\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'change_orders' AND column_name = 'organization_id') THEN\n    ALTER TABLE change_orders ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE change_orders SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE change_orders ALTER COLUMN organization_id SET NOT NULL

\n\n-- contracts\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contracts' AND column_name = 'organization_id') THEN\n    ALTER TABLE contracts ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE contracts SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE contracts ALTER COLUMN organization_id SET NOT NULL

\n\n-- crew_assignments\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'crew_assignments' AND column_name = 'organization_id') THEN\n    ALTER TABLE crew_assignments ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE crew_assignments SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE crew_assignments ALTER COLUMN organization_id SET NOT NULL

\n\n-- email_workflows\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_workflows' AND column_name = 'organization_id') THEN\n    ALTER TABLE email_workflows ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE email_workflows SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE email_workflows ALTER COLUMN organization_id SET NOT NULL

\n\n-- file_attachments\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'file_attachments' AND column_name = 'organization_id') THEN\n    ALTER TABLE file_attachments ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE file_attachments SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE file_attachments ALTER COLUMN organization_id SET NOT NULL

\n\n-- invoices\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'organization_id') THEN\n    ALTER TABLE invoices ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE invoices SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE invoices ALTER COLUMN organization_id SET NOT NULL

\nCREATE INDEX IF NOT EXISTS idx_invoices_organization_id ON invoices(organization_id)

\n\n-- labor_phases\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'labor_phases' AND column_name = 'organization_id') THEN\n    ALTER TABLE labor_phases ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE labor_phases SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE labor_phases ALTER COLUMN organization_id SET NOT NULL

\n\n-- manufacturers\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'manufacturers' AND column_name = 'organization_id') THEN\n    ALTER TABLE manufacturers ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE manufacturers SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE manufacturers ALTER COLUMN organization_id SET NOT NULL

\n\n-- message_threads\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'message_threads' AND column_name = 'organization_id') THEN\n    ALTER TABLE message_threads ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE message_threads SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE message_threads ALTER COLUMN organization_id SET NOT NULL

\n\n-- payments\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'payments' AND column_name = 'organization_id') THEN\n    ALTER TABLE payments ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE payments SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE payments ALTER COLUMN organization_id SET NOT NULL

\n\n-- points_configuration\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'points_configuration' AND column_name = 'organization_id') THEN\n    ALTER TABLE points_configuration ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE points_configuration SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE points_configuration ALTER COLUMN organization_id SET NOT NULL

\n\n-- priority_levels\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'priority_levels' AND column_name = 'organization_id') THEN\n    ALTER TABLE priority_levels ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE priority_levels SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE priority_levels ALTER COLUMN organization_id SET NOT NULL

\n\n-- product_packages\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_packages' AND column_name = 'organization_id') THEN\n    ALTER TABLE product_packages ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE product_packages SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE product_packages ALTER COLUMN organization_id SET NOT NULL

\n\n-- products\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'organization_id') THEN\n    ALTER TABLE products ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE products SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE products ALTER COLUMN organization_id SET NOT NULL

\nCREATE INDEX IF NOT EXISTS idx_products_organization_id ON products(organization_id)

\n\n-- projects\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'organization_id') THEN\n    ALTER TABLE projects ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE projects SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE projects ALTER COLUMN organization_id SET NOT NULL

\nCREATE INDEX IF NOT EXISTS idx_projects_organization_id ON projects(organization_id)

\n\n-- proposals\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'proposals' AND column_name = 'organization_id') THEN\n    ALTER TABLE proposals ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE proposals SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE proposals ALTER COLUMN organization_id SET NOT NULL

\nCREATE INDEX IF NOT EXISTS idx_proposals_organization_id ON proposals(organization_id)

\n\n-- proposal_settings\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'proposal_settings' AND column_name = 'organization_id') THEN\n    ALTER TABLE proposal_settings ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE proposal_settings SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE proposal_settings ALTER COLUMN organization_id SET NOT NULL

\n\n-- proposal_area_templates\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'proposal_area_templates' AND column_name = 'organization_id') THEN\n    ALTER TABLE proposal_area_templates ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE proposal_area_templates SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE proposal_area_templates ALTER COLUMN organization_id SET NOT NULL

\n\n-- proposal_report_templates\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'proposal_report_templates' AND column_name = 'organization_id') THEN\n    ALTER TABLE proposal_report_templates ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE proposal_report_templates SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE proposal_report_templates ALTER COLUMN organization_id SET NOT NULL

\n\n-- recurring_plans\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recurring_plans' AND column_name = 'organization_id') THEN\n    ALTER TABLE recurring_plans ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE recurring_plans SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE recurring_plans ALTER COLUMN organization_id SET NOT NULL

\n\n-- recurring_subscriptions\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recurring_subscriptions' AND column_name = 'organization_id') THEN\n    ALTER TABLE recurring_subscriptions ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE recurring_subscriptions SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE recurring_subscriptions ALTER COLUMN organization_id SET NOT NULL

\n\n-- rewards_catalog\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rewards_catalog' AND column_name = 'organization_id') THEN\n    ALTER TABLE rewards_catalog ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE rewards_catalog SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE rewards_catalog ALTER COLUMN organization_id SET NOT NULL

\n\n-- sales_orders\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sales_orders' AND column_name = 'organization_id') THEN\n    ALTER TABLE sales_orders ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE sales_orders SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE sales_orders ALTER COLUMN organization_id SET NOT NULL

\nCREATE INDEX IF NOT EXISTS idx_sales_orders_organization_id ON sales_orders(organization_id)

\n\n-- tax_jurisdictions\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tax_jurisdictions' AND column_name = 'organization_id') THEN\n    ALTER TABLE tax_jurisdictions ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE tax_jurisdictions SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE tax_jurisdictions ALTER COLUMN organization_id SET NOT NULL

\n\n-- tax_exemption_certificates\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tax_exemption_certificates' AND column_name = 'organization_id') THEN\n    ALTER TABLE tax_exemption_certificates ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE tax_exemption_certificates SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE tax_exemption_certificates ALTER COLUMN organization_id SET NOT NULL

\n\n-- time_entries\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'time_entries' AND column_name = 'organization_id') THEN\n    ALTER TABLE time_entries ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE time_entries SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE time_entries ALTER COLUMN organization_id SET NOT NULL

\n\n-- travel_logs\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'travel_logs' AND column_name = 'organization_id') THEN\n    ALTER TABLE travel_logs ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE travel_logs SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE travel_logs ALTER COLUMN organization_id SET NOT NULL

\n\n-- vendors\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vendors' AND column_name = 'organization_id') THEN\n    ALTER TABLE vendors ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE vendors SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE vendors ALTER COLUMN organization_id SET NOT NULL

\n\n-- vip_program_tracking\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vip_program_tracking' AND column_name = 'organization_id') THEN\n    ALTER TABLE vip_program_tracking ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE vip_program_tracking SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE vip_program_tracking ALTER COLUMN organization_id SET NOT NULL

\n\n-- recurring_invoices\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'recurring_invoices' AND column_name = 'organization_id') THEN\n    ALTER TABLE recurring_invoices ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE recurring_invoices SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE recurring_invoices ALTER COLUMN organization_id SET NOT NULL

\n\n-- subscription_cancellations\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'subscription_cancellations' AND column_name = 'organization_id') THEN\n    ALTER TABLE subscription_cancellations ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE subscription_cancellations SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE subscription_cancellations ALTER COLUMN organization_id SET NOT NULL

\n\n-- proposal_notifications\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'proposal_notifications' AND column_name = 'organization_id') THEN\n    ALTER TABLE proposal_notifications ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE proposal_notifications SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE proposal_notifications ALTER COLUMN organization_id SET NOT NULL

\n\n-- invoice_change_order_links\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_change_order_links' AND column_name = 'organization_id') THEN\n    ALTER TABLE invoice_change_order_links ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE invoice_change_order_links SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE invoice_change_order_links ALTER COLUMN organization_id SET NOT NULL

\n\n-- company_commission_settings\nDO $$ BEGIN\n  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'company_commission_settings' AND column_name = 'organization_id') THEN\n    ALTER TABLE company_commission_settings ADD COLUMN organization_id uuid REFERENCES organizations(id)

\n  END IF

\nEND $$

\nUPDATE company_commission_settings SET organization_id = (SELECT id FROM organizations LIMIT 1) WHERE organization_id IS NULL

\nALTER TABLE company_commission_settings ALTER COLUMN organization_id SET NOT NULL

\n
