
/*
  # Seed Production Dashboard Work Orders

  Seeds sample work orders and job completions so the Production Dashboard
  displays meaningful data instead of all zeros.

  ## Changes
  1. Inserts 12 work orders in service/site_survey types across various statuses
  2. Inserts 3 job_completions for the completed work orders with quality scores
  3. Scoped to existing organization, uses real tech profiles and contacts
  4. Skips if work orders already exist (idempotent)
*/

DO $$
DECLARE
  org_id uuid := 'b324e4e3-cd2e-4c68-8df8-3e27c7e08f15';
  office_id uuid := 'd3ab3833-c1bc-44fa-a628-0a55e50f3bb2';
  contact_id_1 uuid := 'dff669fe-08a8-4f94-b730-993b9c512ce0';
  contact_id_2 uuid := 'df39e82f-c3bb-407a-98fe-bc7a7a6d74c3';
  labor_phase_id uuid := 'b79a9a3a-3967-4bf2-afba-902679c05812';

  tech1 uuid := '024aeac6-bf64-4c44-9fba-d43996b02ca0';
  tech2 uuid := 'b2ab2165-bc9f-44c8-a238-1d4c8abac50d';
  tech3 uuid := '032dd375-5842-4fe2-8788-8a2b51ea4c6e';
  tech4 uuid := '01ad210b-db62-40e1-81fc-f86dda5b426d';
  tech5 uuid := 'ba84e8bc-fdcd-42d1-b20f-2cf9fa6365e5';

  wo_id_10 uuid;
  wo_id_11 uuid;
  wo_id_12 uuid;
BEGIN

  IF (SELECT count(*) FROM work_orders WHERE organization_id = org_id) > 0 THEN
    RAISE NOTICE 'Work orders already exist, skipping seed';
    RETURN;
  END IF;

  INSERT INTO work_orders (
    id, organization_id, company_id, work_order_number, title, description,
    type, status, priority, assigned_to, contact_id, office_id,
    start_date, target_completion_date, actual_completion_date,
    estimated_hours, is_archived, is_billable, is_group_work_order, labor_phase_id
  ) VALUES
    (gen_random_uuid(), org_id, org_id, 'WO-0001', 'Security Camera Installation',
     'Install 4K cameras at all main entrance points', 'service',
     'in_progress', 'urgent', tech1, contact_id_1, office_id,
     CURRENT_DATE - 1, CURRENT_DATE, NULL, 6.0, false, true, false, labor_phase_id),

    (gen_random_uuid(), org_id, org_id, 'WO-0002', 'Access Control Panel Replacement',
     'Replace outdated access control panels with new system', 'service',
     'in_progress', 'high', tech2, contact_id_2, office_id,
     CURRENT_DATE, CURRENT_DATE + 1, NULL, 4.0, false, true, false, labor_phase_id),

    (gen_random_uuid(), org_id, org_id, 'WO-0003', 'Network Rack Cabling',
     'Run structured cabling and terminate patch panel in server room', 'service',
     'in_progress', 'medium', tech3, contact_id_1, office_id,
     CURRENT_DATE, CURRENT_DATE + 2, NULL, 8.0, false, true, false, labor_phase_id),

    (gen_random_uuid(), org_id, org_id, 'WO-0004', 'Intercom System Repair',
     'Diagnose and repair front intercom unit not responding', 'service',
     'assigned', 'high', tech4, contact_id_2, office_id,
     CURRENT_DATE - 3, CURRENT_DATE - 1, NULL, 2.0, false, true, false, labor_phase_id),

    (gen_random_uuid(), org_id, org_id, 'WO-0005', 'Fire Alarm Panel Inspection',
     'Annual inspection and testing of fire alarm control panel', 'site_survey',
     'assigned', 'medium', tech5, contact_id_1, office_id,
     CURRENT_DATE - 2, CURRENT_DATE - 1, NULL, 3.0, false, true, false, labor_phase_id),

    (gen_random_uuid(), org_id, org_id, 'WO-0006', 'Smart Lock Installation',
     'Install keypad smart locks on all 6 conference rooms', 'service',
     'assigned', 'low', tech1, contact_id_2, office_id,
     CURRENT_DATE + 1, CURRENT_DATE + 3, NULL, 5.0, false, true, false, labor_phase_id),

    (gen_random_uuid(), org_id, org_id, 'WO-0007', 'Camera System Upgrade',
     'Upgrade 8 parking lot cameras to license plate recognition', 'service',
     'pending', 'medium', tech2, contact_id_1, office_id,
     CURRENT_DATE + 2, CURRENT_DATE + 5, NULL, 10.0, false, true, false, labor_phase_id),

    (gen_random_uuid(), org_id, org_id, 'WO-0008', 'Wiring Documentation',
     'Document all existing wiring runs in east wing', 'site_survey',
     'pending', 'low', tech3, contact_id_2, office_id,
     CURRENT_DATE + 3, CURRENT_DATE + 7, NULL, 4.0, false, true, false, labor_phase_id),

    (gen_random_uuid(), org_id, org_id, 'WO-0009', 'Emergency Exit Sensors',
     'Install door sensors on all emergency exits with alarm integration', 'service',
     'pending', 'high', tech4, contact_id_1, office_id,
     CURRENT_DATE + 1, CURRENT_DATE + 4, NULL, 6.0, false, true, false, labor_phase_id),

    (gen_random_uuid(), org_id, org_id, 'WO-0010', 'DVR System Replacement',
     'Replaced analog DVR with IP-based NVR and migrated footage', 'service',
     'completed', 'medium', tech2, contact_id_2, office_id,
     CURRENT_DATE - 1, CURRENT_DATE, CURRENT_DATE, 5.0, false, true, false, labor_phase_id),

    (gen_random_uuid(), org_id, org_id, 'WO-0011', 'Motion Sensor Calibration',
     'Recalibrate all 12 motion sensors in warehouse area', 'service',
     'completed', 'low', tech3, contact_id_1, office_id,
     CURRENT_DATE - 3, CURRENT_DATE - 2, CURRENT_DATE - 2, 3.0, false, true, false, labor_phase_id),

    (gen_random_uuid(), org_id, org_id, 'WO-0012', 'System Commissioning & Walkthrough',
     'Full system test, commissioning, and client walkthrough', 'service',
     'completed', 'high', tech1, contact_id_2, office_id,
     CURRENT_DATE - 5, CURRENT_DATE - 3, CURRENT_DATE - 3, 4.0, false, true, false, labor_phase_id);

  SELECT id INTO wo_id_10 FROM work_orders WHERE work_order_number = 'WO-0010' AND organization_id = org_id LIMIT 1;
  SELECT id INTO wo_id_11 FROM work_orders WHERE work_order_number = 'WO-0011' AND organization_id = org_id LIMIT 1;
  SELECT id INTO wo_id_12 FROM work_orders WHERE work_order_number = 'WO-0012' AND organization_id = org_id LIMIT 1;

  IF wo_id_10 IS NOT NULL THEN
    INSERT INTO job_completions (
      id, organization_id, work_order_id, technician_id,
      quality_score, flagged_for_review, completed_at
    ) VALUES
      (gen_random_uuid(), org_id, wo_id_10, tech2, 4, false, NOW()),
      (gen_random_uuid(), org_id, wo_id_11, tech3, 5, false, NOW() - INTERVAL '2 days'),
      (gen_random_uuid(), org_id, wo_id_12, tech1, 5, false, NOW() - INTERVAL '3 days');
  END IF;

END $$;
