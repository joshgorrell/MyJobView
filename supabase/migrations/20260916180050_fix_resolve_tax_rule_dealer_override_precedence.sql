/*
# Fix resolve_tax_rule: Dealer override always takes precedence over master rule

## Problem
The current `resolve_tax_rule` function only searches `state_tax_rules_matrix`
(dealer overrides) when no master rule is found (`IF v_rule_id IS NULL`). This
means dealer-specific overrides are silently ignored whenever a master rule
exists -- defeating the purpose of having dealer-specific overrides.

## Fix
Rewrite the function to resolve master and dealer rules independently, then
apply dealer-override precedence:

1. Resolve the best matching master rule from `master_state_tax_rules`
   (specificity scoring unchanged).
2. Independently resolve the best matching dealer-specific rule from
   `state_tax_rules_matrix` for the given `p_organization_id`
   (specificity scoring unchanged).
3. If a dealer-specific rule exists, it overrides the master result
   (source = 'dealer_override').
4. Otherwise use the master result (source = 'master').
5. If neither exists, return 'needs_review'.

## What does NOT change
- The specificity/matching logic within each rule set is unchanged.
- The qualifier filters (environment, project_type, separately_stated) are
  the same.
- The tie-breaking logic (higher score wins, then higher rule_version) is
  the same within each rule set.
- No schema changes -- this is a function-only migration.

## Security
- No RLS changes.
- No new tables or columns.
- Function remains STABLE SECURITY DEFINER with search_path = 'public'.
*/

CREATE OR REPLACE FUNCTION public.resolve_tax_rule(
  p_state text,
  p_organization_id uuid,
  p_environment text DEFAULT NULL,
  p_project_type text DEFAULT NULL,
  p_classification_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_candidate_score int;
  v_row record;

  -- Master result (resolved independently)
  v_master_rule_id uuid;
  v_master_taxability_status text;
  v_master_explanation text;
  v_master_rule_version int;
  v_master_score int := -1;

  -- Dealer result (resolved independently)
  v_dealer_rule_id uuid;
  v_dealer_taxability_status text;
  v_dealer_explanation text;
  v_dealer_rule_version int;
  v_dealer_score int := -1;
BEGIN
  -- ── 1. Resolve best matching master rule ────────────────────────────
  FOR v_row IN
    SELECT m.id, m.taxability_status, m.explanation, m.rule_version,
           m.qualifier_environment, m.qualifier_project_type, m.qualifier_separately_stated
    FROM master_state_tax_rules m
    JOIN master_classifications mc ON mc.id = m.classification_id
    WHERE m.state = p_state
      AND mc.code = p_classification_code
      AND m.is_active = true
      AND m.effective_from <= CURRENT_DATE
      AND (m.effective_through IS NULL OR m.effective_through >= CURRENT_DATE)
      AND (m.qualifier_environment IS NULL OR m.qualifier_environment = p_environment)
      AND (m.qualifier_project_type IS NULL OR m.qualifier_project_type = p_project_type)
  LOOP
    v_candidate_score := 0;
    IF v_row.qualifier_environment IS NOT NULL THEN
      v_candidate_score := v_candidate_score + 1;
    END IF;
    IF v_row.qualifier_project_type IS NOT NULL THEN
      v_candidate_score := v_candidate_score + 1;
    END IF;
    IF v_row.qualifier_separately_stated IS NOT NULL THEN
      v_candidate_score := v_candidate_score + 1;
    END IF;

    IF v_candidate_score > v_master_score
       OR (v_candidate_score = v_master_score AND v_row.rule_version > COALESCE(v_master_rule_version, 0))
    THEN
      v_master_score := v_candidate_score;
      v_master_rule_id := v_row.id;
      v_master_taxability_status := v_row.taxability_status;
      v_master_explanation := v_row.explanation;
      v_master_rule_version := v_row.rule_version;
    END IF;
  END LOOP;

  -- ── 2. Independently resolve best matching dealer-specific rule ──────
  FOR v_row IN
    SELECT s.id, s.taxability_status, s.explanation, s.rule_version,
           s.environment AS qual_env, s.project_type AS qual_pt
    FROM state_tax_rules_matrix s
    JOIN tax_classifications tc ON tc.id = s.tax_classification_id
    WHERE s.organization_id = p_organization_id
      AND s.state = p_state
      AND tc.code = p_classification_code
      AND s.is_active = true
      AND s.effective_from <= CURRENT_DATE
      AND (s.effective_through IS NULL OR s.effective_through >= CURRENT_DATE)
      AND (s.environment IS NULL OR s.environment = p_environment OR s.environment = 'both')
      AND (s.project_type IS NULL OR s.project_type = p_project_type)
  LOOP
    v_candidate_score := 0;
    IF v_row.qual_env IS NOT NULL AND v_row.qual_env <> 'both' THEN
      v_candidate_score := v_candidate_score + 1;
    END IF;
    IF v_row.qual_pt IS NOT NULL THEN
      v_candidate_score := v_candidate_score + 1;
    END IF;

    IF v_candidate_score > v_dealer_score
       OR (v_candidate_score = v_dealer_score AND v_row.rule_version > COALESCE(v_dealer_rule_version, 0))
    THEN
      v_dealer_score := v_candidate_score;
      v_dealer_rule_id := v_row.id;
      v_dealer_taxability_status := v_row.taxability_status;
      v_dealer_explanation := v_row.explanation;
      v_dealer_rule_version := v_row.rule_version;
    END IF;
  END LOOP;

  -- ── 3. Dealer override takes precedence when it exists ──────────────
  IF v_dealer_rule_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'taxability_status', v_dealer_taxability_status,
      'explanation', v_dealer_explanation,
      'rule_id', v_dealer_rule_id,
      'rule_version', v_dealer_rule_version,
      'source', 'dealer_override'
    );
  ELSIF v_master_rule_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'taxability_status', v_master_taxability_status,
      'explanation', v_master_explanation,
      'rule_id', v_master_rule_id,
      'rule_version', v_master_rule_version,
      'source', 'master'
    );
  ELSE
    -- ── 4. Neither exists: return needs_review ─────────────────────────
    RETURN jsonb_build_object(
      'taxability_status', 'needs_review',
      'explanation', 'No tax rule found for state ' || COALESCE(p_state, '(null)') ||
        ', classification ' || COALESCE(p_classification_code, '(null)') ||
        ', environment ' || COALESCE(p_environment, '(any)') ||
        ', project type ' || COALESCE(p_project_type, '(any)') ||
        '. Manual review required.',
      'rule_id', NULL::uuid,
      'rule_version', NULL::integer,
      'source', NULL::text
    );
  END IF;
END;
$function$;