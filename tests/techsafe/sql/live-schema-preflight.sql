-- READ ONLY. Execute against the intended MJV database before any Techsafe migration.
-- Returns one row of catalog evidence. No business records are selected.
WITH applier AS (
 SELECT p.oid,p.prosecdef,p.prorettype,p.proretset,p.prosrc,
        pg_get_functiondef(p.oid) AS definition
 FROM pg_proc p WHERE p.oid=to_regprocedure('public.apply_change_order(uuid)')
), migrations AS (
 SELECT count(*)::integer AS count
 FROM supabase_migrations.schema_migrations
 WHERE version LIKE '20261030%' OR version LIKE '20261031%' OR version LIKE '20261101%'
)
SELECT current_database() AS database_name,
       (SELECT count(*) FROM applier)=1 AS applier_exists,
       (SELECT prosecdef FROM applier) AS applier_security_definer,
       (SELECT prorettype='void'::regtype AND NOT proretset FROM applier) AS applier_returns_void,
       (SELECT md5(definition) FROM applier) AS applier_definition_md5,
       (SELECT position('TECHSAFE_OBSERVER_BEGIN_START' in prosrc)>0 FROM applier) AS observer_attached,
       to_regclass('techsafe_source.application_observations') IS NOT NULL AS observations_exist,
       to_regclass('techsafe_source.application_observer_controls') IS NOT NULL AS observer_controls_exist,
       to_regclass('techsafe_source.integration_connections') IS NOT NULL AS connections_exist,
       (SELECT count FROM migrations) AS recent_migration_count,
       (SELECT count(*) FROM pg_trigger WHERE tgrelid=to_regclass('public.change_orders')
          AND NOT tgisinternal AND tgname LIKE 'invalidate_techsafe_%') AS legacy_techsafe_trigger_count;
