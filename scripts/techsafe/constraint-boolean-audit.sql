-- READ ONLY: catalog binding and synthetic values only; no application rows.
WITH labels AS (
 SELECT ARRAY['price_too_high','went_with_competitor','project_cancelled','no_response','timing','budget_cut','scope_change','changed_mind','dont_want_rep','dont_want_company','value','equipment','communication','process','other','unknown']::text[] AS allowed
), booleans AS (SELECT v FROM (VALUES(true),(false),(NULL::boolean)) b(v)),
truth AS (
 SELECT count(*)::int AS cases,count(*) FILTER(WHERE ((a.v AND b.v) AND c.v) IS DISTINCT FROM (a.v AND b.v AND c.v))::int AS mismatches
 FROM booleans a CROSS JOIN booleans b CROSS JOIN booleans c
), examples AS (
 SELECT NULL::text[] AS reasons UNION ALL SELECT ARRAY[]::text[]
 UNION ALL SELECT ARRAY[NULL::text] UNION ALL SELECT ARRAY['invalid']
 UNION ALL SELECT ARRAY['price_too_high',NULL] UNION ALL SELECT ARRAY[['price_too_high','other'],['value','equipment']]
 UNION ALL SELECT '[0:1]={price_too_high,other}'::text[]
 UNION ALL SELECT ARRAY[label] FROM labels CROSS JOIN LATERAL unnest(allowed) label
 UNION ALL SELECT array_fill('price_too_high'::text,ARRAY[n]) FROM generate_series(0,18) n
 UNION ALL SELECT allowed FROM labels
 UNION ALL SELECT allowed||ARRAY['invalid'] FROM labels
), evaluated AS (
 SELECT (((cardinality(reasons)>=1) AND (cardinality(reasons)<=16)) AND (reasons <@ allowed)) AS original,
 ((cardinality(reasons)>=1) AND (cardinality(reasons)<=16) AND (reasons <@ allowed)) AS replayed
 FROM examples CROSS JOIN labels
), binding AS (
 SELECT count(*)=1 AND coalesce(bool_and(convalidated AND encode(sha256(convert_to(pg_get_constraintdef(oid),'UTF8')),'hex')='42f9c89cca32d74fbbf1dab7a5a8a8874b748b1cc37aa24dca71ee092aa9a1b6'),false) AS source_binding_matches
 FROM pg_constraint WHERE conrelid=to_regclass('public.proposal_loss_feedback') AND conname='proposal_loss_feedback_reasons_check'
)
SELECT source_binding_matches,truth.cases AS boolean_cases,truth.mismatches AS boolean_mismatches,
 (SELECT count(*)::int FROM evaluated) AS predicate_cases,
 (SELECT count(*)::int FROM evaluated WHERE original IS DISTINCT FROM replayed) AS predicate_mismatches,
 current_setting('server_version') AS server_version,
 false AS exact_definition_equality_claimed,false AS restore_approved,false AS quote_ready
FROM binding CROSS JOIN truth;
