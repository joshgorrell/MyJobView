/*
  # Deny admin-only modules for all non-admin roles

  ## Summary
  The "Admin" department modules were defaulting to allow-access because no explicit
  deny rows existed in role_module_access. This caused non-admin users (tech, sales,
  finance, manager, service_manager) to see the Admin department and its "Admin" link
  in the footer/sidebar.

  ## Changes
  - Inserts `has_access = false` for all admin-department modules that should be
    restricted to admins only, for every non-admin role.
  - Skips `feature_suggestions` (intentionally visible to all roles) and `preferences`
    (personal settings, accessible to everyone).
  - Preserves existing explicit grants:
    - service_manager: time_clock_management = true, test_tune_settings = true
    - manager: test_tune_settings = true
  - Uses INSERT ... ON CONFLICT DO NOTHING so re-running is safe.
*/

DO $$
DECLARE
  v_org_id   uuid;
  v_tech_id        uuid;
  v_sales_id       uuid;
  v_finance_id     uuid;
  v_manager_id     uuid;
  v_svc_mgr_id     uuid;

  -- admin dept module IDs
  m_settings               uuid := 'abe3f6e1-cdde-4f4a-99a5-1026f74a9dbe';
  m_company_settings       uuid := '93e0f321-6a10-4363-afbc-2b5a4b464e1e';
  m_user_management        uuid := 'abd4e4b3-2bde-43f5-8306-26f8dcb1d9f4';
  m_department_access      uuid := 'a351c624-78b0-49b4-a73c-9d42dded9095';
  m_time_clock_mgmt        uuid := 'e8959b97-0567-471e-8f2c-3ecd69926adc';
  m_role_permissions       uuid := 'c07e2d03-475d-4e69-add5-4d21de45022c';
  m_menu_builder           uuid := 'c9e80729-fb53-4882-ab51-5cff3ac71c59';
  m_proposal_msgs_admin    uuid := 'a2adc08a-f109-45f8-92e3-9cef5e43ec75';
  m_offices                uuid := 'c4834580-02fc-46f7-abbb-7c5e5c6918cd';
  m_priority_management    uuid := '4327074d-b1d2-4d64-bfa5-95816bd37824';
  m_points_rewards         uuid := '7c012624-7e12-4796-8ebb-8cee1705bf6e';
  m_email_templates        uuid := 'd1f48cb9-244e-47b8-b5a8-5591a7e984b7';
  m_travel_bonus_settings  uuid := 'beaefd96-2eb8-4c7d-bfcb-cf52cbff54bf';
  m_pay_types              uuid := '1e9564bc-ecad-4c2b-9f1e-fa15c50e1497';
  m_integrations           uuid := 'd217177c-42cd-460e-9dbb-a0a602354e73';
  m_pto_management         uuid := 'ab92a07a-3bb5-42cc-af64-55261e1d3574';
  m_test_tune_settings     uuid := '0f8358ef-8116-450b-8d98-5ff63ee98b64';
  m_vehicle_tracking       uuid := '8466faa0-e95c-40a1-8627-1d4720a39493';
BEGIN
  SELECT organization_id INTO v_org_id FROM role_module_access LIMIT 1;

  SELECT id INTO v_tech_id     FROM roles WHERE role_key = 'tech';
  SELECT id INTO v_sales_id    FROM roles WHERE role_key = 'sales';
  SELECT id INTO v_finance_id  FROM roles WHERE role_key = 'finance';
  SELECT id INTO v_manager_id  FROM roles WHERE role_key = 'manager';
  SELECT id INTO v_svc_mgr_id  FROM roles WHERE role_key = 'service_manager';

  -- ── TECH ──────────────────────────────────────────────────────────────────
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES
    (v_tech_id, m_settings,              false, v_org_id),
    (v_tech_id, m_company_settings,      false, v_org_id),
    (v_tech_id, m_user_management,       false, v_org_id),
    (v_tech_id, m_department_access,     false, v_org_id),
    (v_tech_id, m_time_clock_mgmt,       false, v_org_id),
    (v_tech_id, m_role_permissions,      false, v_org_id),
    (v_tech_id, m_menu_builder,          false, v_org_id),
    (v_tech_id, m_proposal_msgs_admin,   false, v_org_id),
    (v_tech_id, m_offices,               false, v_org_id),
    (v_tech_id, m_priority_management,   false, v_org_id),
    (v_tech_id, m_points_rewards,        false, v_org_id),
    (v_tech_id, m_email_templates,       false, v_org_id),
    (v_tech_id, m_travel_bonus_settings, false, v_org_id),
    (v_tech_id, m_pay_types,             false, v_org_id),
    (v_tech_id, m_integrations,          false, v_org_id),
    (v_tech_id, m_pto_management,        false, v_org_id),
    (v_tech_id, m_test_tune_settings,    false, v_org_id),
    (v_tech_id, m_vehicle_tracking,      false, v_org_id)
  ON CONFLICT (role_id, module_id) DO NOTHING;

  -- ── SALES ─────────────────────────────────────────────────────────────────
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES
    (v_sales_id, m_settings,              false, v_org_id),
    (v_sales_id, m_company_settings,      false, v_org_id),
    (v_sales_id, m_user_management,       false, v_org_id),
    (v_sales_id, m_department_access,     false, v_org_id),
    (v_sales_id, m_time_clock_mgmt,       false, v_org_id),
    (v_sales_id, m_role_permissions,      false, v_org_id),
    (v_sales_id, m_menu_builder,          false, v_org_id),
    (v_sales_id, m_proposal_msgs_admin,   false, v_org_id),
    (v_sales_id, m_offices,               false, v_org_id),
    (v_sales_id, m_priority_management,   false, v_org_id),
    (v_sales_id, m_points_rewards,        false, v_org_id),
    (v_sales_id, m_email_templates,       false, v_org_id),
    (v_sales_id, m_travel_bonus_settings, false, v_org_id),
    (v_sales_id, m_pay_types,             false, v_org_id),
    (v_sales_id, m_integrations,          false, v_org_id),
    (v_sales_id, m_pto_management,        false, v_org_id),
    (v_sales_id, m_test_tune_settings,    false, v_org_id),
    (v_sales_id, m_vehicle_tracking,      false, v_org_id)
  ON CONFLICT (role_id, module_id) DO NOTHING;

  -- ── FINANCE ───────────────────────────────────────────────────────────────
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES
    (v_finance_id, m_settings,              false, v_org_id),
    (v_finance_id, m_company_settings,      false, v_org_id),
    (v_finance_id, m_user_management,       false, v_org_id),
    (v_finance_id, m_department_access,     false, v_org_id),
    (v_finance_id, m_time_clock_mgmt,       false, v_org_id),
    (v_finance_id, m_role_permissions,      false, v_org_id),
    (v_finance_id, m_menu_builder,          false, v_org_id),
    (v_finance_id, m_proposal_msgs_admin,   false, v_org_id),
    (v_finance_id, m_offices,               false, v_org_id),
    (v_finance_id, m_priority_management,   false, v_org_id),
    (v_finance_id, m_points_rewards,        false, v_org_id),
    (v_finance_id, m_email_templates,       false, v_org_id),
    (v_finance_id, m_travel_bonus_settings, false, v_org_id),
    (v_finance_id, m_pay_types,             false, v_org_id),
    (v_finance_id, m_integrations,          false, v_org_id),
    (v_finance_id, m_pto_management,        false, v_org_id),
    (v_finance_id, m_test_tune_settings,    false, v_org_id),
    (v_finance_id, m_vehicle_tracking,      false, v_org_id)
  ON CONFLICT (role_id, module_id) DO NOTHING;

  -- ── MANAGER ───────────────────────────────────────────────────────────────
  -- manager already has test_tune_settings = true; ON CONFLICT DO NOTHING preserves it
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES
    (v_manager_id, m_settings,              false, v_org_id),
    (v_manager_id, m_company_settings,      false, v_org_id),
    (v_manager_id, m_user_management,       false, v_org_id),
    (v_manager_id, m_department_access,     false, v_org_id),
    (v_manager_id, m_time_clock_mgmt,       false, v_org_id),
    (v_manager_id, m_role_permissions,      false, v_org_id),
    (v_manager_id, m_menu_builder,          false, v_org_id),
    (v_manager_id, m_proposal_msgs_admin,   false, v_org_id),
    (v_manager_id, m_offices,               false, v_org_id),
    (v_manager_id, m_priority_management,   false, v_org_id),
    (v_manager_id, m_points_rewards,        false, v_org_id),
    (v_manager_id, m_email_templates,       false, v_org_id),
    (v_manager_id, m_travel_bonus_settings, false, v_org_id),
    (v_manager_id, m_pay_types,             false, v_org_id),
    (v_manager_id, m_integrations,          false, v_org_id),
    (v_manager_id, m_pto_management,        false, v_org_id),
    (v_manager_id, m_test_tune_settings,    false, v_org_id),
    (v_manager_id, m_vehicle_tracking,      false, v_org_id)
  ON CONFLICT (role_id, module_id) DO NOTHING;

  -- ── SERVICE MANAGER ───────────────────────────────────────────────────────
  -- service_manager already has time_clock_management = true and test_tune_settings = true
  -- ON CONFLICT DO NOTHING preserves those existing grants
  INSERT INTO role_module_access (role_id, module_id, has_access, organization_id) VALUES
    (v_svc_mgr_id, m_settings,              false, v_org_id),
    (v_svc_mgr_id, m_company_settings,      false, v_org_id),
    (v_svc_mgr_id, m_user_management,       false, v_org_id),
    (v_svc_mgr_id, m_department_access,     false, v_org_id),
    (v_svc_mgr_id, m_time_clock_mgmt,       false, v_org_id),
    (v_svc_mgr_id, m_role_permissions,      false, v_org_id),
    (v_svc_mgr_id, m_menu_builder,          false, v_org_id),
    (v_svc_mgr_id, m_proposal_msgs_admin,   false, v_org_id),
    (v_svc_mgr_id, m_offices,               false, v_org_id),
    (v_svc_mgr_id, m_priority_management,   false, v_org_id),
    (v_svc_mgr_id, m_points_rewards,        false, v_org_id),
    (v_svc_mgr_id, m_email_templates,       false, v_org_id),
    (v_svc_mgr_id, m_travel_bonus_settings, false, v_org_id),
    (v_svc_mgr_id, m_pay_types,             false, v_org_id),
    (v_svc_mgr_id, m_integrations,          false, v_org_id),
    (v_svc_mgr_id, m_pto_management,        false, v_org_id),
    (v_svc_mgr_id, m_test_tune_settings,    false, v_org_id),
    (v_svc_mgr_id, m_vehicle_tracking,      false, v_org_id)
  ON CONFLICT (role_id, module_id) DO NOTHING;

END $$;
