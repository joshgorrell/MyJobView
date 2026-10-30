-- READ ONLY. Sample up to 50 earliest recorded migration entries.
-- These are review signals, NOT an instruction to decode or repair history.
SELECT version,name,cardinality(statements) AS statement_count,
  length(statements[1]) AS first_statement_characters,
  length(statements[1])-length(replace(statements[1],chr(10),'')) AS actual_newlines,
  (length(statements[1])-length(replace(statements[1],chr(92)||'n','')))/2 AS literal_backslash_n,
  coalesce(left(statements[1],4)='/*'||chr(92)||'n'
    AND position(chr(10) IN statements[1])=0,true) AS formatting_requires_review,
  version !~ '^[0-9]{14}$' AS non_timestamp_version,
  statements IS NULL OR cardinality(statements)=0 AS missing_statements
FROM supabase_migrations.schema_migrations
ORDER BY version
LIMIT 50;
