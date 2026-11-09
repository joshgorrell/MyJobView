#!/usr/bin/env bash
# Only an empty disposable PostgreSQL database; never point at application DB.
set -euo pipefail
: "${TECHSAFE_TEST_DATABASE_URL:?Provide EMPTY disposable PostgreSQL database}"
command -v psql >/dev/null
PSQL=(psql "$TECHSAFE_TEST_DATABASE_URL" -X -qAt -v ON_ERROR_STOP=1)
existing="$("${PSQL[@]}" -c "SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','p')")"
[[ "$existing" == "0" ]] || { echo "Refusing nonempty public schema" >&2; exit 2; }
"${PSQL[@]}" <<'SQL'
-- Roles are cluster-wide; the revision test already creates them in another DB.
DO $ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $;
CREATE SCHEMA techsafe_source;
SQL
"${PSQL[@]}" -f supabase/migrations/20261109183000_techsafe_equipment_certificate_storage.sql
"${PSQL[@]}" <<'SQL'
DO $$
DECLARE a uuid:='00000000-0000-0000-0000-000000000001';
        b uuid:='00000000-0000-0000-0000-000000000002';
        c uuid:='00000000-0000-0000-0000-000000000003';
        d uuid:='00000000-0000-0000-0000-000000000004';
BEGIN
 INSERT INTO techsafe_source.equipment_snapshot_certificates
 (connection_id,sales_order_id,organization_id,proposal_id,connection_generation,source_revision,
  source_fingerprint,equipment_fingerprint,canonical_version,equipment_count,state)
 VALUES (a,b,c,d,1,1,repeat('a',64),repeat('b',64),'mjv-techsafe-equipment-evidence-v1',2,'held');
 BEGIN
  INSERT INTO techsafe_source.equipment_snapshot_certificates
  (connection_id,sales_order_id,organization_id,proposal_id,connection_generation,source_revision,
   source_fingerprint,equipment_fingerprint,canonical_version,equipment_count,state)
  VALUES (a,b,c,d,1,1,repeat('a',64),repeat('b',64),'mjv-techsafe-equipment-evidence-v1',2,'held');
  RAISE EXCEPTION 'Duplicate revision was accepted';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
 BEGIN
  INSERT INTO techsafe_source.equipment_snapshot_certificates
  (connection_id,sales_order_id,organization_id,proposal_id,connection_generation,source_revision,
   source_fingerprint,equipment_fingerprint,canonical_version,equipment_count,state)
  VALUES (a,b,c,d,1,2,repeat('0',64),repeat('b',64),'mjv-techsafe-equipment-evidence-v1',2,'held');
  RAISE EXCEPTION 'Invalid zero fingerprint was accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 BEGIN
  INSERT INTO techsafe_source.equipment_snapshot_certificates
  (connection_id,sales_order_id,organization_id,proposal_id,connection_generation,source_revision,
   source_fingerprint,equipment_fingerprint,canonical_version,equipment_count,state)
  VALUES (a,b,c,d,1,2,repeat('a',64),repeat('b',64),'mjv-techsafe-equipment-evidence-v1',2,'certified');
  RAISE EXCEPTION 'Certification without timestamp was accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 IF (SELECT count(*) FROM techsafe_source.equipment_snapshot_certificates)<>1 THEN
  RAISE EXCEPTION 'Unexpected certificate rows';
 END IF;
 IF EXISTS(SELECT 1 FROM information_schema.role_table_grants
  WHERE table_schema='techsafe_source' AND table_name='equipment_snapshot_certificates'
  AND grantee IN ('anon','authenticated','service_role','PUBLIC')) THEN
  RAISE EXCEPTION 'Unexpected API role grants';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace
  WHERE n.nspname='techsafe_source' AND t.relname='equipment_snapshot_certificates'
  AND t.relrowsecurity AND t.relforcerowsecurity) THEN
  RAISE EXCEPTION 'RLS must be enabled and forced';
 END IF;
END $$;
SQL
echo 'PASS: inert private certificate storage, uniqueness, constraints and RLS'
